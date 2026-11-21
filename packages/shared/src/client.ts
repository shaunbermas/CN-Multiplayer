// Small room client used by the web app and by the Node tests (Node 22+ has a global WebSocket).
// Keeps the latest server snapshot per player and the round state; the web app adds prediction.
import {
  PROTOCOL_VERSION, STATUS_OF, type ClientMessage, type RosterEntry, type RoundState, type ServerMessage,
  type StartRequestOptions,
} from './protocol.ts';
import type { Placing, PlayerStatus } from './round.ts';

export interface PlayerView {
  id: string; name: string; spawn: number;
  x: number; z: number; vx: number; vz: number; yaw: number;
  ack: number; status: PlayerStatus; finishTime: number;
}

export type ResultRow = Placing & { name: string };

export class RoomError extends Error {
  constructor(public code: string, message: string) { super(message); }
}

const LOBBY: RoundState = { phase: 'lobby', signal: 'none', remaining: -1, elapsed: 0, host: '', seed: 0 };

export class RoomClient {
  readonly players = new Map<string, PlayerView>();
  id = '';
  room = '';
  stage = '';
  time = 0;
  snapshots = 0;
  round: RoundState = { ...LOBBY };
  /** Local clock (ms) when the last snapshot arrived, to smooth timers between snapshots. */
  roundAt = 0;
  results: ResultRow[] = [];
  readonly events: { kind: 'spotted' | 'finished'; id: string; at: number }[] = [];
  private ws: WebSocket;
  private closeHandlers: ((code: number, reason: string) => void)[] = [];
  private snapHandlers: (() => void)[] = [];

  private constructor(ws: WebSocket) { this.ws = ws; }

  /** Connect to ws(s)://host/api/room/<code>/ws and join. Resolves after the server's welcome. */
  static connect(url: string, name: string, timeoutMs = 10_000): Promise<RoomClient> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url);
      const c = new RoomClient(ws);
      let settled = false;
      const timer = setTimeout(() => fail(new RoomError('timeout', 'The game server did not answer')), timeoutMs);
      const fail = (e: Error) => {
        if (settled) return;
        settled = true; clearTimeout(timer);
        try { ws.close(); } catch { /* ignore */ }
        reject(e);
      };
      ws.addEventListener('open', () => c.send({ t: 'join', v: PROTOCOL_VERSION, name }));
      ws.addEventListener('error', () => fail(new RoomError('network', 'Could not reach the game server')));
      ws.addEventListener('close', (ev) => {
        if (!settled) fail(new RoomError('closed', ev.reason || 'The game server closed the connection'));
        for (const h of c.closeHandlers) h(ev.code, ev.reason);
      });
      ws.addEventListener('message', (ev) => {
        let msg: ServerMessage;
        try { msg = JSON.parse(String(ev.data)); } catch { return; }
        switch (msg.t) {
          case 'error':
            return fail(new RoomError(msg.code, msg.message));
          case 'welcome':
            c.id = msg.id; c.room = msg.room; c.stage = msg.stage;
            c.applyRoster(msg.roster);
            c.setRound(msg.round);
            if (!settled) { settled = true; clearTimeout(timer); resolve(c); }
            break;
          case 'roster':
            c.applyRoster(msg.roster);
            break;
          case 'snap':
            c.time = msg.time;
            c.snapshots++;
            c.setRound(msg.round);
            for (const [id, x, z, vx, vz, yaw, ack, st, ft] of msg.rows) {
              const p = c.players.get(id);
              if (p) Object.assign(p, { x, z, vx, vz, yaw, ack, status: STATUS_OF[st] ?? 'active', finishTime: ft });
            }
            for (const h of c.snapHandlers) h();
            break;
          case 'results':
            c.results = msg.placings;
            break;
          case 'event':
            c.events.push({ kind: msg.kind, id: msg.id, at: Date.now() });
            if (c.events.length > 100) c.events.shift();
            break;
          case 'probe':
            c.send({ t: 'probe_ack', id: msg.id });
            break;
        }
      });
    });
  }

  private setRound(r: RoundState): void {
    if (r.phase === 'briefing' && this.round.phase !== 'briefing') this.results = [];
    this.round = r;
    this.roundAt = Date.now();
  }

  private applyRoster(roster: RosterEntry[]): void {
    const ids = new Set(roster.map((r) => r.id));
    for (const id of [...this.players.keys()]) if (!ids.has(id)) this.players.delete(id);
    for (const r of roster) {
      const p = this.players.get(r.id);
      if (p) { p.name = r.name; p.spawn = r.spawn; continue; }
      this.players.set(r.id, {
        id: r.id, name: r.name, spawn: r.spawn, x: 0, z: 0, vx: 0, vz: 0, yaw: 0, ack: 0, status: 'active', finishTime: -1,
      });
    }
  }

  get self(): PlayerView | undefined { return this.players.get(this.id); }
  get isHost(): boolean { return this.round.host === this.id; }

  /** Seconds left in the current phase, smoothed with the local clock between snapshots. */
  remaining(): number {
    if (this.round.remaining < 0) return -1;
    return Math.max(0, this.round.remaining - (Date.now() - this.roundAt) / 1000);
  }

  send(msg: ClientMessage): void {
    if (this.ws.readyState === 1) this.ws.send(JSON.stringify(msg));
  }

  start(opts?: StartRequestOptions): void { this.send({ t: 'start', opts }); }
  skipBriefing(): void { this.send({ t: 'skip' }); }

  onClose(h: (code: number, reason: string) => void): void { this.closeHandlers.push(h); }
  onSnapshot(h: () => void): void { this.snapHandlers.push(h); }

  leave(): void { try { this.ws.close(1000, 'Bye'); } catch { /* ignore */ } }
}
