'use strict';
// Páginas públicas renderizadas en el servidor (HTML completo para que Google las lea sin ejecutar JavaScript),
// con título, descripción, canonical, Open Graph y datos estructurados (schema.org) en cada una.
const express = require('express');
const cfg = require('./config');
const { query, one } = require('./db');
const { esc, money, waLink, digits, truncate, wrap } = require('./lib/util');
const { getSettings } = require('./lib/settings');
const payments = require('./lib/payments');

const features = cfg.features;
const router = express.Router();
const ASSET_V = Date.now().toString(36);

// ------------------------------------------------------------------ utilidades
const abs = function (p) { return /^https?:/.test(p) ? p : cfg.siteUrl + p; };
const jsonScript = function (obj) { return JSON.stringify(obj).replace(/</g, '\\u003c'); };
const hasAddress = function (s) { return s.address && s.address.charAt(0) !== '['; };
// Un número de relleno (termina en 000000) no se publica ni en links ni en datos para Google.
const hasWhatsapp = function (s) { const d = digits(s.whatsapp); return d.length >= 10 && !/0{6}$/.test(d); };
const waHref = function (s, text) { return hasWhatsapp(s) ? waLink(s.whatsapp, text) : '/contacto'; };
const lines = function (text) { return String(text || '').split(/\r?\n/).map(function (l) { return l.trim(); }).filter(Boolean); };

function mapsUrl(s) {
  if (s.maps_url) return s.maps_url;
  return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent([s.address, s.city, s.province].join(', '));
}

function clientConfig(s) {
  return {
    package: cfg.PACKAGE,
    features: features,
    mpEnabled: payments.enabled(),
    store: {
      name: s.store_name, whatsapp: hasWhatsapp(s) ? s.whatsapp : '', city: s.city,
      // Los datos bancarios solo se envían al navegador si la tienda recibe pedidos (paquetes 2 y 3).
      bank_holder: features.orders ? s.bank_holder : '', bank_name: features.orders ? s.bank_name : '',
      bank_cbu: features.orders ? s.bank_cbu : '', bank_alias: features.orders ? s.bank_alias : '',
      free_shipping_from: parseInt(s.free_shipping_from, 10) || 0
    }
  };
}

function storeLd(s) {
  const ld = {
    '@context': 'https://schema.org',
    '@type': 'ClothingStore',
    '@id': cfg.siteUrl + '/#tienda',
    name: s.store_name,
    url: cfg.siteUrl + '/',
    description: s.description,
    image: abs('/img/og-default.png'),
    telephone: hasWhatsapp(s) ? '+' + digits(s.whatsapp) : undefined,
    address: {
      '@type': 'PostalAddress',
      streetAddress: hasAddress(s) ? s.address : undefined,
      addressLocality: s.city,
      addressRegion: s.province,
      postalCode: s.postal_code,
      addressCountry: 'AR'
    },
    sameAs: [s.instagram_url, s.facebook_url].filter(Boolean)
  };
  const hours = lines(s.hours_schema);
  if (hours.length) ld.openingHours = hours;
  if (s.email) ld.email = s.email;
  return ld;
}

function breadcrumbLd(items) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map(function (it, i) {
      return { '@type': 'ListItem', position: i + 1, name: it[0], item: abs(it[1]) };
    })
  };
}

