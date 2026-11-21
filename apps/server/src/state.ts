import { MapSchema, Schema, defineTypes } from '@colyseus/schema';

// Synced to every client. Only what clients need to render (GDD §7.5); validation data stays server-side.
export class PlayerState extends Schema {
  declare name: string;
  declare spawn: number;
  declare x: number;
  declare z: number;
  declare vx: number;
  declare vz: number;
  declare yaw: number;
  /** Last input sequence applied by the server (client reconciliation). */
  declare ack: number;
  /** active | finished */
  declare status: string;
  /** Seconds from the player's first move to crossing the finish; -1 until finished. */
  declare finishTime: number;

  constructor() {
    super();
    // Assign in the constructor (not class fields) so defineTypes' accessors are used.
    this.name = '';
    this.spawn = 0;
    this.x = 0;
    this.z = 0;
    this.vx = 0;
    this.vz = 0;
    this.yaw = 0;
    this.ack = 0;
    this.status = 'active';
    this.finishTime = -1;
  }
}
defineTypes(PlayerState, {
  name: 'string', spawn: 'uint8', x: 'float32', z: 'float32', vx: 'float32', vz: 'float32',
  yaw: 'float32', ack: 'uint32', status: 'string', finishTime: 'float32',
});

export class TrialState extends Schema {
  declare stage: string;
  /** walk_test for the M0 / S1-3 build; Red Light, Green Light phases come in S1-4. */
  declare mode: string;
  declare time: number;
  declare players: MapSchema<PlayerState>;

  constructor() {
    super();
    this.stage = 'STG01';
    this.mode = 'walk_test';
    this.time = 0;
    this.players = new MapSchema<PlayerState>();
  }
}
defineTypes(TrialState, { stage: 'string', mode: 'string', time: 'float32', players: { map: PlayerState } });
