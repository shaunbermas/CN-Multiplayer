# CN TRIAL · 08 Production Tracker

Audit date 24 Nov 2026, `main` @ `7ccb1ba`. Labels: see 01. This file holds the Stage 01 completion matrix
(Phase 4), the Stage 1.5 readiness assessment (Phase 5), the quality and consistency system (Phase 6) and the
recommended production sequence. Earlier trackers stay where they are: `docs/stage15/STAGE_1_5_PRODUCTION_TRACKER.md`,
`CN_TRIAL_STAGE_1_5_FINAL_DELIVERABLES/`.

## 1. Evidence gathered in this audit (real runs, 24 Nov 2026)

Environment: Claude cloud container, no GPU, local `wrangler dev` (same Worker code as production), headless
Chromium with software WebGL. Nothing was skipped silently; anything not run is listed as not run.

| Check | Command | Result |
|---|---|---|
| Type check | `npm run typecheck` | PASS |
| Unit tests | `npm test` | PASS, 55 of 55 (8 files: round 7, stage integration 13, obstacles 8, Watcher animation 8, metadata 4, movement 7, colourways 5, quality 3) |
| Client build | `npm run build` | PASS; menu chunk 324.8 KB, game chunk 1,570 KB (Vite size warning) |
| 30-client load + walk timing | `npm run test:load` | PASS: 30 clients, 30 unique colourways, client 31 rejected, tick avg 0.079 ms / p95 1 ms, 0 dropped inputs, 19.2 snapshots/s per client, RTT median 6 ms (loopback), walk front row → finish 40.63 s |
| Seeded round with bots | `npm run test:round` | PASS |
| Two browsers in one room | `npm run test:e2e` | PASS (prediction error 0 m) |
| Obstacles enforced by the server | `npm run test:obstacles` | PASS |
| Colourways unique, kept on reconnect, emotes | `npm run test:colorways` | PASS |
| UI walkthrough | `npm run test:ui` | PASS (every screen and the connection-lost and room-full states; software renderer, Low tier) |
| Graphics tiers + adaptive fallback | `npm run test:quality` | PASS: each tier turns on its effects; default starts High; adaptive fallback stepped High → Medium → Low on the software renderer (software fps 2.0 / 0.9 / 0.8 Low / Medium / High: comparison only) |
| Blender asset checks | `bash blender/scripts/run_stage.sh …`, `validate_*.py` | NOT RUN in this audit (no asset changed). Last CI evidence: Checks run 37 (`test` job) **success** on PR #22, 22 Nov 2026 |
| 30-player browser scene | `npm run test:thirty` | NOT RUN (about 20 minutes of six software renderers; not in CI). Last recorded: PASS, `tests/reports/thirty-players.json` |
| Live site | Deploy run 17 smoke test of `/api/health` | **success**, 22 Nov 2026 07:04 UTC (GitHub Actions). Not reachable from this container (network proxy) |
| Real-GPU frame rate, 30 humans, internet latency | — | NOT RUN: not possible in this environment |

The test runs rewrite `tests/reports/*`; those local changes were discarded and are not part of this PR.

## 2. Stage 01 completion matrix (Phase 4)

Requirements come from `docs/STAGE_01_PRODUCTION_PLAN.md` (phases S1-0 to S1-7, §6, §6.1, §7), the GDD Stage 01
entry and §8, and the owner's current brief. Statuses: **COMPLETE**, **PARTIALLY COMPLETE**, **NOT IMPLEMENTED**,
**NEEDS TESTING**, **BLOCKED** (waiting on an owner decision or input).

### 2.1 Gameplay rules (server-authoritative)

