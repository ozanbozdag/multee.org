/* ==========================================================================
   transfer-engine.js — the settling-selection simulator on experiment.html.

   WHAT IS REAL AND WHAT IS NOT
   ---------------------------------------------------------------------------
   Nothing drawn on the canvas is a measurement. The vessel, the clusters, the
   settling speeds and the size distribution are a schematic of the mechanism:
   bigger settles faster, the bottom fraction is carried forward, and size is
   heritable. Sizes are expressed only as multiples of the starting mean, never
   in micrometres, and no settling duration is shown anywhere, because the
   MuLTEE's settling window is not stated in any source the site holds.

   The one set of measured numbers on this widget (16 um -> 434 um over 600
   transfers) is read out of window.MULTEE.RADIUS and is printed in the caption,
   outside the canvas, with its citation.

   Plain global, no modules, no build step. Loads after multee-data.js.
   ========================================================================== */
(function () {
  'use strict';

  /* ------------------------------------------------------------ parameters
     All schematic. Chosen so that the rightward shift of the distribution is
     legible in about 15 transfers, not to match any measured rate. */
  var N          = 40;    // clusters drawn in the vessel
  var K          = 12;    // clusters the pipette carries forward each transfer
  var SEED       = 1;     // fixed, so Reset gives the same run every time
  var LINE       = 0.80;  // transfer line, as a fraction of column depth
  var Y_TOP      = 0.04;  // a mixed culture: clusters start spread through the
  var Y_BOT      = 0.68;  // upper part of the column, all above the line
  var SIGMA0     = 0.20;  // spread of the starting size distribution, in log units
  var EXPO       = 1.2;   // settling speed rises with size to this power. SCHEMATIC.
  var DRAG_SD    = 0.25;  // cluster-to-cluster variation in how well it sinks
  var MUT_SD     = 0.05;  // heritable size plus a little variation on regrowth
  var MAX_T      = 20;    // the run stops here so the drawing stays in scale

  var UNIT_MS    = 7000;  // wall-clock scale for the fall. Never displayed.
  var HOLD_MS    = 900;   // pause on the selected state
  var REGROW_MS  = 550;

  var LOG_MIN = -1.2, LOG_MAX = 3.2, NBINS = 22;   // histogram, log2 of size

  /* ------------------------------------------------------------------- rng
     mulberry32. Deterministic, so Reset reproduces the run exactly and a
     screenshot of transfer 15 is the same transfer 15 every time. */
  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function makeRng(seed) {
    var u = mulberry32(seed), spare = null;
    return {
      u: u,
      gauss: function () {                       // Box-Muller, one spare cached
        if (spare !== null) { var s = spare; spare = null; return s; }
        var a = Math.max(u(), 1e-12), b = u();
        var r = Math.sqrt(-2 * Math.log(a));
        spare = r * Math.sin(2 * Math.PI * b);
        return r * Math.cos(2 * Math.PI * b);
      }
    };
  }

  /* ----------------------------------------------------------------- model */
  function createModel() {
    var rng, cells, startSizes, tStar, transfer;

    function makeShape() {
      // A cluster is drawn as a central blob with a few lobes budded off it.
      var n = 5 + Math.floor(rng.u() * 3), lobes = [], i;
      for (i = 0; i < n; i++) {
        lobes.push({
          a: (i / n) * Math.PI * 2 + rng.u() * 0.7,
          d: 0.55 + rng.u() * 0.45,
          s: 0.40 + rng.u() * 0.22
        });
      }
      return lobes;
    }

    function makeCell(size) {
      return { size: size, lobes: makeShape(), x: 0.14 + rng.u() * 0.72,
               y: 0, rest: 0, vel: 0, need: 0, keep: false, spin: rng.u() * 6.283 };
    }

    /* Lay the mixed culture out and work out, deterministically, how far the
       settling window has to run before the pipette volume is full. */
    function prepare() {
      var needs = [], i, c;
      for (i = 0; i < N; i++) {
        c = cells[i];
        c.x    = 0.14 + rng.u() * 0.72;
        c.y    = Y_TOP + rng.u() * (Y_BOT - Y_TOP);
        c.rest = 0.90 + rng.u() * 0.065;          // where a cluster lands in the pellet
        c.vel  = Math.pow(c.size, EXPO) * Math.exp(rng.gauss() * DRAG_SD);
        c.need = (LINE - c.y) / c.vel;            // model time to reach the line
        c.keep = false;
        needs.push(c.need);
      }
      needs.sort(function (a, b) { return a - b; });
      tStar = needs[Math.min(K, N) - 1] * 1.02;
      for (i = 0; i < N; i++) cells[i].keep = cells[i].need <= tStar;
    }

    function reset() {
      rng = makeRng(SEED);
      cells = [];
      for (var i = 0; i < N; i++) cells.push(makeCell(Math.exp(rng.gauss() * SIGMA0)));
      startSizes = cells.map(function (c) { return c.size; });
      transfer = 1;
      prepare();
    }

    /* The retained fraction regrows to a full culture. Size is inherited from
       the parent with a little variation; nothing else carries over. */
    function regrow() {
      var kept = cells.filter(function (c) { return c.keep; });
      if (!kept.length) kept = cells.slice(0, 1);
      var next = [];
      for (var i = 0; i < N; i++) {
        var p = kept[i % kept.length];
        next.push(makeCell(p.size * Math.exp(rng.gauss() * MUT_SD)));
      }
      cells = next;
      transfer++;
      prepare();
    }

    reset();
    return {
      reset: reset,
      regrow: regrow,
      cells: function () { return cells; },
      startSizes: function () { return startSizes; },
      tStar: function () { return tStar; },
      transfer: function () { return transfer; },
      keptCount: function () {
        return cells.reduce(function (n, c) { return n + (c.keep ? 1 : 0); }, 0);
      },
      meanSize: function () {
        return cells.reduce(function (s, c) { return s + c.size; }, 0) / cells.length;
      }
    };
  }

  if (typeof document === 'undefined') {         // node can require the model
    if (typeof module === 'object' && module.exports) {
      module.exports = { createModel: createModel, N: N, K: K, MAX_T: MAX_T };
    }
    return;
  }

  /* ------------------------------------------------------------------ view */
  function init() {
    var root = document.getElementById('transfer-engine');
    if (!root) return;
    var canvas = root.querySelector('canvas');
    if (!canvas || !canvas.getContext) return;
    var ctx = canvas.getContext('2d');
    if (!ctx) return;

    var btnPlay  = root.querySelector('[data-te="play"]');
    var btnStep  = root.querySelector('[data-te="step"]');
    var btnReset = root.querySelector('[data-te="reset"]');
    var statusEl = root.querySelector('[data-te="status"]');
    var rmNote   = root.querySelector('[data-te="rmnote"]');

    var model = createModel();
    var W = 0, H = 0;
    var phase = 'hold';        // 'settle' | 'hold' | 'regrow' | 'done'
    var modelT = 0;            // how far into the settling window we are
    var phaseStart = 0;
    var playing = false;
    var raf = null;

    var mqMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    function reduced() { return mqMotion.matches; }

    /* ---------------------------------------------------------- palette
       Read from the custom properties, never hardcoded, and re-read whenever
       the theme changes so the widget is correct in both themes. */
    var P = {};
    function readPalette() {
      var cs = getComputedStyle(document.documentElement);
      function v(n, fallback) { return (cs.getPropertyValue(n) || '').trim() || fallback; }
      P.ink    = v('--ink', '#E6E9EC');
      P.dim    = v('--ink-dim', '#96A0A8');
      P.rule   = v('--rule', '#1E2226');
      P.accent = v('--accent', '#24E3F2');
      P.amber  = v('--amber-ink', '#F79A2E');
      P.surface = v('--surface', '#101317');
    }
    /* rgba() from a #rgb / #rrggbb token so opacity can be applied to a
       themed colour without knowing which theme is live. */
    function a(hex, alpha) {
      var h = hex.replace('#', '');
      if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
      var n = parseInt(h, 16);
      if (isNaN(n) || h.length !== 6) return hex;
      return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + alpha + ')';
    }

    /* ------------------------------------------------------------ sizing */
    function resize() {
      var rect = canvas.getBoundingClientRect();
      W = Math.max(240, Math.round(rect.width));
      H = Math.max(200, Math.round(rect.height));
      var dpr = Math.min(window.devicePixelRatio || 1, 3);
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      draw();
    }

    /* ------------------------------------------------------------ drawing */
    function mono(px, weight) {
      ctx.font = (weight || 400) + ' ' + px + 'px "IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, monospace';
    }

    function drawCluster(c, cx, cy, r, stroke, fill, lw) {
      if (r < 2.6) {                       // too small to read as a shape
        ctx.beginPath(); ctx.arc(cx, cy, Math.max(1.4, r), 0, 6.2832);
        ctx.fillStyle = stroke; ctx.fill();
        return;
      }
      ctx.lineWidth = lw;
      ctx.strokeStyle = stroke;
      ctx.fillStyle = fill;
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.52, 0, 6.2832);
      ctx.closePath();
      for (var i = 0; i < c.lobes.length; i++) {
        var L = c.lobes[i], ang = L.a + c.spin;
        ctx.moveTo(cx + Math.cos(ang) * L.d * r + L.s * r, cy + Math.sin(ang) * L.d * r);
        ctx.arc(cx + Math.cos(ang) * L.d * r, cy + Math.sin(ang) * L.d * r, L.s * r, 0, 6.2832);
      }
      ctx.fill();
      ctx.stroke();
    }

    function bin(sizes) {
      var counts = new Array(NBINS), i;
      for (i = 0; i < NBINS; i++) counts[i] = 0;
      for (i = 0; i < sizes.length; i++) {
        var t = (Math.log(sizes[i]) / Math.LN2 - LOG_MIN) / (LOG_MAX - LOG_MIN);
        var b = Math.floor(t * NBINS);
        if (b < 0) b = 0;
        if (b > NBINS - 1) b = NBINS - 1;       // overflow lands in the last bin
        counts[b]++;
      }
      return counts;
    }

    function draw() {
      if (!W || !H) return;
      var narrow = W < 470;
      var fs = narrow ? 9.5 : 10.5;
      var pad = narrow ? 9 : 14;
      var headRoom = fs + 8;
      var footRoom = narrow ? 40 : 44;

      ctx.clearRect(0, 0, W, H);

      var vw = Math.max(66, Math.min(W * 0.30, 170));
      var vx = pad, vy = pad + headRoom;
      var vh = H - vy - pad - footRoom;
      if (vh < 80) vh = Math.max(60, H - vy - pad - 20);

      var colTop = vy + 5, colBot = vy + vh - 5;
      var colSpan = colBot - colTop;
      function fy(f) { return colTop + f * colSpan; }

      var cells = model.cells();
      var lineY = fy(LINE);

      /* -------------------------------------------------------- vessel */
      var rad = Math.min(12, vw * 0.18);
      ctx.beginPath();
      ctx.moveTo(vx, vy);
      ctx.lineTo(vx, vy + vh - rad);
      ctx.quadraticCurveTo(vx, vy + vh, vx + rad, vy + vh);
      ctx.lineTo(vx + vw - rad, vy + vh);
      ctx.quadraticCurveTo(vx + vw, vy + vh, vx + vw, vy + vh - rad);
      ctx.lineTo(vx + vw, vy);
      ctx.fillStyle = a(P.ink, 0.035);
      ctx.fill();

      ctx.save();
      ctx.clip();

      /* clusters. Radius is proportional to size, so a cluster that is twice
         the size is drawn twice as wide. Overlap is left alone: a settled
         pellet does overlap in projection. */
      var base = vw * 0.052;
      var settled = (phase === 'hold' || phase === 'regrow' || phase === 'done');
      var fade = phase === 'regrow'
        ? Math.max(0, 1 - (now() - phaseStart) / REGROW_MS) : 1;

      for (var i = 0; i < cells.length; i++) {
        var c = cells[i];
        var y = Math.min(c.y + c.vel * modelT, c.rest);
        var cx = vx + c.x * vw, cy = fy(y);
        var r = base * c.size;
        if (settled && c.keep) {
          drawCluster(c, cx, cy, r, P.accent, a(P.accent, 0.22), 1.4);
        } else if (settled) {
          ctx.globalAlpha = fade;
          drawCluster(c, cx, cy, r, a(P.dim, 0.55), a(P.dim, 0.06), 1);
          ctx.globalAlpha = 1;
        } else {
          drawCluster(c, cx, cy, r, a(P.ink, 0.62), a(P.ink, 0.10), 1);
        }
      }
      ctx.restore();

      /* transfer line */
      ctx.save();
      ctx.setLineDash([]);
      ctx.strokeStyle = P.amber;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(vx - 3, lineY);
      ctx.lineTo(vx + vw + 3, lineY);
      ctx.stroke();
      ctx.restore();

      /* vessel outline, drawn last so clusters never sit on top of it */
      ctx.beginPath();
      ctx.moveTo(vx, vy);
      ctx.lineTo(vx, vy + vh - rad);
      ctx.quadraticCurveTo(vx, vy + vh, vx + rad, vy + vh);
      ctx.lineTo(vx + vw - rad, vy + vh);
      ctx.quadraticCurveTo(vx + vw, vy + vh, vx + vw, vy + vh - rad);
      ctx.lineTo(vx + vw, vy);
      ctx.strokeStyle = a(P.dim, 0.75);
      ctx.lineWidth = 1;
      ctx.stroke();

      /* vessel labels. The line label sits under the vessel, not beside the
         line, where it would be printed over the settled pellet. */
      mono(fs, 500);
      ctx.fillStyle = P.dim;
      ctx.textBaseline = 'alphabetic';
      ctx.textAlign = 'left';
      ctx.fillText(narrow ? 'VESSEL' : 'SETTLING VESSEL', vx, vy - 6);

      var small = narrow ? 8.5 : 9.5;
      mono(small, 400);
      var lineLabel = 'TRANSFER LINE';
      if (ctx.measureText(lineLabel).width > vw - 14) lineLabel = 'LINE';
      ctx.strokeStyle = P.amber;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(vx, vy + vh + 11); ctx.lineTo(vx + 9, vy + vh + 11); ctx.stroke();
      ctx.fillStyle = P.amber;
      ctx.fillText(lineLabel, vx + 13, vy + vh + 14);

      var keptLabel = 'KEPT', dropLabel = ' / DISCARDED';
      ctx.fillStyle = P.accent;
      ctx.fillText(keptLabel, vx, vy + vh + 27);
      var kw = ctx.measureText(keptLabel).width;
      if (kw + ctx.measureText(dropLabel).width < vw) {
        ctx.fillStyle = a(P.dim, 0.95);
        ctx.fillText(dropLabel, vx + kw, vy + vh + 27);
      }

      /* ----------------------------------------------------- histogram */
      var gap = narrow ? 16 : 30;
      var hx0 = vx + vw + gap;
      var hx1 = W - pad;
      var hw = hx1 - hx0;
      if (hw < 70) return;
      var hy1 = vy + vh;                  // baseline
      var hy0 = vy + 4;
      var hh = hy1 - hy0;

      var live  = bin(cells.map(function (c) { return c.size; }));
      var ghost = bin(model.startSizes());
      var peak = 6, j;
      for (j = 0; j < NBINS; j++) {
        if (live[j] > peak) peak = live[j];
        if (ghost[j] > peak) peak = ghost[j];
      }
      var bw = hw / NBINS;
      function bx(j) { return hx0 + j * bw; }
      function by(n) { return hy1 - (n / peak) * hh; }

      /* baseline and octave ticks */
      ctx.strokeStyle = a(P.dim, 0.45);
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(hx0, hy1 + 0.5); ctx.lineTo(hx1, hy1 + 0.5); ctx.stroke();

      mono(narrow ? 8.5 : 9.5, 400);
      ctx.fillStyle = P.dim;
      ctx.textAlign = 'center';
      var ticks = narrow ? [0, 1, 2, 3] : [-1, 0, 1, 2, 3];
      for (j = 0; j < ticks.length; j++) {
        var tx = hx0 + ((ticks[j] - LOG_MIN) / (LOG_MAX - LOG_MIN)) * hw;
        ctx.strokeStyle = a(P.dim, 0.3);
        ctx.beginPath(); ctx.moveTo(tx, hy1); ctx.lineTo(tx, hy1 + 4); ctx.stroke();
        ctx.fillText('×' + (ticks[j] < 0 ? '0.5' : Math.pow(2, ticks[j])), tx, hy1 + 14);
      }

      /* live bars */
      ctx.fillStyle = a(P.accent, 0.28);
      ctx.strokeStyle = P.accent;
      ctx.lineWidth = 1;
      for (j = 0; j < NBINS; j++) {
        if (!live[j]) continue;
        var y0 = by(live[j]);
        ctx.fillRect(bx(j) + 0.5, y0, bw - 1, hy1 - y0);
        ctx.strokeRect(bx(j) + 0.5, y0 + 0.5, bw - 1, hy1 - y0);
      }

      /* ghost: the starting distribution, dashed and hollow, never filled, so
         it can never be mistaken for the live one. Drawn over the bars so that
         at transfer 1, where the two coincide, the outline is still visible. */
      ctx.save();
      ctx.setLineDash([4, 3]);
      ctx.strokeStyle = a(P.dim, 0.95);
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(bx(0), hy1);
      for (j = 0; j < NBINS; j++) {
        ctx.lineTo(bx(j), by(ghost[j]));
        ctx.lineTo(bx(j + 1), by(ghost[j]));
      }
      ctx.lineTo(bx(NBINS), hy1);
      ctx.stroke();
      ctx.restore();

      /* mean markers: hollow caret for the start, filled caret for now */
      function caret(size, filled, col) {
        var mx = hx0 + ((Math.log(size) / Math.LN2 - LOG_MIN) / (LOG_MAX - LOG_MIN)) * hw;
        ctx.beginPath();
        ctx.moveTo(mx, hy1 - 1);
        ctx.lineTo(mx - 4, hy1 - 8);
        ctx.lineTo(mx + 4, hy1 - 8);
        ctx.closePath();
        if (filled) { ctx.fillStyle = col; ctx.fill(); }
        else { ctx.strokeStyle = col; ctx.lineWidth = 1.2; ctx.stroke(); }
      }
      var startMean = model.startSizes().reduce(function (s, v) { return s + v; }, 0) / N;
      caret(startMean, false, a(P.dim, 0.95));
      caret(model.meanSize(), true, P.accent);

      /* histogram labels */
      mono(fs, 500);
      ctx.fillStyle = P.dim;
      ctx.textAlign = 'left';
      ctx.fillText(narrow ? 'SIZE SPREAD, n=' + N : 'SIZE DISTRIBUTION, ALL ' + N + ' CLUSTERS',
                   hx0, vy - 6);
      mono(narrow ? 8.5 : 9.5, 400);
      /* Both curves hold the same 40 clusters. The bars get taller as the
         distribution narrows, which without this label reads as "more
         clusters". The right-hand top corner is the one region no bar
         reaches, at any point in the run. */
      ctx.fillStyle = a(P.dim, 0.95);
      ctx.textAlign = 'right';
      ctx.fillText(narrow ? 'TOP = ' + peak + '/' + N
                          : 'Y SCALE TOP = ' + peak + ' OF ' + N + ' CLUSTERS', hx1, hy0 + 9);
      ctx.textAlign = 'left';
      ctx.fillText(narrow ? 'DASHED: START, n=' + N
                          : 'DASHED OUTLINE: STARTING DISTRIBUTION, SAME ' + N + ' CLUSTERS',
                   hx0, hy1 + (narrow ? 27 : 29));
      ctx.textAlign = 'right';
      ctx.fillText(narrow ? 'SCHEMATIC' : 'SIZE RELATIVE TO START, LOG SCALE. SCHEMATIC.',
                   hx1, hy1 + (narrow ? 27 : 29));
    }

    /* ------------------------------------------------------------- status */
    function fmt(x) { return (Math.round(x * 10) / 10).toFixed(1); }
    function updateStatus() {
      if (!statusEl) return;
      statusEl.setAttribute('aria-live', playing ? 'off' : 'polite');
      var t = model.transfer();
      statusEl.textContent =
        'Transfer ' + t + ' of ' + MAX_T + '. ' +
        model.keptCount() + ' of ' + N + ' clusters below the transfer line. ' +
        'Mean size ×' + fmt(model.meanSize()) + ' of the starting mean.' +
        (t >= MAX_T && phase === 'done' ? ' Run complete.' : '');
      /* Under reduced motion the button is disabled, so it must not offer
         "Replay": Reset is the control that restarts the run there. */
      if (btnPlay) {
        btnPlay.textContent = reduced() ? 'Play'
          : (phase === 'done') ? 'Replay'
          : playing ? 'Pause' : 'Play';
      }
    }

    /* -------------------------------------------------------------- clock */
    function now() { return (window.performance && performance.now) ? performance.now() : Date.now(); }

    /* --------------------------------------------------------- transitions */
    function resolveNow() {           // finish the settling window instantly
      modelT = model.tStar();
      phase = 'hold';
      phaseStart = now();
    }

    function advance() {              // regrow, then the next transfer
      if (model.transfer() >= MAX_T) { phase = 'done'; stop(); updateStatus(); draw(); return false; }
      model.regrow();
      modelT = 0;
      return true;
    }

    function step() {                 // one discrete transfer, no animation
      stop();
      if (phase === 'done') return;   // the run is over; Replay or Reset restarts it
      if (phase === 'hold' || phase === 'regrow') {
        if (!advance()) return;
      }
      resolveNow();
      if (model.transfer() >= MAX_T) phase = 'done';
      updateStatus();
      draw();
    }

    function doReset() {
      stop();
      model.reset();
      resolveNow();
      updateStatus();
      draw();
    }

    function frame() {
      raf = null;
      if (!playing) return;
      var t = now();
      if (phase === 'settle') {
        modelT = (t - phaseStart) / UNIT_MS;
        if (modelT >= model.tStar()) { modelT = model.tStar(); phase = 'hold'; phaseStart = t; updateStatus(); }
      } else if (phase === 'hold') {
        if (t - phaseStart > HOLD_MS) { phase = 'regrow'; phaseStart = t; }
      } else if (phase === 'regrow') {
        if (t - phaseStart > REGROW_MS) {
          if (!advance()) return;
          phase = 'settle'; phaseStart = t;
          updateStatus();
        }
      }
      draw();
      if (playing) raf = requestAnimationFrame(frame);
    }

    function play() {
      if (reduced()) return;
      if (phase === 'done') { doReset(); return; }
      playing = true;
      phaseStart = now() - (phase === 'settle' ? modelT * UNIT_MS : 0);
      updateStatus();
      if (!raf) raf = requestAnimationFrame(frame);
    }
    function stop() {
      playing = false;
      if (raf) { cancelAnimationFrame(raf); raf = null; }
      updateStatus();
    }

    /* -------------------------------------------------------------- wiring */
    if (btnPlay) {
      btnPlay.addEventListener('click', function () {
        if (phase === 'done') { doReset(); return; }
        playing ? stop() : play();
      });
    }
    if (btnStep) btnStep.addEventListener('click', step);
    if (btnReset) btnReset.addEventListener('click', doReset);

    function applyMotionPref() {
      var r = reduced();
      if (r) {
        stop();
        if (btnPlay) { btnPlay.disabled = true; btnPlay.textContent = 'Play'; }
        if (rmNote) rmNote.hidden = false;
      } else {
        if (btnPlay) btnPlay.disabled = false;
        if (rmNote) rmNote.hidden = true;
      }
      updateStatus();
    }
    if (mqMotion.addEventListener) mqMotion.addEventListener('change', applyMotionPref);
    else if (mqMotion.addListener) mqMotion.addListener(applyMotionPref);

    /* theme changes: site.js stamps data-theme on <html>, and the OS setting
       can change with no attribute change at all. Watch both. */
    new MutationObserver(function () { readPalette(); draw(); })
      .observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    var mqDark = window.matchMedia('(prefers-color-scheme: dark)');
    if (mqDark.addEventListener) mqDark.addEventListener('change', function () { readPalette(); draw(); });

    if ('ResizeObserver' in window) new ResizeObserver(resize).observe(canvas);
    window.addEventListener('resize', resize);

    /* ------------------------------------------------------- measured facts
       The only measured numbers near this widget come out of the data layer,
       and only if they are flagged measured. */
    (function fillMeasured() {
      var M = window.MULTEE;
      if (!M || !M.RADIUS) return;
      var first = M.RADIUS[0], last = M.RADIUS[M.RADIUS.length - 1];
      if (!first || !last || first.measured !== true || last.measured !== true) return;
      var set = function (name, val) {
        var el = root.querySelector('[data-multee="' + name + '"]');
        if (el) el.textContent = val;
      };
      set('radius-start', String(first.um));
      set('radius-end', String(last.um));
      set('radius-days', String(last.day));
      var src = M.srcOf && M.srcOf(last.src);
      if (src && src.cite) set('radius-cite', src.cite);
    })();

    readPalette();
    root.classList.add('is-ready');
    resize();
    resolveNow();                    // transfer 1, settled, selection shown
    applyMotionPref();
    draw();

    /* Small hook so the page can be screenshotted in a known state. */
    window.TransferEngine = {
      play: play, pause: stop, step: step, reset: doReset,
      jumpTo: function (n) {
        doReset();
        for (var i = 1; i < n && model.transfer() < MAX_T; i++) step();
        draw();
      },
      state: function () {
        return { transfer: model.transfer(), phase: phase, kept: model.keptCount(),
                 mean: model.meanSize() };
      },
      /* Render one named frame without running the clock, so a still capture
         can show a mid-fall state. Used only for checking the drawing. */
      frame: function (which, frac) {
        stop();
        phase = which;
        modelT = model.tStar() * (frac == null ? 1 : frac);
        phaseStart = now();
        draw();
      }
    };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
