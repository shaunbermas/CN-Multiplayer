# CN Trials · Stage 01 collision and gameplay integration (Prompt 04)

Status: **ready for owner review** (21 November 2026). All 14 automated checks pass. Four points need
the owner's approval (§8, decision 021).

| Deliverable | File |
|-------------|------|
| Collision-ready scene | `blender/scenes/STAGE_01_COLLISION_READY.blend` (Git LFS) |
| Setup script | `blender/scripts/stage_01_collision_setup.py` |
| Metadata | `blender/exports/STAGE_01_METADATA.json` |
| Validator and its report | `blender/scripts/validate_stage_01_metadata.py` → `blender/exports/STAGE_01_METADATA_VALIDATION.json` |
| Schema used (patched pack schema, §8.1) | `blender/schemas/STAGE_01_METADATA.schema.json` (original kept as `STAGE_01_METADATA.pack-original.schema.json`) |
| Screenshots | `renders/STAGE_01_COLLISION_TOP.png`, `_SIDE.png`, `_PERSPECTIVE.png` (script: `blender/scripts/stage_01_collision_screens.py`) |

Rebuild everything: `python blender/scripts/stage_01_collision_setup.py --screenshots` (about 40 s on
CPU), or `bash blender/scripts/run_stage.sh STG01`. CI re-validates the committed scene against the
metadata and rebuilds the metadata from the greybox on every pull request.

## 1. Dependencies

| Required input | Found | Used for |
|----------------|-------|----------|
| Approved design spec | `docs/STAGE_01_DESIGN_SPEC.md` (decision 017) | Gantry, benches, signal lamps, loudspeakers, Shepherd coverage ±55°, E9, E10 |
| Approved greybox | `blender/scenes/STAGE_01_GREYBOX.blend` (decision 019) | Every position and size (opened, never rebuilt or edited) |
| Prompt 03 coordinate report | `docs/STAGE_01_GREYBOX_REPORT.md` (the pack expects `STAGE_01_GREYBOX_VALIDATION.md`; ours has this name) | Coordinates reconciled: check `runtime_consistency` compares 60 objects with the greybox exports |
| Numbers and rules | `docs/STAGE_01_SPEC.md` v0.2, `blender/scripts/specs/stg01_greybox.json` | Spawn grid, capsule, start zone, finish and safe volumes |

## 2. Coordinates and units (confirmed from `docs/BLENDER_PIPELINE.md` §4)

- Metres, metric, unit scale 1.0. Blender **Z up**; the course runs toward **+Y**.
- Origin: centre of the start line on the ground (X 0, Y 0, Z 0). Start line Y 0, finish line Y 160.
- Metadata positions are world-space object origins. Box volumes (collision, triggers, boundaries)
  have their origin at the **bottom centre**, the same convention as the greybox collision boxes.
- Rotations: Euler XYZ in **degrees**. Only yaw is used. A marker's forward direction is its local −Y.
- The game runtime (glTF, server, client) is Y up: game = (x, z, −y).

## 3. What was created

Gameplay objects live in their own collections; decoration lives in `VISUAL_*` and `LIGHTING`.

