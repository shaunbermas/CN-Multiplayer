# CN TRIAL · Stage 1.5 QA matrix

**Legend:**
- **PASS**: automated test passed on the final code.
- **PASS (visual)**: inspected in screenshots.
- **UNVERIFIED**: could not be executed in this environment.
- **BLOCKED**: waiting on an owner decision.

| Area | Check | Method | Result |
|------|-------|--------|--------|
| Core rules | Green move / red stop, grace window, server spotting, finish, ranking | `test:round`, `test:e2e`, unit | PASS |
| Core rules | Tournament target (R3) and fallback (R4) | `test:round`, unit | PASS |
| Rooms | Create a private room, join by code, invite link, room code shown | `test:ui` | PASS |
| Rooms | 31st player rejected cleanly (protocol and UI) | `test:load`, `test:ui` | PASS |
| Lobby | 30 slots, host ★, ready ✓, host start, mode toggles | `test:ui`, `test:thirty` | PASS |
| Character | 30 final contestants selectable and synchronised | — | **BLOCKED** (roster) |
| Sync | Movement prediction matches the server (0 m error after a walk) | `test:e2e` | PASS |
| Sync | Same signal and identical results on 5 real browsers in a 30-player room | `test:thirty` | PASS |
| Obstacles | Server stops a player at a barricade; rollback flag restores the original course | `test:obstacles` | PASS |
| Obstacles | Mirror symmetry, 6 m gaps, ≤ 10 m detour, gate frozen on red | unit (8) | PASS |
| Obstacles | 30 real players funnelling through the gaps | — | UNVERIFIED |
| Watcher | Clips follow the server; detection beam from the lens anchor after a spot | `test:e2e` | PASS |
| Watcher | 28.0 m, 9 clips, anchors, feet at the root (also from the compressed GLB) | in-browser asset checks (`test:quality`, `test:e2e`) | PASS |
| Watcher | Red / amber / green presentation | screenshots `p04_atmosphere/signal_*` | PASS (visual) |
| Environment | Matte layers and cutouts load; tree impostors; environment map; cone trees stripped | `test:quality` | PASS |
| Environment | No flat-card reveal or horizon seam from gameplay views | screenshots (7 viewpoints) | PASS (visual) |
| Atmosphere | Exactly the effects per tier (Low / Medium / High) | `test:quality` | PASS |
| Performance | Default starts High; adaptive fallback steps to Low on a slow renderer | `test:quality` | PASS |
| Performance | Real-GPU FPS, frame time, 1 % lows | — | UNVERIFIED (no GPU) |
| Performance | Server tick and snapshots at 1 / 10 / 20 / 30 clients | `test:load` (staged) | PASS |
| Performance | Memory stable across rejoin cycles | `test:thirty` | PASS |
| UI | Menu, how to play, settings, briefing, countdown, HUD, scanning, feed, spotted, spectator, results | `test:ui` (18 steps) | PASS |
| UI | Connection lost → Reconnect; room full; update needed | `test:ui` (lost, full); code review (version) | PASS / version state not executed |
| UI | Keyboard focus visible; signals use word + icon | `test:ui` screenshot, review | PASS (visual) |
| Console | No console errors in the browser suites | all browser suites | PASS |
| Assets | Approved `.blend` / GLBs unchanged; reference boards SHA-256 intact | git history, `sha256sum -c` | PASS |
