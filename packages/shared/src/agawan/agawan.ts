// Stage 02 · AGAWAN BASE rules engine (three-team tag, prison, rescue and base raid). Pure and deterministic for a
// seed, owned by the room (server authority), unit tested here. Rules: handoff pack 02_STAGE_02_GAMEPLAY_MECHANICS_AND_
// RULES. The room calls the same methods for humans and bots:
//   start(players, opts)    team spawns (teams come from the lobby's TeamBook via opts.teams), briefing
//   setHold(p, holding)     hold / release E; the server decides what the hold does each tick:
//                             tag an opponent in reach, else rescue a teammate in a pen, else raid an enemy base
//   tick(now, players)      phases, hold progress, prison timeouts, scoring, sudden death, results
// Every transition (capture, rescue, auto-release, raid) happens inside tick() one player at a time, so two events
// can never both succeed for the same prisoner, target or base: the first valid one changes the state and the other
// finds it no longer valid.
import { rng, ROUND, type Phase, type Placing, type RoundEvents, type RoundPlayer, type Signal, type SignalSegment, type StartOptions } from '../round.ts';
import type { Mode } from '../tournament.ts';
import type { StageEngine } from '../engine.ts';
import { TEAM_SLOTS, type TeamSlot } from '../teams.ts';
import { lineOfSight } from '../hunt/los.ts';
import { AGAWAN } from './config.ts';
import type { AgawanLayout, AgawanWall } from './layout.ts';

/** A player as the engine sees it: room players carry their facing (camera yaw) too. */
export interface AgawanBody extends RoundPlayer { yaw: number; vx?: number; vz?: number }

export type AgawanActionKind = 'tag' | 'rescue' | 'raid';

export interface AgawanState {
  team: TeamSlot;
  /** Pen (owning team) holding this player, or null when free. */
  pen: TeamSlot | null;
  slot: number;
  releaseAt: number;
  protectUntil: number;
  tagCdUntil: number;
  holding: boolean;
  action: { kind: AgawanActionKind; target: string; progress: number } | null;
  // individual stats (secondary board)
  tags: number;
  rescues: number;
  raids: number;
  captured: number;
}

/** What one player may know about their own stage state (sent only to them). */
export interface AgawanPrivate {
  team: TeamSlot;
  /** Pen holding you (an opponent's slot), or null. */
  pen: TeamSlot | null;
  releaseLeft: number;
  protectLeft: number;
  tagCd: number;
  /** The hold in progress: what it does, on whom (player id or base slot) and 0..1. */
  action: { kind: AgawanActionKind; target: string; progress: number } | null;
  tags: number;
  rescues: number;
  raids: number;
}

export interface AgawanTeamPublic { slot: TeamSlot; score: number; raids: number; tags: number; rescues: number; players: number; prisoners: number }

/** Public stage state (everyone): scores, prisoners and raid cooldowns. Positions are in the snapshots. */
export interface AgawanPublic {
  teams: AgawanTeamPublic[];
  /** id, pen (owning team), seconds until automatic release. */
  prisoners: [string, TeamSlot, number][];
  /** "AB" = Team A's cooldown on Team B's base, seconds left (only running ones). */
  raidCd: Record<string, number>;
  /** Sudden death is running (scores were tied at the top). */
  sudden: boolean;
  /** Winning team(s) once decided (shared placement keeps several). */
  winners: TeamSlot[];
  /** Player id -> team for everyone playing this stage. */
  teamOf: Record<string, TeamSlot>;
  /** Players under spawn protection (subtle marker). */
  protected: string[];
}

/** One scoring or state event for the feed. */
export type AgawanEvent =
  | { kind: 'tag'; by: string; id: string; pen: TeamSlot; points: number }
  | { kind: 'rescue'; by: string; id: string; points: number }
  | { kind: 'release'; id: string }
  | { kind: 'raid'; by: string; team: TeamSlot; base: TeamSlot; points: number };

