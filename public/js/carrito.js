/* Página del carrito. */
(function () {
  'use strict';
  var root = document.getElementById('cart-root');
  if (!root || !window.Shop) return;

  var S = window.Shop;
  var cart = S.cart;
  var esc = S.esc;
  var features = S.cfg.features || {};
  var freeFrom = Number((S.cfg.store || {}).free_shipping_from) || 0;
  var info = {}; // datos vigentes de cada combinación, según el servidor

  // Pide al servidor los precios y el stock actuales, y corrige el carrito si cambiaron.
  function sync() {
    var items = cart.items();
    if (!items.length) return Promise.resolve();
    return S.api('/api/cart/validate', {
      method: 'POST',
      body: { items: items.map(function (i) { return { variantId: i.variantId }; }) }
    }).then(function (data) {
      info = {};
      (data.items || []).forEach(function (r) { info[r.variantId] = r; });
      var fixed = [];
      items.forEach(function (it) {
        var r = info[it.variantId];
        if (!r) return; // la prenda ya no existe
        it.price = r.price;
        it.name = r.name;
        it.color = r.color;
        it.size = r.size;
        if (r.image) it.image = r.image;
        if (r.available && it.qty > r.maxQty) it.qty = Math.max(1, r.maxQty);
        fixed.push(it);
      });
      cart.set(fixed);
    }).catch(function () { /* sin conexión: se muestra lo guardado */ });
  }

  function isAvailable(it) {
    var r = info[it.variantId];
    return r ? r.available : true;
  }

  function whatsappText(items, total) {
    var lines = items.map(function (i) {
      return '• ' + i.qty + ' × ' + i.name + ' (' + i.color + ', talle ' + i.size + ') — ' + S.fmt(i.price * i.qty);
    });
    return ['Hola! Quiero hacer este pedido:', ''].concat(lines, ['', 'Total: ' + S.fmt(total)]).join('\n');
  }

  function render() {
    var items = cart.items();
    if (!items.length) {
      root.innerHTML = '<p>Tu carrito está vacío.</p><p><a class="btn btn-primary" href="/tienda">Ver la tienda</a></p>';
      return;
    }
    var okItems = items.filter(isAvailable);
    var blocked = okItems.length !== items.length;
    var subtotal = okItems.reduce(function (a, i) { return a + i.price * i.qty; }, 0);

    var lines = items.map(function (it) {
      var ok = isAvailable(it);
      var max = info[it.variantId] ? info[it.variantId].maxQty : 20;
      return '<div class="cart-line">' +
        '<a href="/producto/' + esc(it.slug) + '"><img src="' + esc(it.image || '/img/placeholder.svg') + '" alt="' + esc(it.name) + '" width="84" height="112" loading="lazy"></a>' +
        '<div><h3><a href="/producto/' + esc(it.slug) + '">' + esc(it.name) + '</a></h3>' +
        '<p class="meta">' + esc(it.color) + ' · Talle ' + esc(it.size) + '</p>' +
        (ok
          ? '<div class="row"><div class="qty"><button type="button" data-act="dec" data-id="' + it.variantId + '" aria-label="Restar una">−</button><span>' + it.qty + '</span>' +
            '<button type="button" data-act="inc" data-id="' + it.variantId + '" data-max="' + max + '" aria-label="Sumar una">+</button></div>' +
            '<strong>' + S.fmt(it.price * it.qty) + '</strong></div>'
          : '<p class="warn-text">Esta prenda se agotó o ya no está disponible.</p>') +
        '<p><button type="button" class="link-btn" data-act="rm" data-id="' + it.variantId + '">Quitar</button></p></div></div>';
    }).join('');

    var freeNote = '';
    if (features.shipping && freeFrom > 0) {
      freeNote = subtotal >= freeFrom
        ? '<p class="free-note">¡Tu compra tiene envío gratis!</p>'
        : '<p class="free-note">Te faltan ' + S.fmt(freeFrom - subtotal) + ' para tener envío gratis.</p>';
    }

    var waBtn = '<a class="btn ' + (features.orders ? 'btn-ghost' : 'btn-primary') + ' btn-block" target="_blank" rel="noopener" href="' +
      esc(S.wa(whatsappText(okItems, subtotal))) + '"' + (okItems.length ? '' : ' aria-disabled="true"') + '>' +
      (features.orders ? 'Pedir por WhatsApp' : 'Enviar pedido por WhatsApp') + '</a>';

    var checkout = features.orders
      ? '<a class="btn btn-primary btn-block" href="/checkout"' + (blocked || !okItems.length ? ' aria-disabled="true"' : '') + '>Finalizar compra</a>'
      : '';

    root.innerHTML = '<div class="cart-layout"><div>' + lines + '</div>' +
      '<aside class="summary"><h2>Resumen</h2>' +
      '<div class="line"><span>Subtotal</span><strong>' + S.fmt(subtotal) + '</strong></div>' +
      '<p class="muted">' + (features.shipping ? 'El envío se calcula en el siguiente paso.' : 'La entrega se coordina con el local.') + '</p>' +
      freeNote +
      (blocked ? '<p class="warn-text">Quitá las prendas agotadas para continuar.</p>' : '') +
      checkout + waBtn + '</aside></div>';
  }

  root.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-act]');
    if (!btn) return;
    var id = Number(btn.dataset.id);
    var item = cart.items().filter(function (i) { return i.variantId === id; })[0];
    if (!item) return;
    if (btn.dataset.act === 'rm') cart.remove(id);
    if (btn.dataset.act === 'dec') { if (item.qty <= 1) cart.remove(id); else cart.setQty(id, item.qty - 1); }
    if (btn.dataset.act === 'inc') {
      var max = Number(btn.dataset.max) || 20;
      if (item.qty >= max) S.toast('No hay más unidades de ese talle');
      else cart.setQty(id, item.qty + 1);
    }
    render();
  });

  sync().then(render);
})();
