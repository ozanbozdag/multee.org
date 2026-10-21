"""Build phenotypes/phenotypes.json from the curated phenotypes/phenotypes.csv.

phenotypes.csv is the source of truth: one row per published measurement (sample x trait x
statistic x condition), curated from the MuLTEE papers. This script checks every row against the
controlled vocabulary below, assigns each measurement to a trait column (COLUMN_RULES), groups the
measurements by sample, and writes the JSON the Phenotype data page (phenotypes/index.html,
assets/js/phenotype-table.js) loads: one table row per sample, one column per comparable kind of
measurement. It fails loudly rather than publishing a malformed row.

    python tools/build_phenotypes.py
"""
import collections
import csv
import datetime
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'phenotypes' / 'phenotypes.csv'
OUT = ROOT / 'phenotypes' / 'phenotypes.json'

COLUMNS = ['trait', 'treatment', 'line', 'transfer', 'sample', 'strain', 'sample_type', 'genotype',
           'value', 'error', 'error_type', 'n', 'unit', 'statistic', 'conditions', 'method',
           'paper', 'doi', 'location', 'value_source', 'confidence', 'notes']

TRAIT_KEYS = {'macroscopic', 'entanglement', 'cluster_size', 'cell_aspect_ratio', 'cell_volume',
              'packing_fraction', 'budding_pattern', 'ploidy', 'mechanical', 'fluid_flow', 'growth_rate',
              'relative_fitness', 'reproduction', 'coexisting_types', 'other'}
TREATMENTS = {'PA', 'PM', 'PO', ''}
SAMPLE_TYPES = ['Ancestor', 'Population', 'Isolate', 'Isolate (Small)', 'Isolate (Large)',
                'Donut strain', 'Spread strain', 'Engineered']  # same names as sequences/runs.json
VALUE_SOURCES = {'text', 'table', 'supplement-table', 'source-data', 'derived', 'figure-read'}
CONFIDENCE = {'high', 'medium', 'low'}

# Strain kinds are mutually exclusive, by where the sample came from.
KINDS = ['Ancestor', 'Evolved population', 'Evolved isolate', 'Derived strain', 'Treatment average',
         'Engineered strain']
# Shown when hovering over a kind in the Strains filter.
KIND_DEFS = {
    'Ancestor': 'The founding strain of a treatment (t0). GOB21 founded the PA lines; '
                'GOB8 founded the PM and PO lines.',
    'Evolved population': 'A whole-population sample of one MuLTEE line (PA, PM or PO 1–5), taken from the '
                          'experiment at a given transfer.',
    'Evolved isolate': 'A single genotype (clone) isolated from one MuLTEE line at a given transfer and '
                       'regrown, with no further manipulation. Includes isolates of the Small and Large '
                       'types.',
    'Derived strain': 'Descends from an ancestor or evolved isolate through a further step outside the main '
                      'experiment: donut and spread colonies, populations selected against large size on agar, '
                      'mutation-accumulation lines, and monoculture replays. Also includes pooled isolates '
                      'and sub-samples such as cluster interiors, cluster exteriors and fragments.',
    'Treatment average': 'A value reported only as the mean of a treatment’s five lines, so no line is given.',
    'Engineered strain': 'Built by genetic modification: gene knockouts, overexpression clones, engineered '
                         'diploid and tetraploid pairs, and fluorescently tagged strains.',
}
assert set(KIND_DEFS) == set(KINDS)

