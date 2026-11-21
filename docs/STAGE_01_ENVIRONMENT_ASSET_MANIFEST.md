# CN Trials · Stage 01 environment asset manifest (Prompt 05)

Status: **ready for owner review** (21 November 2026). Built by scripts; nothing is hand-edited.

| Deliverable | File |
|-------------|------|
| Final environment scene | `blender/scenes/STAGE_01_ENVIRONMENT_FINAL.blend` (Git LFS) |
| Build scripts | `blender/scripts/stage_01_environment_build.py` (scene), `stage_01_env_kit.py` (mesh and material kit), `stage_01_textures.py` (textures) |
| Test GLB | `blender/exports/STAGE_01_ENVIRONMENT.glb` (6.4 MB) via `stage_01_environment_export.py` |
| Runtime lighting, fog and quality tiers | `blender/exports/STAGE_01_LIGHTING.json` |
| Textures | `blender/textures/STG01/*.png` (Git LFS) and `TEXTURES.json` |
| Renders | `renders/STAGE_01_ENV_WIDE.png`, `_THIRD_PERSON`, `_FRONT`, `_SIDE`, `_TOP` (`stage_01_environment_render.py`) |
| Validation | `docs/STAGE_01_ENVIRONMENT_VALIDATION.md` |

Rebuild everything (about 4 minutes on CPU, no GPU):

```bash
python blender/scripts/stage_01_textures.py
python blender/scripts/stage_01_environment_build.py
python blender/scripts/stage_01_environment_export.py
NODE_PATH=$(npm root -g) node tools/asset-check/check-environment.mjs
python blender/scripts/validate_stage_01_environment.py
python blender/scripts/stage_01_environment_render.py
```

## 1. Scene collections

| Collection | Objects | Contents |
|------------|---------|----------|
| `VISUAL_ARCHITECTURE` | 155 | Yard and margin ground, painted lines, spawn rings and puddle decals, perimeter fences, service gates, floodlight masts and lamp heads, spectator gantry (and its stairs, bracing and roof lights), judges' booth (and stairs), finish gate, start barrier, Shepherd plinth |
| `VISUAL_PROPS` | 13 | Outer jersey barriers with rusty mesh above, playground relics (swing set, slide, roundabout, rocket-frame climber, see-saw) |
| `VISUAL_SIGNAL_DEVICES` | 14 | Tower signal lamps (red/amber/green lenses) and loudspeaker horns |
| `VISUAL_MACHINERY` | 17 | Generators, ground cables, overhead power cables between towers, transformer and cables onto the plinth |
| `VISUAL_FOLIAGE` | 139 | Pines (49) and grass tufts (90), all outside the fence |
| `VISUAL_BACKDROP` | 32 | Far ground, elevated roadway with street lamps, water tower, industrial silhouettes |
| `VISUAL_WATCHER` | 5 | The Shepherd placeholder, unchanged shapes, new finish (enemy production is a later milestone) |
| `VISUAL_VFX` | 3 | Ground haze cards (runtime, high tier); dust motes and fog volume (review renders only) |
| `LIGHTING` | 15 | Lights only: 10 floodlight spots, moon, Shepherd rim, finish, booth, lantern |
| `GAMEPLAY_COLLISION`, `_TRIGGERS`, `_BOUNDARIES`, `_MARKERS`, `PLAYER_SPAWNS`, `WATCHER_REFERENCE`, `SPECTATOR_LOCATIONS`, `SIGNAL_ANCHORS` | 189 | Unchanged from the approved collision-ready scene |
| `CAMERAS`, `REFERENCE` | 19 | Review cameras (5 new `CAM_STG01_Env_*`) and review aids |

## 2. Modular assets

Instanced pieces share one mesh in the `.blend`. Triangles are per instance.

| Asset | Instances | Tris each | Notes |
|-------|-----------|-----------|-------|
| `PRP_KIT_FloodlightTower_Mast` | 10 | ~1,400 | Lattice mast, footing, conduit, junction box; inside its 1 × 1 × 22 m collider |
| `PRP_KIT_FloodlightTower_Head_W` / `_E` | 5 + 5 | ~480 | Six lamp housings aimed inward and down 55° (design spec §9), warm emissive faces |
| `PRP_KIT_SignalLamp_W` / `_E` | 5 + 5 | ~150 | Red, amber and green lenses on separate materials, with visors |
| `PRP_KIT_Loudspeaker_W` / `_E` | 2 + 2 | ~60 | Horn aimed at the yard |
| `PRP_KIT_Bench_4m` | 15 | ~180 | Steel frames, four timber slats; inside the bench collider (no backrest, to keep it) |
| `PRP_KIT_ServiceGate_4m` | 2 | ~110 | Galvanised frame, chain-link, hazard plate |
| `PRP_STG01_SpectatorGantry_Leg` | 22 | 24 | I-beam |
| `PRP_STG01_JudgesBooth_Leg` | 4 | 24 | Concrete footing and steel column |
| `PRP_STG01_FinishGate_Post` | 2 | ~1,200 | Truss column with a checker panel |
| `PRP_STG01_StartBarrier_Post` | 2 | ~70 | Hazard-banded base, motor head |
| `PRP_KIT_Generator` | 4 | ~110 | Skid, housing, radiator, exhaust, status light |
| `STG01_BG_StreetLamp` | 10 | ~50 | Sodium lamps along the roadway |
| `STG01_BG_OverpassPier` | 13 | 24 | Column with cap beam |
| `STG01_BG_Tree` | 49 | ~45 | Three-tier pine |
| `STG01_Foliage_Tuft` | 90 | 6 | Grass blades |
| `STG01_Decal_SpawnMark` | 30 | 32 | Painted ring under each spawn |
| Fences (W, E, S, N) | 4 unique | 600–1,000 | Plinth, hazard band, posts every 4 m, rails, barbed strands, chain-link; inside the boundary walls |
| Outer barriers (W, E, N, S) | 4 unique | 500–1,600 | 3 m jersey blocks, every fifth with a hazard band |
| Rocket-frame climber | 1 | ~5,000 | 12-bar cage, rings, nose cone, fins, platform, ladder |

