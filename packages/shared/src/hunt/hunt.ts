// Stage 03 · THE HUNT rules engine (asymmetrical hide-and-hunt). Pure and deterministic for a seed, owned by the
// room (server authority), unit tested here. The room calls the same methods for humans and bots:
//   start(players, opts)          roles (seeded), spawns, briefing
//   applyFlags(p, flags)          crouch / sprint request from the player's input
//   pulse(p, players)             Pulse Detector (hunters): returns a direction sector and a strength bucket only
//   setCapture(p, holding)        hold E (hunters)
//   toggleHide(p, players)        enter / leave a hiding place (hiders)
//   tick(now, players)            phases, head start, captures, hide timers, threat levels, early end, results
// Nothing here trusts a client: capture, hiding, pulses and points are all decided from server positions.
import { insideRect, type Rect } from '../stage.ts';
import { rng, shuffled, ROUND, type Phase, type Placing, type RoundEvents, type RoundPlayer, type Signal, type SignalSegment, type StartOptions } from '../round.ts';
import type { Mode } from '../tournament.ts';
import type { StageEngine } from '../engine.ts';
import { HUNT, hunterCount, type HuntRole } from './config.ts';
import { lineOfSight, pathAttenuation } from './los.ts';
import type { HideSpot, HuntLayout, HuntWall } from './layout.ts';

/** A player as the hunt sees it: room players carry their facing (camera yaw) too. */
export interface HuntBody extends RoundPlayer { yaw: number; vx?: number; vz?: number }

export interface PulseReading {
  /** 0 none, 1 weak, 2 medium, 3 strong. */
  strength: 0 | 1 | 2 | 3;
  /** Compass sector of the strongest signal (0 = -Z / "north", clockwise in yaw steps of 360/sectors), or -1. */
  sector: number;
  /** Room time of the pulse. */
  at: number;
  /** Increments with every pulse (the client plays the sound once per reading). */
  n: number;
}

export interface HuntState {
  role: HuntRole;
  captured: boolean;
  capturedAt: number;
  capturedBy: string;
  captures: number;
  hideId: string | null;
  hideUntil: number;
  hideCdUntil: number;
  sprintUntil: number;
  sprintCdUntil: number;
  crouch: boolean;
  pulseCdUntil: number;
  pulse: PulseReading | null;
  holding: boolean;
  capTarget: string | null;
  capProgress: number;
  threat: 0 | 1 | 2;
  /** Last movement was noisy (walking or sprinting, not crouching): hunter bots can hear it up close. */
  noisy: boolean;
}

/** What one player may know about their own stage state (sent only to them). */
export interface HuntPrivate {
  role: HuntRole;
  captured: boolean;
  captures: number;
  /** Id of the hiding place you are in (only you learn it), or null. */
  hide: string | null;
  hideLeft: number;
  hideCd: number;
  sprintLeft: number;
  sprintCd: number;
  pulseCd: number;
  pulse: PulseReading | null;
  /** Capture hold progress 0..1 (hunters). */
  capture: number;
  /** 0 calm, 1 a hunter is near, 2 danger (hiders). */
  threat: 0 | 1 | 2;
}

/** Public stage state (everyone). Never contains a hider's position or hiding place. */
export interface HuntPublic {
  released: boolean;
  /** Seconds of head start left (0 once the gates open). */
  headStartLeft: number;
  hunters: string[];
  hiders: number;
  hidersLeft: number;
  captured: number;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

export class HuntEngine implements StageEngine {
  readonly rules = 'hide_and_hunt' as const;
  phase: Phase = 'lobby';
  phaseStart = 0;
  phaseEnd = Infinity;
  now = 0;
  seed = 0;
  mode: Mode = 'standup';
  target = Infinity;
  obstacles = false;
  goTime = 0;
  schedule: SignalSegment[] = [];
  lastResults: Placing[] = [];
  skipped = new Set<string>();
  resultsS: number = ROUND.resultsS;
  headStartS: number = HUNT.headStartS;
  huntS: number = HUNT.huntS;
  /** Per-player stage state, kept by id (a reconnecting player gets theirs back). */
  readonly state = new Map<string, HuntState>();
  private lastNow = 0;
  private rand: () => number = rng(1);
  private pulseCount = 0;
  private readonly spotById: Map<string, HideSpot>;
  private readonly staticWalls: HuntWall[];

