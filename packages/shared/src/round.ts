// Red Light, Green Light round rules (docs/STAGE_01_SPEC.md §3–§5). Pure and deterministic: the room
// (server) drives it with tick(); the same code is unit tested. Coordinates are game coordinates
// (metres, course toward -Z). Times are seconds of room time.
import { insideRect, type StageGeometry } from './stage.ts';
import type { Mode } from './tournament.ts';

export type Phase = 'lobby' | 'briefing' | 'countdown' | 'active' | 'results';
export type Signal = 'none' | 'green' | 'warning' | 'red';
/** 'captured' is The Hunt only (caught by a hunter: spectates until the next stage). */
export type PlayerStatus = 'active' | 'finished' | 'spotted' | 'waiting' | 'captured';

/**
 * Round timing and detection: the ONE place these numbers live (server and client both import it).
 * Stage 01 refinement (owner brief 24 Nov 2026, "the game takes too long"): shorter briefing, round, red
 * lights and results; warning length and detection grace are unchanged (fairness). Previous values in
 * brackets; rationale and measurements in docs/STAGE_01_REFINEMENT_IMPLEMENTATION.md §Timing.
 * The match's between-stage timings live here too, so every game length is tuned in this one block.
 */
export const ROUND = {
  briefingS: 6,         // S1 (skippable)            [15]
  countdownS: 3,        // S2                         [3]
  roundS: 100,          // R1                         [120]
  /** New: once the first player finishes, the others have this long before the round closes. */
  closeAfterFirstS: 30, //                            [none: the full timer always ran]
  greenMinS: 3, greenMaxS: 5.5, firstGreenMinS: 4, // S3 [3, 6, 5]
  /** Decision 037 (owner, 25 Nov 2026): no amber "get ready" warning; RED follows GREEN directly. */
  warningS: 0,          // S4                         [0.8]
  redMinS: 1.8, redMaxS: 3.2, // S5                   [3, 5]
  /** D1: with no warning, the grace is the whole time to react to RED (decision 037), so it is a little longer. */
  graceBaseS: 0.4, graceMaxS: 0.6, //                 [0.3, 0.5]
  speedLimit: 0.3,      // D2 m/s, averaged over speedWindow ticks
  speedWindow: 3,
  dispLimit: 0.15,      // D2 m since the grace window ended
  resultsS: 9,          // single-stage default                          [20]
  /** Decision 054 (owner, 27 Nov 2026): a caught player is frozen in ice instead of eliminated. The thaw countdown
   *  starts only when the next GREEN (GO) begins, then the player can move again after this many seconds. */
  freezeS: 2,
  /** Client-authoritative movement (decision 054): the room's backstop only catches a player whose reported moves
   *  clearly ignore a red light (their own browser normally catches them first). Grace after red starts (plus
   *  twice the player's one-way latency) and the distance they may cover after it. */
  backstopGraceS: 1.0,
  backstopDisp: 0.75,
  /** How long after a red ends the room still accepts a player's own "I was caught" report (latency, clock skew). */
  caughtReportS: 0.75,
  // Match flow (match.ts reads these): results between stages, the final leaderboard, later briefings.
  // Decision 052 (owner, 27 Nov 2026: "do not redirect players to the next stage"): the ranking stays up until the
  // host picks Next stage (or Back to lobby / Restart); the long limit only stops an abandoned room waiting forever.
  stageResultsS: 600,   // ranking after a stage, until the host continues
  finalResultsS: 600,   // final ranking, until the host continues
  championResultsS: 600, // winner ceremony after the last stage, until the host continues
  nextBriefingS: 4,     // stage 2 onward (rules already known, skippable) [new]
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

/** Seeded GREEN → RED cycle covering [0, totalS) from GO (a WARNING segment only if warningS > 0). The first green lasts at least 4 s. */
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
    if (ROUND.warningS > 0) { segs.push({ signal: 'warning', start: t, end: t + ROUND.warningS }); t += ROUND.warningS; }
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
  /** Room time until which the player is knocked down by a collision (no control), or 0. */
  downUntil: number;
  /** Room time until which a collision cannot knock the player down again, or 0. */
  immuneUntil: number;
  /** Decision 054: room time when the ice thaws (caught in a red light), or 0 when not frozen. */
  frozenUntil: number;
  /** Decision 054: times caught moving in a red light this round (results and tie-break). */
  catches: number;
}

