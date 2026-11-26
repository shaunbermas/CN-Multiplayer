// Small room client used by the web app and by the Node tests (Node 22+ has a global WebSocket).
// Keeps the latest server snapshot per player and the round state; the web app adds prediction.
import {
  PROTOCOL_VERSION, STATUS_OF, type ClientMessage, type MatchState, type ResultPlacing, type RosterEntry, type RoundState, type ServerMessage,
  type StartRequestOptions, type TeamBoard,
} from './protocol.ts';
import type { Standing } from './match.ts';
import type { Emote } from './contestantColorways.ts';
import type { PlayerStatus } from './round.ts';
import type { HuntPrivate } from './hunt/hunt.ts';
import type { AgawanEvent, AgawanPrivate } from './agawan/agawan.ts';
import type { TeamSlot, TeamsView } from './teams.ts';

export interface PlayerView {
  id: string; name: string; spawn: number;
  x: number; z: number; vx: number; vz: number; yaw: number;
  ack: number; status: PlayerStatus; finishTime: number;
  /** Lobby ready flag (Stage 1.5). */
  ready: boolean;
  /** Colourway of the shared contestant (CW01–CW30). */
  colorway: string;
  /** Server-side bot (v7). */
  bot: boolean;
  /** Seconds of collision knock-down left (0 = standing; v7). */
  down: number;
  /** In the latest snapshot (The Hunt snapshots leave out players you cannot see; v8). */
  seen: boolean;
  /** Disconnected mid-match, seat kept (v8). */
  away: boolean;
  /** Recent snapshot positions on the server's clock, newest last (client-side interpolation buffer). */
  hist?: { t: number; x: number; z: number; vx: number; vz: number }[];
}

/** How far behind the newest snapshot other players are drawn (s): two 20 Hz snapshots, so a late one is covered. */
export const INTERP_DELAY_S = 0.1;

export type ResultRow = ResultPlacing;

export class RoomError extends Error {
  constructor(public code: string, message: string) { super(message); }
}

const LOBBY: RoundState = { phase: 'lobby', signal: 'none', remaining: -1, elapsed: 0, host: '', seed: 0, stage: '', mode: 'standup', target: -1, obstacles: false, match: { stage: 0, total: 0, final: false } };

export class RoomClient {
  readonly players = new Map<string, PlayerView>();
  id = '';
  room = '';
  stage = '';
  time = 0;
  snapshots = 0;
  /** Server clock minus local clock (s), tracked from snapshot arrivals (the earliest arrivals set it). */
  private clockOffset: number | null = null;
  round: RoundState = { ...LOBBY };
  /** Local clock (ms) when the last snapshot arrived, to smooth timers between snapshots. */
  roundAt = 0;
  results: ResultRow[] = [];
  /** Round id, stage and mode of the last results message. */
  resultsMeta: { roundId: number; stage: string; mode: string; match: MatchState } | null = null;
  /** Overall match standings (v7), newest from the server. */
  standings: Standing[] = [];
  /** Team championship board (v11) in matches with teams, newest from the server. */
  teamBoard: TeamBoard | null = null;
  standingsMatch: MatchState | null = null;
  /** at = local receive time (ms); roundT = seconds since GO on the server's clock. */
  /** Your own Hunt state (role, timers, pulse reading), or null outside The Hunt (v8). */
  hunt: HuntPrivate | null = null;
  /** Your own Agawan Base state (team, prison timer, hold progress), or null outside Agawan Base (v10). */
  agawan: AgawanPrivate | null = null;
  /** Agawan Base feed (v10): tags, rescues, releases and raids, newest last; at = local receive time (ms). */
  readonly agawanFeed: (AgawanEvent & { at: number; roundT: number })[] = [];
  /** Team setup for Stage 02 · Agawan Base (v9), newest from the server. */
  teams: TeamsView | null = null;
  /** The last request the server refused after joining (e.g. a team rule), with its local receive time (ms). */
  lastError: { code: string; message: string; at: number } | null = null;
  readonly events: { kind: 'spotted' | 'finished' | 'collision' | 'captured'; id: string; at: number; roundT: number; other?: string }[] = [];
  private ws: WebSocket;
  private closeHandlers: ((code: number, reason: string) => void)[] = [];
  private snapHandlers: (() => void)[] = [];
  /** Recent lobby emotes (visual only): local receive time in ms. */
  readonly emotes: { id: string; e: Emote; at: number }[] = [];

  private constructor(ws: WebSocket) { this.ws = ws; }