| # | Requirement | Current implementation | Files | Evidence / validation | Remaining work | Dependencies | Status |
|---|---|---|---|---|---|---|---|
| 1 | Seeded signal state machine (GREEN → WARNING → RED), never red without warning | `buildSchedule`, `segmentAt`, `RoundEngine.signal` | `packages/shared/src/round.ts` | Unit (round.test.ts), `test:round`, this audit | — | — | COMPLETE |
| 2 | Red-window motion validation with latency grace | Grace 0.3 s + one-way latency (cap 0.5); speed 0.3 m/s over 3 ticks or 0.15 m | `round.ts` `afterMove`, `graceFor`; `room.ts` probes | Unit, `test:round`, `test:e2e` | The plan's tests at 50/150/300 ms simulated latency are not a dedicated suite (grace formula is unit-tested) | — | COMPLETE |
| 3 | Finish detection, server finish order | Finish and safe triggers from metadata | `round.ts`, `stage-metadata.ts` | Unit, `test:round` | — | — | COMPLETE |
| 4 | Qualification scaling (22 of 30, min 2; R3/R4) | `qualifierTarget`, `qualify` | `round.ts` | Unit, `test:round` | — | — | COMPLETE |
| 5 | Standup Quick results rank everyone; first finisher is champion | `rankPlayers`; Results card "Stage winner" | `round.ts`, `GameHud.tsx` | Unit, `test:ui` | — | — | COMPLETE |
| 6 | Time-out, frozen results, handed to the tournament once | `tick`, `Tournament.complete` idempotent | `round.ts`, `tournament.ts`, `room.ts` | `stage-integration.test.ts`, `test:round` | — | — | COMPLETE |
| 7 | Forged messages rejected (no client finish, no teleport, no speed hack) | Inputs only, sanitised, token bucket, queue and size caps | `room.ts`, `movement.ts` | Code review; `test:load` (0 dropped legit inputs) | No dedicated forged-message test | — | COMPLETE |
| 8 | Eliminated players spectate | Status `spotted`, spectator HUD, Tab cycling | `room.ts`, `Scene.tsx`, `GameHud.tsx` | `test:e2e`, `test:ui` | — | — | COMPLETE |
| 9 | Play again in the same room; late arrivals wait | Results → lobby; `waiting` on benches | `room.ts` | `test:round` (late joiner) | — | — | COMPLETE |
| 10 | Obstacles fair and enforced by the server (031) | Shared rectangles; gate moves on green time only | `obstacles.ts`, `room.ts`, `predictor.ts` | 8 unit tests, `test:obstacles` | Round length with 10 rows not re-measured (04 §8 E1) | — | COMPLETE |

### 2.2 Rooms and multiplayer

| # | Requirement | Current implementation | Files | Evidence / validation | Remaining work | Dependencies | Status |
|---|---|---|---|---|---|---|---|
| 11 | Private room, invite link, guest join | Random 5-char code, `?room=`, nickname | `App.tsx`, `net.ts`, `worker.ts` | `test:ui` | — | — | COMPLETE |
| 12 | Host start, ready state, host transfer | First joiner host; earliest remaining on leave | `room.ts` | `test:round` (non-host cannot start), `test:ui` | All-ready warning (05 T6) | — | COMPLETE |
| 13 | 30 players; 31st rejected; 30-client load | `MAX_PLAYERS`, close 4001 | `room.ts`, `constants.ts` | `test:load` this audit | — | — | COMPLETE |
| 14 | Reconnect within a grace period (GDD §6.2, §8) | Reconnect rejoins as a new player | `room.ts`, `App.tsx` | K7 | Session resume (protocol change) | Owner priority | NOT IMPLEMENTED |
| 15 | 20–30 real people play a full session | 5 real browsers + 25 simulated tested | `tests/e2e/thirty.mjs` | K3, K12 | Team playtest | Owner schedules | NEEDS TESTING |
| 16 | Works over the internet against the deployed edge | Local loopback only; live smoke test passes | `deploy.yml` | K-list "not verified" | Latency and disconnect test on the live site | Team members' machines | NEEDS TESTING |

### 2.3 Presentation

