# CN TRIAL: Stage 01 asset optimisation (refinement)

Stage 01 refinement, Phase 12 (owner brief, 24 Nov 2026). All figures are measured in this repository's cloud
container. Frame rates come from headless Chromium with SwiftShader (software WebGL, no GPU): they compare
the two builds on the same machine and are **not** real-GPU frame rates. No real GPU was available.

Baseline: `main` at `7ccb1ba`. After: branch `claude/project-thread-8jwd5y`. Raw data:
`tests/reports/refinement-measure.json` (after) and the baseline run described in §3.

## 1. Build output (bytes on disk, `apps/web/dist/assets`)

| File | Baseline | After | Change |
|---|---:|---:|---|
| STAGE_01_ENVIRONMENT.meshopt.glb | 2,310,264 | 2,310,264 | unchanged (cone trees stripped at load) |
| GameView JS (3D scene) | 1,569,977 | 1,475,211 | −94,766 (tree impostor and cutout code removed) |
| THE_WATCHER.meshopt.glb | 1,347,028 | 1,347,028 | unchanged (geometry locked) |
| Contestant GLB | 763,692 | 763,692 | unchanged |
| index JS (UI, net, shared rules) | 324,790 | 325,914 | +1,124 |
| Tree cutout atlas (WebP) | 221,276 | — | removed |
| Old matte layers (3 WebP) | 185,706 | — | removed |
| New matte layers (6 WebP) | — | 489,172 | added |
| Contestant textures (2 WebP) | 161,616 | 161,616 | unchanged |
| CSS | 15,503 | 22,793 | +7,290 (redesign) |
| Fonts (6 × woff2, Barlow / Barlow Condensed) | — | 134,192 | added (self-hosted, no CDN) |
| **Total** | **6,899,852** | **7,029,882** | **+130,030 (+1.9 %)** |

The sky cloud layer is the largest new texture (210 KB) because soft translucent clouds compress poorly; the
other five layers are 22–88 KB each.

## 2. Texture memory (GPU, estimated as RGBA8 with mipmaps = width × height × 4 × 4/3)

| Background textures | Baseline | After |
|---|---|---|
| Layers | hills 4096×768, skyline 4096×768, forest 4096×512, tree atlas 2048×2048 | sky 2048×512, far landscape 4096×512, skyline 4096×768, forest 4096×512, midground 4096×512, foreground 2048×256 |
| Pixels | 12.58 M | 11.01 M |
| GPU memory | about 67 MB | about 59 MB (−12 %) |

Obstacle kits add seven small canvas textures (256 px or less, under 2 MB in total). The Watcher's material
upgrade adds no textures (grime is a shader pass).

## 3. Runtime at spawn (lobby, High tier, 1280×720, software WebGL)

`tests/e2e/refinement-measure.mjs` with `MEASURE_LOAD_ONLY=1`, run on both builds in the same container.

| Metric | Baseline | After | Note |
|---|---:|---:|---|
| Load to "stage ready" | 11.8 s | 15.6–16.3 s | more shader programs to compile in software (physical Watcher materials, grime pass, prop materials); fonts add 134 KB |
| Bytes transferred | 4.61 MB | 4.97 MB | includes the contestant textures in the after run |
| JS heap | 29.2 MB | 30.9–33.2 MB | |
| Draw calls | 180 | 189 | +7 obstacle materials, +3 matte layers, −2 tree systems |
| Triangles (incl. shadow pass) | 164,549 | 197,903 | obstacle props about 20,000 (drawn twice with shadows) |
| Shader programs | 43 | 49 | |
| Frame rate (software) | 0.75 fps | 0.79 fps | same within noise |

Software WebGL load times are dominated by shader compilation, which on a real GPU takes a fraction of a
second; the load-time increase is expected to be much smaller there, but that could not be measured here.

## 4. Optimisation choices

- One merged mesh per material for all 41 obstacle segments (7 draw calls); tyre stacks drawn as one cylinder
  plus a top torus (about a fifth of the triangles of full tori); low-segment drums and pipes.
- Matte layers sized to what the camera can resolve (1–1.3 m per pixel at their radii), the cloud and mist
  layers at half width; seamless, so one cylinder each with no seams.
- The low tier keeps the clouds still (no per-frame texture offset).
- Removed systems: 49 lit midground impostors and up to 1,100 billboard cutouts (and their shaders).

## 5. Not done

- KTX2/Basis texture compression (would cut GPU memory further; needs a transcoder in the build).
- Real-GPU frame timing on target laptops: needs a machine with a GPU.
