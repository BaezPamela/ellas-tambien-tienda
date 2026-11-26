/* Código común a todas las páginas: configuración, carrito, avisos y menú. */
(function () {
  'use strict';

  var CFG = { features: {}, store: {} };
  try {
    var cfgEl = document.getElementById('cfg');
    if (cfgEl) CFG = JSON.parse(cfgEl.textContent);
  } catch (e) { /* se usa la configuración vacía */ }

  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function fmt(n) {
    return '$' + Number(n || 0).toLocaleString('es-AR');
  }

  // ---------------- Carrito (se guarda en el navegador; los precios se revalidan en el servidor)
  var KEY = 'et_cart_v1';
  var mem = [];

  function read() {
    try {
      var a = JSON.parse(localStorage.getItem(KEY) || '[]');
      return Array.isArray(a) ? a : [];
    } catch (e) {
      return mem;
    }
  }

  function write(items) {
    mem = items;
    try { localStorage.setItem(KEY, JSON.stringify(items)); } catch (e) { /* sin almacenamiento: queda en memoria */ }
    updateCount();
  }

  function updateCount() {
    var n = read().reduce(function (a, i) { return a + i.qty; }, 0);
    document.querySelectorAll('[data-cart-count]').forEach(function (el) { el.textContent = n; });
  }

  var cart = {
    items: read,
    set: write,
    count: function () { return read().reduce(function (a, i) { return a + i.qty; }, 0); },
    subtotal: function () { return read().reduce(function (a, i) { return a + i.price * i.qty; }, 0); },
    add: function (item) {
      var items = read();
      var found = items.filter(function (i) { return i.variantId === item.variantId; })[0];
      if (found) found.qty = Math.min(20, found.qty + (item.qty || 1));
      else items.push({
        variantId: item.variantId, productId: item.productId, slug: item.slug, name: item.name,
        color: item.color, size: item.size, price: item.price, image: item.image, qty: item.qty || 1
      });
      write(items);
    },
    setQty: function (variantId, qty) {
      var items = read();
      items.forEach(function (i) { if (i.variantId === variantId) i.qty = Math.max(1, Math.min(20, qty)); });
      write(items);
    },
    remove: function (variantId) {
      write(read().filter(function (i) { return i.variantId !== variantId; }));
    },
    clear: function () { write([]); }
  };

  // ---------------- Utilidades
  function api(url, opts) {
    opts = opts || {};
    var init = { method: opts.method || 'GET', headers: {}, credentials: 'same-origin' };
    if (opts.body !== undefined) {
      init.headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(opts.body);
    }
    return fetch(url, init).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (data) {
        if (!r.ok) {
          var err = new Error(data.error || 'Ocurrió un error. Probá de nuevo.');
          err.status = r.status;
          throw err;
        }
        return data;
      });
    });
  }

  function wa(text) {
    var phone = String(CFG.store.whatsapp || '').replace(/\D/g, '');
    if (!phone) return '/contacto'; // el local todavía no cargó su WhatsApp
    return 'https://wa.me/' + phone + (text ? '?text=' + encodeURIComponent(text) : '');
  }

  var toastTimer;
  function toast(message) {
    var el = document.getElementById('toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'toast';
      el.className = 'toast';
      el.setAttribute('role', 'status');
      document.body.appendChild(el);
    }
    el.textContent = message;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.hidden = true; }, 2200);
  }

  window.Shop = { cfg: CFG, esc: esc, fmt: fmt, cart: cart, api: api, wa: wa, toast: toast };

  // ---------------- Al cargar la página
  updateCount();

  document.querySelectorAll('[data-hex]').forEach(function (el) {
    el.style.setProperty('--sw', el.getAttribute('data-hex'));
  });

  var toggle = document.querySelector('.nav-toggle');
  var nav = document.getElementById('nav');
  if (toggle && nav) {
    toggle.addEventListener('click', function () {
      var open = nav.classList.toggle('open');
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
  }
})();