  constructor(readonly layout: HuntLayout) {
    this.spotById = new Map(layout.hideSpots.map((s) => [s.id, s]));
    this.staticWalls = layout.walls;
  }

  private setPhase(p: Phase, duration: number): void {
    this.phase = p; this.phaseStart = this.now; this.phaseEnd = this.now + duration;
  }

  get released(): boolean { return this.phase === 'active' && this.now >= this.goTime + this.headStartS; }

  /** Walls that block movement and sight right now: the facility, plus the hunter gates until release. */
  wallsNow(): HuntWall[] { return this.released || this.phase === 'lobby' ? this.staticWalls : [...this.staticWalls, ...this.layout.gates]; }
  extraWalls(): Rect[] { return this.released || this.phase === 'lobby' ? [] : this.layout.gates; }

  /**
   * Roles: hunterCount = clamp(round(n * 0.2), 1, n - 1), picked by a seeded shuffle of every participant (humans and
   * bots alike). Hunters start in the staging room, hiders in four separate pockets. Begins the briefing.
   */
  start(players: RoundPlayer[], opts: StartOptions): Map<string, number> {
    this.seed = opts.seed >>> 0;
    this.rand = rng(this.seed ^ 0x2b1d);
    this.resultsS = opts.resultsS ?? ROUND.resultsS;
    // Test rooms may shorten the stage: roundS is the active phase (head start + hunt), scaled proportionally.
    if (typeof opts.roundS === 'number') {
      const total = HUNT.headStartS + HUNT.huntS;
      this.headStartS = Math.max(1, Math.round((HUNT.headStartS * opts.roundS) / total * 10) / 10);
      this.huntS = Math.max(2, opts.roundS - this.headStartS);
    }
    this.mode = opts.mode === 'tournament' ? 'tournament' : 'standup';
    this.lastResults = []; this.skipped.clear(); this.state.clear(); this.pulseCount = 0;
    const order = shuffled(players.map((p) => p.id), this.seed);
    const nHunters = hunterCount(players.length);
    const hunters = new Set(order.slice(0, nHunters));
    const spawnOf = new Map<string, number>();
    let h = 0, k = 0;
    const byId = new Map(players.map((p) => [p.id, p]));
    for (const id of order) {
      const p = byId.get(id)!;
      const role: HuntRole = hunters.has(id) ? 'hunter' : 'hider';
      const s = role === 'hunter' ? this.layout.hunterSpawns[h++ % this.layout.hunterSpawns.length] : this.layout.hiderSpawns[k++ % this.layout.hiderSpawns.length];
      const index = role === 'hunter' ? this.layout.hiderSpawns.length + s.index : s.index;
      Object.assign(p, { spawn: index, x: s.x, z: s.z, status: 'active', finishTime: -1, spotTime: -1, redDisp: 0, recent: [], downUntil: 0, immuneUntil: 0 });
      spawnOf.set(id, index);
      this.state.set(id, newState(role));
    }
    this.setPhase('briefing', opts.briefingS ?? ROUND.briefingS);
    return spawnOf;
  }

  /** A player who joins mid-stage has no role: they watch (the room benches them as 'waiting'). */
  roleOf(id: string): HuntRole | null { return this.state.get(id)?.role ?? null; }
  isHidden(id: string): boolean { return !!this.state.get(id)?.hideId; }
  hunters(): string[] { return [...this.state].filter(([, s]) => s.role === 'hunter').map(([id]) => id); }

