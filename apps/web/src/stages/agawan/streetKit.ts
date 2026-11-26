// Stage 02 · AGAWAN BASE: the Philippine Christmas street, built in code from the shared layout (no downloads).
// Every house, vehicle, stall and crate sits exactly on its collision box from packages/shared/src/agawan/layout.ts;
// decorations (parols, string lights, wires, lamps) hang above head height and never collide (pack 05 §5).
//
// Draw calls stay low for Intel Mac laptops (decision D): every solid prop is merged into ONE vertex-coloured mesh,
// every self-lit surface (windows, signs, parols, lamp heads) into ONE unlit mesh, every bulb and glow into a couple
// of point clouds, and every wire into one line set. The scene is lit by two lights; the warm look comes from the
// unlit surfaces and additive glows, not from real-time point lights.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { AGAWAN, TEAMS, TEAM_SLOTS, getStage, rng, type AgawanWall, type Rect, type TeamSlot } from '@cn-trials/shared';

const layout = getStage(AGAWAN.id).agawan!.layout;
const B = layout.bounds;

/** Collects coloured geometry and merges it into one BufferGeometry (position, normal, color). */
export class Kit {
  private parts: THREE.BufferGeometry[] = [];
  private static unit = new THREE.BoxGeometry(1, 1, 1);
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private v = new THREE.Vector3();
  private s = new THREE.Vector3();
  count = 0;

  /** Box centred at (x, y, z), size (sx, sy, sz), turned by ry around Y (and rx, rz when given). */
  box(x: number, y: number, z: number, sx: number, sy: number, sz: number, color: THREE.ColorRepresentation, ry = 0, rx = 0, rz = 0): this {
    this.e.set(rx, ry, rz);
    this.m.compose(this.v.set(x, y, z), this.q.setFromEuler(this.e), this.s.set(sx, sy, sz));
    return this.add(Kit.unit, this.m, color);
  }

  /** Any geometry with a transform. */
  add(g: THREE.BufferGeometry, m: THREE.Matrix4, color: THREE.ColorRepresentation): this {
    let c = g.index ? g.toNonIndexed() : g.clone();
    for (const k of Object.keys(c.attributes)) if (k !== 'position' && k !== 'normal') c.deleteAttribute(k);
    if (!c.getAttribute('normal')) c.computeVertexNormals();
    c.applyMatrix4(m);
    const col = new THREE.Color(color);
    const n = c.getAttribute('position').count;
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { arr[i * 3] = col.r; arr[i * 3 + 1] = col.g; arr[i * 3 + 2] = col.b; }
    c.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    c.clearGroups();
    this.parts.push(c);
    this.count++;
    return this;
  }

  build(): THREE.BufferGeometry {
    const g = this.parts.length ? mergeGeometries(this.parts, false)! : new THREE.BufferGeometry();
    for (const p of this.parts) p.dispose();
    this.parts = [];
    g.computeBoundingSphere();
    return g;
  }
}

/** Point cloud collector (bulbs and glows): position, colour, per-point size. */
export class Dots {
  pos: number[] = [];
  col: number[] = [];
  size: number[] = [];
  private c = new THREE.Color();
  add(x: number, y: number, z: number, color: THREE.ColorRepresentation, size: number): void {
    this.c.set(color);
    this.pos.push(x, y, z); this.col.push(this.c.r, this.c.g, this.c.b); this.size.push(size);
  }
  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('size', new THREE.Float32BufferAttribute(this.size, 1));
    g.computeBoundingSphere();
    return g;
  }
}

// ---- palettes (muted for night: the warm light comes from windows, parols and bulbs)
const WALLS = ['#d8c9a8', '#c9d6c0', '#e0b9a0', '#b8c8d8', '#e3d08f', '#d6b4c4', '#c4b49a', '#a9c2b3', '#e6dccb', '#c7a98b'];
const TRIM = ['#f1ebe0', '#8f6e52', '#5d6f7a', '#a24f3c', '#ece3cf'];
const ROOFS = ['#7d3b2c', '#3d5a60', '#5f5a57', '#8a4b2a', '#4a4f6b', '#6b6f73'];
const WINDOW_WARM = ['#ffd27a', '#ffc35e', '#ffe2a6', '#ffb86b', '#fff0c8'];
const WINDOW_DARK = '#232838';
const AWNINGS = ['#c43b3b', '#2f7f6f', '#d9a531', '#2e5d9a', '#b0467c'];
export const PAROL = ['#ff4d4d', '#ffd84a', '#5ad1ff', '#7dff8a', '#ff7ad9', '#ffffff', '#ffa040', '#a98bff'];
export const BULB = ['#ffd27a', '#ff6b6b', '#6be2ff', '#9dff7a', '#ff9ef0', '#fff4d6'];

const isShellEdge = (w: Rect, face: 'n' | 's' | 'w' | 'e') =>
  (face === 'w' && w.minX <= B.minX + 0.01) || (face === 'e' && w.maxX >= B.maxX - 0.01) || (face === 'n' && w.minZ <= B.minZ + 0.01) || (face === 's' && w.maxZ >= B.maxZ - 0.01);

/** Is (x, z) inside a solid (non-fence) wall, grown by `pad`? */
export function insideSolid(x: number, z: number, pad = 0): AgawanWall | null {
  for (const w of layout.walls) {
    if (w.kind === 'fence') continue;
    if (x >= w.minX - pad && x <= w.maxX + pad && z >= w.minZ - pad && z <= w.maxZ + pad) return w;
  }
  return null;
}

/** Walks from (x, z) along (dx, dz) until it meets a house or the shell (max m); null if nothing is hit. */
export function rayToHouse(x: number, z: number, dx: number, dz: number, max: number): { x: number; z: number; d: number } | null {
  for (let d = 0.5; d <= max; d += 0.25) {
    const px = x + dx * d, pz = z + dz * d;
    const w = insideSolid(px, pz);
    if (w && (w.kind === 'house' || w.kind === 'shell')) return { x: px, z: pz, d };
  }
  return null;
}

