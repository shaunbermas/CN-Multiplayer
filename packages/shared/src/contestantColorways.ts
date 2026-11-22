// CN TRIAL shared contestant (owner pack, 22 Nov 2026): ONE character model for every player, 30 colour
// and material presets. A colourway changes colours only (coat base, secondary, trim, belt accent,
// identifier accent); geometry, rig, animations, UVs and textures are shared by all 30.
// The data lives in contestant-colorways.json (also read by the Blender build scripts).
import data from './contestant-colorways.json';

export interface Colorway {
  /** Stable id, CW01 … CW30. */
  id: string;
  displayName: string;
  /** sRGB hex without '#'. */
  coatBase: string;
  coatSecondary: string;
  trim: string;
  beltAccent: string;
  identifierAccent: string;
}

export const CONTESTANT_COLORWAYS: readonly Colorway[] = data.colorways;
export const COLORWAY_COUNT = CONTESTANT_COLORWAYS.length;

export function colorwayById(id: string | undefined): Colorway | undefined {
  return CONTESTANT_COLORWAYS.find((c) => c.id === id);
}

/** Index 0..29 of a colourway id (0 for unknown ids). */
export function colorwayIndex(id: string | undefined): number {
  return Math.max(0, CONTESTANT_COLORWAYS.findIndex((c) => c.id === id));
}

/**
 * Deals a colourway nobody else in the room has. `preferred` (the colourway this player had before, e.g.
 * on reconnect) is kept when it is still free; otherwise a random free one is dealt. `taken` holds the ids
 * in use; `rand` returns [0, 1). Returns undefined only when all 30 are taken (the room is full at 30).
 */
export function dealColorway(taken: Iterable<string>, rand: () => number = Math.random, preferred?: string): string | undefined {
  const used = new Set(taken);
  if (preferred && colorwayById(preferred) && !used.has(preferred)) return preferred;
  const free = CONTESTANT_COLORWAYS.filter((c) => !used.has(c.id));
  if (!free.length) return undefined;
  return free[Math.floor(rand() * free.length) % free.length].id;
}

/** A player key is an opaque random token the browser keeps, used only to give a returning player the same colourway. */
export function sanitizePlayerKey(raw: unknown): string | undefined {
  return typeof raw === 'string' && /^[A-Za-z0-9_-]{8,40}$/.test(raw) ? raw : undefined;
}

/** Lobby emotes: visual only, never move the player (the server owns positions). */
export const EMOTES = ['jump', 'dive'] as const;
export type Emote = (typeof EMOTES)[number];
