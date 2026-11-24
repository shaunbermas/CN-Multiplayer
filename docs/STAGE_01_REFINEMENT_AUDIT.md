# CN TRIAL: Stage 01 refinement audit

Phase 01 of the Stage 01 refinement brief (owner, 24 Nov 2026). This records the state of `main` at
`7ccb1ba` (decision 031, PR #22) before any refinement work, what each brief item needed, and the risks found.
Read alongside the intelligence notes 08 and 09 (PR #23), which this audit used as its starting point.

## 1. Build and runtime baseline (measured)

| Item | Baseline (main `7ccb1ba`) | How measured |
|---|---|---|
| Built client, all files | 6,899,852 B (6.90 MB) | `npm run build`, sum of `apps/web/dist/assets` |
| Largest files | environment GLB 2.31 MB, GameView JS 1.57 MB, Watcher GLB 1.35 MB, contestant GLB 0.76 MB | same |
| Background textures | 3 matte layers (4096×768, 4096×768, 4096×512) + tree cutout atlas (2048×2048) | manifest |
| Load to "stage ready" | 11.8 s (software WebGL, this container) | `tests/e2e/refinement-measure.mjs` with `MEASURE_LOAD_ONLY=1` on the main build |
| Frame rate at spawn, High | 0.75 fps (SwiftShader; for build-to-build comparison only, not a GPU figure) | same |
| Draw calls / triangles at spawn, High | 180 / 164,549 | same (`renderer.info`, includes the shadow pass) |
| Server tick, 30 clients | avg 0.079 ms, p95 1 ms; 19.2 snapshots/s per client | intelligence doc 08 (load test) |
| Front row to finish at walk speed | 40.6 s straight line, no obstacles | doc 08 |

Baseline screenshots from fixed viewpoints: `docs/refinement/before/*.webp` (captured from a clean worktree of
`7ccb1ba` with `tests/e2e/views.mjs`).

## 2. Findings per brief item

| Brief item | State on main | What was needed |
|---|---|---|
| Player collisions | Players pass through each other; no contact at all | New server-authoritative contact step shared with prediction |
| Obstacle variety | 10 rows of identical jersey barriers + one sliding gate | Varied, modular props on the same fair collision layout |
| Trees | Three kinds: cone trees inside `ENV_VISUAL_FOLIAGE`, 49 midground crossed-plane impostors, up to 1,100 billboard cutouts | Remove all; painted layers only |
| Matte painting | 3 layers (hills, skyline, forest) | 6 layers with the brief's palette |
| The Watcher | Approved model, 9 clips, three lens materials, lens emissive ×1.8 at load | Material/lighting/animation polish only (geometry LOCKED) |
| Bots | None; 30-player tests used scripted network clients | Server-side bots in the room |
| Lobby | Start, ready, a Standup/Tournament mode selector | READY/START and add bots only |
| Points | Tournament qualifiers (R3/R4); no points | 2/1/0 points, match standings, tie-breakers |
| Game length | Briefing 15 s, round 120 s, results 20 s; the full timer always ran | Shorter, configurable in one place |
| Lighting | Bloom 0.42, strong additive floodlight cones and red beam; fog exp2 0.0085 | Softer, less bloom, better sky |
| UI | Stage 1.5 UI (Inter, red gradients) | Full redesign, mockup first |

## 3. Problems found during the audit

1. **Module-level room state (doc 09 A1/A2).** `apps/server/src/room.ts` kept the stage geometry, obstacles and
   round engine in module variables shared by every Durable Object instance in an isolate. Two rooms on one
   isolate could overwrite each other's stage. Fixed first: everything now lives on the room instance and
   `loadStage()` rebuilds it per room (implementation doc §2).
2. **The cone trees were never removed.** `stripConeTrees` compared local vertex heights with 1 m, but the
   environment GLB is quantised (`KHR_mesh_quantization`): local positions are normalised shorts scaled by the
   node (×138). Every triangle passed the test, so the "removed" cone-tree foliage stayed in the scene in every
   Stage 1.5 build (mixed in with the midground impostors in the baseline screenshots). The test's `foliageTrianglesRemoved > 0` passed only
   because the tree trunks are hidden by material. Fixed by testing world height.
3. **Course length bounds the round.** 160 m at the approved 4 m/s is 40 s in a straight line; with the
   obstacle detours and red lights the best bot finishes in about 70 s. The round cap cannot go much below
   100 s without nobody finishing; the shortening comes from briefing, results and a closing timer instead.
4. **No audio system exists.** Mechanical Watcher sounds (permitted by the lock) have nothing to play through.
5. **Only Stage 01 exists** and Stage 02 must not start, so a multi-stage match can only repeat Stage 01.
6. **Climbable obstacles** (one reading of "fallen equipment") would conflict with the approved walk-only
   Stage 01 (no jump in rounds, decision 030 b). Not built; all props are walk-around blockers.

## 4. Approach and guard rails

- Feature branch `claude/project-thread-8jwd5y`; no merge, no deploy, no Stage 02.
- Untouched Watcher backup first: `blender/backups/THE_WATCHER_ORIGINAL_2026-11-24/` (hashes match the LFS
  objects). All Watcher changes are runtime material and emissive changes; the GLB is not modified.
- Fairness rules from decision 031 stay test-enforced: mirror-symmetric rows, 6 m gaps, every lane within 10 m
  of a gap, nothing over spawns, finish or safe zone.
- One shared contestant model only; bots use it with the 30 colourways.