export function newRoundPlayer(id: string, joinOrder: number, spawn: number, x: number, z: number): RoundPlayer {
  return { id, joinOrder, spawn, x, z, status: 'active', finishTime: -1, spotTime: -1, latencyS: 0, redDisp: 0, recent: [], downUntil: 0, immuneUntil: 0, frozenUntil: 0, catches: 0 };
}

export function graceFor(latencyS: number): number {
  return Math.min(ROUND.graceMaxS, ROUND.graceBaseS + Math.max(0, latencyS));
}

export interface Placing {
  id: string; place: number; status: PlayerStatus; finishTime: number; progress: number; qualified: boolean;
  /** Points decided by the stage's own rules (The Hunt); when absent, match.ts scores by finish order. */
  points?: number;
  /** A stage win decided by the stage's own rules (Agawan Base: its top player, decision 050). */
  first?: boolean;
  /** The Hunt: the player's role and successful captures (hunters). */
  role?: 'hunter' | 'hider';
  captures?: number;
  /** Agawan Base: the player's team, its placement (1-3) and the player's own tags, rescues and raids. */
  team?: 'A' | 'B' | 'C';
  teamPlace?: number;
  /** Agawan Base: the team's gameplay score (raids, unique tags and rescues), for the team championship tie-break. */
  teamScore?: number;
  tags?: number;
  rescues?: number;
  raids?: number;
  /** Stage 01 (decision 054): times this player was caught and frozen. */
  caught?: number;
}

/** Spec R3: qualifier target for a full tournament; 30 starters -> 22. Standup Quick has no target. */
export function qualifierTarget(mode: Mode, starters: number): number {
  if (mode !== 'tournament' || starters <= 0) return Infinity;
  return Math.max(Math.min(2, starters), Math.min(starters, Math.round(0.73 * starters)));
}

/**
 * Spec R3/R4: who qualifies, from placings already in R5 order. Standup: every finisher. Tournament:
 * finishers up to the target; if fewer than min(2, starters) finished, the furthest-progressed unspotted
 * players fill up to that minimum.
 */
export function qualify(placings: Placing[], mode: Mode, starters: number): Placing[] {
  const target = qualifierTarget(mode, starters);
  const out = placings.map((p) => ({ ...p, qualified: false }));
  let n = 0;
  for (const p of out) if (p.status === 'finished' && n < target) { p.qualified = true; n++; }
  if (mode === 'tournament') {
    const minimum = Math.min(2, starters);
    for (const p of out) if (n < minimum && !p.qualified && p.status === 'active') { p.qualified = true; n++; }
  }
  return out;
}

/**
 * Spec R5–R7: finishers by time, then unfinished by progress, then spotted (latest spot first). Decision 054: nobody
 * is spotted out of Stage 01 any more (a caught player is frozen, then plays on); an unfinished tie on progress goes
 * to the player caught fewer times.
 */
export function rankPlayers(players: RoundPlayer[], geo: StageGeometry): Placing[] {
  const progress = (p: RoundPlayer) => Math.max(0, Math.min(1, (p.z - geo.startZ) / (geo.finishZ - geo.startZ)));
  const finished = players.filter((p) => p.status === 'finished')
    .sort((a, b) => a.finishTime - b.finishTime || a.z - b.z || a.joinOrder - b.joinOrder);
  const active = players.filter((p) => p.status === 'active')
    .sort((a, b) => a.z - b.z || (a.catches ?? 0) - (b.catches ?? 0) || a.joinOrder - b.joinOrder);
  const spotted = players.filter((p) => p.status === 'spotted')
    .sort((a, b) => b.spotTime - a.spotTime || a.z - b.z || a.joinOrder - b.joinOrder);
  return [...finished, ...active, ...spotted].map((p, i) => ({
    id: p.id, place: i + 1, status: p.status, finishTime: p.finishTime, progress: Math.round(progress(p) * 1000) / 1000, qualified: false,
    ...(p.catches ? { caught: p.catches } : {}),
  }));
}

/** Decision 054: room time when a player caught at room time `now` thaws: freezeS after the next GO (or after now,
 *  if the light is already green when the catch is recorded). */
