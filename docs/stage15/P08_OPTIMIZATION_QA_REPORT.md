# CN TRIAL · Stage 1.5 Prompt 08: optimisation, 30-player QA and regression

## Test machine and what the numbers mean

- **Machine:** this cloud container. 4 vCPU Intel Xeon 2.3 GHz, 15 GB RAM, **no GPU**. Headless Chromium (Playwright 1.63) with **SwiftShader software WebGL**.
- **Frame rates:** every figure below is software rendering, about 100× slower than a real GPU. Use them only to compare configurations. They are **not** player frame rates. Real-GPU FPS, 1 % lows and GPU frame time were **not measured** (no GPU; named reference hardware is needed, see known issue K2).
- **Server:** local `wrangler dev` (the same Worker and Durable Object code as production), not the deployed Cloudflare edge.
- **Clients:** "simulated" clients are the shared `RoomClient` over WebSockets (the network protocol of a real browser, no rendering). They are **not** browsers and are reported separately.

## Optimisations (measured)

| Change | Before | After |
|--------|--------|-------|
| Code split: the 3D game moves to a lazily loaded chunk, prefetched from the menu | One 1.61 MB JS bundle (466 KB gzip) before anything shows | Menu chunk **325 KB** (80 KB gzip); game chunk 1.47 MB (431 KB gzip) loads in the background |
| Meshopt-compressed runtime copies of the approved GLBs (originals untouched) | Environment 6.43 MB + Watcher 2.28 MB = 8.71 MB | **2.54 + 1.35 = 3.89 MB**. All in-browser asset checks pass (nodes, materials, 70 markers, skin, 9 clips, 6 anchors, Watcher 28.0 m) |
| Contestant body and nose merged into one mesh | 2 draw calls per player (+2 in the shadow pass) | 1 (+1). With 30 players on High: **292 → 232 draw calls** |
| Distant trees: billboards in one instanced call; midground impostors instanced per shape (Prompts 02–03) | 49 cone trees, 3,088 triangles | 1,100 billboards + 49 impostors, 5 calls, fewer triangles |
| Matte layers replace distant geometry: 3 painted cylinders (Prompt 02) | Empty horizon | 3 draw calls, 185 KB of textures |
| Quality tiers and the adaptive fallback (decision 026) | — | High → Medium → Low as needed; `?quality=` pins a tier |
| Adaptive fallback counts very slow frames (found by CI: the old rule skipped every frame longer than 2 s as a hidden tab, so a 0.4 fps machine never stepped down) | Stuck on Medium at 0.4 fps | Hidden tabs detected directly; frames count up to 5 s each; only gaps over 30 s are ignored. On 2 cores: High → Medium → Low |
| Low tier without the environment map (found by CI: a 6× throttled page on a 2-core runner dropped under 1 fps and walked 7.76 m in 4 s) | Low 1.49 fps (6× throttle, software) | **2.53 fps**; the throttled player walks 11.9 m in 4 s on 2 cores (test needs > 8 m) |

Stage download now: models 3.89 MB + matte and tree textures 0.41 MB + game chunk 0.43 MB gzipped.

## Rendering cost by tier (SwiftShader, 1280 × 720, spawn view, no players)

| Tier | Draw calls | Triangles | Shader programs | What is on |
|------|------------|-----------|-----------------|------------|
| Low | 69 | 72,364 | 13 | 1 light, linear fog, 440 cutouts, sky gradient + moon |
| Medium | 80 | 73,166 | 16 | 12 lights, 150 dust, cones, 2 mist sheets, stars, clouds, signal wash, 770 cutouts |
| High | 158 | 141,469 | 35 | All 14 lights, moon shadow, 400 dust, haze, 4 mist sheets, bloom + grade, 1,100 cutouts |
| High with 30 players and obstacles (observer) | 232 | 160,993 | 38 | As High + 30 contestants + barricades + gate. JS heap 27 MB, 81 textures |

## Multiplayer: staged server load (simulated clients, `LOAD_CLIENTS=1|10|20|30 npm run test:load`)

| Clients | Room tick avg / p95 / max (ms; budget 33) | Snapshots per client per s (target 20) | RTT median / p95 / max (ms) | Join avg / max (ms) |
|---------|------------------------------------------|----------------------------------------|-----------------------------|---------------------|
| 1 | 0.03 / 0 / 1 | 19.5 | 1 / 2 / 2 | 19 / 19 |
| 10 | 0.06 / 1 / 3 | 19.5 | 3 / 6 / 6 | 13 / 30 |
| 20 | 0.06 / 1 / 1 | 19.3 | 4 / 6 / 7 | 20 / 163 |
| 30 | 0.07 / 1 / 1 | 19.3 | 4 / 7 / 8 | 10 / 27 |

The **31st client is rejected cleanly**: "Room … is full (30 players)" at the protocol level and on the menu screen. There were 0 dropped inputs. RTT is local loopback, not internet latency.

## Full combined scene with 30 players (`npm run test:thirty`)

**5 real Chromium pages** (1 observer on High at 1280 × 720, 4 on Low at 640 × 360) + **25 simulated clients**, in one room with the obstacle twist on.

| Check | Result |
|-------|--------|
| Lobby shows 30 taken slots | PASS |
| Observer draws 30 contestant representations | PASS (capsule placeholders: roster blocked) |
| Every real page sees 30 players | PASS |
| All real pages report the same server signal | PASS |
| Results identical on all 5 pages (order and eliminations); 30 rows | PASS: 13 reckless bots spotted, 17 not |
| Obstacle state on the observer (barricades, moving gate) | PASS |
| Memory after forced garbage collection across rejoin cycles | 10.4 → 8.9 → 9.2 → 9.3 MB (flat) |
| Software frame rate (comparison only) | Observer High 0.28 fps; Low pages 0.48–0.73 fps (6 software renderers on 4 cores) |

Runs: 3. Two passed. One timed out waiting for all pages to see 30 players. It was not reproduced, and the test now records per-page counts on timeout (known issue K10).

## Regression (all on the final code)

| Suite | Result |
|-------|--------|
| `npm run build`, `npm run typecheck` | PASS |
| `npm test` (49 unit tests: movement, round, metadata, stage integration, obstacles, Watcher clips, quality steps) | PASS |
| `npm run test:round` (signals, spotting, late joiner, tournament R3 / R4) | PASS |
| `npm run test:obstacles` (server-enforced barricade; rollback) | PASS |
| `npm run test:load` (30 clients, client 31 rejected) | PASS |
| `npm run test:e2e` (2 browsers: assets, sync, clips, detection beam, spectator, results) | PASS |
| `npm run test:quality` (effects per tier, default High, adaptive fallback) | PASS |
| `npm run test:ui` (18 screens and states incl. room full and connection lost) | PASS |
| `npm run test:thirty` | PASS (2 of 3 runs; see above) |
| Blender asset pipeline (`test` CI job) | Unchanged by Stage 1.5; runs in CI on the pull request |

`test:thirty` is not in CI: it needs about 20 minutes of six software renderers.

## Not verified here

- Frame rate, frame time, 1 % lows and GPU time on real hardware.
- 30 real people playing together.
- Internet latency (only local loopback).
- Disconnect and reconnect against the deployed edge. Locally, the connection-lost state and the Reconnect button are tested. Reconnecting rejoins as a new player (K7).
- Character appearance sync (no roster).
