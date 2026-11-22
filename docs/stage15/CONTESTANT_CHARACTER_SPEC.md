# CN TRIAL shared contestant: character specification (design lock)

Owner pack: `references/SHARED_CONTESTANT/` (22 Nov 2026), decision 030. This replaces the plan for 30
individually designed contestants: **one master character, 30 colourways**. Every player uses the same
geometry, UVs, skeleton, animation clips and textures. Only colour parameters differ.

Built entirely by script, so the model can be rebuilt and changed:
`blender/scripts/contestant_geometry.py` (garment generator), `contestant_textures.py`, `contestant_build.py`,
`contestant_export.py`, `contestant_render.py`, `validate_contestant.py`. Blender 5.3.0.

## 1. Reference and interpretation

The reference turnaround (front, 3/4, side, rear, 3/4 rear, face close-up) is the visual anchor. It shows:
- an oversized rounded hood;
- a dark, unreadable face opening with a white geometric emblem;
- a short body;
- a long dark coat with a raised collar, belt, pockets and cuffs;
- gloves and chunky boots.

The pack calls for an original CN TRIAL identity, not a copy of any third-party character. Assumptions
recorded instead of invented features:

| Topic | Decision |
|---|---|
| Face | A recessed dark glossy faceplate. No facial features (pack: "do not invent additional facial features"). |
| Emblem | The reference's rounded diamond outline with an inner chevron (apex at the centre, arms parallel to the upper edges, ending on the lower edges). It is its own mesh part (`CNT_Emblem`), so a new design replaces one part. It deliberately does not use the circle / triangle / square shape set of an existing franchise. |
| Coat colour | The reference is near-black. Colour comes from the 30 colourways (CW01 Obsidian is the reference look). |
| Hidden layers | The inner shirt (a crossover wrap seen in the V) and the trousers (seen in the A-line opening) are kept simple and dark. |
| Hood interior | A dark lining with a piped rim in the secondary colour. |

## 2. Proportions (metres, standing, origin at the ground between the feet)

| Part | Value |
|---|---|
| Total height | 1.235 (gameplay capsule 1.2 x 0.3 radius; the mesh never affects collision) |
| Hood | centre 0.985 high, half-sizes 0.27 wide, 0.26 deep, 0.25 tall; top 1.235; back bulge +0.046 |
| Face opening | about 110 by 100 degrees, centred 6 degrees below the hood centre |
| Faceplate | ellipsoid 0.212 x 0.155 x 0.205 at (0, 0.03, 0.972), recessed behind the hood rim |
| Emblem | half-diagonal 0.094, stroke 0.0118, corner radius 0.020, relief 3.5 mm |
| Shoulders / coat top | shoulder line 0.69, coat top 0.725, shoulder joint (±0.165, 0, 0.665) |
| Belt (waist) | 0.452 to 0.489 |
| Coat hem | 0.17 (A-line: 0.50 wide, 0.43 deep at the hem) |
| Arms | elbow (±0.212, −0.012, 0.528), wrist (±0.236, −0.024, 0.418), glove fist about 0.11 long |
| Legs | hips 0.43, knee 0.265, ankle 0.075, hip width ±0.078 |
| Boots | 0.24 long, 0.13 wide, shaft to 0.173, 32 mm sole |

Head (hood) to body ratio is about 1 : 1.3. The silhouette is slightly top-heavy and rounded, as the pack asks.

## 3. Coat construction (the signature)

The coat gets the most modelling, material and texture effort. That doesn't mean most of the triangles:
the coat parts are about 45% of LOD0.

| Element | How it is built |
|---|---|
| Main shell | Two panels (left, right) with a centre-back seam. Each is a parametric surface over angle × height with an elliptical cross-section profile, solidified to 11 mm. Lining in a dark colour; the cut edges are piped in the trim colour. |
| Front opening | A V above a cinched waist (lapels open from the collar down to the belt), closed at the belt, and an A-line opening below it that shows the trousers. |
| Lapels | Separate peaked panels lying on the chest with a slight curl, 6 mm thick, in the secondary colour with trim piping and topstitching. |
| Collar | Raised and two-sided: outer face coat colour, inner face secondary colour, 13 mm thick. Tall at the back (0.88), lower at the front tips (0.80), flaring out around the hood. |
| Back yoke (storm shield) | Layered over the upper back. Its lower edge is piped in the identifier accent, so players can be told apart from behind. |
| Storm flap | Layered over the right chest, with a button. |
| Epaulettes | On both shoulders, secondary colour, buttoned. |
| Sleeves | Shoulder volume, elbow bunching folds, then a turned-back cuff with a rolled lip (secondary colour) and a thin accent ring. An accent patch on each upper arm (visible from the side and from behind). |
| Belt | Leather strap with a modelled buckle frame and prong, tongue and eyelets, and four keepers. Hardware in the belt-accent colour, mildly metallic. |
| Pockets | Two patch pockets with layered flaps (secondary colour, trim piping, button). |
| Back vent | The two back panels split below 0.335 m, so the coat tails swing separately; a bar tack is stitched at the top of the vent. |
| Folds | Modelled geometry, not texture: gathers just under the belt, drag folds above it, and deeper folds growing toward the hem. |
| Hem | 11 mm thick, piped edge, topstitched, with edge wear in the texture. |
| Fabric surface | Shared normal map: a fine twill weave, seam grooves and raised topstitching. The detail map adds cavity in the seams, roughness, and edge wear on hems, cuffs, lapels and boot toes. Stitches take each colourway's trim colour. |