/** A five-pointed star outline (radius r) as an extruded solid, centred, facing +Z. */
export function starGeometry(r: number, depth: number, inner = 0.45): THREE.BufferGeometry {
  const s = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const a = Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? r * inner : r;
    const x = Math.cos(a) * rr, y = Math.sin(a) * rr;
    if (i === 0) s.moveTo(x, y); else s.lineTo(x, y);
  }
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false });
  g.translate(0, 0, -depth / 2);
  return g;
}

// ---------------------------------------------------------------------------------------------------------------
// Houses: each house block is cut into row houses (5 to 8 m wide) with their own colour, height, roof, windows,
// door and Christmas lights. Faces against the block's outer shell are never seen, so they get no detail.

interface Unit { r: Rect; h: number; wall: string; trim: string; roof: string; edge: Record<'n' | 's' | 'w' | 'e', boolean> }

function splitBlock(w: AgawanWall, rand: () => number): Unit[] {
  const cut = (a: number, b: number): number[] => {
    const len = b - a, n = Math.max(1, Math.round(len / (5 + rand() * 2.5)));
    const out = [a];
    for (let i = 1; i < n; i++) out.push(a + (len * i) / n + (rand() - 0.5) * Math.min(1.2, len / n / 4));
    out.push(b);
    return out;
  };
  const xs = cut(w.minX, w.maxX), zs = cut(w.minZ, w.maxZ);
  const units: Unit[] = [];
  for (let i = 0; i < xs.length - 1; i++) for (let j = 0; j < zs.length - 1; j++) {
    const r: Rect = { id: `${w.id}_${i}_${j}`, minX: xs[i], maxX: xs[i + 1], minZ: zs[j], maxZ: zs[j + 1] };
    const edge = { w: i === 0 && !isShellEdge(w, 'w'), e: i === xs.length - 2 && !isShellEdge(w, 'e'), n: j === 0 && !isShellEdge(w, 'n'), s: j === zs.length - 2 && !isShellEdge(w, 's') };
    const perimeter = edge.w || edge.e || edge.n || edge.s;
    units.push({
      r, edge,
      h: perimeter ? 4.4 + rand() * 2.2 : 4.6,
      wall: WALLS[Math.floor(rand() * WALLS.length)], trim: TRIM[Math.floor(rand() * TRIM.length)], roof: ROOFS[Math.floor(rand() * ROOFS.length)],
    });
  }
  return units;
}

export interface StreetBuild { solid: Kit; glow: Kit; bulbs: Dots; halos: Dots; wires: number[]; pools: { x: number; z: number; r: number; color: string }[] }

function houses(k: StreetBuild, rand: () => number): void {
  for (const w of layout.walls) {
    if (w.kind !== 'house') continue;
    for (const u of splitBlock(w, rand)) house(k, u, rand);
  }
}

