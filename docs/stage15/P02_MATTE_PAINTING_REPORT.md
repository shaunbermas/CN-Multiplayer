# CN TRIAL · Stage 1.5 Prompt 02: matte painting and surrounding world

Status: **PASS**. The owner pre-authorised autonomous progress; the full visual lock is still for the owner's review at sign-off.

## What was built

| Deliverable | File |
|-------------|------|
| Generator for the layers and atlas (procedural, fixed seeds) | `tools/stage15/generate_matte.py` |
| Scenery footprints from the approved Prompt 05 scene (read-only) | `blender/scripts/stage15_export_zones.py` → `blender/stage15/STAGE_01_SCENERY_ZONES.json` |
| Placement generator | `tools/stage15/place_surroundings.py` |
| Source layers (PNG, Git LFS) | `art/stage15/matte/source/MP_FarHills.png`, `MP_IndustrialSkyline.png`, `MP_ForestLine.png`, `TREE_Cutout_Atlas.png` |
| Runtime textures (WebP, sRGB) | `blender/exports/stage15/*.webp`: hills 55 KB, skyline 59 KB, forest 72 KB, tree atlas 221 KB |
| Manifest | `blender/exports/stage15/STAGE_01_MATTE_PAINTING_MANIFEST.json`: dimensions, colour space, layer radii and heights, placements, licensing, exclusion boxes |
| Runtime | `apps/web/src/stages/stage01/Surroundings.tsx` |

## Layers

| Layer | Content | Placement | Texture |
|-------|---------|-----------|---------|
| `MP_FarHills` | Three hazy ridgelines with a moonlit rim | Cylinder r 1,150 m, 340 m tall | 4096 × 768 |
| `MP_IndustrialSkyline` | Factory blocks with lit windows, chimneys with aviation lights, cranes, truss bridge, pylons and wires. Densest behind the finish, sparse behind the start | r 760 m, 230 m | 4096 × 768 |
| `MP_ForestLine` | Continuous conifer and broadleaf tree line with clearings | r 470 m, 64 m | 4096 × 512 |

How the layers render and behave:
- **Seamless:** all three use periodic noise and wrap a full 360° with no seam.
- **Distance haze:** painted into the textures, so the layers render unlit, without fog and without tone mapping.
- **Draw order:** three draw calls, far to near. The layers never write depth.
- **Centre:** the course centre from the metadata (`BOUNDARY_PLAYABLE_AREA`).

## Tree cutouts

- **Atlas:** 8 silhouettes in a 2048 × 2048 atlas: 4 conifers, 2 broadleaf, 2 bare. Each is fitted to its cell with no edge clipping, verified by a zero-alpha check on all cell borders. Colour is bled into transparent pixels so mipmaps show no dark fringes.
- **Placement:** 1,100 placements, deterministic seed 1505. They avoid the yard (the visual collections' bounds plus 10 m) and the 31 backdrop footprints (plus 7 m). Density follows a smooth copse field and increases with distance.
- **Variation:** per-instance height, tint, mirroring and atlas cell.
- **Rendering:** cylindrical billboards in **one instanced draw call**, with alpha clip 0.5 (no blended transparency, no sorting). Fog is capped so trees stay darker than the hills behind them.
- **Quality fraction:** Low 40 %, Medium 70 %, High 100 % of the instances.
- **Collision:** none. Decorative only; the server never sees them.

## Validation

- **Viewpoints:** `tests/e2e/views.mjs` renders the 7 fixed viewpoints with no console errors. Before and after: `docs/stage15/screenshots/p01_baseline/` and `p02_matte/`.
- **Cost:** High spawn view 119 → 126 draw calls (3 layers + 1 cutout batch + the shadow pass for them).
- **Joins:** horizon joins are fine; there is no visible seam at u = 0. The hills' base dissolves into haze.
- **Licensing:** original procedural artwork only. No photographs, third-party or AI-generated images, and no character references.

## Known issues (later prompts)

1. The sky is still a flat colour. Moon, stars and clouds come in Prompt 04.
2. The existing cone trees inside the yard area are still in place. Prompt 03 replaces them with 3D trees.
