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
import art from '../../../../../blender/exports/stage02/STAGE_02_ART.json';

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

  private built: THREE.BufferGeometry | null = null;

  /**
   * Merges the parts once and returns the same geometry on every later call. The street build is cached across
   * scene mounts, so a second mount (switching from Stage 01 to Stage 02) must get the full street back, not an
   * empty merge. Disposing the result on unmount only frees its GPU buffers; three.js uploads it again when the
   * mesh renders next time.
   */
  build(): THREE.BufferGeometry {
    if (this.built) return this.built;
    const g = this.parts.length ? mergeGeometries(this.parts, false)! : new THREE.BufferGeometry();
    for (const p of this.parts) p.dispose();
    this.parts = [];
    g.computeBoundingSphere();
    this.built = g;
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

export type AtlasCell = keyof typeof art.atlas.cells;
const CELLS = art.atlas.cells as Record<AtlasCell, number[]>;

/**
 * Textured quads that all sample ONE atlas (blender/exports/stage02/T02_StreetAtlas.webp, decision 050): capiz windows,
 * grilles, doors, tin roofs, plaster, signs, gift wrap, chalk. Low-poly boxes keep their vertex colour; the detail
 * comes from these quads laid a centimetre in front. Two of these collectors make two draw calls (lit by the scene,
 * and self-lit for windows and signs).
 */
export class Decals {
  private pos: number[] = [];
  private nor: number[] = [];
  private uv: number[] = [];
  private col: number[] = [];
  private m = new THREE.Matrix4();
  private nm = new THREE.Matrix3();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private v = new THREE.Vector3();
  private s = new THREE.Vector3();
  private c = new THREE.Color();
  count = 0;

  /** A unit quad in the XY plane facing +Z, transformed by m. */
  add(m: THREE.Matrix4, cell: AtlasCell, color: THREE.ColorRepresentation = '#ffffff'): this {
    const [u0, v0, u1, v1] = CELLS[cell];
    this.nm.getNormalMatrix(m);
    const n = new THREE.Vector3(0, 0, 1).applyMatrix3(this.nm).normalize();
    this.c.set(color);
    for (const [x, y, u, v] of [[-0.5, -0.5, u0, v0], [0.5, -0.5, u1, v0], [0.5, 0.5, u1, v1], [-0.5, -0.5, u0, v0], [0.5, 0.5, u1, v1], [-0.5, 0.5, u0, v1]]) {
      const p = this.v.set(x, y, 0).applyMatrix4(m);
      this.pos.push(p.x, p.y, p.z); this.nor.push(n.x, n.y, n.z); this.uv.push(u, v); this.col.push(this.c.r, this.c.g, this.c.b);
    }
    this.count++;
    return this;
  }

  /** Upright quad centred at (x, y, z), w wide and h tall, facing yaw ry (0 faces +Z, PI/2 faces +X). */
  face(x: number, y: number, z: number, w: number, h: number, ry: number, cell: AtlasCell, color: THREE.ColorRepresentation = '#ffffff'): this {
    this.e.set(0, ry, 0);
    return this.add(this.m.compose(this.v.set(x, y, z), this.q.setFromEuler(this.e), this.s.set(w, h, 1)).clone(), cell, color);
  }

  /** Flat quad on the ground (w along X, d along Z before the turn ry); the cell's top points north (-Z). */
  ground(x: number, z: number, w: number, d: number, ry: number, cell: AtlasCell, y = 0.016, color: THREE.ColorRepresentation = '#ffffff'): this {
    this.e.set(-Math.PI / 2, ry, 0, 'YXZ');
    const m = this.m.compose(this.v.set(x, y, z), this.q.setFromEuler(this.e), this.s.set(w, d, 1)).clone();
    this.e.set(0, 0, 0, 'XYZ');
    return this.add(m, cell, color);
  }

  /** The top face of a box placed like Kit.box (same centre, size and turn), lifted just above it. */
  top(x: number, y: number, z: number, sx: number, sy: number, sz: number, cell: AtlasCell, color: THREE.ColorRepresentation = '#ffffff', ry = 0, rx = 0, rz = 0): this {
    this.e.set(rx, ry, rz);
    const m = new THREE.Matrix4().compose(this.v.set(x, y, z), this.q.setFromEuler(this.e), this.s.set(1, 1, 1));
    m.multiply(new THREE.Matrix4().makeTranslation(0, sy / 2 + 0.012, 0)).multiply(new THREE.Matrix4().makeRotationX(-Math.PI / 2)).multiply(new THREE.Matrix4().makeScale(sx, sz, 1));
    return this.add(m, cell, color);
  }

  /** The four sides (and optionally the top) of an upright box turned by ry. */
  skin(x: number, y: number, z: number, sx: number, sy: number, sz: number, ry: number, cell: AtlasCell, topCell?: AtlasCell, color: THREE.ColorRepresentation = '#ffffff'): this {
    const c = Math.cos(ry), s = Math.sin(ry), o = 0.012;
    // local +Z face, -Z, +X, -X
    for (const [lx, lz, w, a] of [[0, sz / 2 + o, sx, 0], [0, -sz / 2 - o, sx, Math.PI], [sx / 2 + o, 0, sz, Math.PI / 2], [-sx / 2 - o, 0, sz, -Math.PI / 2]] as const) {
      this.face(x + lx * c + lz * s, y, z - lx * s + lz * c, w, sy, ry + a, cell, color);
    }
    if (topCell) this.top(x, y, z, sx, sy, sz, topCell, color, ry);
    return this;
  }

  private built: THREE.BufferGeometry | null = null;
  /** Same caching rule as Kit.build(): later mounts get the same full geometry back. */
  build(): THREE.BufferGeometry {
    if (this.built) return this.built;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.computeBoundingSphere();
    this.built = g;
    return g;
  }
}

// ---- palettes (muted for night: the warm light comes from windows, parols and bulbs)
const WALLS = ['#e8c46a', '#8fd1a8', '#f0a3a3', '#9cc7e8', '#f3e3c3', '#e59a5c', '#c9a6e0', '#a8d672', '#f2d0a4', '#7fc4c0']; // PH house colours: bright pastels
const TRIM = ['#f1ebe0', '#8f6e52', '#5d6f7a', '#a24f3c', '#ece3cf'];
const ROOFS = ['#7d3b2c', '#3d5a60', '#5f5a57', '#8a4b2a', '#4a4f6b', '#6b6f73'];
const WINDOW_WARM = ['#ffd27a', '#ffc35e', '#ffe2a6', '#ffb86b', '#fff0c8'];
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

export interface StreetBuild { solid: Kit; glow: Kit; decals: Decals; lit: Decals; bulbs: Dots; halos: Dots; wires: number[]; pools: { x: number; z: number; r: number; color: string }[] }

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
      if (alongX) {
        k.solid.box(cx, h + rise / 2, cz + off, run + 0.8, 0.08, half / Math.cos(pitch), u.roof, 0, pitch * side);
        k.decals.top(cx, h + rise / 2, cz + off, run + 0.8, 0.08, half / Math.cos(pitch), 'tin', u.roof, 0, pitch * side);
      } else {
        k.solid.box(cx + off, h + rise / 2, cz, half / Math.cos(pitch), 0.08, run + 0.8, u.roof, 0, 0, -pitch * side);
        k.decals.top(cx + off, h + rise / 2, cz, half / Math.cos(pitch), 0.08, run + 0.8, 'tin', u.roof, 0, 0, -pitch * side);
      }
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
    // Plaster (or bare hollow blocks) over the low-poly walls: stains, cracks and rain streaks from the atlas.
    { const [x, , z] = at(0, 0, 0.012); k.decals.face(x, g1 / 2, z, F.len, g1, F.ry, rand() < 0.25 ? 'blocks' : 'plaster', u.wall); }
    { const [x, , z] = at(0, 0, 0.002); k.decals.face(x, g1 + (h - g1) / 2, z, F.len - 0.02, h - g1, F.ry, 'plaster', upper); }
    const n = Math.max(1, Math.floor((F.len - 1) / 2.3));
    // A few ground floors hang a big parol in front of a window, or are a closed shop.
    const shop = F.len > 5 ? rand() : 1;
    const tarpAt = F.len > 4.5 && h > 4.3 && rand() < 0.12 ? Math.floor(n / 2) : -1;
    const doorAt = !doorDone && F.len > 3.5 ? Math.floor(rand() * n) : -1;
    for (let i = 0; i < n; i++) {
      const t = -F.len / 2 + (F.len / n) * (i + 0.5);
      if (i === doorAt) {
        doorDone = true;
        const [x, , z] = at(t, 0, 0.04);
        k.solid.box(x, 1.05, z, F.tx ? 1.0 : 0.08, 2.1, F.tz ? 1.0 : 0.08, '#4a3020');
        const [dx, , dz] = at(t, 0, 0.085);
        if (shop < 0.1) k.decals.face(dx, 1.05, dz, 1.0, 2.1, F.ry, 'shutter');
        else k.decals.face(dx, 1.05, dz, 1.0, 2.1, F.ry, 'door', '#e8ddd0');
        const [lx, , lz] = at(t, 0, 0.06);
        k.lit.face(lx, 2.27, lz, 0.95, 0.26, F.ry, 'transom'); // transom light
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
        if (shop > 0.1 && shop < 0.3 && i === (doorAt + 1) % n) {
          // a lit window with one big parol hanging in front of it (owner, 27 Nov 2026: no walls of stars)
          k.lit.face(x, 1.55, z, 1.0, 0.95, F.ry, 'curtain');
          const [hx, , hz] = at(t, 0, 0.45);
          parol(k, hx, 2.35, hz, F.ry, PAROL[Math.floor(rand() * PAROL.length)], 0.75, rand);
          k.pools.push({ x: hx, z: hz, r: 2.6, color: '#ffb36a' });
        } else if (lit) k.lit.face(x, 1.55, z, 1.0, 0.95, F.ry, rand() < 0.2 ? 'curtain' : 'capiz', WINDOW_WARM[Math.floor(rand() * WINDOW_WARM.length)]);
        else k.decals.face(x, 1.55, z, 1.0, 0.95, F.ry, 'grille');
        k.solid.box(x + nx * 0.03, 1.02, z + nz * 0.03, F.tx ? 1.2 : 0.12, 0.08, F.tz ? 1.2 : 0.12, u.trim); // sill
      }
      if (h > 4.3) {
        const lit = rand() < 0.55;
        const [x, , z] = at(t, 0, 0.03);
        const wy = g1 + (h - g1) * 0.5;
        if (i === tarpAt) k.decals.face(x, wy, z, 1.9, 1.3, F.ry, 'tarp'); // a barangay greeting tarpaulin
        else if (lit) k.lit.face(x, wy, z, 1.0, 0.9, F.ry, rand() < 0.3 ? 'capizParol' : 'capiz', WINDOW_WARM[Math.floor(rand() * WINDOW_WARM.length)]);
        else k.decals.face(x, wy, z, 1.0, 0.9, F.ry, 'grille');
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
        strand(k, a, b, 0.5, rand, { palette: ['#fff4d6', '#ffd27a'], parols: rand() < 0.5 ? 1 : 0 });
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
  for (let i = 0; i < 260; i++) {
    const f = i / 260, y = 1.1 + f * 5.0, rr = 1.7 * (1 - f) + 0.15;
    const a = f * Math.PI * 2 * 9.5;
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
  // little parols hung on the tree's tiers (decision 050: more lights)
  for (let i = 0; i < 14; i++) {
    const f = 0.1 + (i / 14) * 0.75, y = 1.3 + f * 4.4, rr = 1.75 * (1 - f) + 0.25, a = i * 2.4;
    const col = PAROL[i % PAROL.length];
    k.glow.add(SMALL_STAR, new THREE.Matrix4().compose(new THREE.Vector3(tx + Math.cos(a) * rr, y, tz + Math.sin(a) * rr), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -a + Math.PI / 2, 0)), new THREE.Vector3(0.7, 0.7, 0.7)), col);
    k.halos.add(tx + Math.cos(a) * rr, y, tz + Math.sin(a) * rr, col, 1.1);
  }
  // presents under the tree
  for (let i = 0; i < 7; i++) {
    const a = i * 0.9 + 0.3, s = 0.35 + rand() * 0.25, h = 0.3 + rand() * 0.25;
    present(k, tx + Math.cos(a) * 1.55, 0.6 + h / 2 + 0.02, tz + Math.sin(a) * 1.55, s, h, rand(), rand);
  }
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
        k.solid.box(cx, 1.6, cz, sx, 3.2, sz, '#c9bfa8'); // painted cream, like a barangay perimeter wall
        k.solid.box(cx, 3.25, cz, sx + 0.1, 0.12, sz + 0.1, '#8a857c');
        // Christmas lights along the top of the wall and a parol every 12 m, so the block's edge is lit and lively
        // instead of a dark band (owner, 27 Nov 2026).
        const inX = cx < 0 ? 1 : -1, inZ = cz < 0 ? 1 : -1;
        const ox = along ? (sx / 2 + 0.08) * inX : 0, oz = along ? 0 : (sz / 2 + 0.08) * inZ;
        const span = Math.min(L, along ? B.maxZ - B.minZ : B.maxX - B.minX);
        const nb = Math.floor(span / 0.5), loops = Math.round(span / 3);
        for (let i = 0; i <= nb; i++) {
          const t = -span / 2 + (span * i) / nb, sag = 0.28 * Math.abs(Math.sin((i / nb) * Math.PI * loops));
          if (insideSolid(cx + ox * 2 + (along ? 0 : t), cz + oz * 2 + (along ? t : 0))) continue; // behind a house
          k.bulbs.add(cx + ox + (along ? 0 : t), 3.12 - sag, cz + oz + (along ? t : 0), BULB[i % BULB.length], 0.16);
        }
        for (let t = -span / 2 + 4; t < span / 2 - 2; t += 8) {
          const col = PAROL[Math.floor(rand() * PAROL.length)];
          if (insideSolid(cx + ox * 8 + (along ? 0 : t), cz + oz * 8 + (along ? t : 0))) continue;
          parol(k, cx + ox * 1.6 + (along ? 0 : t), 2.6, cz + oz * 1.6 + (along ? t : 0), along ? Math.PI / 2 * inX : (inZ > 0 ? 0 : Math.PI), col, 0.8, rand);
          k.pools.push({ x: cx + ox * 8 + (along ? 0 : t), z: cz + oz * 8 + (along ? t : 0), r: 2.4, color: '#ffc27a' });
        }
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
      case 'gifts': gifts(k, cx, cz, sx, sz, rand); break;
      case 'garden': garden(k, w, rand); break;
      case 'swing': swing(k, cx, cz, sx, sz); break;
      case 'slide': slide(k, w); break;
      case 'seesaw': seesaw(k, cx, cz, sx); break;
      case 'hoop': hoop(k, cx, cz); break;
      default: break;
    }
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Base decor (decision 050): every base looks different and less open. Each piece fills its collision box.

const WRAPS: AtlasCell[] = ['wrapA', 'wrapB', 'wrapC', 'wrapD'];

/** A pile of wrapped Christmas presents with bows (a few smaller ones stacked on top). */
function gifts(k: StreetBuild, cx: number, cz: number, sx: number, sz: number, rand: () => number): void {
  const cols = sx > sz ? 3 : 2, rows = sx > sz ? 2 : 3;
  const cw = sx / cols, cd = sz / rows;
  const tops: [number, number, number, number][] = [];
  for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
    const s = Math.min(cw, cd) * (0.62 + rand() * 0.3), h = 0.45 + rand() * 0.45, ry = (rand() - 0.5) * 0.6;
    const x = cx - sx / 2 + cw * (i + 0.5) + (rand() - 0.5) * 0.1, z = cz - sz / 2 + cd * (j + 0.5) + (rand() - 0.5) * 0.1;
    present(k, x, h / 2, z, s, h, ry, rand);
    tops.push([x, z, h, s]);
  }
  for (let n = 0; n < 2; n++) {
    const [x, z, h, s] = tops[Math.floor(rand() * tops.length)];
    const s2 = s * 0.6, h2 = 0.3 + rand() * 0.2;
    present(k, x, h + h2 / 2 + 0.01, z, s2, h2, rand() * 1.5, rand);
    tops.push([x, z, h + h2, s2]);
  }
  // a little light string around the pile's foot
  for (let i = 0; i < 28; i++) {
    const a = (i / 28) * Math.PI * 2;
    k.bulbs.add(cx + Math.cos(a) * (sx / 2 + 0.1), 0.12, cz + Math.sin(a) * (sz / 2 + 0.1), BULB[i % BULB.length], 0.14);
  }
  k.pools.push({ x: cx, z: cz, r: 2.2, color: '#ffcf8a' });
}