function house(k: StreetBuild, u: Unit, rand: () => number): void {
  const { r, h } = u;
  const cx = (r.minX + r.maxX) / 2, cz = (r.minZ + r.maxZ) / 2, sx = r.maxX - r.minX, sz = r.maxZ - r.minZ;
  const g1 = 3.0; // ground floor height
  k.solid.box(cx, g1 / 2, cz, sx, g1, sz, u.wall);
  // Upper floor: a slightly different shade, set on a trim band.
  const upper = new THREE.Color(u.wall).multiplyScalar(0.9 + rand() * 0.15);
  k.solid.box(cx, g1 + (h - g1) / 2, cz, sx - 0.02, h - g1, sz - 0.02, upper);
  k.solid.box(cx, g1, cz, sx + 0.12, 0.16, sz + 0.12, u.trim);
  // Corrugated roof: a sloped slab with an overhang, plus a ridge.
  const flatRoof = rand() < 0.35;
  if (flatRoof) {
    k.solid.box(cx, h + 0.35, cz, sx + 0.1, 0.7, sz + 0.1, u.wall); // parapet
    k.solid.box(cx, h + 0.72, cz, sx + 0.2, 0.06, sz + 0.2, u.trim);
  } else {
    const alongX = sx >= sz;
    const span = alongX ? sz : sx, run = alongX ? sx : sz;
    const pitch = 0.32, half = span / 2 + 0.45, rise = Math.tan(pitch) * half;
    for (const side of [-1, 1]) {
      const off = (half / 2) * Math.cos(pitch) * side;
      if (alongX) k.solid.box(cx, h + rise / 2, cz + off, run + 0.8, 0.08, half / Math.cos(pitch), u.roof, 0, pitch * side);
      else k.solid.box(cx + off, h + rise / 2, cz, half / Math.cos(pitch), 0.08, run + 0.8, u.roof, 0, 0, -pitch * side);
    }
    // gable fill (a low box under the slopes)
    k.solid.box(cx, h + rise * 0.3, cz, sx - 0.1, rise * 0.6, sz - 0.1, upper);
  }
  // Facades that face the street.
  const faces: { f: 'n' | 's' | 'w' | 'e'; len: number; ox: number; oz: number; tx: number; tz: number; ry: number }[] = [
    { f: 'n', len: sx, ox: cx, oz: r.minZ, tx: 1, tz: 0, ry: Math.PI },
    { f: 's', len: sx, ox: cx, oz: r.maxZ, tx: 1, tz: 0, ry: 0 },
    { f: 'w', len: sz, ox: r.minX, oz: cz, tx: 0, tz: 1, ry: -Math.PI / 2 },
    { f: 'e', len: sz, ox: r.maxX, oz: cz, tx: 0, tz: 1, ry: Math.PI / 2 },
  ];
  let doorDone = false;
  for (const F of faces) {
    if (!u.edge[F.f]) continue;
    const nx = F.f === 'w' ? -1 : F.f === 'e' ? 1 : 0, nz = F.f === 'n' ? -1 : F.f === 's' ? 1 : 0;
    const at = (t: number, y: number, out: number) => [F.ox + F.tx * t + nx * out, y, F.oz + F.tz * t + nz * out] as const;
    const n = Math.max(1, Math.floor((F.len - 1) / 2.3));
    const doorAt = !doorDone && F.len > 3.5 ? Math.floor(rand() * n) : -1;
    for (let i = 0; i < n; i++) {
      const t = -F.len / 2 + (F.len / n) * (i + 0.5);
      if (i === doorAt) {
        doorDone = true;
        const [x, , z] = at(t, 0, 0.04);
        k.solid.box(x, 1.05, z, F.tx ? 1.0 : 0.08, 2.1, F.tz ? 1.0 : 0.08, '#4a3020');
        const [lx, , lz] = at(t, 0, 0.06);
        k.glow.box(lx, 2.2, lz, F.tx ? 0.9 : 0.06, 0.12, F.tz ? 0.9 : 0.06, '#ffd9a0'); // transom light
        // awning over the door
        if (rand() < 0.65) {
          const [ax, , az] = at(t, 0, 0.55);
          k.solid.box(ax, 2.55, az, F.tx ? 1.9 : 1.1, 0.06, F.tz ? 1.9 : 1.1, AWNINGS[Math.floor(rand() * AWNINGS.length)], 0, F.tz ? 0.25 * nx : 0, F.tx ? -0.25 * nz : 0);
        }
        // a wall lamp beside the door: warm pool on the street
        const [wx, , wz] = at(t + 0.9, 0, 0.18);
        k.glow.box(wx, 2.45, wz, 0.22, 0.28, 0.22, '#ffe7b0');
        k.halos.add(wx, 2.45, wz, '#ffcf8a', 2.2);
        const [px, , pz] = at(t, 0, 2.2);
        k.pools.push({ x: px, z: pz, r: 3.2, color: '#ffb562' });
      } else {
        const lit = rand() < 0.7;
        const [x, , z] = at(t, 0, 0.03);
        const c = lit ? WINDOW_WARM[Math.floor(rand() * WINDOW_WARM.length)] : WINDOW_DARK;
        (lit ? k.glow : k.solid).box(x, 1.55, z, F.tx ? 1.0 : 0.06, 0.95, F.tz ? 1.0 : 0.06, c);
        k.solid.box(x + nx * 0.03, 1.02, z + nz * 0.03, F.tx ? 1.2 : 0.12, 0.08, F.tz ? 1.2 : 0.12, u.trim); // sill
      }
      if (h > 4.3) {
        const lit = rand() < 0.55;
        const [x, , z] = at(t, 0, 0.03);
        const c = lit ? WINDOW_WARM[Math.floor(rand() * WINDOW_WARM.length)] : WINDOW_DARK;
        (lit ? k.glow : k.solid).box(x, g1 + (h - g1) * 0.5, z, F.tx ? 1.0 : 0.06, 0.9, F.tz ? 1.0 : 0.06, c);
        // shutters
        k.solid.box(x + F.tx * 0.62, g1 + (h - g1) * 0.5, z + F.tz * 0.62, F.tx ? 0.2 : 0.08, 0.9, F.tz ? 0.2 : 0.08, u.trim);
        k.solid.box(x - F.tx * 0.62, g1 + (h - g1) * 0.5, z - F.tz * 0.62, F.tx ? 0.2 : 0.08, 0.9, F.tz ? 0.2 : 0.08, u.trim);
        // a small parol in some upper windows
        if (lit && rand() < 0.25) {
          const [sx2, , sz2] = at(t, 0, 0.25);
          const col = PAROL[Math.floor(rand() * PAROL.length)];
          k.glow.add(SMALL_STAR, new THREE.Matrix4().compose(new THREE.Vector3(sx2, g1 + (h - g1) * 0.5, sz2), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, F.ry, 0)), new THREE.Vector3(1, 1, 1)), col);
          k.halos.add(sx2, g1 + (h - g1) * 0.5, sz2, col, 1.4);
        }
      }
    }
    // Christmas lights along the eaves of this facade.
    const bulbs = Math.floor(F.len / 0.45);
    const palette = rand() < 0.5 ? BULB : ['#ffd27a', '#fff4d6'];
    for (let i = 0; i <= bulbs; i++) {
      const t = -F.len / 2 + (F.len * i) / bulbs;
      const sag = 0.12 * Math.abs(Math.sin((i / bulbs) * Math.PI * Math.max(1, Math.round(F.len / 2.5))));
      const [x, y, z] = at(t, h - 0.15 - sag, 0.12);
      k.bulbs.add(x, y, z, palette[i % palette.length], 0.16);
    }
  }
}

const SMALL_STAR = starGeometry(0.32, 0.05);
const PAROL_STAR = starGeometry(0.55, 0.08);
const PAROL_RING = new THREE.TorusGeometry(0.62, 0.035, 4, 24);
const CYL = new THREE.CylinderGeometry(1, 1, 1, 10);
const SPHERE = new THREE.IcosahedronGeometry(1, 1);
const CONE = new THREE.ConeGeometry(1, 1, 10);

/** One hanging parol: star, optional ring, three tails. (x, y, z) is the star's centre; it faces along `ry`. */
function parol(k: StreetBuild, x: number, y: number, z: number, ry: number, color: string, scale: number, rand: () => number): void {
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0));
  const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(scale, scale, scale));
  k.glow.add(PAROL_STAR, m, color);
  if (rand() < 0.5) k.glow.add(PAROL_RING, m, '#fff2c0');
  const right = new THREE.Vector3(1, 0, 0).applyQuaternion(q);
  for (const t of [-0.18, 0, 0.18]) {
    const len = (t === 0 ? 0.9 : 0.7) * scale;
    k.glow.box(x + right.x * t * scale, y - 0.45 * scale - len / 2, z + right.z * t * scale, 0.05 * scale, len, 0.02, color, ry);
  }
  k.halos.add(x, y, z, color, 3.2 * scale);
}

