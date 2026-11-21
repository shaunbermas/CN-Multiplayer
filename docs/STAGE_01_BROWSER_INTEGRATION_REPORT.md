# CN Trials · Stage 01 browser integration report (Prompt 07)

Status: **integrated and tested** (21 November 2026). Stage 01 now runs in the browser on the approved
environment GLB and THE_WATCHER.glb, with every coordinate taken from `STAGE_01_METADATA.json`.
Points that need a decision are in §8 (decision 025).

## 1. Preflight

| Required input | Found | Check |
|----------------|-------|-------|
| Design spec | `docs/STAGE_01_DESIGN_SPEC.md` | Approved (017) |
| Greybox and Prompt 03 report | `blender/scenes/STAGE_01_GREYBOX.blend`, `docs/STAGE_01_GREYBOX_REPORT.md` | Approved (019) |
| Collision-ready scene and metadata | `blender/scenes/STAGE_01_COLLISION_READY.blend`, `blender/exports/STAGE_01_METADATA.json` | Approved (021); schema-valid; CI re-validates |
| Environment | `blender/exports/STAGE_01_ENVIRONMENT.glb`, `docs/STAGE_01_ENVIRONMENT_VALIDATION.md` | Approved (022) |
| The Watcher | `blender/exports/THE_WATCHER.glb`, `THE_WATCHER_ASSET_MANIFEST.json`, `docs/THE_WATCHER_VALIDATION.md` | Approved (023, 024); 9 clips, 6 anchors, 28.0 m |
| App and server | npm workspaces with lockfile: Vite 7, React 19.2, R3F 9.8, drei 10.7, three 0.187, Cloudflare Worker + Durable Object | Unchanged; no dependency added or upgraded |

- **No blocking conflicts.**
- **Watcher scale:** the 28 m figure matches spec L9.
- **Plinth:** the 4 m plinth placement is decision 024.
- **Colyseus:** the pack mentions it, but the project uses a Durable Object room (decision 016), so the
  integration extends that room and its message types.
- **No new systems:** no second socket or parallel state system was added.

## 2. Integration map

| Module | Stage 01 responsibility | Change |
|--------|-------------------------|--------|
| `packages/shared/src/stage-metadata.ts` | **New.** Typed parser and validation for the metadata; the only Blender→game conversion (`game = (x, z, −y)`, yaw + π) | Geometry built only from metadata IDs |
| `packages/shared/src/stages.ts` | **New.** Stage registry: id, rules, briefing text, metadata, geometry. Watcher height read from its asset manifest | Stage 02+ add an entry |
| `packages/shared/src/tournament.ts` | **New.** Tournament manager: frozen stage results recorded exactly once per round; next stage or back to the lobby | Room calls it at results |
| `packages/shared/src/round.ts` | Existing server rule engine (phases, signal schedule, grace, detection, ranking) | + mode, qualifier target (R3), qualification flags (R3/R4), early end at target (R2) |
| `packages/shared/src/protocol.ts`, `client.ts` | Existing message contract | v3: round state carries stage, mode, target; results carry round id, stage, mode, `qualified` |
| `apps/server/src/room.ts` | Existing Durable Object room | Geometry from the registry (old greybox JSON no longer loaded); host chooses mode; results go to the tournament manager once |
| `apps/web/src/stages/registry.ts` | **New.** Stage id → scene module | — |
| `apps/web/src/stages/stage01/Stage01Scene.tsx` | **New.** Loads the environment and Watcher GLBs, lighting tiers, signal lamps, Watcher clips; checks assets; disposes on unmount | Replaces the greybox and Shepherd placeholder |
| `apps/web/src/stages/stage01/watcherAnimation.ts` | **New.** The one adapter from server state to Watcher clips; clip lengths from the asset manifest | — |
| `apps/web/src/game/Scene.tsx` | Existing generic scene: players, prediction, third-person camera, spectating | Loads the stage module through the registry, with a loading state and an error boundary |
| `apps/web/src/App.tsx` | Existing HUD | Stage name and briefing from the registry; qualified / eliminated / spectating labels; tournament toggle; results tags; loading and asset-error screens |

## 3. Assets and coordinates

- **Conversion:** metadata is Blender Z-up with the course toward +Y; the runtime is Y-up with the course
  toward −Z. `toGame()` and `yawToGame()` do the conversion once. Nothing else flips axes or scales
  anything, and the GLBs are already Y-up.
- **From metadata:**
  - 30 spawns (`SPAWN_PLAYER_01–30`)
  - start, finish and safe triggers
  - four boundary walls and the playable area
  - 15 bench seats used for spectating and late arrivals
  - start line Z 0 and finish line Z −160
- **The Watcher's root** is the detection reference's ground point, raised to the top of the solid
  collider under it, which is the 4 m plinth. So no coordinate is retyped.
- **Asset checks in the browser:**
  - all nine clips are present, and their lengths match the manifest;
  - the root, optical-origin and detection-forward anchors are present;
  - the height is 28.0 m with the feet at the root;
  - the environment has the `MAT_Signal_Red/_Amber/_Green` materials.

  Any problem shows in `window.__cn.assets().problems`. A load failure shows a readable error instead of a fake stage.
- **Placeholder hidden:** the environment GLB still contains the retired Shepherd placeholder nodes;
  the scene hides them (decision 023). They can be removed in a later environment re-export.
