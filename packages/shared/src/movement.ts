// Contestant movement shared by the server (authority) and the client (prediction).
// Kinematic, flat ground (ADR 0001). Yaw 0 faces -Z, the course direction.
import { ACCEL, DECEL, MOVEMENT } from './constants.ts';
import type { Rect } from './stage.ts';

export interface MoveState { x: number; z: number; vx: number; vz: number }
/** Desired move direction in world X/Z, length 0..1. */
export interface MoveInput { mx: number; mz: number }

export function forwardOf(yaw: number): [number, number] {
  return [-Math.sin(yaw), -Math.cos(yaw)];
}
export function rightOf(yaw: number): [number, number] {
  return [Math.cos(yaw), -Math.sin(yaw)];
}

/** Camera-relative keys to a world direction. forward/right are -1..1. */
export function inputFromKeys(forward: number, right: number, yaw: number): MoveInput {
  const [fx, fz] = forwardOf(yaw);
  const [rx, rz] = rightOf(yaw);
  let mx = fx * forward + rx * right;
  let mz = fz * forward + rz * right;
  const len = Math.hypot(mx, mz);
  if (len > 1) { mx /= len; mz /= len; }
  return { mx, mz };
}

/** Clamp untrusted input to a valid direction (server side). */
export function sanitizeInput(mx: unknown, mz: unknown): MoveInput {
  const x = typeof mx === 'number' && Number.isFinite(mx) ? mx : 0;
  const z = typeof mz === 'number' && Number.isFinite(mz) ? mz : 0;
  const len = Math.hypot(x, z);
  return len > 1 ? { mx: x / len, mz: z / len } : { mx: x, mz: z };
}

/** Push a circle out of an axis-aligned rectangle (walls). Returns the corrected position. */
function resolveRect(x: number, z: number, r: number, w: Rect): [number, number, boolean] {
  const cx = Math.max(w.minX, Math.min(x, w.maxX));
  const cz = Math.max(w.minZ, Math.min(z, w.maxZ));
  const dx = x - cx;
  const dz = z - cz;
  const d2 = dx * dx + dz * dz;
  if (d2 >= r * r) return [x, z, false];
  if (d2 > 1e-12) {
    const d = Math.sqrt(d2);
    return [cx + (dx / d) * r, cz + (dz / d) * r, true];
  }
  // Centre inside the rectangle: leave along the shortest axis.
  const pushes = [w.maxX + r - x, x - (w.minX - r), w.maxZ + r - z, z - (w.minZ - r)];
  const i = pushes.indexOf(Math.min(...pushes));
  if (i === 0) return [w.maxX + r, z, true];
  if (i === 1) return [w.minX - r, z, true];
  if (i === 2) return [x, w.maxZ + r, true];
  return [x, w.minZ - r, true];
}

/** One fixed simulation step. Pure function: same inputs, same result on server and client. */
export function step(s: MoveState, input: MoveInput, dt: number, walls: Rect[], speedScale = 1): MoveState {
  // speedScale: Stage 02 sprint and crouch (1 everywhere else, so Stage 01 movement is unchanged).
  const tx = input.mx * MOVEMENT.walkSpeed * speedScale;
  const tz = input.mz * MOVEMENT.walkSpeed * speedScale;
  const moving = input.mx !== 0 || input.mz !== 0;
  const rate = (moving ? ACCEL : DECEL) * Math.max(1, speedScale) * dt;
  let dvx = tx - s.vx;
  let dvz = tz - s.vz;
  const dl = Math.hypot(dvx, dvz);
  if (dl > rate) { dvx = (dvx / dl) * rate; dvz = (dvz / dl) * rate; }
  let vx = s.vx + dvx;
  let vz = s.vz + dvz;
  let x = s.x + vx * dt;
  let z = s.z + vz * dt;
  for (const w of walls) {
    const [nx, nz, hit] = resolveRect(x, z, MOVEMENT.capsuleRadius, w);
    if (hit) {
      // Remove the velocity component pointing into the wall.
      const px = nx - x, pz = nz - z;
      const pl = Math.hypot(px, pz);
      if (pl > 1e-9) {
        const ux = px / pl, uz = pz / pl;
        const into = vx * ux + vz * uz;
        if (into < 0) { vx -= into * ux; vz -= into * uz; }
      }
      x = nx; z = nz;
    }
  }
  return { x, z, vx, vz };
}

/** Pushes a capsule centre out of every wall (used after a player-to-player separation push). */
export function pushOutOfWalls(x: number, z: number, walls: Rect[]): [number, number] {
  for (const w of walls) {
    const [nx, nz] = resolveRect(x, z, MOVEMENT.capsuleRadius, w);
    x = nx; z = nz;
  }
  return [x, z];
}