Stitch and seam lines follow the panels exactly: the generator defines them in each panel's own UV space
(`stitch_lines()`). Micro-detail that would vanish at gameplay distance was avoided.

## 4. Materials and colourways

- **One material** for the whole character. Each face carries a region id in the vertex colour (`CNT`, R = id / 15) and baked ambient occlusion (G).
- **Regions:**
  - from the colourway: 0 coat base, 1 coat secondary, 2 trim, 3 belt accent, 4 identifier accent (gently emissive in game);
  - fixed for everyone: 5 faceplate (glossy black), 6 emblem (white, emissive), 7 leather (gloves, boots, belt), 8 inner (shirt, trousers), 9 sole, 10 lining.
- **Shared maps:** `CNT_Detail` (RGB: cavity with edge wear, roughness, stitch mask) and `CNT_Normal`, 1024 px, one UV atlas for every LOD.
- **Colourways:** 30 records in `packages/shared/src/contestant-colorways.json`, copied unchanged from the pack's CSV.
  - In Stage 01's night scene the game multiplies the coat base and secondary colours by 1.55 (`NIGHT_LIFT`), because the pack's coats are very dark. Trim and accents are unchanged.
  - Every colourway's trim and accent contrast with its coat (unit test: luminance ratio over 2.5 for the trim, over 4.5 for the accent), so contestants are told apart by value and trim, not hue alone.

## 5. Rig and deformation plan

- **29 bones (`CNT_` prefix):**
  - body: Root (ground pivot), Hips, Spine, Chest, Neck, Head, HoodTip;
  - arms, per side: Shoulder, UpperArm, Forearm, Hand;
  - legs, per side: Thigh, Shin, Foot;
  - coat, per side: CoatFront, CoatFront2, CoatBack, CoatBack2.
- **Weights:** computed procedurally per garment part, up to 4 influences:
  - the coat blends Hips → Spine → Chest by height, with a shoulder share near the arms;
  - below the belt it hands over to the front or back tail chains by angle, with a soft left/right split across the continuous back;
  - sleeves blend shoulder / upper arm / forearm with a smooth elbow band;
  - the hood's back-lower part follows HoodTip for secondary motion.
- **Secondary motion:** the coat tails follow the thighs with a phase lag and flare outward in runs and jumps; the hood tip lags behind head motion. Squash and stretch is a mild scale on the hips (landing, run contact), never a destructive mesh deformation.

## 6. Animation library (24 fps, original keys, generated by script)

| Clip | Frames | Loop | Use in game |
|---|---|---|---|
| Idle | 48 | yes | standing (breathing, coat settling) |
| Walk | 24 | yes | slow movement; playback speed = ground speed / 0.587 m/s |
| Run | 12 | yes | full speed; playback speed = ground speed / 1.831 m/s (4 m/s = ×2.19) |
| Start | 8 | no | push-off from standing |
| Stop | 10 | no | skid to a stop (hard stop on amber or red) |
| JumpStart / JumpAir / JumpLand | 6 / 12 / 8 | no / yes / no | lobby jump emote (Space) |
| Dive | 16 | no | lobby dive emote (E) |
| Push / Pull | 24 / 24 | yes | Tug of War (in the library for that stage; no Tug of War stage exists yet) |
| Stumble | 16 | no | a hard stop while the light is green (hit an obstacle or another player) |
| Fall / Recover | 20 / 24 | no | knockdown and getting up (Recover also follows a dive and a new round) |
| Eliminated | 32 | no | spotted: comic hop and flop onto the back; the name tag turns to SPOTTED and the costume greys out |
| Victory | 32 | yes | finished |

The natural speeds were measured from the rig: foot travel per cycle divided by cycle time. Playback is
matched to ground speed, so feet stay planted at normal speeds; the time scale is clamped at ×2.4.
Animation never moves the authoritative position: Dive and the jump hop move only the model, and the server
position is unchanged (integration test).

## 7. LODs

| LOD | Triangles | Built from | Game use |
|---|---|---|---|
| LOD0 | 22,414 | full resolution, every detail | the 2 nearest contestants on High (within 6 m) or Medium (within 5 m); never on Low |
| LOD1 | 8,482 | 58 % resolution, small hardware dropped | next 8 nearest within 16 m (5 on Low) |
| LOD2 | 3,554 | 25 % resolution, details reduced | everyone else, and every contestant's shadow |

All three LODs are generated by the same functions at different resolutions, so they share the UV layout, the
regions and the skeleton. LOD0 is 2.4k triangles over the pack's suggested 20k (a "starting target, not a hard
limit"): the hood and coat opening carry the silhouette at close range. Each player's three LODs share one
skeleton.

## 8. Readability checks

- `docs/stage15/screenshots/contestant/lineup_30_colorways.png`: all 30 colourways on ONE shared mesh in Blender.
- `docs/stage15/screenshots/contestant/ingame_*.png`: in Stage 01 with fog and night lighting, 30 players; the colourways are told apart from behind (yoke accent line, coat value, belt hardware).
- Turnaround and close-up renders: `docs/stage15/screenshots/contestant/`.
