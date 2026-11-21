// Client -> server messages. The client never sends results ("I finished"); only inputs (GDD §7.3).

export interface InputMessage {
  /** Increasing sequence number per client; the server acknowledges the last one it applied. */
  seq: number;
  mx: number;
  mz: number;
  /** Camera yaw, used only for rendering other players' facing. */
  yaw: number;
}

export const MSG = {
  input: 'input',
  respawn: 'respawn',
} as const;

export interface JoinOptions { name?: string }

export function sanitizeName(raw: unknown, fallback: string): string {
  const s = typeof raw === 'string' ? raw : '';
  // Letters, numbers, spaces and a few separators; GDD §7.4 basic protection.
  const clean = s.normalize('NFKC').replace(/[^\p{L}\p{N} ._-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 16);
  return clean || fallback;
}
