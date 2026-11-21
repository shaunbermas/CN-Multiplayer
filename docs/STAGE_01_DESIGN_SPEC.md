# CN Trials · Stage 01 environment design spec: Red Light, Green Light

Status: **APPROVED v0.1** (owner approved all of §14 on 21 November 2026, decision 017). The environment
greybox is built from it (`blender/scripts/generate_stage_01_greybox.py`; report: `docs/STAGE_01_GREYBOX_REPORT.md`).

| Source | Role |
|--------|------|
| `docs/GAME_DESIGN_DOCUMENT.md` (v0.4) | Canonical rules (Stage 01, §3; art direction, §5) |
| `docs/STAGE_01_SPEC.md` (v0.1, adopted values) | Gameplay numbers: yard, spawns, signals, detection, results. This document does not change them; proposed changes are flagged |
| `docs/DECISIONS.md` | Decided: night floodlit yard (007), playful tone (008), The Shepherd (005, 28 m in 014), Cloudflare server (016) |
| Prompt 02 reference pack: `playground_mood_reference_cropped.png` | New primary **mood** reference (see §13 for limits) |
| `references/GLOBAL/*` | Secondary style boards (doll figure retired) |
| `blender/scripts/specs/stg01_greybox.json` | Built and tested greybox values |
| `blender/scripts/specs/stg01_greybox.json` → `environment` | The approved environment placements (merged from the former layout file) |

All dimensions are **provisional until tested** in the greybox walk test and team playtests.

## 1. Design intent

**One sentence:** a forgotten night-time waystation yard, far too big for the little contestants, where
a towering mechanical Shepherd watches the flock cross 160 metres of open ground. The suspense comes
from the silence and the scale; the release comes from the comedy of being spotted.

| Quality | How the space delivers it |
|---------|---------------------------|
| Oversized | 60 m wide yard with no cover; 22 m floodlight towers; a 32 m Shepherd; contestants are 1.2 m |
| Isolated | Outer barrier, tree lines and an elevated roadway with no traffic close the world off; no buildings near the yard |
| Eerie (atmosphere) | Low teal ground haze, violet sky glow, damp ground reflections, long gaps between floodlights, distant silhouettes |
| Playful (outcomes, decision 008) | Old playground relics in the margins, comic "SPOTTED!" walk-offs, warm lights on the finish, spectators cheering from the gantry |
| Readable | Nothing inside the yard hides a player or the signal; The Shepherd is visible from every spawn; signals use pose, light, sound and HUD together |

Design principles applied: Readable danger and Fair elimination (GDD pillars), Fairness (5),
Affordance cues (81), Wayfinding (61): the start line, lanes, finish gate and The Shepherd form one
straight visual axis.

## 2. Coordinates, units and world dimensions

| Rule | Value |
|------|-------|
| Units | Metres. 1 Blender unit = 1 m = 1 game unit |
| Blender axes | Z up. **X across** the yard (west −, east +). **Y along** the course: start line Y 0, finish Y 160, The Shepherd at Y 185 |
| Game / Three.js axes | Y up; Blender (X, Y, Z) → game (X, Z, −Y). The course runs toward game −Z |
| Facing | Contestants spawn facing +Y (north). The Shepherd faces −Y (south, toward the players) |

| Extent (provisional) | Value |
|----------------------|-------|
| Playable yard | X −30 to +30 (60 m), Y −12 to +172 (184 m). Proposed: Y −15 to +172 (187 m, decision E5) |
| Course (start line to finish line) | 160 m |
| Margins inside the outer barrier | X ±30 to ±52; Y −40 to +215 |
| Full scene incl. backdrop | about X −100 to +110, Y −60 to +320 |
| Tallest elements | Water tower about 39 m, The Shepherd 32 m (head centre 28.1 m), floodlight towers 22 m, roadway deck 14 m |
| Contestant | Capsule 1.2 m tall, 0.3 m radius (spec M1) |

## 3. Layout diagrams

To-scale diagrams generated from the specs by `tools/diagrams/stage01_diagrams.py` (re-run after
any change):

| Diagram | File |
|---------|------|
| Top plan | `docs/diagrams/STG01_top_plan.svg` |
| Front elevation (from the start zone, heights to scale) | `docs/diagrams/STG01_front_elevation.svg` |
| Side section with sightlines | `docs/diagrams/STG01_side_section.svg` |
| Perspective (current greybox, CPU render) | `blender/exports/STG01/previews/CAM_STG01_Overview.png` |
| Perspective, player's view from spawn 1 (live build) | `tests/reports/screenshots/s1-3_start_view.png` |

