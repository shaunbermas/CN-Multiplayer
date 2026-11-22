# CN TRIAL · Stage 1.5 asset inventory (Prompt 01)

## Environment (`blender/exports/STAGE_01_ENVIRONMENT.glb`, 6.43 MB, approved, decision 022)

| Node | Triangles | Materials | Stage 1.5 plan |
|------|-----------|-----------|----------------|
| `ENV_VISUAL_ARCHITECTURE` | 31,400 | 14 (ground, fences, concrete, steel, paint lines, puddles…) | Keep; puddle and ground look improved in P03 |
| `ENV_VISUAL_PROPS` | 13,234 | 7 | Keep |
| `ENV_VISUAL_MACHINERY` | 3,204 | 6 | Keep |
| `ENV_VISUAL_FOLIAGE` | 3,088 | Foliage, wood | Cone trees and grass tufts: replaced by billboard cutouts and low-poly trees (P02/P03) |
| `ENV_VISUAL_BACKDROP` | 2,280 | 8 (overpass, water tower, silhouettes, street lamps) | Keep as the midground; matte layers go behind it (P02) |
| `ENV_VISUAL_SIGNAL_DEVICES` | 1,800 | Signal red, amber, green | Keep (driven at runtime) |
| `STG01_Ground_Yard` | 216 | `MAT_Asphalt_Wet` | Keep geometry; material detail in P03 |
| `VFX_GroundHaze` | 100 | `MAT_VFX_Haze` | High tier only |
| `ENM_Shepherd_Placeholder_*` | 400 | Shepherd | Hidden at runtime (decision 023) |
| Marker nodes | — | — | `SPAWN_PLAYER_01–30`, benches, signal anchors, start and finish (metadata) |

29 materials, 34 images (WebP). Lights: `blender/exports/STAGE_01_LIGHTING.json` (15 lights, three quality tiers).

## Enemy

`blender/exports/THE_WATCHER.glb` (2.28 MB, 12,662 triangles + LOD1 6,314), 33 bones, 9 clips, 6 anchors, 12 materials. Approved and locked (decisions 023, 024). Integrated: clips follow server state; lens states are inside the clips; the tower lamps are driven by `MAT_Signal_*`.

## Contestants

None. Capsule placeholders, 30 distinct colours. Roster blocked (see the discrepancy report).

## UI (`apps/web/src/App.tsx`)

The game already has these screens:
- auto-join by URL;
- lobby panel with the roster and a host start button;
- tournament toggle;
- briefing;
- countdown;
- signal banner (icon + word);
- SPOTTED stamp;
- spectator, qualified and waiting labels;
- results with tags;
- loading and asset-error screens.

Still to build:
- main menu;
- how to play;
- settings;
- create or join a room;
- invite copy;
- ready state;
- character select;
- connection-lost and reconnect states.

## Reference files (Stage 1.5 pack)

Copied into `references/STAGE_1_5/` unchanged, including:
- six character boards, with SHA-256 values verified;
- the UI concept board;
- the prompts, docs and checklist.
