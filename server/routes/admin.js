'use strict';
// API del panel de administración. Todo requiere sesión iniciada.
const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const cfg = require('../config');
const { query, one, tx } = require('../db');
const { wrap, httpError, toInt, slugify, waLink, arWhatsapp, clamp } = require('../lib/util');
const { requireAuth, requireRole, requireFeature } = require('../lib/auth');
const settingsLib = require('../lib/settings');
const orders = require('../lib/orders');

const features = cfg.features;
const router = express.Router();
router.use(requireAuth);

function str(v, max) {
  return String(v == null ? '' : v).trim().slice(0, max || 255);
}

async function slugFree(runner, table, slug) {
  const res = await runner.query('SELECT id FROM ' + table + ' WHERE slug = ?', [slug]);
  return res[0].length === 0;
}

async function uniqueSlug(runner, table, name) {
  const base = slugify(name);
  let slug = base;
  let n = 2;
  while (!(await slugFree(runner, table, slug))) slug = base + '-' + (n++);
  return slug;
}

// ---------------------------------------------------------------- Resumen
router.get('/summary', wrap(async function (req, res) {
  const out = { package: cfg.PACKAGE, features: features };
  out.products = Number((await one('SELECT COUNT(*) AS n FROM products WHERE active = 1')).n);
  out.messages = Number((await one('SELECT COUNT(*) AS n FROM contact_messages WHERE handled = 0')).n);
  if (features.orders) {
    out.pendingOrders = Number((await one("SELECT COUNT(*) AS n FROM orders WHERE status = 'pendiente'")).n);
    out.toShip = Number((await one("SELECT COUNT(*) AS n FROM orders WHERE status = 'pagado' AND delivery_method = 'envio'")).n);
  }
  if (features.stock) {
    out.lowStock = Number((await one(
      'SELECT COUNT(*) AS n FROM product_variants v JOIN products p ON p.id = v.product_id WHERE p.active = 1 AND v.stock BETWEEN 1 AND 2'
    )).n);
    out.soldOut = Number((await one(
      'SELECT COUNT(*) AS n FROM product_variants v JOIN products p ON p.id = v.product_id WHERE p.active = 1 AND v.stock = 0'
    )).n);
  }
  if (features.localSales) {
    out.salesToday = Number((await one(
      'SELECT COALESCE(SUM(total), 0) AS n FROM local_sales WHERE voided = 0 AND DATE(created_at) = CURDATE()'
    )).n);
  }
  res.json(out);
}));

// ---------------------------------------------------------------- Categorías
router.get('/categories', wrap(async function (req, res) {
  res.json({ categories: await query('SELECT id, name, slug, sort_order FROM categories ORDER BY sort_order, name') });
}));

router.post('/categories', requireRole('owner'), wrap(async function (req, res) {
  const name = str(req.body.name, 80);
  if (name.length < 2) throw httpError(400, 'Escribí el nombre de la categoría');
  const slug = await uniqueSlug(require('../db').pool, 'categories', name);
  const r = await query('INSERT INTO categories (name, slug, sort_order) VALUES (?, ?, ?)', [name, slug, toInt(req.body.sort_order, 99)]);
  res.status(201).json({ id: r.insertId });
}));

router.put('/categories/:id', requireRole('owner'), wrap(async function (req, res) {
  const name = str(req.body.name, 80);
  if (name.length < 2) throw httpError(400, 'Escribí el nombre de la categoría');
  await query('UPDATE categories SET name = ?, sort_order = ? WHERE id = ?', [name, toInt(req.body.sort_order, 99), toInt(req.params.id)]);
  res.json({ ok: true });
}));

// ---------------------------------------------------------------- Productos
router.get('/products', wrap(async function (req, res) {
  const rows = await query(
    'SELECT p.id, p.name, p.slug, p.price, p.active, p.featured, c.name AS category, ' +
    '(SELECT pi.thumb_path FROM product_images pi WHERE pi.product_id = p.id ORDER BY pi.sort_order, pi.id LIMIT 1) AS thumb, ' +
    '(SELECT COALESCE(SUM(v.stock), 0) FROM product_variants v WHERE v.product_id = p.id) AS stock ' +
    'FROM products p JOIN categories c ON c.id = p.category_id ' +
    'ORDER BY p.active DESC, p.updated_at DESC'
  );
  res.json({ products: rows.map(function (r) { r.stock = Number(r.stock); return r; }) });
}));

