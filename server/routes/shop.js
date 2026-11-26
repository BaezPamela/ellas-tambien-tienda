'use strict';
// API pública de la tienda: configuración, carrito, envíos, pedidos, pagos y contacto.
const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const rateLimit = require('express-rate-limit');
const cfg = require('../config');
const { query, one } = require('../db');
const { wrap, httpError, toInt, digits } = require('../lib/util');
const { getSettings } = require('../lib/settings');
const orders = require('../lib/orders');
const payments = require('../lib/payments');

const features = cfg.features;
const router = express.Router();

const receiptUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1 } });
function receiptMiddleware(req, res, next) {
  receiptUpload.single('receipt')(req, res, function (err) {
    if (!err) return next();
    next(httpError(400, err.code === 'LIMIT_FILE_SIZE' ? 'El archivo pesa más de 5 MB. Sacale una captura o achicalo.' : 'No pudimos leer el archivo. Probá de nuevo.'));
  });
}

function limiter(minutes, limit) {
  return rateLimit({
    windowMs: minutes * 60 * 1000,
    limit: limit,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Hiciste muchos intentos seguidos. Probá de nuevo en unos minutos.' }
  });
}

// Datos del local que puede ver cualquiera. Los datos bancarios solo existen si hay pedidos online.
function publicStore(s) {
  const out = Object.assign({}, s);
  if (!features.orders) {
    delete out.bank_holder; delete out.bank_name; delete out.bank_cbu; delete out.bank_alias;
  }
  return out;
}

// Qué incluye el paquete + datos del local. El navegador lo usa para mostrar u ocultar funciones.
router.get('/config', wrap(async function (req, res) {
  res.set('Cache-Control', 'no-store');
  res.json({
    package: cfg.PACKAGE,
    features: features,
    mpEnabled: payments.enabled(),
    store: publicStore(await getSettings())
  });
}));

// Revisa el carrito contra la base: precios actuales y disponibilidad.
router.post('/cart/validate', wrap(async function (req, res) {
  const raw = Array.isArray(req.body && req.body.items) ? req.body.items : [];
  const ids = raw.map(function (i) { return toInt(i && i.variantId); }).filter(Boolean).slice(0, 50);
  if (!ids.length) return res.json({ items: [] });
  const rows = await query(
    'SELECT v.id AS variantId, v.stock, v.size, c.name AS color, p.id AS productId, p.name, p.slug, p.price, p.active, ' +
    '(SELECT pi.thumb_path FROM product_images pi WHERE pi.product_id = p.id ' +
    ' ORDER BY (pi.color_id = v.color_id) DESC, pi.sort_order, pi.id LIMIT 1) AS image ' +
    'FROM product_variants v ' +
    'JOIN product_colors c ON c.id = v.color_id ' +
    'JOIN products p ON p.id = v.product_id ' +
    'WHERE v.id IN (?)',
    [ids]
  );
  res.json({
    items: rows.map(function (r) {
      const available = Boolean(r.active) && (!features.stock || r.stock > 0);
      return {
        variantId: r.variantId, productId: r.productId, name: r.name, slug: r.slug, color: r.color, size: r.size,
        price: r.price, image: r.image, available: available, maxQty: features.stock ? Math.max(0, r.stock) : 20
      };
    })
  });
}));

// Contacto y botón de arrepentimiento
router.post('/contact', limiter(60, 10), wrap(async function (req, res) {
  const b = req.body || {};
  if (b.website) return res.json({ ok: true }); // campo trampa para robots
  const type = b.type === 'arrepentimiento' ? 'arrepentimiento' : 'consulta';
  const name = String(b.name || '').trim().slice(0, 100);
  const email = String(b.email || '').trim().slice(0, 120);
  const phone = digits(b.phone).slice(0, 20);
  const orderCode = String(b.order_code || '').trim().toUpperCase().slice(0, 12);
  const message = String(b.message || '').trim().slice(0, 2000);
  if (name.length < 2) throw httpError(400, 'Escribí tu nombre');
  if (!email && phone.length < 8) throw httpError(400, 'Dejá un correo o un teléfono para poder responderte');
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw httpError(400, 'El correo no es válido');
  if (type === 'arrepentimiento' && !orderCode) throw httpError(400, 'Escribí el código de tu pedido');
  if (type === 'consulta' && message.length < 5) throw httpError(400, 'Escribí tu consulta');
  await query(
    'INSERT INTO contact_messages (type, name, email, phone, order_code, message) VALUES (?, ?, ?, ?, ?, ?)',
    [type, name, email || null, phone || null, orderCode || null, message || null]
  );
  res.status(201).json({ ok: true });
}));

