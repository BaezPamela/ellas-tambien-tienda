// Lógica de pedidos: crear (descontando stock), cancelar (devolviendo stock),
// calcular envío y registrar pagos. Corre en los paquetes 2 y 3.
const cfg = require('../config');
const { query, one, tx } = require('../db');
const { httpError, genCode, digits, toInt, str } = require('./util');
const payments = require('./payments');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeItems(raw) {
  if (!Array.isArray(raw) || raw.length === 0) throw httpError(400, 'El pedido está vacío');
  const map = new Map();
  for (const it of raw.slice(0, 40)) {
    const id = toInt(it && it.variantId);
    const qty = toInt(it && it.qty);
    if (!id || qty < 1) continue;
    map.set(id, Math.min(20, (map.get(id) || 0) + qty));
  }
  if (map.size === 0) throw httpError(400, 'El pedido está vacío');
  return Array.from(map.entries()).map(([variantId, qty]) => ({ variantId, qty }));
}

// Costo de envío. Paquete 2: se coordina con el local. Paquete 3: tarifa por provincia.
async function quoteShipping(method, province, subtotal, settings) {
  if (method !== 'envio') return { cost: 0, label: 'Retiro por el local', coordinate: false, days: null };
  if (!cfg.features.shipping) {
    return { cost: 0, label: 'Envío a coordinar con el local', coordinate: true, days: null };
  }
  const rate = await one(
    'SELECT cost, days_min, days_max FROM shipping_rates WHERE province = ? AND active = 1',
    [province]
  );
  if (!rate) throw httpError(400, 'Por ahora no hacemos envíos a esa provincia');
  const freeFrom = toInt(settings.free_shipping_from, 0);
  const free = freeFrom > 0 && subtotal >= freeFrom;
  return {
    cost: free ? 0 : rate.cost,
    label: free ? 'Envío gratis' : 'Envío a ' + province,
    coordinate: false,
    days: [rate.days_min, rate.days_max]
  };
}

