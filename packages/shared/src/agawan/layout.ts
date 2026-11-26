// Stage 02 · AGAWAN BASE greybox: a tri-base Philippine Christmas street block (handoff pack 04_MAP_LAYOUT_AND_
// OBSTACLE_PLACEMENT, MAP_COORDINATES.csv, 12_OBSTACLE_PLACEMENT.csv). Everything gameplay reads (walls, bases, pens,
// prison slots, spawns) comes from here, for the server, the bots and the client alike.
//
// The pack's coordinates are metres with the origin at the south-west corner, X east and Z north, on a 96 x 80 m
// block. Game coordinates put the central plaza at the origin with X east and Z "down" the map (north = -Z, as in
// every other stage):  gameX = packX - 48,  gameZ = 40 - packZ.
//   Team A base (48, 68) -> (0, -28)   north point
//   Team B base (16, 12) -> (-32, 28)  south-west point
//   Team C base (80, 12) -> (32, 28)   south-east point
// The three main streets follow the pack's route polylines (about 65 m each, mirrored, so every base is equally far
// from the others and from the plaza). House blocks fill the space between streets; side alleys reach the plaza.
// Positions marked "moved" differ from the pack's CSV where the CSV point would sit inside a house block or seal a
// street; each one keeps the same route and role (the pack: "do not trace the diagram blindly").
import type { Rect, Spawn, StageGeometry } from '../stage.ts';
import type { TeamSlot } from '../teams.ts';
import { AGAWAN } from './config.ts';

export type AgawanWallKind = 'shell' | 'house' | 'fence' | 'barrier' | 'crate' | 'jeepney' | 'tricycle' | 'kiosk' | 'cart' | 'planter' | 'bench' | 'stall';

export interface AgawanWall extends Rect {
  kind: AgawanWallKind;
  /** Visual height (m); collision is always full height (flat 2D world). */
  h: number;
  /** See-through (prison fences): blocks movement but not sight or a rescue. */
  see?: boolean;
}

export interface AgawanBase {
  slot: TeamSlot;
  /** Raid marker (centre of the capture zone). */
  x: number; z: number;
  /** Base area for the visuals (pack: 14 x 10 m); it is NOT a safe zone. */
  area: Rect;
  /** Home spawn points behind the marker (10, one per player). */
  spawns: Spawn[];
}

export interface AgawanPen {
  /** The team that owns the pen: it holds the players THIS team tagged. */
  slot: TeamSlot;
  area: Rect;
  /** Deterministic prisoner positions (5 x 4 = 20). */
  slots: { x: number; z: number }[];
  /** Where the gate gap is (rescuers walk in through it). */
  gate: { x: number; z: number };
}

/** Decorative, non-colliding landmarks (the plaza tree). */
export interface AgawanDeco { kind: 'tree'; x: number; z: number }

export interface AgawanLayout {
  walls: AgawanWall[];
  bases: Record<TeamSlot, AgawanBase>;
  pens: Record<TeamSlot, AgawanPen>;
  plaza: Rect;
  deco: AgawanDeco[];
  /** The pack's main routes in game coordinates (for fairness tests and bots). */
  routes: { id: 'A_B' | 'A_C' | 'B_C'; points: [number, number][] }[];
  /** Seats for late joiners (outside the block). */
  benches: { x: number; z: number }[];
  bounds: Rect;
}

const HEIGHT: Record<AgawanWallKind, number> = {
  shell: 6, house: 5, fence: 1.2, barrier: 0.9, crate: 1.4, jeepney: 2.4, tricycle: 1.6, kiosk: 2.4, cart: 1.2, planter: 0.7, bench: 0.5, stall: 2.2,
};

/** Pack coordinates (origin south-west, Z north) to game coordinates. */
export const fromPack = (x: number, z: number): [number, number] => [x - 48, 40 - z];

let seq = 0;
function box(kind: AgawanWallKind, minX: number, maxX: number, minZ: number, maxZ: number, id?: string): AgawanWall {
  return {
    id: id ?? `S02A_${kind.toUpperCase()}_${String(++seq).padStart(3, '0')}`,
    minX: Math.min(minX, maxX), maxX: Math.max(minX, maxX), minZ: Math.min(minZ, maxZ), maxZ: Math.max(minZ, maxZ),
    kind, h: HEIGHT[kind], ...(kind === 'fence' ? { see: true } : {}),
  };
}
/** Prop centred at (x, z) with size w (along X) by d (along Z). */
function prop(kind: AgawanWallKind, x: number, z: number, w: number, d: number, id?: string): AgawanWall {
  return box(kind, x - w / 2, x + w / 2, z - d / 2, z + d / 2, id);
}
const mirror = (w: AgawanWall, id?: string): AgawanWall => box(w.kind, -w.maxX, -w.minX, w.minZ, w.maxZ, id ?? `${w.id}_M`);

