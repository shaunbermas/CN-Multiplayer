// Typed parser for a stage's approved metadata (blender/exports/STAGE_01_METADATA.json, Prompt 04 schema
// 1.0.0) and the ONE place where Blender coordinates become game coordinates.
//
// Blender (metadata): metres, Z up, the course runs toward +Y, marker forward = local -Y, rotations in
// degrees. Game (server, client, glTF): metres, Y up, the course runs toward -Z, yaw 0 = facing -Z.
//   game position = (x, z, -y)          game yaw = blender yaw (deg -> rad) + PI
// Everything downstream (server rules, client scene, tests) reads StageGeometry; nothing else converts.
import type { Rect, Spawn, StageGeometry } from './stage.ts';

export interface V3 { x: number; y: number; z: number }
interface Base { id: string; objectName: string; position: V3; rotation: V3; notes?: string }
interface Box extends Base { dimensions: V3 }
export interface StageMetadata {
  schemaVersion: string;
  stageId: string;
  stageName: string;
  coordinateSystem: { units: string; upAxis: string; forwardAxis: string; rotationUnit: string; originDescription: string };
  spawnPoints: Base[];
  triggerZones: (Box & { role: 'start' | 'finish'; isTrigger: true })[];
  movementBoundaries: Box[];
  watcherDetectionReference: Base & { anchorObjectId: string; coverageShape: string; coverageDimensions?: V3 };
  collisionObjects: (Box & { colliderType: string; isTrigger: boolean; sourceVisualObjectId: string; staticOrMoving?: string })[];
  spectatorLocations: (Base & { viewTargetObjectId: string })[];
  signalAnchors: (Base & { signalType: 'red' | 'green' | 'shared' })[];
  sceneObjects: { id: string; objectName: string; collection: string; role: string }[];
}

export class MetadataError extends Error {}

/** Blender metadata position -> game position [x, y(up), z]. */
export function toGame(p: V3): [number, number, number] {
  return [p.x, p.z, -p.y === 0 ? 0 : -p.y];
}

/** Blender yaw (rotation.z, degrees; forward = local -Y) -> game yaw (radians; 0 = facing -Z). */
export function yawToGame(rotationZDeg: number): number {
  let a = (rotationZDeg * Math.PI) / 180 + Math.PI;
  a = Math.atan2(Math.sin(a), Math.cos(a));
  return Math.abs(a) < 1e-9 ? 0 : a;
}

/** Ground-plane rectangle (game X/Z) of a bottom-centre box from the metadata. */
export function rectOf(b: Box): Rect {
  const hx = b.dimensions.x / 2, hy = b.dimensions.y / 2;
  return { id: b.id, minX: b.position.x - hx, maxX: b.position.x + hx, minZ: -(b.position.y + hy), maxZ: -(b.position.y - hy) };
}

const REQUIRED_IDS = ['TRIGGER_START_LINE', 'TRIGGER_FINISH_LINE', 'BOUNDARY_PLAYABLE_AREA', 'BOUNDARY_LEFT', 'BOUNDARY_RIGHT',
  'BOUNDARY_BACK', 'BOUNDARY_FINISH', 'COLLISION_GROUND_MAIN'];

/**
 * Validate the parts of the metadata the runtime depends on and return it typed. Throws MetadataError
 * with every problem listed, so a broken export fails loudly instead of producing a wrong stage.
 * (The full JSON-schema check runs in the asset pipeline: blender/scripts/validate_stage_01_metadata.py.)
 */