### Top plan (simplified)

```
 Y (m)                         N  ▲
  245                                                          ◯ water tower (backdrop)
  230   ♣ ♣ ♣ ♣ ♣ ♣ ♣ ♣ ♣ ♣ ♣ ♣ ♣ ♣ ♣   tree line
  215 ║ ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ outer barrier
  185 ║            ▣  THE SHEPHERD (faces south), 12 × 12 m platform, 4 m high
  175 ║ ✦          ·                          ✦   ▤ judges' booth (Y 168)
  172 ║ ╔══════════╧══════════════════════════╗     back wall
  163 ║ ║ ░░░░░░░░░░░ SAFE ZONE ░░░░░░░░░░░░░░ ║
  160 ║ ║ ▓▓▓▓▓▓▓▓ FINISH LINE / GATE ▓▓▓▓▓▓▓▓ ║
  140 ║ ✦ │   │   │   │   │   │   │   │   │  ✦ ┃
   90 ║ ✦ │   lanes every 6 m, open ground   ✦ ┃ spectator gantry (X +44, Y 30–130)
   40 ║ ✦ │   │   │   │   │   │   │   │   │  ✦ ┃       ▪ benches (X +33.5)
    0 ║ ║ ═══════════ START LINE ════════════ ║
   −7 ║ ║   · · · · · · · · · ·  (3 rows × 10)  ║
  −12 ║ ╚═════════════════════════════════════╝  start wall (proposed −15)
  −40 ║ ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄
    roadway (X −78)  relics (X −40…−46)  X −30          0          +30   towers ✦ X ±38
```

### Front elevation (simplified, from the start zone)

```
 40 m                                                    ┌──────┐ water tower
 32 m                      ( ◉ )  The Shepherd           └──┬───┘
 22 m        ▀▀                │                    ▀▀      │
             │   /\            │                    │       │
 14 m ══╤══  │  /  \ rocket    │                    │       │
        │    │ /    \ frame    │                    │  ▭▭   │
  9 m   │  ┌─┴──────────────── finish gate ─────────┴─┐ gantry
  4 m   │  │                ┌──┴──┐                   │ │   │
  0 m ──┴──┴────────────────┴─────┴───────────────────┴─┴───┴──
      roadway  towers ±38    platform                towers  water tower
```

## 4. Zones and boundaries

| Zone | Boundary (Blender X, Y) | Rules |
|------|-------------------------|-------|
| Start zone | X −30…+30, Y −12…0 (proposed Y −15…0) | Spawns; movement locked during briefing and countdown |
| Start line | Y = 0, full width | Visual band; a low barrier arm lifts on GO (decorative, no collision) |
| Competition field | X −30…+30, Y 0…160 | Open ground, lane markings every 6 m, no cover, no obstacles |
| Finish line | Y = 160, full width | Gate structure frames it; trigger Y 160–163 (`COL_STG01_FinishTrigger`) |
| Safe zone | Y 163…172 | Qualified players wait here; immune to detection (spec D5) |
| Back wall | Y = 172 | Solid; The Shepherd's platform lies beyond it at Y 179–191 |
| Margins | X ±30…±52 | Towers, benches, gantry, relics; not reachable by players |

## 5. Player spawns

30 spawns in 3 rows of 10, facing +Y. Lateral spacing 3.0 m and row spacing 2.5 m leave at least
1.9 m between capsules (2.4 m side by side), so nobody starts touching a neighbour and the camera behind each player has
room. Spawns fill from the centre of the front row outward (spec L7), so a small standup group starts
together in the middle.

