# CN TRIAL · 03 Character Bible

Audit date 24 Nov 2026, `main` @ `7ccb1ba`. Labels: see 01. Covers the shared contestant and The Watcher. Both are
**approved designs**. Nothing here is a redesign; recommendations are marked PROPOSED.

---

## Part 1. The shared contestant (`CNTRIAL_CONTESTANT_MASTER`)

### 1.1 Approved direction (do not change without a decision)

- **ONE shared, detailed master contestant** with 30 colour/material variants (colourways). Same geometry, UVs,
  skeleton, clips and textures for every player; only colour parameters differ. (Decision 030, owner pack
  `references/SHARED_CONTESTANT/`.)
- **The coat is the signature feature** and gets the most modelling, material and texture effort (030;
  spec `docs/stage15/CONTESTANT_CHARACTER_SPEC.md` §3).
- Colourways dealt at random by the server, never duplicated in a room, kept on reconnect from the same browser
  (029 rules kept by 030; protocol v6).
- **Retired:** 30 individually designed contestants (029 (1)); the procedural code characters (removed by 031 (1));
  the six locked roster boards in `references/STAGE_1_5/FINAL_CHARACTER_BIBLE_LOCKED/` (preserved, not used).
- Movement feel: the owner brief (24 Nov 2026) names a **Fall Guys-inspired** direction (running, walking,
  jumping, falling, recovery). NOT DOCUMENTED in `docs/DECISIONS.md`; see 01 §9 C1.

### 1.2 Design summary (from the spec, VERIFIED against the manifest)

| Feature | Value |
|---|---|
| Silhouette | Oversized rounded hood; recessed dark glossy faceplate with no facial features; white geometric emblem (rounded diamond with inner chevron, separate mesh `CNT_Emblem`); short body; long coat; gloves; chunky boots |
| Height | 1.235 m mesh; gameplay capsule 1.2 m × 0.3 m (mesh never affects collision) |
| Hood : body | About 1 : 1.3 |
| Coat | Two-panel shell, V-opening above the belt, A-line below; peaked lapels; raised two-sided collar; back yoke with identifier-accent piping (identification from behind); storm flap; epaulettes; cuffed sleeves with accent ring and upper-arm patch; belt with modelled buckle, prong, eyelets, keepers; two flapped pockets; back vent; modelled folds; 11 mm hem with piping and topstitching. About 45 % of LOD0 triangles |
| Proportion table | `CONTESTANT_CHARACTER_SPEC.md` §2 (metres, all joints) |

### 1.3 Materials and colourways

| Item | Value | File |
|---|---|---|
| Material | ONE shared material for the whole character; region id in vertex colour R (id / 15), baked AO in G | `blender/exports/contestant/CNTRIAL_CONTESTANT_MANIFEST.json` |
| Regions | 0 coat base, 1 coat secondary, 2 trim, 3 belt accent, 4 identifier accent (gently emissive) from the colourway; 5 faceplate, 6 emblem (emissive), 7 leather, 8 inner, 9 sole, 10 lining fixed | Manifest `regions`, `fixed_region_colours` |
| Textures | `CNT_Detail` (cavity + wear, roughness, stitch mask) and `CNT_Normal` (twill, seams, stitches), 1024 px each, one atlas for all LODs; WebP 119 KB + 42 KB | `blender/exports/contestant/` |
| Colourways | 30 records CW01 (Obsidian, the reference look) … CW30, copied from the pack CSV | `packages/shared/src/contestant-colorways.json` |
| Night lift | Coat base and secondary × 1.55 in Stage 01 (031 (1) kept it) | `contestant.ts` `NIGHT_LIFT` |
| Contrast rule | Trim luminance ratio > 2.5 and accent > 4.5 against the coat, unit-tested | `packages/shared/test/colorways.test.ts` (passed in this audit) |

### 1.4 Rig

29 bones, `CNT_` prefix: Root, Hips, Spine, Chest, Neck, Head, HoodTip; per side Shoulder, UpperArm, Forearm, Hand,
Thigh, Shin, Foot; coat chains per side CoatFront, CoatFront2, CoatBack, CoatBack2. Weights procedural, up to 4
influences. Secondary motion (coat tails lag and flare, hood tip lag) is keyed in the clips, not simulated.

