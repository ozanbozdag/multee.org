"""Build phenotypes/phenotypes.json from the curated phenotypes/phenotypes.csv.

phenotypes.csv is the source of truth: one row per published measurement (sample x trait x
statistic x condition), curated from the MuLTEE papers. This script checks every row against the
controlled vocabulary below and writes the JSON the Phenotype data page (phenotypes/index.html,
assets/js/phenotype-table.js) loads. It fails loudly rather than publishing a malformed row.

    python tools/build_phenotypes.py
"""
import csv
import datetime
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'phenotypes' / 'phenotypes.csv'
OUT = ROOT / 'phenotypes' / 'phenotypes.json'

COLUMNS = ['trait', 'treatment', 'line', 'transfer', 'sample', 'strain', 'sample_type', 'genotype',
           'value', 'error', 'error_type', 'n', 'unit', 'statistic', 'conditions', 'method',
           'paper', 'doi', 'location', 'value_source', 'confidence', 'notes']

# Display order and labels. Keep in step with the trait guide in phenotypes/index.html.
TRAITS = [
    ('macroscopic', 'Macroscopic'),
    ('entanglement', 'Entanglement'),
    ('cluster_size', 'Cluster size'),
    ('cell_aspect_ratio', 'Cell aspect ratio'),
    ('cell_volume', 'Cell size'),
    ('packing_fraction', 'Cell packing fraction'),
    ('budding_pattern', 'Budding pattern'),
    ('ploidy', 'Ploidy'),
    ('mechanical', 'Mechanical properties'),
    ('fluid_flow', 'Fluid flow through clusters'),
    ('growth_rate', 'Growth rate'),
    ('relative_fitness', 'Relative fitness'),
    ('reproduction', 'Reproduction and propagules'),
    ('coexisting_types', 'Coexisting types'),
    ('omics_data', 'Transcriptomic and proteomic data'),
    ('other', 'Other measurements'),
]
TRAIT_KEYS = {k for k, _ in TRAITS}
TREATMENTS = {'PA', 'PM', 'PO', ''}
SAMPLE_TYPES = ['Ancestor', 'Population', 'Isolate', 'Isolate (Small)', 'Isolate (Large)',
                'Donut strain', 'Spread strain', 'Engineered']  # same names as sequences/runs.json
VALUE_SOURCES = {'text', 'table', 'supplement-table', 'source-data', 'derived', 'figure-read'}
CONFIDENCE = {'high', 'medium', 'low'}


def fail(i, msg):
    sys.exit(f'{SRC.name} row {i}: {msg}')


def main():
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
            r['transfer'] = int(r['transfer']) if r['transfer'] else None
            r['line'] = int(r['line']) if r['line'] else None
            rows.append(r)

    papers = {}
    for r in rows:
        papers.setdefault(r['paper'], r['doi'])
    meta = {
        'generated': datetime.date.today().isoformat(),
        'count': len(rows),
        'traits': [{'key': k, 'label': v} for k, v in TRAITS],
        'sample_types': SAMPLE_TYPES,
        'papers': [{'label': p, 'doi': d} for p, d in sorted(papers.items())],
    }
    OUT.write_text(json.dumps({'meta': meta, 'rows': rows}, ensure_ascii=False, indent=1) + '\n',
                   encoding='utf-8', newline='\n')
    print(f'{OUT.relative_to(ROOT)}: {len(rows)} rows from {len(papers)} papers')


if __name__ == '__main__':
    main()