  skip(id: string, playerIds: string[]): void {
    if (this.phase !== 'briefing') return;
    this.skipped.add(id);
    if (playerIds.every((x) => this.skipped.has(x))) this.phaseEnd = Math.min(this.phaseEnd, this.now);
  }

  signal(): Signal { return 'none'; }

  canMove(p: RoundPlayer): boolean {
    if (p.downUntil > this.now) return false;
    if (this.phase === 'lobby') return true;
    if (this.phase !== 'active') return false;
    const s = this.state.get(p.id);
    if (!s || s.captured || s.hideId) return false;
    return p.status === 'active';
  }

  speedScale(p: RoundPlayer): number {
    const s = this.state.get(p.id);
    if (!s || this.phase !== 'active') return 1;
    if (s.sprintUntil > this.now) return HUNT.sprint.speed;
    if (s.crouch) return HUNT.crouch.speed;
    return 1;
  }

  /** Input flags from the player's movement message: bit 1 crouch held, bit 2 sprint requested. */
  applyFlags(p: RoundPlayer, flags: number, moving: boolean): void {
    const s = this.state.get(p.id);
    if (!s || this.phase !== 'active' || s.captured) return;
    s.crouch = (flags & 1) === 1;
    if ((flags & 2) && this.now >= s.sprintCdUntil && !s.hideId && moving) {
      s.sprintUntil = this.now + HUNT.sprint.burstS;
      s.sprintCdUntil = this.now + HUNT.sprint.burstS + HUNT.sprint.cooldownS;
    }
    s.noisy = moving && !s.crouch;
  }

  afterMove(): void { /* captures and timers run in tick(); nothing depends on a single step */ }

  /**
   * Pulse Detector. Hunters only, after release, every cooldownS. Every hider within range contributes a signal
   * (1 - d / range) x wall attenuation (x hidden / crouch factors); the strongest one is reported as a strength
   * bucket and a jittered compass sector. Never a position, an id, or a count.
   */
  pulse(p: HuntBody, players: HuntBody[]): PulseReading | null {
    const s = this.state.get(p.id);
    if (!s || s.role !== 'hunter' || !this.released || this.now < s.pulseCdUntil || p.downUntil > this.now) return null;
    const cfg = HUNT.pulse;
    s.pulseCdUntil = this.now + cfg.cooldownS;
    const walls = this.wallsNow();
    let best = 0, bx = 0, bz = 0;
    for (const o of players) {
      const t = this.state.get(o.id);
      if (!t || t.role !== 'hider' || t.captured || o.status !== 'active') continue;
      const d = Math.hypot(o.x - p.x, o.z - p.z);
      if (d >= cfg.rangeM) continue;
      // A hidden hider's signal starts at the prop's front, so the prop itself does not count as a wall.
      const spot = t.hideId ? this.spotById.get(t.hideId) : undefined;
      const sx = spot ? spot.fx : o.x, sz = spot ? spot.fz : o.z;
      const att = pathAttenuation(p.x, p.z, sx, sz, walls, cfg.maxWalls).factor;
      const sig = (1 - d / cfg.rangeM) * att * (t.hideId ? cfg.hiddenFactor : 1) * (t.crouch ? HUNT.crouch.pulseFactor : 1);
      if (sig > best) { best = sig; bx = o.x; bz = o.z; }
    }
    const strength: PulseReading['strength'] = best >= cfg.strong ? 3 : best >= cfg.medium ? 2 : best >= cfg.weak ? 1 : 0;
    let sector = -1;
    if (strength > 0) {
      const step = (Math.PI * 2) / cfg.sectors;
      const yaw = Math.atan2(-(bx - p.x), -(bz - p.z)) + ((this.rand() * 2 - 1) * cfg.jitterDeg * Math.PI) / 180;
      sector = ((Math.round(yaw / step) % cfg.sectors) + cfg.sectors) % cfg.sectors;
    }
    s.pulse = { strength, sector, at: r2(this.now), n: ++this.pulseCount };
    return s.pulse;
  }

