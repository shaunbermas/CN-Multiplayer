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
| `scripts/build_stg01_greybox.py` | Builds `scenes/STG01_RedLightGreenLight.blend` from `scripts/specs/stg01_greybox.json` (primitives only) |
| `scripts/export_stage.py` | Writes `exports/<STAGE>/<file>.glb`, `<STAGE>_collision.json` and `<STAGE>_markers.json` (game Y-up coordinates) |
| `scripts/validate_asset.py` | Checks naming, units, transforms, markers, spec measurements, triangle budget, Shepherd sightline; writes `<STAGE>_validation.json` |
| `scripts/render_preview.py` | CPU Cycles renders from every `CAM_` camera into `exports/<STAGE>/previews/` |
| `../tools/asset-check/check-glb.mjs` | Khronos glTF Validator + Three.js load in headless Chromium; writes `exports/<STAGE>/browser/` |
| `scripts/cn_blender.py` | Shared helpers |

## Editing by hand

Open `scenes/STG01_RedLightGreenLight.blend` in Blender 5.3.0. The build script owns the `STG01_*`
collections and rebuilds them from the spec, so hand-made changes belong in new collections or in the
spec. Run the export and validation afterwards. `.blend`, `.glb` and images are stored with Git LFS.