| # | Requirement | Current implementation | Files | Evidence / validation | Remaining work | Dependencies | Status |
|---|---|---|---|---|---|---|---|
| 17 | Approved environment in the browser (yard, matte, trees, sky, fog, mist) | Runtime GLB + Stage 1.5 layers + 031 fog | `apps/web/src/stages/stage01/*` | `test:quality`, `test:e2e`, screenshots | Current-build view set (row 25) | — | COMPLETE |
| 18 | The Watcher integrated; clips follow the server; threat FX | `watcherAnimation.ts`, `WatcherFX.tsx` | stage01 | Unit (8), `test:e2e` (clips + beam) | Metadata anchors (01 C9) | — | COMPLETE |
| 19 | Shared contestant with animations and 30 colourways | `contestant.ts`, `Scene.tsx`, protocol v6 | apps/web, shared, server | CI validator, `test:colorways`, `test:thirty` (22 Nov) | Real-GPU readability (02 V1, V2) | — | COMPLETE |
| 20 | Every signal change uses at least three channels: pose, sound, HUD icon + word, light (plan §6) | Pose, HUD, light, wash: yes. Sound: no | `GameHud.tsx`, `WatcherFX.tsx` | Screenshots `p04_atmosphere/signal_*` | Sound channel; fog readability check (02 V3) | Audio (row 21) | PARTIALLY COMPLETE |
| 21 | Audio cues (green, warning, red, scan, finish, eliminated, ambient) | None | — | `grep`: no audio code or files | Full audio pass | Owner: sourcing (original or licensed) | NOT IMPLEMENTED |
| 22 | HUD and round flow (briefing, countdown, signal, timer, counts, objective, spotted, feed, spectator, results) | Implemented | `GameHud.tsx` | `test:ui` (18 steps) | Winner screen for a full tournament (needs more stages) | Stage 02+ | COMPLETE |
| 23 | Settings and accessibility (GDD §6.4) | Graphics, sensitivity, invert, UI size, edge pulse | `Menu.tsx`, `settings.ts` | `test:ui` | FOV, audio volumes, captions, leave-room in game | Audio | PARTIALLY COMPLETE |

### 2.4 Performance, quality and production

| # | Requirement | Current implementation | Files | Evidence / validation | Remaining work | Dependencies | Status |
|---|---|---|---|---|---|---|---|
| 24 | Quality tiers and adaptive fallback (026) | Low/Medium/High, DPR cap, step-down under 45 fps | `qualityStore.ts`, `quality.ts` | `test:quality`, unit (3) | Real-GPU tuning | Row 26 | COMPLETE |
| 25 | In-game validation screenshots of the current build at gameplay distance | Full sets exist up to decision 029; contestant FX shots for 031 | `docs/stage15/screenshots/` | File dates and contents | Re-run `tests/e2e/views.mjs` on the current build | — | PARTIALLY COMPLETE |
| 26 | 30 contestants on screen at target frame rate on reference hardware (GDD §8: 60 fps 1080p; ≥ 30 fps minimum; plan S1-7) | Only software-renderer comparisons | `tests/e2e/contestant-perf.mjs`, P08 | K2, K12 | Measure on named machines | Owner names hardware | NEEDS TESTING |
| 27 | Asset budgets (`BLENDER_PIPELINE.md` §9) | Draw calls 232 (High, 30 players, pre-031) vs ≤ 150; contestant LOD0 22k vs ≤ 4k (pre-030 budget) | P08, manifest | Measured numbers | Re-baseline budgets after a real-GPU measurement | Row 26 | PARTIALLY COMPLETE |
| 28 | Load only the current stage; small first download | Code split, meshopt models, WebP | `App.tsx`, `blender/exports/stage15/` | Build output this audit | KTX2 later | — | COMPLETE |
| 29 | CI green and the live site deployed from `main` | Checks + Deploy workflows | `.github/workflows/` | Checks run 37 success; Deploy run 17 success | — | — | COMPLETE |
| 30 | Owner sign-off of the current visual build (after 031 fog, obstacles, facing, FX) | 027 approved Stage 1.5 before 029–031; 031 was an owner request, implemented and merged; no recorded review of the result | `docs/DECISIONS.md` | No record after 22 Nov 07:04 | Owner plays and signs off | Owner | BLOCKED |
| 31 | Movement direction: Fall Guys-inspired feel (owner brief) reconciled with the walk-only Stage 01 rules | Animations deliver the feel; no gameplay jump or sprint | `CONTESTANT_CHARACTER_SPEC.md` §6, `STAGE_01_SPEC.md` §2 | 01 §9 C1 | Owner decision, recorded | Owner | BLOCKED |
| 32 | Documentation current and consistent | Many reports stale after 029–031 (01 §9 C2–C8) | `docs/` | This audit | Text-only hygiene PR | Owner approval for GDD edits | PARTIALLY COMPLETE |

### 2.5 Completion percentage and how it was calculated

- 32 requirements, equal weight. Score per status: COMPLETE 1.0; PARTIALLY COMPLETE 0.5; NEEDS TESTING 0.5 (built,
  unproven); NOT IMPLEMENTED 0; BLOCKED 0.
