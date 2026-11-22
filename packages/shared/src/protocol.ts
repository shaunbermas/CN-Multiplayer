// WebSocket protocol between the browser and the room (a Cloudflare Durable Object, ADR 0002).
// JSON text frames. The client only ever sends inputs and requests; the server owns movement,
// signals, detection and results (GDD §7.3).
import type { Phase, Placing, PlayerStatus, Signal } from './round.ts';
import type { Mode } from './tournament.ts';

export const PROTOCOL_VERSION = 5;

export interface StartRequestOptions {
  /** Standup Quick (default) or a full tournament (qualifier target, R3). Host only. */
  mode?: Mode;
  /** Stage 1.5 obstacle twist (barricade rows and the green-only sliding gate). Host only; off by default. */
  obstacles?: boolean;
  /** Honoured only when the room runs with CN_TEST=1 (deterministic tests). */
  seed?: number;
  roundS?: number;
  briefingS?: number;
}

// ---- client -> server
export type ClientMessage =
  | { t: 'join'; v: number; name: string }
  | { t: 'input'; seq: number; mx: number; mz: number; yaw: number }
  | { t: 'respawn' }
  | { t: 'start'; opts?: StartRequestOptions }
  | { t: 'skip' }
  | { t: 'probe_ack'; id: number }
  | { t: 'ping'; at: number }
  /** Stage 1.5 lobby: the player is ready (the host can still start at any time). */
  | { t: 'ready'; ready: boolean };

// ---- server -> client
export interface RosterEntry { id: string; name: string; spawn: number; /** Ready in the lobby (Stage 1.5). */ ready?: boolean; /** Character dealt by the server, unique in the room (CHR_01–CHR_30; protocol v5). */ character: string }

/** One player in a snapshot: [id, x, z, vx, vz, yaw, ack, status, finishTime]. */
export type SnapRow = [string, number, number, number, number, number, number, number, number];

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
  /** Stage 1.5: the obstacle twist is active for this round (protocol v4). */
  obstacles: boolean;
}

export type ServerMessage =
  | { t: 'welcome'; v: number; id: string; room: string; stage: string; spawn: number; roster: RosterEntry[]; round: RoundState }
  | { t: 'roster'; roster: RosterEntry[] }
  | { t: 'snap'; time: number; rows: SnapRow[]; round: RoundState }
  | { t: 'results'; roundId: number; stage: string; mode: Mode; placings: (Placing & { name: string })[] }
  /** at = seconds since GO, on the server's clock. */
  | { t: 'event'; kind: 'spotted' | 'finished'; id: string; at: number }
  | { t: 'probe'; id: number }
  | { t: 'pong'; at: number }
  | { t: 'error'; code: 'full' | 'version' | 'bad_request' | 'not_host'; message: string };

export const STATUS_CODE: Record<PlayerStatus, number> = { active: 0, finished: 1, spotted: 2, waiting: 3 };
export const STATUS_OF: PlayerStatus[] = ['active', 'finished', 'spotted', 'waiting'];

/** Close codes used by the room. */
export const CLOSE = { full: 4001, version: 4002, replaced: 4003 } as const;

export const SNAPSHOT_MS = 50; // 20 Hz
export const PROBE_MS = 2000;  // latency probes
export const MAX_MESSAGE_BYTES = 4096;

const r2 = (n: number) => Math.round(n * 100) / 100;
const r3 = (n: number) => Math.round(n * 1000) / 1000;

export function encodeRow(
  id: string, p: { x: number; z: number; vx: number; vz: number; yaw: number; ack: number; status: PlayerStatus; finishTime: number },
): SnapRow {
  return [id, r3(p.x), r3(p.z), r3(p.vx), r3(p.vz), r2(p.yaw), p.ack, STATUS_CODE[p.status], p.finishTime];
}
