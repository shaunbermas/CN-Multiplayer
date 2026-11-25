// Stage 03 · THE HUNT: roles, head start, Pulse Detector, capture, hiding, scoring, visibility and a full-room bot
// simulation that runs the real engine, movement, collisions and bot code the room uses (no network).
import { describe, expect, it } from 'vitest';
import {
  HuntEngine, MATCH, Match, RoundEngine, SIM_DT, HUNT, buildHuntLayout, findPath, getStage, huntBotInput, huntSenses, hunterCount,
  lineOfSight, makeBot, newRoundPlayer, pathAttenuation, resolvePlayerContacts, sanitizeInput, step, type HuntBody, type BotBrain,
} from '../src/index.ts';

const def = getStage(HUNT.id);
const layout = def.hunt!.layout;
const nav = def.hunt!.nav;

type P = HuntBody & { vx: number; vz: number; bot?: BotBrain; name: string };
function makePlayers(n: number): P[] {
  return Array.from({ length: n }, (_, i) => ({ ...newRoundPlayer(`p${i + 1}`, i + 1, i + 1, 0, 0), yaw: 0, vx: 0, vz: 0, name: `P${i + 1}` }));
}
/** Engine through briefing and countdown into the active phase; returns room time at GO. */
function startHunt(players: P[], seed = 7, opts: { roundS?: number } = {}): { e: HuntEngine; t: number } {
  const e = new HuntEngine(layout);
  e.start(players, { seed, briefingS: 1, resultsS: 2, ...opts });
  let t = 0;
  while (e.phase !== 'active') { t += SIM_DT; e.tick(t, players); }
  return { e, t };
}
function advance(e: HuntEngine, players: P[], t: number, seconds: number): number {
  const end = t + seconds;
  while (t < end - 1e-9) { t += SIM_DT; e.tick(t, players); }
  return t;
}
const role = (e: HuntEngine, r: 'hunter' | 'hider', players: P[]) => players.filter((p) => e.roleOf(p.id) === r);

describe('roles', () => {
  it('hunterCount = clamp(round(n * 0.2), 1, n - 1)', () => {
    expect(hunterCount(30)).toBe(6);
    expect([2, 3, 4, 5, 6, 7, 8, 10, 12, 13, 18, 23, 28].map((n) => hunterCount(n))).toEqual([1, 1, 1, 1, 1, 1, 2, 2, 2, 3, 4, 5, 6]);
    expect(hunterCount(1)).toBe(0);
  });

  it('a full room of 30 gets 6 hunters and 24 hiders, humans and bots alike, deterministic per seed', () => {
    const players = makePlayers(30);
    players.slice(20).forEach((p) => { p.bot = makeBot(1); });
    const { e } = startHunt(players, 42);
    expect(role(e, 'hunter', players)).toHaveLength(6);
    expect(role(e, 'hider', players)).toHaveLength(24);
    const again = makePlayers(30);
    const { e: e2 } = startHunt(again, 42);
    expect(role(e2, 'hunter', again).map((p) => p.id)).toEqual(role(e, 'hunter', players).map((p) => p.id));
  });

  it('every small room size gets a valid split', () => {
    for (let n = 2; n <= 30; n++) {
      const players = makePlayers(n);
      const { e } = startHunt(players, n);
      const h = role(e, 'hunter', players).length;
      expect(h).toBe(hunterCount(n));
      expect(h).toBeGreaterThanOrEqual(1);
      expect(n - h).toBeGreaterThanOrEqual(1);
    }
  });

  it('hunters start in the staging room and hiders in four separate pockets out of its sight', () => {
    const players = makePlayers(30);
    const { e } = startHunt(players, 3);
    for (const p of role(e, 'hunter', players)) expect(e.inHunterRoom(p)).toBe(true);
    const hiders = role(e, 'hider', players);
    for (const p of hiders) expect(e.inHunterRoom(p)).toBe(false);
    const rooms = new Set(hiders.map((p) => layout.rooms.find((r) => p.x >= r.minX && p.x <= r.maxX && p.z >= r.minZ && p.z <= r.maxZ)?.id));
    expect(rooms.size).toBe(4);
    // With the gates closed nobody in the hunter room can see a hider.
    for (const h of role(e, 'hunter', players)) for (const p of hiders) expect(lineOfSight(h.x, h.z, p.x, p.z, e.wallsNow())).toBe(false);
  });
});