/** A wire between two anchors with bulbs (and optionally parols and drops) along a catenary sag. */
function strand(k: StreetBuild, a: THREE.Vector3, b: THREE.Vector3, sag: number, rand: () => number, opts: { parols?: number; drops?: boolean; palette?: string[] } = {}): void {
  const len = a.distanceTo(b);
  const n = Math.max(4, Math.floor(len / 0.4));
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    pts.push(new THREE.Vector3().lerpVectors(a, b, t).add(new THREE.Vector3(0, -sag * 4 * t * (1 - t), 0)));
  }
  for (let i = 0; i < n; i++) k.wires.push(pts[i].x, pts[i].y, pts[i].z, pts[i + 1].x, pts[i + 1].y, pts[i + 1].z);
  const pal = opts.palette ?? BULB;
  for (let i = 1; i < n; i++) k.bulbs.add(pts[i].x, pts[i].y - 0.05, pts[i].z, pal[i % pal.length], 0.18);
  const ry = Math.atan2(b.x - a.x, b.z - a.z) + Math.PI / 2; // the star faces along the street (across the wire)
  const np = opts.parols ?? 0;
  for (let j = 0; j < np; j++) {
    const t = (j + 1) / (np + 1) + (rand() - 0.5) * 0.08;
    const p = new THREE.Vector3().lerpVectors(a, b, t).add(new THREE.Vector3(0, -sag * 4 * t * (1 - t), 0));
    const scale = 0.9 + rand() * 0.7;
    parol(k, p.x, p.y - 0.75 * scale, p.z, ry - Math.PI / 2, PAROL[Math.floor(rand() * PAROL.length)], scale, rand);
  }
  if (opts.drops) {
    // Vertical light drops (the pack's reference photo 1): short columns of bulbs hanging from the wire.
    for (let i = 3; i < n - 2; i += 3) {
      const len2 = 0.5 + rand() * 0.9;
      for (let d = 0.2; d < len2; d += 0.16) k.bulbs.add(pts[i].x, pts[i].y - d, pts[i].z, '#fff1cf', 0.13);
    }
  }
}

function overhead(k: StreetBuild, rand: () => number): void {
  // Cross-street wires every ~7 m along the three main streets, anchored on the houses either side.
  for (const r of layout.routes) {
    for (let s = 0; s < r.points.length - 1; s++) {
      const [x0, z0] = r.points[s], [x1, z1] = r.points[s + 1];
      const len = Math.hypot(x1 - x0, z1 - z0), ux = (x1 - x0) / len, uz = (z1 - z0) / len;
      for (let d = 5; d < len - 3; d += 7) {
        const px = x0 + ux * d, pz = z0 + uz * d;
        if (Math.hypot(px - layout.bases.A.x, pz - layout.bases.A.z) < 7 || Math.hypot(px - layout.bases.B.x, pz - layout.bases.B.z) < 7 || Math.hypot(px - layout.bases.C.x, pz - layout.bases.C.z) < 7) continue;
        const L = rayToHouse(px, pz, -uz, ux, 16), R = rayToHouse(px, pz, uz, -ux, 16);
        if (!L || !R) continue;
        const ya = 5.6 + rand() * 0.8, yb = 5.6 + rand() * 0.8;
        strand(k, new THREE.Vector3(L.x, ya, L.z), new THREE.Vector3(R.x, yb, R.z), 0.6 + rand() * 0.5, rand, { parols: 2 + Math.floor(rand() * 2), drops: rand() < 0.6 });
      }
    }
  }
  // Long zig-zag strands along each street (photo 3: lanterns strung above the lane).
  for (const r of layout.routes) {
    for (let s = 0; s < r.points.length - 1; s++) {
      const [x0, z0] = r.points[s], [x1, z1] = r.points[s + 1];
      const len = Math.hypot(x1 - x0, z1 - z0), ux = (x1 - x0) / len, uz = (z1 - z0) / len;
      for (let d = 2; d < len - 6; d += 9) {
        const off = (d / 9) % 2 ? 2.2 : -2.2;
        const a = new THREE.Vector3(x0 + ux * d - uz * off, 6.6, z0 + uz * d + ux * off);
        const b = new THREE.Vector3(x0 + ux * (d + 9) + uz * off, 6.6, z0 + uz * (d + 9) - ux * off);
        strand(k, a, b, 0.5, rand, { palette: ['#fff4d6', '#ffd27a'] });
      }
    }
  }
}

