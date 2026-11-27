// Stage 02 · AGAWAN BASE team lobby rules (handoff pack 03, test matrix rows 1-10; captains removed by decision 053).
import { describe, expect, it } from 'vitest';
import { TEAMS, TEAM_PALETTE, rng, TeamBook, balancedSizes, dealTeamColors, validateTeamName, type TeamPlayer } from '../src/index.ts';

const people = (n: number, bots = 0): TeamPlayer[] => Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, joinOrder: i + 1, bot: i >= n - bots }));
/** Manual mode (players pick their team); shuffle mode is covered in its own block below. */
const manualBook = () => { const b = new TeamBook(); b.mode = 'manual'; return b; };
const sizes = (b: TeamBook) => (['A', 'B', 'C'] as const).map((s) => b.size(s));

describe('team sizes', () => {
  it.each([[25, [9, 8, 8]], [26, [9, 9, 8]], [27, [9, 9, 9]], [28, [10, 9, 9]], [29, [10, 10, 9]], [30, [10, 10, 10]]])(
    '%i players balance to %j', (n, want) => {
      expect(balancedSizes(n)).toEqual(want);
      const b = manualBook();
      const ps = people(n);
      for (const p of ps) b.join(p.id, 'A'); // as many as fit pile into A (10), the rest land nowhere
      for (const p of ps) b.place(p.id);
      b.balance(ps);
      expect([...sizes(b)].sort((x, y) => y - x)).toEqual(want);
      expect(Math.max(...sizes(b))).toBeLessThanOrEqual(TEAMS.maxPerTeam);
    });

  it('newcomers go to the smallest team, and a full team refuses joins', () => {
    const b = manualBook();
    for (const p of people(6)) b.place(p.id);
    expect(sizes(b)).toEqual([2, 2, 2]);
    const c = manualBook();
    for (let i = 0; i < 10; i++) expect(c.join(`a${i}`, 'A').ok).toBe(true);
    const r = c.join('late', 'A');
    expect(r.ok).toBe(false);
    expect(c.size('A')).toBe(10);
  });

  it('auto-balance moves the fewest players, bots first, then the newest joiners', () => {
    const b = manualBook();
    const ps = [...people(8), { id: 'bot1', joinOrder: 9, bot: true }];
    for (const p of ps) b.join(p.id, 'A');
    const moved = b.balance(ps);
    expect(moved).toBe(6);
    expect(sizes(b)).toEqual([3, 3, 3]);
    expect(b.teamOf('p1')).toBe('A'); // the earliest joiners stay
    expect(b.teamOf('bot1')).not.toBe('A');
    expect(b.balance(ps)).toBe(0); // already balanced: nothing moves
  });
});