describe('timing and the head start', () => {
  it('15 s head start then 180 s of hunting; the gates are walls until release', () => {
    const players = makePlayers(10);
    const { e, t } = startHunt(players, 5);
    expect(e.remaining()).toBeCloseTo(HUNT.headStartS + HUNT.huntS, 1);
    expect(e.released).toBe(false);
    expect(e.extraWalls()).toHaveLength(2);
    // A hunter walking at the gate cannot get out.
    const h = role(e, 'hunter', players)[0];
    Object.assign(h, { x: 56, z: -16 });
    let s = { x: h.x, z: h.z, vx: 0, vz: 0 };
    for (let i = 0; i < 90; i++) s = step(s, { mx: -1, mz: 0 }, SIM_DT, [...layout.walls, ...e.extraWalls()]);
    expect(s.x).toBeGreaterThan(54.6);
    // No pulse and no capture before release.
    expect(e.pulse(h, players)).toBeNull();
    const t2 = advance(e, players, t, HUNT.headStartS + 0.05);
    expect(e.released).toBe(true);
    expect(e.extraWalls()).toHaveLength(0);
    expect(e.publicState().headStartLeft).toBe(0);
    const t3 = advance(e, players, t2, HUNT.huntS - 0.2);
    expect(e.phase).toBe('active');
    advance(e, players, t3, 0.4);
    expect(e.phase).toBe('results');
  });
});

describe('Pulse Detector', () => {
  function pulseSetup() {
    const players = makePlayers(3);
    const { e, t } = startHunt(players, 11);
    advance(e, players, t, HUNT.headStartS + 0.1);
    const [h] = role(e, 'hunter', players);
    const hiders = role(e, 'hider', players);
    return { e, h, hiders, players, t: t + HUNT.headStartS + 0.1 };
  }

  it('respects the cooldown and range, and reports only a strength bucket and a sector', () => {
    const { e, h, hiders, players, t } = pulseSetup();
    // Open floor in the warehouse: hunter at (-6, -24), one hider 4 m south (yaw PI), the other far away.
    Object.assign(h, { x: -6, z: -24 });
    Object.assign(hiders[0], { x: -6, z: -20 });
    Object.assign(hiders[1], { x: 40, z: 30 });
    const r = e.pulse(h, players)!;
    expect(r.strength).toBe(3);
    expect(Object.keys(r).sort()).toEqual(['at', 'n', 'sector', 'strength']);
    expect([3, 4, 5]).toContain(r.sector); // south = sector 4, +/- jitter
    expect(e.pulse(h, players)).toBeNull(); // cooling down
    let t2 = advance(e, players, t, HUNT.pulse.cooldownS - 0.2);
    expect(e.pulse(h, players)).toBeNull();
    t2 = advance(e, players, t2, 0.3);
    Object.assign(hiders[0], { x: 40, z: 30 });
    const far = e.pulse(h, players)!;
    expect(far.strength).toBe(0); // out of range
    expect(far.sector).toBe(-1);
  });

  it('walls weaken the signal (same distance, open floor vs behind a partition)', () => {
    const open = pathAttenuation(-6, -24, -6, -14, layout.walls);
    expect(open.walls).toBe(0);
    const through = pathAttenuation(-26, -20, -21, -20, layout.walls); // across the Loading Bay | Warehouse partition
    expect(through.walls).toBeGreaterThanOrEqual(1);
    expect(through.factor).toBeLessThan(0.6);
    const { e, h, hiders, players } = pulseSetup();
    Object.assign(h, { x: -21, z: -20 });
    Object.assign(hiders[0], { x: -27, z: -20 }); // 6 m away, behind the wall
    Object.assign(hiders[1], { x: 40, z: 30 });
    const behind = e.pulse(h, players)!;
    expect(behind.strength).toBeLessThan(3);
  });
});