### 1.5 LODs and in-game budget

| LOD | Triangles | Game rule (`contestant.ts` `LOD_BUDGET`) |
|---|---|---|
| LOD0 | 22,414 | At most 2 nearest within 6 m (High) / 5 m (Medium); never on Low |
| LOD1 | 8,482 | Next 8 within 16 m (High) / 14 m (Medium); 5 within 10 m (Low) |
| LOD2 | 3,554 | Everyone else; every contestant's shadow (shadow-only layer) |

Note: `docs/BLENDER_PIPELINE.md` §9 proposed ≤ 4,000 triangles for a contestant. That budget predates 030 and was
PROPOSED; the shared contestant exceeds it at LOD0/LOD1 and relies on the per-frame LOD budget instead.
Worst case visible contestant triangles: 2 × 22,414 + 8 × 8,482 + 20 × 3,554 ≈ 184k, plus 30 × 3,554 ≈ 107k in the
shadow pass (computed from the manifest and budget table). PROPOSED: re-baseline §9 budgets to these numbers.

### 1.6 Animation library (16 clips, 24 fps, original keys)

| Clip | Used in game for | Status |
|---|---|---|
| Idle | Standing | In use |
| Walk / Run | Locomotion; playback matched to ground speed (natural speeds 0.587 / 1.831 m/s; 4 m/s plays Run at ×2.19, clamp ×2.4) | In use |
| Start / Stop | Push-off; skid to a stop | In use |
| Stumble | Hard stop on green (obstacle or player) | In use |
| Fall / Recover | Knockdown and getting up; Recover after a dive or a new round | In use |
| Eliminated | Spotted: comic hop and flop, greys out | In use |
| Victory | Finished | In use |
| JumpStart / JumpAir / JumpLand, Dive | Lobby emotes only (visual; server never moves the player) | In use as emotes (030 (b), 031 (1)) |
| Push / Pull | Reserved for Tug of War | Unused until Stage 02 (030 (c)) |

GDD §4.3 animations **NOT YET IMPLEMENTED**: Sprint, Crouch/sneak, Interact, Panic/look back, Spectator idle
(none needed by Stage 01).

Fall Guys-inspired gameplay verbs (real jump, dive, grab, sprint) are **not in Stage 01 gameplay** by the
approved spec; the clips are ready for stages that enable them.

### 1.7 Runtime integration (VERIFIED in code)

`apps/web/src/game/contestant.ts`, `Scene.tsx`:
- GLB and two textures load once (meshopt runtime copy 764 KB); each player gets a `SkeletonUtils` clone (bones
  only), one shared shader program with per-player colour uniforms, its own `AnimationMixer`.
- Animation state machine driven by the player's movement and status; 360° facing from movement (031 (2)), turn
  about 0.2 s.
- Name tags; spotted players grey out.

### 1.8 Validation status

| Check | Evidence | Status |
|---|---|---|
| Blender asset validation (one armature, 3 LODs, budgets, one material, regions, UVs, weights, 16 clips, GLBs, 30 colourways) | `blender/scripts/validate_contestant.py` in CI `test` job; passed on PR #22 (Checks run 37) | VERIFIED via CI history |
| Colourway uniqueness and reconnect | `test:colorways`; see 08 for this audit's run | See 08 §1 |
| Turnaround, coat close-ups, 30-colourway lineup, LOD comparison, animation sheet | `docs/stage15/screenshots/contestant/` | Present |
| Coat readability at gameplay distance at night on a real GPU | Only software-rendered captures exist | NEEDS VERIFICATION (02 §6 V2) |
| Match to the reference's proportions (hood width, chunkiness) | Visual comparison | NEEDS VERIFICATION (02 §6 V1) |
| Real-GPU frame time with 30 animated contestants | Not measured (K2, K12) | NEEDS VERIFICATION |

---

## Part 2. THE WATCHER (Stage 01 enemy)

### 2.1 Approved identity (do not change)

