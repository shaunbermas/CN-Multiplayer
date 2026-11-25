// Decision 044 (owner, 25 Nov 2026): 01 Red Light, Green Light, 02 Agawan Base, 03 The Hunt.
import { describe, expect, it } from 'vitest';
import { AGAWAN_ENABLED, AGAWAN_STAGE_ID, HUNT, MATCH_ORDER, Match, OFFICIAL_ORDER, STARTABLE_STAGES, getStage, resolveStageId, stageNumber } from '../src/index.ts';

describe('stage order (decision 045)', () => {
  it('numbers stages by the official order: The Hunt is Stage 03, Agawan Base Stage 02', () => {
    expect(OFFICIAL_ORDER).toEqual(['STAGE_01_RED_LIGHT', 'STAGE_02_AGAWAN_BASE', 'STAGE_03_THE_HUNT']);
    expect(HUNT.id).toBe('STAGE_03_THE_HUNT');
    expect(getStage('STAGE_01_RED_LIGHT').number).toBe(1);
    expect(stageNumber(AGAWAN_STAGE_ID)).toBe(2);
    expect(getStage(HUNT.id).number).toBe(3);
    expect(getStage(HUNT.id).name).toBe('The Hunt');
    expect(getStage(HUNT.id).rules).toBe('hide_and_hunt');
  });

  it('still accepts the old Hunt id (saved menu picks, older pages)', () => {
    expect(resolveStageId('STAGE_02_THE_HUNT')).toBe(HUNT.id);
    expect(getStage('STAGE_02_THE_HUNT').id).toBe(HUNT.id);
    expect(stageNumber('STAGE_02_THE_HUNT')).toBe(3);
    const m = new Match(MATCH_ORDER);
    m.startAt('STAGE_02_THE_HUNT');
    expect(m.stageId).toBe(HUNT.id);
  });

  it('keeps Agawan Base out of the match until it is switched on, with no stand-in replay', () => {
    expect(AGAWAN_ENABLED).toBe(false);
    expect(MATCH_ORDER).toEqual(['STAGE_01_RED_LIGHT', 'STAGE_03_THE_HUNT']);
    expect(STARTABLE_STAGES).toEqual(MATCH_ORDER);
    expect(new Set(MATCH_ORDER).size).toBe(MATCH_ORDER.length);
  });
});