/** Plaza: the Christmas tree with spiral lights and a star; strands from its top to the plaza's edge. */
function plaza(k: StreetBuild, rand: () => number): void {
  const t = layout.walls.find((w) => w.kind === 'tree')!;
  const tx = (t.minX + t.maxX) / 2, tz = (t.minZ + t.maxZ) / 2;
  // planter
  k.solid.box(tx, 0.3, tz, 2.4, 0.6, 2.4, '#8c8577');
  k.solid.box(tx, 0.62, tz, 2.5, 0.06, 2.5, '#b9b1a1');
  k.solid.add(CYL, new THREE.Matrix4().compose(new THREE.Vector3(tx, 0.9, tz), new THREE.Quaternion(), new THREE.Vector3(0.18, 0.8, 0.18)), '#5a3b26');
  const tiers = [[1.65, 2.1, 1.9], [1.35, 1.8, 3.2], [1.05, 1.6, 4.4], [0.7, 1.3, 5.4]] as const;
  for (const [r, h, y] of tiers) k.solid.add(CONE, new THREE.Matrix4().compose(new THREE.Vector3(tx, y, tz), new THREE.Quaternion(), new THREE.Vector3(r, h, r)), '#1f5a33');
  // spiral of bulbs
  for (let i = 0; i < 150; i++) {
    const f = i / 150, y = 1.1 + f * 5.0, rr = 1.7 * (1 - f) + 0.15;
    const a = f * Math.PI * 2 * 6.5;
    k.bulbs.add(tx + Math.cos(a) * rr, y, tz + Math.sin(a) * rr, BULB[i % BULB.length], 0.2);
  }
  // ornaments
  for (let i = 0; i < 26; i++) {
    const f = rand() * 0.85, y = 1.2 + f * 4.6, rr = 1.6 * (1 - f) + 0.2, a = rand() * Math.PI * 2;
    k.solid.add(SPHERE, new THREE.Matrix4().compose(new THREE.Vector3(tx + Math.cos(a) * rr, y, tz + Math.sin(a) * rr), new THREE.Quaternion(), new THREE.Vector3(0.11, 0.11, 0.11)), ['#c9302c', '#e8b923', '#2f6fb3', '#c0c0c0'][i % 4]);
  }
  const top = new THREE.Vector3(tx, 6.55, tz);
  k.glow.add(starGeometry(0.5, 0.1), new THREE.Matrix4().compose(top, new THREE.Quaternion(), new THREE.Vector3(1, 1, 1)), '#ffe066');
  k.halos.add(top.x, top.y, top.z, '#ffd84a', 4.5);
  k.pools.push({ x: tx, z: tz, r: 5, color: '#ffcf70' });
  // Strands from the tree top fanning out over the plaza to the nearest houses.
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + 0.2;
    const hit = rayToHouse(tx, tz, Math.cos(a), Math.sin(a), 24);
    if (!hit || hit.d < 4) continue;
    strand(k, top.clone().add(new THREE.Vector3(0, -0.4, 0)), new THREE.Vector3(hit.x, 5.4, hit.z), 0.9, rand, { parols: hit.d > 10 ? 1 : 0 });
  }
  // A ring of paving around the plaza.
  for (let i = 0; i < 48; i++) {
    const a = (i / 48) * Math.PI * 2;
    k.solid.box(Math.cos(a) * 8, 0.012, Math.sin(a) * 8, 1.0, 0.02, 0.25, '#8d8678', -a);
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Street props on their collision boxes.

function props(k: StreetBuild, rand: () => number): void {
  for (const w of layout.walls) {
    const cx = (w.minX + w.maxX) / 2, cz = (w.minZ + w.maxZ) / 2, sx = w.maxX - w.minX, sz = w.maxZ - w.minZ;
    const along = sz > sx; // long side along Z
    const ry = along ? Math.PI / 2 : 0, L = Math.max(sx, sz), D = Math.min(sx, sz);
    switch (w.kind) {
      case 'shell': {
        // The block's boundary: a tall breeze-block wall with posts and a coping.
        k.solid.box(cx, 1.6, cz, sx, 3.2, sz, '#6e6a63');
        k.solid.box(cx, 3.25, cz, sx + 0.1, 0.12, sz + 0.1, '#8a857c');
        break;
      }
      case 'barrier': {
        // Concrete jersey barrier with a yellow stripe.
        k.solid.box(cx, 0.22, cz, L, 0.44, D, '#a8a49b', ry);
        k.solid.box(cx, 0.62, cz, L, 0.4, D * 0.55, '#b3afa5', ry);
        k.solid.box(cx, 0.86, cz, L + 0.01, 0.08, D * 0.56, '#e2b229', ry);
        break;
      }
      case 'crate': {
        if (w.id.includes('DRUMS')) {
          for (const [ox, oz] of [[-0.35, -0.35], [0.35, -0.35], [0, 0.35]]) {
            k.solid.add(CYL, new THREE.Matrix4().compose(new THREE.Vector3(cx + ox, 0.45, cz + oz), new THREE.Quaternion(), new THREE.Vector3(0.3, 0.9, 0.3)), ['#2f6fb3', '#c9302c', '#2f6fb3'][Math.floor(rand() * 3)]);
          }
          break;
        }
        // Stacked wooden crates on a pallet.
        k.solid.box(cx, 0.07, cz, sx, 0.14, sz, '#7a5a3a');
        const n = sx > 1.7 ? 2 : 1;
        const c = sx / n;
        for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
          const x = w.minX + c * (i + 0.5), z = w.minZ + c * (j + 0.5), hgt = 0.65 + rand() * 0.15;
          crate(k, x, 0.14 + hgt / 2, z, c - 0.08, hgt);
          if ((i + j) % 2 === 0) crate(k, x, 0.14 + hgt + 0.3, z, c * 0.75, 0.6, rand() * 0.6);
        }
        break;
      }
      case 'jeepney': jeepney(k, cx, cz, along); break;
      case 'tricycle': tricycle(k, cx, cz, along); break;
      case 'kiosk': stall(k, cx, cz, sx, sz, '#2f7f6f', '#f2e6c9', rand, true); break;
      case 'stall': stall(k, cx, cz, sx, sz, '#c43b3b', '#ffffff', rand, false); break;
      case 'cart': {
        // Food cart: box on wheels with a striped umbrella.
        k.solid.box(cx, 0.55, cz, L * 0.9, 0.7, D * 1.0, '#8a5a3a', ry);
        k.solid.box(cx, 0.92, cz, L * 0.92, 0.05, D * 1.05, '#d9cfb8', ry);
        for (const s of [-1, 1]) k.solid.add(CYL, new THREE.Matrix4().compose(new THREE.Vector3(cx + (along ? 0 : s * L * 0.3), 0.2, cz + (along ? s * L * 0.3 : 0)), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, Math.PI / 2)), new THREE.Vector3(0.2, 0.08, 0.2)), '#222');
        k.solid.add(CYL, new THREE.Matrix4().compose(new THREE.Vector3(cx, 1.5, cz), new THREE.Quaternion(), new THREE.Vector3(0.03, 1.2, 0.03)), '#ddd');
        for (let i = 0; i < 8; i++) k.solid.add(CONE, new THREE.Matrix4().compose(new THREE.Vector3(cx, 2.15, cz), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, (i * Math.PI) / 4, 0)), new THREE.Vector3(1.2, 0.35, 1.2)), i % 2 ? '#e8e2d0' : '#d9a531');
        k.glow.box(cx, 1.05, cz, L * 0.5, 0.12, 0.05, '#ffd27a', ry);
        k.pools.push({ x: cx, z: cz, r: 2.6, color: '#ffc46a' });
        break;
      }
      case 'planter': {
        k.solid.box(cx, 0.35, cz, sx, 0.7, sz, '#8c8577');
        k.solid.box(cx, 0.72, cz, sx + 0.08, 0.06, sz + 0.08, '#b9b1a1');
        const n = Math.max(2, Math.round(L / 0.6));
        for (let i = 0; i < n; i++) {
          const t = -L / 2 + (L / n) * (i + 0.5);
          const r = 0.3 + rand() * 0.15;
          k.solid.add(SPHERE, new THREE.Matrix4().compose(new THREE.Vector3(cx + (along ? 0 : t), 0.85 + r * 0.5, cz + (along ? t : 0)), new THREE.Quaternion(), new THREE.Vector3(r, r * 1.2, r)), ['#3f7a3a', '#4f8a40', '#2f6a35'][i % 3]);
        }
        break;
      }
      case 'bench': {
        k.solid.box(cx, 0.42, cz, L, 0.06, D, '#7a5a3f', ry);
        k.solid.box(cx + (along ? 0.2 : 0), 0.7, cz + (along ? 0 : 0.2), along ? 0.06 : L, 0.36, along ? L : 0.06, '#7a5a3f');
        for (const s of [-0.42, 0.42]) k.solid.box(cx + (along ? 0 : s * L), 0.2, cz + (along ? s * L : 0), 0.08, 0.4, 0.08, '#333', ry);
        break;
      }
      default: break;
    }
  }
}