router.get('/products/:id', wrap(async function (req, res) {
  const id = toInt(req.params.id);
  const product = await one('SELECT * FROM products WHERE id = ?', [id]);
  if (!product) throw httpError(404, 'Prenda no encontrada');
  const colors = await query('SELECT id, name, hex FROM product_colors WHERE product_id = ? ORDER BY id', [id]);
  const variants = await query('SELECT id, color_id, size, stock FROM product_variants WHERE product_id = ? ORDER BY id', [id]);
  const images = await query('SELECT id, color_id, path, thumb_path, alt FROM product_images WHERE product_id = ? ORDER BY sort_order, id', [id]);
  colors.forEach(function (c) {
    c.sizes = variants.filter(function (v) { return v.color_id === c.id; }).map(function (v) { return v.size; });
  });
  res.json({ product: product, colors: colors, images: images });
}));

// Crea o actualiza la prenda con sus colores y talles. Las combinaciones color + talle se generan solas.
async function saveProduct(conn, productId, body) {
  const name = str(body.name, 140);
  const price = toInt(body.price);
  const categoryId = toInt(body.category_id);
  const comparePrice = toInt(body.compare_price) || null;
  if (name.length < 2) throw httpError(400, 'Escribí el nombre de la prenda');
  if (price < 1) throw httpError(400, 'Escribí el precio');
  if (comparePrice && comparePrice <= price) throw httpError(400, 'El precio anterior tiene que ser mayor al precio actual');
  const cat = await conn.query('SELECT id FROM categories WHERE id = ?', [categoryId]);
  if (!cat[0].length) throw httpError(400, 'Elegí una categoría');

  // Cada color tiene sus propios talles. Si no vienen por color, se usa la lista general (compatibilidad).
  const toSizes = function (v) {
    const arr = Array.isArray(v) ? v : String(v || '').split(',');
    return Array.from(new Set(arr.map(function (s) { return str(s, 10); }).filter(Boolean))).slice(0, 14);
  };
  const generalSizes = toSizes(body.sizes);
  const colors = (Array.isArray(body.colors) ? body.colors : []).map(function (c) {
    return {
      id: toInt(c && c.id) || null,
      name: str(c && c.name, 40),
      hex: /^#[0-9a-fA-F]{6}$/.test(String((c && c.hex) || '')) ? c.hex : '#CCCCCC',
      sizes: c && c.sizes !== undefined ? toSizes(c.sizes) : generalSizes
    };
  }).filter(function (c) { return c.name; });
  if (!colors.length) throw httpError(400, 'Cargá al menos un color');
  colors.forEach(function (c) {
    if (!c.sizes.length) throw httpError(400, 'Cargá al menos un talle para el color ' + c.name);
  });

  const common = [
    categoryId, name, str(body.description, 4000) || null, str(body.composition, 255) || null,
    price, comparePrice, body.featured ? 1 : 0, body.active === false || body.active === 0 ? 0 : 1
  ];
  let id = productId;
  if (!id) {
    const slug = await uniqueSlug(conn, 'products', name);
    const r = await conn.query(
      'INSERT INTO products (category_id, name, description, composition, price, compare_price, featured, active, slug) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      common.concat([slug])
    );
    id = r[0].insertId;
  } else {
    const exists = await conn.query('SELECT id FROM products WHERE id = ?', [id]);
    if (!exists[0].length) throw httpError(404, 'Prenda no encontrada');
    // El slug no cambia al renombrar, para no romper el link ni el posicionamiento en Google.
    await conn.query(
      'UPDATE products SET category_id = ?, name = ?, description = ?, composition = ?, price = ?, compare_price = ?, featured = ?, active = ? WHERE id = ?',
      common.concat([id])
    );
  }

  const existing = (await conn.query('SELECT id FROM product_colors WHERE product_id = ?', [id]))[0].map(function (r) { return r.id; });
  const colorIds = [];
  for (const c of colors) {
    if (c.id && existing.indexOf(c.id) !== -1) {
      await conn.query('UPDATE product_colors SET name = ?, hex = ? WHERE id = ?', [c.name, c.hex, c.id]);
      colorIds.push(c.id);
    } else {
      const r = await conn.query('INSERT INTO product_colors (product_id, name, hex) VALUES (?, ?, ?)', [id, c.name, c.hex]);
      colorIds.push(r[0].insertId);
    }
  }
  const removed = existing.filter(function (e) { return colorIds.indexOf(e) === -1; });
  if (removed.length) await conn.query('DELETE FROM product_colors WHERE id IN (?)', [removed]);

  // Talles por color: se quitan los que ya no están y se agregan los nuevos (con stock 0).
  const wanted = new Set();
  const combos = [];
  colorIds.forEach(function (cid, i) {
    colors[i].sizes.forEach(function (s) { wanted.add(cid + '|' + s); combos.push([id, cid, s, 0]); });
  });
  const current = (await conn.query(
    'SELECT v.id, v.color_id, v.size, c.name AS color FROM product_variants v JOIN product_colors c ON c.id = v.color_id WHERE v.product_id = ?', [id]
  ))[0];
  const drop = current.filter(function (v) { return !wanted.has(v.color_id + '|' + v.size); });
  if (drop.length) {
    const dropIds = drop.map(function (v) { return v.id; });
    const sold = (await conn.query('SELECT DISTINCT variant_id FROM local_sales WHERE variant_id IN (?)', [dropIds]))[0];
    if (sold.length) {
      const bad = drop.filter(function (v) { return sold.some(function (s) { return s.variant_id === v.id; }); })[0];
      throw httpError(409, 'No se puede quitar el talle ' + bad.size + ' del color ' + bad.color + ' porque ya tiene ventas del local registradas. Dejalo y poné su stock en 0.');
    }
    await conn.query('DELETE FROM product_variants WHERE id IN (?)', [dropIds]);
  }
  await conn.query('INSERT IGNORE INTO product_variants (product_id, color_id, size, stock) VALUES ?', [combos]);
  return id;
}

