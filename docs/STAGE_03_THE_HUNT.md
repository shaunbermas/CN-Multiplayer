> **Now Stage 03 (decision 045, 25 Nov 2026).** The Hunt moved from Stage 02 to Stage 03 without rule changes; Stage 02 is Agawan Base. Registry id `STAGE_03_THE_HUNT` (the old id `STAGE_02_THE_HUNT` still resolves). Code: `packages/shared/src/hunt/`, `apps/web/src/stages/hunt/`. References below to "Stage 02" describe the stage before the move.

# Stage 02 · THE HUNT

Status: **PROPOSED, built on branch `claude/project-thread-xyllg2` (25 Nov 2026), not merged.** Decision 042.
Source: owner Prompt 1 and the reference pack `CN_TRIAL_ENVIRONMENT_ENEMY_DESIGN_REFERENCE_PACK`
(`02_STAGE_02_THE_HUNT/docs/STAGE_02_ENVIRONMENT_MAP_AND_ASSET_DESIGN.md`, floor plan, prop board).
Where the pack and the prompt disagree the pack wins (owner instruction); every difference is listed in §9.

## 1. Gameplay spec

An asymmetric hide-and-hunt in an abandoned industrial facility. Everybody uses the shared contestant model.

| Rule | Value |
|---|---|
| Roles | `hunterCount(n) = clamp(round(n × 0.2), 1, n − 1)`; 30 players → 6 hunters, 24 hiders. Seeded per stage, so all clients agree. |
| Head start | 15 s. Hiders spread out from 4 separate spawn pockets; hunters wait in the caged staging room R behind two closed gates. |
| Hunt | 180 s after the gates open. The stage ends early when every hider is caught. |
| Pulse Detector (hunters, `Q`) | 10 s cooldown, 18 m range (inside the 15–20 m brief). Reports only a rough direction (one of 8 sectors, ±18° jitter) and a strength (none / weak / signal / strong). Walls attenuate the signal; glass attenuates less; more than 4 walls blocks it. Hidden and crouching hiders give a weaker reading. |
| Capture (hunters, hold `E`) | Within 1.7 m, facing the hider (55° half-angle) with clear line of sight, held for 1 s. Moving out of range or breaking sight resets it. |
| Hiders | Sprint (`Shift`, ×1.55 for 1.6 s, 8 s cooldown), crouch (`C`, slower, quieter, weaker pulse reading), hide (`E` on a yellow floor mark): up to 10 s, then 15 s cooldown. Lockers, crates and tarps hold one hider; containers hold two. Hunters can search a spot by holding `E` at its mark. |
| Threat warning | A hider is told "a hunter is nearby" within 14 m and "DANGER" within 7 m, with no direction (pack: restrained cue). The heartbeat speeds up to match. |
| Captured | The player turns grey with a CAUGHT tag and spectates (`Tab` switches). They return in the next stage with their points. |
| Scoring | A hider who survives gets 2 points and a captured hider gets 0. A hunter with 1 capture gets 1 point and a hunter with 2 or more captures gets 2. Points add to the match standings, alongside Stage 01 (first finisher 2, other finishers 1, others 0). |

