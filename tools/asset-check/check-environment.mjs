// Browser check for the Stage 01 environment test GLB (Prompt 05).
//  1. Khronos glTF Validator: no errors.
//  2. Headless Chromium + Three.js GLTFLoader (the client's renderer):
//     - scale: the yard ground spans the approved playable area from STAGE_01_METADATA.json (60 x 187 m)
//     - orientation: Y up; spawns sit at the metadata positions converted to game coordinates and face
//       -Z, toward The Shepherd's anchor at Z = -185; the 22 m floodlight masts reach Y = 22
//     - materials: PBR (MeshStandardMaterial), textured sets have colour, roughness/metalness and normal
//       maps; chain-link is alpha-tested and double-sided; signal and lantern materials are emissive and
//       named for runtime control; haze is transparent; textures are powers of two and colour maps sRGB
//     - nothing from collision, triggers, boundaries or review helpers leaked in
//     - draw calls and triangles from renderer.info, and screenshots lit from STAGE_01_LIGHTING.json
// Usage (repo root): NODE_PATH=$(npm root -g) node tools/asset-check/check-environment.mjs
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
const glbPath = join(root, 'blender/exports/STAGE_01_ENVIRONMENT.glb');
const meta = JSON.parse(await readFile(join(root, 'blender/exports/STAGE_01_METADATA.json'), 'utf8'));
const lighting = JSON.parse(await readFile(join(root, 'blender/exports/STAGE_01_LIGHTING.json'), 'utf8'));
const outDir = join(root, 'blender/exports/STAGE_01_ENVIRONMENT_browser');
const errors = [];

// ---- 1. glTF Validator
const bytes = new Uint8Array(await readFile(glbPath));
const v = await validator.validateBytes(bytes, { maxIssues: 200 });
if (v.issues.numErrors > 0) errors.push(`glTF Validator: ${v.issues.numErrors} error(s)`);

// ---- 2. Browser
const page_html = `<!doctype html><meta charset="utf-8"><body style="margin:0;background:#000">
<script type="importmap">{"imports":{"three":"/tools/asset-check/node_modules/three/build/three.module.js",
"three/addons/":"/tools/asset-check/node_modules/three/examples/jsm/"}}</script>
<script type="module">
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
window.setup = async (url, L) => {
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setSize(1280, 720);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = L.toneMapping.exposure;
  document.body.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(...L.background.horizon);
  scene.fog = new THREE.FogExp2(new THREE.Color(...L.fog.color), L.fog.density);
  scene.add(new THREE.HemisphereLight(new THREE.Color(...L.ambient.sky), new THREE.Color(...L.ambient.ground), L.ambient.intensity));
  for (const l of L.lights) {
    const col = new THREE.Color(...l.color);
    let o = null;
    if (l.type === 'directional') o = new THREE.DirectionalLight(col, 0.35);
    else if (l.type === 'spot') { o = new THREE.SpotLight(col, l.id.includes('Rim') ? 900 : 700, l.range * 1.5, THREE.MathUtils.degToRad(l.angleDeg), l.penumbra, 1.6); }
    else if (l.type === 'point') o = new THREE.PointLight(col, 120, l.range, 1.6);
    if (!o) continue;
    o.position.set(...l.position);
    if (o.target) { o.target.position.set(l.position[0] + l.direction[0] * 10, l.position[1] + l.direction[1] * 10, l.position[2] + l.direction[2] * 10); scene.add(o.target); }
    scene.add(o);
  }
  const gltf = await new GLTFLoader().loadAsync(url);
  scene.add(gltf.scene);
  scene.updateMatrixWorld(true);
  const names = []; const extras = {}; const mats = new Map(); let tris = 0;
  gltf.scene.traverse((o) => {
    if (o.name) names.push(o.name);
    if (Object.keys(o.userData).length) extras[o.name] = o.userData;
    if (o.isMesh) {
      tris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3;
      for (const m of [].concat(o.material)) mats.set(m.name, m);
    }
  });
  const tex = (t) => t && t.image ? { w: t.image.width, h: t.image.height, cs: t.colorSpace } : null;
  const materials = [...mats.values()].map((m) => ({ name: m.name, type: m.type, map: tex(m.map), normal: tex(m.normalMap),
    rough: tex(m.roughnessMap), metal: tex(m.metalnessMap), alphaTest: m.alphaTest, transparent: m.transparent, side: m.side,
    emissive: m.emissive ? m.emissive.toArray() : null, emissiveIntensity: m.emissiveIntensity }));
  const box = (n) => { const o = gltf.scene.getObjectByName(n); if (!o) return null; const b = new THREE.Box3().setFromObject(o); return { min: b.min.toArray(), max: b.max.toArray() }; };
  const node = (n) => { const o = gltf.scene.getObjectByName(n); if (!o) return null;
    const p = new THREE.Vector3(); o.getWorldPosition(p); const f = new THREE.Vector3(0, 0, 1).applyQuaternion(o.getWorldQuaternion(new THREE.Quaternion()));
    return { pos: p.toArray(), fwd: f.toArray() }; };
  const spawns = {}; for (let i = 1; i <= 30; i++) { const id = 'SPAWN_PLAYER_' + String(i).padStart(2, '0'); spawns[id] = node(id); }
  window.__r = { renderer, scene };
  return { names, extras: Object.keys(extras).length, materials, triangles: tris, spawns, shepherd: node('WATCHER_ROOT_ANCHOR'),
           yard: box('STG01_Ground_Yard'), arch: box('ENV_VISUAL_ARCHITECTURE'),
           webgl: renderer.getContext().getParameter(renderer.getContext().VERSION) };
};
window.shot = (eye, target, fov) => {
  const { renderer, scene } = window.__r;
  const cam = new THREE.PerspectiveCamera(fov, 1280 / 720, 0.1, 2000);
  cam.position.set(...eye); cam.lookAt(...target);
  renderer.info.reset(); renderer.info.autoReset = false;
  renderer.render(scene, cam);
  return { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles };
};
window.ready = true;
</script>`;

