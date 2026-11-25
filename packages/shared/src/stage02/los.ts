// Line-of-sight and signal paths on the flat greybox (Stage 02). Walls are axis-aligned rectangles, so a segment
// test is the slab method with a cheap bounding-box reject first. Used by the server (capture, snapshots, Pulse
// Detector, bot senses) and by tests; never trusted from a client.
import type { Rect } from '../stage.ts';

interface SightWall extends Rect { see?: boolean; att?: number }

/** Does the segment (ax, az) -> (bx, bz) pass through the rectangle (inflated by `pad`)? */
export function segmentHitsRect(ax: number, az: number, bx: number, bz: number, r: Rect, pad = 0): boolean {
  const minX = r.minX - pad, maxX = r.maxX + pad, minZ = r.minZ - pad, maxZ = r.maxZ + pad;
  if (Math.max(ax, bx) < minX || Math.min(ax, bx) > maxX || Math.max(az, bz) < minZ || Math.min(az, bz) > maxZ) return false;
  let t0 = 0, t1 = 1;
  const dx = bx - ax, dz = bz - az;
  const clip = (p: number, q: number) => {
    if (Math.abs(p) < 1e-12) return q >= 0;
    const t = q / p;
    if (p < 0) { if (t > t1) return false; if (t > t0) t0 = t; } else { if (t < t0) return false; if (t < t1) t1 = t; }
    return true;
  };
  return clip(-dx, ax - minX) && clip(dx, maxX - ax) && clip(-dz, az - minZ) && clip(dz, maxZ - az) && t1 > t0;
}

/** Clear line of sight between two points: no opaque wall in between (see-through rails and glass do not block). */
export function lineOfSight(ax: number, az: number, bx: number, bz: number, walls: readonly SightWall[]): boolean {
  for (const w of walls) if (!w.see && segmentHitsRect(ax, az, bx, bz, w)) return false;
  return true;
}

/** Product of the attenuation of every wall the path crosses (at most `maxWalls` counted), and the count. */
export function pathAttenuation(ax: number, az: number, bx: number, bz: number, walls: readonly SightWall[], maxWalls = 4): { factor: number; walls: number } {
  let factor = 1, n = 0;
  for (const w of walls) {
    if (n >= maxWalls) break;
    if (segmentHitsRect(ax, az, bx, bz, w)) { factor *= w.att ?? 0.5; n++; }
  }
  return { factor, walls: n };
}

/** Clear path for a walking capsule (radius `pad`) between two points: used by bot path smoothing. */
export function clearPath(ax: number, az: number, bx: number, bz: number, walls: readonly Rect[], pad: number): boolean {
  for (const w of walls) if (segmentHitsRect(ax, az, bx, bz, w, pad)) return false;
  return true;
}
