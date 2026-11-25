// A CN Trials room: one Cloudflare Durable Object per room (ADR 0002).
// Holds every player's WebSocket, runs the 30 Hz authoritative simulation, the Red Light, Green Light
// round (packages/shared/src/round.ts) and broadcasts snapshots at 20 Hz.
// Stage 01 refinement (24 Nov 2026): multi-stage match with accumulated points (match.ts), server-side bots
// (bots.ts) and player-to-player collisions (collisions.ts), all simulated here for humans and bots alike.
import { DurableObject } from 'cloudflare:workers';
import {
  BOT_LIMITS, CLOSE, DEFAULT_STAGE_ID, INPUT_BURST, INPUT_QUEUE_MAX, MATCH, MAX_MESSAGE_BYTES, MAX_PLAYERS, Match, PROBE_MS, PROTOCOL_VERSION, RoundEngine, SIM_DT,
  SIM_HZ, SNAPSHOT_MS, botInput, botNames, downLeft, encodeRow, getStage, insideRect, makeBot, matchOrder, newRoundPlayer, obstacleGapRows,
  resetBot, resolvePlayerContacts, sanitizeInput, segmentAt, HuntEngine, huntSenses, huntBotInput, CLOSE as CLOSE_CODES,
  type StageEngine, type HuntBody, type SnapRow,
  EMOTES, dealColorway, sanitizePlayerKey, greenTime, obstacleWalls, resolveObstacles, sanitizeName, step,
  type BotBrain, type ClientMessage, type GapRow, type MatchState, type Rect, type ResolvedObstacles, type RosterEntry, type RoundEvents, type RoundPlayer, type RoundState,
  type ServerMessage, type StageGeometry, type StartRequestOptions,
} from '@cn-trials/shared';
import type { Env } from './env.ts';

// No mutable module-level state (intelligence doc 09, A1): Cloudflare may run several room instances in one
// isolate, and module variables would be shared between them. Each room keeps its own stage geometry,
// obstacles and round engine as instance fields. Only immutable registry data lives at module scope.

interface Player extends RoundPlayer {
  name: string;
  vx: number; vz: number; yaw: number;
  ack: number;
  queue: { seq: number; mx: number; mz: number; yaw: number; k?: number }[];
  tokens: number;
  /** Lobby practice walk: room time of the first move. */
  firstMoveAt: number | null;
  probeSentAt: Map<number, number>;
  /** Lobby ready flag (Stage 1.5). */
  ready: boolean;
  /** Colourway of the shared contestant, unique in the room (owner pack, 22 Nov 2026). */
  colorway: string;
  /** Last lobby emote (room time, ms), for rate limiting. */
  lastEmoteAt: number;
  /** Server-side bot brain (no socket), or undefined for a human. */
  bot?: BotBrain;
  /** The browser's opaque player key (humans), used to give a reconnecting player their seat back (v8). */
  key?: string;
  /** Disconnected during a match: the seat, role, captures and points are kept for a reconnect (v8). */
  away?: boolean;
  /** The Hunt bots think at 10 Hz: the last decided move, repeated between decisions. */
  botMove?: { mx: number; mz: number; yaw: number; k: number };
}

interface Attachment { room: string; id: string | null }
interface Stats { ticks: number; totalMs: number; maxMs: number; recent: number[]; accepted: number; dropped: number; knockdowns: number; snapBytes: number; snaps: number }
const newStats = (): Stats => ({ ticks: 0, totalMs: 0, maxMs: 0, recent: [], accepted: 0, dropped: 0, knockdowns: 0, snapBytes: 0, snaps: 0 });