/** A fenced prison pen centred at (x, z) (w x d) with a gate gap on side `gate`. */
function pen(slot: TeamSlot, x: number, z: number, w: number, d: number, gate: 'n' | 's' | 'e' | 'w', walls: AgawanWall[]): AgawanPen {
  const t = 0.15, g = 2.4;
  const minX = x - w / 2, maxX = x + w / 2, minZ = z - d / 2, maxZ = z + d / 2;
  const side = (s: 'n' | 's' | 'e' | 'w') => {
    const id = `S02A_PEN_${slot}_${s.toUpperCase()}`;
    if (s === 'n' || s === 's') {
      const zz = s === 'n' ? minZ : maxZ;
      if (gate !== s) { walls.push(box('fence', minX, maxX, zz - t, zz + t, id)); return; }
      walls.push(box('fence', minX, x - g / 2, zz - t, zz + t, `${id}1`), box('fence', x + g / 2, maxX, zz - t, zz + t, `${id}2`));
    } else {
      const xx = s === 'w' ? minX : maxX;
      if (gate !== s) { walls.push(box('fence', xx - t, xx + t, minZ, maxZ, id)); return; }
      walls.push(box('fence', xx - t, xx + t, minZ, z - g / 2, `${id}1`), box('fence', xx - t, xx + t, z + g / 2, maxZ, `${id}2`));
    }
  };
  (['n', 's', 'e', 'w'] as const).forEach(side);
  const { cols, rows, spacingX, spacingZ } = AGAWAN.prison;
  const slots: { x: number; z: number }[] = [];
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    slots.push({ x: x + (i - (cols - 1) / 2) * spacingX, z: z + (j - (rows - 1) / 2) * spacingZ });
  }
  const gx = gate === 'e' ? maxX : gate === 'w' ? minX : x, gz = gate === 's' ? maxZ : gate === 'n' ? minZ : z;
  return { slot, area: { id: `S02A_PEN_${slot}`, minX, maxX, minZ, maxZ }, slots, gate: { x: gx, z: gz } };
}