// ------------------------------------------------------------------ plantilla común
function layout(s, o) {
  const canonical = abs(o.path || '/');
  const title = o.title;
  const desc = truncate(o.description || s.description, 160);
  const image = abs(o.image || '/img/og-default.png');
  const robots = o.robots || 'index,follow';
  const free = parseInt(s.free_shipping_from, 10) || 0;
  const announce = features.shipping && free > 0
    ? '<div class="announce">Envío gratis en compras desde ' + money(free) + '</div>' : '';

  const social = [];
  if (s.instagram_url) social.push('<a href="' + esc(s.instagram_url) + '" rel="noopener me" target="_blank">Instagram</a>');
  if (s.facebook_url) social.push('<a href="' + esc(s.facebook_url) + '" rel="noopener me" target="_blank">Facebook</a>');

  const legal = [];
  if (s.legal_name) legal.push(esc(s.legal_name));
  if (s.cuit) legal.push('CUIT ' + esc(s.cuit));

  const head = [
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    '<title>' + esc(title) + '</title>',
    '<meta name="description" content="' + esc(desc) + '">',
    '<meta name="robots" content="' + esc(robots) + '">',
    '<link rel="canonical" href="' + esc(canonical) + '">',
    '<meta property="og:type" content="' + (o.ogType || 'website') + '">',
    '<meta property="og:site_name" content="' + esc(s.store_name) + '">',
    '<meta property="og:title" content="' + esc(title) + '">',
    '<meta property="og:description" content="' + esc(desc) + '">',
    '<meta property="og:url" content="' + esc(canonical) + '">',
    '<meta property="og:image" content="' + esc(image) + '">',
    '<meta property="og:locale" content="es_AR">',
    '<meta name="twitter:card" content="summary_large_image">',
    '<meta name="theme-color" content="#B03A6B">',
    '<link rel="icon" href="/favicon.svg" type="image/svg+xml">',
    '<link rel="preconnect" href="https://fonts.googleapis.com">',
    '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>',
    '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Jost:wght@400;500;600;700&display=swap">',
    '<link rel="stylesheet" href="/css/theme.css?v=' + ASSET_V + '">',
    '<link rel="stylesheet" href="/css/styles.css?v=' + ASSET_V + '">'
  ].concat((o.jsonld || []).map(function (j) {
    return '<script type="application/ld+json">' + jsonScript(j) + '</script>';
  })).join('\n');

  const scripts = ['/js/app.js'].concat(o.scripts || []).map(function (src) {
    return '<script src="' + src + '?v=' + ASSET_V + '" defer></script>';
  }).join('\n');

  return '<!doctype html>\n<html lang="es-AR">\n<head>\n' + head + '\n</head>\n<body class="' + esc(o.bodyClass || '') + '">\n' +
    '<a class="skip" href="#contenido">Saltar al contenido</a>\n' +
    announce +
    '<header class="site-header"><div class="wrap bar">' +
      '<a class="brand" href="/">' + esc(s.store_name) + '</a>' +
      '<button class="nav-toggle" type="button" aria-expanded="false" aria-controls="nav">Menú</button>' +
      '<nav id="nav" class="nav" aria-label="Principal">' +
        '<a href="/tienda">Tienda</a>' +
        '<a href="/envios-y-cambios">Envíos y cambios</a>' +
        '<a href="/contacto">Contacto</a>' +
      '</nav>' +
      '<a class="cart-link" href="/carrito" aria-label="Ver carrito">Carrito <span class="cart-count" data-cart-count>0</span></a>' +
    '</div></header>\n' +
    '<main id="contenido">\n' + o.body + '\n</main>\n' +
    '<footer class="site-footer"><div class="wrap foot-grid">' +
      '<div><p class="foot-title">' + esc(s.store_name) + '</p><p>' + esc(s.tagline) + '</p>' +
        (social.length ? '<p class="foot-links">' + social.join(' · ') + '</p>' : '') + '</div>' +
      '<div><p class="foot-title">Local</p>' +
        (hasAddress(s) ? '<p>' + esc(s.address) + '<br>' + esc(s.city) + ', ' + esc(s.province) + '</p>' : '<p>' + esc(s.city) + ', ' + esc(s.province) + '</p>') +
        '<p>' + lines(s.hours).map(esc).join('<br>') + '</p></div>' +
      '<div><p class="foot-title">Ayuda</p><p class="foot-links">' +
        '<a href="/envios-y-cambios">Envíos, pagos y cambios</a><br>' +
        '<a href="/envios-y-cambios#arrepentimiento">Botón de arrepentimiento</a><br>' +
        '<a href="https://www.argentina.gob.ar/produccion/defensadelconsumidor/formulario" target="_blank" rel="noopener">Defensa del Consumidor</a><br>' +
        '<a href="/contacto">Contacto</a></p></div>' +
    '</div>' +
    '<div class="wrap foot-legal"><p>&copy; ' + new Date().getFullYear() + ' ' + esc(s.store_name) + (legal.length ? ' · ' + legal.join(' · ') : '') + '</p></div></footer>\n' +
    '<script type="application/json" id="cfg">' + jsonScript(clientConfig(s)) + '</script>\n' +
    scripts + '\n</body>\n</html>';
}

// ------------------------------------------------------------------ datos
async function listProducts(opt) {
  const where = ['p.active = 1'];
  const params = [];
  if (opt.categoryId) { where.push('p.category_id = ?'); params.push(opt.categoryId); }
  if (opt.exclude) { where.push('p.id <> ?'); params.push(opt.exclude); }
  if (opt.featured) where.push('p.featured = 1');
  const limit = opt.limit ? ' LIMIT ' + Number(opt.limit) : '';
  const rows = await query(
    'SELECT p.id, p.name, p.slug, p.price, p.compare_price, p.featured, c.name AS category, c.slug AS category_slug, ' +
    '(SELECT pi.thumb_path FROM product_images pi WHERE pi.product_id = p.id ORDER BY pi.sort_order, pi.id LIMIT 1) AS thumb, ' +
    '(SELECT pi.alt FROM product_images pi WHERE pi.product_id = p.id ORDER BY pi.sort_order, pi.id LIMIT 1) AS alt ' +
    'FROM products p JOIN categories c ON c.id = p.category_id WHERE ' + where.join(' AND ') +
    ' ORDER BY p.featured DESC, p.created_at DESC, p.id DESC' + limit,
    params
  );
  if (!rows.length) return rows;
  const ids = rows.map(function (r) { return r.id; });
  const colors = await query('SELECT product_id, name, hex FROM product_colors WHERE product_id IN (?) ORDER BY id', [ids]);
  const sizes = await query(
    'SELECT product_id, size, SUM(stock) AS stock, MIN(id) AS first_id FROM product_variants WHERE product_id IN (?) GROUP BY product_id, size ORDER BY first_id',
    [ids]
  );
  rows.forEach(function (r) {
    r.colors = colors.filter(function (c) { return c.product_id === r.id; });
    r.sizes = sizes.filter(function (x) { return x.product_id === r.id; }).map(function (x) {
      return { size: x.size, available: !features.stock || Number(x.stock) > 0 };
    });
    r.available = r.sizes.some(function (x) { return x.available; });
  });
  return rows;
}

