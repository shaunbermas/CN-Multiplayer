// A CN Trials room: one Cloudflare Durable Object per room (ADR 0002).
// Holds every player's WebSocket, runs the 30 Hz authoritative simulation and broadcasts
// snapshots at 20 Hz. M0 / S1-3 walk-test rules; Red Light, Green Light arrives in S1-4.
import { DurableObject } from 'cloudflare:workers';
import {
  CLOSE, INPUT_BURST, INPUT_QUEUE_MAX, MAX_MESSAGE_BYTES, MAX_PLAYERS, PROTOCOL_VERSION, SIM_DT, SIM_HZ,
  SNAPSHOT_MS, buildStageGeometry, encodeRow, insideRect, sanitizeInput, sanitizeName, step,
  type ClientMessage, type CollisionFile, type MarkersFile, type RosterEntry, type ServerMessage, type StageGeometry,
} from '@cn-trials/shared';
import collision from '../../../blender/exports/STG01/STG01_collision.json';
import markers from '../../../blender/exports/STG01/STG01_markers.json';
import type { Env } from './env.ts';

const geo: StageGeometry = buildStageGeometry(collision as unknown as CollisionFile, markers as unknown as MarkersFile);

interface Player {
  id: string;
  name: string;
  spawn: number;
  x: number; z: number; vx: number; vz: number; yaw: number;
  ack: number;
  finished: boolean;
  finishTime: number;
  queue: { seq: number; mx: number; mz: number; yaw: number }[];
  tokens: number;
  firstMoveAt: number | null;
}

interface Attachment { room: string; id: string | null }
interface Stats { ticks: number; totalMs: number; maxMs: number; recent: number[]; accepted: number; dropped: number }
const newStats = (): Stats => ({ ticks: 0, totalMs: 0, maxMs: 0, recent: [], accepted: 0, dropped: 0 });