router.post('/products', requireRole('owner'), wrap(async function (req, res) {
  const id = await tx(function (conn) { return saveProduct(conn, null, req.body || {}); });
  res.status(201).json({ id: id });
}));

router.put('/products/:id', requireRole('owner'), wrap(async function (req, res) {
  const pid = toInt(req.params.id);
  if (!pid) throw httpError(404, 'Prenda no encontrada');
  const id = await tx(function (conn) { return saveProduct(conn, pid, req.body || {}); });
  res.json({ id: id });
}));

// Archivar / reactivar (las prendas no se borran: así se conserva el historial de ventas).
router.patch('/products/:id/active', requireRole('owner'), wrap(async function (req, res) {
  await query('UPDATE products SET active = ? WHERE id = ?', [req.body.active ? 1 : 0, toInt(req.params.id)]);
  res.json({ ok: true });
}));

// ---------------------------------------------------------------- Fotos
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024, files: 10 },
  fileFilter: function (req, file, cb) {
    if (/^image\/(jpeg|png|webp)$/.test(file.mimetype)) return cb(null, true);
    cb(httpError(400, 'Subí fotos en formato JPG, PNG o WebP'));
  }
});

router.post('/products/:id/images', requireRole('owner'), upload.array('photos', 10), wrap(async function (req, res) {
  const sharp = require('sharp'); // se carga recién acá para que el sitio arranque aunque falte la librería
  const productId = toInt(req.params.id);
  const product = await one('SELECT id, name FROM products WHERE id = ?', [productId]);
  if (!product) throw httpError(404, 'Prenda no encontrada');
  if (!req.files || !req.files.length) throw httpError(400, 'No llegó ninguna foto');

  let colorId = toInt(req.body.color_id) || null;
  let alt = product.name;
  if (colorId) {
    const color = await one('SELECT id, name FROM product_colors WHERE id = ? AND product_id = ?', [colorId, productId]);
    if (!color) colorId = null;
    else alt = product.name + ' en color ' + color.name.toLowerCase();
  }

  fs.mkdirSync(cfg.uploadDir, { recursive: true });
  const next = await one('SELECT COALESCE(MAX(sort_order), 0) AS n FROM product_images WHERE product_id = ?', [productId]);
  let order = Number(next.n);

  for (const file of req.files) {
    const base = productId + '-' + crypto.randomBytes(6).toString('hex');
    const big = base + '.webp';
    const small = base + '-480.webp';
    await sharp(file.buffer).rotate().resize({ width: 1200, height: 1600, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 80 }).toFile(path.join(cfg.uploadDir, big));
    await sharp(file.buffer).rotate().resize({ width: 480, height: 640, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 75 }).toFile(path.join(cfg.uploadDir, small));
    order += 1;
    await query(
      'INSERT INTO product_images (product_id, color_id, path, thumb_path, alt, sort_order) VALUES (?, ?, ?, ?, ?, ?)',
      [productId, colorId, '/uploads/' + big, '/uploads/' + small, alt, order]
    );
  }
  res.status(201).json({ ok: true, count: req.files.length });
}));

