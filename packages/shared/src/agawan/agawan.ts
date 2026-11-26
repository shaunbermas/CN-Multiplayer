// Stage 02 · AGAWAN BASE rules engine: three teams, hearts, prison, rescue and base takeover. Pure and deterministic
// for a seed, owned by the room (server authority), unit tested here. Rules: the handoff pack, changed by decision 047
// (owner's playtest, 26 Nov 2026). The room calls the same methods for humans and bots:
//   start(players, opts)    team spawns (teams come from the lobby's TeamBook via opts.teams), briefing
//   setHold(p, holding)     press / release E. A press hits the nearest opponent in reach (one heart); holding keeps
//                           hitting a little slower. With no opponent in reach, holding next to a captured teammate
//                           frees them.
//   tick(now, players)      phases, hits, rescues, prison timeouts, healing, base takeovers, scoring, results
// Every transition happens inside tick() one player at a time (join order), so two events can never both succeed for
// the same prisoner or base: the first valid one changes the state and the other finds it no longer valid.
import { rng, ROUND, type Phase, type Placing, type RoundEvents, type RoundPlayer, type Signal, type SignalSegment, type StartOptions } from '../round.ts';
import type { Mode } from '../tournament.ts';
import type { StageEngine } from '../engine.ts';
import { TEAM_SLOTS, type TeamSlot } from '../teams.ts';
import { lineOfSight } from '../hunt/los.ts';
import { pushOutOfWalls } from '../movement.ts';
import { AGAWAN } from './config.ts';
import type { AgawanLayout, AgawanWall } from './layout.ts';

/** A player as the engine sees it: room players carry their facing (camera yaw) too. */
export interface AgawanBody extends RoundPlayer { yaw: number; vx?: number; vz?: number }

export interface AgawanState {
  team: TeamSlot;
  hp: number;
  /** Pen (owning team) holding this player, or null when free. */
  pen: TeamSlot | null;
  slot: number;
  /** Room time the player was captured (no automatic release, decision 049: only a rescue frees them). */
  penSince: number;
  protectUntil: number;
  /** Room time of this player's last hit (cooldown) and of the next automatic hit while E stays held. */
  lastHitAt: number;
  nextRepeatAt: number;
  holding: boolean;
  /** A press not yet used (consumed by the next tick, so a quick tap between ticks still counts). */
  pressed: boolean;
  /** Rescue in progress: on whom and 0..1. */
  rescue: { target: string; progress: number } | null;
  healAcc: number;
  // individual stats (secondary board)
  hits: number;
  tags: number;
  rescues: number;
  bases: number;
  captured: number;
}

/** What one player may know about their own stage state (sent only to them). */
export interface AgawanPrivate {
  team: TeamSlot;
  hp: number;
  /** Pen holding you (an opponent's slot), or null. */
  pen: TeamSlot | null;
  /** Seconds you have been in the pen (there is no release timer: a teammate must rescue you). */
  heldS: number;
  protectLeft: number;
  /** Seconds until your next hit may land. */
  hitCd: number;
  /** Rescue in progress (player id, 0..1). */
  rescue: { target: string; progress: number } | null;
  /** You are healing (in a base your team owns, below full hearts). */
  healing: boolean;
  tags: number;
  rescues: number;
  bases: number;
  hits: number;
}

export interface AgawanTeamPublic {
  slot: TeamSlot; score: number; captures: number; rescues: number; baseCaptures: number;
  /** Bases this team owns right now. */
  held: number;
  players: number; prisoners: number;
}

/** One base: who owns it and any capture in progress. */
export interface AgawanBasePublic {
  slot: TeamSlot;
  owner: TeamSlot;
  /** Team taking it over and how far (0..1), or null. */
  cap: { team: TeamSlot; p: number } | null;
  /** Teams standing in the ring right now (the capture is frozen while more than one team is there). */
  inside: TeamSlot[];
}

