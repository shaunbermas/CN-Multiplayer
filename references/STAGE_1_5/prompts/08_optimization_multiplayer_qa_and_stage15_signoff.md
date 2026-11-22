# PROMPT 08 — Optimization, 30-Player QA and Stage 1.5 Sign-off

Complete CN TRIAL Stage 1.5 by profiling, optimizing and testing the full polished Stage 01 experience.

## Test full combined scene
- polished arena and matte-painted world;
- PNG tree cutouts / tree LODs;
- ground, fences, towers and props;
- fog, sky, clouds, lighting and VFX;
- approved obstacle twist;
- exactly 30 final contestant models;
- existing approved robotic Watcher;
- complete UI flow;
- actual Colyseus multiplayer room and server-authoritative rules.

## Optimization tasks
1. Compare with Prompt 01 baseline.
2. Profile triangles, draw calls, material count, texture memory, transparent overdraw, shadows and post-processing.
3. Optimize GLB geometry and textures using compatible compression.
4. Add or tune LODs, frustum culling, distance culling and instancing.
5. Reduce distant tree meshes with billboards / matte painting.
6. Tune dynamic lighting, shadows, fog and particles.
7. Improve asset loading and caching without loading unnecessary high-resolution assets at startup.
8. Verify all 30 characters and Watcher remain visually correct after optimization.

## Multiplayer and regression test
Run staged tests with 1, 10, 20 and 30 clients. Test actual browser clients where feasible and simulated clients for load / server capacity. Verify:
- room create / join / invite links;
- player 31 is rejected cleanly;
- character ID and appearance synchronization;
- movement, red/green signal synchronization and server-authoritative detection;
- obstacle state and collision synchronization;
- elimination, qualification and spectator transition;
- disconnect / reconnect;
- UI state and result consistency;
- no critical errors, missing assets or memory leaks.

## Report actual metrics
Record machine specs, browser, resolution, FPS / frame time, 1% lows, memory, GPU / CPU where available, draw calls, triangles, texture memory, build and stage download sizes, loading time, network RTT, server tick / state sync and any bottlenecks. Distinguish measured data from estimates. Do not claim 30-player support without test evidence.

## Sign-off deliverables
- final optimized web build;
- updated Blender / GLB / texture assets;
- character roster and asset mapping;
- UI screenshot set;
- before / after environment screenshots;
- QA matrix and bug report;
- performance benchmark report;
- known-issues register;
- Stage 1.5 release notes;
- `STAGE_1_5_SIGNOFF.md`.

Do not begin Stage 02 until the owner approves the Stage 1.5 sign-off.