function present(k: StreetBuild, x: number, y: number, z: number, s: number, h: number, ry: number, rand: () => number): void {
  const cell = WRAPS[Math.floor(rand() * WRAPS.length)];
  k.solid.box(x, y, z, s, h, s, '#c9302c', ry);
  k.decals.skin(x, y, z, s, h, s, ry, cell, cell === 'wrapA' ? 'giftTop' : cell);
  // bow: two loops on top
  for (const o of [-1, 1]) {
    k.solid.add(SPHERE, new THREE.Matrix4().compose(new THREE.Vector3(x + Math.cos(ry) * o * s * 0.12, y + h / 2 + 0.06, z - Math.sin(ry) * o * s * 0.12), new THREE.Quaternion(), new THREE.Vector3(s * 0.12, 0.06, s * 0.07)), '#f2c24e');
  }
}

/** A picket-fenced garden with a small lit Christmas tree and presents, lights along the fence. */
function garden(k: StreetBuild, w: AgawanWall, rand: () => number): void {
  const cx = (w.minX + w.maxX) / 2, cz = (w.minZ + w.maxZ) / 2, sx = w.maxX - w.minX, sz = w.maxZ - w.minZ;
  k.solid.box(cx, 0.06, cz, sx - 0.1, 0.12, sz - 0.1, '#3d5a33'); // grass bed
  const edge = (x0: number, z0: number, x1: number, z1: number) => {
    const L = Math.hypot(x1 - x0, z1 - z0), n = Math.max(2, Math.round(L / 0.3)), ry = Math.atan2(-(z1 - z0), x1 - x0);
    for (let i = 0; i <= n; i++) {
      const t = i / n, x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t;
      k.solid.box(x, 0.42, z, 0.09, 0.84, 0.05, '#ece6d6', ry);
      k.solid.add(CONE, new THREE.Matrix4().compose(new THREE.Vector3(x, 0.88, z), new THREE.Quaternion(), new THREE.Vector3(0.06, 0.1, 0.06)), '#ece6d6');
      if (i % 2 === 0) k.bulbs.add(x, 0.98, z, BULB[(i / 2) % BULB.length], 0.15);
    }
    for (const y of [0.3, 0.66]) k.solid.box((x0 + x1) / 2, y, (z0 + z1) / 2, L, 0.06, 0.04, '#d8d1c0', ry);
  };
  const x0 = w.minX + 0.05, x1 = w.maxX - 0.05, z0 = w.minZ + 0.05, z1 = w.maxZ - 0.05;
  edge(x0, z0, x1, z0); edge(x1, z0, x1, z1); edge(x1, z1, x0, z1); edge(x0, z1, x0, z0);
  // small tree
  const tx = cx + (rand() - 0.5) * 0.4, tz = cz + (rand() - 0.5) * 0.4;
  for (const [r, h, y] of [[0.75, 1.0, 0.75], [0.55, 0.85, 1.35], [0.32, 0.65, 1.85]] as const) k.solid.add(CONE, new THREE.Matrix4().compose(new THREE.Vector3(tx, y, tz), new THREE.Quaternion(), new THREE.Vector3(r, h, r)), '#225c36');
  for (let i = 0; i < 46; i++) {
    const f = i / 46, a = f * Math.PI * 2 * 4.5, rr = 0.75 * (1 - f) + 0.08;
    k.bulbs.add(tx + Math.cos(a) * rr, 0.35 + f * 1.8, tz + Math.sin(a) * rr, BULB[i % BULB.length], 0.15);
  }
  k.glow.add(SMALL_STAR, new THREE.Matrix4().compose(new THREE.Vector3(tx, 2.3, tz), new THREE.Quaternion(), new THREE.Vector3(0.8, 0.8, 0.8)), '#ffe066');
  k.halos.add(tx, 2.3, tz, '#ffd84a', 2);
  present(k, tx + 0.7, 0.32, tz + 0.5, 0.4, 0.36, 0.4, rand);
  present(k, tx - 0.6, 0.27, tz + 0.6, 0.34, 0.3, -0.3, rand);
  k.pools.push({ x: cx, z: cz, r: 2.6, color: '#ffd28a' });
}

