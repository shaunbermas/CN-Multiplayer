// Shared contestant colourways (owner pack, 22 Nov 2026): one model, 30 colour presets, unique per room,
// kept on reconnect.
import { describe, expect, it } from 'vitest';
import { CONTESTANT_COLORWAYS, MAX_PLAYERS, colorwayById, dealColorway, sanitizePlayerKey } from '../src/index.ts';

const lum = (hex: string) => {
  const c = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};

describe('contestant colourways', () => {
  it('has exactly 30 records (one per seat) with stable ids CW01–CW30 and valid colours', () => {
    expect(CONTESTANT_COLORWAYS).toHaveLength(30);
    expect(CONTESTANT_COLORWAYS.length).toBe(MAX_PLAYERS);
    CONTESTANT_COLORWAYS.forEach((c, i) => {
      expect(c.id).toBe(`CW${String(i + 1).padStart(2, '0')}`);
      for (const k of ['coatBase', 'coatSecondary', 'trim', 'beltAccent', 'identifierAccent'] as const) expect(c[k]).toMatch(/^[0-9A-F]{6}$/i);
    });
    expect(new Set(CONTESTANT_COLORWAYS.map((c) => c.coatBase)).size).toBe(30);
    expect(new Set(CONTESTANT_COLORWAYS.map((c) => c.displayName)).size).toBe(30);
  });

  it('keeps the trim and identifier accent readable against the coat (value contrast, not hue only)', () => {
    for (const c of CONTESTANT_COLORWAYS) {
      const base = lum(c.coatBase);
      expect((lum(c.trim) + 0.05) / (base + 0.05)).toBeGreaterThan(2.5);
      expect((lum(c.identifierAccent) + 0.05) / (base + 0.05)).toBeGreaterThan(4.5);
    }
  });

  it('deals 30 different colourways to 30 players whatever the random numbers; the 31st gets none', () => {
    for (const seed of [0, 0.3, 0.999]) {
      let x = seed;
      const rand = () => { x = ((x * 9301 + 49297) % 233280) / 233280; return x; };
      const taken: string[] = [];
      for (let i = 0; i < 30; i++) taken.push(dealColorway(taken, rand)!);
      expect(new Set(taken).size).toBe(30);
      expect(taken.every((id) => colorwayById(id))).toBe(true);
      expect(dealColorway(taken, rand)).toBeUndefined();
    }
  });

  it('gives a returning player the same colourway when it is still free, and never a duplicate', () => {
    expect(dealColorway(['CW01', 'CW02'], () => 0, 'CW17')).toBe('CW17');
    expect(dealColorway(['CW17'], () => 0, 'CW17')).toBe('CW01');   // taken meanwhile: a free one instead
    expect(dealColorway([], () => 0, 'CW99')).toBe('CW01');          // unknown preference ignored
  });

  it('accepts only opaque player keys', () => {
    expect(sanitizePlayerKey('a1b2c3d4e5f6a7b8c9d0e1f2')).toBe('a1b2c3d4e5f6a7b8c9d0e1f2');
    for (const bad of ['short', 'has space in it', 'x'.repeat(41), 42, null, '<script>alert(1)</script>']) expect(sanitizePlayerKey(bad)).toBeUndefined();
  });
});
