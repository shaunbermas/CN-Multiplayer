# CN Trials · THE WATCHER (Stage 01 enemy, Prompt 06)

Status: **built, ready for owner review** (21 November 2026). Design direction approved by the owner
(decision 023: an original robotic doll replaces The Shepherd). Integration choices in §9 are approved (decision 024).

| Deliverable | File |
|-------------|------|
| Blender asset | `blender/scenes/THE_WATCHER.blend` (Git LFS) |
| Game export | `blender/exports/THE_WATCHER.glb` (2.3 MB) |
| Build scripts | `blender/scripts/watcher_build.py` (model, rig, clips), `watcher_textures.py`, `watcher_export.py` |
| Renders and animation preview | `renders/watcher/` via `watcher_render.py` |
| Asset manifest | `blender/exports/THE_WATCHER_ASSET_MANIFEST.json` (pack schema) |
| Validation | `docs/THE_WATCHER_VALIDATION.md` |

> **Decision 040 (owner, 25 Nov 2026):** two doll eyes with glowing signal pupils (no camera lens, no stapled eye), a real 3D nose and lips, and one high ponytail; a second anchor `Watcher_OpticalOrigin_L` marks the left pupil.
>
> **Decisions 038-039 (owner, 25 Nov 2026):** the face was resculpted (sockets, brow, nose, cheekbones, parted lips and mouth, a ringed lens, an eye stapled shut with a steel pin, cracks, a broken cheek with fiber-optic lines), the hair is now long and messy to the shoulders with curtains framing the face (no bun), fiber-optic lines show at the neck, elbows and knees, and the runtime finish is rusty, cracked and dirty with a near-black dress. Rig, clips, anchors, proportions and height are unchanged. The tables below describe the original build where they differ.

## 1. Concept

The Watcher is an antique wind-up toy automaton built at monument scale: the yard's old night
watch, now running the Red Light, Green Light signal. It is playful-eerie (decision 008): uncanny
stillness, a single camera-lens eye, a turning waist and a wind-up key, but no horror imagery.

## 2. Originality

