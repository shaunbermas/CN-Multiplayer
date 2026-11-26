// Agawan Base bots (approved by the owner, 25 Nov 2026: bots tag, rescue and raid; decision 047: hearts and base
// takeover). They are ordinary room players without a socket: each think the room asks for a move plus "E down or
// not", and runs both through the same engine checks, movement, walls and collisions as a human. Bots only use what a
// human player can know: positions of players in line of sight (Agawan Base has no hiding), the public board (hearts,
// prisoners, base owners and captures) and their own state.
//
// Each bot gets a seeded job for the stage:
//   raider    gathers with its team's raiders near an enemy base, then rushes into its ring together and stands there
//             until the base is theirs (more of them in the ring take it faster)
//   defender  stays around its own base; steps into the ring when rivals are capturing it, and hits intruders
//   rover     frees captured teammates first, otherwise hunts rivals around the plaza
// Everyone: presses E on a rival in reach (a person tapping, not faster), goes home to heal when down to one heart,
// and drops everything to take back its own base when it is lost.
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
  goal: { x: number; z: number; kind: 'patrol' | 'chase' | 'rescue' | 'raid' | 'heal' | 'hold'; target?: string } | null;
  /** Raiders: since when they have been waiting at the staging point. */
  waitSince: number;
  repathAt: number;
  bestD: number; bestAt: number; dodge: number; dodgeUntil: number;
  /** Last E press (room time): bots tap at a person's pace. */
  lastPress: number;
  /** Where inside a ring this bot stands (so a crowd spreads out instead of piling on the marker). */
  ringAngle: number;
  /** The job is fixed from the bot's place in its team on its first active think (so every team gets a mix). */
  jobSet?: boolean;
}

export interface AgawanBotAction { mx: number; mz: number; yaw: number; hold: boolean }

const yawTo = (dx: number, dz: number) => Math.atan2(-dx, -dz);
/** Jobs by place in the team: 10 players -> 5 raiders, 2 defenders, 3 rovers; 3 players -> raider, defender, raider. */
const JOB_CYCLE: AgawanJob[] = ['raider', 'defender', 'raider', 'rover', 'raider', 'rover', 'defender', 'raider', 'rover', 'raider'];

