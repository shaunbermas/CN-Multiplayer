# CN TRIAL · 04 Environment Bible (Stage 01: the night yard)

Audit date 24 Nov 2026, `main` @ `7ccb1ba`. Labels: see 01. The Stage 01 layout, greybox, gameplay geometry and
detailed environment are **APPROVED** (017, 019, 021, 022). Future visual work builds on them; it does not move
gameplay geometry.

## 1. Approved layout and world dimensions

Source: `docs/STAGE_01_SPEC.md` §1 (v0.2), `docs/STAGE_01_DESIGN_SPEC.md`, metadata
`blender/exports/STAGE_01_METADATA.json` (schema 1.0.0). Blender coordinates: origin at the centre of the start
line, Z up, course toward +Y (the game uses −Z; conversion in `packages/shared/src/stage-metadata.ts`).

| ID | Item | Value |
|---|---|---|
| L1 | Playable width | 60 m (X −30…+30) |
| L2 | Start zone | Y −15…0 (15 m) |
| L3 | Course | 160 m, start line to finish line |
| L4 | Finish trigger | Y 160…163, full width, 3 m high |
| L5 | Safe zone | Y 163…172 |
| L6 | Boundary | 3 m fence colliders at X ±30; start wall Y −15; back wall Y 172 |
| L7 | Spawns | 30 points, 10 × 3 grid, X −13.5…+13.5 every 3 m, rows Y −2.0 / −4.5 / −7.0; seeded row shuffle |
| L8 | Watcher plinth | X 0, Y 185, 12 × 12 m, 4 m high, outside the playable area |
| L9 | The Watcher | 28 m tall on the plinth |
| L10 | Markings | Lane lines every 6 m, start and finish bands (visual only) |
| L11 | Dressing | 22 m floodlight towers at X ±38 (Y −10, 40, 90, 140, 175), 9 m finish gate, spectator gantry, judges' booth, benches, playground relics, outer barrier, roadway, water tower, tree lines. No collision inside the yard except gameplay geometry |

Diagrams: `docs/diagrams/STG01_top_plan.svg`, `STG01_side_section.svg`, `STG01_front_elevation.svg`.

## 2. Gameplay geometry (server-relevant)

| Element | Where it comes from | Status |
|---|---|---|
| Walls, triggers, spawns, benches, spectator points, signal anchors | `STAGE_01_METADATA.json`, parsed by `parseStageMetadata` / `geometryFromMetadata` into the shared stage registry (`packages/shared/src/stages.ts`) | APPROVED (021, 025); validated in CI (`validate_stage_01_metadata.py`, metadata rebuild diff) |
| Obstacles: 10 barricade rows (1.2 m deep, 1.1 m high, 6 m gaps, fence to fence, mirror-symmetric, four alternating patterns) + sliding gate (10 m × 0.6 m × 2.2 m at 58 % of the course, moves only during green/amber time, period 7 s) | `packages/shared/src/obstacles.ts`, positions relative to the approved course | APPROVED (031 (5), (6)); unit tests (8) pass; server-enforced (`test:obstacles`) |
| Collision model | Kinematic circle vs axis-aligned rectangles, identical on server and client | `packages/shared/src/movement.ts` (ADR 0001) |

Detection is not line-of-sight (017 E9): no geometry hides a player from The Watcher.

## 3. Decorative geometry and layers (no collision)

| Layer | Content | Runtime | Source |
|---|---|---|---|
| Near: 3D environment | Yard ground, painted lines, puddle decals, fences, service gates, floodlight masts and lamp heads, gantry, booth, finish gate, start barrier, plinth, props (jersey barriers, swing set, slide, roundabout, rocket-frame climber, see-saw), signal devices, machinery and cables | `blender/exports/stage15/STAGE_01_ENVIRONMENT.meshopt.glb` (2.31 MB, derived) | `blender/scenes/STAGE_01_ENVIRONMENT_FINAL.blend` → `STAGE_01_ENVIRONMENT.glb` 6.43 MB (approved, locked) |
| Derived changes | 3D backdrop (overpass, water tower, silhouettes, street lamps) and Shepherd placeholder removed from the runtime copy; far ground kept | `tools/stage15/glb/derive_environment.mjs` | 029 (3) |
| Midground trees | 49 lit tree impostors at the approved pine positions (4 instanced calls); original cone trees stripped at load, grass tufts kept | `MidgroundTrees.tsx` | Stage 1.5 P03 |
| Far trees | 1,100 billboard cutouts, one instanced call, alpha clip; Low 40 %, Medium 70 %, High 100 % | `Surroundings.tsx`; `blender/exports/stage15/TREE_Cutout_Atlas.webp` | P02 |
| Matte painting | `MP_ForestLine` (r 470 m), `MP_IndustrialSkyline` (r 760 m), `MP_FarHills` (r 1,150 m); seamless 360° cylinders, unlit, no depth write; dimmed at night; darken behind The Watcher | `Surroundings.tsx`; WebP in `blender/exports/stage15/`; sources `art/stage15/matte/source/` | P02, 029 |
| Sky | Dome shader: gradient, moon, stars, clouds | `Atmosphere.tsx`, `skyModel.ts` | P04 |

