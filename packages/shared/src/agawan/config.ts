// Stage 02 · AGAWAN BASE: every tuning number in one place (handoff pack 02_STAGE_02_GAMEPLAY_MECHANICS_AND_RULES §1,
// "keep these values in a single Stage 02 configuration object"). Server, bots and client import this file; nothing
// else hardcodes these values. They are playtest defaults: change them here only.
//
// Decision 047 (owner's playtest, 26 Nov 2026) replaced hold-to-tag and the 1.5 s base raid:
//  - health: every player has 3 hearts; each press of E on an opponent in reach takes one. At 0 they are captured.
//    A captured player comes back with 1 heart and only heals by going back to a base their team owns.
//  - bases: stand in an enemy base's inner ring to take it over; more teammates in the ring take it faster, and
//    defenders standing in it stop the capture. The original owner can always take it back.
//  - score: a base capture is worth far more than a player capture; bases held at the final whistle score too.

export const AGAWAN = {
  /** Registry id of the stage (same string as AGAWAN_STAGE_ID in stages.ts). */
  id: 'STAGE_02_AGAWAN_BASE',

  // ---- timing (seconds)
  /** Match length (pack: 4:00). */
  matchS: 240,
  /** Extra time when two or more teams share the top score: the first base capture by a tied team wins. */
  suddenDeathS: 30,

  // ---- health and hits (decision 047)
  health: {
    /** Hearts per player: three presses of E capture a healthy opponent. */
    max: 3,
    /** Hearts after a release or a rescue (they do NOT come back to full: go home to heal). */
    afterRelease: 1,
    /** Centre-to-centre reach of a hit (m). Forgiving: a little more than an arm and a step. */
    reachM: 2.0,
    /** Half-angle of the facing cone (degrees) around the attacker's camera direction. */
    facingDeg: 70,
    /** Shortest time between two hits by the same attacker (a press faster than this is ignored). */
    hitCooldownS: 0.35,
    /** Holding E keeps hitting at this interval (so a held key works too, just slower than tapping). */
    holdRepeatS: 0.5,
    /** A hit pushes the target this far away from the attacker (m), so you can see it land. */
    knockbackM: 0.6,
    /** Heal one heart every this many seconds while standing in a base your team owns. */
    healEveryS: 1.2,
    /** How close to a base marker counts as "in the base" for healing (m): the whole base square. */
    healRadiusM: 6,
  },

  // ---- prison (decision 049: no release timer; a captured player waits for a teammate's rescue)
  prison: {
    /** Slot grid inside each pen (pack: 5 x 4 = 20, one team may hold players from both other teams). */
    cols: 5,
    rows: 4,
    /** Slot spacing (m): a contestant capsule is 0.6 m wide; prisoners do not collide. */
    spacingX: 1.35,
    spacingZ: 1.1,
  },

  // ---- rescue (a teammate held in an opponent's pen): hold E next to the fence
  rescue: { distM: 1.6, holdS: 1.0 },

  // ---- base takeover (decision 047)
  base: {
    /** Inner ring around the marker where a capture happens (m). */
    zoneM: 3.5,
    /** Seconds for ONE attacker alone to take a base. With rivals in the ring the team with more players moves the
     *  capture at the speed of its lead (3 vs 1 counts as 2); equal numbers pause it. */
    soloS: 12,
    /** Capture speed by attackers in the ring: 1 -> x1, 2 -> x1.7, 3 -> x2.3, 4+ -> x2.8 (8 / 6 / 5 s). */
    crowd: [1, 1.7, 2.3, 2.8],
    /** The base's original team takes its own base back this much faster. */
    homeBonus: 1.5,
    /** With nobody in the ring, a half-finished capture fades at this fraction per second (20 s from full). */
    decayPerS: 1 / 20,
  },

  /** After a rescue: you cannot be hit and cannot hit or rescue. */
  protectS: 2,

  // ---- team score (server only)
  points: {
    /** Capturing an opponent (their last heart). */
    capture: 1,
    /** Freeing a teammate from a pen. */
    rescue: 1,
    /** Taking over a base (any base, including taking your own back). */
    baseCapture: 10,
    /** Each base a team owns when time runs out. */
    baseHeld: 5,
  },

  /** Team championship points by placement (3 / 2 / 1; ties share the place and skip the next). */
  placementPoints: [3, 2, 1],
  /** Individual board points by team placement, on the same 0-2 scale as the other stages (secondary board).
   *  With 2 teams (decision 049) the last team scores 0: 2 / 0. See playerPoints() in agawan.ts. */
  playerPoints: [2, 1, 0],

  // ---- bots
  bots: {
    /** Bots notice an opponent with clear line of sight up to this distance (m). */
    sightM: 20,
    /** Chase an opponent closer than this (m); farther ones are ignored unless they threaten our base. */
    chaseM: 9,
    /** Defenders chase rivals within this distance of their own base marker (m). */
    guardM: 9,
    /** Share of bots per job (the rest are rovers). */
    raiderShare: 0.45,
    defenderShare: 0.25,
    /** Seconds between path recalculations. */
    repathS: 1.0,
    /** Bots press E at most this often (a person tapping), slower than the engine's cooldown. */
    pressS: 0.45,
  },
} as const;
