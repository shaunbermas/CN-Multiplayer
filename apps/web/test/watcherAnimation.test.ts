// The Watcher clip adapter (server public state -> Prompt 06 clip) and the browser asset manifest.
import { readFileSync, existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CLIP_SECONDS, MISSING_FROM_MANIFEST, WATCHER_CLIPS, chooseWatcherClip, type WatcherInputs } from '../src/stages/stage01/watcherAnimation.ts';

const base: WatcherInputs = { phase: 'active', signal: 'green', into: 0, segmentLength: 5, segmentStart: 0, redIndex: 0, sinceSpotted: Infinity, sinceResults: Infinity };
const pick = (o: Partial<WatcherInputs>) => chooseWatcherClip({ ...base, ...o });

describe('Watcher clip adapter', () => {
  it('knows every clip from the asset manifest with its length', () => {
    expect(MISSING_FROM_MANIFEST).toEqual([]);
    expect(CLIP_SECONDS.Watcher_Idle).toBeCloseTo(4, 6);
    expect(CLIP_SECONDS.Watcher_Detect).toBeCloseTo(40 / 24, 6);
  });

  it('idles outside the active phase and returns to neutral on results', () => {
    expect(pick({ phase: 'lobby', signal: 'none' }).clip).toBe('Watcher_Idle');
    expect(pick({ phase: 'briefing', signal: 'none' }).clip).toBe('Watcher_Idle');
    expect(pick({ phase: 'results', signal: 'none', sinceResults: 0.2 }).clip).toBe('Watcher_ReturnNeutral');
    expect(pick({ phase: 'results', signal: 'none', sinceResults: 3 }).clip).toBe('Watcher_Idle');
  });

  it('turns away then loops green; turns to the field during the warning, timed to end at red', () => {
    expect(pick({ into: 0.5 }).clip).toBe('Watcher_TurnAway');
    expect(pick({ into: 2 })).toMatchObject({ clip: 'Watcher_GreenSignal', loop: true });
    const warn = pick({ signal: 'warning', into: 0.1, segmentLength: 0.8, segmentStart: 5 });
    expect(warn.clip).toBe('Watcher_TurnToField');
    expect(warn.timeScale).toBeCloseTo(1.5 / 0.8, 6);
  });

  it('locks focus at red, then holds or scans; detects when the server spots someone', () => {
    expect(pick({ signal: 'red', into: 0.4 }).clip).toBe('Watcher_FocusLock');
    expect(pick({ signal: 'red', into: 2, redIndex: 0 }).clip).toBe('Watcher_RedSignal');
    expect(pick({ signal: 'red', into: 2, redIndex: 1 }).clip).toBe('Watcher_ScanSweep');
    expect(pick({ signal: 'red', into: 2, sinceSpotted: 0.3 }).clip).toBe('Watcher_Detect');
    expect(pick({ signal: 'red', into: 3, sinceSpotted: 2 }).clip).toBe('Watcher_RedSignal');
  });

  it('restarts a clip only when its key changes (same segment = same key)', () => {
    expect(pick({ into: 2 }).key).toBe(pick({ into: 3 }).key);
    expect(pick({ into: 2 }).key).not.toBe(pick({ into: 2, segmentStart: 10 }).key);
    for (const c of WATCHER_CLIPS) expect(typeof CLIP_SECONDS[c]).toBe('number');
  });
});

describe('Stage 01 browser asset manifest', () => {
  const root = new URL('../../../', import.meta.url);
  const m = JSON.parse(readFileSync(new URL('blender/exports/STAGE_01_BROWSER_ASSET_MANIFEST.json', root), 'utf8'));
  it('points at files that exist and matches the Watcher manifest', () => {
    for (const p of [m.environment.sourceBlend, m.environment.runtimeAsset, m.environment.validationReport, m.watcher.sourceBlend,
      m.watcher.runtimeAsset, m.watcher.validationReport, m.metadata.runtimeAsset, m.metadata.schema]) {
      expect(existsSync(new URL(p, root)), p).toBe(true);
    }
    expect(m.integrationStatus).toBe('verified');
    expect(m.watcher.heightMeters).toBe(28);
    expect([...m.watcher.animationClips].sort()).toEqual([...WATCHER_CLIPS].sort());
  });
});