/** Public stage state (everyone): scores, hearts, bases and prisoners. Positions are in the snapshots. */
export interface AgawanPublic {
  teams: AgawanTeamPublic[];
  bases: AgawanBasePublic[];
  /** id, pen (owning team), seconds until automatic release. */
  prisoners: [string, TeamSlot, number][];
  /** Hearts of players who are not at full health (id -> hearts). */
  hp: Record<string, number>;
  /** Sudden death is running (scores were tied at the top). */
  sudden: boolean;
  /** Winning team(s) once decided (shared placement keeps several). */
  winners: TeamSlot[];
  /** Player id -> team for everyone playing this stage. */
  teamOf: Record<string, TeamSlot>;
  /** Players under release protection (subtle marker). */
  protected: string[];
}

/** One scoring or state event for the feed. */
export type AgawanEvent =
  | { kind: 'hit'; by: string; id: string; hp: number }
  | { kind: 'tag'; by: string; id: string; pen: TeamSlot; points: number }
  | { kind: 'rescue'; by: string; id: string; points: number }
  | { kind: 'base'; team: TeamSlot; base: TeamSlot; from: TeamSlot; by: string[]; points: number };

interface TeamScore { score: number; captures: number; rescues: number; baseCaptures: number }
interface BaseState { owner: TeamSlot; cap: { team: TeamSlot; p: number } | null; inside: TeamSlot[] }

const r2 = (n: number) => Math.round(n * 100) / 100;

export class AgawanEngine implements StageEngine {
  readonly rules = 'agawan_base' as const;
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
  matchS: number = AGAWAN.matchS;
  suddenS: number = AGAWAN.suddenDeathS;
  sudden = false;
  winners: TeamSlot[] = [];
  /** Per-player stage state, kept by id (a reconnecting player gets theirs back). */
  readonly state = new Map<string, AgawanState>();
  readonly teams = new Map<TeamSlot, TeamScore>();
  readonly bases = new Map<TeamSlot, BaseState>();
  /** Prison slot occupancy per pen: slot index -> player id. */
  readonly occupancy = new Map<TeamSlot, (string | null)[]>();
  /** Teams playing this stage: A, B (and C). Decision 049: the host picks 2 or 3 teams; with 2, base C stays closed. */
  slots: TeamSlot[] = [...TEAM_SLOTS];
  /** Events since the last drain (the room broadcasts them). */
  events: AgawanEvent[] = [];
  private lastNow = 0;
  private rand: () => number = rng(1);
  private suddenTied: TeamSlot[] = [];
  private readonly walls: AgawanWall[];

  constructor(readonly layout: AgawanLayout) {
    this.walls = layout.walls;
  }

  private setPhase(p: Phase, duration: number): void {
    this.phase = p; this.phaseStart = this.now; this.phaseEnd = this.now + duration;
  }

