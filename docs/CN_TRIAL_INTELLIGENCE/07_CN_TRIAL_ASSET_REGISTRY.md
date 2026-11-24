# CN TRIAL · 07 Asset Registry

Audit date 24 Nov 2026, `main` @ `7ccb1ba`. Sizes measured in this audit after `git lfs pull` (KB = 1,024 bytes).
Labels: see 01. Status values: **APPROVED-LOCKED** (owner-approved; never overwrite), **RUNTIME** (derived copy the
game loads), **SOURCE** (generator input), **REVIEW** (renders and captures), **LEGACY** (retired, kept),
**MISSING** (required, does not exist).

All `.blend`, `.glb`, images and audio are in Git LFS (decision 009; `.gitattributes`). Every 3D asset is built by
a script in `blender/scripts/`, so the script plus its spec is the true source.

## 1. 3D assets

| ID | Asset | Blender source | Export (locked) | Runtime copy (loaded by the game) | Budget vs actual | Status |
|---|---|---|---|---|---|---|
| A-ENV-00 | Stage 01 greybox | `blender/scenes/STAGE_01_GREYBOX.blend` (161 KB); `generate_stage_01_greybox.py`, spec `specs/stg01_greybox.json` | `blender/exports/STG01/STAGE_01_GREYBOX.glb` (108 KB), `STG01_collision.json`, `STG01_markers.json` | Not loaded (superseded by metadata) | — | APPROVED-LOCKED (019) |
| A-ENV-01 | Stage 01 collision-ready scene and metadata | `blender/scenes/STAGE_01_COLLISION_READY.blend` (197 KB); `stage_01_collision_setup.py` | `blender/exports/STAGE_01_METADATA.json` (+ `_VALIDATION.json`) | Imported by `packages/shared/src/stages.ts` | — | APPROVED-LOCKED (021, 025) |
| A-ENV-02 | Stage 01 detailed environment | `blender/scenes/STAGE_01_ENVIRONMENT_FINAL.blend` (549 KB); `stage_01_environment_build.py`, `stage_01_env_kit.py`, `stage_01_textures.py` | `blender/exports/STAGE_01_ENVIRONMENT.glb` (6,278 KB) | `blender/exports/stage15/STAGE_01_ENVIRONMENT.meshopt.glb` (2,256 KB; backdrop and Shepherd placeholder removed, meshopt) | Visible scene ≤ 300k tris proposed: 72k (Low) to 141k (High) measured. Runtime download ≤ 20 MB proposed: about 4.6 MB models + textures | APPROVED-LOCKED (022); runtime RUNTIME (027 (4), 029 (3)) |
| A-ENV-03 | Stage 01 lighting, fog, tiers | — | `blender/exports/STAGE_01_LIGHTING.json` (15 lights) | Read by `Stage01Scene.tsx`; fog overridden by `fog.ts` | — | APPROVED (022 (4)); fog superseded by 031 |
| A-ENV-04 | Scenery footprints | `stage15_export_zones.py` | `blender/stage15/STAGE_01_SCENERY_ZONES.json` | Used by `place_surroundings.py` | — | SOURCE |
| A-ENM-01 | THE WATCHER | `blender/scenes/THE_WATCHER.blend` (555 KB); `watcher_build.py`, `watcher_textures.py`, `watcher_export.py` | `blender/exports/THE_WATCHER.glb` (2,225 KB) + `THE_WATCHER_ASSET_MANIFEST.json` | `blender/exports/stage15/THE_WATCHER.meshopt.glb` (1,315 KB) | ≤ 25,000 tris: 12,662 (LOD1 6,314). Textures up to 2 × 2K proposed: 1K max | APPROVED-LOCKED (023, 024) |
| A-CHR-01 | Shared contestant master | `blender/scenes/CNTRIAL_CONTESTANT_MASTER.blend` (1,628 KB); `contestant_geometry.py`, `contestant_textures.py`, `contestant_build.py`, `contestant_export.py` | `blender/exports/contestant/CNTRIAL_CONTESTANT_MASTER.glb` (2,349 KB) + `CNTRIAL_CONTESTANT_MANIFEST.json` | `blender/exports/contestant/CNTRIAL_CONTESTANT_MASTER.meshopt.glb` (746 KB; validator limit 1.2 MB) | Pipeline §9 proposed ≤ 4,000 tris (pre-030): LOD0 22,414, LOD1 8,482, LOD2 3,554; budgeted per frame (03 §1.5). One 1K atlas: yes (2 maps) | APPROVED (030) |
| A-OBS-01 | Stage 01 obstacles (barricades, gate) | None: built in code | — | `apps/web/src/stages/stage01/Obstacles.tsx` (geometry from `packages/shared/src/obstacles.ts`) | — | APPROVED (031). No Blender source or GLB: NOT DOCUMENTED whether a modelled version is wanted |
| A-LEG-01 | Shepherd placeholder (`ENM_Shepherd_Placeholder_*`) | Inside A-ENV-02 | Inside `STAGE_01_ENVIRONMENT.glb` | Stripped from the runtime copy and hidden | — | LEGACY (023) |
| A-LEG-02 | Procedural 30 characters (`characters.ts`, `roster.ts`) | — | — | Removed from code | — | LEGACY, deleted by decision 031 (1); in git history |

## 2. Textures

