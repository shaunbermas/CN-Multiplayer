# CN TRIAL · Stage 1.5 production tracker

Branch `claude/stage-1-5`. Not merged to `main` (merging deploys publicly) until the owner approves the sign-off.

| # | Prompt | Status | Work done | Files | Tests | Remaining issues | Next |
|---|--------|--------|-----------|-------|-------|------------------|------|
| 01 | Preflight, baseline, character lock | **PASS, with a blocker recorded** | Audit, baseline metrics and screenshots, asset inventory, reference copy with SHA-256 verified, roster discrepancy report | `docs/stage15/STAGE_1_5_BASELINE_AUDIT.md`, `docs/stage15/STAGE_1_5_ASSET_INVENTORY.md`, `docs/CHARACTER_ROSTER_DISCREPANCY_REPORT.md`, `docs/stage15/screenshots/p01_baseline/`, `references/STAGE_1_5/`, `tests/e2e/views.mjs` | `views.mjs` (7 viewpoints, no console errors); SHA-256 check of six boards OK | Contestant roster BLOCKED (owner decision); real-GPU metrics need named hardware | P02 |
| 02 | Matte painting and surrounding world | **PASS** | Procedural layered panorama (hills, skyline, forest), 8-tree cutout atlas, 1,100 billboard placements from exported scenery zones, runtime component | `tools/stage15/*`, `blender/scripts/stage15_export_zones.py`, `art/stage15/matte/source/*`, `blender/exports/stage15/*`, `apps/web/src/stages/stage01/Surroundings.tsx`, `docs/stage15/P02_MATTE_PAINTING_REPORT.md` | views (no console errors), atlas edge check, typecheck | Flat sky (P04); old cone trees (P03) | P03 |