export function thawTime(schedule: SignalSegment[], goTime: number, now: number): number {
  const seg = segmentAt(schedule, now - goTime);
  const go = seg && seg.signal !== 'green' ? goTime + seg.end : now;
  return go + ROUND.freezeS;
}

/**
 * The red-light detector (spec D1–D2) for one player, as a small state machine both the room (bots and server-moved
 * players) and the browser (its own player, decision 054) run on every movement step. Only movement from the
 * player's own input counts: bumps and pushes never do.
 */
export interface RedWatch { redDisp: number; recent: number[] }
export function redStep(w: RedWatch, sinceRed: number, grace: number, d: number, dt: number): boolean {
  if (sinceRed < 0 || sinceRed < grace) { w.redDisp = 0; w.recent.length = 0; return false; }
  w.redDisp += d;
  w.recent.push(d / dt);
  if (w.recent.length > ROUND.speedWindow) w.recent.shift();
  const avg = w.recent.length === ROUND.speedWindow ? w.recent.reduce((a, b) => a + b, 0) / ROUND.speedWindow : 0;
  return w.redDisp > ROUND.dispLimit || avg > ROUND.speedLimit;
}

// ------------------------------------------------------------------ engine
export interface RoundEvents {
  phase?: Phase;
  spotted: string[];
  finished: string[];
  /** The Hunt: [hider, hunter] for each capture this tick. */
  captured?: [string, string][];
  results?: Placing[];
}

export interface StartOptions { seed: number; roundS?: number; briefingS?: number; mode?: Mode; /** Stage 1.5 obstacle twist (host toggle). */ obstacles?: boolean; /** Results screen length for this stage (match: per-stage or final). */ resultsS?: number; /** Seconds left for the others after the first finish. */ closeAfterFirstS?: number; /** Agawan Base: player id -> team slot, locked in the lobby. */ teams?: Record<string, 'A' | 'B' | 'C'>; /** Agawan Base: how many teams play (decision 049), 3 when not given. */ teamCount?: 2 | 3 }

/**
 * Phase machine for one room. The room calls:
 *  - start(players, opts) when the host starts a round
 *  - canMove(p) before applying a movement step
 *  - afterMove(p, dx, dz, dt) after each applied step (detection and finish)
 *  - tick(now) once per simulation tick (transitions)
 */
export class RoundEngine {
  readonly rules = 'red_light_green_light' as const;
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
  mode: Mode = 'standup';
  /** Stage 1.5 obstacle twist enabled for the current round (host toggle; rollback = off). */
  obstacles = false;
  starters = 0;
  /** Finishers needed to end the round early (tournament only; R2/R3). */
  target = Infinity;
  resultsS: number = ROUND.resultsS;
  closeAfterFirstS: number = ROUND.closeAfterFirstS;
  /** Room time of the first finish this round, or -1. */
  firstFinishAt = -1;

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
    this.resultsS = opts.resultsS ?? ROUND.resultsS;
    this.closeAfterFirstS = opts.closeAfterFirstS ?? ROUND.closeAfterFirstS;
    this.firstFinishAt = -1;
    this.schedule = buildSchedule(this.seed, this.roundS);
    this.skipped.clear();
    this.lastResults = [];
    this.mode = opts.mode === 'tournament' ? 'tournament' : 'standup';
    this.obstacles = opts.obstacles === true;
    this.starters = players.length;
    this.target = qualifierTarget(this.mode, this.starters);
    const order = shuffled(players.map((p) => p.id), this.seed);
    const spawnOf = new Map<string, number>();
    order.forEach((id, i) => spawnOf.set(id, this.geo.spawns[i % this.geo.spawns.length].index));
    for (const p of players) {
      const s = this.geo.spawns.find((x) => x.index === spawnOf.get(p.id))!;
      Object.assign(p, { spawn: s.index, x: s.x, z: s.z, status: 'active', finishTime: -1, spotTime: -1, redDisp: 0, recent: [], downUntil: 0, immuneUntil: 0, frozenUntil: 0, catches: 0 });
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
    if (p.downUntil > this.now) return false; // knocked down by a collision: no control until back up
    if (this.phase === 'lobby') return true;
    if (this.phase !== 'active') return false;
    if (p.frozenUntil > this.now) return false; // frozen in ice (decision 054) until 2 s after the next GO
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
    const sinceRed = seg && seg.signal === 'red' ? this.now - this.goTime - seg.start : -1;
    if (redStep(p, sinceRed, graceFor(p.latencyS), Math.hypot(dx, dz), dt)) this.freeze(p, ev);
  }

