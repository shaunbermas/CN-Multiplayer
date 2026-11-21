// Prompt 07: metadata parsing and coordinate conversion, spawn resolution, stage registry, finish
// qualification (spec R3/R4) and the exactly-once tournament handoff.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_STAGE_ID, MOVEMENT, MetadataError, RoundEngine, SIM_DT, Tournament, buildStageGeometry, geometryFromMetadata, getStage,
  newRoundPlayer, parseStageMetadata, qualifierTarget, qualify, toGame, yawToGame, type Placing, type RoundEvents,
} from '../src/index.ts';

const root = new URL('../../../', import.meta.url);
const load = (p: string) => JSON.parse(readFileSync(new URL(p, root), 'utf8'));
const raw = load('blender/exports/STAGE_01_METADATA.json');
const stage = getStage();
const geo = stage.geometry;

describe('stage metadata parser and coordinate conversion', () => {
  it('accepts the approved metadata and rejects broken copies', () => {
    expect(parseStageMetadata(raw).stageId).toBe('STAGE_01_RED_LIGHT');
    const bad = structuredClone(raw);
    bad.spawnPoints.pop();
    bad.triggerZones = bad.triggerZones.filter((t: { id: string }) => t.id !== 'TRIGGER_FINISH_LINE');
    expect(() => parseStageMetadata(bad)).toThrow(MetadataError);
    expect(() => parseStageMetadata(bad)).toThrow(/29 spawn points.*TRIGGER_FINISH_LINE|TRIGGER_FINISH_LINE.*29 spawn points/);
  });

  it('converts Blender Z-up to game Y-up exactly once', () => {
    expect(toGame({ x: 1, y: 2, z: 3 })).toEqual([1, 3, -2]);
    expect(yawToGame(-180)).toBeCloseTo(0, 9);   // spawns face +Y in Blender = -Z (yaw 0) in game
    expect(yawToGame(0)).toBeCloseTo(Math.PI, 9); // The Watcher faces -Y in Blender = +Z in game
  });

  it('registers Stage 01 with geometry built from metadata ids', () => {
    expect(stage.id).toBe(DEFAULT_STAGE_ID);
    expect(stage.rules).toBe('red_light_green_light');
    expect(geo.start).toEqual({ id: 'TRIGGER_START_LINE', minX: -30, maxX: 30, minZ: -0, maxZ: 15 });
    expect(geo.startZ).toBeCloseTo(0, 6);
    expect(geo.finishZ).toBeCloseTo(-160, 6);
    expect(geo.bounds).toMatchObject({ minX: -30, maxX: 30, minZ: -172, maxZ: 15 });
    expect(geo.walls.map((w) => w.id).sort()).toEqual(['BOUNDARY_BACK', 'BOUNDARY_FINISH', 'BOUNDARY_LEFT', 'BOUNDARY_RIGHT']);
    expect(geo.benches).toHaveLength(15);
  });

  it('places the 28 m Watcher on the plinth, facing the start line', () => {
    expect(geo.watcher).toMatchObject({ x: 0, y: 4, z: -185, height: 28 });
    expect(geo.watcher!.yaw).toBeCloseTo(Math.PI, 9);
  });
});

describe('spawn resolution', () => {
  it('resolves all 30 SPAWN_PLAYER ids inside the start trigger, without overlapping capsules', () => {
    expect(geo.spawns.map((s) => s.index)).toEqual(Array.from({ length: 30 }, (_, i) => i + 1));
    for (const s of geo.spawns) {
      expect(s.x).toBeGreaterThan(geo.start!.minX + MOVEMENT.capsuleRadius);
      expect(s.x).toBeLessThan(geo.start!.maxX - MOVEMENT.capsuleRadius);
      expect(s.z).toBeGreaterThan(geo.start!.minZ);
      expect(s.z).toBeLessThan(geo.start!.maxZ);
      expect(s.yaw).toBeCloseTo(0, 9);
    }
    let closest = Infinity;
    for (const a of geo.spawns) for (const b of geo.spawns) if (a !== b) closest = Math.min(closest, Math.hypot(a.x - b.x, a.z - b.z));
    expect(closest).toBeGreaterThanOrEqual(2 * MOVEMENT.capsuleRadius);
  });

  it('agrees with the greybox exports the metadata was built from', () => {
    const legacy = buildStageGeometry(load('blender/exports/STG01/STG01_collision.json'), load('blender/exports/STG01/STG01_markers.json'));
    expect(geo.spawns.map((s) => [s.index, s.x, s.z])).toEqual(legacy.spawns.map((s) => [s.index, s.x, s.z]));
    expect(geo.finish).toMatchObject({ minX: legacy.finish!.minX, maxX: legacy.finish!.maxX, minZ: legacy.finish!.minZ, maxZ: legacy.finish!.maxZ });
  });

  it('fails loudly on unknown stages', () => {
    expect(() => getStage('STAGE_99')).toThrow(/Unknown stage/);
    expect(() => geometryFromMetadata({ ...parseStageMetadata(raw), movementBoundaries: [] }, { watcherHeight: 28 })).toThrow(MetadataError);
  });
});

