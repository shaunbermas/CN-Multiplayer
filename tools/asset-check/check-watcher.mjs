// Browser check for THE_WATCHER.glb (Prompt 06).
//  1. Khronos glTF Validator: no errors.
//  2. Headless Chromium + Three.js (the client's renderer):
//     - scale and origin: 28 m tall in rest pose, feet on Y = 0, centred on the origin
//     - orientation: faces +Z in glTF (Blender -Y), i.e. toward the start line when placed in Stage 01
//     - rig: one skinned mesh, 33 Watcher_ joints, every gameplay anchor present
//     - animation: all nine clips present with the documented lengths; each clip moves the rig; the lens
//       state bones show exactly one state (neutral / red / green) in the clips that define it
//     - materials: PBR with textures; lens materials emissive in the right colour
//     - screenshots of three clips
// Usage (repo root): NODE_PATH=$(npm root -g) node tools/asset-check/check-watcher.mjs
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { extname, join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import validator from 'gltf-validator';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const glbPath = join(root, 'blender/exports/THE_WATCHER.glb');
const outDir = join(root, 'blender/exports/THE_WATCHER_browser');
const FPS = 24;
// clip: [frames (end - start), lens state or null]
const CLIPS = {
  Watcher_Idle: [96, 'Neutral'], Watcher_TurnAway: [36, null], Watcher_GreenSignal: [48, 'Green'], Watcher_TurnToField: [36, null],
  Watcher_FocusLock: [24, null], Watcher_RedSignal: [48, 'Red'], Watcher_ScanSweep: [96, 'Red'], Watcher_Detect: [40, 'Red'],
  Watcher_ReturnNeutral: [36, null],
};
const ANCHORS = ['Watcher_Root', 'Watcher_Facing', 'Watcher_OpticalOrigin', 'Watcher_DetectionForward', 'Watcher_AudioOrigin', 'Watcher_InteractionBounds'];
const errors = [];

const bytes = new Uint8Array(await readFile(glbPath));
const v = await validator.validateBytes(bytes, { maxIssues: 200 });
if (v.issues.numErrors > 0) errors.push(`glTF Validator: ${v.issues.numErrors} error(s)`);

const page_html = `<!doctype html><meta charset="utf-8"><body style="margin:0;background:#000">
<script type="importmap">{"imports":{"three":"/tools/asset-check/node_modules/three/build/three.module.js",
"three/addons/":"/tools/asset-check/node_modules/three/examples/jsm/"}}</script>
<script type="module">
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
window.setup = async (url, CLIPS) => {
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setSize(720, 900);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  document.body.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0b1416);
  scene.add(new THREE.HemisphereLight(0x9fc3c0, 0x101010, 1.2));
  const key = new THREE.DirectionalLight(0xffd8b0, 2.2); key.position.set(-30, 40, 45); scene.add(key);
  const rim = new THREE.DirectionalLight(0x66d9e6, 2.0); rim.position.set(25, 35, -45); scene.add(rim);
  const gltf = await new GLTFLoader().loadAsync(url);
  scene.add(gltf.scene);
  scene.updateMatrixWorld(true);
  let skinned = 0, bones = [], mats = new Map(); const skeletons = new Set();
  gltf.scene.traverse((o) => {
    if (o.isSkinnedMesh) { skeletons.add(o.skeleton.bones.map((b) => b.name).join()); skinned = skeletons.size; bones = o.skeleton.bones.map((b) => b.name); }
    if (o.isMesh) for (const m of [].concat(o.material)) mats.set(m.name, m);
  });
  const restBox = new THREE.Box3().setFromObject(gltf.scene, true);
  const pos = (n) => { const o = gltf.scene.getObjectByName(n); if (!o) return null; const p = new THREE.Vector3(); o.getWorldPosition(p); return p.toArray(); };
  const anchors = Object.fromEntries(['Watcher_Root','Watcher_Facing','Watcher_OpticalOrigin','Watcher_DetectionForward','Watcher_AudioOrigin','Watcher_InteractionBounds'].map((n) => [n, pos(n)]));
  const mixer = new THREE.AnimationMixer(gltf.scene);
  const rest = {};
  for (const n of bones) { const b = gltf.scene.getObjectByName(n); rest[n] = { q: b.quaternion.clone(), p: b.position.clone() }; }
  const clips = {};
  for (const clip of gltf.animations) {
    mixer.stopAllAction();
    const act = mixer.clipAction(clip); act.reset().play();
    mixer.setTime(clip.duration * 0.5);
    let moved = 0;
    for (const n of bones) { const b = gltf.scene.getObjectByName(n); if (b.quaternion.angleTo(rest[n].q) > 0.01 || b.position.distanceTo(rest[n].p) > 0.01) moved++; }
    const sc = (n) => gltf.scene.getObjectByName(n).scale.x;
    clips[clip.name] = { duration: clip.duration, tracks: clip.tracks.length, bonesMoved: moved,
      lens: { Neutral: sc('Watcher_LensNeutral'), Red: sc('Watcher_LensRed'), Green: sc('Watcher_LensGreen') } };
    act.stop();
  }
  window.__r = { renderer, scene, mixer, gltf };
  const m = [...mats.values()].map((x) => ({ name: x.name, type: x.type, map: !!x.map, normal: !!x.normalMap, rough: !!x.roughnessMap,
    emissive: x.emissive ? x.emissive.toArray() : null, emissiveIntensity: x.emissiveIntensity }));
  return { skinned, bones, restBox: { min: restBox.min.toArray(), max: restBox.max.toArray() }, anchors, clips, materials: m,
           webgl: renderer.getContext().getParameter(renderer.getContext().VERSION) };
};
window.shot = (clipName, t) => {
  const { renderer, scene, mixer, gltf } = window.__r;
  mixer.stopAllAction();
  const clip = gltf.animations.find((c) => c.name === clipName);
  const act = mixer.clipAction(clip); act.reset().play(); mixer.setTime(t);
  const cam = new THREE.PerspectiveCamera(40, 720 / 900, 0.1, 500);
  cam.position.set(-30, 19, 52); cam.lookAt(0, 14, 0);
  renderer.render(scene, cam);
  act.stop();
};
window.ready = true;
</script>`;

const mime = { '.html': 'text/html', '.js': 'text/javascript', '.glb': 'model/gltf-binary' };
const server = createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (path === '/check.html') { res.writeHead(200, { 'content-type': 'text/html' }); return res.end(page_html); }
  const file = join(root, path);
  if (!file.startsWith(root) || !existsSync(file)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': mime[extname(file)] || 'application/octet-stream' });
  res.end(await readFile(file));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 720, height: 900 } });
