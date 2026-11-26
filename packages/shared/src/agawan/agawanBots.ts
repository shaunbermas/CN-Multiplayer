// Agawan Base bots (approved by the owner, 25 Nov 2026: bots tag, rescue and raid). They are ordinary room players
// without a socket: each think the room asks for a move plus "hold E or not", and runs both through the same engine
// checks, movement, walls and collisions as a human. Bots only use what a human player can know: positions of players
// in line of sight (Agawan Base has no hiding), the public score board (prisoners, raid cooldowns) and their own state.
//
// Each bot gets a seeded job for the stage:
//   raider    walks to an enemy base whose raid cooldown (for its team) has run out and holds E on the marker
//   defender  patrols near its own base and pen, and chases rivals who come close
//   rover     rescues imprisoned teammates first, otherwise hunts rivals around the plaza
// Everyone tags a rival who walks into reach, and anyone free rescues a teammate they pass.
import { rng } from '../round.ts';
import type { BotBrain } from '../bots.ts';
import { TEAM_SLOTS, type TeamSlot } from '../teams.ts';
import { findPath, type NavGrid } from '../hunt/nav.ts';
import { lineOfSight } from '../hunt/los.ts';
import { AGAWAN } from './config.ts';
import type { AgawanBody, AgawanEngine, AgawanPrivate, AgawanPublic } from './agawan.ts';

export type AgawanJob = 'raider' | 'defender' | 'rover';

export interface AgawanBotMemory {
  rand: () => number;
  job: AgawanJob;
  path: [number, number][];
  goal: { x: number; z: number; kind: 'patrol' | 'chase' | 'rescue' | 'raid'; target?: string } | null;
  /** Raiders: since when they have been waiting outside a guarded base, and bases they gave up on (until when). */
  waitSince: number;
  skip: Partial<Record<TeamSlot, number>>;
  repathAt: number;
  bestD: number; bestAt: number; dodge: number; dodgeUntil: number;
}

export interface AgawanBotAction { mx: number; mz: number; yaw: number; hold: boolean }

const yawTo = (dx: number, dz: number) => Math.atan2(-dx, -dz);

function memory(b: BotBrain): AgawanBotMemory {
  if (!b.agawan) {
    const rand = rng(b.seed ^ 0x41474e42);
    const r = rand();
    b.agawan = { rand, job: r < AGAWAN.bots.raiderShare ? 'raider' : r < AGAWAN.bots.raiderShare + AGAWAN.bots.defenderShare ? 'defender' : 'rover', path: [], goal: null, repathAt: 0, bestD: Infinity, bestAt: 0, dodge: 0, dodgeUntil: 0, waitSince: -1, skip: {} };
  }
  return b.agawan;
}

