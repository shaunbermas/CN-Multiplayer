// Teams and captains for Stage 02 · AGAWAN BASE (decision 045; handoff pack 03_TEAM_LOBBY_AND_CAPTAIN_MANAGEMENT).
// Pure and server-owned: the room keeps one TeamBook, applies lobby requests through it and broadcasts its view.
// Clients only ask; every rule (capacity, unique names, one captain, locking) is checked here.
//
// Rules:
//  - two or three slots (decision 049: the host picks; with two, only A and B play) with colours dealt at random (decision 047); names default to Team A / B / C and only the host renames
//  - at most 10 players a team; Auto-balance keeps sizes within one (25 -> 9/8/8 ... 30 -> 10/10/10)
//  - a player nominates themselves; the host appoints one captain per team (a nominee or any member)
//  - changing team clears a player's captaincy and nomination
//  - everything locks when the match starts; bots and late joiners are still placed in the smallest team
export type TeamSlot = 'A' | 'B' | 'C';
export const TEAM_SLOTS: readonly TeamSlot[] = ['A', 'B', 'C'];

export const TEAMS = {
  /** Most players in one team with 3 teams (30 / 3). TeamBook.capacity() gives 15 with 2 teams. */
  maxPerTeam: 10,
  /** Visible characters in a team name, after trimming. */
  nameMin: 2,
  nameMax: 18,
  /** Slot accents from the handoff pack (UI chips, base markers, ground rings). The slot keeps its colour when renamed. */
  colors: { A: '#A16FCD', B: '#36B2C9', C: '#D56FA0' } as Record<TeamSlot, string>,
  defaultNames: { A: 'Team A', B: 'Team B', C: 'Team C' } as Record<TeamSlot, string>,
} as const;

/**
 * Team colours are dealt at random (decision 047, owner 26 Nov 2026: "randomize the color of the team, not just the
 * teal, purple and pink"). Saturated, readable at night on the street, none of them the UI's danger red. Each deal
 * keeps the three colours at least 70 degrees of hue apart, so teams never look alike.
 */
export const TEAM_PALETTE: readonly { hex: string; hue: number; name: string }[] = [
  { hex: '#A16FCD', hue: 275, name: 'Purple' },
  { hex: '#36B2C9', hue: 190, name: 'Cyan' },
  { hex: '#D56FA0', hue: 330, name: 'Pink' },
  { hex: '#F28C28', hue: 30, name: 'Orange' },
  { hex: '#8FD14F', hue: 90, name: 'Lime' },
  { hex: '#F2C230', hue: 47, name: 'Gold' },
  { hex: '#4F7DF2', hue: 225, name: 'Blue' },
  { hex: '#2FBF8F', hue: 160, name: 'Jade' },
  { hex: '#FF7A6B', hue: 6, name: 'Coral' },
  { hex: '#C9E25A', hue: 70, name: 'Chartreuse' },
  { hex: '#7B5CFF', hue: 252, name: 'Violet' },
  { hex: '#E86BE0', hue: 305, name: 'Orchid' },
];

const hueGap = (a: number, b: number) => { const d = Math.abs(a - b) % 360; return Math.min(d, 360 - d); };

/** Three distinct palette colours (hues at least 70 degrees apart), from a random source in [0, 1). */
export function dealTeamColors(rand: () => number = Math.random): Record<TeamSlot, string> {
  for (let attempt = 0; attempt < 200; attempt++) {
    const pick: typeof TEAM_PALETTE[number][] = [];
    const pool = [...TEAM_PALETTE];
    while (pick.length < 3 && pool.length) {
      const c = pool.splice(Math.floor(rand() * pool.length), 1)[0];
      if (pick.every((p) => hueGap(p.hue, c.hue) >= 70)) pick.push(c);
    }
    if (pick.length === 3) return { A: pick[0].hex, B: pick[1].hex, C: pick[2].hex };
  }
  return { ...TEAMS.colors };
}

/** Colour of a team slot from a teams view (falls back to the original accents). */
export function teamColor(view: { teams: { slot: TeamSlot; color: string }[] } | null | undefined, slot: TeamSlot): string {
  return view?.teams.find((t) => t.slot === slot)?.color ?? TEAMS.colors[slot];
}

/** How players get their team (decision 047): the host shuffles them, or everyone picks a team themselves. */
export type TeamMode = 'shuffle' | 'manual';

/** How many teams play Agawan Base (decision 049, owner 26 Nov 2026: small groups play with 2). */
export type TeamCount = 2 | 3;
/** The slots in play for a team count: A, B (and C). */
export const activeSlots = (count: TeamCount): TeamSlot[] => TEAM_SLOTS.slice(0, count);

