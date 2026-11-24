// Stage 1.5 (Prompt 05): the Stage 01 obstacles (always on since decision 031; first the optional "twist"). Shared by the server (authority) and the
// client (prediction and visuals), so collision is identical on both. The core rule is unchanged: green you
// may move, red you must stop; detection and elimination stay in the round engine.
//
// Two obstacle types (docs/stage15/P05_OBSTACLES_SPEC.md):
//  - Offset barricade rows: low concrete barriers across the course with open gaps. Each row is mirror-
//    symmetric about the course centre line, and rows alternate between two gap patterns, so every lane has
//    the same detour length (no lane advantage) and gaps are wide enough for a crowd.
//  - A sliding gate: a steel panel that slides across the course ONLY while the light is green or warning.
//    Its position is a pure function of the green time since GO (from the seeded schedule), so it is frozen
//    for the whole red light: it can never push a player during red, and never causes an elimination.
//
// The layout is expressed relative to the approved course (start line, finish line, fence width from the
// stage metadata), not as new absolute coordinates. Always active, in the lobby too (owner, 22 Nov 2026; decision 031).
// Only test rooms (CN_TEST=1) may switch them off, for the straight-line walk-timing and rollback tests.
import type { SignalSegment } from './round.ts';
import type { Rect, StageGeometry } from './stage.ts';

export interface BarricadeRowSpec {
  /** Position along the course: 0 = start line, 1 = finish line. */
  at: number;
  /** Gap centres as a fraction of the half-width (-1 = left fence, 1 = right fence). Mirror-symmetric. */
  gaps: number[];
}

export interface ObstacleLayoutSpec {
  id: string;
  barricade: { depth: number; height: number; gapWidth: number; rows: BarricadeRowSpec[] };
  gate: { at: number; width: number; depth: number; height: number; travel: number; period: number };
  /** Keep the sliding gate this far from the fences (m). Barricade rows run fence to fence, so there is no
   *  unintended sneak path along the fence; their gaps are the only way through. */
  fenceMargin: number;
}

/** The Stage 01 twist. Values in metres and seconds; positions relative to the course. */
export const STAGE01_OBSTACLES: ObstacleLayoutSpec = {
  id: 'STG01_OBSTACLES_B',
  barricade: {
    depth: 1.2,
    height: 1.1,
    gapWidth: 6,
    rows: [
      // Patterns alternate so the way through keeps changing; every row is mirror-symmetric (no lane advantage).
      { at: 0.17, gaps: [-0.7, -0.31, 0.31, 0.7] },     // pattern C: centre closed, inner and mid gaps (added, decision 031)
      { at: 0.28, gaps: [-0.66, 0, 0.66] },            // pattern A: centre and two side gaps
      { at: 0.36, gaps: [-0.78, 0, 0.78] },             // pattern D: centre and two wide side gaps (added)
      { at: 0.44, gaps: [-0.9, -0.31, 0.31, 0.9] },    // pattern B: centre closed; two inner gaps and one by each fence
      { at: 0.51, gaps: [-0.7, -0.31, 0.31, 0.7] },     // C (added), before the sliding gate
      { at: 0.65, gaps: [-0.66, 0, 0.66] },            // A (added), after the gate
      { at: 0.72, gaps: [-0.78, 0, 0.78] },             // D (was A)
      { at: 0.79, gaps: [-0.7, -0.31, 0.31, 0.7] },     // C (added)
      { at: 0.86, gaps: [-0.9, -0.31, 0.31, 0.9] },    // B
      { at: 0.93, gaps: [-0.66, 0, 0.66] },            // A (added), last row before the finish
    ],
  },
  gate: { at: 0.58, width: 10, depth: 0.6, height: 2.2, travel: 0.62, period: 7 },
  fenceMargin: 1.5,
};

/**
 * Stage 01 refinement (Phase 03): what each barricade segment is dressed as. The collider is always the
 * segment's box (same on server and client); the kit only sets its depth and the model drawn on it.
 * Assignment is mirror-symmetric per row, so the fairness rules above still hold.
 */
export type ObstacleKit = 'jersey' | 'crates' | 'tires' | 'drums' | 'pipes' | 'lowbar' | 'equipment' | 'container';

