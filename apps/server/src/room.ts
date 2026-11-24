// A CN Trials room: one Cloudflare Durable Object per room (ADR 0002).
// Holds every player's WebSocket, runs the 30 Hz authoritative simulation, the Red Light, Green Light
// round (packages/shared/src/round.ts) and broadcasts snapshots at 20 Hz.
// Stage 01 refinement (24 Nov 2026): multi-stage match with accumulated points (match.ts), server-side bots
// (bots.ts) and player-to-player collisions (collisions.ts), all simulated here for humans and bots alike.
import { DurableObject } from 'cloudflare:workers';
import {
  BOT_LIMITS, CLOSE, DEFAULT_STAGE_ID, INPUT_BURST, INPUT_QUEUE_MAX, MATCH, MAX_MESSAGE_BYTES, MAX_PLAYERS, Match, PROBE_MS, PROTOCOL_VERSION, RoundEngine, SIM_DT,
  SIM_HZ, SNAPSHOT_MS, botInput, botNames, downLeft, encodeRow, getStage, insideRect, makeBot, matchOrder, newRoundPlayer, obstacleGapRows,
  resetBot, resolvePlayerContacts, sanitizeInput, segmentAt,
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
  queue: { seq: number; mx: number; mz: number; yaw: number }[];
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
  private obstacles: ResolvedObstacles = resolveObstacles(this.geo);
  private gapRows: GapRow[] = obstacleGapRows(this.obstacles, this.geo);
  private engine = new RoundEngine(this.geo);
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
    if (!this.canAdmit()) this.rejectFull(server, room);
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
      if (!this.canAdmit()) return this.rejectFull(ws, att.room);
      if (this.players.size >= MAX_PLAYERS) this.removeBots(1); // a human takes a bot's slot (lobby only)
      this.join(ws, att.room, msg.name, sanitizePlayerKey(msg.key));
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
        this.startMatch(p, msg.opts);
        break;
      case 'skip':
        // Bots never need to read the briefing: only humans in the round count.
        this.engine.skip(p.id, this.roundPlayers().filter((x) => !x.bot).map((x) => x.id));
        break;
      case 'bots':
        this.manageBots(p, msg);
        break;
      case 'next':
        // Host: leave the stage results now (next stage, or the lobby after the final leaderboard).
        if (p.id === this.hostId && this.engine.phase === 'results') this.engine.phaseEnd = Math.min(this.engine.phaseEnd, this.engine.now);
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
  private humanCount(): number { return this.players.size - this.botCount(); }

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
    this.players.delete(att.id);
    this.sockets.delete(att.id);
    this.match?.markLeft(att.id); // their points stay on the board
    if (this.humanCount() === 0) {
      // Nobody real is left: bots do not keep a room alive. Reset everything for the next visitor.
      this.players.clear();
      this.hostId = '';
      this.stopLoop();
      this.loadStage(DEFAULT_STAGE_ID);
      this.match = null;
      this.matchRunning = false;
      console.log(JSON.stringify({ ev: 'leave', room: att.room, id: att.id, n: 0, reset: true }));
      return;
    }
    if (this.hostId === att.id) {
      // Host transfer: the earliest remaining human joiner (GDD §6.2); bots never host.
      const next = [...this.players.values()].filter((x) => !x.bot).sort((a, b) => a.joinOrder - b.joinOrder)[0];
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
    return [...this.players.values()].map((p) => ({ id: p.id, name: p.name, spawn: p.spawn, ready: p.ready, colorway: p.colorway, ...(p.bot ? { bot: true } : {}) }));
  }

  /** Loads one stage's geometry and obstacles into this room and gives it a fresh round engine (09 A1/A2). */
  private loadStage(stageId: string): void {
    this.geo = getStage(stageId).geometry;
    this.obstacles = resolveObstacles(this.geo);
    this.gapRows = obstacleGapRows(this.obstacles, this.geo);
    this.engine = new RoundEngine(this.geo);
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
    const test = this.env.CN_TEST === '1';
    const stages = test && Number.isInteger(opts?.stages) ? Number(opts.stages) : MATCH.stages;
    this.match = new Match(matchOrder(stages));
    for (const p of this.players.values()) this.match.ensure({ ...p, bot: !!p.bot });
    this.matchRunning = true;
    this.matchOpts = opts ?? {};
    this.startStage();
  }

  /** Starts the match's current stage with every player in the room (late joiners included). */
  private startStage(): void {
    const m = this.match!;
    const opts = this.matchOpts;
    const test = this.env.CN_TEST === '1';
    // Each stage gets its own seed; test rooms get seed, seed+1, ... so tests stay deterministic.
    const seed = test && Number.isInteger(opts?.seed) ? Number(opts.seed) + m.index : crypto.getRandomValues(new Uint32Array(1))[0];
    const roundS = test && typeof opts?.roundS === 'number' ? Math.max(5, Math.min(300, opts.roundS)) : undefined;
    const briefingS = test && typeof opts?.briefingS === 'number' ? Math.max(0, Math.min(15, opts.briefingS)) : (m.index > 0 ? MATCH.nextBriefingS : undefined);
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
    const walls: Rect[] = this.obstaclesActive() ? [...this.geo.walls, ...obstacleWalls(this.obstacles, gt)] : this.geo.walls;
    if (this.botCount() > 0) this.driveBots(gt);
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
        const next = step(p, input, SIM_DT, walls);
        p.x = next.x; p.z = next.z; p.vx = next.vx; p.vz = next.vz;
        if (typeof m.yaw === 'number' && Number.isFinite(m.yaw)) p.yaw = m.yaw;
        if (e.phase === 'lobby') this.practiceFinish(p, input);
        else e.afterMove(p, p.x - ox, p.z - oz, SIM_DT, moveEv);
      }
    }
    // Player-to-player collisions (server authority, same code for humans and bots). In the lobby everyone on the
    // yard collides; in a round only contestants still racing (finished, spotted and waiting players are out of play).
    const racing = e.phase === 'lobby' ? [...this.players.values()].filter((p) => p.status !== 'waiting')
      : e.phase === 'active' ? [...this.players.values()].filter((p) => p.status === 'active') : [];
    const knocks = racing.length > 1 ? resolvePlayerContacts(racing, this.elapsed, walls) : [];
    const at = Math.round((this.elapsed - e.goTime) * 1000) / 1000;
    for (const id of moveEv.spotted) this.broadcast({ t: 'event', kind: 'spotted', id, at });
    for (const id of moveEv.finished) this.broadcast({ t: 'event', kind: 'finished', id, at });
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
      for (const p of this.players.values()) this.respawn(p); // waiting players join in for the next match
      this.broadcast({ t: 'roster', roster: this.roster() });
    }
    this.broadcastSnapshot();
  }

  private broadcastSnapshot(): void {
    const rows = [...this.players.values()].map((p) => encodeRow(p.id, p, downLeft(p, this.elapsed)));
    const text = JSON.stringify({ t: 'snap', time: Math.round(this.elapsed * 1000) / 1000, rows, round: this.roundState() } satisfies ServerMessage);
    this.stats.snaps++; this.stats.snapBytes += text.length;
    for (const ws of this.sockets.values()) sendRaw(ws, text);
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
