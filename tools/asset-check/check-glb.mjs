// Browser check for an exported stage (docs/BLENDER_PIPELINE.md §8 steps 2 and 3).
//  1. Khronos glTF Validator: no errors allowed.
//  2. Headless Chromium + Three.js GLTFLoader: the GLB loads, object names, spawn markers and
//     glTF extras arrive, the yard bounds match the marker data, and a screenshot is saved from
//     the gameplay viewpoint. Software WebGL (no GPU), so this checks correctness, not speed.
//
// Usage (repo root):  NODE_PATH=$(npm root -g) node tools/asset-check/check-glb.mjs STG01
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
const stage = process.argv[2] || 'STG01';
const exportDir = join(root, 'blender/exports', stage);
const glbName = (await import('node:fs')).readdirSync(exportDir).find((f) => f.endsWith('.glb'));
if (!glbName) throw new Error(`No GLB in ${exportDir}`);
const markers = JSON.parse(await readFile(join(exportDir, `${stage}_markers.json`), 'utf8'));
const errors = [];

// ---- 1. glTF Validator
const bytes = new Uint8Array(await readFile(join(exportDir, glbName)));
const v = await validator.validateBytes(bytes, { maxIssues: 100 });
const vIssues = v.issues;
if (vIssues.numErrors > 0) errors.push(`glTF Validator: ${vIssues.numErrors} error(s)`);

// ---- 2. Browser load
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.glb': 'model/gltf-binary', '.json': 'application/json' };
const page_html = `<!doctype html><meta charset="utf-8"><body style="margin:0;background:#000">
<script type="importmap">{"imports":{"three":"/tools/asset-check/node_modules/three/build/three.module.js",
"three/addons/":"/tools/asset-check/node_modules/three/examples/jsm/"}}</script>
<script type="module">
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
window.runCheck = async (url, view) => {
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setSize(1280, 720);
  document.body.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1a1f2e);
  scene.add(new THREE.HemisphereLight(0x9fb3ff, 0x2a2420, 1.4));
  const sun = new THREE.DirectionalLight(0xffe2b8, 1.6); sun.position.set(-40, 80, 30); scene.add(sun);
  const gltf = await new GLTFLoader().loadAsync(url);
  scene.add(gltf.scene);
  const names = []; const extras = {};
  gltf.scene.traverse((o) => { if (o.name) names.push(o.name); if (o.name.startsWith('GMK_') && Object.keys(o.userData).length) extras[o.name] = o.userData; });
  const yard = gltf.scene.getObjectByName('STG01_Ground_Yard');
  const box = yard ? new THREE.Box3().setFromObject(yard) : null;
  const cam = new THREE.PerspectiveCamera(60, 1280 / 720, 0.1, 1000);
  cam.position.set(...view.eye); cam.lookAt(...view.target);
  renderer.render(scene, cam);
  let tris = 0; gltf.scene.traverse((o) => { if (o.isMesh) tris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; });
  return { names, extras, yard: box && { min: box.min.toArray(), max: box.max.toArray() }, triangles: tris,
           renderer: renderer.getContext().getParameter(renderer.getContext().VERSION) };
};
window.ready = true;
</script>`;

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

const byId = Object.fromEntries(markers.markers.map((m) => [m.id, m]));
const spawn = byId.GMK_SPAWN_01.position;      // game coordinates (Y up, course toward -Z)
const shepherd = byId.GMK_SHEPHERD;
const view = { eye: [0, 3.0, spawn[2] + 5], target: [shepherd.position[0], shepherd.height * 0.6, shepherd.position[2]] };

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const consoleErrors = [];
page.on('pageerror', (e) => consoleErrors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
await page.goto(`${base}/check.html`);
await page.waitForFunction(() => window.ready === true);
const result = await page.evaluate(([u, vw]) => window.runCheck(u, vw), [`/blender/exports/${stage}/${glbName}`, view]);
const outDir = join(exportDir, 'browser');
await mkdir(outDir, { recursive: true });
await page.screenshot({ path: join(outDir, `${stage}_browser_gameplay.png`) });
await browser.close();
server.close();

// ---- assertions
const spawnNames = result.names.filter((n) => /^GMK_SPAWN_\d\d$/.test(n));
const expectedSpawns = markers.markers.filter((m) => m.kind === 'spawn').length;
if (spawnNames.length !== expectedSpawns) errors.push(`Browser sees ${spawnNames.length} spawn markers, expected ${expectedSpawns}`);
if (!result.extras.GMK_SHEPHERD || result.extras.GMK_SHEPHERD.kind !== 'shepherd') errors.push('glTF extras missing on GMK_SHEPHERD');
const leaked = result.names.filter((n) => /^(COL_|CAM_|LGT_|ZONE_|REF_)/.test(n) || /_Capsule$|_Envelope$|_Facing_Arrow$/.test(n));
if (leaked.length) errors.push(`Collision, camera, light or review-only objects leaked into the runtime GLB: ${leaked.slice(0, 5).join(', ')}`);
const bounds = byId.GMK_BOUNDS;
if (result.yard) {
  const [minX, , minZ] = result.yard.min; const [maxX, , maxZ] = result.yard.max;
  const near = (a, b) => Math.abs(a - b) < 0.01;
  // Blender Y range [min_y, max_y] maps to game Z range [-max_y, -min_y].
  if (!(near(minX, bounds.min_x) && near(maxX, bounds.max_x) && near(minZ, -bounds.max_y) && near(maxZ, -bounds.min_y)))
    errors.push(`Yard bounds in the browser ${JSON.stringify(result.yard)} do not match GMK_BOUNDS`);
} else errors.push('STG01_Ground_Yard not found in the GLB');
if (consoleErrors.length) errors.push(`Browser errors: ${consoleErrors.join(' | ')}`);

const report = {
  stage, glb: glbName, result: errors.length ? 'FAIL' : 'PASS', errors,
  gltf_validator: { version: v.validatorVersion, errors: vIssues.numErrors, warnings: vIssues.numWarnings, infos: vIssues.numInfos,
                    messages: vIssues.messages.filter((m) => m.severity <= 1).slice(0, 20) },
  browser: { webgl: result.renderer, objects: result.names.length, spawn_markers: spawnNames.length, triangles: result.triangles, yard_bounds: result.yard },
  screenshot: `blender/exports/${stage}/browser/${stage}_browser_gameplay.png`,
};
await writeFile(join(outDir, `${stage}_browser_check.json`), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ result: report.result, errors, validator: report.gltf_validator.errors + ' errors / ' + report.gltf_validator.warnings + ' warnings', webgl: result.renderer }, null, 2));
process.exit(errors.length ? 1 : 0);
