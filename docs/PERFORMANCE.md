# Performance: all three stages

Last measured **26 Nov 2026** with `npm run test:perf`.

**Where:** the cloud container, which has no GPU. That means:
- the browser is headless Chromium with SwiftShader software rendering
- the viewport is 800 x 450 at a pixel ratio of 1
- the server is the Worker under `wrangler dev`

**Players:** 30 in every run, one page plus 29 server bots.

**No Intel Mac and no real GPU was tested.** These numbers carry over to real hardware: draw calls, triangles, lights, shader counts and the absence of compile hitches. These don't: frame rates and frame times measured under software rendering. Someone has to play it on the reference Intel Mac to confirm it is smooth.

## Results

| Stage | Tier | Draw calls | Triangles | Lights (shadow) | Shaders | Compiled mid-play |
|---|---|---|---|---|---|---|
| 01 Red Light | High | 163 | 253 k | 13 (1) | 76 | 0 |
| 01 Red Light | Medium | 142 | 258 k | 9 (0) | 29 | 0 |
| 01 Red Light | Low | 137 | 239 k | 2 (0) | 28 | 0 |
| 02 Agawan Base | High | 69 | 162 k | 3 (0) | 62 | 0 |
| 02 Agawan Base | Medium | 69 | 167 k | 3 (0) | 42 | 0 |
| 02 Agawan Base | Low | 69 | 155 k | 3 (0) | 42 | 0 |
| 03 The Hunt | High | 50 | 100 k | 9 (0) | 47 | 0 |
| 03 The Hunt | Medium | 52 | 117 k | 6 (0) | 23 | 0 |
| 03 The Hunt | Low | 46 | 67 k | 1 (0) | 23 | 0 |

**Budgets** (enforced by `test:perf`), for 30 players:

| Tier | Draw calls | Triangles |
|---|---|---|
| High | 260 | 900 k |
| Medium | 200 | 600 k |
| Low | 150 | 400 k |

Every stage and tier is inside its budget. Stage 01 is the heaviest stage: on High it adds bloom, 4x MSAA and one shadow light. Agawan Base and The Hunt draw well under half of Stage 01's calls.

Triangle counts vary by about 10 % between runs, because they depend on where the bots are standing.

## What keeps lower-end machines smooth

- **Adaptive quality** (default "Auto"):
  - When the average frame rate stays under 50, it first lowers the render resolution (1.25, then 1, then 0.85).
  - Below 40 fps at the lowest resolution, it steps the tier down (High, then Medium, then Low).
  - It gives resolution back after smooth stretches. It never raises the tier during a session.
  - A tier the player picks in Settings is kept; only the resolution adapts.
- **Shader warm-up** (new on 26 Nov):
  - Once a stage and the contestants have loaded, and again after a quality change, every shader is compiled up front with `compileAsync`.
  - Before this, turning towards something new compiled its shader during play. On Chrome on macOS each compile can take 100 ms or more.
  - `test:perf` fails if any shader compiles while a stage is being played.
- **Stage changes don't count as slow frames** (new on 26 Nov):
  - The one-off hitch of building a stage used to be read as a slow machine, which cost a resolution step at every stage change.
  - The adaptive monitor now starts a fresh warm-up when a stage loads and when its shaders finish compiling.
- **Agawan Base glow sprites** (new on 26 Nov):
  - The glows are additive sprites. A big one close to the camera shades the same pixels many times over.
  - Their largest on-screen size is now capped per tier: High 112 px, Medium 84 px, Low 60 px (bulbs 48 / 40 / 32 px).
  - The cap scales with the render resolution, so the street looks the same from afar.
- **Name tags:** one DOM overlay for every tag. Since 26 Nov a tag's stacking order is written only when it changes, not every frame.
- **Earlier passes:**
  - Stage 01: pooled floodlights near the camera, and the shadow map redrawn every second frame.
  - The Hunt: pooled lamps (8, 5 and 0 lights on High, Medium and Low).
  - Agawan Base: one merged mesh per material and no real-time point lights.
  - Contestants: throttled animation for distant players and LOD by distance.
  - Remote players: a 100 ms interpolation buffer.

## Re-running

```
npm run build
SKIP_BUILD=1 NODE_PATH=$(npm root -g) npm run test:perf          # every stage and tier, about 4 minutes
STAGES=02 TIERS=high SKIP_BUILD=1 NODE_PATH=$(npm root -g) npm run test:perf
```
