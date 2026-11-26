// Stage 02 · AGAWAN BASE rules and map (handoff pack 02_STAGE_02_GAMEPLAY_MECHANICS_AND_RULES, 04_MAP_LAYOUT,
// 03_STAGE_02_TEST_MATRIX). Pure engine tests: no room, no network.
import { describe, expect, it } from 'vitest';
import { simulateAgawan } from './agawanSim.ts';
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

function inRing(p: AgawanBody, slot: TeamSlot, i = 0) { const b = layout.bases[slot]; p.x = b.x + Math.cos(i) * 1.2; p.z = b.z + Math.sin(i) * 1.2; }

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

/** One press of E (down this tick, up the next). */
function press(e: AgawanEngine, p: AgawanBody, run: (s: number) => unknown) { e.setHold(p, true); run(DT); e.setHold(p, false); run(AGAWAN.health.hitCooldownS); }

describe('hearts and hits (decision 047)', () => {
  it('each press on a rival in reach takes one heart; the third captures them into the attacker\'s pen, +1', () => {
    const a = body('a', 1), b = body('b', 2), c = body('c', 3);
    const { e, run } = active([a, b, c], { a: 'A', b: 'B', c: 'C' });
    b.x = 0; b.z = 0; face(a, b);
    expect(e.state.get('b')!.hp).toBe(AGAWAN.health.max);
    press(e, a, run); face(a, b);
    expect(e.state.get('b')!.hp).toBe(2);
    expect(Math.hypot(b.x, b.z)).toBeGreaterThan(0.3); // knocked back
    press(e, a, run); face(a, b);
    expect(e.state.get('b')!.hp).toBe(1);
    expect(e.isImprisoned('b')).toBe(false);
    press(e, a, run);
    expect(e.isImprisoned('b')).toBe(true);
    expect(e.state.get('b')!.pen).toBe('A');
    expect(b.status).toBe('captured');
    const slot = layout.pens.A.slots[e.state.get('b')!.slot];
    expect([b.x, b.z]).toEqual([slot.x, slot.z]);
    expect(e.publicState().teams[0].score).toBe(AGAWAN.points.capture);
    expect(e.publicState().teams[0].captures).toBe(1);
  });

  it('presses faster than the cooldown do not count; holding E keeps hitting, slower', () => {
    const a = body('a', 1), b = body('b', 2), c = body('c', 3);
    const { e, run } = active([a, b, c], { a: 'A', b: 'B', c: 'C' });
    b.x = 0; b.z = 0; face(a, b);
    e.setHold(a, true); run(DT); e.setHold(a, false); run(DT); e.setHold(a, true); run(DT); e.setHold(a, false); run(DT);
    expect(e.state.get('b')!.hp).toBe(2);
    run(1); face(a, b);
    e.setHold(a, true);
    run(DT); face(a, b);
    expect(e.state.get('b')!.hp).toBe(1);
    run(AGAWAN.health.holdRepeatS + 0.05);
    expect(e.isImprisoned('b')).toBe(true);
  });

  it('refuses teammates, rivals behind you, out of reach or behind a wall', () => {
    const a = body('a', 1), b = body('b', 2), mate = body('m', 3), c = body('c', 4);
    const { e, run } = active([a, b, mate, c], { a: 'A', b: 'B', m: 'A', c: 'C' });
    mate.x = 0; mate.z = 0; face(a, mate); b.x = 30; b.z = 30;
    press(e, a, run);
    expect(e.state.get('m')!.hp).toBe(AGAWAN.health.max);
    b.x = 0; b.z = 0; a.x = 0; a.z = 1; a.yaw = Math.PI; // facing away
    press(e, a, run);
    expect(e.state.get('b')!.hp).toBe(AGAWAN.health.max);
    b.x = 0; b.z = 0; face(a, b, AGAWAN.health.reachM + 0.3);
    press(e, a, run);
    expect(e.state.get('b')!.hp).toBe(AGAWAN.health.max);
    const w = layout.walls.find((x) => x.kind === 'house' && x.maxX - x.minX > 6)!;
    b.x = (w.minX + w.maxX) / 2; b.z = w.minZ - 0.6; a.x = b.x; a.z = w.maxZ + 0.6; a.yaw = 0;
    if (Math.hypot(a.x - b.x, a.z - b.z) <= AGAWAN.health.reachM) {
      press(e, a, run);
      expect(e.state.get('b')!.hp).toBe(AGAWAN.health.max);
    }
  });

  it('protected (just released) players cannot be hit and cannot hit', () => {
    const a = body('a', 1), b = body('b', 2), c = body('c', 3);
    const { e, run } = active([a, b, c], { a: 'A', b: 'B', c: 'C' });
    e.state.get('b')!.protectUntil = e.now + 5;
    b.x = 0; b.z = 0; face(a, b);
    press(e, a, run);
    expect(e.state.get('b')!.hp).toBe(AGAWAN.health.max);
  });
});

