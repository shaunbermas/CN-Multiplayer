import { Room, type Client } from '@colyseus/core';
import {
  INPUT_BURST, INPUT_QUEUE_MAX, MAX_PLAYERS, MSG, SIM_DT, SIM_HZ, insideRect, sanitizeInput, sanitizeName, step,
  type InputMessage, type JoinOptions, type StageGeometry,
} from '@cn-trials/shared';
import { metrics, recordTick } from '../metrics.ts';
import { loadStage } from '../stageData.ts';
import { PlayerState, TrialState } from '../state.ts';

interface PlayerServerData {
  queue: InputMessage[];
  tokens: number;
  firstMoveAt: number | null;
}

/**
 * One room = one session (GDD §7.3). M0 / S1-3 build: players walk the Stage 01 greybox; the server
 * owns movement and finish detection. Signals and eliminations arrive with S1-4.
 */
export class TrialRoom extends Room<TrialState> {
  maxClients = MAX_PLAYERS;
  private geo!: StageGeometry;
  private data = new Map<string, PlayerServerData>();
  private elapsed = 0;

  onCreate(): void {
    this.geo = loadStage('STG01');
    this.setState(new TrialState());
    this.state.stage = this.geo.stage;
    metrics.rooms++;

    this.onMessage(MSG.input, (client, msg: InputMessage | InputMessage[]) => {
      const d = this.data.get(client.sessionId);
      if (!d) return;
      for (const m of Array.isArray(msg) ? msg : [msg]) {
        if (!m || typeof m.seq !== 'number' || !Number.isFinite(m.seq)) continue;
        if (d.queue.length >= INPUT_QUEUE_MAX) { metrics.inputsDropped++; continue; }
        d.queue.push(m);
        metrics.inputsAccepted++;
      }
    });
    this.onMessage(MSG.respawn, (client) => this.respawn(client.sessionId));
    this.setSimulationInterval(() => this.tick(), 1000 / SIM_HZ);
  }

  onJoin(client: Client, options: JoinOptions = {}): void {
    const used = new Set([...this.state.players.values()].map((p) => p.spawn));
    const spawn = this.geo.spawns.find((s) => !used.has(s.index)) ?? this.geo.spawns[0];
    const p = new PlayerState();
    p.name = sanitizeName(options.name, `Nomad ${spawn.index}`);
    p.spawn = spawn.index;
    this.state.players.set(client.sessionId, p);
    this.data.set(client.sessionId, { queue: [], tokens: INPUT_BURST, firstMoveAt: null });
    this.respawn(client.sessionId);
    metrics.clients++;
    console.log(JSON.stringify({ ev: 'join', room: this.roomId, session: client.sessionId, spawn: spawn.index, n: this.clients.length }));
  }

  onLeave(client: Client): void {
    this.state.players.delete(client.sessionId);
    this.data.delete(client.sessionId);
    metrics.clients--;
    console.log(JSON.stringify({ ev: 'leave', room: this.roomId, session: client.sessionId, n: this.clients.length }));
  }

  onDispose(): void {
    metrics.rooms--;
  }

  private respawn(sessionId: string): void {
    const p = this.state.players.get(sessionId);
    const d = this.data.get(sessionId);
    if (!p || !d) return;
    const s = this.geo.spawns.find((x) => x.index === p.spawn) ?? this.geo.spawns[0];
    p.x = s.x; p.z = s.z; p.vx = 0; p.vz = 0; p.yaw = s.yaw;
    p.status = 'active';
    p.finishTime = -1;
    d.firstMoveAt = null;
  }

  private tick(): void {
    const t0 = performance.now();
    this.elapsed += SIM_DT;
    this.state.time = this.elapsed;
    this.state.players.forEach((p, id) => {
      const d = this.data.get(id);
      if (!d) return;
      // Token bucket: one step per tick sustained, so a client cannot move faster than real time.
      d.tokens = Math.min(INPUT_BURST, d.tokens + 1);
      while (d.tokens >= 1 && d.queue.length) {
        const m = d.queue.shift()!;
        d.tokens -= 1;
        const input = sanitizeInput(m.mx, m.mz);
        if (d.firstMoveAt === null && (input.mx !== 0 || input.mz !== 0)) d.firstMoveAt = this.elapsed - SIM_DT;
        const next = step(p, input, SIM_DT, this.geo.walls);
        p.x = next.x; p.z = next.z; p.vx = next.vx; p.vz = next.vz;
        if (typeof m.yaw === 'number' && Number.isFinite(m.yaw)) p.yaw = m.yaw;
        p.ack = m.seq;
        if (p.status === 'active' && insideRect(this.geo.finish, p.x, p.z)) {
          p.status = 'finished';
          p.finishTime = d.firstMoveAt === null ? 0 : +(this.elapsed - d.firstMoveAt).toFixed(3);
          console.log(JSON.stringify({ ev: 'finish', room: this.roomId, session: id, time: p.finishTime }));
        }
      }
    });
    recordTick(performance.now() - t0);
  }
}