/** Playground swing set: A-frame ends, a top bar with lights, two seats on chains. */
function swing(k: StreetBuild, cx: number, cz: number, sx: number, sz: number): void {
  const alongX = sx >= sz, L = Math.max(sx, sz) - 0.2, H = 2.2, ry = alongX ? 0 : Math.PI / 2;
  const P = (a: number, b: number) => (alongX ? [cx + a, cz + b] : [cx + b, cz + a]) as [number, number];
  for (const e of [-L / 2, L / 2]) for (const s of [-1, 1]) {
    const [x, z] = P(e, s * 0.45);
    k.solid.box(x, H / 2, z, 0.09, H + 0.1, 0.09, '#c43b3b', ry, alongX ? s * 0.38 : 0, alongX ? 0 : -s * 0.38);
  }
  { const [x, z] = P(0, 0); k.solid.box(x, H, z, alongX ? L : 0.1, 0.1, alongX ? 0.1 : L, '#e2b229'); }
  for (const t of [-L / 4, L / 4]) {
    for (const o of [-0.22, 0.22]) { const [x, z] = P(t + o, 0); k.solid.box(x, H - 0.7, z, 0.025, 1.4, 0.025, '#9aa0a6'); }
    const [x, z] = P(t, 0); k.solid.box(x, H - 1.42, z, alongX ? 0.55 : 0.22, 0.05, alongX ? 0.22 : 0.55, '#2e5d9a');
  }
  for (let i = 0; i <= 16; i++) { const [x, z] = P(-L / 2 + (L * i) / 16, 0); k.bulbs.add(x, H + 0.1, z, BULB[i % BULB.length], 0.16); }
  k.pools.push({ x: cx, z: cz, r: 2.6, color: '#ffd28a' });
}