function crate(k: StreetBuild, x: number, y: number, z: number, s: number, h: number, ry = 0): void {
  k.solid.box(x, y, z, s, h, s, '#9a7348', ry);
  // darker slats on four sides
  for (const t of [-0.3, 0.3]) {
    k.solid.box(x, y + t * h, z, s + 0.02, 0.07, s + 0.02, '#6f5032', ry);
  }
}

function jeepney(k: StreetBuild, cx: number, cz: number, along: boolean): void {
  // Built along +Z (6 m long, 2.2 m wide), then turned to the box's long axis. The bonnet points north (-Z).
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, along ? 0 : Math.PI / 2, 0));
  const P = (x: number, z: number) => new THREE.Vector3(x, 0, z).applyQuaternion(q).add(new THREE.Vector3(cx, 0, cz));
  const box = (x: number, y: number, z: number, sx: number, sy: number, sz: number, c: string) => { const p = P(x, z); k.solid.box(p.x, y, p.z, sx, sy, sz, c, along ? 0 : Math.PI / 2); };
  const glow = (x: number, y: number, z: number, sx: number, sy: number, sz: number, c: string) => { const p = P(x, z); k.glow.box(p.x, y, p.z, sx, sy, sz, c, along ? 0 : Math.PI / 2); };
  box(0, 0.75, 0.6, 2.1, 0.7, 4.6, '#c4473a');            // lower body (rear cabin)
  box(0, 1.6, 0.6, 2.05, 1.0, 4.6, '#d8d2c0');            // window band
  box(0, 2.18, 0.6, 2.25, 0.14, 4.9, '#b9b9b9');          // roof
  box(0, 2.3, 0.6, 2.0, 0.1, 4.4, '#2e5d9a');             // roof rack
  for (const s of [-1, 1]) {
    box(s * 1.04, 1.6, 0.6, 0.04, 0.55, 4.3, '#2a2f3a');  // side windows
    box(s * 1.06, 0.95, 0.6, 0.03, 0.12, 4.6, '#e8b923'); // yellow stripe
    box(s * 1.06, 0.78, 0.6, 0.03, 0.1, 4.6, '#2e5d9a');  // blue stripe
  }
  box(0, 0.9, -2.3, 1.8, 0.9, 1.4, '#c0c4c8');            // chrome bonnet
  box(0, 1.45, -1.62, 1.9, 0.75, 0.06, '#2a2f3a');        // windscreen
  box(0, 0.75, -3.02, 1.6, 0.6, 0.06, '#d9dde0');         // grille
  glow(-0.6, 0.85, -3.06, 0.3, 0.22, 0.04, '#fff3c9'); glow(0.6, 0.85, -3.06, 0.3, 0.22, 0.04, '#fff3c9'); // headlights
  glow(0, 1.95, 2.92, 1.6, 0.18, 0.04, '#ff6b6b');        // rear sign
  for (const [x, z] of [[-1, -2.2], [1, -2.2], [-1, 2.0], [1, 2.0]]) {
    const p = P(x, z);
    k.solid.add(CYL, new THREE.Matrix4().compose(new THREE.Vector3(p.x, 0.38, p.z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, along ? 0 : Math.PI / 2, Math.PI / 2)), new THREE.Vector3(0.38, 0.26, 0.38)), '#1b1b1d');
  }
  // the little chrome horse on the bonnet
  box(0, 1.45, -2.9, 0.08, 0.25, 0.28, '#e8e8e8');
}