  /**
   * Every participant plays for the team the lobby locked (opts.teams); anyone without a team (should not happen once
   * the room placed everyone) joins the smallest one. Players spawn at their own base. Begins the briefing.
   */
  start(players: RoundPlayer[], opts: StartOptions): Map<string, number> {
    this.seed = opts.seed >>> 0;
    this.rand = rng(this.seed ^ 0x41474157);
    this.resultsS = opts.resultsS ?? ROUND.resultsS;
    if (typeof opts.roundS === 'number') this.matchS = Math.max(5, opts.roundS);
    this.mode = opts.mode === 'tournament' ? 'tournament' : 'standup';
    this.lastResults = []; this.skipped.clear(); this.state.clear(); this.events = [];
    this.sudden = false; this.winners = []; this.suddenTied = [];
    this.slots = TEAM_SLOTS.slice(0, opts.teamCount === 2 ? 2 : 3);
    this.teams.clear(); this.bases.clear(); this.occupancy.clear();
    for (const s of this.slots) {
      this.teams.set(s, { score: 0, captures: 0, rescues: 0, baseCaptures: 0 });
      this.bases.set(s, { owner: s, cap: null, inside: [] });
      this.occupancy.set(s, Array(this.layout.pens[s].slots.length).fill(null));
    }
    const spawnOf = new Map<string, number>();
    const used: Record<TeamSlot, number> = { A: 0, B: 0, C: 0 };
    const sorted = [...players].sort((a, b) => a.joinOrder - b.joinOrder);
    for (const p of sorted) {
      let team = opts.teams?.[p.id] as TeamSlot | undefined;
      if (!team || !this.slots.includes(team)) team = this.slots.reduce((a, b) => (used[b] < used[a] ? b : a));
      const spawns = this.layout.bases[team].spawns;
      const s = spawns[used[team]++ % spawns.length];
      Object.assign(p, { spawn: s.index, x: s.x, z: s.z, status: 'active', finishTime: -1, spotTime: -1, redDisp: 0, recent: [], downUntil: 0, immuneUntil: 0 });
      spawnOf.set(p.id, s.index);
      this.state.set(p.id, newState(team));
    }
    this.setPhase('briefing', opts.briefingS ?? ROUND.briefingS);
    return spawnOf;
  }