/** Collider depth (m, along the course) and model height per kit. Containers lie by the fences only. */
export const OBSTACLE_KITS: Record<ObstacleKit, { depth: number; height: number; label: string }> = {
  jersey: { depth: 1.2, height: 1.1, label: 'concrete jersey barriers' },
  crates: { depth: 1.3, height: 1.25, label: 'stacked wooden crates' },
  tires: { depth: 1.2, height: 0.95, label: 'tyre stacks' },
  drums: { depth: 1.2, height: 1.0, label: 'oil drums' },
  pipes: { depth: 1.4, height: 1.05, label: 'concrete pipes' },
  lowbar: { depth: 0.8, height: 0.8, label: 'low timber barricade' },
  equipment: { depth: 1.4, height: 1.15, label: 'fallen floodlight frame and generator' },
  container: { depth: 2.44, height: 2.59, label: 'shipping container (fence side only)' },
};
const INNER_KITS: ObstacleKit[] = ['jersey', 'crates', 'tires', 'drums', 'pipes', 'lowbar', 'equipment'];

export interface Barricade extends Rect { kit: ObstacleKit }

export interface ResolvedObstacles {
  id: string;
  barricades: Barricade[];
  gate: { z: number; halfWidth: number; halfDepth: number; amplitude: number; period: number; height: number; centreX: number };
  barricadeHeight: number;
}

/** Turns the relative layout into world rectangles for this stage's approved geometry. */
export function resolveObstacles(geo: StageGeometry, spec: ObstacleLayoutSpec = STAGE01_OBSTACLES): ResolvedObstacles {
  const b = geo.bounds;
  if (!b) throw new Error('resolveObstacles: stage has no playable bounds');
  const minX = b.minX, maxX = b.maxX;
  const cx = (b.minX + b.maxX) / 2, half = (maxX - minX) / 2;
  const gateHalf = half - spec.fenceMargin;
  const zAt = (t: number) => geo.startZ + (geo.finishZ - geo.startZ) * t;
  const barricades: Barricade[] = [];
  spec.barricade.rows.forEach((row, r) => {
    const z = zAt(row.at);
    const open = row.gaps.map((g) => [cx + g * half - spec.barricade.gapWidth / 2, cx + g * half + spec.barricade.gapWidth / 2]).sort((p, q) => p[0] - q[0]);
    const spans: [number, number][] = [];
    let x = minX;
    for (const [g0, g1] of [...open.map(([a, c]) => [Math.max(minX, a), Math.min(maxX, c)]), [maxX, maxX]]) {
      if (g0 - x > 0.01) spans.push([x, g0]);
      x = g1;
    }
    spans.forEach(([x0, x1], k) => {
      const m = Math.min(k, spans.length - 1 - k);             // mirror index: same kit on both sides
      const atFence = x0 <= minX + 0.01 || x1 >= maxX - 0.01;
      const kit: ObstacleKit = atFence && x1 - x0 >= 5 && r % 3 === 1 ? 'container' : INNER_KITS[(r * 2 + m * 3) % INNER_KITS.length];
      const hd = OBSTACLE_KITS[kit].depth / 2;
      barricades.push({ id: `OBS_STG01_Barricade_${r + 1}_${k + 1}`, minX: x0, maxX: x1, minZ: z - hd, maxZ: z + hd, kit });
    });
  });
  return {
    id: spec.id,
    barricades,
    barricadeHeight: spec.barricade.height,
    gate: { z: zAt(spec.gate.at), halfWidth: spec.gate.width / 2, halfDepth: spec.gate.depth / 2, amplitude: spec.gate.travel * gateHalf - spec.gate.width / 2, period: spec.gate.period, height: spec.gate.height, centreX: cx },
  };
}

/** Seconds of GREEN and WARNING light since GO (red time does not count). Pure: server and client agree. */
export function greenTime(schedule: SignalSegment[], elapsed: number): number {
  let t = 0;
  for (const s of schedule) {
    if (s.start >= elapsed) break;
    if (s.signal !== 'red') t += Math.min(elapsed, s.end) - s.start;
  }
  return Math.max(0, t);
}

/** Gate centre X after `gt` seconds of green time. */
export function gateX(o: ResolvedObstacles, gt: number): number {
  return o.gate.centreX + o.gate.amplitude * Math.sin((2 * Math.PI * gt) / o.gate.period);
}

export function gateRect(o: ResolvedObstacles, gt: number): Rect {
  const x = gateX(o, gt);
  return { id: 'OBS_STG01_Gate', minX: x - o.gate.halfWidth, maxX: x + o.gate.halfWidth, minZ: o.gate.z - o.gate.halfDepth, maxZ: o.gate.z + o.gate.halfDepth };
}

/** All obstacle colliders at a given green time (barricades are static; the gate slides). */
export function obstacleWalls(o: ResolvedObstacles, gt: number): Rect[] {
  return [...o.barricades, gateRect(o, gt)];
}
