import { Client, type Room } from 'colyseus.js';
import { DEFAULT_PORT, ROOM_NAME } from '@cn-trials/shared';

export interface PlayerView {
  name: string; spawn: number; x: number; z: number; vx: number; vz: number; yaw: number;
  ack: number; status: string; finishTime: number;
}
export interface TrialView {
  stage: string; mode: string; time: number;
  players: { forEach(cb: (p: PlayerView, id: string) => void): void; get(id: string): PlayerView | undefined; size: number };
}
export type TrialRoom = Room<TrialView>;

export function serverUrl(): string {
  const fromQuery = new URLSearchParams(location.search).get('server');
  if (fromQuery && /^wss?:\/\//.test(fromQuery)) return fromQuery;
  const fromEnv = import.meta.env.VITE_SERVER_URL as string | undefined;
  if (fromEnv) return fromEnv;
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${location.hostname}:${DEFAULT_PORT}`;
}

export async function joinTrial(name: string): Promise<TrialRoom> {
  const client = new Client(serverUrl());
  return client.joinOrCreate<TrialView>(ROOM_NAME, { name });
}
