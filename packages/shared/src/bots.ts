// Server-side bot contestants (Stage 01 refinement, owner brief 24 Nov 2026). Bots are ordinary room players
// without a socket: each simulation tick the room asks botInput() for a move and queues it exactly like a
// human input, so bots use the same movement, walls, obstacles, collisions, red-light detection and scoring.
// No browser clients are created. Pure apart from the seeded random generator each bot carries.
//
// Behaviour (docs/STAGE_01_BOT_SYSTEM.md): move on green, stop on red after a personal reaction time (no warning since decision 037),
// sometimes stop too late (and get spotted), walk at a personal pace within the approved walk speed, weave
// through the barricade gaps and around the sliding gate, sidestep players ahead (not always), and carry on
// after being knocked down.
import { MOVEMENT } from './constants.ts';
import { gateX, type ResolvedObstacles } from './obstacles.ts';
import { rng, type Signal } from './round.ts';
import type { StageGeometry } from './stage.ts';

/** Playful, original first names for bots; the room picks a seeded selection, so a room's bots keep their names. */
export const BOT_NAMES = [
  'Nova', 'Pixel', 'Juniper', 'Orbit', 'Maple', 'Echo', 'Biscuit', 'Comet', 'Pebble', 'Willow', 'Dash', 'Mochi',
  'Rivet', 'Sprout', 'Indigo', 'Waffle', 'Kestrel', 'Tango', 'Clover', 'Nimbus', 'Ziggy', 'Saffron', 'Bolt', 'Fable',
  'Gizmo', 'Marble', 'Quill', 'Sorrel', 'Tofu', 'Vesper', 'Yarrow', 'Zephyr', 'Button', 'Cinder', 'Domino', 'Ember',
] as const;

export interface BotBrain {
  seed: number;
  /** Input magnitude 0.72–1.0: walk pace within the approved 4 m/s walk speed. */
  pace: number;
  /** Seconds after RED starts before this bot reacts and stops (0.12–0.32, inside the 0.4 s grace; decision 037). */
  reaction: number;
  /** Chance per red light of stopping too late (0.008–0.05; over a stage of about ten reds that spots roughly one bot in four). */
  recklessness: number;
  /** Chance to sidestep a player directly ahead (0.4–0.95): lower means more collisions. */
  courtesy: number;
  /** Preferred lateral offset inside a gap (-0.35..0.35 of the gap width). */
  lane: number;
  // live state
  rand: () => number;
  /** Signal segment this bot last decided on (to roll the late-stop dice once per red). */
  segKey: string;
  /** Seconds into the red light this bot keeps walking (0 = stops in time). */
  lateStop: number;
  /** Progress watchdog: best z reached and the room time it was reached. */
  bestZ: number;
  bestAt: number;
  /** Sidestep direction and until when (room time), when stuck or avoiding someone. */
  dodge: number;
  dodgeUntil: number;
  /** Stage 02 memory (stage02/huntBots.ts); cleared when a stage starts. */
  hunt?: import('./stage02/huntBots.ts').HuntBotMemory;
}

/** A bot with a seeded personality. */
export function makeBot(seed: number): BotBrain {
  const r = rng(seed);
  const between = (a: number, b: number) => a + (b - a) * r();
  return {
    seed,
    pace: between(0.72, 1.0),
    reaction: between(0.12, 0.32),
    recklessness: between(0.008, 0.05),
    courtesy: between(0.4, 0.95),
    lane: between(-0.35, 0.35),
    rand: r,
    segKey: '',
    lateStop: 0,
    bestZ: Infinity,
    bestAt: 0,
    dodge: 0,
    dodgeUntil: 0,
  };
}

/** Distinct names for `count` bots in a room, avoiding names already in use. Deterministic for a seed. */
export function botNames(seed: number, count: number, taken: Iterable<string> = []): string[] {
  const used = new Set([...taken].map((n) => n.toLowerCase()));
  const r = rng(seed ^ 0x51ed27);
  const pool = [...BOT_NAMES];
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  const out: string[] = [];
  let k = 0;
  while (out.length < count) {
    const base = pool[k % pool.length];
    const name = k < pool.length ? base : `${base} ${Math.floor(k / pool.length) + 1}`;
    k++;
    if (used.has(name.toLowerCase())) continue;
    used.add(name.toLowerCase());
    out.push(name);
  }
  return out;
}

export interface GapRow { z: number; gaps: { minX: number; maxX: number }[] }

/** Open spans of every barricade row (derived from the resolved obstacle walls), nearest the start first. */
export function obstacleGapRows(o: ResolvedObstacles | null, geo: StageGeometry): GapRow[] {
  if (!o || !geo.bounds) return [];
  const rows = new Map<number, { minX: number; maxX: number }[]>();
  for (const b of o.barricades) {
    const z = Math.round(((b.minZ + b.maxZ) / 2) * 100) / 100;
    if (!rows.has(z)) rows.set(z, []);
    rows.get(z)!.push({ minX: b.minX, maxX: b.maxX });
  }
  const out: GapRow[] = [];
  for (const [z, blocks] of rows) {
    blocks.sort((a, b) => a.minX - b.minX);
    const gaps: { minX: number; maxX: number }[] = [];
    let x = geo.bounds.minX;
    for (const bl of blocks) { if (bl.minX - x > 1) gaps.push({ minX: x, maxX: bl.minX }); x = Math.max(x, bl.maxX); }
    if (geo.bounds.maxX - x > 1) gaps.push({ minX: x, maxX: geo.bounds.maxX });
    out.push({ z, gaps });
  }
  return out.sort((a, b) => b.z - a.z); // course runs toward -Z: highest z (nearest the start) first
}

