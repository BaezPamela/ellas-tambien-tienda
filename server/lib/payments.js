// Mercado Pago (Checkout Pro). El cliente paga en la página de Mercado Pago y nunca
// pasamos por datos de tarjeta. Cuando el pago se aprueba, Mercado Pago avisa al
// webhook (/api/payments/webhook) y el pedido pasa solo a "pagado".
const cfg = require('../config');

let sdk = null;
function load() {
  if (!sdk) sdk = require('mercadopago'); // se carga solo si se usa
  return sdk;
}

function enabled() {
  return Boolean(cfg.mpToken) && cfg.features.onlinePayments;
}

function client() {
  const { MercadoPagoConfig } = load();
  return new MercadoPagoConfig({ accessToken: cfg.mpToken, options: { timeout: 10000 } });
}

// Crea la preferencia de pago y devuelve la URL a la que hay que mandar al cliente.
async function createPreference(order, items, settings) {
  const { Preference } = load();
  const storeName = typeof settings === 'string' ? settings : settings && settings.store_name;
  const list = items.map((i) => ({
    id: String(i.variant_id || i.product_name),
    title: i.product_name + ' (' + i.color_name + ', talle ' + i.size + ')',
    quantity: Number(i.quantity),
    unit_price: Number(i.unit_price),
    currency_id: 'ARS'
  }));
  if (order.shipping_cost > 0) {
    list.push({ id: 'envio', title: 'Envío', quantity: 1, unit_price: Number(order.shipping_cost), currency_id: 'ARS' });
  }
  const back = cfg.siteUrl + '/pedido/' + order.code;
  const body = {
    items: list,
    external_reference: order.code,
    statement_descriptor: String(storeName || 'TIENDA').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9 ]/g, '').slice(0, 22).toUpperCase(),
    back_urls: { success: back, failure: back, pending: back }
  };
  // Mercado Pago solo acepta estas dos opciones con una URL pública https.
  if (cfg.siteUrl.startsWith('https://')) {
    body.auto_return = 'approved';
    body.notification_url = cfg.siteUrl + '/api/payments/webhook';
  }
  const pref = await new Preference(client()).create({ body });
  return pref.init_point;
}

async function getPayment(id) {
  const { Payment } = load();
  return new Payment(client()).get({ id });
}

module.exports = { enabled, createPreference, getPayment };
