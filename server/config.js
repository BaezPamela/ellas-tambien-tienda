const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const env = process.env;

// ------------------------------------------------------------------
// Paquete contratado. Cambiá PACKAGE en el archivo .env (1, 2 o 3).
//   1 = Catálogo        -> catálogo, pedido por WhatsApp, panel de productos y fotos
//   2 = Tienda con stock -> + stock, ventas del local, pedidos, cobro online
//   3 = Tienda + clientes -> + envíos por provincia, base de clientes, avisos, varios usuarios
// ------------------------------------------------------------------
const PACKAGE = Math.min(3, Math.max(1, parseInt(env.PACKAGE, 10) || 2));

const features = {
  adminProducts: true,
  stock: PACKAGE >= 2,
  localSales: PACKAGE >= 2,
  orders: PACKAGE >= 2,
  onlinePayments: PACKAGE >= 2,
  shipping: PACKAGE >= 3,
  customers: PACKAGE >= 3,
  notifications: PACKAGE >= 3,
  multiUser: PACKAGE >= 3
};

const isProd = env.NODE_ENV === 'production';
const port = parseInt(env.PORT, 10) || 3000;

if (isProd && (!env.JWT_SECRET || env.JWT_SECRET.length < 24)) {
  console.error('Falta JWT_SECRET (mínimo 24 caracteres) para ejecutar en producción.');
  process.exit(1);
}

const dbUrl = env.DATABASE_URL || env.MYSQL_URL || '';

module.exports = {
  PACKAGE,
  features,
  isProd,
  port,
  siteUrl: (env.SITE_URL || 'http://localhost:' + port).replace(/\/+$/, ''),
  jwtSecret: env.JWT_SECRET || 'secreto-solo-para-desarrollo',
  uploadDir: env.UPLOAD_DIR
    ? path.resolve(env.UPLOAD_DIR)
    : path.join(__dirname, '..', 'public', 'uploads'),
  // Los comprobantes son datos privados: van fuera de las carpetas públicas.
  receiptsDir: env.RECEIPTS_DIR
    ? path.resolve(env.RECEIPTS_DIR)
    : env.UPLOAD_DIR
      ? path.join(path.dirname(path.resolve(env.UPLOAD_DIR)), 'receipts')
      : path.join(__dirname, '..', 'private', 'receipts'),
  reserveHours: parseInt(env.RESERVE_HOURS, 10) || 48,
  mpToken: env.MP_ACCESS_TOKEN || '',
  db: dbUrl
    ? { uri: dbUrl }
    : {
        host: env.DB_HOST || env.MYSQLHOST || 'localhost',
        port: parseInt(env.DB_PORT || env.MYSQLPORT, 10) || 3306,
        user: env.DB_USER || env.MYSQLUSER || 'root',
        password: env.DB_PASSWORD || env.MYSQLPASSWORD || '',
        database: env.DB_NAME || env.MYSQLDATABASE || 'ellas_tambien'
      },

  // Valores por defecto de los datos del local. El dueño los edita desde el panel (Ajustes)
  // y lo que se guarda en la tabla "settings" tiene prioridad sobre esto.
  defaultSettings: {
    store_name: 'Ellas También',
    tagline: 'Tienda de ropa en Casilda',
    description: 'Ropa y accesorios en Casilda, Santa Fe. Mirá el catálogo con talles y colores, elegí lo que te gusta y pedilo online o pasá a probártelo al local.',
    whatsapp: '5493464000000',
    phone_display: '',
    email: '',
    address: '[Completar dirección del local]',
    city: 'Casilda',
    province: 'Santa Fe',
    postal_code: '2170',
    hours: 'Lunes a viernes de 9 a 13 y de 17 a 20:30\nSábados de 9 a 13',
    hours_schema: 'Mo-Fr 09:00-13:00\nMo-Fr 17:00-20:30\nSa 09:00-13:00',
    instagram_url: 'https://www.instagram.com/ellastambienn/',
    facebook_url: '',
    maps_url: '',
    free_shipping_from: '0',
    bank_holder: '',
    bank_name: '',
    bank_cbu: '',
    bank_alias: '',
    legal_name: '',
    cuit: ''
  }
};
