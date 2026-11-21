# CN TRIAL · Stage 1.5 Prompt 04: cinematic atmosphere, lighting and VFX

Status: **PASS**. The final colour-grade lock is for the owner at sign-off.

## What was added (`apps/web/src/stages/stage01/Atmosphere.tsx`, `skyModel.ts`)

| Effect | Implementation | Low | Medium | High |
|--------|----------------|-----|--------|------|
| Sky | One dome shader: gradient (zenith navy to teal horizon band), moon disc and halo along the moon light's direction, procedural twinkling stars, slow fbm cloud bands lit by the moon | Gradient + moon | + stars + clouds | + stars + clouds |
| Fog | Scene fog colour = the sky horizon colour (`#456569`, from `STAGE_01_LIGHTING.json`), so 3D, cutouts and matte layers fade into one haze. Distance fog only (see limits) | Linear 60–260 m | Exp2 0.0045 | Exp2 0.0045 |
| Volumetric light | Additive soft cones under the 10 floodlights (fresnel edge, length falloff), one material | — | 10 cones | 10 cones |
| Ground mist | Animated noise sheets at knee height along both fences and behind start and finish, never over the lanes | — | 2 sheets | 4 sheets |
| Signal presentation | `LGT_STG15_SignalWash`: point light at the far end, colour follows the client's view of the server signal (green / amber / red). Pairs with the tower lamps, The Watcher's lens, and the HUD label and icon (not colour alone) | — | Yes | Yes |
| Reflections | Night-sky environment map (Prompt 03) | 0.35 | 0.5 | 0.6 |
| Post-processing | Half-resolution bloom (strength 0.42, threshold 0.93: only lamps, signals and the moon bloom), colour grade (teal shadow lift, warm gain, 0.92 saturation), vignette. Three.js built-in passes, no new dependency | — | — | Yes |
| Retired light | `LGT_STG01_Lantern` followed the retired Shepherd placeholder; it is no longer used (it blew out The Watcher's porcelain under bloom). Rule: lights whose `follows` names the placeholder are skipped | — | — | — |

The night palette also dims the matte layers per layer: hills 0.42, skyline 0.62, forest 0.70. They read as silhouettes darker than the sky.

## Validation

- **`npm run test:quality` (PASS):** each tier turns on exactly the effects in the table above, plus the surroundings, the 49 midground trees and the environment map. It reports no asset problems and no console errors. With no `?quality`, the game starts on High and the adaptive monitor steps down.
- **Screenshots, High:** `docs/stage15/screenshots/p04_atmosphere/`. This includes `signal_green.png`, `signal_warning.png` and `signal_red.png`. They were captured with a test-only hook that holds the client's view of the signal (`globalThis.__cnSignalHold`); it never affects the server.
- **Readability:** the signal state stays clear in all three captures (HUD label, wash, lamps, Watcher). Contestants are not dimmed by bloom (threshold 0.93) or mist (kept off the lanes).

| Measure (SwiftShader, 1280 × 720) | P03 | P04 |
|-----------------------------------|-----|-----|
| High spawn view: draw calls / triangles / shader programs | 132 / 135,518 / 23 | 160 / 137,941 / 36 (includes the bloom and grade passes) |
| Draw calls per tier (Low / Medium / High) | — | 70 / 81 / 160 |
| Software fps per tier (comparison only) | — | 2.1 / 1.2 / 1.1 |

Real-GPU frame times are not measured here (no GPU). The adaptive fallback protects weaker machines (decision 026).

## Known limits

- **No true height fog.** Three.js fog is distance-based; a world-height term would mean patching every material's shader. The ground mist and the painted base haze give the low-lying look instead.
- **No baked lightmaps.** The approved GLB has no lightmap UVs, and adding them would mean re-exporting the approved environment. Dynamic lights stay within the High tier's 14 lights and 1 shadow map.
