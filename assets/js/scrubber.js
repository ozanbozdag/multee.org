/* ==========================================================================
   scrubber.js — the Decade Scrubber on story.html.
   Vanilla, no modules, no build step. Requires multee-data.js to load first.

   HONESTY CONTRACT for this file:
     - Only RADIUS day 0 (16 um) and day 600 (434 um) are measured. They are
       drawn as filled markers. Everything between is a dashed line and is
       labelled "interpolated". Nothing is drawn to the right of day 600.
     - PLOIDY is published through day 1,000 (Tong 2025). Past that the state
       shown carries "unpublished beyond day 1,000".
     - The archive holds four micrographs. Below day 400 the nearest archived
       plate is later than the scrub position, and the panel says so.
     - Everything right of CLOCK.publishedThroughDay is shaded and labelled as
       beyond the published record.
   ========================================================================== */
(function () {
  'use strict';

  var M = window.MULTEE;
  var root = document.getElementById('scrub');
  if (!M || !root) return;

  var MAX = M.CLOCK.maxDay;
  var PUB = M.CLOCK.publishedThroughDay;
  var LAST_RADIUS_DAY = 600;   // final measured point in MULTEE.RADIUS

  /* ------------------------------------------------------------- elements */
  var canvas = document.getElementById('scrub-canvas');
  var wrap = canvas ? canvas.parentNode : null;
  var range = document.getElementById('scrub-day');
  var play = document.getElementById('scrub-play');
  var controls = document.getElementById('scrub-controls');

  var out = {
    day: document.getElementById('rd-day'),
    transfer: document.getElementById('rd-transfer'),
    gens: document.getElementById('rd-gens'),
    year: document.getElementById('rd-year'),
    radius: document.getElementById('rd-radius'),
    radiusTag: document.getElementById('rd-radius-tag'),
    radiusSub: document.getElementById('rd-radius-sub'),
    ploidy: document.getElementById('rd-ploidy'),
    ploidySub: document.getElementById('rd-ploidy-sub')
  };
  var plateImg = document.getElementById('scrub-plate-img');
  var plateCap = document.getElementById('scrub-plate-cap');
  var plateNote = document.getElementById('scrub-plate-note');
  var paperCount = document.getElementById('scrub-paper-count');
  var paperRecent = document.getElementById('scrub-paper-recent');
  var traits = Array.prototype.slice.call(root.querySelectorAll('.trait'));

  /* --------------------------------------------------------------- helpers */
  function css(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }
  function comma(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)');

  /* Colours are re-read whenever the theme changes; nothing here is hardcoded. */
  var C = {};
  function readColours() {
    C.ink = css('--ink') || '#E6E9EC';
    C.dim = css('--ink-dim') || '#96A0A8';
    C.rule = css('--rule') || '#1E2226';
    C.accent = css('--accent') || '#24E3F2';
    C.amber = css('--amber-ink') || '#F79A2E';
    C.bg = css('--bg') || '#0A0B0D';
  }
  readColours();

  /* --------------------------------------------------------------- geometry */
  var W = 0, H = 0;
  var padL = 48, padR = 16, padT = 34, padB = 58;
  var UM_MAX = 500;

  function xAt(day) { return padL + (day / MAX) * (W - padL - padR); }
  function yTop() { return padT; }
  function yBot() { return H - padB; }
  function yAt(um) { return yBot() - (um / UM_MAX) * (yBot() - yTop()); }

  /* ------------------------------------------------------------------ state */
  var day = range ? +range.value : 600;

  /* ------------------------------------------------------------------ paint */
  function resize() {
    if (!canvas || !wrap) return;
    var dpr = window.devicePixelRatio || 1;
    W = wrap.clientWidth;
    H = wrap.clientHeight;
    if (!W || !H) return;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    var ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw();
  }

  function draw() {
    if (!canvas || !W || !H) return;
    var ctx = canvas.getContext('2d');
    var narrow = W < 620;
    var mono = '"IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, monospace';

    ctx.clearRect(0, 0, W, H);
    ctx.lineJoin = 'round';
    ctx.textBaseline = 'middle';

    var yb = yBot(), yt = yTop();
    var stripTop = yb + 26, stripH = 14;

    /* --- 1. the unpublished region, shaded and named ---------------------- */
    var xPub = xAt(PUB);
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = C.rule;
    ctx.fillRect(xPub, 6, xAt(MAX) - xPub, (stripTop + stripH) - 6);
    ctx.restore();
    ctx.save();
    ctx.setLineDash([3, 3]);
    ctx.strokeStyle = C.amber;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(Math.round(xPub) + 0.5, 6);
    ctx.lineTo(Math.round(xPub) + 0.5, stripTop + stripH);
    ctx.stroke();
    ctx.restore();
    ctx.fillStyle = C.amber;
    ctx.font = '500 9px ' + mono;
    ctx.textAlign = 'left';
    ctx.fillText(narrow ? 'UNPUBLISHED' : 'BEYOND THE PUBLISHED RECORD', xPub + 6, 12);

    /* --- 2. y axis: micrometres ------------------------------------------ */
    ctx.strokeStyle = C.rule;
    ctx.lineWidth = 1;
    ctx.fillStyle = C.dim;
    ctx.font = '400 9px ' + mono;
    ctx.textAlign = 'right';
    [0, 250, 500].forEach(function (um) {
      var y = Math.round(yAt(um)) + 0.5;
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(W - padR, y);
      ctx.stroke();
      ctx.fillText(String(um), padL - 8, yAt(um));
    });
    ctx.textAlign = 'left';
    ctx.fillText('µm', 6, yt - 12);

    /* --- 3. radius: the digitized Fig. 1e series ------------------------- */
    var S = M.RADIUS_SERIES;
    var x0 = xAt(0), y0 = yAt(S.mean[0]);
    var x6 = xAt(LAST_RADIUS_DAY), y6 = yAt(S.mean[S.mean.length - 1]);

    /* the five replicate lines, faint: the divergence in timing is the story */
    ctx.save();
    ctx.strokeStyle = C.rule;
    ctx.lineWidth = 1;
    Object.keys(S.lines).forEach(function (k) {
      var vals = S.lines[k];
      ctx.beginPath();
      S.days.forEach(function (d, i) {
        var X = xAt(d), Y = yAt(vals[i]);
        i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y);
      });
      ctx.stroke();
    });
    ctx.restore();

    /* the mean, solid: every vertex is a sampling point in the paper */
    ctx.save();
    ctx.strokeStyle = C.dim;
    ctx.lineWidth = 1.75;
    ctx.beginPath();
    S.days.forEach(function (d, i) {
      var X = xAt(d), Y = yAt(S.mean[i]);
      i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y);
    });
    ctx.stroke();
    /* mark the sampling points themselves */
    ctx.fillStyle = C.dim;
    S.days.forEach(function (d, i) {
      ctx.beginPath();
      ctx.arc(xAt(d), yAt(S.mean[i]), 2, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.restore();

    /* the wall where the measured series stops */
    ctx.save();
    ctx.setLineDash([2, 4]);
    ctx.strokeStyle = C.dim;
    ctx.beginPath();
    ctx.moveTo(Math.round(x6) + 0.5, y6);
    ctx.lineTo(Math.round(x6) + 0.5, yb);
    ctx.stroke();
    ctx.restore();
    if (!narrow) {
      ctx.fillStyle = C.dim;
      ctx.font = '400 9px ' + mono;
      ctx.textAlign = 'left';
      ctx.fillText('SIZE SERIES ENDS', x6 + 7, y6 + 26);
    }

    /* the two endpoints the paper states in words, filled */
    ctx.fillStyle = C.accent;
    [[x0, y0, '16'], [x6, y6, '434']].forEach(function (p) {
      ctx.beginPath();
      ctx.arc(p[0], p[1], 4, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.font = '500 10px ' + mono;
    ctx.textAlign = 'left';
    ctx.fillText('16', x0 + 8, y0 - 9);
    ctx.textAlign = 'right';
    ctx.fillText('434', x6 - 8, y6 - 2);

    /* --- 4. trait ticks along the top rail -------------------------------- */
    M.TRAITS.forEach(function (t) {
      var x = Math.round(xAt(t.day)) + 0.5;
      var on = t.day <= day;
      ctx.strokeStyle = on ? C.amber : C.rule;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, 18);
      ctx.lineTo(x, 28);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x, 14, 3.2, 0, Math.PI * 2);
      if (t.approx) {                       // reported range, not a measured onset
        ctx.strokeStyle = on ? C.amber : C.rule;
        ctx.stroke();
      } else {
        ctx.fillStyle = on ? C.amber : C.rule;
        ctx.fill();
      }
    });

    /* --- 5. ploidy strip -------------------------------------------------- */
    ctx.fillStyle = C.dim;
    ctx.font = '400 9px ' + mono;
    ctx.textAlign = 'right';
    ctx.fillText('PLOIDY', padL - 8, stripTop + stripH / 2);
    M.PLOIDY.forEach(function (s) {
      var a = xAt(s.fromDay);
      var b = xAt(s.toDay === null ? MAX : s.toDay);
      var cur = day >= s.fromDay && (s.toDay === null || day < s.toDay);
      ctx.strokeStyle = cur ? C.accent : C.rule;
      ctx.lineWidth = 1;
      ctx.strokeRect(Math.round(a) + 0.5, Math.round(stripTop) + 0.5,
                     Math.max(1, Math.round(b - a)), stripH);
      if (b - a > 46) {
        ctx.fillStyle = cur ? C.accent : C.dim;
        ctx.font = '500 9px ' + mono;
        ctx.textAlign = 'left';
        ctx.fillText(s.state, a + 6, stripTop + stripH / 2);
      }
    });

    /* --- 6. x axis -------------------------------------------------------- */
    ctx.strokeStyle = C.rule;
    ctx.beginPath();
    ctx.moveTo(padL, Math.round(yb) + 0.5);
    ctx.lineTo(W - padR, Math.round(yb) + 0.5);
    ctx.stroke();
    var ticks = narrow ? [0, 600, 1200, 1800] : [0, 300, 600, 900, 1200, 1500, 1800];
    ctx.fillStyle = C.dim;
    ctx.font = '400 9px ' + mono;
    ctx.textAlign = 'center';
    ticks.forEach(function (d) {
      var x = Math.round(xAt(d)) + 0.5;
      ctx.beginPath();
      ctx.moveTo(x, yb);
      ctx.lineTo(x, yb + 5);
      ctx.stroke();
      ctx.fillText(String(d), x, yb + 14);
    });
    ctx.textAlign = 'left';
    ctx.fillText('TRANSFER DAY', padL, H - 8);

    /* --- 7. the playhead -------------------------------------------------- */
    var px = Math.round(xAt(day)) + 0.5;
    ctx.strokeStyle = C.accent;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(px, 6);
    ctx.lineTo(px, stripTop + stripH);
    ctx.stroke();
    ctx.fillStyle = C.accent;
    ctx.beginPath();
    ctx.moveTo(px - 4.5, 6);
    ctx.lineTo(px + 4.5, 6);
    ctx.lineTo(px, 12);
    ctx.closePath();
    ctx.fill();

    /* the value the playhead is standing on, drawn hollow when interpolated */
    var r = M.radiusAt(day);
    if (day <= LAST_RADIUS_DAY) {
      var py = yAt(r.value);
      ctx.beginPath();
      ctx.arc(px, py, 4.5, 0, Math.PI * 2);
      if (r.exact || r.onSample) {
        ctx.fillStyle = C.accent;
        ctx.fill();
      } else {
        ctx.strokeStyle = C.amber;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    }
  }

  /* ------------------------------------------------------------ the readout */

  function render() {
    /* clock */
    if (out.day) out.day.textContent = comma(day);
    if (out.transfer) out.transfer.textContent = comma(day);
    if (out.gens) out.gens.textContent = '≈' + comma(M.generationsAt(day));

    /* radius: three distinct states, never one styled as another */
    var r = M.radiusAt(day);
    var rTxt, tagTxt, tagCls, subTxt, spokenTag;
    if (r.beyond) {
      rTxt = '434 µm';
      tagTxt = 'Series ends';
      spokenTag = 'the last measured value, at day ' + LAST_RADIUS_DAY + '; nothing is published past it';
      tagCls = 'tag tag-interp';
      subTxt = 'Last measured value, day ' + LAST_RADIUS_DAY + '. No size measurement is published past day ' + LAST_RADIUS_DAY + ', and none is drawn.';
    } else if (r.exact) {
      rTxt = '16 µm';
      tagTxt = 'Measured';
      spokenTag = 'measured';
      tagCls = 'tag tag-measured';
      subTxt = 'The ancestral radius stated in Bozdag et al. 2023.';
    } else if (r.onSample) {
      rTxt = Math.round(r.value) + ' µm';
      tagTxt = 'Sampled';
      spokenTag = 'a sampled timepoint, digitized from figure 1e';
      tagCls = 'tag tag-measured';
      subTxt = 'A sampling point in Bozdag et al. 2023 Fig. 1e, mean of the five anaerobic lines. ' +
               'Digitized from the published figure, so approximate to a few per cent.';
    } else {
      rTxt = Math.round(r.value) + ' µm';
      tagTxt = 'Between samples';
      spokenTag = 'between two sampled timepoints, drawing only';
      tagCls = 'tag tag-interp';
      subTxt = 'Between two sampling points 50 days apart, interpolated on the log axis the ' +
               'paper plots. Drawing only, not a measurement.';
    }
    if (out.radius) out.radius.textContent = rTxt;
    if (out.radiusTag) { out.radiusTag.textContent = tagTxt; out.radiusTag.className = tagCls; }
    if (out.radiusSub) out.radiusSub.textContent = subTxt;

    /* ploidy: published through day 1,000 only */
    var p = M.ploidyAt(day);
    if (out.ploidy) out.ploidy.textContent = p.state;
    if (out.ploidySub) {
      out.ploidySub.textContent = day > PUB
        ? p.label + '. Tong et al. 2025 follows this state through day ' + comma(PUB) + '. Unpublished beyond.'
        : p.label + '. Tong et al. 2025.';
    }

    /* traits */
    traits.forEach(function (li) {
      var d = +li.getAttribute('data-day');
      var on = d <= day;
      li.classList.toggle('pending', !on);
      var mark = li.querySelector('.trait-mark');
      var state = li.querySelector('.trait-state');
      if (mark) mark.textContent = on ? '●' : '○';
      if (state) state.textContent = on ? 'Evolved by day ' + comma(d) : 'Not yet at this day';
    });

    /* micrograph */
    var plate = M.plateFor(day);
    if (plateImg && plateImg.getAttribute('data-day') !== String(plate.day)) {
      plateImg.setAttribute('data-day', String(plate.day));
      plateImg.src = plate.src;
      plateImg.srcset = plate.sm + ' 900w, ' + plate.src + ' 1021w';
      plateImg.alt = plate.alt;
    }
    if (plateCap) plateCap.textContent = plate.caption;
    if (plateNote) {
      plateNote.textContent = plate.day > day
        ? 'The archive holds no image before day 400. This is the nearest archived timepoint, which is later than the day shown.'
        : 'Nearest archived timepoint at or before this day. Four timepoints are imaged: 400, 600, 715, 1000.';
    }

    /* papers */
    var pubs = M.reportedBy(day);
    if (paperCount) paperCount.textContent = String(pubs.length);
    if (paperRecent) {
      paperRecent.textContent = pubs.length
        ? 'Most recent: “' + pubs[pubs.length - 1].title + '”, ' + pubs[pubs.length - 1].short + '.'
        : 'None yet.';
    }

    /* the whole synchronised readout, spoken in one string */
    if (range) {
      range.setAttribute('aria-valuetext',
        'Day ' + comma(day) + ', transfer ' + comma(day) +
        ', about ' + comma(M.generationsAt(day)) + ' generations' +
        '. Cluster radius ' + rTxt + ', ' + spokenTag +
        '. Ploidy ' + p.state + ', ' + p.label +
        '. ' + M.traitsBy(day).length + ' of ' + M.TRAITS.length + ' evolved traits reported' +
        '. ' + pubs.length + ' papers report the state of the experiment by this day' +
        (day > PUB ? '. Beyond the published record.' : '.'));
    }

    draw();
  }

  /* ------------------------------------------------------------- interaction */
  if (range) {
    range.max = String(MAX);
    range.addEventListener('input', function () {
      day = +range.value;
      stop();
      render();
    });
  }

  var raf = null, last = 0;
  var SPEED = 170;  // transfer days per second

  function stop() {
    if (raf) { cancelAnimationFrame(raf); raf = null; }
    if (play) { play.textContent = 'Play'; play.setAttribute('aria-pressed', 'false'); }
  }
  function tick(ts) {
    if (!last) last = ts;
    var dt = Math.min(100, ts - last) / 1000;
    last = ts;
    day = Math.min(MAX, day + SPEED * dt);
    if (range) range.value = String(Math.round(day));
    render();
    if (day >= MAX) { day = MAX; stop(); return; }
    raf = requestAnimationFrame(tick);
  }
  function start() {
    if (day >= MAX) { day = 0; if (range) range.value = '0'; }
    last = 0;
    if (play) { play.textContent = 'Pause'; play.setAttribute('aria-pressed', 'true'); }
    raf = requestAnimationFrame(tick);
  }
  if (play) {
    play.addEventListener('click', function () { raf ? stop() : start(); });
  }

  /* Reduced motion: the settled state is rendered immediately, self-playing is
     removed entirely, and the slider keeps working because a drag is a user
     action rather than an animation. */
  function applyMotionPref() {
    if (reduced.matches) {
      stop();
      if (play && play.parentNode) play.parentNode.removeChild(play);
      play = null;
    }
  }
  reduced.addEventListener
    ? reduced.addEventListener('change', applyMotionPref)
    : reduced.addListener(applyMotionPref);

  /* --------------------------------------------------------- theme + resize */
  new MutationObserver(function () { readColours(); draw(); })
    .observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  var schemeMq = window.matchMedia('(prefers-color-scheme: dark)');
  var onScheme = function () { readColours(); draw(); };
  schemeMq.addEventListener ? schemeMq.addEventListener('change', onScheme) : schemeMq.addListener(onScheme);

  if (window.ResizeObserver && wrap) {
    new ResizeObserver(resize).observe(wrap);
  } else {
    window.addEventListener('resize', resize);
  }

  /* ------------------------------------------------------------------- init */
  if (controls) controls.removeAttribute('data-requires-js');
  if (canvas) canvas.removeAttribute('data-requires-js');
  applyMotionPref();
  resize();
  render();
})();