/** One think of an Agawan Base bot. */
export function agawanBotInput(b: BotBrain, me: AgawanBody, priv: AgawanPrivate | null, engine: AgawanEngine, pub: AgawanPublic, players: AgawanBody[], nav: NavGrid, now: number): AgawanBotAction {
  const m = memory(b);
  const idle: AgawanBotAction = { mx: 0, mz: 0, yaw: me.yaw, hold: false };
  if (!priv || engine.phase !== 'active' || priv.pen || me.status !== 'active' || me.downUntil > now) { m.path = []; m.goal = null; return idle; }
  const layout = engine.layout;
  const team = priv.team;
  const protectedNow = priv.protectLeft > 0;

  // ---- what this bot can see: rivals in the open, in line of sight
  const rivals: { p: AgawanBody; d: number }[] = [];
  for (const o of players) {
    const t = pub.teamOf[o.id];
    if (!t || t === team || o.status !== 'active' || pub.protected.includes(o.id)) continue;
    const d = Math.hypot(o.x - me.x, o.z - me.z);
    if (d <= AGAWAN.bots.sightM && lineOfSight(me.x, me.z, o.x, o.z, layout.walls)) rivals.push({ p: o, d });
  }
  rivals.sort((a, c) => a.d - c.d);
  const near = rivals[0];

  // ---- 1. a rival within reach: face them and hold E (the server checks reach, facing and sight)
  if (near && near.d <= AGAWAN.tag.distM * 0.95 && priv.tagCd <= 0 && !protectedNow) {
    return { mx: (near.p.x - me.x) * 0.25, mz: (near.p.z - me.z) * 0.25, yaw: yawTo(near.p.x - me.x, near.p.z - me.z), hold: true };
  }

  // ---- 2. a teammate in a pen nearby, or anywhere for a rover: go and free them
  const captive = pub.prisoners
    .filter(([id, pen, left]) => pub.teamOf[id] === team && pen !== team && left > 2)
    .map(([id]) => players.find((p) => p.id === id))
    .filter((p): p is AgawanBody => !!p)
    .map((p) => ({ p, d: Math.hypot(p.x - me.x, p.z - me.z) }))
    .sort((a, c) => a.d - c.d)[0];
  if (captive && (m.job === 'rover' || captive.d < (m.job === 'raider' ? 5 : 14))) {
    if (captive.d <= AGAWAN.rescue.distM * 0.85 && !protectedNow) return { mx: 0, mz: 0, yaw: yawTo(captive.p.x - me.x, captive.p.z - me.z), hold: true };
    if (m.goal?.kind !== 'rescue' || m.goal.target !== captive.p.id) setGoal(m, me, nav, captive.p.x, captive.p.z, 'rescue', now, captive.p.id);
    return move(m, me, nav, now, b.pace, false);
  }

  // ---- 3. chase a rival close by (defenders: anyone near our base; raiders only when the rival is right on them)
  const home = layout.bases[team];
  // Raiders only tag what walks into reach; defenders only chase intruders near their base (they do not leave it).
  const chaseLimit = m.job === 'rover' ? AGAWAN.bots.chaseM : 0;
  const intruder = m.job === 'defender' ? rivals.find((r) => Math.hypot(r.p.x - home.x, r.p.z - home.z) < AGAWAN.bots.guardM) : undefined;
  const prey = intruder ?? (near && near.d < chaseLimit ? near : undefined);
  if (prey && priv.tagCd <= 0.3 && !protectedNow) {
    if (m.goal?.kind !== 'chase' || m.goal.target !== prey.p.id || now >= m.repathAt) setGoal(m, me, nav, prey.p.x, prey.p.z, 'chase', now, prey.p.id);
    return move(m, me, nav, now, b.pace, prey.d < AGAWAN.tag.distM + 0.8);
  }

  // ---- 4. raiders: the whole team's raiders pick the same enemy base (one whose cooldown for our team is over), gather
  // at a staging point short of it, and rush together once enough of them are there: a defender can tag only one at a
  // time, so a wave gets someone through the 1.5 s hold. A raider already in the zone keeps holding.
  if (m.job === 'raider') {
    const open = TEAM_SLOTS.filter((s) => s !== team && !pub.raidCd[team + s]);
    if (open.length) {
      // Same choice for every raider of the team: it changes every 45 s so waves alternate between bases.
      const wave = Math.floor(now / 45) + TEAM_SLOTS.indexOf(team);
      const target = open[wave % open.length];
      const base = layout.bases[target];
      const d = Math.hypot(base.x - me.x, base.z - me.z);
      if (d <= AGAWAN.raid.radiusM * 0.7 && !protectedNow) return { mx: 0, mz: 0, yaw: yawTo(base.x - me.x, base.z - me.z), hold: true };
      const stage = stagingPoint(layout, target, (Math.floor(wave / 2) % 2) * 2 - 1);
      const mates = players.filter((o) => o.id !== me.id && pub.teamOf[o.id] === team && o.status === 'active'
        && Math.hypot(o.x - stage.x, o.z - stage.z) < 6).length;
      const atStage = Math.hypot(stage.x - me.x, stage.z - me.z) < 5;
      if (atStage && m.waitSince < 0) m.waitSince = now;
      // Rush when two teammates are with us, after 7 s of waiting, or once we are already committed past the staging point.
      const rushing = m.goal?.kind === 'raid' && m.goal.target === target && (m.goal.x === base.x && m.goal.z === base.z);
      if (rushing || (atStage && (mates >= 2 || now - m.waitSince > 7))) {
        m.waitSince = -1;
        if (!rushing) setGoal(m, me, nav, base.x, base.z, 'raid', now, target);
        // Close to the marker, take on a defender who is right there (a tagged defender leaves the base open).
        const guard = d < 7 && near && near.d < 3 && priv.tagCd <= 0 && !protectedNow ? near : undefined;
        if (guard) { setGoal(m, me, nav, guard.p.x, guard.p.z, 'chase', now, guard.p.id); return move(m, me, nav, now, b.pace, guard.d < AGAWAN.tag.distM + 0.8); }
        const threats = d > AGAWAN.raid.radiusM + 2 ? rivals.filter((r) => r.d < 5).map((r) => r.p) : [];
        return move(m, me, nav, now, b.pace, false, threats);
      }
      if (atStage) return { mx: 0, mz: 0, yaw: yawTo(base.x - me.x, base.z - me.z), hold: false };
      if (m.goal?.kind !== 'raid' || m.goal.target !== target || m.goal.x !== stage.x) setGoal(m, me, nav, stage.x, stage.z, 'raid', now, target);
      const threats = rivals.filter((r) => r.d < 6).map((r) => r.p);
      return move(m, me, nav, now, b.pace, false, threats);
    }
  }

  // ---- 5. patrol: defenders around their base and pen, everyone else around the plaza and the streets
  if (!m.goal || m.goal.kind !== 'patrol' || (m.path.length === 0 && now >= m.repathAt)) {
    let x: number, z: number;
    if (m.job === 'defender') {
      const pen = layout.pens[team].area;
      const anchor = m.rand() < 0.5 ? home : { x: (pen.minX + pen.maxX) / 2, z: (pen.minZ + pen.maxZ) / 2 };
      x = anchor.x + (m.rand() * 2 - 1) * 7; z = anchor.z + (m.rand() * 2 - 1) * 7;
    } else {
      const r = layout.routes[Math.floor(m.rand() * layout.routes.length)];
      const pt = r.points[1 + Math.floor(m.rand() * (r.points.length - 2))];
      [x, z] = m.rand() < 0.4 ? [(m.rand() * 2 - 1) * 7, (m.rand() * 2 - 1) * 7] : pt;
    }
    setGoal(m, me, nav, x, z, 'patrol', now);
    m.repathAt = now + 4 + m.rand() * 4;
  }
  return move(m, me, nav, now, b.pace * 0.85, false);
}