async function createOrder(input, settings) {
  const items = normalizeItems(input.items);
  const c = input.customer || {};
  const d = input.delivery || {};

  const name = str(c.name, 100);
  const phone = digits(c.phone).slice(0, 30);
  const email = str(c.email, 120).toLowerCase();
  if (name.length < 2) throw httpError(400, 'Escribí tu nombre');
  if (phone.length < 8) throw httpError(400, 'Escribí un teléfono válido');
  if (email && !EMAIL_RE.test(email)) throw httpError(400, 'El correo no es válido');

  const method = d.method === 'envio' ? 'envio' : 'retiro';
  const address = str(d.address, 200);
  const city = str(d.city, 80);
  const province = str(d.province, 60);
  const postal = str(d.postal_code, 12);
  if (method === 'envio') {
    if (address.length < 4) throw httpError(400, 'Escribí la dirección de entrega');
    if (!city) throw httpError(400, 'Escribí la localidad');
    if (cfg.features.shipping && !province) throw httpError(400, 'Elegí la provincia');
  }

  const pm = input.payment_method;
  if (!['transferencia', 'mercadopago', 'efectivo'].includes(pm)) throw httpError(400, 'Elegí la forma de pago');
  if (pm === 'mercadopago' && !payments.enabled()) throw httpError(400, 'El pago con Mercado Pago no está disponible');
  if (pm === 'efectivo' && method !== 'retiro') throw httpError(400, 'El pago en efectivo es solo con retiro en el local');

  // Datos reales de cada prenda (los precios salen siempre de la base, nunca del navegador).
  const rows = await query(
    `SELECT v.id, v.size, c.name AS color, p.name, p.price, p.active
       FROM product_variants v
       JOIN product_colors c ON c.id = v.color_id
       JOIN products p ON p.id = v.product_id
      WHERE v.id IN (?)`,
    [items.map((i) => i.variantId)]
  );
  const byId = new Map(rows.map((r) => [r.id, r]));
  const lines = items.map((it) => {
    const r = byId.get(it.variantId);
    if (!r || !r.active) throw httpError(409, 'Una de las prendas ya no está disponible. Revisá tu carrito.');
    return { variantId: r.id, name: r.name, color: r.color, size: r.size, price: r.price, qty: it.qty };
  });

  const subtotal = lines.reduce((a, l) => a + l.price * l.qty, 0);
  const ship = await quoteShipping(method, province, subtotal, settings);
  const total = subtotal + ship.cost;
  const accepts = cfg.features.customers && input.accepts_marketing ? 1 : 0;
  const notes = str(input.notes, 500) || null;

  let result = null;
  for (let attempt = 0; attempt < 4 && !result; attempt++) {
    const code = genCode();
    try {
      result = await tx(async (conn) => {
        // Descuenta el stock de forma atómica: si no alcanza, no se descuenta nada.
        for (const l of lines) {
          const [r] = await conn.query(
            'UPDATE product_variants SET stock = stock - ? WHERE id = ? AND stock >= ?',
            [l.qty, l.variantId, l.qty]
          );
          if (r.affectedRows === 0) {
            throw httpError(409, 'No hay stock suficiente de ' + l.name + ' (' + l.color + ', talle ' + l.size + ').');
          }
        }

        let customerId = null;
        if (cfg.features.customers) {
          const [cu] = await conn.query(
            `INSERT INTO customers (name, phone, email, accepts_marketing, last_order_at)
             VALUES (?, ?, ?, ?, NOW())
             ON DUPLICATE KEY UPDATE name = VALUES(name),
               email = COALESCE(VALUES(email), email),
               accepts_marketing = VALUES(accepts_marketing),
               last_order_at = NOW(),
               id = LAST_INSERT_ID(id)`,
            [name, phone, email || null, accepts]
          );
          customerId = cu.insertId;
        }

        const [o] = await conn.query(
          `INSERT INTO orders (code, customer_id, customer_name, phone, email, delivery_method, address, city,
                               province, postal_code, subtotal, shipping_cost, total, payment_method,
                               status, notes, reserved_until)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?, 'pendiente', ?, DATE_ADD(NOW(), INTERVAL ? HOUR))`,
          [code, customerId, name, phone, email || null, method, address || null, city || null,
           province || null, postal || null, subtotal, ship.cost, total, pm, notes, cfg.reserveHours]
        );

        for (const l of lines) {
          await conn.query(
            `INSERT INTO order_items (order_id, variant_id, product_name, color_name, size, unit_price, quantity)
             VALUES (?,?,?,?,?,?,?)`,
            [o.insertId, l.variantId, l.name, l.color, l.size, l.price, l.qty]
          );
          await conn.query(
            "INSERT INTO stock_movements (variant_id, delta, reason, ref_id) VALUES (?, ?, 'venta_online', ?)",
            [l.variantId, -l.qty, o.insertId]
          );
        }
        return { orderId: o.insertId };
      });
    } catch (e) {
      if (e.code === 'ER_DUP_ENTRY' && /uq_orders_code/.test(e.message || '')) continue; // código repetido: reintenta
      throw e;
    }
  }
  if (!result) throw httpError(500, 'No se pudo registrar el pedido. Probá de nuevo.');

  const order = await one('SELECT * FROM orders WHERE id = ?', [result.orderId]);
  const orderItems = await query('SELECT * FROM order_items WHERE order_id = ?', [order.id]);
  return { order, items: orderItems };
}

