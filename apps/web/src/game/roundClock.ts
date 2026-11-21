// Client view of the round clock. The signal schedule is deterministic from the round seed
// (packages/shared/src/round.ts), so the client rebuilds it to animate The Shepherd smoothly between
// 20 Hz snapshots. The server stays the authority: the HUD shows the server's signal.
import { buildSchedule, segmentAt, type Signal, type SignalSegment } from '@cn-trials/shared';
import type { TrialRoom } from '../net.ts';

let cachedSeed = -1;
let cached: SignalSegment[] = [];

function scheduleFor(seed: number): SignalSegment[] {
  if (seed !== cachedSeed) {
    cached = buildSchedule(seed, 600); // longer than any round; the prefix matches the server's
    cachedSeed = seed;
  }
  return cached;
}

export interface SignalView {
  signal: Signal;
  /** 0..1 progress through the current signal segment. */
  progress: number;
  /** Seconds into the current segment. */
  into: number;
  /** Seconds since GO (smoothed). */
  elapsed: number;
}

export function signalView(room: TrialRoom): SignalView {
  const r = room.round;
  if (r.phase !== 'active') return { signal: 'none', progress: 0, into: 0, elapsed: 0 };
  const elapsed = r.elapsed + (Date.now() - room.roundAt) / 1000;
  const seg = segmentAt(scheduleFor(r.seed), elapsed);
  if (!seg) return { signal: r.signal, progress: 0, into: 0, elapsed };
  const into = elapsed - seg.start;
  return { signal: seg.signal, progress: Math.min(1, into / (seg.end - seg.start)), into, elapsed };
}