function memory(b: BotBrain): AgawanBotMemory {
  if (!b.agawan) {
    const rand = rng(b.seed ^ 0x41474e42);
    const r = rand();
    b.agawan = {
      rand, job: r < AGAWAN.bots.raiderShare ? 'raider' : r < AGAWAN.bots.raiderShare + AGAWAN.bots.defenderShare ? 'defender' : 'rover',
      path: [], goal: null, repathAt: 0, bestD: Infinity, bestAt: 0, dodge: 0, dodgeUntil: 0, waitSince: -1, lastPress: -Infinity, ringAngle: rand() * Math.PI * 2,
    };
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
  if (!m.jobSet) {
    // Every team gets the same mix (about half raiders, a fifth defenders, the rest rovers), dealt by the bot's place
    // among its teammates; a random pick per bot left some teams with one raider and others with six.
    const mates = players.filter((o) => pub.teamOf[o.id] === team).map((o) => o.id);
    const rank = Math.max(0, mates.indexOf(me.id));
    m.job = JOB_CYCLE[rank % JOB_CYCLE.length];
    m.jobSet = true;
  }
  const protectedNow = priv.protectLeft > 0;
  const owner = (s: TeamSlot) => pub.bases.find((x) => x.slot === s)?.owner ?? s;
  const ring = AGAWAN.base.zoneM;

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
  const press = (): boolean => { if (now - m.lastPress >= AGAWAN.bots.pressS) { m.lastPress = now; return true; } return false; };

  // ---- 1. a rival within reach: face them and tap E (the server checks reach, facing, sight and cooldown)
  if (near && near.d <= AGAWAN.health.reachM * 0.9 && !protectedNow) {
    return { mx: (near.p.x - me.x) * 0.2, mz: (near.p.z - me.z) * 0.2, yaw: yawTo(near.p.x - me.x, near.p.z - me.z), hold: press() };
  }

  // ---- 2. down to one heart: back to the nearest base we own to heal (unless a teammate is about to be freed by us)
  const owned = TEAM_SLOTS.filter((s) => owner(s) === team).map((s) => layout.bases[s]);
  const inOwned = owned.some((bs) => Math.hypot(bs.x - me.x, bs.z - me.z) < AGAWAN.health.healRadiusM - 1);
  // A raider standing in an enemy ring keeps taking it while no rival is close (a person would not walk away from a
  // half-taken base to heal); it only runs home once someone comes for it.
  const holdingRaid = m.goal?.kind === 'hold' && m.goal.target !== team && !rivals.some((r) => r.d < 5);
  if (!holdingRaid && (priv.hp <= 1 || (m.goal?.kind === 'heal' && priv.hp < AGAWAN.health.max))) {
    if (owned.length) {
      if (inOwned) { m.goal = { x: me.x, z: me.z, kind: 'heal' }; m.path = []; return idle; }
      const home = owned.map((bs) => ({ bs, d: Math.hypot(bs.x - me.x, bs.z - me.z) })).sort((a, c) => a.d - c.d)[0].bs;
      if (m.goal?.kind !== 'heal' || m.path.length === 0) setGoal(m, me, nav, home.x, home.z, 'heal', now);
      const threats = rivals.filter((r) => r.d < 6).map((r) => r.p);
      return move(m, me, nav, now, b.pace, false, threats);
    }
  }

  // ---- 3. a teammate in a pen nearby, or anywhere for a rover: go and free them (hold E at the fence)
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

  // ---- 4. our own home base is lost, or being taken: everyone but busy rovers goes to stand in its ring
  const homeSlot = team;
  const homeBase = pub.bases.find((x) => x.slot === homeSlot)!;
  const homePos = layout.bases[homeSlot];
  const homeThreat = homeBase.owner !== team || (homeBase.cap && homeBase.cap.team !== team) || homeBase.inside.some((t) => t !== team);
  const dHome = Math.hypot(homePos.x - me.x, homePos.z - me.z);
  // Raiders stay on their raid unless the home base is actually lost or half taken and they are not far away.
  const homeUrgent = homeBase.owner !== team || (!!homeBase.cap && homeBase.cap.team !== team && homeBase.cap.p > 0.4);
  const answers = m.job === 'defender' ? homeThreat : m.job === 'rover' ? homeThreat && dHome < 25 : homeUrgent && dHome < 20;
  if (answers) return standInRing(m, me, nav, now, b.pace, homeSlot, layout, rivals);

  // ---- 5. chase a rival close by (defenders: intruders near our base; rovers: anyone close)
  const chaseLimit = m.job === 'rover' ? AGAWAN.bots.chaseM : 0;
  const intruder = m.job === 'defender' ? rivals.find((r) => Math.hypot(r.p.x - homePos.x, r.p.z - homePos.z) < AGAWAN.bots.guardM) : undefined;
  const prey = intruder ?? (near && near.d < chaseLimit ? near : undefined);
  if (prey && !protectedNow) {
    if (m.goal?.kind !== 'chase' || m.goal.target !== prey.p.id || now >= m.repathAt) setGoal(m, me, nav, prey.p.x, prey.p.z, 'chase', now, prey.p.id);
    return move(m, me, nav, now, b.pace, false);
  }

  // ---- 6. raiders: the team's raiders pick the same base we do not own, gather at a staging point short of it, and
  // rush together once enough of them are there; in the ring they spread out and stand until the base is ours.
  if (m.job === 'raider') {
    const targets = TEAM_SLOTS.filter((s) => owner(s) !== team);
    if (targets.length) {
      const wave = Math.floor(now / 50) + TEAM_SLOTS.indexOf(team);
      // Finish what we started: a base where our team already has capture progress comes before the wave's pick.
      const started = targets.find((s) => { const c = pub.bases.find((x) => x.slot === s)?.cap; return c?.team === team && c.p > 0.05; });
      const target = started ?? targets[wave % targets.length];
      const base = layout.bases[target];
      const d = Math.hypot(base.x - me.x, base.z - me.z);
      const capNow = pub.bases.find((x) => x.slot === target)?.cap;
      const ours = capNow?.team === team && capNow.p > 0;
      if (d <= ring + 4 || ours) return standInRing(m, me, nav, now, b.pace, target, layout, rivals);
      const stage = stagingPoint(layout, target, (Math.floor(wave / 2) % 2) * 2 - 1);
      const mates = players.filter((o) => o.id !== me.id && pub.teamOf[o.id] === team && o.status === 'active'
        && Math.hypot(o.x - stage.x, o.z - stage.z) < 6).length;
      const atStage = Math.hypot(stage.x - me.x, stage.z - me.z) < 5;
      if (atStage && m.waitSince < 0) m.waitSince = now;
      const rushing = m.goal?.kind === 'hold' && m.goal.target === target;
      if (rushing || (atStage && (mates >= 2 || now - m.waitSince > 6))) {
        m.waitSince = -1;
        return standInRing(m, me, nav, now, b.pace, target, layout, rivals);
      }
      if (atStage) return { mx: 0, mz: 0, yaw: yawTo(base.x - me.x, base.z - me.z), hold: false };
      if (m.goal?.kind !== 'raid' || m.goal.target !== target || m.goal.x !== stage.x) setGoal(m, me, nav, stage.x, stage.z, 'raid', now, target);
      const threats = rivals.filter((r) => r.d < 6).map((r) => r.p);
      return move(m, me, nav, now, b.pace, false, threats);
    }
  }

  // ---- 7. patrol: defenders around their base and pen, everyone else around the plaza and the streets
  if (!m.goal || m.goal.kind !== 'patrol' || (m.path.length === 0 && now >= m.repathAt)) {
    let x: number, z: number;
    if (m.job === 'defender') {
      const pen = layout.pens[team].area;
      const anchor = m.rand() < 0.6 ? homePos : { x: (pen.minX + pen.maxX) / 2, z: (pen.minZ + pen.maxZ) / 2 };
      x = anchor.x + (m.rand() * 2 - 1) * 6; z = anchor.z + (m.rand() * 2 - 1) * 6;
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

/** Walk into a base's ring and stand there (each bot at its own spot, so a group spreads out inside the ring). */
function standInRing(m: AgawanBotMemory, me: AgawanBody, nav: NavGrid, now: number, pace: number, slot: TeamSlot, layout: AgawanEngine['layout'], rivals: { p: AgawanBody; d: number }[]): AgawanBotAction {
  const base = layout.bases[slot];
  const r = AGAWAN.base.zoneM * 0.55;
  const spot = { x: base.x + Math.cos(m.ringAngle) * r, z: base.z + Math.sin(m.ringAngle) * r };
  const d = Math.hypot(spot.x - me.x, spot.z - me.z);
  if (Math.hypot(base.x - me.x, base.z - me.z) <= AGAWAN.base.zoneM * 0.85 && d < 1.2) {
    const look = rivals[0]?.p ?? base;
    m.goal = { x: spot.x, z: spot.z, kind: 'hold', target: slot }; m.path = [];
    return { mx: 0, mz: 0, yaw: yawTo(look.x - me.x, look.z - me.z), hold: false };
  }
  if (m.goal?.kind !== 'hold' || m.goal.target !== slot || m.path.length === 0) setGoal(m, me, nav, spot.x, spot.z, 'hold', now, slot);
  if (!m.goal) return { mx: (spot.x - me.x) / Math.max(d, 0.01), mz: (spot.z - me.z) / Math.max(d, 0.01), yaw: yawTo(spot.x - me.x, spot.z - me.z), hold: false };
  return move(m, me, nav, now, pace, false);
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
