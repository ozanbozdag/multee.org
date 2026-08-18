/* ==========================================================================
   papers-timeline.js — "Papers over time" for publications.html

   One dot per paper in MULTEE.PAPERS, placed at its real publication date on a
   single time axis that runs from the year of the first paper to the end of the
   current year. Papers that use MuLTEE populations are filled; the foundational
   work is hollow. A marked line at 1 January 2018 (day 0, first transfer) splits
   the two eras, and a band shows the span the experiment has been running.

   HONESTY. Every date, venue, DOI and finding rendered here is read from
   multee-data.js, which carries only published values for this table. The ONE
   quantity on screen that is not data is the vertical offset of a dot: it exists
   solely so that dots close in time do not hide each other. That is stated in
   visible copy inside the plate, not only in a comment. The right edge of the
   running band is today's date from the reader's clock, which is operational
   rather than published, and is labelled as such.

   The widget lives on a --void plate. site.css states the rule this follows:
   "The void is never themed". The theme colours in MULTEE.THEMES are emission
   hues chosen for a black field (--cyan measures 1.9:1 on the light page
   background), so putting the colour-coded parts on black is what keeps them
   legible in both themes rather than a way of dodging the theme. Colours are
   still read from custom properties and re-read when the theme changes.

   Plain global script. No modules, no libraries. Loads after multee-data.js.
   ========================================================================== */