function card(p) {
  const img = p.thumb || '/img/placeholder.svg';
  const alt = p.alt || (p.name + ' - ' + p.category);
  const url = '/producto/' + esc(p.slug);
  const off = p.compare_price && p.compare_price > p.price
    ? '<span class="badge badge-off">-' + Math.round((1 - p.price / p.compare_price) * 100) + '%</span>' : '';
  const sold = p.available ? '' : '<span class="badge">Agotado</span>';
  const sizesAvail = p.sizes.filter(function (x) { return x.available; }).map(function (x) { return x.size; }).join(',');
  return '<article class="card" data-price="' + p.price + '" data-name="' + esc(p.name.toLowerCase()) + '" data-sizes="' + esc(sizesAvail) +
    '" data-colors="' + esc(p.colors.map(function (c) { return c.name; }).join(',')) + '" data-order="' + p.id + '">' +
    '<a class="card-img" href="' + url + '"><img src="' + esc(img) + '" alt="' + esc(alt) + '" width="480" height="640" loading="lazy" decoding="async">' + off + sold + '</a>' +
    '<div class="card-body"><h3 class="card-title"><a href="' + url + '">' + esc(p.name) + '</a></h3>' +
    '<p class="price">' + money(p.price) + (p.compare_price && p.compare_price > p.price ? ' <s class="price-old">' + money(p.compare_price) + '</s>' : '') + '</p></div></article>';
}

function paragraphs(text) {
  return lines(text).map(function (l) { return '<p>' + esc(l) + '</p>'; }).join('');
}

// ------------------------------------------------------------------ inicio
router.get('/', wrap(async function (req, res) {
  const s = await getSettings();
  const cats = await query(
    'SELECT c.name, c.slug, COUNT(p.id) AS n FROM categories c LEFT JOIN products p ON p.category_id = c.id AND p.active = 1 ' +
    'GROUP BY c.id, c.name, c.slug, c.sort_order HAVING n > 0 ORDER BY c.sort_order, c.name'
  );
  let products = await listProducts({ featured: true, limit: 8 });
  if (products.length < 4) products = await listProducts({ limit: 8 });

  const steps = features.orders
    ? [['Elegí tu prenda', 'Mirá el catálogo, filtrá por talle y color y fijate el stock al instante.'],
       ['Pagá como prefieras', 'Transferencia, tarjeta con Mercado Pago o efectivo al retirar.'],
       ['Retirá o recibila', 'Pasá por el local o te la enviamos a tu casa.']]
    : [['Elegí tu prenda', 'Mirá el catálogo y elegí talle y color.'],
       ['Armá tu pedido', 'Sumá todo al carrito y revisalo antes de enviar.'],
       ['Enviá el pedido por WhatsApp', 'Te llega armado al local y coordinamos el pago y la entrega.']];

  const body =
    '<section class="hero"><div class="wrap hero-inner">' +
      '<p class="eyebrow">' + esc(s.store_name) + '</p>' +
      '<h1>' + esc(s.tagline) + '</h1>' +
      '<p class="lead">' + esc(s.description) + '</p>' +
      '<p class="hero-actions"><a class="btn btn-primary" href="/tienda">Ver la tienda</a> ' +
      '<a class="btn btn-ghost" href="' + esc(waHref(s,'Hola! Quiero hacer una consulta.')) + '" target="_blank" rel="noopener">Escribinos por WhatsApp</a></p>' +
    '</div></section>' +
    (cats.length ? '<section class="section"><div class="wrap"><h2>Categorías</h2><ul class="cat-grid">' +
      cats.map(function (c) { return '<li><a class="cat-tile" href="/tienda/' + esc(c.slug) + '"><span>' + esc(c.name) + '</span><small>' + c.n + ' prenda' + (c.n === 1 ? '' : 's') + '</small></a></li>'; }).join('') +
      '</ul></div></section>' : '') +
    '<section class="section"><div class="wrap"><div class="section-head"><h2>Novedades y destacados</h2><a href="/tienda">Ver todo</a></div>' +
      (products.length ? '<div class="grid">' + products.map(card).join('') + '</div>' : '<p class="muted">Muy pronto vas a ver acá las prendas del local.</p>') +
    '</div></section>' +
    '<section class="section section-soft"><div class="wrap"><h2>Cómo comprar</h2><ol class="steps">' +
      steps.map(function (st) { return '<li><strong>' + esc(st[0]) + '</strong><span>' + esc(st[1]) + '</span></li>'; }).join('') +
    '</ol></div></section>' +
    '<section class="section"><div class="wrap info-grid">' +
      '<div class="prose"><h2>Ropa en ' + esc(s.city) + ', ' + esc(s.province) + '</h2>' +
        '<p>En ' + esc(s.store_name) + ' vas a encontrar ropa y accesorios para el día a día y para las ocasiones especiales, con atención personalizada en nuestro local de ' + esc(s.city) + '.</p>' +
        '<p>Podés mirar todo el catálogo desde tu casa, elegir tu talle y tu color, y retirar tu compra en el local' + (features.shipping ? ' o recibirla en cualquier punto del país' : '') + '.</p></div>' +
      '<div class="prose"><h2>Visitanos</h2>' +
        (hasAddress(s) ? '<p>' + esc(s.address) + ', ' + esc(s.city) + '</p>' : '<p>' + esc(s.city) + ', ' + esc(s.province) + '</p>') +
        '<p>' + lines(s.hours).map(esc).join('<br>') + '</p>' +
        '<p><a class="btn btn-ghost" href="' + esc(mapsUrl(s)) + '" target="_blank" rel="noopener">Cómo llegar</a></p></div>' +
    '</div></section>';

  res.send(layout(s, {
    title: s.store_name + ' | ' + s.tagline,
    description: s.description,
    path: '/',
    body: body,
    jsonld: [
      storeLd(s),
      { '@context': 'https://schema.org', '@type': 'WebSite', url: cfg.siteUrl + '/', name: s.store_name, inLanguage: 'es-AR' }
    ]
  }));
}));

