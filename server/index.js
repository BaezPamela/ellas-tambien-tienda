'use strict';
const path = require('path');
const fs = require('fs');
const express = require('express');
const helmet = require('helmet');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const bcrypt = require('bcryptjs');
const cfg = require('./config');
const { pool, one, query } = require('./db');
const pages = require('./pages');
const orders = require('./lib/orders');

const app = express();
app.set('trust proxy', 1); // detrás del proxy de Railway
app.disable('x-powered-by');

app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      scriptSrcAttr: ["'none'"],
      styleSrc: ["'self'", 'https://fonts.googleapis.com'],
      styleSrcAttr: ["'unsafe-inline'"],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      imgSrc: ["'self'", 'data:'],
      connectSrc: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'self'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      upgradeInsecureRequests: cfg.isProd ? [] : null
    }
  }
}));
app.use(compression());
app.use(express.json({ limit: '200kb' }));
app.use(cookieParser());

// El panel y la API no se indexan en Google.
app.use(function (req, res, next) {
  if (req.path.indexOf('/api/') === 0 || req.path.indexOf('/admin') === 0) {
    res.set('X-Robots-Tag', 'noindex, nofollow');
  }
  next();
});

fs.mkdirSync(cfg.uploadDir, { recursive: true });
app.use('/uploads', express.static(cfg.uploadDir, { maxAge: '30d', immutable: true }));
app.use(express.static(path.join(__dirname, '..', 'public'), { maxAge: cfg.isProd ? '7d' : 0, index: false }));

app.get('/admin', function (req, res) {
  res.sendFile(path.join(__dirname, '..', 'public', 'admin', 'index.html'));
});

app.use('/api/auth', require('./routes/auth'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api', require('./routes/shop'));
app.use('/api', function (req, res) { res.status(404).json({ error: 'No encontrado' }); });

app.use('/', pages.router);
app.use(pages.notFound);

// Manejo de errores: mensajes claros para el usuario y detalle técnico solo en el log del servidor.
app.use(function (err, req, res, next) { // eslint-disable-line no-unused-vars
  let status = err.status || 500;
  let message = err.message;
  if (err.code === 'ER_ROW_IS_REFERENCED_2') {
    status = 409; message = 'No se puede quitar porque ya tiene ventas o movimientos registrados.';
  } else if (err.code === 'ER_DUP_ENTRY') {
    status = 409; message = 'Ya existe un registro con esos datos.';
  } else if (err.name === 'MulterError') {
    status = 400; message = 'No se pudo subir la foto: ' + err.message;
  } else if (err.type === 'entity.parse.failed') {
    status = 400; message = 'Los datos enviados no son válidos.';
  }
  if (status >= 500) {
    console.error(err);
    message = 'Ocurrió un error. Probá de nuevo en unos minutos.';
  }
  if (req.originalUrl.indexOf('/api/') === 0) return res.status(status).json({ error: message });
  res.status(status).type('html').send(pages.errorPage(status));
});

// Crea el primer usuario dueño si todavía no hay ninguno.
async function ensureAdmin() {
  let count;
  try {
    count = Number((await one('SELECT COUNT(*) AS n FROM users')).n);
  } catch (err) {
    if (err.code === 'ER_NO_SUCH_TABLE') {
      console.error('Faltan las tablas. Ejecutá database/01_schema.sql en tu base de datos y reiniciá.');
      process.exit(1);
    }
    throw err;
  }
  if (count > 0) return;
  const email = String(process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const password = String(process.env.ADMIN_PASSWORD || '');
  if (!email || password.length < 8) {
    console.warn('No hay usuarios. Definí ADMIN_EMAIL y ADMIN_PASSWORD (mínimo 8 caracteres) y reiniciá para crear el primero.');
    return;
  }
  const hash = await bcrypt.hash(password, 10);
  await query('INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)', ['Dueño/a', email, hash, 'owner']);
  console.log('Usuario del panel creado: ' + email);
}

// Bases creadas antes de existir la subida de comprobantes: se agregan las columnas solas.
async function ensureReceiptColumns() {
  const sqls = [
    'ALTER TABLE orders ADD COLUMN receipt_path VARCHAR(120) NULL',
    'ALTER TABLE orders ADD COLUMN receipt_at DATETIME NULL'
  ];
  for (const sql of sqls) {
    try { await query(sql); } catch (err) { if (err.code !== 'ER_DUP_FIELDNAME') throw err; }
  }
}

async function start() {
  try {
    await pool.query('SELECT 1');
  } catch (err) {
    console.error('No se pudo conectar a la base de datos:', err.message);
    process.exit(1);
  }
  await ensureAdmin();
  if (cfg.features.orders) await ensureReceiptColumns();

  if (cfg.features.orders) {
    const sweep = function () {
      orders.expireOrders()
        .then(function (n) { if (n) console.log('Se cancelaron ' + n + ' pedido(s) sin pago y se devolvió el stock.'); })
        .catch(function (err) { console.error('Error al vencer pedidos:', err.message); });
    };
    sweep();
    setInterval(sweep, 10 * 60 * 1000);
  }

  app.listen(cfg.port, function () {
    console.log('Tienda lista en ' + cfg.siteUrl + ' (paquete ' + cfg.PACKAGE + ')');
  });
}

process.on('unhandledRejection', function (err) { console.error('Promesa sin manejar:', err); });
start();