**Match order** (decision 042, owner's card answer): Stage 01 → Stage 02 → Stage 01 again as a stand-in for stage 3
until The Naughty Run exists. The landing page lets the host start from Stage 01 or Stage 02. Stage 03 is shown
as "Coming soon" and cannot be picked.

## 2. Technical architecture

- **Engine interface.** `packages/shared/src/engine.ts` defines `StageEngine`. Red Light (`RoundEngine`) and The Hunt (`HuntEngine`) both implement it, and the room builds a new engine for each stage. Stage 01 code paths are unchanged.
- **Shared rules.** `packages/shared/src/stage02/` contains:
  - `config.ts`: all tuning.
  - `layout.ts`: the greybox facility (rooms, walls, gates, hide spots, spawns, lamps).
  - `los.ts`: line of sight and wall attenuation against axis-aligned walls.
  - `nav.ts`: a 1 m nav grid with A* and path smoothing for bots.
  - `hunt.ts`: the engine.
  - `huntBots.ts`: bot senses and decisions.
- **Server (`apps/server/src/room.ts`).** It owns roles, timers, movement and collisions; hidden players are taken out of collisions. It also owns pulses, captures, hiding and results.
  - Clients send only inputs: movement and the `k` flags for sprint and crouch, plus `act` messages for pulse, hide and capture.
  - **Per-recipient snapshots.** Each client gets only the players it can see: those in line of sight within 45 m. A hidden hider appears only in their own snapshot. Role and private state (cooldowns, pulse readings, threat) go in a private `me` block. Hunters are public, as the pack allows ("small role icon and scanner device"). The client cannot wallhack because the data never arrives.
- **Bots are not omniscient.**
  - They see only by line of sight within 22 m, and hunters also have a view cone.
  - They hear only noisy hiders within 6 m, with ±2 m error.
  - Hunter bots track hiders through the same Pulse Detector readings and check hide spots the same way people do.
  - Bots act at 10 Hz.
- **Reconnect.** A player who drops during a match keeps their seat as "away", identified by their browser key. Rejoining with the same key restores the same id, role, capture count, status and points. A full room still accepts the reconnect.
- **Isolation.** Each room is its own Durable Object, with its own engine, seed, timers and results. The integration test runs two rooms at once to check this.
- **Client.** The client side has these parts:
  - `apps/web/src/stages/stage02/Stage02Scene.tsx`: an instanced greybox with one draw call per wall kind, floors, hide-spot marks, gates that lift, lamps by quality tier, and haze.
  - `apps/web/src/ui/HuntHud.tsx`: the role-specific HUD.
  - Stage 02 cues in `AudioDirector.tsx` and `audio.ts`: gates, pulse, hide, caught, capture and the threat heartbeat. All are code-made.
  - The scene module now switches when the stage changes mid-match.
- **Protocol v8.**

## 3. Configuration reference (`packages/shared/src/stage02/config.ts`)

| Key | Value | Meaning |
|---|---|---|
| `hunterShare` | 0.2 | share of hunters |
| `headStartS` / `huntS` | 15 / 180 | timings; test rooms scale both by `roundS` |
| `sprint` | 1.55× · 1.6 s · cd 8 s | hider and hunter sprint |
| `crouch` | 0.55× · pulse ×0.8 | crouch speed, pulse dampening |
| `pulse` | cd 10 s · 18 m · strong ≥ .55 · signal ≥ .3 · weak ≥ .08 · hidden ×0.6 · 8 sectors · ±18° · max 4 walls | Pulse Detector |
| `capture` | 1.7 m · 1 s · 55° | capture rule |
| `hide` | enter 1.4 m · max 10 s · cd 15 s | hiding |
| `threat` | near 14 m · danger 7 m | hider warning |
| `sightM` | 45 | snapshot visibility range |
| `bots` | sight 22 m · hear 6 m · hunter cone cos 0.42 · repath 1.2 s | bot senses |

## 4. Role assignment and scoring spec

1. At the start of the stage, the connected participants are shuffled with the stage seed. The first `hunterCount(n)` become hunters.
2. Hunters spawn in room R, and hiders are dealt round-robin across the four spawn pockets (B, D, F, A).
3. A player who joins mid-stage spectates and plays the next stage.
4. When the stage ends (time out or every hider caught), each player gets one results row with role, status and captures. Points are computed once from the table in §1 and added once to the standings.
5. In the next stage every player is active again, including the captured ones.

## 5. Environment blockout

The greybox is 108 × 72 m and laid out from the pack's floor plan.

- **Rooms.** B loading bay, D storage, H control, A warehouse, F locker room, C maintenance, E container yard, G gallery, and R the hunter staging cage.
- **Routes.** No room has a single dominant sightline, and R cannot see any spawn pocket.
- **Hide spots.** There are 31, each with a worn yellow floor mark. The mark shows where the spot is, never whether someone is in it.
- **Art direction (pack).** Charcoal and cold steel blue, restrained red warning lamps, small amber practicals, and haze that never becomes opaque on routes.
- **Landing background.** `STG02_Landing_Hunt.webp` is a render of this blockout and will be replaced when final art exists.

## 6. Enemy and assets

- Stage 02 has no enemy: hunters are contestants using the shared model, with a role cone and a small Pulse Detector box (blockout).
- **Owner's 3D assets are needed only for Stage 03 (The Naughty Run) enemies.** Stage 02 can also take a final Pulse Detector model and final environment art when they are ready.

## 7. Testing report (25 Nov 2026, cloud container)

| Check | Result |
|---|---|
| `npm run typecheck` | clean |
| `npm test` (vitest) | 97 passed, including 18 new Stage 02 tests (roles 1–30, timing and gates, pulse attenuation and cooldown, capture rules, hiding capacity and cooldown, scoring, nav, full 30-bot stage sim: 21 captures, 3 survivors, average tick 0.43 ms) |
| `npm run test:load` (30 clients) | passed |
| `npm run test:e2e` (two browsers) | passed (Stage 01 unchanged) |
| `npm run test:hunt` (new) | passed. It covers:<br>• 30 participants (3 real clients + 27 bots), 6 hunters and 24 hiders, and every client agrees on the hunter list.<br>• Filtered snapshots: a person saw only 6 of 30 at one point.<br>• Reconnect kept the same id and role.<br>• Points matched the rules and were recorded once.<br>• Stage 3 had everyone active, with points kept.<br>• A second room ran independently.<br>• Tick p95 was 1 ms. |
| Browser check (swiftshader) | Stage 02 loads from the landing picker with no page errors. The HUD, roles, captures and gates work. |

## 8. Known limitations

- **Footprint.** The pack's draft is about 150 × 110 m with catwalks and limited upper routes. The greybox is 108 × 72 m and flat, because movement is 2D (the gallery G stands in for the catwalk). Upper levels need vertical movement (ADR 0001) and come with final layout work.
- **Bot balance.** Bot balance leans toward hunters (about 3 of 24 survive in the sim). People hide better than bots, but this needs playtesting.
- **Performance testing.** No real-GPU frame measurement has been done (reference hardware is an Intel Mac laptop). The 30-player tests used bots and test clients.
- **Art.** The visuals are greybox only; final art replaces the boxes and keeps the gameplay.

## 9. Contradictions found (the pack was followed)

| Topic | Prompt or older docs | Reference pack (followed) |
|---|---|---|
| Stage 02 identity | GDD §3 lists Stage 02 as Tug of War and Stage 03 as The Factory; decision 034 said "Stage 01 only" | Stage 02 is The Hunt and Stage 03 is The Naughty Run (decision 042 updates the lineup) |
| Hunter look | Possible new hunter enemy | Hunters use the existing contestant model with a small role icon and Pulse Detector, and no new body |
| Facility size | none given | about 150 × 110 m with catwalks; built smaller and flat (see §8) |
| Hiding capacity | "one occupant per place" | Lockers are single-occupancy; containers are built to hold 2 (owner can set them to 1 in `layout.ts`) |
| Threat cue | "threat warning" | Restrained cue with no direction (built that way) |