export class TrialRoom extends DurableObject<Env> {
  private players = new Map<string, Player>();
  /** Player key -> last colourway, so a reconnecting browser gets the same colours (room lifetime only; no personal data). */
  private colorwayByKey = new Map<string, string>();
  private sockets = new Map<string, WebSocket>();
  /** Per-room stage state (09 A1): geometry, obstacles and the engine are rebuilt for each stage played. */
  private geo: StageGeometry = getStage(DEFAULT_STAGE_ID).geometry;
  private obstacles: ResolvedObstacles | null = resolveObstacles(this.geo);
  private gapRows: GapRow[] = obstacleGapRows(this.obstacles, this.geo);
  private engine: StageEngine = new RoundEngine(this.geo);
  /** The current or last multi-stage match (points and standings); null before the first match. */
  private match: Match | null = null;
  private matchRunning = false;
  private matchOpts: StartRequestOptions = {};
  private botSeed = crypto.getRandomValues(new Uint32Array(1))[0];
  private elapsed = 0;
  private acc = 0;
  private lastTickAt = 0;
  private tickTimer: ReturnType<typeof setInterval> | null = null;
  private snapTimer: ReturnType<typeof setInterval> | null = null;
  private probeTimer: ReturnType<typeof setInterval> | null = null;
  private probeId = 0;
  private stats = newStats();
  private nextId = 1;
  private hostId = '';
  /** The host paused the room (owner, 25 Nov 2026): the simulation, timers and bots stand still. */
  private paused = false;
  private roomCode = 'default';
  private roundId = 0;

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
    // A full room still accepts the socket when a seat is kept for a reconnect; the join message decides (v8).
    if (!this.canAdmit() && ![...this.players.values()].some((p) => p.away)) this.rejectFull(server, room);
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
      const key = sanitizePlayerKey(msg.key);
      if (key && this.reclaim(ws, att.room, key)) return; // same browser: back in your own seat (v8)
      if (!this.canAdmit()) return this.rejectFull(ws, att.room);
      if (this.players.size >= MAX_PLAYERS) this.removeBots(1); // a human takes a bot's slot (lobby only)
      this.join(ws, att.room, msg.name, key);
      return;
    }
    const p = att.id ? this.players.get(att.id) : undefined;
    if (!p) return;
    switch (msg.t) {
      case 'input':
        if (typeof msg.seq !== 'number' || !Number.isFinite(msg.seq)) return;
        if (p.queue.length >= INPUT_QUEUE_MAX) { this.stats.dropped++; return; }
        p.queue.push({ seq: msg.seq, mx: msg.mx, mz: msg.mz, yaw: msg.yaw, k: typeof msg.k === 'number' ? msg.k & 3 : 0 });
        this.stats.accepted++;
        break;
      case 'act':
        this.stageAction(p, msg);
        break;
      case 'respawn':
        if (this.engine.phase === 'lobby') this.respawn(p);
        break;
      case 'start':
        this.startMatch(p, msg.opts);
        break;
      case 'skip':
        // Bots never need to read the briefing: only humans in the round count.
        this.engine.skip(p.id, this.roundPlayers().filter((x) => !x.bot && !x.away).map((x) => x.id));
        break;
      case 'bots':
        this.manageBots(p, msg);
        break;
      case 'next':
        // Host: leave the stage results now (next stage, or the lobby after the final leaderboard).
        if (p.id === this.hostId && this.engine.phase === 'results') this.engine.phaseEnd = Math.min(this.engine.phaseEnd, this.engine.now);
        break;
      case 'restart':
        if (msg.stage) this.restartStage(p);
        else this.restartMatch(p);
        break;
      case 'pause':
        // Host only, and only while a stage is being played (briefing, countdown or active).
        if (p.id === this.hostId && ['briefing', 'countdown', 'active'].includes(this.engine.phase)) {
          this.paused = !!msg.on;
          if (this.paused) for (const q of this.players.values()) { q.vx = 0; q.vz = 0; } // everyone stands still
          console.log(JSON.stringify({ ev: this.paused ? 'pause' : 'resume', room: this.roomCode, round: this.roundId, phase: this.engine.phase }));
          this.broadcastSnapshot();
        }
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
      case 'ready':
        // Stage 1.5 lobby ready state; ignored outside the lobby. Rebroadcast the roster so everyone sees it.
        if (this.engine.phase === 'lobby' && typeof msg.ready === 'boolean' && p.ready !== msg.ready) {
          p.ready = msg.ready;
          this.broadcast({ t: 'roster', roster: this.roster() });
        }
        break;
      case 'emote':
        // Visual only (lobby, or a finished player celebrating): rebroadcast, never move anyone. Max ~1 per 0.7 s.
        if ((this.engine.phase === 'lobby' || p.status === 'finished') && (EMOTES as readonly string[]).includes(msg.e) && Date.now() - p.lastEmoteAt > 700) {
          p.lastEmoteAt = Date.now();
          this.broadcast({ t: 'emote', id: p.id, e: msg.e });
        }
        break;
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

  /** Room capacity counts humans and bots (30 total). In the lobby a human may take a bot's slot. */
  private canAdmit(): boolean {
    if (this.players.size < MAX_PLAYERS) return true;
    return this.engine.phase === 'lobby' && this.botCount() > 0;
  }

  private botCount(): number { let n = 0; for (const p of this.players.values()) if (p.bot) n++; return n; }
  /** Humans with a live connection (players kept for a reconnect do not count). */
  private humanCount(): number { let n = 0; for (const p of this.players.values()) if (!p.bot && !p.away) n++; return n; }

  /** The Hunt rules engine, when the room is playing The Hunt. */
  private hunt(): HuntEngine | null { return this.engine instanceof HuntEngine ? this.engine : null; }

  /**
   * Reconnect (v8): a browser with the key of a player who dropped out during a match (or who opened a second tab)
   * gets that same player back: id, role, captures, status and points. Returns false when there is no such player.
   */
  private reclaim(ws: WebSocket, room: string, key: string): boolean {
    const p = [...this.players.values()].find((x) => !x.bot && x.key === key);
    if (!p) return false;
    const old = this.sockets.get(p.id);
    if (old && old !== ws) {
      old.serializeAttachment({ room, id: null } satisfies Attachment); // its close must not remove the player
      try { old.close(CLOSE_CODES.replaced, 'Opened elsewhere'); } catch { /* closing */ }
    }
    p.away = false;
    p.queue = [];
    this.sockets.set(p.id, ws);
    ws.serializeAttachment({ room, id: p.id } satisfies Attachment);
    if (!this.hostId) this.hostId = p.id;
    send(ws, { t: 'welcome', v: PROTOCOL_VERSION, id: p.id, room, stage: this.geo.stage, spawn: p.spawn, roster: this.roster(), round: this.roundState() });
    if (this.match) send(ws, { t: 'standings', match: this.matchState(), standings: this.match.standings() });
    this.broadcast({ t: 'roster', roster: this.roster() });
    this.broadcastSnapshot();
    this.startLoop();
    console.log(JSON.stringify({ ev: 'reconnect', room, id: p.id, status: p.status, role: this.hunt()?.roleOf(p.id) ?? null, phase: this.engine.phase }));
    return true;
  }

  /** The Hunt actions (pulse, hide, capture hold), validated by the hunt engine. */
  private stageAction(p: Player, msg: { a: string; on?: boolean }): void {
    const h = this.hunt();
    if (!h || h.phase !== 'active') return;
    const bodies = this.roundPlayers();
    if (msg.a === 'pulse') h.pulse(p, bodies);
    else if (msg.a === 'hide') h.toggleHide(p, bodies);
    else if (msg.a === 'capture') h.setCapture(p, msg.on === true);
  }

  /** Creates a player (human or bot) on a free spawn with a free colourway. */
  private newPlayer(rawName: unknown, key?: string, bot?: BotBrain): Player {
    const used = new Set([...this.players.values()].map((p) => p.spawn));
    const spawn = this.geo.spawns.find((s) => !used.has(s.index)) ?? this.geo.spawns[0];
    const id = `${bot ? 'b' : 'p'}${this.nextId++}`;
    return {
      ...newRoundPlayer(id, this.nextId, spawn.index, spawn.x, spawn.z),
      name: sanitizeName(rawName, `Nomad ${spawn.index}`),
      vx: 0, vz: 0, yaw: spawn.yaw, ack: 0, queue: [], tokens: INPUT_BURST, firstMoveAt: null, probeSentAt: new Map(), ready: false,
      // Random among the colourways nobody else has; a returning player (same browser key) keeps theirs when free.
      colorway: dealColorway([...this.players.values()].map((x) => x.colorway), () => crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32,
        key ? this.colorwayByKey.get(key) : undefined) ?? 'CW01',
      lastEmoteAt: 0,
      ...(bot ? { bot, ready: true } : {}),
    };
  }

  private join(ws: WebSocket, room: string, rawName: unknown, key?: string): void {
    const p = this.newPlayer(rawName, key);
    if (key) p.key = key;
    const id = p.id;
    if (key) {
      this.colorwayByKey.set(key, p.colorway);
      if (this.colorwayByKey.size > 200) this.colorwayByKey.delete(this.colorwayByKey.keys().next().value!);
    }
    if (this.engine.phase !== 'lobby') this.toBench(p, 'waiting'); // late arrivals watch and join the next round
    this.players.set(id, p);
    this.sockets.set(id, ws);
    if (!this.hostId) this.hostId = id;
    ws.serializeAttachment({ room, id } satisfies Attachment);
    if (this.matchRunning) this.match?.ensure({ ...p, bot: false });
    send(ws, { t: 'welcome', v: PROTOCOL_VERSION, id, room, stage: this.geo.stage, spawn: p.spawn, roster: this.roster(), round: this.roundState() });
    if (this.match) send(ws, { t: 'standings', match: this.matchState(), standings: this.match.standings() });
    this.broadcast({ t: 'roster', roster: this.roster() });
    this.broadcastSnapshot();
    this.startLoop();
    console.log(JSON.stringify({ ev: 'join', room, id, spawn: p.spawn, n: this.players.size, phase: this.engine.phase }));
  }

  private leave(ws: WebSocket): void {
    const att = ws.deserializeAttachment() as Attachment | null;
    try { ws.close(1000, 'Left'); } catch { /* already closed */ }
    if (!att?.id || !this.players.has(att.id)) return;
    const gone = this.players.get(att.id)!;
    this.sockets.delete(att.id);
    if (this.matchRunning && this.engine.phase !== 'lobby' && gone.key) {
      // Mid-match: keep the seat (role, captures, status, points) so the same browser can come back (v8).
      gone.away = true; gone.queue = []; gone.vx = 0; gone.vz = 0;
      this.hunt()?.setCapture(gone, false);
    } else {
      this.players.delete(att.id);
      this.match?.markLeft(att.id); // their points stay on the board
    }
    if (this.humanCount() === 0) {
      // Nobody real is left: bots do not keep a room alive. Reset everything for the next visitor.
      this.players.clear();
      this.hostId = '';
      this.stopLoop();
      this.loadStage(DEFAULT_STAGE_ID);
      this.match = null;
      this.matchRunning = false;
      this.paused = false;
      console.log(JSON.stringify({ ev: 'leave', room: att.room, id: att.id, n: 0, reset: true }));
      return;
    }
    if (this.hostId === att.id) {
      this.paused = false; // only the host can resume, so a leaving host never leaves the room frozen
      // Host transfer: the earliest remaining human joiner (GDD §6.2); bots never host.
      const next = [...this.players.values()].filter((x) => !x.bot && !x.away).sort((a, b) => a.joinOrder - b.joinOrder)[0];
      this.hostId = next?.id ?? '';
    }
    this.broadcast({ t: 'roster', roster: this.roster() });
    console.log(JSON.stringify({ ev: 'leave', room: att.room, id: att.id, n: this.players.size }));
  }

  // ---------------------------------------------------------------- bots
  private manageBots(by: Player, msg: { action: 'add' | 'fill' | 'clear'; count?: number }): void {
    const ws = this.sockets.get(by.id);
    if (by.id !== this.hostId) { if (ws) send(ws, { t: 'error', code: 'not_host', message: 'Only the host can add or remove random players' }); return; }
    if (this.engine.phase !== 'lobby') { if (ws) send(ws, { t: 'error', code: 'not_lobby', message: 'Random players can be changed in the lobby only' }); return; }
    if (msg.action === 'clear') { this.removeBots(Infinity); return; }
    const free = MAX_PLAYERS - this.players.size;
    const want = msg.action === 'fill' ? free
      : Math.max(1, Math.min(BOT_LIMITS.addStep, Number.isInteger(msg.count) ? Number(msg.count) : BOT_LIMITS.addStep));
    this.addBots(Math.min(free, want));
  }

  private addBots(n: number): void {
    if (n <= 0) return;
    const names = botNames(this.botSeed ^ this.nextId, n, [...this.players.values()].map((p) => p.name));
    for (const name of names) {
      const p = this.newPlayer(name, undefined, makeBot(this.botSeed ^ Math.imul(this.nextId, 2654435761)));
      this.players.set(p.id, p);
      this.match?.ensure({ ...p, bot: true });
    }
    this.broadcast({ t: 'roster', roster: this.roster() });
    this.broadcastSnapshot();
    console.log(JSON.stringify({ ev: 'bots_add', room: this.roomCode, added: names.length, bots: this.botCount(), n: this.players.size }));
  }

  /** Removes up to n bots, newest first. */
  private removeBots(n: number): void {
    const bots = [...this.players.values()].filter((p) => p.bot).sort((a, b) => b.joinOrder - a.joinOrder).slice(0, n);
    for (const b of bots) { this.players.delete(b.id); if (!this.matchRunning) this.match?.forget(b.id); }
    if (bots.length) {
      this.broadcast({ t: 'roster', roster: this.roster() });
      console.log(JSON.stringify({ ev: 'bots_remove', room: this.roomCode, removed: bots.length, bots: this.botCount(), n: this.players.size }));
    }
  }

  private respawn(p: Player): void {
    const s = this.geo.spawns.find((x) => x.index === p.spawn) ?? this.geo.spawns[0];
    Object.assign(p, { x: s.x, z: s.z, vx: 0, vz: 0, yaw: s.yaw, status: 'active', finishTime: -1, spotTime: -1, firstMoveAt: null, downUntil: 0, immuneUntil: 0 });
  }

  private toBench(p: Player, status: 'waiting'): void {
    const seats = [...this.players.values()].filter((x) => x.status === 'waiting').length;
    const b = this.geo.benches[seats % Math.max(1, this.geo.benches.length)];
    Object.assign(p, b ? { x: b.x, z: b.z } : {}, { vx: 0, vz: 0, status });
  }

  private roundPlayers(): Player[] {
    return [...this.players.values()].filter((p) => p.status !== 'waiting');
  }

  private roster(): RosterEntry[] {
    return [...this.players.values()].map((p) => ({ id: p.id, name: p.name, spawn: p.spawn, ready: p.ready, colorway: p.colorway, ...(p.bot ? { bot: true } : {}), ...(p.away ? { away: true } : {}) }));
  }

  /** Loads one stage's geometry and obstacles into this room and gives it a fresh round engine (09 A1/A2). */
  private loadStage(stageId: string): void {
    const def = getStage(stageId);
    this.geo = def.geometry;
    // Stage 01's barricades and gate belong to Stage 01 only (intelligence doc 09, F4).
    this.obstacles = def.rules === 'red_light_green_light' ? resolveObstacles(this.geo) : null;
    this.gapRows = obstacleGapRows(this.obstacles, this.geo);
    // A new engine per stage: no timer, role, capture or hiding state carries over (09 F2).
    this.engine = def.rules === 'hide_and_hunt' && def.hunt ? new HuntEngine(def.hunt.layout) : new RoundEngine(this.geo);
    this.engine.now = this.elapsed;
  }

  private matchState(): MatchState {
    const m = this.match;
    if (!m) return { stage: 0, total: 0, final: false };
    return { stage: m.index + 1, total: m.total, final: m.isFinal };
  }

  /** Host starts a match: every stage in MATCH order, points accumulated, everyone plays every stage. */
  private startMatch(by: Player, opts: StartRequestOptions = {}): void {
    if (by.id !== this.hostId) {
      const ws = this.sockets.get(by.id);
      if (ws) send(ws, { t: 'error', code: 'not_host', message: 'Only the host can start the game' });
      return;
    }
    if (this.engine.phase !== 'lobby') return;
    this.beginMatch(opts);
  }

  /**
   * Host restarts the match while it is running or from the final results (owner request, 25 Nov 2026):
   * a fresh match from stage 1, points reset, every player in the room plays (spectators too), bots kept.
   */
  private restartMatch(by: Player): void {
    if (by.id !== this.hostId) {
      const ws = this.sockets.get(by.id);
      if (ws) send(ws, { t: 'error', code: 'not_host', message: 'Only the host can restart the game' });
      return;
    }
    if (this.engine.phase === 'lobby') return;
    console.log(JSON.stringify({ ev: 'restart', room: this.roomCode, round: this.roundId, phase: this.engine.phase, match: this.matchState() }));
    for (const p of this.players.values()) this.respawn(p);
    this.beginMatch(this.matchOpts);
  }

  /**
   * Host restarts the stage in progress (owner, 25 Nov 2026: "on stage 2, restart should restart stage 2"). Points
   * from earlier stages stay; this stage's points are only added when it ends, so nothing is counted twice. From
   * the stage results the whole match restarts instead (that stage's points are already in).
   */
  private restartStage(by: Player): void {
    if (by.id !== this.hostId) {
      const ws = this.sockets.get(by.id);
      if (ws) send(ws, { t: 'error', code: 'not_host', message: 'Only the host can restart the stage' });
      return;
    }
    if (!this.match || !['briefing', 'countdown', 'active'].includes(this.engine.phase)) { this.restartMatch(by); return; }
    console.log(JSON.stringify({ ev: 'restart_stage', room: this.roomCode, round: this.roundId, phase: this.engine.phase, match: this.matchState() }));
    for (const p of this.players.values()) this.respawn(p);
    this.startStage();
  }

  private beginMatch(opts: StartRequestOptions): void {
    const test = this.env.CN_TEST === '1';
    const stages = test && Number.isInteger(opts?.stages) ? Number(opts.stages) : MATCH.stages;
    // Players who dropped out of the previous match and never came back leave now.
    for (const p of [...this.players.values()]) if (p.away) { this.players.delete(p.id); this.match?.markLeft(p.id); }
    this.match = new Match(matchOrder(stages));
    if (typeof opts?.startStage === 'string') this.match.startAt(opts.startStage);
    for (const p of this.players.values()) this.match.ensure({ ...p, bot: !!p.bot });
    this.matchRunning = true;
    this.matchOpts = opts ?? {};
    this.startStage();
  }

  /** Starts the match's current stage with every player in the room (late joiners included). */
  private startStage(): void {
    this.paused = false;
    const m = this.match!;
    const opts = this.matchOpts;
    const test = this.env.CN_TEST === '1';
    // Each stage gets its own seed; test rooms get seed, seed+1, ... so tests stay deterministic.
    const seed = test && Number.isInteger(opts?.seed) ? Number(opts.seed) + m.index : crypto.getRandomValues(new Uint32Array(1))[0];
    const roundS = test && typeof opts?.roundS === 'number' ? Math.max(5, Math.min(300, opts.roundS)) : undefined;
    // Waiting players (late joiners) play this stage; players kept for a reconnect play it too (they stand still).
    // A later stage keeps the short briefing only when its rules were already explained (a replay of Stage 01).
    const seenRules = m.order.slice(0, m.index).includes(m.stageId);
    const briefingS = test && typeof opts?.briefingS === 'number' ? Math.max(0, Math.min(15, opts.briefingS)) : (seenRules ? MATCH.nextBriefingS : undefined);
    const resultsS = test && typeof opts?.resultsS === 'number' ? Math.max(1, Math.min(60, opts.resultsS)) : (m.isFinal ? MATCH.finalResultsS : MATCH.stageResultsS);
    this.loadStage(m.stageId);
    const players = [...this.players.values()];
    for (const p of players) {
      p.vx = 0; p.vz = 0; p.queue = []; p.firstMoveAt = null; p.ready = !!p.bot;
      if (p.bot) resetBot(p.bot);
      m.ensure({ ...p, bot: !!p.bot });
    }
    this.roundId++;
    // Obstacles are always on (decision 031); only test rooms may switch them off (walk-timing and rollback tests).
    const obstacles = !(test && (opts?.obstacles === false || this.plainCourse()));
    this.engine.start(players, { seed, roundS, briefingS, resultsS, mode: 'standup', obstacles });
    for (const p of players) p.yaw = 0;
    console.log(JSON.stringify({ ev: 'stage_start', room: this.roomCode, round: this.roundId, stage: this.geo.stage, match: this.matchState(), seed, players: players.length, bots: this.botCount(),
      schedule: this.engine.schedule.slice(0, 12).map((s) => [s.signal[0], s.start, s.end]) }));
    this.broadcast({ t: 'roster', roster: this.roster() });
    this.broadcastSnapshot();
  }

  /** Test rooms named plain-* (CN_TEST=1 only) have no obstacles, for the straight-line walk-timing test. */
  private plainCourse(): boolean {
    return this.env.CN_TEST === '1' && this.roomCode.startsWith('plain-');
  }

  /** Obstacles collide in the lobby and in every round (decision 031), unless a test switched them off. */
  private obstaclesActive(): boolean {
    if (!this.obstacles) return false;
    return this.engine.phase === 'lobby' ? !this.plainCourse() : this.engine.obstacles;
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
      stage: this.geo.stage,
      mode: e.mode,
      target: Number.isFinite(e.target) ? e.target : -1,
      obstacles: this.obstaclesActive(),
      match: this.matchState(),
      ...(this.paused ? { paused: true } : {}),
      ...(this.hunt() ? { hunt: this.hunt()!.publicState() } : {}),
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
    this.lastTickAt = 0;
    this.acc = 0;
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

  /**
   * Fixed-timestep loop on real time: the timer fires about 30 times a second, but the number of 1/30 s
   * simulation steps comes from the wall clock. Worker timers drift slightly slow; counting ticks instead
   * would let input queues build up, so a player who stopped in time could have old movement applied
   * during a red light.
   */
  private tick(): void {
    const now = Date.now();
    if (!this.lastTickAt) this.lastTickAt = now - 1000 / SIM_HZ;
    this.acc = Math.min(this.acc + (now - this.lastTickAt) / 1000, 0.25);
    this.lastTickAt = now;
    if (this.paused) {
      // Paused: nothing runs. Inputs sent meanwhile are acknowledged and dropped, so nobody moves on resume.
      if (this.engine.phase === 'lobby' || this.engine.phase === 'results') this.paused = false;
      else {
        this.acc = 0;
        for (const p of this.players.values()) if (p.queue.length) { p.ack = p.queue[p.queue.length - 1].seq; p.queue = []; }
        return;
      }
    }
    let steps = 0;
    while (this.acc >= SIM_DT && steps < 8) {
      this.acc -= SIM_DT;
      this.simStep();
      steps++;
    }
  }

  private simStep(): void {
    const t0 = performance.now();
    this.elapsed += SIM_DT;
    const before = this.engine.phase;
    const ev = this.engine.tick(this.elapsed, this.roundPlayers());
    this.handlePhase(before, ev);
    const e = this.engine; // a new stage may have replaced the engine in handlePhase
    const moveEv: RoundEvents = { spotted: [], finished: [] };
    // Stage 1.5: the barricades and the sliding gate (at the current green time) collide like walls for every
    // player. In the lobby the gate rests at its start position (no green time yet); in a round it slides on green only.
    const gt = e.phase === 'active' ? greenTime(e.schedule, Math.max(0, this.elapsed - e.goTime)) : 0;
    const base: Rect[] = this.obstaclesActive() && this.obstacles ? [...this.geo.walls, ...obstacleWalls(this.obstacles, gt)] : this.geo.walls;
    const extra = e.extraWalls?.() ?? [];
    const walls: Rect[] = extra.length ? [...base, ...extra] : base;
    const h = this.hunt();
    if (this.botCount() > 0) { if (h) this.driveHuntBots(h); else this.driveBots(gt); }
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
        h?.applyFlags(p, m.k ?? 0, input.mx !== 0 || input.mz !== 0);
        const next = step(p, input, SIM_DT, walls, e.speedScale?.(p) ?? 1);
        p.x = next.x; p.z = next.z; p.vx = next.vx; p.vz = next.vz;
        if (typeof m.yaw === 'number' && Number.isFinite(m.yaw)) p.yaw = m.yaw;
        if (e.phase === 'lobby') this.practiceFinish(p, input);
        else e.afterMove(p, p.x - ox, p.z - oz, SIM_DT, moveEv);
      }
    }
    // Player-to-player collisions (server authority, same code for humans and bots). In the lobby everyone on the
    // yard collides; in a round only contestants still racing (finished, spotted and waiting players are out of play).
    const racing = e.phase === 'lobby' ? [...this.players.values()].filter((p) => p.status !== 'waiting')
      : e.phase === 'active' ? [...this.players.values()].filter((p) => p.status === 'active' && !h?.isHidden(p.id)) : [];
    const knocks = racing.length > 1 ? resolvePlayerContacts(racing, this.elapsed, walls) : [];
    const at = Math.round((this.elapsed - e.goTime) * 1000) / 1000;
    for (const id of moveEv.spotted) this.broadcast({ t: 'event', kind: 'spotted', id, at });
    for (const id of moveEv.finished) this.broadcast({ t: 'event', kind: 'finished', id, at });
    for (const [id, by] of ev.captured ?? []) {
      this.broadcast({ t: 'event', kind: 'captured', id, other: by, at });
      console.log(JSON.stringify({ ev: 'captured', room: this.roomCode, round: this.roundId, id, by, at }));
    }
    for (const k of knocks) {
      this.broadcast({ t: 'event', kind: 'collision', id: k.a, other: k.b, at });
      this.stats.knockdowns++;
    }
    const ms = performance.now() - t0;
    const s = this.stats;
    s.ticks++; s.totalMs += ms; s.maxMs = Math.max(s.maxMs, ms);
    s.recent.push(ms); if (s.recent.length > 3000) s.recent.shift();
  }

  /** Queues one input per bot per tick, through the same token bucket and movement code as human inputs. */
  private driveBots(gateGreenTime: number): void {
    const e = this.engine;
    const sinceGo = this.elapsed - e.goTime;
    const seg = e.phase === 'active' ? segmentAt(e.schedule, sinceGo) : null;
    const signal = e.signal();
    const others = [...this.players.values()].filter((p) => p.status === 'active').map((p) => ({ x: p.x, z: p.z }));
    for (const p of this.players.values()) {
      if (!p.bot) continue;
      const mv = botInput(p.bot, {
        now: this.elapsed, phase: e.phase, signal, into: seg ? sinceGo - seg.start : 0, segStart: seg?.start ?? -1, gateGreenTime,
        x: p.x, z: p.z, status: p.status, down: p.downUntil > this.elapsed, others,
      }, this.geo, this.gapRows, this.obstaclesActive() ? this.obstacles : null);
      if (p.queue.length < 4) p.queue.push({ seq: p.ack + p.queue.length + 1, mx: mv.mx, mz: mv.mz, yaw: Math.atan2(-mv.mx, -mv.mz) || 0 });
    }
  }

  /**
   * The Hunt bots: each thinks at 10 Hz (a third of them per tick) from what it may perceive (huntSenses), sends its
   * actions through the same engine methods as a human's messages, and queues its move like a human input.
   */
  private driveHuntBots(h: HuntEngine): void {
    const nav = getStage(this.geo.stage).hunt?.nav;
    if (!nav) return;
    const bodies = this.roundPlayers();
    const tickNo = Math.round(this.elapsed * SIM_HZ);
    let i = 0;
    for (const p of this.players.values()) {
      if (!p.bot) continue;
      i++;
      if (!p.botMove || (tickNo + i) % 3 === 0) {
        const priv = h.privateState(p.id);
        const act = huntBotInput(p.bot, p as HuntBody, priv, huntSenses(h, p as HuntBody, bodies, p.bot.rand), h, nav, this.elapsed);
        if (h.phase === 'active') {
          if (act.pulse) h.pulse(p, bodies);
          if (act.hide) h.toggleHide(p, bodies);
          h.setCapture(p, !!act.capture);
        }
        p.botMove = { mx: act.mx, mz: act.mz, yaw: act.yaw, k: act.flags };
      }
      const mv = p.botMove;
      if (p.queue.length < 4) p.queue.push({ seq: p.ack + p.queue.length + 1, mx: mv.mx, mz: mv.mz, yaw: mv.yaw, k: mv.k });
    }
  }

  /** Lobby practice walk (walk test): time from the first move to the finish line. */
  private practiceFinish(p: Player, input: { mx: number; mz: number }): void {
    if (p.firstMoveAt === null && (input.mx !== 0 || input.mz !== 0)) p.firstMoveAt = this.elapsed - SIM_DT;
    if (p.status === 'active' && insideRect(this.geo.finish, p.x, p.z)) {
      p.status = 'finished';
      p.finishTime = p.firstMoveAt === null ? 0 : Math.round((this.elapsed - p.firstMoveAt) * 1000) / 1000;
    }
  }

  private handlePhase(before: string, ev: RoundEvents): void {
    if (!ev.phase || ev.phase === before) return;
    const m = this.match;
    if (ev.results && m) {
      // Results are frozen here and recorded in the match exactly once per round (no duplicate awards).
      const refs = [...this.players.values()].map((p) => ({ id: p.id, name: p.name, joinOrder: p.joinOrder, bot: !!p.bot }));
      const scores = m.record(this.roundId, ev.results, refs);
      if (scores) {
        const byId = new Map(scores.map((x) => [x.id, x]));
        const placings = ev.results.map((r) => {
          const pl = this.players.get(r.id);
          return { ...r, name: pl?.name ?? r.id, points: byId.get(r.id)?.points ?? 0, first: !!byId.get(r.id)?.first, ...(pl?.bot ? { bot: true } : {}) };
        });
        const standings = m.standings();
        this.broadcast({ t: 'results', roundId: this.roundId, stage: this.geo.stage, mode: this.engine.mode, placings, match: this.matchState(), standings });
        console.log(JSON.stringify({ ev: 'results', room: this.roomCode, round: this.roundId, stage: this.geo.stage, match: this.matchState(),
          seed: this.engine.seed, placings: placings.map((p) => [p.place, p.id, p.status, p.finishTime, p.points]),
          leader: standings[0] ? [standings[0].id, standings[0].points] : null }));
      }
    }
    if (ev.phase === 'lobby') {
      // Results are over: the next stage of the match, or back to the lobby after the final leaderboard.
      if (m && this.matchRunning && m.advance()) {
        for (const p of this.players.values()) this.respawn(p);
        this.startStage();
        return;
      }
      this.matchRunning = false;
      for (const p of [...this.players.values()]) if (p.away) { this.players.delete(p.id); m?.markLeft(p.id); }
      if (this.geo.stage !== DEFAULT_STAGE_ID) this.loadStage(DEFAULT_STAGE_ID); // the lobby is always the Stage 01 yard
      for (const p of this.players.values()) this.respawn(p); // waiting players join in for the next match
      this.broadcast({ t: 'roster', roster: this.roster() });
    }
    this.broadcastSnapshot();
  }

  private broadcastSnapshot(): void {
    const all = [...this.players.values()];
    const rows = all.map((p) => encodeRow(p.id, p, downLeft(p, this.elapsed)));
    const time = Math.round(this.elapsed * 1000) / 1000;
    const round = this.roundState();
    const h = this.hunt();
    if (!h || h.phase === 'lobby') {
      const text = JSON.stringify({ t: 'snap', time, rows, round } satisfies ServerMessage);
      this.stats.snaps++; this.stats.snapBytes += text.length;
      for (const ws of this.sockets.values()) sendRaw(ws, text);
      return;
    }
    // The Hunt: each player gets only the rows they may see and their own private state (anti-wallhack, v8).
    const visible = new Map<string, SnapRow[]>();
    for (const [pid, ws] of this.sockets) {
      const viewer = this.players.get(pid);
      if (!viewer) continue;
      let mine = visible.get(pid);
      if (!mine) { mine = []; for (let k = 0; k < all.length; k++) if (h.visibleTo(viewer, all[k])) mine.push(rows[k]); visible.set(pid, mine); }
      const text = JSON.stringify({ t: 'snap', time, rows: mine, round, me: h.privateState(pid) ?? undefined, all: false } satisfies ServerMessage);
      this.stats.snaps++; this.stats.snapBytes += text.length;
      sendRaw(ws, text);
    }
  }

  private broadcast(msg: ServerMessage): void {
    const text = JSON.stringify(msg);
    for (const ws of this.sockets.values()) sendRaw(ws, text);
  }

  private health(room: string) {
    const sorted = [...this.stats.recent].sort((a, b) => a - b);
    const pct = (q: number) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] : 0);
    return {
      ok: true, room, players: this.players.size, humans: this.humanCount(), bots: this.botCount(), running: !!this.tickTimer, phase: this.engine.phase,
      match: this.matchState(), knockdowns: this.stats.knockdowns,
      snapshot: { count: this.stats.snaps, avgBytes: this.stats.snaps ? Math.round(this.stats.snapBytes / this.stats.snaps) : 0 },
      ticks: this.stats.ticks,
      tickMs: { avg: this.stats.ticks ? +(this.stats.totalMs / this.stats.ticks).toFixed(3) : 0, p95: +pct(0.95).toFixed(3), max: +this.stats.maxMs.toFixed(3) },
      inputs: { accepted: this.stats.accepted, dropped: this.stats.dropped },
    };
  }
}

function send(ws: WebSocket, msg: ServerMessage): void { sendRaw(ws, JSON.stringify(msg)); }
function sendRaw(ws: WebSocket, text: string): void { try { ws.send(text); } catch { /* closing */ } }
