// Stage 02 · AGAWAN BASE rules and map (handoff pack 02_STAGE_02_GAMEPLAY_MECHANICS_AND_RULES, 04_MAP_LAYOUT,
// 03_STAGE_02_TEST_MATRIX). Pure engine tests: no room, no network.
import { describe, expect, it } from 'vitest';
import { AGAWAN, AgawanEngine, getStage, findPath, newRoundPlayer, lineOfSight, agawanBotInput, makeBot, type AgawanBody, type TeamSlot } from '../src/index.ts';

const def = getStage(AGAWAN.id);
const layout = def.agawan!.layout;
const nav = def.agawan!.nav;
const DT = 1 / 30;

function body(id: string, n: number, x = 0, z = 0, yaw = 0): AgawanBody {
  return { ...newRoundPlayer(id, n, n, x, z), yaw };
}

/** An engine in its active phase with the given players and teams. */
function active(players: AgawanBody[], teams: Record<string, TeamSlot>, opts: { roundS?: number } = {}) {
  const e = new AgawanEngine(layout);
  e.start(players, { seed: 7, briefingS: 0, resultsS: 2, teams, ...opts });
  let now = 0;
  const run = (seconds: number) => { const end = now + seconds; let last; while (now < end - 1e-9) { now += DT; last = e.tick(now, players); if (last.results) return last; } return last; };
  while (e.phase !== 'active') { now += DT; e.tick(now, players); }
  return { e, run, at: () => now };
}

/** Put `a` right in front of `b`, facing them. */
function face(a: AgawanBody, b: AgawanBody, d = 1) { a.x = b.x; a.z = b.z + d; a.yaw = 0; } // yaw 0 faces -Z

describe('map', () => {
  it('has three bases with 10 spawns each, inside the block and clear of every wall', () => {
    for (const s of ['A', 'B', 'C'] as const) {
      expect(layout.bases[s].spawns).toHaveLength(10);
      for (const p of layout.bases[s].spawns) {
        expect(p.x).toBeGreaterThan(layout.bounds.minX); expect(p.x).toBeLessThan(layout.bounds.maxX);
        expect(p.z).toBeGreaterThan(layout.bounds.minZ); expect(p.z).toBeLessThan(layout.bounds.maxZ);
        for (const w of layout.walls) {
          const cx = Math.max(w.minX, Math.min(p.x, w.maxX)), cz = Math.max(w.minZ, Math.min(p.z, w.maxZ));
          expect(Math.hypot(p.x - cx, p.z - cz), `${s} spawn ${p.index} vs ${w.id}`).toBeGreaterThan(0.35);
        }
      }
    }
  });

  it('every pen holds 20 prisoners inside its fence, gate open, prisoners visible from outside', () => {
    for (const s of ['A', 'B', 'C'] as const) {
      const pen = layout.pens[s];
      expect(pen.slots).toHaveLength(20);
      for (const p of pen.slots) {
        expect(p.x).toBeGreaterThan(pen.area.minX + 0.3); expect(p.x).toBeLessThan(pen.area.maxX - 0.3);
        expect(p.z).toBeGreaterThan(pen.area.minZ + 0.3); expect(p.z).toBeLessThan(pen.area.maxZ - 0.3);
      }
      expect(new Set(pen.slots.map((p) => `${p.x},${p.z}`)).size).toBe(20);
      // Fences are see-through: a player outside the pen sees every prisoner.
      const outside = { x: (pen.area.minX + pen.area.maxX) / 2, z: pen.area.minZ - 1.2 };
      for (const p of pen.slots) expect(lineOfSight(outside.x, outside.z, p.x, p.z, layout.walls.filter((w) => !w.id.startsWith(`S02A_PEN_${s}`)))).toBe(true);
    }
  });

  it('base-to-base walking routes are within 5 percent of each other (fairness)', () => {
    const len = (a: TeamSlot, b: TeamSlot) => {
      const A = layout.bases[a], B = layout.bases[b];
      const pts = [[A.x, A.z], ...findPath(nav, A.x, A.z, B.x, B.z)];
      let d = 0; for (let i = 1; i < pts.length; i++) d += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
      return d;
    };
    const ds = [len('A', 'B'), len('A', 'C'), len('B', 'C')];
    for (const d of ds) expect(d).toBeGreaterThan(50);
    expect(Math.max(...ds) / Math.min(...ds)).toBeLessThan(1.05);
  });

  it('the pack route polylines keep a 2.5 m clear path (no obstacle seals a street)', () => {
    for (const r of layout.routes) {
      for (let i = 1; i < r.points.length; i++) {
        const [ax, az] = r.points[i - 1], [bx, bz] = r.points[i];
        const n = Math.ceil(Math.hypot(bx - ax, bz - az) / 0.5);
        for (let k = 0; k <= n; k++) {
          const x = ax + ((bx - ax) * k) / n, z = az + ((bz - az) * k) / n;
          // At this point some sideways offset within +-3 m leaves 1.25 m free on both sides.
          const ok = [-1.75, -1, 0, 1, 1.75].some((off) => {
            const dx = bz - az, dz = -(bx - ax), l = Math.hypot(dx, dz);
            const px = x + (dx / l) * off, pz = z + (dz / l) * off;
            return layout.walls.every((w) => {
              const cx = Math.max(w.minX, Math.min(px, w.maxX)), cz = Math.max(w.minZ, Math.min(pz, w.maxZ));
              return Math.hypot(px - cx, pz - cz) >= 1.25;
            });
          });
          expect(ok, `${r.id} blocked near (${x.toFixed(1)}, ${z.toFixed(1)})`).toBe(true);
        }
      }
    }
  });

  it('every base has at least two approaches (blocking one street still leaves a path)', () => {
    // Closing the plaza leaves the outer streets; closing a street leaves the plaza alleys.
    const plazaBlock = { ...layout.plaza };
    for (const [a, b] of [['A', 'B'], ['A', 'C'], ['B', 'C']] as const) {
      const A = layout.bases[a], B = layout.bases[b];
      expect(findPath(nav, A.x, A.z, B.x, B.z, [plazaBlock]).length, `${a}-${b} without the plaza`).toBeGreaterThan(0);
    }
  });
});

