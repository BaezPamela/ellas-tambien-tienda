/* Ficha de producto: elegir color y talle, cambiar de foto y agregar al carrito. */
(function () {
  'use strict';
  var dataEl = document.getElementById('variants');
  if (!dataEl || !window.Shop) return;

  var P = JSON.parse(dataEl.textContent);
  var S = window.Shop;
  var stockOn = Boolean(S.cfg.features && S.cfg.features.stock);
  var state = { colorId: null, size: null };

  var swatches = Array.prototype.slice.call(document.querySelectorAll('.swatch'));
  var sizeBtns = Array.prototype.slice.call(document.querySelectorAll('.size-btn'));
  var thumbs = Array.prototype.slice.call(document.querySelectorAll('.thumb'));
  var addBtn = document.getElementById('add-btn');
  var note = document.getElementById('stock-note');
  var colorName = document.getElementById('color-name');
  var mainImg = document.getElementById('main-img');
  var waLink = document.getElementById('wa-inquiry');

  function variantFor(colorId, size) {
    return P.variants.filter(function (v) { return v.colorId === colorId && v.size === size; })[0] || null;
  }

  function colorHasStock(colorId) {
    return P.variants.some(function (v) { return v.colorId === colorId && v.available; });
  }

  function currentColor() {
    return P.colors.filter(function (c) { return c.id === state.colorId; })[0] || null;
  }

  function showPhotosFor(colorId) {
    var hasColorPhotos = thumbs.some(function (t) { return t.dataset.color === String(colorId); });
    var first = null;
    thumbs.forEach(function (t) {
      var visible = !hasColorPhotos || t.dataset.color === String(colorId) || t.dataset.color === '';
      t.parentNode.hidden = !visible;
      if (visible && !first) first = t;
    });
    if (first) selectThumb(first);
  }

  function selectThumb(t) {
    thumbs.forEach(function (x) { x.removeAttribute('aria-current'); });
    t.setAttribute('aria-current', 'true');
    mainImg.src = t.dataset.src;
    mainImg.alt = t.dataset.alt || P.name;
  }

  function render() {
    swatches.forEach(function (sw) {
      sw.setAttribute('aria-pressed', String(Number(sw.dataset.color) === state.colorId));
    });
    var color = currentColor();
    colorName.textContent = color ? color.name : '';

    sizeBtns.forEach(function (btn) {
      var v = variantFor(state.colorId, btn.dataset.size);
      var ok = Boolean(v && v.available);
      btn.hidden = !v; // este color no tiene ese talle
      btn.disabled = !ok;
      btn.setAttribute('aria-pressed', String(ok && state.size === btn.dataset.size));
    });
    var chosen = state.size ? variantFor(state.colorId, state.size) : null;
    if (!chosen || !chosen.available) { state.size = null; chosen = null; }

    var anyStock = P.variants.some(function (v) { return v.available; });
    if (!anyStock) {
      addBtn.disabled = true;
      addBtn.textContent = 'Agotado';
    } else if (!chosen) {
      addBtn.disabled = true;
      addBtn.textContent = 'Elegí un talle';
    } else {
      addBtn.disabled = false;
      addBtn.textContent = 'Agregar al carrito';
    }

    note.textContent = '';
    if (chosen && stockOn && chosen.stock !== null && chosen.stock <= 3) {
      note.textContent = chosen.stock === 1 ? '¡Queda 1 unidad!' : '¡Quedan ' + chosen.stock + ' unidades!';
    }

    var text = 'Hola! Quiero consultar por ' + P.name + (color ? ' (' + color.name + (state.size ? ', talle ' + state.size : '') + ')' : '') + ': ' + location.href.split('#')[0];
    waLink.href = S.wa(text);
  }

  function setColor(id) {
    state.colorId = id;
    showPhotosFor(id);
    render();
  }

  swatches.forEach(function (sw) {
    sw.addEventListener('click', function () { setColor(Number(sw.dataset.color)); });
  });
  sizeBtns.forEach(function (btn) {
    btn.addEventListener('click', function () {
      if (btn.disabled) return;
      state.size = btn.dataset.size;
      render();
    });
  });
  thumbs.forEach(function (t) {
    t.addEventListener('click', function () { selectThumb(t); });
  });

  addBtn.addEventListener('click', function () {
    var v = state.size ? variantFor(state.colorId, state.size) : null;
    var color = currentColor();
    if (!v || !v.available || !color) return;
    var imgEl = document.querySelector('.thumb[aria-current="true"] img');
    S.cart.add({
      variantId: v.id, productId: P.id, slug: P.slug, name: P.name, color: color.name, size: v.size,
      price: P.price, image: imgEl ? imgEl.getAttribute('src') : P.image, qty: 1
    });
    S.toast('Agregado al carrito');
  });

  var firstColor = P.colors.filter(function (c) { return colorHasStock(c.id); })[0] || P.colors[0];
  if (firstColor) setColor(firstColor.id);
})();