describe('prison, rescue, release and healing', () => {
  function capture(e: AgawanEngine, a: AgawanBody, b: AgawanBody, run: (s: number) => unknown) {
    for (let i = 0; i < AGAWAN.health.max && !e.isImprisoned(b.id); i++) { if (!e.isImprisoned(b.id)) { const bx = b.x, bz = b.z; face(a, { ...b, x: bx, z: bz }); press(e, a, run); } }
  }

  it('releases a prisoner after 15 s at their own base with 1 heart and 2 s of protection', () => {
    const a = body('a', 1), b = body('b', 2), c = body('c', 3);
    const { e, run } = active([a, b, c], { a: 'A', b: 'B', c: 'C' });
    b.x = 0; b.z = 0;
    capture(e, a, b, run);
    expect(e.isImprisoned('b')).toBe(true);
    run(AGAWAN.prison.maxS - 0.5);
    expect(e.isImprisoned('b')).toBe(true);
    run(0.6);
    expect(e.isImprisoned('b')).toBe(false);
    expect(b.status).toBe('active');
    expect(e.state.get('b')!.hp).toBe(AGAWAN.health.afterRelease);
    expect(Math.hypot(b.x - layout.bases.B.x, b.z - layout.bases.B.z)).toBeLessThan(12);
    expect(e.publicState().protected).toContain('b');
  });

  it('hearts do not come back in the street, only in a base the team owns', () => {
    const a = body('a', 1), b = body('b', 2), c = body('c', 3);
    const { e, run } = active([a, b, c], { a: 'A', b: 'B', c: 'C' });
    e.state.get('b')!.hp = 1;
    b.x = 0; b.z = 0; a.x = 40; a.z = 40;
    run(5);
    expect(e.state.get('b')!.hp).toBe(1);
    b.x = layout.bases.A.x; b.z = layout.bases.A.z; // an enemy base heals nothing
    run(3);
    expect(e.state.get('b')!.hp).toBe(1);
    b.x = layout.bases.B.x + 1; b.z = layout.bases.B.z; // home
    run(AGAWAN.health.healEveryS * 2 + 0.1);
    expect(e.state.get('b')!.hp).toBe(AGAWAN.health.max);
  });

  it('a teammate holding E beside the prisoner for 1 s frees them, +1', () => {
    const a = body('a', 1), b = body('b', 2), mate = body('m', 3), c = body('c', 4);
    const { e, run } = active([a, b, mate, c], { a: 'A', b: 'B', m: 'B', c: 'C' });
    b.x = 0; b.z = 0; mate.x = 40; mate.z = 40;
    capture(e, a, b, run);
    a.x = -40; a.z = -40;
    mate.x = b.x; mate.z = b.z + 1.2;
    e.setHold(mate, true);
    run(0.8);
    expect(e.isImprisoned('b')).toBe(true);
    run(0.3);
    expect(e.isImprisoned('b')).toBe(false);
    expect(e.publicState().teams[1].score).toBe(AGAWAN.points.rescue);
  });

  it('rescue and automatic release racing: exactly one wins and the slot is freed once', () => {
    const a = body('a', 1), b = body('b', 2), mate = body('m', 3), c = body('c', 4);
    const { e, run } = active([a, b, mate, c], { a: 'A', b: 'B', m: 'B', c: 'C' });
    b.x = 0; b.z = 0; mate.x = 40; mate.z = 40;
    capture(e, a, b, run);
    a.x = -40; a.z = -40;
    run(AGAWAN.prison.maxS - 1.0);
    mate.x = b.x; mate.z = b.z + 1.2;
    e.setHold(mate, true);
    run(1.5);
    expect(e.isImprisoned('b')).toBe(false);
    expect(e.occupancy.get('A')!.filter(Boolean)).toHaveLength(0);
  });

  it('20 prisoners get 20 different slots; leavers never keep one', () => {
    const ps = Array.from({ length: 21 }, (_, i) => body(`p${i}`, i + 1, 40, 40));
    const teams: Record<string, TeamSlot> = { p0: 'A' };
    for (let i = 1; i < 21; i++) teams[`p${i}`] = i % 2 ? 'B' : 'C';
    const { e, run } = active(ps, teams);
    const a = ps[0];
    for (let i = 1; i < 21; i++) {
      const v = ps[i]; v.x = 0; v.z = 0;
      e.state.get(v.id)!.hp = 1; // one tap each, so all 20 are inside the pen before the 15 s release
      for (let k = 0; k < AGAWAN.health.max && !e.isImprisoned(v.id); k++) { face(a, v); press(e, a, run); }
      expect(e.isImprisoned(v.id)).toBe(true);
    }
    const slots = ps.slice(1).map((p) => e.state.get(p.id)!.slot);
    expect(new Set(slots).size).toBe(20);
    run(DT);
    const left = ps.filter((p) => p.id !== 'p5');
    e.tick(e.now + DT, left);
    expect(e.occupancy.get('A')!.filter(Boolean)).toHaveLength(19);
  });
});

