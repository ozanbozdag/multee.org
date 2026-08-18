/* ==========================================================================
   grow-a-body.js — GROW A BODY, populations.html only.
   A generative snowflake-yeast body plan on a 2-D canvas.

   What the model does, exactly, so the copy on the page can be checked
   against it:

     - One founding (basal) cell. Every doubling, EVERY cell makes one bud
       attempt. That is what makes the unlimited-space prediction 2^d cells
       in total and C(d,x) cells at graph distance x, the Pascal's triangle
       body plan of Ratcliff et al. 2015.
     - Candidate bud sites are points on the mother's outline, sampled at a
       fixed spacing of arc length, so a longer mother offers more distinct
       sites without the site count ever being set by hand. The daughter's axis
       always makes the same fixed branch angle with the mother's axis, turned
       away from whichever flank the site sits on. Candidate order is a
       deterministic shuffle.
     - A placement is REJECTED if the new capsule would overlap any cell other
       than its own mother. Mother and daughter are allowed to overlap at the
       bud neck: that contact is the post-division adhesion bond.
     - Cells are capsules of fixed width W whose total length is W times the
       aspect-ratio control, so the shape drawn on screen has exactly the
       aspect ratio the slider reads. The capsule's two end caps contribute W
       of that length, which is why the spine is W*(ar-1) and collapses to a
       point at ar = 1. Elongation lengthens a cell, it never fattens it.

   Nothing here is a measurement. The only measured numbers the widget touches
   are the two aspect-ratio endpoints in MULTEE.ASPECT (Yoon et al. 2025), and
   the page says in words which slider positions are those two values.

   No libraries, no modules. Loads after multee-data.js.
   ========================================================================== */
