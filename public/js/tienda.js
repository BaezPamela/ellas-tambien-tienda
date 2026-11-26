/* Filtros y orden del catálogo. Sin JavaScript el catálogo se ve igual: esto solo suma comodidad. */
(function () {
  'use strict';
  var grid = document.getElementById('grid');
  var filters = document.getElementById('filters');
  if (!grid || !filters) return;

  var q = document.getElementById('f-q');
  var size = document.getElementById('f-size');
  var sort = document.getElementById('f-sort');
  var empty = document.getElementById('no-results');
  var cards = Array.prototype.slice.call(grid.children);

  filters.hidden = false;

  function apply() {
    var term = q.value.trim().toLowerCase();
    var z = size.value;
    var shown = 0;
    cards.forEach(function (card) {
      var ok = true;
      if (term && card.dataset.name.indexOf(term) === -1) ok = false;
      if (z && (',' + card.dataset.sizes + ',').indexOf(',' + z + ',') === -1) ok = false;
      card.hidden = !ok;
      if (ok) shown++;
    });
    cards.slice().sort(function (a, b) {
      if (sort.value === 'asc') return a.dataset.price - b.dataset.price;
      if (sort.value === 'desc') return b.dataset.price - a.dataset.price;
      return b.dataset.order - a.dataset.order;
    }).forEach(function (card) { grid.appendChild(card); });
    if (empty) empty.hidden = shown > 0;
  }

  q.addEventListener('input', apply);
  size.addEventListener('change', apply);
  sort.addEventListener('change', apply);
})();
