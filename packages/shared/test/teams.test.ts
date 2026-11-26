// Stage 02 · AGAWAN BASE team lobby rules (handoff pack 03_TEAM_LOBBY_AND_CAPTAIN_MANAGEMENT, test matrix rows 1-10).
import { describe, expect, it } from 'vitest';
import { TEAMS, TeamBook, balancedSizes, validateTeamName, type TeamPlayer } from '../src/index.ts';

const people = (n: number, bots = 0): TeamPlayer[] => Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, joinOrder: i + 1, bot: i >= n - bots }));
const sizes = (b: TeamBook) => (['A', 'B', 'C'] as const).map((s) => b.size(s));

describe('team sizes', () => {
  it.each([[25, [9, 8, 8]], [26, [9, 9, 8]], [27, [9, 9, 9]], [28, [10, 9, 9]], [29, [10, 10, 9]], [30, [10, 10, 10]]])(
    '%i players balance to %j', (n, want) => {
      expect(balancedSizes(n)).toEqual(want);
      const b = new TeamBook();
      const ps = people(n);
      for (const p of ps) b.join(p.id, 'A'); // as many as fit pile into A (10), the rest land nowhere
      for (const p of ps) b.place(p.id);
      b.balance(ps);
      expect([...sizes(b)].sort((x, y) => y - x)).toEqual(want);
      expect(Math.max(...sizes(b))).toBeLessThanOrEqual(TEAMS.maxPerTeam);
    });

  it('newcomers go to the smallest team, and a full team refuses joins', () => {
    const b = new TeamBook();
    for (const p of people(6)) b.place(p.id);
    expect(sizes(b)).toEqual([2, 2, 2]);
    const c = new TeamBook();
    for (let i = 0; i < 10; i++) expect(c.join(`a${i}`, 'A').ok).toBe(true);
    const r = c.join('late', 'A');
    expect(r.ok).toBe(false);
    expect(c.size('A')).toBe(10);
  });

  it('auto-balance moves the fewest players, bots first, and never the captain', () => {
    const b = new TeamBook();
    const ps = [...people(8), { id: 'bot1', joinOrder: 9, bot: true }];
    for (const p of ps) b.join(p.id, 'A');
    b.setCaptain('A', 'p8');
    const moved = b.balance(ps);
    expect(moved).toBe(6);
    expect(sizes(b)).toEqual([3, 3, 3]);
    expect(b.teamOf('p8')).toBe('A');
    expect(b.teamOf('bot1')).not.toBe('A');
    expect(b.balance(ps)).toBe(0); // already balanced: nothing moves
  });
});

describe('team names', () => {
  it('defaults to Team A / B / C and accepts a valid rename', () => {
    const b = new TeamBook();
    expect(b.view().teams.map((t) => t.name)).toEqual(['Team A', 'Team B', 'Team C']);
    expect(b.rename('B', '  Night   Owls ').ok).toBe(true);
    expect(b.nameOf('B')).toBe('Night Owls');
    expect(b.view().teams[1].color).toBe('#36B2C9'); // the slot keeps its colour
  });

  it('rejects duplicates (any case), blanks, markup, control characters and long names', () => {
    const b = new TeamBook();
    expect(b.rename('A', 'team b').ok).toBe(false);
    expect(validateTeamName('   ', []).ok).toBe(false);
    expect(validateTeamName('A', []).ok).toBe(false);
    expect(validateTeamName('<b>Bold</b>', []).ok).toBe(false);
    expect(validateTeamName('Tab\there', []).ok).toBe(false);
    expect(validateTeamName('x'.repeat(19), []).ok).toBe(false);
    expect(validateTeamName('Mga Bituin!', []).ok).toBe(true);
    expect(validateTeamName('Ñiño & Co.', []).ok).toBe(true);
  });
});

describe('captains', () => {
  it('a nominee or any member can be appointed; a non-member cannot', () => {
    const b = new TeamBook();
    b.join('a', 'A'); b.join('b', 'A'); b.join('c', 'B');
    expect(b.nominate('a', true).ok).toBe(true);
    expect(b.nominate('b', true).ok).toBe(true);
    expect(b.view().nominees.sort()).toEqual(['a', 'b']);
    expect(b.setCaptain('A', 'b').ok).toBe(true); // host picks exactly one
    expect(b.captainOf('A')).toBe('b');
    expect(b.setCaptain('A', 'c').ok).toBe(false);
    expect(b.setCaptain('A', null).ok).toBe(true);
    expect(b.captainOf('A')).toBeNull();
  });

  it('switching team clears captaincy and nomination', () => {
    const b = new TeamBook();
    b.join('a', 'A'); b.nominate('a', true); b.setCaptain('A', 'a');
    b.join('a', 'B');
    expect(b.captainOf('A')).toBeNull();
    expect(b.view().nominees).toEqual([]);
  });

  it('auto-pick prefers the earliest human nominee, then the earliest human member', () => {
    const b = new TeamBook();
    const ps: TeamPlayer[] = [{ id: 'bot', joinOrder: 1, bot: true }, { id: 'x', joinOrder: 2 }, { id: 'y', joinOrder: 3 }, { id: 'z', joinOrder: 4 }];
    b.join('bot', 'A'); b.join('x', 'A'); b.join('y', 'A'); b.join('z', 'B');
    b.nominate('y', true);
    expect(b.autoCaptains(ps)).toBe(2); // C has nobody
    expect(b.captainOf('A')).toBe('y');
    expect(b.captainOf('B')).toBe('z');
    expect(b.captainOf('C')).toBeNull();
  });

  it('a captain who leaves the room frees the seat', () => {
    const b = new TeamBook();
    b.join('a', 'A'); b.setCaptain('A', 'a');
    b.remove('a');
    expect(b.captainOf('A')).toBeNull();
    expect(b.teamOf('a')).toBeNull();
  });
});

describe('start gating and locking', () => {
  it('lists every reason the match cannot start, then none once fixed', () => {
    const b = new TeamBook();
    expect(b.startProblems(['a', 'b'])[0]).toMatch(/at least 3 players/);
    const ps = people(7);
    for (const p of ps) b.join(p.id, 'A');
    const before = b.startProblems(ps.map((p) => p.id));
    expect(before.some((x) => /Team B has no players/.test(x))).toBe(true);
    expect(before.some((x) => /needs a captain/.test(x))).toBe(true);
    expect(before.some((x) => /differ by more than one/.test(x))).toBe(true);
    b.balance(ps);
    b.autoCaptains(ps);
    expect(b.startProblems(ps.map((p) => p.id))).toEqual([]);
  });

  it('locked teams refuse every change but still place newcomers', () => {
    const b = new TeamBook();
    b.join('a', 'A');
    b.locked = true;
    expect(b.join('a', 'B').ok).toBe(false);
    expect(b.rename('A', 'New Name').ok).toBe(false);
    expect(b.setCaptain('A', 'a').ok).toBe(false);
    expect(b.nominate('a', true).ok).toBe(false);
    expect(b.balance([{ id: 'a', joinOrder: 1 }])).toBe(0);
    expect(b.place('late')).toBe('B');
    expect(b.view().locked).toBe(true);
  });

  it('two books never share state (one per room)', () => {
    const r1 = new TeamBook(), r2 = new TeamBook();
    r1.rename('A', 'Room One'); r1.join('p', 'C');
    expect(r2.nameOf('A')).toBe('Team A');
    expect(r2.teamOf('p')).toBeNull();
  });
});
