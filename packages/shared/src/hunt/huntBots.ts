// The Hunt bots. They are ordinary room players without a socket (see bots.ts): each tick the room asks for a
// move plus the same actions a human can send (pulse, hold capture, hide), and runs them through the same
// HuntEngine checks, movement, walls, gates and collisions. Bots never read hidden state:
//   - they see an opponent only with clear line of sight within HUNT.bots.sightM (huntSenses below);
//   - hunter bots hear a hider who is walking or sprinting (not crouching) within HUNT.bots.hearM, with a
//     position error of about 2 m (sound travels through walls; that is fair, humans hear footsteps too);
//   - hunter bots use their own Pulse Detector readings (a sector and a strength, like a human);
//   - hider bots use their own threat level (a distance bucket, like a human);
//   - they do not know which hiding places are occupied: they try one and learn from the result.
import { rng } from '../round.ts';
import type { BotBrain } from '../bots.ts';
import { HUNT } from './config.ts';
import type { HuntBody, HuntEngine, HuntPrivate } from './hunt.ts';
import type { HideSpot, HuntLayout } from './layout.ts';
import { findPath, type NavGrid } from './nav.ts';

export interface HuntBotMemory {
  rand: () => number;
  path: [number, number][];
  goal: { x: number; z: number; kind: 'wander' | 'chase' | 'flee' | 'search' | 'hide' | 'check'; spot?: string } | null;
  repathAt: number;
  /** Hiding places this bot tried and found full (forgotten after a while). */
  tried: Map<string, number>;
  /** Hiding places this hunter bot searched recently. */
  checked: Map<string, number>;
  /** When the current hold on a hiding place started (hunter bots). */
  holdSince: number;
  /** Last seen / heard opponent (stale after a few seconds). */
  lastSeen: { x: number; z: number; at: number } | null;
  /** Progress watchdog. */
  bestD: number; bestAt: number; dodge: number; dodgeUntil: number;
  /** Last pulse reading this bot acted on. */
  pulseN: number;
}

export interface HuntSenses {
  /** Opponents in plain sight (line of sight within bots.sightM). */
  seen: { id: string; x: number; z: number; d: number }[];
  /** Approximate positions of noisy hiders nearby (hunter bots only). */
  heard: { x: number; z: number }[];
}

export interface HuntBotAction {
  mx: number; mz: number;
  /** Input flags like a human: 1 crouch, 2 sprint. */
  flags: number;
  /** Facing (camera yaw) to send with the move. */
  yaw: number;
  pulse?: boolean;
  capture?: boolean;
  hide?: boolean;
}

/** What a bot may perceive this tick. */
export function huntSenses(engine: HuntEngine, me: HuntBody, players: HuntBody[], rand: () => number): HuntSenses {
  const mine = engine.state.get(me.id);
  const seen: HuntSenses['seen'] = [];
  const heard: HuntSenses['heard'] = [];
  if (!mine) return { seen, heard };
  for (const o of players) {
    if (o.id === me.id) continue;
    const os = engine.state.get(o.id);
    if (!os || os.role === mine.role || os.captured || o.status !== 'active') continue;
    const d = Math.hypot(o.x - me.x, o.z - me.z);
    // Hunter bots look where they walk: a 130-degree view cone (a human turns the camera; a bot does not scan).
    const fx = -Math.sin(me.yaw), fz = -Math.cos(me.yaw);
    const inCone = mine.role !== 'hunter' || d < 2.5 || ((o.x - me.x) * fx + (o.z - me.z) * fz) / Math.max(1e-6, d) > HUNT.bots.hunterConeCos;
    if (d <= HUNT.bots.sightM && inCone && engine.visibleTo(me, o)) { seen.push({ id: o.id, x: o.x, z: o.z, d }); continue; }
    if (mine.role === 'hunter' && os.noisy && !os.hideId && d <= HUNT.bots.hearM) {
      heard.push({ x: o.x + (rand() * 2 - 1) * 2, z: o.z + (rand() * 2 - 1) * 2 });
    }
  }
  seen.sort((a, b) => a.d - b.d);
  return { seen, heard };
}

