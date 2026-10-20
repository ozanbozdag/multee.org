# Snowflake yeast growth simulator (multee.org copy)

The interactive simulator on `simulator.html`: growth, budding, contact mechanics and
strain-driven fracture (reproduction). It has no entanglement, retention or escape
modelling. No build step, no dependencies to install, no server code. It runs as static
files on GitHub Pages.

## Provenance

Extracted from the lab's standalone simulator, **Update 17, commit
`b23a7cea494268c19658600ae0c31eaa12dedd23`** (the "Growth" app, `dist/simulator/index.html`
in `ALT MAN/Snowflake Yeast/Working Copy`).

| File | Status |
| --- | --- |
| `core.js` (the mechanics model) | byte-identical |
| `worker.js` (runs the model off the main thread) | byte-identical |
| `cinematic-history.mjs` (imported by the worker; inert here) | byte-identical |
| `view-model.mjs`, `fragment-presentation.mjs`, `strain-colors.mjs`, `brownian-presentation.mjs`, `parameter-status.mjs` | byte-identical |
| `vendor/three.module.min.js`, `vendor/three.core.min.js`, `vendor/OrbitControls.js`, `vendor/THREE-LICENSE.txt` (Three.js r180, MIT) | byte-identical |
| `snowflake-app.mjs` | **new**, adapted from that version's `app.js` |

`SOURCE_SHA256SUMS` lists the hashes of the byte-identical files. They match
`SOURCE_MANIFEST.json` in the Working Copy. To check:

```sh
cd assets/simulator && shasum -a 256 -c SOURCE_SHA256SUMS
```

## What `snowflake-app.mjs` changes

The rendering, cell/bond geometry, strain colouring, cluster separation, jiggle and
parameter logic are carried over from `app.js`. These are the differences:

- **Removed:** capture → Replay Studio workflow, live movie recording, the 2D exact
  cross-section, and links to the Inheritance Lab, Replay editor and lineage explorer.
- **Default growth limit is 1,024 cells** (the original was 64). The growth limit is not a
  biological parameter. A large run takes several minutes; Pause stays available, and the
  menu offers 64–512 for quicker runs.
- **Three presets** (bond strength 0.45 / 1.00 / 1.30 at seed 8, shape 1.8, angle 25°).
  These come from the original page's own suggested comparison.
- **3D background is black** (`--void`, as on all site plates), not dark teal.
- **Reduced motion:** with `prefers-reduced-motion`, jiggle starts off and detached
  clusters jump apart instead of gliding.
- Drawing pauses while the frame is scrolled off screen. The worker keeps computing.
- The status text is simplified. The honest stall/fault notices are kept.

Page markup is in `simulator.html` and styles in `assets/css/page-simulator.css`. Element
IDs are prefixed `sf-`.

Changes made when the page went on multee.org (2026-10-20):

- The page sits in the Outreach section. Its nav marks Outreach as current, and its eyebrow
  links back to `outreach.html#simulator`.
- The frame, counts and run buttons are wrapped in `.sf-dock`, and the bond-strength presets
  are now the first group in the settings panel.
- Section 10 of `page-simulator.css` keeps the model in view while the settings scroll. In
  two columns the left column is sticky. In one column the dock pins under the masthead as a
  compact strip. Short screens keep the stacked layout. No script changes were needed:
  the app finds everything by ID, and its ResizeObserver handles the new frame sizes.

## Run locally

Module workers do not load from `file://`. Serve the site root over HTTP:

```sh
cd multee.org && python3 -m http.server 8000
# open http://localhost:8000/simulator.html
```

## Re-sync after the lab simulator changes

1. Copy the updated files over the byte-identical ones listed above.
2. If `core.js` exports or the worker's messages changed, update `snowflake-app.mjs`.
3. Keep the `?v=` query string identical on every import, including the `new Worker` URL.
   `core.js` and `core.js?v=…` load as two separate module instances. If the version
   changes, update `MODEL` in `snowflake-app.mjs` and the import lines in the copied
   modules together.
4. Regenerate `SOURCE_SHA256SUMS`.

## Embedding on another page

The page needs three things: the import map for `three`, placed before any module
script; the `#snowflake-sim` markup with its `sf-` IDs; and
`<script type="module" src="assets/simulator/snowflake-app.mjs">`. Without JavaScript, or
on a browser without module workers or import maps, the fallback paragraph stays visible
and nothing breaks. Recent Chrome, Edge, Firefox and Safari (16.4+) are supported.
