// Navigation for Stage 02 bots: a 1 m walkability grid over the facility and A* with an octile heuristic.
// Built once per layout (immutable afterwards) and shared by every room; bots then follow the path with the
// same movement code as humans, so they respect walls, gates and other players. No knowledge of other players
// lives here: a path only says how to walk from A to B.
import type { Rect } from '../stage.ts';
import { clearPath } from './los.ts';

export interface NavGrid {
  minX: number; minZ: number; cols: number; rows: number; cell: number;
  /** 1 = walkable for a capsule (clearance checked against static walls). */
  open: Uint8Array;
  walls: readonly Rect[];
}

const CLEAR = 0.42; // capsule radius 0.3 plus a margin

export function buildNavGrid(walls: readonly Rect[], bounds: Rect, cell = 1): NavGrid {
  const cols = Math.ceil((bounds.maxX - bounds.minX) / cell), rows = Math.ceil((bounds.maxZ - bounds.minZ) / cell);
  const open = new Uint8Array(cols * rows);
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const x = bounds.minX + (i + 0.5) * cell, z = bounds.minZ + (j + 0.5) * cell;
    let ok = true;
    for (const w of walls) {
      const cx = Math.max(w.minX, Math.min(x, w.maxX)), cz = Math.max(w.minZ, Math.min(z, w.maxZ));
      if ((x - cx) ** 2 + (z - cz) ** 2 < CLEAR * CLEAR) { ok = false; break; }
    }
    open[j * cols + i] = ok ? 1 : 0;
  }
  return { minX: bounds.minX, minZ: bounds.minZ, cols, rows, cell, open, walls };
}

export function cellOf(g: NavGrid, x: number, z: number): number {
  const i = Math.max(0, Math.min(g.cols - 1, Math.floor((x - g.minX) / g.cell)));
  const j = Math.max(0, Math.min(g.rows - 1, Math.floor((z - g.minZ) / g.cell)));
  return j * g.cols + i;
}
export function centreOf(g: NavGrid, c: number): [number, number] {
  return [g.minX + ((c % g.cols) + 0.5) * g.cell, g.minZ + (Math.floor(c / g.cols) + 0.5) * g.cell];
}

/** Nearest walkable cell to a point (spiral search), or -1. */
export function nearestOpen(g: NavGrid, x: number, z: number, maxR = 6): number {
  const c0 = cellOf(g, x, z);
  if (g.open[c0]) return c0;
  const i0 = c0 % g.cols, j0 = Math.floor(c0 / g.cols);
  for (let r = 1; r <= maxR; r++) {
    let best = -1, bd = Infinity;
    for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
      if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
      const i = i0 + di, j = j0 + dj;
      if (i < 0 || j < 0 || i >= g.cols || j >= g.rows || !g.open[j * g.cols + i]) continue;
      const d = di * di + dj * dj;
      if (d < bd) { bd = d; best = j * g.cols + i; }
    }
    if (best >= 0) return best;
  }
  return -1;
}

/**
 * A* from (ax, az) to (bx, bz). Returns smoothed waypoints (world metres, excluding the start), or [] when there
 * is no path. Extra blocked rectangles (the hunter gates during the head start) can be passed in `blocked`.
 */
export function findPath(g: NavGrid, ax: number, az: number, bx: number, bz: number, blocked: readonly Rect[] = [], maxExpand = 12000): [number, number][] {
  const s = nearestOpen(g, ax, az), t = nearestOpen(g, bx, bz);
  if (s < 0 || t < 0) return [];
  if (s === t) return [[bx, bz]];
  const n = g.cols * g.rows;
  const gs = new Float32Array(n).fill(Infinity);
  const from = new Int32Array(n).fill(-1);
  const closed = new Uint8Array(n);
  const isBlocked = (c: number) => {
    if (!blocked.length) return false;
    const [x, z] = centreOf(g, c);
    for (const r of blocked) if (x > r.minX - CLEAR && x < r.maxX + CLEAR && z > r.minZ - CLEAR && z < r.maxZ + CLEAR) return true;
    return false;
  };
  const ti = t % g.cols, tj = Math.floor(t / g.cols);
  const h = (c: number) => { const dx = Math.abs((c % g.cols) - ti), dz = Math.abs(Math.floor(c / g.cols) - tj); return (dx + dz) + (Math.SQRT2 - 2) * Math.min(dx, dz); };
  // binary heap of [f, cell]
  const heapF: number[] = [], heapC: number[] = [];
  const push = (f: number, c: number) => {
    heapF.push(f); heapC.push(c);
    let i = heapF.length - 1;
    while (i > 0) { const p = (i - 1) >> 1; if (heapF[p] <= heapF[i]) break; [heapF[p], heapF[i]] = [heapF[i], heapF[p]]; [heapC[p], heapC[i]] = [heapC[i], heapC[p]]; i = p; }
  };
  const pop = (): number => {
    const top = heapC[0];
    const lf = heapF.pop()!, lc = heapC.pop()!;
    if (heapF.length) {
      heapF[0] = lf; heapC[0] = lc;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1; let m = i;
        if (l < heapF.length && heapF[l] < heapF[m]) m = l;
        if (r < heapF.length && heapF[r] < heapF[m]) m = r;
        if (m === i) break;
        [heapF[m], heapF[i]] = [heapF[i], heapF[m]]; [heapC[m], heapC[i]] = [heapC[i], heapC[m]]; i = m;
      }
    }
    return top;
  };
  gs[s] = 0; push(h(s), s);
  let expanded = 0;
  while (heapF.length && expanded < maxExpand) {
    const c = pop();
    if (closed[c]) continue;
    closed[c] = 1; expanded++;
    if (c === t) break;
    const ci = c % g.cols, cj = Math.floor(c / g.cols);
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      if (!di && !dj) continue;
      const i = ci + di, j = cj + dj;
      if (i < 0 || j < 0 || i >= g.cols || j >= g.rows) continue;
      const nc = j * g.cols + i;
      if (!g.open[nc] || closed[nc]) continue;
      if (di && dj && (!g.open[cj * g.cols + i] || !g.open[j * g.cols + ci])) continue; // no corner cutting
      if (isBlocked(nc)) continue;
      const cost = gs[c] + (di && dj ? Math.SQRT2 : 1);
      if (cost < gs[nc]) { gs[nc] = cost; from[nc] = c; push(cost + h(nc), nc); }
    }
  }
  if (from[t] < 0) return [];
  const cells: number[] = [];
  for (let c = t; c !== s && c >= 0; c = from[c]) cells.push(c);
  cells.reverse();
  // String-pulling: keep a waypoint only when the straight walk from the last kept point would hit a wall.
  const pts = cells.map((c) => centreOf(g, c));
  pts[pts.length - 1] = [bx, bz];
  const out: [number, number][] = [];
  let [lx, lz] = [ax, az];
  let i = 0;
  const all = [...g.walls, ...blocked];
  while (i < pts.length) {
    // Walk forward while the straight line stays clear (linear, so a long path costs a few thousand tests).
    let j = i;
    while (j + 1 < pts.length && clearPath(lx, lz, pts[j + 1][0], pts[j + 1][1], all, 0.32)) j++;
    out.push(pts[j]);
    [lx, lz] = pts[j];
    i = j + 1;
  }
  return out;
}