// Paquete 3: envíos
if (features.shipping) {
  router.get('/shipping/rates', wrap(async function (req, res) {
    const rows = await query('SELECT province, cost, days_min, days_max FROM shipping_rates WHERE active = 1 ORDER BY province');
    res.json({ rates: rows });
  }));

  router.get('/shipping/quote', wrap(async function (req, res) {
    const settings = await getSettings();
    const method = req.query.method === 'retiro' ? 'retiro' : 'envio';
    res.json(await orders.quoteShipping(method, String(req.query.province || ''), toInt(req.query.subtotal), settings));
  }));
}

// Paquetes 2 y 3: pedidos
if (features.orders) {
  router.post('/orders', limiter(10, 15), wrap(async function (req, res) {
    const settings = await getSettings();
    const result = await orders.createOrder(req.body || {}, settings);
    let redirect = null;
    if (result.order.payment_method === 'mercadopago') {
      try {
        redirect = await payments.createPreference(result.order, result.items, settings);
      } catch (err) {
        console.error('Mercado Pago:', err.message);
        await orders.cancelOrder(result.order.id, {});
        throw httpError(502, 'No pudimos conectar con Mercado Pago. Probá de nuevo o elegí otra forma de pago.');
      }
    }
    res.status(201).json({ code: result.order.code, redirect: redirect });
  }));

  router.get('/orders/:code', limiter(10, 60), wrap(async function (req, res) {
    const order = await orders.publicOrder(req.params.code);
    if (!order) throw httpError(404, 'No encontramos ese pedido');
    res.set('Cache-Control', 'no-store');
    res.json({ order: order });
  }));

  // El cliente sube el comprobante de su transferencia (foto o PDF). El dueño lo revisa en el panel.
  router.post('/orders/:code/receipt', limiter(10, 15), receiptMiddleware, wrap(async function (req, res) {
    const code = String(req.params.code || '').toUpperCase();
    const order = await one('SELECT id, status, payment_method, receipt_path FROM orders WHERE code = ?', [code]);
    if (!order || order.payment_method !== 'transferencia' || order.status !== 'pendiente') {
      throw httpError(400, 'Este pedido no necesita comprobante');
    }
    if (!req.file || !req.file.buffer || !req.file.buffer.length) throw httpError(400, 'Elegí el comprobante (foto o PDF)');
    const buf = req.file.buffer;
    let name;
    let out;
    if (buf.slice(0, 5).toString('latin1') === '%PDF-') {
      name = code + '-' + crypto.randomBytes(8).toString('hex') + '.pdf';
      out = buf;
    } else {
      try {
        out = await require('sharp')(buf).rotate().resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true }).webp({ quality: 80 }).toBuffer();
      } catch (e) {
        throw httpError(400, 'El archivo tiene que ser una foto (JPG, PNG o WebP) o un PDF');
      }
      name = code + '-' + crypto.randomBytes(8).toString('hex') + '.webp';
    }
    fs.mkdirSync(cfg.receiptsDir, { recursive: true });
    fs.writeFileSync(path.join(cfg.receiptsDir, name), out);
    // Mientras el local revisa el comprobante, el pedido no se vence solo.
    await query(
      'UPDATE orders SET receipt_path = ?, receipt_at = NOW(), reserved_until = DATE_ADD(NOW(), INTERVAL ? HOUR) WHERE id = ?',
      [name, cfg.reserveHours, order.id]
    );
    if (order.receipt_path) fs.unlink(path.join(cfg.receiptsDir, path.basename(order.receipt_path)), function () { /* ya no existe: no pasa nada */ });
    res.json({ ok: true });
  }));

  // Vuelve a generar el link de pago si el cliente no llegó a pagar.
  router.post('/orders/:code/pay', limiter(10, 15), wrap(async function (req, res) {
    const code = String(req.params.code || '').toUpperCase();
    const order = await one(
      'SELECT id, code, status, shipping_cost, payment_method FROM orders WHERE code = ?', [code]
    );
    if (!order || order.payment_method !== 'mercadopago' || order.status !== 'pendiente') {
      throw httpError(400, 'Este pedido no admite pago online');
    }
    const items = await query(
      'SELECT variant_id, product_name, color_name, size, unit_price, quantity FROM order_items WHERE order_id = ?',
      [order.id]
    );
    const settings = await getSettings();
    res.json({ redirect: await payments.createPreference(order, items, settings) });
  }));

  // Aviso de Mercado Pago. Se consulta el pago directo a su API, así un aviso falso no sirve de nada.
  if (features.onlinePayments) {
    router.post('/payments/webhook', wrap(async function (req, res) {
      const body = req.body || {};
      const type = body.type || req.query.type || req.query.topic;
      const id = (body.data && body.data.id) || req.query['data.id'] || req.query.id;
      if (type !== 'payment' || !id || !payments.enabled()) return res.sendStatus(200);
      const payment = await payments.getPayment(String(id));
      await orders.applyPayment(payment);
      res.sendStatus(200);
    }));
  }
}

module.exports = router;
