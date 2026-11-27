// Decision 054 (owner, 27 Nov 2026): "Instead of dying in stage 1, let's freeze the player for 2 seconds ... only
// start the 2 second countdown after the doll says Go again". The player's own browser catches itself moving in a
// red light (player-side, decision 054); the room confirms it and sends the thaw time in every snapshot.
// This module holds the browser's side: the catch it has just reported (frozen at once, without waiting for the
// network) and the view the HUD and the ice effect read.
import { ROUND } from '@cn-trials/shared';
import type { TrialRoom } from '../net.ts';
import { signalView } from './roundClock.ts';

/** How long a reported catch freezes the player locally before the room's answer must have arrived (s). */
const PENDING_S = 1.2;

export const localCatch = { at: 0 };

/** The player just caught themselves (performance.now() ms). */
export function markCaught(): void { localCatch.at = performance.now(); }

function pending(): boolean { return localCatch.at > 0 && performance.now() - localCatch.at < PENDING_S * 1000; }

/** Is this player frozen in ice right now? The local player also counts a catch the room has not confirmed yet. */
export function isFrozen(room: TrialRoom, id: string = room.id): boolean {
  const p = room.players.get(id);
  if (!p) return false;
  if (p.frozen > 0) { if (id === room.id) localCatch.at = 0; return true; }
  return id === room.id && room.round.phase === 'active' && pending();
}

export interface FreezeView {
  frozen: boolean;
  /** The countdown has started (the light is green again). */
  thawing: boolean;
  /** Seconds until the ice breaks once thawing, else freezeS. */
  left: number;
  /** 0..1 through the thaw countdown (0 while waiting for GO). */
  progress: number;
}

export function freezeView(room: TrialRoom, id: string = room.id): FreezeView {
  const frozen = isFrozen(room, id);
  const until = room.players.get(id)?.frozen ?? 0;
  if (!frozen || until <= 0) return { frozen, thawing: false, left: ROUND.freezeS, progress: 0 };
  const elapsed = signalView(room).elapsed;
  const left = Math.max(0, until - elapsed);
  const thawing = left <= ROUND.freezeS + 1e-3 && signalView(room).signal === 'green';
  return { frozen, thawing, left: thawing ? left : ROUND.freezeS, progress: thawing ? 1 - left / ROUND.freezeS : 0 };
}