describe('start', () => {
  it('spawns every player at their own base and runs a 4:00 match', () => {
    const ps = Array.from({ length: 30 }, (_, i) => body(`p${i}`, i + 1));
    const teams = Object.fromEntries(ps.map((p, i) => [p.id, (['A', 'B', 'C'] as const)[i % 3]]));
    const { e } = active(ps, teams);
    expect(e.remaining()).toBeCloseTo(AGAWAN.matchS, 0);
    for (const p of ps) {
      const base = layout.bases[teams[p.id]];
      expect(Math.hypot(p.x - base.x, p.z - base.z)).toBeLessThan(12);
      expect(e.teamOf(p.id)).toBe(teams[p.id]);
    }
    expect(new Set(ps.map((p) => `${p.x},${p.z}`)).size).toBe(30);
  });
});

describe('tag', () => {
  it('holding E on a rival in reach captures them into the tagger\'s pen, +1 the first time only', () => {
    const a = body('a', 1), b = body('b', 2), c = body('c', 3);
    const { e, run } = active([a, b, c], { a: 'A', b: 'B', c: 'C' });
    b.x = 0; b.z = 0; face(a, b);
    e.setHold(a, true);
    run(0.3);
    expect(e.isImprisoned('b')).toBe(false); // 0.45 s hold
    run(0.25);
    expect(e.isImprisoned('b')).toBe(true);
    expect(e.state.get('b')!.pen).toBe('A');
    expect(b.status).toBe('captured');
    const slot = layout.pens.A.slots[e.state.get('b')!.slot];
    expect([b.x, b.z]).toEqual([slot.x, slot.z]);
    expect(e.publicState().teams[0].score).toBe(1);
    expect(e.canMove(b)).toBe(false);
    // Released, tagged again by the same team: no second point.
    run(AGAWAN.prison.maxS + AGAWAN.protectS + 0.2);
    expect(e.isImprisoned('b')).toBe(false);
    b.x = 0; b.z = 0; face(a, b);
    e.setHold(a, false); e.setHold(a, true);
    run(0.6);
    expect(e.isImprisoned('b')).toBe(true);
    expect(e.publicState().teams[0].score).toBe(1);
    expect(e.state.get('a')!.tags).toBe(2);
  });

  it('refuses teammates, rivals behind you, out of reach or behind a wall', () => {
    const a = body('a', 1), mate = body('m', 2), b = body('b', 3);
    const { e, run } = active([a, mate, b], { a: 'A', m: 'A', b: 'B' });
    mate.x = 0; mate.z = 0; face(a, mate);
    b.x = 30; b.z = 30;
    e.setHold(a, true); run(1);
    expect(e.isImprisoned('m')).toBe(false);
    // behind
    b.x = 0; b.z = 0; a.x = 0; a.z = -1; a.yaw = 0; mate.x = 20; mate.z = 0;
    run(1);
    expect(e.isImprisoned('b')).toBe(false);
    // too far
    face(a, b, AGAWAN.tag.distM + 0.3); run(1);
    expect(e.isImprisoned('b')).toBe(false);
    // wall in between: a house corner between them
    const house = layout.walls.find((w) => w.id === 'S02A_HOUSE_IS')!;
    b.x = (house.minX + house.maxX) / 2; b.z = house.minZ - 0.4; a.x = b.x; a.z = house.maxZ + 0.4; a.yaw = 0;
    run(1);
    expect(e.isImprisoned('b')).toBe(false);
  });

  it('two attackers finishing on the same rival in one tick: only the first captures', () => {
    const a = body('a', 1), c = body('c', 2), b = body('b', 3);
    const { e, run } = active([a, c, b], { a: 'A', c: 'C', b: 'B' });
    b.x = 0; b.z = 0;
    a.x = 0; a.z = 1; a.yaw = 0;
    c.x = 0; c.z = -1; c.yaw = Math.PI;
    e.setHold(a, true); e.setHold(c, true);
    run(0.6);
    expect(e.state.get('b')!.pen).toBe('A'); // a joined first
    expect(e.state.get('c')!.tags).toBe(0);
    const occupied = [...e.occupancy.values()].flat().filter((x) => x === 'b');
    expect(occupied).toHaveLength(1);
  });

  it('a raider who is tagged mid-raid loses the raid', () => {
    const a = body('a', 1), b = body('b', 2);
    const { e, run } = active([a, b], { a: 'A', b: 'B' });
    const base = layout.bases.B;
    a.x = base.x; a.z = base.z - 1; e.setHold(a, true);
    run(1.0);
    expect(e.state.get('a')!.action?.kind).toBe('raid');
    face(b, a); e.setHold(b, true);
    run(0.6);
    expect(e.isImprisoned('a')).toBe(true);
    run(1);
    expect(e.publicState().teams[0].raids).toBe(0);
  });
});