export interface BotView {
  now: number;
  phase: string;
  signal: Signal;
  /** Seconds into the current signal segment, and its start (seconds since GO). */
  into: number;
  segStart: number;
  /** Green time for the sliding gate (obstacles.ts greenTime). */
  gateGreenTime: number;
  x: number; z: number;
  status: string;
  /** Knocked down (no control) right now. */
  down: boolean;
  /** Other players' positions (for sidestepping). */
  others: { x: number; z: number }[];
}

/**
 * One tick of bot input: a move direction in world X/Z with length 0..pace (never faster than a human).
 * Called every simulation step for every bot; cheap (a few comparisons per row and per nearby player).
 */
export function botInput(b: BotBrain, v: BotView, geo: StageGeometry, rows: GapRow[], o: ResolvedObstacles | null): { mx: number; mz: number } {
  const still = { mx: 0, mz: 0 };
  if (v.phase !== 'active' || v.status !== 'active' || v.down) { b.bestAt = v.now; return still; }

  // ---- when to move
  const key = `${v.signal}:${v.segStart}`;
  if (key !== b.segKey) {
    b.segKey = key;
    if (v.signal === 'red') {
      // Roll once per light: does this bot stop too late this time? Late means past the detection grace
      // (decision 037: there is no warning, so bots react to RED itself, like players).
      b.lateStop = b.rand() < b.recklessness ? 0.65 + b.rand() * 0.6 : 0;
    }
  }
  let go = false;
  if (v.signal === 'green') go = true;
  else if (v.signal === 'warning') go = true;
  else if (v.signal === 'red') go = v.into < b.reaction || (b.lateStop > 0 && v.into < b.lateStop);
  if (!go) { b.bestAt = v.now; return still; }

  // ---- where to go: toward the finish, through the next barricade gap, around the gate
  let tx = v.x;
  const ahead = rows.find((r) => r.z < v.z - 0.2 && r.z > v.z - 14);
  if (ahead && ahead.gaps.length) {
    let best = ahead.gaps[0], bestD = Infinity;
    for (const g of ahead.gaps) {
      const c = (g.minX + g.maxX) / 2;
      const d = Math.abs(c - v.x) + Math.abs(c) * 0.02; // prefer the nearest gap, slight pull to the centre
      if (d < bestD) { bestD = d; best = g; }
    }
    const w = best.maxX - best.minX;
    tx = (best.minX + best.maxX) / 2 + b.lane * Math.max(0, w - 1.6);
  } else if (geo.bounds) {
    tx = Math.max(geo.bounds.minX + 2, Math.min(geo.bounds.maxX - 2, v.x));
  }
  if (o) {
    const gz = o.gate.z;
    if (v.z > gz && v.z - gz < 9) {
      // Pass the gate on the side with more room; aim well clear of its current position.
      const gx = gateX(o, v.gateGreenTime);
      const half = o.gate.halfWidth + 1.2;
      if (Math.abs(tx - gx) < half) tx = tx >= gx ? gx + half : gx - half;
    }
  }

  // ---- sidestep someone right ahead (some bots are less polite: that is where collisions come from)
  if (v.now >= b.dodgeUntil) {
    b.dodge = 0;
    for (const p of v.others) {
      const dz = v.z - p.z, dx = p.x - v.x;
      if (dz > 0.2 && dz < 1.6 && Math.abs(dx) < 0.7) {
        if (b.rand() < b.courtesy) { b.dodge = dx > 0 ? -1 : 1; b.dodgeUntil = v.now + 0.6; }
        else b.dodgeUntil = v.now + 0.6; // decided to barge on
        break;
      }
    }
  }

  // ---- stuck watchdog: no progress for 2.5 s while trying to move -> sidestep for a moment
  if (v.z < b.bestZ - 0.3) { b.bestZ = v.z; b.bestAt = v.now; }
  else if (v.now - b.bestAt > 2.5) { b.dodge = b.rand() < 0.5 ? -1 : 1; b.dodgeUntil = v.now + 1.0; b.bestAt = v.now; }

  let mx = (tx - v.x) * 0.35 + b.dodge * 0.9;
  let mz = -1;
  const len = Math.hypot(mx, mz);
  mx /= len; mz /= len;
  const pace = Math.min(1, b.pace);
  return { mx: mx * pace, mz: mz * pace };
}

/** Bots never exceed the walk speed: pace is an input magnitude ≤ 1 (MOVEMENT.walkSpeed caps the result). */
export const BOT_MAX_SPEED = MOVEMENT.walkSpeed;

/** Clear a bot's per-round memory (called when a stage starts). Personality stays. */
export function resetBot(b: BotBrain): void {
  b.segKey = ''; b.lateStop = 0; b.bestZ = Infinity; b.bestAt = 0; b.dodge = 0; b.dodgeUntil = 0; b.hunt = undefined;
}
