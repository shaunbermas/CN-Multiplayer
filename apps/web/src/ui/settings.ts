// Stage 1.5 (Prompt 07): player settings, remembered in this browser only (localStorage; every access is
// guarded, so a private window or blocked storage simply uses the defaults). Second pass (decision 034 B):
// sound volume and mute.
import { useSyncExternalStore } from 'react';
import { resolveStageId } from '@cn-trials/shared';

export type GraphicsSetting = 'auto' | 'high' | 'medium' | 'low';

export interface Settings {
  /** Auto = High with the adaptive fallback (decision 026); a tier pins it. */
  graphics: GraphicsSetting;
  /** Mouse-look multiplier. */
  sensitivity: number;
  invertY: boolean;
  /** HUD text scale. */
  hudScale: number;
  /** Red screen-edge pulse while the light is red (in addition to the label and icon). */
  edgeFlash: boolean;
  /** All game sound off (also M in a game, or the speaker button in the HUD). */
  muted: boolean;
  /** Master volume 0..1. */
  volume: number;
  /** Stage the match starts at, picked on the main menu (decision 042); the host's choice is the one used. */
  startStage: string;
}

const KEY = 'cn-trial-settings-v1';
export const DEFAULT_SETTINGS: Settings = { graphics: 'auto', sensitivity: 1, invertY: false, hudScale: 1, edgeFlash: true, muted: false, volume: 0.7, startStage: 'STAGE_01_RED_LIGHT' };

function load(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const v = JSON.parse(raw) as Partial<Settings>;
    return {
      graphics: (['auto', 'high', 'medium', 'low'] as const).includes(v.graphics as GraphicsSetting) ? (v.graphics as GraphicsSetting) : 'auto',
      sensitivity: typeof v.sensitivity === 'number' ? Math.min(2.5, Math.max(0.3, v.sensitivity)) : 1,
      invertY: v.invertY === true,
      hudScale: [1, 1.25, 1.5].includes(v.hudScale as number) ? (v.hudScale as number) : 1,
      edgeFlash: v.edgeFlash !== false,
      muted: v.muted === true,
      volume: typeof v.volume === 'number' && Number.isFinite(v.volume) ? Math.min(1, Math.max(0, v.volume)) : DEFAULT_SETTINGS.volume,
      // A pick saved before decision 045 (STAGE_02_THE_HUNT) reads as The Hunt's current id.
      startStage: typeof v.startStage === 'string' && /^STAGE_0[1-9]_[A-Z_]+$/.test(v.startStage) ? resolveStageId(v.startStage) : DEFAULT_SETTINGS.startStage,
    };
  } catch { return { ...DEFAULT_SETTINGS }; }
}

export const settings: Settings = load();
const listeners = new Set<() => void>();
let version = 0;

export function updateSettings(patch: Partial<Settings>) {
  Object.assign(settings, patch);
  version++;
  try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch { /* storage unavailable: keep for this session */ }
  for (const l of listeners) l();
}

export function useSettings(): Settings {
  useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => version, () => version);
  return settings;
}