/** Playground slide: a ladder at the north end, a platform, the chute down to the south. */
function slide(k: StreetBuild, w: AgawanWall): void {
  const cx = (w.minX + w.maxX) / 2, L = w.maxZ - w.minZ, W2 = w.maxX - w.minX;
  const z0 = w.minZ + 0.35, top = 1.6;
  for (const s of [-1, 1]) k.solid.box(cx + s * (W2 / 2 - 0.15), top / 2 + 0.2, z0, 0.08, top + 0.4, 0.08, '#2e5d9a');
  for (let y = 0.3; y < top; y += 0.3) k.solid.box(cx, y, z0, W2 - 0.3, 0.05, 0.06, '#2e5d9a');
  k.solid.box(cx, top, z0 + 0.35, W2 - 0.2, 0.08, 0.7, '#e2b229');
  for (const s of [-1, 1]) k.solid.box(cx + s * (W2 / 2 - 0.12), top + 0.4, z0 + 0.35, 0.05, 0.6, 0.7, '#c43b3b');
  const run = L - 1.1, ang = Math.atan2(top - 0.25, run);
  k.solid.box(cx, (top + 0.25) / 2, z0 + 0.7 + run / 2, W2 - 0.5, 0.06, Math.hypot(run, top - 0.25), '#ff8a3a', 0, ang);
  for (const s of [-1, 1]) k.solid.box(cx + s * (W2 / 2 - 0.27), (top + 0.25) / 2 + 0.1, z0 + 0.7 + run / 2, 0.04, 0.2, Math.hypot(run, top - 0.25), '#c43b3b', 0, ang);
  k.solid.box(cx, 0.12, w.maxZ - 0.25, W2 - 0.5, 0.24, 0.3, '#ff8a3a');
  for (let i = 0; i < 10; i++) k.bulbs.add(cx + (i % 2 ? -1 : 1) * (W2 / 2 - 0.12), top + 0.7, z0 + 0.05 + (i >> 1) * 0.16, BULB[i % BULB.length], 0.15);
}

