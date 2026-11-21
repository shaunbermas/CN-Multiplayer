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

export async function joinTrial(name: string): Promise<TrialRoom> {
  const room = await RoomClient.connect(roomUrl(), name);
  // Wait for the first snapshot so our own position is known before the scene starts.
  if (!room.snapshots) await new Promise<void>((res) => room.onSnapshot(res));
  return room;
}