interface TeamScore { score: number; raids: number; tagged: Set<string>; rescued: Set<string> }

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
  /** Raid cooldowns: "AB" -> room time when Team A may raid Team B's base again. */
  readonly raidCdUntil = new Map<string, number>();
  /** Prison slot occupancy per pen: slot index -> player id. */
  readonly occupancy = new Map<TeamSlot, (string | null)[]>();
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
    this.lastResults = []; this.skipped.clear(); this.state.clear(); this.raidCdUntil.clear(); this.events = [];
    this.sudden = false; this.winners = []; this.suddenTied = [];
    for (const s of TEAM_SLOTS) { this.teams.set(s, { score: 0, raids: 0, tagged: new Set(), rescued: new Set() }); this.occupancy.set(s, Array(this.layout.pens[s].slots.length).fill(null)); }
    const spawnOf = new Map<string, number>();
    const used: Record<TeamSlot, number> = { A: 0, B: 0, C: 0 };
    const sorted = [...players].sort((a, b) => a.joinOrder - b.joinOrder);
    for (const p of sorted) {
      let team = opts.teams?.[p.id] as TeamSlot | undefined;
      if (!team || !TEAM_SLOTS.includes(team)) team = TEAM_SLOTS.reduce((a, b) => (used[b] < used[a] ? b : a));
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

  afterMove(): void { /* holds and timers run in tick() */ }

  /** Player holds (or releases) E. What the hold does is decided every tick from server positions. */
  setHold(p: RoundPlayer, holding: boolean): void {
    const s = this.state.get(p.id);
    if (!s) return;
    s.holding = !!holding;
    if (!s.holding) s.action = null;
  }

  tick(now: number, players: RoundPlayer[]): RoundEvents {
    const dt = Math.max(0, now - (this.lastNow || now));
    this.lastNow = now;
    this.now = now;
    const ev: RoundEvents = { spotted: [], finished: [], captured: [] };
    const bodies = players as AgawanBody[];
    if (this.phase === 'active') this.activeTick(dt, bodies, ev);
    if (this.pendingResults) { this.drainResults(ev); return ev; } // a sudden-death raid ended the stage
    if (this.phase === 'lobby' || now < this.phaseEnd) return ev;
    switch (this.phase) {
      case 'briefing': this.setPhase('countdown', ROUND.countdownS); break;
      case 'countdown': this.setPhase('active', this.matchS); this.goTime = now; break;
      case 'active': {
        // Time is up. Tied at the top for the first time: 30 s of sudden death (the first raid wins).
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

  private finish(players: AgawanBody[], ev: RoundEvents, winners: TeamSlot[]): void {
    this.winners = winners;
    // Freeze: no hold survives the end, every prisoner is cleared (slots released exactly once).
    for (const s of this.state.values()) { s.holding = false; s.action = null; }
    const byId = new Map(players.map((p) => [p.id, p]));
    for (const [id, s] of this.state) if (s.pen) { this.freeSlot(id, s); const p = byId.get(id); if (p) p.status = 'active'; }
    this.lastResults = this.results(players);
    ev.results = this.lastResults;
    this.setPhase('results', this.resultsS);
  }

  /** Teams with the highest score. */
  leaders(): TeamSlot[] {
    const best = Math.max(...TEAM_SLOTS.map((s) => this.teams.get(s)!.score));
    return TEAM_SLOTS.filter((s) => this.teams.get(s)!.score === best);
  }

  /** Pack §7 after a sudden death without a raid: raids, then unique tags, then unique rescues; still tied = shared. */
  tieBreak(tied: TeamSlot[]): TeamSlot[] {
    const keys: ((t: TeamScore) => number)[] = [(t) => t.raids, (t) => t.tagged.size, (t) => t.rescued.size];
    let left = tied;
    for (const k of keys) {
      const best = Math.max(...left.map((s) => k(this.teams.get(s)!)));
      left = left.filter((s) => k(this.teams.get(s)!) === best);
      if (left.length === 1) break;
    }
    return left;
  }

  private activeTick(dt: number, players: AgawanBody[], ev: RoundEvents): void {
    const byId = new Map(players.map((p) => [p.id, p]));
    // Prisoners who are gone from the room (left for good) never keep a slot.
    for (const [id, s] of this.state) if (s.pen && !byId.has(id)) this.freeSlot(id, s);
    // Automatic release after prison.maxS (a rescue earlier in this tick wins: it already cleared the pen).
    for (const p of players) {
      const s = this.state.get(p.id);
      if (s?.pen && this.now >= s.releaseAt) { this.release(p, s); this.events.push({ kind: 'release', id: p.id }); }
    }
    // Holds, in join order (deterministic). Each completed hold changes the state before the next one is checked.
    const order = [...players].sort((a, b) => a.joinOrder - b.joinOrder);
    for (const p of order) {
      if (this.phase !== 'active') break; // a sudden-death raid ended the stage
      const s = this.state.get(p.id);
      if (!s) continue;
      if (!s.holding || s.pen || p.status !== 'active' || p.downUntil > this.now || s.protectUntil > this.now) { s.action = null; continue; }
      const choice = this.chooseAction(p, s, players, byId);
      if (!choice) { s.action = null; continue; }
      if (!s.action || s.action.kind !== choice.kind || s.action.target !== choice.target) s.action = { kind: choice.kind, target: choice.target, progress: 0 };
      const hold = choice.kind === 'tag' ? AGAWAN.tag.holdS : choice.kind === 'rescue' ? AGAWAN.rescue.holdS : AGAWAN.raid.holdS;
      s.action.progress += dt / hold;
      if (s.action.progress < 1 - 1e-6) continue;
      const done = s.action;
      s.action = null;
      if (done.kind === 'tag') this.capture(p, s, byId.get(done.target)!, ev, players);
      else if (done.kind === 'rescue') this.rescue(p, s, byId.get(done.target)!);
      else this.raid(p, s, done.target as TeamSlot, players);
    }
  }

  /**
   * What a hold applies to right now: keep the current action while it stays valid; otherwise tag an opponent in
   * reach (defence first), then rescue a teammate in a pen, then raid an enemy base.
   */
  private chooseAction(p: AgawanBody, s: AgawanState, players: AgawanBody[], byId: Map<string, AgawanBody>): { kind: AgawanActionKind; target: string } | null {
    if (s.action) {
      const cur = s.action;
      const ok = cur.kind === 'tag' ? this.canTag(p, s, byId.get(cur.target)) : cur.kind === 'rescue' ? this.canRescue(p, s, byId.get(cur.target)) : this.canRaid(p, s, cur.target as TeamSlot);
      if (ok) return cur;
    }
    const tag = this.tagTarget(p, s, players);
    if (tag) return { kind: 'tag', target: tag };
    let best: string | null = null, bd = Infinity;
    for (const o of players) {
      if (!this.canRescue(p, s, o)) continue;
      const d = Math.hypot(o.x - p.x, o.z - p.z);
      if (d < bd) { bd = d; best = o.id; }
    }
    if (best) return { kind: 'rescue', target: best };
    for (const b of TEAM_SLOTS) if (this.canRaid(p, s, b)) return { kind: 'raid', target: b };
    return null;
  }

  /** The nearest opponent a tag applies to: active, unprotected, in reach, in the facing cone, in line of sight. */
  tagTarget(p: AgawanBody, s: AgawanState, players: AgawanBody[]): string | null {
    let best: string | null = null, bd = Infinity;
    for (const o of players) {
      if (!this.canTag(p, s, o)) continue;
      const d = Math.hypot(o.x - p.x, o.z - p.z);
      if (d < bd) { bd = d; best = o.id; }
    }
    return best;
  }

  canTag(p: AgawanBody, s: AgawanState, o: AgawanBody | undefined): boolean {
    if (!o || o.id === p.id || this.now < s.tagCdUntil) return false;
    const t = this.state.get(o.id);
    if (!t || t.team === s.team || t.pen || o.status !== 'active' || t.protectUntil > this.now) return false;
    const d = Math.hypot(o.x - p.x, o.z - p.z);
    if (d > AGAWAN.tag.distM) return false;
    const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw);
    if (d > 1e-6 && ((o.x - p.x) * fx + (o.z - p.z) * fz) / d < Math.cos((AGAWAN.tag.facingDeg * Math.PI) / 180)) return false;
    return lineOfSight(p.x, p.z, o.x, o.z, this.walls);
  }

  canRescue(p: AgawanBody, s: AgawanState, o: AgawanBody | undefined): boolean {
    if (!o || o.id === p.id) return false;
    const t = this.state.get(o.id);
    if (!t || t.team !== s.team || !t.pen || t.pen === s.team) return false;
    // One rescue at a time per prisoner: someone else already holding on them keeps it.
    for (const [id, x] of this.state) if (id !== p.id && x.action?.kind === 'rescue' && x.action.target === o.id) return false;
    if (Math.hypot(o.x - p.x, o.z - p.z) > AGAWAN.rescue.distM) return false;
    return lineOfSight(p.x, p.z, o.x, o.z, this.walls);
  }

  canRaid(p: AgawanBody, s: AgawanState, base: TeamSlot): boolean {
    if (base === s.team) return false;
    if (this.now < (this.raidCdUntil.get(s.team + base) ?? 0)) return false;
    // Only one completion per attacking team and base at a time: a teammate's hold on the same base keeps it.
    for (const [id, x] of this.state) if (id !== p.id && x.team === s.team && x.action?.kind === 'raid' && x.action.target === base) return false;
    const b = this.layout.bases[base];
    if (Math.hypot(b.x - p.x, b.z - p.z) > AGAWAN.raid.radiusM) return false;
    return lineOfSight(p.x, p.z, b.x, b.z, this.walls);
  }

  private capture(p: AgawanBody, s: AgawanState, o: AgawanBody, ev: RoundEvents, players: AgawanBody[]): void {
    const t = this.state.get(o.id)!;
    const occ = this.occupancy.get(s.team)!;
    let slot = occ.indexOf(null);
    if (slot < 0) {
      // Cannot happen with 20 slots and 10 players a team; never drop the prisoner: share the last slot and log it.
      console.error(JSON.stringify({ ev: 'agawan_pen_full', pen: s.team, id: o.id }));
      slot = occ.length - 1;
    } else occ[slot] = o.id;
    t.pen = s.team; t.slot = slot; t.releaseAt = this.now + AGAWAN.prison.maxS; t.action = null; t.holding = false; t.captured++;
    const pos = this.layout.pens[s.team].slots[slot];
    Object.assign(o, { x: pos.x, z: pos.z, vx: 0, vz: 0, status: 'captured' });
    s.tagCdUntil = this.now + AGAWAN.tag.cooldownS;
    s.tags++;
    const team = this.teams.get(s.team)!;
    let points = 0;
    if (!team.tagged.has(o.id)) { team.tagged.add(o.id); points = AGAWAN.points.firstTag; team.score += points; }
    ev.captured!.push([o.id, p.id]);
    this.events.push({ kind: 'tag', by: p.id, id: o.id, pen: s.team, points });
    // Anyone holding on this player (another tag, a raid by them) loses it; the captured player's own hold ends.
    for (const x of this.state.values()) if (x.action?.target === o.id) x.action = null;
    void players;
  }

  private rescue(p: AgawanBody, s: AgawanState, o: AgawanBody): void {
    const t = this.state.get(o.id)!;
    this.release(o, t);
    const team = this.teams.get(s.team)!;
    let points = 0;
    if (!team.rescued.has(o.id)) { team.rescued.add(o.id); points = AGAWAN.points.firstRescue; team.score += points; }
    s.rescues++;
    this.events.push({ kind: 'rescue', by: p.id, id: o.id, points });
  }

  private raid(p: AgawanBody, s: AgawanState, base: TeamSlot, players: AgawanBody[]): void {
    this.raidCdUntil.set(s.team + base, this.now + AGAWAN.raid.cooldownS);
    const team = this.teams.get(s.team)!;
    team.score += AGAWAN.points.raid; team.raids++;
    s.raids++;
    this.events.push({ kind: 'raid', by: p.id, team: s.team, base, points: AGAWAN.points.raid });
    // Sudden death: the first raid by a tied team wins at once.
    if (this.sudden && this.suddenTied.includes(s.team)) {
      const ev: RoundEvents = { spotted: [], finished: [], captured: [] };
      this.finish(players, ev, [s.team]);
      this.pendingResults = ev;
    }
  }

  /** Results produced inside a hold (sudden-death raid), handed to the room on the same tick. */
  private pendingResults: RoundEvents | null = null;

  /** Back to your own base with short protection; frees the pen slot exactly once. */
  private release(p: AgawanBody, s: AgawanState): void {
    this.freeSlot(p.id, s);
    const spawns = this.layout.bases[s.team].spawns;
    const sp = spawns[(p.joinOrder + Math.floor(this.rand() * spawns.length)) % spawns.length];
    Object.assign(p, { x: sp.x, z: sp.z, vx: 0, vz: 0, status: 'active' });
    s.protectUntil = this.now + AGAWAN.protectS;
  }

  private freeSlot(id: string, s: AgawanState): void {
    if (!s.pen) return;
    const occ = this.occupancy.get(s.pen)!;
    if (occ[s.slot] === id) occ[s.slot] = null;
    s.pen = null; s.slot = -1; s.releaseAt = 0; s.action = null;
  }

  /** Moves the sudden-death results (if any) into this tick's events. Called by tick() wrappers. */
  drainResults(ev: RoundEvents): void {
    if (!this.pendingResults) return;
    ev.results = this.pendingResults.results;
    ev.phase = this.phase;
    this.pendingResults = null;
  }

  /** Events since the last call (tags, rescues, releases, raids), for the room's feed. */
  drainEvents(): AgawanEvent[] { const e = this.events; this.events = []; return e; }

  /**
   * Placings. Every player of a team shares their team's placement (ties share the place and skip the next) and the
   * individual-board points for it (2 / 1 / 0, like the other stages); within a team, players are ordered by their own
   * tags + rescues + raids. The team championship (3 / 2 / 1) reads teamPlace.
   */
  results(players: AgawanBody[]): Placing[] {
    const place = this.teamPlaces();
    const rows: { p: AgawanBody; s: AgawanState }[] = [];
    for (const p of players) { const s = this.state.get(p.id); if (s) rows.push({ p, s }); }
    const contrib = (s: AgawanState) => s.raids * 3 + s.tags + s.rescues;
    rows.sort((a, b) => place[a.s.team] - place[b.s.team] || contrib(b.s) - contrib(a.s) || a.p.joinOrder - b.p.joinOrder);
    return rows.map(({ p, s }, i) => ({
      id: p.id, place: i + 1, status: place[s.team] === 1 ? 'finished' : 'active', finishTime: -1, progress: 0, qualified: false,
      points: AGAWAN.playerPoints[place[s.team] - 1] ?? 0, team: s.team, teamPlace: place[s.team], teamScore: this.teams.get(s.team)?.score ?? 0,
      tags: s.tags, rescues: s.rescues, raids: s.raids,
    }));
  }

  /** 1-based placement per team: winners first (shared), then the rest by score (ties share and skip). */
  teamPlaces(): Record<TeamSlot, number> {
    const score = (t: TeamSlot) => this.teams.get(t)!.score;
    const out = {} as Record<TeamSlot, number>;
    const winners = this.winners.length ? this.winners : this.leaders();
    for (const w of winners) out[w] = 1;
    const rest = TEAM_SLOTS.filter((t) => !winners.includes(t)).sort((a, b) => score(b) - score(a));
    let placed = winners.length;
    rest.forEach((t, i) => { out[t] = i > 0 && score(t) === score(rest[i - 1]) ? out[rest[i - 1]] : placed + 1; placed++; });
    return out;
  }

  remaining(): number { return Math.max(0, this.phaseEnd - this.now); }

  publicState(): AgawanPublic {
    const counts: Record<TeamSlot, { players: number; prisoners: number }> = { A: { players: 0, prisoners: 0 }, B: { players: 0, prisoners: 0 }, C: { players: 0, prisoners: 0 } };
    const prisoners: AgawanPublic['prisoners'] = [];
    const teamOf: Record<string, TeamSlot> = {};
    const prot: string[] = [];
    for (const [id, s] of this.state) {
      counts[s.team].players++;
      teamOf[id] = s.team;
      if (s.pen) { counts[s.pen].prisoners++; prisoners.push([id, s.pen, r2(Math.max(0, s.releaseAt - this.now))]); }
      if (s.protectUntil > this.now) prot.push(id);
    }
    const raidCd: Record<string, number> = {};
    for (const [k, until] of this.raidCdUntil) if (until > this.now) raidCd[k] = r2(until - this.now);
    return {
      teams: TEAM_SLOTS.map((slot) => { const t = this.teams.get(slot); return { slot, score: t?.score ?? 0, raids: t?.raids ?? 0, tags: t?.tagged.size ?? 0, rescues: t?.rescued.size ?? 0, ...counts[slot] }; }),
      prisoners, raidCd, sudden: this.sudden, winners: this.winners, teamOf, protected: prot,
    };
  }

  privateState(id: string): AgawanPrivate | null {
    const s = this.state.get(id);
    if (!s) return null;
    const left = (t: number) => r2(Math.max(0, t - this.now));
    return {
      team: s.team, pen: s.pen, releaseLeft: s.pen ? left(s.releaseAt) : 0, protectLeft: left(s.protectUntil), tagCd: left(s.tagCdUntil),
      action: s.action ? { kind: s.action.kind, target: s.action.target, progress: r2(Math.min(1, s.action.progress)) } : null,
      tags: s.tags, rescues: s.rescues, raids: s.raids,
    };
  }
}

function newState(team: TeamSlot): AgawanState {
  return { team, pen: null, slot: -1, releaseAt: 0, protectUntil: 0, tagCdUntil: 0, holding: false, action: null, tags: 0, rescues: 0, raids: 0, captured: 0 };
}