  /**
   * Decision 054: caught moving in a red light. No elimination: the player is frozen in ice, the thaw countdown
   * starts at the next GO, then they race on. The 'spotted' event still fires so The Watcher reacts.
   */
  freeze(p: RoundPlayer, ev: RoundEvents, thawAt?: number): void {
    if (this.phase !== 'active' || p.status !== 'active' || p.frozenUntil > this.now) return;
    p.frozenUntil = thawAt ?? thawTime(this.schedule, this.goTime, this.now);
    p.spotTime = this.now;
    p.catches = (p.catches ?? 0) + 1;
    p.redDisp = 0; p.recent = [];
    ev.spotted.push(p.id);
  }

  /**
   * Client-authoritative movement (decision 054): the player's own browser saw itself move in a red light and says
   * so. Accepted while the light is red, or just after it ended (the report travels over the network).
   */
  reportCaught(p: RoundPlayer, ev: RoundEvents, at?: number): boolean {
    if (this.phase !== 'active' || p.status !== 'active' || p.frozenUntil > this.now) return false;
    const t = this.now - this.goTime;
    const red = this.schedule.find((s) => s.signal === 'red' && t >= s.start && t < s.end + ROUND.caughtReportS);
    if (!red) return false;
    // The browser says when on its own clock it was caught (at, seconds since GO). Trusted only within the last
    // caughtReportS: a catch made during the red waits for that red's GO, even when the report lands after it.
    const tc = typeof at === 'number' && Number.isFinite(at) ? Math.max(t - ROUND.caughtReportS, Math.min(t, at)) : t;
    const inRed = tc < red.end;
    this.freeze(p, ev, inRed ? this.goTime + red.end + ROUND.freezeS : undefined);
    return true;
  }

  /**
   * Room backstop for client-authoritative players (decision 054): a much looser check on the positions they report,
   * so a browser that never reports itself still cannot walk through a red light. Normal players never reach it.
   */
  backstop(p: RoundPlayer & { bsDisp?: number }, d: number, ev: RoundEvents): void {
    if (this.phase !== 'active' || p.status !== 'active' || p.frozenUntil > this.now) { p.bsDisp = 0; return; }
    const seg = segmentAt(this.schedule, this.now - this.goTime);
    const sinceRed = seg && seg.signal === 'red' ? this.now - this.goTime - seg.start : -1;
    if (sinceRed < ROUND.backstopGraceS + 2 * Math.max(0, p.latencyS)) { p.bsDisp = 0; return; }
    p.bsDisp = (p.bsDisp ?? 0) + d;
    if (p.bsDisp > ROUND.backstopDisp) { p.bsDisp = 0; this.freeze(p, ev); }
  }

  /** Called when a red phase starts for players who sent no movement (resets their window). */
  tick(now: number, players: RoundPlayer[]): RoundEvents {
    this.now = now;
    const ev: RoundEvents = { spotted: [], finished: [] };
    if (this.phase === 'lobby' || now < this.phaseEnd) {
      const done = this.phase === 'active' && (!players.some((p) => p.status === 'active') // nobody left (R2)
        || players.filter((p) => p.status === 'finished').length >= this.target);         // qualifier target reached (R2)
      // Finish-line closing time (refinement): the first finish shortens the round to closeAfterFirstS from then.
      if (this.phase === 'active' && this.firstFinishAt < 0) {
        const f = players.find((p) => p.status === 'finished');
        if (f) { this.firstFinishAt = now; this.phaseEnd = Math.min(this.phaseEnd, now + this.closeAfterFirstS); }
      }
      if (done) this.phaseEnd = now;
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
        this.lastResults = qualify(rankPlayers(players.filter((p) => p.status !== 'waiting'), this.geo), this.mode, this.starters);
        ev.results = this.lastResults;
        this.setPhase('results', this.resultsS);
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