- **Lighting:** read from `STAGE_01_LIGHTING.json`. `?quality=low|medium|high` sets the tier (default
  medium); `low` uses linear fog and no spotlights.
- **Memory:** leaving the stage disposes geometry, materials and textures and clears the GLTF cache.
- **Collision:** the server still uses the box walls; render meshes are never used as colliders.

## 4. Authority

| Concern | Owner | How |
|---------|-------|-----|
| Phase, signal schedule, timers | Server (`RoundEngine` in the room) | Seeded schedule; snapshots publish phase, signal, remaining time |
| Movement | Server | Clients send only sequenced inputs (`mx`, `mz`, `yaw`); the room steps the shared kinematic controller against metadata walls at 30 Hz, with a token bucket for rate |
| Red-light violations, elimination | Server | After the grace window (0.3 s + measured latency, max 0.5 s): spotted if speed > 0.3 m/s over 3 ticks or displacement > 0.15 m (spec D1–D2) |
| Finish qualification | Server | Finish or safe trigger from metadata; tournament target and R4 fallback in `qualify()` |
| Spectator transition | Server status → client view | Spotted players freeze; the client follows active players (Tab to switch) |
| Results | Server | Frozen at round end, handed to the tournament manager once, then broadcast |

The browser never sends movement flags, eliminations, qualifications, signals or results. The Watcher's
clips, the lamp colours and the HUD only show server state.

## 5. Watcher clip mapping (`watcherAnimation.ts`)

| Server state | Clip |
|--------------|------|
| Lobby, briefing, countdown | `Watcher_Idle` |
| GREEN | `Watcher_TurnAway`, then `Watcher_GreenSignal` |
| WARNING (0.8 s) | `Watcher_TurnToField`, sped up to end exactly at RED |
| RED | `Watcher_FocusLock`, then `Watcher_RedSignal` (even reds) or `Watcher_ScanSweep` (odd reds) |
| A server `spotted` event during RED | `Watcher_Detect` |
| Results | `Watcher_ReturnNeutral`, then `Watcher_Idle` |

## 6. Tests

| Test | Clients | Result | What it proves |
|------|---------|--------|----------------|
| `npm test` (37 tests) | — | PASS | **Parser:** accepts the approved file, rejects broken copies. **Conversion:** correct. **Registry:** correct. **Spawns:** all 30 resolve inside the start trigger with no capsule overlap, and match the greybox exports. **Watcher:** on the plinth, facing the start line. **Qualification:** R3/R4. **Early end:** at the target. **Handoff:** exactly once. **Clip adapter:** correct. **Asset manifest:** points at real files |
| `npm run test:round` | 4 bots against `wrangler dev` | PASS | **Standup round:** server spotting and order are correct; results carry round and stage IDs; nobody qualifies without finishing. **Late joiner:** waits, then joins the next round. **Tournament round:** target 3 for 4 starters; the R4 fallback qualifies 2 |
| `npm run test:e2e` | 2 Chromium browsers (A CPU-throttled 6×), low tier | PASS | **Assets:** both load the environment and Watcher GLBs with no problems; Watcher 28.0 m in the browser. **Sync:** same room; 17.8 m walk with 0 prediction error. **Clips:** GreenSignal on green, Detect right after the server spotted Beta. **Spectating:** Beta sees "Eliminated · spectating". **Results:** shown with eliminated tags and stage metadata |
| `npm run test:load` | 30 bots | PASS | Average tick 0.065 ms, 0 dropped inputs, 19.3 snapshots per client per second |

Screenshots (`tests/reports/screenshots/`):

- `s1-3_start_view.png`: environment, Watcher and spawn, in the lobby
- `s1-4_green_view.png`: green phase
- `s1-4_red_view.png`: red scan
- `s1-4_spotted_view.png`: spectator status
- `s1-4_results_view.png`: stage result

**Not tested:**

- 30 real browsers rendering at once; the 30-client test uses headless bots.
- Real GPUs and frame rates; all browser tests use software WebGL.
- The medium and high lighting tiers in CI.
- A multi-stage tournament; only Stage 01 exists, so the advance path is unit-tested only.

## 7. Known limits

- **The Watcher is small from the start line.** It is about 8° of a 60° view at 190 m, as the
  approved spec intends. Camera framing is unchanged.
- **Animation runs on the client clock.** Clips follow the schedule rebuilt from the round seed and
  snapshots, so they can lag the server's signal by up to one snapshot (50 ms). The HUD and the
  outcomes always come from the server.
- **The Shepherd placeholder is hidden, not removed,** from the environment GLB.

## 8. Points for decision (decision 025, PROPOSED)

1. **Metadata signal anchors.** `SIGNAL_RED_ANCHOR`, `SIGNAL_GREEN_ANCHOR` and
   `SIGNAL_SCAN_BEAM_ANCHOR` still point at the old Shepherd lantern. The runtime does not use them:
   the Watcher's lens state comes from its clips and the tower lamps from materials.
   - **Proposal:** in the next metadata revision, keep the IDs and move them to the Watcher's
     optical origin on the plinth (0, 185 − 3.04, 4 + 23.6).
   - **Also proposed:** add a `WATCHER_ROOT_ANCHOR` transform entry.
2. **Mode choice.** The host picks Standup (default) or full tournament rules with a checkbox in the
   lobby. A tournament with more stages advances through `TOURNAMENT_ORDER` once those stages exist.
3. **Default lighting tier.** The default is medium; low is used for tests and as a fallback.
