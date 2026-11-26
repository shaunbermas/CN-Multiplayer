// Stage 02 · AGAWAN BASE: every tuning number in one place (handoff pack 02_STAGE_02_GAMEPLAY_MECHANICS_AND_RULES §1,
// "keep these values in a single Stage 02 configuration object"). Server, bots and client import this file; nothing
// else hardcodes these values. They are playtest defaults: change them here only.

export const AGAWAN = {
  /** Registry id of the stage (same string as AGAWAN_STAGE_ID in stages.ts). */
  id: 'STAGE_02_AGAWAN_BASE',

  // ---- timing (seconds)
  /** Match length (pack: 4:00). */
  matchS: 240,
  /** Extra time when two or more teams share the top score: the first base raid wins. */
  suddenDeathS: 30,

  // ---- tag (any opponent)
  tag: {
    /** Centre-to-centre reach (m). */
    distM: 1.5,
    /** Hold E this long on the same target (pack: 0.4 to 0.5 s). */
    holdS: 0.45,
    /** After a successful tag the attacker waits this long before the next (pack: 1.5 to 2 s). */
    cooldownS: 1.75,
    /** Half-angle of the facing cone (degrees) around the attacker's camera direction. */
    facingDeg: 60,
  },

  // ---- prison
  prison: {
    /** Automatic release back to your own base after this long (pack: 15 s). */
    maxS: 15,
    /** Slot grid inside each pen (pack: 5 x 4 = 20, one team may hold players from both other teams). */
    cols: 5,
    rows: 4,
    /** Slot spacing (m): a contestant capsule is 0.6 m wide; prisoners do not collide. */
    spacingX: 1.35,
    spacingZ: 1.1,
  },

  // ---- rescue (a teammate held in an opponent's pen)
  rescue: { distM: 1.5, holdS: 1.0 },

  // ---- base raid (an opponent's base marker)
  raid: {
    /** Capture zone radius around the marker (m). */
    radiusM: 3,
    holdS: 1.5,
    /** Per attacking team and target base pair: Team A's cooldown on B never blocks Team C on B. */
    cooldownS: 20,
  },

  /** After a rescue or an automatic release: you cannot be tagged and cannot tag, rescue or raid. */
  protectS: 2,

  // ---- team score (server only, idempotent records)
  points: {
    raid: 5,
    /** First tag of a unique opponent, once per attacking team and target player per match. */
    firstTag: 1,
    /** First rescue of a unique teammate, once per team and rescued player per match. */
    firstRescue: 1,
  },

  /** Team championship points by placement (3 / 2 / 1; ties share the place and skip the next). Used by the team
   *  championship (decision 045, next step); the stage reports each team's placement for it. */
  placementPoints: [3, 2, 1],
  /** Individual board points by team placement, on the same 0-2 scale as the other stages (secondary board). */
  playerPoints: [2, 1, 0],

  // ---- bots
  bots: {
    /** Bots notice an opponent with clear line of sight up to this distance (m). */
    sightM: 20,
    /** Chase an opponent closer than this (m); farther ones are ignored unless they threaten our base. */
    chaseM: 9,
    /** Defenders chase rivals within this distance of their own base marker (m). */
    guardM: 8,
    /** Share of bots per job (the rest are rovers). */
    raiderShare: 0.45,
    defenderShare: 0.22,
    /** Seconds between path recalculations. */
    repathS: 1.0,
  },
} as const;