  /** Connect to ws(s)://host/api/room/<code>/ws and join. Resolves after the server's welcome. */
  static connect(url: string, name: string, timeoutMs = 10_000, key?: string): Promise<RoomClient> {
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
      ws.addEventListener('open', () => c.send({ t: 'join', v: PROTOCOL_VERSION, name, ...(key ? { key } : {}) }));
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
            if (settled) { c.lastError = { code: msg.code, message: msg.message, at: Date.now() }; return; }
            return fail(new RoomError(msg.code, msg.message));
          case 'welcome':
            c.id = msg.id; c.room = msg.room; c.stage = msg.stage;
            c.applyRoster(msg.roster);
            c.setRound(msg.round);
            c.teams = msg.teams ?? null;
            if (!settled) { settled = true; clearTimeout(timer); resolve(c); }
            break;
          case 'roster':
            c.applyRoster(msg.roster);
            break;
          case 'teams':
            c.teams = msg.teams;
            break;
          case 'snap':
            c.time = msg.time;
            c.snapshots++;
            c.setRound(msg.round);
            c.hunt = msg.me ?? null;
            c.agawan = msg.ag ?? null;
            if (msg.all !== false) for (const p of c.players.values()) p.seen = true;
            else for (const p of c.players.values()) p.seen = false;
            c.trackClock(msg.time);
            for (const [id, x, z, vx, vz, yaw, ack, st, ft, down] of msg.rows) {
              const p = c.players.get(id);
              if (!p) continue;
              Object.assign(p, { x, z, vx, vz, yaw, ack, status: STATUS_OF[st] ?? 'active', finishTime: ft, down: down ?? 0, seen: true });
              const h = (p.hist ??= []);
              if (h.length && msg.time <= h[h.length - 1].t) h.length = 0; // a new room clock (stage change): start over
              h.push({ t: msg.time, x, z, vx, vz });
              if (h.length > 10) h.shift();
            }
            for (const h of c.snapHandlers) h();
            break;
          case 'results':
            c.results = msg.placings;
            c.resultsMeta = { roundId: msg.roundId, stage: msg.stage, mode: msg.mode, match: msg.match };
            c.standings = msg.standings;
            c.standingsMatch = msg.match;
            c.teamBoard = msg.teams ?? null;
            break;
          case 'standings':
            c.standings = msg.standings;
            c.standingsMatch = msg.match;
            c.teamBoard = msg.teams ?? null;
            break;
          case 'agawan':
            c.agawanFeed.push({ ...msg.ev, at: Date.now(), roundT: msg.at });
            if (c.agawanFeed.length > 400) c.agawanFeed.shift();
            break;
          case 'event':
            c.events.push({ kind: msg.kind, id: msg.id, at: Date.now(), roundT: msg.at, ...(msg.other ? { other: msg.other } : {}) });
            if (c.events.length > 100) c.events.shift();
            break;
          case 'emote':
            c.emotes.push({ id: msg.id, e: msg.e, at: Date.now() });
            if (c.emotes.length > 60) c.emotes.splice(0, c.emotes.length - 60);
            break;
          case 'pong':
            if (typeof msg.at === 'number') c.rttMs = Math.max(0, Date.now() - msg.at);
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
    // A new match (stage 1 briefing) clears the previous match's standings.
    if (r.phase === 'briefing' && r.match?.stage === 1 && this.round.phase !== 'briefing') { this.standings = []; this.standingsMatch = null; this.teamBoard = null; }
    this.round = r;
    this.roundAt = Date.now();
  }

  private applyRoster(roster: RosterEntry[]): void {
    const ids = new Set(roster.map((r) => r.id));
    for (const id of [...this.players.keys()]) if (!ids.has(id)) this.players.delete(id);
    for (const r of roster) {
      const p = this.players.get(r.id);
      if (p) { p.name = r.name; p.spawn = r.spawn; p.ready = !!r.ready; p.colorway = r.colorway; p.bot = !!r.bot; p.away = !!r.away; continue; }
      this.players.set(r.id, {
        id: r.id, name: r.name, spawn: r.spawn, x: 0, z: 0, vx: 0, vz: 0, yaw: 0, ack: 0, status: 'active', finishTime: -1, ready: !!r.ready, colorway: r.colorway,
        bot: !!r.bot, down: 0, seen: true, away: !!r.away,
      });
    }
  }

  /** Last measured round trip to the room (ms), from ping/pong; -1 until measured (Stage 1.5 HUD). */
  rttMs = -1;
  /** Measure the round trip (the server echoes `at`). */
  ping(): void { this.send({ t: 'ping', at: Date.now() }); }

  get self(): PlayerView | undefined { return this.players.get(this.id); }
  get isHost(): boolean { return this.round.host === this.id; }

  private trackClock(serverT: number): void {
    const est = serverT - performance.now() / 1000;
    // A snapshot that arrives quickly gives the best estimate; slow ones only nudge it (network jitter), and a
    // big jump (the server's clock restarted) resets it.
    if (this.clockOffset === null || est > this.clockOffset || Math.abs(est - this.clockOffset) > 2) this.clockOffset = est;
    else this.clockOffset += (est - this.clockOffset) * 0.02;
  }

  /** The server's clock now (s), estimated from snapshot arrivals. */
  serverNow(): number { return performance.now() / 1000 + (this.clockOffset ?? 0); }