# ----------------------------------------------------------------------------- trait columns
# Each column holds one comparable kind of measurement. "list" columns collect the one-off
# measurements of a trait that have no comparable partner, so nothing is dropped.
# (key, group, label, unit, type, shown by default)
COLUMN_DEFS = [
    ('cs_bw24', 'Cluster size', 'Cluster radius, biomass-weighted mean, ~24 h', 'µm', 'num', True),
    ('cs_bw4', 'Cluster size', 'Cluster radius, biomass-weighted mean, 4 h', 'µm', 'num', False),
    ('cs_bw1012', 'Cluster size', 'Cluster radius, biomass-weighted mean, 10–12 h', 'µm', 'num', False),
    ('cs_bwns', 'Cluster size', 'Cluster radius, biomass-weighted mean, growth time not stated', 'µm', 'num', False),
    ('cs_mean1012', 'Cluster size', 'Cluster radius, mean, 10–12 h', 'µm', 'num', False),
    ('cs_meanns', 'Cluster size', 'Cluster radius, mean, growth time not stated', 'µm', 'num', False),
    ('cs_median', 'Cluster size', 'Cluster radius, median', 'µm', 'num', False),
    ('cs_diam', 'Cluster size', 'Cluster diameter, mean (overnight)', 'µm', 'num', False),
    ('cs_module', 'Cluster size', 'Module diameter, compressed clusters (Yoon 2025)', 'µm', 'num', False),
    ('cs_other', 'Cluster size', 'Other cluster-size measurements', '', 'list', False),
    ('ar_mean12', 'Cell aspect ratio', 'Cell aspect ratio, mean, 12 h', '', 'num', True),
    ('ar_meanoth', 'Cell aspect ratio', 'Cell aspect ratio, mean, other conditions', '', 'num', False),
    ('ar_median', 'Cell aspect ratio', 'Cell aspect ratio, median', '', 'num', False),
    ('ar_other', 'Cell aspect ratio', 'Other aspect-ratio measurements', '', 'list', False),
    ('cv_mean12', 'Cell size', 'Cell volume, mean, 12 h', 'µm³', 'num', True),
    ('cv_diam', 'Cell size', 'Cell diameter, median', 'µm', 'num', False),
    ('cv_other', 'Cell size', 'Other cell-size measurements', '', 'list', False),
    ('pl_g1', 'Ploidy', 'DNA content, G1 peak', 'N', 'num', True),
    ('pl_karyo', 'Ploidy', 'Karyotype (from sequencing)', '', 'cat', False),
    ('pl_peak', 'Ploidy', 'Population DNA content, main peak', 'N', 'num', False),
    ('pl_frac3n', 'Ploidy', 'Population: fraction of cells below 3N', '', 'num', False),
    ('pl_stated', 'Ploidy', 'Ploidy, stated or categorised', '', 'cat', False),
    ('macro', 'Macroscopic', 'Macroscopic', '', 'cat', False),
    ('ent', 'Entanglement', 'Entangled', '', 'cat', False),
    ('ent_other', 'Entanglement', 'Other entanglement measurements', '', 'list', False),
    ('pack', 'Cell packing', 'Cell packing fraction', '', 'num', False),
    ('bud_first', 'Budding pattern', 'First cell division, median duration', 'min', 'num', False),
    ('bud_later', 'Budding pattern', 'Later cell divisions, median duration', 'min', 'num', False),
    ('bud_dslow', 'Budding pattern', 'Daughters divide slower than mothers', '', 'cat', False),
    ('bud_mdsync', 'Budding pattern', 'Mother and daughter division times differ (vs 1:1 line)', '', 'cat', False),
    ('bud_angle', 'Budding pattern', 'Budding angle, median', '°', 'num', False),
    ('bud_polar', 'Budding pattern', 'Bud polar angle, mean (bud scars)', '°', 'num', False),
    ('bud_other', 'Budding pattern', 'Other budding measurements', '', 'list', False),
    ('mech_tough', 'Mechanical properties', 'Toughness', 'J/m³', 'num', False),
    ('mech_stress', 'Mechanical properties', 'Fracture or maximum stress', 'Pa', 'num', False),
    ('mech_stiff', 'Mechanical properties', 'Single-cell stiffness', 'N/m', 'num', False),
    ('mech_other', 'Mechanical properties', 'Other mechanical measurements', '', 'list', False),
    ('flow', 'Fluid flow', 'Fluid flow through cluster (non-agitated YEPD)', '', 'cat', False),
    ('flow_other', 'Fluid flow', 'Other flow tests (controls, fragments)', '', 'list', False),
    ('gr_doub', 'Growth', 'Cell doublings per daily transfer', 'per day', 'num', False),
    ('gr_celldt', 'Growth', 'Single-cell doubling time', 'min', 'num', False),
    ('gr_other', 'Growth', 'Other growth measurements', '', 'list', False),
    ('fit_r', 'Relative fitness', 'Selection rate vs ancestor, with settling selection', 'per day', 'num', False),
    ('fit_other', 'Relative fitness', 'Other fitness measurements', '', 'list', False),
    ('repro', 'Reproduction', 'Fold increase in cluster number over 24 h', 'fold', 'num', False),
    ('coex', 'Coexisting types', 'Small and Large types coexist', '', 'cat', False),
    ('other', 'Other', 'Other measurements', '', 'list', False),
]
COLUMN_KEYS = [c[0] for c in COLUMN_DEFS]


