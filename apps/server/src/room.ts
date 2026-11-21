// A CN Trials room: one Cloudflare Durable Object per room (ADR 0002).
// Holds every player's WebSocket, runs the 30 Hz authoritative simulation, the Red Light, Green Light
// round (packages/shared/src/round.ts) and broadcasts snapshots at 20 Hz.
import { DurableObject } from 'cloudflare:workers';
import {
  CLOSE, INPUT_BURST, INPUT_QUEUE_MAX, MAX_MESSAGE_BYTES, MAX_PLAYERS, PROBE_MS, PROTOCOL_VERSION, RoundEngine, SIM_DT,
  SIM_HZ, SNAPSHOT_MS, buildStageGeometry, encodeRow, insideRect, newRoundPlayer, sanitizeInput, sanitizeName, step,
  type ClientMessage, type CollisionFile, type MarkersFile, type RosterEntry, type RoundEvents, type RoundPlayer,
  type RoundState, type ServerMessage, type StageGeometry,
} from '@cn-trials/shared';
import collision from '../../../blender/exports/STG01/STG01_collision.json';
import markers from '../../../blender/exports/STG01/STG01_markers.json';
import type { Env } from './env.ts';

const geo: StageGeometry = buildStageGeometry(collision as unknown as CollisionFile, markers as unknown as MarkersFile);

interface Player extends RoundPlayer {
  name: string;
  vx: number; vz: number; yaw: number;
  ack: number;
  queue: { seq: number; mx: number; mz: number; yaw: number }[];
  tokens: number;
  /** Lobby practice walk: room time of the first move. */
  firstMoveAt: number | null;
  probeSentAt: Map<number, number>;
}

interface Attachment { room: string; id: string | null }
interface Stats { ticks: number; totalMs: number; maxMs: number; recent: number[]; accepted: number; dropped: number }
const newStats = (): Stats => ({ ticks: 0, totalMs: 0, maxMs: 0, recent: [], accepted: 0, dropped: 0 });

