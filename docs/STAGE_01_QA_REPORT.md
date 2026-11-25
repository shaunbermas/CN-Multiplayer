# CN TRIAL: Stage 01 refinement, QA report

Stage 01 refinement, Phase 13 (owner brief, 24 Nov 2026). Branch `claude/project-thread-8jwd5y`, not merged,
not deployed. Everything below was run in this repository's cloud container (4 vCPU Xeon, 15 GB, **no GPU**:
browsers use SwiftShader software WebGL). The server runs as the real Worker and Durable Object under
`wrangler dev`. Raw reports: `tests/reports/*.json`.

## 1. Results

| Check | Command | Result | Notes |
|---|---|---|---|
| Typecheck | `npm run typecheck` | PASS | all packages |
| Unit tests | `npm test` | **74 / 74 PASS** (11 files) | collisions 7, match/points 7, bots 4, obstacles 9 (incl. mirror-symmetric kits), round 7, movement 7, stage 13, others |
| Round and match | `tests/integration/round.mjs` | PASS | lights, spotting, placings; 0 points for an unfinished stage; a two-stage match with ranks, per-stage points, late joiner; bots (below) |
| Bots on the server | same | PASS | a non-host cannot add; +5; fill to 30 (28 bots + 2 humans); unique names; a human joining the full lobby replaces a bot (asserted 30 players, 27 bots); remove all |
| Obstacles | `tests/integration/obstacles.mjs` | PASS | 41 segments, a closed row stops a walker at the face on server and client |
| Colourways | `tests/integration/colorways.mjs` | PASS | 30 unique, kept across 5 reconnects |
| Load, 30 clients | `npm run test:load` | PASS | join avg 13.4 ms; RTT median 6 ms, p95 9 ms; client 31 refused (room full); tick avg 0.04 ms |
| Render quality tiers | `tests/e2e/quality.mjs` | PASS | 0 tree cutouts, 0 midground trees, cone foliage stripped, Watcher materials upgraded (≥ 6), 3 lens materials, 6 matte layers |
| UI walkthrough | `tests/e2e/ui.mjs` | PASS | 18 screens, keyboard focus, host START with 2 others ready |
| 30 players, 5 real browsers | `tests/e2e/thirty.mjs` | PASS | 5 browsers + 25 network clients; 30 unique colourways; one shared contestant model (3 geometries for 30 instances) |
| Two browsers end to end | `tests/e2e/two-browsers.mjs` | PASS (2nd run) | see §4 for the first-run failure |
| Full match, 1 browser + 29 bots | `npm run test:measure` | PASS, 0 errors | §2 |

## 2. 30-player match (measured)

One real browser (host, High tier, 1280×720) plus 29 server bots, default three-stage match.
`tests/reports/refinement-measure.json`.

| Stage | Finished | Spotted | Still walking at close | First (time) | Points awarded | Knock-downs (running total) |
|---|---:|---:|---:|---|---:|---:|
| 1 | 14 | 13 | 3 | Tofu (78.8 s) | 15 | 21 |
| 2 | 21 | 5 | 4 | Quill (73.3 s) | 22 | 34 |
| 3 | 12 | 12 | 6 | Juniper (81.3 s) | 13 | 63 |

- Points: each stage awards 2 + (finishers − 1) × 1, so 15 + 22 + 13 = 50, which matches the standings total.
  No duplicate first-place award; spotted players carried on into the next stage with their points.
- Final: Tofu 4 points (2, 1, 1). Quill and Juniper both 3 points with one win and two finishes each, so lower
  total time decided 2nd and 3rd; Saffron and Sorrel 3 points with no win ranked below them (fewer wins).
- Collisions happened in every stage (63 knock-downs over the match); nobody was eliminated by a collision.
- Server: tick avg 0.11–0.15 ms, p95 1 ms, max 7 ms against a 33 ms budget; 0 inputs dropped of 7,478.
  Snapshot average 1,336–1,523 B; about 32.8 KB/s of WebSocket data into the browser during a stage.
- Browser memory: JS heap 36.8 MB before the match, 37.1 MB after (no growth).

## 3. Performance (software WebGL, comparison only)

| | Baseline `7ccb1ba` | This branch |
|---|---:|---:|
| Built client | 6.90 MB | 7.03 MB (+1.9 %) |
| Background texture GPU memory (est.) | 67 MB | 59 MB |
| Load to stage ready | 11.8 s | 15.6–16.3 s |
| Draw calls / triangles at spawn, High | 180 / 164,549 | 189 / 197,903 |
| Frame rate at spawn, High (software) | 0.75 fps | 0.76–0.81 fps |
| Frame rate during the 30-player match (software) | — | 0.88 fps |

Quality tiers on this branch: Low 99 calls / 97k triangles, Medium 105 / 97k, High 189 / 184k (quality test).
These frame rates come from a CPU rasteriser and only compare builds and tiers on the same machine; they say
nothing about frame rates on a real GPU, which could not be measured here. Details:
`STAGE_01_ASSET_OPTIMIZATION.md`.

## 4. Issues found and fixed during QA

1. **Cone trees still drawn** (all Stage 1.5 builds): the strip tested quantised local heights. Fixed with world
   heights; the quality test now requires more than 2,000 stripped triangles.
2. **Dark band in the sky behind The Watcher**: the matte gloom darkened translucent layers. Disabled on the sky
   and foreground layers.
3. **Visible arc at the top of the cloud layer**: longer fade.
4. **Two-browser e2e, first run**: "FocusLock never played at red". When a player is spotted in the first
   frames of red, Detect pre-empts FocusLock by design. The test now accepts Detect as the opening red clip;
   the second run passed.
5. **Measurement script timeouts**: Playwright's actionability checks wait for stable frames, which take seconds
   in software WebGL. The script clicks through the DOM instead.

## 5. Screenshots

Before (clean worktree of `main` at `7ccb1ba`): `docs/refinement/before/*.webp`, 7 views.
After (this branch, same viewpoints plus obstacle and signal views): `docs/refinement/after/*.webp`, 13 views.
UI mockup frames: `docs/ui/mockup/*.jpg`. All captured from the running game, none edited.

## 6. Known issues and limits

- No real-GPU measurement (no GPU in the container).
- No audio system, so The Watcher has no mechanical sounds yet.
- No climbable props: Stage 01 is walk-only (decision 030 b).
- A multi-stage match repeats Stage 01 until Stage 02 exists.
- Load time in software WebGL rose by about 4 s (more shader programs to compile); expected to be much smaller
  on a GPU, not verified.
- New binary assets are plain git files, not LFS (the cloud environment cannot reach the LFS verify host).
- Round report label: `bots.after_human_join.players` in `round-integration.json` is read after the bots are
  removed (3); the replacement itself is asserted (30 players, 27 bots) at the time it happens.