describe('capture', () => {
  function captureSetup() {
    const players = makePlayers(3);
    const { e, t } = startHunt(players, 13);
    const t1 = advance(e, players, t, HUNT.headStartS + 0.1);
    const [h] = role(e, 'hunter', players);
    const [v, w] = role(e, 'hider', players);
    Object.assign(w, { x: 40, z: 30 });
    return { e, h, v, players, t: t1 };
  }

  it('needs distance, facing, line of sight and a 1 s hold', () => {
    const { e, h, v, players, t } = captureSetup();
    Object.assign(h, { x: -6, z: -24, yaw: Math.PI }); // facing +Z
    Object.assign(v, { x: -6, z: -22.6 });               // 1.4 m in front
    e.setCapture(h, true);
    let t2 = advance(e, players, t, 0.5);
    expect(e.privateState(h.id)!.capture).toBeGreaterThan(0.4);
    expect(v.status).toBe('active');
    t2 = advance(e, players, t2, 0.55);
    expect(v.status).toBe('captured');
    expect(e.privateState(h.id)!.captures).toBe(1);
    expect(e.privateState(v.id)!.captured).toBe(true);
    void t2;
  });

  it('cancels when the hider escapes, when the hunter faces away, and through walls', () => {
    const { e, h, v, players, t } = captureSetup();
    Object.assign(h, { x: -6, z: -24, yaw: Math.PI });
    Object.assign(v, { x: -6, z: -22.6 });
    e.setCapture(h, true);
    let t2 = advance(e, players, t, 0.6);
    Object.assign(v, { z: -21.5 }); // 2.5 m: out of reach
    t2 = advance(e, players, t2, 0.1);
    expect(e.privateState(h.id)!.capture).toBe(0);
    Object.assign(v, { z: -22.6 });
    Object.assign(h, { yaw: 0 }); // facing away
    t2 = advance(e, players, t2, 1.2);
    expect(v.status).toBe('active');
    // Through the B | A partition at z = -20 (wall at x = -24): 1.2 m apart, wall in between.
    Object.assign(h, { x: -23.2, z: -20, yaw: Math.PI / 2 });  // facing -X
    Object.assign(v, { x: -24.8, z: -20 });
    t2 = advance(e, players, t2, 1.3);
    expect(v.status).toBe('active');
    expect(e.captureTarget(h, players)).toBeNull();
  });

  it('a captured hider cannot move, act or be captured again, and is scored once', () => {
    const { e, h, v, players, t } = captureSetup();
    Object.assign(h, { x: -6, z: -24, yaw: Math.PI });
    Object.assign(v, { x: -6, z: -22.6 });
    e.setCapture(h, true);
    let t2 = advance(e, players, t, 1.1);
    expect(v.status).toBe('captured');
    expect(e.canMove(v)).toBe(false);
    expect(e.toggleHide(v, players)).toBeNull();
    t2 = advance(e, players, t2, 2);
    expect(e.privateState(h.id)!.captures).toBe(1);
  });
});

describe('hiding', () => {
  it('one occupant per locker, a 10 s limit, a 15 s cooldown, and lockers can be searched', () => {
    const players = makePlayers(4);
    const { e, t } = startHunt(players, 17);
    const hiders = role(e, 'hider', players);
    const [h] = role(e, 'hunter', players);
    const locker = layout.hideSpots.find((s) => s.kind === 'locker')!;
    Object.assign(hiders[0], { x: locker.fx, z: locker.fz });
    Object.assign(hiders[1], { x: locker.fx, z: locker.fz + 0.1 });
    expect(e.toggleHide(hiders[0], players)).toBe('entered');
    expect(e.isHidden(hiders[0].id)).toBe(true);
    expect(e.canMove(hiders[0])).toBe(false);
    // The neighbouring locker is free, this one is not: the second hider gets the neighbour or nothing, never this one.
    e.toggleHide(hiders[1], players);
    expect(e.occupancy(locker.id)).toBe(1);
    // Hidden players are invisible to everyone else, and only they learn their hiding place.
    expect(e.visibleTo(h, hiders[0])).toBe(false);
    expect(e.visibleTo(hiders[2], hiders[0])).toBe(false);
    expect(e.privateState(hiders[0].id)!.hide).toBe(locker.id);
    expect(JSON.stringify(e.publicState())).not.toContain(locker.id);
    // Pushed out after 10 s, then 15 s before hiding again.
    let t2 = advance(e, players, t, HUNT.hide.maxS + 0.1);
    expect(e.isHidden(hiders[0].id)).toBe(false);
    expect(Math.hypot(hiders[0].x - locker.fx, hiders[0].z - locker.fz)).toBeLessThan(0.01);
    expect(e.toggleHide(hiders[0], players)).toBeNull();
    t2 = advance(e, players, t2, HUNT.hide.cooldownS);
    // Search: a released hunter holding E at the locker front captures the hider inside.
    expect(e.toggleHide(hiders[0], players)).toBe('entered');
    t2 = advance(e, players, t2, Math.max(0, HUNT.headStartS - (t2 - t)) + 0.1);
    Object.assign(h, { x: locker.fx, z: locker.fz + (locker.fz > locker.z ? 0.8 : -0.8), yaw: Math.atan2(-(locker.x - locker.fx), -(locker.z - (locker.fz + (locker.fz > locker.z ? 0.8 : -0.8)))) });
    if (e.isHidden(hiders[0].id)) {
      e.setCapture(h, true);
      advance(e, players, t2, 1.1);
      expect(hiders[0].status).toBe('captured');
      expect(e.isHidden(hiders[0].id)).toBe(false);
    }
  });

  it('containers hold two', () => {
    const players = makePlayers(5);
    const { e } = startHunt(players, 19);
    const hiders = role(e, 'hider', players);
    const c = layout.hideSpots.find((s) => s.kind === 'container')!;
    for (const p of hiders) Object.assign(p, { x: c.fx, z: c.fz });
    const results = hiders.map((p) => e.toggleHide(p, players));
    expect(e.occupancy(c.id)).toBe(2);
    expect(results.filter((r) => r === 'entered').length).toBeGreaterThanOrEqual(2);
  });
});