describe('base takeover (decision 047)', () => {
  const rival = (n: number, id: string) => body(id, n, 40, 40);

  it('one attacker alone takes a base in about 12 s and scores 10', () => {
    const a = body('a', 1), b = rival(2, 'b'), c = rival(3, 'c');
    const { e, run } = active([a, b, c], { a: 'A', b: 'B', c: 'C' });
    inRing(a, 'B');
    run(AGAWAN.base.soloS - 0.5);
    expect(e.ownerOf('B')).toBe('B');
    run(0.7);
    expect(e.ownerOf('B')).toBe('A');
    const t = e.publicState().teams[0];
    expect(t.score).toBe(AGAWAN.points.baseCapture);
    expect(t.held).toBe(2);
  });

  it('more attackers are faster: three take it in about 5 s', () => {
    const ps = [body('a1', 1), body('a2', 2), body('a3', 3), rival(4, 'b'), rival(5, 'c')];
    const { e, run } = active(ps, { a1: 'A', a2: 'A', a3: 'A', b: 'B', c: 'C' });
    ps.slice(0, 3).forEach((p, i) => inRing(p, 'B', i * 2));
    const need = AGAWAN.base.soloS / AGAWAN.base.crowd[2];
    run(need - 0.4);
    expect(e.ownerOf('B')).toBe('B');
    run(0.6);
    expect(e.ownerOf('B')).toBe('A');
  });

  it('a defender in the ring freezes the capture; defenders alone push it back', () => {
    const a = body('a', 1), b = body('b', 2), c = rival(3, 'c');
    const { e, run } = active([a, b, c], { a: 'A', b: 'B', c: 'C' });
    inRing(a, 'B'); b.x = 40; b.z = 40;
    run(6);
    const p1 = e.publicState().bases[1].cap!.p;
    expect(p1).toBeGreaterThan(0.4);
    inRing(b, 'B', 3);
    run(4);
    expect(e.publicState().bases[1].cap!.p).toBeCloseTo(p1, 2);
    expect(e.publicState().bases[1].inside.sort()).toEqual(['A', 'B']);
    a.x = 40; a.z = -40;
    run(4);
    expect(e.publicState().bases[1].cap?.p ?? 0).toBeLessThan(p1 - 0.2);
  });

  it('the original owner can take a lost base back (faster), scoring 10 again', () => {
    const a = body('a', 1), b = body('b', 2), c = rival(3, 'c');
    const { e, run } = active([a, b, c], { a: 'A', b: 'B', c: 'C' });
    inRing(a, 'B'); b.x = 40; b.z = 40;
    run(AGAWAN.base.soloS + 0.3);
    expect(e.ownerOf('B')).toBe('A');
    a.x = 40; a.z = -40;
    inRing(b, 'B');
    run(AGAWAN.base.soloS / AGAWAN.base.homeBonus + 0.3);
    expect(e.ownerOf('B')).toBe('B');
    expect(e.publicState().teams[1].score).toBe(AGAWAN.points.baseCapture);
  });

  it('only a base your team owns heals you: losing your base takes your healing with it', () => {
    const a = body('a', 1), b = body('b', 2), c = rival(3, 'c');
    const { e, run } = active([a, b, c], { a: 'A', b: 'B', c: 'C' });
    inRing(a, 'B'); b.x = 40; b.z = 40;
    run(AGAWAN.base.soloS + 0.3);
    e.state.get('a')!.hp = 1;
    run(AGAWAN.health.healEveryS + 0.1);
    expect(e.state.get('a')!.hp).toBe(2); // A owns B's base now: it heals A
  });
});

