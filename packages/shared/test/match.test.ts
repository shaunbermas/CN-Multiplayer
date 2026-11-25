// Stage 01 refinement: accumulated points across stages (packages/shared/src/match.ts).
import { describe, expect, it } from 'vitest';
import { MATCH, Match, matchOrder, scoreStage, tieBreakReason, type Placing } from '../src/index.ts';

const pl = (id: string, place: number, status: Placing['status'], finishTime = -1): Placing => ({ id, place, status, finishTime, progress: 0, qualified: false });
const refs = (ids: string[]) => ids.map((id, i) => ({ id, name: id.toUpperCase(), joinOrder: i }));

describe('stage points', () => {
  it('first finisher 2, other finishers 1, eliminated and unfinished 0', () => {
    const s = scoreStage([pl('a', 1, 'finished', 40.1), pl('b', 2, 'finished', 44), pl('c', 3, 'active'), pl('d', 4, 'spotted')]);
    expect(s.map((x) => [x.id, x.points, x.first])).toEqual([['a', 2, true], ['b', 1, false], ['c', 0, false], ['d', 0, false]]);
    expect(MATCH.points).toEqual({ first: 2, finished: 1, eliminated: 0, unfinished: 0 });
  });

  it('awards first place to exactly one player, by the server finish time', () => {
    const s = scoreStage([pl('b', 1, 'finished', 41), pl('a', 2, 'finished', 41.5), pl('c', 3, 'finished', 41.5)]);
    expect(s.filter((x) => x.first)).toHaveLength(1);
    expect(s.find((x) => x.first)!.id).toBe('b');
    expect(scoreStage([pl('a', 1, 'spotted')]).every((x) => !x.first && x.points === 0)).toBe(true);
  });
});

describe('match', () => {
  it('plays the configured number of stages (Stage 01 repeats until other stages exist)', () => {
    expect(matchOrder(3)).toEqual(['STAGE_01_RED_LIGHT', 'STAGE_01_RED_LIGHT', 'STAGE_01_RED_LIGHT']);
    expect(matchOrder(3, ['S1', 'S2'])).toEqual(['S1', 'S2', 'S1']);
    const m = new Match(['S1', 'S2']);
    expect(m.isFinal).toBe(false);
    expect(m.advance()).toBe(true);
    expect(m.isFinal).toBe(true);
    expect(m.advance()).toBe(false);
  });

  it('accumulates points across stages and keeps eliminated players\' earlier points', () => {
    const m = new Match(['S', 'S', 'S']);
    m.record(1, [pl('a', 1, 'finished', 40), pl('b', 2, 'finished', 45), pl('c', 3, 'spotted')], refs(['a', 'b', 'c']));
    m.advance();
    m.record(2, [pl('b', 1, 'finished', 39), pl('a', 2, 'spotted'), pl('c', 3, 'finished', 50)], refs(['a', 'b', 'c']));
    m.advance();
    m.record(3, [pl('c', 1, 'finished', 38), pl('a', 2, 'finished', 41), pl('b', 3, 'active')], refs(['a', 'b', 'c']));
    const st = m.standings();
    expect(Object.fromEntries(st.map((s) => [s.id, s.points]))).toEqual({ a: 3, b: 3, c: 3 });
    expect(st.find((s) => s.id === 'a')!.perStage).toEqual([2, 0, 1]);
  });

  it('records a stage exactly once (no duplicate awards)', () => {
    const m = new Match(['S']);
    const placings = [pl('a', 1, 'finished', 40)];
    expect(m.record(7, placings, refs(['a']))).not.toBeNull();
    expect(m.record(7, placings, refs(['a']))).toBeNull();
    expect(m.standings()[0].points).toBe(2);
  });

  it('breaks ties: points, then stage wins, finishes, total time, last place, join order', () => {
    const m = new Match(['S', 'S']);
    // a: 2 + 0 (one win, one finish, 40 s). x: joins for stage 2 and wins it: 0 + 2 (one win, one finish, 30 s).
    // b: 1 + 1 (no win, two finishes). c: 1 + 1, slower than b.
    m.record(1, [pl('a', 1, 'finished', 40), pl('b', 2, 'finished', 41), pl('c', 3, 'finished', 42)], refs(['a', 'b', 'c']));
    m.advance();
    m.record(2, [pl('x', 1, 'finished', 30), pl('b', 2, 'finished', 44), pl('c', 3, 'finished', 45), pl('a', 4, 'spotted')], refs(['a', 'b', 'c', 'x']));
    const st = m.standings();
    // Everyone has 2 points. b and c have no win; a and x one each; x has the faster finish time.
    expect(st.map((s) => s.points)).toEqual([2, 2, 2, 2]);
    expect(st.map((s) => s.id)).toEqual(['x', 'a', 'b', 'c']);
    expect(tieBreakReason(st[0], st[1])).toBe('faster total finish time');
    expect(tieBreakReason(st[1], st[2])).toBe('more stage wins');
    expect(tieBreakReason(st[2], st[3])).toBe('faster total finish time');
    expect(st.map((s) => s.rank)).toEqual([1, 2, 3, 4]);
  });

  it('a late joiner starts at zero; a leaver keeps their points, marked as left', () => {
    const m = new Match(['S', 'S']);
    m.record(1, [pl('a', 1, 'finished', 40)], refs(['a']));
    m.ensure({ id: 'late', name: 'Late', joinOrder: 5 });
    m.markLeft('a');
    const st = m.standings();
    expect(st.find((s) => s.id === 'late')).toMatchObject({ points: 0, perStage: [null, null] });
    expect(st.find((s) => s.id === 'a')).toMatchObject({ points: 2, left: true });
  });
});
