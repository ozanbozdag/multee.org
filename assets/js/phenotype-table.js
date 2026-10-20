/* ==========================================================================
   phenotype-table.js — the Phenotype data table (phenotypes/index.html).
   Loads phenotypes/phenotypes.json (generated from phenotypes.csv by
   tools/build_phenotypes.py; do not edit by hand), then filters, sorts and
   renders it. Filter and sort state live in the URL query so a view can be
   shared. Same conventions as sequence-table.js. No framework, no build step.
   ========================================================================== */
(function () {
  'use strict';

  var TREAT = {
    PA: { name: 'Anaerobic', glyph: '○', cls: 'chip-pa', order: 0 },
    PM: { name: 'Mixotrophic', glyph: '◒', cls: 'chip-pm', order: 1 },
    PO: { name: 'Aerobic', glyph: '●', cls: 'chip-po', order: 2 }
  };
  var SOURCE = {
    'text': 'Stated in the text',
    'table': 'From a table in the paper',
    'supplement-table': 'From a supplementary table',
    'source-data': 'From the paper’s source data',
    'derived': 'Computed from the paper’s data',
    'figure-read': 'Read off a figure (approximate)'
  };

  var form = document.getElementById('ph-filters');
  var body = document.getElementById('ph-body');
  var count = document.getElementById('ph-count');
  var heads = Array.prototype.slice.call(document.querySelectorAll('#ph-table thead th[data-key]'));
  if (!form || !body) return;

  var rows = [], shown = [], traitLabel = {}, traitOrder = {}, typeOrder = [];
  var sort = { key: 'sample', dir: 1 };

  /* ------------------------------------------------------------ helpers */
  function el(tag, attrs, kids) {
    var n = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === 'text') n.textContent = attrs[k];
      else if (k === 'cls') n.className = attrs[k];
      else n.setAttribute(k, attrs[k]);
    });
    (kids || []).forEach(function (c) { if (c) n.appendChild(c); });
    return n;
  }
  function text(s) { return document.createTextNode(s); }
  function link(href, label, title) {
    var a = el('a', { href: href, text: label, rel: 'noopener' });
    if (title) a.title = title;
    return a;
  }
  function natural(a, b) { return String(a).localeCompare(String(b), undefined, { numeric: true }); }
  function popLabel(r) {
    if (r.sample_type === 'Ancestor') return (r.treatment || 'Shared') + ' ancestor';
    if (!r.treatment) return '—';
    return r.treatment + (r.line || '');
  }
  function tp(r) { return r.transfer == null ? '—' : 't' + r.transfer; }
  function valueText(r) {
    var v = r.value;
    if (r.error) v += ' ± ' + r.error;
    if (r.unit) v += ' ' + r.unit;
    return v;
  }

  /* Sorting by "sample" follows the experiment: ancestors first, then treatment, line, timepoint, trait. */
  function sampleKey(r) {
    return [r.sample_type === 'Ancestor' ? 0 : 1, (TREAT[r.treatment] || { order: 9 }).order,
            r.line == null ? 9 : r.line, r.transfer == null ? -1 : r.transfer,
            typeOrder.indexOf(r.sample_type), r.sample, traitOrder[r.trait], r.statistic];
  }
  var KEYS = {
    sample: sampleKey,
    transfer: function (r) { return [r.transfer == null ? -1 : r.transfer].concat(sampleKey(r)); },
    type: function (r) { return [typeOrder.indexOf(r.sample_type)].concat(sampleKey(r)); },
    trait: function (r) { return [traitOrder[r.trait], r.statistic].concat(sampleKey(r)); },
    value: function (r) {
      var n = parseFloat(r.value);
      return [r.trait, isNaN(n) ? Infinity : n, r.value].concat(sampleKey(r));
    },
    paper: function (r) { return [r.paper, r.location].concat(sampleKey(r)); }
  };
  function compare(a, b) {
    var ka = KEYS[sort.key](a), kb = KEYS[sort.key](b);
    for (var i = 0; i < ka.length; i++) {
      var c = (typeof ka[i] === 'number' && typeof kb[i] === 'number') ? ka[i] - kb[i] : natural(ka[i], kb[i]);
      if (c) return c * sort.dir;
    }
    return 0;
  }

  /* ------------------------------------------------------------ filters */
  function fillSelect(name, allLabel, options) {
    var s = form.elements[name];
    s.appendChild(el('option', { value: '', text: allLabel }));
    options.forEach(function (o) { s.appendChild(el('option', { value: o[0], text: o[1] })); });
  }
  function present(fn) {
    var seen = {};
    rows.forEach(function (r) { var v = fn(r); if (v != null && v !== '') seen[v] = true; });
    return seen;
  }
  function buildFilters(meta) {
    var traits = present(function (r) { return r.trait; });
    fillSelect('trait', 'All', meta.traits.filter(function (t) { return traits[t.key]; })
      .map(function (t) { return [t.key, t.label]; }));
    fillSelect('treatment', 'All', [['PA', 'PA · Anaerobic'], ['PM', 'PM · Mixotrophic'],
      ['PO', 'PO · Aerobic'], ['anc', 'Ancestors']]);
    fillSelect('line', 'All', [1, 2, 3, 4, 5].map(function (n) { return [String(n), 'Line ' + n]; }));
    fillSelect('timepoint', 'All', Object.keys(present(function (r) { return r.transfer; }))
      .sort(function (a, b) { return a - b; }).map(function (t) { return [t, 't' + t]; }));
    var types = present(function (r) { return r.sample_type; });
    fillSelect('type', 'All', typeOrder.filter(function (t) { return types[t]; }).map(function (t) { return [t, t]; }));
    fillSelect('paper', 'All', meta.papers.map(function (p) { return [p.label, p.label]; }));
  }
  function state() {
    var f = form.elements;
    return { q: f.q.value.trim().toLowerCase(), trait: f.trait.value, treatment: f.treatment.value,
             line: f.line.value, timepoint: f.timepoint.value, type: f.type.value, paper: f.paper.value,
             source: f.source.value };
  }
  function matches(r, s) {
    if (s.trait && r.trait !== s.trait) return false;
    if (s.treatment === 'anc' ? r.sample_type !== 'Ancestor'
        : s.treatment && (r.sample_type === 'Ancestor' || r.treatment !== s.treatment)) return false;
    if (s.line && String(r.line) !== s.line) return false;
    if (s.timepoint && String(r.transfer) !== s.timepoint) return false;
    if (s.type && r.sample_type !== s.type) return false;
    if (s.paper && r.paper !== s.paper) return false;
    if (s.source === 'stated' && r.value_source === 'figure-read') return false;
    if (s.q) {
      var hay = [r.sample, popLabel(r), tp(r), r.strain, r.sample_type, r.genotype, traitLabel[r.trait],
                 r.value, r.unit, r.statistic, r.conditions, r.method, r.paper, r.location, r.notes]
        .join(' ').toLowerCase();
      if (hay.indexOf(s.q) < 0) return false;
    }
    return true;
  }

  /* ------------------------------------------------------------- render */
  function row(r) {
    var t = TREAT[r.treatment] || { glyph: '', cls: '' };
    var pop = el('span', { cls: 'seq-pop ' + t.cls }, [
      t.glyph ? el('span', { cls: 'glyph', 'aria-hidden': 'true', text: t.glyph }) : null, text(popLabel(r))]);
    var sample = el('td', {}, [pop, el('span', { cls: 'sub', text: r.sample })]);
    if (r.strain) sample.appendChild(el('span', { cls: 'sub', text: r.strain }));

    var type = el('td', {}, [text(r.sample_type)]);
    if (r.genotype) type.appendChild(el('span', { cls: 'sub ph-wrap', text: r.genotype }));

    var trait = el('td', {}, [text(traitLabel[r.trait] || r.trait)]);
    if (r.statistic) trait.appendChild(el('span', { cls: 'sub ph-wrap', text: r.statistic }));

    var value = el('td', { cls: 'ph-value' }, [el('span', { cls: 'ph-num', text: valueText(r) })]);
    var bits = [];
    if (r.error_type) bits.push(r.error_type);
    if (r.n) bits.push('n = ' + r.n);
    if (bits.length) value.appendChild(el('span', { cls: 'sub', text: bits.join(' · ') }));
    if (r.value_source === 'figure-read') {
      value.appendChild(el('span', { cls: 'sub ph-approx', text: '≈ read off figure' }));
    }

    var how = el('td', { cls: 'ph-how' });
    if (r.conditions) how.appendChild(el('span', { cls: 'ph-line', text: r.conditions }));
    if (r.method || r.notes) {
      how.appendChild(el('details', { cls: 'ph-notes' }, [
        el('summary', { text: r.method && r.notes ? 'Method & notes' : r.method ? 'Method' : 'Notes' }),
        r.method ? el('p', {}, [el('strong', { text: 'Method. ' }), text(r.method)]) : null,
        r.notes ? el('p', { text: r.notes }) : null]));
    }
    if (!how.childNodes.length) how.appendChild(el('span', { cls: 'dim', text: '—' }));

    var src = el('td', { cls: 'seq-papers' }, [link('https://doi.org/' + r.doi, r.paper)]);
    var where = [r.location, SOURCE[r.value_source]].filter(Boolean).join(' · ');
    if (where) src.appendChild(el('span', { cls: 'sub ph-wrap', text: where }));

    return el('tr', {}, [sample, el('td', { cls: 'mono', text: tp(r) }), type, trait, value, how, src]);
  }
  function render() {
    var s = state();
    shown = rows.filter(function (r) { return matches(r, s); }).sort(compare);
    body.textContent = '';
    var frag = document.createDocumentFragment();
    shown.forEach(function (r) { frag.appendChild(row(r)); });
    if (!shown.length) {
      frag.appendChild(el('tr', { cls: 'seq-empty' }, [el('td', { colspan: '7', text: 'No measurements match these filters.' })]));
    }
    body.appendChild(frag);
    var samples = {};
    shown.forEach(function (r) { samples[r.sample] = true; });
    count.textContent = '';
    count.appendChild(el('strong', { text: String(shown.length) }));
    count.appendChild(text(' of ' + rows.length + ' measurements shown · ' + Object.keys(samples).length + ' samples'));
    heads.forEach(function (th) {
      if (th.getAttribute('data-key') === sort.key) th.setAttribute('aria-sort', sort.dir > 0 ? 'ascending' : 'descending');
      else th.removeAttribute('aria-sort');
    });
    writeUrl(s);
  }

  /* ---------------------------------------------------------- URL state */
  var FIELDS = ['q', 'trait', 'treatment', 'line', 'timepoint', 'type', 'paper', 'source'];
  function writeUrl(s) {
    var p = new URLSearchParams();
    FIELDS.forEach(function (k) { if (s[k]) p.set(k, form.elements[k].value.trim()); });
    if (sort.key !== 'sample' || sort.dir !== 1) p.set('sort', (sort.dir < 0 ? '-' : '') + sort.key);
    var q = p.toString();
    history.replaceState(null, '', location.pathname + (q ? '?' + q : '') + location.hash);
  }
  function readUrl() {
    var p = new URLSearchParams(location.search);
    FIELDS.forEach(function (k) { if (p.has(k)) form.elements[k].value = p.get(k); });
    var s = p.get('sort');
    if (s) {
      var key = s.replace(/^-/, '');
      if (KEYS[key]) sort = { key: key, dir: s.charAt(0) === '-' ? -1 : 1 };
    }
  }

  /* ---------------------------------------------------------- downloads */
  var COLS = ['trait', 'treatment', 'line', 'transfer', 'sample', 'strain', 'sample_type', 'genotype',
              'value', 'error', 'error_type', 'n', 'unit', 'statistic', 'conditions', 'method',
              'paper', 'doi', 'location', 'value_source', 'confidence', 'notes'];
  function csvCell(v) { v = String(v == null ? '' : v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
  document.getElementById('ph-dl').addEventListener('click', function () {
    var lines = [COLS.join(',')].concat(shown.map(function (r) {
      return COLS.map(function (c) { return csvCell(r[c]); }).join(',');
    }));
    var a = el('a', { href: URL.createObjectURL(new Blob([lines.join('\n') + '\n'], { type: 'text/csv' })),
                      download: 'multee-phenotypes.csv' });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  });

  /* ------------------------------------------------------------- events */
  heads.forEach(function (th) {
    th.querySelector('button').addEventListener('click', function () {
      var key = th.getAttribute('data-key');
      sort = { key: key, dir: sort.key === key ? -sort.dir : 1 };
      render();
    });
  });
  form.addEventListener('input', render);
  form.addEventListener('change', render);
  form.addEventListener('submit', function (e) { e.preventDefault(); });
  form.addEventListener('reset', function () { setTimeout(render, 0); });

  /* --------------------------------------------------------------- load */
  fetch('phenotypes.json')
    .then(function (res) { if (!res.ok) throw new Error(res.status); return res.json(); })
    .then(function (data) {
      rows = data.rows;
      typeOrder = data.meta.sample_types;
      data.meta.traits.forEach(function (t, i) { traitLabel[t.key] = t.label; traitOrder[t.key] = i; });
      buildFilters(data.meta);
      readUrl();
      document.getElementById('ph-updated').textContent = 'Table updated ' + data.meta.generated + '.';
      render();
    })
    .catch(function () {
      count.textContent = 'The measurements could not be loaded. ';
      count.appendChild(link('phenotypes.csv', 'Download them as CSV instead.'));
    });
})();