// ------------------------------------------------------------------ catálogo
router.get('/tienda/:cat?', wrap(async function (req, res, next) {
  const s = await getSettings();
  let category = null;
  if (req.params.cat) {
    category = await one('SELECT id, name, slug FROM categories WHERE slug = ?', [req.params.cat]);
    if (!category) return next();
  }
  const cats = await query(
    'SELECT c.name, c.slug FROM categories c WHERE EXISTS (SELECT 1 FROM products p WHERE p.category_id = c.id AND p.active = 1) ORDER BY c.sort_order, c.name'
  );
  const products = await listProducts({ categoryId: category ? category.id : null });

  const h1 = category ? category.name + ' en ' + s.city : 'Ropa en ' + s.city;
  const intro = category
    ? 'Mirá todas las prendas de ' + category.name.toLowerCase() + ' de ' + s.store_name + '. Elegí tu talle y tu color y retirá en el local' + (features.shipping ? ' o pedí tu envío.' : '.')
    : 'Todo el catálogo de ' + s.store_name + ' en ' + s.city + ', ' + s.province + '. Filtrá por talle, color y precio, y comprá online.';
  const pagePath = category ? '/tienda/' + category.slug : '/tienda';

  const allSizes = [];
  products.forEach(function (p) { p.sizes.forEach(function (x) { if (allSizes.indexOf(x.size) === -1) allSizes.push(x.size); }); });

  const body =
    '<div class="wrap"><nav class="breadcrumb" aria-label="Ruta"><a href="/">Inicio</a> / ' +
      (category ? '<a href="/tienda">Tienda</a> / <span>' + esc(category.name) + '</span>' : '<span>Tienda</span>') + '</nav>' +
    '<h1>' + esc(h1) + '</h1><p class="lead">' + esc(intro) + '</p>' +
    '<ul class="pills"><li><a href="/tienda"' + (!category ? ' aria-current="page"' : '') + '>Todo</a></li>' +
      cats.map(function (c) { return '<li><a href="/tienda/' + esc(c.slug) + '"' + (category && category.slug === c.slug ? ' aria-current="page"' : '') + '>' + esc(c.name) + '</a></li>'; }).join('') + '</ul>' +
    (products.length ? '<div class="filters" id="filters" hidden>' +
      '<label class="field"><span>Buscar</span><input id="f-q" type="search" placeholder="Ej.: jean"></label>' +
      '<label class="field"><span>Talle</span><select id="f-size"><option value="">Todos</option>' + allSizes.map(function (z) { return '<option>' + esc(z) + '</option>'; }).join('') + '</select></label>' +
      '<label class="field"><span>Ordenar</span><select id="f-sort"><option value="new">Novedades</option><option value="asc">Menor precio</option><option value="desc">Mayor precio</option></select></label>' +
    '</div>' : '') +
    (products.length ? '<div class="grid" id="grid">' + products.map(card).join('') + '</div>' +
      '<p class="muted" id="no-results" hidden>No hay prendas con esos filtros.</p>'
      : '<p class="muted">Todavía no hay prendas en esta sección.</p>') +
    '</div>';

  const ld = [breadcrumbLd([['Inicio', '/'], ['Tienda', '/tienda']].concat(category ? [[category.name, pagePath]] : []))];
  if (products.length) {
    ld.push({
      '@context': 'https://schema.org', '@type': 'ItemList', name: h1,
      itemListElement: products.slice(0, 30).map(function (p, i) {
        return { '@type': 'ListItem', position: i + 1, url: abs('/producto/' + p.slug), name: p.name };
      })
    });
  }

  res.send(layout(s, {
    title: h1 + ' | ' + s.store_name,
    description: category
      ? 'Comprá ' + category.name.toLowerCase() + ' online en ' + s.store_name + ', ' + s.city + '. Elegí talle y color, retirá en el local o recibilo en tu casa.'
      : 'Catálogo de ropa de ' + s.store_name + ' en ' + s.city + ', ' + s.province + '. Elegí talle y color y comprá online o retirá en el local.',
    path: pagePath,
    image: products[0] && products[0].thumb,
    body: body,
    scripts: ['/js/tienda.js'],
    jsonld: ld
  }));
}));

