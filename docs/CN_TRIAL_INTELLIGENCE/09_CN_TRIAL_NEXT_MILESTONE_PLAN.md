# CN TRIAL · 09 Next Milestone Plan

| Field | Value |
|---|---|
| Status | **PROPOSED, awaiting owner approval.** No implementation starts until the owner approves this roadmap |
| Date | 24 November 2026 |
| Milestone | Stage 01 completion + **Stage 1.5 second-pass polish, quality improvement and validation** (decision 032) |
| Baseline | `main` @ `7ccb1ba` (PR #22), live at https://cn-trials.shaun-bermas.workers.dev |
| Not in scope | Stage 02, rebuilding systems, replacing approved assets, changing approved designs, deploying |

Labels: see 01. Complexity: **S** (under a day of focused work, few files), **M** (one to two days, one system),
**L** (several days, crosses client, server and protocol), **XL** (a week or more, or needs people and hardware).
Estimates are relative effort, not dates.

## 0. Locked direction (owner, 24 Nov 2026)

CN TRIAL · desktop browser · private invitation rooms · up to 30 players · guest accounts · ONE shared detailed
contestant with 30 colour variants · the coat is the primary visual feature · the approved robotic Watcher · Stage 01
Red Light, Green Light · hybrid stylised 3D with 2D matte-painted backgrounds · Stage 1.5 first pass implemented and
deployed. Do not regenerate or replace approved assets; do not create a second contestant or a new Watcher; do not
replace the matte-painted environment.

## 1. Git and deployment safety (checked 24 Nov 2026)

| Check | Finding |
|---|---|
| Current branch | `claude/project-thread-rdi933` (PR #23). Not `main` |
| Latest production commit | `main` @ `7ccb1ba` "Fog by default, obstacles always on (10 rows)… (decision 031) (#22)"; Deploy run 17 succeeded on it (22 Nov 2026 07:04 UTC) |
| PR #23 contents | Documentation only: `docs/CN_TRIAL_INTELLIGENCE/*.md`, one README line, and (after this update) `docs/DECISIONS.md`. Verified with `git diff --name-only origin/main...HEAD`: no file outside `docs/` and `README.md` |
| Does merging PR #23 deploy? | **Yes.** `.github/workflows/deploy.yml` runs on every push to `main`, with no path filter. Merging rebuilds and redeploys the same game code (no gameplay change), and the redeploy **ends any rooms in play** (05 T3). Merge outside team sessions, and only with the owner's approval |
| Rule for implementation | Every work package on its own feature branch and PR; CI must pass; nothing merged or deployed without the owner's explicit approval (this overrides the auto-merge note in `CLAUDE.md` for this milestone, per the owner's 24 Nov instruction) |
| Live environment during development | Untouched. Development and tests use local `wrangler dev` (`CN_TEST=1`) and CI |

PROPOSED (optional, owner decision): add `paths-ignore: ['docs/**', '**/*.md']` to `deploy.yml` so documentation-only
merges stop redeploying and ending live rooms. It is a one-line workflow change, so it needs its own approval.

## 2. Multi-stage architecture investigation

### 2.1 Question

Can the current server and client safely support several stages with different rules and geometry (Stage 02 Tug of
War next)?

### 2.2 Findings (read from the code)

| # | Finding | Where | Effect today | Effect with a second stage |
|---|---|---|---|---|
| F1 | `geo` and `OBSTACLES` are **module-level** `let` variables, reassigned in `startRound` | `apps/server/src/room.ts` lines 14–17, 229–230 | None (one stage) | Cloudflare can run several Durable Object instances in one isolate, which then share module variables. Room A starting Stage 02 would change Room B's walls, spawns, benches and finish line mid-round |
| F2 | `RoundEngine` keeps the geometry passed to its constructor (`constructor(private geo)`); the room builds it once with the module `geo` and again only when the room empties | `packages/shared/src/round.ts`; `room.ts` field `engine`, `leave` | None | After a switch, finish detection and ranking would use the old stage's geometry |
| F3 | `RoundEngine` **is** Red Light, Green Light: signal schedule, red-window detection, finish triggers, qualification. There is no generic stage interface | `round.ts` | Fine | Tug of War (teams, beat windows, rope meter; GDD §3) cannot reuse it; a second rules engine is needed behind a common interface (GDD §15.3 already describes the lifecycle: load, setup, brief, start, update, handleInput, eliminate/qualify, getResults, cleanup) |
| F4 | Obstacles are resolved with `STAGE01_OBSTACLES` by default for whatever stage is current | `obstacles.ts` `resolveObstacles(geo, spec = STAGE01_OBSTACLES)`; `room.ts` | Fine | Stage 01 barricades would be applied to Stage 02's geometry (or `resolveObstacles` throws when a stage has no bounds) |
| F5 | The client fixes the stage at module load: `stageDef = getStage(DEFAULT_STAGE_ID)`; it ignores `round.stage` sent by the server | `apps/web/src/game/stage.ts`; used by `Scene.tsx`, `GameHud.tsx` | Fine | The client would keep drawing Stage 01, predicting with Stage 01 walls and showing Stage 01 text while the server runs Stage 02 |
| F6 | Wire protocol is shaped for movement stages: `SnapRow` = position/velocity/status; `RoundState` carries `signal` and `obstacles` | `packages/shared/src/protocol.ts` | Fine | Stage-specific state (rope position, team, beat window) has nowhere to go without a protocol change |
| F7 | The tournament advances its stage index but the room **does not remove non-qualified players** between stages (`next.remaining` is only logged); everyone returns to the lobby and the host starts again; late joiners enter the next stage | `room.ts` `handlePhase`, `join`; `tournament.ts` | Fine (one stage) | A seven-round tournament would not eliminate anyone between rounds |
| F8 | Stage registry, metadata parser, tournament manager and client scene registry are already keyed by stage id | `packages/shared/src/stages.ts`, `stage-metadata.ts`, `tournament.ts`, `apps/web/src/stages/registry.ts` | Good foundation | Reusable as is |

**Conclusion:** the architecture is **not yet safe for a second stage**, but it does not need a rewrite. F8 gives a
good foundation. F1, F2, F4 and F5 are small, contained fixes; F3, F6 and F7 are the real Stage 02 work.

### 2.3 Proposal

| Area | Proposal |
|---|---|
| Stage configuration | Extend `StageDefinition` (`stages.ts`) with `rules` (already present), `obstacleSpec?: ObstacleLayoutSpec`, `qualifierRule`, `playerRange`, `movement` (`'walk' \| 'none' \| …`), `hud` config. Each stage's numbers stay in its stage spec and metadata |
| Stage loading | Server: `getStage(id)` per round (pure, already cached at module import, immutable). Client: lazy-load each stage's scene module and assets when the server announces the stage (`round.stage`), with a loading screen; preload the next stage during results |
| Geometry initialisation | All per-room state becomes `TrialRoom` instance fields: `this.stage`, `this.geo`, `this.obstacles`. Module scope keeps only immutable data (the registry). Rule: **no mutable module-level state in `apps/server`** (add a lint or a test that greps for `^let ` in `room.ts`) |
| RoundEngine integration | Introduce a `StageRules` interface in `packages/shared` following GDD §15.3 (`setup(players, opts)`, `canAct(p)`, `handleInput(p, input)`, `afterStep(p, …)`, `tick(now)`, `publicState()`, `results()`). `RoundEngine` becomes `RedLightRules implements StageRules` with **no behaviour change**; the shared phase machine (briefing, countdown, active, results) moves to a small `PhaseMachine` used by every stage. A new rules object is constructed per round with that stage's geometry, so F2 cannot recur |
| Multiplayer synchronisation | Protocol v7: `RoundState.stage` already exists; add `stageState: unknown` (typed per stage via a discriminated union keyed by `rules`), and keep `SnapRow` for movement stages. Clients ignore stage state they do not understand and request a reload on a version mismatch (already handled) |
| Stage transitions | Results → `intermission` (short standings screen) → next stage's briefing, server-driven in tournament mode (no host click between stages); non-qualified players become spectators for the rest of the tournament; standup returns to the lobby as today |
| Reusable systems | Phase machine, timers, qualification and ranking helpers, tournament manager, spectator flow, HUD shell, briefing, results, colourways, contestant animation state machine, quality tiers, asset pipeline and validators |

### 2.4 Impact and migration strategy

1. **A1 (S, required before Stage 02, safe now):** move `geo`/`OBSTACLES` into the room; rebuild the engine with the
   current geometry at each `startRound`. Behaviour for Stage 01 is identical. Tests: existing suites + a new
   `vitest` test that constructs two rooms' engines with different geometry and checks isolation.
2. **A2 (S):** client reads `round.stage` (fallback `DEFAULT_STAGE_ID`), turning `stage.ts` into a lookup. No visible
   change with one stage.
3. **A3 (M):** `StageRules` interface; wrap the existing engine as `RedLightRules` with **zero rule changes**; the
   unit tests (`round.test.ts`, `stage-integration.test.ts`) and `test:round` must pass unchanged — that is the
   migration's proof.
4. **A4 (M, with Stage 02):** protocol v7 stage state, intermission phase, tournament elimination between stages.
5. Rollback: each step is its own PR; reverting a PR restores the previous behaviour; no data migration (rooms hold
   no persistent state).

Only A1 and A2 belong in this milestone. A3 can be done here or at the start of Stage 02; A4 is Stage 02 work.

## 3. Stage 01 completion tasks (required)

### R1 · Audio system (complexity L)

| Item | Specification |
|---|---|
| Scope | Background music (lobby loop and a restrained in-round suspense bed), lobby ambience (night yard: distant machinery, wind, floodlight hum), signal cues (green, warning, red: distinct pitch and rhythm), Watcher audio (servo turn, lens lock, scan hum, detection sting), footsteps and movement (dry concrete vs puddle, matching the ground FX grid; skid; stumble; flop), elimination and qualification stingers, UI clicks and confirms, countdown ticks, results and tournament fanfare |
| Tone | Playful suspense (decision 008); nothing horror-like; GDD §5.4: original or licensed, no recognisable soundtrack material |
| Sourcing (owner decision Q4) | Zero-cost options: (a) **procedural Web Audio synthesis** for cues, UI and footsteps (no files, fully original, tiny); (b) **CC0** sound libraries (licence recorded per file in an audio manifest); (c) original recordings. Generated audio through a paid service only with the owner's approval. Recommended: (a) for cues/UI/footsteps, (b) or (c) for music and ambience |
| Engine | One `AudioManager` on the Web Audio API (no new dependency): buses master / music / ambience / effects / UI; unlocked on the first menu click; positional audio for The Watcher (`Watcher_AudioOrigin` anchor) and nearby footsteps; distance and voice limits (max ~12 simultaneous footstep voices) |
| Driving events | Server state only: signal changes from `round.signal`, detection from `event: spotted`, finish from `event: finished`, phase changes; footsteps from the contestant animation state machine (presentation) |
| Settings and accessibility | Master, music, ambience, effects volumes + mute (GDD §6.4); captions for gameplay-critical cues ("Red light", "Spotted") — the HUD already shows words and icons, so captions can reuse them |
| Files | New `apps/web/src/audio/` (`AudioManager.ts`, `cues.ts`, `synth.ts`), `apps/web/public/audio/` or `art/audio/` (LFS, Opus/WebM + MP3 fallback), `audio-manifest.json` (source, licence, loudness); edits to `ui/settings.ts`, `ui/Menu.tsx`, `ui/GameHud.tsx`, `game/Scene.tsx`, `stages/stage01/*` |
| Budget | Audio download ≤ 1.5 MB total, lazy after the menu; music streamed |
| Tests | Unit: cue mapping from round state (same pattern as `watcherAnimation.test.ts`); browser: AudioContext created after a gesture, no console errors, settings persist; manual listening pass on headphones and laptop speakers |
| Acceptance | Every signal change is audible and distinct; detection and finish have stingers; volumes work and persist; no audio before the first click; no clipping at 30 players; owner approves the sound palette |

### R2 · Multiplayer reconnection (complexity L)

| Requirement (owner) | Design |
|---|---|
| Same identity | `welcome` returns a random 128-bit `resume` token; client keeps `{room, token}` in `sessionStorage`; server maps token → player id for the room's lifetime |
| Correct colour | The `Player` object is kept during the grace period, so colourway, spawn, name, ready and host flag stay unchanged (the existing browser key remains the fallback after a timeout) |
| Restore the room | Client auto-retries the same room with backoff (0.5, 1, 2, 4 s…) before showing "Connection lost"; the Reconnect button uses the token |
| Recover current state | On resume the server rebinds the socket to the same player and sends `welcome` with the current round, status and position; prediction resets to the server state |
| Temporary disconnections | On socket close: player marked `connected: false`, input queue cleared and velocity zeroed (a stopped player cannot be spotted, so a drop during red is safe; movement simply stops); roster shows a reconnecting badge |
| Prevent duplicates | One socket per player id; a resume while the old socket is open closes the old one with the existing code `4003 replaced`; tokens are single-room and rotated on each resume |
| Timeouts | Grace 30 s (lobby and round; tunable constant). On expiry the player is removed; in a round they rank as unfinished by progress (the existing `rankPlayers` rule). Host transfers only on expiry. Players in grace count toward the 30-player cap |
| Protocol | v7: `join` gains optional `resume`; `welcome` gains `resume`; `RosterEntry` gains `connected` |
| Not covered | A deploy or Durable Object restart still ends rooms (state is in memory). Mitigation: friendly "The game was updated, rejoin" message; persistence is out of scope |
| Files | `packages/shared/src/protocol.ts`, `client.ts`; `apps/server/src/room.ts`; `apps/web/src/App.tsx`, `net.ts`, `ui/GameHud.tsx` |
| Tests | New `tests/integration/reconnect.mjs`: drop and resume in lobby and mid-round (same id, colourway, status, position), duplicate socket closes the old one, timeout removes the player and transfers host, 30-player room with 5 drops; unit tests for token handling; `test:ui` step for the reconnecting state |
| Acceptance | All of the above pass in CI; a manual drop (Wi-Fi off 10 s) on the live build after merge restores the player without a new slot |

### R3 · Tournament winner presentation (complexity M)

| Item | Design |
|---|---|
| Standings | Server keeps per-stage results (`Tournament.results`) and publishes cumulative standings: stage placings, qualified/eliminated per stage, finish times |
| Final qualification results | Existing results card extended with the qualifier line and "next stage" (or "final") label |
| Champion presentation | Final phase `podium` (about 12 s): camera cut to the safe zone; top three contestants on a podium (decorative, code-built, no new character asset) in their colourways playing the existing **Victory** clip; others clap/idle; confetti burst; champion name card |
| Winner animations | Existing clips only (Victory, Idle; Eliminated for the comic last-place moment). No new character or rig work |
| Final leaderboard | All players, final place, stages survived, best finish time |
| Rematch / return | Host: "Rematch" (same room, same players, straight to briefing) and "Return to lobby"; everyone: "Exit to menu". Standup Quick shows the same podium for the stage winner |
| With one stage | Tournament mode = Stage 01 only, so the champion is the Stage 01 winner; the screens are built generically for later stages |
| Files | `packages/shared/src/tournament.ts`, `round.ts` (phase), `protocol.ts`; `apps/server/src/room.ts`; `apps/web/src/ui/GameHud.tsx` (Results, Podium, Leaderboard), `game/Scene.tsx` (podium camera), `styles.css` |
| Tests | Unit: standings and champion selection, ties; `test:round` extended (podium phase, rematch); `test:ui` screenshots of podium and leaderboard |
| Acceptance | Correct champion and order for 1, 2, 10, 30 players, Standup and tournament; rematch works without rejoining; owner approves the look against the concept board panel 06 |

### R4 · Performance validation (complexity XL: needs people and hardware)

| Item | Plan |
|---|---|
| Actual GPU testing | Add a dev overlay `?perf=1` (FPS, 1 % low, frame time, draw calls, triangles, textures, JS heap, quality tier and fallback steps, RTT, snapshot jitter, prediction corrections) with "Copy report" (JSON). Owner runs it on one typical laptop and one desktop, High/Medium/Low, in a full room. Reports saved to `tests/reports/realgpu-<machine>.json` |
| 30-player load | Existing `test:load` (30 simulated clients) stays in CI; `test:thirty` (5 real browsers + 25 simulated) run before the playtest; one team playtest of 15–30 people on the live site |
| Browser memory | Heap and `performance.memory` (Chrome) logged by the overlay over a 3-round session; check no growth across rounds and rejoins |
| Asset loading | Overlay records time to menu, time to stage ready, bytes per asset (Resource Timing API) on a normal home connection |
| Network synchronisation | RTT, snapshot interval jitter and correction count from real internet clients; server `/api/room/<code>/health` captured during the playtest |
| Frame-rate stability | 1 % lows and frame-time spikes, especially at the start line with 30 contestants and during red-light effects |
| Targets | GDD §8: 60 fps at 1080p on the reference desktop; never sustained under 30 fps on the minimum machine (with the adaptive fallback) |
| Files | New `apps/web/src/game/perfOverlay.tsx`; small hooks in `Scene.tsx`, `quality.ts`; report docs |
| Acceptance | Reports from at least two named machines and one playtest exist; targets met or gaps recorded with a fix plan; budgets in `BLENDER_PIPELINE.md` §9 re-baselined from real numbers |

### R5 · Technical safety before Stage 02 (complexity S)

A1 and A2 from §2.4. Acceptance: existing suites unchanged and green; new isolation test passes.

### R6 · Documentation hygiene (complexity S)

Text-only fixes from 01 §9 (C2–C8: stale "not deployed / not wired / capsule" notes, CN TRIAL spelling in documents,
GDD §4.2/§6.1 wording to decision 030). GDD wording changes need the owner's approval because they touch an approved
document.

## 4. Stage 1.5 second-pass polish (audit of genuine needs)

Each item names the evidence that it needs work. **Required** = fixes a verified problem or a stated gap.
**Optional** = visual improvement that is worth doing but not needed for completion. Everything improves existing
assets; nothing is replaced.

| # | Area (owner priority) | Evidence | Required work | Optional improvement | Files | Complexity |
|---|---|---|---|---|---|---|
| P1 | Environment visual consistency | No current-build screenshot set after decision 031 (02 V4); Shepherd leftovers hidden | Capture the 7-view set on Low and High; list concrete inconsistencies from it before changing anything | Rename retired Shepherd ids in the next approved environment rebuild (approved data; owner decision) | `tests/e2e/views.mjs`; later `blender/scripts/stage_01_*` | S / M |
| P2 | Matte painting integration and background quality | Layers are procedural 4096 px cylinders; fog now hides most of them (fog mixes 0.6–0.92) | Check horizon seams and the fog blend in the new captures | Higher-detail painted passes of the same three layers (same composition, still 2D, still original) | `tools/stage15/generate_matte.py`, `Surroundings.tsx` | M |
| P3 | Fog, lighting, sky, atmosphere | Watcher 92 % fogged at 185 m (02 V3); fog source split JSON/code (C7) | Playtest the readability of the signal; if needed tune fog falloff toward The Watcher only (keep the approved misty look); make `fog.ts` the documented source | Height-fog shader term; colour-grade lock pass with the owner | `fog.ts`, `Atmosphere.tsx`, `WatcherFX.tsx` | M |
| P4 | Ground materials and environmental details | Ground reads well in captures; WebP only | — | KTX2 textures; extra decals (oil stains, cracks) along lanes | `stage_01_textures.py`, export scripts | M |
| P5 | Shared contestant model quality | Hood taller and narrower, body slimmer than the reference (02 V1) | Owner reviews V1 side by side; if confirmed, adjust proportions **in the existing generator** (`contestant_geometry.py`), same rig, UVs and clips, re-validate | — | `blender/scripts/contestant_*.py`, exports, manifest | M |
| P6 | Coat material, geometry and texture quality | Coat detail hard to read at night at gameplay distance (02 V2) | Real-GPU 1080p check; if confirmed, raise coat readability on LOD1/LOD2 (stronger trim/stitch contrast in `CNT_Detail`, hem and yoke silhouette kept in LOD2) | Close-range coat micro-detail (normal map pass) | `contestant_textures.py`, `contestant_geometry.py`, `contestant.ts` shader | M |
| P7 | Fall Guys-inspired movement animation quality | Owner priority; clips are procedural keys; walk-only gameplay is approved | Animation pass inside the approved rules: stronger anticipation and overshoot on Start/Stop, wobble and lean on turns, squash on stop, more comic Stumble/Fall/Recover, smoother Run blend at 4 m/s; foot-sliding check | Idle variants and lobby emote polish | `blender/scripts/contestant_build.py` (clip keys), `contestant.ts` state machine | M |
| P8 | Watcher presentation and detection effects | Presentation built (029); readability under fog unverified | Verify in the playtest; ensure detection beam and ring read through fog on every tier | Subtle camera reaction for the local player's own spot (with reduced-motion setting) | `WatcherFX.tsx`, `Scene.tsx` | S / M |
| P9 | UI visual quality and interaction consistency | System fonts differ by OS (06 §6); no in-round leave; no all-ready warning; no FOV | Leave-room in settings; all-ready confirm for the host; FOV slider; consistent button states | Self-hosted licensed condensed web font and SVG CN TRIAL wordmark (owner approves artwork); laurel winner card | `ui/*`, `styles.css`, `index.html` | M |
| P10 | Performance and asset optimisation | No real-GPU numbers; game chunk 1.57 MB; draw calls above the proposed budget | After R4: fix what the numbers show; split the game chunk | KTX2; further draw-call merging | `vite.config.ts`, `Scene.tsx`, `tools/stage15/*` | M |

## 5. Priorities and recommended implementation order

Order is chosen so that measurement comes before cost, and safety fixes come before features.

| Order | Package | Type | Depends on | Complexity |
|---|---|---|---|---|
| 0 | Owner approves this plan; answers Q2–Q5 (08 §6) | Gate | — | — |
| 1 | R5 Technical safety (A1, A2) | Required | — | S |
| 2 | R4a Perf overlay `?perf=1` + P1 current-build captures | Required | — | S |
| 3 | R4b Real-GPU runs (owner, two machines) | Required | 2 | XL (people) |
| 4 | R2 Reconnection | Required | 1 | L |
| 5 | R1 Audio | Required | Q4 sourcing | L |
| 6 | R3 Winner presentation | Required | 1 | M |
| 7 | R4c Team playtest (15–30 people, live) | Required | 2–6 merged (with approval) | XL (people) |
| 8 | P3, P5, P6, P7, P8 polish (evidence from 3 and 7) | Required where evidence confirms, else optional | 3, 7 | M each |
| 9 | P9 UI polish; P10 optimisation | Required parts first | 3 | M |
| 10 | Optional items (P2, P4, KTX2, web font, height fog) | Optional | 8, 9 | M each |
| 11 | R6 doc hygiene; budgets re-baselined; Stage 1.5 second-pass sign-off | Required | all | S |

Each package: own branch → PR → CI green (`app`, `test`) → owner approval → merge (deploys). No package is merged
during a team session.

## 6. Testing requirements (all packages)

1. `npm run typecheck`, `npm test`, and the browser and server suites that cover the change (`test:load`, `test:round`,
   `test:e2e`, `test:obstacles`, `test:colorways`, `test:ui`, `test:quality`), in CI on every PR.
2. Blender changes: `bash blender/scripts/run_stage.sh …` and the relevant `validate_*.py` (CI `test` job).
3. New suites: `tests/integration/reconnect.mjs` (R2); podium/rematch steps in `test:round` and `test:ui` (R3);
   audio cue unit tests (R1); stage isolation unit test (R5).
4. Visual changes: before/after 7-view captures on Low and High of the current build; asset checklists in 08 §5.
5. Performance-sensitive changes: overlay report before and after on the same real machine.
6. Never mark anything PASS without execution evidence; software-renderer frame rates are comparisons only.

## 7. Acceptance criteria for the milestone

- Stage 01 matrix (08 §2) rows 14, 20, 21, 23, 25, 26, 27, 30, 31, 32 move to COMPLETE (or are explicitly waived by the
  owner), raising the weighted score from 75 % toward 100 %.
- Audio, reconnection and the podium are live and approved by the owner.
- Real-GPU reports for at least two machines and one 15–30-person playtest are recorded, with GDD §8 targets met or
  a dated fix plan.
- No approved asset replaced; every changed asset passes its validator and the 08 §5 checklist.
- The server holds no mutable module-level state; two-room isolation test passes.
- Documents 01–09 updated to the new facts.

## 8. Decisions needed from the owner before work starts

| # | Question |
|---|---|
| D-A | Approve this roadmap and its order (or reorder) |
| D-B | Audio sourcing: procedural + CC0 (zero cost, recommended), original recordings, or a paid generator |
| D-C | Fall Guys direction: confirm it means animation feel in Stage 01 (walk-only rules unchanged), with jump/sprint in later stages |
| D-D | Reference and minimum machines for performance testing, and a date for the team playtest |
| D-E | Optional: stop documentation-only merges from redeploying (`deploy.yml` `paths-ignore`) |
| D-F | Whether P5 (contestant proportions) should be investigated, after a side-by-side review |
