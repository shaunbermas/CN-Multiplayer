// Runtime stage geometry in game coordinates (metres, Y up, the course runs toward -Z).
// The runtime builds it from the approved stage metadata (stage-metadata.ts, via stages.ts).
// buildStageGeometry() below reads the older greybox exports (STG01_collision.json / _markers.json) and is
// kept only so tests can prove the two sources agree.

export interface ColliderJson {
  id: string;
  shape: 'box';
  type: 'solid' | 'trigger';
  center: [number, number, number];
  size: [number, number, number];
  rotation: [number, number, number, number];
  role?: string;
}
export interface CollisionFile { stage: string; spec_hash: string; colliders: ColliderJson[] }

export interface MarkerJson {
  id: string;
  position: [number, number, number];
  forward: [number, number, number];
  kind: string;
  index?: number;
  [k: string]: unknown;
}
export interface MarkersFile { stage: string; spec_hash: string; markers: MarkerJson[] }

/** Axis-aligned rectangle on the ground plane (X/Z). */
export interface Rect { id: string; minX: number; maxX: number; minZ: number; maxZ: number }

export interface Spawn { index: number; x: number; z: number; yaw: number }

export interface WatcherPlacement {
  /** Root (feet) position in game coordinates. */
  x: number; y: number; z: number;
  /** Model height in metres (asset manifest / spec L9). */
  height: number;
  /** Facing yaw in game convention (0 = facing -Z; PI = facing +Z, toward the start line). */
  yaw: number;
}

export interface StageGeometry {
  stage: string;
  walls: Rect[];
  start: Rect | null;
  finish: Rect | null;
  safe: Rect | null;
  /** Playable area (everything inside the fence). */
  bounds: Rect | null;
  spawns: Spawn[];
  /** Bench seats for spotted and waiting players (outside the yard). */
  benches: { x: number; z: number }[];
  /** Start line Z (game) and finish line Z (game). Progress runs from startZ toward finishZ. */
  startZ: number;
  finishZ: number;
  watcher: WatcherPlacement | null;
}

function rectOf(c: ColliderJson): Rect {
  const [cx, , cz] = c.center;
  const [sx, , sz] = c.size;
  return { id: c.id, minX: cx - sx / 2, maxX: cx + sx / 2, minZ: cz - sz / 2, maxZ: cz + sz / 2 };
}

/** Yaw (radians) for a forward vector, with yaw 0 = facing -Z (see movement.ts). */
export function yawFromForward(f: [number, number, number]): number {
  return Math.atan2(-f[0], -f[2]);
}

export function buildStageGeometry(collision: CollisionFile, markers: MarkersFile): StageGeometry {
  // Solid boxes whose top is above the ground are walls; the ground itself (top at 0) is not.
  const walls = collision.colliders
    .filter((c) => c.type === 'solid' && c.center[1] + c.size[1] / 2 > 0.01)
    .map(rectOf);
  const trig = (role: string) => {
    const c = collision.colliders.find((x) => x.type === 'trigger' && x.role === role);
    return c ? rectOf(c) : null;
  };
  const spawns = markers.markers
    .filter((m) => m.kind === 'spawn')
    .map((m) => ({ index: Number(m.index), x: m.position[0], z: m.position[2], yaw: yawFromForward(m.forward) }))
    .sort((a, b) => a.index - b.index);
  const benches = markers.markers
    .filter((m) => m.kind === 'bench')
    .sort((a, b) => Number(a.index) - Number(b.index))
    .map((m) => ({ x: m.position[0], z: m.position[2] }));
  const byId = Object.fromEntries(markers.markers.map((m) => [m.id, m]));
  const sh = byId['GMK_SHEPHERD'];
  const b = byId['GMK_BOUNDS'];
  return {
    stage: collision.stage,
    walls,
    start: null,
    finish: trig('finish'),
    safe: trig('safe'),
    bounds: b ? { id: 'GMK_BOUNDS', minX: Number(b.min_x), maxX: Number(b.max_x), minZ: -Number(b.max_y), maxZ: -Number(b.min_y) } : null,
    spawns,
    benches,
    startZ: byId['GMK_START']?.position[2] ?? 0,
    finishZ: byId['GMK_FINISH']?.position[2] ?? 0,
    watcher: sh ? { x: sh.position[0], y: sh.position[1], z: sh.position[2], height: Number(sh.height), yaw: Math.PI } : null,
  };
}

export function insideRect(r: Rect | null, x: number, z: number): boolean {
  return !!r && x >= r.minX && x <= r.maxX && z >= r.minZ && z <= r.maxZ;
}

/** 0 at the start line, 1 at the finish line. */
export function progress(g: StageGeometry, z: number): number {
  const p = (z - g.startZ) / (g.finishZ - g.startZ);
  return Math.max(0, Math.min(1, p));
}