/** Seesaw: a pivot and a tilted plank with handles. */
function seesaw(k: StreetBuild, cx: number, cz: number, sx: number): void {
  const L = sx - 0.2, tilt = 0.17;
  k.solid.box(cx, 0.25, cz, 0.3, 0.5, 0.5, '#2e5d9a');
  k.solid.box(cx, 0.52, cz, L, 0.07, 0.3, '#e2b229', 0, 0, tilt);
  for (const s of [-1, 1]) {
    const x = cx + s * (L / 2 - 0.35), y = 0.52 - s * Math.sin(tilt) * (L / 2 - 0.35);
    k.solid.box(x, y + 0.2, cz, 0.05, 0.36, 0.3, '#c43b3b');
    k.solid.box(x, y + 0.38, cz, 0.06, 0.05, 0.36, '#c43b3b');
  }
}

/** Basketball hoop against the block's wall, facing the court painted in front of it. */
function hoop(k: StreetBuild, cx: number, cz: number): void {
  k.solid.box(cx, 1.6, cz, 0.16, 3.2, 0.16, '#3a6ea5');
  k.solid.box(cx, 0.08, cz, 0.6, 0.16, 0.6, '#8c8577');
  k.solid.box(cx, 3.15, cz - 0.4, 0.1, 0.1, 0.8, '#3a6ea5');
  k.solid.box(cx, 3.15, cz - 0.82, 1.8, 1.05, 0.05, '#f2efe6');
  k.solid.box(cx, 2.98, cz - 0.85, 0.6, 0.45, 0.02, '#c43b3b');
  k.solid.box(cx, 2.98, cz - 0.86, 0.5, 0.35, 0.02, '#f2efe6');
  k.solid.add(new THREE.TorusGeometry(0.23, 0.02, 4, 16), new THREE.Matrix4().compose(new THREE.Vector3(cx, 2.75, cz - 1.12), new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0)), new THREE.Vector3(1, 1, 1)), '#ff6a1a');
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    k.solid.box(cx + Math.cos(a) * 0.18, 2.55, cz - 1.12 + Math.sin(a) * 0.18, 0.015, 0.4, 0.015, '#f4f4f4');
  }
  // lights along the backboard's edge
  for (let i = 0; i <= 10; i++) k.bulbs.add(cx - 0.9 + 0.18 * i, 3.7, cz - 0.84, BULB[i % BULB.length], 0.15);
  // the court: a painted key and three-point arc on the street
  k.decals.ground(cx, cz - 3.6, 6.8, 6.8, Math.PI, 'court', 0.014);
  k.pools.push({ x: cx, z: cz - 2.5, r: 3.5, color: '#ffd9a0' });
}

