/* ==========================================================================
   snowflake-app.mjs — the snowflake yeast growth simulator, simulator.html.

   Page glue only. The mechanics (core.js), the worker that runs them, and the
   display helpers beside this file are byte-identical copies of the Ratcliff
   Lab simulator at commit b23a7cea (Update 17); README.md in this folder
   records the hashes. This file is adapted from that version's app.js. The
   rendering, colour, cluster-separation and jiggle logic is unchanged; the
   capture/replay workflow, live movie recording and the 2D slice are left
   out, and the controls are restyled for multee.org.

   Nothing on this page changes the physics: separation and jiggle are rigid
   display transforms, and the growth limit is not a biological parameter.
   ========================================================================== */
import * as THREE from 'three';
import {OrbitControls} from './vendor/OrbitControls.js';
import {axes, bondGeometry, C} from './core.js?v=20261002-growth-axis-17';
import {viewModel, validSeed} from './view-model.mjs?v=20261002-growth-axis-17';
import {FragmentPresentation} from './fragment-presentation.mjs?v=20261002-growth-axis-17';
import {bondStrainColors} from './strain-colors.mjs?v=20261002-growth-axis-17';
import {BrownianPresentation} from './brownian-presentation.mjs?v=20261002-growth-axis-17';
import {parameterStatus} from './parameter-status.mjs?v=20261002-growth-axis-17';

// One query string everywhere. A module imported as core.js and again as
// core.js?v=... is two separate module instances.
const MODEL = '20261002-growth-axis-17';
const $ = id => document.getElementById(id);
const root = $('snowflake-sim');
if (root) main();