def column_for(r):
    """The trait column a measurement belongs in."""
    t, s, c = r['trait'], r['statistic'].lower(), r['conditions'].lower()
    if t == 'cluster_size':
        if s.startswith('biomass-weighted mean cluster radius'):
            if re.search(r'(?<!\d)4 h after transfer', c):
                return 'cs_bw4'
            if '10-12 h' in c:
                return 'cs_bw1012'
            if re.search(r'\b\d+ h into the 24 h', c) and not c.startswith('24 h'):
                return 'cs_other'
            if '24 h' in c or 'evolution-experiment conditions' in c:
                return 'cs_bw24'
            return 'cs_bwns'
        if re.match(r'mean cluster radius( \(| of whole| of all)', s):
            return 'cs_mean1012' if '10-12 h' in c else 'cs_meanns'
        if s.startswith('median cluster radius'):
            return 'cs_median'
        if s.startswith('mean group diameter'):
            return 'cs_diam'
        if s.startswith('mean module effective diameter'):
            return 'cs_module'
        return 'cs_other'
    if t == 'cell_aspect_ratio':
        if re.match(r'mean cell(ular)? aspect ratio', s) or s.startswith('cell aspect ratio (x-axis'):
            return 'ar_mean12' if re.search(r'\b12 h', c) else 'ar_meanoth'
        if s.startswith('median cell aspect ratio'):
            return 'ar_median'
        return 'ar_other'
    if t == 'cell_volume':
        if s == 'mean cell volume' and re.search(r'\b12 h', c):
            return 'cv_mean12'
        if s.startswith('median cell diameter'):
            return 'cv_diam'
        return 'cv_other'
    if t == 'ploidy':
        if s.startswith('dna content (g1 peak)'):
            return 'pl_g1'
        if s.startswith('karyotype'):
            return 'pl_karyo'
        if s.startswith('main peak of the population'):
            return 'pl_peak'
        if s.startswith('fraction of cells with dna content'):
            return 'pl_frac3n'
        return 'pl_stated'
    if t == 'macroscopic':
        return 'macro'
    if t == 'entanglement':
        return 'ent' if r['value'].lower() in ('yes', 'no') else 'ent_other'
    if t == 'packing_fraction':
        return 'pack'
    if t == 'budding_pattern':
        if s.startswith('median duration of first cell division'):
            return 'bud_first'
        if s.startswith('median duration of subsequent'):
            return 'bud_later'
        if s.startswith('daughter division significantly slower'):
            return 'bud_dslow'
        if s.startswith('mother vs daughter doubling-time regression'):
            return 'bud_mdsync'
        if s.startswith('median budding angle'):
            return 'bud_angle'
        if s.startswith('mean bud polar angle'):
            return 'bud_polar'
        return 'bud_other'
    if t == 'mechanical':
        if s.startswith('toughness'):
            return 'mech_tough'
        if s.startswith(('fracture stress', 'maximum stress')):
            return 'mech_stress'
        if s.startswith('single-cell stiffness'):
            return 'mech_stiff'
        return 'mech_other'
    if t == 'fluid_flow':
        ok = c.startswith('single cluster in non-agitated yepd') and 'dead' not in c
        return 'flow' if ok else 'flow_other'
    if t == 'growth_rate':
        if s.startswith('cell doublings per 24 h'):
            return 'gr_doub'
        if s.startswith('single-cell doubling time'):
            return 'gr_celldt'
        return 'gr_other'
    if t == 'relative_fitness':
        return 'fit_r' if s.startswith('selection rate constant r per day vs dtomato') else 'fit_other'
    if t == 'reproduction':
        return 'repro'
    if t == 'coexisting_types':
        return 'coex'
    return 'other'


def kind_for(r):
    sid = r['sample']
    if r['sample_type'] == 'Engineered':
        return 'Engineered strain'
    if sid.endswith('_mean'):
        return 'Treatment average'
    if re.fullmatch(r'P[AMO]_t0_anc', sid):
        return 'Ancestor'
    if re.fullmatch(r'P[AMO]\d_t\d+_pop', sid):
        return 'Evolved population'
    if re.fullmatch(r'P[AMO]\d_t\d+_(iso|small|large|edf1iso)\d+', sid):
        return 'Evolved isolate'
    return 'Derived strain'


def fail(i, msg):
    sys.exit(f'{SRC.name} row {i}: {msg}')


