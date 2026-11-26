import { describe, expect, it } from 'vitest';
import { AGAWAN, HUNT, Match, TeamChampionship, placeTeams, type Placing, type StageScore, type TeamSlot } from '../src/index.ts';

const RL = 'STAGE_01_RED_LIGHT', AG = AGAWAN.id, HU = HUNT.id;
const sc = (id: string, points: number): StageScore => ({ id, place: 1, status: 'finished', finishTime: 1, points, first: false });
const roster: Record<string, TeamSlot> = { a1: 'A', a2: 'A', a3: 'A', b1: 'B', b2: 'B', c1: 'C', c2: 'C' };
const agPlacing = (id: string, team: TeamSlot, teamPlace: number, teamScore: number): Placing =>
  ({ id, place: 1, status: 'active', finishTime: -1, progress: 0, qualified: false, points: 0, team, teamPlace, teamScore });

describe('team championship', () => {
  it('places teams with shared ties that skip the next place', () => {
    expect(placeTeams({ A: 5, B: 5, C: 1 })).toEqual({ A: 1, B: 1, C: 3 });
    expect(placeTeams({ A: 1, B: 4, C: 4 })).toEqual({ A: 3, B: 1, C: 1 });
    expect(placeTeams({ A: 2, B: 2, C: 2 })).toEqual({ A: 1, B: 1, C: 1 });
  });

  it('ranks Stage 01 by team average over the whole roster (missing scores count as zero)', () => {
    const c = new TeamChampionship([RL, AG, HU]);
    // A: 2 + 1 + (a3 left, no score) = 3 / 3 roster = 1.00 ; B: (1 + 2) / 2 = 1.50 ; C: (1 + 0) / 2 = 0.50
    const r = c.record(0, RL, [sc('a1', 2), sc('a2', 1), sc('b1', 1), sc('b2', 2), sc('c1', 1), sc('c2', 0)], [], roster);
    expect(r.by).toBe('average');
    expect(r.value).toEqual({ A: 1, B: 1.5, C: 0.5 });
    expect(r.roster).toEqual({ A: 3, B: 2, C: 2 });
    expect(r.place).toEqual({ A: 2, B: 1, C: 3 });
    expect(r.points).toEqual({ A: 2, B: 3, C: 1 });
  });

  it('ranks Agawan Base by the engine team placement (3 / 2 / 1) and keeps the team score', () => {
    const c = new TeamChampionship([RL, AG, HU]);
    const r = c.record(1, AG, [], [agPlacing('c1', 'C', 1, 17), agPlacing('a1', 'A', 2, 9), agPlacing('a2', 'A', 2, 9), agPlacing('b1', 'B', 3, 4)], roster);
    expect(r.by).toBe('score');
    expect(r.points).toEqual({ A: 2, B: 1, C: 3 });
    expect(r.value).toEqual({ A: 9, B: 4, C: 17 });
  });

  it('adds stage points; ties break on Agawan score, then Stage 01 average, then joint champions', () => {
    const c = new TeamChampionship([RL, AG]);
    c.record(0, RL, [sc('a1', 2), sc('b1', 1), sc('c1', 0)], [], { a1: 'A', b1: 'B', c1: 'C' }); // A 3, B 2, C 1
    c.record(1, AG, [], [agPlacing('b1', 'B', 1, 12), agPlacing('a1', 'A', 2, 10), agPlacing('c1', 'C', 3, 1)], { a1: 'A', b1: 'B', c1: 'C' }); // B 3, A 2, C 1
    const s = c.standings();
    expect(s.map((t) => [t.slot, t.points, t.rank])).toEqual([['B', 5, 1], ['A', 5, 2], ['C', 2, 3]]); // B wins on Agawan score
    expect(TeamChampionship.tieBreak(s[0], s[1])).toBe('a higher Agawan Base score');
    expect(s[0].perStage).toEqual([2, 3]);

    const j = new TeamChampionship([RL, AG]);
    j.record(0, RL, [sc('a1', 1), sc('b1', 1), sc('c1', 0)], [], { a1: 'A', b1: 'B', c1: 'C' }); // A 3, B 3, C 1
    j.record(1, AG, [], [agPlacing('a1', 'A', 1, 6), agPlacing('b1', 'B', 1, 6), agPlacing('c1', 'C', 3, 0)], { a1: 'A', b1: 'B', c1: 'C' });
    const js = j.standings();
    expect(js.filter((t) => t.rank === 1).map((t) => t.slot)).toEqual(['A', 'B']); // joint champions
  });

  it('records once per round through the Match and only when teams are on', () => {
    const m = new Match([RL, AG]);
    const players = [{ id: 'a1', name: 'a', joinOrder: 1 }, { id: 'b1', name: 'b', joinOrder: 2 }, { id: 'c1', name: 'c', joinOrder: 3 }];
    const placings: Placing[] = players.map((p, i) => ({ id: p.id, place: i + 1, status: i === 0 ? 'finished' : 'spotted', finishTime: i === 0 ? 10 : -1, progress: 1, qualified: true }));
    m.record(1, placings, players, { a1: 'A', b1: 'B', c1: 'C' });
    expect(m.teamStandings()).toBeNull();
    const t = new Match([RL, AG]);
    t.enableTeams();
    t.record(1, placings, players, { a1: 'A', b1: 'B', c1: 'C' });
    expect(t.record(1, placings, players, { a1: 'A', b1: 'B', c1: 'C' })).toBeNull();
    expect(t.teamStandings()!.map((x) => [x.slot, x.points])).toEqual([['A', 3], ['B', 2], ['C', 2]]);
    expect(t.lastTeamStage?.points).toEqual({ A: 3, B: 2, C: 2 });
  });
});