export interface TeamView { slot: TeamSlot; name: string; color: string; captain: string | null }
/** What every client receives (protocol v9). */
export interface TeamsView {
  teams: TeamView[];
  /** Player id -> team slot. */
  members: Record<string, TeamSlot>;
  /** Players who nominated themselves as captain of their current team. */
  nominees: string[];
  /** Team setup is frozen (a match is running). */
  locked: boolean;
  /** Shuffle (the host deals the teams; players cannot switch) or manual (players pick). */
  mode: TeamMode;
  /** 2 or 3 teams (decision 049). `teams` lists only the teams in play. */
  count: TeamCount;
}

export type TeamResult = { ok: true } | { ok: false; reason: string };
const fail = (reason: string): TeamResult => ({ ok: false, reason });
const OK: TeamResult = { ok: true };

/** Validate and normalise a team name. `others` are the other teams' current names. */
export function validateTeamName(raw: unknown, others: string[]): { ok: true; name: string } | { ok: false; reason: string } {
  if (typeof raw !== 'string') return { ok: false, reason: 'Team name is missing' };
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f-\u009f]/.test(raw)) return { ok: false, reason: 'Team name has hidden characters' };
  const name = raw.normalize('NFC').trim().replace(/\s+/g, ' ');
  const len = [...name].length;
  if (len < TEAMS.nameMin) return { ok: false, reason: `Team name needs at least ${TEAMS.nameMin} characters` };
  if (len > TEAMS.nameMax) return { ok: false, reason: `Team name can have at most ${TEAMS.nameMax} characters` };
  if (!/^[\p{L}\p{N} '\-.&!?]+$/u.test(name)) return { ok: false, reason: 'Use letters, numbers, spaces and - \' . & ! ? only' };
  const key = name.toLocaleLowerCase();
  if (others.some((o) => o.toLocaleLowerCase() === key)) return { ok: false, reason: 'Another team already has that name' };
  return { ok: true, name };
}

/** Target team sizes for n players: sizes differ by at most one. */
export function balancedSizes(n: number, count: TeamCount = 3): number[] {
  const base = Math.floor(n / count), extra = n % count;
  return activeSlots(count).map((_, i) => base + (i < extra ? 1 : 0));
}

/** A player as the team book needs it: id, join order (older first), and whether it is a bot. */
export interface TeamPlayer { id: string; joinOrder: number; bot?: boolean }

export class TeamBook {
  private names: Record<TeamSlot, string> = { ...TEAMS.defaultNames };
  private captains: Record<TeamSlot, string | null> = { A: null, B: null, C: null };
  private member = new Map<string, TeamSlot>();
  private nominated = new Set<string>();
  private colors: Record<TeamSlot, string>;
  mode: TeamMode = 'shuffle';
  count: TeamCount = 3;
  locked = false;

  /** Slots in play. */
  get slots(): TeamSlot[] { return activeSlots(this.count); }

  /**
   * Host: play with 2 or 3 teams (decision 049). In shuffle mode everyone is dealt again; in manual mode only the
   * players of a team that closes move, each to the smallest open team. Captains of a closed team are cleared.
   */
  setCount(count: unknown, players: TeamPlayer[]): TeamResult {
    if (this.locked) return fail('Teams are locked while the match is running');
    if (count !== 2 && count !== 3) return fail('Play with 2 or 3 teams');
    if (count === this.count) return OK;
    this.count = count;
    for (const s of TEAM_SLOTS) if (!this.slots.includes(s)) this.captains[s] = null;
    if (this.mode === 'shuffle') return this.shuffle(players);
    for (const [id, s] of [...this.member]) if (!this.slots.includes(s)) { this.member.delete(id); this.nominated.delete(id); this.place(id); }
    this.autoCaptains(players);
    return OK;
  }

  constructor(private readonly rand: () => number = Math.random) { this.colors = dealTeamColors(rand); }

  colorOf(slot: TeamSlot): string { return this.colors[slot]; }
  /** Deal three new team colours (a new room, after a match, or the host's "New colours"). */
  recolor(): TeamResult {
    if (this.locked) return fail('Colours are locked while the match is running');
    const old = TEAM_SLOTS.map((s) => this.colors[s]).join();
    for (let i = 0; i < 5; i++) { this.colors = dealTeamColors(this.rand); if (TEAM_SLOTS.map((s) => this.colors[s]).join() !== old) break; }
    return OK;
  }