function main() {
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const worker = new Worker(new URL(`./worker.js?v=${MODEL}`, import.meta.url), {type: 'module'});

  let state = null, running = false, stepping = false, version = 0;
  let pauseRequested = false, resetting = false, autoFit = true, onscreen = true;
  let requestedLimit = null, requestedLimitId = null, limitRequestSequence = 0;
  let dirty = true, framePending = false, cameraDirty = true, lastPaintTime = -Infinity, lastVisualTime = null;
  let renderer, scene, camera, orbit, cellsMesh, bondsMesh, outlinesMesh;
  let topologyKey = '', physicalCache = null, separationCache = null, baseCache = null, brownianSource = null;
  let lastSceneColors = null, lastSceneThreshold = null, lastOutlineColors = null, lastOutlineKey = null, brownianPadding = 1;

  // Reduced motion: detached clusters jump to their separated position rather
  // than gliding there, and the jiggle starts switched off.
  const presentation = new FragmentPresentation(reduceMotion ? {duration: 0} : {});
  const brownian = new BrownianPresentation({seed: 8});
  if (reduceMotion) $('sf-jiggle').checked = false;

  const dummy = new THREE.Object3D(), yAxis = new THREE.Vector3(0, 1, 0), colorDummy = new THREE.Color();
  const bondA = new THREE.Vector3(), bondD = new THREE.Vector3(), bondVector = new THREE.Vector3();
  const number = x => !Number.isFinite(x) ? 'unavailable' : x === 0 ? '0' : x < .001 ? x.toExponential(2) : Number(x.toPrecision(3)).toString();

  /* ------------------------------------------------------------ parameters */
  const sliders = {shape: v => (+v).toFixed(2), strength: v => (+v).toFixed(2), angle: v => `${v}°`};
  function labels() {
    for (const [id, format] of Object.entries(sliders)) $(`sf-${id}-out`).textContent = format($(`sf-${id}`).value);
  }
  function selected() {
    return {shape: $('sf-shape').value, strength: $('sf-strength').value, angle: $('sf-angle').value, seed: $('sf-seed').value};
  }
  // A slider edit never silently changes a running culture: the worker keeps
  // the active settings until Apply restarts it.
  function syncParameters() {
    const p = parameterStatus(state, selected(), {resetting});
    $('sf-pending').textContent = p.note;
    $('sf-pending').hidden = !p.note;
    $('sf-active').textContent = p.active;
    $('sf-apply').hidden = !p.pending && !resetting;
    $('sf-apply').disabled = !state || !p.validSeed || resetting;
  }
  for (const id of Object.keys(sliders)) $(`sf-${id}`).addEventListener('input', () => { labels(); syncParameters(); dirty = true; requestFrame(); });
  $('sf-seed').addEventListener('input', syncParameters);

  function restart({run = false} = {}) {
    if (!validSeed($('sf-seed').value)) {
      $('sf-pending').textContent = 'Use a whole-number seed from 0 to 4294967295.';
      $('sf-pending').hidden = false;
      return;
    }
    const limit = Number($('sf-limit').value);
    const maxCells = Number.isInteger(limit) && limit >= 1 && limit <= C.maxCap ? limit : state?.maxCells ?? C.cap;
    requestedLimit = null; requestedLimitId = null; version++; autoFit = true; resetting = true; pauseRequested = false;
    $('sf-run').disabled = true; $('sf-step').disabled = true;
    setStatus('Restarting…');
    worker.postMessage({type: 'reset', version, params: {
      seed: Number($('sf-seed').value), shape: +$('sf-shape').value, strength: +$('sf-strength').value,
      angle: +$('sf-angle').value, maxCells}});
    // The worker handles messages in order, so this run starts the new culture.
    if (run) worker.postMessage({type: 'run'});
    syncParameters();
  }
  $('sf-reset').addEventListener('click', () => restart());
  $('sf-apply').addEventListener('click', () => { if (!$('sf-apply').disabled) restart(); });

  // Presets come from the lab simulator's own suggested comparison: seed 8,
  // shape 1.8 and a 25° later-bud angle, at several breaking thresholds.
  for (const button of root.querySelectorAll('[data-sf-preset]')) button.addEventListener('click', () => {
    $('sf-seed').value = '8'; $('sf-shape').value = '1.8'; $('sf-angle').value = '25';
    $('sf-strength').value = button.getAttribute('data-sf-preset');
    labels(); dirty = true; restart({run: true});
  });

  /* --------------------------------------------------------- run controls */
  $('sf-run').addEventListener('click', () => {
    if (resetting || pauseRequested) return;
    if (running || stepping) {
      pauseRequested = true; lastVisualTime = null;
      $('sf-run').textContent = 'Pausing…'; $('sf-run').disabled = true;
      worker.postMessage({type: 'pause'});
    } else {
      applySelectedLimit();
      worker.postMessage({type: 'run'});
    }
  });
  $('sf-step').addEventListener('click', () => worker.postMessage({type: 'step'}));
  $('sf-fit').addEventListener('click', () => { autoFit = true; dirty = true; requestFrame(); });

  // The growth limit takes effect immediately, even mid-run. Lowering it never
  // removes cells; buds already started still mature.
  function applySelectedLimit() {
    const value = Number($('sf-limit').value);
    if (!Number.isInteger(value) || value < 1 || value > C.maxCap) return;
    if (requestedLimit === value || requestedLimit === null && value === (state?.maxCells ?? C.cap)) return;
    requestedLimit = value; requestedLimitId = ++limitRequestSequence;
    $('sf-limit-note').textContent = `Changing the limit to ${value} cells when the current calculation finishes…`;
    worker.postMessage({type: 'setGrowthLimit', maxCells: value, requestId: requestedLimitId});
  }
  $('sf-limit').addEventListener('change', applySelectedLimit);

  for (const id of ['sf-color', 'sf-outlines', 'sf-separate']) $(id).addEventListener('change', () => { dirty = true; requestFrame(); });
  $('sf-jiggle').addEventListener('change', () => { lastVisualTime = null; dirty = true; requestFrame(); });

  /* ------------------------------------------------------- worker updates */
  function describe(measured) {
    if (!measured) return 'starting';
    if (measured.fault) return 'stopped at a numerical limit';
    const s = measured.status;
    if (s === 'ready') return 'ready';
    if (s.startsWith('cell cap')) return 'growth limit reached';
    if (s.startsWith('maturing')) return 'buds maturing at the growth limit';
    if (s.startsWith('stalled')) return 'numerical settling stalled';
    if (s.startsWith('ready to continue')) return 'ready to continue';
    // "relaxing" alternates with "growing" many times a second during ordinary
    // growth: the cluster settles before each growth step. Both read as growing.
    return 'growing';
  }
  function setStatus(text) { if ($('sf-status').textContent !== text) $('sf-status').textContent = text; }

  let lastCompleted = null;
  worker.addEventListener('error', event => {
    setStatus('The simulation could not start in this browser. Try a recent version of Chrome, Edge, Firefox or Safari.');
    $('sf-run').disabled = true; $('sf-step').disabled = true;
    console.error(event);
  });
  worker.addEventListener('message', ({data: d}) => {
    if (d.type?.startsWith('history-')) return;   // capture is not used on this page
    if (d.version !== version) return;             // stale message from before a restart
    if (d.error) {
      running = false; stepping = false; pauseRequested = false; requestedLimit = null; requestedLimitId = null;
      $('sf-limit').value = String(state?.maxCells ?? C.cap);
      setStatus(`Stopped: ${d.error}. Reset to start again.`);
      $('sf-run').textContent = 'Reset required'; $('sf-run').disabled = true; $('sf-step').disabled = true;
      return;
    }
    state = d.state;
    if (resetting) {
      presentation.reset(); brownian.reset(state.seed); brownianPadding = 1; lastVisualTime = null;
      topologyKey = ''; brownianSource = null; lastCompleted = null; resetting = false;
    }
    const nextTopology = `${state.cells.length}:${state.broken}`;
    if (nextTopology !== topologyKey) { presentation.update(state, performance.now()); topologyKey = nextTopology; }
    if (running !== d.running) lastVisualTime = null;
    running = d.running; stepping = !!d.stepping;
    if (!running && !stepping) pauseRequested = false;

    const busy = running || stepping;
    $('sf-run').disabled = pauseRequested || !!state.fault;
    $('sf-run').textContent = pauseRequested ? 'Pausing…' : state.fault ? 'Reset required' : busy ? 'Pause' : state.tick > 0 ? 'Continue' : 'Run';
    $('sf-run').setAttribute('aria-pressed', String(busy));
    $('sf-step').disabled = busy || !!state.fault;

    if (d.growthLimitRequestId === requestedLimitId && requestedLimit === state.maxCells) { requestedLimit = null; requestedLimitId = null; }
    if (requestedLimit === null) {
      $('sf-limit').value = String(state.maxCells);
      $('sf-limit-note').textContent = state.maxCells < state.cells.length ? 'All existing cells are kept; buds already started can still mature.'
        : state.maxCells >= 512 ? 'Large runs can take several minutes. Pause stays available.'
        : state.maxCells >= 256 ? 'Larger runs take longer. Pause stays available.' : '';
    } else {
      $('sf-limit-note').textContent = `Active limit is still ${state.maxCells}; applying ${requestedLimit} when the current calculation finishes…`;
    }

    $('sf-cells').textContent = state.cells.length;
    $('sf-clusters').textContent = state.fragments.length;
    $('sf-broken').textContent = state.broken;
    $('sf-ticks').textContent = state.tick;

    // Mid-update snapshots show geometry in progress; the growth-gate reading
    // only means something for a completed update, so keep the last one.
    if (!d.inProgress) lastCompleted = {status: state.status, fault: state.fault, cells: state.cells.length, tick: state.tick};
    const phase = describe(lastCompleted);
    if (pauseRequested) setStatus('Pausing…');
    else if (lastCompleted?.status === 'ready' && !busy) setStatus('Ready. Press Run to grow a cluster from a single cell.');
    else if (lastCompleted?.status.startsWith('cell cap') && !busy) setStatus(`Growth limit reached at ${state.maxCells} cells. Raise the limit, then Continue.`);
    else setStatus(`${running ? 'Running' : stepping ? 'Stepping' : 'Paused'} · ${phase}`);

    const stalled = lastCompleted?.status.startsWith('stalled');
    $('sf-notice').hidden = !stalled && !lastCompleted?.fault;
    $('sf-notice').textContent = lastCompleted?.fault
      ? `${lastCompleted.fault}. The last finite geometry is shown. Reset to start a new run; this is a numerical limit of the solver, not a biological prediction.`
      : stalled ? `Growth is paused because the numerical settling criterion has not cleared (${lastCompleted.cells} cells). This is a solver criterion, not evidence of biological jamming. Continue to keep relaxing, or reset with different settings.` : '';

    syncParameters(); dirty = true; requestFrame();
  });

  /* ---------------------------------------------------------- the legend */
  function updateLegend(useStrain) {
    const strain = physicalCache.strain, key = `${useStrain}`;
    if (physicalCache.legendKey === key) return;
    physicalCache.legendKey = key;
    $('sf-legend-strain').hidden = !useStrain;
    $('sf-legend-cluster').hidden = useStrain;
    const previewing = Math.abs(strain.threshold - strain.mechanicalThreshold) > 1e-12;
    $('sf-tick-mid').textContent = number(strain.threshold / 2);
    $('sf-tick-high').textContent = `${number(strain.threshold)} · ${previewing ? 'selected' : 'break'}`;
    $('sf-readout').textContent = !useStrain ? '' : previewing
      ? `Colour scale previews the selected threshold, ${number(strain.threshold)}. This culture still breaks at ${number(strain.mechanicalThreshold)}; apply the change to restart with the new value.`
      : `Peak strain on an intact bond: ${number(strain.peak)}, or ${number(strain.peak / strain.threshold * 100)}% of the breaking threshold.`;
  }

  /* ---------------------------------------------------------- the render */
  function requestFrame() {
    if (framePending || document.hidden || !onscreen) return;
    framePending = true;
    requestAnimationFrame(frame);
  }
  function frame() {
    framePending = false;
    const now = performance.now();
    const jiggleOn = $('sf-jiggle').checked, separateOn = $('sf-separate').checked;
    const jiggling = running && !pauseRequested && !resetting && jiggleOn;
    const separating = separateOn && presentation.isAnimating(now);
    // Large cultures cap the illustrative motion at 30 frames a second.
    const interval = state && (state.cells.length >= 256 || state.fragments.length >= 128) ? 1000 / 30 : 0;
    const paint = state && (dirty || ((separating || jiggling) && now - lastPaintTime >= interval - .1));
    if (paint) {
      const dt = lastVisualTime === null ? 0 : Math.max(0, (now - lastVisualTime) / 1000);
      lastVisualTime = now; lastPaintTime = now; dirty = false;
      const selectedThreshold = +$('sf-strength').value, useStrain = $('sf-color').value !== 'cluster';
      if (!physicalCache || physicalCache.state !== state || physicalCache.threshold !== selectedThreshold) {
        physicalCache = {state, threshold: selectedThreshold, strain: bondStrainColors(state, selectedThreshold),
          scales: state.cells.map(c => { const {a, b} = axes(c); return {a, b}; })};
      }
      updateLegend(useStrain);
      if (!separationCache || separationCache.state !== state || separationCache.enabled !== separateOn || separating || separationCache.animating) {
        separationCache = {state, enabled: separateOn, animating: separating, value: presentation.display(state, now, separateOn)};
      }
      const separated = separationCache.value;
      if (brownianSource !== separated) { brownian.update(separated); brownianSource = separated; }
      brownian.advance(dt, jiggling);
      const displayed = brownian.display(separated, jiggleOn);
      if (!baseCache || baseCache.state !== separated) baseCache = {state: separated, value: viewModel(separated, 2, 0, null, false)};
      const base = baseCache.value;
      if (jiggleOn) brownianPadding = Math.max(brownianPadding, brownian.displayPadding(separated, c => physicalCache.scales[c.id].a));
      const padding = jiggleOn ? brownianPadding : 0;
      const multiple = state.fragments.length > 1;
      const vm = {colors: useStrain ? physicalCache.strain.colors : base.colors, outlineColors: base.colors,
        showOutlines: $('sf-outlines').checked && multiple, center: base.center, radius: base.radius + padding,
        extent: base.extent.map(([lo, hi]) => [lo - padding, hi + padding])};
      const outlineKey = `${$('sf-outlines').checked}:${multiple}`;
      if (lastOutlineKey !== outlineKey) {
        lastOutlineKey = outlineKey;
        $('sf-outline-note').hidden = !$('sf-outlines').checked;
        $('sf-outline-note').textContent = multiple
          ? 'White outline: the cluster holding the original cell. Coloured outlines: clusters that broke away.'
          : 'Outlines appear once a bond breaks.';
      }
      if (renderer) { updateScene(vm, displayed); if (autoFit) fit(vm); }
    }
    if (renderer) {
      const changed = orbit.update();
      if (paint || changed || cameraDirty) { renderer.render(scene, camera); cameraDirty = false; }
      if (changed) requestFrame();
    }
    if (state && (dirty || separating || jiggling)) requestFrame();
  }

  function initScene() {
    const canvas = $('sf-canvas');
    renderer = new THREE.WebGLRenderer({canvas, antialias: true, alpha: false, powerPreference: 'low-power'});
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    renderer.setClearColor(0x000000);   // the site's void: specimen fields are never themed
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(38, 1, .03, 2000);
    camera.up.set(0, 0, 1); camera.position.set(9, -13, 9);
    const hemi = new THREE.HemisphereLight(0xe0f5ed, 0x16343b, 2.1); hemi.position.set(0, 0, 10); scene.add(hemi);
    const key = new THREE.DirectionalLight(0xffffff, 2.8); key.position.set(-6, -9, 12); scene.add(key);
    const rim = new THREE.DirectionalLight(0x99cde3, 1.6); rim.position.set(7, 7, 4); scene.add(rim);
    orbit = new OrbitControls(camera, canvas);
    orbit.enableDamping = true; orbit.dampingFactor = .1; orbit.minDistance = 1.5; orbit.maxDistance = 500;
    orbit.addEventListener('change', () => { cameraDirty = true; requestFrame(); });
    orbit.addEventListener('start', () => { autoFit = false; });
    // The frame is most of a phone screen and much of a desktop one, so it must
    // not swallow page scrolling. OrbitControls sets touch-action:none; pan-y
    // hands vertical swipes back to the page while sideways drags still rotate
    // and pinch still zooms. A plain wheel scrolls the page; Ctrl/Cmd + wheel,
    // and trackpad pinch (which arrives as Ctrl + wheel), zoom.
    canvas.style.touchAction = 'pan-y';
    canvas.addEventListener('wheel', e => { if (!e.ctrlKey && !e.metaKey) e.stopImmediatePropagation(); }, {capture: true});
    const hint = root.querySelector('.sf-hint');
    if (hint && matchMedia('(pointer: coarse)').matches) hint.textContent = 'Swipe sideways to rotate · pinch to zoom';
    const instanced = (geometry, material) => {
      const mesh = new THREE.InstancedMesh(geometry, material, C.cap);
      mesh.count = 0; mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); scene.add(mesh); return mesh;
    };
    cellsMesh = instanced(new THREE.SphereGeometry(1, 32, 24), new THREE.MeshStandardMaterial({roughness: .43, metalness: .025}));
    // One instanced back-face shell pass keeps outlines cheap and avoids transparent sorting.
    outlinesMesh = instanced(new THREE.SphereGeometry(1, 16, 12), new THREE.MeshBasicMaterial({side: THREE.BackSide, toneMapped: false}));
    bondsMesh = instanced(new THREE.CylinderGeometry(1, 1, 1, 10), new THREE.MeshStandardMaterial({roughness: .6}));

    canvas.addEventListener('keydown', e => {
      const offset = camera.position.clone().sub(orbit.target), z = new THREE.Vector3(0, 0, 1);
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') offset.applyAxisAngle(z, e.key === 'ArrowLeft' ? .12 : -.12);
      else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') offset.applyAxisAngle(new THREE.Vector3().crossVectors(offset, z).normalize(), e.key === 'ArrowUp' ? .12 : -.12);
      else if (e.key === '+' || e.key === '=') offset.multiplyScalar(.9);
      else if (e.key === '-') offset.multiplyScalar(1.1);
      else return;
      e.preventDefault(); autoFit = false;
      camera.position.copy(orbit.target).add(offset); orbit.update(); requestFrame();
    });
    canvas.addEventListener('webglcontextlost', e => {
      e.preventDefault(); worker.postMessage({type: 'pause'});
      $('sf-gl-error').hidden = false;
      $('sf-gl-error').textContent = 'Graphics were interrupted. Reload the page to restore the 3D view.';
    });
    canvas.addEventListener('webglcontextrestored', () => { $('sf-gl-error').hidden = true; dirty = true; cameraDirty = true; requestFrame(); });
    resize();
  }
  function resize() {
    if (renderer) {
      const c = $('sf-canvas');
      renderer.setSize(c.clientWidth, c.clientHeight, false);
      camera.aspect = c.clientWidth / c.clientHeight; camera.updateProjectionMatrix();
    }
    dirty = true; requestFrame();
  }
  function ensureCapacity(mesh, count) {
    if (mesh.instanceMatrix.count >= count) return mesh;
    const replacement = new THREE.InstancedMesh(mesh.geometry, mesh.material, Math.max(count, mesh.instanceMatrix.count * 2));
    replacement.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.remove(mesh); mesh.dispose(); scene.add(replacement);
    return replacement;
  }
  function updateScene(vm, displayed) {
    const n = displayed.cells.length;
    const segments = n > 256 ? 20 : 32;
    if (cellsMesh.geometry.parameters.widthSegments !== segments) {
      const previous = cellsMesh.geometry; cellsMesh.geometry = new THREE.SphereGeometry(1, segments, segments === 20 ? 14 : 24); previous.dispose();
    }
    const oldCells = cellsMesh, oldBonds = bondsMesh;
    cellsMesh = ensureCapacity(cellsMesh, n); bondsMesh = ensureCapacity(bondsMesh, n);
    const colorsChanged = lastSceneColors !== vm.colors || lastSceneThreshold !== physicalCache.strain.threshold || oldCells !== cellsMesh || oldBonds !== bondsMesh;
    lastSceneColors = vm.colors; lastSceneThreshold = physicalCache.strain.threshold;
    const outlineRings = n > 256 ? 8 : 12;
    if (outlinesMesh.geometry.parameters.heightSegments !== outlineRings) {
      const previous = outlinesMesh.geometry; outlinesMesh.geometry = new THREE.SphereGeometry(1, 16, outlineRings); previous.dispose();
    }
    const oldOutlines = outlinesMesh;
    if (vm.showOutlines) outlinesMesh = ensureCapacity(outlinesMesh, n);
    const outlineColorsChanged = lastOutlineColors !== vm.outlineColors || oldOutlines !== outlinesMesh;
    outlinesMesh.count = vm.showOutlines ? n : 0;
    cellsMesh.count = n;
    for (let i = 0; i < n; i++) {
      const c = displayed.cells[i], {a, b} = physicalCache.scales[c.id];
      dummy.position.set(...c.p); dummy.quaternion.set(c.q[1], c.q[2], c.q[3], c.q[0]); dummy.scale.set(b, b, a); dummy.updateMatrix();
      cellsMesh.setMatrixAt(i, dummy.matrix);
      if (colorsChanged) cellsMesh.setColorAt(i, colorDummy.set(vm.colors[c.id]));
      if (vm.showOutlines) {
        dummy.scale.multiplyScalar(1.065); dummy.updateMatrix(); outlinesMesh.setMatrixAt(i, dummy.matrix);
        if (outlineColorsChanged) outlinesMesh.setColorAt(i, colorDummy.set(vm.outlineColors[c.id]));
      }
    }
    cellsMesh.instanceMatrix.needsUpdate = true;
    if (colorsChanged && cellsMesh.instanceColor) cellsMesh.instanceColor.needsUpdate = true;
    cellsMesh.computeBoundingSphere();
    if (vm.showOutlines) {
      outlinesMesh.instanceMatrix.needsUpdate = true;
      if (outlineColorsChanged && outlinesMesh.instanceColor) outlinesMesh.instanceColor.needsUpdate = true;
      lastOutlineColors = vm.outlineColors; outlinesMesh.computeBoundingSphere();
    }
    // Intact bonds only. Visual separation moves whole clusters, so it never stretches one.
    let k = 0;
    for (const b of state.bonds) if (!b.broken) {
      const g = bondGeometry(b, displayed.cells), m = displayed.cells[b.m].p, d = displayed.cells[b.d].p;
      bondA.set(m[0] + g.rm[0], m[1] + g.rm[1], m[2] + g.rm[2]); bondD.set(d[0] + g.rd[0], d[1] + g.rd[1], d[2] + g.rd[2]);
      bondVector.copy(bondD).sub(bondA);
      const length = bondVector.length();
      dummy.position.copy(bondA).lerp(bondD, .5); dummy.quaternion.setFromUnitVectors(yAxis, bondVector.normalize());
      dummy.scale.set(.055, Math.max(length, .001), .055); dummy.updateMatrix();
      bondsMesh.setMatrixAt(k, dummy.matrix);
      if (colorsChanged) bondsMesh.setColorAt(k, colorDummy.set(g.strain > .75 * physicalCache.strain.threshold ? '#f1bc69' : '#d7e6d6'));
      k++;
    }
    bondsMesh.count = k; bondsMesh.instanceMatrix.needsUpdate = true;
    if (colorsChanged && bondsMesh.instanceColor) bondsMesh.instanceColor.needsUpdate = true;
    bondsMesh.computeBoundingSphere();
  }
  function fit(vm) {
    const direction = camera.position.clone().sub(orbit.target).normalize();
    const box = new THREE.Box3(new THREE.Vector3(...vm.extent.map(e => e[0])), new THREE.Vector3(...vm.extent.map(e => e[1])));
    const sphere = box.getBoundingSphere(new THREE.Sphere()), fov = THREE.MathUtils.degToRad(camera.fov);
    const hfov = 2 * Math.atan(Math.tan(fov / 2) * camera.aspect);
    const distance = sphere.radius / Math.sin(Math.min(fov, hfov) / 2) * 1.08;
    orbit.target.set(...vm.center); camera.position.copy(orbit.target).addScaledVector(direction, distance); orbit.update();
  }

  /* --------------------------------------------------------------- start */
  try { initScene(); }
  catch (error) {
    console.error(error); renderer = undefined;
    $('sf-gl-error').hidden = false;
    $('sf-gl-error').textContent = 'The 3D view needs WebGL, which this browser has turned off. The counts below still update as the model runs.';
    $('sf-fit').disabled = true;
  }
  new ResizeObserver(resize).observe($('sf-canvas'));
  // Skip drawing while the frame is scrolled away or the tab is hidden; the
  // worker keeps computing either way.
  new IntersectionObserver(entries => {
    onscreen = entries.some(e => e.isIntersecting);
    if (onscreen) { lastVisualTime = null; dirty = true; cameraDirty = true; requestFrame(); }
  }).observe($('sf-canvas'));
  document.addEventListener('visibilitychange', () => { lastVisualTime = null; if (!document.hidden) { dirty = true; requestFrame(); } });

  labels();
  root.classList.add('is-ready');
  restart();   // start from the settings shown on the page, not the worker's built-in default
}
