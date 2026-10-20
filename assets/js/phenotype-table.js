/* ==========================================================================
   phenotype-table.js — the Phenotype data table (phenotypes/index.html).
   Loads phenotypes/phenotypes.json (built from phenotypes.csv by
   tools/build_phenotypes.py; do not edit by hand): one row per sample, one
   column per comparable kind of measurement. Readers choose which trait
   columns to show; hovering or clicking a value shows where it came from.
   Filter, column and sort state live in the URL query so a view can be
   shared. Same conventions as sequence-table.js. No framework, no build step.
   ========================================================================== */
(function () {
  'use strict';

  var TREAT = {
    PA: { glyph: '○', cls: 'chip-pa', order: 0 },
    PM: { glyph: '◒', cls: 'chip-pm', order: 1 },
    PO: { glyph: '●', cls: 'chip-po', order: 2 }
  };
  var SOURCE = {
    'text': 'stated in the text',
    'table': 'from a table in the paper',
    'supplement-table': 'from a supplementary table',
    'source-data': 'from the paper’s source data',
    'derived': 'computed from the paper’s data',
    'figure-read': 'read off a figure (approximate)'
  };
  var LINEAGE = 'lineage';   // kind filter value: everything except engineered strains

  var form = document.getElementById('ph-filters');
  var table = document.getElementById('ph-table');
  var count = document.getElementById('ph-count');
  var picker = document.getElementById('ph-cols');
  var pop = document.getElementById('ph-pop');
  if (!form || !table) return;

  var meta, samples = [], M = [], cols = [], colByKey = {}, kindOrder = [];
  var visible = [], shown = [];
  var sort = { key: 'sample', dir: 1 };

  /* ------------------------------------------------------------ helpers */
  function el(tag, attrs, kids) {
    var n = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === 'text') n.textContent = attrs[k];
      else if (k === 'cls') n.className = attrs[k];
      else n.setAttribute(k, attrs[k]);
    });
    (kids || []).forEach(function (c) { if (c) n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return n;
  }
  function link(href, label) { return el('a', { href: href, text: label, rel: 'noopener' }); }
  function natural(a, b) { return String(a).localeCompare(String(b), undefined, { numeric: true }); }
  function popLabel(s) {
    if (s.kind === 'Ancestor') return s.treatment + ' ancestor';
    if (!s.treatment) return '—';
    return s.treatment + (s.line || '');
  }
  function valueText(m, unit) {
    var v = (m.value_source === 'figure-read' ? '≈' : '') + m.value;
    if (m.error) v += ' ± ' + m.error;
    var u = unit === null ? '' : m.unit;   // null: the column header carries the unit
    return u ? v + ' ' + u : v;
  }
  function firstNum(s, key) {
    var ix = s.c[key];
    if (!ix) return null;
    var n = parseFloat(String(M[ix[0]].value).replace(/^[^\d.-]+/, ''));
    return isNaN(n) ? M[ix[0]].value : n;
  }

  /* ------------------------------------------------------------ sorting */
  function sampleKey(s) {
    return [(TREAT[s.treatment] || { order: 9 }).order, s.kind === 'Ancestor' ? -1 : (s.line == null ? 9 : s.line),
            s.transfer == null ? -1 : s.transfer, kindOrder.indexOf(s.kind), s.id];
  }
  function compare(a, b) {
    var ka, kb;
    if (sort.key === 'sample') { ka = sampleKey(a); kb = sampleKey(b); }
    else {
      var va = firstNum(a, sort.key), vb = firstNum(b, sort.key);
      if (va == null || vb == null) return (va == null) - (vb == null) || natural(a.id, b.id);
      ka = [va].concat(sampleKey(a)); kb = [vb].concat(sampleKey(b));
    }
    for (var i = 0; i < ka.length; i++) {
      var c = (typeof ka[i] === 'number' && typeof kb[i] === 'number') ? ka[i] - kb[i] : natural(ka[i], kb[i]);
      if (c) return c * sort.dir;
    }
    return 0;
  }

  /* ------------------------------------------------------------ filters */
  function fillSelect(name, allLabel, options) {
    var s = form.elements[name];
    if (allLabel != null) s.appendChild(el('option', { value: '', text: allLabel }));
    options.forEach(function (o) { s.appendChild(el('option', { value: o[0], text: o[1] })); });
  }
  function buildFilters() {
    fillSelect('treatment', 'All', [['PA', 'PA · Anaerobic'], ['PM', 'PM · Mixotrophic'], ['PO', 'PO · Aerobic']]);
    fillSelect('line', 'All', [1, 2, 3, 4, 5].map(function (n) { return [String(n), 'Line ' + n]; }));
    var tps = {};
    samples.forEach(function (s) { if (s.transfer != null) tps[s.transfer] = true; });
    fillSelect('timepoint', 'All', Object.keys(tps).sort(function (a, b) { return a - b; })
      .map(function (t) { return [t, 't' + t]; }));
    fillSelect('kind', null, [[LINEAGE, 'MuLTEE lineage'], ['', 'All, incl. engineered']]
      .concat(kindOrder.map(function (k) { return [k, k]; })));
    fillSelect('paper', 'All', meta.papers.map(function (p) { return [p.label, p.label]; }));
  }
  function state() {
    var f = form.elements;
    return { q: f.q.value.trim().toLowerCase(), treatment: f.treatment.value, line: f.line.value,
             timepoint: f.timepoint.value, kind: f.kind.value, paper: f.paper.value, empty: f.empty.checked };
  }
  function matches(s, st) {
    if (st.treatment && s.treatment !== st.treatment) return false;
    if (st.line && String(s.line) !== st.line) return false;
    if (st.timepoint && String(s.transfer) !== st.timepoint) return false;
    if (st.kind === LINEAGE ? s.kind === 'Engineered strain' : st.kind && s.kind !== st.kind) return false;
    if (st.paper && s.papers.indexOf(st.paper) < 0) return false;
    if (!st.empty && !visible.some(function (k) { return s.c[k]; })) return false;
    if (st.q) {
      var hay = [s.id, popLabel(s), 't' + s.transfer, s.kind].concat(s.strains, s.papers).join(' ').toLowerCase();
      if (hay.indexOf(st.q) < 0) return false;
    }
    return true;
  }

  /* ------------------------------------------------------- column picker */
  function buildPicker() {
    var body = picker.querySelector('.ph-cols-body');
    var groups = [];
    cols.forEach(function (c) { if (groups.indexOf(c.group) < 0) groups.push(c.group); });
    groups.forEach(function (g) {
      var fs = el('fieldset', { cls: 'ph-colgroup' }, [el('legend', { text: g })]);
      cols.filter(function (c) { return c.group === g; }).forEach(function (c) {
        var box = el('input', { type: 'checkbox', value: c.key });
        box.addEventListener('change', function () { setVisible(boxes().filter(function (b) { return b.checked; })
          .map(function (b) { return b.value; })); });
        fs.appendChild(el('label', { cls: 'ph-colopt' }, [box, el('span', { text: c.label + (c.unit ? ' (' + c.unit + ')' : '') }),
          el('span', { cls: 'ph-colcount', text: String(c.count) })]));
      });
      body.appendChild(fs);
    });
    picker.querySelector('[data-cols="default"]').addEventListener('click', function () { setVisible(defaults()); });
    picker.querySelector('[data-cols="none"]').addEventListener('click', function () { setVisible([]); });
  }
  function boxes() { return Array.prototype.slice.call(picker.querySelectorAll('input[type=checkbox]')); }
  function defaults() { return cols.filter(function (c) { return c.default; }).map(function (c) { return c.key; }); }
  function setVisible(keys) {
    visible = cols.map(function (c) { return c.key; }).filter(function (k) { return keys.indexOf(k) >= 0; });
    boxes().forEach(function (b) { b.checked = visible.indexOf(b.value) >= 0; });
    picker.querySelector('summary .ph-cols-n').textContent = visible.length + ' of ' + cols.length + ' shown';
    if (sort.key !== 'sample' && visible.indexOf(sort.key) < 0) sort = { key: 'sample', dir: 1 };
    render();
  }

  /* ------------------------------------------------------------ popover */
  function detail(m, c) {
    var bits = [el('p', { cls: 'ph-pop-value' }, [valueText(m, ''),
      m.error_type ? el('span', { cls: 'dim', text: '  ' + m.error_type }) : null,
      m.n ? el('span', { cls: 'dim', text: '  n = ' + m.n }) : null])];
    if (m.statistic) bits.push(el('p', {}, [el('strong', { text: 'Measured as ' }), m.statistic]));
    if (m.conditions) bits.push(el('p', {}, [el('strong', { text: 'Conditions ' }), m.conditions]));
    if (m.method) bits.push(el('p', {}, [el('strong', { text: 'Method ' }), m.method]));
    if (m.genotype) bits.push(el('p', {}, [el('strong', { text: 'Genotype ' }), m.genotype]));
    if (m.notes) bits.push(el('p', { cls: 'dim' }, [m.notes]));
    bits.push(el('p', { cls: 'ph-pop-src' }, [link('https://doi.org/' + m.doi, m.paper),
      ' · ' + [m.location, SOURCE[m.value_source]].filter(Boolean).join(' · ')]));
    return el('div', { cls: 'ph-pop-item' }, bits);
  }
  function tip(m) {
    return [m.statistic, m.conditions, m.paper + (m.location ? ', ' + m.location : ''), SOURCE[m.value_source]]
      .filter(Boolean).join('\n');
  }
  function openPop(anchor, s, c, ix) {
    pop.textContent = '';
    pop.appendChild(el('button', { type: 'button', cls: 'ph-pop-close', 'aria-label': 'Close', text: '×' }));
    pop.appendChild(el('p', { cls: 'ph-pop-head' }, [el('strong', { text: s.id }), ' · ' + c.label]));
    ix.forEach(function (i) { pop.appendChild(detail(M[i], c)); });
    pop.hidden = false;
    var r = anchor.getBoundingClientRect(), w = pop.offsetWidth, h = pop.offsetHeight;
    var left = Math.min(Math.max(8, r.left), window.innerWidth - w - 8);
    var top = r.bottom + 6 + h > window.innerHeight ? Math.max(8, r.top - h - 6) : r.bottom + 6;
    pop.style.left = left + 'px';
    pop.style.top = top + 'px';
    pop.querySelector('.ph-pop-close').focus();
  }
  function closePop() { pop.hidden = true; }

  /* ------------------------------------------------------------- render */
  function head() {
    var tr = el('tr');
    var th = el('th', { scope: 'col', cls: 'ph-sample', 'data-key': 'sample' }, [el('button', { type: 'button', text: 'Sample' })]);
    tr.appendChild(th);
    visible.forEach(function (k) {
      var c = colByKey[k];
      tr.appendChild(el('th', { scope: 'col', 'data-key': k, title: c.group }, [el('button', { type: 'button' }, [
        el('span', { cls: 'ph-th-group', text: c.group }), el('span', { cls: 'ph-th-label', text: c.label }),
        c.unit ? el('span', { cls: 'ph-th-unit', text: c.unit }) : null])]));
    });
    Array.prototype.forEach.call(tr.querySelectorAll('th[data-key]'), function (h) {
      var key = h.getAttribute('data-key');
      if (key === sort.key) h.setAttribute('aria-sort', sort.dir > 0 ? 'ascending' : 'descending');
      h.querySelector('button').addEventListener('click', function () {
        sort = { key: key, dir: sort.key === key ? -sort.dir : 1 };
        render();
      });
    });
    var thead = table.tHead || table.createTHead();
    thead.textContent = '';
    thead.appendChild(tr);
  }
  function cell(s, k) {
    var c = colByKey[k], ix = s.c[k];
    if (!ix) return el('td', { cls: 'ph-empty' }, [el('span', { 'aria-label': 'no data', text: '·' })]);
    var td = el('td', { cls: c.type === 'num' ? 'num' : '' });
    if (c.type === 'list') {
      var b = el('button', { type: 'button', cls: 'ph-v ph-list', text: ix.length + (ix.length > 1 ? ' measurements' : ' measurement') });
      b.addEventListener('click', function () { openPop(b, s, c, ix); });
      b.title = ix.map(function (i) { return M[i].statistic + ': ' + valueText(M[i], ''); }).join('\n');
      td.appendChild(b);
      return td;
    }
    ix.forEach(function (i) {
      var m = M[i];
      var b = el('button', { type: 'button', cls: 'ph-v' + (m.value_source === 'figure-read' ? ' ph-approx' : ''),
        text: valueText(m, null), title: tip(m) });
      b.addEventListener('click', function () { openPop(b, s, c, [i]); });
      td.appendChild(b);
    });
    return td;
  }
  function row(s) {
    var t = TREAT[s.treatment] || { glyph: '', cls: '' };
    var first = el('th', { scope: 'row', cls: 'ph-sample' }, [
      el('span', { cls: 'seq-pop ' + t.cls }, [t.glyph ? el('span', { cls: 'glyph', 'aria-hidden': 'true', text: t.glyph }) : null,
        s.id]),
      el('span', { cls: 'sub', text: [s.kind].concat(s.strains).join(' · ') })]);
    return el('tr', {}, [first].concat(visible.map(function (k) { return cell(s, k); })));
  }
  function render() {
    closePop();
    var st = state();
    shown = samples.filter(function (s) { return matches(s, st); }).sort(compare);
    head();
    var body = table.tBodies[0];
    body.textContent = '';
    var frag = document.createDocumentFragment();
    shown.forEach(function (s) { frag.appendChild(row(s)); });
    if (!shown.length) {
      frag.appendChild(el('tr', { cls: 'seq-empty' }, [el('td', { colspan: String(visible.length + 1),
        text: visible.length ? 'No samples match these filters.' : 'Choose trait columns to show.' })]));
    }
    body.appendChild(frag);
    var n = 0;
    shown.forEach(function (s) { visible.forEach(function (k) { if (s.c[k]) n += s.c[k].length; }); });
    count.textContent = '';
    count.appendChild(el('strong', { text: String(shown.length) }));
    count.appendChild(document.createTextNode(' of ' + samples.length + ' samples · ' + n + ' values shown'));
    writeUrl(st);
  }

  /* ---------------------------------------------------------- URL state */
  var FIELDS = ['q', 'treatment', 'line', 'timepoint', 'paper'];
  function writeUrl(st) {
    var p = new URLSearchParams();
    FIELDS.forEach(function (k) { if (st[k]) p.set(k, form.elements[k].value.trim()); });
    if (st.kind !== LINEAGE) p.set('kind', st.kind || 'all');
    if (st.empty) p.set('empty', '1');
    var d = defaults();
    if (visible.join() !== d.join()) p.set('cols', visible.join(',') || 'none');
    if (sort.key !== 'sample' || sort.dir !== 1) p.set('sort', (sort.dir < 0 ? '-' : '') + sort.key);
    var q = p.toString();
    history.replaceState(null, '', location.pathname + (q ? '?' + q : '') + location.hash);
  }
  function readUrl() {
    var p = new URLSearchParams(location.search);
    FIELDS.forEach(function (k) { if (p.has(k)) form.elements[k].value = p.get(k); });
    form.elements.kind.value = p.has('kind') ? (p.get('kind') === 'all' ? '' : p.get('kind')) : LINEAGE;
    form.elements.empty.checked = p.get('empty') === '1';
    var c = p.get('cols');
    visible = c ? (c === 'none' ? [] : c.split(',').filter(function (k) { return colByKey[k]; })) : defaults();
    var s = p.get('sort');
    if (s) {
      var key = s.replace(/^-/, '');
      if (key === 'sample' || colByKey[key]) sort = { key: key, dir: s.charAt(0) === '-' ? -1 : 1 };
    }
  }

  /* ---------------------------------------------------------- downloads */
  function csvCell(v) { v = String(v == null ? '' : v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
  document.getElementById('ph-dl').addEventListener('click', function () {
    var header = ['sample', 'treatment', 'line', 'transfer', 'kind', 'strains'].concat(visible.map(function (k) {
      var c = colByKey[k]; return c.label + (c.unit ? ' (' + c.unit + ')' : '');
    }));
    var lines = [header.map(csvCell).join(',')].concat(shown.map(function (s) {
      return [s.id, s.treatment, s.line, s.transfer, s.kind, s.strains.join('; ')].concat(visible.map(function (k) {
        return (s.c[k] || []).map(function (i) {
          var m = M[i];
          return colByKey[k].type === 'list' ? m.statistic + ': ' + valueText(m, '') : valueText(m, null);
        }).join('; ');
      })).map(csvCell).join(',');
    }));
    var a = el('a', { href: URL.createObjectURL(new Blob([lines.join('\n') + '\n'], { type: 'text/csv' })),
                      download: 'multee-phenotypes-table.csv' });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  });

  /* ------------------------------------------------------------- events */
  form.addEventListener('input', render);
  form.addEventListener('change', render);
  form.addEventListener('submit', function (e) { e.preventDefault(); });
  form.addEventListener('reset', function () {
    setTimeout(function () { form.elements.kind.value = LINEAGE; render(); }, 0);
  });
  document.addEventListener('click', function (e) {
    if (pop.hidden) return;
    if (e.target.closest('.ph-pop-close') || (!pop.contains(e.target) && !e.target.closest('.ph-v'))) closePop();
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closePop(); });
  window.addEventListener('resize', closePop);

  /* --------------------------------------------------------------- load */
  fetch('phenotypes.json')
    .then(function (res) { if (!res.ok) throw new Error(res.status); return res.json(); })
    .then(function (data) {
      meta = data.meta; samples = data.samples; M = data.measurements; cols = meta.columns;
      kindOrder = meta.kinds;
      cols.forEach(function (c) { colByKey[c.key] = c; });
      buildFilters();
      buildPicker();
      readUrl();
      document.getElementById('ph-updated').textContent = 'Table updated ' + meta.generated + '.';
      setVisible(visible);
    })
    .catch(function (err) {
      console.error(err);
      count.textContent = 'The measurements could not be loaded. ';
      count.appendChild(link('phenotypes.csv', 'Download them as CSV instead.'));
    });
})();