  /** Host: shuffle mode or manual picks. Switching to shuffle deals the teams at once. */
  setMode(mode: unknown, players: TeamPlayer[]): TeamResult {
    if (this.locked) return fail('Teams are locked while the match is running');
    if (mode !== 'shuffle' && mode !== 'manual') return fail('Unknown team mode');
    const was = this.mode;
    this.mode = mode;
    if (mode === 'shuffle' && was !== 'shuffle') this.shuffle(players);
    return OK;
  }

  /**
   * Host: deal everyone into random teams with sizes within one, then give each team a captain (a nominee if it has
   * one, else its earliest person). Players keep nothing of their old team.
   */
  shuffle(players: TeamPlayer[]): TeamResult {
    if (this.locked) return fail('Teams are locked while the match is running');
    const order = [...players];
    for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(this.rand() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
    const k = this.count;
    const start = Math.floor(this.rand() * k); // which team gets the extra seat varies too
    this.captains = { A: null, B: null, C: null };
    order.forEach((p, i) => { this.member.set(p.id, TEAM_SLOTS[(i + start) % k]); });
    this.autoCaptains(players);
    return OK;
  }

  teamOf(id: string): TeamSlot | null { return this.member.get(id) ?? null; }
  nameOf(slot: TeamSlot): string { return this.names[slot]; }
  captainOf(slot: TeamSlot): string | null { return this.captains[slot]; }
  size(slot: TeamSlot): number { let n = 0; for (const s of this.member.values()) if (s === slot) n++; return n; }
  membersOf(slot: TeamSlot): string[] { return [...this.member].filter(([, s]) => s === slot).map(([id]) => id); }

  /** Smallest team with room (ties: A, then B, then C), or null when all are full. */
  smallest(): TeamSlot | null {
    let best: TeamSlot | null = null;
    for (const s of this.slots) if (this.size(s) < this.capacity() && (best === null || this.size(s) < this.size(best))) best = s;
    return best;
  }

  /** Most players in one team: 10 with 3 teams, 15 with 2 (30 players either way). */
  capacity(): number { return Math.ceil(30 / this.count); }

  /** Place a newcomer (person, bot or late joiner) in the smallest team. Allowed while locked. */
  place(id: string): TeamSlot | null {
    const cur = this.member.get(id);
    if (cur) return cur;
    const s = this.smallest();
    if (s) this.member.set(id, s);
    return s;
  }

  /** The player left the room for good: drop membership, nomination and captaincy. */
  remove(id: string): void {
    const s = this.member.get(id);
    this.member.delete(id);
    this.nominated.delete(id);
    if (s && this.captains[s] === id) this.captains[s] = null;
  }

  private setTeam(id: string, slot: TeamSlot): void {
    const cur = this.member.get(id);
    if (cur === slot) return;
    if (cur && this.captains[cur] === id) this.captains[cur] = null;
    this.nominated.delete(id);
    this.member.set(id, slot);
  }

  /** A player picks a team (manual mode; the host may still move anyone in either mode). */
  join(id: string, slot: unknown, byHost = false): TeamResult {
    if (this.locked) return fail('Teams are locked while the match is running');
    if (this.mode === 'shuffle' && !byHost) return fail('The host shuffles the teams in this room');
    if (!this.slots.includes(slot as TeamSlot)) return fail('Unknown team');
    const s = slot as TeamSlot;
    if (this.member.get(id) === s) return OK;
    if (this.size(s) >= this.capacity()) return fail(`${this.names[s]} is full`);
    this.setTeam(id, s);
    return OK;
  }

  /** A player nominates themselves (or withdraws) as captain of their current team. */
  nominate(id: string, on: boolean): TeamResult {
    if (this.locked) return fail('Teams are locked while the match is running');
    if (!this.member.has(id)) return fail('Join a team first');
    if (on) this.nominated.add(id); else this.nominated.delete(id);
    return OK;
  }

  /** Host: rename a team. */
  rename(slot: unknown, raw: unknown): TeamResult {
    if (this.locked) return fail('Team names are locked while the match is running');
    if (!this.slots.includes(slot as TeamSlot)) return fail('Unknown team');
    const s = slot as TeamSlot;
    const v = validateTeamName(raw, TEAM_SLOTS.filter((x) => x !== s).map((x) => this.names[x]));
    if (!v.ok) return v;
    this.names[s] = v.name;
    return OK;
  }

  /** Host: appoint (or clear, with null) a team's captain. The captain must be a member of that team. */
  setCaptain(slot: unknown, id: unknown): TeamResult {
    if (this.locked) return fail('Captains are locked while the match is running');
    if (!this.slots.includes(slot as TeamSlot)) return fail('Unknown team');
    const s = slot as TeamSlot;
    if (id === null) { this.captains[s] = null; return OK; }
    if (typeof id !== 'string' || this.member.get(id) !== s) return fail('The captain must be a member of that team');
    this.captains[s] = id;
    return OK;
  }

  /** Host: move a player to another team. */
  move(id: unknown, slot: unknown): TeamResult {
    if (typeof id !== 'string' || !this.member.has(id)) return fail('Unknown player');
    return this.join(id, slot, true);
  }

  /**
   * Host: Auto-balance. Moves the fewest players so sizes differ by at most one, moving bots first, then people
   * who are not captains, newest joiners first. Larger teams keep the extra seat. Returns how many moved.
   */
  balance(players: TeamPlayer[]): number {
    if (this.locked) return 0;
    for (const p of players) this.place(p.id);
    const present = new Set(players.map((p) => p.id));
    const order = [...this.slots].sort((a, b) => this.present(b, present) - this.present(a, present) || TEAM_SLOTS.indexOf(a) - TEAM_SLOTS.indexOf(b));
    const sizes = balancedSizes(present.size, this.count);
    const target = Object.fromEntries(order.map((s, i) => [s, sizes[i]])) as Record<TeamSlot, number>;
    const movable = (s: TeamSlot) => players
      .filter((p) => this.member.get(p.id) === s && this.captains[s] !== p.id)
      .sort((a, b) => Number(!!b.bot) - Number(!!a.bot) || b.joinOrder - a.joinOrder);
    let moved = 0;
    for (const from of this.slots) {
      const extra = movable(from);
      while (this.present(from, present) > target[from] && extra.length) {
        const to = this.slots.find((s) => this.present(s, present) < target[s]);
        if (!to) break;
        this.setTeam(extra.shift()!.id, to);
        moved++;
      }
    }
    return moved;
  }

  private present(slot: TeamSlot, present: Set<string>): number {
    let n = 0;
    for (const [id, s] of this.member) if (s === slot && present.has(id)) n++;
    return n;
  }

  /** Host: give every team without a captain one: its earliest nominee, else its earliest member. Returns how many. */
  autoCaptains(players: TeamPlayer[]): number {
    if (this.locked) return 0;
    let n = 0;
    const byJoin = [...players].sort((a, b) => a.joinOrder - b.joinOrder);
    for (const s of this.slots) {
      if (this.captains[s] && this.member.get(this.captains[s]!) === s) continue;
      const mine = byJoin.filter((p) => this.member.get(p.id) === s);
      const pick = mine.find((p) => this.nominated.has(p.id) && !p.bot) ?? mine.find((p) => this.nominated.has(p.id))
        ?? mine.find((p) => !p.bot) ?? mine[0];
      if (pick) { this.captains[s] = pick.id; n++; }
    }
    return n;
  }

  /** Why a match that includes Agawan Base cannot start yet (empty = it can). */
  startProblems(playerIds: string[]): string[] {
    const present = new Set(playerIds);
    const problems: string[] = [];
    if (present.size < this.count) problems.push(`Agawan Base with ${this.count} teams needs at least ${this.count} players: add random players`);
    const counts = this.slots.map((s) => this.present(s, present));
    const unassigned = playerIds.filter((id) => !this.member.has(id)).length;
    if (unassigned) problems.push(`${unassigned} ${unassigned === 1 ? 'player has' : 'players have'} no team`);
    this.slots.forEach((s, i) => {
      if (counts[i] === 0) problems.push(`${this.names[s]} has no players`);
      if (counts[i] > this.capacity()) problems.push(`${this.names[s]} has more than ${this.capacity()} players`);
      const c = this.captains[s];
      if (!c || !present.has(c) || this.member.get(c) !== s) problems.push(`${this.names[s]} needs a captain`);
    });
    if (Math.max(...counts) - Math.min(...counts) > 1) problems.push('Team sizes differ by more than one: use Auto-balance');
    return problems;
  }

  /** Back to defaults (a room that empties out). */
  reset(): void {
    this.names = { ...TEAMS.defaultNames };
    this.captains = { A: null, B: null, C: null };
    this.member.clear();
    this.nominated.clear();
    this.locked = false;
    this.mode = 'shuffle';
    this.count = 3;
    this.colors = dealTeamColors(this.rand);
  }

  view(): TeamsView {
    return {
      teams: this.slots.map((s) => ({ slot: s, name: this.names[s], color: this.colors[s], captain: this.captains[s] })),
      members: Object.fromEntries(this.member),
      nominees: [...this.nominated],
      locked: this.locked,
      mode: this.mode,
      count: this.count,
    };
  }
}