| Collection | Objects | Notes |
|------------|---------|-------|
| `PLAYER_SPAWNS` | `SPAWN_PLAYER_01`–`30` + `SPAWN_PLAYER_xx_CAPSULE` | Greybox `GMK_SPAWN_xx`, renamed. 10 × 3 grid, X −13.5…13.5 every 3 m, rows Y −2, −4.5, −7; all face +Y. Capsules are r 0.3 × 1.2 m review references |
| `GAMEPLAY_TRIGGERS` | `TRIGGER_START_LINE`, `TRIGGER_FINISH_LINE`, `TRIGGER_SAFE_ZONE` | Start = the approved start zone Y −15…0 (new); finish Y 160…163; safe Y 163…172; all 60 m wide, 3 m high |
| `GAMEPLAY_BOUNDARIES` | `BOUNDARY_LEFT`, `_RIGHT`, `_BACK`, `_FINISH`, `BOUNDARY_PLAYABLE_AREA` | The four 3 m fence walls (solid) plus the yard volume X −30…30, Y −15…172 (not a collider; outside = out of bounds) |
| `GAMEPLAY_COLLISION` | 77 box proxies | `COLLISION_GROUND_MAIN` (yard floor), `COLLISION_GROUND_OUTER` (margins), three camera-only fence colliders (E10), and one box per physical structure (§5) |
| `GAMEPLAY_MARKERS` | `START_LINE_ANCHOR`, `FINISH_LINE_ANCHOR`, `COURSE_CENTRE_ANCHOR` | Course reference points; the course centre is the spectators' view target |
| `WATCHER_REFERENCE` | `WATCHER_ROOT_ANCHOR`, `WATCHER_HEAD_ANCHOR`, `WATCHER_DETECTION_REFERENCE` | Root on the platform top (0, 185, 4) facing the players; head centre Z 28.08; ±55° sector, reach 203 m (§6) |
| `SPECTATOR_LOCATIONS` | `SPECTATOR_01`, `SPECTATOR_BENCH_01`–`15`, `SPECTATOR_GANTRY_01`–`05` | High viewpoint behind The Shepherd; bench seats at X 33.5 (where spotted and waiting players sit); gantry deck spots at X 44, Z 6. All outside the fence, facing the course |
| `SIGNAL_ANCHORS` | `SIGNAL_GREEN_ANCHOR`, `SIGNAL_RED_ANCHOR`, `SIGNAL_SCAN_BEAM_ANCHOR`, `SIGNAL_LAMP_01`–`10`, `SIGNAL_AUDIO_03/04/07/08` | Red and green attach at the lantern (§8.4); scan beam at the face; tower lamps and loudspeakers repeat every state |
| `VISUAL_ARCHITECTURE`, `VISUAL_PROPS`, `VISUAL_WATCHER`, `LIGHTING`, `CAMERAS`, `REFERENCE` | Greybox decoration, unchanged | The greybox's `00_`–`08_` collections were regrouped into these |

Every ID equals its Blender object name, is uppercase snake case and is stable. Renamed objects carry
their greybox ID in a `legacy_id` property and in the metadata notes.

## 4. Metadata (`STAGE_01_METADATA.json`)

| Section | Entries |
|---------|---------|
| `spawnPoints` | 30 |
| `triggerZones` | 3 (start, finish, safe zone as finish) |
| `movementBoundaries` | 5 |
| `watcherDetectionReference` | sector, anchor `WATCHER_ROOT_ANCHOR` |
| `collisionObjects` | 81 (77 in `GAMEPLAY_COLLISION` + the 4 boundary walls) |
| `spectatorLocations` | 21 |
| `signalAnchors` | 17 (2 green/red, 1 red scan beam, 14 shared) |
| `sceneObjects` | 405 (every object in the scene, with collection and role) |

The file is generated from the scene, never typed by hand; the validator fails if the committed file
differs from what the scene produces.

## 5. Collision coverage

- **Contestants** meet only `COLLISION_GROUND_MAIN` and the four `BOUNDARY_` walls; the yard has no
  obstacles (decision 019, G4). These match the colliders the server uses today exactly.
- **Physical structures outside the yard** each get one box fitted to the visual mesh bounds, so
  walk-offs, spectators and the camera can use them: 15 benches, 10 floodlight masts, finish gate
  (2 posts, beam), start barrier (2 posts, arm), judges' booth (cabin, 4 legs, timer board), spectator
  gantry (deck, roof, rail, 22 legs), Shepherd platform, outer concrete barriers (4), playground relics (5)
  and the outer ground. All static except the start barrier arm (moving; raised to 6 m during play,
  never blocks players).
- **Covered by an existing gameplay object:** yard ground (`COLLISION_GROUND_MAIN`), the four fences
  (`BOUNDARY_` walls), the two service gates (in the east fence line, closed; `BOUNDARY_RIGHT`).
- **Intentionally not colliding (decoration):** lane lines and start/finish bands, the finish gate light
  strip, floodlight heads, signal lamps and loudspeakers (on 22 m masts), The Shepherd figure (animated,
  behind the back wall), background trees, silhouettes and overpass (beyond the outer barrier), lights.
  Counts: 12 in `VISUAL_ARCHITECTURE`, 70 in `VISUAL_PROPS`, 5 in `VISUAL_WATCHER`, 24 in `LIGHTING`.
- Triggers are never exported as solid colliders; collision and trigger meshes carry no render
  materials and show as wireframes in the viewport.

## 6. The Shepherd's detection reference

`WATCHER_DETECTION_REFERENCE` is a flat ±55° sector from the Shepherd's position facing −Y, reaching
203 m so it covers the yard from the start wall to the finish line (finish corners at ±50.2°, as in the
design spec). It is a **presentation reference only**. The authoritative rule (decision E9, spec §4) is
that the server checks every active player in the yard outside the finish and safe volumes during RED;
it is not line-of-sight. No detection, timing or elimination logic is in Blender: the `.blend` has no
scripts, drivers or animation, and no rule-like properties (check `no_game_logic`).

