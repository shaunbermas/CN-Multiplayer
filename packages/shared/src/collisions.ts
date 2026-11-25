// Player-to-player collisions (Stage 01 refinement, owner brief 24 Nov 2026). Pure and deterministic, run by
// the room (server authority) after every simulation step, for humans and bots alike, so every client sees the
// same result in the next snapshot.
//
// Rules (docs/STAGE_01_REFINEMENT_IMPLEMENTATION.md §Collisions):
//  - Each contestant is the existing upright capsule (radius MOVEMENT.capsuleRadius = 0.3 m). Two touch when their
//    centres are closer than COLLISION.contactDist = 0.6 m. Nothing larger is used.
//  - Overlap is always resolved by pushing both apart along the contact line (half each), then out of walls, so
//    nobody walks through anyone and nobody gets stuck inside another player.
//  - A hard hit knocks BOTH down: the closing speed along the contact line (relative velocity · normal) must be at
//    least COLLISION.minImpactSpeed. Direction and speed matter: walking into a standing player knocks you both
//    over; brushing past side by side or nudging slowly does not.
//  - Knocked-down players lose control for fallS + recoverS, keep zero velocity, then stand up with immuneS of
//    protection, so repeated contacts cannot chain into endless falls.
//  - Falling is NOT elimination and never causes one: the separation push and the knock-down move nobody through
//    the movement step, so the red-light detector (RoundEngine.afterMove) never counts them.
import { COLLISION } from './constants.ts';
import { pushOutOfWalls } from './movement.ts';
import type { Rect } from './stage.ts';

export interface CollisionBody {
  id: string;
  x: number; z: number;
  vx: number; vz: number;
  downUntil: number;
  immuneUntil: number;
}

export interface Knockdown {
  a: string;
  b: string;
  /** Closing speed of the hit (m/s). */
  impact: number;
  /** Contact point (game metres). */
  x: number; z: number;
}

/**
 * Resolve contacts between the given bodies at room time `now`. Mutates positions, velocities and the
 * down/immune timers; returns the knock-downs that happened this step. O(n²) over at most 30 bodies
 * (435 pair checks, a few microseconds), with a cheap square-distance reject first.
 */
export function resolvePlayerContacts(bodies: CollisionBody[], now: number, walls: Rect[]): Knockdown[] {
  const out: Knockdown[] = [];
  const d0 = COLLISION.contactDist;
  const d02 = d0 * d0;
  for (let i = 0; i < bodies.length; i++) {
    const a = bodies[i];
    for (let j = i + 1; j < bodies.length; j++) {
      const b = bodies[j];
      const dx = b.x - a.x, dz = b.z - a.z;
      const dist2 = dx * dx + dz * dz;
      if (dist2 >= d02) continue;
      let dist = Math.sqrt(dist2);
      let nx: number, nz: number;
      if (dist < 1e-6) {
        // Exactly on top of each other (e.g. two spawns resolved to one point): separate along a stable axis.
        nx = a.id < b.id ? 1 : -1; nz = 0; dist = 0;
      } else { nx = dx / dist; nz = dz / dist; }
      // Closing speed: how fast A moves toward B along the line between them (positive = approaching).
      const closing = (a.vx - b.vx) * nx + (a.vz - b.vz) * nz;
      const canFall = (p: CollisionBody) => p.downUntil <= now && p.immuneUntil <= now;
      if (closing >= COLLISION.minImpactSpeed && canFall(a) && canFall(b)) {
        const until = now + COLLISION.fallS + COLLISION.recoverS;
        for (const p of [a, b]) { p.downUntil = until; p.immuneUntil = until + COLLISION.immuneS; p.vx = 0; p.vz = 0; }
        out.push({ a: a.id, b: b.id, impact: Math.round(closing * 100) / 100, x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 });
      } else {
        // Soft contact: each player loses only their OWN velocity into the other (never gains any), so a standing
        // player who is bumped never starts moving and cannot be spotted for someone else's push.
        const ia = a.vx * nx + a.vz * nz;
        if (ia > 0) { a.vx -= ia * nx; a.vz -= ia * nz; }
        const ib = -(b.vx * nx + b.vz * nz);
        if (ib > 0) { b.vx += ib * nx; b.vz += ib * nz; }
      }
      // Positional separation, half each, then keep both out of walls.
      const push = (d0 - dist) / 2 + 1e-4;
      [a.x, a.z] = pushOutOfWalls(a.x - nx * push, a.z - nz * push, walls);
      [b.x, b.z] = pushOutOfWalls(b.x + nx * push, b.z + nz * push, walls);
    }
  }
  return out;
}

/** Seconds of knock-down left at room time `now` (0 when standing). Sent to clients for the fall animation. */
export function downLeft(p: { downUntil: number }, now: number): number {
  return Math.max(0, Math.round((p.downUntil - now) * 100) / 100);
}