  /** Hunter holds (or releases) E. Progress is worked out every tick from server positions. */
  setCapture(p: RoundPlayer, holding: boolean): void {
    const s = this.state.get(p.id);
    if (!s || s.role !== 'hunter') return;
    s.holding = !!holding;
    if (!s.holding) { s.capTarget = null; s.capProgress = 0; }
  }

  /** Hider presses E: enter the nearest free hiding place in reach, or leave the one you are in. */
  toggleHide(p: HuntBody, players: HuntBody[]): 'entered' | 'left' | null {
    const s = this.state.get(p.id);
    if (!s || s.role !== 'hider' || s.captured || this.phase !== 'active') return null;
    if (s.hideId) { this.leaveHide(p, s); return 'left'; }
    if (this.now < s.hideCdUntil || p.downUntil > this.now || p.status !== 'active') return null;
    let best: HideSpot | null = null, bd: number = HUNT.hide.enterDistM;
    for (const spot of this.layout.hideSpots) {
      const d = Math.hypot(spot.fx - p.x, spot.fz - p.z);
      if (d > bd) continue;
      if (this.occupancy(spot.id) >= spot.capacity) continue;
      best = spot; bd = d;
    }
    if (!best) return null;
    s.hideId = best.id;
    s.hideUntil = this.now + HUNT.hide.maxS;
    s.sprintUntil = 0;
    Object.assign(p, { x: best.x, z: best.z, vx: 0, vz: 0 });
    void players;
    return 'entered';
  }

  occupancy(spotId: string): number {
    let n = 0;
    for (const s of this.state.values()) if (s.hideId === spotId) n++;
    return n;
  }

  private leaveHide(p: RoundPlayer, s: HuntState): void {
    const spot = s.hideId ? this.spotById.get(s.hideId) : undefined;
    s.hideId = null;
    s.hideCdUntil = this.now + HUNT.hide.cooldownS;
    if (spot) Object.assign(p, { x: spot.fx, z: spot.fz, vx: 0, vz: 0 });
  }

  tick(now: number, players: RoundPlayer[]): RoundEvents {
    const dt = Math.max(0, now - (this.lastNow || now));
    this.lastNow = now;
    this.now = now;
    const ev: RoundEvents = { spotted: [], finished: [], captured: [] };
    const bodies = players as HuntBody[];
    if (this.phase === 'active') this.activeTick(dt, bodies, ev);
    if (this.phase === 'lobby' || now < this.phaseEnd) return ev;
    switch (this.phase) {
      case 'briefing': this.setPhase('countdown', ROUND.countdownS); break;
      case 'countdown': this.setPhase('active', this.headStartS + this.huntS); this.goTime = now; break;
      case 'active':
        this.lastResults = this.results(bodies);
        ev.results = this.lastResults;
        this.setPhase('results', this.resultsS);
        break;
      case 'results': this.setPhase('lobby', Infinity); break;
    }
    ev.phase = this.phase;
    return ev;
  }