The Prompt 06 pack's design sheet describes itself as "inspired by the Squid Game doll silhouette",
and it closely resembles that character. The owner chose an original redesign instead (decision 023),
in line with the brief ("do not directly reproduce the recognizable appearance of any existing game or
television character") and conflict C5 in `docs/REFERENCE_MANIFEST.md`.

| Recognisable trait of the retired concept | The Watcher |
|-------------------------------------------|-------------|
| Black bob with a fringe and two pigtails | Swept-back lacquered hair, no fringe, one bun with a brass band |
| Yellow collared top over an orange pinafore dress | Deep-teal enamel coat with a high charcoal collar, double brass buttons and a sash; no yellow or orange |
| Two large round doll eyes | One camera-lens eye in a riveted steel socket; the other eye is stapled shut (decision 038) |
| Mary-Jane strap shoes and socks | Heavy riveted iron boots with brass cuffs; porcelain shins with knee guards |
| Fixed upright pose; the head turns | The upper body turns on a visible steel waist turret; a brass wind-up key turns in its back |
| Smooth face | Porcelain face-plate seams, fine cracks and grime |

## 3. Scale, origin and orientation

- **Height 28 m** (spec L9, decision 014; the sheet's 2.8–3.2 m was provisional and too small to read
  190 m away). The crown is at exactly 28.0 m.
- **Origin:** ground centre between the feet (0, 0, 0); the feet sit on Z = 0.
- **Facing:** −Y in Blender (+Z in glTF), the same as The Shepherd, so placed at `WATCHER_ROOT_ANCHOR`
  it faces the start line.
- **Proportions:** head 7.8 m including the hair (28 % of the height), shoulders ±3.6 m, coat hem at 8 m, knees at
  7.25 m. The optical eye sits at Z 23.6 m, character's right (−X).
- Bounds: X ±4.77 m, Y −3.47…+5.15 m (the bun and key stick out at the back).

## 4. Construction (12,662 triangles; LOD1 6,314)

One skinned mesh, `Watcher_Body`. Every part is rigidly weighted (weight 1.0) to one bone, so the
mechanical pieces move like hinged parts with no rubbery deformation.

| Group | Parts |
|-------|-------|
| Head | Porcelain shell; faceplate seam; angled brow plates; hairline crack; nose ridge with vents; marionette jaw and porcelain-toothed mouth grille; left eye stapled shut (face reworked in decision 038); lacquered hair shell with a rolled hairline; bun and brass band; rear control housing with vents and three status lights per signal state |
| Optical eye | Riveted steel socket, steel barrel, brass bezel, dark glass, six-blade shutter iris, inner aperture ring, three emitter discs (neutral, red, green) |
| Neck | Stacked steel turret with a brass ring |
| Torso | Enamel coat shell, high textile collar, placket seam, eight brass buttons, charcoal sash with a brass buckle |
| Waist | Steel turret ring (the upper body turns here); pleated enamel coat skirt with a brass hem |
| Back | Brass wind-up key (shaft, collar, hub, two lobes) |
| Arms | Enamel shoulder caps; steel ball joints at shoulder and elbow; porcelain upper arms and forearms with brass bands; wrist ring; hand with three two-segment fingers and a thumb |
| Legs | Steel hip, knee and ankle balls; porcelain thighs and shins; knee guards; brass shin bands |
| Boots | Rubber sole, iron shaft and toe cap, brass cuff, six rivets |

`Watcher_Body_LOD1` (in `WATCHER_EXPORT`) is the same mesh decimated to 50 %, with weights kept.

## 5. Rig (33 bones, all `Watcher_`)

```
Watcher_Root
└─ Watcher_Pelvis ─┬─ Watcher_Spine (waist turret) ─ Watcher_Chest ─┬─ Watcher_Neck ─ Watcher_Head ─ Watcher_Eye ─┬─ Watcher_LensNeutral
                   │                                                │                                             ├─ Watcher_LensRed
                   │                                                │                                             └─ Watcher_LensGreen
                   │                                                ├─ Watcher_Key
                   │                                                └─ Watcher_Clavicle_L/R ─ Watcher_UpperArm_L/R ─ Watcher_Forearm_L/R ─ Watcher_Hand_L/R ─┬─ Watcher_Thumb_L/R
                   │                                                                                                                                         ├─ Watcher_Index_L/R
                   │                                                                                                                                         ├─ Watcher_Middle_L/R
                   │                                                                                                                                         └─ Watcher_Ring_L/R
                   └─ Watcher_Thigh_L/R ─ Watcher_Shin_L/R ─ Watcher_Foot_L/R
```

- `_L` is the character's left (+X). Bones are mirrored exactly.
- `Watcher_Eye` moves along its own axis to telescope the lens.
- `Watcher_Lens*` scale 1 or 0.01 to show one signal state, in the front lens and the rear lights.
- **Retargeting:** the body chain follows common humanoid naming (Root, Pelvis, Spine, Chest, Neck,
  Head, Clavicle, UpperArm, Forearm, Hand, Thigh, Shin, Foot), so a name map to other humanoid rigs is
  one-to-one. The eye, lens, key and three-finger bones are Watcher-specific and are left unmapped.

## 6. Animation clips (24 fps; all bones keyed in every clip)

| Clip | Frames | Loop | Lens | Use |
|------|--------|------|------|-----|
| `Watcher_Idle` | 1–97 | yes | neutral | Lobby and briefing: servo breathing, head drift, the key winds |
| `Watcher_TurnAway` | 1–37 | no | neutral → green | Start of GREEN: upper body turns 180° on the waist turret |
| `Watcher_GreenSignal` | 1–49 | yes | green | GREEN: turned away, green lens and rear lights |
| `Watcher_TurnToField` | 1–37 | no | green → neutral | WARNING: turns back to face the field, head leading |
| `Watcher_FocusLock` | 1–25 | no | neutral → red | Start of RED: the lens telescopes out and locks red |
| `Watcher_RedSignal` | 1–49 | yes | red | RED: left hand raised palm-out (stop), head tilted to the field |
| `Watcher_ScanSweep` | 1–97 | yes | red | RED alternative: deliberate ±32° head sweep, chest counter-turn |
| `Watcher_Detect` | 1–41 | no | red | A player is spotted (server event): head snaps, lens extends, right arm points |
| `Watcher_ReturnNeutral` | 1–37 | no | red → neutral | Back to the neutral stance (results, lobby) |

- **Lens switches are stepped** (glTF STEP interpolation); everything else eases.
- **Loops close exactly:** the first and last poses match, apart from the key, which keeps winding.
- **Poses:**
  - Neutral = `Watcher_Idle` frame 1
  - Scanning = `Watcher_ScanSweep`
  - Red signal = `Watcher_RedSignal`
- **The animation follows the server's state and never decides anything** (GDD §2.6). The pack's
  optional `Watcher_Alert` is covered by `Watcher_Detect`.

## 7. Materials (12) and textures (21 images, 6.9 MB PNG; WebP in the GLB)

| Material | Texture set (BC / ORM / N) | Notes |
|----------|----------------------------|-------|
| `MAT_Watcher_Porcelain` | `T_W_Porcelain` 1024 / 512 / 1024 | Aged ivory, crack network, grime |
| `MAT_Watcher_EnamelTeal` | `T_W_EnamelTeal` 1024 / 512 / 512 | Deep-teal enamel chipped to iron, run-off streaks |
| `MAT_Watcher_Brass` | `T_W_Brass` 512 / 256 / 256 | Aged brass with green-brown tarnish |
| `MAT_Watcher_SteelDark` | `T_W_SteelDark` 512 / 256 / 512 | Oiled dark steel joints |
| `MAT_Watcher_Rubber` | `T_W_Rubber` 256 / 256 / 256 | Boot soles |
| `MAT_Watcher_Textile` | `T_W_Textile` 512 / 256 / 512 | Charcoal-indigo weave: collar and sash |
| `MAT_Watcher_HairLacquer` | `T_W_HairLacquer` 512 / 256 / 512 | Glossy lacquer with sculpted grooves |
| `MAT_Watcher_LensGlass`, `MAT_Watcher_Seam` | none | Dark glass; seam lines |
| `MAT_Watcher_Lens_Neutral` / `_Red` / `_Green` | none | Emissive signal states; the runtime may also drive them directly |

The textures are original and procedural (`watcher_textures.py`), with no photos or concept crops.

## 8. Gameplay anchors (integration references only)

| Anchor | Parent bone | Position | Use |
|--------|-------------|----------|-----|
| `Watcher_Root` | Root | (0, 0, 0) | Ground pivot; place at `WATCHER_ROOT_ANCHOR` |
| `Watcher_Facing` | Root | (0, −4, 0) | Facing direction (−Y Blender / +Z glTF) |
| `Watcher_OpticalOrigin` | Eye | (−1.3, −3.04, 23.6) | Lens centre: scan beam and spotlight origin |
| `Watcher_DetectionForward` | Eye | 6 m ahead of the lens | Optical forward vector |
| `Watcher_AudioOrigin` | Chest | (0, −2.7, 17) | Signal sounds |
| `Watcher_InteractionBounds` | Root | box ±4.6 × ±4.6 × 0–28 m | Camera and occlusion helper |

These anchors are references only. Detection, eligibility and elimination stay in the server (spec §4, decision E9: not line-of-sight).

## 9. Integration choices (decision 024, APPROVED)

1. **Placement:** keep the approved 4 m plinth at Y 185, with the doll standing freely on top (no
   tower, no attachment). Moving it to the ground would change approved gameplay metadata.
2. **Integration follow-ups** (next step, not done here):
   - swap the Shepherd placeholder for this GLB in the game client;
   - point the `SIGNAL_RED_ANCHOR` / `SIGNAL_GREEN_ANCHOR` / `SIGNAL_SCAN_BEAM_ANCHOR` metadata at the lens;
   - add a rig-driven `WATCHER_HEAD_ANCHOR`;
   - update the GDD and spec text from "The Shepherd" to "The Watcher".
3. **Expression:** the sealed eye reads as a slight wink, which is a playful touch in line with
   decision 008. It can become a plain sealed plate if you prefer more restraint.
4. **No FBX:** the pipeline is glTF-only for the browser.