  /**
   * Where to draw another player now: interpolated between the two snapshots around (server now - delay), so
   * remote players move smoothly at the server's real speed even when snapshots arrive unevenly. Past the newest
   * snapshot it extrapolates along the velocity for at most 0.15 s. Returns null without history.
   */
  sample(id: string, delay = INTERP_DELAY_S): { x: number; z: number; vx: number; vz: number } | null {
    const h = this.players.get(id)?.hist;
    if (!h?.length) return null;
    const t = this.serverNow() - delay;
    const last = h[h.length - 1];
    if (t >= last.t) {
      const ahead = Math.min(0.15, t - last.t);
      return { x: last.x + last.vx * ahead, z: last.z + last.vz * ahead, vx: last.vx, vz: last.vz };
    }
    for (let i = h.length - 1; i > 0; i--) {
      const a = h[i - 1], b = h[i];
      if (t < a.t) continue;
      if (b.t - a.t > 0.3) return { x: b.x, z: b.z, vx: b.vx, vz: b.vz }; // a gap (out of sight in The Hunt): no slide
      const k = (t - a.t) / (b.t - a.t);
      return { x: a.x + (b.x - a.x) * k, z: a.z + (b.z - a.z) * k, vx: a.vx + (b.vx - a.vx) * k, vz: a.vz + (b.vz - a.vz) * k };
    }
    const first = h[0];
    return { x: first.x, z: first.z, vx: first.vx, vz: first.vz };
  }

  /** Seconds left in the current phase, smoothed with the local clock between snapshots. */
  remaining(): number {
    if (this.round.remaining < 0) return -1;
    if (this.round.paused) return this.round.remaining; // frozen while the host has the room paused
    return Math.max(0, this.round.remaining - (Date.now() - this.roundAt) / 1000);
  }

  send(msg: ClientMessage): void {
    if (this.ws.readyState === 1) this.ws.send(JSON.stringify(msg));
  }

  start(opts?: StartRequestOptions): void { this.send({ t: 'start', opts }); }
  /** Stage 1.5 lobby ready toggle. */
  setReady(ready: boolean): void { this.send({ t: 'ready', ready }); }
  skipBriefing(): void { this.send({ t: 'skip' }); }
  /** Host: add random bots (lobby), fill every free slot, or remove all bots (v7). */
  addBots(count?: number): void { this.send({ t: 'bots', action: 'add', ...(count ? { count } : {}) }); }
  fillBots(): void { this.send({ t: 'bots', action: 'fill' }); }
  clearBots(): void { this.send({ t: 'bots', action: 'clear' }); }
  /** Host: start the next stage now instead of waiting out the results (v7). */
  nextStage(): void { this.send({ t: 'next' }); }
  /** Host: restart the match from stage 1 (points reset, everyone plays, random players kept). */
  restart(): void { this.send({ t: 'restart' }); }
  /** Host: restart the stage in progress; earlier stages' points are kept (owner, 25 Nov 2026). */
  restartStage(): void { this.send({ t: 'restart', stage: true }); }
  /** Host: pause or resume the room for everyone. */
  pause(on: boolean): void { this.send({ t: 'pause', on }); }

  /** Team setup (v9): pick a team, nominate yourself; host: rename, appoint a captain, move, auto-balance, auto-pick captains. */
  joinTeam(slot: TeamSlot): void { this.send({ t: 'team', a: 'join', slot }); }
  nominate(on: boolean): void { this.send({ t: 'team', a: 'nominate', on }); }
  renameTeam(slot: TeamSlot, name: string): void { this.send({ t: 'team', a: 'rename', slot, name }); }
  setCaptain(slot: TeamSlot, id: string | null): void { this.send({ t: 'team', a: 'captain', slot, id }); }
  moveToTeam(id: string, slot: TeamSlot): void { this.send({ t: 'team', a: 'move', id, slot }); }
  balanceTeams(): void { this.send({ t: 'team', a: 'balance' }); }
  autoCaptains(): void { this.send({ t: 'team', a: 'autoCaptains' }); }

  /** The Hunt: fire the Pulse Detector (hunters). */
  pulse(): void { this.send({ t: 'act', a: 'pulse' }); }
  /** The Hunt: enter or leave a hiding place (hiders). */
  hide(): void { this.send({ t: 'act', a: 'hide' }); }
  /** The Hunt: hold or release capture (hunters). */
  capture(on: boolean): void { this.send({ t: 'act', a: 'capture', on }); }
  /** Agawan Base: hold or release E (tag, rescue or raid; the server decides which). */
  interact(on: boolean): void { this.send({ t: 'act', a: 'interact', on }); }

  onClose(h: (code: number, reason: string) => void): void { this.closeHandlers.push(h); }
  onSnapshot(h: () => void): void { this.snapHandlers.push(h); }

  leave(): void { try { this.ws.close(1000, 'Bye'); } catch { /* ignore */ } }
}
