// Stage 03 · THE HUNT greybox layout: an abandoned industrial facility (design pack 02_STAGE_02_THE_HUNT, floor plan
// STAGE_02_FACILITY_FLOORPLAN.png). The pack's plan is a relationship diagram, not coordinates, so this file is the
// greybox: room rectangles, partition walls with door gaps, props (cover and hiding places), spawns and lamps.
// Everything gameplay reads (walls, hiding places, spawns, the hunter gates) comes from here, for the server, the
// bots and the client alike. Visual meshes are drawn from the same data by the client (apps/web/src/stages/hunt).
//
// Game coordinates: metres, X to the right, Z "down" the floor plan (north = -Z). Flat floor (ADR 0001): the
// upper catwalk is a gallery on the same level, fenced from the warehouse by see-through rails.
//
// Footprint: 108 m x 72 m inside the shell (the pack proposes about 150 x 110 m; the greybox is smaller so 30 players
// meet each other within a 3-minute hunt; see docs/STAGE_02_SPEC.md §Map).
import type { Rect, Spawn, StageGeometry } from '../stage.ts';

/** What a wall or prop is, for the client's blockout materials and the Pulse Detector's attenuation. */
export type WallKind =
  | 'shell' | 'partition' | 'rail' | 'glass' | 'rack' | 'crate' | 'container' | 'locker' | 'tarp' | 'machine'
  | 'console' | 'barrel' | 'pallet' | 'pipe' | 'gate';

export interface HuntWall extends Rect {
  kind: WallKind;
  /** Visual height (m); collision is always full height (flat 2D world). */
  h: number;
  /** See-through (rails, glass): blocks movement but not sight. */
  see?: boolean;
  /** Pulse signal kept when passing through this wall (0..1). */
  att: number;
}

export type HideKind = 'locker' | 'crate' | 'container' | 'tarp';

export interface HideSpot {
  id: string;
  kind: HideKind;
  room: string;
  /** Where a hidden player is kept (inside the prop). */
  x: number; z: number;
  /** The front: stand here to enter; you leave here. */
  fx: number; fz: number;
  /** Players it holds at once (lockers, crates and tarps 1, containers 2). */
  capacity: number;
  /** Id of the prop wall it belongs to. */
  wall: string;
}

export interface RoomZone { id: string; label: string; minX: number; maxX: number; minZ: number; maxZ: number }
export interface Lamp { x: number; z: number; y: number; color: 'cold' | 'amber' | 'red'; intensity: number; room: string }

export interface HuntLayout {
  rooms: RoomZone[];
  walls: HuntWall[];
  /** Hunter gates: walls while the head start runs (doors of the hunter staging room). */
  gates: HuntWall[];
  hideSpots: HideSpot[];
  hunterSpawns: Spawn[];
  /** Hider spawn pockets (four safe zones), interleaved so consecutive hiders land in different pockets. */
  hiderSpawns: Spawn[];
  /** Seats for late joiners (outside the facility). */
  benches: { x: number; z: number }[];
  lamps: Lamp[];
  bounds: Rect;
  /** The hunter staging room (restricted during the head start). */
  hunterRoom: Rect;
}

// ------------------------------------------------------------------ attenuation by material (Pulse Detector)
const ATT: Record<WallKind, number> = {
  shell: 0.2, partition: 0.45, gate: 0.45, rail: 0.95, glass: 0.85, rack: 0.75, crate: 0.7, container: 0.4,
  locker: 0.6, tarp: 0.9, machine: 0.5, console: 0.7, barrel: 0.85, pallet: 0.9, pipe: 0.85,
};
const HEIGHT: Record<WallKind, number> = {
  shell: 9, partition: 5, gate: 3.2, rail: 1.1, glass: 3, rack: 4.2, crate: 1.6, container: 2.6, locker: 2.0, tarp: 1.5,
  machine: 2.2, console: 1.1, barrel: 1.0, pallet: 0.5, pipe: 1.2,
};

let seq = 0;
function box(kind: WallKind, minX: number, maxX: number, minZ: number, maxZ: number, id?: string, h?: number): HuntWall {
  return {
    id: id ?? `S02_${kind.toUpperCase()}_${String(++seq).padStart(3, '0')}`,
    minX: Math.min(minX, maxX), maxX: Math.max(minX, maxX), minZ: Math.min(minZ, maxZ), maxZ: Math.max(minZ, maxZ),
    kind, h: h ?? HEIGHT[kind], att: ATT[kind], ...(kind === 'rail' || kind === 'glass' ? { see: true } : {}),
  };
}
/** Prop centred at (x, z) with size (w along X, d along Z). */
function prop(kind: WallKind, x: number, z: number, w: number, d: number, id?: string, h?: number): HuntWall {
  return box(kind, x - w / 2, x + w / 2, z - d / 2, z + d / 2, id, h);
}

