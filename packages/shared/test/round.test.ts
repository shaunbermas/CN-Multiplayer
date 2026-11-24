import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  ROUND, RoundEngine, SIM_DT, buildSchedule, getStage, graceFor, newRoundPlayer, rankPlayers, segmentAt, shuffled,
  type RoundEvents, type RoundPlayer,
} from '../src/index.ts';

const root = new URL('../../../', import.meta.url);
const load = (p: string) => JSON.parse(readFileSync(new URL(p, root), 'utf8'));
const geo = getStage().geometry; // from the approved stage metadata

describe('signal schedule (spec §3)', () => {
  it('is seeded, contiguous and inside the spec ranges', () => {
    const a = buildSchedule(42), b = buildSchedule(42), c = buildSchedule(43);
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
    expect(a[0].signal).toBe('green');
    expect(a[0].end - a[0].start).toBeGreaterThanOrEqual(ROUND.firstGreenMinS);
    for (let i = 0; i < a.length; i++) {
      const s = a[i], len = s.end - s.start;
      if (i > 0) expect(s.start).toBeCloseTo(a[i - 1].end, 6);
      if (s.signal === 'green') { expect(len).toBeGreaterThanOrEqual(ROUND.greenMinS); expect(len).toBeLessThanOrEqual(ROUND.greenMaxS); }
      if (s.signal === 'warning') expect(len).toBeCloseTo(ROUND.warningS, 6);
      if (s.signal === 'red') { expect(len).toBeGreaterThanOrEqual(ROUND.redMinS); expect(len).toBeLessThanOrEqual(ROUND.redMaxS); }
      // every red comes straight after a warning
      if (s.signal === 'red') expect(a[i - 1].signal).toBe('warning');
    }
    expect(a[a.length - 1].end).toBeGreaterThanOrEqual(ROUND.roundS);
  });

  it('grace window is 0.3 s plus latency, capped at 0.5 s', () => {
    expect(graceFor(0)).toBeCloseTo(0.3);
    expect(graceFor(0.1)).toBeCloseTo(0.4);
    expect(graceFor(2)).toBeCloseTo(0.5);
  });

  it('shuffles rows deterministically per seed', () => {
    const ids = Array.from({ length: 30 }, (_, i) => `p${i}`);
    expect(shuffled(ids, 7)).toEqual(shuffled(ids, 7));
    expect(shuffled(ids, 7)).not.toEqual(ids);
    expect([...shuffled(ids, 7)].sort()).toEqual([...ids].sort());
  });
});

function runTo(engine: RoundEngine, players: RoundPlayer[], from: number, to: number, move: (p: RoundPlayer, t: number) => number) {
  const ev: RoundEvents = { spotted: [], finished: [] };
  for (let t = from; t < to; t += SIM_DT) {
    const e = engine.tick(t, players);
    ev.spotted.push(...e.spotted);
    for (const p of players) {
      if (!engine.canMove(p)) continue;
      const v = move(p, t - engine.goTime);
      const dz = -v * SIM_DT;
      p.z += dz;
      engine.afterMove(p, 0, dz, SIM_DT, ev);
    }
  }
  return ev;
}

describe('round engine (spec §4–§5)', () => {
  const setup = () => {
    const players = ['a', 'b', 'c'].map((id, i) => newRoundPlayer(id, i, 1, 0, 0));
    const engine = new RoundEngine(geo);
    engine.start(players, { seed: 99, roundS: 30, briefingS: 1 });
    return { engine, players };
  };

  it('walks through briefing, countdown, active, results, lobby', () => {
    const { engine, players } = setup();
    expect(engine.phase).toBe('briefing');
    engine.tick(1.01, players); expect(engine.phase).toBe('countdown');
    engine.tick(4.02, players); expect(engine.phase).toBe('active');
    expect(engine.signal()).toBe('green');
    const e = engine.tick(4.02 + 30.01, players);
    expect(engine.phase).toBe('results');
    expect(e.results).toHaveLength(3);
    engine.tick(4.02 + 30.01 + ROUND.resultsS + 0.01, players);
    expect(engine.phase).toBe('lobby');
  });

  it('assigns distinct spawns in a shuffled order', () => {
    const { players } = setup();
    expect(new Set(players.map((p) => p.spawn)).size).toBe(3);
  });

  it('spots movement during red after the grace window, never during green, warning or the grace', () => {
    const { engine, players } = setup();
    runTo(engine, players, 0, 4.1, () => 0); // briefing + countdown
    expect(engine.phase).toBe('active'); // goTime is known from here on
    const sched = engine.schedule;
    const firstRed = sched.find((s) => s.signal === 'red')!;
    // a: moves only during green (stops at warning start). b: keeps moving into red. c: moves only during the grace window.
    const ev = runTo(engine, players, 4.1, engine.goTime + firstRed.end - 0.1, (p, t) => {
      const seg = segmentAt(sched, t)!;
      if (p.id === 'a') return seg.signal === 'green' ? 4 : 0;
      if (p.id === 'b') return 4;
      if (p.id === 'c') return seg.signal === 'red' && t - seg.start < 0.2 ? 4 : 0;
      return 0;
    });
    expect(ev.spotted).toEqual(['b']);
    expect(players.find((p) => p.id === 'a')!.status).toBe('active');
    expect(players.find((p) => p.id === 'c')!.status).toBe('active');
  });

  it('ranks finishers by time, then progress, then spotted (latest first)', () => {
    const mk = (id: string, z: number, status: RoundPlayer['status'], ft = -1, st = -1) =>
      Object.assign(newRoundPlayer(id, 0, 1, 0, z), { status, finishTime: ft, spotTime: st });
    const order = rankPlayers([
      mk('slowFinish', -161, 'finished', 70), mk('fastFinish', -161, 'finished', 55),
      mk('far', -120, 'active'), mk('near', -10, 'active'),
      mk('spottedEarly', -30, 'spotted', -1, 10), mk('spottedLate', -5, 'spotted', -1, 40),
    ], geo).map((p) => p.id);
    expect(order).toEqual(['fastFinish', 'slowFinish', 'far', 'near', 'spottedLate', 'spottedEarly']);
  });
});
