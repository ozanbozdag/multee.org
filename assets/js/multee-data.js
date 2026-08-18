/* ==========================================================================
   multee-data.js — the single source of truth for every interactive on the site.
   Plain global, no modules, no build step. Load before any interactive script.

   RULE OF THIS FILE: every number carries its source. `measured: true` means the
   value appears in a published paper or was confirmed by the lab. Anything with
   `measured: false` is interpolation for drawing only, and any interactive that
   renders it MUST show it differently (dashed, hollow, or labelled) so a reader
   is never shown a guess styled as data.

   Day 0 = the first MuLTEE transfer, 2018.
   ========================================================================== */
window.MULTEE = (function () {
  'use strict';

  /* ---------------------------------------------------------------- sources */
  var SRC = {
    bozdag2023:   { key: 'bozdag2023',   cite: 'Bozdag et al. 2023, Nature 617:747–754',            doi: '10.1038/s41586-023-06052-1' },
    bozdag2021:   { key: 'bozdag2021',   cite: 'Bozdag et al. 2021, Nature Communications 12:2838', doi: '10.1038/s41467-021-23104-0' },
    tong2025:     { key: 'tong2025',     cite: 'Tong et al. 2025, Nature 639:691–699',              doi: '10.1038/s41586-025-08689-6' },
    pineau2024:   { key: 'pineau2024',   cite: 'Pineau et al. 2024, Nature Ecology & Evolution 8:1010–1020', doi: '10.1038/s41559-024-02367-y' },
    montrose2024: { key: 'montrose2024', cite: 'Montrose et al. 2024, Science Advances 10:eadn2706', doi: '10.1126/sciadv.adn2706' },
    day2024:      { key: 'day2024',      cite: 'Day et al. 2024, Physical Review X 14:011008',       doi: '10.1103/PhysRevX.14.011008' },
    nara2025:     { key: 'nara2025',     cite: 'Narayanasamy et al. 2025, Science Advances 11:eadr6399', doi: '10.1126/sciadv.adr6399' },
    yoon2025:     { key: 'yoon2025',     cite: 'Yoon et al. 2025, Nature Communications 16:9309',    doi: '10.1038/s41467-025-64368-0' },
    cedeno2025:   { key: 'cedeno2025',   cite: 'Cedeño-Pérez et al. 2025, PLOS Computational Biology', doi: '10.1101/2025.04.23.650085' },
    ratcliff2012: { key: 'ratcliff2012', cite: 'Ratcliff et al. 2012, PNAS 109:1595–1600',           doi: '10.1073/pnas.1115323109' },
    ratcliff2015: { key: 'ratcliff2015', cite: 'Ratcliff et al. 2015, Nature Communications 6:6102', doi: '10.1038/ncomms7102' },
    lab:          { key: 'lab',          cite: 'Ratcliff Lab, unpublished / operational record',      doi: null }
  };

  /* -------------------------------------------------------------- the clock
     The lab reports 9,000+ generations as of 2026. The published record runs to
     1,000 transfers (~5,000 generations, Tong 2025), so the conversion below is
     the published one and the present-day total is the lab's own figure. */
  /* TWO CLOCKS, and they are NOT the same. Conflating them is the easiest way
     to put a wrong number on this site.
       TRANSFER DAY  – experiment time. TRAITS[].day, RADIUS_SERIES.days and the
                       scrubber all use this. Day 600 is 600 completed transfers.
       CALENDAR DATE – wall-clock time. PAPERS[].date uses this.
     There is no sound mapping between them. Transfers are not one per calendar
     day: at 5 generations per transfer, the lab's 9,000+ generations would be
     1,800 transfer days, which is under five years, yet that figure is current
     in 2026. So the experiment has paused at times, and any transfer-day-to-year
     conversion would be invented. Do not add one. */
  var CLOCK = {
    startYear: 2018,
    generationsPerTransfer: 5,          // 600 transfers ≈ 3,000 gens (Bozdag 2023)
    publishedThroughDay: 1000,          // Tong 2025 extends the record to day 1000
    currentGenerations: '9,000+',       // lab-confirmed, unpublished beyond day 1000
    currentGenerationsNote: 'Lab record. The published series ends at 1,000 transfers.',
    maxDay: 1800                        // scrub range; beyond publishedThroughDay is unpublished
  };

  /* ------------------------------------------------------------ measurements
     Biomass-weighted cluster radius, anaerobic (PA) lines. The two values the
     paper states in words are day 0 (16 µm) and day 600 (434 µm). */
  var RADIUS = [
    { day: 0,    um: 16,  measured: true,  src: 'bozdag2023', note: 'Ancestral snowflake yeast' },
    { day: 600,  um: 434, measured: true,  src: 'bozdag2023', note: 'Macroscopic, visible without a microscope' }
  ];

  /* --------------------------------------------------- the full time series
     PROVENANCE, read this before using these numbers.

     Bozdag et al. 2023 Fig. 1e plots biomass-weighted mean radius for all five
     anaerobic populations at 12 sampling points, 50 days apart. The paper does
     not print those values; they live in its source-data file, which we do not
     hold. The series below was DIGITIZED from the published figure:

       - The figure was rasterised at 300 dpi and the y-axis calibrated from its
         own tick marks. The ticks are 89.2 px per doubling on a log2 axis with
         16 µm at the baseline, and the six tick spacings agree to within 1 px.
       - Data points were located by colour-matched connected components.
       - Where two populations' markers overlapped and merged, that population's
         value was interpolated along its own curve in log space.
       - Day 600 is NOT digitized from Fig. 1e. It is read from the Fig. 1b strip
         plot, whose five points are separated well enough to read individually.
         Those five values average to exactly the 434 µm the paper reports, which
         is the check that the calibration is sound.
       - Independent validation: digitizing Fig. 1e alone put the day-600 mean at
         425.8 µm against a published 434 µm, an error of 1.9%.

     So: treat the SHAPE as reliable and individual values as approximate to a
     few per cent. Anything drawn from this must be labelled as digitized from
     the published figure. If the lab supplies the source-data file, replace this
     wholesale and delete this comment. */
  var RADIUS_SERIES = {
    digitized: true,
    src: 'bozdag2023',
    note: 'Digitized from Fig. 1e; day 600 from Fig. 1b. Approximate to a few per cent.',
    days:  [0, 50, 100, 150, 200, 250, 300, 350, 400, 450, 500, 550, 600],
    lines: {
      PA1: [16, 31.6, 35.0, 36.6, 38.2, 37.6, 39.7,  44.5,  50.4,  93.5, 262.4, 380.2, 432],
      PA2: [16, 35.9, 35.9, 41.9, 54.4, 61.9, 112.0, 214.1, 261.6, 258.0, 410.1, 484.1, 578],
      PA3: [16, 39.7, 39.7, 39.7, 42.0, 43.1, 46.0,  55.3,  66.4,  79.8,  95.9, 166.8, 290],
      PA4: [16, 40.5, 40.5, 40.5, 40.5, 46.3, 51.3,  58.3,  60.3,  86.8, 293.3, 293.3, 412],
      PA5: [16, 44.7, 44.7, 44.7, 51.8, 74.4, 106.9, 143.9, 318.5, 386.2, 410.1, 354.2, 458]
    },
    mean:  [16, 38.5, 39.2, 40.7, 45.4, 52.7, 71.2, 103.2, 151.4, 180.9, 294.4, 335.7, 434.0]
  };

  /* Generations accrue at different rates per treatment, because the treatments
     grow at different rates. From Fig. 1a, at day 600: PA ~3,000, PO ~3,600,
     PM ~3,700 generations. This is why "5 generations a day" and "6 generations
     a day" both appear in the literature: they are different treatments. */
  var GENS_PER_DAY = {
    PA: 5.0, PM: 6.2, PO: 6.0,
    src: 'bozdag2023', note: 'Slopes read from Fig. 1a. PA is the 600 transfers ≈ 3,000 generations figure quoted in the text.'
  };

  /* Cell aspect ratio, anaerobic lines. Two published endpoints; Yoon et al.
     note the trajectory departs from simple scaling at t400 and t1000. */
  var ASPECT = [
    { day: 0,    value: 1.30, measured: true, src: 'yoon2025' },
    { day: 1000, value: 3.28, measured: true, src: 'yoon2025' }
  ];

  /* Cross-sectional module size (SPI imaging), anaerobic lines. */
  var MODULE = [
    { day: 0,    um: 30.7, measured: true, src: 'yoon2025' },
    { day: 1000, um: 87.1, measured: true, src: 'yoon2025' }
  ];

  /* ------------------------------------------------------------------ ploidy
     Tong 2025: tetraploid by day 50, fixed by day 100, held for 950 more days,
     in all five mixotrophic and all five anaerobic populations. */
  var PLOIDY = [
    { fromDay: 0,   toDay: 50,   state: '2n', label: 'Diploid',            measured: true, src: 'tong2025' },
    { fromDay: 50,  toDay: 100,  state: '→4n', label: 'Tetraploidy arising', measured: true, src: 'tong2025' },
    { fromDay: 100, toDay: null, state: '4n', label: 'Tetraploid, fixed',  measured: true, src: 'tong2025' }
  ];

  /* ------------------------------------------------------------------ traits
     `day` is when the trait is first reported, not necessarily when it arose.
     `approx` marks a reported range rather than a measured onset. */
  var TRAITS = [
    { id: 'elongation',  day: 100,  approx: true,  lines: 'PA',
      label: 'Cells elongate',
      detail: 'Higher cellular aspect ratio lowers packing density and delays the strain-driven fracture that limits cluster size.',
      src: 'bozdag2023' },
    { id: 'tetraploidy', day: 100,  approx: false, lines: 'PA + PM',
      label: 'Tetraploidy fixes',
      detail: 'Whole-genome duplication arose by day 50 and fixed by day 100 in all ten focal populations. Longer tetraploid cells make larger clusters.',
      src: 'tong2025' },
    { id: 'hsp90',       day: 600,  approx: true,  lines: 'PA',
      label: 'Hsp90 down-regulated',
      detail: 'All five macroscopic anaerobic lineages converged on reduced Hsp90, destabilising Cdc28, delaying mitosis and prolonging polarized growth.',
      src: 'montrose2024' },
    { id: 'synchrony',   day: 200,  approx: false, lines: 'PA',
      label: 'Division becomes synchronous',
      detail: 'The ancestral first-division delay was lost by day 200 and synchrony was retained through day 1,000. Synchrony builds less branched topologies that fracture later.',
      src: 'cedeno2025' },
    { id: 'entangle',    day: 400,  approx: true,  lines: 'PA',
      label: 'Branches entangle',
      detail: 'Elongated branches interlock in configurations that rigid-body motion cannot undo, so groups hold together after many cell-cell bonds break.',
      src: 'day2024' },
    { id: 'macroscopic', day: 600,  approx: false, lines: 'PA',
      label: 'Bodies become macroscopic',
      detail: 'Mean cluster radius reaches 434 µm, about 20,000 times the ancestral volume. As a material the yeast goes from weaker than gelatin to the toughness of wood.',
      src: 'bozdag2023' },
    { id: 'diversify',   day: 715,  approx: false, lines: 'PO',
      label: 'Small and large specialists coexist',
      detail: 'Three of five obligately aerobic populations split into coexisting morphs held at roughly 9% large and 91% small by competition for dissolved oxygen.',
      src: 'pineau2024' },
    { id: 'flows',       day: 800,  approx: true,  lines: 'PA',
      label: 'Clusters pump their own fluid',
      detail: 'Above a threshold size, metabolism drives buoyant circulation that carries nutrients inward, sustaining exponential growth past the diffusion limit.',
      src: 'nara2025' },
    { id: 'aneuploidy',  day: 1000, approx: true,  lines: 'PA',
      label: 'Aneuploid routes open',
      detail: 'Anaerobic tetraploids accumulated extensive, partly convergent aneuploidy that tracked the continued evolution of macroscopic size.',
      src: 'tong2025' }
  ];

  /* ------------------------------------------------------------- micrographs
     Attributions are filename-derived and awaiting lab confirmation. */
  var PLATES = [
    { day: 400,  src: 'assets/img/nuclei-cellwall-day400.jpg',        sm: 'assets/img/nuclei-cellwall-day400-sm.jpg',
      alt: 'Confocal micrograph of snowflake yeast with cyan cell walls and amber nuclei, branching from central attachment points.',
      caption: 'Day 400. Cell walls and nuclei. Line not recorded.' },
    { day: 600,  src: 'assets/img/anaerobic-day600-confocal.jpg',     sm: 'assets/img/anaerobic-day600-confocal-sm.jpg',
      alt: 'Confocal micrograph of an anaerobic snowflake yeast cluster, blue-dominant, against black.',
      caption: 'Day 600, anaerobic treatment. Replicate line not recorded.' },
    { day: 715,  src: 'assets/img/aerobic-day715-membrane-cellwall.jpg', sm: 'assets/img/aerobic-day715-membrane-cellwall-sm.jpg',
      alt: 'Fluorescence micrograph of rounder aerobic yeast cells with red membrane and green cell-wall labelling.',
      caption: 'Day 715, obligately aerobic treatment. Replicate line not recorded.' },
    { day: 1000, src: 'assets/img/pa5-day1000-cellwall-gfp.jpg',      sm: 'assets/img/pa5-day1000-cellwall-gfp-sm.jpg',
      alt: 'Dense field of elongated snowflake yeast cells with teal cell walls and green interiors.',
      caption: 'Day 1000, anaerobic line PA5.' }
  ];

  /* ------------------------------------------------------------ publications
     `day` is the publication date expressed in experiment days, negative for
     work that predates the first transfer. `multee` marks papers that use
     MuLTEE populations. Themes drive colour. */
  function dayOf(dateStr) {
    var start = Date.UTC(2018, 0, 1);
    var d = new Date(dateStr + 'T00:00:00Z').getTime();
    return Math.round((d - start) / 86400000);
  }

  var PAPERS = [
    { date: '2012-01-31', title: 'Experimental evolution of multicellularity', short: 'Ratcliff et al. 2012',
      venue: 'PNAS 109:1595–1600', doi: '10.1073/pnas.1115323109', theme: 'origins', multee: false,
      finding: 'Ten replicate populations evolved clonal snowflake clusters within 60 transfers of settling selection.' },
    { date: '2015-01-20', title: 'Origins of multicellular evolvability in snowflake yeast', short: 'Ratcliff et al. 2015',
      venue: 'Nature Communications 6:6102', doi: '10.1038/ncomms7102', theme: 'origins', multee: false,
      finding: 'Loss of ACE2 is the genetic basis; the body plan follows Pascal’s triangle and cluster size is highly heritable.' },
    { date: '2018-01-15', title: 'Cellular packing, mechanical stress and the evolution of multicellularity', short: 'Jacobeen et al. 2018',
      venue: 'Nature Physics 14:286–290', doi: '10.1038/s41567-017-0002-y', theme: 'biophysics', multee: false,
      finding: 'Clusters fracture through growth-induced internal stress; changing packing geometry raises the size ceiling.' },
    { date: '2021-05-14', title: 'Oxygen suppression of macroscopic multicellularity', short: 'Bozdag et al. 2021',
      venue: 'Nature Communications 12:2838', doi: '10.1038/s41467-021-23104-0', theme: 'ecology', multee: false,
      finding: 'Intermediate oxygen suppressed size evolution (+8.9%) while anaerobic (+93%) and high oxygen (+97%) permitted it.' },
    { date: '2022-05-10', title: 'Cellular organization in lab-evolved and extant multicellular species', short: 'Day et al. 2022',
      venue: 'eLife 11:e72707', doi: '10.7554/eLife.72707', theme: 'biophysics', multee: false,
      finding: 'Maximum-entropy cell packing turns noisy assembly into predictable, heritable group-level traits.' },
    { date: '2023-05-10', title: 'De novo evolution of macroscopic multicellularity', short: 'Bozdag et al. 2023',
      venue: 'Nature 617:747–754', doi: '10.1038/s41586-023-06052-1', theme: 'biophysics', multee: true,
      finding: '16 µm to 434 µm in 600 transfers. Cells elongate, branches entangle, and the material goes from weaker than gelatin to the toughness of wood.' },
    { date: '2024-01-24', title: 'Morphological entanglement in living systems', short: 'Day et al. 2024',
      venue: 'Physical Review X 14:011008', doi: '10.1103/PhysRevX.14.011008', theme: 'biophysics', multee: true,
      finding: 'Growth reaches entangled states that agitation cannot, making tough branching bodies broadly accessible.' },
    { date: '2024-03-14', title: 'Emergence and maintenance of stable coexistence', short: 'Pineau et al. 2024',
      venue: 'Nature Ecology & Evolution 8:1010–1020', doi: '10.1038/s41559-024-02367-y', theme: 'ecology', multee: true,
      finding: 'Three of five aerobic populations split into small and large specialists coexisting for ~4,300 generations.' },
    { date: '2024-06-05', title: 'Proteostatic tuning underpins the evolution of novel multicellular traits', short: 'Montrose et al. 2024',
      venue: 'Science Advances 10:eadn2706', doi: '10.1126/sciadv.adn2706', theme: 'genome', multee: true,
      finding: 'All five macroscopic anaerobic lineages converged on reduced Hsp90, which lengthens cells through delayed mitosis.' },
    { date: '2025-03-12', title: 'Genome duplication in a long-term multicellularity evolution experiment', short: 'Tong et al. 2025',
      venue: 'Nature 639:691–699', doi: '10.1038/s41586-025-08689-6', theme: 'genome', multee: true,
      finding: 'Tetraploidy arose by day 50 and fixed by day 100 in all ten focal populations, then held for 950 more days.' },
    { date: '2025-06-20', title: 'Metabolically driven flows enable exponential growth', short: 'Narayanasamy et al. 2025',
      venue: 'Science Advances 11:eadr6399', doi: '10.1126/sciadv.adr6399', theme: 'biophysics', multee: true,
      finding: 'Macroscopic clusters drive their own buoyant circulation, sustaining exponential growth past the diffusion limit.' },
    { date: '2025-10-21', title: 'Real-time, high-throughput super-resolution microscopy via panoramic integration', short: 'Yoon et al. 2025',
      venue: 'Nature Communications 16:9309', doi: '10.1038/s41467-025-64368-0', theme: 'methods', multee: true,
      finding: 'SPI imaging recovers aspect ratio rising from 1.30 to 3.28 and module size from 30.7 µm to 87.1 µm by 1,000 transfers.' },
    { date: '2025-04-23', title: 'Emergence of coordinated cell division', short: 'Cedeño-Pérez et al. 2025',
      venue: 'PLOS Computational Biology', doi: '10.1101/2025.04.23.650085', theme: 'theory', multee: true,
      finding: 'The ancestral first-division delay was lost by day 200; synchrony makes groups bigger by changing topology.' }
  ];

  PAPERS.forEach(function (p) { p.calDay = dayOf(p.date); p.year = +p.date.slice(0, 4); });
  PAPERS.sort(function (a, b) { return a.calDay - b.calDay; });

  var THEMES = {
    origins:    { label: 'Origins',        color: 'var(--depth-2)' },
    biophysics: { label: 'Biophysics',     color: 'var(--cyan)' },
    genome:     { label: 'Genome',         color: 'var(--amber)' },
    ecology:    { label: 'Ecology',        color: 'var(--depth-3)' },
    methods:    { label: 'Methods',        color: 'var(--pa-text)' },
    theory:     { label: 'Theory',         color: 'var(--po-text)' }
  };

  /* ------------------------------------------------------------------ helpers */
  function generationsAt(day) { return day * CLOCK.generationsPerTransfer; }
  /* There is deliberately no yearAt(). See the two-clocks note above: transfer
     day cannot be converted to a calendar year from anything we hold. */

  /* Linear interpolation between the two measured endpoints. Callers must render
     interpolated values as provisional. Returns {value, measured}. */
  function interp(series, day, field) {
    field = field || 'um';
    var pts = series.slice().sort(function (a, b) { return a.day - b.day; });
    var exact = pts.filter(function (p) { return p.day === day; })[0];
    if (exact) return { value: exact[field], measured: true, src: exact.src };
    if (day <= pts[0].day) return { value: pts[0][field], measured: day === pts[0].day, src: pts[0].src };
    var last = pts[pts.length - 1];
    if (day >= last.day) return { value: last[field], measured: day === last.day, src: last.src, beyond: day > last.day };
    for (var i = 0; i < pts.length - 1; i++) {
      var a = pts[i], b = pts[i + 1];
      if (day >= a.day && day <= b.day) {
        var t = (day - a.day) / (b.day - a.day);
        return { value: a[field] + t * (b[field] - a[field]), measured: false, src: a.src };
      }
    }
    return { value: last[field], measured: false, src: last.src };
  }

  function ploidyAt(day) {
    for (var i = PLOIDY.length - 1; i >= 0; i--) {
      var s = PLOIDY[i];
      if (day >= s.fromDay && (s.toDay === null || day < s.toDay)) return s;
    }
    return PLOIDY[0];
  }

  function traitsBy(day) { return TRAITS.filter(function (t) { return t.day <= day; }); }
  function plateFor(day) {
    var best = PLATES[0];
    PLATES.forEach(function (p) { if (p.day <= day) best = p; });
    return best;
  }
  /* Papers are indexed by calendar date, never by transfer day. */
  function papersUpTo(dateStr) {
    var c = dayOf(dateStr);
    return PAPERS.filter(function (p) { return p.calDay <= c; });
  }
  /* What has been REPORTED about the experiment as of a given transfer day: the
     papers that describe the traits evolved by then. This is derivable; a
     publication count at a transfer day is not. */
  function reportedBy(day) {
    var keys = {};
    traitsBy(day).forEach(function (t) { keys[t.src] = true; });
    return PAPERS.filter(function (p) {
      return Object.keys(keys).some(function (k) { return SRC[k] && SRC[k].doi === p.doi; });
    });
  }
  function srcOf(key) { return SRC[key] || SRC.lab; }

  /* Radius at an arbitrary day, from the digitized series. Returns the line
     values as well as the mean, plus flags a caller must respect:
       digitized  – always true for this series, so label it
       beyond     – past day 600 there is no published series at all */
  function radiusAt(day, line) {
    var S = RADIUS_SERIES, ds = S.days;
    var arr = line ? S.lines[line] : S.mean;
    if (!arr) return null;
    var lastDay = ds[ds.length - 1];
    if (day >= lastDay) {
      return { value: arr[arr.length - 1], digitized: true,
               onSample: day === lastDay,          // day 600 IS a sampling point
               beyond: day > lastDay, atDay: lastDay };
    }
    if (day <= 0) return { value: arr[0], digitized: false, exact: true, atDay: 0 };
    for (var i = 0; i < ds.length - 1; i++) {
      if (day >= ds[i] && day <= ds[i + 1]) {
        var t = (day - ds[i]) / (ds[i + 1] - ds[i]);
        // interpolate in log space: the paper plots this axis as log2
        var v = Math.pow(2, Math.log2(arr[i]) + t * (Math.log2(arr[i + 1]) - Math.log2(arr[i])));
        return { value: v, digitized: true, onSample: t === 0 || t === 1, atDay: day };
      }
    }
    return null;
  }

  function generationsFor(day, treatment) {
    return Math.round(day * (GENS_PER_DAY[treatment || 'PA'] || 5));
  }

  return {
    SRC: SRC, CLOCK: CLOCK, RADIUS: RADIUS, RADIUS_SERIES: RADIUS_SERIES,
    GENS_PER_DAY: GENS_PER_DAY, ASPECT: ASPECT, MODULE: MODULE,
    PLOIDY: PLOIDY, TRAITS: TRAITS, PLATES: PLATES, PAPERS: PAPERS, THEMES: THEMES,
    generationsAt: generationsAt, generationsFor: generationsFor,
    interp: interp, radiusAt: radiusAt, ploidyAt: ploidyAt,
    traitsBy: traitsBy, plateFor: plateFor, papersUpTo: papersUpTo, reportedBy: reportedBy,
    srcOf: srcOf, dayOf: dayOf
  };
})();