// ------------------------------------------------------------------ producto
router.get('/producto/:slug', wrap(async function (req, res, next) {
  const s = await getSettings();
  const p = await one(
    'SELECT p.*, c.name AS category, c.slug AS category_slug FROM products p JOIN categories c ON c.id = p.category_id WHERE p.slug = ? AND p.active = 1',
    [req.params.slug]
  );
  if (!p) return next();

  const colors = await query('SELECT id, name, hex FROM product_colors WHERE product_id = ? ORDER BY id', [p.id]);
  const variants = await query('SELECT id, color_id, size, stock FROM product_variants WHERE product_id = ? ORDER BY id', [p.id]);
  const images = await query('SELECT id, color_id, path, thumb_path, alt FROM product_images WHERE product_id = ? ORDER BY sort_order, id', [p.id]);
  const related = await listProducts({ categoryId: p.category_id, exclude: p.id, limit: 4 });

  const sizes = [];
  variants.forEach(function (v) { if (sizes.indexOf(v.size) === -1) sizes.push(v.size); });
  const anyAvailable = variants.some(function (v) { return !features.stock || v.stock > 0; });
  const url = '/producto/' + p.slug;
  const mainImg = images[0] ? images[0].path : '/img/placeholder.svg';
  const mainAlt = images[0] && images[0].alt ? images[0].alt : p.name;
  const off = p.compare_price && p.compare_price > p.price ? Math.round((1 - p.price / p.compare_price) * 100) : 0;

  const data = {
    id: p.id, name: p.name, slug: p.slug, price: p.price, image: images[0] ? images[0].thumb_path : '/img/placeholder.svg',
    colors: colors, sizes: sizes,
    variants: variants.map(function (v) {
      return { id: v.id, colorId: v.color_id, size: v.size, stock: features.stock ? v.stock : null, available: !features.stock || v.stock > 0 };
    })
  };

  const body =
    '<div class="wrap"><nav class="breadcrumb" aria-label="Ruta"><a href="/">Inicio</a> / <a href="/tienda">Tienda</a> / ' +
      '<a href="/tienda/' + esc(p.category_slug) + '">' + esc(p.category) + '</a> / <span>' + esc(p.name) + '</span></nav>' +
    '<div class="pdp">' +
      '<div class="pdp-gallery"><div class="pdp-main"><img id="main-img" src="' + esc(mainImg) + '" alt="' + esc(mainAlt) + '" width="1200" height="1600" fetchpriority="high"></div>' +
        (images.length > 1 ? '<ul class="thumbs">' + images.map(function (im, i) {
          return '<li><button type="button" class="thumb" data-src="' + esc(im.path) + '" data-alt="' + esc(im.alt || p.name) + '" data-color="' + (im.color_id || '') + '"' + (i === 0 ? ' aria-current="true"' : '') + '>' +
            '<img src="' + esc(im.thumb_path) + '" alt="" width="96" height="128" loading="lazy"></button></li>';
        }).join('') + '</ul>' : '') +
      '</div>' +
      '<div class="pdp-info"><h1>' + esc(p.name) + '</h1>' +
        '<p class="price price-lg">' + money(p.price) + (off ? ' <s class="price-old">' + money(p.compare_price) + '</s> <span class="badge badge-off">-' + off + '%</span>' : '') + '</p>' +
        (p.description ? '<div class="prose">' + paragraphs(p.description) + '</div>' : '') +
        (p.composition ? '<p class="specs"><strong>Composición:</strong> ' + esc(p.composition) + '</p>' : '') +
        '<fieldset class="opt"><legend>Color: <span id="color-name">' + esc(colors[0] ? colors[0].name : '') + '</span></legend><div class="swatches">' +
          colors.map(function (c) { return '<button type="button" class="swatch" data-color="' + c.id + '" data-name="' + esc(c.name) + '" data-hex="' + esc(c.hex) + '" aria-label="' + esc(c.name) + '" title="' + esc(c.name) + '"></button>'; }).join('') +
        '</div></fieldset>' +
        '<fieldset class="opt"><legend>Talle</legend><div class="sizes">' +
          sizes.map(function (z) { return '<button type="button" class="size-btn" data-size="' + esc(z) + '">' + esc(z) + '</button>'; }).join('') +
        '</div></fieldset>' +
        '<p id="stock-note" class="stock-note" aria-live="polite"></p>' +
        '<div class="pdp-actions"><button id="add-btn" class="btn btn-primary" type="button" disabled>Elegí color y talle</button>' +
          '<a id="wa-inquiry" class="btn btn-ghost" href="' + esc(waHref(s,'Hola! Quiero consultar por ' + p.name + ': ' + abs(url))) + '" target="_blank" rel="noopener">Consultar por WhatsApp</a></div>' +
        '<script type="application/json" id="variants">' + jsonScript(data) + '</script>' +
      '</div>' +
    '</div>' +
    (related.length ? '<section class="section"><h2>Más de ' + esc(p.category.toLowerCase()) + '</h2><div class="grid">' + related.map(card).join('') + '</div></section>' : '') +
    '</div>';

  const offer = {
    '@type': 'Offer', url: abs(url), priceCurrency: 'ARS', price: p.price,
    availability: anyAvailable ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
    itemCondition: 'https://schema.org/NewCondition',
    seller: { '@type': 'Organization', name: s.store_name }
  };
  const productLd = {
    '@context': 'https://schema.org', '@type': 'Product', name: p.name, sku: 'ET-' + p.id,
    description: truncate(p.description || (p.name + ' en ' + s.store_name), 300),
    category: p.category, brand: { '@type': 'Brand', name: s.store_name }, offers: offer
  };
  if (images.length) productLd.image = images.map(function (im) { return abs(im.path); });
  if (p.composition) productLd.material = p.composition;

  res.send(layout(s, {
    title: truncate(p.name + ' | ' + p.category + ' en ' + s.city + ' - ' + s.store_name, 70),
    description: truncate((p.description ? p.description + ' ' : '') + 'Comprala online en ' + s.store_name + ', ' + s.city + '.', 160),
    path: url,
    image: images[0] && images[0].path,
    ogType: 'product',
    body: body,
    scripts: ['/js/producto.js'],
    jsonld: [productLd, breadcrumbLd([['Inicio', '/'], ['Tienda', '/tienda'], [p.category, '/tienda/' + p.category_slug], [p.name, url]])]
  }));
}));

