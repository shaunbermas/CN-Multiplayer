// Shared tuning for CN Trials. Stage 01 values come from docs/STAGE_01_SPEC.md (v0.1).

export const MAX_PLAYERS = 30; // GDD §1.2
export const SIM_HZ = 30; // GDD §7.3 proposed server simulation rate
export const SIM_DT = 1 / SIM_HZ;


/** Contestant movement (spec §2, M1–M4). Identical for every character preset. */
export const MOVEMENT = {
  capsuleHeight: 1.2, // M1
  capsuleRadius: 0.3, // M1
  walkSpeed: 4.0, // M2, m/s
  accelTime: 0.15, // M3, seconds from 0 to full speed
  stopTime: 0.12, // M4, seconds from full speed to 0
} as const;

export const ACCEL = MOVEMENT.walkSpeed / MOVEMENT.accelTime;
export const DECEL = MOVEMENT.walkSpeed / MOVEMENT.stopTime;

/** Input rate limit: one simulation step per tick sustained, small burst for jitter. */
export const INPUT_BURST = 4;
export const INPUT_QUEUE_MAX = 60;

export const NAME_MAX = 16;
export const DEFAULT_ROOM = 'default';
export const DEV_WORKER_PORT = 8787;

/**
 * Player-to-player collisions (Stage 01 refinement, owner brief 24 Nov 2026). Server-authoritative: the room
 * detects contacts after every simulation step (packages/shared/src/collisions.ts). Two capsules touch when
 * their centres are closer than 2 × capsuleRadius (no oversized bounds). A contact knocks BOTH players down
 * only when they hit hard enough; gentle touches just push them apart.
 */
export const COLLISION = {
  /** Centre distance at which two capsules touch (m): exactly two capsule radii. */
  contactDist: 2 * MOVEMENT.capsuleRadius,
  /** Closing speed along the contact line (m/s) needed for a knock-down: a bit over a third of walking speed,
   *  so walking into someone knocks you both over but brushing past or pushing gently does not. */
  minImpactSpeed: 1.5,
  /** Seconds on the ground (no movement control). */
  fallS: 1.0,
  /** Seconds getting back up (still no control). Total time without control = fallS + recoverS. */
  recoverS: 0.6,
  /** Seconds after standing up during which the player cannot be knocked down again (no endless falls). */
  immuneS: 1.5,
} as const;

/** Room capacity counts humans and bots together (owner brief: 30 total). */
export const BOT_LIMITS = {
  /** Most bots one "add random players" press adds. */
  addStep: 5,
} as const;

/**
 * Stage 02 · AGAWAN BASE switch (decision 045). Off until the stage is built and the owner approves it: while off, the
 * menu shows Stage 02 as "Coming soon" and a match plays Stage 01 then Stage 03 (The Hunt). One constant, so turning
 * it off again is also the rollback.
 */
export const AGAWAN_ENABLED = false;