const mime = { '.html': 'text/html', '.js': 'text/javascript', '.glb': 'model/gltf-binary', '.json': 'application/json' };
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
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const consoleErrors = [];
page.on('pageerror', (e) => consoleErrors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
await page.goto(`${base}/check.html`);
await page.waitForFunction(() => window.ready === true);
const r = await page.evaluate(([u, L]) => window.setup(u, L), ['/blender/exports/STAGE_01_ENVIRONMENT.glb', lighting]);
await mkdir(outDir, { recursive: true });
const views = {
  third_person: [[-1.5, 2.6, 12.5], [-1.5, 14, -185], 60],
  wide: [[-58, 30, 52], [0, 6, -110], 65],
  finish: [[-20, 6, -175], [0, 1, -150], 60],
};
const renderStats = {};
for (const [name, [eye, target, fov]] of Object.entries(views)) {
  renderStats[name] = await page.evaluate(([e, t, f]) => window.shot(e, t, f), [eye, target, fov]);
  await page.screenshot({ path: join(outDir, `STAGE_01_ENV_browser_${name}.png`) });
}
await browser.close();
server.close();

// ---- assertions
const near = (a, b, tol = 0.01) => Math.abs(a - b) <= tol;
const pa = meta.movementBoundaries.find((b) => b.id === 'BOUNDARY_PLAYABLE_AREA');
const want = { minX: pa.position.x - pa.dimensions.x / 2, maxX: pa.position.x + pa.dimensions.x / 2,
               minZ: -(pa.position.y + pa.dimensions.y / 2), maxZ: -(pa.position.y - pa.dimensions.y / 2) };
if (!r.yard) errors.push('STG01_Ground_Yard missing');
else if (!(near(r.yard.min[0], want.minX) && near(r.yard.max[0], want.maxX) && near(r.yard.min[2], want.minZ) && near(r.yard.max[2], want.maxZ) && near(r.yard.max[1], 0)))
  errors.push(`Yard ground ${JSON.stringify(r.yard)} does not span the playable area ${JSON.stringify(want)} at Y 0`);
for (const sp of meta.spawnPoints) {
  const s = r.spawns[sp.id];
  if (!s) { errors.push(`${sp.id} missing`); continue; }
  const g = [sp.position.x, sp.position.z, -sp.position.y];
  if (!s.pos.every((x, i) => near(x, g[i], 0.001))) errors.push(`${sp.id} at ${s.pos}, expected ${g}`);
  if (s.fwd[2] > -0.999) errors.push(`${sp.id} faces ${s.fwd.map((x) => x.toFixed(2))}, expected -Z (toward The Shepherd)`);
}
const w = meta.watcherDetectionReference;
if (!r.shepherd || !near(r.shepherd.pos[2], -w.position.y, 0.01) || !near(r.shepherd.pos[1], 4, 0.01)) errors.push(`WATCHER_ROOT_ANCHOR at ${r.shepherd?.pos}, expected Z ${-w.position.y}, Y 4`);
if (!r.arch || r.arch.max[1] < 22) errors.push(`Architecture top at Y ${r.arch?.max[1]}: floodlight masts should reach 22 m (Y up)`);
const leaked = r.names.filter((n) => /^(COLLISION_|TRIGGER_|BOUNDARY_|COL_|CAM_|LGT_|ZONE_|REF_)/.test(n) || /_CAPSULE$|DETECTION_REFERENCE|_Review$/.test(n));
if (leaked.length) errors.push(`Not for the runtime GLB: ${leaked.slice(0, 6).join(', ')}`);
const pow2 = (n) => n > 0 && (n & (n - 1)) === 0;
const byName = Object.fromEntries(r.materials.map((m) => [m.name, m]));
for (const m of r.materials) {
  if (m.type !== 'MeshStandardMaterial') errors.push(`${m.name} is ${m.type}, expected MeshStandardMaterial`);
  for (const t of [m.map, m.normal, m.rough, m.metal].filter(Boolean)) if (!pow2(t.w) || !pow2(t.h)) errors.push(`${m.name} texture ${t.w}x${t.h} is not a power of two`);
  if (m.map && m.map.cs !== 'srgb') errors.push(`${m.name} colour map is not sRGB`);
}
const textured = ['MAT_Asphalt_Wet', 'MAT_Concrete_Weathered', 'MAT_Metal_RustPaint', 'MAT_Steel_Dark', 'MAT_Ground_DirtGrass'];
for (const n of textured) { const m = byName[n]; if (!m || !m.map || !m.normal || !m.rough) errors.push(`${n} is missing colour, normal or roughness maps`); }
const cl = byName.MAT_ChainLink;
if (!cl || !(cl.alphaTest > 0) || cl.side !== 2) errors.push('MAT_ChainLink should be alpha-tested and double-sided');
for (const [n, ch] of [['MAT_Signal_Red', 0], ['MAT_Signal_Green', 1], ['MAT_Signal_Amber', 0], ['MAT_Shepherd_Lantern', 0]]) {
  const m = byName[n];
  if (!m || !m.emissive || m.emissive[ch] < 0.5) errors.push(`${n} missing or not emissive`);
}
if (!byName.MAT_VFX_Haze?.transparent) errors.push('MAT_VFX_Haze should be transparent');
if (consoleErrors.length) errors.push(`Browser errors: ${consoleErrors.slice(0, 3).join(' | ')}`);
const maxCalls = Math.max(...Object.values(renderStats).map((s) => s.calls));
if (maxCalls > 150) errors.push(`${maxCalls} draw calls in one view (budget 150)`);
if (bytes.length > 20e6) errors.push(`GLB is ${(bytes.length / 1e6).toFixed(1)} MB (budget 20 MB)`);

const report = {
  result: errors.length ? 'FAIL' : 'PASS', errors, glb: 'blender/exports/STAGE_01_ENVIRONMENT.glb', glb_bytes: bytes.length,
  gltf_validator: { version: v.validatorVersion, errors: v.issues.numErrors, warnings: v.issues.numWarnings, infos: v.issues.numInfos,
                    messages: v.issues.messages.filter((m) => m.severity <= 1).slice(0, 20) },
  browser: { webgl: r.webgl, nodes: r.names.length, nodes_with_extras: r.extras, triangles: r.triangles, render: renderStats,
             yard_bounds: r.yard, shepherd_anchor: r.shepherd, spawn_01: r.spawns.SPAWN_PLAYER_01 },
  materials: r.materials,
  screenshots: Object.keys(views).map((n) => `blender/exports/STAGE_01_ENVIRONMENT_browser/STAGE_01_ENV_browser_${n}.png`),
};
await writeFile(join(outDir, 'STAGE_01_ENVIRONMENT_browser_check.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ result: report.result, errors, validator: `${v.issues.numErrors} errors / ${v.issues.numWarnings} warnings`, render: renderStats, webgl: r.webgl }, null, 2));
process.exit(errors.length ? 1 : 0);
