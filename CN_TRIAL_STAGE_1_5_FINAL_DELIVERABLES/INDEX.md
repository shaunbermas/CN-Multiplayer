# CN TRIAL · Stage 1.5 final deliverables: index

Everything below is in the repository on branch `claude/stage-1-5`. Large assets stay at their working paths (Git LFS) and are referenced, not duplicated. Status per deliverable: **Done**, **Blocked** (owner decision) or **Partial**.

| # | Deliverable (brief §9) | Status | Location |
|---|------------------------|--------|----------|
| 1 | Polished Stage 01 environment | Done | Runtime: `apps/web/src/stages/stage01/` (`Stage01Scene.tsx`, `Surroundings.tsx`, `MidgroundTrees.tsx`, `Atmosphere.tsx`, `skyModel.ts`, `Obstacles.tsx`, `WatcherFX.tsx`). Reports: `docs/stage15/P02_MATTE_PAINTING_REPORT.md`, `P03_FOREGROUND_REPORT.md`, `P04_ATMOSPHERE_REPORT.md` |
| 2 | Matte-painted background and optimised cutouts | Done | Sources: `art/stage15/matte/source/*.png`. Runtime: `blender/exports/stage15/MP_*.webp`, `TREE_Cutout_Atlas.webp`. Manifest: `blender/exports/stage15/STAGE_01_MATTE_PAINTING_MANIFEST.json`. Generators: `tools/stage15/generate_matte.py`, `place_surroundings.py`, `blender/scripts/stage15_export_zones.py` |
| 3 | Final integrated 30-character roster | **Blocked** | `docs/CHARACTER_ROSTER_DISCREPANCY_REPORT.md` (six conflicting boards, originality issue, decisions needed). Roster module, empty by design: `packages/shared/src/roster.ts`. Locked boards preserved: `references/STAGE_1_5/FINAL_CHARACTER_BIBLE_LOCKED/` |
| 4 | Existing Watcher with polished materials and animations | Done (design unchanged) | `docs/stage15/P06_CHARACTERS_AND_WATCHER_REPORT.md`; `WatcherFX.tsx`; `Stage01Scene.tsx` (lens emissive, slow-client clip fix) |
| 5 | Complete game UI/UX | Done (character select shows "roster pending") | `apps/web/src/ui/` (`Menu.tsx`, `GameHud.tsx`, `settings.ts`), `App.tsx`, `styles.css`. Report: `docs/stage15/P07_UI_UX_REPORT.md`. Screens: `tests/reports/screenshots/ui_*.png` |
| 6 | Additional Stage 01 obstacles | Done (optional, host toggle) | `packages/shared/src/obstacles.ts`, `apps/server/src/room.ts`, `Obstacles.tsx`. Spec and diagram: `docs/stage15/P05_OBSTACLES_SPEC.md`, `P05_obstacles_topdown.png` |
| 7 | Optimised Blender project and GLB exports | Partial | The approved `.blend` and GLBs are unchanged (locked). Optimised runtime copies: `blender/exports/stage15/STAGE_01_ENVIRONMENT.meshopt.glb` (6.43 → 2.54 MB), `THE_WATCHER.meshopt.glb` (2.28 → 1.35 MB) via `tools/stage15/compress_glb.sh`. No new Blender scene was needed: the new scenery is generated in code and textures |
| 8 | Updated browser game implementation | Done | Branch `claude/stage-1-5` (Stage 1.5 pull request); not deployed |
| 9 | Performance and multiplayer test reports | Done (with stated limits) | `docs/stage15/P08_OPTIMIZATION_QA_REPORT.md`; raw reports `tests/reports/*.json` (`load-{1,10,20,30}-clients`, `thirty-players`, `quality`, `ui-walkthrough`, `obstacles-integration`, `e2e-two-browsers`, `round-integration`) |
| 10 | Before-and-after screenshots | Done | `CN_TRIAL_STAGE_1_5_FINAL_DELIVERABLES/before_after/*.jpg`; full sets `docs/stage15/screenshots/p01_baseline/` → `p04_atmosphere/`, `p05_obstacles/`; signal states `p04_atmosphere/signal_*.png`; 30-player shots `tests/reports/screenshots/thirty_*.png` |
| 11 | Updated technical documentation | Done | `docs/stage15/*` (audit, inventory, tracker, per-prompt reports), `docs/DECISIONS.md` (026–028), `docs/CHARACTER_ROSTER_DISCREPANCY_REPORT.md`, `README.md` status |
| 12 | Stage 1.5 completion report | Done | `CN_TRIAL_STAGE_1_5_FINAL_DELIVERABLES/STAGE_1_5_COMPLETION_REPORT.md`, `STAGE_1_5_SIGNOFF.md`, `QA_MATRIX.md`, `KNOWN_ISSUES.md`, `RELEASE_NOTES.md` |

Production tracker (prompt by prompt): `docs/stage15/STAGE_1_5_PRODUCTION_TRACKER.md`. Original Stage 1.5 pack (prompts, docs, references): `references/STAGE_1_5/`.
