# Shared contestant: implementation, validation and performance report

Owner pack: CN TRIAL Shared Contestant Character System (22 Nov 2026), copied unchanged to
`references/SHARED_CONTESTANT/` (reference image SHA-256 `857147ab…dcec6b23`). Decision 030.
Branch `claude/shared-contestant`. Character specification: `docs/stage15/CONTESTANT_CHARACTER_SPEC.md`.

## 1. What changed

| Before (decision 029) | Now (decision 030) |
|---|---|
| 30 different characters built in code (`apps/web/src/game/characters.ts`): 30 geometries, about 1,300 triangles each | ONE master character from Blender: one geometry set (LOD0 22,414 / LOD1 8,482 / LOD2 3,554 triangles), one skeleton (29 bones), 16 animation clips, one texture set |
| A GPU limb swing and a topple | A full animation state machine: idle, walk, run, start, stop, stumble, eliminated, victory, recover, plus jump and dive lobby emotes |
| Server deals `character` CHR_01–30 (protocol v5) | Server deals `colorway` CW01–30 (protocol v6), unique in the room, and kept when the same browser rejoins |

### Audit: where the old characters were referenced

All of these now use the shared system:
- `packages/shared/src/roster.ts` (`dealCharacter`, the roster);
- `packages/shared/src/protocol.ts` and `client.ts` (`character`);
- `apps/server/src/room.ts` (dealing at join);
- `apps/web/src/game/Scene.tsx` (contestant meshes and animation);
- `apps/web/src/game/characters.ts` (geometry);
- `apps/web/src/ui/GameHud.tsx` (lobby chip and slot colours) and `Menu.tsx` (how to play);
- tests `tests/load/thirty-clients.mjs`, `tests/e2e/thirty.mjs`, `tests/e2e/ui.mjs`, `tests/e2e/lineup.mjs`, `packages/shared/test/roster.test.ts`.

### Old assets are kept