All matte and tree art is original procedural artwork (`tools/stage15/generate_matte.py`), per the P02 report.

## 4. Materials and textures

| Set | Contents | Files |
|---|---|---|
| Stage 01 environment | Asphalt wet, chain link, finish checker, concrete weathered, foliage, dirt/grass ground, haze, metal rust paint, worn paint, dark and galvanised steel, barrier and hazard stripes, weathered wood (BC / ORM / N) | `blender/textures/STG01/*.png` (LFS) + `TEXTURES.json`; WebP inside the GLB |
| Runtime material tweaks | Puddles reflect the night environment map; wet asphalt and steel read; signal materials (`MAT_Signal_*`) driven by the signal | `Stage01Scene.tsx`, `skyModel.ts`, `runtimeMaterials` in `STAGE_01_LIGHTING.json` |
| Inventory (Stage 1.5 P01) | 29 materials, 34 images in the environment GLB | `docs/stage15/STAGE_1_5_ASSET_INVENTORY.md` |

Texture compression: WebP everywhere; **KTX2 NOT YET IMPLEMENTED** (planned "later" by 022 (3)).

## 5. Lighting specification

See 02 §3. Summary: 15 lights in `STAGE_01_LIGHTING.json` (10 floodlights, moon, finish, booth, two retired
Shepherd lights skipped at runtime) with Low/Medium/High tiers; one moon shadow map on High; signal wash light;
Watcher red light and searchlight; floodlight cones on every tier. Fog in code (`fog.ts`, 0.0085 exp2) supersedes the
JSON value (01 §9 C7). No baked lighting.

## 6. Optimisation strategy (as implemented)

| Technique | Where |
|---|---|
| Static meshes merged per collection in the GLB; animated and recoloured parts separate | 022 (5) |
| Meshopt-compressed runtime copies (environment 6.43 → 2.31 MB after backdrop removal) | `tools/stage15/compress_glb.sh`, `derive_environment.mjs` |
| Instancing for trees and impostors; 2D matte instead of distant geometry | P02, P03 |
| Quality tiers and adaptive fallback | `apps/web/src/game/qualityStore.ts`, `quality.ts` |
| Code split: menu chunk 325 KB, game chunk loaded in the background | `App.tsx` lazy `GameView` |

Measured cost (software renderer, comparison only; P08 report): spawn view Low 69 / Medium 80 / High 158 draw calls;
High with 30 players and obstacles 232 draw calls, 161k triangles. `BLENDER_PIPELINE.md` §9 proposed ≤ 150 draw calls
for the whole scene: **exceeded on High**; not re-measured after decision 031's fog and mist banks.

## 7. In-game validation screenshots

| Set | Build it shows | Path |
|---|---|---|
| p01 baseline → p04 atmosphere, p05 obstacles | Stage 1.5 passes (21 Nov) | `docs/stage15/screenshots/` |
| fb_high, fb_low (7 views + signal states) | Decision 029 build | `docs/stage15/screenshots/fb_high/`, `fb_low/` |
| Contestant in-game views, dust and splash FX | Decision 030/031 builds | `docs/stage15/screenshots/contestant/ingame_*.png` |
| Before / after | Stage 1.5 | `CN_TRIAL_STAGE_1_5_FINAL_DELIVERABLES/before_after/` |
| Blender review renders | Greybox, collision, environment | `renders/`, `blender/exports/STG01/previews/` |
| **Full 7-view set of the current fogged build (031)** | — | **NOT YET IMPLEMENTED** (capture with `tests/e2e/views.mjs`) |

## 8. Environment gaps and risks

| # | Item | Status |
|---|---|---|
| E1 | Obstacle detours not included in the 71 s crossing projection; round length with 10 rows not re-measured | NEEDS VERIFICATION (bot walk with obstacles, or playtest) |
| E2 | 30-human congestion through 6 m gaps | NEEDS VERIFICATION (K3) |
| E3 | Retired Shepherd names inside approved data and source scene | Legacy (01 §9 C10) |
| E4 | Signal anchors in metadata not moved to the lens (decision 025 follow-up) | NOT YET IMPLEMENTED (01 §9 C9) |
| E5 | Environment ambient audio | NOT YET IMPLEMENTED |
| E6 | Height fog / lightmaps | NOT YET IMPLEMENTED (K5, accepted as "revisit later") |