describe('prison, rescue and release', () => {
  it('releases a prisoner after 15 s at their own base with 2 s of protection', () => {
    const a = body('a', 1), b = body('b', 2);
    const { e, run } = active([a, b], { a: 'A', b: 'B' });
    b.x = 0; b.z = 0; face(a, b); e.setHold(a, true); run(0.6);
    e.setHold(a, false);
    run(AGAWAN.prison.maxS - 0.5);
    expect(e.isImprisoned('b')).toBe(true);
    run(0.6);
    expect(e.isImprisoned('b')).toBe(false);
    expect(b.status).toBe('active');
    expect(Math.hypot(b.x - layout.bases.B.x, b.z - layout.bases.B.z)).toBeLessThan(12);
    expect(e.privateState('b')!.protectLeft).toBeGreaterThan(1.3);
    expect(e.occupancy.get('A')!.every((x) => x === null)).toBe(true);
    // Protected: cannot be tagged.
    face(a, b); e.setHold(a, true); run(1);
    expect(e.isImprisoned('b')).toBe(false);
  });

  it('a teammate holding E beside the prisoner for 1 s frees them, +1 once per teammate', () => {
    const a = body('a', 1), b = body('b', 2), b2 = body('b2', 3);
    const { e, run } = active([a, b, b2], { a: 'A', b: 'B', b2: 'B' });
    b.x = 0; b.z = 0; face(a, b); e.setHold(a, true); run(0.6); e.setHold(a, false);
    a.x = 40; a.z = 0;
    b2.x = b.x + 1; b2.z = b.z; e.setHold(b2, true);
    run(0.9);
    expect(e.isImprisoned('b')).toBe(true);
    run(0.2);
    expect(e.isImprisoned('b')).toBe(false);
    expect(e.publicState().teams[1].score).toBe(1);
    expect(e.state.get('b2')!.rescues).toBe(1);
  });

  it('rescue and automatic release racing: exactly one wins and the slot is freed once', () => {
    const a = body('a', 1), b = body('b', 2), b2 = body('b2', 3);
    const { e, run } = active([a, b, b2], { a: 'A', b: 'B', b2: 'B' });
    b.x = 0; b.z = 0; face(a, b); e.setHold(a, true); run(0.6); e.setHold(a, false); a.x = 40; a.z = 0;
    run(AGAWAN.prison.maxS - 1.0);
    b2.x = b.x + 1; b2.z = b.z; e.setHold(b2, true); // rescue would complete just as the timer runs out
    run(1.2);
    expect(e.isImprisoned('b')).toBe(false);
    const team = e.publicState().teams[1];
    expect(e.state.get('b2')!.rescues + (team.score === 0 ? 1 : 0)).toBe(1);
    expect(e.occupancy.get('A')!.filter((x) => x !== null)).toHaveLength(0);
  });

  it('20 prisoners get 20 different slots; leavers never keep one', () => {
    const tagger = body('t', 1);
    const victims = Array.from({ length: 20 }, (_, i) => body(`v${i}`, i + 2));
    const teams: Record<string, TeamSlot> = { t: 'A', ...Object.fromEntries(victims.map((v, i) => [v.id, i % 2 ? 'B' : 'C'])) };
    const ps = [tagger, ...victims];
    const { e, run } = active(ps, teams);
    for (const v of victims) {
      v.x = 0; v.z = 0; face(tagger, v); e.setHold(tagger, false); e.setHold(tagger, true);
      run(AGAWAN.tag.cooldownS + 0.5);
      expect(e.isImprisoned(v.id), v.id).toBe(true);
      e.state.get(v.id)!.releaseAt = Infinity; // one tagger needs longer than 15 s to fill a pen
      for (const o of victims) if (!e.isImprisoned(o.id)) { o.x = 40; o.z = -30; }
    }
    expect(new Set(victims.map((v) => e.state.get(v.id)!.slot)).size).toBe(20);
    // One prisoner leaves the room for good: their slot frees on the next tick.
    const gone = victims[0];
    const left = ps.filter((p) => p !== gone);
    e.tick(e.now + DT, left);
    expect(e.occupancy.get('A')!.includes(gone.id)).toBe(false);
  });
});

