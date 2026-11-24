# CN TRIAL · 02 Visual Bible

Audit date 24 Nov 2026, `main` @ `7ccb1ba`. Labels: see 01. This file records the approved look and how it is
achieved today. It does not propose a new art direction.

## 1. Approved art direction

| Pillar | Approved direction | Source |
|---|---|---|
| Hybrid style | Small, simplified, readable characters in large, cinematic, atmospheric environments | GDD §1.2, §5.1 (APPROVED) |
| Tone | Playful suspense and comedy; eerie industrial, never horror imagery, gore or harm. Elimination reads as "out of the round" (comic hop and flop) | 008, 022 (1) |
| Setting | Night floodlit yard, playground relics blended in, industrial skyline and forest beyond | 007, 017 (E1) |
| Background | 2D only beyond the yard: three painted matte layers and PNG tree cutouts. Obstacles, characters, props and nearby ground stay 3D | 029 (3) |
| Fog | Visible on every tier; misty blue-grey; The Watcher is a dim silhouette; its eye, searchlight and floodlight beams pierce the fog | 031 (4) |
| Signal colour rule | Red is reserved for the signal (aviation lights are amber). Signals never rely on colour alone: word + icon + Watcher pose + light | 022 (6); GDD §5.2, §6.4 |
| Originality | No reproduction of existing game or film characters (the Squid Game doll was redesigned as The Watcher; contestant emblem avoids the circle/triangle/square set) | 023, 028, 030 |

## 2. Palette

**Approved (GDD §5.2, direction only):** charcoal, blue-grey, muted teal, weathered stone; warm accents of rust,
faded orange, amber and dirty brass; saturated cyan/green/red/gold only for gameplay information. GDD §5.2 states
palette values are "intentionally not locked". **Final colour tokens: NOT DOCUMENTED as approved.**

**Implemented values (VERIFIED in code):**

| Use | Value | File |
|---|---|---|
| Fog colour | linear RGB (0.115, 0.150, 0.168), exp2 density 0.0085 | `apps/web/src/stages/stage01/fog.ts` |
| Sky horizon (Stage 1.5 P04) | `#456569` | `STAGE_01_LIGHTING.json`, `skyModel.ts` |
| Tone mapping | ACES Filmic, exposure 1.0 | `STAGE_01_LIGHTING.json` |
| UI background / ink / muted | `#07090d` / `#eef1f5` / `#9aa3b2` | `apps/web/src/styles.css` `:root` |
| UI accent red / green / amber / gold | `#d42a2a` / `#27c25c` / `#f2a51e` / `#d9b45a` | `styles.css` |
| Contestant colourways | 30 records (coat base, secondary, trim, belt accent, identifier accent); coat base and secondary × 1.55 at night (`NIGHT_LIFT`) | `packages/shared/src/contestant-colorways.json`, `apps/web/src/game/contestant.ts` |
| Watcher materials | Teal enamel, porcelain, lacquered hair, brass, dark steel, rubber, textile (7 texture sets) | `blender/textures/WATCHER/` |

PROPOSED: lock the palette as named tokens (world, signal, UI, contestant) in a later visual-development pass, as
GDD §5.2 itself asks.

## 3. Lighting

| Item | Implementation | Status |
|---|---|---|
| Light rig | 15 lights in `blender/exports/STAGE_01_LIGHTING.json` (10 floodlight spots, moon, finish, booth, a retired Shepherd rim and lantern). Lights travel as JSON, not inside the GLB | APPROVED (022 (4)) |
| Tiers | Low: moon only, emissive lamp pools. Medium: moon + floodlights, no shadows. High: all lights, one moon shadow map | VERIFIED (`test:quality` in this audit, see 08) |
| Retired lights | Lights whose `follows` names the Shepherd placeholder are skipped (`Stage01Scene.tsx` `retiredLight`) | VERIFIED in code |
| Volumetric look | Additive light cones under the floodlights, lamp glare on every tier (029 (2)) | VERIFIED in code |
| Signal wash | Point light at the far end follows the signal colour (`LGT_STG15_SignalWash`) | VERIFIED in code |
| Watcher threat light | Red eye glare and red point light; red searchlight sweep on red; sky and matte darken behind it; yard dims on red | APPROVED (029 (2)); implemented in `WatcherFX.tsx`, `Atmosphere.tsx` |
| Post (High) | Half-res bloom (threshold 0.93), colour grade (teal shadows, warm gain, 0.92 saturation), vignette | Implemented; **colour-grade lock: NOT DOCUMENTED as approved** (P04 report says "for the owner at sign-off"; 027 approved Stage 1.5 as a whole) |
| Baked lighting / lightmaps | NOT YET IMPLEMENTED (the approved GLB has no lightmap UVs; known issue K5) |
| True height fog | NOT YET IMPLEMENTED (distance fog + mist sheets approximate it; K5) |

## 4. Atmosphere and effects