## 7. Validation results (`STAGE_01_METADATA_VALIDATION.json`)

| Check | Result | Evidence |
|-------|--------|----------|
| `schema` | PASS | Validates against `blender/schemas/STAGE_01_METADATA.schema.json` (JSON Schema 2020-12); an unknown field is still rejected |
| `ids_resolve` | PASS | 158 entries and 103 references resolve; 405 scene objects listed once each with the right collection |
| `transforms_match` | PASS | Position (±1 mm), rotation (±0.01°) and dimensions (±1 mm) of all 158 entries equal the scene |
| `spawns` | PASS | 30 unique, on the approved grid, on the ground, facing +Y, capsules fully inside the start trigger; closest centres 2.5 m, clear gap 1.9 m |
| `triggers` | PASS | Start (Y −15…0) and finish (Y 160…163) as in spec L2 and L4; triggers sit only in `GAMEPLAY_TRIGGERS` |
| `boundaries` | PASS | The four walls meet the playable area edges (60 m × 187 m) and are taller than a contestant |
| `collision_separation` | PASS | No gameplay object in a visual collection; every physical visual covered; every proxy contains its visual |
| `watcher_reference` | PASS | Root on the platform top, facing −Y, ±55°, sector covers every yard corner up to the finish line |
| `spectators` | PASS | 21 locations, all outside the yard and triggers, facing the course |
| `signal_anchors` | PASS | Red and green present; every anchor has a source visual |
| `runtime_consistency` | PASS | 60 objects match `STG01_collision.json` and `STG01_markers.json`, the files the server and client load |
| `conventions` | PASS | Metric, scale 1.0, no negative or unapplied scale, yaw only, no parenting, uppercase IDs |
| `no_game_logic` | PASS | 0 text blocks, no drivers or animation, no rule properties |
| `metadata_up_to_date` | PASS | The committed metadata equals a fresh export from the committed `.blend` |

Negative tests: moving one spawn 0.5 m and renaming one signal anchor in a copy of the metadata made
`ids_resolve`, `transforms_match`, `spawns`, `signal_anchors` and `metadata_up_to_date` fail as expected.
A unit test (`packages/shared/test/stage-metadata.test.ts`) also checks the metadata against the stage
geometry the server builds.

Screenshots (gameplay layers as coloured wireframes over grey decoration: blue solid collision, purple
camera-only, orange boundaries, green start, yellow finish, cyan safe zone, white spawn capsules, red
Shepherd sector, magenta spectators, lime signal anchors, pale yellow course markers):

| Top | Side (from the west, past the tree line) | Perspective |
|-----|-------------------------------------------|-------------|
| `renders/STAGE_01_COLLISION_TOP.png` | `renders/STAGE_01_COLLISION_SIDE.png` | `renders/STAGE_01_COLLISION_PERSPECTIVE.png` |

## 8. Limitations and points for approval (decision 021, PROPOSED)

1. **Pack schema fix.** The pack's schema sets `additionalProperties: false` on the shared transform
   definition, which every extended entry inherits, so no trigger, collider, spectator or signal entry
   can ever validate (the pack template passes only because its arrays are empty; our metadata gets
   127 errors from it, all of this kind). The patched schema moves the strictness to each array item
   (`unevaluatedProperties: false`); every required field, type and enum is unchanged.
2. **Start trigger = the approved start zone** (Y −15…0). The spec has a start zone but no separate
   start trigger; leaving the volume through Y = 0 is crossing the start line.
3. **Safe zone is listed as a `finish` trigger**, because the schema allows only `start` and `finish`.
   It already counts as finished on the server (spec D5).
4. **Red and green anchors share the lantern centre**, because one lantern shows every signal colour
   (design spec §6). They are separate objects so the runtime can attach each state's visual.
5. **The runtime still loads the greybox exports** (`STG01_collision.json`, `STG01_markers.json`). They
   are proven identical to this metadata (Python check and unit test). Switching the server and client
   to read `STAGE_01_METADATA.json` directly is a later step, not part of Prompt 04.
6. Not covered here, as the pack asks: signal timing, movement detection, elimination, qualification,
   spectator networking (all server side). Physics engine choice stays as decision 012 (kinematic
   movement, Rapier deferred).
