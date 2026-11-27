// Stage 01 refinement: server-side bots (packages/shared/src/bots.ts) in a headless simulation of the room's loop
// (same order as apps/server/src/room.ts simStep: engine tick, bot inputs, movement with walls and obstacles,
// red-light detection, player collisions). No sockets, no browsers.
import { describe, expect, it } from 'vitest';
import {
  MOVEMENT, ROUND, RoundEngine, SIM_DT, botInput, botNames, getStage, greenTime, makeBot, newRoundPlayer, obstacleGapRows, obstacleWalls,
  resolveObstacles, resolvePlayerContacts, segmentAt, step, type BotBrain, type RoundEvents, type RoundPlayer,
} from '../src/index.ts';

const geo = getStage().geometry;
const obs = resolveObstacles(geo);
const rows = obstacleGapRows(obs, geo);

type SimPlayer = RoundPlayer & { vx: number; vz: number; bot: BotBrain };

export function simulateStage(n: number, seed: number, roundS: number = ROUND.roundS) {
  const players: SimPlayer[] = Array.from({ length: n }, (_, i) => {
    const s = geo.spawns[i];
    return { ...newRoundPlayer(`b${i}`, i, s.index, s.x, s.z), vx: 0, vz: 0, bot: makeBot(seed * 131 + i) };
  });
  const engine = new RoundEngine(geo);
  engine.start(players, { seed, roundS, briefingS: 0, obstacles: true });
  let t = 0, knockdowns = 0, maxSpeed = 0, maxTickMs = 0;
  const ev: RoundEvents = { spotted: [], finished: [] };
  while (engine.phase !== 'results' && t < roundS + 10) {
    t += SIM_DT;
    const t0 = performance.now();
    engine.tick(t, players);
    const sinceGo = t - engine.goTime;
    const seg = engine.phase === 'active' ? segmentAt(engine.schedule, sinceGo) : null;
    const gt = engine.phase === 'active' ? greenTime(engine.schedule, Math.max(0, sinceGo)) : 0;
    const walls = [...geo.walls, ...obstacleWalls(obs, gt)];
    const others = players.filter((p) => p.status === 'active').map((p) => ({ x: p.x, z: p.z }));
    for (const p of players) {
      const mv = botInput(p.bot, { now: t, phase: engine.phase, signal: engine.signal(), into: seg ? sinceGo - seg.start : 0, segStart: seg?.start ?? -1,
        gateGreenTime: gt, x: p.x, z: p.z, status: p.status, down: p.downUntil > t, others }, geo, rows, obs);
      if (!engine.canMove(p)) { p.vx = 0; p.vz = 0; continue; }
      const ox = p.x, oz = p.z;
      const nx = step(p, mv, SIM_DT, walls);
      Object.assign(p, nx);
      maxSpeed = Math.max(maxSpeed, Math.hypot(p.vx, p.vz));
      engine.afterMove(p, p.x - ox, p.z - oz, SIM_DT, ev);
    }
    if (engine.phase === 'active') knockdowns += resolvePlayerContacts(players.filter((p) => p.status === 'active'), t, walls).length;
    maxTickMs = Math.max(maxTickMs, performance.now() - t0);
  }
  const finished = players.filter((p) => p.status === 'finished');
  return {
    finished: finished.length, spotted: players.filter((p) => p.status === 'spotted').length, caught: players.reduce((n, p) => n + (p.catches ?? 0), 0), active: players.filter((p) => p.status === 'active').length,
    firstFinish: Math.min(...finished.map((p) => p.finishTime)), lastFinish: Math.max(...finished.map((p) => p.finishTime)),
    knockdowns, maxSpeed, maxTickMs, players, results: engine.lastResults,
  };
}

describe('bots', () => {
  it('have varied, seeded personalities within the approved walk speed', () => {
    const a = makeBot(1), b = makeBot(2), a2 = makeBot(1);
    expect(a.pace).toBe(a2.pace);
    expect(a.pace).not.toBe(b.pace);
    for (let i = 0; i < 200; i++) {
      const x = makeBot(i);
      expect(x.pace).toBeGreaterThanOrEqual(0.72); expect(x.pace).toBeLessThanOrEqual(1);
      expect(x.reaction).toBeGreaterThanOrEqual(0.08); expect(x.reaction).toBeLessThanOrEqual(0.5);
    }
  });

  it('get distinct, consistent names that avoid names already in the room', () => {
    const n = botNames(42, 29, ['Nova']);
    expect(new Set(n).size).toBe(29);
    expect(n).not.toContain('Nova');
    expect(botNames(42, 29, ['Nova'])).toEqual(n);
  });

  it('stand still outside green, and never move while knocked down', () => {
    const b = makeBot(3);
    const base = { now: 1, into: 0.1, segStart: 0, gateGreenTime: 0, x: 0, z: 0, status: 'active', down: false, others: [] };
    expect(botInput(b, { ...base, phase: 'lobby', signal: 'none' }, geo, rows, obs)).toEqual({ mx: 0, mz: 0 });
    expect(botInput(b, { ...base, phase: 'active', signal: 'green', down: true }, geo, rows, obs)).toEqual({ mx: 0, mz: 0 });
    const go = botInput(b, { ...base, phase: 'active', signal: 'green' }, geo, rows, obs);
    expect(go.mz).toBeLessThan(0);
    expect(Math.hypot(go.mx, go.mz)).toBeLessThanOrEqual(1 + 1e-9);
  });

  it('a full 30-bot stage: bots finish, some get caught and frozen (never out), bumps happen, nobody gets stuck or speeds', () => {
    const runs = [11, 22, 33].map((s) => simulateStage(30, s));
    for (const r of runs) {
      expect(r.maxSpeed).toBeLessThanOrEqual(MOVEMENT.walkSpeed + 1e-6);
      expect(r.finished).toBeGreaterThanOrEqual(12);   // most bots get through the course
      expect(r.caught).toBeGreaterThanOrEqual(1);      // some fail to stop in time and are frozen (decision 054)
      expect(r.spotted).toBe(0);                       // nobody is eliminated any more
      expect(r.finished + r.active).toBe(30);
      expect(r.maxTickMs).toBeLessThan(25);            // one tick for 30 players stays far below the 33 ms budget
    }
    expect(runs.reduce((n, r) => n + r.knockdowns, 0)).toBeGreaterThan(0); // collisions do happen in a crowd
    // Report the numbers used to choose the round length (docs/STAGE_01_REFINEMENT_IMPLEMENTATION.md).
    console.log(JSON.stringify(runs.map((r) => ({ finished: r.finished, caught: r.caught, unfinished: r.active, first: +r.firstFinish.toFixed(1), last: +r.lastFinish.toFixed(1), knockdowns: r.knockdowns, maxTickMs: +r.maxTickMs.toFixed(2) }))));
  });
});
