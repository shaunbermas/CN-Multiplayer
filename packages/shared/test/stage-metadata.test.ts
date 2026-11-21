// The server and client load the greybox exports (STG01_collision.json, STG01_markers.json). Prompt 04
// added blender/exports/STAGE_01_METADATA.json (Blender coordinates, Z up). This keeps the two in step:
// the geometry the server plays on must equal the collision-ready metadata. Game = (x, z, -y).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildStageGeometry } from '../src/index.ts';

const root = new URL('../../../', import.meta.url);
const load = (p: string) => JSON.parse(readFileSync(new URL(p, root), 'utf8'));
const geo = buildStageGeometry(load('blender/exports/STG01/STG01_collision.json'), load('blender/exports/STG01/STG01_markers.json'));
const meta = load('blender/exports/STAGE_01_METADATA.json');

type V = { x: number; y: number; z: number };
interface Box { id: string; position: V; dimensions: V }
/** Ground-plane rectangle in game coordinates for a bottom-centre box from the metadata. */
const rectOf = (b: Box) => ({
  minX: b.position.x - b.dimensions.x / 2, maxX: b.position.x + b.dimensions.x / 2,
  minZ: -(b.position.y + b.dimensions.y / 2), maxZ: -(b.position.y - b.dimensions.y / 2),
});
const byId = (list: Box[], id: string) => {
  const b = list.find((x) => x.id === id);
  if (!b) throw new Error(`${id} missing from the metadata`);
  return b;
};

describe('STAGE_01_METADATA.json matches the runtime stage geometry', () => {
  it('has 30 spawns at the positions the server uses', () => {
    expect(meta.spawnPoints).toHaveLength(30);
    const server = new Map(geo.spawns.map((s) => [s.index, s]));
    for (const sp of meta.spawnPoints) {
      const s = server.get(Number(sp.id.slice(-2)))!;
      expect(s.x).toBeCloseTo(sp.position.x, 3);
      expect(s.z).toBeCloseTo(-sp.position.y, 3);
    }
  });

  it('has the same finish and safe volumes', () => {
    const fin = rectOf(byId(meta.triggerZones, 'TRIGGER_FINISH_LINE'));
    const safe = rectOf(byId(meta.triggerZones, 'TRIGGER_SAFE_ZONE'));
    for (const [a, b] of [[fin, geo.finish!], [safe, geo.safe!]] as const) {
      expect(a.minX).toBeCloseTo(b.minX, 3); expect(a.maxX).toBeCloseTo(b.maxX, 3);
      expect(a.minZ).toBeCloseTo(b.minZ, 3); expect(a.maxZ).toBeCloseTo(b.maxZ, 3);
    }
  });

  it('has the same movement walls, and the start trigger ends at the start line', () => {
    for (const id of ['BOUNDARY_LEFT', 'BOUNDARY_RIGHT', 'BOUNDARY_BACK', 'BOUNDARY_FINISH']) {
      const r = rectOf(byId(meta.movementBoundaries, id));
      const match = geo.walls.some((w) => Math.abs(w.minX - r.minX) < 1e-3 && Math.abs(w.maxX - r.maxX) < 1e-3
        && Math.abs(w.minZ - r.minZ) < 1e-3 && Math.abs(w.maxZ - r.maxZ) < 1e-3);
      expect(match, id).toBe(true);
    }
    const start = rectOf(byId(meta.triggerZones, 'TRIGGER_START_LINE'));
    expect(start.minZ).toBeCloseTo(geo.startZ, 3);
    const finishLine = byId(meta.triggerZones, 'TRIGGER_FINISH_LINE');
    expect(-(finishLine.position.y - finishLine.dimensions.y / 2)).toBeCloseTo(geo.finishZ, 3);
  });

  it('puts The Shepherd where the server expects it', () => {
    const root = meta.sceneObjects.find((o: { id: string }) => o.id === 'WATCHER_ROOT_ANCHOR');
    expect(root?.collection).toBe('WATCHER_REFERENCE');
    expect(meta.watcherDetectionReference.anchorObjectId).toBe('WATCHER_ROOT_ANCHOR');
    expect(geo.shepherd!.z).toBeCloseTo(-meta.watcherDetectionReference.position.y, 3);
    expect(meta.signalAnchors.map((s: { signalType: string }) => s.signalType)).toEqual(expect.arrayContaining(['red', 'green']));
  });
});
