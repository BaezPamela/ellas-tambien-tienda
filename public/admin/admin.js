/* Panel de administración. Muestra solo las secciones que incluye el paquete contratado. */
(function () {
  'use strict';

  var app = document.getElementById('app');
  var state = { user: null, features: {}, pkg: 1 };

  // ------------------------------------------------------------ utilidades
  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function fmt(n) { return '$' + Number(n || 0).toLocaleString('es-AR'); }

  var toastTimer;
  function toast(message, bad) {
    var el = document.getElementById('toast');
    el.textContent = message;
    el.className = 'toast' + (bad ? ' bad' : '');
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.hidden = true; }, 2600);
  }

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
          if (r.status === 401 && url.indexOf('/api/auth/login') === -1) showLogin('La sesión venció. Ingresá de nuevo.');
          var err = new Error(data.error || 'Ocurrió un error. Probá de nuevo.');
          err.status = r.status;
          throw err;
        }
        return data;
      });
    });
  }

  function fail(err) { toast(err.message, true); }

  function statusPill(status) {
    var cls = status === 'cancelado' ? 'bad' : status === 'pendiente' ? '' : 'ok';
    return '<span class="pill ' + cls + '">' + esc(status) + '</span>';
  }

  // ------------------------------------------------------------ ingreso
  function showLogin(message) {
    app.innerHTML = '<form class="login" id="login-form"><h1>Panel del local</h1>' +
      (message ? '<p class="err">' + esc(message) + '</p>' : '') +
      '<label class="field"><span>Correo</span><input name="email" type="email" autocomplete="username" required></label>' +
      '<label class="field"><span>Contraseña</span><input name="password" type="password" autocomplete="current-password" required></label>' +
      '<p class="err" id="login-err" role="alert"></p>' +
      '<button class="btn pri" type="submit">Ingresar</button></form>';
    document.getElementById('login-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var f = e.target;
      api('/api/auth/login', { method: 'POST', body: { email: f.email.value, password: f.password.value } })
        .then(boot)
        .catch(function (err) { document.getElementById('login-err').textContent = err.message; });
    });
  }

  function boot() {
    return api('/api/auth/me').then(function (me) {
      state.user = me.user;
      return api('/api/admin/summary');
    }).then(function (sum) {
      state.features = sum.features;
      state.pkg = sum.package;
      route();
    }).catch(function () { showLogin(); });
  }

  // ------------------------------------------------------------ estructura y rutas
  function navItems() {
    var f = state.features;
    var owner = state.user.role === 'owner';
    var items = [['resumen', 'Resumen']];
    if (owner) items.push(['productos', 'Productos']); // solo el dueño cambia prendas, precios y fotos
    if (f.stock) items.push(['stock', 'Stock']);
    if (f.localSales) items.push(['local', 'Vendí en el local']);
    if (f.orders) items.push(['pedidos', 'Pedidos']);
    if (f.customers) items.push(['clientes', 'Clientes y avisos']);
    if (f.shipping && owner) items.push(['envios', 'Envíos']);
    if (f.multiUser && owner) items.push(['usuarios', 'Usuarios']);
    items.push(['mensajes', 'Mensajes']);
    if (owner) items.push(['ajustes', 'Ajustes']);
    return items;
  }

  var PKG_NAME = { 1: 'Catálogo', 2: 'Tienda con stock', 3: 'Tienda + clientes' };

  function route() {
    var items = navItems();
    var id = location.hash.replace(/^#\/?/, '') || 'resumen';
    if (!items.some(function (i) { return i[0] === id; })) id = 'resumen';

    app.innerHTML = '<header class="topbar"><div class="topbar-in"><span class="title">Panel del local · ' + esc(PKG_NAME[state.pkg] || '') + '</span>' +
      '<span class="muted">' + esc(state.user.name) + '</span>' +
      '<a class="btn sm" href="/" target="_blank" rel="noopener">Ver tienda</a>' +
      '<button class="btn sm" type="button" id="logout">Salir</button></div>' +
      '<nav class="tabs" aria-label="Secciones">' + items.map(function (i) {
        return '<a href="#/' + i[0] + '"' + (i[0] === id ? ' aria-current="page"' : '') + '>' + esc(i[1]) + '</a>';
      }).join('') + '</nav></header><main class="content" id="view"><p class="muted">Cargando…</p></main>';

    document.getElementById('logout').addEventListener('click', function () {
      api('/api/auth/logout', { method: 'POST' }).then(function () { showLogin(); });
    });

    var m = document.getElementById('view');
    VIEWS[id](m).catch(function (err) { m.innerHTML = '<p class="err">' + esc(err.message) + '</p>'; });
  }
  window.addEventListener('hashchange', function () { if (state.user) route(); });

  var VIEWS = {};

  // ------------------------------------------------------------ resumen
  VIEWS.resumen = function (m) {
    return api('/api/admin/summary').then(function (d) {
      var cards = [['#/productos', d.products, 'prendas activas']];
      if (d.pendingOrders !== undefined) cards.push(['#/pedidos', d.pendingOrders, 'pedidos pendientes'], ['#/pedidos', d.toShip, 'pagados para enviar']);
      if (d.lowStock !== undefined) cards.push(['#/stock', d.lowStock, 'talles con 1 o 2 unidades'], ['#/stock', d.soldOut, 'talles agotados']);
      if (d.salesToday !== undefined) cards.push(['#/local', fmt(d.salesToday), 'vendido hoy en el local']);
      cards.push(['#/mensajes', d.messages, 'mensajes sin atender']);
      m.innerHTML = '<div class="bar-title"><h2>Resumen</h2><div class="row-inline">' +
        (state.features.localSales ? '<a class="btn pri" href="#/local">Vendí en el local</a>' : '') +
        '<a class="btn" href="#/productos" data-new="1">Productos</a></div></div>' +
        '<div class="cards">' + cards.map(function (c) { return '<a class="stat" href="' + c[0] + '"><b>' + c[1] + '</b><span>' + c[2] + '</span></a>'; }).join('') + '</div>' +
        '<p class="muted">Paquete contratado: ' + esc(PKG_NAME[state.pkg]) + '.</p>';
    });
  };

  // ------------------------------------------------------------ productos
  VIEWS.productos = function (m) {
    return api('/api/admin/products').then(function (d) {
      var f = state.features;
      var rows = d.products.map(function (p) {
        return '<tr><td><img class="th" src="' + esc(p.thumb || '/img/placeholder.svg') + '" alt=""></td>' +
          '<td><strong>' + esc(p.name) + '</strong><br><span class="muted">' + esc(p.category) + '</span></td>' +
          '<td>' + fmt(p.price) + '</td>' + (f.stock ? '<td>' + p.stock + '</td>' : '') +
          '<td>' + (p.active ? '<span class="pill ok">Activa</span>' : '<span class="pill off">Archivada</span>') + '</td>' +
          '<td><button class="btn sm" data-act="edit" data-id="' + p.id + '">Editar</button> ' +
          '<button class="btn sm" data-act="toggle" data-id="' + p.id + '" data-active="' + (p.active ? 0 : 1) + '">' + (p.active ? 'Archivar' : 'Activar') + '</button></td></tr>';
      }).join('');
      m.innerHTML = '<div class="bar-title"><h2>Productos</h2><button class="btn pri" data-act="new">Nueva prenda</button></div>' +
        (d.products.length
          ? '<div class="table-wrap"><table class="table"><thead><tr><th></th><th>Prenda</th><th>Precio</th>' + (f.stock ? '<th>Stock</th>' : '') + '<th>Estado</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div>'
          : '<p class="muted">Todavía no cargaste prendas. Tocá "Nueva prenda" para empezar.</p>');
      m.onclick = function (e) {
        var b = e.target.closest('[data-act]');
        if (!b) return;
        var id = Number(b.dataset.id);
        if (b.dataset.act === 'new') editor(m, null).catch(fail);
        if (b.dataset.act === 'edit') editor(m, id).catch(fail);
        if (b.dataset.act === 'toggle') {
          api('/api/admin/products/' + id + '/active', { method: 'PATCH', body: { active: b.dataset.active === '1' } })
            .then(function () { return VIEWS.productos(m); }).catch(fail);
        }
      };
    });
  };

  function editor(m, id) {
    return Promise.all([
      api('/api/admin/categories'),
      id ? api('/api/admin/products/' + id) : Promise.resolve(null)
    ]).then(function (r) {
      var cats = r[0].categories;
      var data = r[1];
      var p = data ? data.product : { name: '', category_id: cats[0] ? cats[0].id : '', price: '', compare_price: '', description: '', composition: '', featured: 0, active: 1 };
      var colors = data ? data.colors : [{ id: '', name: '', hex: '#222222', sizes: [] }];
      var images = data ? data.images : [];

      // Fotos de un color (o generales si cid está vacío) con su botón para subir más.
      var photoBox = function (cid, label) {
        var mine = images.filter(function (im) { return cid ? String(im.color_id) === String(cid) : !im.color_id; });
        return '<div class="photo-box" data-cid="' + esc(cid) + '"><div class="muted">' + label + '</div>' +
          (mine.length ? '<div class="photos">' + mine.map(function (im) {
            return '<figure><img src="' + esc(im.thumb_path) + '" alt=""><button type="button" class="link-btn" data-act="delimg" data-id="' + im.id + '">Quitar</button></figure>';
          }).join('') + '</div>' : '') +
          '<div class="row-inline"><input type="file" class="c-files" accept="image/jpeg,image/png,image/webp" multiple aria-label="Fotos">' +
          '<button type="button" class="btn sm" data-act="upload">Subir fotos</button></div></div>';
      };

      var colorRow = function (c) {
        var cid = c.id || '';
        return '<div class="color-card" data-id="' + esc(cid) + '"><div class="color-row"><input type="color" class="c-hex" value="' + esc(c.hex || '#222222') + '" aria-label="Color">' +
          '<input class="c-name" value="' + esc(c.name) + '" placeholder="Nombre del color (ej.: Negro)" aria-label="Nombre del color">' +
          '<button type="button" class="link-btn" data-act="rmcolor">Quitar color</button></div>' +
          '<label class="field"><span>Talles de este color (separados por coma)</span><input class="c-sizes" value="' + esc((c.sizes || []).join(', ')) + '" placeholder="Ej.: S, M, L, XL"></label>' +
          '<p class="row-inline"><button type="button" class="btn sm" data-act="preset" data-v="XS, S, M, L, XL">Talles de ropa</button>' +
          '<button type="button" class="btn sm" data-act="preset" data-v="36, 38, 40, 42, 44, 46">Talles de pantalón</button>' +
          '<button type="button" class="btn sm" data-act="preset" data-v="Único">Talle único</button>' +
          '<button type="button" class="btn sm" data-act="copysizes">Usar en todos los colores</button></p>' +
          (id && cid ? photoBox(cid, 'Fotos de este color') : '<p class="muted">Guardá la prenda para subir las fotos de este color.</p>') + '</div>';
      };

      m.innerHTML = '<div class="bar-title"><h2>' + (id ? 'Editar prenda' : 'Nueva prenda') + '</h2><button class="btn" data-act="back">Volver a la lista</button></div>' +
        '<div class="panel"><div class="form-grid">' +
          '<label class="field wide"><span>Nombre</span><input id="p-name" value="' + esc(p.name) + '"></label>' +
          '<label class="field"><span>Categoría</span><select id="p-cat">' + cats.map(function (c) { return '<option value="' + c.id + '"' + (c.id === p.category_id ? ' selected' : '') + '>' + esc(c.name) + '</option>'; }).join('') + '</select></label>' +
          '<label class="field"><span>Precio ($)</span><input id="p-price" type="number" min="1" step="100" value="' + esc(p.price) + '"></label>' +
          '<label class="field"><span>Precio anterior tachado ($, opcional)</span><input id="p-compare" type="number" min="0" step="100" value="' + esc(p.compare_price || '') + '"></label>' +
          '<label class="field wide"><span>Descripción (aparece en la tienda y en Google)</span><textarea id="p-desc" rows="4">' + esc(p.description || '') + '</textarea></label>' +
          '<label class="field wide"><span>Composición</span><input id="p-comp" value="' + esc(p.composition || '') + '" placeholder="Ej.: 100% algodón"></label>' +
          '<label class="check"><input type="checkbox" id="p-featured"' + (p.featured ? ' checked' : '') + '> Destacada en el inicio</label>' +
          '<label class="check"><input type="checkbox" id="p-active"' + (p.active ? ' checked' : '') + '> Visible en la tienda</label>' +
        '</div></div>' +
        '<div class="panel"><h3>Colores, talles y fotos</h3><p class="muted">Cada color tiene sus propios talles y sus propias fotos. En la tienda, al elegir un color se muestran sus fotos y solo sus talles.</p>' +
          '<div id="colors">' + colors.map(colorRow).join('') + '</div><button type="button" class="btn sm" data-act="addcolor">Agregar color</button></div>' +
        '<p><button class="btn pri" data-act="save">Guardar prenda</button></p>' +
        (id
          ? '<div class="panel"><h3>Fotos generales</h3><p class="muted">Se ven con cualquier color (por ejemplo, una foto del detalle de la tela). Las fotos de cada color se suben arriba, dentro de su color.</p>' + photoBox('', 'Fotos para todos los colores') + '</div>'
          : '<p class="muted">Guardá la prenda primero y después vas a poder subir las fotos.</p>');

      var q = function (sel) { return m.querySelector(sel); };

      m.onclick = function (e) {
        var b = e.target.closest('[data-act]');
        if (!b) return;
        var act = b.dataset.act;
        if (act === 'back') VIEWS.productos(m).catch(fail);
        else if (act === 'addcolor') q('#colors').insertAdjacentHTML('beforeend', colorRow({ id: '', name: '', hex: '#222222', sizes: [] }));
        else if (act === 'rmcolor') { if (q('#colors').children.length > 1) b.closest('.color-card').remove(); else toast('La prenda necesita al menos un color', true); }
        else if (act === 'preset') b.closest('.color-card').querySelector('.c-sizes').value = b.dataset.v;
        else if (act === 'copysizes') {
          var v = b.closest('.color-card').querySelector('.c-sizes').value;
          Array.prototype.forEach.call(q('#colors').querySelectorAll('.c-sizes'), function (inp) { inp.value = v; });
          toast('Talles copiados a todos los colores');
        }
        else if (act === 'save') save();
        else if (act === 'delimg') api('/api/admin/images/' + b.dataset.id, { method: 'DELETE' }).then(function () { return editor(m, id); }).catch(fail);
        else if (act === 'upload') upload(b.closest('.photo-box'));
      };

      function save() {
        var body = {
          name: q('#p-name').value, category_id: q('#p-cat').value, price: q('#p-price').value, compare_price: q('#p-compare').value,
          description: q('#p-desc').value, composition: q('#p-comp').value,
          featured: q('#p-featured').checked, active: q('#p-active').checked,
          colors: Array.prototype.map.call(q('#colors').children, function (row) {
            return {
              id: row.dataset.id, name: row.querySelector('.c-name').value, hex: row.querySelector('.c-hex').value,
              sizes: row.querySelector('.c-sizes').value.split(',')
            };
          })
        };
        api(id ? '/api/admin/products/' + id : '/api/admin/products', { method: id ? 'PUT' : 'POST', body: body })
          .then(function (res) { toast('Prenda guardada'); return editor(m, res.id); })
          .catch(fail);
      }

      function upload(box) {
        var input = box.querySelector('.c-files');
        if (!input.files.length) return toast('Elegí al menos una foto', true);
        var fd = new FormData();
        fd.append('color_id', box.dataset.cid);
        Array.prototype.forEach.call(input.files, function (f) { fd.append('photos', f); });
        toast('Subiendo fotos…');
        fetch('/api/admin/products/' + id + '/images', { method: 'POST', body: fd, credentials: 'same-origin' })
          .then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { if (!r.ok) throw new Error(d.error || 'No se pudieron subir las fotos'); }); })
          .then(function () { toast('Fotos subidas'); return editor(m, id); })
          .catch(fail);
      }
    });
  }

  // ------------------------------------------------------------ stock
  function groupVariants(list) {
    var map = {};
    var order = [];
    list.forEach(function (v) {
      if (!map[v.product_id]) { map[v.product_id] = { name: v.product, active: v.active, colors: {}, colorOrder: [], sizes: [] }; order.push(v.product_id); }
      var p = map[v.product_id];
      var key = v.color + '|' + v.hex;
      if (!p.colors[key]) { p.colors[key] = { name: v.color, hex: v.hex, cells: {} }; p.colorOrder.push(key); }
      p.colors[key].cells[v.size] = v;
      if (p.sizes.indexOf(v.size) === -1) p.sizes.push(v.size);
    });
    return { map: map, order: order };
  }

  function stepClass(n) { return 'step' + (n === 0 ? ' zero' : n <= 2 ? ' low' : ''); }

  VIEWS.stock = function (m) {
    return api('/api/admin/stock').then(function (d) {
      var g = groupVariants(d.variants);
      var blocks = g.order.map(function (pid) {
        var p = g.map[pid];
        var head = p.sizes.map(function (z) { return '<th>' + esc(z) + '</th>'; }).join('');
        var rows = p.colorOrder.map(function (key) {
          var c = p.colors[key];
          return '<tr><td><span class="dot" style="background:' + esc(c.hex) + '"></span>' + esc(c.name) + '</td>' + p.sizes.map(function (z) {
            var v = c.cells[z];
            if (!v) return '<td></td>';
            return '<td><div class="' + stepClass(v.stock) + '" data-cell="' + v.id + '"><button type="button" data-act="adj" data-id="' + v.id + '" data-d="-1" aria-label="Restar una">−</button>' +
              '<input type="number" min="0" class="stk" data-id="' + v.id + '" value="' + v.stock + '" aria-label="Stock ' + esc(c.name) + ' ' + esc(z) + '">' +
              '<button type="button" data-act="adj" data-id="' + v.id + '" data-d="1" aria-label="Sumar una">+</button></div></td>';
          }).join('') + '</tr>';
        }).join('');
        return '<section class="panel stock-block" data-name="' + esc(p.name.toLowerCase()) + '"><h3>' + esc(p.name) + (p.active ? '' : ' <span class="pill off">Archivada</span>') + '</h3>' +
          '<div class="table-wrap" style="border:0"><table class="table"><thead><tr><th>Color</th>' + head + '</tr></thead><tbody>' + rows + '</tbody></table></div></section>';
      }).join('');
      m.innerHTML = '<div class="bar-title"><h2>Stock</h2><label class="field" style="min-width:min(260px,100%)"><span>Buscar prenda</span><input id="s-q" type="search"></label></div>' +
        (blocks || '<p class="muted">Todavía no hay prendas cargadas.</p>') +
        '<p class="muted">Ámbar: quedan 1 o 2 unidades. Rojo: agotado. Cada cambio queda registrado.</p>';

      function setCell(id, n) {
        var input = m.querySelector('.stk[data-id="' + id + '"]');
        input.value = n;
        input.parentNode.className = stepClass(n);
      }
      function adjust(body, id) {
        body.variantId = id;
        api('/api/admin/stock/adjust', { method: 'POST', body: body }).then(function (r) { setCell(id, r.stock); }).catch(function (err) {
          fail(err);
          VIEWS.stock(m).catch(fail);
        });
      }
      m.onclick = function (e) {
        var b = e.target.closest('[data-act="adj"]');
        if (b) adjust({ delta: Number(b.dataset.d) }, Number(b.dataset.id));
      };
      m.onchange = function (e) {
        if (!e.target.classList.contains('stk')) return;
        if (e.target.value.trim() === '') { VIEWS.stock(m).catch(fail); return; } // campo vacío: se restaura el valor real
        adjust({ set: Number(e.target.value) }, Number(e.target.dataset.id));
      };
      m.oninput = function (e) {
        if (e.target.id !== 's-q') return;
        var term = e.target.value.trim().toLowerCase();
        m.querySelectorAll('.stock-block').forEach(function (s) { s.hidden = term && s.dataset.name.indexOf(term) === -1; });
      };
    });
  };

  // ------------------------------------------------------------ vendí en el local
  VIEWS.local = function (m) {
    var sel = { pid: null, color: null, size: null, qty: 1 };

    function load() {
      return Promise.all([api('/api/admin/stock'), api('/api/admin/local-sales')]).then(function (r) {
        var vars = r[0].variants.filter(function (v) { return v.active; });
        draw(vars, r[1].sales);
      });
    }

    function draw(vars, sales) {
      var g = groupVariants(vars);
      if (sel.pid === null || !g.map[sel.pid]) { sel.pid = g.order[0] || null; sel.color = null; sel.size = null; }
      var p = sel.pid !== null ? g.map[sel.pid] : null;
      if (p && (!sel.color || !p.colors[sel.color])) sel.color = p.colorOrder[0];
      var cell = function (z) { return p && sel.color && p.colors[sel.color].cells[z] || null; };
      var chosen = sel.size ? cell(sel.size) : null;
      if (chosen && chosen.stock <= 0) { chosen = null; sel.size = null; }
      if (chosen && sel.qty > chosen.stock) sel.qty = chosen.stock;
      if (sel.qty < 1) sel.qty = 1;

      var form = !p ? '<p class="muted">No hay prendas activas para vender.</p>' :
        '<div class="field"><span>Prenda</span><select id="l-prod">' + g.order.map(function (pid) { return '<option value="' + pid + '"' + (pid === sel.pid ? ' selected' : '') + '>' + esc(g.map[pid].name) + '</option>'; }).join('') + '</select></div>' +
        '<div><div class="muted">Color</div><div class="chips" style="margin-top:6px">' + p.colorOrder.map(function (key) {
          var c = p.colors[key];
          return '<button type="button" class="sw" data-act="color" data-key="' + esc(key) + '" style="background:' + esc(c.hex) + '" title="' + esc(c.name) + '" aria-label="' + esc(c.name) + '" aria-pressed="' + (key === sel.color) + '"></button>';
        }).join('') + '</div></div>' +
        '<div><div class="muted">Talle · stock actual</div><div class="chips" style="margin-top:6px">' + (sel.color && p.colors[sel.color] ? Object.keys(p.colors[sel.color].cells) : p.sizes).map(function (z) {
          var v = cell(z);
          return '<button type="button" class="chip" data-act="size" data-s="' + esc(z) + '"' + (!v || v.stock <= 0 ? ' disabled' : '') + ' aria-pressed="' + (sel.size === z) + '">' + esc(z) + ' · ' + (v ? v.stock : 0) + '</button>';
        }).join('') + '</div></div>' +
        '<div class="row-inline"><span class="muted">Cantidad</span><div class="step"><button type="button" data-act="qty" data-d="-1" aria-label="Restar una">−</button>' +
          '<input type="number" min="1" id="l-qty" value="' + sel.qty + '" aria-label="Cantidad"><button type="button" data-act="qty" data-d="1" aria-label="Sumar una">+</button></div></div>' +
        '<p class="muted">' + (chosen ? 'Descuenta ' + sel.qty + ' del stock. Quedan ' + (chosen.stock - sel.qty) + ' después de la venta.' : 'Elegí color y talle.') + '</p>' +
        '<button class="btn pri" type="button" data-act="sell"' + (chosen ? '' : ' disabled') + '>Registrar venta en el local</button>';

      var list = sales.length ? '<div class="table-wrap"><table class="table"><thead><tr><th>Cuándo</th><th>Prenda</th><th>Total</th><th></th></tr></thead><tbody>' + sales.map(function (s) {
        return '<tr' + (s.voided ? ' style="opacity:.55"' : '') + '><td>' + esc(String(s.created_at).slice(5, 16)) + '</td><td>' + s.quantity + ' × ' + esc(s.product) + '<br><span class="muted">' + esc(s.color) + ', talle ' + esc(s.size) + (s.seller ? ' · ' + esc(s.seller) : '') + '</span></td><td>' + fmt(s.total) + '</td>' +
          '<td>' + (s.voided ? '<span class="pill off">Anulada</span>' : '<button class="btn sm" data-act="void" data-id="' + s.id + '">Anular</button>') + '</td></tr>';
      }).join('') + '</tbody></table></div>' : '<p class="muted">Todavía no registraste ventas del local.</p>';

      m.innerHTML = '<div class="bar-title"><h2>Vendí en el local</h2></div><div class="two"><div class="panel" style="display:grid;gap:14px;align-content:start">' + form + '</div><div><h3>Últimas ventas</h3>' + list + '</div></div>';
    }

    var cache = {};
    m.onclick = function (e) {
      var b = e.target.closest('[data-act]');
      if (!b) return;
      var act = b.dataset.act;
      if (act === 'color') { sel.color = b.dataset.key; sel.size = null; sel.qty = 1; return load().catch(fail); }
      if (act === 'size') { sel.size = b.dataset.s; sel.qty = 1; return load().catch(fail); }
      if (act === 'qty') { sel.qty = Math.max(1, sel.qty + Number(b.dataset.d)); return load().catch(fail); }
      if (act === 'void') return api('/api/admin/local-sales/' + b.dataset.id + '/void', { method: 'POST' }).then(function () { toast('Venta anulada: el stock volvió'); return load(); }).catch(fail);
      if (act === 'sell') {
        api('/api/admin/stock').then(function (r) {
          var p = r.variants.filter(function (v) { return v.product_id === sel.pid && (v.color + '|' + v.hex) === sel.color && v.size === sel.size; })[0];
          if (!p) throw new Error('Esa combinación ya no existe');
          return api('/api/admin/local-sales', { method: 'POST', body: { variantId: p.id, quantity: sel.qty } });
        }).then(function () { toast('Venta registrada: stock descontado'); sel.size = null; sel.qty = 1; return load(); }).catch(fail);
      }
    };
    m.onchange = function (e) {
      if (e.target.id === 'l-prod') { sel.pid = Number(e.target.value); sel.color = null; sel.size = null; sel.qty = 1; load().catch(fail); }
      if (e.target.id === 'l-qty') { sel.qty = Math.max(1, Number(e.target.value) || 1); load().catch(fail); }
    };
    void cache;
    return load();
  };

  // ------------------------------------------------------------ pedidos
  VIEWS.pedidos = function (m) {
    var filter = '';
    var PAY = { transferencia: 'Transferencia', mercadopago: 'Mercado Pago', efectivo: 'Efectivo' };

    function actionsFor(o) {
      var a = [];
      if (o.status === 'pendiente') a.push(['pagado', 'Marcar pagado']);
      if (o.status === 'pagado' && o.delivery_method === 'envio') a.push(['enviado', 'Marcar enviado']);
      if (o.status === 'pagado' || o.status === 'enviado') a.push(['entregado', 'Marcar entregado']);
      return a;
    }

    function load() {
      return api('/api/admin/orders' + (filter ? '?status=' + filter : '')).then(function (d) {
        var opts = ['', 'pendiente', 'pagado', 'enviado', 'entregado', 'cancelado'].map(function (s) {
          return '<option value="' + s + '"' + (s === filter ? ' selected' : '') + '>' + (s ? s.charAt(0).toUpperCase() + s.slice(1) : 'Todos') + '</option>';
        }).join('');
        m.innerHTML = '<div class="bar-title"><h2>Pedidos</h2><label class="field"><span>Estado</span><select id="o-filter">' + opts + '</select></label></div>' +
          (d.orders.length ? d.orders.map(function (o) {
            var canCancel = o.status === 'pendiente' || o.status === 'pagado' || o.status === 'enviado';
            return '<article class="order"><div class="top"><strong>#' + esc(o.code) + ' · ' + esc(o.customer_name) + '</strong><span>' + statusPill(o.status) + ' <span class="muted">' + esc(String(o.created_at).slice(0, 16)) + '</span></span></div>' +
              '<ul>' + o.items.map(function (i) { return '<li>' + i.quantity + ' × ' + esc(i.product_name) + ' <span class="muted">(' + esc(i.color_name) + ', talle ' + esc(i.size) + ')</span></li>'; }).join('') + '</ul>' +
              '<div class="muted">' + (o.delivery_method === 'retiro' ? 'Retira en el local' : 'Envío a ' + esc([o.address, o.city, o.province, o.postal_code].filter(Boolean).join(', '))) +
                ' · Pago: ' + esc(PAY[o.payment_method]) + ' · <strong style="color:var(--ink)">' + fmt(o.total) + '</strong>' + (o.shipping_cost ? ' (envío ' + fmt(o.shipping_cost) + ')' : '') + '</div>' +
              (o.receipt_at ? '<div class="receipt-tag">Comprobante cargado el ' + esc(String(o.receipt_at).slice(0, 16).replace('T', ' ')) + ' · <a target="_blank" rel="noopener" href="/api/admin/orders/' + o.id + '/receipt">Ver comprobante</a></div>' : '') +
              (o.notes ? '<div class="muted">Notas: ' + esc(o.notes).replace(/\n/g, '<br>') + '</div>' : '') +
              '<div class="actions"><a class="btn sm" target="_blank" rel="noopener" href="' + esc(o.whatsapp) + '">WhatsApp al cliente</a>' +
              actionsFor(o).map(function (a) { return '<button class="btn sm pri" data-act="status" data-id="' + o.id + '" data-s="' + a[0] + '">' + a[1] + '</button>'; }).join('') +
              (canCancel ? '<button class="btn sm danger" data-act="askcancel" data-id="' + o.id + '">Cancelar pedido</button>' : '') + '</div>' +
              '<div class="confirm" id="cf-' + o.id + '" hidden>Se cancela el pedido y las prendas vuelven al stock. <button class="btn sm danger" data-act="status" data-id="' + o.id + '" data-s="cancelado">Sí, cancelar</button><button class="btn sm" data-act="nocancel" data-id="' + o.id + '">No</button></div></article>';
          }).join('') : '<p class="muted">No hay pedidos' + (filter ? ' con ese estado' : ' todavía') + '.</p>');
      });
    }

    m.onclick = function (e) {
      var b = e.target.closest('[data-act]');
      if (!b) return;
      if (b.dataset.act === 'askcancel') document.getElementById('cf-' + b.dataset.id).hidden = false;
      if (b.dataset.act === 'nocancel') document.getElementById('cf-' + b.dataset.id).hidden = true;
      if (b.dataset.act === 'status') {
        api('/api/admin/orders/' + b.dataset.id + '/status', { method: 'PATCH', body: { status: b.dataset.s } })
          .then(function () { toast('Pedido actualizado'); return load(); }).catch(fail);
      }
    };
    m.onchange = function (e) { if (e.target.id === 'o-filter') { filter = e.target.value; load().catch(fail); } };
    return load();
  };

  // ------------------------------------------------------------ clientes y avisos
  VIEWS.clientes = function (m) {
    return Promise.all([api('/api/admin/customers'), api('/api/admin/products')]).then(function (r) {
      var customers = r[0].customers;
      var products = r[1].products.filter(function (p) { return p.active; });
      m.innerHTML = '<div class="bar-title"><h2>Clientes y avisos</h2></div>' +
        '<div class="panel"><h3>Avisar por WhatsApp</h3><p class="muted">Se arma un mensaje para los clientes que aceptaron recibir novedades y ya compraron de la misma categoría. Se abre un chat por cada uno.</p>' +
        '<div class="row-inline"><label class="field"><span>Prenda</span><select id="n-prod">' + products.map(function (p) { return '<option value="' + p.id + '">' + esc(p.name) + '</option>'; }).join('') + '</select></label>' +
        '<label class="field"><span>Mensaje</span><select id="n-tpl"><option value="nuevo">Llegó mercadería nueva</option><option value="ultimos">Últimos talles</option></select></label>' +
        '<button class="btn pri" type="button" data-act="preview">Ver clientes</button></div><div id="n-list" style="margin-top:14px"></div></div>' +
        '<h3>Base de clientes (' + customers.length + ')</h3>' +
        (customers.length ? '<div class="table-wrap"><table class="table"><thead><tr><th>Nombre</th><th>Teléfono</th><th>Compras</th><th>Acepta avisos</th><th>Última compra</th></tr></thead><tbody>' + customers.map(function (c) {
          return '<tr><td>' + esc(c.name) + '</td><td>' + esc(c.phone) + '</td><td>' + c.orders_count + '</td><td>' + (c.accepts_marketing ? '<span class="pill ok">Sí</span>' : '<span class="pill off">No</span>') + '</td><td>' + esc(String(c.last_order_at || '').slice(0, 10)) + '</td></tr>';
        }).join('') + '</tbody></table></div>' : '<p class="muted">Los clientes se cargan solos cuando hacen un pedido en la tienda.</p>');
      m.onclick = function (e) {
        if (!e.target.closest('[data-act="preview"]')) return;
        var list = document.getElementById('n-list');
        var pid = document.getElementById('n-prod').value;
        if (!pid) return toast('No hay prendas activas', true);
        api('/api/admin/notify/preview?productId=' + pid + '&template=' + document.getElementById('n-tpl').value).then(function (d) {
          list.innerHTML = d.customers.length
            ? '<p><strong>' + d.customers.length + ' cliente' + (d.customers.length === 1 ? '' : 's') + ' para avisar</strong></p>' + d.customers.map(function (c) {
              return '<p class="row-inline"><span style="min-width:140px">' + esc(c.name) + '</span><a class="btn sm" target="_blank" rel="noopener" href="' + esc(c.link) + '">Abrir WhatsApp</a></p>';
            }).join('') + '<p class="muted">Ejemplo de mensaje: ' + esc(d.customers[0].message) + '</p>'
            : '<p class="muted">Todavía no hay clientes que hayan aceptado avisos y comprado de esa categoría.</p>';
        }).catch(fail);
      };
    });
  };

  // ------------------------------------------------------------ envíos
  VIEWS.envios = function (m) {
    return api('/api/admin/shipping-rates').then(function (d) {
      m.innerHTML = '<div class="bar-title"><h2>Envíos por provincia</h2><button class="btn pri" data-act="save">Guardar cambios</button></div>' +
        '<p class="muted">Costo del envío y demora estimada. Desactivá las provincias a las que no enviás. El envío gratis a partir de cierto monto se configura en Ajustes.</p>' +
        '<div class="table-wrap"><table class="table"><thead><tr><th>Provincia</th><th>Costo ($)</th><th>Días desde</th><th>Días hasta</th><th>Activa</th></tr></thead><tbody>' + d.rates.map(function (r) {
          return '<tr data-province="' + esc(r.province) + '"><td>' + esc(r.province) + '</td><td><input class="r-cost" type="number" min="0" step="100" value="' + r.cost + '"></td>' +
            '<td><input class="r-min" type="number" min="0" value="' + r.days_min + '"></td><td><input class="r-max" type="number" min="0" value="' + r.days_max + '"></td>' +
            '<td><input class="r-on" type="checkbox"' + (r.active ? ' checked' : '') + '></td></tr>';
        }).join('') + '</tbody></table></div>';
      m.onclick = function (e) {
        if (!e.target.closest('[data-act="save"]')) return;
        var rates = Array.prototype.map.call(m.querySelectorAll('tbody tr'), function (tr) {
          return { province: tr.dataset.province, cost: tr.querySelector('.r-cost').value, days_min: tr.querySelector('.r-min').value, days_max: tr.querySelector('.r-max').value, active: tr.querySelector('.r-on').checked };
        });
        api('/api/admin/shipping-rates', { method: 'PUT', body: { rates: rates } }).then(function () { toast('Envíos guardados'); }).catch(fail);
      };
    });
  };

  // ------------------------------------------------------------ usuarios
  VIEWS.usuarios = function (m) {
    return api('/api/admin/users').then(function (d) {
      m.innerHTML = '<div class="bar-title"><h2>Usuarios</h2></div>' +
        '<div class="panel"><h3>Nuevo usuario</h3><div class="form-grid">' +
        '<label class="field"><span>Nombre</span><input id="u-name"></label><label class="field"><span>Correo</span><input id="u-email" type="email"></label>' +
        '<label class="field"><span>Contraseña (mínimo 8)</span><input id="u-pass" type="password" autocomplete="new-password"></label>' +
        '<label class="field"><span>Rol</span><select id="u-role"><option value="seller">Vendedor/a</option><option value="owner">Dueño/a</option></select></label></div>' +
        '<p style="margin-top:12px"><button class="btn pri" data-act="create">Crear usuario</button></p></div>' +
        '<div class="table-wrap"><table class="table"><thead><tr><th>Nombre</th><th>Correo</th><th>Rol</th><th>Activo</th><th>Nueva contraseña</th><th></th></tr></thead><tbody>' + d.users.map(function (u) {
          return '<tr data-id="' + u.id + '"><td><input class="x-name" value="' + esc(u.name) + '"></td><td>' + esc(u.email) + '</td>' +
            '<td><select class="x-role"><option value="seller"' + (u.role === 'seller' ? ' selected' : '') + '>Vendedor/a</option><option value="owner"' + (u.role === 'owner' ? ' selected' : '') + '>Dueño/a</option></select></td>' +
            '<td><input class="x-on" type="checkbox"' + (u.active ? ' checked' : '') + '></td><td><input class="x-pass" type="password" autocomplete="new-password" placeholder="Sin cambios"></td>' +
            '<td><button class="btn sm" data-act="saveuser" data-id="' + u.id + '">Guardar</button></td></tr>';
        }).join('') + '</tbody></table></div><p class="muted">Los vendedores pueden vender, cargar stock y atender pedidos. Solo el dueño cambia ajustes, envíos y usuarios.</p>';
      m.onclick = function (e) {
        var b = e.target.closest('[data-act]');
        if (!b) return;
        if (b.dataset.act === 'create') {
          api('/api/admin/users', { method: 'POST', body: { name: document.getElementById('u-name').value, email: document.getElementById('u-email').value, password: document.getElementById('u-pass').value, role: document.getElementById('u-role').value } })
            .then(function () { toast('Usuario creado'); return VIEWS.usuarios(m); }).catch(fail);
        }
        if (b.dataset.act === 'saveuser') {
          var tr = b.closest('tr');
          api('/api/admin/users/' + b.dataset.id, { method: 'PUT', body: { name: tr.querySelector('.x-name').value, role: tr.querySelector('.x-role').value, active: tr.querySelector('.x-on').checked, password: tr.querySelector('.x-pass').value } })
            .then(function () { toast('Usuario guardado'); tr.querySelector('.x-pass').value = ''; }).catch(fail);
        }
      };
    });
  };

  // ------------------------------------------------------------ mensajes
  VIEWS.mensajes = function (m) {
    return api('/api/admin/messages').then(function (d) {
      m.innerHTML = '<div class="bar-title"><h2>Mensajes</h2></div>' + (d.messages.length ? d.messages.map(function (x) {
        return '<article class="order"' + (x.handled ? ' style="opacity:.65"' : '') + '><div class="top"><strong>' + esc(x.name) + (x.type === 'arrepentimiento' ? ' <span class="pill bad">Arrepentimiento</span>' : '') + '</strong><span class="muted">' + esc(String(x.created_at).slice(0, 16)) + '</span></div>' +
          '<div class="muted">' + [x.email, x.phone, x.order_code ? 'Pedido ' + x.order_code : ''].filter(Boolean).map(esc).join(' · ') + '</div>' +
          (x.message ? '<p>' + esc(x.message).replace(/\n/g, '<br>') + '</p>' : '') +
          '<div class="actions"><button class="btn sm" data-act="handled" data-id="' + x.id + '" data-v="' + (x.handled ? 0 : 1) + '">' + (x.handled ? 'Marcar sin atender' : 'Marcar atendido') + '</button></div></article>';
      }).join('') : '<p class="muted">No hay mensajes.</p>');
      m.onclick = function (e) {
        var b = e.target.closest('[data-act="handled"]');
        if (!b) return;
        api('/api/admin/messages/' + b.dataset.id, { method: 'PATCH', body: { handled: b.dataset.v === '1' } }).then(function () { return VIEWS.mensajes(m); }).catch(fail);
      };
    });
  };

  // ------------------------------------------------------------ ajustes
  var SETTINGS = [
    ['store_name', 'Nombre del local'],
    ['tagline', 'Frase del local (se usa en el título de Google)'],
    ['description', 'Descripción corta del local (SEO)', 'textarea'],
    ['whatsapp', 'WhatsApp con código de país, sin + ni espacios (ej.: 5493464123456)'],
    ['phone_display', 'Teléfono para mostrar'],
    ['email', 'Correo del local'],
    ['address', 'Dirección (calle y número)'],
    ['city', 'Ciudad'],
    ['province', 'Provincia'],
    ['postal_code', 'Código postal'],
    ['hours', 'Horarios para mostrar (uno por línea)', 'textarea'],
    ['hours_schema', 'Horarios para Google, uno por línea (ej.: Mo-Fr 09:00-13:00)', 'textarea'],
    ['instagram_url', 'Link de Instagram'],
    ['facebook_url', 'Link de Facebook'],
    ['maps_url', 'Link de Google Maps del local'],
    ['free_shipping_from', 'Envío gratis desde ($, 0 = sin envío gratis)', 'text', 'shipping'],
    ['bank_holder', 'Titular de la cuenta'],
    ['bank_name', 'Banco'],
    ['bank_cbu', 'CBU / CVU'],
    ['bank_alias', 'Alias'],
    ['legal_name', 'Razón social'],
    ['cuit', 'CUIT']
  ];

  VIEWS.ajustes = function (m) {
    return Promise.all([api('/api/admin/settings'), api('/api/admin/categories')]).then(function (r) {
      var d = r[0];
      var cats = r[1].categories;
      var s = d.settings;
      var fields = SETTINGS.filter(function (f) { return !f[3] || state.features[f[3]]; }).map(function (f) {
        var id = 's-' + f[0];
        return f[2] === 'textarea'
          ? '<label class="field wide"><span>' + esc(f[1]) + '</span><textarea id="' + id + '" rows="3">' + esc(s[f[0]]) + '</textarea></label>'
          : '<label class="field"><span>' + esc(f[1]) + '</span><input id="' + id + '" value="' + esc(s[f[0]]) + '"></label>';
      }).join('');
      m.innerHTML = '<div class="bar-title"><h2>Ajustes del local</h2><button class="btn pri" data-act="save">Guardar ajustes</button></div>' +
        '<p class="muted">Estos datos aparecen en la tienda, en el pie de página y en lo que ve Google. Los cambios pueden tardar hasta 30 segundos en verse.</p>' +
        '<div class="panel"><div class="form-grid">' + fields + '</div></div>' +
        '<div class="panel"><h3>Categorías de la tienda</h3>' +
          '<p class="muted">Aparecen en el menú de la tienda. Cambiar un nombre no rompe los links ni el posicionamiento en Google. El número define el orden.</p>' +
          cats.map(function (c) {
            return '<div class="cat-row"><input class="c-name" value="' + esc(c.name) + '" aria-label="Nombre de la categoría">' +
              '<input class="c-order" type="number" value="' + c.sort_order + '" aria-label="Orden">' +
              '<button type="button" class="btn" data-act="catsave" data-id="' + c.id + '">Guardar</button></div>';
          }).join('') +
          '<div class="cat-row"><input id="c-new" placeholder="Nueva categoría (ej.: Calzado)" aria-label="Nueva categoría">' +
            '<button type="button" class="btn pri" data-act="catadd">Agregar</button></div></div>';
      m.onclick = function (e) {
        var add = e.target.closest('[data-act="catadd"]');
        var sv = e.target.closest('[data-act="catsave"]');
        if (add) {
          var nm = document.getElementById('c-new').value.trim();
          if (nm.length < 2) { toast('Escribí el nombre de la categoría'); return; }
          api('/api/admin/categories', { method: 'POST', body: { name: nm, sort_order: cats.length + 1 } })
            .then(function () { toast('Categoría agregada'); return VIEWS.ajustes(m); }).catch(fail);
          return;
        }
        if (sv) {
          var row = sv.closest('.cat-row');
          api('/api/admin/categories/' + sv.dataset.id, { method: 'PUT', body: { name: row.querySelector('.c-name').value, sort_order: row.querySelector('.c-order').value } })
            .then(function () { toast('Categoría guardada'); }).catch(fail);
          return;
        }
        if (!e.target.closest('[data-act="save"]')) return;
        var body = {};
        SETTINGS.forEach(function (f) { var el = document.getElementById('s-' + f[0]); if (el) body[f[0]] = el.value; });
        api('/api/admin/settings', { method: 'PUT', body: body }).then(function () { toast('Ajustes guardados'); }).catch(fail);
      };
    });
  };

  boot();
})();