(function () {
  'use strict';

  var mount = document.getElementById('paper-timeline');
  if (!mount) return;
  /* No data layer means the same outcome as no JavaScript: leave the static
     fallback in place and let the two lists below carry the page. */
  if (!window.MULTEE || !MULTEE.PAPERS || !MULTEE.PAPERS.length) return;

  var PAPERS = MULTEE.PAPERS.slice().sort(function (a, b) { return a.calDay - b.calDay; });
  var THEMES = MULTEE.THEMES;

  /* ------------------------------------------------------------- time domain */
  function tOf(dateStr) { return new Date(dateStr + 'T00:00:00Z').getTime(); }
  var TS = PAPERS.map(function (p) { return tOf(p.date); });
  var START_YEAR = new Date(TS[0]).getUTCFullYear();
  var NOW = Date.now();
  /* The domain runs past today to the end of the current year so the running
     band visibly terminates inside the plot instead of being cut by its edge. */
  var END_YEAR = new Date(NOW).getUTCFullYear() + 1;
  var T0 = Date.UTC(START_YEAR, 0, 1);
  var T1 = Date.UTC(END_YEAR, 0, 1);
  var DAY0 = Date.UTC(2018, 0, 1);

  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function longDate(ms) {
    var d = new Date(ms);
    return d.getUTCDate() + ' ' + MONTHS[d.getUTCMonth()] + ' ' + d.getUTCFullYear();
  }

  /* ------------------------------------------------------------------- build */
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  mount.textContent = '';

  var plate = el('div', 'pt-plate plate');

  /* ---- filters (double as the theme legend, so the swatches sit on void) */
  var themeKeys = Object.keys(THEMES).filter(function (k) {
    return PAPERS.some(function (p) { return p.theme === k; });
  });

  var filterBar = el('div', 'pt-filters');
  var filterGroup = el('div', 'pt-filter-group');
  filterGroup.setAttribute('role', 'group');
  filterGroup.setAttribute('aria-label', 'Filter papers by theme');
  filterBar.appendChild(el('span', 'pt-filters-label', 'Theme'));
  filterBar.appendChild(filterGroup);

  var filterBtns = [];
  function makeFilter(key, label, count) {
    var b = el('button', 'pt-filter');
    b.type = 'button';
    b.setAttribute('aria-pressed', key === 'all' ? 'true' : 'false');
    if (key === 'all') b.classList.add('is-on');
    b.dataset.key = key;
    if (key !== 'all') {
      var sw = el('span', 'pt-swatch');
      sw.style.color = THEMES[key].color;
      b.appendChild(sw);
    }
    b.appendChild(el('span', 'pt-filter-text', label));
    b.appendChild(el('span', 'pt-filter-count', String(count)));
    b.addEventListener('click', function () { setFilter(key); });
    filterGroup.appendChild(b);
    filterBtns.push(b);
  }
  makeFilter('all', 'All', PAPERS.length);
  themeKeys.forEach(function (k) {
    makeFilter(k, THEMES[k].label, PAPERS.filter(function (p) { return p.theme === k; }).length);
  });

  /* ---- plot */
  var wrap = el('div', 'pt-wrap');
  var cv = el('canvas', 'pt-canvas');
  cv.setAttribute('aria-hidden', 'true');
  cv.appendChild(document.createTextNode(
    'Time axis from ' + START_YEAR + ' to ' + (END_YEAR - 1) +
    ', marked at 1 January 2018, the first transfer.'));
  var dots = el('div', 'pt-dots');
  dots.setAttribute('role', 'group');
  dots.setAttribute('aria-label',
    'Publications by date. ' + PAPERS.length + ' papers. Use the left and right arrow keys to move ' +
    'between them, Enter to open the DOI.');
  wrap.appendChild(cv);
  wrap.appendChild(dots);

  /* ---- legend */
  var legend = el('div', 'pt-legend');
  function legendItem(cls, text) {
    var i = el('span', 'pt-legend-item');
    i.appendChild(el('span', 'pt-legend-dot ' + cls));
    i.appendChild(el('span', null, text));
    return i;
  }
  legend.appendChild(legendItem('is-multee', 'Filled: uses MuLTEE populations'));
  legend.appendChild(legendItem('is-found', 'Hollow: foundational, before or beside the experiment'));

  /* ---- card */
  var card = el('div', 'pt-card');
  card.setAttribute('aria-hidden', 'true');   /* duplicates each dot's own label */
  var cMeta = el('p', 'pt-card-meta');
  var cSwatch = el('span', 'pt-swatch');
  var cTheme = el('span', 'pt-card-theme');
  var cKind = el('span', 'pt-card-kind');
  var cDate = el('span', 'pt-card-date');
  cMeta.appendChild(cSwatch); cMeta.appendChild(cTheme);
  cMeta.appendChild(cKind); cMeta.appendChild(cDate);
  var cTitle = el('h3', 'pt-card-title');
  var cCite = el('p', 'pt-card-cite');
  var cFinding = el('p', 'pt-card-finding');
  var cDoi = el('p', 'pt-card-doi');
  card.appendChild(cMeta); card.appendChild(cTitle); card.appendChild(cCite);
  card.appendChild(cFinding); card.appendChild(cDoi);

  var note = el('p', 'pt-note',
    'Vertical position carries no meaning. Dots are nudged off the line only so that ' +
    'papers published within a few weeks of each other stay visible. Horizontal position ' +
    'is the real publication date.');

  plate.appendChild(filterBar);
  plate.appendChild(wrap);
  plate.appendChild(legend);
  plate.appendChild(card);
  plate.appendChild(note);
  mount.appendChild(plate);

  /* ------------------------------------------------------------------- dots */
  var nodes = PAPERS.map(function (p, i) {
    var a = document.createElement('a');
    a.className = 'pt-dot' + (p.multee ? ' is-multee' : ' is-found');
    a.href = 'https://doi.org/' + p.doi;
    a.rel = 'noopener';
    a.style.color = (THEMES[p.theme] || {}).color || 'var(--on-void)';
    a.dataset.i = String(i);
    a.tabIndex = i === PAPERS.length - 1 ? 0 : -1;

    var name = el('span', 'visually-hidden',
      p.short + ': ' + p.title + '. ' +
      (p.multee ? 'Uses MuLTEE populations.' : 'Foundational, does not use MuLTEE populations.'));
    a.appendChild(name);

    var desc = el('span', 'visually-hidden');
    desc.id = 'pt-desc-' + i;
    desc.hidden = true;
    desc.textContent = longDate(TS[i]) + '. ' + p.venue + '. ' +
      (THEMES[p.theme] ? THEMES[p.theme].label + ' theme. ' : '') + p.finding;
    a.setAttribute('aria-describedby', desc.id);
    a.appendChild(desc);

    a.addEventListener('mouseenter', function () { select(i, false); });
    a.addEventListener('focus', function () { select(i, false); });
    dots.appendChild(a);
    return a;
  });

  var sel = PAPERS.length - 1;

  function select(i, moveFocus) {
    sel = i;
    nodes.forEach(function (n, j) {
      n.classList.toggle('pt-on', j === i);
      n.tabIndex = j === i ? 0 : -1;
    });
    var p = PAPERS[i];
    var th = THEMES[p.theme];
    cSwatch.style.color = (th || {}).color || 'var(--on-void)';
    cTheme.textContent = th ? th.label : '';
    cKind.textContent = p.multee ? 'Uses MuLTEE populations' : 'Foundational';
    cKind.className = 'pt-card-kind' + (p.multee ? ' is-multee' : '');
    cDate.textContent = longDate(TS[i]);
    cTitle.textContent = p.title;
    cCite.textContent = p.short + ' · ' + p.venue;
    cFinding.textContent = p.finding;
    cDoi.textContent = (p.doi.indexOf('10.1101/') === 0 ? 'Preprint DOI ' : 'DOI ') +
      'doi.org/' + p.doi + ' · click or press Enter on the dot to open it';
    if (moveFocus) nodes[i].focus();
  }

  dots.addEventListener('keydown', function (e) {
    var d = 0;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') d = 1;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') d = -1;
    else if (e.key === 'Home') { e.preventDefault(); select(0, true); return; }
    else if (e.key === 'End') { e.preventDefault(); select(PAPERS.length - 1, true); return; }
    if (!d) return;
    e.preventDefault();
    var next = Math.min(PAPERS.length - 1, Math.max(0, sel + d));
    select(next, true);
  });

  /* ----------------------------------------------------------------- filters */
  var filter = 'all';
  function setFilter(key) {
    filter = key;
    filterBtns.forEach(function (b) {
      var on = b.dataset.key === key;
      /* aria-pressed carries the semantics; .is-on carries the paint. They are
         set together and the stylesheet honours either, so the pressed state a
         reader sees and the one a screen reader hears cannot drift apart. */
      b.setAttribute('aria-pressed', String(on));
      b.classList.toggle('is-on', on);
    });
    nodes.forEach(function (n, i) {
      n.classList.toggle('pt-dim', key !== 'all' && PAPERS[i].theme !== key);
    });
  }

  /* ------------------------------------------------------------------ colours
     Read from the plate, so the void-scoped overrides in page-publications.css
     are what canvas and CSS both see. */
  var C = {};
  function readColors() {
    var s = getComputedStyle(plate);
    function v(n, fb) { return (s.getPropertyValue(n) || '').trim() || fb; }
    C.ink = v('--on-void', '#E6E9EC');
    C.dim = v('--on-void-dim', '#96A0A8');
    C.rule = v('--on-void-rule', '#2A3036');
    C.amber = v('--amber', '#F79A2E');
    C.cyan = v('--cyan', '#24E3F2');
  }
  readColors();

  /* -------------------------------------------------------------------- geom */
  var G = null;

  function beeswarm(pos, r, gap) {
    var step = 2 * r + gap, minD = 2 * r + gap, out = [];
    for (var i = 0; i < pos.length; i++) {
      var k = 0, chosen = null;
      while (chosen === null) {
        var cands = k === 0 ? [0] : [k * step, -k * step];
        for (var c = 0; c < cands.length && chosen === null; c++) {
          var off = cands[c], ok = true;
          for (var j = 0; j < i; j++) {
            var dt = pos[i] - pos[j], doff = off - out[j];
            if (dt * dt + doff * doff < minD * minD) { ok = false; break; }
          }
          if (ok) chosen = off;
        }
        k++;
        if (k > 200) chosen = 0;
      }
      out.push(chosen);
    }
    return out;
  }

  function frac(t) { return (t - T0) / (T1 - T0); }

  function relayout() {
    var w = wrap.clientWidth || 600;
    var vertical = w < 700;
    var years = END_YEAR - START_YEAR;
    var g = { vertical: vertical, w: w, r: 8 };

    if (vertical) {
      g.h = Math.max(520, Math.round(58 * years));
      g.padL = 56; g.padR = 14; g.padT = 30; g.padB = 26;
      g.span = g.h - g.padT - g.padB;
      g.axis = g.padL;
      g.center = g.padL + (w - g.padL - g.padR) / 2;
      g.at = function (t) { return g.padT + frac(t) * g.span; };
    } else {
      g.h = 320;
      g.padL = 16; g.padR = 16; g.padT = 40; g.padB = 44;
      g.span = w - g.padL - g.padR;
      g.axis = g.h - g.padB;
      g.center = g.padT + (g.axis - g.padT) / 2;
      g.at = function (t) { return g.padL + frac(t) * g.span; };
    }

    g.pos = TS.map(g.at);
    g.off = beeswarm(g.pos, g.r, 4);
    G = g;

    /* Only write when it changes: this runs inside the ResizeObserver callback,
       and an unconditional write re-triggers the observer. */
    var hpx = g.h + 'px';
    if (wrap.style.height !== hpx) wrap.style.height = hpx;
    nodes.forEach(function (n, i) {
      if (vertical) {
        n.style.left = (g.center + g.off[i]) + 'px';
        n.style.top = g.pos[i] + 'px';
      } else {
        n.style.left = g.pos[i] + 'px';
        n.style.top = (g.center + g.off[i]) + 'px';
      }
    });
    draw();
  }

  /* -------------------------------------------------------------------- draw */
  function mono(px, weight) {
    return (weight || 400) + ' ' + px + 'px "IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, monospace';
  }

  function draw() {
    if (!G) return;
    var dpr = Math.min(window.devicePixelRatio || 1, 3);
    var w = G.w, h = G.h;
    cv.width = Math.max(1, Math.round(w * dpr));
    cv.height = Math.max(1, Math.round(h * dpr));
    cv.style.width = w + 'px';
    cv.style.height = h + 'px';
    var c = cv.getContext('2d');
    if (!c) return;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, w, h);

    var a0 = G.at(DAY0), aNow = G.at(NOW);

    if (!G.vertical) {
      /* running band */
      c.fillStyle = C.rule;
      c.globalAlpha = 0.55;
      c.fillRect(a0, G.padT - 12, aNow - a0, G.axis - G.padT + 12);
      c.globalAlpha = 1;

      /* axis */
      c.strokeStyle = C.rule;
      c.lineWidth = 1;
      c.beginPath();
      c.moveTo(G.padL, G.axis + 0.5); c.lineTo(w - G.padR, G.axis + 0.5);
      c.stroke();

      /* year ticks */
      var ppy = G.span / (END_YEAR - START_YEAR);
      var everyN = ppy < 44 ? 2 : 1;
      c.font = mono(10, 500);
      c.textBaseline = 'top';
      for (var y = START_YEAR; y <= END_YEAR; y++) {
        var x = G.at(Date.UTC(y, 0, 1));
        c.strokeStyle = C.rule;
        c.beginPath();
        c.moveTo(Math.round(x) + 0.5, G.axis);
        c.lineTo(Math.round(x) + 0.5, G.axis + ((y - START_YEAR) % everyN === 0 ? 7 : 4));
        c.stroke();
        if ((y - START_YEAR) % everyN === 0 && y < END_YEAR) {
          c.fillStyle = C.dim;
          c.textAlign = y === START_YEAR ? 'left' : 'center';
          c.fillText(String(y), x, G.axis + 11);
        }
      }

      /* today edge */
      c.strokeStyle = C.dim;
      c.setLineDash([2, 3]);
      c.beginPath();
      c.moveTo(Math.round(aNow) + 0.5, G.padT - 12);
      c.lineTo(Math.round(aNow) + 0.5, G.axis);
      c.stroke();
      c.setLineDash([]);
      c.fillStyle = C.dim;
      c.font = mono(9.5, 500);
      /* Flip the label inside the line when the domain's tail is too short to
         hold it, which happens in January. */
      var todayFits = aNow + 5 + c.measureText('TODAY').width < w - G.padR;
      c.textAlign = todayFits ? 'left' : 'right';
      c.fillText('TODAY', aNow + (todayFits ? 5 : -5), G.padT - 10);

      /* band label */
      c.fillStyle = C.dim;
      c.textAlign = 'left';
      c.fillText('MuLTEE RUNNING', a0 + 7, G.axis - 15);

      /* day 0 */
      c.strokeStyle = C.amber;
      c.lineWidth = 1.5;
      c.beginPath();
      c.moveTo(Math.round(a0) + 0.5, G.padT - 20);
      c.lineTo(Math.round(a0) + 0.5, G.axis);
      c.stroke();
      c.fillStyle = C.amber;
      c.font = mono(10, 500);
      c.textAlign = 'left';
      c.fillText('DAY 0  ·  1 JAN 2018  ·  FIRST TRANSFER', a0 + 7, G.padT - 26);
      c.textAlign = 'right';
      c.fillStyle = C.dim;
      c.font = mono(9.5, 500);
      c.fillText('BEFORE THE EXPERIMENT', a0 - 7, G.padT - 24);
    } else {
      var right = w - G.padR;
      c.fillStyle = C.rule;
      c.globalAlpha = 0.55;
      c.fillRect(G.padL, a0, right - G.padL, aNow - a0);
      c.globalAlpha = 1;

      c.strokeStyle = C.rule;
      c.lineWidth = 1;
      c.beginPath();
      c.moveTo(G.padL + 0.5, G.padT); c.lineTo(G.padL + 0.5, G.h - G.padB);
      c.stroke();

      c.font = mono(10, 500);
      c.textBaseline = 'middle';
      c.textAlign = 'right';
      for (var yv = START_YEAR; yv <= END_YEAR; yv++) {
        var yy = G.at(Date.UTC(yv, 0, 1));
        c.strokeStyle = C.rule;
        c.beginPath();
        c.moveTo(G.padL - 6, Math.round(yy) + 0.5);
        c.lineTo(G.padL, Math.round(yy) + 0.5);
        c.stroke();
        if (yv < END_YEAR) {
          c.fillStyle = C.dim;
          c.fillText(String(yv), G.padL - 10, yy);
        }
      }

      c.strokeStyle = C.dim;
      c.setLineDash([2, 3]);
      c.beginPath();
      c.moveTo(G.padL, Math.round(aNow) + 0.5);
      c.lineTo(right, Math.round(aNow) + 0.5);
      c.stroke();
      c.setLineDash([]);
      c.fillStyle = C.dim;
      c.font = mono(9.5, 500);
      c.textAlign = 'right';
      c.textBaseline = 'top';
      c.fillText('TODAY', right, aNow + 5);

      c.strokeStyle = C.amber;
      c.lineWidth = 1.5;
      c.beginPath();
      c.moveTo(G.padL, Math.round(a0) + 0.5);
      c.lineTo(right, Math.round(a0) + 0.5);
      c.stroke();
      c.fillStyle = C.amber;
      c.font = mono(9.5, 500);
      c.textAlign = 'right';
      c.textBaseline = 'bottom';
      c.fillText('DAY 0 · 1 JAN 2018 · FIRST TRANSFER', right, a0 - 4);
    }
  }

  /* ---------------------------------------------------------------- lifecycle */
  select(sel, false);
  relayout();

  /* Synchronous on purpose. Deferring through requestAnimationFrame left the
     canvas holding a layout one reflow out of date: the web font loads, --measure
     is 68ch of a different font, the column narrows, and the canvas keeps drawing
     the axis at the old width. Every entry point below recomputes the geometry
     rather than repainting the old one, so the canvas can never disagree with the
     dots sitting on top of it. */
  var busy = false;
  function schedule() {
    if (busy) return;
    busy = true;
    try { relayout(); } finally { busy = false; }
  }
  if ('ResizeObserver' in window) {
    new ResizeObserver(schedule).observe(wrap);
  } else {
    window.addEventListener('resize', schedule);
  }
  window.addEventListener('load', schedule);
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(schedule);
  }
  setTimeout(schedule, 400);
  setTimeout(schedule, 1500);

  /* Re-read colours whenever the theme changes. Inside the void they are the
     same in both themes by design, but the widget must not assume that. */
  var mo = new MutationObserver(function () { readColors(); schedule(); });
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  var mq = window.matchMedia('(prefers-color-scheme: dark)');
  var onScheme = function () { readColors(); schedule(); };
  if (mq.addEventListener) mq.addEventListener('change', onScheme);
  else if (mq.addListener) mq.addListener(onScheme);
})();
