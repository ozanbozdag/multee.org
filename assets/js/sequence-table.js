/* ==========================================================================
   sequence-table.js — the Genome sequences table (sequences/index.html).
   Loads sequences/runs.json (generated from the lab's sequencing catalogue by
   export_public.py; do not edit by hand), then filters, sorts and renders it.
   Filter and sort state live in the URL query so a view can be shared.
   No framework, no build step.
   ========================================================================== */
(function () {
  'use strict';

  var TREAT = {
    PA: { name: 'Anaerobic', glyph: '○', cls: 'chip-pa', order: 0 },
    PM: { name: 'Mixotrophic', glyph: '◒', cls: 'chip-pm', order: 1 },
    PO: { name: 'Aerobic', glyph: '●', cls: 'chip-po', order: 2 }
  };
  var TYPE_ORDER = ['Ancestor', 'Isolate', 'Isolate (Small)', 'Isolate (Large)', 'Population',
                    'Donut strain', 'Spread strain'];
  var NO_PAPER = 'Unpublished';

  var form = document.getElementById('seq-filters');
  var body = document.getElementById('seq-body');
  var count = document.getElementById('seq-count');
  var heads = Array.prototype.slice.call(document.querySelectorAll('#seq-table thead th'));
  if (!form || !body) return;

  var runs = [], shown = [];
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
  function link(href, text, title) {
    var a = el('a', { href: href, text: text, rel: 'noopener' });
    if (title) a.title = title;
    return a;
  }
  function mb(n) { return (n / 1e6).toFixed(1) + ' M'; }
  function gb(n) { return n >= 1e9 ? (n / 1e9).toFixed(2) + ' GB' : Math.round(n / 1e6) + ' MB'; }
  function natural(a, b) { return String(a).localeCompare(String(b), undefined, { numeric: true }); }
  function paperLabels(r) { return r.papers.length ? r.papers.map(function (p) { return p.label; }) : [NO_PAPER]; }
  function popLabel(r) {
    if (r.ancestor) return r.treatment === 'PM' ? 'PM/PO ancestor' : r.treatment + ' ancestor';
    return r.treatment + r.line;
  }

  /* Sorting by "sample" follows the experiment: ancestors first, then treatment, line, timepoint; within a
     timepoint the isolate comes first and each donut sits directly above the spread strain that arose from it. */
  function sampleKey(r) {
    var derived = /strain$/.test(r.type) ? 1 : 0;
    var rep = derived ? Number((r.sample.match(/(\d+)$/) || [0, 0])[1]) : 0;
    return [r.ancestor ? 0 : 1, (TREAT[r.treatment] || { order: 9 }).order, r.line || 0, r.transfer,
            derived, rep, TYPE_ORDER.indexOf(r.type), r.sample];
  }
  var KEYS = {
    sample: sampleKey,
    transfer: function (r) { return [r.transfer].concat(sampleKey(r)); },
    type: function (r) { return [TYPE_ORDER.indexOf(r.type)].concat(sampleKey(r)); },
    strain: function (r) { return [r.strain || '~']; },
    ploidy: function (r) { return [r.ploidy || '~'].concat(sampleKey(r)); },
    paper: function (r) { return [paperLabels(r)[0]].concat(sampleKey(r)); },
    run: function (r) { return [r.run]; },
    platform: function (r) { return [r.platform].concat(sampleKey(r)); },
    reads: function (r) { return [r.reads]; },
    bytes: function (r) { return [r.bytes]; }
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
  function unique(fn) {
    var seen = {};
    runs.forEach(function (r) { [].concat(fn(r)).forEach(function (v) { seen[v] = true; }); });
    return Object.keys(seen);
  }
  function buildFilters() {
    fillSelect('treatment', 'All', [['PA', 'PA · Anaerobic'], ['PM', 'PM · Mixotrophic'],
      ['PO', 'PO · Aerobic'], ['anc', 'Ancestors']]);
    fillSelect('line', 'All', [1, 2, 3, 4, 5].map(function (n) { return [String(n), 'Line ' + n]; }));
    fillSelect('timepoint', 'All', unique(function (r) { return r.transfer; })
      .sort(function (a, b) { return a - b; }).map(function (t) { return [t, 't' + t]; }));
    fillSelect('type', 'All', unique(function (r) { return r.type; })
      .sort(function (a, b) { return TYPE_ORDER.indexOf(a) - TYPE_ORDER.indexOf(b); })
      .map(function (t) { return [t, t]; }));
    fillSelect('paper', 'All', unique(paperLabels).sort(function (a, b) {
      return (a === NO_PAPER) - (b === NO_PAPER) || natural(a, b);
    }).map(function (p) { return [p, p]; }));
  }
  function state() {
    var f = form.elements;
    return { q: f.q.value.trim().toLowerCase(), treatment: f.treatment.value, line: f.line.value,
             timepoint: f.timepoint.value, type: f.type.value, paper: f.paper.value };
  }
  function matches(r, s) {
    if (s.treatment === 'anc' ? !r.ancestor : s.treatment && (r.ancestor || r.treatment !== s.treatment)) return false;
    if (s.line && String(r.line) !== s.line) return false;
    if (s.timepoint && String(r.transfer) !== s.timepoint) return false;
    if (s.type && r.type !== s.type) return false;
    if (s.paper && paperLabels(r).indexOf(s.paper) < 0) return false;
    if (s.q) {
      var hay = [r.sample, popLabel(r), 't' + r.transfer, r.strain, r.type, r.run, r.platform, r.bioproject]
        .concat(paperLabels(r)).join(' ').toLowerCase();
      if (hay.indexOf(s.q) < 0) return false;
    }
    return true;
  }

  /* ------------------------------------------------------------- render */
  function row(r) {
    var t = TREAT[r.treatment] || { glyph: '', cls: '' };
    var pop = el('span', { cls: 'seq-pop ' + t.cls }, [
      el('span', { cls: 'glyph', 'aria-hidden': 'true', text: t.glyph }), document.createTextNode(popLabel(r))]);
    var papers = r.papers.length
      ? el('span', { cls: 'seq-papers' }, r.papers.map(function (p) { return link('https://doi.org/' + p.doi, p.label); }))
      : el('span', { cls: 'dim', text: '—', title: NO_PAPER });
    var files = el('span', { cls: 'seq-files mono' }, r.fastq.map(function (f, i) {
      var name = r.fastq.length > 1 ? 'R' + (i + 1) : 'FASTQ';
      return link(f.url, name, 'Download ' + f.url.split('/').pop() + ' (md5 ' + f.md5 + ')');
    }));
    files.appendChild(el('span', { cls: 'sub', text: gb(r.bytes) + ' gzipped' }));
    var run = el('span', {}, [
      link('https://www.ebi.ac.uk/ena/browser/view/' + r.run, r.run, 'Open the run record at ENA'),
      el('span', { cls: 'sub' }, [link('https://www.ncbi.nlm.nih.gov/sra/' + r.run, 'SRA', 'Open the run at NCBI SRA'),
        document.createTextNode(' · '),
        link('https://www.ncbi.nlm.nih.gov/bioproject/' + r.bioproject + '/', r.bioproject)])]);
    return el('tr', {}, [
      el('td', {}, [pop, el('span', { cls: 'sub', text: r.sample })]),
      el('td', { cls: 'mono', text: 't' + r.transfer }),
      el('td', { text: r.type }),
      el('td', { cls: 'mono', text: r.strain || '—' }),
      el('td', { cls: r.ploidy ? '' : 'dim', text: r.ploidy || '—' }),
      el('td', {}, [papers]),
      el('td', { cls: 'mono' }, [run]),
      el('td', { cls: 'dim', text: r.platform }),
      el('td', { cls: 'mono num', text: mb(r.reads) }),
      el('td', {}, [files])
    ]);
  }
  function render() {
    var s = state();
    shown = runs.filter(function (r) { return matches(r, s); }).sort(compare);
    body.textContent = '';
    var frag = document.createDocumentFragment();
    shown.forEach(function (r) { frag.appendChild(row(r)); });
    if (!shown.length) {
      frag.appendChild(el('tr', { cls: 'seq-empty' }, [el('td', { colspan: '10', text: 'No runs match these filters.' })]));
    }
    body.appendChild(frag);
    var bytes = shown.reduce(function (a, r) { return a + r.bytes; }, 0);
    count.textContent = '';
    count.appendChild(el('strong', { text: String(shown.length) }));
    count.appendChild(document.createTextNode(' of ' + runs.length + ' runs shown · ' + gb(bytes) + ' of read files'));
    heads.forEach(function (th) {
      if (th.getAttribute('data-key') === sort.key) th.setAttribute('aria-sort', sort.dir > 0 ? 'ascending' : 'descending');
      else th.removeAttribute('aria-sort');
    });
    writeUrl(s);
  }

  /* ---------------------------------------------------------- URL state */
  function writeUrl(s) {
    var p = new URLSearchParams();
    Object.keys(s).forEach(function (k) { if (s[k]) p.set(k, form.elements[k].value.trim()); });
    if (sort.key !== 'sample' || sort.dir !== 1) p.set('sort', (sort.dir < 0 ? '-' : '') + sort.key);
    var q = p.toString();
    history.replaceState(null, '', location.pathname + (q ? '?' + q : '') + location.hash);
  }
  function readUrl() {
    var p = new URLSearchParams(location.search);
    ['q', 'treatment', 'line', 'timepoint', 'type', 'paper'].forEach(function (k) {
      if (p.has(k)) form.elements[k].value = p.get(k);
    });
    var s = p.get('sort');
    if (s) {
      var key = s.replace(/^-/, '');
      if (KEYS[key]) sort = { key: key, dir: s.charAt(0) === '-' ? -1 : 1 };
    }
  }

  /* ---------------------------------------------------------- downloads */
  function save(text, name, type) {
    var a = el('a', { href: URL.createObjectURL(new Blob([text], { type: type })), download: name });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }
  function csvCell(v) { v = String(v == null ? '' : v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
  document.getElementById('dl-csv').addEventListener('click', function () {
    var cols = ['sample', 'population', 'transfer', 'strain', 'type', 'ploidy', 'papers', 'run', 'bioproject',
                'platform', 'read_pairs', 'fastq_bytes', 'fastq_urls', 'fastq_md5'];
    var lines = [cols.join(',')].concat(shown.map(function (r) {
      return [r.sample, popLabel(r), r.transfer, r.strain, r.type, r.ploidy, paperLabels(r).join('; '), r.run,
              r.bioproject, r.platform, r.reads, r.bytes,
              r.fastq.map(function (f) { return f.url; }).join(' '),
              r.fastq.map(function (f) { return f.md5; }).join(' ')].map(csvCell).join(',');
    }));
    save(lines.join('\n') + '\n', 'multee-runs.csv', 'text/csv');
  });
  document.getElementById('dl-urls').addEventListener('click', function () {
    var urls = [];
    shown.forEach(function (r) { r.fastq.forEach(function (f) { urls.push(f.url); }); });
    save(urls.join('\n') + '\n', 'multee-fastq-urls.txt', 'text/plain');
  });

  /* ------------------------------------------------------------- events */
  heads.forEach(function (th) {
    th.querySelector('button').addEventListener('click', function () {
      var key = th.getAttribute('data-key');
      sort = { key: key, dir: sort.key === key ? -sort.dir : (key === 'reads' || key === 'bytes' ? -1 : 1) };
      render();
    });
  });
  form.addEventListener('input', render);
  form.addEventListener('change', render);
  form.addEventListener('submit', function (e) { e.preventDefault(); });
  form.addEventListener('reset', function () { setTimeout(render, 0); });

  /* --------------------------------------------------------------- load */
  fetch('runs.json')
    .then(function (res) { if (!res.ok) throw new Error(res.status); return res.json(); })
    .then(function (data) {
      runs = data.runs;
      buildFilters();
      readUrl();
      var projects = document.getElementById('seq-projects');
      projects.textContent = '';
      data.meta.bioprojects.forEach(function (bp, i) {
        if (i) projects.appendChild(document.createTextNode(i === data.meta.bioprojects.length - 1 ? ' and ' : ', '));
        projects.appendChild(link('https://www.ncbi.nlm.nih.gov/bioproject/' + bp + '/', bp));
      });
      document.getElementById('seq-updated').textContent = 'Table updated ' + data.meta.generated + '.';
      render();
    })
    .catch(function () {
      count.textContent = 'The run list could not be loaded. ';
      count.appendChild(link('runs.csv', 'Download it as CSV instead.'));
    });
})();
