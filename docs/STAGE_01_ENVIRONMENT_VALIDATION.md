# CN Trials · Stage 01 environment validation (Prompt 05)

Status: **ready for owner review** (21 November 2026). All automated checks pass: 9 scene checks, the
glTF Validator (0 errors) and the Three.js browser check. Points for approval are in §6 (decision 022).

## 1. Dependencies used

| Input | File | Status |
|-------|------|--------|
| Design spec | `docs/STAGE_01_DESIGN_SPEC.md` | Approved (017); §7 placements, §10 asset list, §12 lighting followed |
| Greybox and report | `blender/scenes/STAGE_01_GREYBOX.blend`, `docs/STAGE_01_GREYBOX_REPORT.md` | Approved (019) |
| Collision-ready scene and metadata | `blender/scenes/STAGE_01_COLLISION_READY.blend`, `blender/exports/STAGE_01_METADATA.json` | Approved (021); the build starts from a copy of this scene and never overwrites it |
| Visual references | Prompt 05 pack: user playground image (S1/S2) and the cinematic render (S3) | Mood only; not committed (`docs/REFERENCE_MANIFEST.md`) |

Coordinates are unchanged: metres, Z up, course toward +Y, origin at the centre of the start line. The
GLB is Y up (game = x, z, −y).

## 2. Scene checks (`blender/exports/STAGE_01_ENVIRONMENT_VALIDATION.json`)

| Check | Result | Evidence |
|-------|--------|----------|
| `gameplay_unchanged` | PASS | All 189 gameplay objects are identical to the collision-ready scene: names, types, transforms, mesh vertices and properties |
| `metadata_gameplay` | PASS | Spawns, triggers, boundaries, watcher reference, collision, spectators and signal anchors rebuild byte-identically from the environment scene |
| `metadata_checks` | PASS | Every Prompt 04 check still passes on this scene: each rebuilt visual sits inside its collision proxy, the runtime exports agree, and there's no game logic. Only the scene-object inventory differs, as expected for new decoration |
| `yard_clear` | PASS | No visual vertex stands inside the yard above the ground, except the finish gate beam, light strip and raised barrier arm, all above 6 m |
| `sightline` | PASS | The Shepherd's head is visible from all 30 spawns (eye 1.0 m) through the detailed geometry |
| `collections` | PASS | Visual, collision and lighting are separate. `LIGHTING` holds only lights; every object is in exactly one collection |
| `materials` | PASS | 29 materials built only from glTF-exportable nodes. 34 images exist, are powers of two and at most 1024, with correct colour spaces. Signal colours are separate materials |
| `budgets` | PASS | 55,758 triangles (≤ 300k), 52 draw calls (≤ 150), 6.43 MB GLB (≤ 20 MB), browser check PASS |
| `conventions` | PASS | Prefixes `STG01_`/`PRP_`/`ENM_`/`VFX_`, positive scales, yaw-only rotations, no scripts, drivers or animation |

Negative test: in a scratch copy, moving one spawn 0.1 m and adding a crate in the yard made
`gameplay_unchanged`, `metadata_gameplay`, `metadata_checks` and `yard_clear` fail, as they should.

## 3. GLB test in the browser (`tools/asset-check/check-environment.mjs`)

Khronos glTF Validator: **0 errors**, 14 warnings. All 14 are `IMAGE_FEATURES_UNSUPPORTED`: Blender writes
an sRGB colour profile into the colour WebPs, and Three.js ignores it (`colorSpaceConversion: none`).
Headless Chromium + Three.js 0.187 (software WebGL 2):

| Verified | Result |
|----------|--------|
| **Scale** | `STG01_Ground_Yard` spans X −30…30 and Z −172…15 at Y 0, which is exactly `BOUNDARY_PLAYABLE_AREA` from the metadata (60 × 187 m) |
| **Orientation** | Y up. All 30 spawns sit at their metadata positions converted to game coordinates and face −Z, toward `WATCHER_ROOT_ANCHOR` at (0, 4, −185). Floodlight masts reach Y 22 |
| **Materials** | All `MeshStandardMaterial`. Asphalt, concrete, rust paint, dark steel and dirt load colour, normal and roughness/metalness maps. Chain-link is alpha-tested and double-sided. Signal and lantern materials are emissive and named. Haze is transparent. Textures are powers of two; colour maps are sRGB |
| **Nothing leaked** | No collision, trigger, boundary, camera, light, capsule or review objects |
| **Performance** | 44–52 draw calls and about 55.8k triangles per view |

Screenshots (lit from `STAGE_01_LIGHTING.json` as a first approximation; real values get tuned during
integration): `blender/exports/STAGE_01_ENVIRONMENT_browser/STAGE_01_ENV_browser_third_person.png`, `_wide.png`, `_finish.png`.