Whole scene: **55,758 triangles** (visual, excluding review-only), against a 300k budget. The design spec
estimated 150–200k, so there is plenty of headroom for the Shepherd and contestants.

## 3. Materials (29 in the GLB, all glTF metallic-roughness)

| Material | Texture set | UV tile | Use |
|----------|-------------|---------|-----|
| `MAT_Asphalt_Wet` | `T_Asphalt_Wet` | 8 m | Yard ground: damp, cracked, repaired patches |
| `MAT_Ground_DirtGrass`, `MAT_Ground_Far` | `T_Ground_DirtGrass` | 10 m / 45 m | Margins; far ground (tinted) |
| `MAT_Concrete_Weathered` | `T_Concrete_Weathered` | 4 m | Plinths, barriers, booth floor, roadway, Shepherd plinth |
| `MAT_Metal_RustPaint` | `T_Metal_RustPaint` | 2 m | Faded teal paint chipped to rust: relics, roof sheets, water tower |
| `MAT_Steel_Dark` | `T_Steel_Dark` | 2 m | Old structural steel: masts, fence posts, frames |
| `MAT_Steel_Galvanised` | `T_Steel_Galvanised` | 2 m | The tournament's newer steel: gantry, booth, finish truss, generators |
| `MAT_ChainLink` | `T_ChainLink` | 0.6 m | Alpha-tested, double-sided |
| `MAT_Wood_Weathered` | `T_Wood_Weathered` | 1 m | Bench slats, swing seats, tree trunks |
| `MAT_Paint_Line`, `MAT_Checker_Finish` | `T_Paint_Worn`, `T_Checker_Finish` | 1 m / 1.6 m | Worn lines (alpha holes), finish band and gate panels |
| `MAT_Stripes_Hazard`, `MAT_Stripes_Barrier` | stripes | 1 m | Yellow/black bands; red/white barrier arm |
| `MAT_Foliage` | `T_Foliage` | 3 m | Pines, tufts |
| `MAT_VFX_Haze` | `T_Haze` | per card | Transparent haze cards (high quality tier) |
| `MAT_Puddle`, `MAT_Cable`, `MAT_Silhouette` | none | | Flat colour |
| `MAT_Light_Warm`, `MAT_Light_Sodium`, `MAT_Light_Aviation`, `MAT_Glass_Window_Warm` | none | | Warm emissive accents |
| `MAT_Signal_Red`, `MAT_Signal_Amber`, `MAT_Signal_Green` | none | | **Runtime-controlled** signal lenses |
| `MAT_TimerBoard_Screen`, `MAT_Shepherd_Lantern`, `MAT_Shepherd_Face`, `MAT_Shepherd_Placeholder` | none | | Runtime-driven or placeholder |

## 4. Textures

All textures are original and procedural (seeded tileable noise, `stage_01_textures.py`): no photos and no
concept-art crops, so there are no usage-rights questions. PNG sources are 9.8 MB in Git LFS; the GLB
carries them as WebP (0.99 MB in total).

| Set | Base colour | ORM | Normal |
|-----|-------------|-----|--------|
| `T_Asphalt_Wet` | 1024 | 512 | 1024 |
| `T_Concrete_Weathered`, `T_Metal_RustPaint`, `T_Ground_DirtGrass` | 1024 | 512 | 512 |
| `T_Steel_Dark` | 512 | 512 | 512 |
| `T_Steel_Galvanised` | 512 | 256 | 256 |
| `T_Wood_Weathered` | 512 | 256 | 512 |
| `T_ChainLink` (RGBA) | 512 | 256 | — |
| `T_Paint_Worn` (RGBA), `T_Stripes_Hazard`, `T_Stripes_Barrier`, `T_Checker_Finish`, `T_Foliage` | 256 | 256 | — |
| `T_Haze` (RGBA) | 256 | — | — |

34 images. GPU memory is about **50 MB** uncompressed with mipmaps. ORM packs occlusion (R), roughness (G)
and metalness (B) in the glTF layout; normal maps use the OpenGL / glTF convention. Base colour is sRGB,
the other maps are linear.

## 5. GLB contents (`STAGE_01_ENVIRONMENT_EXPORT.json`)

| Item | Value |
|------|-------|
| Size | 6.43 MB (budget 20 MB); geometry includes tangents for the normal maps |
| Mesh nodes / primitives (draw calls) | 15 / 52 (budget 150); 44–52 calls measured in Three.js |
| Merged static meshes | `ENV_VISUAL_ARCHITECTURE`, `_PROPS`, `_SIGNAL_DEVICES`, `_MACHINERY`, `_FOLIAGE`, `_BACKDROP` (one primitive per material) |
| Separate named nodes | `ENM_Shepherd_Placeholder_*` (5), `PRP_STG01_StartBarrier_Arm`, `PRP_STG01_JudgesBooth_TimerBoard`, `VFX_GroundHaze`, `STG01_Ground_Yard` |
| Anchors (empties with extras) | 73: `SPAWN_PLAYER_01–30`, signal, watcher, spectator and course anchors |
| Not exported | Collision, triggers, boundaries, cameras, lights (see `STAGE_01_LIGHTING.json`), review aids |