  private activeTick(dt: number, players: HuntBody[], ev: RoundEvents): void {
    const byId = new Map(players.map((p) => [p.id, p]));
    // Hiding places push players out when their time is up.
    for (const [id, s] of this.state) if (s.hideId && this.now >= s.hideUntil) { const p = byId.get(id); if (p) this.leaveHide(p, s); else s.hideId = null; }
    const released = this.released;
    const walls = this.wallsNow();
    const hunters = players.filter((p) => this.state.get(p.id)?.role === 'hunter');
    // Captures: hold E on the same valid target for holdS. Any broken condition resets the hold.
    for (const h of hunters) {
      const s = this.state.get(h.id)!;
      if (!s.holding || !released || h.downUntil > this.now || h.status !== 'active') { s.capTarget = null; s.capProgress = 0; continue; }
      const target = this.captureTarget(h, players, walls);
      if (!target) { s.capTarget = null; s.capProgress = 0; continue; }
      if (target !== s.capTarget) { s.capTarget = target; s.capProgress = 0; }
      s.capProgress += dt / HUNT.capture.holdS;
      if (s.capProgress >= 1 - 1e-6) {
        const v = byId.get(target)!;
        const vs = this.state.get(target)!;
        if (vs.hideId) this.leaveHide(v, vs);
        vs.captured = true; vs.capturedAt = r2(this.now - this.goTime); vs.capturedBy = h.id; vs.sprintUntil = 0; vs.crouch = false;
        v.status = 'captured';
        Object.assign(v, { vx: 0, vz: 0 });
        s.captures++;
        s.capTarget = null; s.capProgress = 0;
        ev.captured!.push([target, h.id]);
        // Anyone else holding on this hider loses the target (it is no longer eligible).
        for (const o of hunters) { const os = this.state.get(o.id)!; if (os.capTarget === target) { os.capTarget = null; os.capProgress = 0; } }
      }
    }
    // Threat warning for hiders: nearest released hunter, walls ignored, distance bucket only (no direction).
    for (const p of players) {
      const s = this.state.get(p.id);
      if (!s || s.role !== 'hider') continue;
      if (!released || s.captured) { s.threat = 0; continue; }
      let d = Infinity;
      for (const h of hunters) d = Math.min(d, Math.hypot(h.x - p.x, h.z - p.z));
      s.threat = d < HUNT.threat.dangerM ? 2 : d < HUNT.threat.nearM ? 1 : 0;
    }
    // Early end: every hider has been captured (only once there were hiders to catch).
    const hiders = [...this.state.values()].filter((s) => s.role === 'hider');
    if (released && hiders.length > 0 && hiders.every((s) => s.captured)) this.phaseEnd = Math.min(this.phaseEnd, this.now);
  }

  /**
   * The hider a hunter's hold applies to: within capture distance, inside the facing cone of the hunter's camera
   * direction, with clear line of sight. A hidden hider counts through their hiding place's front (searching a
   * locker), measured to the front point.
   */
  captureTarget(h: HuntBody, players: HuntBody[], walls: readonly HuntWall[] = this.wallsNow()): string | null {
    const c = HUNT.capture;
    const fx = -Math.sin(h.yaw), fz = -Math.cos(h.yaw);
    const cosMax = Math.cos((c.facingDeg * Math.PI) / 180);
    let best: string | null = null, bd: number = c.distM;
    for (const o of players) {
      if (o.id === h.id) continue;
      const t = this.state.get(o.id);
      if (!t || t.role !== 'hider' || t.captured || o.status !== 'active') continue;
      const spot = t.hideId ? this.spotById.get(t.hideId) : undefined;
      const px = spot ? spot.fx : o.x, pz = spot ? spot.fz : o.z;
      const d = Math.hypot(px - h.x, pz - h.z);
      if (d > bd) continue;
      // Facing: toward the hider (or toward the hiding prop's centre for a hidden one).
      const ax = (spot ? spot.x : o.x) - h.x, az = (spot ? spot.z : o.z) - h.z;
      const al = Math.hypot(ax, az);
      if (al > 1e-6 && (ax * fx + az * fz) / al < cosMax) continue;
      if (!lineOfSight(h.x, h.z, px, pz, walls)) continue;
      best = o.id; bd = d;
    }
    return best;
  }

