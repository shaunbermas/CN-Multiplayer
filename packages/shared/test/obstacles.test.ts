// Stage 1.5 obstacle twist (Prompt 05): fairness, clearance, safety on red, and authoritative collision.
import { describe, expect, it } from 'vitest';
import {
  MOVEMENT, SIM_DT, STAGE01_OBSTACLES, buildSchedule, gateRect, getStage, greenTime, obstacleWalls, resolveObstacles, step, type Rect,
} from '../src/index.ts';

const geo = getStage('STAGE_01_RED_LIGHT').geometry;
const o = resolveObstacles(geo);
const overlaps = (a: Rect, b: Rect) => a.minX < b.maxX && b.minX < a.maxX && a.minZ < b.maxZ && b.minZ < a.maxZ;
const rows = () => {
  const byZ = new Map<number, Rect[]>();
  for (const r of o.barricades) { const z = +((r.minZ + r.maxZ) / 2).toFixed(3); if (!byZ.has(z)) byZ.set(z, []); byZ.get(z)!.push(r); }
  return [...byZ.entries()].sort((a, b) => b[0] - a[0]);
};

describe('obstacle twist layout', () => {
  it('dresses segments in varied kits, mirror-symmetric per row, with containers only against a fence', () => {
    const b = geo.bounds!, cx = o.gate.centreX;
    expect(new Set(o.barricades.map((r) => r.kit)).size).toBeGreaterThanOrEqual(6);
    for (const r of o.barricades) {
      const twin = o.barricades.find((q) => Math.abs((q.minZ + q.maxZ) / 2 - (r.minZ + r.maxZ) / 2) < 1e-6 && Math.abs((cx - q.maxX) - (r.minX - cx)) < 1e-6);
      expect(twin?.kit).toBe(r.kit);
      if (r.kit === 'container') expect(r.minX <= b.minX + 0.01 || r.maxX >= b.maxX - 0.01).toBe(true);
    }
  });

  it('builds four barricade rows between the start and finish lines, inside the fence', () => {
    const b = geo.bounds!;
    expect(rows()).toHaveLength(STAGE01_OBSTACLES.barricade.rows.length);
    for (const r of o.barricades) {
      expect(r.minX).toBeGreaterThanOrEqual(b.minX - 1e-6);
      expect(r.maxX).toBeLessThanOrEqual(b.maxX + 1e-6);
      expect(r.maxZ).toBeLessThan(geo.startZ);
      expect(r.minZ).toBeGreaterThan(geo.finishZ);
    }
  });

  it('never covers a spawn, the finish line, the safe zone or an existing wall', () => {
    const cap = MOVEMENT.capsuleRadius;
    for (const r of o.barricades) {
      for (const s of geo.spawns) expect(overlaps(r, { id: 's', minX: s.x - cap, maxX: s.x + cap, minZ: s.z - cap, maxZ: s.z + cap })).toBe(false);
      if (geo.finish) expect(overlaps(r, geo.finish)).toBe(false);
      if (geo.safe) expect(overlaps(r, geo.safe)).toBe(false);
      for (const w of geo.walls) expect(overlaps(r, w)).toBe(false);
    }
  });

  it('is mirror-symmetric about the course centre, so no lane has an advantage', () => {
    const cx = o.gate.centreX;
    for (const [, rs] of rows()) {
      const spans = rs.map((r) => [+(r.minX - cx).toFixed(3), +(r.maxX - cx).toFixed(3)]).sort((a, b) => a[0] - b[0]);
      const mirrored = rs.map((r) => [+(cx - r.maxX).toFixed(3), +(cx - r.minX).toFixed(3)]).sort((a, b) => a[0] - b[0]);
      expect(mirrored).toEqual(spans);
    }
  });

  it('keeps every gap at least 6 m wide (over 8 capsules abreast), with no sliver at the fence, and every lane within 10 m of a gap', () => {
    const b = geo.bounds!;
    expect(6 / (2 * MOVEMENT.capsuleRadius)).toBeGreaterThan(8);
    for (const [, rs] of rows()) {
      const sorted = [...rs].sort((a, c) => a.minX - c.minX);
      const gaps: [number, number][] = [];
      let x = b.minX;
      for (const r of sorted) { if (r.minX - x > 0.01) gaps.push([x, r.minX]); x = r.maxX; }
      if (b.maxX - x > 0.01) gaps.push([x, b.maxX]);
      for (const [g0, g1] of gaps) expect(g1 - g0).toBeGreaterThanOrEqual(6 - 1e-6);
      for (let lane = b.minX + 0.5; lane < b.maxX - 0.5; lane += 0.5) {
        const nearest = Math.min(...gaps.map(([g0, g1]) => Math.max(0, g0 - lane, lane - g1) + 0));
        expect(nearest).toBeLessThanOrEqual(10);
      }
    }
  });
});

describe('sliding gate', () => {
  const sched = buildSchedule(12345, 120);
  it('only moves while the light is green or warning: frozen for the whole red light', () => {
    for (const s of sched.filter((x) => x.signal === 'red')) {
      const a = gateRect(o, greenTime(sched, s.start + 1e-3));
      const z = gateRect(o, greenTime(sched, s.end - 1e-3));
      expect(z.minX).toBeCloseTo(a.minX, 9);
    }
    const g = sched.find((x) => x.signal === 'green')!;
    expect(gateRect(o, greenTime(sched, g.end - 0.5)).minX).not.toBeCloseTo(gateRect(o, greenTime(sched, g.start + 0.5)).minX, 3);
  });

  it('stays inside the fence margin over a whole round', () => {
    const b = geo.bounds!;
    for (let t = 0; t < 120; t += 0.1) {
      const r = gateRect(o, greenTime(sched, t));
      expect(r.minX).toBeGreaterThanOrEqual(b.minX + STAGE01_OBSTACLES.fenceMargin - 1e-6);
      expect(r.maxX).toBeLessThanOrEqual(b.maxX - STAGE01_OBSTACLES.fenceMargin + 1e-6);
    }
  });
});

describe('collision (the same step the server runs)', () => {
  it('stops a player who walks straight into a barricade', () => {
    const blocked = o.barricades.find((r) => r.minX < o.gate.centreX && r.maxX > o.gate.centreX)!; // a row with the centre closed
    let s = { x: o.gate.centreX, z: blocked.maxZ + 3, vx: 0, vz: 0 };
    const walls = [...geo.walls, ...obstacleWalls(o, 0)];
    for (let i = 0; i < 90; i++) s = step(s, { mx: 0, mz: -1 }, SIM_DT, walls);
    expect(s.z).toBeGreaterThanOrEqual(blocked.maxZ + MOVEMENT.capsuleRadius - 1e-6);
    expect(Math.abs(s.vz)).toBeLessThan(0.01);
  });

  it('lets a player through a gap', () => {
    const blocked = o.barricades.find((r) => r.minX < o.gate.centreX && r.maxX > o.gate.centreX)!;
    const rowZ = (blocked.minZ + blocked.maxZ) / 2;
    const half = (geo.bounds!.maxX - geo.bounds!.minX) / 2;
    let s = { x: o.gate.centreX + 0.31 * half, z: blocked.maxZ + 3, vx: 0, vz: 0 };
    const walls = [...geo.walls, ...obstacleWalls(o, 0)];
    for (let i = 0; i < 90; i++) s = step(s, { mx: 0, mz: -1 }, SIM_DT, walls);
    expect(s.z).toBeLessThan(rowZ - 2);
  });
});