/** Where a team's raiders gather before rushing a base: 11 m from the marker, off to one side of the line from the
 *  plaza (75 degrees either way), so the wave comes in on a flank instead of through the pen and its defenders. */
const stagingCache = new Map<string, { x: number; z: number }>();
function stagingPoint(layout: AgawanEngine['layout'], slot: TeamSlot, side: number): { x: number; z: number } {
  const key = slot + side;
  let p = stagingCache.get(key);
  if (!p) {
    const b = layout.bases[slot], ang = Math.atan2(-b.z, -b.x) + side * (75 * Math.PI) / 180;
    p = { x: b.x + Math.cos(ang) * 11, z: b.z + Math.sin(ang) * 11 };
    stagingCache.set(key, p);
  }
  return p;
}

function setGoal(m: AgawanBotMemory, me: AgawanBody, nav: NavGrid, x: number, z: number, kind: NonNullable<AgawanBotMemory['goal']>['kind'], now: number, target?: string): void {
  m.goal = { x, z, kind, ...(target ? { target } : {}) };
  m.path = findPath(nav, me.x, me.z, x, z);
  m.repathAt = now + AGAWAN.bots.repathS;
  m.bestD = Infinity; m.bestAt = now;
  if (!m.path.length) m.goal = null;
}

function move(m: AgawanBotMemory, me: AgawanBody, nav: NavGrid, now: number, pace: number, hold: boolean, avoid: { x: number; z: number }[] = []): AgawanBotAction {
  if (m.goal && now >= m.repathAt && (m.goal.kind === 'chase' || m.goal.kind === 'rescue' || m.path.length === 0)) {
    m.path = findPath(nav, me.x, me.z, m.goal.x, m.goal.z);
    m.repathAt = now + AGAWAN.bots.repathS;
  }
  while (m.path.length && Math.hypot(m.path[0][0] - me.x, m.path[0][1] - me.z) < 0.6) m.path.shift();
  if (!m.path.length) {
    if (m.goal && Math.hypot(m.goal.x - me.x, m.goal.z - me.z) < 1.2) m.goal = null;
    return { mx: 0, mz: 0, yaw: me.yaw, hold };
  }
  const [wx, wz] = m.path[0];
  let dx = wx - me.x, dz = wz - me.z;
  const d = Math.hypot(dx, dz);
  // Watchdog: no progress toward the waypoint for 1.5 s (someone in the way) -> sidestep, then repath.
  if (d < m.bestD - 0.2) { m.bestD = d; m.bestAt = now; }
  else if (now - m.bestAt > 1.5) { m.dodge = m.rand() < 0.5 ? -1 : 1; m.dodgeUntil = now + 0.7; m.bestAt = now; m.bestD = Infinity; m.repathAt = now; }
  dx /= d; dz /= d;
  if (now < m.dodgeUntil) { const sx = -dz * m.dodge, sz = dx * m.dodge; dx = dx * 0.4 + sx; dz = dz * 0.4 + sz; const l = Math.hypot(dx, dz); dx /= l; dz /= l; }
  if (avoid.length) {
    // Sidestep: push away from each nearby rival, stronger the closer it is, but never straight backwards.
    let rx = 0, rz = 0;
    for (const o of avoid) { const ox = me.x - o.x, oz = me.z - o.z, l = Math.max(0.5, Math.hypot(ox, oz)); rx += (ox / l) * (2 / l); rz += (oz / l) * (2 / l); }
    const fwd = rx * dx + rz * dz; if (fwd < 0) { rx -= fwd * dx; rz -= fwd * dz; } // drop the backwards part
    dx += rx; dz += rz; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
  }
  const p = Math.min(1, pace);
  return { mx: dx * p, mz: dz * p, yaw: yawTo(dx, dz), hold };
}