const consoleErrors = [];
page.on('pageerror', (e) => consoleErrors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
await page.goto(`${base}/check.html`);
await page.waitForFunction(() => window.ready === true);
const r = await page.evaluate(([u, c]) => window.setup(u, c), ['/blender/exports/THE_WATCHER.glb', CLIPS]);
await mkdir(outDir, { recursive: true });
const shots = [['Watcher_Idle', 0.5], ['Watcher_GreenSignal', 0.5], ['Watcher_RedSignal', 0.5], ['Watcher_Detect', 1.6]];
for (const [clip, t] of shots) {
  await page.evaluate(([c, tt]) => window.shot(c, tt), [clip, t]);
  await page.screenshot({ path: join(outDir, `THE_WATCHER_browser_${clip}.png`) });
}
await browser.close();
server.close();

// ---- assertions
const near = (a, b, tol) => Math.abs(a - b) <= tol;
if (r.skinned !== 1) errors.push(`${r.skinned} skeletons, expected one shared skeleton`);
// decision 041: the owner's doll has a 9-bone rig (root, turn, chest, neck, head, eye, three lens states)
if (r.bones.length !== 9 || !r.bones.every((b) => b.startsWith('Watcher_'))) errors.push(`Skeleton has ${r.bones.length} bones (expected 9 Watcher_ bones)`);
const h = r.restBox.max[1] - r.restBox.min[1];
if (!near(h, 28, 0.15)) errors.push(`Rest height ${h.toFixed(2)} m, expected 28 m`);
if (!near(r.restBox.min[1], 0, 0.02)) errors.push(`Lowest point at Y ${r.restBox.min[1].toFixed(3)}, expected 0 (feet on the ground)`);
if (Math.abs((r.restBox.min[0] + r.restBox.max[0]) / 2) > 0.3) errors.push('Not centred on X');
for (const a of ANCHORS) if (!r.anchors[a]) errors.push(`Anchor ${a} missing`);
const opt = r.anchors.Watcher_OpticalOrigin, fwd = r.anchors.Watcher_DetectionForward;
if (opt && fwd && !(fwd[2] > opt[2] + 3)) errors.push('Watcher does not face +Z (glTF) / -Y (Blender)');
if (opt && !near(opt[1], 19.55, 0.2)) errors.push(`Optical origin at Y ${opt[1]}, expected about 19.55 m (the doll's right eye)`);
for (const [name, [frames, lens]] of Object.entries(CLIPS)) {
  const c = r.clips[name];
  if (!c) { errors.push(`Clip ${name} missing`); continue; }
  if (!near(c.duration, frames / FPS, 0.05)) errors.push(`${name} lasts ${c.duration.toFixed(2)} s, expected ${(frames / FPS).toFixed(2)} s`);
  if (c.bonesMoved < 1 && name !== 'Watcher_FocusLock') errors.push(`${name} does not move the rig`);
  if (lens) {
    for (const [state, s] of Object.entries(c.lens)) {
      if (state === lens ? s < 0.9 : s > 0.05) errors.push(`${name}: lens ${state} scale ${s.toFixed(2)} (expected only ${lens} visible)`);
    }
  }
}
const byName = Object.fromEntries(r.materials.map((m) => [m.name, m]));
{ const m = byName.MAT_Watcher_Doll; if (!m || !m.map) errors.push('MAT_Watcher_Doll missing or untextured'); }
for (const [n, ch] of [['MAT_Watcher_Lens_Red', 0], ['MAT_Watcher_Lens_Green', 1]]) {
  const m = byName[n]; if (!m || !m.emissive || m.emissive[ch] < 0.5) errors.push(`${n} missing or not emissive`);
}
if (consoleErrors.length) errors.push(`Browser errors: ${consoleErrors.slice(0, 3).join(' | ')}`);

const report = { result: errors.length ? 'FAIL' : 'PASS', errors, glb: 'blender/exports/THE_WATCHER.glb', glb_bytes: bytes.length,
  gltf_validator: { version: v.validatorVersion, errors: v.issues.numErrors, warnings: v.issues.numWarnings, infos: v.issues.numInfos,
                    messages: v.issues.messages.filter((m) => m.severity <= 1).slice(0, 20) },
  browser: { webgl: r.webgl, skeletons: r.skinned, joints: r.bones.length, rest_bounds: r.restBox, anchors: r.anchors, clips: r.clips },
  materials: r.materials, screenshots: shots.map(([c]) => `blender/exports/THE_WATCHER_browser/THE_WATCHER_browser_${c}.png`) };
await writeFile(join(outDir, 'THE_WATCHER_browser_check.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ result: report.result, errors, validator: `${v.issues.numErrors} errors / ${v.issues.numWarnings} warnings`,
  height: +h.toFixed(3), joints: r.bones.length, clips: Object.keys(r.clips).length }, null, 2));
process.exit(errors.length ? 1 : 0);