describe('base raid', () => {
  it('holding E for 1.5 s on an enemy marker scores 5; the cooldown is per attacking team and base', () => {
    const a = body('a', 1), c = body('c', 2), b = body('b', 3);
    const { e, run } = active([a, c, b], { a: 'A', c: 'C', b: 'B' });
    b.x = 40; b.z = -30;
    const base = layout.bases.B;
    a.x = base.x + 1; a.z = base.z; e.setHold(a, true);
    run(1.4);
    expect(e.publicState().teams[0].score).toBe(0);
    run(0.2);
    expect(e.publicState().teams[0].score).toBe(5);
    expect(e.publicState().raidCd.AB).toBeGreaterThan(19);
    run(3);
    expect(e.publicState().teams[0].score).toBe(5); // A's cooldown on B
    // Team C may raid B at the same time.
    c.x = base.x - 1; c.z = base.z; e.setHold(c, true);
    run(1.6);
    expect(e.publicState().teams[2].score).toBe(5);
    // Own base: nothing.
    a.x = layout.bases.A.x; a.z = layout.bases.A.z; run(3);
    expect(e.publicState().teams[0].raids).toBe(1);
    // A can raid C's base (another pair).
    a.x = layout.bases.C.x; a.z = layout.bases.C.z - 1; run(1.6);
    expect(e.publicState().teams[0].raids).toBe(2);
  });

  it('standing in a base without holding E scores nothing', () => {
    const a = body('a', 1), b = body('b', 2);
    const { e, run } = active([a, b], { a: 'A', b: 'B' });
    a.x = layout.bases.B.x; a.z = layout.bases.B.z; run(5);
    expect(e.publicState().teams[0].score).toBe(0);
  });
});

