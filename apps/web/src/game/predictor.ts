// Client-side prediction for the local player with server reconciliation (GDD §7.3).
//
// Presentation smoothing (second pass, owner feedback 25 Nov 2026: "remove the jagged or laggy feeling when
// walking left or right"). The simulation advances in fixed 30 Hz steps, but screens refresh at 60 Hz or more,
// so drawing the latest step made the contestant (and the camera's look target) move in visible stair steps.
// Sideways walking showed it most, because each step swung the camera. `renderPos` now interpolates between the
// last two steps, and a reconciliation correction is blended out over a few frames instead of snapping.
// Decision 054 (owner, 27 Nov 2026): movement is player-side in every stage. The browser's state IS the player's
// position (sent to the room each step); `reconcile` is only used by older input-only clients and tests, and the
// room's own placements (a new stage, a respawn, a capture) arrive as a teleport (`reset`).
import { SIM_DT, pushOutOfWalls, step, type MoveInput, type MoveState, type Rect } from '@cn-trials/shared';

/** Corrections larger than this (metres) snap instead of blending: a respawn, a knock-back, a teleport. */
const SNAP_DISTANCE = 1.5;
/** How fast a reconciliation error fades (1/s). About 90 % gone after 0.15 s. */
const ERROR_DECAY = 16;

export class Predictor {
  state: MoveState;
  /** State before the latest fixed step, for interpolation. */
  private prev: MoveState;
  seq = 0;
  private history: { seq: number; input: MoveInput; speed: number }[] = [];
  private lastAck = -1;
  /** Visual offset left by a reconciliation correction; decays to zero. */
  private errX = 0;
  private errZ = 0;
  /** Smoothed position to draw this frame (set by `updateRender`). */
  readonly render = { x: 0, z: 0 };

  /** Walls for the next step: the stage walls, plus the obstacle twist when a round uses it (Stage 1.5). */
  constructor(start: MoveState, private walls: Rect[] | (() => Rect[]), private speed: () => number = () => 1) {
    this.state = { ...start };
    this.prev = { ...start };
    this.render.x = start.x;
    this.render.z = start.z;
  }

  /** Apply one fixed step locally; returns the sequence number to send. */
  apply(input: MoveInput): number {
    this.seq += 1;
    this.history.push({ seq: this.seq, input, speed: this.speed() });
    if (this.history.length > 300) this.history.shift();
    this.prev = this.state;
    this.state = step(this.state, input, SIM_DT, this.wallsNow(), this.speed());
    return this.seq;
  }

  /** Rewind to the server's authoritative state and replay inputs it has not applied yet. */
  reconcile(server: MoveState & { ack: number }): void {
    if (server.ack === this.lastAck) return;
    this.lastAck = server.ack;
    this.history = this.history.filter((h) => h.seq > server.ack);
    let s: MoveState = { x: server.x, z: server.z, vx: server.vx, vz: server.vz };
    const walls = this.wallsNow();
    for (const h of this.history) s = step(s, h.input, SIM_DT, walls, h.speed);
    const dx = s.x - this.state.x, dz = s.z - this.state.z;
    if (dx !== 0 || dz !== 0) {
      // Shift the interpolation pair with the correction, and keep the old picture as a fading offset.
      this.prev = { ...this.prev, x: this.prev.x + dx, z: this.prev.z + dz };
      this.errX -= dx;
      this.errZ -= dz;
      if (Math.hypot(this.errX, this.errZ) > SNAP_DISTANCE) { this.errX = 0; this.errZ = 0; }
    }
    this.state = s;
  }

  /**
   * Work out where to draw the contestant this frame.
   * @param alpha fraction of a fixed step accumulated since the last one (0..1)
   * @param dt frame time in seconds, for fading the correction offset
   */
  updateRender(alpha: number, dt: number): { x: number; z: number } {
    const a = Math.max(0, Math.min(1, alpha));
    const fade = Math.exp(-dt * ERROR_DECAY);
    this.errX *= fade;
    this.errZ *= fade;
    if (Math.abs(this.errX) < 1e-4) this.errX = 0;
    if (Math.abs(this.errZ) < 1e-4) this.errZ = 0;
    this.render.x = this.prev.x + (this.state.x - this.prev.x) * a + this.errX;
    this.render.z = this.prev.z + (this.state.z - this.prev.z) * a + this.errZ;
    return this.render;
  }

  /**
   * Player-side movement (decision 054): push the current state by (dx, dz), e.g. out of another contestant, then
   * back out of the walls. Moves the interpolation pair too, so the push shows smoothly.
   */
  nudge(dx: number, dz: number): void {
    const [x, z] = pushOutOfWalls(this.state.x + dx, this.state.z + dz, this.wallsNow());
    const ax = x - this.state.x, az = z - this.state.z;
    this.state = { ...this.state, x, z };
    this.prev = { ...this.prev, x: this.prev.x + ax, z: this.prev.z + az };
  }

  private wallsNow(): Rect[] { return typeof this.walls === 'function' ? this.walls() : this.walls; }

  /** Teleport (respawn): drop pending inputs. */
  reset(s: MoveState): void {
    this.state = { ...s };
    this.prev = { ...s };
    this.history = [];
    this.errX = 0;
    this.errZ = 0;
    this.render.x = s.x;
    this.render.z = s.z;
  }
}
