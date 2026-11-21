# Blender pipeline

Status: v0.1 PROPOSED, 21 November 2026. Extends GDD §9 (Blender and asset production). Where this
file and the GDD disagree, the GDD wins until the GDD is revised.

## 1. Environment check (21 November 2026)

| Check | Result |
|-------|--------|
| `blender` on the command line in the Claude Code cloud container | **Not installed** |
| Python module `bpy` importable | **No** |
| Official `bpy` wheel on PyPI for this container (Python 3.13, Linux x86-64) | **Available**: `bpy 5.3.0` (also 5.1.x–5.2.x), 427 MB wheel, downloaded successfully as a test, then deleted |
| `download.blender.org` reachable | Yes (HTTP 200) |
| GPU in the container | **None** (no `/dev/dri`). CPU only, 4 cores, 15 GB RAM |
| Persistence | The container is temporary. Anything installed is lost when the session ends unless the environment setup script installs it |
| Existing Blender integration in this Claude session | No direct Blender connector. A third-party service (Higgsfield "3D scene builder") can run Blender Python remotely, but it is paid, external and not under project control, so it is **not** part of this pipeline |
| Owner's desktop Blender | **Installed on Windows, with the Blender Lab "MCP" extension v1.0.3** (official Blender extension, installed in Blender 5.3 user extensions; owner confirmed). Its bridge server runs inside Blender on `localhost:9876` with Auto Start on, so only programs on the same Windows PC can reach it. Not reachable from this cloud session: no Blender MCP tools are loaded here and no computer folder is shared through Remote Control (re-checked 21 November 2026). Blender version **5.3.0** |

**Conclusion:** Claude cannot control a Blender GUI. Claude can run Blender **headless** in the cloud
container by installing the `bpy` module (or the Blender Linux build) at the start of a session. That
is enough for scripted blockouts, batch export, validation and CPU (Cycles) preview renders. Real-time
viewport work, sculpting, hand modelling, rigging touch-ups and look development happen in the owner's
desktop Blender.

## 2. Roles

| Work | Where | Who |
|------|-------|-----|
| Greybox / blockout from the approved spec | Cloud, headless, Python script | Claude |
| Collision proxies and gameplay markers | Cloud script; owner may adjust in desktop | Claude, reviewed by owner |
| Hand modelling, sculpt, UVs, texturing, rigging, animation | Desktop Blender | Owner / 3D artist |
| Export to GLB | Script (same script on both machines) | Either |
| Validation (naming, scale, budgets, glTF validity, loads in the browser) | Cloud script + browser test | Claude |
| Approval | Review of screenshots and validation report | Owner |

## 3. Version pinning