export class TrialRoom extends DurableObject<Env> {
  private players = new Map<string, Player>();
  private sockets = new Map<string, WebSocket>();
  private elapsed = 0;
  private tickTimer: ReturnType<typeof setInterval> | null = null;
  private snapTimer: ReturnType<typeof setInterval> | null = null;
  private stats = newStats();
  private nextId = 1;

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const room = url.searchParams.get('room') ?? 'default';
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
      if (att.id) return; // already joined
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
    if (msg.t === 'input') {
      if (typeof msg.seq !== 'number' || !Number.isFinite(msg.seq)) return;
      if (p.queue.length >= INPUT_QUEUE_MAX) { this.stats.dropped++; return; }
      p.queue.push({ seq: msg.seq, mx: msg.mx, mz: msg.mz, yaw: msg.yaw });
      this.stats.accepted++;
    } else if (msg.t === 'respawn') {
      this.respawn(p);
    } else if (msg.t === 'ping') {
      send(ws, { t: 'pong', at: msg.at });
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
      id, name: sanitizeName(rawName, `Nomad ${spawn.index}`), spawn: spawn.index,
      x: spawn.x, z: spawn.z, vx: 0, vz: 0, yaw: spawn.yaw, ack: 0, finished: false, finishTime: -1,
      queue: [], tokens: INPUT_BURST, firstMoveAt: null,
    };
    this.players.set(id, p);
    this.sockets.set(id, ws);
    ws.serializeAttachment({ room, id } satisfies Attachment);
    send(ws, { t: 'welcome', v: PROTOCOL_VERSION, id, room, stage: geo.stage, spawn: spawn.index, roster: this.roster() });
    this.broadcast({ t: 'roster', roster: this.roster() });
    this.broadcastSnapshot();
    this.startLoop();
    console.log(JSON.stringify({ ev: 'join', room, id, spawn: spawn.index, n: this.players.size }));
  }

  private leave(ws: WebSocket): void {
    const att = ws.deserializeAttachment() as Attachment | null;
    try { ws.close(1000, 'Left'); } catch { /* already closed */ }
    if (!att?.id || !this.players.has(att.id)) return;
    this.players.delete(att.id);
    this.sockets.delete(att.id);
    this.broadcast({ t: 'roster', roster: this.roster() });
    console.log(JSON.stringify({ ev: 'leave', room: att.room, id: att.id, n: this.players.size }));
    if (this.players.size === 0) this.stopLoop();
  }

  private respawn(p: Player): void {
    const s = geo.spawns.find((x) => x.index === p.spawn) ?? geo.spawns[0];
    Object.assign(p, { x: s.x, z: s.z, vx: 0, vz: 0, yaw: s.yaw, finished: false, finishTime: -1, firstMoveAt: null });
  }

  private roster(): RosterEntry[] {
    return [...this.players.values()].map((p) => ({ id: p.id, name: p.name, spawn: p.spawn }));
  }

  // ---------------------------------------------------------------- loop
  private startLoop(): void {
    if (this.tickTimer) return;
    this.tickTimer = setInterval(() => this.tick(), 1000 / SIM_HZ);
    this.snapTimer = setInterval(() => this.broadcastSnapshot(), SNAPSHOT_MS);
  }

  private stopLoop(): void {
    if (this.tickTimer) clearInterval(this.tickTimer);
    if (this.snapTimer) clearInterval(this.snapTimer);
    this.tickTimer = this.snapTimer = null;
  }

  private tick(): void {
    const t0 = performance.now();
    this.elapsed += SIM_DT;
    for (const p of this.players.values()) {
      // Token bucket: one step per tick sustained, so a client cannot move faster than real time.
      p.tokens = Math.min(INPUT_BURST, p.tokens + 1);
      while (p.tokens >= 1 && p.queue.length) {
        const m = p.queue.shift()!;
        p.tokens -= 1;
        const input = sanitizeInput(m.mx, m.mz);
        if (p.firstMoveAt === null && (input.mx !== 0 || input.mz !== 0)) p.firstMoveAt = this.elapsed - SIM_DT;
        const next = step(p, input, SIM_DT, geo.walls);
        p.x = next.x; p.z = next.z; p.vx = next.vx; p.vz = next.vz;
        if (typeof m.yaw === 'number' && Number.isFinite(m.yaw)) p.yaw = m.yaw;
        p.ack = m.seq;
        if (!p.finished && insideRect(geo.finish, p.x, p.z)) {
          p.finished = true;
          p.finishTime = p.firstMoveAt === null ? 0 : Math.round((this.elapsed - p.firstMoveAt) * 1000) / 1000;
          console.log(JSON.stringify({ ev: 'finish', id: p.id, time: p.finishTime }));
        }
      }
    }
    // Note: Workers coarsen timers during synchronous work, so tick timings are approximate.
    const ms = performance.now() - t0;
    const s = this.stats;
    s.ticks++; s.totalMs += ms; s.maxMs = Math.max(s.maxMs, ms);
    s.recent.push(ms); if (s.recent.length > 3000) s.recent.shift();
  }

  private broadcastSnapshot(): void {
    const rows = [...this.players.values()].map((p) => encodeRow(p.id, p));
    this.broadcast({ t: 'snap', time: Math.round(this.elapsed * 1000) / 1000, rows });
  }

  private broadcast(msg: ServerMessage): void {
    const text = JSON.stringify(msg);
    for (const ws of this.sockets.values()) sendRaw(ws, text);
  }

  private health(room: string) {
    const sorted = [...this.stats.recent].sort((a, b) => a - b);
    const pct = (q: number) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] : 0);
    return {
      ok: true, room, players: this.players.size, running: !!this.tickTimer,
      ticks: this.stats.ticks,
      tickMs: { avg: this.stats.ticks ? +(this.stats.totalMs / this.stats.ticks).toFixed(3) : 0, p95: +pct(0.95).toFixed(3), max: +this.stats.maxMs.toFixed(3) },
      inputs: { accepted: this.stats.accepted, dropped: this.stats.dropped },
    };
  }
}

function send(ws: WebSocket, msg: ServerMessage): void { sendRaw(ws, JSON.stringify(msg)); }
function sendRaw(ws: WebSocket, text: string): void { try { ws.send(text); } catch { /* closing */ } }