function tricycle(k: StreetBuild, cx: number, cz: number, along: boolean): void {
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, along ? 0 : Math.PI / 2, 0));
  const P = (x: number, z: number) => new THREE.Vector3(x, 0, z).applyQuaternion(q).add(new THREE.Vector3(cx, 0, cz));
  const r = along ? 0 : Math.PI / 2;
  const box = (x: number, y: number, z: number, sx: number, sy: number, sz: number, c: string) => { const p = P(x, z); k.solid.box(p.x, y, p.z, sx, sy, sz, c, r); };
  // sidecar cab (left) + motorbike (right), 1.6 x 2.6
  box(-0.25, 0.75, 0.1, 1.0, 0.9, 1.9, '#3b7d5c');
  box(-0.25, 1.45, 0.1, 1.05, 0.5, 1.95, '#d8d2c0');
  box(-0.25, 1.78, 0.1, 1.25, 0.08, 2.3, '#2e5d9a');
  box(0.55, 0.65, 0.0, 0.25, 0.4, 1.6, '#c4473a');
  box(0.55, 1.05, -0.65, 0.5, 0.06, 0.06, '#333');
  for (const [x, z] of [[0.55, -0.9], [0.55, 0.9], [-0.55, 0.8]]) {
    const p = P(x, z);
    k.solid.add(CYL, new THREE.Matrix4().compose(new THREE.Vector3(p.x, 0.3, p.z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, r, Math.PI / 2)), new THREE.Vector3(0.3, 0.12, 0.3)), '#1b1b1d');
  }
  const h = P(0.55, -1.0); k.glow.box(h.x, 0.9, h.z, 0.16, 0.14, 0.04, '#fff3c9', r);
}

function stall(k: StreetBuild, cx: number, cz: number, sx: number, sz: number, a: string, b: string, rand: () => number, sariSari: boolean): void {
  // Small store: walls, a lit counter opening, striped tin awning, sign, crates of bottles.
  k.solid.box(cx, 1.0, cz, sx, 2.0, sz, sariSari ? '#c9b48d' : '#b7a58a');
  k.solid.box(cx, 2.15, cz, sx + 0.1, 0.3, sz + 0.1, '#5f5a57');
  // Four sides: a lit shelf window on each (it is seen from every street).
  for (const [nx, nz] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
    const w = nx ? sz : sx;
    k.glow.box(cx + nx * (sx / 2 + 0.02), 1.15, cz + nz * (sz / 2 + 0.02), nx ? 0.04 : w * 0.75, 0.7, nx ? w * 0.75 : 0.04, sariSari ? '#ffe2a6' : '#ffd0a0');
    k.solid.box(cx + nx * (sx / 2 + 0.12), 0.8, cz + nz * (sz / 2 + 0.12), nx ? 0.24 : w * 0.8, 0.06, nx ? w * 0.8 : 0.24, '#7a5a3f');
    // striped awning
    for (let i = 0; i < 5; i++) {
      const t = -0.4 + i * 0.2;
      k.solid.box(cx + nx * (sx / 2 + 0.35) + (nx ? 0 : t * w), 1.75, cz + nz * (sz / 2 + 0.35) + (nx ? t * w : 0), nx ? 0.7 : w * 0.2, 0.05, nx ? w * 0.2 : 0.7, i % 2 ? a : b, 0, nx ? 0 : 0.3 * -nz, nx ? 0.3 * nx : 0);
    }
  }
  k.glow.box(cx, 2.55, cz, sx * 0.8, 0.35, 0.06, sariSari ? '#ffd84a' : '#ff8a5a');
  k.glow.box(cx, 2.55, cz, 0.06, 0.35, sz * 0.8, sariSari ? '#ffd84a' : '#ff8a5a');
  // a parol on the corner
  k.glow.add(SMALL_STAR, new THREE.Matrix4().compose(new THREE.Vector3(cx + sx / 2, 2.2, cz + sz / 2), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI / 4, 0)), new THREE.Vector3(1.2, 1.2, 1.2)), PAROL[Math.floor(rand() * PAROL.length)]);
  k.halos.add(cx + sx / 2, 2.2, cz + sz / 2, '#ffcc66', 1.8);
  k.pools.push({ x: cx, z: cz, r: 3, color: '#ffc46a' });
}

// ---------------------------------------------------------------------------------------------------------------
// Base surroundings: two posts behind each base carrying a swag of team-coloured fabric with lights (concept art),
// pen posts and rails, kerbs and road paint.