// ---------------------------------------------------------------------------------------------------------------
// More lights (decision 050, the owner's reference photos): light-wrapped poles with stacked parols along the
// streets, Maligayang Pasko banners across the streets near the plaza, chalk piko squares where kids play.

function lightPoles(k: StreetBuild, rand: () => number): void {
  const placed: [number, number][] = [];
  for (const w of layout.walls) {
    if (w.kind !== 'house') continue;
    const faces: { f: 'n' | 's' | 'w' | 'e'; a: [number, number]; b: [number, number]; nx: number; nz: number }[] = [
      { f: 'n', a: [w.minX, w.minZ], b: [w.maxX, w.minZ], nx: 0, nz: -1 },
      { f: 's', a: [w.minX, w.maxZ], b: [w.maxX, w.maxZ], nx: 0, nz: 1 },
      { f: 'w', a: [w.minX, w.minZ], b: [w.minX, w.maxZ], nx: -1, nz: 0 },
      { f: 'e', a: [w.maxX, w.minZ], b: [w.maxX, w.maxZ], nx: 1, nz: 0 },
    ];
    for (const F of faces) {
      if (isShellEdge(w, F.f)) continue;
      const L = Math.hypot(F.b[0] - F.a[0], F.b[1] - F.a[1]);
      for (let d = 2.5; d < L - 1.5; d += 12) {
        const t = d / L;
        // the pole stands just inside the house box, so it never adds collision
        const x = F.a[0] + (F.b[0] - F.a[0]) * t - F.nx * 0.12, z = F.a[1] + (F.b[1] - F.a[1]) * t - F.nz * 0.12;
        if (insideSolid(x + F.nx * 1.6, z + F.nz * 1.6) || placed.some(([px, pz]) => Math.hypot(px - x, pz - z) < 7)) continue;
        placed.push([x, z]);
        pole(k, x, z, Math.atan2(F.nx, F.nz), rand);
      }
    }
  }
}

