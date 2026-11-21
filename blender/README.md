# Blender: CN Trials

Pinned **Blender 5.3.0**. Conventions: `docs/BLENDER_PIPELINE.md`.

## One command

```bash
bash blender/scripts/run_stage.sh STG01
```

Installs the Blender Python module (`bpy==5.3.0`) if missing, then builds, exports, validates, renders
previews and runs the browser check. Add `--no-render` to skip the previews. No Blender window is
needed; it runs the same in a Claude cloud session, in CI and on a desktop.

## Scripts

| Script | Does |
|--------|------|
| `scripts/generate_stage_01_greybox.py` | Builds `scenes/STAGE_01_GREYBOX.blend` from `scripts/specs/stg01_greybox.json` (primitives only, nine collections) |
| `scripts/report_greybox.py` | Writes `docs/STAGE_01_GREYBOX_REPORT.md` from the metadata and validation JSON |
| `scripts/export_stage.py` | Writes `exports/<STAGE>/<file>.glb`, `<file>_METADATA.json`, `<STAGE>_collision.json` and `<STAGE>_markers.json` |
| `scripts/validate_asset.py` | Checks naming, units, transforms, markers, spec measurements, triangle budget, Shepherd sightline; writes `<STAGE>_validation.json` |
| `scripts/render_preview.py` | CPU Cycles renders from every camera into `exports/<STAGE>/previews/`; review renders also to `renders/` |
| `../tools/asset-check/check-glb.mjs` | Khronos glTF Validator + Three.js load in headless Chromium; writes `exports/<STAGE>/browser/` |
| `scripts/stage_01_collision_setup.py` | Prompt 04: opens the approved greybox and saves `scenes/STAGE_01_COLLISION_READY.blend` with gameplay collections (collision, triggers, boundaries, spawns, watcher reference, spectators, signal anchors), then writes `exports/STAGE_01_METADATA.json`. `--screenshots` renders `renders/STAGE_01_COLLISION_*.png` |
| `scripts/validate_stage_01_metadata.py` | Validates the metadata against `schemas/STAGE_01_METADATA.schema.json`, the scene transforms and the runtime exports; writes `exports/STAGE_01_METADATA_VALIDATION.json` |
| `scripts/stage_01_collision_screens.py` | Top, side and perspective validation renders of the collision-ready scene (CPU Cycles) |
| `scripts/stage_01_textures.py` | Prompt 05: original procedural tileable textures into `textures/STG01/` |
| `scripts/stage_01_environment_build.py` (+ `stage_01_env_kit.py`) | Prompt 05: copies the collision-ready scene and saves `scenes/STAGE_01_ENVIRONMENT_FINAL.blend` with the detailed visual environment; gameplay collections untouched |
| `scripts/stage_01_environment_export.py` | Writes `exports/STAGE_01_ENVIRONMENT.glb`, `STAGE_01_LIGHTING.json` and the export report |
| `scripts/validate_stage_01_environment.py` | Gameplay unchanged, metadata still valid, yard clear, sightlines, materials, budgets |
| `scripts/stage_01_environment_render.py` | Wide, third-person, front, side and top renders into `renders/` |
| `../tools/asset-check/check-environment.mjs` | glTF Validator + Three.js check of the environment GLB (scale, orientation, materials) |
| `scripts/watcher_textures.py`, `scripts/watcher_build.py` | Prompt 06: THE WATCHER textures, then `scenes/THE_WATCHER.blend` (mesh, rig, lens states, clips, anchors, LOD1) |
| `scripts/watcher_export.py`, `scripts/validate_watcher.py` | `exports/THE_WATCHER.glb`, validation report and asset manifest |
| `scripts/watcher_render.py` | Turnaround, close-ups, components, materials, poses, in-stage view and animation preview into `renders/watcher/` |
| `../tools/asset-check/check-watcher.mjs` | glTF Validator + Three.js check of the Watcher GLB (scale, rig, clips, lens states) |
| `scripts/cn_blender.py` | Shared helpers |

## Editing by hand

`scenes/STAGE_01_COLLISION_READY.blend` is generated from the greybox by `stage_01_collision_setup.py`;
change the greybox or the script, not the collision-ready file. Open `scenes/STAGE_01_GREYBOX.blend` in Blender 5.3.0. The generator owns the `00_`–`08_`
collections and rebuilds them from the spec, so hand-made changes belong in new collections or in the
spec. Run the export and validation afterwards. `.blend`, `.glb` and images are stored with Git LFS.
