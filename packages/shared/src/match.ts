// Multi-stage match with accumulated points (Stage 01 refinement, owner brief 24 Nov 2026, decision 033).
// Replaces the tournament winner logic (qualifier targets) for the player-facing flow: every player plays every
// stage, each stage awards points, and the overall winner has the most points after the last stage.
// Pure and server-owned: the room records each stage's frozen placings exactly once.
//
// Points per stage (docs/STAGE_01_SCORING_SYSTEM.md):
//   first player to finish (decided by the server's finish order)  2
//   every other player who finishes                                1
//   eliminated (spotted), or did not finish in time                0
//
// Tie-breaker for the overall ranking, in order:
//   1. more points
//   2. more stage wins (first finishes)
//   3. more stages finished
//   4. lower total finish time over the stages they finished
//   5. better place in the last stage played
//   6. earlier to join the room (deterministic last resort, so there is always exactly one winner)
import { ROUND, type Placing } from './round.ts';
import { DEFAULT_STAGE_ID, MATCH_ORDER } from './stages.ts';

export const MATCH = {
  /**
   * Stages in one match. Only Stage 01 exists (Stage 02 is not started), so a match plays Stage 01 this many
   * times; when Stage 02+ exist, MATCH_ORDER lists them instead. Configurable here only.
   */
  stages: 3,
  points: { first: 2, finished: 1, eliminated: 0, unfinished: 0 },
  /** Timings come from ROUND (round.ts), the one block where every game length is tuned. */
  stageResultsS: ROUND.stageResultsS,
  finalResultsS: ROUND.finalResultsS,
  nextBriefingS: ROUND.nextBriefingS,
} as const;

/** Stage order for a match of `n` stages: the given stages in order, repeating when n is longer. */
export function matchOrder(n: number = MATCH.stages, available: string[] = MATCH_ORDER): string[] {
  const count = Math.max(1, Math.min(10, Math.floor(n)));
  return Array.from({ length: count }, (_, i) => available[i % available.length]);
}

export interface StageScore {
  id: string;
  place: number;
  status: Placing['status'];
  finishTime: number;
  /** Points awarded for this stage. */
  points: number;
  /** This player was the stage's first finisher. */
  first: boolean;
}

/** Points for one stage from placings already in finish order (rankPlayers). Exactly one first-place award. */
export function scoreStage(placings: Placing[]): StageScore[] {
  // The first finisher is the finished player with the lowest server finish time (ties: rankPlayers order).
  let firstId: string | null = null;
  let best = Infinity;
  for (const p of placings) if (p.status === 'finished' && p.finishTime < best) { best = p.finishTime; firstId = p.id; }
  // Stage 02 (and later stages with their own scoring) hand over points already decided by their rules.
  if (placings.some((p) => typeof p.points === 'number')) {
    return placings.map((p) => ({ id: p.id, place: p.place, status: p.status, finishTime: p.finishTime, points: Math.max(0, Math.min(MATCH.points.first, p.points ?? 0)), first: false }));
  }
  return placings.map((p) => {
    const first = p.id === firstId;
    const points = p.status === 'finished' ? (first ? MATCH.points.first : MATCH.points.finished)
      : p.status === 'spotted' ? MATCH.points.eliminated : MATCH.points.unfinished;
    return { id: p.id, place: p.place, status: p.status, finishTime: p.finishTime, points, first };
  });
}

export interface Standing {
  id: string;
  name: string;
  /** 1-based overall rank after tie-breakers. */
  rank: number;
  points: number;
  wins: number;
  finishes: number;
  /** Sum of finish times over finished stages (s). */
  timeSum: number;
  /** Place in the last stage this player played, or 99. */
  lastPlace: number;
  stagesPlayed: number;
  bot: boolean;
  /** The player has left the room (kept so their points stay on the board). */
  left: boolean;
  /** Points per stage, in stage order (null = did not play that stage). */
  perStage: (number | null)[];
  /** Points gained in the most recent stage (null = did not play it). */
  last: number | null;
}

interface Entry {
  id: string; name: string; joinOrder: number; bot: boolean; left: boolean;
  points: number; wins: number; finishes: number; timeSum: number; lastPlace: number; stagesPlayed: number;
  perStage: (number | null)[];
}

export interface PlayerRef { id: string; name: string; joinOrder: number; bot?: boolean }

