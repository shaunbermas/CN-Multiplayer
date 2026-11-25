// Stage 02 · THE HUNT: every tuning number in one place (owner brief "Prompt 1", 25 Nov 2026, and the design
// pack docs 02_STAGE_02_THE_HUNT). Server and client both import this file; nothing else hardcodes these values.
// They are playtesting defaults: change them here only. Rationale: docs/STAGE_02_CONFIG_REFERENCE.md.

export const STAGE02 = {
  /** Registry id of the stage. */
  id: 'STAGE_02_THE_HUNT',

  // ---- roles (server assigns, seeded shuffle; humans and bots alike)
  /** Share of participants who hunt: hunterCount = clamp(round(n * share), 1, n - 1). */
  hunterShare: 0.2,

  // ---- timing (seconds)
  /** Hiders move, hunters wait behind their gates. */
  headStartS: 15,
  /** Active hunting after the gates open. Total active phase = headStartS + huntS. */
  huntS: 180,

  // ---- movement (multipliers of the shared walk speed, MOVEMENT.walkSpeed = 4 m/s)
  /** Hold Shift: a short burst, then a cooldown. Hiders and hunters both have it. */
  sprint: { speed: 1.55, burstS: 1.6, cooldownS: 8 },
  /** Hold C: slower and quieter (weaker Pulse signal, no footstep noise for hunter bots). */
  crouch: { speed: 0.55, pulseFactor: 0.8 },

  // ---- Pulse Detector (hunters)
  pulse: {
    cooldownS: 10,
    /** Signals fade to nothing at this distance (m), measured in a straight line. */
    rangeM: 18,
    /** Strength buckets of the strongest signal (0..1). Below `weak` the reading is "no signal". */
    strong: 0.55, medium: 0.3, weak: 0.08,
    /** A hider inside a hiding place shows this share of their signal (hiding is not invisibility). */
    hiddenFactor: 0.6,
    /** Direction is reported as one of this many compass sectors (8 = 45 degrees), never as a position. */
    sectors: 8,
    /** Random error added to the bearing before it is rounded to a sector (degrees, +/-). */
    jitterDeg: 18,
    /** Most walls counted along one signal path (each one multiplies the signal by its attenuation). */
    maxWalls: 4,
  },

  // ---- capture (hunters)
  capture: {
    /** Centre-to-centre distance (m). */
    distM: 1.7,
    /** Hold E this long on the same target. */
    holdS: 1.0,
    /** Half-angle of the facing cone (degrees) around the hunter's camera direction. */
    facingDeg: 55,
  },

  // ---- hiding (hiders)
  hide: {
    /** Stand this close to a hiding place's front to enter it (m). */
    enterDistM: 1.4,
    /** Longest stay; the server then pushes you out. */
    maxS: 10,
    /** Wait this long after leaving before you can hide again. */
    cooldownS: 15,
  },

  // ---- threat warning (hiders): distance to the nearest released hunter, walls ignored, no direction given
  threat: { nearM: 14, dangerM: 7 },

  // ---- visibility of opponents in snapshots (anti-wallhack): line of sight within this range (m)
  sightM: 45,

  // ---- bots
  bots: {
    /** Bots see an opponent with clear line of sight up to this distance (m). */
    sightM: 22,
    /** Hunter bots hear a moving, non-crouching hider within this distance (m), through walls. */
    hearM: 6,
    /** Cosine of the hunter bots' half view angle (0.42 = about 65 degrees each side). */
    hunterConeCos: 0.42,
    /** Seconds between path recalculations. */
    repathS: 1.2,
  },
} as const;

export type HuntRole = 'hunter' | 'hider';

/** hunterCount = clamp(round(n * share), 1, n - 1); a solo player (n = 1) hides with no hunters. */
export function hunterCount(n: number, share: number = STAGE02.hunterShare): number {
  if (n <= 1) return 0;
  return Math.max(1, Math.min(n - 1, Math.round(n * share)));
}