| # | X | Y | Game (x, y, z) | # | X | Y | # | X | Y |
|---|---|---|----------------|---|---|---|---|---|---|
| 01 | −1.5 | −2.0 | (−1.5, 0, 2.0) | 11 | −1.5 | −4.5 | 21 | −1.5 | −7.0 |
| 02 | +1.5 | −2.0 | (1.5, 0, 2.0) | 12 | +1.5 | −4.5 | 22 | +1.5 | −7.0 |
| 03 | −4.5 | −2.0 | (−4.5, 0, 2.0) | 13 | −4.5 | −4.5 | 23 | −4.5 | −7.0 |
| 04 | +4.5 | −2.0 | (4.5, 0, 2.0) | 14 | +4.5 | −4.5 | 24 | +4.5 | −7.0 |
| 05 | −7.5 | −2.0 | (−7.5, 0, 2.0) | 15 | −7.5 | −4.5 | 25 | −7.5 | −7.0 |
| 06 | +7.5 | −2.0 | (7.5, 0, 2.0) | 16 | +7.5 | −4.5 | 26 | +7.5 | −7.0 |
| 07 | −10.5 | −2.0 | (−10.5, 0, 2.0) | 17 | −10.5 | −4.5 | 27 | −10.5 | −7.0 |
| 08 | +10.5 | −2.0 | (10.5, 0, 2.0) | 18 | +10.5 | −4.5 | 28 | +10.5 | −7.0 |
| 09 | −13.5 | −2.0 | (−13.5, 0, 2.0) | 19 | −13.5 | −4.5 | 29 | −13.5 | −7.0 |
| 10 | +13.5 | −2.0 | (13.5, 0, 2.0) | 20 | +13.5 | −4.5 | 30 | +13.5 | −7.0 |

Rows 2 and 3 follow the same X pattern as row 1. Game z is +4.5 for row 2 and +7.0 for row 3. The
fairness cost of three rows is 5 m, a 1.25 s head start for the front row at 4 m/s. Proposal: assign
rows in a random order each round, so nobody starts at the back every time (decision E13).

## 6. The Shepherd installation

The name is decided as **The Shepherd** (decision 005). The Prompt 02 brief calls the figure "the
Watcher"; see decision E2. The pack's README asks for at least two installation options compared
before a choice is made.

