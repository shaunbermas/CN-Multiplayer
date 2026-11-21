// Tournament manager: receives each stage's frozen results exactly once and decides what comes next.
// Pure and server-owned (the room calls it). Standup Quick plays one stage and returns to the lobby;
// a full tournament advances through TOURNAMENT_ORDER with only the qualified players (GDD §2.3).
import type { Placing } from './round.ts';

export type Mode = 'standup' | 'tournament';

export interface StageResult {
  roundId: number;
  stageId: string;
  mode: Mode;
  seed: number;
  placings: Placing[];
  qualifiedIds: string[];
}

export interface NextStep {
  /** False when this round's result was already recorded (duplicate handoff ignored). */
  recorded: boolean;
  /** Stage to play next, or null when the session returns to the lobby. */
  nextStageId: string | null;
  /** Players still in the tournament after this stage. */
  remaining: string[];
}

export class Tournament {
  readonly results: StageResult[] = [];
  private index = 0;

  constructor(readonly order: string[]) {}

  get currentStageId(): string { return this.order[this.index] ?? this.order[0]; }

  /** Hand over a frozen stage result. Idempotent per roundId: a second call changes nothing. */
  complete(r: StageResult): NextStep {
    if (this.results.some((x) => x.roundId === r.roundId)) {
      return { recorded: false, nextStageId: null, remaining: r.qualifiedIds };
    }
    this.results.push({ ...r, placings: r.placings.map((p) => ({ ...p })), qualifiedIds: [...r.qualifiedIds] });
    if (r.mode === 'standup' || this.index + 1 >= this.order.length) {
      this.index = 0; // session over: back to the lobby on the first stage
      return { recorded: true, nextStageId: null, remaining: r.qualifiedIds };
    }
    this.index++;
    return { recorded: true, nextStageId: this.order[this.index], remaining: r.qualifiedIds };
  }
}
