import { describe, expect, it } from 'vitest';
import { dprSteps, nextStepDown, nextStepUp, QUALITY_ORDER } from '../src/game/quality.ts';

describe('adaptive quality steps (decision 026, optimisation pass 25 Nov 2026)', () => {
  it('caps the resolution steps at 1.25 and walks down to 0.85', () => {
    expect(dprSteps(2)).toEqual([1.25, 1, 0.85]);
    expect(dprSteps(1)).toEqual([1, 0.85]);
  });
  it('lowers the resolution before the tier', () => {
    expect(nextStepDown('high', 1)).toEqual({ tier: 'high', dpr: 0.85 });
  });
  it('keeps the tier when the frame rate is only a little under target', () => {
    expect(nextStepDown('high', 0.85, 45)).toBeNull();
  });
  it('steps high -> medium -> low at the lowest resolution when far under target, then stops', () => {
    expect(nextStepDown('high', 0.85, 30)).toEqual({ tier: 'medium', dpr: 0.85 });
    expect(nextStepDown('medium', 0.85, 30)).toEqual({ tier: 'low', dpr: 0.85 });
    expect(nextStepDown('low', 0.85, 30)).toBeNull();
  });
  it('recovers sharpness one resolution step at a time', () => {
    expect(nextStepUp(0.85)).toBe(1);
    expect(nextStepUp(1)).toBeNull();
  });
  it('orders tiers from cheapest to richest', () => {
    expect(QUALITY_ORDER).toEqual(['low', 'medium', 'high']);
  });
});