## 4. Renders (CPU Cycles)

| View | File | Camera |
|------|------|--------|
| Wide establishing | `renders/STAGE_01_ENV_WIDE.png` | `CAM_STG01_Env_Wide` (−58, −52, 30) → (0, 110, 6) |
| Third person | `renders/STAGE_01_ENV_THIRD_PERSON.png` | Gameplay viewpoint behind the spawn rows |
| Front | `renders/STAGE_01_ENV_FRONT.png` | From behind the start wall, 9 m up |
| Side | `renders/STAGE_01_ENV_SIDE.png` | Orthographic from the west, past the tree line, no fog |
| Top | `renders/STAGE_01_ENV_TOP.png` | Orthographic, no fog |

## 5. Comparison with the references

| Reference element (S1 user image, S3 cinematic render, brief) | In the model |
|---------------------------------------------------------------|--------------|
| Dark teal atmosphere, warm orange accents | Teal sky and fog volume. Warm floodlight pools, sodium street lamps, warm booth windows, finish strip and plinth uplights |
| Weathered concrete and metal, rusted fences, industrial towers | Procedural weathered concrete with water streaks and cracks, teal paint chipped to rust, dark rusty steel. Rusty chain-link with barbed strands. 22 m lattice floodlight masts |
| Volumetric fog, dust, particles | Fog volume and dust motes in the renders. Haze cards in the GLB (high tier). Runtime fog and dust settings in `STAGE_01_LIGHTING.json` |
| Strong silhouettes, dramatic shadows | Chimneyed industrial silhouettes, water tower and roadway against the haze. Lattice masts and the rocket-frame cage break the skyline |
| Playground relics: swings, roundabout, cage tower, slide | All modelled at the approved west-margin positions. One swing hangs broken. The rocket-frame climber echoes the cage tower |
| Elevated roadway with street lamps, distant water tower, trees | Roadway with piers and lamps at X −78; original water tower at (72, 245); pine lines |
| Wet ground, puddles reflecting light | Damp asphalt roughness and 28 puddle decals (flat, no collision) |
| Perimeter fence with hazard stripes | Concrete plinth with a yellow/black band under chain-link on every fence |

**Departures, and why:**

- **"Horror" read as eerie.** The project's tone is playful (decision 008: suspense and comedy, no horror
  imagery). The scene keeps the cinematic, eerie mood but adds no gore, skulls, threatening signs or
  blood-red light. Changing that needs an owner decision (§6).
- **Red is reserved for the signal.** The reference's red light on the water tower is amber here, so no
  red light competes with The Shepherd's RED state.
- **No copied designs.** There are no antlers and no lettering on the water tower, and no logos
  (design spec §13).
- **Layout comes from the approved files, not the images.** The reference's close, cluttered playground
  sits in the margins at the approved positions, and the yard stays open (G4).
- **The Shepherd is still the placeholder.** Its shapes are unchanged; it only has new materials. Enemy
  production is a separate milestone.
- **The sky is teal-violet, not magenta.** The reference's strong magenta sky is held back so the
  red/green signals stay the most saturated colours in view.
- **Visible mismatches:** the fog in the renders is denser and more uniform than in S3; the trees are
  stylised low-poly pines rather than broadleaf silhouettes; there's no utility building (it isn't in
  the approved layout).

## 6. Limitations and points for approval (decision 022, PROPOSED)

1. **Tone:** eerie industrial, not horror (see §5). Say so if you want darker imagery; it would change
   decision 008.
2. **Cinematic reference:** S3 is used for mood and lighting only. It's AI-generated from the third-party
   S1 image, so it isn't committed.
3. **Textures are procedural WebP, not KTX2.** The KTX2 toolchain isn't available here. Converting to
   KTX2/Basis would cut GPU memory from about 50 MB to roughly 12 MB; recommended at integration.
4. **No lights in the GLB.** The runtime builds its own lights from `STAGE_01_LIGHTING.json`, using quality
   tiers (low / medium / high). Blender watts don't map 1:1 to Three.js intensities, so those values
   need tuning at integration.
5. **Decorative additions have no collision:** gantry stairs and bracing, booth stairs, generators,
   cables, the transformer, barrier mesh, tufts, street lamps and haze. All are outside the fence,
   where contestants can't go, so no gameplay geometry changed.
6. **Size:** the GLB is 6.4 MB, mostly geometry with tangents. Cloudflare compresses it in transit;
   meshopt or Draco could shrink it further, but each adds a decoder to the client.
7. **Not done here, as the brief asks:** integration into the game client (the live game still loads
   the greybox GLB), the final Shepherd model, baked lightmaps, Stage 02.
