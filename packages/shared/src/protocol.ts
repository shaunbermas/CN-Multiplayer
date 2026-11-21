// WebSocket protocol between the browser and the room (a Cloudflare Durable Object, ADR 0002).
// JSON text frames. The client only ever sends inputs; the server owns movement and results (GDD §7.3).

export const PROTOCOL_VERSION = 1;

// ---- client -> server
export type ClientMessage =
  | { t: 'join'; v: number; name: string }
  | { t: 'input'; seq: number; mx: number; mz: number; yaw: number }
  | { t: 'respawn' }
  | { t: 'ping'; at: number };

// ---- server -> client
export interface RosterEntry { id: string; name: string; spawn: number }

/** One player in a snapshot, as a compact array: [id, x, z, vx, vz, yaw, ack, status, finishTime]. */
export type SnapRow = [string, number, number, number, number, number, number, 0 | 1, number];

export type ServerMessage =
  | { t: 'welcome'; v: number; id: string; room: string; stage: string; spawn: number; roster: RosterEntry[] }
  | { t: 'roster'; roster: RosterEntry[] }
  | { t: 'snap'; time: number; rows: SnapRow[] }
  | { t: 'pong'; at: number }
  | { t: 'error'; code: 'full' | 'version' | 'bad_request'; message: string };

export const STATUS = { active: 0, finished: 1 } as const;

/** Close codes used by the room. */
export const CLOSE = { full: 4001, version: 4002, replaced: 4003 } as const;

export const SNAPSHOT_MS = 50; // 20 Hz, same as the Colyseus default it replaces
export const MAX_MESSAGE_BYTES = 4096;

const r2 = (n: number) => Math.round(n * 100) / 100;
const r3 = (n: number) => Math.round(n * 1000) / 1000;

export function encodeRow(
  id: string, p: { x: number; z: number; vx: number; vz: number; yaw: number; ack: number; finished: boolean; finishTime: number },
): SnapRow {
  return [id, r3(p.x), r3(p.z), r3(p.vx), r3(p.vz), r2(p.yaw), p.ack, p.finished ? 1 : 0, p.finishTime];
}
