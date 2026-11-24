# CN TRIAL: Stage 01 refinement, implementation

Owner brief "CN TRIAL: STAGE 01 REFINEMENT" (24 Nov 2026). Branch `claude/project-thread-8jwd5y`, not merged,
not deployed. Decision 033 records the choices that need the owner's sign-off. Audit: `STAGE_01_REFINEMENT_AUDIT.md`.
Related: `STAGE_01_SCORING_SYSTEM.md`, `STAGE_01_BOT_SYSTEM.md`, `STAGE_01_ASSET_OPTIMIZATION.md`, `STAGE_01_QA_REPORT.md`.

## 1. Summary

| Phase | Done | Main files |
|---|---|---|
| 01 Audit | yes | `docs/STAGE_01_REFINEMENT_AUDIT.md` |
| 02 Player collisions | yes | `packages/shared/src/collisions.ts`, `room.ts`, `contestant.ts` |
| 03 Obstacle variations | yes (no climbable props, see §5) | `packages/shared/src/obstacles.ts`, `apps/web/src/stages/stage01/obstacleKits.ts` |
| 04 Matte painting, no 3D trees | yes | `tools/stage01/generate_matte_layers.py`, `Surroundings.tsx`, `Stage01Scene.tsx` |
| 05 Watcher (materials only) | yes, except sounds (no audio system) | `apps/web/src/stages/stage01/watcherLook.ts` |
| 06 Bots | yes | `packages/shared/src/bots.ts`, `room.ts` |
| 07 Simpler lobby | yes | `apps/web/src/ui/GameHud.tsx` |
| 08 Points | yes | `packages/shared/src/match.ts`, `room.ts`, `GameHud.tsx` |
| 09 Shorter game | yes | `ROUND` in `packages/shared/src/round.ts` |
| 10 Lighting and atmosphere | yes | `Atmosphere.tsx`, `WatcherFX.tsx`, `fog.ts`, `skyModel.ts` |
| 11 UI redesign | yes, mockup first | `docs/ui/STAGE_01_UI_MOCKUP.html`, `apps/web/src/styles.css`, `GameHud.tsx`, `Menu.tsx` |
| 12 Performance | measured (software WebGL only) | `tests/e2e/refinement-measure.mjs`, `STAGE_01_ASSET_OPTIMIZATION.md` |
| 13 QA | yes | `STAGE_01_QA_REPORT.md` |
| 14 Docs | yes | this folder |

## 2. Per-room stage state (intelligence doc 09, A1/A2)

The room used module-level variables for the stage geometry, obstacles and round engine, so every Durable
Object instance in one isolate shared them. Now `TrialRoom` owns `geo`, `obstacles`, `gapRows`, `engine`,
`match` and the bot seed; `loadStage(stageId)` rebuilds them for that room only, and the simulation step
re-reads `this.engine` after a phase change so a stage switch never uses the previous engine. Impact: two rooms
on one isolate can no longer overwrite each other's stage or round, which a multi-stage match (and Stage 02
later) needed anyway. No protocol or gameplay change.

## 3. Player collisions

Rules (all values in `COLLISION`, `packages/shared/src/constants.ts`):

- Each player is the existing capsule, radius 0.3 m; contact at 0.6 m between centres. No oversized capsules.
- Overlap always resolves by pushing both apart half each, then out of walls: nobody passes through anyone or
  gets stuck inside someone or a wall.
- **Impact speed and direction count**: a hard hit is a closing speed of at least 1.5 m/s along the contact line
  (relative velocity · normal). Walking into someone knocks **both** down; brushing past side by side or
  nudging slowly does not. A soft contact only removes each player's own velocity into the other, so a standing
  player is never pushed into motion (and so never spotted because of someone else).
- Knocked down: no control for 1.0 s (Fall clip held) + 0.6 s (Recover clip), zero velocity, then 1.5 s of
  immunity so contacts cannot chain into endless falls.
- **Never an elimination**: the separation and the knock-down are applied after the movement step and are not
  input-driven movement, so the red-light detector does not count them. Players who are down cannot move, so
  they cannot be spotted while down either.
- Server authority: the room runs it after every 30 Hz step for humans and bots alike (only `active` players
  during a stage); snapshots carry each player's knock-down time left (protocol v7, 10th row element); clients
  play Fall/Recover from it and block local input while down. A `collision` event drives a toast.
- Tests: `collisions.test.ts` (7 cases: contact distance is two capsule radii, a hard hit knocks both down,
  direction matters (side brush and slow nudge only separate), head-on speeds add, no chaining while down or
  immune, never through a wall and coincident spawns separate, a knocked-down player on red is not spotted).

## 4. Shorter game (Phase 09)

All lengths are in one block, `ROUND` (`packages/shared/src/round.ts`); `MATCH` reads its timings from it.

| Setting | Before | Now |
|---|---|---|
| Briefing (stage 1 / later stages) | 15 s | 6 s / 4 s (skippable) |
| Round cap | 120 s | 100 s |
| After the first finish | the full timer ran | 30 s left for everyone else |
| Green light | 3–6 s (first ≥ 5 s) | 3–5.5 s (first ≥ 4 s) |
| Warning | 0.8 s | 0.8 s (unchanged: reaction time) |
| Red light | 3–5 s | 1.8–3.2 s |
| Detection grace | 0.3 s + latency, max 0.5 s | unchanged |
| Results | 20 s | 9 s between stages (host can skip), 16 s final |

