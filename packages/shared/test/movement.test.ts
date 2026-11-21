import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  MOVEMENT, SIM_DT, getStage, insideRect, inputFromKeys, sanitizeInput, sanitizeName, step,
  type MoveState,
} from '../src/index.ts';

const root = new URL('../../../', import.meta.url);
const load = (p: string) => JSON.parse(readFileSync(new URL(p, root), 'utf8'));
const geo = getStage().geometry; // from the approved stage metadata

describe('Stage 01 geometry from the approved metadata', () => {
  it('has 30 spawns in the start zone, walls, and finish/safe triggers', () => {
    expect(geo.spawns).toHaveLength(30);
    for (const s of geo.spawns) {
      expect(s.z).toBeGreaterThan(0); // behind the start line (game +Z)
      expect(s.z).toBeLessThan(12);
      expect(Math.abs(s.yaw)).toBeLessThan(1e-6); // facing the course (-Z)
    }
    expect(geo.walls).toHaveLength(4);
    expect(geo.finish).not.toBeNull();
    expect(geo.finishZ).toBeCloseTo(-160);
    expect(insideRect(geo.finish, 0, -161.5)).toBe(true);
  });
});

describe('movement (spec §2)', () => {
  const still: MoveState = { x: 0, z: 0, vx: 0, vz: 0 };
  const fwd = inputFromKeys(1, 0, 0);

  it('reaches walk speed in about 0.15 s', () => {
    let s = still;
    let t = 0;
    while (Math.hypot(s.vx, s.vz) < MOVEMENT.walkSpeed - 1e-9) { s = step(s, fwd, SIM_DT, []); t += SIM_DT; }
    expect(t).toBeLessThanOrEqual(0.15 + SIM_DT);
    expect(s.vz).toBeCloseTo(-4);
  });

  it('stops from full speed in about 0.12 s and about 0.25 m', () => {
    let s: MoveState = { x: 0, z: 0, vx: 0, vz: -4 };
    let t = 0;
    while (Math.hypot(s.vx, s.vz) > 0) { s = step(s, { mx: 0, mz: 0 }, SIM_DT, []); t += SIM_DT; }
    expect(t).toBeLessThanOrEqual(0.12 + SIM_DT);
    expect(-s.z).toBeLessThan(0.35);
  });

  it('never exceeds walk speed diagonally and cannot pass a wall', () => {
    let s: MoveState = { x: 25, z: -50, vx: 0, vz: 0 }; // inside the yard (game Z runs negative)
    const diag = inputFromKeys(1, 1, 0);
    for (let i = 0; i < 300; i++) {
      s = step(s, diag, SIM_DT, geo.walls);
      expect(Math.hypot(s.vx, s.vz)).toBeLessThanOrEqual(MOVEMENT.walkSpeed + 1e-9);
    }
    expect(s.x).toBeLessThanOrEqual(30 - MOVEMENT.capsuleRadius + 1e-6);
  });

  it('crosses from the front spawn row to the finish in about 41 s with no signals', () => {
    const sp = geo.spawns[0];
    let s: MoveState = { x: sp.x, z: sp.z, vx: 0, vz: 0 };
    let t = 0;
    while (!insideRect(geo.finish, s.x, s.z) && t < 120) { s = step(s, fwd, SIM_DT, geo.walls); t += SIM_DT; }
    expect(t).toBeGreaterThan(40);
    expect(t).toBeLessThan(41.5);
  });
});

describe('input and name sanitising', () => {
  it('rejects bad numbers and over-long vectors', () => {
    expect(sanitizeInput(NaN, 5)).toEqual({ mx: 0, mz: 1 });
    expect(sanitizeInput('x', null)).toEqual({ mx: 0, mz: 0 });
  });
  it('limits names', () => {
    expect(sanitizeName('  <b>Shaun</b>  ', 'Nomad')).toBe('bShaunb');
    expect(sanitizeName('', 'Nomad 3')).toBe('Nomad 3');
    expect(sanitizeName('x'.repeat(40), 'N')).toHaveLength(16);
  });
});