// ------------------------------------------------------------------ carrito, compra y pedido (no se indexan)
router.get('/carrito', wrap(async function (req, res) {
  const s = await getSettings();
  res.send(layout(s, {
    title: 'Tu carrito | ' + s.store_name, path: '/carrito', robots: 'noindex,nofollow', scripts: ['/js/carrito.js'],
    body: '<div class="wrap section"><h1>Tu carrito</h1><div id="cart-root"><p class="muted">Cargando tu carrito…</p></div>' +
      '<noscript><p>Necesitás activar JavaScript para usar el carrito.</p></noscript></div>'
  }));
}));

router.get('/checkout', wrap(async function (req, res) {
  if (!features.orders) return res.redirect('/carrito');
  const s = await getSettings();
  res.send(layout(s, {
    title: 'Finalizar compra | ' + s.store_name, path: '/checkout', robots: 'noindex,nofollow', scripts: ['/js/checkout.js'],
    body: '<div class="wrap section"><h1>Finalizar compra</h1><div id="checkout-root"><p class="muted">Cargando…</p></div></div>'
  }));
}));

router.get('/pedido/:code', wrap(async function (req, res) {
  if (!features.orders) return res.redirect('/');
  const s = await getSettings();
  res.send(layout(s, {
    title: 'Tu pedido | ' + s.store_name, path: '/pedido/' + req.params.code, robots: 'noindex,nofollow', scripts: ['/js/pedido.js'],
    body: '<div class="wrap section"><h1>Tu pedido</h1><div id="order-root" data-code="' + esc(req.params.code) + '"><p class="muted">Buscando tu pedido…</p></div></div>'
  }));
}));

