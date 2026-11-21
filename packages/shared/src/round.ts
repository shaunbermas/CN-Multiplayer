// Red Light, Green Light round rules (docs/STAGE_01_SPEC.md §3–§5). Pure and deterministic: the room
// (server) drives it with tick(); the same code is unit tested. Coordinates are game coordinates
// (metres, course toward -Z). Times are seconds of room time.
import { insideRect, type StageGeometry } from './stage.ts';

export type Phase = 'lobby' | 'briefing' | 'countdown' | 'active' | 'results';
export type Signal = 'none' | 'green' | 'warning' | 'red';
export type PlayerStatus = 'active' | 'finished' | 'spotted' | 'waiting';

export const ROUND = {
  briefingS: 15,        // S1 (skippable)
  countdownS: 3,        // S2
  roundS: 120,          // R1
  greenMinS: 3, greenMaxS: 6, firstGreenMinS: 5, // S3
  warningS: 0.8,        // S4
  redMinS: 3, redMaxS: 5, // S5
  graceBaseS: 0.3, graceMaxS: 0.5, // D1
  speedLimit: 0.3,      // D2 m/s, averaged over speedWindow ticks
  speedWindow: 3,
  dispLimit: 0.15,      // D2 m since the grace window ended
  resultsS: 20,
} as const;