  teamOf(id: string): TeamSlot | null { return this.state.get(id)?.team ?? null; }
  isImprisoned(id: string): boolean { return !!this.state.get(id)?.pen; }
  ownerOf(base: TeamSlot): TeamSlot { return this.bases.get(base)?.owner ?? base; }

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
    return !!s && !s.pen && p.status === 'active';
  }

  afterMove(): void { /* hits, rescues and captures run in tick() */ }

  /** E pressed (true) or released (false). A press is remembered until the next tick, so a quick tap always counts. */
  setHold(p: RoundPlayer, holding: boolean): void {
    const s = this.state.get(p.id);
    if (!s) return;
    const on = !!holding;
    if (on && !s.holding) { s.pressed = true; s.nextRepeatAt = this.now + AGAWAN.health.holdRepeatS; }
    s.holding = on;
    if (!on) s.rescue = null;
  }

  tick(now: number, players: RoundPlayer[]): RoundEvents {
    const dt = Math.max(0, now - (this.lastNow || now));
    this.lastNow = now;
    this.now = now;
    const ev: RoundEvents = { spotted: [], finished: [], captured: [] };
    const bodies = players as AgawanBody[];
    if (this.phase === 'active') this.activeTick(dt, bodies, ev);
    if (this.pendingResults) { this.drainResults(ev); return ev; } // a sudden-death base capture ended the stage
    if (this.phase === 'lobby' || now < this.phaseEnd) return ev;
    switch (this.phase) {
      case 'briefing': this.setPhase('countdown', ROUND.countdownS); break;
      case 'countdown': this.setPhase('active', this.matchS); this.goTime = now; break;
      case 'active': {
        // Time is up: bases held now score, once. Tied at the top for the first time: sudden death.
        if (!this.sudden) this.scoreHeldBases();
        const top = this.leaders();
        if (!this.sudden && top.length > 1) {
          this.sudden = true; this.suddenTied = top;
          this.phaseEnd = now + this.suddenS;
          return ev;
        }
        this.finish(bodies, ev, this.sudden && top.length > 1 ? this.tieBreak(top) : top);
        break;
      }
      case 'results': this.setPhase('lobby', Infinity); break;
    }
    ev.phase = this.phase;
    return ev;
  }

  /** The final whistle: every team scores for each base it owns. */
  private scoreHeldBases(): void {
    for (const b of this.bases.values()) this.teams.get(b.owner)!.score += AGAWAN.points.baseHeld;
  }

  private finish(players: AgawanBody[], ev: RoundEvents, winners: TeamSlot[]): void {
    this.winners = winners;
    for (const s of this.state.values()) { s.holding = false; s.pressed = false; s.rescue = null; }
    const byId = new Map(players.map((p) => [p.id, p]));
    for (const [id, s] of this.state) if (s.pen) { this.freeSlot(id, s); const p = byId.get(id); if (p) p.status = 'active'; }
    this.lastResults = this.results(players);
    ev.results = this.lastResults;
    this.setPhase('results', this.resultsS);
  }

  /** Teams with the highest score. */
  leaders(): TeamSlot[] {
    const best = Math.max(...this.slots.map((s) => this.teams.get(s)!.score));
    return this.slots.filter((s) => this.teams.get(s)!.score === best);
  }

  heldBy(team: TeamSlot): number { let n = 0; for (const b of this.bases.values()) if (b.owner === team) n++; return n; }

  /** After a sudden death without a base capture: bases held, base captures, player captures, rescues; still tied = shared. */
  tieBreak(tied: TeamSlot[]): TeamSlot[] {
    const keys: ((s: TeamSlot) => number)[] = [(s) => this.heldBy(s), (s) => this.teams.get(s)!.baseCaptures, (s) => this.teams.get(s)!.captures, (s) => this.teams.get(s)!.rescues];
    let left = tied;
    for (const k of keys) {
      const best = Math.max(...left.map(k));
      left = left.filter((s) => k(s) === best);
      if (left.length === 1) break;
    }
    return left;
  }

  private activeTick(dt: number, players: AgawanBody[], ev: RoundEvents): void {
    const byId = new Map(players.map((p) => [p.id, p]));
    // Prisoners who are gone from the room (left for good) never keep a slot.
    for (const [id, s] of this.state) if (s.pen && !byId.has(id)) this.freeSlot(id, s);
    // No automatic release (decision 049, owner 26 Nov 2026): a captured player stays in the pen until a teammate
    // rescues them or the stage ends.
    // Presses and holds, in join order (deterministic).
    const order = [...players].sort((a, b) => a.joinOrder - b.joinOrder);
    for (const p of order) {
      const s = this.state.get(p.id);
      if (!s) continue;
      const free = !s.pen && p.status === 'active' && p.downUntil <= this.now && s.protectUntil <= this.now;
      const repeat = s.holding && this.now >= s.nextRepeatAt;
      const wantsHit = s.pressed || repeat;
      s.pressed = false;
      if (!free) { s.rescue = null; continue; }
      if (wantsHit && this.now - s.lastHitAt >= AGAWAN.health.hitCooldownS - 1e-6) {
        const target = this.hitTarget(p, s, players);
        if (target) {
          if (repeat) s.nextRepeatAt = this.now + AGAWAN.health.holdRepeatS;
          s.rescue = null;
          this.hit(p, s, byId.get(target)!, ev);
          continue;
        }
      }
      if (repeat) s.nextRepeatAt = this.now + AGAWAN.health.holdRepeatS;
      // No opponent in reach: holding E next to a captured teammate frees them.
      if (s.holding) this.rescueTick(p, s, players, byId, dt);
      else s.rescue = null;
    }
    this.healTick(players, dt);
    this.baseTick(players, dt);
  }

  /** The nearest opponent a hit applies to: free, unprotected, in reach, in the facing cone, in line of sight. */
  hitTarget(p: AgawanBody, s: AgawanState, players: AgawanBody[]): string | null {
    let best: string | null = null, bd = Infinity;
    for (const o of players) {
      if (!this.canHit(p, s, o)) continue;
      const d = Math.hypot(o.x - p.x, o.z - p.z);
      if (d < bd) { bd = d; best = o.id; }
    }
    return best;
  }

  canHit(p: AgawanBody, s: AgawanState, o: AgawanBody | undefined): boolean {
    if (!o || o.id === p.id) return false;
    const t = this.state.get(o.id);
    if (!t || t.team === s.team || t.pen || o.status !== 'active' || t.protectUntil > this.now) return false;
    const d = Math.hypot(o.x - p.x, o.z - p.z);
    if (d > AGAWAN.health.reachM) return false;
    const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw);
    if (d > 0.35 && ((o.x - p.x) * fx + (o.z - p.z) * fz) / d < Math.cos((AGAWAN.health.facingDeg * Math.PI) / 180)) return false;
    return lineOfSight(p.x, p.z, o.x, o.z, this.walls);
  }

  canRescue(p: AgawanBody, s: AgawanState, o: AgawanBody | undefined): boolean {
    if (!o || o.id === p.id) return false;
    const t = this.state.get(o.id);
    if (!t || t.team !== s.team || !t.pen || t.pen === s.team) return false;
    // One rescue at a time per prisoner: someone else already holding on them keeps it.
    for (const [id, x] of this.state) if (id !== p.id && x.rescue?.target === o.id) return false;
    if (Math.hypot(o.x - p.x, o.z - p.z) > AGAWAN.rescue.distM) return false;
    return lineOfSight(p.x, p.z, o.x, o.z, this.walls);
  }

  private hit(p: AgawanBody, s: AgawanState, o: AgawanBody, ev: RoundEvents): void {
    const t = this.state.get(o.id)!;
    s.lastHitAt = this.now;
    s.hits++;
    t.hp = Math.max(0, t.hp - 1);
    t.healAcc = 0;
    if (t.hp > 0) {
      // Knock the target back a little (never into a wall), so the hit reads on screen.
      const d = Math.hypot(o.x - p.x, o.z - p.z) || 1;
      const k = AGAWAN.health.knockbackM;
      [o.x, o.z] = pushOutOfWalls(o.x + ((o.x - p.x) / d) * k, o.z + ((o.z - p.z) / d) * k, this.walls);
      this.events.push({ kind: 'hit', by: p.id, id: o.id, hp: t.hp });
      return;
    }
    this.capture(p, s, o, t, ev);
  }

  private capture(p: AgawanBody, s: AgawanState, o: AgawanBody, t: AgawanState, ev: RoundEvents): void {
    const occ = this.occupancy.get(s.team)!;
    let slot = occ.indexOf(null);
    if (slot < 0) {
      // Cannot happen with 20 slots and 10 players a team; never drop the prisoner: share the last slot and log it.
      console.error(JSON.stringify({ ev: 'agawan_pen_full', pen: s.team, id: o.id }));
      slot = occ.length - 1;
    } else occ[slot] = o.id;
    t.pen = s.team; t.slot = slot; t.penSince = this.now; t.rescue = null; t.holding = false; t.pressed = false; t.captured++;
    const pos = this.layout.pens[s.team].slots[slot];
    Object.assign(o, { x: pos.x, z: pos.z, vx: 0, vz: 0, status: 'captured' });
    s.tags++;
    const team = this.teams.get(s.team)!;
    team.captures++; team.score += AGAWAN.points.capture;
    ev.captured!.push([o.id, p.id]);
    this.events.push({ kind: 'tag', by: p.id, id: o.id, pen: s.team, points: AGAWAN.points.capture });
    for (const x of this.state.values()) if (x.rescue?.target === o.id) x.rescue = null;
  }

  private rescueTick(p: AgawanBody, s: AgawanState, players: AgawanBody[], byId: Map<string, AgawanBody>, dt: number): void {
    if (s.rescue && !this.canRescue(p, s, byId.get(s.rescue.target))) s.rescue = null;
    if (!s.rescue) {
      let best: string | null = null, bd = Infinity;
      for (const o of players) {
        if (!this.canRescue(p, s, o)) continue;
        const d = Math.hypot(o.x - p.x, o.z - p.z);
        if (d < bd) { bd = d; best = o.id; }
      }
      if (!best) return;
      s.rescue = { target: best, progress: 0 };
    }
    s.rescue.progress += dt / AGAWAN.rescue.holdS;
    if (s.rescue.progress < 1 - 1e-6) return;
    const o = byId.get(s.rescue.target)!;
    s.rescue = null;
    const t = this.state.get(o.id)!;
    this.release(o, t);
    const team = this.teams.get(s.team)!;
    team.rescues++; team.score += AGAWAN.points.rescue;
    s.rescues++;
    this.events.push({ kind: 'rescue', by: p.id, id: o.id, points: AGAWAN.points.rescue });
  }

  /** Hearts come back only inside a base your team owns (decision 047). */
  private healTick(players: AgawanBody[], dt: number): void {
    for (const p of players) {
      const s = this.state.get(p.id);
      if (!s || s.pen || p.status !== 'active' || s.hp >= AGAWAN.health.max) { if (s) s.healAcc = 0; continue; }
      if (!this.inOwnedBase(p, s.team)) { s.healAcc = 0; continue; }
      s.healAcc += dt;
      if (s.healAcc >= AGAWAN.health.healEveryS) { s.healAcc -= AGAWAN.health.healEveryS; s.hp = Math.min(AGAWAN.health.max, s.hp + 1); }
    }
  }

  inOwnedBase(p: { x: number; z: number }, team: TeamSlot): boolean {
    for (const slot of this.slots) {
      if (this.bases.get(slot)!.owner !== team) continue;
      const b = this.layout.bases[slot];
      if (Math.hypot(b.x - p.x, b.z - p.z) <= AGAWAN.health.healRadiusM) return true;
    }
    return false;
  }

  /**
   * Base takeover (decision 047). Free, unprotected players standing in a base's inner ring count. Only one team in the
   * ring: if it is not the owner, its capture grows (faster with more of them, faster still when it is the base's
   * original team taking it back); if it is the owner, a rival's half-done capture is pushed back. Two or more teams in
   * the ring: frozen (contested). Nobody: a half-done capture fades. At 1 the base changes hands.
   */
  private baseTick(players: AgawanBody[], dt: number): void {
    const cfg = AGAWAN.base;
    for (const slot of this.slots) {
      const b = this.bases.get(slot)!;
      const pos = this.layout.bases[slot];
      const count: Partial<Record<TeamSlot, string[]>> = {};
      for (const p of players) {
        const s = this.state.get(p.id);
        if (!s || s.pen || p.status !== 'active' || s.protectUntil > this.now || p.downUntil > this.now) continue;
        if (Math.hypot(pos.x - p.x, pos.z - p.z) > cfg.zoneM) continue;
        (count[s.team] ??= []).push(p.id);
      }
      const inside = this.slots.filter((t) => count[t]?.length);
      b.inside = inside;
      const rate = (n: number, team: TeamSlot) => (cfg.crowd[Math.min(n, cfg.crowd.length) - 1] / cfg.soloS) * (team === slot ? cfg.homeBonus : 1);
      if (inside.length === 0) {
        if (b.cap) { b.cap.p -= cfg.decayPerS * dt; if (b.cap.p <= 0) b.cap = null; }
        continue;
      }
      // Majority rule (decision 047): the team with the most players in the ring moves the capture, at the speed of
      // its lead over the next team (3 attackers vs 1 defender capture like 2). Equal numbers at the top: paused.
      const sizes = inside.map((t) => count[t]!.length).sort((x, y) => y - x);
      if (sizes.length > 1 && sizes[0] === sizes[1]) continue; // contested, evenly
      const team = inside.reduce((best, t) => (count[t]!.length > count[best]!.length ? t : best), inside[0]);
      const n = sizes[0] - (sizes[1] ?? 0);
      if (team === b.owner) {
        // Defenders alone in their ring push a rival's capture back at their own capture speed.
        if (b.cap) { b.cap.p -= rate(n, team) * dt; if (b.cap.p <= 0) b.cap = null; }
        continue;
      }
      if (b.cap && b.cap.team !== team) {
        // Another team had started: undo theirs first.
        b.cap.p -= rate(n, team) * dt;
        if (b.cap.p <= 0) b.cap = { team, p: 0 };
        continue;
      }
      b.cap ??= { team, p: 0 };
      b.cap.p += rate(n, team) * dt;
      if (b.cap.p < 1 - 1e-6) continue;
      this.takeBase(slot, b, team, count[team]!, players);
      if (this.pendingResults) return;
    }
  }

  private takeBase(slot: TeamSlot, b: BaseState, team: TeamSlot, by: string[], players: AgawanBody[]): void {
    const from = b.owner;
    b.owner = team; b.cap = null;
    const t = this.teams.get(team)!;
    t.baseCaptures++; t.score += AGAWAN.points.baseCapture;
    for (const id of by) { const s = this.state.get(id); if (s) s.bases++; }
    this.events.push({ kind: 'base', team, base: slot, from, by, points: AGAWAN.points.baseCapture });
    // Sudden death: the first base capture by a tied team wins at once.
    if (this.sudden && this.suddenTied.includes(team)) {
      const ev: RoundEvents = { spotted: [], finished: [], captured: [] };
      this.finish(players, ev, [team]);
      this.pendingResults = ev;
    }
  }

  /** Results produced inside a tick (sudden-death base capture), handed to the room on the same tick. */
  private pendingResults: RoundEvents | null = null;

  /** Back to your own base with 1 heart and short protection; frees the pen slot exactly once. */
  private release(p: AgawanBody, s: AgawanState): void {
    this.freeSlot(p.id, s);
    const spawns = this.layout.bases[s.team].spawns;
    const sp = spawns[(p.joinOrder + Math.floor(this.rand() * spawns.length)) % spawns.length];
    Object.assign(p, { x: sp.x, z: sp.z, vx: 0, vz: 0, status: 'active' });
    s.hp = AGAWAN.health.afterRelease;
    s.healAcc = 0;
    s.protectUntil = this.now + AGAWAN.protectS;
  }

  private freeSlot(id: string, s: AgawanState): void {
    if (!s.pen) return;
    const occ = this.occupancy.get(s.pen)!;
    if (occ[s.slot] === id) occ[s.slot] = null;
    s.pen = null; s.slot = -1; s.penSince = 0; s.rescue = null;
  }

  /** Moves the sudden-death results (if any) into this tick's events. */
  drainResults(ev: RoundEvents): void {
    if (!this.pendingResults) return;
    ev.results = this.pendingResults.results;
    ev.phase = this.phase;
    this.pendingResults = null;
  }

  /** Events since the last call (hits, captures, rescues, releases, base takeovers), for the room's feed. */
  drainEvents(): AgawanEvent[] { const e = this.events; this.events = []; return e; }

  /**
   * Placings. Every player of a team shares their team's placement (ties share the place and skip the next) and the
   * individual-board points for it (2 / 1 / 0, like the other stages); within a team, players are ordered by their own
   * base captures, captures and rescues. The team championship (3 / 2 / 1) reads teamPlace.
   */
  results(players: AgawanBody[]): Placing[] {
    const place = this.teamPlaces();
    const rows: { p: AgawanBody; s: AgawanState }[] = [];
    for (const p of players) { const s = this.state.get(p.id); if (s) rows.push({ p, s }); }
    const contrib = (s: AgawanState) => s.bases * 5 + s.tags * 2 + s.rescues * 2 + s.hits * 0.1;
    rows.sort((a, b) => place[a.s.team] - place[b.s.team] || contrib(b.s) - contrib(a.s) || a.p.joinOrder - b.p.joinOrder);
    return rows.map(({ p, s }, i) => ({
      id: p.id, place: i + 1, status: place[s.team] === 1 ? 'finished' : 'active', finishTime: -1, progress: 0, qualified: false,
      points: playerPoints(place[s.team], this.slots.length), team: s.team, teamPlace: place[s.team], teamScore: this.teams.get(s.team)?.score ?? 0,
      tags: s.tags, rescues: s.rescues, raids: s.bases,
    }));
  }

  /** 1-based placement per team: winners first (shared), then the rest by score (ties share and skip). */
  teamPlaces(): Record<TeamSlot, number> {
    const score = (t: TeamSlot) => this.teams.get(t)!.score;
    const out = {} as Record<TeamSlot, number>;
    const winners = this.winners.length ? this.winners : this.leaders();
    for (const w of winners) out[w] = 1;
    const rest = this.slots.filter((t) => !winners.includes(t)).sort((a, b) => score(b) - score(a));
    let placed = winners.length;
    rest.forEach((t, i) => { out[t] = i > 0 && score(t) === score(rest[i - 1]) ? out[rest[i - 1]] : placed + 1; placed++; });
    return out;
  }

  remaining(): number { return Math.max(0, this.phaseEnd - this.now); }

  publicState(): AgawanPublic {
    const counts: Record<TeamSlot, { players: number; prisoners: number }> = { A: { players: 0, prisoners: 0 }, B: { players: 0, prisoners: 0 }, C: { players: 0, prisoners: 0 } };
    const prisoners: AgawanPublic['prisoners'] = [];
    const teamOf: Record<string, TeamSlot> = {};
    const hp: Record<string, number> = {};
    const prot: string[] = [];
    for (const [id, s] of this.state) {
      counts[s.team].players++;
      teamOf[id] = s.team;
      if (s.hp < AGAWAN.health.max) hp[id] = s.hp;
      if (s.pen) { counts[s.pen].prisoners++; prisoners.push([id, s.pen, r2(Math.max(0, this.now - s.penSince))]); }
      if (s.protectUntil > this.now) prot.push(id);
    }
    return {
      teams: this.slots.map((slot) => {
        const t = this.teams.get(slot);
        return { slot, score: t?.score ?? 0, captures: t?.captures ?? 0, rescues: t?.rescues ?? 0, baseCaptures: t?.baseCaptures ?? 0, held: this.heldBy(slot), ...counts[slot] };
      }),
      bases: this.slots.map((slot) => {
        const b = this.bases.get(slot) ?? { owner: slot, cap: null, inside: [] };
        return { slot, owner: b.owner, cap: b.cap ? { team: b.cap.team, p: r2(Math.max(0, Math.min(1, b.cap.p))) } : null, inside: [...b.inside] };
      }),
      prisoners, hp, sudden: this.sudden, winners: this.winners, teamOf, protected: prot,
    };
  }

  privateState(id: string): AgawanPrivate | null {
    const s = this.state.get(id);
    if (!s) return null;
    const left = (t: number) => r2(Math.max(0, t - this.now));
    return {
      team: s.team, hp: s.hp, pen: s.pen, heldS: s.pen ? r2(Math.max(0, this.now - s.penSince)) : 0, protectLeft: left(s.protectUntil),
      hitCd: left(s.lastHitAt + AGAWAN.health.hitCooldownS),
      rescue: s.rescue ? { target: s.rescue.target, progress: r2(Math.min(1, s.rescue.progress)) } : null,
      healing: s.healAcc > 0 && s.hp < AGAWAN.health.max,
      tags: s.tags, rescues: s.rescues, bases: s.bases, hits: s.hits,
    };
  }
}

/** Individual points for a team place: 2 / 1 / 0 with three teams; the last team always scores 0 (2 / 0 with two). */
export function playerPoints(place: number, teamCount: number): number {
  if (place >= teamCount) return 0;
  return AGAWAN.playerPoints[place - 1] ?? 0;
}

function newState(team: TeamSlot): AgawanState {
  return {
    team, hp: AGAWAN.health.max, pen: null, slot: -1, penSince: 0, protectUntil: 0, lastHitAt: -Infinity, nextRepeatAt: 0, holding: false, pressed: false,
    rescue: null, healAcc: 0, hits: 0, tags: 0, rescues: 0, bases: 0, captured: 0,
  };
}
