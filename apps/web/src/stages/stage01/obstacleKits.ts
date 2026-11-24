// Stage 01 refinement (Phase 03): modular, reusable obstacle props for the barricade segments. Collision is the
// segment box from packages/shared/src/obstacles.ts (server authority and prediction); these models only fill
// that footprint, never wider or deeper, so what you see is what stops you.
//
// Every kit is built from a few primitives, tinted with vertex colours and merged into one mesh per material
// (seven draw calls for all 41 segments). Weathered surfaces come from small procedural canvas textures:
// stained concrete, sun-bleached planks, rusty paint, scuffed rubber. No external assets.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { OBSTACLE_KITS, type Barricade } from '@cn-trials/shared';

export type KitMaterial = 'concrete' | 'hazard' | 'wood' | 'rubber' | 'paint' | 'steel' | 'container';

// ------------------------------------------------------------------------------------------ textures
function canvasTexture(w: number, h: number, draw: (g: CanvasRenderingContext2D, rnd: () => number) => void, seed = 7) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  draw(c.getContext('2d')!, rnd);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

const speckle = (g: CanvasRenderingContext2D, rnd: () => number, w: number, h: number, n: number, rgb: string, a: number, size = 3) => {
  for (let i = 0; i < n; i++) { g.fillStyle = `rgba(${rgb},${rnd() * a})`; g.fillRect(rnd() * w, rnd() * h, 1 + rnd() * size, 1 + rnd() * size); }
};
const streaks = (g: CanvasRenderingContext2D, rnd: () => number, w: number, h: number, n: number, rgb: string, a: number) => {
  for (let i = 0; i < n; i++) {
    const x = rnd() * w, len = h * (0.2 + rnd() * 0.7);
    const grad = g.createLinearGradient(0, 0, 0, len);
    grad.addColorStop(0, `rgba(${rgb},${a * rnd()})`); grad.addColorStop(1, `rgba(${rgb},0)`);
    g.fillStyle = grad; g.fillRect(x, 0, 1 + rnd() * 4, len);
  }
};

function textures() {
  const concrete = canvasTexture(256, 256, (g, r) => {
    g.fillStyle = '#8a8780'; g.fillRect(0, 0, 256, 256);
    speckle(g, r, 256, 256, 1600, '40,38,34', 0.16); speckle(g, r, 256, 256, 500, '200,196,186', 0.12);
    streaks(g, r, 256, 256, 40, '52,50,46', 0.25);
  }, 11);
  const hazard = canvasTexture(256, 64, (g, r) => {
    g.fillStyle = '#8d8a84'; g.fillRect(0, 0, 256, 64);
    speckle(g, r, 256, 64, 420, '40,38,34', 0.14);
    g.save(); g.beginPath(); g.rect(0, 6, 256, 18); g.clip();
    for (let x = -64; x < 320; x += 32) { g.fillStyle = '#d99a1e'; g.beginPath(); g.moveTo(x, 24); g.lineTo(x + 16, 24); g.lineTo(x + 34, 6); g.lineTo(x + 18, 6); g.fill(); }
    g.restore();
    speckle(g, r, 256, 24, 260, '60,50,40', 0.3, 2); // chipped paint on the stripes
  }, 13);
  const wood = canvasTexture(256, 256, (g, r) => {
    g.fillStyle = '#8b7a62'; g.fillRect(0, 0, 256, 256);
    for (let y = 0; y < 256; y += 32) {                 // planks with grain and dark seams
      g.fillStyle = `rgba(${90 + r() * 30},${76 + r() * 24},${58 + r() * 18},0.55)`; g.fillRect(0, y, 256, 31);
      for (let k = 0; k < 14; k++) { g.strokeStyle = `rgba(50,40,30,${0.1 + r() * 0.2})`; g.beginPath(); const yy = y + r() * 30; g.moveTo(0, yy); g.bezierCurveTo(80, yy + r() * 4 - 2, 170, yy + r() * 4 - 2, 256, yy); g.stroke(); }
      g.fillStyle = 'rgba(30,24,18,0.8)'; g.fillRect(0, y + 30, 256, 2);
    }
    speckle(g, r, 256, 256, 500, '200,190,170', 0.12); streaks(g, r, 256, 256, 30, '40,34,26', 0.35);
  }, 17);
  const rubber = canvasTexture(128, 64, (g, r) => {
    g.fillStyle = '#26272a'; g.fillRect(0, 0, 128, 64);
    for (let x = 0; x < 128; x += 8) { g.fillStyle = 'rgba(10,10,12,0.8)'; g.fillRect(x, 0, 3, 64); } // tread
    speckle(g, r, 128, 64, 300, '120,118,112', 0.18, 2);
  }, 19);
  const paint = canvasTexture(256, 256, (g, r) => {
    g.fillStyle = '#d8d4cc'; g.fillRect(0, 0, 256, 256);  // white base; vertex colour gives the paint colour
    for (let i = 0; i < 70; i++) {                         // rust blooms and chipped paint
      const x = r() * 256, y = r() * 256, rad = 3 + r() * 16;
      const grad = g.createRadialGradient(x, y, 0, x, y, rad);
      grad.addColorStop(0, 'rgba(120,62,30,0.85)'); grad.addColorStop(1, 'rgba(120,62,30,0)');
      g.fillStyle = grad; g.beginPath(); g.arc(x, y, rad, 0, Math.PI * 2); g.fill();
    }
    streaks(g, r, 256, 256, 50, '110,58,30', 0.5); speckle(g, r, 256, 256, 700, '60,50,44', 0.2);
    for (const y of [40, 128, 216]) { g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(0, y, 256, 6); } // drum hoops
  }, 23);
  const steel = canvasTexture(128, 128, (g, r) => {
    g.fillStyle = '#6a6660'; g.fillRect(0, 0, 128, 128);
    speckle(g, r, 128, 128, 600, '110,60,32', 0.35, 4); speckle(g, r, 128, 128, 300, '30,30,30', 0.3);
  }, 29);
  const container = canvasTexture(256, 256, (g, r) => {
    g.fillStyle = '#d8d4cc'; g.fillRect(0, 0, 256, 256);
    for (let x = 0; x < 256; x += 16) {                    // corrugation: light and shadow ribs
      const grad = g.createLinearGradient(x, 0, x + 16, 0);
      grad.addColorStop(0, 'rgba(0,0,0,0.28)'); grad.addColorStop(0.5, 'rgba(255,255,255,0.12)'); grad.addColorStop(1, 'rgba(0,0,0,0.28)');
      g.fillStyle = grad; g.fillRect(x, 0, 16, 256);
    }
    streaks(g, r, 256, 256, 80, '100,52,26', 0.55); speckle(g, r, 256, 256, 900, '70,50,40', 0.25, 4);
    g.fillStyle = 'rgba(30,26,22,0.5)'; g.fillRect(0, 0, 256, 8); g.fillRect(0, 248, 256, 8);
  }, 31);
  return { concrete, hazard, wood, rubber, paint, steel, container };
}

