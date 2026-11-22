# CN TRIAL · Stage 1.5 baseline audit (Prompt 01)

Date: 21 November 2026. Baseline is the High-quality branch (`claude/stage01-high-quality`, PR #17, built on `main` 7c8e507). Stage 1.5 work happens on `claude/stage-1-5` and is not merged or deployed without the owner's approval.

## 1. Checkpoint

| Item | Reference |
|------|-----------|
| Production (deployed) | `main` @ `7c8e507` (https://cn-trials.shaun-bermas.workers.dev) |
| Baseline for Stage 1.5 | `claude/stage01-high-quality` @ `c28912b` (pushed) |
| Stage 1.5 branch | `claude/stage-1-5` |
| Git tag | Not created: tag pushes are refused by this environment (HTTP 403). The pushed commits above are the checkpoint. |
| Approved assets | Untouched: `blender/scenes/*.blend`, `blender/exports/STAGE_01_ENVIRONMENT.glb`, `THE_WATCHER.glb`, `STAGE_01_METADATA.json` (all in Git LFS history) |

## 2. Project map

| Area | Where | Notes |
|------|-------|-------|
| Server | `apps/server` (Cloudflare Worker + one Durable Object per room) | Authoritative 30 Hz simulation, 20 Hz snapshots, protocol v3. The brief mentions Colyseus: the project replaced it with Durable Objects (decision 016). Stage 1.5 keeps this architecture. |
| Shared rules | `packages/shared` | Movement controller, round engine (signals, detection, qualification), stage registry, metadata parser, tournament manager |
| Client | `apps/web` (Vite 7, React 19.2, R3F 9.8, drei 10.7, three 0.187) | Stage scene modules in `src/stages/`, HUD in `src/App.tsx`, quality tiers in `src/game/quality.ts` |
| Blender pipeline | `blender/scripts`, headless `bpy==5.3.0` | Greybox → collision-ready → environment (Prompt 05) → The Watcher (Prompt 06) |
| Tests | `npm test` (41 unit), `test:round`, `test:e2e` (2 browsers), `test:load` (30 bots), `test:quality` | All in CI (`.github/workflows/checks.yml`) |
| Deploy | `.github/workflows/deploy.yml` on merge to `main` | Merging deploys publicly, so Stage 1.5 is held in a PR until the owner approves |

## 3. Baseline metrics (measured)

Test machine: this cloud container, 4 vCPU Intel Xeon 2.3 GHz, 15 GB RAM, **no GPU**. Headless Chromium (Playwright 1.63) with SwiftShader software WebGL, 1280 × 720, DPR 1. Frame rates from software rendering only compare configurations; they are **not** real-GPU frame rates.

| Metric | Value |
|--------|-------|
| JS bundle | 1.61 MB (466 KB gzip) |
| Stage downloads | Environment GLB 6.43 MB; Watcher GLB 2.28 MB; total `dist` 9.9 MB |
| High tier, spawn view | 119 draw calls (shadow pass included), 136,292 triangles, 18 shader programs, 61 textures |
| Medium / Low | 60 / 59 draw calls, 68,196 triangles |
| Software frame rate | Low 4.0, Medium 1.6, High 1.3 fps (SwiftShader) |
| Server (30 simulated clients, `test:load`) | Average tick 0.06 ms, p95 1 ms, 0 dropped inputs, 19 snapshots per client per second, client 31 rejected |
| Real browsers | 2 Chromium pages in one room (`test:e2e`); passes on 4 cores and on 2 cores (after the PR #17 test fix) |

Not measured: frame rates on a real GPU. Named reference hardware is needed (Performance Measurement Plan); see Prompt 08.

## 4. Baseline visuals

Fixed review viewpoints, High tier: `docs/stage15/screenshots/p01_baseline/` (made by `tests/e2e/views.mjs`). Observations:

1. **Sky:** flat teal colour with no moon, clouds or gradient detail. The horizon past the overpass is empty.
2. **Trees:** stacked dark cones, merged into `ENV_VISUAL_FOLIAGE`, read as flat cardboard shapes against the sky.
3. **Puddles:** some read as black holes (`MAT_Puddle` with no reflection to sample).
4. **Depth:** background silhouettes (`ENV_VISUAL_BACKDROP`) are close and few; there is no distant layer.
5. **Lighting:** High floods the yard warm orange; the contrast between the teal world and amber practical lights is weak.
6. **Players:** capsules (no character models exist).
7. **The Watcher:** reads well close up; it is small from the start line, as designed.

## 5. Character roster

There is **no canonical roster** and no character asset in the project, and the six locked boards are six different rosters. See `docs/CHARACTER_ROSTER_DISCREPANCY_REPORT.md`. Contestant modelling is **blocked** pending the owner. The other workstreams continue.

## 6. Recommended order (the pack's sequence)

P02 matte painting and cutouts → P03 foreground polish and tree LODs → P04 atmosphere → P05 obstacles → P06 Watcher polish (contestants blocked) → P07 UI/UX → P08 optimisation, QA and sign-off.