(function () {
  'use strict';

  var root = document.querySelector('[data-grow]');
  if (!root) return;

  var canvas = root.querySelector('canvas');
  var ctx = canvas && canvas.getContext && canvas.getContext('2d');
  if (!ctx) return;                       // fallback copy stays, page still reads

  /* ------------------------------------------------------------ measured data
     The two aspect-ratio endpoints come from the shared data layer so this file
     never restates a published number. If the data layer failed to load we do
     not invent them: the widget still runs, and the measured ticks are hidden. */
  var AR_LO = null, AR_HI = null, AR_SRC = '';
  if (window.MULTEE && window.MULTEE.ASPECT) {
    window.MULTEE.ASPECT.forEach(function (p) {
      if (!p.measured) return;
      if (AR_LO === null || p.value < AR_LO) AR_LO = p.value;
      if (AR_HI === null || p.value > AR_HI) AR_HI = p.value;
    });
    AR_SRC = window.MULTEE.srcOf(window.MULTEE.ASPECT[0].src).cite;
  }

  /* ------------------------------------------------------------------- PRNG
     Seeded on purpose. Math.random would give a different body on every load,
     so nobody could point at a feature of the figure and be believed. */
  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  var SEED = 7;

  /* ---------------------------------------------------------------- geometry */
  var W = 1, RAD = 0.5;                       // cell width and cap radius, fixed
  var THETA = 54 * Math.PI / 180;             // fixed branch angle
  var SPACING = 0.5;                          // bud sites every 0.5 W of outline
  var NECK = 0.6;                             // how far a bud clears the surface
  var CLEAR = 0.9;                            // min spine separation, in widths

  function spine(c) {
    return [c.x, c.y, c.x + Math.cos(c.a) * c.len, c.y + Math.sin(c.a) * c.len];
  }

  /* Shortest distance between two line segments. Two capsules of width W
     overlap exactly when their spines are closer than W. */
  function segDist(p, q) {
    var ux = p[2] - p[0], uy = p[3] - p[1];
    var vx = q[2] - q[0], vy = q[3] - q[1];
    var wx = p[0] - q[0], wy = p[1] - q[1];
    var a = ux * ux + uy * uy, b = ux * vx + uy * vy, c = vx * vx + vy * vy;
    var d = ux * wx + uy * wy, e = vx * wx + vy * wy;
    var D = a * c - b * b, sN, sD = D, tN, tD = D;
    if (D < 1e-12) { sN = 0; sD = 1; tN = e; tD = c; }
    else {
      sN = b * e - c * d; tN = a * e - b * d;
      if (sN < 0) { sN = 0; tN = e; tD = c; }
      else if (sN > sD) { sN = sD; tN = e + b; tD = c; }
    }
    if (tN < 0) { tN = 0; if (-d < 0) sN = 0; else if (-d > a) sN = sD; else { sN = -d; sD = a; } }
    else if (tN > tD) { tN = tD; if (-d + b < 0) sN = 0; else if (-d + b > a) sN = sD; else { sN = -d + b; sD = a; } }
    var sc = Math.abs(sN) < 1e-12 ? 0 : sN / sD;
    var tc = Math.abs(tN) < 1e-12 ? 0 : tN / tD;
    var dx = wx + sc * ux - tc * vx, dy = wy + sc * uy - tc * vy;
    return Math.sqrt(dx * dx + dy * dy);
  }

  /* Candidate bud sites on a mother's outline. The outline is walked at a fixed
     arc spacing, so the number of sites falls out of how long the cell is. Each
     site is pushed clear of the surface by NECK so the daughter sits outside its
     mother with a short overlap at the neck, and the daughter's axis is the
     mother's axis turned by the fixed branch angle, away from that flank. */
  function budSites(m) {
    var L = m.len, per = 2 * L + 2 * Math.PI * RAD;
    var n = Math.max(6, Math.round(per / (W * SPACING)));
    var ca = Math.cos(m.a), sa = Math.sin(m.a), out = [];
    for (var k = 0; k < n; k++) {
      var s = (k + 0.5) * per / n, lx, ly, nx, ny, t;
      if (s < L) { lx = s; ly = -RAD; nx = 0; ny = -1; }
      else if (s < L + Math.PI * RAD) {
        t = (s - L) / RAD - Math.PI / 2;
        lx = L + RAD * Math.cos(t); ly = RAD * Math.sin(t); nx = Math.cos(t); ny = Math.sin(t);
      } else if (s < 2 * L + Math.PI * RAD) {
        lx = L - (s - L - Math.PI * RAD); ly = RAD; nx = 0; ny = 1;
      } else {
        t = (s - 2 * L - Math.PI * RAD) / RAD + Math.PI / 2;
        lx = RAD * Math.cos(t); ly = RAD * Math.sin(t); nx = Math.cos(t); ny = Math.sin(t);
      }
      var sgn = ly >= 0 ? 1 : -1;
      lx += nx * RAD * NECK; ly += ny * RAD * NECK;
      out.push({ x: m.x + lx * ca - ly * sa, y: m.y + lx * sa + ly * ca, a: m.a + sgn * THETA });
    }
    return out;
  }

  function binom(d, x) {
    var r = 1;
    for (var i = 0; i < x; i++) r = r * (d - i) / (i + 1);
    return Math.round(r);
  }

  /* --------------------------------------------------------------- the growth
     Returns the placed cells, the running total after each doubling, the depth
     histogram, and how many bud attempts were refused for want of room. */
  var cache = {}, cacheKeys = [];
  function grow(ar, D) {
    var key = ar.toFixed(2) + '|' + D;
    if (cache[key]) return cache[key];

    /* The two end caps already contribute W of length, so the spine carries the
       rest. Total drawn length is W*ar: the shape's aspect ratio IS the slider. */
    var L = W * Math.max(0, ar - 1);
    var rnd = mulberry32(SEED);
    var cells = [{ x: 0, y: 0, a: -Math.PI / 2, len: L, depth: 0, parent: -1, born: 0 }];
    var byDoubling = [1];
    var refused = 0;

    for (var d = 1; d <= D; d++) {
      var n = cells.length;
      for (var i = 0; i < n; i++) {
        var m = cells[i];
        var cands = budSites(m);
        for (var k = cands.length - 1; k > 0; k--) {   // deterministic shuffle
          var j = Math.floor(rnd() * (k + 1));
          var t = cands[k]; cands[k] = cands[j]; cands[j] = t;
        }
        var placed = false;
        for (var ci = 0; ci < cands.length && !placed; ci++) {
          var cell = {
            x: cands[ci].x, y: cands[ci].y, a: cands[ci].a, len: L,
            depth: m.depth + 1, parent: i, born: d
          };
          var s1 = spine(cell), ok = true;
          for (var q = 0; q < cells.length; q++) {
            if (q === i) continue;                     // the adhesion bond
            if (segDist(s1, spine(cells[q])) < W * CLEAR) { ok = false; break; }
          }
          if (ok) { cells.push(cell); placed = true; }
        }
        if (!placed) refused++;
      }
      byDoubling.push(cells.length);
    }

    var hist = [];
    for (var h = 0; h <= D; h++) hist[h] = 0;
    cells.forEach(function (c) { hist[c.depth]++; });

    /* first doubling at which the body falls short of 2^d */
    var firstShort = 0;
    for (var g = 1; g <= D; g++) {
      if (byDoubling[g] < Math.pow(2, g)) { firstShort = g; break; }
    }

    var out = { cells: cells, byDoubling: byDoubling, hist: hist,
                refused: refused, firstShort: firstShort, D: D, ar: ar };
    cache[key] = out; cacheKeys.push(key);
    if (cacheKeys.length > 120) delete cache[cacheKeys.shift()];
    return out;
  }

  /* ---------------------------------------------------- subtrees and fracture */
  function childIndex(cells) {
    var kids = [];
    for (var i = 0; i < cells.length; i++) kids[i] = [];
    for (var j = 1; j < cells.length; j++) kids[cells[j].parent].push(j);
    return kids;
  }
  function subtree(kids, r) {
    var out = [], stack = [r];
    while (stack.length) {
      var i = stack.pop(); out.push(i);
      for (var k = 0; k < kids[i].length; k++) stack.push(kids[i][k]);
    }
    return out;
  }
  /* Crowding proxy: how many other cells lie within two cell widths. This is a
     stand-in for growth-induced strain, NOT a mechanical calculation, and the
     page says so. */
  function crowding(cells, i) {
    var n = 0, si = spine(cells[i]);
    for (var q = 0; q < cells.length; q++) {
      if (q !== i && segDist(si, spine(cells[q])) < 2 * W) n++;
    }
    return n;
  }
  function pickFracture(cells) {
    if (cells.length < 4) return null;
    var kids = childIndex(cells);
    var best = -1, bestScore = -1, bestSet = null;
    for (var i = 1; i < cells.length; i++) {
      var st = subtree(kids, i);
      if (st.length < 2) continue;
      if (st.length > cells.length * 0.45) continue;   // a branch, not half the body
      var s = crowding(cells, i);
      if (s > bestScore) { bestScore = s; best = i; bestSet = st; }
    }
    if (best < 0) return null;
    var inSet = {}; bestSet.forEach(function (k) { inSet[k] = 1; });
    var basal = bestSet.filter(function (k) { return !(cells[k].parent in inSet); });
    return { root: best, cells: bestSet, set: inSet, basal: basal.length, crowd: bestScore };
  }
  /* Every bond, not just the one that breaks. The unicellular bottleneck is a
     property of the whole attachment tree. */
  function bottleneckAudit(cells) {
    var kids = childIndex(cells), bonds = 0, bad = 0;
    for (var i = 1; i < cells.length; i++) {
      var st = subtree(kids, i), inSet = {};
      st.forEach(function (k) { inSet[k] = 1; });
      var basal = st.filter(function (k) { return !(cells[k].parent in inSet); });
      bonds++; if (basal.length !== 1) bad++;
    }
    return { bonds: bonds, bad: bad };
  }

  /* ------------------------------------------------------------------ colours
     Read from the design tokens, re-read whenever the theme changes. */
  var C = {};
  function readTokens() {
    var cs = getComputedStyle(document.documentElement);
    function tok(n, fb) { var v = cs.getPropertyValue(n).trim(); return v || fb; }
    C.void = tok('--void', '#000');
    C.on = tok('--on-void', '#E6E9EC');
    C.dim = tok('--on-void-dim', '#96A0A8');
    C.rule = tok('--on-void-rule', '#2A3036');
    C.cyan = tok('--cyan', '#24E3F2');
    C.amber = tok('--amber', '#F79A2E');
    C.green = tok('--green', '#7CFC1F');
    C.cyanRGB = hexRGB(C.cyan, [36, 227, 242]);
    C.amberRGB = hexRGB(C.amber, [247, 154, 46]);
  }
  function hexRGB(h, fb) {
    var m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(h);
    if (!m) return fb;
    return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];
  }
  function ringRGB(t) {                       // cyan at the founder, amber outside
    var a = C.cyanRGB, b = C.amberRGB;
    return [Math.round(a[0] + (b[0] - a[0]) * t),
            Math.round(a[1] + (b[1] - a[1]) * t),
            Math.round(a[2] + (b[2] - a[2]) * t)];
  }
  function rgba(c, al) { return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + al + ')'; }

  /* -------------------------------------------------------------------- state */
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  var state = {
    d: 8,
    ar: AR_LO !== null ? AR_LO : 1.30,
    fracture: null,
    reveal: Infinity,        // how many cells are currently drawn
    raf: 0
  };

  /* ------------------------------------------------------------------ drawing */
  var wrap = root.querySelector('[data-grow-canvas]');

  function sizeCanvas() {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var cw = Math.max(wrap.clientWidth || 0, 240);
    var ch = Math.round(cw * 0.98);
    ch = Math.max(260, Math.min(ch, 620));
    var bw = Math.round(cw * dpr), bh = Math.round(ch * dpr);
    /* Assigning canvas.width reallocates the backing store and clears it, so
       only do it when the size has actually changed. The reveal animation
       repaints about fifty times and must not thrash it. */
    if (canvas.width !== bw || canvas.height !== bh) {
      canvas.style.height = ch + 'px';
      canvas.width = bw;
      canvas.height = bh;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { w: cw, h: ch };
  }

  function capsule(x1, y1, x2, y2, r) {
    var ang = Math.atan2(y2 - y1, x2 - x1);
    var nx = Math.cos(ang + Math.PI / 2) * r, ny = Math.sin(ang + Math.PI / 2) * r;
    ctx.beginPath();
    ctx.moveTo(x1 + nx, y1 + ny);
    ctx.lineTo(x2 + nx, y2 + ny);
    ctx.arc(x2, y2, r, ang + Math.PI / 2, ang - Math.PI / 2, true);
    ctx.lineTo(x1 - nx, y1 - ny);
    ctx.arc(x1, y1, r, ang - Math.PI / 2, ang + Math.PI / 2, true);
    ctx.closePath();
  }

  function draw() {
    var size = sizeCanvas();
    var g = grow(state.ar, state.d);
    var cells = g.cells;
    var frac = state.fracture;

    ctx.fillStyle = C.void;
    ctx.fillRect(0, 0, size.w, size.h);

    /* Displace the propagule so a reader can see what came off. Schematic. */
    var off = { x: 0, y: 0 };
    if (frac) {
      var cx = 0, cy = 0;
      frac.cells.forEach(function (i) { cx += cells[i].x; cy += cells[i].y; });
      cx /= frac.cells.length; cy /= frac.cells.length;
      var len = Math.sqrt(cx * cx + cy * cy) || 1;
      off.x = cx / len * (state.ar * 2.2 + 2);
      off.y = cy / len * (state.ar * 2.2 + 2);
    }

    /* fit */
    var minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
    cells.forEach(function (c, i) {
      var s = spine(c);
      var ox = frac && frac.set[i] ? off.x : 0, oy = frac && frac.set[i] ? off.y : 0;
      minX = Math.min(minX, s[0] + ox, s[2] + ox); maxX = Math.max(maxX, s[0] + ox, s[2] + ox);
      minY = Math.min(minY, s[1] + oy, s[3] + oy); maxY = Math.max(maxY, s[1] + oy, s[3] + oy);
    });
    var padModel = W;
    minX -= padModel; maxX += padModel; minY -= padModel; maxY += padModel;
    var padPx = 26;
    var scale = Math.min((size.w - padPx * 2) / Math.max(maxX - minX, 0.001),
                         (size.h - padPx * 2 - 20) / Math.max(maxY - minY, 0.001));
    var tx = (size.w - (maxX - minX) * scale) / 2 - minX * scale;
    var ty = (size.h - 20 - (maxY - minY) * scale) / 2 - minY * scale + 6;
    function px(v) { return v * scale + tx; }
    function py(v) { return v * scale + ty; }

    var r = W * 0.5 * scale;
    var shown = Math.min(cells.length, state.reveal);

    /* bonds first, so cells sit on top of them */
    ctx.strokeStyle = C.rule;
    ctx.lineWidth = 1;
    for (var i = 1; i < shown; i++) {
      var c = cells[i], m = cells[c.parent];
      if (frac && (frac.set[i] ? 1 : 0) !== (frac.set[c.parent] ? 1 : 0)) continue;
      var oi = frac && frac.set[i] ? off : { x: 0, y: 0 };
      ctx.beginPath();
      ctx.moveTo(px(m.x + oi.x), py(m.y + oi.y));
      ctx.lineTo(px(c.x + oi.x), py(c.y + oi.y));
      ctx.stroke();
    }

    for (var k = 0; k < shown; k++) {
      var cell = cells[k];
      var inProp = frac && frac.set[k];
      var o = inProp ? off : { x: 0, y: 0 };
      var s = spine(cell);
      var t = state.d > 0 ? cell.depth / state.d : 0;
      var col = ringRGB(t);
      /* Once a bond has broken, the body it came off is held back so the
         propagule is the thing the eye lands on. */
      var fill = frac ? (inProp ? 0.32 : 0.07) : 0.16;
      var line = frac ? (inProp ? 1 : 0.38) : 0.85;
      capsule(px(s[0] + o.x), py(s[1] + o.y), px(s[2] + o.x), py(s[3] + o.y), r);
      ctx.fillStyle = rgba(col, fill);
      ctx.fill();
      ctx.strokeStyle = rgba(col, line);
      ctx.lineWidth = Math.max(1, r * 0.16);
      ctx.stroke();
    }

    /* the founding cell of the whole body */
    if (shown > 0) {
      var f = cells[0], fs = spine(f);
      ctx.beginPath();
      ctx.arc(px((fs[0] + fs[2]) / 2), py((fs[1] + fs[3]) / 2), Math.max(2, r * 0.34), 0, Math.PI * 2);
      ctx.fillStyle = C.on;
      ctx.fill();
    }

    /* the broken bond, marked and labelled */
    if (frac) {
      var rt = cells[frac.root], mo = cells[rt.parent];
      var bx = px((rt.x + mo.x) / 2), by = py((rt.y + mo.y) / 2);
      ctx.strokeStyle = C.green;
      ctx.lineWidth = 1.6;
      ctx.setLineDash([]);
      var q = Math.max(5, r * 0.8);
      ctx.beginPath();
      ctx.moveTo(bx - q, by - q); ctx.lineTo(bx + q, by + q);
      ctx.moveTo(bx + q, by - q); ctx.lineTo(bx - q, by + q);
      ctx.stroke();

      /* dashed ring round the propagule: it is a schematic displacement */
      var pminX = 1e9, pmaxX = -1e9, pminY = 1e9, pmaxY = -1e9;
      frac.cells.forEach(function (i) {
        var sp = spine(cells[i]);
        pminX = Math.min(pminX, sp[0] + off.x, sp[2] + off.x);
        pmaxX = Math.max(pmaxX, sp[0] + off.x, sp[2] + off.x);
        pminY = Math.min(pminY, sp[1] + off.y, sp[3] + off.y);
        pmaxY = Math.max(pmaxY, sp[1] + off.y, sp[3] + off.y);
      });
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = C.dim;
      ctx.lineWidth = 1;
      ctx.strokeRect(px(pminX) - 8, py(pminY) - 8,
                     (pmaxX - pminX) * scale + 16, (pmaxY - pminY) * scale + 16);
      ctx.setLineDash([]);
      ctx.fillStyle = C.dim;
      ctx.font = '11px "IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, monospace';
      ctx.textBaseline = 'bottom';
      ctx.fillText('propagule, ' + frac.cells.length + ' cells', px(pminX) - 8, py(pminY) - 12);
    }

    /* standing captions, drawn so they survive a copied image */
    ctx.font = '11px "IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = C.dim;
    ctx.fillText('SCHEMATIC. 2-D SECTION, NOT TO SCALE.', 12, size.h - 8);
    ctx.textAlign = 'right';
    ctx.fillStyle = C.on;
    ctx.fillText('d = ' + state.d + '   α = ' + state.ar.toFixed(2), size.w - 12, size.h - 8);
    ctx.textAlign = 'left';

    canvas.setAttribute('aria-label', altText(g));
  }

  function altText(g) {
    return 'Schematic 2-D snowflake yeast body grown for ' + state.d + ' doublings at cellular ' +
      'aspect ratio ' + state.ar.toFixed(2) + '. ' + g.cells.length + ' cells were placed; ' +
      Math.pow(2, state.d) + ' would fit if space were unlimited. Cells are drawn as capsules, ' +
      'coloured from cyan at the founding cell to amber at the outermost ring.' +
      (state.fracture ? ' One bond has been broken and a propagule of ' +
        state.fracture.cells.length + ' cells is drawn displaced from the body.' : '');
  }

  /* ------------------------------------------------------------------ readout */
  var el = {
    d: root.querySelector('[data-out-d]'),
    unlimited: root.querySelector('[data-out-unlimited]'),
    placed: root.querySelector('[data-out-placed]'),
    refused: root.querySelector('[data-out-refused]'),
    short: root.querySelector('[data-out-short]'),
    rings: root.querySelector('[data-out-rings]'),
    arState: root.querySelector('[data-ar-state]'),
    frac: root.querySelector('[data-out-fracture]'),
    dIn: root.querySelector('#grow-d'),
    arIn: root.querySelector('#grow-ar'),
    dLbl: root.querySelector('[data-d-value]'),
    arLbl: root.querySelector('[data-ar-value]')
  };

  function arState(v) {
    if (AR_LO === null) return { key: 'model', words: 'Modelling value. The measured endpoints could not be loaded.' };
    if (Math.abs(v - AR_LO) < 0.005) {
      return { key: 'measured', words: 'Measured. Ancestral aspect ratio, ' + AR_LO.toFixed(2) + ', ' + AR_SRC + '.' };
    }
    if (Math.abs(v - AR_HI) < 0.005) {
      return { key: 'measured', words: 'Measured. Aspect ratio at 1,000 transfers, ' + AR_HI.toFixed(2) + ', ' + AR_SRC + '.' };
    }
    if (v < AR_LO || v > AR_HI) {
      return { key: 'outside', words: 'Outside the measured range. Extrapolation, shown dashed on the scale below, not data.' };
    }
    return { key: 'between', words: 'Between the two measured endpoints. Not a measured timepoint, shown dashed on the scale below.' };
  }

  var lastFracMsg = null;

  function readout() {
    var g = grow(state.ar, state.d);
    var unl = Math.pow(2, state.d);

    el.d.textContent = String(state.d);
    el.unlimited.textContent = unl.toLocaleString('en-US');
    el.placed.textContent = String(g.cells.length);
    el.refused.textContent = String(g.refused);

    if (!g.firstShort) {
      el.short.textContent = 'none yet: the body still matches C(d,x) exactly at every ring';
    } else {
      el.short.textContent = 'doubling ' + g.firstShort + ' (rings 1 to ' + (g.firstShort - 1) +
        ' still match C(d,x) exactly)';
    }

    var st = arState(state.ar);
    el.arState.textContent = st.words;
    el.arState.setAttribute('data-state', st.key);

    /* ring table */
    var rows = '';
    var maxPred = 1;
    for (var x = 0; x <= state.d; x++) maxPred = Math.max(maxPred, binom(state.d, x));
    for (var i = 0; i <= state.d; i++) {
      var pred = binom(state.d, i), got = g.hist[i] || 0;
      var pw = (pred / maxPred * 100).toFixed(1), gw = (got / maxPred * 100).toFixed(1);
      rows += '<tr' + (got < pred ? ' class="is-short"' : '') + '>' +
        '<th scope="row">' + i + '</th>' +
        '<td class="num">' + pred + '</td>' +
        '<td class="num">' + got + '</td>' +
        '<td class="grow-barcell"><span class="grow-bar-pred" style="width:' + pw + '%"></span>' +
        '<span class="grow-bar-got" style="width:' + gw + '%"></span></td>' +
        '</tr>';
    }
    el.rings.innerHTML = rows;

    /* The fracture report is a polite live region. Writing the same sentence
       into it again still counts as a mutation, and several screen readers
       re-announce on mutation rather than on difference, so a reader arrowing
       the slider would hear it on every keypress. Only write on a change. */
    var msg;
    if (state.fracture) {
      var audit = bottleneckAudit(g.cells);
      msg =
        'Bond broken. The propagule is <strong>' + state.fracture.cells.length + ' cells</strong> and ' +
        'contains <strong>' + state.fracture.basal + ' basal cell</strong>, the cell whose bond to its ' +
        'mother was the one that broke. Every other cell in it descends from that one cell. ' +
        'Checked across all ' + audit.bonds + ' bonds in this body: ' + (audit.bonds - audit.bad) +
        ' of ' + audit.bonds + ' give a propagule with exactly one basal cell. That is a property of ' +
        'the attachment tree itself, not a discovery of this simulation. Which bond breaks is picked ' +
        'here by a crowding count, not by a mechanical stress calculation.';
    } else {
      msg = 'No bond has been broken yet. Break one and the detached piece is reported here, with ' +
        'its size and how many basal cells it contains.';
    }
    if (msg !== lastFracMsg) { el.frac.innerHTML = msg; lastFracMsg = msg; }
  }

  /* ------------------------------------------------------------------ reveal */
  function render() { draw(); readout(); }

  function play() {
    var g = grow(state.ar, state.d);
    if (reduced.matches) { state.reveal = Infinity; render(); return; }
    cancelAnimationFrame(state.raf);
    var total = g.cells.length, t0 = null, dur = 900;
    state.reveal = 0;
    function step(ts) {
      if (t0 === null) t0 = ts;
      var p = Math.min(1, (ts - t0) / dur);
      state.reveal = Math.max(1, Math.round(total * p));
      draw();
      if (p < 1) state.raf = requestAnimationFrame(step);
      else { state.reveal = Infinity; draw(); }
    }
    readout();
    state.raf = requestAnimationFrame(step);
  }

  /* ------------------------------------------------------------------ wiring */
  function syncLabels() {
    el.dLbl.textContent = state.d;
    el.arLbl.textContent = state.ar.toFixed(2);
    el.dIn.setAttribute('aria-valuetext', state.d + ' doublings, ' +
      Math.pow(2, state.d).toLocaleString('en-US') + ' cells if space were unlimited');
    el.arIn.setAttribute('aria-valuetext', state.ar.toFixed(2) + '. ' + arState(state.ar).words);
  }

  el.dIn.value = String(state.d);
  el.arIn.value = String(Math.round(state.ar * 100));

  el.dIn.addEventListener('input', function () {
    state.d = +el.dIn.value;
    state.fracture = null;
    state.reveal = Infinity;
    cancelAnimationFrame(state.raf);
    syncLabels(); render();
  });
  el.arIn.addEventListener('input', function () {
    state.ar = (+el.arIn.value) / 100;
    state.fracture = null;
    state.reveal = Infinity;
    cancelAnimationFrame(state.raf);
    syncLabels(); render();
  });

  Array.prototype.forEach.call(root.querySelectorAll('[data-ar-jump]'), function (b) {
    b.addEventListener('click', function () {
      var v = +b.getAttribute('data-ar-jump');
      state.ar = v; state.fracture = null; state.reveal = Infinity;
      cancelAnimationFrame(state.raf);
      el.arIn.value = String(Math.round(v * 100));
      syncLabels(); render();
    });
  });

  var btnPlay = root.querySelector('[data-act="play"]');
  var btnFrac = root.querySelector('[data-act="fracture"]');
  var btnReset = root.querySelector('[data-act="reset"]');

  if (btnPlay) btnPlay.addEventListener('click', function () {
    state.fracture = null;
    play();
  });
  if (btnFrac) btnFrac.addEventListener('click', function () {
    var g = grow(state.ar, state.d);
    state.reveal = Infinity;
    cancelAnimationFrame(state.raf);
    state.fracture = pickFracture(g.cells);
    render();
  });
  if (btnReset) btnReset.addEventListener('click', function () {
    state.fracture = null; state.reveal = Infinity;
    cancelAnimationFrame(state.raf);
    state.d = 8;
    state.ar = AR_LO !== null ? AR_LO : 1.30;
    el.dIn.value = String(state.d);
    el.arIn.value = String(Math.round(state.ar * 100));
    syncLabels(); render();
  });

  /* theme changes restyle the whole page; the canvas has to be repainted */
  new MutationObserver(function () { readTokens(); draw(); })
    .observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  var mqDark = window.matchMedia('(prefers-color-scheme: dark)');
  var onScheme = function () { readTokens(); draw(); };
  mqDark.addEventListener ? mqDark.addEventListener('change', onScheme) : mqDark.addListener(onScheme);

  var resizeRAF = 0;
  function onResize() {
    cancelAnimationFrame(resizeRAF);
    resizeRAF = requestAnimationFrame(function () { draw(); });
  }
  if ('ResizeObserver' in window) new ResizeObserver(onResize).observe(wrap);
  else window.addEventListener('resize', onResize);

  /* First paint is the settled final state, always. The reveal animation only
     runs when a reader asks for it, so this is correct under reduced motion and
     the page is never caught mid-frame. */
  readTokens();
  root.setAttribute('data-ready', 'true');
  syncLabels();
  render();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { draw(); });
})();