describe('match end', () => {
  it('the highest score wins; placements give 2 / 1 / 0 board points and team places 1 / 2 / 3; nothing scores after the end', () => {
    const a = body('a', 1), b = body('b', 2), c = body('c', 3);
    const { e, run } = active([a, b, c], { a: 'A', b: 'B', c: 'C' }, { roundS: 8 });
    a.x = layout.bases.B.x; a.z = layout.bases.B.z; e.setHold(a, true);
    b.x = 0; b.z = 0; face(c, b); e.setHold(c, true);
    const ev = run(10)!;
    expect(ev.results).toBeDefined();
    expect(e.winners).toEqual(['A']);
    const pts = Object.fromEntries(ev.results!.map((r) => [r.id, r.points]));
    expect(pts).toEqual({ a: 2, c: 1, b: 0 });
    expect(Object.fromEntries(ev.results!.map((r) => [r.id, r.teamPlace]))).toEqual({ a: 1, c: 2, b: 3 });
    expect(e.phase).toBe('results');
    expect(e.state.get('b')!.pen).toBeNull(); // prisoners cleared
    const before = JSON.stringify(e.publicState().teams);
    run(1);
    expect(JSON.stringify(e.publicState().teams)).toBe(before);
  });

  it('a tie at the top starts 30 s of sudden death; the first raid wins at once', () => {
    const a = body('a', 1), b = body('b', 2), c = body('c', 3);
    const { e, run } = active([a, b, c], { a: 'A', b: 'B', c: 'C' }, { roundS: 6 });
    run(6.1);
    expect(e.sudden).toBe(true);
    expect(e.phase).toBe('active');
    expect(e.remaining()).toBeGreaterThan(29);
    b.x = layout.bases.C.x; b.z = layout.bases.C.z; e.setHold(b, true);
    const ev = run(2)!;
    expect(ev.results).toBeDefined();
    expect(e.winners).toEqual(['B']);
    expect(e.phase).toBe('results');
  });

  it('sudden death without a raid: tie-break on raids, unique tags, unique rescues, then a shared place', () => {
    const a = body('a', 1), b = body('b', 2), c = body('c', 3);
    const { e, run } = active([a, b, c], { a: 'A', b: 'B', c: 'C' }, { roundS: 6 });
    // A tags B (+1); C tags... nobody; give C one point by a first rescue? Keep it simple: tie A and C on score.
    b.x = 0; b.z = 0; face(a, b); e.setHold(a, true); run(0.6); e.setHold(a, false); a.x = 40; a.z = -30;
    e.teams.get('C')!.score = 1; // C level on score but no unique tags
    const ev = run(40)!;
    expect(ev.results).toBeDefined();
    expect(e.winners).toEqual(['A']); // more unique opponents tagged
    // Fully level: shared first place.
    const x = body('x', 1), y = body('y', 2), z = body('z', 3);
    const r2 = active([x, y, z], { x: 'A', y: 'B', z: 'C' }, { roundS: 5 });
    const ev2 = r2.run(40)!;
    expect(r2.e.winners).toEqual(['A', 'B', 'C']);
    expect(ev2.results!.every((r) => r.points === 2 && r.teamPlace === 1)).toBe(true);
  });
});

describe('bots', () => {
  it('a bot raider walks to an enemy base and raids it on its own', () => {
    const bot = body('bot', 1), b = body('b', 2), c = body('c', 3);
    const brain = makeBot(3);
    const ps = [bot, b, c];
    const { e } = active(ps, { bot: 'A', b: 'B', c: 'C' });
    brain.agawan = undefined;
    // Force the raider job (seeded jobs vary).
    const m = { ...brain }; agawanBotInput(m, bot, e.privateState('bot'), e, e.publicState(), ps, nav, e.now); m.agawan!.job = 'raider';
    b.x = 44; b.z = -38; c.x = -44; c.z = -38; // rivals out of the way
    let now = e.now;
    for (let i = 0; i < 30 * 40 && e.publicState().teams[0].raids === 0; i++) {
      const act = agawanBotInput(m, bot, e.privateState('bot'), e, e.publicState(), ps, nav, now);
      e.setHold(bot, act.hold);
      if (act.hold || act.mx || act.mz) { bot.x += act.mx * 4 * DT; bot.z += act.mz * 4 * DT; bot.yaw = act.yaw; }
      now += DT; e.tick(now, ps);
    }
    expect(e.publicState().teams[0].raids).toBe(1);
  });
});