function pole(k: StreetBuild, x: number, z: number, ry: number, rand: () => number): void {
  const H = 7.2 + rand() * 0.8;
  k.solid.box(x, H / 2, z, 0.2, H, 0.2, '#6b6a66');
  k.solid.box(x, H - 0.5, z, 1.4, 0.1, 0.1, '#55534f', ry + Math.PI / 2);
  const warm = rand() < 0.5;
  const pal = warm ? ['#fff1cf', '#ffd27a'] : BULB;
  for (let i = 0; i < 44; i++) {
    const f = i / 44, a = f * Math.PI * 2 * 9;
    k.bulbs.add(x + Math.cos(a) * 0.17, 0.4 + f * (H - 1.2), z + Math.sin(a) * 0.17, pal[i % pal.length], 0.15);
  }
  const n = 2 + Math.floor(rand() * 2);
  for (let s = 0; s < n; s++) {
    const col = PAROL[Math.floor(rand() * PAROL.length)];
    const y = H + 0.55 + s * 0.95;
    k.glow.add(PAROL_STAR, new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0)), new THREE.Vector3(0.8, 0.8, 0.8)), col);
    k.halos.add(x, y, z, col, 2.4);
  }
  k.solid.box(x, H + 0.4 + n * 0.5, z, 0.05, n * 1.0, 0.05, '#55534f');
  k.pools.push({ x: x + Math.sin(ry) * 1.2, z: z + Math.cos(ry) * 1.2, r: 2.4, color: warm ? '#ffd28a' : '#d8b0ff' });
}

function banners(k: StreetBuild): void {
  for (const r of layout.routes) {
    // halfway along the route's longest segment
    let best = 0, bl = 0;
    for (let s = 0; s < r.points.length - 1; s++) {
      const l = Math.hypot(r.points[s + 1][0] - r.points[s][0], r.points[s + 1][1] - r.points[s][1]);
      if (l > bl) { bl = l; best = s; }
    }
    const [x0, z0] = r.points[best], [x1, z1] = r.points[best + 1];
    const ux = (x1 - x0) / bl, uz = (z1 - z0) / bl, px = x0 + ux * bl * 0.5, pz = z0 + uz * bl * 0.5;
    const L = rayToHouse(px, pz, -uz, ux, 16), R = rayToHouse(px, pz, uz, -ux, 16);
    const y = 4.9;
    const ry = Math.atan2(ux, uz); // the banner faces along the street
    k.lit.face(px, y, pz, 3.4, 1.2, ry, 'banner');
    k.lit.face(px, y, pz, 3.4, 1.2, ry + Math.PI, 'banner');
    k.halos.add(px, y, pz, '#ff6a5a', 3.6);
    if (L && R) {
      const ex = -uz * 1.7, ez = ux * 1.7;
      k.wires.push(L.x, y + 0.6, L.z, px + ex, y + 0.6, pz + ez, px - ex, y + 0.6, pz - ez, R.x, y + 0.6, R.z);
    }
  }
}

function groundArt(k: StreetBuild): void {
  // chalk piko (hopscotch) squares beside the plaza, where the street opens up
  k.decals.ground(-6.5, -6.0, 1.7, 3.4, 0.6, 'piko');
  k.decals.ground(6.8, 3.8, 1.7, 3.4, -2.2, 'piko');
  k.decals.ground(-20, 33.5, 1.7, 3.4, 1.35, 'piko');
  // drain grates along the kerbs of the main streets
  for (const [x, z] of [[-18.5, -24], [18.5, -24], [-24, 30.6], [24, 30.6], [0, 35.4], [-22.4, 2], [22.4, 2]] as const) {
    if (!insideSolid(x, z, 0.4)) k.decals.ground(x, z, 0.9, 0.5, 0, 'grate', 0.015);
  }
}