describe('team names', () => {
  it('defaults to Team A / B / C and accepts a valid rename', () => {
    const b = manualBook();
    expect(b.view().teams.map((t) => t.name)).toEqual(['Team A', 'Team B', 'Team C']);
    expect(b.rename('B', '  Night   Owls ').ok).toBe(true);
    expect(b.nameOf('B')).toBe('Night Owls');
    expect(b.view().teams[1].color).toBe(b.colorOf('B')); // the slot keeps its colour when renamed
  });

  it('rejects duplicates (any case), blanks, markup, control characters and long names', () => {
    const b = manualBook();
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

describe('decision 053: no captains', () => {
  it('the team view has no captain or nominees, and a player who leaves frees their seat', () => {
    const b = manualBook();
    b.join('a', 'A');
    const v = b.view() as unknown as Record<string, unknown>;
    expect('nominees' in v).toBe(false);
    expect(b.view().teams.every((t) => !('captain' in t))).toBe(true);
    b.remove('a');
    expect(b.teamOf('a')).toBeNull();
    expect(b.size('A')).toBe(0);
  });
});

describe('start gating and locking', () => {
  it('lists every reason the match cannot start, then none once fixed', () => {
    const b = manualBook();
    expect(b.startProblems(['a', 'b'])[0]).toMatch(/at least 3 players/);
    const ps = people(7);
    for (const p of ps) b.join(p.id, 'A');
    const before = b.startProblems(ps.map((p) => p.id));
    expect(before.some((x) => /Team B has no players/.test(x))).toBe(true);
    expect(before.some((x) => /captain/.test(x))).toBe(false);
    expect(before.some((x) => /differ by more than one/.test(x))).toBe(true);
    b.balance(ps);
    expect(b.startProblems(ps.map((p) => p.id))).toEqual([]);
  });

  it('locked teams refuse every change but still place newcomers', () => {
    const b = manualBook();
    b.join('a', 'A');
    b.locked = true;
    expect(b.join('a', 'B').ok).toBe(false);
    expect(b.rename('A', 'New Name').ok).toBe(false);
    expect(b.balance([{ id: 'a', joinOrder: 1 }])).toBe(0);
    expect(b.place('late')).toBe('B');
    expect(b.view().locked).toBe(true);
  });

  it('two books never share state (one per room)', () => {
    const r1 = manualBook(), r2 = manualBook();
    r1.rename('A', 'Room One'); r1.join('p', 'C');
    expect(r2.nameOf('A')).toBe('Team A');
    expect(r2.teamOf('p')).toBeNull();
  });
});

describe('decision 047: shuffle mode and team colours', () => {
  it('shuffle deals everyone into balanced random teams, and players cannot switch', () => {
    let seed = 7;
    const b = new TeamBook(() => ((seed = (seed * 16807) % 2147483647) / 2147483647));
    const ps = people(28, 20);
    expect(b.mode).toBe('shuffle');
    expect(b.shuffle(ps).ok).toBe(true);
    expect(Math.max(...sizes(b)) - Math.min(...sizes(b))).toBeLessThanOrEqual(1);
    expect(sizes(b).reduce((a, n) => a + n, 0)).toBe(28);
    const r = b.join('p1', b.teamOf('p1') === 'A' ? 'B' : 'A');
    expect(r.ok).toBe(false);
    expect(b.move('p1', b.teamOf('p1') === 'A' ? 'B' : 'A').ok).toBe(true); // the host may still move anyone
  });
  it('switching to manual lets players pick; switching back reshuffles', () => {
    const b = new TeamBook();
    const ps = people(9);
    expect(b.setMode('manual', ps).ok).toBe(true);
    expect(b.join('p1', 'C').ok).toBe(true);
    expect(b.setMode('shuffle', ps).ok).toBe(true);
    expect(sizes(b)).toEqual(expect.arrayContaining([3, 3, 3]));
  });
  it('colours are three distinct palette colours, re-dealt on request, locked during a match', () => {
    for (let i = 0; i < 50; i++) {
      const c = dealTeamColors();
      expect(new Set([c.A, c.B, c.C]).size).toBe(3);
      for (const h of [c.A, c.B, c.C]) expect(TEAM_PALETTE.some((x) => x.hex === h)).toBe(true);
    }
    const b = new TeamBook();
    const before = b.view().teams.map((t) => t.color).join();
    expect(b.recolor().ok).toBe(true);
    expect(b.view().teams.map((t) => t.color).join()).not.toBe(before);
    b.locked = true;
    expect(b.recolor().ok).toBe(false);
  });
});

describe('2 or 3 teams (decision 049)', () => {
  const ps = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `p${i}`, joinOrder: i + 1 }));
  it('shuffle mode deals everyone into A and B only, sizes within one, and back to three', () => {
    const b = new TeamBook(rng(5));
    const players = ps(7);
    b.shuffle(players);
    expect(b.setCount(2, players)).toEqual({ ok: true });
    expect(b.view().teams.map((t) => t.slot)).toEqual(['A', 'B']);
    expect(b.view().count).toBe(2);
    const sizes = ['A', 'B'].map((s) => b.size(s as 'A'));
    expect(sizes[0] + sizes[1]).toBe(7);
    expect(Math.abs(sizes[0] - sizes[1])).toBeLessThanOrEqual(1);
    expect(b.size('C')).toBe(0);
    expect(b.startProblems(players.map((p) => p.id))).toEqual([]);
    b.setCount(3, players);
    expect(b.view().teams).toHaveLength(3);
    expect(b.startProblems(players.map((p) => p.id))).toEqual([]);
  });

  it('manual mode moves only team C players; C cannot be joined, newcomers go to A or B', () => {
    const b = new TeamBook(rng(6));
    const players = ps(6);
    b.setMode('manual', players);
    players.forEach((p, i) => b.join(p.id, ['A', 'B', 'C'][i % 3]));
    const before = { p0: b.teamOf('p0'), p1: b.teamOf('p1') };
    b.setCount(2, players);
    expect(b.teamOf('p0')).toBe(before.p0);
    expect(b.teamOf('p1')).toBe(before.p1);
    expect(['A', 'B']).toContain(b.teamOf('p2'));
    expect(b.join('p0', 'C').ok).toBe(false);
    expect(['A', 'B']).toContain(b.place('late'));
  });

  it('two teams hold 15 each; 2 players are enough; locked during a match; only 2 or 3', () => {
    const b = new TeamBook(rng(7));
    expect(b.setCount(4, []).ok).toBe(false);
    b.setCount(2, []);
    expect(b.capacity()).toBe(15);
    const two = ps(2); b.shuffle(two);
    expect(b.startProblems(two.map((p) => p.id))).toEqual([]);
    b.locked = true;
    expect(b.setCount(3, two).ok).toBe(false);
  });
});