The old procedural characters are not deleted (pack rule: "do not delete old assets until the new system is
integrated, tested and confirmed"). `characters.ts` and `roster.ts` stay, and `?characters=legacy` draws them
(used for the same-build performance comparison and as a rollback). They will be removed once you confirm the
new system.

## 2. Deliverables

| # | Deliverable | Where |
|---|---|---|
| 1 | `CNTRIAL_CONTESTANT_MASTER.blend` | `blender/scenes/` (CNT_CHARACTER: 3 LOD meshes; CNT_RIG: armature + 16 actions/NLA; CNT_SOURCE: every garment part as a named object) |
| 2 | `CNTRIAL_CONTESTANT_MASTER.glb` (2.4 MB) and runtime `.meshopt.glb` (0.76 MB) | `blender/exports/contestant/` |
| 3 | Shared textures and material documentation | `CNT_Detail.webp` (119 KB), `CNT_Normal.webp` (42 KB); spec §4; manifest `textures` |
| 4 | 30-colourway data file | `packages/shared/src/contestant-colorways.json` (+ `contestantColorways.ts`) |
| 5 | Shared rig and clips | in the GLB and the .blend (29 joints, 16 clips) |
| 6 | LOD0 / LOD1 / LOD2 | in the GLB, same UVs, regions and skeleton |
| 7 | Build scripts | `blender/scripts/contestant_geometry.py`, `contestant_textures.py`, `contestant_build.py`, `contestant_export.py`, `contestant_render.py`, `validate_contestant.py`; `tools/stage15/glb/derive_contestant.mjs` |
| 8 | Browser integration | `apps/web/src/game/contestant.ts`, `Scene.tsx`, `input.ts`, `GameHud.tsx`, `Menu.tsx`; server `apps/server/src/room.ts`; protocol v6 |
| 9 | Manifest | `blender/exports/contestant/CNTRIAL_CONTESTANT_MANIFEST.json` |
| 10 | Turnaround renders (front, 3/4 front, side, 3/4 back, back) | `docs/stage15/screenshots/contestant/turnaround_*.png` |
| 11 | Coat close-ups (hood/collar, chest opening, sleeve/cuff, belt/buckle, pocket, hem/back vent, fabric, emblem) | `docs/stage15/screenshots/contestant/closeup_*.png` |
| 12 | Animation preview sheet | `docs/stage15/screenshots/contestant/animation_sheet.png` |
| 13 | Performance comparison | §4 below; raw: `tests/reports/contestant-perf-*.json` |
| 14 | Validation report | §3 below; `validate_contestant.py` output |
| + | 30-colourway lineup on one shared mesh; LOD comparison; in-game 30-player views | `lineup_30_colorways.png`, `lods_0_1_2.png`, `ingame_*.png` |

## 3. Validation (measured)

| Test | Result |
|---|---|
| `validate_contestant.py` (in CI). Checks: one armature, 3 LODs, triangle budgets, one material, regions, UVs inside the atlas, weights only to rig bones, emblem a separate part, coat parts modelled separately, 16 clips, coat secondary-motion bones, both GLBs (3 skinned meshes, one joint set, attributes, no embedded images), one shared texture set, 30 colourways, runtime GLB under 1.2 MB | **PASS** (all checks) |
| Unit tests (59): `colorways.test.ts` | 30 records with stable ids and valid colours; trim and accent contrast against the coat; 30 players always get 30 different colourways and a 31st gets none; a returning player keeps theirs when free; player keys sanitised |
| `test:colorways` (real Worker) | **PASS**: 30 clients get 30 distinct colourways; 5 players leave and rejoin with the same key and each gets the same colourway back; a keyless rejoin stays unique; an emote reaches other players, is rate-limited and moves nobody (0 m) |
| `test:thirty` (5 real browsers + 25 simulated clients, obstacle round) | see `tests/reports/thirty-players.json`: 30 distinct colourways, contestants drawn from 3 shared geometries and 2 shared textures, the same results on every page |
| `test:load` with 30 clients | 30 distinct colourways |
| Regression: `test:e2e`, `test:ui`, `test:quality`, `test:obstacles`, `test:round` | see §5 |
| Foot planting | Natural speeds measured from the rig: Walk 0.587 m/s, Run 1.831 m/s. The game scales playback to ground speed (4 m/s = ×2.19, inside the ×2.4 clamp), so the feet do not slide at normal speeds. |
| Coat clipping | Checked visually in the animation sheet (run, jump, dive, fall, push/pull, victory). The coat tails follow the thighs. Small hem intersections with the knees can show at the extreme of the run stride, hidden at gameplay distance. |

### Not verified here (needs your hardware)

- **Real GPU frame times.** This machine has no GPU; frame rates come from software rendering and only compare runs on the same machine.
- **A playtest with 30 humans.** The 30-player tests use 5 browsers and 25 simulated network clients.

## 4. Performance: before and after (same machine, scene, camera and method)

Method: `tests/e2e/contestant-perf.mjs`.
- One browser at High, 1280×720, with a fixed camera over the spawn grid.
- The scene is measured with 1 player, then with 30 (29 simulated clients join). The difference is the cost of 29 contestants.
- "Legacy" is the old system in the same build (`?characters=legacy`). The main-branch baseline (`contestant-perf-before.json`) gives the same numbers within noise.

| Metric (cost of 29 contestants unless noted) | Old: 30 procedural characters | New: shared master character | Change |
|---|---|---|---|
| Unique geometries for 30 contestants | 30 | **3** (the shared LODs) | −90 % |
| Geometry memory for 30 contestants | 6.09 MB | **1.16 MB** | **−81 %** |
| Texture payload per player | none | **none** (2 shared maps for everyone, 161 KB download) | per-player 0 |
| Shader programs added | 0 | 1 (shared by all 30) | +1 |
| Draw calls added | 52 | 56 | +4 (+8 %) |
| Triangles drawn, added | 67,606 | 257,308 | ×3.8 (a far more detailed character; LOD budget) |
| Skeletons | none | 30 (one per player, shared by its 3 LODs) | new |
| Animation CPU, all 30 players | ~0 (GPU swing only) | **0.17 ms per frame** | +0.17 ms |
| Character download | 0 (code) | 0.76 MB GLB + 0.16 MB textures = **0.92 MB**, once, cached | +0.92 MB |
| Time from 29 joins to all 30 drawn | 5.9 s | 6.1 s | about the same |
| Software frame rate, 30 players (SwiftShader, CPU) | 0.84 fps | 0.82 fps | within noise |
| JS heap, 30 vs 1 player | +0.2 MB | +10.2 MB | +10 MB (30 mixers, cloned bones) |

What improved:
- geometry memory is down 81%;
- one geometry set instead of 30;
- no per-player textures;
- one shader program for everyone.

What costs more, and why: a much more detailed character draws more triangles. LOD budgets keep that bounded:
- **High:** 2 at LOD0, 8 at LOD1, the rest at LOD2, and every shadow from LOD2.
- **Medium:** 2 at LOD0 (within 5 m), 8 at LOD1. **Low:** no LOD0, 5 at LOD1.
- The automatic quality fallback still lowers the tier on slow machines.

On a real GPU the added 257k skinned triangles are well within budget for High. That claim is not measured
here, because this machine has no GPU.

## 5. Regression results

Filled in from the final run before the pull request (see the PR description for the exact list).
