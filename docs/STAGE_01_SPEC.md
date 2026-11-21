# CN Trials · Stage 01 spec: Red Light, Green Light

> The Stage 01 figure is **The Watcher** (decision 023, `docs/THE_WATCHER_SPEC.md`), which replaced The Shepherd; numbers are unchanged. Signal visuals now come from the Watcher's lens and clips (`apps/web/src/stages/stage01/watcherAnimation.ts`).

Status: **v0.2** (21 November 2026): v0.1 starting values plus the approved environment design changes (decision 017: start zone 15 m, 22 m floodlight towers, 9 m finish gate, row shuffle). Environment detail lives in `docs/STAGE_01_DESIGN_SPEC.md`. Phase S1-1 of
`STAGE_01_PRODUCTION_PLAN.md`. Values stay tunable after the S1-3 walk test and team playtests. Implemented in `packages/shared/src/round.ts` (S1-4).

The GDD (v0.3) defines the rules. This spec gives every number and state the greybox, the server and
the presentation need. All values are **PROPOSED starting values** until approved in §10, and all are
tunable after the S1-3 walk test and team playtests. Units are metres and seconds. Coordinates use the
Blender convention from `BLENDER_PIPELINE.md` §4: origin at the centre of the start line, ground at
Z = 0, course running toward +Y.

Approved inputs used: night floodlit yard (decision 007), playful tone (008), The Watcher (005),
Standup mode (006).

## 1. Layout

```
            Y (m)
   +195 ┬                    ▲ The Watcher (≈28 m tall) on a 4 m platform, X = 0, Y = 185
        │                  [ ■ ]
   +172 ┼────────────────────────────────────────────  back wall
        │        SAFE ZONE (qualified players wait)
   +163 ┼ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─   end of finish trigger
   +160 ┼════════════════ FINISH LINE / GATE ═════════
        │
        │      open yard, painted lane lines every 6 m,
        │      no cover, no obstacles
        │
 ✦      │                                                ✦  floodlight masts outside the fence,
        │                                                   X = ±38: 22 m towers at Y −10, 40, 90, 140, 175
        │
     0  ┼════════════════ START LINE ══════════════════
        │   · · · · · · · · · ·   spawn rows at Y = −2.0, −4.5, −7.0
   −15  ┴────────────────────────────────────────────  start wall
       X = −30                  0                    X = +30
```

| ID | Item | Value |
|----|------|-------|
| L1 | Playable width | 60 m (X −30 to +30) |
| L2 | Start zone | Y −15 to 0 (15 m; was 12 m, decision E5: room for the camera behind the back row) |
| L3 | Course length (start line to finish line) | **160 m** |
| L4 | Finish trigger volume | Y 160 to 163, full width, 3 m high |
| L5 | Safe zone | Y 163 to 172 |
| L6 | Boundary | Fence-height colliders 3 m tall at X = ±30 (Y −15 to 172), start wall at Y −15, back wall at Y 172. Camera-only colliders on the fence (decision E10) |
| L7 | Spawn grid | 30 points: 10 columns × 3 rows; X = −13.5 to +13.5 every 3.0 m; rows at Y −2.0, −4.5, −7.0. Fewer players fill from the centre of the front row outward. **Row shuffle (E13):** each round the server assigns players to rows in a random seeded order, so nobody always starts at the back (implemented with the round flow in S1-4) |
| L8 | Watcher plinth | Centre X 0, Y 185; 12 × 12 m; 4 m high; outside the playable area |
| L9 | Watcher height | **28 m** (about 23 × contestant height). Raised from 18 m after the S1-3 walk test showed it read too small from the start line (owner approved, 21 Nov 2026). Visible from every spawn |
| L10 | Ground markings | Lane lines every 6 m and start/finish bands; visual only, no collision |
| L11 | Dressing | Floodlight towers 22 m at X = ±38 (decision E6), finish gate 9 m (E7), spectator gantry, judges' booth, benches, playground relics, outer barrier, roadway, water tower and tree lines: see `STAGE_01_DESIGN_SPEC.md` §7. No collision inside the playable area and nothing taller than 3 m inside the yard except the finish gate |