describe('scoring and the end of the stage', () => {
  it('survivors 2, captured 0, hunters 1 per capture up to 2; early end when everyone is caught; once per stage', () => {
    const players = makePlayers(6); // 1 hunter, 5 hiders
    const { e, t } = startHunt(players, 23);
    const [h] = role(e, 'hunter', players);
    const hiders = role(e, 'hider', players);
    let t2 = advance(e, players, t, HUNT.headStartS + 0.1);
    for (const v of hiders) {
      for (const o of hiders) if (o.status === 'active' && o !== v) Object.assign(o, { x: 40, z: 30 });
      Object.assign(h, { x: -6, z: -24, yaw: Math.PI });
      Object.assign(v, { x: -6, z: -22.8 });
      e.setCapture(h, true);
      t2 = advance(e, players, t2, 1.1);
      e.setCapture(h, false);
      if (v === hiders[2]) break;
    }
    expect(hiders.filter((v) => v.status === 'captured')).toHaveLength(3);
    // Timeout with two survivors.
    t2 = advance(e, players, t2, e.remaining() + 0.05);
    expect(e.phase).toBe('results');
    const res = e.lastResults;
    const pts = Object.fromEntries(res.map((r) => [r.id, r.points]));
    expect(pts[h.id]).toBe(2); // 3 captures, capped at 2
    for (const v of hiders) expect(pts[v.id]).toBe(v.status === 'captured' ? 0 : 2);
    expect(res.every((r) => (r.points ?? 0) <= MATCH.points.first)).toBe(true);
    // Recorded in the match exactly once.
    const m = new Match(['A', 'B']);
    const refs = players.map((p) => ({ id: p.id, name: p.name, joinOrder: p.joinOrder }));
    expect(m.record(9, res, refs)).not.toBeNull();
    expect(m.record(9, res, refs)).toBeNull();
    expect(m.standings().find((s) => s.id === h.id)!.points).toBe(2);
  });

  it('ends early when every hider is captured, with no survival points', () => {
    const players = makePlayers(2);
    const { e, t } = startHunt(players, 29);
    const [h] = role(e, 'hunter', players);
    const [v] = role(e, 'hider', players);
    let t2 = advance(e, players, t, HUNT.headStartS + 0.1);
    Object.assign(h, { x: -6, z: -24, yaw: Math.PI });
    Object.assign(v, { x: -6, z: -22.8 });
    e.setCapture(h, true);
    t2 = advance(e, players, t2, 1.2);
    expect(e.phase).toBe('results');
    expect(e.lastResults.find((r) => r.id === v.id)!.points).toBe(0);
    expect(e.lastResults.find((r) => r.id === h.id)!.points).toBe(1);
    void t2;
  });

  it('captured players are active contestants again in the next stage (a new engine per stage)', () => {
    const players = makePlayers(2);
    players[1].status = 'captured';
    const next = new RoundEngine(getStage().geometry);
    next.start(players, { seed: 1 });
    expect(players.every((p) => p.status === 'active')).toBe(true);
  });
});

