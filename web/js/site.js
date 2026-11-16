/* ==========================================================================
   Tonkov — site behaviour. Vanilla JS, no dependencies besides bootstrap.bundle.
   Every feature is opt-in through a data-attribute, so pages rendered by the
   backend (Yii2) only need the same markup.

     1. Navbar state              5. Lightbox + product gallery   9. Demo chart
     2. Scroll reveal             6. Lite YouTube                10. Demo forms
     3. Statement word reveal     7. Recipe filter
     4. Counters                  8. Cart (prototype, localStorage)
   ========================================================================== */
(function () {
  'use strict';

  var doc = document;
  var root = doc.documentElement;
  var ROOT = root.getAttribute('data-root') || '/';
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var $ = function (sel, ctx) { return (ctx || doc).querySelector(sel); };
  var $$ = function (sel, ctx) { return Array.prototype.slice.call((ctx || doc).querySelectorAll(sel)); };
  var eur = function (n) {
    var s = Number.isInteger(n) ? String(n) : n.toFixed(2).replace('.', ',');
    return s.replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' €';
  };

  /* 1. Navbar: transparent over a hero, solid after scrolling ------------- */
  var nav = $('.site-nav');
  if (nav) {
    var onScroll = function () { nav.classList.toggle('is-scrolled', window.scrollY > 40); };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
  }

  /* 2. Scroll reveal: .reveal → .is-visible (siblings are staggered) ------ */
  var reveals = $$('.reveal');
  if (reveals.length) {
    if (reduceMotion || !('IntersectionObserver' in window)) {
      reveals.forEach(function (el) { el.classList.add('is-visible'); });
    } else {
      var io = new IntersectionObserver(function (entries) {
        var shown = 0;
        entries.forEach(function (e) {
          if (!e.isIntersecting) return;
          e.target.style.setProperty('--d', Math.min(shown++, 5) * 0.08 + 's');
          e.target.classList.add('is-visible');
          io.unobserve(e.target);
        });
      }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
      reveals.forEach(function (el) { io.observe(el); });
    }
  }

  /* 3. Statement: words light up as the paragraph scrolls through --------- */
  $$('[data-words]').forEach(function (el) {
    var words = el.textContent.trim().split(/\s+/);
    el.setAttribute('aria-label', words.join(' '));
    el.innerHTML = words.map(function (w) { return '<span class="w" aria-hidden="true">' + w + '</span>'; }).join(' ');
    var spans = $$('.w', el);
    if (reduceMotion) { spans.forEach(function (s) { s.classList.add('on'); }); return; }
    var ticking = false;
    var update = function () {
      ticking = false;
      var r = el.getBoundingClientRect();
      var vh = window.innerHeight;
      // 0 when the top of the text enters at 85% of the viewport, 1 when its bottom reaches 45%
      var p = (vh * 0.85 - r.top) / (r.height + vh * 0.4);
      var lit = Math.round(Math.max(0, Math.min(1, p)) * spans.length);
      spans.forEach(function (s, i) { s.classList.toggle('on', i < lit); });
    };
    var request = function () { if (!ticking) { ticking = true; requestAnimationFrame(update); } };
    update();
    window.addEventListener('scroll', request, { passive: true });
    window.addEventListener('resize', request);
  });

  /* 4. Counters: <span data-count="140">140</span> ------------------------ */
  var counters = $$('[data-count]');
  if (counters.length && !reduceMotion && 'IntersectionObserver' in window) {
    var cio = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        cio.unobserve(e.target);
        var end = parseFloat(e.target.getAttribute('data-count'));
        var t0 = performance.now();
        var dur = 1400;
        var tick = function (t) {
          var k = Math.min(1, (t - t0) / dur);
          e.target.textContent = Math.round(end * (1 - Math.pow(1 - k, 3)));
          if (k < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });
    }, { threshold: 0.6 });
    counters.forEach(function (el) { cio.observe(el); });
  }

  /* 5. Lightbox: any [data-full] opens its large image in a modal --------- */
  var lightbox;
  var openLightbox = function (src, alt) {
    if (!window.bootstrap) return;
    if (!lightbox) {
      var el = doc.createElement('div');
      el.className = 'modal fade lightbox';
      el.tabIndex = -1;
      el.setAttribute('aria-label', 'Голяма снимка');
      el.innerHTML = '<div class="modal-dialog modal-xl modal-dialog-centered"><div class="modal-content"><div class="modal-body">' +
        '<button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Затвори"></button><img alt=""></div></div></div>';
      doc.body.appendChild(el);
      lightbox = { el: el, img: $('img', el), modal: new bootstrap.Modal(el) };
    }
    lightbox.img.src = src;
    lightbox.img.alt = alt || '';
    lightbox.modal.show();
  };
  doc.addEventListener('click', function (e) {
    var trigger = e.target.closest('[data-full]');
    if (!trigger) return;
    e.preventDefault();
    var img = $('img', trigger);
    openLightbox(trigger.getAttribute('data-full'), img ? img.alt : '');
  });

  /* Product gallery: thumbnails swap the main image */
  $$('[data-gallery]').forEach(function (gallery) {
    var main = $('[data-gallery-main]', gallery);
    var mainImg = $('img', main);
    $$('[data-gallery-thumb]', gallery).forEach(function (thumb) {
      thumb.addEventListener('click', function () {
        mainImg.src = thumb.getAttribute('data-src');
        mainImg.alt = thumb.getAttribute('data-alt') || '';
        main.setAttribute('data-full', thumb.getAttribute('data-src'));
        $$('[data-gallery-thumb]', gallery).forEach(function (t) { t.setAttribute('aria-current', t === thumb ? 'true' : 'false'); });
      });
    });
  });

  /* Product variants: the chosen model sets the displayed price */
  $$('[data-variant-price]').forEach(function (select) {
    var out = $('[data-product-price]');
    var initial = out ? out.textContent : '';
    select.addEventListener('change', function () {
      var price = parseFloat(select.options[select.selectedIndex].getAttribute('data-price'));
      if (out) out.textContent = isFinite(price) ? eur(price) : initial;
    });
  });

  /* 6. Lite YouTube: the iframe is loaded only after a click -------------- */
  doc.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-youtube]');
    if (!btn || btn.classList.contains('is-playing')) return;
    var id = btn.getAttribute('data-youtube');
    var frame = doc.createElement('iframe');
    frame.src = 'https://www.youtube-nocookie.com/embed/' + encodeURIComponent(id) + '?autoplay=1&rel=0';
    frame.title = btn.getAttribute('aria-label') || 'Видео';
    frame.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture';
    frame.allowFullscreen = true;
    btn.classList.add('is-playing');
    btn.innerHTML = '';
    btn.appendChild(frame);
  });

  /* 7. Recipes: filter by category + free-text search --------------------- */
  var recipeList = $('[data-recipes]');
  if (recipeList) {
    var items = $$('[data-recipe]', recipeList);
    var buttons = $$('[data-recipe-filter]');
    var search = $('[data-recipe-search]');
    var empty = $('[data-recipe-empty]');
    var current = 'all';
    var apply = function () {
      var q = (search && search.value || '').trim().toLowerCase();
      var visible = 0;
      items.forEach(function (item) {
        var okCat = current === 'all' || item.getAttribute('data-category') === current;
        var okText = !q || item.textContent.toLowerCase().indexOf(q) !== -1;
        item.hidden = !(okCat && okText);
        if (!item.hidden) visible++;
      });
      if (empty) empty.hidden = visible > 0;
    };
    buttons.forEach(function (b) {
      b.addEventListener('click', function () {
        current = b.getAttribute('data-recipe-filter');
        buttons.forEach(function (x) { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); });
        apply();
      });
    });
    if (search) search.addEventListener('input', apply);
  }

  /* 8. Cart — PROTOTYPE ONLY ----------------------------------------------
     Keeps the cart in localStorage so the static prototype is clickable.
     In the Yii2 app the cart lives on the server: keep the markup
     ([data-cart-add], [data-cart-count], [data-cart]) and replace this block
     with calls to the cart controller. */
  var CART_KEY = 'tonkov.cart';
  var readCart = function () { try { return JSON.parse(localStorage.getItem(CART_KEY)) || []; } catch (e) { return []; } };
  var writeCart = function (items) { try { localStorage.setItem(CART_KEY, JSON.stringify(items)); } catch (e) {} renderCartCount(); };
  var renderCartCount = function () {
    var n = readCart().reduce(function (s, i) { return s + i.qty; }, 0);
    $$('[data-cart-count]').forEach(function (el) { el.textContent = n; el.hidden = n === 0; });
  };
  var toast = function (html) {
    if (!window.bootstrap) return;
    var box = $('.toast-container');
    if (!box) {
      box = doc.createElement('div');
      box.className = 'toast-container position-fixed bottom-0 end-0 p-3';
      doc.body.appendChild(box);
    }
    var el = doc.createElement('div');
    el.className = 'toast';
    el.setAttribute('role', 'status');
    el.innerHTML = '<div class="toast-body">' + html + '</div>';
    box.appendChild(el);
    el.addEventListener('hidden.bs.toast', function () { el.remove(); });
    new bootstrap.Toast(el, { delay: 3500 }).show();
  };

  doc.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-cart-add]');
    if (!btn) return;
    e.preventDefault();
    var d = btn.dataset;
    var select = d.variantSelect ? $(d.variantSelect) : null;
    var option = select ? select.options[select.selectedIndex] : null;
    if (select && (!option || !option.value)) { select.focus(); toast('Първо изберете модел.'); return; }
    var id = d.id + (option ? ':' + option.value : '');
    var items = readCart();
    var found = items.filter(function (i) { return i.id === id; })[0];
    if (found) found.qty++;
    else items.push({
      id: id,
      name: d.name + (option ? ' — ' + option.value : ''),
      price: option ? parseFloat(option.getAttribute('data-price')) : parseFloat(d.price),
      image: d.image || '',
      url: d.url || '',
      qty: 1
    });
    writeCart(items);
    toast('Добавено в количката. <a href="' + ROOT + 'cart/index.html">Към количката</a>');
  });

  var cartBox = $('[data-cart]');
  var renderCart = function () {
    if (!cartBox) return;
    var items = readCart();
    var body = $('[data-cart-body]', cartBox);
    $('[data-cart-empty]').hidden = items.length > 0;
    cartBox.hidden = items.length === 0;
    var total = 0;
    body.innerHTML = items.map(function (i, n) {
      total += i.price * i.qty;
      return '<tr>' +
        '<td><div class="cart-item">' + (i.image ? '<img src="' + ROOT + i.image + '" alt="">' : '') +
        '<a href="' + ROOT + i.url.replace(/^\//, '') + '">' + i.name + '</a></div></td>' +
        '<td class="text-nowrap">' + eur(i.price) + '</td>' +
        '<td><input class="form-control cart-qty" type="number" min="1" max="99" value="' + i.qty + '" data-cart-qty="' + n + '" aria-label="Количество"></td>' +
        '<td class="text-nowrap fw-bold text-end">' + eur(i.price * i.qty) + '</td>' +
        '<td class="text-end"><button class="cart-remove" type="button" data-cart-remove="' + n + '" aria-label="Премахни"><i class="bi bi-x-lg"></i></button></td>' +
        '</tr>';
    }).join('');
    $('[data-cart-total]', cartBox).textContent = eur(Math.round(total * 100) / 100);
    var field = $('[data-cart-field]');
    if (field) field.value = items.map(function (i) { return i.qty + ' × ' + i.name; }).join('\n');
  };
  if (cartBox) {
    cartBox.addEventListener('change', function (e) {
      var n = e.target.getAttribute('data-cart-qty');
      if (n === null) return;
      var items = readCart();
      items[n].qty = Math.max(1, parseInt(e.target.value, 10) || 1);
      writeCart(items);
      renderCart();
    });
    cartBox.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-cart-remove]');
      if (!btn) return;
      var items = readCart();
      items.splice(btn.getAttribute('data-cart-remove'), 1);
      writeCart(items);
      renderCart();
    });
    renderCart();
  }
  renderCartCount();

  /* 9. Demo chart ----------------------------------------------------------
     <div data-demo-chart data-src="/data/demo/vezna.json" data-unit="кг">
     JSON: { "label": "Тегло на кошера", "unit": "кг", "points": [["2026-05-01T06:00", 41.2], …] }
     While data-src is empty (or cannot be loaded) the placeholder stays. */
  $$('[data-demo-chart]').forEach(function (box) {
    var src = box.getAttribute('data-src');
    if (!src || !window.fetch) return;
    fetch(src).then(function (r) { return r.ok ? r.json() : Promise.reject(); }).then(function (data) {
      var pts = (data.points || []).map(function (p) { return [new Date(p[0]).getTime(), Number(p[1])]; })
        .filter(function (p) { return isFinite(p[0]) && isFinite(p[1]); });
      if (pts.length < 2) return;
      var xs = pts.map(function (p) { return p[0]; });
      var ys = pts.map(function (p) { return p[1]; });
      var x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs);
      var y0 = Math.min.apply(null, ys), y1 = Math.max.apply(null, ys);
      var pad = (y1 - y0) * 0.12 || 1;
      y0 -= pad; y1 += pad;
      var W = 800, H = 280;
      var line = pts.map(function (p, i) {
        return (i ? 'L' : 'M') + ((p[0] - x0) / (x1 - x0) * W).toFixed(1) + ' ' + (H - (p[1] - y0) / (y1 - y0) * H).toFixed(1);
      }).join(' ');
      var plot = $('[data-demo-chart-plot]', box);
      var unit = data.unit || box.getAttribute('data-unit') || '';
      var fmt = function (t) { return new Date(t).toLocaleDateString('bg-BG', { day: 'numeric', month: 'short' }); };
      var svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" role="img" aria-label="' + (data.label || 'Графика') + '">' +
        '<g class="demo-chart__grid"><line x1="0" y1="56" x2="800" y2="56"/><line x1="0" y1="112" x2="800" y2="112"/><line x1="0" y1="168" x2="800" y2="168"/><line x1="0" y1="224" x2="800" y2="224"/></g>' +
        '<path class="demo-chart__area" d="' + line + ' L' + W + ' ' + H + ' L0 ' + H + ' Z"/>' +
        '<path class="demo-chart__series" d="' + line + '"/></svg>';
      plot.insertAdjacentHTML('beforeend', svg);
      plot.insertAdjacentHTML('afterend', '<div class="demo-chart__axis"><span>' + fmt(x0) + '</span><span>' +
        (data.label ? data.label + ': ' : '') + Math.min.apply(null, ys).toLocaleString('bg-BG') + ' – ' + Math.max.apply(null, ys).toLocaleString('bg-BG') + ' ' + unit +
        '</span><span>' + fmt(x1) + '</span></div>');
      box.classList.add('has-data');
    }).catch(function () { /* keep the placeholder */ });
  });

  /* 10. Demo forms: the prototype does not send anything ------------------
     Remove the data-demo-form attribute once the form posts to the backend. */
  $$('form[data-demo-form]').forEach(function (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!form.checkValidity()) { form.classList.add('was-validated'); return; }
      var note = $('.form-demo', form);
      if (note) { note.hidden = false; note.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
    });
  });

  /* Pre-fill the contact form from the query string (?subject=…&product=…) */
  var params = new URLSearchParams(location.search);
  var subject = $('[data-prefill="subject"]');
  if (subject && params.get('subject')) subject.value = params.get('subject');
  var message = $('[data-prefill="message"]');
  if (message && params.get('product')) message.value = 'Интересувам се от: ' + params.get('product') + '\n\n';
})();
