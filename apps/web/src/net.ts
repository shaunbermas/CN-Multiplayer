import { DEFAULT_ROOM, RoomClient } from '@cn-trials/shared';

export type TrialRoom = RoomClient;
export type { PlayerView } from '@cn-trials/shared';

/** Room WebSocket URL. Same origin in production (the Worker serves both the page and /api). */
export function roomUrl(code = DEFAULT_ROOM): string {
  const fromQuery = new URLSearchParams(location.search).get('server');
  if (fromQuery && /^wss?:\/\/[^/]+$/.test(fromQuery)) return `${fromQuery}/api/room/${code}/ws`;
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${location.host}/api/room/${code}/ws`;
}

/** Private room codes: 5 letters/digits without look-alikes (server accepts [a-z0-9-]{1,32}). */
export function newRoomCode(): string {
  const abc = 'abcdefghjkmnpqrstuvwxyz23456789';
  const r = crypto.getRandomValues(new Uint32Array(5));
  return Array.from(r, (n) => abc[n % abc.length]).join('');
}

export function inviteLink(code: string): string {
  return `${location.origin}${location.pathname}?room=${encodeURIComponent(code)}`;
}

export async function joinTrial(name: string, code = DEFAULT_ROOM): Promise<TrialRoom> {
  const room = await RoomClient.connect(roomUrl(code), name);
  // Wait for the first snapshot so our own position is known before the scene starts.
  if (!room.snapshots) await new Promise<void>((res) => room.onSnapshot(res));
  return room;
}