  /** Placings and Hunt points (spec §9): survivors 2; captured 0; hunters 1 for one capture, 2 for two or more. */
  results(players: HuntBody[]): Placing[] {
    type Row = { id: string; role: HuntRole; captured: boolean; capturedAt: number; captures: number; joinOrder: number };
    const rows: Row[] = [];
    for (const p of players) {
      const s = this.state.get(p.id);
      if (!s) continue; // joined mid-stage: no role, no row
      rows.push({ id: p.id, role: s.role, captured: s.captured, capturedAt: s.capturedAt, captures: s.captures, joinOrder: p.joinOrder });
    }
    const hunters = rows.filter((r) => r.role === 'hunter').sort((a, b) => b.captures - a.captures || a.joinOrder - b.joinOrder);
    const survivors = rows.filter((r) => r.role === 'hider' && !r.captured).sort((a, b) => a.joinOrder - b.joinOrder);
    const caught = rows.filter((r) => r.role === 'hider' && r.captured).sort((a, b) => b.capturedAt - a.capturedAt || a.joinOrder - b.joinOrder);
    // Hunters and survivors share the top by points; within equal points survivors first, then hunters by captures.
    const scored = [
      ...survivors.map((r) => ({ r, points: 2 })),
      ...hunters.map((r) => ({ r, points: r.captures >= 2 ? 2 : r.captures === 1 ? 1 : 0 })),
      ...caught.map((r) => ({ r, points: 0 })),
    ].sort((a, b) => b.points - a.points);
    return scored.map(({ r, points }, i) => ({
      id: r.id, place: i + 1,
      status: r.role === 'hider' ? (r.captured ? 'captured' : 'finished') : (r.captures > 0 ? 'finished' : 'active'),
      finishTime: -1, progress: 0, qualified: false, points, role: r.role, captures: r.captures,
    }));
  }

  remaining(): number { return Math.max(0, this.phaseEnd - this.now); }

  publicState(): HuntPublic {
    const hiders = [...this.state.values()].filter((s) => s.role === 'hider');
    const captured = hiders.filter((s) => s.captured).length;
    return {
      released: this.released,
      headStartLeft: this.phase === 'active' ? r2(Math.max(0, this.goTime + this.headStartS - this.now)) : this.phase === 'lobby' ? 0 : this.headStartS,
      hunters: this.hunters(),
      hiders: hiders.length,
      hidersLeft: hiders.length - captured,
      captured,
    };
  }

  privateState(id: string): HuntPrivate | null {
    const s = this.state.get(id);
    if (!s) return null;
    const left = (t: number) => r2(Math.max(0, t - this.now));
    return {
      role: s.role, captured: s.captured, captures: s.captures, hide: s.hideId,
      hideLeft: s.hideId ? left(s.hideUntil) : 0, hideCd: left(s.hideCdUntil),
      sprintLeft: left(s.sprintUntil), sprintCd: left(s.sprintCdUntil),
      pulseCd: this.released ? left(s.pulseCdUntil) : left(this.goTime + this.headStartS),
      pulse: s.pulse, capture: r2(Math.min(1, s.capProgress)), threat: s.threat,
    };
  }

  /** Who may see whom in a snapshot (anti-wallhack). Hidden players are never visible to anyone but themselves. */
  visibleTo(viewer: HuntBody, other: HuntBody): boolean {
    if (viewer.id === other.id) return true;
    const vo = this.state.get(other.id);
    if (vo?.hideId) return false;
    const vs = this.state.get(viewer.id);
    // Spectators (captured, late joiners, everyone outside the active phase) see every player not hiding.
    if (!vs || vs.captured || this.phase !== 'active' || !vo) return true;
    if (vs.role === vo.role) return true; // teammates
    if (vo.captured) return true;         // a captured hider is out of play
    const d = Math.hypot(other.x - viewer.x, other.z - viewer.z);
    if (d > HUNT.sightM) return false;
    return lineOfSight(viewer.x, viewer.z, other.x, other.z, this.wallsNow());
  }

  /** Spot data by id (client and bots use the layout directly; this is for tests). */
  spot(id: string): HideSpot | undefined { return this.spotById.get(id); }
  inHunterRoom(p: { x: number; z: number }): boolean { return insideRect(this.layout.hunterRoom, p.x, p.z); }
}

function newState(role: HuntRole): HuntState {
  return {
    role, captured: false, capturedAt: -1, capturedBy: '', captures: 0, hideId: null, hideUntil: 0, hideCdUntil: 0,
    sprintUntil: 0, sprintCdUntil: 0, crouch: false, pulseCdUntil: 0, pulse: null, holding: false, capTarget: null, capProgress: 0,
    threat: 0, noisy: false,
  };
}
