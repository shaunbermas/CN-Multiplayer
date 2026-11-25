// Client view of the round clock. The signal schedule is deterministic from the round seed
// (packages/shared/src/round.ts), so the client rebuilds it to animate The Watcher smoothly between
// 20 Hz snapshots. The server stays the authority: the HUD shows the server's signal, and every spotting
// decision comes from the server.
import { buildSchedule, segmentAt, type Signal, type SignalSegment } from '@cn-trials/shared';
import type { TrialRoom } from '../net.ts';

let cachedSeed = -1;
let cached: SignalSegment[] = [];

export function scheduleFor(seed: number): SignalSegment[] {
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
  /** Current segment start (seconds since GO) and length. */
  segStart: number;
  segLength: number;
  /** Index of the current or last RED segment since GO. */
  redIndex: number;
}

export function signalView(room: TrialRoom): SignalView {
  const r = room.round;
  const none = { signal: 'none' as Signal, progress: 0, into: 0, elapsed: 0, segStart: 0, segLength: 1, redIndex: 0 };
  // Test-only presentation hook for review screenshots (tests/e2e/views.mjs): holds the client's VIEW of the
  // signal on one state. It never reaches the server, which alone decides signals and spotting.
  const hold = (globalThis as { __cnSignalHold?: { signal: Signal; since: number } }).__cnSignalHold;
  if (hold && r.phase === 'active') {
    const into = (Date.now() - hold.since) / 1000;
    return { signal: hold.signal, progress: Math.min(1, into / 6), into, elapsed: into, segStart: hold.since / 1000, segLength: 6, redIndex: 0 };
  }
  if (r.phase !== 'active' || r.hunt) return none; // The Hunt has no lights
  const elapsed = r.elapsed + (r.paused ? 0 : (Date.now() - room.roundAt) / 1000);
  const sched = scheduleFor(r.seed);
  const seg = segmentAt(sched, elapsed);
  if (!seg) return { ...none, signal: r.signal, elapsed };
  const into = elapsed - seg.start;
  const redIndex = Math.max(0, sched.filter((s) => s.signal === 'red' && s.start <= seg.start).length - 1);
  return { signal: seg.signal, progress: Math.min(1, into / (seg.end - seg.start)), into, elapsed, segStart: seg.start, segLength: seg.end - seg.start, redIndex };
}