| Effect | Tiering | File |
|---|---|---|
| Sky dome: gradient, moon and halo, twinkling stars, fbm clouds | Low: gradient + moon; Medium/High: + stars + clouds | `Atmosphere.tsx`, `skyModel.ts` |
| Fog + mist sheets and mist banks over the course (3 to 7 by tier), thinning near the camera | All tiers | `fog.ts`, `Atmosphere.tsx` |
| Dust motes | Medium 150, High 400 | `Atmosphere.tsx` |
| Ground FX: dust puffs on dry ground, droplets and ripples in puddles (1,401 wet cells from `MAT_Puddle`) | Footsteps within 30 m (Low: own contestant only); pooled 1,400 particles, 40 ripples, 2 draw calls | `apps/web/src/game/groundFx.ts` |
| Watcher detection beam and ring | On a server spot | `WatcherFX.tsx` |
| Reflections (night environment map) | Medium 0.5, High 0.6, off on Low | `skyModel.ts` |

## 5. Camera and composition

- Third-person follow camera, FOV 60, pitch clamped −0.6…0.35 rad (`Scene.tsx`, `input.ts`). VERIFIED.
- Stage introduction camera, winner reveal camera, camera shake with reduced-shake setting, FOV setting:
  **NOT YET IMPLEMENTED** (GDD §5.3, §6.4).
- Review viewpoints for screenshots: `tests/e2e/views.mjs` (7 fixed views).

## 6. Visual inconsistencies observed in this audit (evidence-based, for review)

| # | Observation | Evidence | Status |
|---|---|---|---|
| V1 | The master contestant's hood reads taller and narrower (egg-shaped) than the reference's broad, rounded hood, and the body and gloves read slimmer than the reference's chunky proportions | Compare `references/SHARED_CONTESTANT/01_REFERENCE/CN_TRIAL_SHARED_CONTESTANT_TURNAROUND_REFERENCE.jpg` with `docs/stage15/screenshots/contestant/turnaround_three_quarter_front.png` | NEEDS VERIFICATION (owner's eye; the model is approved as built under 030/031, so any change needs a decision) |
| V2 | At gameplay distance at night, coats read as dark rounded silhouettes; coat detail (the signature feature) is hard to read in the 1280 × 720 software-rendered captures | `tests/reports/screenshots/ui_10_hud_green.png`, `docs/stage15/screenshots/contestant/ingame_30_players_round.png` | NEEDS VERIFICATION on a real GPU at 1080p |
| V3 | Fog at 92 % over The Watcher (about 185 m). The Watcher's turn (the main diegetic signal) is mostly hidden; readability depends on the eye glare, searchlight, wash light and HUD | `fog.ts` table; decision 031 asks for exactly this look | NEEDS VERIFICATION in a playtest (readable-danger pillar, GDD §1.5) |
| V4 | No in-game screenshot set of the full fixed viewpoints exists for the current build (after decision 031's fog). The latest full sets are `fb_high/` and `fb_low/` from decision 029 | `docs/stage15/screenshots/` | NOT YET IMPLEMENTED: capture with `tests/e2e/views.mjs` |
| V5 | UI type uses system fonts (`Bahnschrift`, `DIN Condensed`, … fallback). The concept board's brush-italic CN TRIAL wordmark is approximated with text; appearance differs by operating system | `styles.css` `--head`; `references/STAGE_1_5/UI_UX/CN_TRIAL_UI_UX_CONCEPT_BOARD.png` | See 06 §6 |
| V6 | The UI concept board shows a doll figure resembling the retired concept; it is a layout reference only and must not be used for the enemy | Concept board panels 04 and 05 | Rule recorded here |
| V7 | The environment `.blend` and full GLB still contain the retired Shepherd placeholder (hidden at runtime, stripped from the derived runtime GLB) | `docs/STAGE_01_ENVIRONMENT_ASSET_MANIFEST.md` (`VISUAL_WATCHER`), `Stage01Scene.tsx` | Legacy content, no visible effect |

## 7. Reference rules

- Reference register: `docs/REFERENCE_MANIFEST.md`. G1/G2 global boards are mood only; the doll on them is retired.
- Locked character boards (`references/STAGE_1_5/FINAL_CHARACTER_BIBLE_LOCKED/`, six files, SHA-256 in
  `references/STAGE_1_5/templates/CHARACTER_REFERENCE_SHA256.json`) are preserved but **superseded** for
  production by the shared-contestant pack (030). They show the retired name THE LAST TRIAL.
- Current character reference: `references/SHARED_CONTESTANT/01_REFERENCE/CN_TRIAL_SHARED_CONTESTANT_TURNAROUND_REFERENCE.jpg`.
- Current UI reference: `references/STAGE_1_5/UI_UX/CN_TRIAL_UI_UX_CONCEPT_BOARD.png` (layout and style only).
- Missing reference slots (art direction sheet, Stage 01 overview image): MISSING per `REFERENCE_MANIFEST.md`;
  covered by written specs.
