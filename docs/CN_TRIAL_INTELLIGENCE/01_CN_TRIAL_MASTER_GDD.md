# CN TRIAL · 01 Master GDD (project intelligence)

| Field | Value |
|---|---|
| Document | 01 of 8, CN TRIAL Project Intelligence (`docs/CN_TRIAL_INTELLIGENCE/`) |
| Audit date | 24 November 2026 |
| Audited commit | `main` @ `7ccb1ba` (PR #22, decision 031), deployed by Deploy run #17 (success, 22 Nov 2026 07:04 UTC) |
| Scope | Audit and documentation only. No game code, asset or gameplay was changed to write this set |
| Canonical rules | `docs/GAME_DESIGN_DOCUMENT.md` (GDD v0.5) and `docs/DECISIONS.md` remain the sources of truth. This file summarises them against the implementation; where they disagree, the disagreement is listed in §9, not resolved |

## How to read the intelligence set

| Doc | Purpose |
|---|---|
| 01 Master GDD (this) | What the game is, what is approved, what is built, what is open |
| 02 Visual Bible | Art direction, palette, lighting, fog, approved looks |
| 03 Character Bible | The shared contestant and The Watcher |
| 04 Environment Bible | Stage 01 yard: layout, dimensions, layers, materials |
| 05 Technical Architecture | Client, server, protocol, pipeline, tests, deploy |
| 06 UI/UX Bible | Screens, flows, HUD, states, gaps |
| 07 Asset Registry | Every production asset with path, size, budget and status |
| 08 Production Tracker | Stage 01 completion matrix, Stage 1.5 readiness, quality checklists, sequence |

**Labels used throughout:**

| Label | Meaning |
|---|---|
| **APPROVED** | Set by the owner and recorded in `docs/DECISIONS.md` (decision number given) |
| **VERIFIED** | Checked in this audit against code, files, a test run or CI evidence (method given) |
| **NOT DOCUMENTED** | Exists in the implementation but no document describes it, or the information is not recorded anywhere |
| **NOT YET IMPLEMENTED** | Required by an approved document but absent from the code and assets |
| **NEEDS VERIFICATION** | Built, but this audit could not prove it works as intended (for example, needs a real GPU or real players) |
| **PROPOSED** | The auditor's recommendation. Not approved, not to be built without the owner's decision |

## 1. Important context found in the audit

**Stage 1.5 has already been executed, approved and deployed.** The brief for this audit describes Stage 1.5 as
the next milestone. The repository records otherwise:

- Decision 027: Stage 1.5 (Prompts 01 to 08: matte painting, atmosphere, obstacles, Watcher FX, full UI,
  optimisation) was approved by the owner on 22 Nov 2026 ("Approve all then merge it") and merged in PR #18.
- Decisions 029, 030 and 031 then changed the contestants (now ONE shared model with 30 colourways), the
  background (2D only), The Watcher's threat effects, fog and obstacles. All merged and deployed (PRs #20 to #22).
- Deliverables: `CN_TRIAL_STAGE_1_5_FINAL_DELIVERABLES/`, `docs/stage15/`.

This set therefore treats "Stage 1.5" as **a first pass that is complete and live, with open items**, and
08 §2 assesses readiness for the remaining Stage 1.5 work (a second polish pass) rather than a fresh start.
The owner should confirm this reading (see 08 §6, question Q1).

## 2. Product identity

| Item | Value | Status |
|---|---|---|
| Official name | **CN TRIAL** (visible in all UI: `apps/web/index.html` title, `Menu.tsx` wordmark) | APPROVED by the owner's current brief; decision 027 (1) put CN TRIAL in the UI |
| Retired names | THE LAST TRIAL (retired); "CN Trials" / "CN TRIALS" still used in the GDD title, README, DECISIONS 003, server comments and technical ids (`cn-trials`, `@cn-trials/*`) | Technical ids intentionally unchanged (decision 027 (1)). Document wording is inconsistent: see §9 |
| Purpose | Creative Nomads team icebreaker at standups (Standup mode) plus a seven-round tournament for team events | APPROVED (004, 006) |
| Platform | Desktop browser, keyboard and mouse, private invite rooms, guest nicknames, no accounts, no monetization | APPROVED (GDD §1.2, 004) |
| Capacity | Up to 30 players per room; usual rooms under 20 | APPROVED (GDD §1.2, 029 (4)) |
| Tone | Playful: light suspense and comedy, no horror imagery or harm | APPROVED (008) |
| Hosting | Cloudflare Worker + Durable Objects, deployed from GitHub Actions; Cloudflare and GitHub only | APPROVED (015, 016) |
| Live URL | https://cn-trials.shaun-bermas.workers.dev | VERIFIED via Deploy run #17 smoke test (`/api/health`) on 22 Nov 2026. This audit could not reach the URL directly (the cloud container's network proxy blocks the host) |

## 3. Approved design decisions to preserve (do not redesign)

| # | Area | Approved direction | Decision / source |
|---|---|---|---|
| A1 | Contestants | ONE shared, detailed master contestant (`CNTRIAL_CONTESTANT_MASTER`), one skeleton, one 16-clip library, one UV atlas and texture set, LOD0/1/2, **30 colourways** (CW01 to CW30). Dealt at random, never duplicated in a room, kept on reconnect from the same browser. The 30-individual-characters approach is retired | 030 (supersedes 029 (1)), 031 (1) |
| A2 | Coat | The long coat is the signature feature and gets the most modelling, material and texture attention | 030; `docs/stage15/CONTESTANT_CHARACTER_SPEC.md` §3 |
| A3 | Stage 01 enemy | **THE WATCHER**: original 28 m robotic wind-up doll (teal enamel coat, single camera-lens eye, swept-back hair with bun, waist turret, wind-up key, iron boots). The Shepherd and the original doll concept are retired | 023, 024, 014 (height); `docs/THE_WATCHER_SPEC.md` |
| A4 | Watcher threat | Red eye glare and light, red searchlight on red, sky darkens behind it, yard dims on red | 029 (2) |
| A5 | Stage 01 environment | Night floodlit yard, approved greybox and gameplay geometry, approved detailed environment, 2D-only background beyond the yard | 007, 017, 019, 021, 022, 029 (3) |
| A6 | Atmosphere | Visible fog on every tier (exp2 0.0085, misty blue-grey), mist sheets and banks; The Watcher reads as a silhouette whose eye and searchlight pierce the fog | 031 (4) |
| A7 | Obstacles | Always on (lobby too), 10 mirror-symmetric barricade rows with 6 m gaps plus a sliding gate that moves only on green/amber | 031 (5), (6); supersedes 027 (2) and 019 G4 |
| A8 | Facing | Contestants turn 360° to face their movement direction | 031 (2) |
| A9 | Ground FX | Dust on dry concrete, splashes and ripples in puddles | 031 (3) |
| A10 | Emotes | Jump and dive are lobby-only, visual-only emotes; Push/Pull kept in the library for a future Tug of War | 030 (b), (c), 031 (1) |
| A11 | Graphics default | High with every effect, with an adaptive fallback (High → Medium → Low under 45 fps) | 026 |
| A12 | Authority | The server owns movement, signals, detection, finish and results; clients send inputs only | GDD §7.3; 012, 020 |
| A13 | Branding | CN TRIAL in all new UI and documents; never The Last Trial | Owner brief (24 Nov 2026); 003, 027 (1) |

**Owner direction stated in the current brief but not yet recorded in `docs/DECISIONS.md`:** "Movement should
follow the established Fall Guys-inspired movement direction, with appropriate running, walking, jumping, falling
and recovery animations." The animations exist (03 §1.6). Gameplay movement in Stage 01 is walk-only by the
approved spec (§5 below). See the conflict in §9, item C1.

## 4. Core loop and modes (as implemented)

1. A player opens the site, enters a nickname, creates a private room (5-character code) or joins by code or
   invite link (`?room=CODE`). **VERIFIED** in `apps/web/src/App.tsx`, `ui/Menu.tsx`, `net.ts`, `test:ui`.
2. Lobby: free practice walk on the real course (obstacles on), ready toggle, host starts. Jump/dive emotes.
3. Host chooses **Standup** (default; every finisher qualifies) or **Tournament rules** (qualifier target).
4. Briefing (15 s, skippable by all) → countdown (3 s) → active round (120 s) → results (20 s) → lobby.
5. Spotted players slump, grey out and spectate (Tab cycles); finishers wait; late joiners wait on benches.

| Mode | Status |
|---|---|
| Standup Quick (one Stage 01 round) | VERIFIED (code + `test:round`) |
| Standup Short (3 rounds), briefing variants | PROPOSED in GDD §2.3.1; NOT YET IMPLEMENTED |
| Full seven-round tournament | NOT YET IMPLEMENTED beyond Stage 01. `TOURNAMENT_ORDER = [STAGE_01_RED_LIGHT]` (`packages/shared/src/stages.ts`). "Tournament rules" applies the R3 qualifier target to a single Stage 01 round and returns to the lobby |
| Winner screen / champion presentation for a full tournament | NOT YET IMPLEMENTED (results show a Stage winner only) |

## 5. Stage 01 rules (Red Light, Green Light)

Source: `docs/STAGE_01_SPEC.md` v0.2 (values APPROVED by 010; layout by 017/019), implemented in
`packages/shared/src/round.ts`, `movement.ts`, `constants.ts`. All values VERIFIED by reading the code and by the
55 unit tests that passed in this audit.

| Item | Value | Code |
|---|---|---|
| Course | 160 m start line to finish line, 60 m wide, 15 m start zone, safe zone beyond the finish | `STAGE_01_METADATA.json` via `stage-metadata.ts` |
| Movement | Walk 4.0 m/s, 0.15 s to full speed, 0.12 s to stop; capsule 1.2 m × 0.3 m; **no sprint, no jump** (spec M5, M6) | `constants.ts` `MOVEMENT` |
| Signals | Seeded GREEN (3–6 s; first ≥ 5 s) → WARNING 0.8 s → RED (3–5 s) | `round.ts` `ROUND`, `buildSchedule` |
| Detection | After a grace of 0.3 s + measured one-way latency (cap 0.5 s): spotted if average speed > 0.3 m/s over 3 ticks or displacement > 0.15 m | `afterMove`, `graceFor` |
| Round | 120 s; ends early when nobody is active or the tournament target is reached | `tick` |
| Qualification | Standup: every finisher. Tournament: `round(0.73 × starters)` (22 of 30), minimum 2 | `qualifierTarget`, `qualify` |
| Ranking | Finishers by time, then unfinished by progress, then spotted (latest first) | `rankPlayers` |
| Spawns | 30 points, 10 × 3 grid; seeded row shuffle each round | `start` |
| Obstacles | 10 barricade rows (6 m gaps, mirror-symmetric) + sliding gate at 58 % of the course, 10 m wide, moves only during green/amber time | `packages/shared/src/obstacles.ts` |
| Walk timing | Front row to finish with no signals: 40.63 s (server-measured, this audit's `test:load` on a plain test course); projected 71.3 s with signals. Obstacle detours are not included in that projection | `tests/reports/load-30-clients.json` |

## 6. Controls (implemented vs GDD §2.5)

| Input | Implemented | GDD |
|---|---|---|
| WASD / arrows | Move (camera-relative) | Move |
| Mouse (pointer lock) | Look; sensitivity and invert in Settings | Look |
| Space | Skip briefing; lobby jump emote (visual) | Jump in movement stages |
| E | Lobby dive emote (visual) | Interact |
| Tab / T | Cycle spectate target | — |
| R | Respawn (lobby only) | — |
| Esc | Release mouse | Pause / settings |
| Left Shift (sprint), Left Ctrl (crouch) | NOT YET IMPLEMENTED (not needed in Stage 01 by spec) | Later stages |

## 7. Stage pool

| Stage | Status |
|---|---|
| 01 Red Light, Green Light | Playable and live |
| 02 Tug of War | NOT YET IMPLEMENTED. Push/Pull clips exist in the contestant library |
| 03 to 10 | NOT YET IMPLEMENTED. GDD §3 entries only. 05 The Quiet Ward and 07 The Blackout must be reworked for the playful tone (GDD §2.3.1) |

## 8. Open owner decisions (from `docs/DECISIONS.md` and this audit)

| # | Item | Source |
|---|---|---|
| O1 | Tagline ("Thirty enter. Only one survives." kept for now) | DECISIONS open table |
| O2 | Theme names (stage names, Basecamp, Nomads, Trailblazer) | DECISIONS open table |
| O3 | Whether Stage 01 gameplay should gain jump or sprint to match the Fall Guys-inspired movement direction, or keep the approved walk-only rule and express it through animation | This audit, §9 C1 |
| O4 | Whether the Stage 1.5 "first pass" is accepted as done and the next milestone is a second polish pass | This audit, §1 |
| O5 | Reference hardware for the GDD §8 frame-rate targets | GDD §8; known issue K2 |

## 9. Conflicts and stale statements found (documented, not changed)

| # | Conflict | Where | Recommended safe correction (PROPOSED) |
|---|---|---|---|
| C1 | Owner brief asks for Fall Guys-inspired running, jumping, falling and recovery. Approved Stage 01 spec M5/M6 has no sprint and no jump; jump/dive are lobby emotes (030 (b), 031 (1)). In rounds, a contestant at full speed plays the Run clip; Fall/Recover/Stumble play on knockdowns and hard stops | `STAGE_01_SPEC.md` §2; `CONTESTANT_CHARACTER_SPEC.md` §6 | Record the Fall Guys direction as a decision covering animation feel for Stage 01 and movement verbs for later stages; do not add gameplay jump to Stage 01 without a decision |
| C2 | GDD §4.2 and §6.1 still describe 30 curated presets and a character-selection screen | `GAME_DESIGN_DOCUMENT.md` | Update the GDD text to decision 030 (owner decision needed because §4.2 is labelled PROPOSED and §6.1 lists a required screen) |
| C3 | Name spelled CN TRIALS / CN Trials in the GDD title, README, DECISIONS 003, server comments | GDD, `README.md`, `apps/server/src/room.ts` | Text-only rename to CN TRIAL in documents; leave technical ids |
| C4 | "Not deployed / held in PR" statements after deployment | `CN_TRIAL_STAGE_1_5_FINAL_DELIVERABLES/INDEX.md`, `RELEASE_NOTES.md`, `KNOWN_ISSUES.md` K6, K9 | Add a "superseded" note |
| C5 | "Not wired into the game yet" | `docs/THE_WATCHER_VALIDATION.md` §5 | Add a note that decision 025 integrated it |
| C6 | QA matrix and P08 report describe capsule placeholders and a blocked roster | `QA_MATRIX.md`, `P08_OPTIMIZATION_QA_REPORT.md` | Note superseded by 030 |
| C7 | Fog values: `STAGE_01_LIGHTING.json` says exp2 0.0045 (Low linear 60–260 m); runtime `fog.ts` overrides with 0.0085 on every tier (031) | `blender/exports/STAGE_01_LIGHTING.json`, `apps/web/src/stages/stage01/fog.ts` | Record that `fog.ts` is the source of truth, or regenerate the JSON in the next environment export |
| C8 | Stage 01 production plan header says "Nothing in this plan has been built" and names The Shepherd | `docs/STAGE_01_PRODUCTION_PLAN.md` | Add a status header pointing to 08 of this set |
| C9 | Decision 025 said signal anchors move to the Watcher's optical origin "in the next metadata revision". `SIGNAL_RED_ANCHOR` / `SIGNAL_GREEN_ANCHOR` are still at the lantern-era position (6.16, 183.5, 15.888) in `STAGE_01_METADATA.json`. The runtime uses the Watcher's lens anchor from the GLB instead; detection is not line-of-sight, so gameplay is unaffected | `blender/exports/STAGE_01_METADATA.json` | Do it in the next approved metadata revision (touches approved data; owner decision) |
| C10 | Retired Shepherd identifiers remain in approved data and source scenes (`ENM_Shepherd_Placeholder_*`, `ShepherdPlatform`, `LGT_STG01_ShepherdRim`); hidden or filtered at runtime | Metadata, environment `.blend`/GLB, lighting JSON, `Stage01Scene.tsx` lines 100–101, 232–233 | Rename in the next approved environment rebuild; no runtime impact today |