describe('finish qualification (spec R3/R4)', () => {
  const pl = (id: string, status: Placing['status'], progress = 0): Placing => ({ id, place: 0, status, finishTime: status === 'finished' ? 60 : -1, progress, qualified: false });

  it('computes the tournament target: 30 starters -> 22, never below min(2, starters)', () => {
    expect(qualifierTarget('tournament', 30)).toBe(22);
    expect(qualifierTarget('tournament', 2)).toBe(2);
    expect(qualifierTarget('tournament', 1)).toBe(1);
    expect(qualifierTarget('standup', 30)).toBe(Infinity);
  });

  it('standup: every finisher qualifies, nobody else', () => {
    const out = qualify([pl('a', 'finished'), pl('b', 'active', 0.9), pl('c', 'spotted')], 'standup', 3);
    expect(out.map((p) => p.qualified)).toEqual([true, false, false]);
  });

  it('tournament: fewer than 2 finishers -> the furthest unspotted players fill up to 2', () => {
    const out = qualify([pl('a', 'finished'), pl('b', 'active', 0.8), pl('c', 'active', 0.4), pl('d', 'spotted')], 'tournament', 4);
    expect(out.filter((p) => p.qualified).map((p) => p.id)).toEqual(['a', 'b']);
  });

  it('tournament: the round ends as soon as the qualifier target is reached', () => {
    const e = new RoundEngine(geo);
    const ps = Array.from({ length: 3 }, (_, i) => newRoundPlayer(`p${i}`, i, i + 1, 0, 5));
    let t = 0;
    e.start(ps, { seed: 1, briefingS: 0, mode: 'tournament' }); // target for 3 starters: max(2, round(2.19)) = 2
    expect(e.target).toBe(2);
    while (e.phase !== 'active') e.tick((t += SIM_DT), ps);
    const ev: RoundEvents = { spotted: [], finished: [] };
    for (const p of ps.slice(0, 2)) { p.z = -161; e.afterMove(p, 0, -0.1, SIM_DT, ev); }
    expect(ev.finished).toEqual(['p0', 'p1']);
    const r = e.tick((t += SIM_DT), ps);
    expect(r.phase).toBe('results');
    expect(r.results!.filter((x) => x.qualified).map((x) => x.id)).toEqual(['p0', 'p1']);
  });
});

describe('tournament handoff', () => {
  const result = (roundId: number, mode: 'standup' | 'tournament' = 'standup') =>
    ({ roundId, stageId: DEFAULT_STAGE_ID, mode, seed: 1, placings: [], qualifiedIds: ['a'] });

  it('records each round exactly once', () => {
    const t = new Tournament([DEFAULT_STAGE_ID]);
    expect(t.complete(result(1)).recorded).toBe(true);
    expect(t.complete(result(1)).recorded).toBe(false);
    expect(t.results).toHaveLength(1);
    expect(t.complete(result(2)).recorded).toBe(true);
    expect(t.results.map((r) => r.roundId)).toEqual([1, 2]);
  });

  it('advances through the stage order in a tournament and returns to the lobby after the last stage', () => {
    const t = new Tournament(['S1', 'S2']);
    expect(t.complete({ ...result(1, 'tournament'), stageId: 'S1' }).nextStageId).toBe('S2');
    expect(t.currentStageId).toBe('S2');
    expect(t.complete({ ...result(2, 'tournament'), stageId: 'S2' }).nextStageId).toBeNull();
    expect(t.currentStageId).toBe('S1');
    expect(new Tournament(['S1', 'S2']).complete(result(1, 'standup')).nextStageId).toBeNull();
  });
});