def read_rows():
    with SRC.open(encoding='utf-8-sig', newline='') as f:
        reader = csv.DictReader(f)
        if reader.fieldnames != COLUMNS:
            sys.exit(f'{SRC.name}: header must be exactly\n{",".join(COLUMNS)}')
        rows = []
        for i, r in enumerate(reader, start=2):
            r = {k: (v or '').strip() for k, v in r.items()}
            if r['trait'] not in TRAIT_KEYS:
                fail(i, f'unknown trait {r["trait"]!r}')
            if r['treatment'] not in TREATMENTS:
                fail(i, f'unknown treatment {r["treatment"]!r}')
            if r['line'] and r['line'] not in {'1', '2', '3', '4', '5'}:
                fail(i, f'line must be 1-5 or blank, not {r["line"]!r}')
            if r['transfer'] and not r['transfer'].isdigit():
                fail(i, f'transfer must be a whole number of days or blank, not {r["transfer"]!r}')
            if r['sample_type'] not in SAMPLE_TYPES:
                fail(i, f'unknown sample_type {r["sample_type"]!r}')
            if r['value_source'] not in VALUE_SOURCES:
                fail(i, f'unknown value_source {r["value_source"]!r}')
            if r['confidence'] not in CONFIDENCE:
                fail(i, f'unknown confidence {r["confidence"]!r}')
            for k in ('sample', 'value', 'paper', 'doi'):
                if not r[k]:
                    fail(i, f'{k} is empty')
            if r['doi'].startswith('http'):
                fail(i, 'doi should be bare (10.xxxx/...), not a URL')
            rows.append(r)
    return rows


def split_embedded(rows):
    """Pineau 2024 rows give the number-weighted mean radius as the value and the biomass-weighted mean
    radius only inside the statistic text. Split the latter out so it lands in the comparable column."""
    out = []
    for r in rows:
        m = re.search(r'biomass(?:\(volume\))?-weighted mean(?: radius)? ([\d.]+)', r['statistic'])
        if r['trait'] == 'cluster_size' and m and r['statistic'].lower().startswith('mean cluster radius'):
            bw = dict(r, value=m.group(1), error='', error_type='', statistic='biomass-weighted mean cluster radius')
            out.append(bw)
            r = dict(r, statistic=r['statistic'][:m.start()].rstrip('; ,'))
        out.append(r)
    return out


def main():
    rows = split_embedded(read_rows())
    measurements, samples = [], {}
    for r in rows:
        col = column_for(r)
        idx = len(measurements)
        measurements.append({k: r[k] for k in COLUMNS if k not in ('trait', 'treatment', 'line', 'transfer',
                                                                   'sample', 'sample_type')})
        s = samples.setdefault(r['sample'], {
            'id': r['sample'], 'treatment': r['treatment'],
            'line': int(r['line']) if r['line'] else None,
            'transfer': int(r['transfer']) if r['transfer'] else None,
            'kind': kind_for(r), 'strains': [], 'papers': [], 'c': collections.defaultdict(list)})
        base = r['strain'].split(' (')[0]
        if r['strain'] and r['strain'] not in s['strains'] and base not in s['strains']:
            s['strains'].append(r['strain'])
        if r['paper'] not in s['papers']:
            s['papers'].append(r['paper'])
        s['c'][col].append(idx)

    used = collections.Counter(k for s in samples.values() for k in s['c'])
    columns = [{'key': k, 'group': g, 'label': lab, 'unit': u, 'type': ty, 'default': d, 'count': used[k]}
               for k, g, lab, u, ty, d in COLUMN_DEFS if used[k]]
    papers = sorted({(m['paper'], m['doi']) for m in measurements})
    meta = {
        'generated': datetime.date.today().isoformat(),
        'measurements': len(measurements),
        'samples': len(samples),
        'columns': columns,
        'kinds': KINDS,
        'kind_defs': KIND_DEFS,
        'papers': [{'label': p, 'doi': d} for p, d in papers],
    }
    data = {'meta': meta, 'samples': list(samples.values()), 'measurements': measurements}
    OUT.write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8',
                   newline='\n')
    print(f'{OUT.relative_to(ROOT)}: {len(samples)} samples, {len(measurements)} measurements, '
          f'{len(columns)} columns from {len(papers)} papers')
    if '-v' in sys.argv:
        for c in columns:
            print(f'  {c["count"]:4}  {c["key"]:11} {c["label"]}')
        print(collections.Counter(s['kind'] for s in samples.values()))


if __name__ == '__main__':
    main()
