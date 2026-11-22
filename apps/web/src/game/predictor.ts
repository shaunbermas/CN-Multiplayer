// Client-side prediction for the local player with server reconciliation (GDD §7.3).
import { SIM_DT, step, type MoveInput, type MoveState, type Rect } from '@cn-trials/shared';

export class Predictor {
  state: MoveState;
  seq = 0;
  private history: { seq: number; input: MoveInput }[] = [];
  private lastAck = -1;

  /** Walls for the next step: the stage walls, plus the obstacle twist when a round uses it (Stage 1.5). */
  constructor(start: MoveState, private walls: Rect[] | (() => Rect[])) {
    this.state = { ...start };
  }

  /** Apply one fixed step locally; returns the sequence number to send. */
  apply(input: MoveInput): number {
    this.seq += 1;
    this.history.push({ seq: this.seq, input });
    if (this.history.length > 300) this.history.shift();
    this.state = step(this.state, input, SIM_DT, this.wallsNow());
    return this.seq;
  }

  /** Rewind to the server's authoritative state and replay inputs it has not applied yet. */
  reconcile(server: MoveState & { ack: number }): void {
    if (server.ack === this.lastAck) return;
    this.lastAck = server.ack;
    this.history = this.history.filter((h) => h.seq > server.ack);
    let s: MoveState = { x: server.x, z: server.z, vx: server.vx, vz: server.vz };
    const walls = this.wallsNow();
    for (const h of this.history) s = step(s, h.input, SIM_DT, walls);
    this.state = s;
  }

  private wallsNow(): Rect[] { return typeof this.walls === 'function' ? this.walls() : this.walls; }

  /** Teleport (respawn): drop pending inputs. */
  reset(s: MoveState): void {
    this.state = { ...s };
    this.history = [];
  }
}