**Why 160 m:** at 4.0 m/s with moving time of about 57 % (green plus warning), a player who never
gets caught crosses in about 70 s. That leaves room for hesitation inside the 120 s timer and fits
Standup Quick (15 s briefing + 3 s countdown + up to 120 s + 20 s results ≈ 2.5 minutes).

## 2. Contestant movement in Stage 01

| ID | Item | Value |
|----|------|-------|
| M1 | Gameplay capsule | Height 1.2 m, radius 0.3 m, the same for every preset |
| M2 | Walk speed | 4.0 m/s |
| M3 | Acceleration to full speed | 0.15 s |
| M4 | Stop from full speed (keys released) | 0.12 s, about 0.25 m |
| M5 | Sprint | Off in Stage 01 |
| M6 | Jump | Off in Stage 01 (no obstacles; avoids accidental movement on red) |
| M7 | Player collision | Players push each other lightly; a push during red never eliminates the pushed player (§4, D4) |

## 3. Signal state machine (server-owned)

```
BRIEFING → COUNTDOWN (3 s) → GREEN ⇄ WARNING → RED → GREEN … → RESULTS
                                  (cycle repeats until the round ends)
```

| ID | State | Duration | Rules |
|----|-------|----------|-------|
| S1 | BRIEFING | ≤ 15 s; skippable by players who have seen it; countdown waits for the longest remaining | Rule text: "Move on green. Freeze when The Watcher turns." |
| S2 | COUNTDOWN | 3 s | Movement locked |
| S3 | GREEN | Random 3.0–6.0 s from the round seed; the first GREEN is at least 5 s | Movement free |
| S4 | WARNING | 0.8 s | Movement still free; The Watcher starts turning; warning sound |
| S5 | RED | Random 3.0–5.0 s from the round seed | Grace window first (§4), then detection |
| S6 | RESULTS | Freeze all movement; server finalises placings | |

The seed and the full signal sequence are logged per round (GDD §3.1).

## 4. Red detection (server-owned)

| ID | Item | Value |
|----|------|-------|
| D1 | Grace window at the start of RED | 0.3 s + that player's measured one-way latency, capped at 0.5 s total |
| D2 | Elimination test after the grace window | Horizontal speed above **0.3 m/s** averaged over 3 server ticks (100 ms at 30 Hz), **or** total horizontal displacement during this RED above **0.15 m** |
| D3 | Never counts | Camera rotation, turning on the spot, idle animation, vertical movement |
| D4 | Pushes | Displacement caused by another player's collision is excluded from D2 |
| D4b | Not line-of-sight (E9) | Every player on the field is checked during RED; nobody can hide behind other players or props. The Watcher's scan beam is presentation only |
| D5 | Safe players | Players inside the finish trigger or safe zone are immune |
| D6 | Inputs during RED | Accepted (no lockout), so a mistake is the player's own; the server judges the resulting motion |

## 5. Round end and results

| ID | Item | Full tournament | Standup Quick |
|----|------|-----------------|---------------|
| R1 | Round timer | 120 s from GO | 120 s from GO |
| R2 | Round ends when | Timer ends, or the qualifier target is reached, or no active players remain | Timer ends, or no active players remain |
| R3 | Qualifier target | `clamp(round(0.73 × starters), min(2, starters), starters)`; 30 starters → 22 | Not used |
| R4 | Not finished at the end | Not qualified. If fewer than 2 finished, the furthest-progressed players fill up to 2 | Ranked by progress (Y position) |
| R5 | Placing order | 1. Finishers by server finish time. 2. Unfinished by progress. 3. Eliminated, latest elimination first | Same |
| R6 | Ties | Same server tick: smaller distance past the finish line first; then join order | Same |
| R7 | Champion | n/a (advance to round 2) | First finisher; if nobody finishes, furthest progress |