Why not shorter: the course is 160 m at the approved 4 m/s, so the fastest possible run with detours and red
lights is about 70 s (measured with bots). A three-stage match now takes about 5–6 minutes, a single stage
about 1.5–2 minutes (QA report).

## 5. Obstacles (Phase 03)

The fair collision layout from decision 031 is kept (10 mirror-symmetric rows with 6 m gaps, the sliding gate),
and each barricade segment is now dressed as one of eight modular kits: concrete jersey barriers, stacked
wooden crates, tyre stacks, oil drums, concrete pipes, low timber barricades, a fallen floodlight frame with a
generator, and shipping containers. Rules:

- The collider is always the segment's box, identical on server and client; a kit only sets the box depth
  (0.8–2.44 m, `OBSTACLE_KITS`) and the model drawn inside it, never wider or deeper.
- Kits are assigned mirror-symmetrically per row (unit test), so no lane is easier.
- Containers (2.59 m tall) only stand against a fence, so the finish line and The Watcher stay visible from the
  course; every other kit is 0.8–1.25 m tall.
- Nothing covers spawns, the finish, the safe zone or walls (existing tests).
- Models are built from primitives with vertex-colour tints and weathered procedural textures, merged into one
  mesh per material: 7 draw calls and about 20,000 triangles for all 41 segments.
- Not built: climbable or vaultable props. Stage 01 is walk-only (jump is a lobby emote, decision 030 b), so a
  climbable obstacle would change the approved rules; it is listed for the owner.

## 6. Matte painting and tree removal (Phase 04)

- Removed: the midground tree impostors and the tree cutout billboards (no longer imported, so they are not in
  the build); the cone trees in the environment GLB are now really stripped at load (audit §3.2). The old
  assets stay in the repository until the owner signs off.
- Added: six seamless 360° painted layers on cylinders around the course, generated by
  `tools/stage01/generate_matte_layers.py` (numpy + Pillow, fixed seeds, no photos or AI images): sky clouds
  (drifting slowly), far landscape, industrial skyline (factories, water towers, chimneys with smoke, cranes,
  amber windows, red aviation lights), forest silhouettes, midground structures (warehouses, silos, containers,
  pylons, fences), foreground mist with weeds and fence posts. Palette: dark teal and blue-green with purple
  undertones. Their different radii give parallax as the camera moves. PNG sources in `art/stage01/matte/source/`,
  WebP at runtime in `blender/exports/stage01/matte/`, placement in `STAGE_01_MATTE_LAYERS.json`.
- The arena, camera and gameplay are unchanged.

## 7. The Watcher (Phase 05), geometry LOCKED

Runtime material changes only (`watcherLook.ts`); `THE_WATCHER.glb` is byte-identical to the backup.

- Porcelain and enamel: a thin clear glaze (clearcoat). Hair: lacquer sheen. Brass: slightly rougher, tarnished.
- Grime and wear shader pass on porcelain, enamel, textile, brass and steel: darker and rougher toward the base
  and in noisy patches (world-space noise), no new textures.
- Lens cover glass: wet, deep reflection.
- Four eye states driven from the public round state: neutral (slow breathing glow), green (steady), red (hot,
  slight mechanical flicker), detect (brighter red-orange strobe for 1.7 s after a server spot). The clips
  still choose which lens shows; this sets how it glows.
- Animation timing unchanged (the clip adapter already fits the new 0.8 s warning).
- Not done: mechanical sounds. The game has no audio system yet; adding one is a separate piece of work.
- No visual improvement here needed a geometry change, so no geometry proposal is pending.

## 8. Lighting and atmosphere (Phase 10)

Floodlight cones softer (strength 0.13 → 0.085, softer edges), lamp glare smaller and dimmer, the red search
beam and spot "laser" less hot and more translucent, bloom gentler (0.42/0.4/0.93 → 0.26/0.3/0.95), fog a
touch thinner and more blue-green (exp2 0.0085 → 0.008: The Watcher is still about 89 % fogged), sky zenith
and upper colours shifted toward teal and purple, plus the drifting painted cloud layer.

## 9. Lobby, UI and protocol

- Lobby: host sees START, everyone else READY; the host can add random players (+5), fill every free slot, or
  remove bots. The Standup/Tournament selector is gone. Counts show people, bots and ready.
- UI redesign ("night yard under inspection"): Barlow Condensed and Barlow (self-hosted, OFL), a camera-aperture
  lens as the signature element for the signal and the brand, notched cards, porcelain/brass/teal tokens.
  Mockup first (`docs/ui/STAGE_01_UI_MOCKUP.html`, frames in `docs/ui/mockup/`), then implemented with the same
  stylesheet. Screens: menu, how to play, settings, join, invite, lobby, briefing, countdown, HUD green/warning/
  red, spotted, knocked down, finished, spectating, stage results, next stage, final results, connection lost.
- Protocol v7: bot actions, `next` (host skips results), `bot` on roster rows, knock-down time in snapshot rows,
  `collision` events, results carry points and standings, a `standings` message for late joiners.

## 10. Known limitations

- Frame-rate figures come from software WebGL in a GPU-less container; no real-GPU measurement was possible.
- New binary files are normal git files (not LFS) because this environment could not complete LFS uploads;
  see `.gitattributes` (3 MB in total).
- A match repeats Stage 01 until Stage 02 exists.
