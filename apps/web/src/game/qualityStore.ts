// Graphics quality store (no React Three Fiber import, so the menu chunk stays small): the tier (STAGE_01_LIGHTING.json qualityTiers) and the render resolution.
// Default is High with every lighting effect on (decision 026). Unless the URL pins a tier
// (?quality=low|medium|high), an adaptive monitor keeps the frame rate smooth: when the average frame rate
// stays under MIN_FPS it first lowers the resolution, then steps the tier down (high -> medium -> low).
// It never steps back up during a session, so the picture does not flicker between tiers.
import { useSyncExternalStore } from 'react';
import { settings } from '../ui/settings.ts';

export type Quality = 'low' | 'medium' | 'high';
export const QUALITY_ORDER: Quality[] = ['low', 'medium', 'high'];

/** Average frame rate below which the monitor lowers quality. */
export const MIN_FPS = 50;
/** Seconds ignored after a start or a change (shader compiles, texture uploads). */
export const WARMUP_S = 2.5;
/** Seconds of frames averaged per decision. */
export const WINDOW_S = 2;
/**
 * Highest render resolution multiplier. Optimisation pass (25 Nov 2026): 1.25 (was 1.5). With 4x MSAA now on the
 * High path it looks at least as clean as 1.5 without it did, and a Retina laptop shades about 30 % fewer pixels.
 */
const MAX_DPR = 1.25;

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
  /** True when the URL or Settings chose the tier: the adaptive monitor then never changes the tier. */
  pinned: pinned !== null,
  /** True when the URL chose it (tests, support links): the monitor then leaves the resolution alone too. */
  urlPinned: pinnedFromUrl() !== null,
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

/**
 * Render-resolution steps the monitor uses before it touches the tier (optimisation pass, 25 Nov 2026): a slow
 * frame first costs a little sharpness, never the High effects. The top step is the device's own ratio, capped.
 */
export function dprSteps(device = deviceDpr): number[] {
  const top = Math.min(device, MAX_DPR);
  const steps = [top, 1.25, 1, 0.85].filter((d) => d <= top + 1e-6);
  return [...new Set(steps.map((d) => +d.toFixed(2)))].sort((a, b) => b - a);
}
/** Average frame rate above which the monitor gives sharpness back (one step at a time, resolution only). */
export const RECOVER_FPS = 57;
/** Frame rate below which the monitor may step the tier down once the resolution is at its lowest step. */
export const TIER_FPS = 40;

/** The next lower step for the monitor, or null at the bottom: resolution steps first, then the tier. */
export function nextStepDown(tier: Quality, dpr: number, fps = 0): { tier: Quality; dpr: number } | null {
  const steps = dprSteps();
  const lower = steps.find((d) => d < dpr - 1e-6);
  if (lower !== undefined) return { tier, dpr: lower };
  if (fps >= TIER_FPS) return null; // a little under target: stay on this tier at the lowest resolution
  const i = QUALITY_ORDER.indexOf(tier);
  return i > 0 ? { tier: QUALITY_ORDER[i - 1], dpr } : null;
}

/** The next sharper resolution step (never a higher tier), or null at the top. */
export function nextStepUp(dpr: number): number | null {
  const higher = dprSteps().filter((d) => d > dpr + 1e-6);
  return higher.length ? higher[higher.length - 1] : null;
}