function memory(b: BotBrain): HuntBotMemory {
  if (!b.hunt) {
    b.hunt = {
      rand: rng(b.seed ^ 0x48554e54), path: [], goal: null, repathAt: 0, tried: new Map(), checked: new Map(), holdSince: -1,
      lastSeen: null, bestD: Infinity, bestAt: 0, dodge: 0, dodgeUntil: 0, pulseN: 0,
    };
  }
  return b.hunt;
}

const yawTo = (dx: number, dz: number) => Math.atan2(-dx, -dz);

/** One tick of a Hunt bot. */
export function huntBotInput(b: BotBrain, me: HuntBody, priv: HuntPrivate | null, senses: HuntSenses, engine: HuntEngine, nav: NavGrid, now: number): HuntBotAction {
  const m = memory(b);
  const idle: HuntBotAction = { mx: 0, mz: 0, flags: 0, yaw: me.yaw };
  if (!priv || engine.phase !== 'active' || priv.captured || me.status !== 'active' || me.downUntil > now) { m.path = []; return idle; }
  const layout = engine.layout;
  if (priv.role === 'hider') return hiderTick(b, m, me, priv, senses, layout, engine, nav, now);
  return hunterTick(b, m, me, priv, senses, layout, engine, nav, now);
}

// ------------------------------------------------------------------ hider
function hiderTick(b: BotBrain, m: HuntBotMemory, me: HuntBody, priv: HuntPrivate, senses: HuntSenses, layout: HuntLayout, engine: HuntEngine, nav: NavGrid, now: number): HuntBotAction {
  if (priv.hide) return { mx: 0, mz: 0, flags: 0, yaw: me.yaw }; // stay put until pushed out
  const hunter = senses.seen[0];
  if (hunter) m.lastSeen = { x: hunter.x, z: hunter.z, at: now };
  const canHide = priv.hideCd <= 0;
  // Flee from a visible hunter: pick a point that is far from it and not too far from us.
  if (hunter && (m.goal?.kind !== 'flee' || now >= m.repathAt)) {
    let best: [number, number] | null = null, bs = -Infinity;
    for (const r of layout.rooms) {
      if (r.id === 'R') continue;
      for (let k = 0; k < 3; k++) {
        const x = r.minX + 2 + m.rand() * (r.maxX - r.minX - 4), z = r.minZ + 2 + m.rand() * (r.maxZ - r.minZ - 4);
        const away = Math.hypot(x - hunter.x, z - hunter.z), near = Math.hypot(x - me.x, z - me.z);
        const score = away - near * 0.6 + (Math.hypot(me.x - hunter.x, me.z - hunter.z) < away ? 4 : -4);
        if (score > bs) { bs = score; best = [x, z]; }
      }
    }
    if (best) setGoal(m, me, nav, engine, best[0], best[1], 'flee', now);
  }
  // Hide when a hunter is near (threat) or was just seen, if a hiding place is close and the hunter is not on us.
  const danger = priv.threat > 0 || (m.lastSeen && now - m.lastSeen.at < 4);
  if (canHide && danger && (!hunter || hunter.d > 5) && m.goal?.kind !== 'hide') {
    const spot = nearestSpot(layout.hideSpots, me, m, now, 14);
    if (spot) setGoal(m, me, nav, engine, spot.fx, spot.fz, 'hide', now, spot.id);
  }
  // At the hiding place: press E (the server says whether there was room).
  if (m.goal?.kind === 'hide' && m.goal.spot) {
    const spot = layout.hideSpots.find((s) => s.id === m.goal!.spot)!;
    if (Math.hypot(spot.fx - me.x, spot.fz - me.z) < HUNT.hide.enterDistM * 0.8) {
      m.tried.set(spot.id, now); // if it was full we will not try it again for a while
      m.goal = null; m.path = [];
      return { mx: 0, mz: 0, flags: 0, yaw: me.yaw, hide: canHide };
    }
    if (!canHide) m.goal = null;
  }
  // Calm: wander between rooms; during the head start, spread out away from the spawn pocket.
  if (!m.goal || (m.goal.kind === 'flee' && !hunter && now >= m.repathAt + 3)) {
    const rooms = layout.rooms.filter((r) => r.id !== 'R');
    const r = rooms[Math.floor(m.rand() * rooms.length)];
    setGoal(m, me, nav, engine, r.minX + 2 + m.rand() * (r.maxX - r.minX - 4), r.minZ + 2 + m.rand() * (r.maxZ - r.minZ - 4), 'wander', now);
  }
  const fleeing = m.goal?.kind === 'flee' && hunter && hunter.d < 9;
  const crouch = !fleeing && priv.threat > 0 && m.goal?.kind !== 'hide';
  const move = follow(m, me, nav, engine, now, crouch ? 1 : b.pace);
  return { ...move, flags: (crouch ? 1 : 0) | (fleeing && priv.sprintCd <= 0 ? 2 : 0) };
}

