// Shared tuning for CN Trials. Stage 01 values come from docs/STAGE_01_SPEC.md (v0.1).

export const MAX_PLAYERS = 30; // GDD §1.2
export const SIM_HZ = 30; // GDD §7.3 proposed server simulation rate
export const SIM_DT = 1 / SIM_HZ;
export const PATCH_MS = 50; // Colyseus default patch interval (20 Hz)

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
export const ROOM_NAME = 'trial';
export const DEFAULT_PORT = 2567;
