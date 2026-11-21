// Graphics quality: the tier (STAGE_01_LIGHTING.json qualityTiers) and the render resolution.
// Default is High with every lighting effect on (decision 026). Unless the URL pins a tier
// (?quality=low|medium|high), an adaptive monitor keeps the frame rate smooth: when the average frame rate
// stays under MIN_FPS it first lowers the resolution, then steps the tier down (high -> medium -> low).
// It never steps back up during a session, so the picture does not flicker between tiers.
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef, useSyncExternalStore } from 'react';
import { settings } from '../ui/settings.ts';

export type Quality = 'low' | 'medium' | 'high';
export const QUALITY_ORDER: Quality[] = ['low', 'medium', 'high'];

/** Average frame rate below which the monitor lowers quality. */
export const MIN_FPS = 45;
/** Seconds ignored after a start or a change (shader compiles, texture uploads). */
const WARMUP_S = 2.5;
/** Seconds of frames averaged per decision. */
const WINDOW_S = 2;
/** Highest render resolution multiplier; 1.5 looks sharp on high-DPI screens at a much lower cost than 2. */
const MAX_DPR = 1.5;

export interface QualityChange { at: number; from: string; to: string; fps: number }

function pinnedFromUrl(): Quality | null {
  const q = typeof location === 'undefined' ? null : new URLSearchParams(location.search).get('quality');
  return q === 'low' || q === 'medium' || q === 'high' ? q : null;
}

// The URL wins (tests, support links); otherwise the player's saved Settings choice; otherwise Auto.
const pinned = pinnedFromUrl() ?? (settings.graphics === 'auto' ? null : settings.graphics);
const deviceDpr = typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1;

export const quality = {
  tier: (pinned ?? 'high') as Quality,
  /** True when the URL chose the tier: the adaptive monitor then leaves it alone. */
  pinned: pinned !== null,
  dpr: Math.min(deviceDpr, MAX_DPR),
  /** Last measured average frame rate (0 until the first window completes). */
  fps: 0,
  changes: [] as QualityChange[],
};

const listeners = new Set<() => void>();
function emit() { for (const l of listeners) l(); }
function subscribe(l: () => void) { listeners.add(l); return () => listeners.delete(l); }

export function setQuality(tier: Quality) {
  if (tier === quality.tier) return;
  quality.tier = tier;
  emit();
}

/** Settings screen: Auto (High with the adaptive fallback) or a pinned tier. */
export function applyGraphicsSetting(g: 'auto' | Quality) {
  if (g === 'auto') { quality.pinned = false; setQuality('high'); return; }
  quality.pinned = true;
  setQuality(g);
}

/** React hook: the current tier, re-rendering when it changes. */
export function useQuality(): Quality {
  return useSyncExternalStore(subscribe, () => quality.tier, () => quality.tier);
}

/** The next lower step for the monitor, or null at the bottom. */
export function nextStepDown(tier: Quality, dpr: number): { tier: Quality; dpr: number } | null {
  if (dpr > 1) return { tier, dpr: 1 };
  const i = QUALITY_ORDER.indexOf(tier);
  return i > 0 ? { tier: QUALITY_ORDER[i - 1], dpr } : null;
}

/** Inside the Canvas: applies the resolution and runs the adaptive monitor. */
export function AdaptiveQuality() {
  const setDpr = useThree((s) => s.setDpr);
  const tier = useQuality();
  const acc = useRef({ since: 0, frames: 0, time: 0 });
  useEffect(() => { setDpr(quality.dpr); }, [setDpr, tier]);
  useFrame((_, dt) => {
    if (quality.pinned) return;
    const a = acc.current;
    // A gap over 2 s is a hidden tab or a paused page, not a frame-rate measurement; slow frames still count.
    if (dt > 2 || (typeof document !== 'undefined' && document.hidden)) return;
    a.since += dt;
    if (a.since < WARMUP_S) return;
    a.frames += 1;
    a.time += dt;
    if (a.time < WINDOW_S) return;
    const fps = a.frames / a.time;
    quality.fps = Math.round(fps);
    a.frames = 0; a.time = 0;
    if (fps >= MIN_FPS) return;
    const next = nextStepDown(quality.tier, quality.dpr);
    if (!next) return;
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