- Tally: 20 COMPLETE (20.0) + 5 PARTIALLY COMPLETE (2.5) + 3 NEEDS TESTING (1.5) + 2 NOT IMPLEMENTED (0) + 2 BLOCKED (0)
  = **24.0 / 32 = 75 %**.
- Strict reading (COMPLETE only): 20 / 32 = **62.5 %**.
- By area: rules 10/10 (100 %); rooms and multiplayer 4.0/6 (67 %); presentation 5.0/7 (71 %); performance,
  quality and production 5.0/9 (56 %).

### 2.6 Is Stage 01 ready to move into Stage 1.5 work?

**Conditionally yes.** The game loop, server authority, multiplayer flow, UI and approved visuals are built, tested
and live. Stage 01 is **not complete** against its own production plan: the S1-7 gate (30 players at target frame
rate on reference hardware) and the real-group playtest have never been run, audio does not exist, reconnect is
not implemented, and the owner has not signed off the current build. None of that blocks visual polish, but two
items should come first because polish adds rendering cost and changes readability:

1. a real-hardware frame-rate baseline (row 26), so polish has a budget to stay within;
2. a 15–30-person playtest (rows 15, 16, 20, 30), which also answers whether the fogged Watcher reads (02 V3).

## 3. Stage 1.5 pre-production readiness (Phase 5)

Context (01 §1): a first Stage 1.5 pass is merged and live. The table assesses what a second pass would reuse and
what needs new production. Readiness: **READY** (inputs exist), **READY WITH INPUTS** (needs an owner input first),
**NOT READY** (blocked by a dependency).

| # | Area | Current state (verified) | Reuse | New production needed | Readiness | Dependencies |
|---|---|---|---|---|---|---|
| 1 | Environment improvements | Approved yard + runtime polish (P03), puddles, ground FX | All approved geometry and materials; runtime material tweaks | Only what the owner asks for after reviewing the current build; obstacles have no modelled art (code primitives) | READY WITH INPUTS | Owner review list; current-build screenshots (row 25) |
| 2 | Cinematic background and matte painting | Three procedural matte layers + 1,100 cutouts, 2D only (029) | Generators `tools/stage15/generate_matte.py`, `place_surroundings.py`, manifest | Optional higher-fidelity painted layers (must stay 2D and original) | READY | Owner's art direction if a change is wanted |
| 3 | Sky, clouds, fog, atmosphere | Sky dome, 031 fog 0.0085 every tier, mist sheets and banks | `Atmosphere.tsx`, `skyModel.ts`, `fog.ts` | Tuning only; true height fog would need shader work (K5) | READY WITH INPUTS | Playtest verdict on Watcher readability |
| 4 | Environmental lighting | 15-light JSON, tiers, cones, signal wash, Watcher red light | All | Possible baked lighting needs lightmap UVs → approved environment re-export (owner decision) | READY (tuning) / NOT READY (baking) | Real-GPU baseline |
| 5 | Ground and material improvements | WebP PBR sets, wet asphalt and puddle reflections, dust/splash FX | Texture generators (`stage_01_textures.py`) | KTX2 conversion; any new decals | READY | Browser QA for KTX2 |
| 6 | Final shared contestant model | Built, validated, integrated (030/031) | Everything | Only owner-approved refinements (02 V1 hood and proportions; coat readability V2). No new design | READY WITH INPUTS | Owner's review of V1/V2 against the reference |
| 7 | Colour variants | 30 colourways with contrast unit tests and night lift | JSON + shader | None unless the owner wants palette changes | READY | — |
| 8 | Approved robotic enemy | The Watcher, 9 clips, FX | Everything | Watcher audio; optional secondary motion | READY | Audio sourcing |
| 9 | Character animations | 16 clips, state machine, 360° facing | All clips | Fall Guys polish (squash, overshoot, stumble variety) within approved rules; jump/sprint only if decided | READY WITH INPUTS | Decision on 01 §9 C1 |
| 10 | Complete game UI and HUD | All Stage 01 screens; no winner screen, no in-game leave, system fonts | All UI code and tokens | Web font + wordmark art; leave-room; all-ready warning; FOV; audio settings | READY WITH INPUTS | Owner approval of font/wordmark |
| 11 | New UI references and mockups | One concept board (Stage 1.5) | Board as layout reference | Updated mockups for dealt colourways (no character select), winner/podium, settings with audio | READY WITH INPUTS | Owner supplies or approves mockups |
| 12 | Gameplay obstacles and twists | 10 barricade rows + gate, always on | `obstacles.ts` pattern system | New twists need a fairness spec (mirror symmetry, gap width, no red-light movement) and owner approval | READY WITH INPUTS | Playtest data on congestion (K3) |
| 13 | Polygon and draw-call optimisation | High + 30 players 232 calls (pre-031) | LOD budget, instancing, merged meshes | Re-measure after 031; budget update | NOT READY | Real-GPU baseline (row 26) |
| 14 | Texture and GLB optimisation | Meshopt runtime copies, WebP | `compress_glb.sh`, `derive_*.mjs` | KTX2/Basis; game-chunk split (05 T4) | READY | — |
| 15 | Browser performance and multiplayer stability | Server comfortably within budget (tick p95 1 ms at 30); software-only client numbers | Test suites | Real-GPU runs; 30-human session; reconnect (T2); multi-room geometry fix before Stage 02 (T1) | NOT READY | Hardware, people, owner priority |

