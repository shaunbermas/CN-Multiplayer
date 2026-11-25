// The contract between the room (apps/server/src/room.ts) and a stage's rules engine (intelligence doc 09, A3).
// Stage 01's RoundEngine (Red Light, Green Light) and Stage 02's HuntEngine (The Hunt) both implement it, and the
// room builds a NEW engine for every stage it starts (loadStage), so no timer, role or capture survives a stage
// change. Stage 03 adds a third implementation.
import type { Phase, Placing, RoundEvents, RoundPlayer, Signal, SignalSegment, StartOptions } from './round.ts';
import type { Mode } from './tournament.ts';
import type { Rect } from './stage.ts';

export interface StageEngine {
  readonly rules: 'red_light_green_light' | 'hide_and_hunt';
  phase: Phase;
  phaseEnd: number;
  now: number;
  seed: number;
  mode: Mode;
  target: number;
  obstacles: boolean;
  goTime: number;
  /** Red Light signal schedule (empty for stages without signals). */
  schedule: SignalSegment[];
  lastResults: Placing[];
  start(players: RoundPlayer[], opts: StartOptions): Map<string, number>;
  skip(id: string, playerIds: string[]): void;
  signal(): Signal;
  canMove(p: RoundPlayer): boolean;
  afterMove(p: RoundPlayer, dx: number, dz: number, dt: number, ev: RoundEvents): void;
  tick(now: number, players: RoundPlayer[]): RoundEvents;
  remaining(): number;
  /** Speed multiplier for a player's next movement step (sprint, crouch); 1 by default. */
  speedScale?(p: RoundPlayer): number;
  /** Extra collision walls right now (Stage 02: the hunter gates during the head start). */
  extraWalls?(): Rect[];
}
