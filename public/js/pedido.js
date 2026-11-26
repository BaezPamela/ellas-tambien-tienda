/* Seguimiento del pedido con su código. */
(function () {
  'use strict';
  var root = document.getElementById('order-root');
  if (!root || !window.Shop) return;

  var S = window.Shop;
  var esc = S.esc;
  var code = root.getAttribute('data-code');
  var store = S.cfg.store || {};
  var polls = 0;

  var LABEL = {
    pendiente: 'Pendiente de pago', pagado: 'Pago recibido', enviado: 'Enviado',
    entregado: 'Entregado', cancelado: 'Cancelado'
  };

  function pillClass(status) {
    return status === 'cancelado' ? 'pill bad' : status === 'pendiente' ? 'pill' : 'pill ok';
  }

  function instructions(o) {
    if (o.status === 'cancelado') {
      return '<div class="box"><h2>Pedido cancelado</h2><p>Este pedido se canceló y las prendas volvieron al stock. Si querés comprarlas, hacé un pedido nuevo desde la tienda.</p></div>';
    }
    if (o.status !== 'pendiente') {
      var next = o.delivery_method === 'retiro'
        ? 'Te vamos a avisar cuando puedas pasar a retirarlo por el local.'
        : 'Te vamos a avisar por WhatsApp cuando salga tu envío.';
      return '<div class="box"><h2>¡Gracias por tu compra!</h2><p>' + next + '</p></div>';
    }
    if (o.payment_method === 'transferencia') {
      var hasBank = store.bank_cbu || store.bank_alias;
      var msg = 'Hola! Hice el pedido ' + o.code + ' y te paso el comprobante de la transferencia.';
      var copy = function (label, value) {
        return '<span>' + label + ': <strong>' + esc(value) + '</strong> <button type="button" class="copy-btn" data-copy="' + esc(value) + '">Copiar</button></span>';
      };
      var receipt = o.receipt_at
        ? '<div class="receipt-ok"><strong>¡Recibimos tu comprobante!</strong> Lo estamos revisando. Cuando se acredite te avisamos y preparamos tu pedido.</div>' +
          '<details><summary>Subir otro comprobante</summary>' + receiptForm('Reemplazar comprobante') + '</details>'
        : '<p>Cuando hagas la transferencia, subí acá el comprobante (captura, foto o PDF):</p>' + receiptForm('Enviar comprobante');
      return '<div class="box"><h2>Pagá por transferencia</h2><p>Transferí <strong>' + S.fmt(o.total) + '</strong> a esta cuenta. Reservamos tus prendas por tiempo limitado.</p>' +
        (hasBank
          ? '<div class="bank">' +
            (store.bank_holder ? '<span>Titular: <strong>' + esc(store.bank_holder) + '</strong></span>' : '') +
            (store.bank_name ? '<span>Banco: <strong>' + esc(store.bank_name) + '</strong></span>' : '') +
            (store.bank_cbu ? copy('CBU/CVU', store.bank_cbu) : '') +
            (store.bank_alias ? copy('Alias', store.bank_alias) : '') + '</div>'
          : '<p class="muted">Pedinos los datos de la cuenta por WhatsApp y después subí el comprobante acá.</p>') +
        receipt +
        '<p class="muted">¿Problemas para subirlo? <a target="_blank" rel="noopener" href="' + esc(S.wa(msg)) + '">Enviá el comprobante por WhatsApp</a>.</p></div>';
    }
    if (o.payment_method === 'mercadopago') {
      return '<div class="box"><h2>Pagá con tarjeta o Mercado Pago</h2><p>Tu pago todavía no se acreditó. Si ya pagaste, esperá unos minutos: esta página se actualiza sola.</p>' +
        '<p><button class="btn btn-primary" type="button" id="pay-btn">Pagar ahora</button></p><p class="err" id="pay-err" role="alert"></p></div>';
    }
    return '<div class="box"><h2>Pagás al retirar</h2><p>Te esperamos en el local con tu código de pedido. Reservamos tus prendas por tiempo limitado.</p></div>';
  }

  function receiptForm(label) {
    return '<div class="receipt-form"><input type="file" class="rc-file" accept="image/*,application/pdf" aria-label="Comprobante">' +
      '<button type="button" class="btn btn-primary rc-btn">' + label + '</button><p class="err rc-err" role="alert"></p></div>';
  }

  function wireReceipt() {
    Array.prototype.forEach.call(root.querySelectorAll('.copy-btn'), function (b) {
      b.addEventListener('click', function () {
        var v = b.getAttribute('data-copy');
        var ok = function () { S.toast('Copiado'); };
        var fail = function () { S.toast('No se pudo copiar. Seleccionalo y copialo a mano.'); };
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(v).then(ok, fail); else fail();
      });
    });
    Array.prototype.forEach.call(root.querySelectorAll('.receipt-form'), function (form) {
      var btn = form.querySelector('.rc-btn');
      var err = form.querySelector('.rc-err');
      btn.addEventListener('click', function () {
        var f = form.querySelector('.rc-file').files[0];
        err.textContent = '';
        if (!f) { err.textContent = 'Elegí el comprobante primero.'; return; }
        if (f.size > 5 * 1024 * 1024) { err.textContent = 'El archivo pesa más de 5 MB.'; return; }
        var fd = new FormData();
        fd.append('receipt', f);
        btn.disabled = true;
        btn.textContent = 'Enviando…';
        fetch('/api/orders/' + encodeURIComponent(code) + '/receipt', { method: 'POST', body: fd, credentials: 'same-origin' })
          .then(function (r) {
            return r.json().catch(function () { return {}; }).then(function (d) {
              if (!r.ok) throw new Error(d.error || 'No se pudo enviar el comprobante. Probá de nuevo.');
            });
          })
          .then(function () { S.toast('Comprobante enviado'); return load(); })
          .catch(function (ex) { err.textContent = ex.message; btn.disabled = false; btn.textContent = 'Enviar comprobante'; });
      });
    });
  }

  function render(o) {
    root.innerHTML = '<p><span class="' + pillClass(o.status) + '">' + esc(LABEL[o.status] || o.status) + '</span></p>' +
      '<p>Código de pedido: <strong>' + esc(o.code) + '</strong>. Guardalo para cualquier consulta.</p>' +
      instructions(o) +
      '<div class="box"><h2>Detalle</h2>' +
      o.items.map(function (i) {
        return '<div class="line" style="display:flex;justify-content:space-between;gap:12px;padding:6px 0"><span>' + i.quantity + ' × ' + esc(i.product_name) + ' <small class="muted">(' + esc(i.color_name) + ', talle ' + esc(i.size) + ')</small></span><span>' + S.fmt(i.unit_price * i.quantity) + '</span></div>';
      }).join('') +
      '<div class="line" style="display:flex;justify-content:space-between;padding:6px 0"><span>Envío</span><span>' + (o.delivery_method === 'retiro' ? 'Retiro en el local' : o.shipping_cost ? S.fmt(o.shipping_cost) : 'Gratis o a coordinar') + '</span></div>' +
      '<div class="line" style="display:flex;justify-content:space-between;padding:10px 0;font-weight:700;font-size:1.15rem"><span>Total</span><span>' + S.fmt(o.total) + '</span></div></div>' +
      '<p><a href="/tienda">Seguir comprando</a></p>';

    wireReceipt();
    var payBtn = document.getElementById('pay-btn');
    if (payBtn) {
      payBtn.addEventListener('click', function () {
        payBtn.disabled = true;
        S.api('/api/orders/' + encodeURIComponent(code) + '/pay', { method: 'POST' })
          .then(function (r) { location.href = r.redirect; })
          .catch(function (ex) {
            document.getElementById('pay-err').textContent = ex.message;
            payBtn.disabled = false;
          });
      });
    }
  }

  function load() {
    return S.api('/api/orders/' + encodeURIComponent(code)).then(function (d) {
      render(d.order);
      // Mercado Pago avisa con unos segundos de demora: se vuelve a consultar un rato.
      if (d.order.payment_method === 'mercadopago' && d.order.status === 'pendiente' && polls < 30) {
        polls++;
        setTimeout(load, 8000);
      }
    }).catch(function (ex) {
      root.innerHTML = '<p class="err">' + esc(ex.message) + '</p><p><a href="/tienda">Volver a la tienda</a></p>';
    });
  }

  load();
})();