function bases(k: StreetBuild): void {
  for (const s of TEAM_SLOTS) {
    const b = layout.bases[s];
    const l = Math.hypot(b.x, b.z), ox = b.x / l, oz = b.z / l; // outward
    const px = -oz, pz = ox; // across
    // An entrance arch on the plaza side of the base: posts either side of the street, the swag high above heads
    // (and above the camera line), so it frames the base without blocking the view.
    const back = -5, half = 6.5, top = 6.0;
    const p1 = new THREE.Vector3(b.x + ox * back + px * half, 0, b.z + oz * back + pz * half);
    const p2 = new THREE.Vector3(b.x + ox * back - px * half, 0, b.z + oz * back - pz * half);
    const team = TEAMS.colors[s];
    for (const p of [p1, p2]) {
      if (insideSolid(p.x, p.z)) continue;
      k.solid.box(p.x, top / 2, p.z, 0.4, top, 0.4, '#d9d2c2');
      k.solid.box(p.x, top + 0.1, p.z, 0.55, 0.2, 0.55, '#efe8da');
      k.glow.box(p.x, top + 0.35, p.z, 0.3, 0.3, 0.3, team);
      k.halos.add(p.x, top + 0.35, p.z, team, 1.8);
    }
    // fabric swag: a sagging ribbon of quads
    const n = 16, sag = 0.6;
    const col = new THREE.Color(team);
    for (let i = 0; i < n; i++) {
      const t0 = i / n, t1 = (i + 1) / n;
      const a = new THREE.Vector3().lerpVectors(p1, p2, t0), c = new THREE.Vector3().lerpVectors(p1, p2, t1);
      const y0 = top - 0.1 - sag * 4 * t0 * (1 - t0), y1 = top - 0.1 - sag * 4 * t1 * (1 - t1);
      const mx = (a.x + c.x) / 2, mz = (a.z + c.z) / 2, my = (y0 + y1) / 2;
      const seg = Math.hypot(c.x - a.x, y1 - y0, c.z - a.z);
      const ry = Math.atan2(-(c.z - a.z), c.x - a.x);
      k.solid.box(mx, my - 0.16, mz, seg + 0.02, 0.34, 0.04, col, ry, 0, Math.atan2(y1 - y0, Math.hypot(c.x - a.x, c.z - a.z)));
      k.bulbs.add(mx, my + 0.05, mz, '#fff1cf', 0.16);
    }
    k.pools.push({ x: b.x, z: b.z, r: 6, color: team });
  }
  // Pen fences: posts every ~1.6 m and a top rail (the see-through mesh is drawn separately).
  for (const w of layout.walls) {
    if (w.kind !== 'fence') continue;
    const slot = w.id.split('_')[2] as TeamSlot;
    const sx = w.maxX - w.minX, sz = w.maxZ - w.minZ, L = Math.max(sx, sz), alongX = sx > sz;
    const n = Math.max(1, Math.round(L / 1.6));
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const x = alongX ? w.minX + sx * t : (w.minX + w.maxX) / 2, z = alongX ? (w.minZ + w.maxZ) / 2 : w.minZ + sz * t;
      k.solid.box(x, 0.8, z, 0.09, 1.6, 0.09, i === 0 || i === n ? TEAMS.colors[slot] : '#9aa0a6');
    }
    k.solid.box((w.minX + w.maxX) / 2, 1.6, (w.minZ + w.maxZ) / 2, alongX ? sx : 0.07, 0.06, alongX ? 0.07 : sz, '#b0b5ba');
  }
}

function roadPaint(k: StreetBuild): void {
  // Dashed centre lines along the three main streets, kept off the bases and the plaza.
  for (const r of layout.routes) {
    for (let s = 0; s < r.points.length - 1; s++) {
      const [x0, z0] = r.points[s], [x1, z1] = r.points[s + 1];
      const len = Math.hypot(x1 - x0, z1 - z0), ux = (x1 - x0) / len, uz = (z1 - z0) / len, ry = Math.atan2(-uz, ux);
      for (let d = 0.5; d < len; d += 3) {
        const x = x0 + ux * (d + 0.75), z = z0 + uz * (d + 0.75);
        if (TEAM_SLOTS.some((t) => Math.hypot(x - layout.bases[t].x, z - layout.bases[t].z) < 8) || insideSolid(x, z, 0.3) || Math.hypot(x, z) < 9) continue;
        k.solid.box(x, 0.012, z, 1.5, 0.02, 0.14, '#cfcabd', ry);
      }
    }
  }
  // Kerbs: a pale concrete strip around every house block.
  for (const w of layout.walls) {
    if (w.kind !== 'house') continue;
    const e = 0.9;
    const cx = (w.minX + w.maxX) / 2, cz = (w.minZ + w.maxZ) / 2, sx = w.maxX - w.minX, sz = w.maxZ - w.minZ;
    k.solid.box(cx, 0.02, cz, sx + e * 2, 0.04, sz + e * 2, '#55524d');
    // kerb edge line
    k.solid.box(cx, 0.03, w.minZ - e, sx + e * 2, 0.06, 0.12, '#8d8879');
    k.solid.box(cx, 0.03, w.maxZ + e, sx + e * 2, 0.06, 0.12, '#8d8879');
    k.solid.box(w.minX - e, 0.03, cz, 0.12, 0.06, sz + e * 2, '#8d8879');
    k.solid.box(w.maxX + e, 0.03, cz, 0.12, 0.06, sz + e * 2, '#8d8879');
  }
}

/** Dark silhouettes beyond the walls (houses and tree canopies) so the block sits in a neighbourhood. */
function skyline(k: StreetBuild, rand: () => number): void {
  for (let i = 0; i < 70; i++) {
    const a = (i / 70) * Math.PI * 2 + rand() * 0.05;
    const r = 66 + rand() * 22;
    const x = Math.cos(a) * r * 1.1, z = Math.sin(a) * r;
    if (rand() < 0.55) {
      const w = 6 + rand() * 8, h = 4 + rand() * 7;
      k.solid.box(x, h / 2, z, w, h, 6 + rand() * 4, '#1c1a24', -a);
      if (rand() < 0.6) k.glow.box(x - Math.cos(a) * 3.1, h * 0.55, z - Math.sin(a) * 3.1, 1.0, 0.8, 1.0, rand() < 0.5 ? '#ffcf7a' : '#ffb86b');
    } else {
      const s = 4 + rand() * 5;
      k.solid.add(SPHERE, new THREE.Matrix4().compose(new THREE.Vector3(x, 5 + s * 0.6, z), new THREE.Quaternion(), new THREE.Vector3(s, s * 0.8, s)), '#141a1a');
      k.solid.box(x, 2.5, z, 0.6, 5, 0.6, '#1a1612');
    }
    if (rand() < 0.35) k.halos.add(x, 9 + rand() * 4, z, PAROL[Math.floor(rand() * PAROL.length)], 2.5);
  }
}

/** Builds everything once (deterministic). */
export function buildStreet(opts: { skyline: boolean }): StreetBuild {
  const rand = rng(0x5ea50202);
  const k: StreetBuild = { solid: new Kit(), glow: new Kit(), bulbs: new Dots(), halos: new Dots(), wires: [], pools: [] };
  houses(k, rand);
  props(k, rand);
  bases(k);
  roadPaint(k);
  plaza(k, rand);
  overhead(k, rand);
  if (opts.skyline) skyline(k, rand);
  return k;
}