// ------------------------------------------------------------------ seeded random (mulberry32)
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffled<T>(items: T[], seed: number): T[] {
  const r = rng(seed ^ 0x9e3779b9);
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// ------------------------------------------------------------------ signal schedule
export interface SignalSegment { signal: 'green' | 'warning' | 'red'; start: number; end: number }

/** Seeded GREEN → WARNING → RED cycle covering [0, totalS) from GO. The first green lasts at least 5 s. */
export function buildSchedule(seed: number, totalS: number = ROUND.roundS): SignalSegment[] {
  const r = rng(seed);
  const between = (a: number, b: number) => Math.round((a + (b - a) * r()) * 100) / 100;
  const segs: SignalSegment[] = [];
  let t = 0;
  let first = true;
  while (t < totalS) {
    const g = between(first ? ROUND.firstGreenMinS : ROUND.greenMinS, ROUND.greenMaxS);
    first = false;
    segs.push({ signal: 'green', start: t, end: t + g }); t += g;
    segs.push({ signal: 'warning', start: t, end: t + ROUND.warningS }); t += ROUND.warningS;
    const red = between(ROUND.redMinS, ROUND.redMaxS);
    segs.push({ signal: 'red', start: t, end: t + red }); t += red;
  }
  return segs;
}

export function segmentAt(schedule: SignalSegment[], t: number): SignalSegment | null {
  for (const s of schedule) if (t >= s.start && t < s.end) return s;
  return null;
}

// ------------------------------------------------------------------ players
export interface RoundPlayer {
  id: string;
  joinOrder: number;
  spawn: number;
  x: number; z: number;
  status: PlayerStatus;
  /** Seconds from GO to crossing the finish (round), or -1. */
  finishTime: number;
  /** Room time when spotted, or -1. */
  spotTime: number;
  /** Measured one-way latency in seconds (server probes). */
  latencyS: number;
  // detection state (server-side only)
  redDisp: number;
  recent: number[];
}

export function newRoundPlayer(id: string, joinOrder: number, spawn: number, x: number, z: number): RoundPlayer {
  return { id, joinOrder, spawn, x, z, status: 'active', finishTime: -1, spotTime: -1, latencyS: 0, redDisp: 0, recent: [] };
}

export function graceFor(latencyS: number): number {
  return Math.min(ROUND.graceMaxS, ROUND.graceBaseS + Math.max(0, latencyS));
}

export interface Placing { id: string; place: number; status: PlayerStatus; finishTime: number; progress: number }

/** Spec R5–R7: finishers by time, then unfinished by progress, then spotted (latest spot first). */
export function rankPlayers(players: RoundPlayer[], geo: StageGeometry): Placing[] {
  const progress = (p: RoundPlayer) => Math.max(0, Math.min(1, (p.z - geo.startZ) / (geo.finishZ - geo.startZ)));
  const finished = players.filter((p) => p.status === 'finished')
    .sort((a, b) => a.finishTime - b.finishTime || a.z - b.z || a.joinOrder - b.joinOrder);
  const active = players.filter((p) => p.status === 'active')
    .sort((a, b) => a.z - b.z || a.joinOrder - b.joinOrder);
  const spotted = players.filter((p) => p.status === 'spotted')
    .sort((a, b) => b.spotTime - a.spotTime || a.z - b.z || a.joinOrder - b.joinOrder);
  return [...finished, ...active, ...spotted].map((p, i) => ({
    id: p.id, place: i + 1, status: p.status, finishTime: p.finishTime, progress: Math.round(progress(p) * 1000) / 1000,
  }));
}

// ------------------------------------------------------------------ engine
export interface RoundEvents {
  phase?: Phase;
  spotted: string[];
  finished: string[];
  results?: Placing[];
}

export interface StartOptions { seed: number; roundS?: number; briefingS?: number }

/**
 * Phase machine for one room. The room calls:
 *  - start(players, opts) when the host starts a round
 *  - canMove(p) before applying a movement step
 *  - afterMove(p, dx, dz, dt) after each applied step (detection and finish)
 *  - tick(now) once per simulation tick (transitions)
 */
export class RoundEngine {
  phase: Phase = 'lobby';
  phaseStart = 0;
  phaseEnd = Infinity;
  seed = 0;
  roundS: number = ROUND.roundS;
  schedule: SignalSegment[] = [];
  goTime = 0;
  now = 0;
  skipped = new Set<string>();
  lastResults: Placing[] = [];

  constructor(private geo: StageGeometry) {}

  private setPhase(p: Phase, duration: number): void {
    this.phase = p;
    this.phaseStart = this.now;
    this.phaseEnd = this.now + duration;
  }

  /** Assign players to spawns in a seeded random order (E13) and begin the briefing. */
  start(players: RoundPlayer[], opts: StartOptions): Map<string, number> {
    this.seed = opts.seed >>> 0;
    this.roundS = opts.roundS ?? ROUND.roundS;
    this.schedule = buildSchedule(this.seed, this.roundS);
    this.skipped.clear();
    this.lastResults = [];
    const order = shuffled(players.map((p) => p.id), this.seed);
    const spawnOf = new Map<string, number>();
    order.forEach((id, i) => spawnOf.set(id, this.geo.spawns[i % this.geo.spawns.length].index));
    for (const p of players) {
      const s = this.geo.spawns.find((x) => x.index === spawnOf.get(p.id))!;
      Object.assign(p, { spawn: s.index, x: s.x, z: s.z, status: 'active', finishTime: -1, spotTime: -1, redDisp: 0, recent: [] });
    }
    this.setPhase('briefing', opts.briefingS ?? ROUND.briefingS);
    return spawnOf;
  }

  /** A player has read the briefing; the countdown starts early once everyone has. */
  skip(id: string, playerIds: string[]): void {
    if (this.phase !== 'briefing') return;
    this.skipped.add(id);
    if (playerIds.every((x) => this.skipped.has(x))) this.phaseEnd = Math.min(this.phaseEnd, this.now);
  }

  signal(): Signal {
    if (this.phase !== 'active') return 'none';
    return segmentAt(this.schedule, this.now - this.goTime)?.signal ?? 'green';
  }

  /** Movement is allowed in the lobby (practice walk) and for active players during the round. */
  canMove(p: RoundPlayer): boolean {
    if (this.phase === 'lobby') return true;
    if (this.phase !== 'active') return false;
    return p.status === 'active' || p.status === 'finished';
  }

  /** Detection and finish after a movement step of (dx, dz) metres over dt seconds. */
  afterMove(p: RoundPlayer, dx: number, dz: number, dt: number, ev: RoundEvents): void {
    if (this.phase !== 'active' || p.status !== 'active') return;
    if (insideRect(this.geo.finish, p.x, p.z) || insideRect(this.geo.safe, p.x, p.z)) {
      p.status = 'finished';
      p.finishTime = Math.round((this.now - this.goTime) * 1000) / 1000;
      ev.finished.push(p.id);
      return;
    }
    const seg = segmentAt(this.schedule, this.now - this.goTime);
    if (!seg || seg.signal !== 'red') { p.redDisp = 0; p.recent = []; return; }
    const sinceRed = this.now - this.goTime - seg.start;
    if (sinceRed < graceFor(p.latencyS)) { p.redDisp = 0; p.recent = []; return; }
    const d = Math.hypot(dx, dz);
    p.redDisp += d;
    p.recent.push(d / dt);
    if (p.recent.length > ROUND.speedWindow) p.recent.shift();
    const avg = p.recent.length === ROUND.speedWindow ? p.recent.reduce((a, b) => a + b, 0) / ROUND.speedWindow : 0;
    if (p.redDisp > ROUND.dispLimit || avg > ROUND.speedLimit) {
      p.status = 'spotted';
      p.spotTime = this.now;
      ev.spotted.push(p.id);
    }
  }

  /** Called when a red phase starts for players who sent no movement (resets their window). */
  tick(now: number, players: RoundPlayer[]): RoundEvents {
    this.now = now;
    const ev: RoundEvents = { spotted: [], finished: [] };
    if (this.phase === 'lobby' || now < this.phaseEnd) {
      if (this.phase === 'active' && !players.some((p) => p.status === 'active')) this.phaseEnd = now; // nobody left
      else return ev;
    }
    switch (this.phase) {
      case 'briefing':
        this.setPhase('countdown', ROUND.countdownS);
        break;
      case 'countdown':
        this.setPhase('active', this.roundS);
        this.goTime = now;
        break;
      case 'active':
        this.lastResults = rankPlayers(players.filter((p) => p.status !== 'waiting'), this.geo);
        ev.results = this.lastResults;
        this.setPhase('results', ROUND.resultsS);
        break;
      case 'results':
        this.setPhase('lobby', Infinity);
        break;
    }
    ev.phase = this.phase;
    return ev;
  }

  /** Seconds left in the current phase (Infinity in the lobby). */
  remaining(): number {
    return Math.max(0, this.phaseEnd - this.now);
  }
}