function nearestSpot(spots: HideSpot[], me: { x: number; z: number }, m: HuntBotMemory, now: number, maxD: number): HideSpot | null {
  let best: HideSpot | null = null, bd = maxD;
  for (const s of spots) {
    const t = m.tried.get(s.id);
    if (t !== undefined && now - t < 20) continue;
    const d = Math.hypot(s.fx - me.x, s.fz - me.z);
    if (d < bd) { bd = d; best = s; }
  }
  return best;
}

// ------------------------------------------------------------------ hunter
function hunterTick(b: BotBrain, m: HuntBotMemory, me: HuntBody, priv: HuntPrivate, senses: HuntSenses, layout: HuntLayout, engine: HuntEngine, nav: NavGrid, now: number): HuntBotAction {
  if (!engine.released) {
    // Waiting behind the gate: shuffle about a little.
    if (!m.goal || now >= m.repathAt) {
      const r = layout.hunterRoom;
      setGoal(m, me, nav, engine, r.minX + 1.5 + m.rand() * (r.maxX - r.minX - 3), r.minZ + 1.5 + m.rand() * (r.maxZ - r.minZ - 3), 'wander', now);
      m.repathAt = now + 3 + m.rand() * 3;
    }
    return { ...follow(m, me, nav, engine, now, 0.5), flags: 0 };
  }
  const target = senses.seen[0];
  // A hider in plain sight: chase, face, hold E when in reach.
  if (target) {
    m.lastSeen = { x: target.x, z: target.z, at: now };
    if (target.d <= HUNT.capture.distM * 0.95) {
      return { mx: (target.x - me.x) * 0.3, mz: (target.z - me.z) * 0.3, flags: 0, yaw: yawTo(target.x - me.x, target.z - me.z), capture: true };
    }
    if (m.goal?.kind !== 'chase' || now >= m.repathAt - HUNT.bots.repathS + 0.4) setGoal(m, me, nav, engine, target.x, target.z, 'chase', now);
    const mv = follow(m, me, nav, engine, now, b.pace);
    return { ...mv, flags: target.d < 10 && target.d > 2.5 && priv.sprintCd <= 0 ? 2 : 0, capture: target.d < HUNT.capture.distM + 0.6 };
  }
  // Searching a hiding place: stand at its front, face it, hold E. Progress above zero means somebody is inside.
  if (m.goal?.kind === 'check' && m.goal.spot) {
    const spot = layout.hideSpots.find((s) => s.id === m.goal!.spot)!;
    if (Math.hypot(spot.fx - me.x, spot.fz - me.z) < 1.0) {
      if (m.holdSince < 0) m.holdSince = now;
      const held = now - m.holdSince;
      if (held > 0.5 && priv.capture <= 0) { m.checked.set(spot.id, now); m.goal = null; m.holdSince = -1; }
      else if (held > HUNT.capture.holdS + 0.8) { m.checked.set(spot.id, now); m.goal = null; m.holdSince = -1; }
      else return { mx: 0, mz: 0, flags: 0, yaw: yawTo(spot.x - me.x, spot.z - me.z), capture: true };
    }
  } else m.holdSince = -1;
  // Heard footsteps nearby: go there.
  if (senses.heard.length && m.goal?.kind !== 'check') {
    const h = senses.heard[0];
    if (m.goal?.kind !== 'search' || now >= m.repathAt) setGoal(m, me, nav, engine, h.x, h.z, 'search', now);
  }
  // Pulse whenever it is ready; follow a reading toward its sector, at a distance guessed from its strength.
  const pulse = priv.pulseCd <= 0;
  if (priv.pulse && priv.pulse.n !== m.pulseN) {
    m.pulseN = priv.pulse.n;
    if (priv.pulse.strength > 0 && priv.pulse.sector >= 0) {
      const yaw = (priv.pulse.sector * Math.PI * 2) / HUNT.pulse.sectors;
      const dist = priv.pulse.strength === 3 ? 4 : priv.pulse.strength === 2 ? 8 : 13;
      setGoal(m, me, nav, engine, me.x - Math.sin(yaw) * dist, me.z - Math.cos(yaw) * dist, 'search', now);
    }
  }
  // Near a search point: check the closest hiding places not searched recently.
  if (m.goal?.kind === 'search' && Math.hypot(m.goal.x - me.x, m.goal.z - me.z) < 3) {
    const spot = layout.hideSpots
      .filter((s) => { const t = m.checked.get(s.id); return (t === undefined || now - t > 25) && Math.hypot(s.fx - me.x, s.fz - me.z) < 9; })
      .sort((a, c) => Math.hypot(a.fx - me.x, a.fz - me.z) - Math.hypot(c.fx - me.x, c.fz - me.z))[0];
    if (spot) setGoal(m, me, nav, engine, spot.fx, spot.fz, 'check', now, spot.id);
    else m.goal = null;
  }
  // Patrol: rooms, then hiding places along the way.
  if (!m.goal) {
    const rooms = layout.rooms.filter((r) => r.id !== 'R');
    const r = rooms[Math.floor(m.rand() * rooms.length)];
    setGoal(m, me, nav, engine, r.minX + 2 + m.rand() * (r.maxX - r.minX - 4), r.minZ + 2 + m.rand() * (r.maxZ - r.minZ - 4), 'search', now);
  }
  return { ...follow(m, me, nav, engine, now, b.pace), flags: 0, pulse };
}