- Pin **one Blender minor version** for the whole project, used on the desktop and in the cloud, so
  `.blend` files and exporter behaviour match. **Pinned: Blender 5.3.0** (the owner's desktop version),
  with `bpy==5.3.0` in the cloud. Record changes in the decision log.
- Cloud install (to go into the environment setup script once approved):
  `pip install bpy==<pinned version>`. Re-check the wheel's Python requirement when changing versions.
- Never open a `.blend` saved in a newer Blender with an older one.

## 4. Coordinates, units and scale

| Rule | Value |
|------|-------|
| Unit system | Metric, Unit Scale **1.0**, Length in metres. **1 Blender unit = 1 metre = 1 game unit** (GDD §9.2) |
| Up axis in Blender | **+Z** (Blender default; do not change) |
| Facing in Blender | Characters, enemies and directional props face **−Y** (Blender "Front" view looks at their face) |
| Export | glTF exporter with **+Y Up** enabled. It converts Blender (Z-up, −Y front) to glTF (Y-up, **+Z front**), which is what Three.js expects |
| Stage world origin | (0, 0, 0) at the **centre of the start line**, ground level Z = 0. The course runs toward **+Y** in Blender, which becomes **−Z** in Three.js (the default camera's forward direction) |
| Character origin | At the ground contact point between the feet (GDD §9.2) |
| Prop origin | At the pivot it rotates or moves around; otherwise at bottom centre |
| Transforms | Apply rotation and scale before export (scale = 1, rotation = 0 on mesh objects). Location may stay non-zero for placed props |
| Normals | Outward, recalculated; no flipped or zero-area faces |
| Server parity | The server uses the same metres and the same origin. Collision and marker data are exported from the same scene (§7), never re-measured by hand |

## 5. Naming

GDD §9.2 prefixes, plus the additions marked NEW.

| Prefix | Use | Example |
|--------|-----|---------|
| `CHR_` | Character meshes and files | `CHR_Contestant_Base` |
| `ENM_` | Enemies and stage figures | `ENM_Shepherd` (Stage 01) |
| `STG01_` | Stage-only objects (two-digit stage number) | `STG01_Ground_Yard` |
| `ZONE_` NEW (Prompt 03) | Gameplay zone overlays and coverage markers (review only) | `ZONE_STG01_Finish` |
| `REF_` NEW (Prompt 03) | Reference aids (review only) | `REF_STG01_ScaleFigure_1_2m` |
| `PRP_` | Props; stage-specific props add the stage | `PRP_STG01_FloodlightMast` |
| `VFX_` | Effect meshes | `VFX_SignalSweep` |
| `COL_` | Collision proxies | `COL_STG01_Ground`, `COL_STG01_Wall_E` |
| `MAT_` NEW | Shared materials | `MAT_Dirt_Packed`, `MAT_Metal_Worn` |
| `GMK_` NEW | Gameplay markers (Empties) | `GMK_SPAWN_01` … `GMK_SPAWN_30`, `GMK_FINISH`, `GMK_SHEPHERD` |
| `CAM_` NEW | Authored cameras | `CAM_STG01_Intro`, `CAM_STG01_Spectator_01` |
| `LGT_` NEW | Lights | `LGT_STG01_Flood_03` |
| `PRP_KIT_` NEW (017) | Props reusable across stages | `PRP_KIT_FloodlightTower_01`, `PRP_KIT_Bench_4m` |
| `COL_CAM_` NEW (017) | Camera-only collision; exported as `camera_colliders`, never used by the server | `COL_CAM_STG01_Fence_W` |
| `STG01_BG_` NEW (017) | Backdrop beyond the outer barrier | `STG01_BG_WaterTower_Tank` |
| `STG01_Decal_` NEW (017) | Ground decals | `STG01_Decal_SpawnMark` |
| `LOD1`, `LOD2` suffix NEW | Level-of-detail meshes | `PRP_STG01_FloodlightMast_LOD1` |

Rules: PascalCase after the prefix, no spaces, ASCII only, numbers zero-padded to two digits. Animation
clips use lower snake case, shared across the rig: `idle`, `walk`, `run`, `sprint`, `jump`, `fall`,
`land`, `stumble`, `eliminated`, `victory`, `spectator_idle` (GDD §4.3). Object names are permanent IDs:
renaming one is a code change.

### Scene collections (every stage file; Prompt 03 structure, adopted 21 Nov 2026)

```
STAGE_01_GREYBOX.blend
├── 00_REFERENCE              REF_ scale figure, north arrow (review only)
├── 01_ARCHITECTURE           ground, fences, gates, platforms, observation structures
├── 02_GAMEPLAY_ZONES         line bands, lane lines, GMK_ markers; ZONE_ overlays and coverage (review only)
├── 03_ENVIRONMENT_BLOCKERS   outer barrier, relics, backdrop (nothing inside the course in Stage 01)
├── 04_WATCHER_PLACEHOLDER    ENM_ proxy; facing arrow and envelope (review only)
├── 05_LIGHTING_PLACEHOLDERS  PRP_KIT_ towers, lamps, speakers; LGT_ lights (bake = baked | dynamic | decorative)
├── 06_COLLISION              COL_ and COL_CAM_ boxes (never rendered or exported to the GLB)
├── 07_PLAYER_SPAWNS          GMK_SPAWN_01..30 markers; capsule proxies at the player radius (review only)
├── 08_CAMERAS                CAM_ review cameras (res and review_name properties)
└── _WORK                     scratch; never exported
```

Objects with the custom property `review_only` (zone overlays, capsules, envelopes, reference aids) are
review aids: they appear in review renders and are excluded from the runtime GLB.

## 6. Files and folders

| Folder | Holds |
|--------|-------|
| `blender/scenes/` | Stage `.blend` files (`STAGE_01_GREYBOX.blend`) |
| `blender/models/` | Character, enemy and prop `.blend` files |
| `blender/materials/` | Shared material library `.blend` and texture sources |
| `blender/scripts/` | Python scripts (§8). Only scripts that have been run and validated are committed |
| `blender/exports/` | Raw GLB exports straight from Blender, plus the sidecar JSON (§7). Not loaded by the game directly |
| `apps/web/public/assets/` (later) | Optimised, validated runtime GLBs produced from `blender/exports/` |

Large binaries go in **Git LFS** (decided). `.gitattributes` tracks `.blend`, `.glb`, `.bin`, `.fbx`,
`.obj`, image textures (`.png`, `.jpg`, `.jpeg`, `.webp`, `.exr`, `.hdr`, `.tga`, `.psd`, `.ktx2`), audio
(`.wav`, `.ogg`, `.mp3`, `.flac`) and `.docx`. The two concept boards and the GDD `.docx` committed before
LFS stay as normal git files.

- Install once per machine: `git lfs install` (Git for Windows includes Git LFS).
- `.blend1` / `.blend@` backup files are ignored, never committed.
- GitHub meters LFS storage and bandwidth per account; check usage under GitHub Settings → Billing
  before large uploads. CI checkouts that need the files use `lfs: true`.
- Keep source textures in `blender/materials/`; only compressed runtime textures reach the web app.

## 7. Export conventions

### Runtime visual GLB

| Setting | Value |
|---------|-------|
| Format | glTF Binary (`.glb`) |
| Include | Collections 01–05 and 07 (markers as empties), minus `review_only` objects; never 00, 06, 08 or `_WORK` |
| Transform | +Y Up |
| Mesh | Apply modifiers, UVs, normals; tangents only when a normal map is used |
| Materials | Principled BSDF only (exports cleanly to glTF PBR). Image textures as PNG/JPEG at export; converted to KTX2 later |
| Custom properties | **On** (`export_extras`), so marker and gameplay metadata reach Three.js as `userData` |
| Animation | Characters and enemies only; NLA tracks / actions named by the clip names in §5 |
| Compression | Off at Blender export. Compression is done afterwards (below) so the raw export stays inspectable |
| Lights / cameras | Not exported in runtime GLBs. Lighting is rebuilt in Three.js from `LGT_` data or baked into textures (GDD §5.1) |

### Collision and gameplay data (server)

The game server (Cloudflare Durable Object) should not parse visual GLBs. A script writes, from the same scene:

- `blender/exports/STG01_collision.json`: one entry per `COL_` object as a primitive (box, cylinder,
  capsule or convex hull) with position, rotation and size in metres, in the **game (Y-up)
  coordinates**.
- `blender/exports/STG01_markers.json`: one entry per `GMK_` empty with id, position, facing and its
  custom properties.
- Optionally `COL_STG01_StaticCollision.glb` (GDD §9.3) for the debug view in the browser.

### Optimisation (after export, outside Blender)

`npx @gltf-transform/cli` (pinned version) on the raw GLB: dedup, prune, weld, resize textures to the
budget, KTX2 (or WebP) texture compression, then Draco or Meshopt geometry compression (Three.js loads
both). The output goes to the web app's assets folder. The raw export stays in `blender/exports/`.

## 8. Scripts: how they are written, run and validated

### Writing

- One script per job, each runnable on its own and safe to run twice (it rebuilds its collection
  instead of adding duplicates).
- Scripts take parameters from a JSON spec file (for Stage 01: `blender/scripts/specs/stg01_greybox.json`
  with dimensions from the approved Stage 01 spec). No magic numbers inside scripts.
- Scripts never delete or overwrite hand-made objects outside the collection they own.

Scripts (written and run for Stage 01 on 21 November 2026; see `blender/README.md`):

| Script | Job |
|--------|-----|
| `generate_stage_01_greybox.py` | Build the greybox from the spec: ground, start zone, finish gate, Shepherd platform and placeholder, boundaries, `COL_` proxies, `GMK_` markers |
| `export_stage.py` | Export the runtime GLB and the collision and marker JSON for a stage |
| `validate_asset.py` | Check a `.blend` or `.glb` against §4, §5, §7 and the budgets; write a JSON report |
| `render_preview.py` | CPU Cycles preview renders from `CAM_` objects for review |
| `run_stage.sh` | Runs all of the above plus the browser check in one command; installs `bpy` if missing |
| `stage_01_collision_setup.py` | Prompt 04: collision-ready scene with gameplay collections and `STAGE_01_METADATA.json` (`docs/STAGE_01_COLLISION_VALIDATION.md`) |
| `validate_stage_01_metadata.py` | Schema, ID, transform and runtime-consistency checks for the metadata |
| `../tools/asset-check/check-glb.mjs` | Khronos glTF Validator and Three.js load in headless Chromium |

### Running

Cloud container (headless):

```bash
pip install bpy==5.3.0
python blender/scripts/generate_stage_01_greybox.py --spec blender/scripts/specs/stg01_greybox.json
```

Owner's desktop (same scripts):

```bash
blender --background blender/scenes/STAGE_01_GREYBOX.blend --python blender/scripts/export_stage.py -- --stage STG01
```

Scripts accept their own arguments after `--` and work both through `blender --python` and as a plain
`python` script with the `bpy` module.

### Validating

An asset is not "approved" until all of these pass (GDD §9.1 step 8):

1. **Scene check** (`validate_asset.py`): naming prefixes, unit scale 1.0, applied transforms,
   no unused or duplicate materials, no missing textures, no n-gons on deforming meshes, triangle and
   texture counts against budget, required `GMK_` markers present (Stage 01: 30 spawns, finish,
   Shepherd, bounds).
2. **glTF check:** the official Khronos glTF Validator (`npx gltf-validator`, pinned) reports no errors.
3. **Browser check:** a headless Chromium test (Playwright, already installed in the cloud container)
   loads the GLB with Three.js `GLTFLoader`, checks object names, marker count and bounds in metres,
   and saves a screenshot from the gameplay camera distance. Without a GPU it uses software WebGL, so
   it checks correctness, not performance.
4. **Performance check:** on the owner's reference desktop with 30 contestants visible (GDD §8);
   cannot be done in the cloud.
5. **Owner review** of the screenshots and the JSON report.

## 9. Asset budgets (PROPOSED starting points, to validate in M0 / M4)

| Asset | Triangles (LOD0) | Textures | Notes |
|-------|------------------|----------|-------|
| Contestant (body + preset parts) | ≤ 4,000 | one 1K atlas | × 30 on screen ≈ 120k triangles; one skinned mesh per contestant |
| The Shepherd | ≤ 25,000 | up to 2 × 2K | Single large hero asset |
| Stage 01 environment, visible at once | ≤ 300,000 | shared 1K–2K sets, KTX2 | Background silhouettes as low-poly cards |
| Draw calls, whole Stage 01 scene | ≤ 150 | | Instancing for masts, banners, fences (GDD §8.1) |
| Stage 01 runtime download (compressed) | ≤ 20 MB | | GDD §8: load only the current stage |

## 10. Reference use in Blender

Load reference images as Blender **Reference** image empties in `_WORK` only. Because the current
boards are concept art, do not trace them or scale the scene to match them (see
`REFERENCE_MANIFEST.md`). Measurements come from the Stage 01 spec.
