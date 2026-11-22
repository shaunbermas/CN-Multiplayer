# Acceptance checklist: shared contestant system (owner pack, 22 Nov 2026)

The pack's `04_VALIDATION/ACCEPTANCE_CHECKLIST.md`, filled in with evidence. "[x]" means executed with
evidence; anything not executed is marked and explained.

## Design / modelling
- [x] **Reference included and reviewed.** `references/SHARED_CONTESTANT/01_REFERENCE/` (unchanged, SHA-256 recorded); interpretation in the spec §1.
- [x] **Keeps the reference's key features.** Hooded silhouette, dark face opening, white geometric emblem, gloves, chunky boots and a long coat: turnaround renders.
- [x] **Coat fully modelled.**
  - Layered panels, raised two-sided collar, peaked lapels, back yoke, storm flap, epaulettes.
  - Seams and topstitching (texture), cuffs, belt with buckle and keepers, pockets with flaps.
  - Hem thickness, back vent, modelled folds.
  - Evidence: close-up renders, spec §3.
- [x] **Coat reads at gameplay distance.** In-game screenshots with 30 players: yoke accent line, cuffs, belt hardware, coat value.
- [x] **Turnaround renders supplied.** Front, 3/4 front, side, 3/4 back and back: `docs/stage15/screenshots/contestant/turnaround_*.png`.
- [x] **No third-party logo or exact character reproduction.** Original emblem geometry (not the circle / triangle / square set); no franchise marks.

## Shared asset architecture
- [x] **One canonical geometry set.** Validator; in game, 30 players use 3 shared geometries (`__cn.contestants().uniqueGeometries`).
- [x] **One shared skeleton and animation library.** 29 joints, 16 clips; one joint set across every skin (validator).
- [x] **30 colourway records.** `contestant-colorways.json`; unit test.
- [x] **No duplicated texture sets.** Exactly 2 shared maps (validator; in game, `uniqueTextures` = 2).
- [x] **All 30 players use shared cached assets.** The GLB and textures load once; per player only bones, a mixer and colour uniforms.
- [x] **Colourway stable through reconnects.** `test:colorways`: 5 of 5 rejoins kept their colourway.

## Movement
- [x] **Clips exist.** Idle, walk, run, start/stop, jump (start/air/land), dive, push/pull, stumble, fall, recover, eliminated, victory: animation sheet.
- [x] **Bouncy, playful run and walk.** Original procedural keys: run lean, bounce, squash on contact, coat flare.
- [x] **Foot sliding controlled.** Playback matched to ground speed using natural speeds measured from the rig (0.587 / 1.831 m/s).
- [x] **No severe coat clipping.** Visual check of the animation sheet. Small knee-to-hem contact can show at the run's extreme stride and is hidden at gameplay distance.
- [x] **Animation never changes the server position.** `test:colorways`: an emote moves the player 0 m; dive and hop move only the model.

## Web / performance
- [x] **LOD0 / LOD1 / LOD2 implemented.** Budgeted per frame; shadows from LOD2.
- [x] **GLB loads in the existing browser game.** `test:thirty`, `test:ui`.
- [x] **30 contestants displayed at once.** `test:thirty`, `contestant-perf-after.json`.
- [x] **30 colourways distinguishable in Stage 01 lighting and fog.** In-game screenshots.
- [x] **Measured before and after.** Download size, geometry memory, textures, draw calls, triangles, load time and frame time: report §4. Frame rates are software rendering only.
- [x] **Multiplayer still works.** Movement, collisions, elimination and reconnect: regression list in the report §5 and the PR.
- [x] **No test marked passed without execution evidence.** Real-GPU timing and a 30-human playtest are marked NOT VERIFIED.

## Deliverables
- [x] `.blend` source file
- [x] `.glb` browser asset (+ meshopt runtime copy)
- [x] Shared textures and material documentation
- [x] Colourway data file
- [x] Animation clips and manifest
- [x] Blender scripts
- [x] Browser integration changes
- [x] Turnaround and coat-detail renders
- [x] Animation preview
- [x] Performance comparison and validation report
