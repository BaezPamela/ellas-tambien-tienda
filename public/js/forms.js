/* Formularios de contacto y botón de arrepentimiento. */
(function () {
  'use strict';
  if (!window.Shop) return;
  var S = window.Shop;

  document.querySelectorAll('form[data-form]').forEach(function (form) {
    var msg = form.querySelector('.form-msg');
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var btn = form.querySelector('button[type=submit]');
      var body = { type: form.dataset.form === 'regret' ? 'arrepentimiento' : 'consulta' };
      Array.prototype.forEach.call(form.elements, function (el) { if (el.name) body[el.name] = el.value; });
      msg.className = 'form-msg';
      msg.textContent = '';
      btn.disabled = true;
      S.api('/api/contact', { method: 'POST', body: body }).then(function () {
        msg.className = 'form-msg ok';
        msg.textContent = body.type === 'arrepentimiento'
          ? 'Recibimos tu solicitud. Te vamos a responder a la brevedad.'
          : '¡Gracias! Recibimos tu consulta y te vamos a responder pronto.';
        form.reset();
      }).catch(function (ex) {
        msg.className = 'form-msg err';
        msg.textContent = ex.message;
      }).then(function () { btn.disabled = false; });
    });
  });
})();
