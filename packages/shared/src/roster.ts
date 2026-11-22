// CN TRIAL contestants (owner decision, 22 Nov 2026): characters are RANDOMISED, not selected. The server deals
// each player one of 30 original characters, never two the same in a room (30 characters, 30 seats).
// The 30 are built in code on one shared body (decision 028: shared base + costume variations) in the boards'
// general spirit (small figures in worn coats with hoods, hats, goggles and masks) without copying any board
// design or any existing game character. In particular no hooded yellow raincoat.
export type Headwear = 'hood' | 'beanie' | 'cap' | 'bucket' | 'widebrim' | 'tophat' | 'bandana' | 'tufts' | 'bun' | 'bowler' | 'helmet' | 'earflap';
export type Face = 'eyes' | 'goggles' | 'gasmask' | 'bag' | 'bandage' | 'visor';
export type Pack = 'none' | 'backpack' | 'satchel';

export interface ContestantEntry {
  /** Stable id, CHR_01 … CHR_30. */
  id: string;
  slot: number;
  name: string;
  coat: string; trim: string; pants: string; boots: string; skin: string;
  headwear: Headwear; hatColor: string;
  face: Face;
  scarf: string | null;
  pack: Pack;
  /** Visual build only (the gameplay capsule is identical for everyone, GDD §2.5). */
  height: number; width: number;
}

export const ROSTER_SIZE = 30;
export const ROSTER_STATUS: 'pending-owner-decision' | 'approved' = 'approved';

const NAMES = ['Ash', 'Bramble', 'Cinder', 'Cobble', 'Dune', 'Ember', 'Fable', 'Flint', 'Grit', 'Hazel', 'Hollow', 'Ivy', 'Jinx', 'Juniper', 'Kestrel',
  'Lark', 'Marlow', 'Nettle', 'Oak', 'Pebble', 'Quill', 'Rust', 'Slate', 'Sorrel', 'Thistle', 'Umber', 'Vesper', 'Willow', 'Yarrow', 'Zephyr'];
// 30 distinct muted coat colours (worn fabric, industrial night palette).
const COATS = ['#7a3b2e', '#4f5d3a', '#3d4f63', '#6b4f7a', '#8a6a2f', '#2f5b57', '#5c3a3a', '#46525e', '#7a5a43', '#3b4a3a', '#5a2f45', '#64707a', '#8a4a2a', '#2f4f6b',
  '#55623a', '#6f3f5f', '#3f3f4f', '#7a6a55', '#2f5f45', '#6a2f2f', '#4a5f7a', '#5f4a2f', '#3a5f6a', '#7a3f55', '#4f4f3a', '#2f3f5f', '#6a5a3a', '#5a6a5f', '#7a4f3a', '#3a2f4f'];
const TRIMS = ['#c9a86a', '#1e1e22', '#b8b0a0', '#8a2f2f', '#2f2f2f', '#a07a4a'];
const PANTS = ['#2b2b30', '#3b3328', '#2f3a44', '#44403a', '#2a332c'];
const BOOTS = ['#1f1a16', '#3a2a1e', '#2a2a2a'];
const SKINS = ['#e9c7a4', '#c99a74', '#a8734f', '#7a4f33', '#f2d6b8'];
const HATS: Headwear[] = ['hood', 'beanie', 'cap', 'bucket', 'widebrim', 'tophat', 'bandana', 'tufts', 'bun', 'bowler', 'helmet', 'earflap'];
const FACES: Face[] = ['eyes', 'goggles', 'eyes', 'gasmask', 'eyes', 'bag', 'eyes', 'bandage', 'eyes', 'visor'];
const HAT_COLORS = ['#2a2a30', '#6a4a30', '#3a4a5a', '#5a3a3a', '#4a5a3a', '#8a7a5a', '#303a30'];
const SCARVES = [null, '#8a2f2f', null, '#c9a86a', '#3a5a6a', null, '#5a6a3a', '#7a4f6a'];
const PACKS: Pack[] = ['none', 'backpack', 'satchel', 'none', 'backpack'];

function preset(i: number): ContestantEntry {
  let headwear = HATS[i % HATS.length];
  const coat = COATS[i];
  // Keep clear of the hooded-yellow-raincoat look: no hood on a yellow / mustard coat.
  if (headwear === 'hood' && /^#8a6a/i.test(coat)) headwear = 'beanie';
  return {
    id: `CHR_${String(i + 1).padStart(2, '0')}`, slot: i + 1, name: NAMES[i],
    coat, trim: TRIMS[(i * 5) % TRIMS.length], pants: PANTS[(i * 3) % PANTS.length], boots: BOOTS[i % BOOTS.length], skin: SKINS[(i * 7) % SKINS.length],
    headwear, hatColor: headwear === 'hood' ? coat : HAT_COLORS[(i * 3) % HAT_COLORS.length],
    face: FACES[(i * 3) % FACES.length], scarf: SCARVES[(i * 5) % SCARVES.length], pack: PACKS[(i * 2) % PACKS.length],
    height: 0.94 + ((i * 37) % 13) / 100, width: 0.92 + ((i * 53) % 17) / 100,
  };
}

export const CONTESTANT_ROSTER: ContestantEntry[] = Array.from({ length: ROSTER_SIZE }, (_, i) => preset(i));

export function contestantById(id: string | undefined): ContestantEntry | undefined {
  return CONTESTANT_ROSTER.find((c) => c.id === id);
}

/**
 * Deals a character nobody else in the room has. `taken` holds the ids already in use; `rand` returns [0, 1).
 * Returns undefined only if all 30 are taken (the room is full at 30, so that cannot happen for a joining player).
 */
export function dealCharacter(taken: Iterable<string>, rand: () => number = Math.random): string | undefined {
  const used = new Set(taken);
  const free = CONTESTANT_ROSTER.filter((c) => !used.has(c.id));
  if (!free.length) return undefined;
  return free[Math.floor(rand() * free.length) % free.length].id;
}