| | **A. The Shepherd on its platform** (current greybox) | **B. The Lookout cage tower** | **C. Hybrid: Shepherd plus Lookout** |
|---|---|---|---|
| What | A full 28 m mechanical shepherd standing on a 4 m plinth behind the safe zone. Whole upper body turns; lantern and crook signal | A 34 m open lattice tower (echoing the reference's rocket-shaped cage climber) with a mechanical Shepherd **bust** and lantern-eye that rotate inside the top cage at 26–34 m | Option A's figure standing in front of a lower Lookout tower that carries the scan lamp and loudspeakers |
| Read from the start line (192 m) | **Best**: a body-sized silhouette (about 8° of a 60° view) and a large, obvious turn | Medium: the bust is about 6 m, so the turn relies on lights; the cage reads as a landmark | Best, but the two shapes compete for attention |
| Signal clarity | Pose (back vs face), lantern, crook raised: three channels on one shape | Lights and the rotating head; pose is less obvious | Strongest, but split between the figure and the tower |
| Fits the new mood reference | Good (giant figure in an empty yard) | **Closest** to the reference (cage tower, vertical landmark) | Good |
| Fits the decided Shepherd character | **Full character** (decision 005) | Partial (bust only) | Full |
| Modelling, rigging, animation | Large hero mesh; simple rig (torso yaw, head, lantern arm, crook) | Cheap: tower is static kit pieces; one rotating head assembly | Most work (both) |
| Performance | One 25k-triangle hero | Tower is instanced lattice pieces; the bust is light | Highest |
| Originality risk | Low if the silhouette stays a shepherd (hood, crook, lantern), never a doll | Low | Low |
| Sightline | Verified: clear from all 30 spawns (validator) | Clear by construction (taller, thin) | Needs a placement check so the tower never sits behind the head |

**Recommendation: Option A** for S1-4 and S1-5: it is already built and tested, gives the clearest
signal, and is the character the owner chose. Keep the reference's cage idea as the 16 m **rocket
frame relic** in the west margin, a landmark that also hints at The Shepherd's old playground (§12).
Option C can come later if the art pass needs more presence. **Owner decision E3.**

### Location, orientation and detection coverage (option A)

| Item | Value |
|------|-------|
| Platform | Centre X 0, Y 185; 12 × 12 m; top at Z 4 m; outside the playable area |
| Figure | 28 m tall (decision 014); head centre Z 28.1 m; top Z 32 m |
| Rest orientation | Facing −Y (toward the players) |
| GREEN | Turned away (facing +Y), lantern lowered |
| WARNING (0.8 s) | Turns to face the players; ends facing exactly when RED starts (spec §6) |
| RED | Facing −Y, lantern and crook raised, **scan sweep ±55° (110°)**, about 2 s per side-to-side sweep (proposed) |
| Presentation coverage | From the head, the whole yard lies within ±55° horizontally (start corners ±8.7°, finish corners ±50.2°) and 8°–48° below the head |
| **Server detection (authority)** | Every player inside the yard and outside the finish and safe zones is checked during RED (spec §4). Detection is **not** line-of-sight: players cannot hide behind each other or behind props, and the scan beam is presentation only. This keeps the rule fair and simple (decision E9) |
| Spotting moment | The head snaps toward the spotted player and the beam settles on them for 0.6 s (presentation) |

## 7. Environment structures and props

Nothing inside the yard has collision except the ground and walls: no cover, no obstacles (GDD
Stage 01). Everything below sits in the margins or the backdrop.

| Element | Placement (Blender) | Size | Collision | Purpose |
|---------|---------------------|------|-----------|---------|
| Inner fence | X ±30, Y −12…172; back wall Y 172 | 3 m, chain-link on posts every 4 m | Yes (existing walls) | Keeps players in; see-through so the margins stay visible |
| Start barrier arm | Y 0, posts at X ±31 | Lowered at 1.1 m before GO, raised to 2.8 m after (the walk-test greybox shows it raised) | No | Lifts on GO (start ritual) |
| Finish gate | Y 160, posts at X ±32 | 9 m tall, beam 1.2 m deep (proposed, was 7 m: E7) | No | Frames the goal; warm lights; stays below every sightline (about 15 m clearance) |
| Floodlight towers | X ±38 at Y −10, 40, 90, 140, 175 (10 towers) | 22 m mast, 4 m head (proposed, was 14 m: E6) | No | Pools of warm light down both sides; strong vertical rhythm |
| Spectator gantry | X +44, Y 30…130 | 6 m deep, deck 6 m, roof 10 m | No | Where spotted players reappear and cheer; spectator camera |
| Judges' booth | X +42, Y 168 | 10 × 8 m, deck 9 m, roof 13 m | No | Tournament presence; houses the round timer board |
| Benches | X +33.5, every 10 m from Y 10 to 150 | 4 m benches | No | Spotted players walk off and sit here (spec §7) |
| Service gates | East fence at Y 20 and Y 150 | 4 m wide | Closed, solid | Where spotted players exit the yard |
| Outer barrier | X ±52, Y −40…215 | 1.2 m concrete blocks, rusty mesh above | No (unreachable) | Closes the world |
| Playground relics | West margin X −40…−46: swing set (Y −8), slide (Y 12), spinner (Y 32), rocket frame 16 m (Y 70), see-saw (Y 110) | See layout JSON | No | Story and playfulness; the rocket frame echoes the reference's cage |
| Loudspeaker horns | On towers at Y 40 and 140 | 1 m | No | Source of the signal sounds (spatial audio) |
| Signal lamps | Small lamp boxes on every tower head | 1 m | No | Repeat the signal colour and shape along the yard (secondary channel) |
| Ground details | Puddles, oil stains, worn paint, tufts of grass at the fence | Decals | No | Damp, abandoned feel; reflections under the floodlights |
| Elevated roadway | X −78, Y −60…320, deck at 14 m on piers every 30 m | 12 m wide | No | Backdrop from the reference: isolation, height contrast |
| Water tower | X +72, Y 245 | Tank at 30–39 m | No | Distant landmark; original design (no lettering, no antlers: §13) |
| Tree lines and industrial silhouettes | North Y 230; west X −60; silhouettes per greybox spec | Cards | No | Depth layers in the haze |

## 8. Collision boundaries

| Collider | Type | Bounds (Blender) | Status |
|----------|------|------------------|--------|
| `COL_STG01_Ground` | Solid box, top at Z 0 | X ±30, Y −12…172 | Built |
| `COL_STG01_Wall_W` / `_E` | Solid, 3 m × 0.5 m | X ∓30.25, Y −12…172 | Built |
| `COL_STG01_Wall_S` | Solid | Y −12.25 (proposed −15.25, E5) | Built; moves if E5 approved |
| `COL_STG01_Wall_N` | Solid | Y 172.25 | Built |
| `COL_STG01_FinishTrigger` | Trigger, role `finish` | Y 160–163, full width, 3 m high | Built |
| `COL_STG01_SafeZone` | Trigger, role `safe` | Y 163–172 | Built |
| `COL_STG01_ServiceGate_E1` / `_E2` | Solid (part of the east wall) | Y 18–22 and 148–152 | New (visual gate in the wall line) |
| `COL_CAM_STG01_*` | **Camera-only** boxes | Fence line and tower bases | New: keep the third-person camera from passing through the fence and towers (decision E10) |

Rules: decorative meshes never get gameplay collision; the server reads only
`STG01_collision.json`; triggers never block movement; there is no reachable out-of-bounds area.

## 9. Cameras and sightlines

| Camera | Position → target (Blender) | Use |
|--------|-----------------------------|-----|
| Third-person (runtime) | 5.5 m behind and 2.2 m above the player, looking 4 m ahead; pitch −0.6…+0.35 rad | Gameplay (built) |
| `CAM_STG01_Intro_A` | (−60, −45, 22) → (0, 120, 12) | Stage intro: sweeping establishing shot (skippable; none in Standup mode) |
| `CAM_STG01_Intro_B` | (0, 150, 18) → (0, 185, 28) | Intro: push in on The Shepherd |
| `CAM_STG01_Gameplay` | (0, −7.5, 3) → (0, 185, 17) | Reference for readability checks |
| `CAM_STG01_Spectator_01` | (0, 200, 42) → (0, 80, 0) | Spectators: behind and above The Shepherd |
| `CAM_STG01_Spectator_02` | (44, 80, 12) → (0, 80, 0) | Spectators: from the gantry |
| `CAM_STG01_Finish` | (−20, 175, 6) → (0, 150, 1) | Finish arrivals and the results moment |
| `CAM_STG01_Overview` | (−130, −70, 150) → (0, 80, 0) | Review renders only |

| Sightline rule | Value | Check |
|----------------|-------|-------|
| The Shepherd's head visible from every spawn (eye 1.0 m) | Required | `validate_asset.py` ray test (passes today) |
| Clearance over the finish gate | Sightlines pass about 24 m up at Y 160; gate top 9 m | Side section diagram |
| No dressing taller than 3 m between X −30 and +30 north of the start line | Required | Validator rule to add in the greybox phase |
| The Shepherd's apparent size from the start camera | About 8° of the 60° view (about 1/7 of the screen height) | Screenshot check |
| HUD never covers the top-centre band where The Shepherd appears | Required | Done (decision 014) |
| Floodlights never shine straight into the default camera | Heads aim inward and down at 55° | Lighting pass |

## 10. Modular Blender assets

Budgets follow `BLENDER_PIPELINE.md` §9 (Stage 01 visible total ≤ 300k triangles, ≤ 150 draw
calls). "Kit" pieces are reusable in later stages.

| Asset ID | Description | Approx. size | Triangles (LOD0) | LODs | Collision |
|----------|-------------|--------------|------------------|------|-----------|
| `STG01_Ground_Yard` | Yard surface, tiled 20 × 20 m with worn-paint and damp masks | 60 × 187 m | 2k | — | Server box only |
| `STG01_Ground_Outer` | Margins and service apron | ~200 × 300 m | 2k | — | No |
| `STG01_Decal_Lanes`, `_StartBand`, `_FinishBand`, `_SpawnMark` | Painted markings (spawn marks instanced ×30) | — | 1k total | — | No |
| `PRP_KIT_FenceSection_4m`, `PRP_KIT_FencePost` | Chain-link panel and post (instanced, about 120 sections) | 4 × 3 m | 120 each | 1 | Server walls |
| `PRP_KIT_ServiceGate_4m` | Fence gate | 4 × 3 m | 400 | 1 | Part of wall |
| `PRP_KIT_ConcreteBarrier_3m` | Outer barrier block (instanced) | 3 × 0.8 × 1.2 m | 200 | 1 | No |
| `PRP_KIT_FloodlightTower_22m` | Lattice mast + head + signal lamp + horn (×10) | 22 m | 3k | 2 | No |
| `PRP_STG01_FinishGate` | Gate posts, beam, light strip, blank board | 64 × 9 m | 4k | 1 | No |
| `PRP_STG01_StartBarrier` | Posts and lifting arm (animated) | 62 m | 1k | — | No |
| `PRP_STG01_SpectatorGantry` | Steel deck, stairs, railings, roof (modular 10 m bays) | 6 × 100 m | 8k | 2 | No |
| `PRP_STG01_JudgesBooth` | Raised booth with a timer board | 10 × 8 × 13 m | 5k | 1 | No |
| `PRP_KIT_Bench_4m` | Bench (instanced ×15) | 4 m | 300 | 1 | No |
| `PRP_STG01_ShepherdPlatform` | Plinth with steps and cable runs | 12 × 12 × 4 m | 3k | 1 | No (outside yard) |
| `ENM_Shepherd` | Hero figure: body, head, lantern arm, crook; rig: torso yaw, head, arm, crook | 28 m | ≤ 25k | 2 | No |
| `PRP_STG01_SwingSet_A`, `_Slide_A`, `_RoundaboutSpinner_A`, `_SeeSaw_A` | Rusty playground relics | 1–5 m | 1–2k each | 1 | No |
| `PRP_STG01_RocketFrame_A` | 16 m rocket-shaped cage climber (landmark) | 6 × 6 × 16 m | 4k | 2 | No |
| `PRP_KIT_Loudspeaker`, `PRP_KIT_SignalLamp` | Small tower props | 1 m | 200 each | — | No |
| `STG01_BG_Overpass` | Elevated roadway sections and piers (instanced) | 30 m sections | 1.5k each | 2 | No |
| `STG01_BG_WaterTower` | Original water tower | 39 m | 3k | 2 | No |
| `STG01_BG_TreeCard_A…D`, `STG01_BG_Silhouette_*` | Tree and industrial silhouette cards | — | 50 each | — | No |
| `VFX_ScanBeam` | Cone mesh with an additive gradient | 110° | 300 | — | No |
| `VFX_GroundHaze`, `VFX_LanternGlow`, `VFX_DustMotes` | Haze cards, glow sprite, floating dust | — | Small | — | No |
| `COL_STG01_*`, `COL_CAM_STG01_*` | Collision proxies | §8 | — | — | Yes |
| `GMK_*` | Markers: 30 spawns, start, finish, Shepherd, bounds, spectator cameras, bench seats | — | — | — | — |

Estimated visible total: about 150k–200k triangles, inside the 300k budget, with fences, towers,
benches, barriers and trees instanced.

## 11. Naming and scale

The rules in `BLENDER_PIPELINE.md` §4–§5 apply (metres, Z up, applied transforms, `STG01_`, `PRP_`,
`ENM_`, `VFX_`, `COL_`, `GMK_`, `CAM_`, `LGT_`, `MAT_`). Additions proposed here (decision E11):

| Addition | Rule |
|----------|------|
| `PRP_KIT_` | Props reusable across stages (fences, barriers, towers, benches). Stage-only props keep `PRP_STG01_` |
| `COL_CAM_` | Camera-only collision, never sent to the server |
| `STG01_BG_` | Backdrop meshes beyond the outer barrier (cheaper materials, no LOD0 detail) |
| `STG01_Decal_` | Ground decals |
| Grid | Kit pieces snap to a 0.5 m grid; fence and barrier modules use 4 m and 3 m lengths |
| Pivots | Kit pieces: bottom centre. Animated parts: at the hinge (barrier arm, Shepherd torso, head, lantern arm) |
| Scale checks | Every kit file includes a 1.2 m contestant capsule in `_WORK` for scale |

## 12. Environmental storytelling and lighting

### Story the space tells (no text needed)

1. **A waystation for nomads.** The yard was once a rest stop where travellers camped between
   journeys. A long-closed elevated roadway still curves past, and an old water tower stands over the
   trees.
2. **The Shepherd was the yard's night watchman.** Built to keep the flock safe after dark, it still
   stands at the far end, lantern in hand, watching whoever crosses.
3. **A playground left behind.** Rusty swings, a slide and a tall rocket-shaped climbing frame sit in
   the margins: children once played here, which explains the giant playful mechanisms.
4. **The tournament moved in.** New floodlights, fences, a judges' booth and a spectator gantry are
   bolted onto the old site: brighter metal, warm lights and cables taped across old concrete.
5. **Fair play.** Bench rows waiting by the fence and a big timer board make it clear that being
   spotted means sitting out to cheer, not harm.

Original elements only: no lettering copied from references, no logos, no antlers on the water tower.

### Lighting composition (night, playful-eerie)

| Layer | Treatment | Purpose |
|-------|-----------|---------|
| Sky and haze | Violet-blue gradient sky; low **teal** ground haze, thicker in the margins and backdrop | Mood from the reference; layers depth |
| Moonlight (key, cool) | Low sun lamp from the north-west, soft and dim | Silhouettes the backdrop and roadway |
| Floodlights (practicals, warm) | Ten warm pools down both sides, aimed inward at 55°, overlapping so the yard has **no dark gaps** | Readable players; warm-cool contrast |
| The Shepherd | Strong cool **rim light** from behind plus its own lantern; slightly brighter than everything around it | The signal must win the eye |
| Signals | GREEN: warm white floods, lantern dim green. WARNING: lantern amber. RED: lantern red, floods dip slightly, scan beam sweeps | Colour always paired with pose, sound and HUD (GDD §5.2) |
| Finish | Warmest, brightest point of the yard (gate light strip, booth glow) | Wayfinding: the goal reads as safety |
| Ground | Damp roughness and puddle decals reflect the floods | Atmosphere at low cost |
| Fog | Starts at about 60 m, never fully hides The Shepherd (keep its rim light above the fog) | Readability over mood |

Readability rules: no part of the yard darker than the margins; contestant capsules are always lit
from at least one side; flashes obey the three-per-second limit; a reduce-flashing setting replaces
the RED flicker with a steady tint (game-ui-ux accessibility list).

## 13. Reference use and limits

| Reference | How it is used | Limits |
|-----------|----------------|--------|
| Prompt 02 playground image (cropped and full) | **Mood only**: abandoned playground, elevated roadway, distant water tower, cage-like climber, tree silhouettes, damp ground, teal and violet haze, isolation | Third-party image of unknown origin with a site watermark and partly legible lettering. Do not trace, copy its lettering or reproduce its distinctive designs (for example the antlered water tower). **Not committed to this public repository** (described and fingerprinted in `REFERENCE_MANIFEST.md`); decision E12 |
| G1 stage environment board | Night floodlit industrial yard (decision 007), palette | Doll figure retired |
| G2 asset board | Contestant style, prop language | Not a layout |

## 14. Decisions (all approved 21 November 2026, as proposed)

| ID | Decision | Proposal |
|----|----------|----------|
| E1 | How the new playground reference combines with the decided night floodlit yard (007) | **Blend**: keep the floodlit industrial yard as the play space; take the abandoned-playground story, teal and violet haze, elevated roadway, water tower and tree lines for the margins and backdrop |
| E2 | Figure name: the brief says "Watcher"; decision 005 says The Shepherd | Keep **The Shepherd** everywhere |
| E3 | Shepherd installation: A, B or C (§6) | **A**, with the rocket-frame relic as a nod to option B |
| E4 | Tone: the brief says "eerie"; decision 008 says playful | Eerie **atmosphere**, playful **outcomes** (§1) |
| E5 | Start zone depth | **15 m** (was 12 m) so the camera behind the back row stays inside the fence. Spec L2 and the south wall change |
| E6 | Floodlight towers | **22 m**, 5 per side at X ±38 (were 14 m, 5 per side at X ±36) |
| E7 | Finish gate height | **9 m** (was 7 m), still about 15 m under the lowest sightline |
| E8 | Palette | Add violet to the GDD's teal, charcoal and amber foundation (GDD §5.2 leaves the palette open) |
| E9 | Detection is not line-of-sight | Confirm: every player on the field is checked during RED; no hiding behind others |
| E10 | Camera-only collision | Add `COL_CAM_` boxes at the fence and towers |
| E11 | Naming additions | `PRP_KIT_`, `COL_CAM_`, `STG01_BG_`, `STG01_Decal_` (§11) |
| E12 | Playground reference file | Keep it out of the public repository; record it by description and fingerprint only |
| E13 | Row fairness | Randomise which players get the front row each round |
| E14 | Observation structures | Spectator gantry, judges' booth, benches and service gates as in §7 |

## 15. After approval (steps 1–3 done 21 November 2026)

1. Update `docs/STAGE_01_SPEC.md` and `stg01_greybox.json` with the approved changes (E5–E7), and
   merge the layout into the build spec. Done.
2. Extend the greybox generator with the environment blockout (primitives for every §7 element and
   §10 asset footprint), the new colliders, markers and cameras; add the "no dressing taller than 3 m
   inside the yard" validator rule.
3. Run `bash blender/scripts/run_stage.sh STG01`; review renders from every camera; rerun the browser
   walk test and screenshots.
4. Then the art pass (S1-6) and The Shepherd concept and turnaround (S1-5).
