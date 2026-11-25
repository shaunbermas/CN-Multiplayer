// WebSocket protocol between the browser and the room (a Cloudflare Durable Object, ADR 0002).
// JSON text frames. The client only ever sends inputs and requests; the server owns movement,
// signals, detection and results (GDD §7.3).
import type { Phase, Placing, PlayerStatus, Signal } from './round.ts';
import type { Mode } from './tournament.ts';
import type { Emote } from './contestantColorways.ts';
import type { Standing } from './match.ts';
import type { HuntPrivate, HuntPublic } from './stage02/hunt.ts';

/** v7 (Stage 01 refinement): bots, collisions (knock-down timer in snapshots), multi-stage match with points.
 *  v8 (Stage 02): input flags, stage actions, per-player Stage 02 state, filtered snapshots, reconnect by key, start stage. */
export const PROTOCOL_VERSION = 8;

export interface StartRequestOptions {
  /** Obstacles are always on (decision 031). `false` is honoured only in test rooms (CN_TEST=1). */
  obstacles?: boolean;
  /** Honoured only when the room runs with CN_TEST=1 (deterministic tests). */
  seed?: number;
  roundS?: number;
  briefingS?: number;
  /** Test rooms only: stages in the match (default MATCH.stages) and results length. */
  stages?: number;
  resultsS?: number;
  /** Stage the match starts at (landing page picker; any room). Unknown ids start at Stage 01. */
  startStage?: string;
}

/** Host-only bot management in the lobby: add some random bots, fill every free slot, or remove them all. */
export type BotAction = { t: 'bots'; action: 'add'; count?: number } | { t: 'bots'; action: 'fill' } | { t: 'bots'; action: 'clear' };

// ---- client -> server
export type ClientMessage =
  /** key: the browser's opaque player key, so a returning player keeps their colourway (protocol v6). */
  | { t: 'join'; v: number; name: string; key?: string }
  /** k: flags (Stage 02): 1 crouch held, 2 sprint requested. */
  | { t: 'input'; seq: number; mx: number; mz: number; yaw: number; k?: number }
  /** Stage 02 actions: Pulse Detector (hunter), hold/release capture (hunter), enter/leave a hiding place (hider). */
  | { t: 'act'; a: 'pulse' | 'hide' }
  | { t: 'act'; a: 'capture'; on: boolean }
  | { t: 'respawn' }
  | { t: 'start'; opts?: StartRequestOptions }
  | { t: 'skip' }
  | { t: 'probe_ack'; id: number }
  | { t: 'ping'; at: number }
  /** Stage 1.5 lobby: the player is ready (the host can still start at any time). */
  | { t: 'ready'; ready: boolean }
  /** Lobby emote (jump, dive): visual only; the server rebroadcasts it and never moves the player (v6). */
  | { t: 'emote'; e: Emote }
  /** Host: add / fill / clear bots (lobby only, v7). */
  | BotAction
  /** Host: skip the rest of the stage results and start the next stage now (v7). */
  | { t: 'next' }
  /** Host: restart the match from stage 1 with everyone in the room, during play or from the final results. */
  | { t: 'restart' };

// ---- server -> client
export interface RosterEntry { /** Disconnected mid-match, seat kept for a reconnect (v8). */ away?: boolean; id: string; name: string; spawn: number; /** Ready in the lobby (Stage 1.5). */ ready?: boolean; /** Colourway of the shared contestant, unique in the room and kept on reconnect (CW01–CW30; protocol v6). */ colorway: string; /** Server-side bot (v7). */ bot?: boolean }

/** One player in a snapshot: [id, x, z, vx, vz, yaw, ack, status, finishTime, down]; down = seconds of knock-down left (v7). */
export type SnapRow = [string, number, number, number, number, number, number, number, number, number];

/** Where the room is in its multi-stage match (v7). */
export interface MatchState {
  /** 1-based number of the stage being played (or just finished). */
  stage: number;
  /** Stages in this match. */
  total: number;
  /** Stage results are the last of the match (the final leaderboard is showing). */
  final: boolean;
}

export interface RoundState {
  phase: Phase;
  signal: Signal;
  /** Seconds left in the current phase; -1 in the lobby. */
  remaining: number;
  /** Seconds since GO during the active phase, else 0. */
  elapsed: number;
  host: string;
  seed: number;
  /** Stage being played (stage registry id). */
  stage: string;
  mode: Mode;
  /** Finishers that end the round early (tournament), or -1 when there is no target. */
  target: number;
  /** The obstacles are active (always, in the lobby too; test rooms may switch them off). */
  obstacles: boolean;
  /** Multi-stage match progress (v7); stage 0 in the lobby before the first match. */
  match: MatchState;
  /** Stage 02 public state (v8): head start, hunter ids, hider counts. Never a hider's position. */
  hunt?: HuntPublic;
}

/** One player's line in the stage results (v7: points). */
export type ResultPlacing = Placing & { name: string; points: number; first: boolean; bot?: boolean };

export type ServerMessage =
  | { t: 'welcome'; v: number; id: string; room: string; stage: string; spawn: number; roster: RosterEntry[]; round: RoundState }
  | { t: 'roster'; roster: RosterEntry[] }
  /**
   * Stage 02 snapshots are made per player (v8): rows only for players the receiver may see (line of sight,
   * nobody hidden), and `me` with the receiver's own private stage state. `all` = rows are complete (Stage 01).
   */
  | { t: 'snap'; time: number; rows: SnapRow[]; round: RoundState; me?: HuntPrivate; all?: boolean }
  | { t: 'results'; roundId: number; stage: string; mode: Mode; placings: ResultPlacing[]; match: MatchState; standings: Standing[] }
  /** Overall standings (v7): after each stage and to a player joining mid-match. */
  | { t: 'standings'; match: MatchState; standings: Standing[] }
  /** at = seconds since GO, on the server's clock. `other`: the second player of a collision (v7). */
  | { t: 'event'; kind: 'spotted' | 'finished' | 'collision' | 'captured'; id: string; at: number; other?: string }
  | { t: 'probe'; id: number }
  | { t: 'pong'; at: number }
  | { t: 'emote'; id: string; e: Emote }
  | { t: 'error'; code: 'full' | 'version' | 'bad_request' | 'not_host' | 'not_lobby'; message: string };

export const STATUS_CODE: Record<PlayerStatus, number> = { active: 0, finished: 1, spotted: 2, waiting: 3, captured: 4 };
export const STATUS_OF: PlayerStatus[] = ['active', 'finished', 'spotted', 'waiting', 'captured'];

/** Close codes used by the room. */
export const CLOSE = { full: 4001, version: 4002, replaced: 4003 } as const;

export const SNAPSHOT_MS = 50; // 20 Hz
export const PROBE_MS = 2000;  // latency probes
export const MAX_MESSAGE_BYTES = 4096;

const r2 = (n: number) => Math.round(n * 100) / 100;
const r3 = (n: number) => Math.round(n * 1000) / 1000;

export function encodeRow(
  id: string, p: { x: number; z: number; vx: number; vz: number; yaw: number; ack: number; status: PlayerStatus; finishTime: number }, down = 0,
): SnapRow {
  return [id, r3(p.x), r3(p.z), r3(p.vx), r3(p.vz), r2(p.yaw), p.ack, STATUS_CODE[p.status], p.finishTime, r2(down)];
}
