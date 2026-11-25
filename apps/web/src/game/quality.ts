// Graphics quality: re-exports the store and adds the adaptive monitor that runs inside the Canvas.
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import { MIN_FPS, RECOVER_FPS, WARMUP_S, WINDOW_S, nextStepDown, nextStepUp, quality, setQuality, useQuality } from './qualityStore.ts';

export * from './qualityStore.ts';

/** Inside the Canvas: applies the resolution and runs the adaptive monitor. */
export function AdaptiveQuality() {
  const setDpr = useThree((s) => s.setDpr);
  const tier = useQuality();
  const acc = useRef({ since: 0, frames: 0, time: 0, good: 0 });
  useEffect(() => { setDpr(quality.dpr); }, [setDpr, tier]);
  useFrame((_, dt) => {
    if (quality.urlPinned) return;
    const a = acc.current;
    // Hidden tabs are skipped directly. Slow frames DO count (capped at 5 s each), even very slow ones: a machine
    // at 0.4 fps is exactly the one that needs to step down. Only a gap over 30 s (a paused or suspended page,
    // e.g. a laptop waking up) is ignored. Found by CI: the old 2 s cutoff hid every frame of a 0.4 fps page.
    if ((typeof document !== 'undefined' && document.hidden) || dt > 30) return;
    const d = Math.min(dt, 5);
    a.since += d;
    if (a.since < WARMUP_S) return;
    a.frames += 1;
    a.time += d;
    if (a.time < WINDOW_S) return;
    const fps = a.frames / a.time;
    quality.fps = Math.round(fps);
    a.frames = 0; a.time = 0;
    if (fps >= MIN_FPS) {
      // Smooth for a while (3 windows in a row): give one resolution step back. Never raises the tier.
      a.good = fps >= RECOVER_FPS ? a.good + 1 : 0;
      const up = a.good >= 3 ? nextStepUp(quality.dpr) : null;
      if (up === null) return;
      a.good = 0;
      quality.changes.push({ at: Date.now(), fps: Math.round(fps), from: `${quality.tier}@${quality.dpr}x`, to: `${quality.tier}@${up}x` });
      quality.dpr = up; setDpr(up); a.since = 0;
      return;
    }
    a.good = 0;
    const next = nextStepDown(quality.tier, quality.dpr, fps);
    // A tier picked in Settings stays: only the resolution adapts (a player who chose High keeps every effect).
    if (!next || (quality.pinned && next.tier !== quality.tier)) return;
    quality.changes.push({
      at: Date.now(), fps: Math.round(fps),
      from: `${quality.tier}@${quality.dpr}x`, to: `${next.tier}@${next.dpr}x`,
    });
    a.since = 0;
    if (next.dpr !== quality.dpr) { quality.dpr = next.dpr; setDpr(next.dpr); }
    setQuality(next.tier);
  });
  return null;
}
