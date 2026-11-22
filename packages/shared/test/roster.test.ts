// Randomised contestants (owner decision, 22 Nov 2026): 30 distinct characters, never duplicated in a room.
import { describe, expect, it } from 'vitest';
import { CONTESTANT_ROSTER, MAX_PLAYERS, ROSTER_SIZE, dealCharacter } from '../src/index.ts';

describe('contestant roster', () => {
  it('has exactly one character per seat (30), each with a distinct look', () => {
    expect(ROSTER_SIZE).toBe(MAX_PLAYERS);
    expect(CONTESTANT_ROSTER).toHaveLength(30);
    expect(new Set(CONTESTANT_ROSTER.map((c) => c.id)).size).toBe(30);
    expect(new Set(CONTESTANT_ROSTER.map((c) => [c.headwear, c.face, c.coat, c.scarf, c.pack].join('|'))).size).toBe(30);
    expect(new Set(CONTESTANT_ROSTER.map((c) => c.coat)).size).toBe(30);
  });

  it('never pairs a hood with a yellow coat (keeps clear of an existing game character)', () => {
    for (const c of CONTESTANT_ROSTER) if (c.headwear === 'hood') expect(c.coat.toLowerCase().startsWith('#8a6a')).toBe(false);
  });

  it('deals 30 different characters to 30 players, whatever the random numbers', () => {
    for (const seed of [0, 0.3, 0.999, 0.5]) {
      let x = seed;
      const rand = () => { x = (x * 9301 + 49297) % 233280 / 233280; return x; };
      const taken: string[] = [];
      for (let i = 0; i < 30; i++) { const id = dealCharacter(taken, rand); expect(id).toBeDefined(); taken.push(id!); }
      expect(new Set(taken).size).toBe(30);
      expect(dealCharacter(taken, rand)).toBeUndefined();
    }
  });

  it('re-deals a character freed by a player who left', () => {
    const taken = CONTESTANT_ROSTER.slice(1).map((c) => c.id); // CHR_01 is free
    expect(dealCharacter(taken)).toBe('CHR_01');
  });
});
