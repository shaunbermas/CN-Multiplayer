# CN TRIAL · Stage 1.5 Prompt 05: Stage 01 obstacle twist (specification and report)

Status: **PASS** (implemented and tested). The twist is **optional and off by default**. The host ticks "Obstacle twist" in the lobby; unticked is the rollback switch and plays the approved rules exactly as before. The core rule is unchanged: green you may move, red you must stop; spotting and elimination stay in the server's round engine.

## 1. Choice (two of the three candidates)

| Candidate | Decision | Why |
|-----------|----------|-----|
| Static offset barricades | **Built** | Readable route choice. Static collision is cheap for 30 players and needs no network state |
| Low panel moving only on green | **Built (sliding gate)** | Adds timing without a new control. A slide, not a swing, keeps collision to one box and reads clearly from the third-person camera |
| Barrel / crate cover | Not built | Overlaps with the barricades. Scattered props add camera clutter and 30-player congestion for little gain |

No crouch or crawl input, no new enemy, no physics or destructible objects.

## 2. Layout (`packages/shared/src/obstacles.ts`, `STAGE01_OBSTACLES`)

Defined relative to the approved course: 0 = start line, 1 = finish line, gap centres as fractions of the fence half-width. It is resolved at runtime against `STAGE_01_METADATA.json` (no copied coordinates).

![top-down](P05_obstacles_topdown.png)

| Element | Course position | Resolved (game m) | Size |
|---------|-----------------|-------------------|------|
| Row A1 | 0.28 | z −44.8 | Gaps at centre and ±0.66: three 6 m gaps |
| Row B1 | 0.44 | z −70.4 | Centre closed; gaps at ±0.31 and beside each fence: four 6 m gaps |
| Sliding gate | 0.58 | z −92.8 | Panel 10 m × 0.6 m, 2.2 m tall. Slides between x −17.7 and +17.7, period 7 s of green time |
| Row A2 | 0.72 | z −115.2 | As A1 |
| Row B2 | 0.86 | z −137.6 | As B1 |

Barricades are 1.2 m deep and 1.1 m tall jersey barriers, running fence to fence. Their gaps are the only way through, so there is no sneak path along the fence.

## 3. Rules and timing

- **Barricades:** static walls during briefing, countdown, active and results. Absent in the lobby practice walk.
- **Gate:** `x = centre + A·sin(2π · greenTime / 7 s)`, where `greenTime` counts only green and warning seconds since GO, from the seeded schedule. The gate is **frozen for the whole red light**, so it can never push anyone during red or cause an elimination. Its beacon blinks amber while it moves and is solid red while frozen.
- **Authority:** the server steps each player against stage walls + barricades + the gate at the server's green time (`apps/server/src/room.ts`). Client prediction uses the same function (`wallsFor()` in `Scene.tsx`), so reconciliation corrects any small clock difference.
- **Protocol v4:** `RoundState.obstacles` publishes whether the round uses the twist. `StartRequestOptions.obstacles` is host-only.

## 4. Fairness and clearance (unit tests, `packages/shared/test/obstacles.test.ts`, 8 tests)

| Check | Result |
|-------|--------|
| Each row is mirror-symmetric about the centre line, so no lane advantage | PASS |
| Every gap ≥ 6 m (more than 8 capsules abreast), with no sliver gap at the fence | PASS |
| Every lane is ≤ 10 m from a gap in every row | PASS |
| No obstacle covers a spawn, the finish, the safe zone or an existing wall | PASS |
| The gate never moves during any red segment, moves during green, and stays inside the fence margin all round | PASS |
| `step()` stops a player at a barricade face and lets one through a gap | PASS |

## 5. Server test (`npm run test:obstacles`, in CI)

Real Worker + Durable Object, seeded round. A bot walks down the centre line only on green.

| Round | Result |
|-------|--------|
| Obstacles on | The server stopped it at z −69.50: the closed row's face (−69.8) plus the capsule radius. Never spotted |
| Obstacles off (rollback) | The same walk passed the row (z −74.0) |

The test also checks that `RoundState.obstacles` is published correctly.

## 6. Visuals

`apps/web/src/stages/stage01/Obstacles.tsx`:
- **Barricades:** procedural low-poly jersey barriers, one merged draw call, concrete with a hazard band.
- **Gate:** steel panel with frame, ground rail and beacon. The gate and rail are 6 draw calls.
- **Shadows:** cast and received on High.

Screenshots: `docs/stage15/screenshots/p05_obstacles/` (`obstacles_overview.png`, `obstacles_runner.png`).

## 7. Not tested

Congestion with 30 real players funnelling through the gaps. It is covered only by the geometry checks above; Prompt 08 runs 30 simulated clients, not 30 humans.