/** Builds the street block. Pure and deterministic (same data on server and client). */
export function buildAgawanLayout(): AgawanLayout {
  seq = 0;
  const X0 = -48, X1 = 48, Z0 = -40, Z1 = 40;
  const walls: AgawanWall[] = [];
  const W = (...w: AgawanWall[]) => walls.push(...w);

  // ---- outer shell (the block's edge)
  W(box('shell', X0 - 0.6, X1 + 0.6, Z0 - 0.6, Z0, 'S02A_SHELL_N'), box('shell', X0 - 0.6, X1 + 0.6, Z1, Z1 + 0.6, 'S02A_SHELL_S'));
  W(box('shell', X0 - 0.6, X0, Z0, Z1, 'S02A_SHELL_W'), box('shell', X1, X1 + 0.6, Z0, Z1, 'S02A_SHELL_E'));

  // ---- house blocks outside the triangle of streets (west side, mirrored east); each corner keeps >= 3.5 m from a
  // street's centre line, so main streets stay about 6 m wide or more.
  const west = [
    box('house', X0, -12, Z0, -33, 'S02A_HOUSE_NW1'), // north-west row (behind Team A's spawn, west)
    box('house', X0, -18, -33, -16, 'S02A_HOUSE_NW2'),
    box('house', X0, -32, -16, 10, 'S02A_HOUSE_W1'),
    box('house', X0, -41, 10, Z1, 'S02A_HOUSE_W2'),    // beside Team B's spawn
  ];
  for (const h of west) W(h, mirror(h, h.id.replace('_NW', '_NE').replace('_W', '_E')));
  // South row behind the B to C street.
  W(box('house', -22, 22, 36, Z1, 'S02A_HOUSE_S'));

  // ---- houses inside the triangle; the gaps between them are the side alleys to the plaza (>= 3 m)
  const inner = [
    box('house', -14, -9, 12, 22, 'S02A_HOUSE_IW'),
    box('house', -12, -9, -9, -3, 'S02A_HOUSE_INW'),
  ];
  for (const h of inner) W(h, mirror(h, `${h.id}_M`));
  W(box('house', -5, 5, 16, 24, 'S02A_HOUSE_IS'));

  // ---- prison pens (fenced, see-through; the gate faces the plaza so rescuers can walk in)
  const [ax, az] = fromPack(48, 57), [bx, bz] = fromPack(27, 20), [cx, cz] = fromPack(69, 20);
  const pens: Record<TeamSlot, AgawanPen> = {
    A: pen('A', ax, az, 8, 6, 's', walls),
    B: pen('B', bx, bz, 8, 6, 'e', walls),
    C: pen('C', cx, cz, 8, 6, 'w', walls),
  };

  // ---- cover and blockers (12_OBSTACLE_PLACEMENT.csv, mirrored so the A-B and A-C streets get the same cover)
  const at = (id: string, kind: AgawanWallKind, px: number, pz: number, w: number, d: number) => { const [x, z] = fromPack(px, pz); return prop(kind, x, z, w, d, id); };
  W(at('S02A_OB01_CRATES', 'crate', 35, 58, 2, 2));          // A-B street, west of Team A
  W(at('S02A_OB04_KIOSK', 'kiosk', 61, 58, 2, 2));           // A-C street (mirror of 01)
  W(at('S02A_OB02_BARRIER', 'barrier', 26, 48, 3, 0.6));     // A-B street, staggered
  W(at('S02A_OB05_PLANTER', 'planter', 70, 48, 3, 0.8));     // A-C street (mirror of 02)
  W(prop('jeepney', -30.5, 13, 2.2, 6, 'S02A_OB03_JEEPNEY')); // moved from pack (17, 34): kept on the A-B street's west kerb
  W(prop('tricycle', 30.5, 13, 1.6, 2.6, 'S02A_OB06_TRICYCLE')); // moved from pack (80, 34): mirror kerb on the A-C street
  W(prop('crate', 30.5, 9.2, 1.4, 1.4, 'S02A_OB06B_DRUMS'));  // drums beside the tricycle: same cover length as the jeepney
  W(at('S02A_OB07_BARRIER', 'barrier', 36, 9, 3, 0.6));      // B-C street, west half
  W(at('S02A_OB08_CART', 'cart', 60, 9, 3, 0.6));            // B-C street, east half (same footprint as 07)
  W(at('S02A_OB10_CRATE', 'crate', 31, 31, 1.6, 1.6));       // west approach to the plaza
  W(at('S02A_OB11_STALL', 'stall', 65, 31, 1.6, 1.6));       // east approach to the plaza (same footprint)
  W(prop('bench', 0, -11, 2, 0.5, 'S02A_OB12_BENCH'));        // plaza bench, moved 1 m south of pack (48, 52) to clear Team A's pen gate

  // ---- bases and spawns: 10 spawns behind each marker, facing the plaza
  const sp = (index: number, x: number, z: number): Spawn => ({ index, x, z, yaw: Math.atan2(x, z) }); // yaw faces the origin
  const row = (first: number, cxs: number, czs: number, ux: number, uz: number, vx: number, vz: number): Spawn[] =>
    Array.from({ length: 10 }, (_, i) => { const a = (i % 5) - 2, b = Math.floor(i / 5); return sp(first + i, cxs + ux * a * 1.6 + vx * b * 1.6, czs + uz * a * 1.6 + vz * b * 1.6); });
  const baseArea = (slot: TeamSlot, x: number, z: number): Rect => ({ id: `S02A_BASE_${slot}`, minX: x - 7, maxX: x + 7, minZ: z - 5, maxZ: z + 5 });
  const [Ax, Az] = fromPack(48, 68), [Bx, Bz] = fromPack(16, 12), [Cx, Cz] = fromPack(80, 12);
  // "Behind" = away from the plaza; rows run across that direction.
  const behind = (x: number, z: number, d: number) => { const l = Math.hypot(x, z); return [x + (x / l) * d, z + (z / l) * d] as const; };
  const mk = (slot: TeamSlot, x: number, z: number, first: number): AgawanBase => {
    const l = Math.hypot(x, z), ox = x / l, oz = z / l; // outward
    const [sx, sz] = behind(x, z, 6);
    return { slot, x, z, area: baseArea(slot, x, z), spawns: row(first, sx, sz, -oz, ox, ox, oz) };
  };
  const bases: Record<TeamSlot, AgawanBase> = { A: mk('A', Ax, Az, 1), B: mk('B', Bx, Bz, 11), C: mk('C', Cx, Cz, 21) };

  const routes: AgawanLayout['routes'] = [
    { id: 'A_B', points: [[48, 68], [35, 53], [25, 39], [16, 12]].map(([x, z]) => fromPack(x, z)) },
    { id: 'A_C', points: [[48, 68], [61, 53], [71, 39], [80, 12]].map(([x, z]) => fromPack(x, z)) },
    { id: 'B_C', points: [[16, 12], [32, 8], [48, 8], [64, 8], [80, 12]].map(([x, z]) => fromPack(x, z)) },
  ];
  const benches = Array.from({ length: 30 }, (_, i) => ({ x: -28 + (i % 15) * 4, z: 46 + Math.floor(i / 15) * 3 }));

  return {
    walls, bases, pens,
    plaza: { id: 'S02A_PLAZA', minX: -8, maxX: 8, minZ: -8, maxZ: 8 },
    deco: [{ kind: 'tree', x: 0, z: 11 }],
    routes, benches,
    bounds: { id: 'S02A_BOUNDS', minX: X0, maxX: X1, minZ: Z0, maxZ: Z1 },
  };
}

/** StageGeometry view of the layout (walls, spawns, bounds) for the shared room code. */
export function agawanGeometry(l: AgawanLayout): StageGeometry {
  return {
    stage: AGAWAN.id,
    walls: l.walls,
    start: null, finish: null, safe: null,
    bounds: l.bounds,
    // Team A spawns 1-10, Team B 11-20, Team C 21-30 (AgawanEngine.start places each player at their own team's base).
    spawns: [...l.bases.A.spawns, ...l.bases.B.spawns, ...l.bases.C.spawns],
    benches: l.benches,
    startZ: 0, finishZ: 1,
    watcher: null,
  };
}