export function kitMaterials(): Record<KitMaterial, THREE.MeshStandardMaterial> {
  const t = textures();
  const m = (map: THREE.Texture, roughness: number, metalness: number, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) =>
    new THREE.MeshStandardMaterial({ map, roughness, metalness, vertexColors: true, ...extra });
  return {
    concrete: m(t.concrete, 0.9, 0, { side: THREE.DoubleSide }),
    hazard: m(t.hazard, 0.85, 0),
    wood: m(t.wood, 0.92, 0),
    rubber: m(t.rubber, 0.95, 0),
    paint: m(t.paint, 0.6, 0.35),
    steel: m(t.steel, 0.55, 0.65),
    container: m(t.container, 0.65, 0.4),
  };
}

// ------------------------------------------------------------------------------------------ geometry helpers
type Parts = Record<KitMaterial, THREE.BufferGeometry[]>;
const tmp = new THREE.Object3D();

function add(parts: Parts, mat: KitMaterial, g: THREE.BufferGeometry, pos: [number, number, number], rot: [number, number, number] = [0, 0, 0], color = '#ffffff', uvScale: [number, number] = [1, 1]) {
  tmp.position.set(...pos); tmp.rotation.set(...rot); tmp.scale.set(1, 1, 1); tmp.updateMatrix();
  const geo = g.index ? g.clone() : g.clone();
  geo.applyMatrix4(tmp.matrix);
  const n = geo.attributes.position.count;
  const col = new THREE.Color(color);
  const c = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { c[i * 3] = col.r; c[i * 3 + 1] = col.g; c[i * 3 + 2] = col.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(c, 3));
  if (uvScale[0] !== 1 || uvScale[1] !== 1) { const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * uvScale[0], uv.getY(i) * uvScale[1]); }
  parts[mat].push(geo.index ? geo.toNonIndexed() : geo);
}

/** Small seeded random per segment, so the same layout always looks the same on every client. */
function rand(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return () => { h = Math.imul(h ^ (h >>> 15), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); return ((h ^= h >>> 16) >>> 0) / 4294967296; };
}

/** Jersey barrier: trapezoid section (full depth at the base, 40 % at the top). */
function jersey(len: number, depth: number, height: number) {
  const d = depth / 2;
  const prof: [number, number][] = [[-d, 0], [-d * 0.75, height * 0.18], [-d * 0.4, height], [d * 0.4, height], [d * 0.75, height * 0.18], [d, 0]];
  const shape = new THREE.Shape(prof.map(([z, y]) => new THREE.Vector2(z, y)));
  const g = new THREE.ExtrudeGeometry(shape, { depth: len, bevelEnabled: false });
  g.rotateY(Math.PI / 2); // extrude along +X
  const uv = g.attributes.uv; const p = g.attributes.position;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, p.getX(i) / 4, 1 - p.getY(i) / height);
  return g;
}