export class TrialRoom extends DurableObject<Env> {
  private players = new Map<string, Player>();
  private sockets = new Map<string, WebSocket>();
  private engine = new RoundEngine(geo);
  private elapsed = 0;
  private tickTimer: ReturnType<typeof setInterval> | null = null;
  private snapTimer: ReturnType<typeof setInterval> | null = null;
  private probeTimer: ReturnType<typeof setInterval> | null = null;
  private probeId = 0;
  private stats = newStats();
  private nextId = 1;
  private hostId = '';
  private roomCode = 'default';

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const room = url.searchParams.get('room') ?? 'default';
    this.roomCode = room;
    if (url.pathname.endsWith('/health')) return Response.json(this.health(room));
    if (url.pathname.endsWith('/metrics/reset') && request.method === 'POST' && this.env.CN_TEST === '1') {
      this.stats = newStats();
      return new Response(null, { status: 204 });
    }
    if (request.headers.get('Upgrade') !== 'websocket') return new Response('Expected a WebSocket', { status: 426 });

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    // Hibernation-capable sockets; the room never hibernates while its game loop timers run.
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ room, id: null } satisfies Attachment);
    if (this.players.size >= MAX_PLAYERS) this.rejectFull(server, room);
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    if (typeof raw !== 'string' || raw.length > MAX_MESSAGE_BYTES) return;
    let msg: ClientMessage;
    try { msg = JSON.parse(raw); } catch { return; }
    const att = ws.deserializeAttachment() as Attachment | null;
    if (!att) return;

    if (msg.t === 'join') {
      if (att.id) return;
      if (msg.v !== PROTOCOL_VERSION) {
        send(ws, { t: 'error', code: 'version', message: 'Please reload the page to get the latest version' });
        ws.close(CLOSE.version, 'Old client');
        return;
      }
      if (this.players.size >= MAX_PLAYERS) return this.rejectFull(ws, att.room);
      this.join(ws, att.room, msg.name);
      return;
    }
    const p = att.id ? this.players.get(att.id) : undefined;
    if (!p) return;
    switch (msg.t) {
      case 'input':
        if (typeof msg.seq !== 'number' || !Number.isFinite(msg.seq)) return;
        if (p.queue.length >= INPUT_QUEUE_MAX) { this.stats.dropped++; return; }
        p.queue.push({ seq: msg.seq, mx: msg.mx, mz: msg.mz, yaw: msg.yaw });
        this.stats.accepted++;
        break;
      case 'respawn':
        if (this.engine.phase === 'lobby') this.respawn(p);
        break;
      case 'start':
        this.startRound(p, msg.opts);
        break;
      case 'skip':
        this.engine.skip(p.id, this.roundPlayers().map((x) => x.id));
        break;
      case 'probe_ack': {
        const sent = p.probeSentAt.get(msg.id);
        if (sent !== undefined) {
          p.probeSentAt.delete(msg.id);
          const oneWay = Math.min(1, Math.max(0, (Date.now() - sent) / 2000));
          p.latencyS = p.latencyS === 0 ? oneWay : p.latencyS * 0.7 + oneWay * 0.3; // smoothed
        }
        break;
      }
      case 'ping':
        send(ws, { t: 'pong', at: msg.at });
        break;
    }
  }

  async webSocketClose(ws: WebSocket): Promise<void> { this.leave(ws); }
  async webSocketError(ws: WebSocket): Promise<void> { this.leave(ws); }

  // ---------------------------------------------------------------- players
  private rejectFull(ws: WebSocket, room: string): void {
    send(ws, { t: 'error', code: 'full', message: `Room ${room} is full (${MAX_PLAYERS} players)` });
    try { ws.close(CLOSE.full, 'Room is full'); } catch { /* closing */ }
  }

  private join(ws: WebSocket, room: string, rawName: unknown): void {
    const used = new Set([...this.players.values()].map((p) => p.spawn));
    const spawn = geo.spawns.find((s) => !used.has(s.index)) ?? geo.spawns[0];
    const id = `p${this.nextId++}`;
    const p: Player = {
      ...newRoundPlayer(id, this.nextId, spawn.index, spawn.x, spawn.z),
      name: sanitizeName(rawName, `Nomad ${spawn.index}`),
      vx: 0, vz: 0, yaw: spawn.yaw, ack: 0, queue: [], tokens: INPUT_BURST, firstMoveAt: null, probeSentAt: new Map(),
    };
    if (this.engine.phase !== 'lobby') this.toBench(p, 'waiting'); // late arrivals watch and join the next round
    this.players.set(id, p);
    this.sockets.set(id, ws);
    if (!this.hostId) this.hostId = id;
    ws.serializeAttachment({ room, id } satisfies Attachment);
    send(ws, { t: 'welcome', v: PROTOCOL_VERSION, id, room, stage: geo.stage, spawn: p.spawn, roster: this.roster(), round: this.roundState() });
    this.broadcast({ t: 'roster', roster: this.roster() });
    this.broadcastSnapshot();
    this.startLoop();
    console.log(JSON.stringify({ ev: 'join', room, id, spawn: p.spawn, n: this.players.size, phase: this.engine.phase }));
  }

  private leave(ws: WebSocket): void {
    const att = ws.deserializeAttachment() as Attachment | null;
    try { ws.close(1000, 'Left'); } catch { /* already closed */ }
    if (!att?.id || !this.players.has(att.id)) return;
    this.players.delete(att.id);
    this.sockets.delete(att.id);
    if (this.hostId === att.id) {
      // Host transfer: the earliest remaining joiner (GDD §6.2).
      const next = [...this.players.values()].sort((a, b) => a.joinOrder - b.joinOrder)[0];
      this.hostId = next?.id ?? '';
    }
    this.broadcast({ t: 'roster', roster: this.roster() });
    console.log(JSON.stringify({ ev: 'leave', room: att.room, id: att.id, n: this.players.size }));
    if (this.players.size === 0) { this.stopLoop(); this.engine = new RoundEngine(geo); }
  }

  private respawn(p: Player): void {
    const s = geo.spawns.find((x) => x.index === p.spawn) ?? geo.spawns[0];
    Object.assign(p, { x: s.x, z: s.z, vx: 0, vz: 0, yaw: s.yaw, status: 'active', finishTime: -1, spotTime: -1, firstMoveAt: null });
  }

  private toBench(p: Player, status: 'waiting'): void {
    const seats = [...this.players.values()].filter((x) => x.status === 'waiting').length;
    const b = geo.benches[seats % Math.max(1, geo.benches.length)] ?? { x: 33.5, z: -10 };
    Object.assign(p, { x: b.x, z: b.z, vx: 0, vz: 0, status });
  }

  private roundPlayers(): Player[] {
    return [...this.players.values()].filter((p) => p.status !== 'waiting');
  }

  private roster(): RosterEntry[] {
    return [...this.players.values()].map((p) => ({ id: p.id, name: p.name, spawn: p.spawn }));
  }

  private startRound(by: Player, opts: { seed?: number; roundS?: number; briefingS?: number } = {}): void {
    if (by.id !== this.hostId) {
      const ws = this.sockets.get(by.id);
      if (ws) send(ws, { t: 'error', code: 'not_host', message: 'Only the host can start the round' });
      return;
    }
    if (this.engine.phase !== 'lobby') return;
    const test = this.env.CN_TEST === '1';
    const seed = test && Number.isInteger(opts?.seed) ? Number(opts.seed) : crypto.getRandomValues(new Uint32Array(1))[0];
    const roundS = test && typeof opts?.roundS === 'number' ? Math.max(5, Math.min(300, opts.roundS)) : undefined;
    const briefingS = test && typeof opts?.briefingS === 'number' ? Math.max(0, Math.min(15, opts.briefingS)) : undefined;
    const players = [...this.players.values()];
    for (const p of players) { p.vx = 0; p.vz = 0; p.queue = []; p.firstMoveAt = null; }
    this.engine.now = this.elapsed;
    this.engine.start(players, { seed, roundS, briefingS });
    for (const p of players) p.yaw = 0;
    console.log(JSON.stringify({ ev: 'round_start', room: this.roomCode, seed, players: players.length,
      schedule: this.engine.schedule.slice(0, 12).map((s) => [s.signal[0], s.start, s.end]) }));
    this.broadcast({ t: 'roster', roster: this.roster() });
    this.broadcastSnapshot();
  }

  private roundState(): RoundState {
    const e = this.engine;
    return {
      phase: e.phase,
      signal: e.signal(),
      remaining: e.phase === 'lobby' ? -1 : Math.round(e.remaining() * 100) / 100,
      elapsed: e.phase === 'active' ? Math.round((this.elapsed - e.goTime) * 100) / 100 : 0,
      host: this.hostId,
      seed: e.seed,
    };
  }

  // ---------------------------------------------------------------- loop
  private startLoop(): void {
    if (this.tickTimer) return;
    this.tickTimer = setInterval(() => this.tick(), 1000 / SIM_HZ);
    this.snapTimer = setInterval(() => this.broadcastSnapshot(), SNAPSHOT_MS);
    this.probeTimer = setInterval(() => this.probe(), PROBE_MS);
  }

  private stopLoop(): void {
    for (const t of [this.tickTimer, this.snapTimer, this.probeTimer]) if (t) clearInterval(t);
    this.tickTimer = this.snapTimer = this.probeTimer = null;
  }

  private probe(): void {
    const id = ++this.probeId;
    const now = Date.now();
    for (const [pid, ws] of this.sockets) {
      const p = this.players.get(pid);
      if (!p) continue;
      p.probeSentAt.set(id, now);
      if (p.probeSentAt.size > 5) p.probeSentAt.delete(p.probeSentAt.keys().next().value!);
      send(ws, { t: 'probe', id });
    }
  }

  private tick(): void {
    const t0 = performance.now();
    this.elapsed += SIM_DT;
    const e = this.engine;
    const before = e.phase;
    const ev = e.tick(this.elapsed, this.roundPlayers());
    this.handlePhase(before, ev);
    const moveEv: RoundEvents = { spotted: [], finished: [] };
    for (const p of this.players.values()) {
      // Token bucket: one step per tick sustained, so a client cannot move faster than real time.
      p.tokens = Math.min(INPUT_BURST, p.tokens + 1);
      while (p.tokens >= 1 && p.queue.length) {
        const m = p.queue.shift()!;
        p.tokens -= 1;
        p.ack = m.seq;
        if (!e.canMove(p)) { p.vx = 0; p.vz = 0; continue; }
        const input = sanitizeInput(m.mx, m.mz);
        const ox = p.x, oz = p.z;
        const next = step(p, input, SIM_DT, geo.walls);
        p.x = next.x; p.z = next.z; p.vx = next.vx; p.vz = next.vz;
        if (typeof m.yaw === 'number' && Number.isFinite(m.yaw)) p.yaw = m.yaw;
        if (e.phase === 'lobby') this.practiceFinish(p, input);
        else e.afterMove(p, p.x - ox, p.z - oz, SIM_DT, moveEv);
      }
    }
    for (const id of moveEv.spotted) this.broadcast({ t: 'event', kind: 'spotted', id });
    for (const id of moveEv.finished) this.broadcast({ t: 'event', kind: 'finished', id });
    const ms = performance.now() - t0;
    const s = this.stats;
    s.ticks++; s.totalMs += ms; s.maxMs = Math.max(s.maxMs, ms);
    s.recent.push(ms); if (s.recent.length > 3000) s.recent.shift();
  }

  /** Lobby practice walk (walk test): time from the first move to the finish line. */
  private practiceFinish(p: Player, input: { mx: number; mz: number }): void {
    if (p.firstMoveAt === null && (input.mx !== 0 || input.mz !== 0)) p.firstMoveAt = this.elapsed - SIM_DT;
    if (p.status === 'active' && insideRect(geo.finish, p.x, p.z)) {
      p.status = 'finished';
      p.finishTime = p.firstMoveAt === null ? 0 : Math.round((this.elapsed - p.firstMoveAt) * 1000) / 1000;
    }
  }

  private handlePhase(before: string, ev: RoundEvents): void {
    if (!ev.phase || ev.phase === before) return;
    if (ev.results) {
      const placings = ev.results.map((r) => ({ ...r, name: this.players.get(r.id)?.name ?? r.id }));
      this.broadcast({ t: 'results', placings });
      console.log(JSON.stringify({ ev: 'results', room: this.roomCode, seed: this.engine.seed, placings: placings.map((p) => [p.place, p.id, p.status, p.finishTime]) }));
    }
    if (ev.phase === 'lobby') {
      for (const p of this.players.values()) this.respawn(p); // waiting players join in for the next round
      this.broadcast({ t: 'roster', roster: this.roster() });
    }
    this.broadcastSnapshot();
  }

  private broadcastSnapshot(): void {
    const rows = [...this.players.values()].map((p) => encodeRow(p.id, p));
    this.broadcast({ t: 'snap', time: Math.round(this.elapsed * 1000) / 1000, rows, round: this.roundState() });
  }

  private broadcast(msg: ServerMessage): void {
    const text = JSON.stringify(msg);
    for (const ws of this.sockets.values()) sendRaw(ws, text);
  }

  private health(room: string) {
    const sorted = [...this.stats.recent].sort((a, b) => a - b);
    const pct = (q: number) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] : 0);
    return {
      ok: true, room, players: this.players.size, running: !!this.tickTimer, phase: this.engine.phase,
      ticks: this.stats.ticks,
      tickMs: { avg: this.stats.ticks ? +(this.stats.totalMs / this.stats.ticks).toFixed(3) : 0, p95: +pct(0.95).toFixed(3), max: +this.stats.maxMs.toFixed(3) },
      inputs: { accepted: this.stats.accepted, dropped: this.stats.dropped },
    };
  }
}

function send(ws: WebSocket, msg: ServerMessage): void { sendRaw(ws, JSON.stringify(msg)); }
function sendRaw(ws: WebSocket, text: string): void { try { ws.send(text); } catch { /* closing */ } }
