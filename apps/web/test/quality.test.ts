import { describe, expect, it } from 'vitest';
import { nextStepDown, QUALITY_ORDER } from '../src/game/quality.ts';

describe('adaptive quality steps (decision 026)', () => {
  it('lowers the resolution before the tier', () => {
    expect(nextStepDown('high', 1.5)).toEqual({ tier: 'high', dpr: 1 });
  });
  it('steps high -> medium -> low, then stops', () => {
    expect(nextStepDown('high', 1)).toEqual({ tier: 'medium', dpr: 1 });
    expect(nextStepDown('medium', 1)).toEqual({ tier: 'low', dpr: 1 });
    expect(nextStepDown('low', 1)).toBeNull();
  });
  it('orders tiers from cheapest to richest', () => {
    expect(QUALITY_ORDER).toEqual(['low', 'medium', 'high']);
  });
});