type Door = { at: number; w: number };
/** A straight wall along X (fixed z) or Z (fixed x) from a to b, with door gaps. */
function wallLine(axis: 'x' | 'z', fixed: number, a: number, b: number, doors: Door[], kind: WallKind = 'partition', t = 0.4): HuntWall[] {
  const out: HuntWall[] = [];
  const gaps = [...doors].sort((p, q) => p.at - q.at);
  let s = a;
  for (const d of gaps) {
    const e = d.at - d.w / 2;
    if (e - s > 0.05) out.push(axis === 'x' ? box(kind, s, e, fixed - t / 2, fixed + t / 2) : box(kind, fixed - t / 2, fixed + t / 2, s, e));
    s = d.at + d.w / 2;
  }
  if (b - s > 0.05) out.push(axis === 'x' ? box(kind, s, b, fixed - t / 2, fixed + t / 2) : box(kind, fixed - t / 2, fixed + t / 2, s, b));
  return out;
}

/** Builds the facility. Pure and deterministic (same data on server and client). */
export function buildHuntLayout(): HuntLayout {
  seq = 0;
  const X0 = -54, X1 = 54, Z0 = -36, Z1 = 36; // inside of the shell
  const rooms: RoomZone[] = [
    { id: 'B', label: 'Loading Bay', minX: -54, maxX: -24, minZ: -36, maxZ: -4 },
    { id: 'D', label: 'Locker Room', minX: -54, maxX: -24, minZ: -4, maxZ: 36 },
    { id: 'H', label: 'Upper Catwalk', minX: -24, maxX: 20, minZ: -36, maxZ: -27 },
    { id: 'A', label: 'Main Warehouse', minX: -24, maxX: 20, minZ: -27, maxZ: 12 },
    { id: 'F', label: 'Maintenance', minX: -24, maxX: 20, minZ: 12, maxZ: 36 },
    { id: 'C', label: 'Storage A', minX: 20, maxX: 54, minZ: -36, maxZ: -6 },
    { id: 'E', label: 'Control Room', minX: 20, maxX: 54, minZ: -6, maxZ: 14 },
    { id: 'G', label: 'Service Tunnels', minX: 20, maxX: 54, minZ: 14, maxZ: 36 },
    { id: 'R', label: 'Hunter Staging', minX: 54, maxX: 66, minZ: -24, maxZ: 6 },
  ];
  const walls: HuntWall[] = [];
  const W = (...w: HuntWall[]) => walls.push(...w);

  // ---- shell (outer walls); the hunter staging room bulges out of the east wall
  W(box('shell', X0 - 0.6, X1 + 0.6, Z0 - 0.6, Z0)); // north
  W(box('shell', X0 - 0.6, X1 + 0.6, Z1, Z1 + 0.6)); // south
  W(box('shell', X0 - 0.6, X0, Z0, Z1));             // west
  W(box('shell', 66, 66.6, -24.6, 6.6));             // staging room east
  W(box('shell', 54, 66.6, -24.6, -24));             // staging room north
  W(box('shell', 54, 66.6, 6, 6.6));                 // staging room south
  // east wall of the facility, with the two hunter gates (closed during the head start)
  W(...wallLine('z', 54.3, Z0, Z1, [{ at: -16, w: 3 }, { at: 0, w: 3 }], 'shell', 0.6));
  const gates = [box('gate', 54, 54.6, -17.5, -14.5, 'S02_GATE_C'), box('gate', 54, 54.6, -1.5, 1.5, 'S02_GATE_E')];

  // ---- partitions with doors (loops everywhere; no dead ends)
  W(...wallLine('z', -24, Z0, -27, [{ at: -31.5, w: 2.2 }]));                  // B | H (service route)
  W(...wallLine('z', -24, -27, -4, [{ at: -14, w: 4 }]));                      // B | A (wide)
  W(...wallLine('z', -24, -4, 12, [{ at: 5, w: 3 }]));                         // D | A
  W(...wallLine('z', -24, 12, Z1, [{ at: 27, w: 3 }]));                        // D | F
  W(...wallLine('x', -4, X0, -24, [{ at: -39, w: 3 }]));                       // B | D
  // H | A: the catwalk gallery overlooks part of the warehouse through rails, with two stairs (openings)
  W(...wallLine('x', -27, -24, -14, [{ at: -19, w: 2.6 }]));
  W(box('rail', -14, 2, -27.15, -26.85));
  W(...wallLine('x', -27, 2, 20, [{ at: 9, w: 2.6 }]));
  W(...wallLine('x', 12, -24, 20, [{ at: -5, w: 4 }, { at: 13, w: 2.6 }]));   // A | F
  W(...wallLine('z', 20, Z0, -27, [{ at: -31.5, w: 2.2 }]));                   // H | C
  W(...wallLine('z', 20, -27, -6, [{ at: -19, w: 3 }]));                       // A | C
  W(...wallLine('z', 20, -6, 14, [{ at: 4, w: 3 }]));                          // A | E
  W(...wallLine('z', 20, 14, Z1, [{ at: 27, w: 2.6 }]));                       // F | G
  W(...wallLine('x', -6, 20, X1, [{ at: 34, w: 3 }]));                         // C | E
  W(...wallLine('x', 14, 20, X1, [{ at: 44, w: 2.6 }, { at: 27, w: 2.4 }]));  // E | G

  const hideSpots: HideSpot[] = [];
  /** A hiding prop: the wall plus its hide spot, with the front on side `face` (n, s, e, w). */
  const hide = (kind: HideKind, room: string, x: number, z: number, w: number, d: number, face: 'n' | 's' | 'e' | 'w', capacity = 1) => {
    const id = `HIDE_${room}${String(hideSpots.filter((s) => s.room === room).length + 1).padStart(2, '0')}`;
    const wallKind: WallKind = kind;
    const wl = prop(wallKind, x, z, w, d, `S02_${id}`);
    W(wl);
    const off = 0.75; // front point: capsule radius plus a little, outside the prop
    const fx = face === 'e' ? wl.maxX + off : face === 'w' ? wl.minX - off : x;
    const fz = face === 's' ? wl.maxZ + off : face === 'n' ? wl.minZ - off : z;
    hideSpots.push({ id, kind, room, x, z, fx, fz, capacity, wall: wl.id });
  };

  // ---- A · Main Warehouse (44 x 39): staggered pallet racks, crate stacks, a central gantry (landmark)
  W(prop('machine', -2, -8, 3, 3, 'S02_GANTRY'));
  for (const [x, z, len] of [[-15, -20, 9], [-15, -11, 9], [6, -21, 10], [12, -12, 8], [-14, 0, 8], [9, 2, 9], [-4, 6, 6]] as const) W(prop('rack', x, z, len, 1.2));
  W(prop('crate', -8, -16, 2.2, 2.2), prop('crate', 4, -15, 1.6, 1.6), prop('pallet', -8, 1, 2.4, 1.6), prop('barrel', 16, -2, 1.2, 1.2), prop('barrel', -20, 8, 1.2, 1.2));
  hide('crate', 'A', 0, -2, 2.4, 2.4, 's');
  hide('crate', 'A', 15, -24, 2.4, 2.4, 'w');
  hide('container', 'A', -19, -5, 2.6, 8, 'e', 2);

  // ---- H · Upper Catwalk gallery (narrow, pipes and cable trays)
  W(prop('pipe', -16, -34.6, 6, 1.2), prop('pipe', 0, -29, 4, 0.8), prop('machine', 14, -33.5, 3, 2.4));
  hide('crate', 'H', -6, -34.4, 2.2, 2.0, 's');

  // ---- B · Loading Bay (30 x 32): two shipping containers, crates, a dock edge
  W(prop('pallet', -46, -32, 6, 1.4), prop('pallet', -38, -32, 6, 1.4)); // dock plates along the shutters
  hide('container', 'B', -44, -20, 12, 2.6, 'n', 2);
  hide('container', 'B', -33, -11, 2.6, 10, 'w', 2);
  hide('crate', 'B', -30, -27, 2.4, 2.4, 'w');
  W(prop('crate', -49, -11, 2, 2), prop('crate', -40, -8, 1.6, 1.6), prop('barrel', -28, -20, 1.2, 1.2));

  // ---- D · Locker Room (30 x 40): two locker banks with single-occupant lockers, benches, sinks
  for (let i = 0; i < 4; i++) hide('locker', 'D', -50 + i * 1.0, 3, 0.9, 0.7, 's');
  W(prop('locker', -44.5, 3, 2.0, 0.7)); // closed lockers (not hideable)
  for (let i = 0; i < 4; i++) hide('locker', 'D', -50 + i * 1.0, 17, 0.9, 0.7, 'n');
  W(prop('locker', -44.5, 17, 2.0, 0.7));
  W(prop('console', -36, 10, 6, 0.6, 'S02_BENCH_D1', 0.5), prop('console', -36, 24, 6, 0.6, 'S02_BENCH_D2', 0.5));
  W(prop('machine', -52.6, 30, 1.6, 6, 'S02_SINKS'));
  hide('locker', 'D', -28, 30, 0.7, 0.9, 'w');
  hide('tarp', 'D', -40, 31, 3, 2.2, 'n');

  // ---- C · Storage A (34 x 30): high racks with narrow aisles, crates and tarps
  for (const z of [-30, -24, -18]) { W(prop('rack', 31, z, 12, 1.2)); W(prop('rack', 47, z, 9, 1.2)); }
  hide('crate', 'C', 24, -12, 2.4, 2.4, 'e');
  hide('tarp', 'C', 39, -11, 3.2, 2.4, 'n');
  hide('crate', 'C', 40, -27, 2.0, 2.0, 's');
  hide('tarp', 'C', 51.5, -10, 2.4, 3.2, 'w');

  // ---- E · Control Room (34 x 20): consoles, an observation glass partition, cabinets
  W(...wallLine('z', 33, -6, 14, [{ at: -1, w: 2.4 }, { at: 9, w: 2.4 }], 'glass', 0.2)); // observation glass
  W(prop('console', 26, 2, 6, 1.0), prop('console', 44, -2, 7, 1.0), prop('console', 44, 7, 7, 1.0), prop('machine', 51, 11, 4, 2));
  hide('locker', 'E', 21, 10, 0.7, 0.9, 'e');
  hide('locker', 'E', 53, -3, 0.7, 0.9, 'w');

  // ---- F · Maintenance (44 x 24): generators, pipework, tool cabinets, tarp-covered machinery
  W(prop('machine', -14, 19, 5, 3, 'S02_GENERATOR_1'), prop('machine', 4, 19, 5, 3, 'S02_GENERATOR_2'), prop('pipe', -4, 26, 14, 0.8));
  W(prop('locker', 18.4, 22, 0.8, 4, 'S02_TOOLS'), prop('console', -20, 32, 4, 1.0));
  hide('tarp', 'F', -14, 31, 3.2, 2.4, 'n');
  hide('tarp', 'F', 10, 31, 3.2, 2.4, 'n');
  hide('tarp', 'F', 13, 16, 2.4, 2.0, 's');
  hide('locker', 'F', -22.6, 18, 0.8, 0.9, 'e');

  // ---- G · Service Tunnels (34 x 22): narrow maintenance corridors (2.4 m), low pipes, warning lamps
  W(...wallLine('x', 20, 24, 50, [{ at: 30, w: 2.4 }, { at: 46, w: 2.4 }]));
  W(...wallLine('z', 30, 20, 32, [{ at: 26, w: 2.4 }]));
  W(...wallLine('z', 42, 17, 33, [{ at: 23, w: 2.4 }, { at: 30, w: 2.4 }]));
  W(...wallLine('x', 30, 24, 54, [{ at: 36, w: 2.4 }, { at: 48, w: 2.4 }]));
  hide('crate', 'G', 50, 17.6, 2.0, 2.0, 's');
  hide('crate', 'G', 25, 33.5, 2.0, 2.0, 'n');

  // ---- R · Hunter staging room: a caged bay (lockers, a bench)
  W(prop('console', 60, -21.5, 6, 0.6, 'S02_BENCH_R', 0.5), prop('locker', 65.4, -9, 0.6, 6, 'S02_LOCKERS_R'));

  const sp = (index: number, x: number, z: number, yaw = 0): Spawn => ({ index, x, z, yaw });
  // Hunters: six places inside the staging room, facing the gates (yaw -PI/2 faces -X... yaw 0 faces -Z).
  const hunterSpawns = [[58, -14], [58, -9], [58, -4], [62, -14], [62, -9], [62, -4], [60, 1], [60, -18]]
    .map(([x, z], i) => sp(i + 1, x, z, Math.PI / 2));
  // Hiders: four safe pockets (Loading Bay, Locker Room, Maintenance, Main Warehouse west), none visible from the
  // hunter room. Interleaved so the 1st, 2nd, 3rd and 4th hider go to different pockets.
  const pockets: [number, number][][] = [
    grid(-50, -28, 3, 3), // B: south-west corner of the Loading Bay
    grid(-34, 8, 3, 3),   // D: middle of the Locker Room
    grid(-8, 28, 3, 3),   // F: south of Maintenance
    grid(-12, -24, 3, 3), // A: north-west of the warehouse
  ];
  const hiderSpawns: Spawn[] = [];
  for (let i = 0; i < 9; i++) for (let k = 0; k < pockets.length; k++) hiderSpawns.push(sp(hiderSpawns.length + 1, pockets[k][i][0], pockets[k][i][1]));
  const benches = Array.from({ length: 30 }, (_, i) => ({ x: -40 + (i % 15) * 2, z: 44 + Math.floor(i / 15) * 2 }));

  const lamps: Lamp[] = [
    { x: -2, z: -8, y: 7, color: 'cold', intensity: 1.0, room: 'A' }, { x: -15, z: -16, y: 6, color: 'cold', intensity: 0.7, room: 'A' },
    { x: 10, z: 4, y: 6, color: 'cold', intensity: 0.7, room: 'A' }, { x: 16, z: -24, y: 4, color: 'red', intensity: 0.6, room: 'A' },
    { x: -44, z: -26, y: 6, color: 'cold', intensity: 0.8, room: 'B' }, { x: -30, z: -6, y: 4, color: 'red', intensity: 0.5, room: 'B' },
    { x: -46, z: 10, y: 3.5, color: 'amber', intensity: 0.7, room: 'D' }, { x: -32, z: 28, y: 3.5, color: 'amber', intensity: 0.5, room: 'D' },
    { x: 36, z: -22, y: 5, color: 'cold', intensity: 0.6, room: 'C' }, { x: 50, z: -12, y: 4, color: 'amber', intensity: 0.5, room: 'C' },
    { x: 40, z: 3, y: 3.5, color: 'cold', intensity: 0.7, room: 'E' }, { x: 26, z: 8, y: 3, color: 'red', intensity: 0.5, room: 'E' },
    { x: -6, z: 22, y: 4, color: 'amber', intensity: 0.7, room: 'F' }, { x: 14, z: 30, y: 3, color: 'red', intensity: 0.5, room: 'F' },
    { x: 36, z: 22, y: 2.8, color: 'red', intensity: 0.6, room: 'G' }, { x: 26, z: 33, y: 2.8, color: 'amber', intensity: 0.4, room: 'G' },
    { x: -4, z: -31, y: 3.5, color: 'cold', intensity: 0.5, room: 'H' }, { x: 60, z: -9, y: 3.5, color: 'red', intensity: 0.9, room: 'R' },
  ];

  return {
    rooms, walls, gates, hideSpots, hunterSpawns, hiderSpawns, benches, lamps,
    bounds: { id: 'S02_BOUNDS', minX: X0, maxX: 66, minZ: Z0, maxZ: Z1 },
    hunterRoom: { id: 'S02_HUNTER_ROOM', minX: 54.6, maxX: 66, minZ: -24, maxZ: 6 },
  };
}

/** n x m spawn points 1.6 m apart starting at (x, z). */
function grid(x: number, z: number, n: number, m: number): [number, number][] {
  const out: [number, number][] = [];
  for (let j = 0; j < m; j++) for (let i = 0; i < n; i++) out.push([x + i * 1.6, z + j * 1.6]);
  return out;
}

/** StageGeometry view of the layout (walls, spawns, bounds) for the shared room code. */
export function huntGeometry(l: HuntLayout): StageGeometry {
  return {
    stage: 'STAGE_03_THE_HUNT',
    walls: l.walls,
    start: null, finish: null, safe: null,
    bounds: l.bounds,
    // The room deals spawns by index: hiders first, then hunters (HuntEngine.start places each role itself).
    spawns: [...l.hiderSpawns, ...l.hunterSpawns.map((s, i) => ({ ...s, index: l.hiderSpawns.length + i + 1 }))],
    benches: l.benches,
    startZ: 0, finishZ: 1,
    watcher: null,
  };
}