// ------------------------------------------------------------------ envíos, pagos y cambios
router.get('/envios-y-cambios', wrap(async function (req, res) {
  const s = await getSettings();
  let shippingHtml;
  if (features.shipping) {
    const rates = await query('SELECT province, cost, days_min, days_max FROM shipping_rates WHERE active = 1 ORDER BY province');
    const free = parseInt(s.free_shipping_from, 10) || 0;
    shippingHtml = '<p>Hacemos envíos a todo el país. El costo depende de la provincia' + (free > 0 ? ' y es <strong>gratis en compras desde ' + money(free) + '</strong>' : '') + '.</p>' +
      '<div class="table-wrap"><table class="table"><thead><tr><th>Provincia</th><th>Costo</th><th>Demora estimada</th></tr></thead><tbody>' +
      rates.map(function (r) { return '<tr><td>' + esc(r.province) + '</td><td>' + money(r.cost) + '</td><td>' + r.days_min + ' a ' + r.days_max + ' días hábiles</td></tr>'; }).join('') +
      '</tbody></table></div>';
  } else {
    shippingHtml = '<p>Si no podés pasar por el local, escribinos por WhatsApp y coordinamos el envío de tu compra.</p>';
  }

  const pays = features.orders
    ? ['<li><strong>Transferencia bancaria:</strong> te pasamos los datos al confirmar el pedido.</li>']
    : ['<li><strong>Por WhatsApp:</strong> armás tu pedido en la tienda, nos lo enviás por WhatsApp y coordinamos ahí el pago (transferencia o efectivo).</li>'];
  if (payments.enabled()) pays.push('<li><strong>Tarjeta de crédito o débito y Mercado Pago:</strong> pagás de forma segura desde la página de Mercado Pago.</li>');
  pays.push('<li><strong>Efectivo:</strong> al retirar tu compra en el local.</li>');

  const body =
    '<div class="wrap prose-page"><h1>Envíos, pagos y cambios</h1>' +
    '<section><h2>Retiro en el local</h2><p>Retirá tu compra sin costo en ' + (hasAddress(s) ? esc(s.address) + ', ' : '') + esc(s.city) + '.</p><p>' + lines(s.hours).map(esc).join('<br>') + '</p></section>' +
    '<section><h2>Envíos</h2>' + shippingHtml + '</section>' +
    '<section><h2>Formas de pago</h2><ul>' + pays.join('') + '</ul></section>' +
    '<section><h2>Cambios y devoluciones</h2>' +
      '<p>Si la prenda no te queda bien, podés cambiarla dentro de los 30 días de la compra, con la etiqueta puesta y sin uso. Traé tu comprobante o el código de tu pedido.</p>' +
      '<p>Si la prenda llegó con una falla de fabricación, la cambiamos sin costo.</p></section>' +
    '<section id="arrepentimiento"><h2>Botón de arrepentimiento</h2>' +
      '<p>Si compraste online, tenés 10 días corridos desde que recibiste tu compra para arrepentirte y pedir la devolución, según la Ley de Defensa del Consumidor. Completá el formulario y te respondemos a la brevedad.</p>' +
      '<form class="form" data-form="regret" novalidate>' +
        '<label class="field"><span>Nombre y apellido</span><input name="name" autocomplete="name" required></label>' +
        '<label class="field"><span>Código del pedido</span><input name="order_code" placeholder="Ej.: ETA1B2C3" required></label>' +
        '<label class="field"><span>Correo electrónico</span><input name="email" type="email" autocomplete="email"></label>' +
        '<label class="field"><span>Teléfono</span><input name="phone" type="tel" autocomplete="tel"></label>' +
        '<label class="field"><span>Comentario (opcional)</span><textarea name="message" rows="3"></textarea></label>' +
        '<input class="hp" name="website" tabindex="-1" autocomplete="off" aria-hidden="true">' +
        '<button class="btn btn-primary" type="submit">Pedir arrepentimiento</button><p class="form-msg" role="status"></p>' +
      '</form></section></div>';

  res.send(layout(s, {
    title: 'Envíos, formas de pago y cambios | ' + s.store_name,
    description: 'Cómo retirar o recibir tu compra en ' + s.store_name + ', formas de pago, cambios y devoluciones.',
    path: '/envios-y-cambios', body: body, scripts: ['/js/forms.js'],
    jsonld: [breadcrumbLd([['Inicio', '/'], ['Envíos y cambios', '/envios-y-cambios']])]
  }));
}));