**Reuse summary:** every approved asset, generator and system is reusable; nothing needs to be rebuilt.
**New production summary:** audio (all of it), UI brand typography and wordmark, updated UI mockups, any
owner-requested refinements to the contestant or atmosphere, KTX2, and performance work once measured.

## 4. Known issues register (carried forward and new)

| # | Severity | Issue | Source |
|---|---|---|---|
| K2 | High (verification gap) | No real-GPU measurements | Stage 1.5 known issues |
| K3 | Medium | No 30-human test | Stage 1.5 known issues |
| K4 | Medium | No audio | Stage 1.5 known issues |
| K5 | Low | No height fog or lightmaps | Stage 1.5 known issues |
| K7 | Medium | Reconnect = new player | Stage 1.5 known issues |
| K10 | Low | `test:thirty` one timeout in three runs | Stage 1.5 known issues |
| N1 | Medium (latent) | Module-level stage geometry and engine geometry in the room (05 T1) | This audit |
| N2 | Medium | Deploys end live rooms (05 T3) | This audit |
| N3 | Low | Stale documents (01 §9) | This audit |
| N4 | Low | Signal anchors in metadata still at the lantern position (01 §9 C9) | This audit |
| N5 | Low | Fog source of truth split JSON/code (01 §9 C7) | This audit |
| N6 | Info | Test runs rewrite committed reports (05 T5) | This audit |

K6 and K9 in the Stage 1.5 register are superseded (obstacles always on; Stage 1.5 deployed).

## 5. Quality and consistency system (Phase 6)

Rule for everything below: **an asset or feature is never complete because a script ran.** Completion needs the
listed evidence, checked by a person or an automated test, and recorded with the file paths.

### 5.1 Every substantial 3D asset

| # | Item | Evidence required |
|---|---|---|
| 1 | Approved visual reference | Path in `references/`, entry in `docs/REFERENCE_MANIFEST.md`, owner decision number |
| 2 | Modelling specification | Spec doc (like `CONTESTANT_CHARACTER_SPEC.md`): parts, construction, what is out of scope |
| 3 | Dimensions and proportions | Table in metres; origin, up axis, facing; checked by the validator |
| 4 | Material specification | Materials list, texture sets, colour space, region or slot map |
| 5 | Polygon budget | LOD0/LOD1/LOD2 targets and measured counts; in-game LOD rule |
| 6 | Texture budget | Resolution per map, file sizes, format (WebP now, KTX2 later), total download |
| 7 | Rigging requirements (where applicable) | Bone list and prefix, weight rules, max influences, mirrored sides |
| 8 | Animation requirements (where applicable) | Clip list with frames, loop flags, use in game, foot-sliding and clipping checks |
| 9 | Blender source file | `.blend` in `blender/scenes/` (LFS) plus the generating script and spec JSON |
| 10 | Exported GLB (where applicable) | Locked export + runtime copy; manifest JSON |
| 11 | Validation renders | Turnaround / close-ups / in-context render in `renders/` or `docs/.../screenshots/` |
| 12 | Technical validation | `validate_*.py` PASS in CI, Khronos glTF Validator 0 errors, Three.js browser check, in-game check with 30 players on Low and High, real-GPU frame-time delta |

