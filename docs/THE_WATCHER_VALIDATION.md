# CN Trials · THE WATCHER validation (Prompt 06)

Status: **all checks pass** (21 November 2026): 11 Blender checks, the Khronos glTF Validator
(0 errors) and the Three.js browser check. Design, rig and clips are described in
`docs/THE_WATCHER_SPEC.md`.

## 1. Dependencies

| Input | Status |
|-------|--------|
| GDD, Stage 01 spec (`docs/STAGE_01_SPEC.md`, L9 height 28 m), design spec | Present |
| Greybox, collision-ready scene, `STAGE_01_METADATA.json` (`WATCHER_ROOT_ANCHOR` at (0, 185, 4)) | Present |
| Prompt 05 environment (`STAGE_01_ENVIRONMENT_FINAL.blend`), used for the in-stage render | Present |
| Prompt 06 pack design sheet and references | Read; not used as drawn (decision 023) and not committed |

## 2. Blender checks (`blender/exports/THE_WATCHER_VALIDATION.json`)

| Check | Result | Evidence |
|-------|--------|----------|
| `collections` | PASS | The 7 pack collections, and no cameras or lights saved in the asset |
| `scale_origin` | PASS | Height 28.000 m in rest pose, feet on Z = 0, centred, faces −Y. Rig and mesh transforms are identity at the origin |
| `rig` | PASS | 33 bones, all `Watcher_`, hierarchy as specified, every `_L` mirrored by an `_R` |
| `skin_weights` | PASS | Every vertex is weighted 1.0 to exactly one bone (rigid mechanical parts); Armature modifier on the rig |
| `geometry_uvs_lod` | PASS | LOD0 12,662 triangles (budget 25,000); LOD1 6,314 (50 %) with weights kept; valid UVs |
| `materials` | PASS | 12 materials, glTF-exportable nodes only; 21 power-of-two textures on disk; the three lens states exist |
| `animations` | PASS | 9 clips at 24 fps with the documented ranges; every bone keyed in every clip; loops close; exactly one lens state at every key |
| `anchors` | PASS | All 6 anchors, rig-parented, in `WATCHER_GAMEPLAY_ANCHORS` |
| `no_game_logic` | PASS | No scripts, drivers or rule properties |
| `glb` | PASS | The GLB holds all 9 clips and a 33-joint skin; the browser check passed |
| `manifest_schema` | PASS | `THE_WATCHER_ASSET_MANIFEST.json` validates against the pack schema |

## 3. GLB in the browser (`tools/asset-check/check-watcher.mjs`)

`blender/exports/THE_WATCHER.glb`: 2.28 MB, 41 nodes, one skinned mesh in 12 primitives (one per
material), 21 WebP textures. glTF Validator: **0 errors**, 7 warnings, all `IMAGE_FEATURES_UNSUPPORTED`
(an sRGB profile in the WebPs, which Three.js ignores).

| Verified in Three.js 0.187 | Result |
|----------------------------|--------|
| Scale and origin | Rest height 28.00 m, lowest point Y 0, centred |
| Orientation | Faces +Z (glTF), toward the start line when placed in Stage 01. Optical origin at Y 23.6 |
| Rig | One shared skeleton of 33 `Watcher_` joints; all 6 anchors present |
| Clips | All 9 present with the documented lengths (1.0–4.0 s), and each moves the rig. The lens state bones show only neutral in Idle, only green in GreenSignal, and only red in RedSignal, ScanSweep and Detect |
| Materials | PBR with colour, normal and roughness maps; red and green lens materials emissive in the right channel |

Browser screenshots: `blender/exports/THE_WATCHER_browser/THE_WATCHER_browser_Watcher_Idle.png`,
`_GreenSignal.png`, `_RedSignal.png`, `_Detect.png`.

## 4. Renders (`renders/watcher/`, CPU Cycles)

| Requested view | File |
|----------------|------|
| 1–3. Front, side and back orthographic (same scale) | `THE_WATCHER_FRONT.png`, `_SIDE.png`, `_BACK.png` |
| 4. Three-quarter | `THE_WATCHER_THREE_QUARTER.png` |
| 5. Head and face close-ups | `THE_WATCHER_HEAD.png`, `_EYE.png` (red state), `_HEAD_REAR.png` (green state) |
| 6. Mechanical components | `THE_WATCHER_COMPONENTS.png` (neck turret, waist turret, shoulder and elbow, hand, wind-up key, boot) |
| 7. Material references | `THE_WATCHER_MATERIALS.png` |
| 8–10. Neutral, scanning and red-signal poses | `THE_WATCHER_POSES.png` |
| 11–12. Detection and return-to-neutral animation | `THE_WATCHER_ANIMATION.gif` (full sequence: turn away, green, turn to field, focus lock, red, scan, detect, return) and `_ANIMATION_CONTACT.png` |
| In Stage 01 (placement and scale check) | `THE_WATCHER_IN_STAGE.png` (third-person view from the spawns), `_IN_STAGE_CLOSE.png` |

## 5. Limitations

- **Not wired into the game yet.** The live game still shows the Shepherd placeholder (decision 024
  lists the integration steps).
- **No hair or cable secondary bones.** The pack calls them optional; the hair is a rigid sculpted shell.
- **Single-segment fingers.** Each finger is one bone with two visual segments; there is no per-knuckle
  articulation, which is enough at gameplay distance.
- **WebP textures, not KTX2.** This matches the environment (decision 022).