// ------------------------------------------------------------------ contacto
router.get('/contacto', wrap(async function (req, res) {
  const s = await getSettings();
  const body =
    '<div class="wrap prose-page"><h1>Contacto</h1>' +
    '<div class="info-grid"><div class="prose"><h2>' + esc(s.store_name) + '</h2>' +
      (hasAddress(s) ? '<p>' + esc(s.address) + '<br>' + esc(s.city) + ', ' + esc(s.province) + '</p>' : '<p>' + esc(s.city) + ', ' + esc(s.province) + '</p>') +
      '<p>' + lines(s.hours).map(esc).join('<br>') + '</p>' +
      (s.phone_display ? '<p>Teléfono: ' + esc(s.phone_display) + '</p>' : '') +
      (s.email ? '<p>Correo: ' + esc(s.email) + '</p>' : '') +
      '<p class="hero-actions"><a class="btn btn-primary" href="' + esc(waHref(s,'Hola! Quiero hacer una consulta.')) + '" target="_blank" rel="noopener">Escribinos por WhatsApp</a> ' +
      '<a class="btn btn-ghost" href="' + esc(mapsUrl(s)) + '" target="_blank" rel="noopener">Cómo llegar</a></p>' +
      (s.instagram_url ? '<p><a href="' + esc(s.instagram_url) + '" target="_blank" rel="noopener me">Seguinos en Instagram</a></p>' : '') +
    '</div>' +
    '<form class="form" data-form="contact" novalidate><h2>Dejanos tu consulta</h2>' +
      '<label class="field"><span>Nombre</span><input name="name" autocomplete="name" required></label>' +
      '<label class="field"><span>Correo electrónico</span><input name="email" type="email" autocomplete="email"></label>' +
      '<label class="field"><span>Teléfono</span><input name="phone" type="tel" autocomplete="tel"></label>' +
      '<label class="field"><span>Consulta</span><textarea name="message" rows="4" required></textarea></label>' +
      '<input class="hp" name="website" tabindex="-1" autocomplete="off" aria-hidden="true">' +
      '<button class="btn btn-primary" type="submit">Enviar consulta</button><p class="form-msg" role="status"></p></form>' +
    '</div></div>';

  res.send(layout(s, {
    title: 'Contacto y cómo llegar | ' + s.store_name + ', ' + s.city,
    description: 'Dirección, horarios y contacto de ' + s.store_name + ' en ' + s.city + ', ' + s.province + '. Escribinos por WhatsApp.',
    path: '/contacto', body: body, scripts: ['/js/forms.js'],
    jsonld: [storeLd(s), breadcrumbLd([['Inicio', '/'], ['Contacto', '/contacto']])]
  }));
}));

// ------------------------------------------------------------------ robots y sitemap
router.get('/robots.txt', function (req, res) {
  res.type('text/plain').send(
    // Carrito, checkout y pedido llevan "noindex": no se bloquean acá porque Google tiene que poder leer ese "noindex".
    'User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /api/\n\n' +
    'Sitemap: ' + cfg.siteUrl + '/sitemap.xml\n'
  );
});

router.get('/sitemap.xml', wrap(async function (req, res) {
  const products = await query(
    'SELECT p.slug, p.name, p.updated_at, ' +
    '(SELECT pi.path FROM product_images pi WHERE pi.product_id = p.id ORDER BY pi.sort_order, pi.id LIMIT 1) AS image ' +
    'FROM products p WHERE p.active = 1 ORDER BY p.id'
  );
  const cats = await query(
    'SELECT c.slug FROM categories c WHERE EXISTS (SELECT 1 FROM products p WHERE p.category_id = c.id AND p.active = 1) ORDER BY c.sort_order'
  );
  const url = function (loc, extra, lastmod) {
    return '<url><loc>' + esc(abs(loc)) + '</loc>' + (lastmod ? '<lastmod>' + String(lastmod).slice(0, 10) + '</lastmod>' : '') + (extra || '') + '</url>';
  };
  const out = [url('/'), url('/tienda')]
    .concat(cats.map(function (c) { return url('/tienda/' + c.slug); }))
    .concat(products.map(function (p) {
      const img = p.image ? '<image:image><image:loc>' + esc(abs(p.image)) + '</image:loc><image:title>' + esc(p.name) + '</image:title></image:image>' : '';
      return url('/producto/' + p.slug, img, p.updated_at);
    }))
    .concat([url('/envios-y-cambios'), url('/contacto')]);
  res.type('application/xml').send(
    '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n' +
    out.join('\n') + '\n</urlset>\n'
  );
}));

router.get('/favicon.ico', function (req, res) { res.redirect(301, '/favicon.svg'); });

// ------------------------------------------------------------------ 404 y error
async function notFound(req, res) {
  let s;
  try { s = await getSettings(); } catch (e) { return res.status(404).type('html').send(errorPage(404)); }
  res.status(404).send(layout(s, {
    title: 'Página no encontrada | ' + s.store_name, path: req.path, robots: 'noindex,follow',
    body: '<div class="wrap section center"><h1>No encontramos esa página</h1><p class="lead">Puede que el link haya cambiado o que la prenda ya no esté disponible.</p>' +
      '<p class="hero-actions"><a class="btn btn-primary" href="/tienda">Ver la tienda</a> <a class="btn btn-ghost" href="/">Ir al inicio</a></p></div>'
  }));
}

// Página de error mínima: no usa la base de datos, así funciona aunque esta falle.
function errorPage(status) {
  const msg = status === 404 ? 'No encontramos esa página.' : 'Tuvimos un problema. Probá de nuevo en unos minutos.';
  return '<!doctype html><html lang="es-AR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<meta name="robots" content="noindex"><title>' + status + '</title>' +
    // Estilos en atributos (no en <style>): la política de seguridad del sitio no permite bloques <style> en la página.
    '</head><body style="font-family:system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;margin:0;padding:16px;text-align:center;color:#211A1E">' +
    '<div><h1>' + status + '</h1><p>' + msg + '</p><p><a style="color:#B03A6B" href="/">Volver al inicio</a></p></div></body></html>';
}

module.exports = { router: router, notFound: wrap(notFound), errorPage: errorPage };