### 5.2 Every significant UI feature

| # | Item | Evidence required |
|---|---|---|
| 1 | Screen inventory | Entry in 06 §2 with GDD and concept references |
| 2 | User flow | Updated flow in 06 §3, including error and empty states |
| 3 | Visual reference | Approved mockup or concept panel; tokens used |
| 4 | Interaction states | Default, hover, focus, pressed, disabled, loading, error |
| 5 | Implementation | Component paths; no colour-only signals; text in CN TRIAL voice |
| 6 | Browser validation | `test:ui` step + screenshot; Chrome and Edge, Firefox as compatibility; keyboard-only pass |

### 5.3 Every environment

| # | Item | Evidence required |
|---|---|---|
| 1 | Approved layout | Spec with IDs and diagrams; owner decision |
| 2 | World dimensions | Metres table (like 04 §1); metadata schema validation |
| 3 | Gameplay geometry | Metadata entries; server tests; CI rebuild diff |
| 4 | Decorative geometry | Collections list; "no collision" confirmed; exclusion from server data |
| 5 | Lighting specification | Lighting JSON with tiers; light counts; shadows; fog values with one source of truth |
| 6 | Optimisation strategy | Draw calls and triangles per tier, instancing, compression, download size |
| 7 | In-game validation screenshots | Fixed 7-view set (`tests/e2e/views.mjs`) on Low and High of the **current** build, plus signal states |

### 5.4 Definition of done for any milestone

1. Checks in CLAUDE.md run and pass (typecheck, unit, load, e2e, plus relevant suites and Blender checks).
2. Evidence recorded with paths; unverified items labelled NEEDS VERIFICATION, never PASS.
3. 01–08 of this set updated where the milestone changed facts.
4. Owner decision recorded in `docs/DECISIONS.md` for anything approved.

## 6. Recommended production sequence (PROPOSED)

| Step | Work | Why first | Owner input |
|---|---|---|---|
| 0 | Answer Q1–Q5 below | Several items are blocked only on these | Yes |
| 1 | Real-hardware baseline: play `?quality=high` / `medium` / `low` on one typical laptop and one desktop with a full room; record FPS and 1 % lows | Sets the budget for every later visual change (rows 26, 27; readiness 13, 15) | Name machines, run a session |
| 2 | Team playtest (15–30 people), Standup mode, on the live site | Validates fun, fairness, fog readability, obstacle congestion, internet latency (rows 15, 16, 30; V3, E1, E2) | Schedule |
| 3 | Documentation hygiene PR (text only: stale notes C2–C8, name spelling) | Cheap, removes confusion before more work | Approve GDD wording |
| 4 | Audio pass (signal cues first, then Watcher, footsteps, ambience, UI; settings and captions) | Biggest missing system; completes the three-channel signal rule | Original or licensed sourcing |
| 5 | Technical safety: fix 05 T1 (per-room geometry) and decide reconnect (T2) | Must precede Stage 02; T2 affects real sessions | Priority call on T2 |
| 6 | Visual polish second pass, item by item from §3, each through the §5 checklists | Builds on approved assets only | Review list from steps 1–2 |
| 7 | Optimisation re-baseline and budget update | Lock budgets with real numbers | — |
| 8 | Stage 1.5 sign-off → Stage 02 (Tug of War) | Gate per GDD §10 | Yes |

### Questions for the owner

| # | Question |
|---|---|
| Q1 | Stage 1.5 was merged and deployed on 22 Nov (decisions 027, 029–031). Is the next milestone a second Stage 1.5 pass, as this set assumes? |
| Q2 | Should "Fall Guys-inspired movement" stay an animation-feel direction in Stage 01 (walk-only rules unchanged), with jump/sprint arriving in later stages? |
| Q3 | Which machines are the reference and minimum hardware for the frame-rate targets? |
| Q4 | Audio: original sound design, licensed packs, or generated? Any budget constraint (the project aims to cost nothing)? |
| Q5 | After seeing the current build, is the fogged Watcher readable enough, and does the contestant match the reference closely enough (02 V1–V3)? |