router.delete('/images/:id', requireRole('owner'), wrap(async function (req, res) {
  const img = await one('SELECT id, path, thumb_path FROM product_images WHERE id = ?', [toInt(req.params.id)]);
  if (!img) throw httpError(404, 'Foto no encontrada');
  [img.path, img.thumb_path].forEach(function (p) {
    fs.unlink(path.join(cfg.uploadDir, path.basename(p)), function () { /* si no existe, no pasa nada */ });
  });
  await query('DELETE FROM product_images WHERE id = ?', [img.id]);
  res.json({ ok: true });
}));

// ---------------------------------------------------------------- Stock (paquetes 2 y 3)
router.get('/stock', requireFeature('stock'), wrap(async function (req, res) {
  const rows = await query(
    'SELECT v.id, p.id AS product_id, p.name AS product, p.active, c.name AS color, c.hex, v.size, v.stock ' +
    'FROM product_variants v ' +
    'JOIN products p ON p.id = v.product_id ' +
    'JOIN product_colors c ON c.id = v.color_id ' +
    'ORDER BY p.active DESC, p.name, v.color_id, v.id'
  );
  res.json({ variants: rows });
}));

router.post('/stock/adjust', requireFeature('stock'), wrap(async function (req, res) {
  const variantId = toInt(req.body.variantId);
  const hasSet = req.body.set !== undefined && req.body.set !== null && req.body.set !== '';
  const result = await tx(async function (conn) {
    const found = await conn.query('SELECT stock FROM product_variants WHERE id = ? FOR UPDATE', [variantId]);
    if (!found[0].length) throw httpError(404, 'Combinación no encontrada');
    const current = found[0][0].stock;
    const target = hasSet ? toInt(req.body.set, -1) : current + toInt(req.body.delta);
    if (target < 0) throw httpError(400, 'El stock no puede ser negativo');
    if (target !== current) {
      await conn.query('UPDATE product_variants SET stock = ? WHERE id = ?', [target, variantId]);
      await conn.query(
        'INSERT INTO stock_movements (variant_id, delta, reason, user_id) VALUES (?, ?, ?, ?)',
        [variantId, target - current, 'ajuste', req.user.id]
      );
    }
    return target;
  });
  res.json({ stock: result });
}));

// ---------------------------------------------------------------- Vendí en el local (paquetes 2 y 3)
router.get('/local-sales', requireFeature('localSales'), wrap(async function (req, res) {
  const rows = await query(
    'SELECT s.id, s.quantity, s.total, s.voided, s.created_at, p.name AS product, c.name AS color, v.size, u.name AS seller ' +
    'FROM local_sales s ' +
    'JOIN product_variants v ON v.id = s.variant_id ' +
    'JOIN products p ON p.id = v.product_id ' +
    'JOIN product_colors c ON c.id = v.color_id ' +
    'LEFT JOIN users u ON u.id = s.user_id ' +
    'ORDER BY s.id DESC LIMIT 60'
  );
  res.json({ sales: rows });
}));