// Cancela un pedido y devuelve el stock. Con onlyPending solo cancela si sigue pendiente
// (lo usa la cancelación automática, para no pisar un pago que justo llegó).
async function cancelOrder(orderId, opts) {
  const o = opts || {};
  return tx(async (conn) => {
    const [rows] = await conn.query('SELECT id, status FROM orders WHERE id = ? FOR UPDATE', [orderId]);
    const order = rows[0];
    if (!order) throw httpError(404, 'Pedido no encontrado');
    if (order.status === 'cancelado') return false;
    if (o.onlyPending && order.status !== 'pendiente') return false;
    const [items] = await conn.query(
      'SELECT variant_id, quantity FROM order_items WHERE order_id = ? AND variant_id IS NOT NULL',
      [orderId]
    );
    for (const it of items) {
      await conn.query('UPDATE product_variants SET stock = stock + ? WHERE id = ?', [it.quantity, it.variant_id]);
      await conn.query(
        "INSERT INTO stock_movements (variant_id, delta, reason, ref_id, user_id) VALUES (?, ?, 'cancelacion_pedido', ?, ?)",
        [it.variant_id, it.quantity, orderId, o.userId || null]
      );
    }
    await conn.query("UPDATE orders SET status = 'cancelado', reserved_until = NULL WHERE id = ?", [orderId]);
    return true;
  });
}

// Cancela los pedidos sin pagar cuya reserva de stock venció.
async function expireOrders() {
  const rows = await query(
    "SELECT id FROM orders WHERE status = 'pendiente' AND reserved_until IS NOT NULL AND reserved_until < NOW()"
  );
  let n = 0;
  for (const r of rows) {
    if (await cancelOrder(r.id, { onlyPending: true })) n++;
  }
  return n;
}

// Aplica un pago de Mercado Pago al pedido correspondiente.
async function applyPayment(payment) {
  const code = payment && payment.external_reference;
  if (!code) return;
  const order = await one('SELECT id, status, total FROM orders WHERE code = ?', [code]);
  if (!order) return;
  const pid = String(payment.id);
  if (payment.status === 'approved') {
    // Si pagaron menos que el total, no se marca como pagado: lo revisa una persona.
    if (Number(payment.transaction_amount) + 0.01 < Number(order.total)) {
      await query(
        "UPDATE orders SET mp_payment_id = ?, notes = CONCAT(COALESCE(notes, ''), ?) WHERE id = ?",
        [pid, '\n[Sistema] El pago aprobado de Mercado Pago (' + payment.transaction_amount + ') es menor al total del pedido (' + order.total + '). Revisar a mano.', order.id]
      );
      return;
    }
    if (order.status === 'pendiente') {
      // La condición status = 'pendiente' evita pisar un pedido que se canceló justo en ese momento.
      const r = await query(
        "UPDATE orders SET status = 'pagado', mp_payment_id = ?, reserved_until = NULL WHERE id = ? AND status = 'pendiente'",
        [pid, order.id]
      );
      if (r.affectedRows > 0) return;
      const now = await one('SELECT status FROM orders WHERE id = ?', [order.id]);
      if (now) order.status = now.status;
    }
    if (order.status === 'cancelado') {
      await query(
        "UPDATE orders SET mp_payment_id = ?, notes = CONCAT(COALESCE(notes, ''), ?) WHERE id = ?",
        [pid, '\n[Sistema] Llegó un pago aprobado de Mercado Pago con el pedido ya cancelado. Revisar a mano: ajustar el stock y registrar el pedido de nuevo.', order.id]
      );
      return;
    }
  }
  await query('UPDATE orders SET mp_payment_id = ? WHERE id = ?', [pid, order.id]);
}

// Datos del pedido que puede ver el cliente con su código (sin teléfono ni dirección).
async function publicOrder(code) {
  const o = await one(
    `SELECT id, code, status, delivery_method, subtotal, shipping_cost, total, payment_method, created_at, receipt_at
       FROM orders WHERE code = ?`,
    [String(code || '').toUpperCase()]
  );
  if (!o) return null;
  const items = await query(
    'SELECT product_name, color_name, size, unit_price, quantity FROM order_items WHERE order_id = ?',
    [o.id]
  );
  delete o.id; // el id interno no se muestra al cliente
  return Object.assign({}, o, { items });
}

module.exports = { createOrder, cancelOrder, expireOrders, applyPayment, quoteShipping, publicOrder };