export class Match {
  readonly order: string[];
  /** 0-based index of the current (or last played) stage. */
  index = 0;
  private recorded = new Set<number>();
  private entries = new Map<string, Entry>();
  /** Scores of each recorded stage, in order. */
  readonly stageScores: StageScore[][] = [];

  constructor(order: string[] = matchOrder()) { this.order = order.length ? order : matchOrder(); }

  /** Start the match at a later stage (landing page picker); earlier stages are not played (null points). */
  startAt(stageId: string): void {
    const i = this.order.indexOf(stageId);
    if (i > 0) this.index = i;
  }

  get stageId(): string { return this.order[Math.min(this.index, this.order.length - 1)]; }
  get total(): number { return this.order.length; }
  /** The stage being played (or just finished) is the last one. */
  get isFinal(): boolean { return this.index >= this.order.length - 1; }
  get completedStages(): number { return this.stageScores.length; }

  /** Make sure a player has a row (joined mid-match: zero points for the stages they missed). */
  ensure(p: PlayerRef): void {
    const e = this.entries.get(p.id);
    if (e) { e.name = p.name; e.left = false; return; }
    this.entries.set(p.id, {
      id: p.id, name: p.name, joinOrder: p.joinOrder, bot: !!p.bot, left: false,
      points: 0, wins: 0, finishes: 0, timeSum: 0, lastPlace: 99, stagesPlayed: 0, perStage: this.order.map(() => null),
    });
  }

  /** A player left: their points stay on the board, marked as left. */
  markLeft(id: string): void { const e = this.entries.get(id); if (e) e.left = true; }

  /** Remove a bot entirely (bots removed in the lobby before a match do not belong on the board). */
  forget(id: string): void { this.entries.delete(id); }

  /**
   * Record one stage's frozen placings. Idempotent per roundId: a second call with the same round changes
   * nothing and returns null (no duplicate awards). Returns the stage scores otherwise.
   */
  record(roundId: number, placings: Placing[], players: PlayerRef[]): StageScore[] | null {
    if (this.recorded.has(roundId)) return null;
    this.recorded.add(roundId);
    for (const p of players) this.ensure(p);
    const scores = scoreStage(placings);
    const stageNo = this.index;
    for (const s of scores) {
      const e = this.entries.get(s.id);
      if (!e) continue;
      e.points += s.points;
      e.perStage[stageNo] = s.points;
      e.stagesPlayed++;
      e.lastPlace = s.place;
      if (s.first) e.wins++;
      if (s.status === 'finished') { e.finishes++; if (s.finishTime >= 0) e.timeSum += s.finishTime; }
    }
    this.stageScores[stageNo] = scores;
    return scores;
  }

  /** Move to the next stage; returns false when the match is over. */
  advance(): boolean {
    if (this.isFinal) return false;
    this.index++;
    return true;
  }

  /** Overall ranking with the documented tie-breakers. */
  standings(): Standing[] {
    const last = this.stageScores.length - 1;
    const rows = [...this.entries.values()].sort(compareEntries);
    return rows.map((e, i) => ({
      id: e.id, name: e.name, rank: i + 1, points: e.points, wins: e.wins, finishes: e.finishes,
      timeSum: Math.round(e.timeSum * 1000) / 1000, lastPlace: e.lastPlace, stagesPlayed: e.stagesPlayed, bot: e.bot, left: e.left,
      perStage: [...e.perStage], last: last >= 0 ? e.perStage[last] ?? null : null,
    }));
  }

  /** The overall leader (winner once the match is over), or null with no players. */
  leader(): Standing | null { return this.standings()[0] ?? null; }
}

function compareEntries(a: Entry, b: Entry): number {
  return b.points - a.points
    || b.wins - a.wins
    || b.finishes - a.finishes
    || a.timeSum - b.timeSum
    || a.lastPlace - b.lastPlace
    || a.joinOrder - b.joinOrder;
}

/** Which tie-breaker separated two neighbouring standings (for the winner card); null when points differ. */
export function tieBreakReason(a: Standing, b: Standing | undefined): string | null {
  if (!b || a.points !== b.points) return null;
  if (a.wins !== b.wins) return 'more stage wins';
  if (a.finishes !== b.finishes) return 'more stages finished';
  if (a.timeSum !== b.timeSum) return 'faster total finish time';
  if (a.lastPlace !== b.lastPlace) return 'better place in the last stage';
  return 'joined the room first';
}