describe('navigation', () => {
  it('finds a path from every hider pocket to every room through the doors', () => {
    for (const s of layout.hiderSpawns.filter((_, i) => i < 4)) {
      for (const r of layout.rooms.filter((x) => x.id !== 'R')) {
        const path = findPath(nav, s.x, s.z, (r.minX + r.maxX) / 2 + 0.3, (r.minZ + r.maxZ) / 2 + 0.3);
        expect(path.length, `${s.x},${s.z} -> ${r.id}`).toBeGreaterThan(0);
      }
    }
    // Hunters can leave their room through the gates once open, not while blocked.
    expect(findPath(nav, 60, -9, 0, 0).length).toBeGreaterThan(0);
    expect(findPath(nav, 60, -9, 0, 0, layout.gates)).toEqual([]);
  });

  it('every hiding place front is reachable and outside every wall', () => {
    for (const s of layout.hideSpots) {
      expect(findPath(nav, -12, -24, s.fx, s.fz).length, s.id).toBeGreaterThan(0);
      for (const w of layout.walls) expect(s.fx > w.minX - 0.3 && s.fx < w.maxX + 0.3 && s.fz > w.minZ - 0.3 && s.fz < w.maxZ + 0.3, `${s.id} front in ${w.id}`).toBe(false);
    }
  });
});

describe('full-room bot simulation (30 bots, real engine, movement, collisions and bot code)', () => {
  it('plays a whole stage: bots obey the gates, capture legally, and every result is scored once', () => {
    const n = 30;
    const layoutCheck = buildHuntLayout();
    expect(layoutCheck.hideSpots.length).toBe(layout.hideSpots.length);
    const players = makePlayers(n);
    players.forEach((p, i) => { p.bot = makeBot(1000 + i * 7919); });
    const { e } = startHunt(players, 77);
    let t = e.now;
    let maxMs = 0, total = 0, ticks = 0, escapes = 0, captures = 0, hides = 0;
    const hunterIds = new Set(e.hunters());
    while (e.phase === 'active') {
      const t0 = performance.now();
      t += SIM_DT;
      const ev = e.tick(t, players);
      captures += ev.captured?.length ?? 0;
      const walls = [...layout.walls, ...e.extraWalls()];
      for (const p of players) {
        const act = huntBotInput(p.bot!, p, e.privateState(p.id), huntSenses(e, p, players, p.bot!.rand), e, nav, t);
        if (e.phase !== 'active') break;
        if (act.pulse) e.pulse(p, players);
        if (act.hide && e.toggleHide(p, players) === 'entered') hides++;
        e.setCapture(p, !!act.capture);
        if (!e.canMove(p)) { p.vx = 0; p.vz = 0; continue; }
        const input = sanitizeInput(act.mx, act.mz);
        e.applyFlags(p, act.flags, input.mx !== 0 || input.mz !== 0);
        const s = step(p, input, SIM_DT, walls, e.speedScale(p));
        Object.assign(p, s, { yaw: act.yaw });
        if (!e.released && hunterIds.has(p.id) && !e.inHunterRoom(p)) escapes++;
      }
      resolvePlayerContacts(players.filter((p) => p.status === 'active' && !e.isHidden(p.id)), t, walls);
      const ms = performance.now() - t0;
      total += ms; ticks++; maxMs = Math.max(maxMs, ms);
    }
    expect(escapes).toBe(0);
    expect(e.phase).toBe('results');
    const res = e.lastResults;
    expect(res).toHaveLength(n);
    expect(new Set(res.map((r) => r.id)).size).toBe(n);
    const caught = res.filter((r) => r.status === 'captured').length;
    expect(caught).toBe(captures);
    const hunterPts = res.filter((r) => r.role === 'hunter').reduce((a, r) => a + (r.captures ?? 0), 0);
    expect(hunterPts).toBe(captures);
    console.log(JSON.stringify({ endedAt: +(t - e.goTime).toFixed(1), bots: n, captures, hides, survivors: res.filter((r) => r.role === 'hider' && r.status !== 'captured').length,
      avgTickMs: +(total / ticks).toFixed(3), maxTickMs: +maxMs.toFixed(2) }));
    expect(total / ticks).toBeLessThan(10);
  }, 60_000);
});