function crate(k: StreetBuild, x: number, y: number, z: number, s: number, h: number, ry = 0): void {
  k.solid.box(x, y, z, s, h, s, '#9a7348', ry);
  k.decals.skin(x, y, z, s, h, s, ry, 'planks', 'planks', '#d9c4a8');
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
    // sari-sari store front on every side
    k.lit.face(cx + nx * (sx / 2 + 0.03), 1.2, cz + nz * (sz / 2 + 0.03), w * 0.86, 1.0, Math.atan2(nx, nz), 'sari');
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

function bases(k: StreetBuild, colors: Record<TeamSlot, string>): void {
  for (const s of TEAM_SLOTS) {
    const b = layout.bases[s];
    const l = Math.hypot(b.x, b.z), ox = b.x / l, oz = b.z / l; // outward
    const px = -oz, pz = ox; // across
    // An entrance arch on the plaza side of the base: posts either side of the street, the swag high above heads
    // (and above the camera line), so it frames the base without blocking the view.
    const back = -5, half = 6.5, top = 6.0;
    const p1 = new THREE.Vector3(b.x + ox * back + px * half, 0, b.z + oz * back + pz * half);
    const p2 = new THREE.Vector3(b.x + ox * back - px * half, 0, b.z + oz * back - pz * half);
    const team = colors[s];
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
      k.solid.box(x, 0.8, z, 0.09, 1.6, 0.09, i === 0 || i === n ? colors[slot] : '#9aa0a6');
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
    k.solid.box(cx, 0.02, cz, sx + e * 2, 0.04, sz + e * 2, '#9c968a'); // concrete sidewalk
    // kerb edge line
    k.solid.box(cx, 0.03, w.minZ - e, sx + e * 2, 0.06, 0.12, '#c2bcaf');
    k.solid.box(cx, 0.03, w.maxZ + e, sx + e * 2, 0.06, 0.12, '#c2bcaf');
    k.solid.box(w.minX - e, 0.03, cz, 0.12, 0.06, sz + e * 2, '#c2bcaf');
    k.solid.box(w.maxX + e, 0.03, cz, 0.12, 0.06, sz + e * 2, '#c2bcaf');
  }
}

/** Builds everything once (deterministic). */
export function buildStreet(opts: { colors?: Record<TeamSlot, string> } = {}): StreetBuild {
  const rand = rng(0x5ea50202);
  const k: StreetBuild = { solid: new Kit(), glow: new Kit(), decals: new Decals(), lit: new Decals(), bulbs: new Dots(), halos: new Dots(), wires: [], pools: [] };
  houses(k, rand);
  props(k, rand);
  bases(k, opts.colors ?? TEAMS.colors);
  roadPaint(k);
  plaza(k, rand);
  overhead(k, rand);
  lightPoles(k, rand);
  banners(k);
  groundArt(k);
  bakeLight(k);
  return k;
}

// ---------------------------------------------------------------------------------------------------------------
// Baked lamp light (owner, 27 Nov 2026: "dimmer the whole stage and rely only on the lights"). The scene's real lights
// are dim; every wall, roof and prop vertex gets the warm light of the lamps, windows, parols and pools near it baked
// in once, as a per-vertex glow (attribute `bake`, added as emissive in the shader). No real-time point lights, so
// nothing extra per frame.

interface BakeLight { x: number; y: number; z: number; r: number; c: THREE.Color; i: number }

export function bakeLight(k: StreetBuild): void {
  const lights: BakeLight[] = [];
  for (const p of k.pools) lights.push({ x: p.x, y: 2.4, z: p.z, r: p.r * 2.3, c: new THREE.Color(p.color), i: 1.0 });
  const hp = k.halos.pos, hc = k.halos.col, hs = k.halos.size;
  for (let i = 0; i < hs.length; i++) {
    if (hs[i] < 1.4) continue;
    lights.push({ x: hp[i * 3], y: hp[i * 3 + 1], z: hp[i * 3 + 2], r: 1.3 * hs[i] + 1.2, c: new THREE.Color(hc[i * 3], hc[i * 3 + 1], hc[i * 3 + 2]), i: 0.4 });
  }
  const C = 6, grid = new Map<number, BakeLight[]>();
  const key = (gx: number, gz: number) => (gx + 500) * 1000 + (gz + 500);
  for (const l of lights) {
    for (let gx = Math.floor((l.x - l.r) / C); gx <= Math.floor((l.x + l.r) / C); gx++) {
      for (let gz = Math.floor((l.z - l.r) / C); gz <= Math.floor((l.z + l.r) / C); gz++) {
        const kk = key(gx, gz);
        let a = grid.get(kk);
        if (!a) grid.set(kk, (a = []));
        a.push(l);
      }
    }
  }
  for (const g of [k.solid.build(), k.decals.build()]) {
    if (g.getAttribute('bake')) continue; // already baked (the build is cached)
    const pos = g.getAttribute('position'), nor = g.getAttribute('normal');
    if (!pos || !nor) continue;
    const out = new Float32Array(pos.count * 3);
    for (let v = 0; v < pos.count; v++) {
      const x = pos.getX(v), y = pos.getY(v), z = pos.getZ(v);
      const nx = nor.getX(v), ny = nor.getY(v), nz = nor.getZ(v);
      const cell = grid.get(key(Math.floor(x / C), Math.floor(z / C)));
      if (!cell) continue;
      let r = 0, gg = 0, b = 0;
      for (const l of cell) {
        const dx = l.x - x, dy = l.y - y, dz = l.z - z;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 >= l.r * l.r) continue;
        const d = Math.sqrt(d2) + 1e-4;
        const fall = (1 - d / l.r) ** 2;
        const ndl = Math.max(0, (dx * nx + dy * ny + dz * nz) / d) * 0.75 + 0.25;
        const w = fall * ndl * l.i;
        r += l.c.r * w; gg += l.c.g * w; b += l.c.b * w;
      }
      out[v * 3] = Math.min(r, 1.4); out[v * 3 + 1] = Math.min(gg, 1.4); out[v * 3 + 2] = Math.min(b, 1.4);
    }
    g.setAttribute('bake', new THREE.BufferAttribute(out, 3));
  }
}

/** Adds the baked lamp light (attribute `bake`) to a standard material as emissive light on its own colour. */
export function withBakedLight(m: THREE.MeshStandardMaterial, strength = 1): THREE.MeshStandardMaterial {
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uBake = { value: strength };
    sh.vertexShader = 'attribute vec3 bake;\nvarying vec3 vBake;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vBake = bake;');
    sh.fragmentShader = 'uniform float uBake;\nvarying vec3 vBake;\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  totalEmissiveRadiance += vBake * diffuseColor.rgb * uBake;');
  };
  m.customProgramCacheKey = () => `baked-${strength}`;
  return m;
}