| Set | Files | Size on disk | In game as | Status |
|---|---|---|---|---|
| Stage 01 environment | `blender/textures/STG01/*.png` (16 materials, BC/ORM/N) + `TEXTURES.json` | 9.5 MB PNG | WebP inside the GLB | APPROVED-LOCKED |
| Watcher | `blender/textures/WATCHER/*.png` (7 sets, 21 images) + `TEXTURES.json` | 6.9 MB PNG | WebP inside the GLB | APPROVED-LOCKED |
| Contestant | `blender/textures/CONTESTANT/CNT_Detail.png`, `CNT_Normal.png` | 824 KB | `blender/exports/contestant/CNT_Detail.webp` (117 KB), `CNT_Normal.webp` (41 KB) | APPROVED |
| Matte layers | Sources `art/stage15/matte/source/MP_FarHills.png` (699 KB), `MP_IndustrialSkyline.png` (135 KB), `MP_ForestLine.png` (1,187 KB) | — | `blender/exports/stage15/MP_*.webp` (53 / 58 / 70 KB) + `STAGE_01_MATTE_PAINTING_MANIFEST.json` | APPROVED with Stage 1.5 (027) |
| Tree cutouts | `art/stage15/matte/source/TREE_Cutout_Atlas.png` (3,817 KB) | — | `blender/exports/stage15/TREE_Cutout_Atlas.webp` (216 KB) | APPROVED with Stage 1.5 |
| KTX2 / Basis compressed textures | — | — | — | MISSING (planned "later", 022 (3)) |

## 3. Animations

| Owner | Clips | Where | Status |
|---|---|---|---|
| Contestant | 16: Idle, Walk, Run, Start, Stop, JumpStart, JumpAir, JumpLand, Dive, Push, Pull, Stumble, Fall, Recover, Eliminated, Victory (24 fps) | In A-CHR-01 GLB and `.blend` (NLA) | APPROVED; Push/Pull unused |
| Watcher | 9: Idle, TurnAway, GreenSignal, TurnToField, FocusLock, RedSignal, ScanSweep, Detect, ReturnNeutral | In A-ENM-01 GLB | APPROVED |
| Contestant Sprint, Crouch, Interact, Panic, Spectator idle (GDD §4.3) | — | — | MISSING (not needed for Stage 01) |

## 4. Audio

| Required (GDD §5.4, Stage 01 plan §4) | Status |
|---|---|
| Green, warning, red, scan, finish, eliminated, ambient yard tone, footsteps, Watcher servo, UI clicks, music | **MISSING**: no audio files and no audio code exist (`grep` for AudioContext / Audio / audio files in `apps/` and `packages/` found none). Known issue K4 |

## 5. UI assets

| Asset | Status |
|---|---|
| CN TRIAL wordmark | Text + CSS (`Menu.tsx` `Brand`); no SVG/bitmap wordmark: MISSING if the brush lettering is wanted |
| Web font | None loaded (system font stacks): MISSING if a consistent brand font is wanted |
| Icons | Unicode glyphs (⏱, ⚙, ✓, ✕, ⚠, 🏁) |
| Favicon / social preview image | NOT DOCUMENTED / not found in `apps/web` |

## 6. Review renders and captures

| Set | Path | Size |
|---|---|---|
| Greybox, collision and environment renders | `renders/*.png` | part of 39 MB |
| Watcher renders and animation GIF | `renders/watcher/` | part of 39 MB |
| Greybox previews and browser checks | `blender/exports/STG01/previews/`, `*/browser/`, `*_browser/` | — |
| Stage 1.5 screenshots (baseline → atmosphere, obstacles, feedback, contestant) | `docs/stage15/screenshots/` | 82 MB |
| Test screenshots (UI walkthrough, 30 players, quality tiers) | `tests/reports/screenshots/` | — |
| Before / after | `CN_TRIAL_STAGE_1_5_FINAL_DELIVERABLES/before_after/` | 6 JPG |

## 7. References (preserved unchanged)

| Path | Use | Status |
|---|---|---|
| `references/GLOBAL/stage_environment_and_tournament_overview.png`, `stage_enemy_and_asset_overview.png` | Mood only (G1, G2) | RECEIVED; doll figure retired |
| `references/SHARED_CONTESTANT/` (turnaround reference, master prompt, character system spec, colourway CSV, acceptance checklist) | Current character production reference | APPROVED (030) |
| `references/STAGE_1_5/` (8 prompts, docs, checklist, UI concept board, 6 locked character boards + SHA-256 template) | Stage 1.5 brief; boards superseded by 030 | Preserved |
| `references/STAGE_01_RED_LIGHT/` | Empty (`.gitkeep`) | Stage 01 overview image MISSING (covered by written spec) |
| `docs/source/THE_LAST_TRIAL_GDD_Preproduction_v0.1.docx` | Original GDD under the retired name | Historical source; do not use the name |

## 8. Asset completeness summary

| Category | Complete | Placeholder / legacy | Missing |
|---|---|---|---|
| Environment (Stage 01) | Greybox, metadata, detailed environment, lighting, matte, trees | Shepherd placeholder inside source; obstacles are code-built primitives | KTX2, lightmaps, current-build screenshot set |
| Characters | Shared contestant (model, rig, 16 clips, LODs, 30 colourways) | — | GDD §4.3 extra clips (later stages) |
| Enemy | The Watcher (model, rig, 9 clips, anchors, FX) | — | Watcher audio |
| UI | Screens and HUD | Unicode icons, system fonts | Wordmark art, web font, winner screen |
| Audio | — | — | Everything |