router.post('/local-sales', requireFeature('localSales'), wrap(async function (req, res) {
  const variantId = toInt(req.body.variantId);
  const qty = clamp(toInt(req.body.quantity, 1), 1, 50);
  const sale = await tx(async function (conn) {
    const info = await conn.query(
      'SELECT p.price, p.active FROM product_variants v JOIN products p ON p.id = v.product_id WHERE v.id = ?', [variantId]
    );
    if (!info[0].length) throw httpError(404, 'Combinación no encontrada');
    if (!info[0][0].active) throw httpError(409, 'Esa prenda está archivada y no se puede vender');
    const upd = await conn.query('UPDATE product_variants SET stock = stock - ? WHERE id = ? AND stock >= ?', [qty, variantId, qty]);
    if (upd[0].affectedRows === 0) throw httpError(409, 'No hay stock suficiente para esa venta');
    const price = info[0][0].price;
    const ins = await conn.query(
      'INSERT INTO local_sales (variant_id, user_id, quantity, unit_price, total) VALUES (?, ?, ?, ?, ?)',
      [variantId, req.user.id, qty, price, price * qty]
    );
    await conn.query(
      'INSERT INTO stock_movements (variant_id, delta, reason, ref_id, user_id) VALUES (?, ?, ?, ?, ?)',
      [variantId, -qty, 'venta_local', ins[0].insertId, req.user.id]
    );
    const left = await conn.query('SELECT stock FROM product_variants WHERE id = ?', [variantId]);
    return { id: ins[0].insertId, stock: left[0][0].stock };
  });
  res.status(201).json(sale);
}));

router.post('/local-sales/:id/void', requireFeature('localSales'), wrap(async function (req, res) {
  const saleId = toInt(req.params.id);
  await tx(async function (conn) {
    const found = await conn.query('SELECT id, variant_id, quantity, voided FROM local_sales WHERE id = ? FOR UPDATE', [saleId]);
    const sale = found[0][0];
    if (!sale) throw httpError(404, 'Venta no encontrada');
    if (sale.voided) throw httpError(400, 'Esa venta ya está anulada');
    await conn.query('UPDATE local_sales SET voided = 1, voided_at = NOW() WHERE id = ?', [saleId]);
    await conn.query('UPDATE product_variants SET stock = stock + ? WHERE id = ?', [sale.quantity, sale.variant_id]);
    await conn.query(
      'INSERT INTO stock_movements (variant_id, delta, reason, ref_id, user_id) VALUES (?, ?, ?, ?, ?)',
      [sale.variant_id, sale.quantity, 'anulacion_local', saleId, req.user.id]
    );
  });
  res.json({ ok: true });
}));

// ---------------------------------------------------------------- Pedidos (paquetes 2 y 3)
const STATUSES = ['pendiente', 'pagado', 'enviado', 'entregado', 'cancelado'];
const FLOW = ['pendiente', 'pagado', 'enviado', 'entregado'];

router.get('/orders', requireFeature('orders'), wrap(async function (req, res) {
  const status = String(req.query.status || '');
  const filtered = STATUSES.indexOf(status) !== -1;
  const rows = await query(
    'SELECT id, code, customer_name, phone, email, delivery_method, address, city, province, postal_code, ' +
    'subtotal, shipping_cost, total, payment_method, status, notes, created_at, receipt_at ' +
    'FROM orders ' + (filtered ? 'WHERE status = ? ' : '') + 'ORDER BY id DESC LIMIT 100',
    filtered ? [status] : []
  );
  if (rows.length) {
    const items = await query(
      'SELECT order_id, product_name, color_name, size, unit_price, quantity FROM order_items WHERE order_id IN (?)',
      [rows.map(function (r) { return r.id; })]
    );
    const settings = await settingsLib.getSettings();
    rows.forEach(function (o) {
      o.items = items.filter(function (i) { return i.order_id === o.id; });
      const first = String(o.customer_name).split(' ')[0];
      o.whatsapp = waLink(arWhatsapp(o.phone), 'Hola ' + first + '! Te escribimos de ' + settings.store_name + ' por tu pedido ' + o.code + '.');
    });
  }
  res.json({ orders: rows });
}));

// Comprobante de transferencia: solo se abre con sesión iniciada en el panel.
router.get('/orders/:id/receipt', requireFeature('orders'), wrap(async function (req, res) {
  const o = await one('SELECT receipt_path FROM orders WHERE id = ?', [toInt(req.params.id)]);
  if (!o || !o.receipt_path) throw httpError(404, 'Este pedido no tiene comprobante');
  const file = path.join(cfg.receiptsDir, path.basename(o.receipt_path));
  if (!fs.existsSync(file)) throw httpError(404, 'No se encontró el archivo del comprobante');
  res.set('Cache-Control', 'private, no-store');
  res.sendFile(file);
}));