// ------------------------------------------------------------------ movement
function setGoal(m: HuntBotMemory, me: HuntBody, nav: NavGrid, engine: HuntEngine, x: number, z: number, kind: NonNullable<HuntBotMemory['goal']>['kind'], now: number, spot?: string): void {
  m.goal = { x, z, kind, ...(spot ? { spot } : {}) };
  m.path = findPath(nav, me.x, me.z, x, z, engine.extraWalls());
  m.repathAt = now + HUNT.bots.repathS;
  m.bestD = Infinity; m.bestAt = now;
  if (!m.path.length) m.goal = null;
}

function follow(m: HuntBotMemory, me: HuntBody, nav: NavGrid, engine: HuntEngine, now: number, pace: number): Omit<HuntBotAction, 'flags'> {
  if (m.goal && now >= m.repathAt && (m.goal.kind === 'chase' || m.goal.kind === 'flee' || m.path.length === 0)) {
    m.path = findPath(nav, me.x, me.z, m.goal.x, m.goal.z, engine.extraWalls());
    m.repathAt = now + HUNT.bots.repathS;
  }
  while (m.path.length && Math.hypot(m.path[0][0] - me.x, m.path[0][1] - me.z) < 0.6) m.path.shift();
  if (!m.path.length) {
    if (m.goal && Math.hypot(m.goal.x - me.x, m.goal.z - me.z) < 1.2 && m.goal.kind !== 'check' && m.goal.kind !== 'hide') m.goal = m.goal.kind === 'search' ? m.goal : null;
    return { mx: 0, mz: 0, yaw: me.yaw };
  }
  const [wx, wz] = m.path[0];
  let dx = wx - me.x, dz = wz - me.z;
  const d = Math.hypot(dx, dz);
  // Watchdog: no progress toward the waypoint for 1.5 s (someone in the way) -> sidestep, then repath.
  if (d < m.bestD - 0.2) { m.bestD = d; m.bestAt = now; }
  else if (now - m.bestAt > 1.5) { m.dodge = m.rand() < 0.5 ? -1 : 1; m.dodgeUntil = now + 0.7; m.bestAt = now; m.bestD = Infinity; m.repathAt = now; }
  dx /= d; dz /= d;
  if (now < m.dodgeUntil) { const sx = -dz * m.dodge, sz = dx * m.dodge; dx = dx * 0.4 + sx; dz = dz * 0.4 + sz; const l = Math.hypot(dx, dz); dx /= l; dz /= l; }
  const p = Math.min(1, pace);
  return { mx: dx * p, mz: dz * p, yaw: yawTo(dx, dz) };
}