export function parseStageMetadata(raw: unknown): StageMetadata {
  const m = raw as StageMetadata;
  const problems: string[] = [];
  const isV3 = (v: unknown) => !!v && ['x', 'y', 'z'].every((k) => Number.isFinite((v as Record<string, number>)[k]));
  if (!m || typeof m !== 'object') throw new MetadataError('Stage metadata is not an object');
  if (m.schemaVersion !== '1.0.0') problems.push(`schemaVersion ${m.schemaVersion} is not 1.0.0`);
  if (m.coordinateSystem?.units !== 'meters' || m.coordinateSystem?.rotationUnit !== 'degrees') problems.push('coordinate system must be metres and degrees');
  if (!String(m.coordinateSystem?.upAxis).startsWith('+Z')) problems.push(`up axis ${m.coordinateSystem?.upAxis} is not +Z (the converter assumes Blender Z-up)`);
  const lists = ['spawnPoints', 'triggerZones', 'movementBoundaries', 'collisionObjects', 'spectatorLocations', 'signalAnchors'] as const;
  for (const k of lists) if (!Array.isArray(m[k])) problems.push(`${k} missing`);
  if (problems.length) throw new MetadataError(problems.join('; '));
  const all = [...m.spawnPoints, ...m.triggerZones, ...m.movementBoundaries, ...m.collisionObjects, ...m.spectatorLocations, ...m.signalAnchors];
  for (const o of all) {
    if (!isV3(o.position) || !isV3(o.rotation)) problems.push(`${o.id}: bad position or rotation`);
    if ('dimensions' in o && !isV3((o as Box).dimensions)) problems.push(`${o.id}: bad dimensions`);
  }
  const ids = new Set(all.map((o) => o.id));
  for (const id of REQUIRED_IDS) if (!ids.has(id)) problems.push(`required object ${id} missing`);
  if (m.spawnPoints.length !== 30) problems.push(`${m.spawnPoints.length} spawn points, expected 30`);
  const spawnIds = m.spawnPoints.map((s) => s.id);
  if (new Set(spawnIds).size !== spawnIds.length) problems.push('duplicate spawn ids');
  for (const s of m.spawnPoints) if (!/^SPAWN_PLAYER_\d\d$/.test(s.id)) problems.push(`spawn id ${s.id} is not SPAWN_PLAYER_NN`);
  if (!isV3(m.watcherDetectionReference?.position)) problems.push('watcherDetectionReference missing');
  if (problems.length) throw new MetadataError(`Stage metadata invalid: ${problems.join('; ')}`);
  return m;
}

/** Highest solid collider top under a ground point (Blender X/Y), e.g. the plinth under The Watcher. */
function supportHeight(m: StageMetadata, x: number, y: number): number {
  let top = 0;
  for (const c of m.collisionObjects) {
    if (c.isTrigger) continue;
    const hx = c.dimensions.x / 2, hy = c.dimensions.y / 2;
    if (Math.abs(x - c.position.x) <= hx && Math.abs(y - c.position.y) <= hy) top = Math.max(top, c.position.z + c.dimensions.z);
  }
  return top;
}

/** Runtime stage geometry, built only from metadata IDs. */
export function geometryFromMetadata(m: StageMetadata, opts: { watcherHeight: number }): StageGeometry {
  const get = <T extends { id: string }>(list: T[], id: string) => {
    const o = list.find((x) => x.id === id);
    if (!o) throw new MetadataError(`${id} missing`);
    return o;
  };
  const walls = ['BOUNDARY_LEFT', 'BOUNDARY_RIGHT', 'BOUNDARY_BACK', 'BOUNDARY_FINISH'].map((id) => rectOf(get(m.movementBoundaries, id)));
  const start = rectOf(get(m.triggerZones, 'TRIGGER_START_LINE'));
  const finish = rectOf(get(m.triggerZones, 'TRIGGER_FINISH_LINE'));
  const safeBox = m.triggerZones.find((t) => t.id === 'TRIGGER_SAFE_ZONE');
  const spawns: Spawn[] = m.spawnPoints
    .map((s) => { const [x, , z] = toGame(s.position); return { index: Number(s.id.slice(-2)), x, z, yaw: yawToGame(s.rotation.z) }; })
    .sort((a, b) => a.index - b.index);
  const benches = m.spectatorLocations
    .filter((s) => s.id.startsWith('SPECTATOR_BENCH_'))
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((s) => { const [x, , z] = toGame(s.position); return { x, z }; });
  // The Watcher stands on whatever supports its root anchor (the approved plinth, decision 024).
  const wd = m.watcherDetectionReference;
  const rootY = supportHeight(m, wd.position.x, wd.position.y);
  const [wx, , wz] = toGame(wd.position);
  return {
    stage: m.stageId,
    walls,
    start,
    finish,
    safe: safeBox ? rectOf(safeBox) : null,
    bounds: rectOf(get(m.movementBoundaries, 'BOUNDARY_PLAYABLE_AREA')),
    spawns,
    benches,
    // Start line = the start trigger's +Y face (game: its max Z); finish line = the finish trigger's -Y face.
    startZ: start.minZ,
    finishZ: finish.maxZ,
    watcher: { x: wx, y: rootY, z: wz, height: opts.watcherHeight, yaw: yawToGame(wd.rotation.z) },
  };
}