router.patch('/orders/:id/status', requireFeature('orders'), wrap(async function (req, res) {
  const id = toInt(req.params.id);
  const next = String(req.body.status || '');
  if (STATUSES.indexOf(next) === -1) throw httpError(400, 'Estado inválido');
  const order = await one('SELECT id, status, delivery_method FROM orders WHERE id = ?', [id]);
  if (!order) throw httpError(404, 'Pedido no encontrado');
  if (order.status === next) return res.json({ ok: true });
  if (order.status === 'cancelado' || order.status === 'entregado') {
    throw httpError(400, 'Un pedido ' + order.status + ' ya no se puede modificar');
  }
  if (next === 'cancelado') {
    if (order.status === 'enviado') {
      throw httpError(400, 'Un pedido enviado no se cancela desde acá. Si te lo devuelven, ajustá el stock a mano en la solapa Stock.');
    }
    await orders.cancelOrder(id, { userId: req.user.id });
    return res.json({ ok: true });
  }
  if (FLOW.indexOf(next) <= FLOW.indexOf(order.status)) throw httpError(400, 'No se puede volver a un estado anterior');
  if (next === 'enviado' && order.delivery_method !== 'envio') throw httpError(400, 'Este pedido es para retirar, no para enviar');
  await query('UPDATE orders SET status = ?, reserved_until = NULL WHERE id = ?', [next, id]);
  res.json({ ok: true });
}));

// ---------------------------------------------------------------- Clientes y avisos (paquete 3)
router.get('/customers', requireFeature('customers'), wrap(async function (req, res) {
  const rows = await query(
    'SELECT c.id, c.name, c.phone, c.email, c.accepts_marketing, c.created_at, c.last_order_at, ' +
    "(SELECT COUNT(*) FROM orders o WHERE o.customer_id = c.id AND o.status <> 'cancelado') AS orders_count " +
    'FROM customers c ORDER BY c.last_order_at DESC LIMIT 300'
  );
  res.json({ customers: rows });
}));

// Arma los mensajes de WhatsApp para los clientes que aceptaron avisos y ya compraron de esa categoría.
router.get('/notify/preview', requireFeature('notifications'), wrap(async function (req, res) {
  const settings = await settingsLib.getSettings();
  const product = await one('SELECT id, name, slug, category_id FROM products WHERE id = ? AND active = 1', [toInt(req.query.productId)]);
  if (!product) throw httpError(404, 'Prenda no encontrada');

  const sizeRows = await query(
    'SELECT size, MIN(id) AS first_id FROM product_variants WHERE product_id = ?' +
    (features.stock ? ' AND stock > 0' : '') + ' GROUP BY size ORDER BY first_id',
    [product.id]
  );
  const sizes = sizeRows.map(function (r) { return r.size; }).join(', ') || 'consultá disponibilidad';
  const url = cfg.siteUrl + '/producto/' + product.slug;

  const customers = await query(
    'SELECT c.id, c.name, c.phone FROM customers c WHERE c.accepts_marketing = 1 AND EXISTS (' +
    'SELECT 1 FROM orders o JOIN order_items oi ON oi.order_id = o.id ' +
    'JOIN product_variants v ON v.id = oi.variant_id JOIN products p2 ON p2.id = v.product_id ' +
    "WHERE o.customer_id = c.id AND o.status <> 'cancelado' AND p2.category_id = ?) ORDER BY c.name",
    [product.category_id]
  );

  const last = req.query.template === 'ultimos';
  const list = customers.map(function (c) {
    const first = String(c.name).split(' ')[0];
    const message = last
      ? 'Hola ' + first + '! Quedan pocas unidades de ' + product.name + ' (talles: ' + sizes + '). Si te gustó, avisame y te lo separo. ' + url
      : 'Hola ' + first + '! Llegó ' + product.name + ' a ' + settings.store_name + '. Talles disponibles: ' + sizes + '. Mirala acá: ' + url;
    return { id: c.id, name: c.name, message: message, link: waLink(arWhatsapp(c.phone), message) };
  });
  res.json({ product: product.name, customers: list });
}));

