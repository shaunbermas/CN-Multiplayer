// The one adapter between the server's public round state and The Watcher's animation clips
// (blender/exports/THE_WATCHER_ASSET_MANIFEST.json, Prompt 06). Animation is cosmetic: the server owns the
// phase, the signal schedule and every spotting decision; this only chooses what the model shows.
//
// phase / signal                       clip                          lens
// lobby, briefing, countdown           Watcher_Idle (loop)           neutral
// GREEN, first 1.5 s                   Watcher_TurnAway (once)       neutral -> green
// GREEN                                Watcher_GreenSignal (loop)    green
// RED, first 0.35 s                    Watcher_TurnToField, sped up: a sudden snap (no warning; decision 037)
// RED, next 1 s                        Watcher_FocusLock (once)      neutral -> red
// RED                                  Watcher_RedSignal / Watcher_ScanSweep (alternating reds, loop)
// RED, a player was just spotted       Watcher_Detect (once, 1.67 s) red
// results                              Watcher_ReturnNeutral (once), then Watcher_Idle
import manifest from '../../../../../blender/exports/THE_WATCHER_ASSET_MANIFEST.json';

export const WATCHER_CLIPS = ['Watcher_Idle', 'Watcher_TurnAway', 'Watcher_GreenSignal', 'Watcher_TurnToField', 'Watcher_FocusLock',
  'Watcher_RedSignal', 'Watcher_ScanSweep', 'Watcher_Detect', 'Watcher_ReturnNeutral'] as const;
export type WatcherClip = (typeof WATCHER_CLIPS)[number];

/** Animation frame rate of the project's Blender clips (docs/BLENDER_PIPELINE.md; THE_WATCHER_VALIDATION.json). */
export const CLIP_FPS = 24;

/** Clip lengths in seconds, from the asset manifest's frame ranges (checked against the GLB when it loads). */
/** Seconds The Watcher takes to whip round to the field when RED starts (no warning; decision 037). */
export const RED_SNAP_S = 0.35;

export const CLIP_SECONDS = Object.fromEntries(
  manifest.animations.map((a) => [a.name, (a.frame_end - a.frame_start) / CLIP_FPS]),
) as Record<WatcherClip, number>;

/** Names the adapter needs that the manifest does not list (an asset correction would be required). */
export const MISSING_FROM_MANIFEST = WATCHER_CLIPS.filter((c) => !(c in CLIP_SECONDS));

export interface WatcherInputs {
  /** Key of the clip playing now and seconds since it started (sequencing the red snap into the lock). */
  currentKey?: string;
  sinceCurrent?: number;
  phase: string;
  /** Client view of the server signal: none | green | warning | red. */
  signal: string;
  /** Seconds into the current signal segment, and that segment's length. */
  into: number;
  segmentLength: number;
  /** Start time (seconds since GO) of the current segment: identifies one segment. */
  segmentStart: number;
  /** Index of the current RED segment since GO (0, 1, 2...), for variety. */
  redIndex: number;
  /** Seconds since this client first drew the current segment (Infinity if unknown). A slow client that
   *  first sees a segment late still plays the segment's opening clip (TurnAway, FocusLock) in full. */
  sinceSegmentSeen?: number;
  /** Seconds since the last server 'spotted' event, or Infinity. */
  sinceSpotted: number;
  /** Seconds since the results phase began, or Infinity. */
  sinceResults: number;
}

export interface WatcherChoice {
  clip: WatcherClip;
  loop: boolean;
  /** Playback speed. */
  timeScale: number;
  /** Changes whenever the clip should restart from its first frame. */
  key: string;
}

export function chooseWatcherClip(s: WatcherInputs): WatcherChoice {
  const once = (clip: WatcherClip, key: string, timeScale = 1): WatcherChoice => ({ clip, loop: false, timeScale, key: `${clip}@${key}` });
  const loop = (clip: WatcherClip, key: string): WatcherChoice => ({ clip, loop: true, timeScale: 1, key: `${clip}@${key}` });
  if (s.phase === 'results') {
    return s.sinceResults < CLIP_SECONDS.Watcher_ReturnNeutral ? once('Watcher_ReturnNeutral', 'results') : loop('Watcher_Idle', 'results');
  }
  if (s.phase !== 'active' || s.signal === 'none') return loop('Watcher_Idle', s.phase);
  const seg = s.segmentStart.toFixed(2);
  // A server spot always gets its Detect reaction, even if a slow client first draws it after the light turned
  // green again (the server only spots during red, so this never shows a reaction that did not happen).
  if (s.sinceSpotted < CLIP_SECONDS.Watcher_Detect) return once('Watcher_Detect', `spot:${(Date.now() / 1000 - s.sinceSpotted).toFixed(1)}`);
  const opening = Math.min(s.into, s.sinceSegmentSeen ?? Infinity);
  switch (s.signal) {
    case 'green':
      return opening < CLIP_SECONDS.Watcher_TurnAway ? once('Watcher_TurnAway', seg) : loop('Watcher_GreenSignal', seg);
    case 'warning':
      return once('Watcher_TurnToField', seg, CLIP_SECONDS.Watcher_TurnToField / Math.max(0.1, s.segmentLength));
    case 'red':
      // Decision 037: no warning before RED, so The Watcher snaps round in the first RED_SNAP_S (a sharp,
      // sudden turn), then locks focus. Old rooms that still send a warning keep the slower turn above.
      if (opening < RED_SNAP_S) return once('Watcher_TurnToField', `snap:${seg}`, CLIP_SECONDS.Watcher_TurnToField / RED_SNAP_S);
      // The lock always follows the snap and plays in full, even when a slow frame jumps past its window.
      if (s.currentKey === `Watcher_TurnToField@snap:${seg}`) return once('Watcher_FocusLock', seg);
      if (s.currentKey === `Watcher_FocusLock@${seg}` && (s.sinceCurrent ?? Infinity) < CLIP_SECONDS.Watcher_FocusLock) return once('Watcher_FocusLock', seg);
      if (opening < RED_SNAP_S + CLIP_SECONDS.Watcher_FocusLock) return once('Watcher_FocusLock', seg);
      return loop(s.redIndex % 2 === 0 ? 'Watcher_RedSignal' : 'Watcher_ScanSweep', seg);
    default:
      return loop('Watcher_Idle', s.phase);
  }
}