## 6. The Watcher: signals and timing

The signal always uses at least three channels, never colour alone (GDD §5.2, §6.4).

| Moment | Watcher | Light | Sound | HUD |
|--------|----------|-------|-------|-----|
| GREEN starts | Turns away (0.6 s), lantern lowered | Warm floodlights; lantern dim green | Short bright chime | "GO" with a walking icon |
| WARNING starts | Begins turning toward players (0.8 s, ends facing exactly at RED) | Lantern brightens amber | Rising whistle | "GO" pulses (no more than 3 flashes/s) |
| RED | Faces players, lantern and crook raised, slow head scan left↔right | Lantern red, a soft scan beam sweeps the yard | Low hum while scanning | "FREEZE" with a hand icon |
| Player spotted | Head snaps to the player | Beam settles on them | Comic "boing" sting | That player: "SPOTTED!" |

Animation clips for The Watcher (`THE_WATCHER.glb`): `Watcher_Idle`, `Watcher_TurnAway`, `Watcher_GreenSignal`, `Watcher_TurnToField`, `Watcher_FocusLock`, `Watcher_RedSignal`, `Watcher_ScanSweep`, `Watcher_Detect`, `Watcher_ReturnNeutral` (`docs/THE_WATCHER_SPEC.md` §6).
Animation follows the server's state; it never decides anything (GDD §2.6).

## 7. Playful elimination and spectating

- **Spotted:** the player freezes in a startled pose, a "SPOTTED!" stamp pops above them, then they
  shrug, wave and walk off to the side benches (about 2 s, no damage or harm imagery).
- **Feedback tiers:** another player spotted = small (sting and their animation). You spotted = medium:
  your stamp, a light camera nudge scaled by the reduce-shake setting, then the spectator view. No
  hit-stop, because the server clock never pauses.
- **Spectator camera:** follows an active player (switch with A/D or click), plus a high camera
  behind The Watcher showing the whole yard. HUD shows timer, signal state and qualified count.

## 8. Audio cue list (originals to be produced)

Green chime · warning whistle · red hum and scan · spotted sting · finish fanfare (small) · countdown
ticks and "GO" · ambient night yard (wind, distant machinery, crowd murmur) · results sting.
Captions for gameplay-critical cues ("GO", "FREEZE", "SPOTTED").

## 9. Greybox build parameters

`blender/scripts/specs/stg01_greybox.json` holds these values plus greybox-only visual settings
(ground margins, gate and fence sizes, background silhouettes). Core values:

```json
{
  "stage": "STG01",
  "units": "m",
  "width": 60.0,
  "start_zone_depth": 15.0,
  "course_length": 160.0,
  "finish_trigger_depth": 3.0,
  "safe_zone_depth": 9.0,
  "wall_height": 3.0,
  "spawns": { "columns": 10, "rows": 3, "spacing_x": 3.0, "row_y": [-2.0, -4.5, -7.0] },
  "lane_spacing": 6.0,
  "shepherd": { "x": 0.0, "y": 185.0, "platform_size": 12.0, "platform_height": 4.0, "height": 28.0 },
  "floodlights": { "x": 36.0, "spacing_y": 40.0 },
  "capsule": { "height": 1.2, "radius": 0.3 }
}
```

## 10. Approval checklist

Approve the spec as a whole, or name the IDs to change.

| Group | IDs | Key values |
|-------|-----|-----------|
| Layout | L1–L11 | 60 m wide, 160 m course, The Watcher 28 m tall at Y 185 |
| Movement | M1–M7 | 4.0 m/s, no sprint, no jump |
| Signals | S1–S6 | Green 3–6 s, warning 0.8 s, red 3–5 s |
| Detection | D1–D6 | Grace 0.3 s + latency (max 0.5 s); 0.3 m/s or 0.15 m |
| Results | R1–R7 | 120 s timer; 22 of 30 qualify; Standup Quick ranks everyone |
| Presentation | §6–§8 | Lantern and crook signals; playful "SPOTTED!" elimination |