// ---------------------------------------------------------------- Envíos (paquete 3)
router.get('/shipping-rates', requireFeature('shipping'), wrap(async function (req, res) {
  res.json({ rates: await query('SELECT province, cost, days_min, days_max, active FROM shipping_rates ORDER BY province') });
}));

router.put('/shipping-rates', requireFeature('shipping'), requireRole('owner'), wrap(async function (req, res) {
  const list = Array.isArray(req.body.rates) ? req.body.rates : [];
  for (const r of list) {
    const province = str(r.province, 60);
    if (!province) continue;
    await query(
      'INSERT INTO shipping_rates (province, cost, days_min, days_max, active) VALUES (?, ?, ?, ?, ?) ' +
      'ON DUPLICATE KEY UPDATE cost = VALUES(cost), days_min = VALUES(days_min), days_max = VALUES(days_max), active = VALUES(active)',
      [province, Math.max(0, toInt(r.cost)), clamp(toInt(r.days_min, 3), 0, 60), clamp(toInt(r.days_max, 7), 0, 60), r.active ? 1 : 0]
    );
  }
  res.json({ ok: true });
}));

// ---------------------------------------------------------------- Usuarios (paquete 3, solo dueño)
router.get('/users', requireFeature('multiUser'), requireRole('owner'), wrap(async function (req, res) {
  res.json({ users: await query('SELECT id, name, email, role, active, created_at FROM users ORDER BY id') });
}));

router.post('/users', requireFeature('multiUser'), requireRole('owner'), wrap(async function (req, res) {
  const name = str(req.body.name, 80);
  const email = str(req.body.email, 120).toLowerCase();
  const password = String(req.body.password || '');
  const role = req.body.role === 'owner' ? 'owner' : 'seller';
  if (name.length < 2) throw httpError(400, 'Escribí el nombre');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw httpError(400, 'El correo no es válido');
  if (password.length < 8) throw httpError(400, 'La contraseña debe tener al menos 8 caracteres');
  const hash = await bcrypt.hash(password, 10);
  const r = await query('INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)', [name, email, hash, role]);
  res.status(201).json({ id: r.insertId });
}));

router.put('/users/:id', requireFeature('multiUser'), requireRole('owner'), wrap(async function (req, res) {
  const id = toInt(req.params.id);
  const name = str(req.body.name, 80);
  const role = req.body.role === 'owner' ? 'owner' : 'seller';
  const active = req.body.active === false || req.body.active === 0 ? 0 : 1;
  if (name.length < 2) throw httpError(400, 'Escribí el nombre');
  if (id === req.user.id && (!active || role !== 'owner')) {
    throw httpError(400, 'No podés quitarte el acceso ni el rol de dueño a vos mismo');
  }
  await query('UPDATE users SET name = ?, role = ?, active = ? WHERE id = ?', [name, role, active, id]);
  const password = String(req.body.password || '');
  if (password) {
    if (password.length < 8) throw httpError(400, 'La contraseña debe tener al menos 8 caracteres');
    await query('UPDATE users SET password_hash = ? WHERE id = ?', [await bcrypt.hash(password, 10), id]);
  }
  res.json({ ok: true });
}));

// ---------------------------------------------------------------- Ajustes y mensajes
router.get('/settings', requireRole('owner'), wrap(async function (req, res) {
  res.json({ settings: await settingsLib.getSettings(true) });
}));

router.put('/settings', requireRole('owner'), wrap(async function (req, res) {
  res.json({ settings: await settingsLib.saveSettings(req.body || {}) });
}));

router.get('/messages', wrap(async function (req, res) {
  res.json({
    messages: await query(
      'SELECT id, type, name, email, phone, order_code, message, handled, created_at FROM contact_messages ORDER BY handled, id DESC LIMIT 100'
    )
  });
}));

router.patch('/messages/:id', wrap(async function (req, res) {
  await query('UPDATE contact_messages SET handled = ? WHERE id = ?', [req.body.handled ? 1 : 0, toInt(req.params.id)]);
  res.json({ ok: true });
}));

module.exports = router;
