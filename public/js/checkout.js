/* Finalizar compra (paquetes 2 y 3). */
(function () {
  'use strict';
  var root = document.getElementById('checkout-root');
  if (!root || !window.Shop) return;

  var S = window.Shop;
  var esc = S.esc;
  var features = S.cfg.features || {};
  var items = S.cart.items();

  if (!items.length) {
    root.innerHTML = '<p>Tu carrito está vacío.</p><p><a class="btn btn-primary" href="/tienda">Ver la tienda</a></p>';
    return;
  }

  var subtotal = items.reduce(function (a, i) { return a + i.price * i.qty; }, 0);
  var state = { method: 'retiro', province: '', shipping: 0, coordinate: false, busy: false };
  var rates = [];

  function payOptions() {
    var opts = [{ id: 'transferencia', label: 'Transferencia bancaria', hint: 'Te mostramos los datos al confirmar y nos enviás el comprobante.' }];
    if (S.cfg.mpEnabled) opts.push({ id: 'mercadopago', label: 'Tarjeta de crédito o débito, o Mercado Pago', hint: 'Pagás en la página segura de Mercado Pago. En cuotas si tu banco lo permite.' });
    if (state.method === 'retiro') opts.push({ id: 'efectivo', label: 'Efectivo al retirar', hint: 'Pagás cuando pasás por el local.' });
    return opts;
  }

  function shippingBlock() {
    if (state.method !== 'envio') return '';
    var provinceField = features.shipping
      ? '<label class="field"><span>Provincia</span><select name="province" id="co-province" required><option value="">Elegí tu provincia</option>' +
        rates.map(function (r) { return '<option value="' + esc(r.province) + '">' + esc(r.province) + '</option>'; }).join('') + '</select></label>'
      : '<label class="field"><span>Provincia</span><input name="province" autocomplete="address-level1" value="Santa Fe"></label>';
    return '<label class="field"><span>Dirección (calle y número)</span><input name="address" autocomplete="street-address" required></label>' +
      '<label class="field"><span>Ciudad</span><input name="city" autocomplete="address-level2" required></label>' +
      provinceField +
      '<label class="field"><span>Código postal</span><input name="postal_code" autocomplete="postal-code" inputmode="numeric"></label>';
  }

  function summaryHtml() {
    var shipLabel = state.method === 'retiro' ? 'Retiro en el local'
      : state.coordinate ? 'A coordinar con el local'
      : !state.province && features.shipping ? 'Elegí la provincia'
      : state.shipping === 0 ? 'Gratis' : S.fmt(state.shipping);
    var total = subtotal + (state.method === 'envio' ? state.shipping : 0);
    return '<h2>Tu pedido</h2>' +
      items.map(function (i) {
        return '<div class="line"><span>' + i.qty + ' × ' + esc(i.name) + '<br><small class="muted">' + esc(i.color) + ', talle ' + esc(i.size) + '</small></span><span>' + S.fmt(i.price * i.qty) + '</span></div>';
      }).join('') +
      '<div class="line"><span>Subtotal</span><span>' + S.fmt(subtotal) + '</span></div>' +
      '<div class="line"><span>Envío</span><span>' + shipLabel + '</span></div>' +
      '<div class="line total"><span>Total</span><span>' + S.fmt(total) + '</span></div>' +
      '<p class="err" id="co-error" role="alert"></p>' +
      '<button class="btn btn-primary btn-block" type="submit" id="co-submit">Confirmar pedido</button>' +
      '<p class="muted" style="margin-top:10px"><a href="/carrito">Volver al carrito</a></p>';
  }

  function render(keep) {
    var vals = keep || {};
    var methodCard = function (id, title, hint) {
      return '<label class="radio-card"><input type="radio" name="method" value="' + id + '"' + (state.method === id ? ' checked' : '') + '><span><strong>' + title + '</strong><small>' + hint + '</small></span></label>';
    };
    var opts = payOptions();
    var payChosen = opts.some(function (o) { return o.id === vals.payment_method; }) ? vals.payment_method : opts[0].id;

    root.innerHTML = '<form id="co-form" class="checkout-layout" novalidate><div>' +
      '<fieldset class="group"><legend>Tus datos</legend>' +
        '<label class="field"><span>Nombre y apellido</span><input name="name" autocomplete="name" required value="' + esc(vals.name || '') + '"></label>' +
        '<label class="field"><span>Teléfono / WhatsApp</span><input name="phone" type="tel" autocomplete="tel" inputmode="tel" required placeholder="Ej.: 3464 123456" value="' + esc(vals.phone || '') + '"></label>' +
        '<label class="field"><span>Correo electrónico (opcional)</span><input name="email" type="email" autocomplete="email" value="' + esc(vals.email || '') + '"></label>' +
      '</fieldset>' +
      '<fieldset class="group"><legend>Entrega</legend>' +
        methodCard('retiro', 'Retiro en el local', 'Sin costo. Te avisamos cuando esté listo.') +
        methodCard('envio', 'Envío a domicilio', features.shipping ? 'El costo depende de tu provincia.' : 'Lo coordinamos con vos por WhatsApp.') +
        shippingBlock() +
      '</fieldset>' +
      '<fieldset class="group"><legend>Forma de pago</legend>' +
        opts.map(function (o) {
          return '<label class="radio-card"><input type="radio" name="payment_method" value="' + o.id + '"' + (payChosen === o.id ? ' checked' : '') + '><span><strong>' + esc(o.label) + '</strong><small>' + esc(o.hint) + '</small></span></label>';
        }).join('') +
      '</fieldset>' +
      '<label class="field"><span>Aclaraciones (opcional)</span><textarea name="notes" rows="3"></textarea></label>' +
      (features.customers ? '<label class="check" style="margin-top:14px"><input type="checkbox" name="accepts_marketing"><span>Quiero recibir novedades del local por WhatsApp. Puedo pedir la baja cuando quiera.</span></label>' : '') +
      '</div><aside class="summary" id="co-summary">' + summaryHtml() + '</aside></form>';

    var provinceSel = document.getElementById('co-province');
    if (provinceSel && state.province) provinceSel.value = state.province;
  }

  function readForm() {
    var f = document.getElementById('co-form');
    var get = function (n) { var el = f.elements[n]; return el ? el.value : ''; };
    return {
      name: get('name'), phone: get('phone'), email: get('email'), payment_method: (f.querySelector('[name=payment_method]:checked') || {}).value,
      address: get('address'), city: get('city'), province: get('province') || state.province, postal_code: get('postal_code'), notes: get('notes'),
      accepts_marketing: Boolean(f.elements.accepts_marketing && f.elements.accepts_marketing.checked)
    };
  }

  function refreshShipping() {
    if (state.method !== 'envio' || !features.shipping || !state.province) {
      state.shipping = 0; state.coordinate = state.method === 'envio' && !features.shipping;
      document.getElementById('co-summary').innerHTML = summaryHtml();
      return Promise.resolve();
    }
    return S.api('/api/shipping/quote?method=envio&province=' + encodeURIComponent(state.province) + '&subtotal=' + subtotal)
      .then(function (q) { state.shipping = q.cost; state.coordinate = q.coordinate; })
      .catch(function () { state.shipping = 0; })
      .then(function () { document.getElementById('co-summary').innerHTML = summaryHtml(); });
  }

  root.addEventListener('change', function (e) {
    var t = e.target;
    if (t.name === 'method') {
      var keep = readForm();
      state.method = t.value;
      state.coordinate = state.method === 'envio' && !features.shipping;
      if (state.method === 'retiro') state.shipping = 0;
      render(keep);
      refreshShipping();
    } else if (t.id === 'co-province') {
      state.province = t.value;
      refreshShipping();
    }
  });

  root.addEventListener('submit', function (e) {
    e.preventDefault();
    if (state.busy) return;
    var data = readForm();
    var err = document.getElementById('co-error');
    var btn = document.getElementById('co-submit');
    err.textContent = '';
    state.busy = true;
    btn.disabled = true;
    btn.textContent = 'Procesando…';
    S.api('/api/orders', {
      method: 'POST',
      body: {
        items: items.map(function (i) { return { variantId: i.variantId, qty: i.qty }; }),
        customer: { name: data.name, phone: data.phone, email: data.email },
        delivery: { method: state.method, address: data.address, city: data.city, province: data.province, postal_code: data.postal_code },
        payment_method: data.payment_method,
        notes: data.notes,
        accepts_marketing: data.accepts_marketing
      }
    }).then(function (res) {
      S.cart.clear();
      location.href = res.redirect || ('/pedido/' + res.code);
    }).catch(function (ex) {
      err.textContent = ex.message + (ex.status === 409 ? ' Revisá tu carrito.' : '');
      state.busy = false;
      btn.disabled = false;
      btn.textContent = 'Confirmar pedido';
    });
  });

  var start = features.shipping
    ? S.api('/api/shipping/rates').then(function (d) { rates = d.rates || []; }).catch(function () { rates = []; })
    : Promise.resolve();
  start.then(function () { render(); });
})();
