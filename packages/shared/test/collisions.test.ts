// Stage 01 refinement: player-to-player collisions (packages/shared/src/collisions.ts).
import { describe, expect, it } from 'vitest';
import { COLLISION, MOVEMENT, RoundEngine, SIM_DT, getStage, newRoundPlayer, resolvePlayerContacts, step, type CollisionBody, type RoundEvents } from '../src/index.ts';

const geo = getStage().geometry;
const body = (id: string, x: number, z: number, vx = 0, vz = 0): CollisionBody => ({ id, x, z, vx, vz, downUntil: 0, immuneUntil: 0 });

describe('player collisions', () => {
  it('uses exactly two capsule radii as the contact distance', () => {
    expect(COLLISION.contactDist).toBeCloseTo(2 * MOVEMENT.capsuleRadius, 9);
    const a = body('a', 0, 0), b = body('b', 0.61, 0);
    expect(resolvePlayerContacts([a, b], 0, [])).toEqual([]);
    expect(a.x).toBe(0); // not touching: nothing moves
  });

  it('a hard hit knocks BOTH players down, zeroes their velocity and separates them', () => {
    const a = body('a', 0, 0, 0, -4), b = body('b', 0, -0.5); // a walks into b standing still
    const k = resolvePlayerContacts([a, b], 10, []);
    expect(k).toHaveLength(1);
    expect(k[0]).toMatchObject({ a: 'a', b: 'b' });
    expect(k[0].impact).toBeCloseTo(4, 6);
    for (const p of [a, b]) {
      expect(p.downUntil).toBeCloseTo(10 + COLLISION.fallS + COLLISION.recoverS, 6);
      expect(p.immuneUntil).toBeCloseTo(p.downUntil + COLLISION.immuneS, 6);
      expect(p.vx).toBe(0); expect(p.vz).toBe(0);
    }
    expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThanOrEqual(COLLISION.contactDist);
  });

  it('accounts for direction: brushing past side by side or a slow nudge only pushes apart', () => {
    const a = body('a', 0, 0, 0, -4), b = body('b', 0.5, 0, 0, -4); // walking together
    expect(resolvePlayerContacts([a, b], 0, [])).toEqual([]);
    expect(a.downUntil).toBe(0);
    const c = body('c', 0, 0, 0, -1), d = body('d', 0, -0.5); // slow nudge, 1 m/s
    expect(resolvePlayerContacts([c, d], 0, [])).toEqual([]);
    expect(Math.hypot(c.x - d.x, c.z - d.z)).toBeGreaterThanOrEqual(COLLISION.contactDist);
    expect(d.vx).toBe(0); expect(d.vz).toBe(0); // the standing player never gains velocity from a push
  });

  it('a head-on hit counts both speeds', () => {
    const a = body('a', 0, 0, 0, -1), b = body('b', 0, -0.55, 0, 1);
    expect(resolvePlayerContacts([a, b], 0, [])[0].impact).toBeCloseTo(2, 6);
  });

  it('cannot chain: down or recently-recovered players are not knocked down again', () => {
    const a = body('a', 0, 0, 0, -4), b = body('b', 0, -0.5);
    resolvePlayerContacts([a, b], 0, []);
    const c = body('c', 0, -1.0, 0, 4); // charges into b while it is down
    b.x = 0; b.z = -0.6;
    expect(resolvePlayerContacts([b, c], 0.5, [])).toEqual([]);
    expect(c.downUntil).toBe(0);
    // just after standing up (immune window) b is still protected
    const back = b.downUntil + 0.1;
    const d = body('d', b.x, b.z + 0.5, 0, -4);
    expect(resolvePlayerContacts([b, d], back, [])).toEqual([]);
    // after the immune window a new hit works again
    const later = b.immuneUntil + 0.01;
    const e = body('e', b.x, b.z + 0.5, 0, -4);
    expect(resolvePlayerContacts([b, e], later, [])).toHaveLength(1);
  });

  it('never pushes anyone through a wall, and separates players spawned on the same point', () => {
    const wall = { id: 'W', minX: 1, maxX: 2, minZ: -5, maxZ: 5 };
    const a = body('a', 0.65, 0), b = body('b', 0.65, 0);
    resolvePlayerContacts([a, b], 0, [wall]);
    for (const p of [a, b]) expect(p.x).toBeLessThanOrEqual(1 - MOVEMENT.capsuleRadius + 1e-6);
    expect(Math.abs(a.x - b.x) + Math.abs(a.z - b.z)).toBeGreaterThan(0);
  });

  it('falling is not elimination: a knocked-down player in a red light is not spotted', () => {
    const players = ['a', 'b'].map((id, i) => newRoundPlayer(id, i, 1, 0, 0));
    const engine = new RoundEngine(geo);
    engine.start(players, { seed: 99, roundS: 30, briefingS: 0 });
    let t = 0;
    for (; engine.phase !== 'active'; t += SIM_DT) engine.tick(t, players);
    const red = engine.schedule.find((s) => s.signal === 'red')!;
    // Put b standing, a walking into it right as red begins (+ grace): a is the mover.
    const [a, b] = players;
    Object.assign(a, { x: 0, z: -10 }); Object.assign(b, { x: 0, z: -10.5 });
    const ev: RoundEvents = { spotted: [], finished: [] };
    const st = { a: { vx: 0, vz: -4 }, b: { vx: 0, vz: 0 } };
    for (; t < engine.goTime + red.start + 1.5; t += SIM_DT) {
      engine.tick(t, players);
      const bodies = players.map((p) => ({ ...p, ...st[p.id as 'a' | 'b'] })) as unknown as CollisionBody[];
      const k = resolvePlayerContacts(bodies, t, []);
      bodies.forEach((bd, i) => Object.assign(players[i], { x: bd.x, z: bd.z, downUntil: bd.downUntil, immuneUntil: bd.immuneUntil }));
      if (k.length) { st.a = { vx: 0, vz: 0 }; }
      // b sends no movement at all; a keeps pushing until it is down
      if (engine.canMove(a) && st.a.vz) { const n = step({ x: a.x, z: a.z, vx: 0, vz: -4 }, { mx: 0, mz: -1 }, SIM_DT, []); engine.afterMove(a, n.x - a.x, n.z - a.z, SIM_DT, ev); a.x = n.x; a.z = n.z; }
    }
    expect(b.status).toBe('active');
    expect(b.downUntil).toBeGreaterThan(0);
  });
});