const DRUM_COLOURS = ['#7c2f22', '#2f5b63', '#3a4d73', '#a07a2c', '#4b5b3a', '#6b6b6b'];
const CONTAINER_COLOURS = ['#7a3424', '#2d5d62', '#34507a', '#8a6a2a', '#5a3a5e'];

// ------------------------------------------------------------------------------------------ kit builders
function build(parts: Parts, b: Barricade) {
  const r = rand(b.id);
  const len = b.maxX - b.minX, cz = (b.minZ + b.maxZ) / 2, depth = b.maxZ - b.minZ;
  const k = OBSTACLE_KITS[b.kit];
  switch (b.kit) {
    case 'jersey': {
      // Several barrier units with small gaps and offsets, like real modular barriers set down by a forklift.
      const units = Math.max(1, Math.round(len / 2.4));
      const ul = len / units;
      for (let i = 0; i < units; i++) {
        const g = jersey(ul - 0.06, depth * (0.94 + r() * 0.06), k.height);
        add(parts, 'hazard', g, [b.minX + i * ul + 0.03, 0, cz + (r() - 0.5) * 0.06], [0, (r() - 0.5) * 0.03, 0]);
      }
      break;
    }
    case 'crates': {
      let x = b.minX;
      while (x < b.maxX - 0.4) {
        const s = Math.min(b.maxX - x, 0.95 + r() * 0.3);
        add(parts, 'wood', new THREE.BoxGeometry(s - 0.04, s * 0.95, Math.min(depth, s)), [x + s / 2, s * 0.475, cz + (r() - 0.5) * 0.1], [0, (r() - 0.5) * 0.12, 0], r() < 0.5 ? '#ffffff' : '#d9cdb8');
        if (r() < 0.35 && s > 0.9) { const t = 0.5 + r() * 0.15; add(parts, 'wood', new THREE.BoxGeometry(t, t, t), [x + s / 2 + (r() - 0.5) * 0.2, s * 0.95 + t / 2, cz], [0, r() * 0.6, 0], '#cbbfa8'); }
        x += s;
      }
      break;
    }
    case 'tires': {
      const torus = new THREE.TorusGeometry(0.36, 0.15, 5, 12);
      torus.rotateX(Math.PI / 2);
      for (let x = b.minX + 0.52; x <= b.maxX - 0.5; x += 1.02) {
        // Lower tyres as one cylinder (the tread texture shows the rings), a full torus only on top: about a
        // fifth of the triangles of a torus per tyre, and the same silhouette from the course.
        const n = 2 + Math.floor(r() * 3);
        const jx = x + (r() - 0.5) * 0.08, jz = cz + (r() - 0.5) * 0.12;
        add(parts, 'rubber', new THREE.CylinderGeometry(0.5, 0.5, (n - 1) * 0.29, 12, 1, true), [jx, (n - 1) * 0.145, jz], [0, r() * 3, 0], '#ffffff', [3, n - 1]);
        add(parts, 'rubber', torus, [jx, 0.15 + (n - 1) * 0.29, jz], [0, r() * 3, (r() - 0.5) * 0.06], '#ffffff', [3, 1]);
      }
      break;
    }
    case 'drums': {
      const drum = new THREE.CylinderGeometry(0.29, 0.29, 0.88, 10);
      for (const dz of [-0.3, 0.3]) {
        for (let x = b.minX + 0.32; x <= b.maxX - 0.3; x += 0.64) {
          const col = DRUM_COLOURS[Math.floor(r() * DRUM_COLOURS.length)];
          if (r() < 0.1) add(parts, 'paint', drum, [x, 0.29, cz + dz * 0.6], [0, 0, Math.PI / 2], col); // knocked over
          else add(parts, 'paint', drum, [x + (r() - 0.5) * 0.05, 0.44, cz + dz + (r() - 0.5) * 0.05], [0, r() * 6, 0], col);
        }
      }
      break;
    }
    case 'pipes': {
      const rad = Math.min(0.52, depth / 2.6);
      let x = b.minX;
      while (x < b.maxX - 0.5) {
        const l = Math.min(b.maxX - x, 2.0 + r() * 0.4) - 0.08;
        const outer = new THREE.CylinderGeometry(rad, rad, l, 14, 1, true);
        const inner = new THREE.CylinderGeometry(rad * 0.8, rad * 0.8, l, 14, 1, true);
        const ring = new THREE.RingGeometry(rad * 0.8, rad, 14);
        const zOff = (r() - 0.5) * (depth - rad * 2.2);
        add(parts, 'concrete', outer, [x + l / 2 + 0.04, rad, cz + zOff], [0, 0, Math.PI / 2], '#ffffff', [2, 1]);
        add(parts, 'concrete', inner, [x + l / 2 + 0.04, rad, cz + zOff], [0, 0, Math.PI / 2], '#9a978f');
        add(parts, 'concrete', ring, [x + 0.04, rad, cz + zOff], [0, -Math.PI / 2, 0]);
        add(parts, 'concrete', ring, [x + l + 0.04, rad, cz + zOff], [0, Math.PI / 2, 0]);
        x += l + 0.08;
      }
      break;
    }
    case 'lowbar': {
      // Timber sawhorse barricades: two striped rails on A-frame legs, about 2 m per unit.
      const units = Math.max(1, Math.round(len / 2));
      const ul = len / units;
      for (let i = 0; i < units; i++) {
        const x0 = b.minX + i * ul + 0.05, x1 = x0 + ul - 0.1, cx = (x0 + x1) / 2;
        for (const y of [0.42, 0.7]) add(parts, 'hazard', new THREE.BoxGeometry(x1 - x0, 0.2, 0.05), [cx, y, cz - 0.05], [0, 0, 0], '#ffffff', [(x1 - x0) / 4, 1]);
        for (const lx of [x0 + 0.12, x1 - 0.12]) for (const s of [-1, 1]) add(parts, 'wood', new THREE.BoxGeometry(0.07, 0.86, 0.07), [lx, 0.4, cz + s * 0.18], [s * 0.42, 0, 0]);
      }
      break;
    }
    case 'equipment': {
      // A toppled floodlight truss lying along the segment, and a dented generator set beside it.
      const h = 0.8, d = Math.min(depth - 0.2, 1.0);
      for (const [y, z] of [[0.06, -d / 2], [0.06, d / 2], [h, 0]] as const) add(parts, 'steel', new THREE.CylinderGeometry(0.05, 0.05, len - 0.2, 6), [b.minX + len / 2, y, cz + z], [0, 0, Math.PI / 2]);
      for (let x = b.minX + 0.2; x < b.maxX - 0.2; x += 0.7) {
        add(parts, 'steel', new THREE.CylinderGeometry(0.03, 0.03, Math.hypot(h, d / 2), 5), [x, h / 2, cz - d / 4], [Math.atan2(d / 2, h), 0, 0]);
        add(parts, 'steel', new THREE.CylinderGeometry(0.03, 0.03, Math.hypot(h, d / 2), 5), [x, h / 2, cz + d / 4], [-Math.atan2(d / 2, h), 0, 0]);
      }
      add(parts, 'steel', new THREE.BoxGeometry(0.5, 0.6, 0.9), [b.minX + 0.35, 0.3, cz], [0, 0, 0.3], '#5a5a5a'); // lamp head, face down
      if (len > 3) add(parts, 'paint', new THREE.BoxGeometry(1.5, 1.05, Math.min(depth, 1.0)), [b.maxX - 1.0, 0.53, cz], [0, (r() - 0.5) * 0.08, 0.04], '#a0812e', [2, 1]);
      break;
    }
    case 'container': {
      const g = new THREE.BoxGeometry(len - 0.1, k.height, depth - 0.04);
      add(parts, 'container', g, [b.minX + len / 2, k.height / 2, cz], [0, 0, 0], CONTAINER_COLOURS[Math.floor(r() * CONTAINER_COLOURS.length)], [len / 2.5, 1]);
      // corner castings and a door-bar strip at the end facing the course centre
      for (const x of [b.minX + 0.12, b.maxX - 0.12]) for (const y of [0.1, k.height - 0.1]) for (const z of [-1, 1]) add(parts, 'steel', new THREE.BoxGeometry(0.2, 0.2, 0.2), [x, y, cz + z * (depth / 2 - 0.1)]);
      break;
    }
  }
}

/** Merged meshes (one per material) for every barricade segment. */
export function buildKitMeshes(barricades: Barricade[], mats: Record<KitMaterial, THREE.MeshStandardMaterial>): THREE.Mesh[] {
  const parts = { concrete: [], hazard: [], wood: [], rubber: [], paint: [], steel: [], container: [] } as Parts;
  for (const b of barricades) build(parts, b);
  const out: THREE.Mesh[] = [];
  for (const [mat, list] of Object.entries(parts) as [KitMaterial, THREE.BufferGeometry[]][]) {
    if (!list.length) continue;
    const merged = mergeGeometries(list.map((g) => { for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) g.deleteAttribute(k); return g; }), false);
    list.forEach((g) => g.dispose());
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, mats[mat]);
    mesh.name = `OBS_STG01_Kit_${mat}`;
    out.push(mesh);
  }
  return out;
}