Original 28 m antique wind-up robotic doll, playful-eerie (decisions 023, 024; height 014). Full-body robot:
porcelain face plate with seams and cracks, swept-back lacquered hair with a brass-banded bun, **one recessed
camera-lens eye** (the other sealed, reading as a slight wink), deep-teal enamel coat with high charcoal collar,
eight brass buttons and sash, steel waist turret (upper body turns), brass wind-up key in the back, porcelain limbs
with steel ball joints, three-fingered hands, riveted iron boots. **Retired:** The Shepherd, the Squid-Game-like
doll from the Prompt 06 pack and the concept boards.

### 2.2 Technical summary (VERIFIED: manifest, spec, CI history)

| Item | Value |
|---|---|
| Source | `blender/scenes/THE_WATCHER.blend` (568 KB, LFS); scripts `watcher_build.py`, `watcher_textures.py`, `watcher_export.py`, `watcher_render.py`, `validate_watcher.py` |
| Export | `blender/exports/THE_WATCHER.glb` 2.28 MB (locked original); runtime `blender/exports/stage15/THE_WATCHER.meshopt.glb` 1.35 MB |
| Geometry | One skinned mesh `Watcher_Body`, 12,662 triangles (budget 25,000); LOD1 6,314; rigid weights (every vertex 1.0 to one bone) |
| Rig | 33 bones, `Watcher_` prefix (hierarchy in `THE_WATCHER_SPEC.md` §5) |
| Clips (9) | Idle, TurnAway, GreenSignal, TurnToField, FocusLock, RedSignal, ScanSweep, Detect, ReturnNeutral (all `Watcher_`); lens switches stepped |
| Materials | 12 (Porcelain, EnamelTeal, Brass, SteelDark, Rubber, Textile, HairLacquer, LensGlass, Seam, Lens Neutral/Red/Green); 21 textures, original procedural |
| Anchors | Root, Facing, OpticalOrigin (lens, Y 23.6 m), DetectionForward, AudioOrigin, InteractionBounds |
| Placement | Free-standing on the approved 4 m plinth at Y 185 (`WATCHER_ROOT_ANCHOR`) |

### 2.3 Runtime behaviour

- `apps/web/src/stages/stage01/watcherAnimation.ts` maps server phase/signal to clips (table in the file header):
  lobby Idle → green TurnAway then GreenSignal → warning TurnToField (sped to end as red starts) → red FocusLock then
  RedSignal/ScanSweep alternating → Detect on a server spot → results ReturnNeutral. Cosmetic only. Unit-tested
  (`apps/web/test/watcherAnimation.test.ts`, 8 tests, passed in this audit).
- `WatcherFX.tsx`: lens emissive, red eye glare and light, red searchlight on red, detection beam and ring from the
  optical anchor to the spotted player (029 (2), P06).
- Signal anchors in `STAGE_01_METADATA.json` were not moved to the lens (01 §9 C9); the runtime uses the GLB anchor.

### 2.4 Gaps

| Gap | Status |
|---|---|
| Hair or cable secondary bones | NOT YET IMPLEMENTED (optional in the pack) |
| Per-knuckle fingers | NOT YET IMPLEMENTED (not needed at distance) |
| KTX2 textures | NOT YET IMPLEMENTED (WebP; decision 022) |
| Watcher audio (servo, signal, scan, detect) | NOT YET IMPLEMENTED (`Watcher_AudioOrigin` anchor exists) |
| Silhouette readability in decision 031's fog from every spawn | NEEDS VERIFICATION (playtest; 02 §6 V3) |
| `docs/THE_WATCHER_VALIDATION.md` §5 says "not wired into the game yet" | Stale (01 §9 C5) |

## Part 3. Rules for future character work

1. New contestant variants are colourways (data in `contestant-colorways.json`), not new meshes.
2. Accessories or emblem changes replace one mesh part in the shared rig; they never add per-player textures.
3. Animation never moves the authoritative position.
4. Any change to the master's proportions or the Watcher's design needs an owner decision recorded in
   `docs/DECISIONS.md`, then validation per 08 §5.