describe('match end', () => {
  it('bases held at the whistle score 5 each; placements give 2 / 1 / 0 board points', () => {
    const a = body('a', 1), b = body('b', 2), c = body('c', 3);
    const { e, run } = active([a, b, c], { a: 'A', b: 'B', c: 'C' }, { roundS: 30 });
    inRing(a, 'B'); b.x = 40; b.z = 40; c.x = -40; c.z = 40;
    run(AGAWAN.base.soloS + 0.3);
    a.x = 0; a.z = 0;
    const ev = run(30);
    expect(ev?.results).toBeTruthy();
    const t = e.publicState().teams;
    expect(t[0].score).toBe(AGAWAN.points.baseCapture + 2 * AGAWAN.points.baseHeld);
    expect(t[1].score).toBe(0);
    expect(t[2].score).toBe(AGAWAN.points.baseHeld);
    const res = ev!.results!;
    expect(res.find((r) => r.id === 'a')!.points).toBe(2);
    expect(res.find((r) => r.id === 'c')!.points).toBe(1);
    expect(res.find((r) => r.id === 'b')!.points).toBe(0);
  });

  it('a tie at the top starts 30 s of sudden death; the first base capture by a tied team wins', () => {
    const a = body('a', 1), b = body('b', 2), c = body('c', 3);
    const { e, run } = active([a, b, c], { a: 'A', b: 'B', c: 'C' }, { roundS: 10 });
    run(10.1);
    expect(e.sudden).toBe(true);
    expect(e.phase).toBe('active');
    inRing(c, 'A');
    const ev = run(AGAWAN.base.soloS + 0.5);
    expect(ev?.results).toBeTruthy();
    expect(e.winners).toEqual(['C']);
  });

  it('sudden death without a capture: tie-break, then a shared place', () => {
    const a = body('a', 1), b = body('b', 2), c = body('c', 3);
    const { e, run } = active([a, b, c], { a: 'A', b: 'B', c: 'C' }, { roundS: 10 });
    const ev = run(10 + AGAWAN.suddenDeathS + 0.5);
    expect(ev?.results).toBeTruthy();
    expect(e.winners.sort()).toEqual(['A', 'B', 'C']);
  });
});

describe('bots', () => {
  it('bot raiders walk to an enemy base and take it over on their own', () => {
    const ps = [body('r1', 1), body('r2', 2), body('r3', 3), body('b', 4), body('c', 5)];
    const { e } = active(ps, { r1: 'A', r2: 'A', r3: 'A', b: 'B', c: 'C' });
    const brains = ps.slice(0, 3).map((_, i) => { const m = makeBot(10 + i); agawanBotInput(m, ps[i], e.privateState(ps[i].id), e, e.publicState(), ps, nav, e.now); m.agawan!.job = 'raider'; return m; });
    ps[3].x = 44; ps[3].z = -38; ps[4].x = -44; ps[4].z = -38; // rivals out of the way
    let now = e.now;
    for (let i = 0; i < 30 * 70 && e.publicState().teams[0].baseCaptures === 0; i++) {
      for (let k = 0; k < 3; k++) {
        const bot = ps[k];
        const act = agawanBotInput(brains[k], bot, e.privateState(bot.id), e, e.publicState(), ps, nav, now);
        e.setHold(bot, act.hold);
        if (act.mx || act.mz) { bot.x += act.mx * 4 * DT; bot.z += act.mz * 4 * DT; bot.yaw = act.yaw; }
      }
      now += DT; e.tick(now, ps);
    }
    expect(e.publicState().teams[0].baseCaptures).toBeGreaterThanOrEqual(1);
  });

  it('a bot at one heart walks home to heal', () => {
    const bot = body('bot', 1), b = body('b', 2), c = body('c', 3);
    const { e } = active([bot, b, c], { bot: 'A', b: 'B', c: 'C' });
    const brain = makeBot(5);
    bot.x = 0; bot.z = 0; b.x = 44; b.z = -38; c.x = -44; c.z = -38;
    e.state.get('bot')!.hp = 1;
    let now = e.now;
    for (let i = 0; i < 30 * 30 && e.state.get('bot')!.hp < AGAWAN.health.max; i++) {
      const act = agawanBotInput(brain, bot, e.privateState('bot'), e, e.publicState(), [bot, b, c], nav, now);
      if (act.mx || act.mz) { bot.x += act.mx * 4 * DT; bot.z += act.mz * 4 * DT; bot.yaw = act.yaw; }
      now += DT; e.tick(now, [bot, b, c]);
    }
    expect(e.state.get('bot')!.hp).toBe(AGAWAN.health.max);
  });

  it('30 bots over a full 4:00 match: bases change hands in every seeded match and nothing breaks', () => {
    for (const seed of [2026, 3, 8]) {
      const r = simulateAgawan(seed, AGAWAN.matchS);
      expect(r.counts.base, `seed ${seed}`).toBeGreaterThanOrEqual(2);
      expect(r.counts.tag, `seed ${seed}`).toBeGreaterThanOrEqual(20);
      expect(r.counts.rescue + r.counts.release, `seed ${seed}`).toBeGreaterThan(0);
    }
  }, 60_000);
});
