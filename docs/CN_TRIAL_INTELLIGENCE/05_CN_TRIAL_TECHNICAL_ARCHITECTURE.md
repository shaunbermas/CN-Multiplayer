# CN TRIAL · 05 Technical Architecture

Audit date 24 Nov 2026, `main` @ `7ccb1ba`. Labels: see 01. Everything below was read from the code unless marked
otherwise. Test results from this audit's own runs are in 08 §1.

## 1. System overview

```
Browser (apps/web)                         Cloudflare (one Worker, wrangler.jsonc "cn-trials")
┌──────────────────────────────┐   WSS     ┌───────────────────────────────────────────────┐
│ React 19 UI (menu, HUD)      │ ───────▶  │ worker.ts: static assets + /api routing       │
│ R3F 9 / three 0.187 scene    │  inputs   │   /api/health                                 │
│ Predictor (shared movement)  │ ◀───────  │   /api/room/<code>/ws  → Durable Object       │
│ RoomClient (shared)          │ snapshots │ TrialRoom (room.ts), one per room code:       │
└──────────────────────────────┘  20 Hz    │   30 Hz fixed-step sim, RoundEngine, Tournament│
            ▲                              └───────────────────────────────────────────────┘
            │ GLB / WebP (static assets, meshopt)        ▲
packages/shared: movement, round, obstacles, stages, protocol, client, colourways (used by both sides)
blender/ → exports (GLB, metadata JSON, lighting JSON) → imported by packages/shared and apps/web at build time
```

| Layer | Path | Notes |
|---|---|---|
| Client | `apps/web` (Vite 7.3.8, React 19.2.9, R3F 9.8.2, drei 10.7.9, three 0.187.0) | `App.tsx` shell → lazy `GameView.tsx` → `game/Scene.tsx` + `stages/stage01/*` + `ui/GameHud.tsx` |
| Server | `apps/server` (Worker + Durable Object `TrialRoom`, SQLite-backed class, Free plan) | `worker.ts`, `room.ts`, `env.ts` |
| Shared | `packages/shared` | Pure, deterministic rules used by server and client prediction |
| Assets | `blender/` | Scripts are the source; `.blend`, GLB, images in Git LFS (009) |
| Tools | `tools/asset-check`, `tools/stage15`, `tools/diagrams` | glTF validation, compression, matte generation |
| Tests | `vitest` unit tests; `tests/` integration, load and browser suites | See §7 |
| Versions | Pinned exactly; `docs/adr/0003-stack-versions.md` | Node ≥ 22 |

## 2. Multiplayer model (GDD §7.3)

| Aspect | Implementation | Evidence |
|---|---|---|
| Authority | Server owns positions, signals, detection, finish, results. Client sends `{t:'input', seq, mx, mz, yaw}` only | `protocol.ts`, `room.ts` |
| Simulation | 30 Hz fixed step counted from the wall clock (accumulator, max 8 steps per timer, 0.25 s cap) so input queues never lag into a red light | `room.ts` `tick` (decision 020) |
| Anti-cheat | Inputs sanitised to length ≤ 1; token bucket (1 step per tick, burst 4); queue cap 60; message cap 4 KB; client cannot claim a finish or position | `room.ts`, `movement.ts` `sanitizeInput` |
| Snapshots | 20 Hz JSON rows `[id, x, z, vx, vz, yaw, ack, status, finishTime]` | `SNAPSHOT_MS = 50` |
| Prediction | Local player predicted with the shared `step`; reconciled on each ack (replay unacked inputs); obstacles included | `apps/web/src/game/predictor.ts` |
| Latency | Server probes every 2 s; smoothed one-way latency extends the red grace window (cap 0.5 s) | `room.ts` `probe`, `round.ts` `graceFor` |
| Protocol | Version 6, checked on join (`error: version`, close 4002) | `PROTOCOL_VERSION` |
| Rooms | Code `[a-z0-9-]{1,32}`; client creates 5-character codes; 31st player rejected (close 4001) | `worker.ts`, `net.ts` |
| Host | First joiner; transfers to the earliest remaining joiner | `room.ts` `leave` |
| Late joiners | Status `waiting` on a bench; join the next round | `room.ts` `join`, `toBench` |
| Colourways | Dealt at join, unique, kept per opaque browser key for the room's lifetime (≤ 200 keys) | `room.ts`, `contestantColorways.ts` |
| Emotes | Lobby or finished players only, ≥ 0.7 s apart, rebroadcast, never move anyone | `room.ts` |
| Test mode | `CN_TEST=1` allows seed, round length, briefing length, obstacles off, metrics reset | `room.ts` |
| Observability | JSON `console.log` events (join, leave, round_start, results); Cloudflare observability enabled; `/api/room/<code>/health` returns tick timing and input counts | `room.ts`, `wrangler.jsonc` |

## 3. Client architecture

| Module | Role |
|---|---|
| `App.tsx` | Menu → join → game; connection lost / full / version states; invite `?room=`; test `?name=&autojoin=1` |
| `net.ts` | Room URL (same origin; `?server=` override), room code generation, invite link, opaque player key (localStorage, try/catch) |
| `game/Scene.tsx` | Canvas, camera follow, contestant instances, LOD budget per frame, test hooks (`window.__cn*`) |
| `game/contestant.ts` | Shared contestant loading, per-player skeleton, colour shader, animation state machine, LODs |
| `game/groundFx.ts` | Pooled dust/splash particles and ripples |
| `game/quality*.ts` | Tiers Low/Medium/High, DPR cap 1.5, adaptive step-down below 45 fps, `?quality=` pin |
| `stages/registry.ts`, `stages/stage01/*` | Stage scene modules: environment GLB, Watcher, atmosphere, surroundings, trees, obstacles, Watcher FX, fog |
| `ui/*` | Menu, HUD, settings (localStorage) |

## 4. Content pipeline

1. Blender 5.3.0 scripts (`blender/scripts/*.py`, headless `bpy==5.3.0`, decision 011) build scenes from JSON specs.
2. Exports: GLB, `STAGE_01_METADATA.json` (gameplay data), `STAGE_01_LIGHTING.json`, asset manifests.
3. Validation scripts (`validate_*.py`) and `tools/asset-check/*.mjs` (Khronos glTF Validator + headless Three.js).
4. Runtime copies: meshopt compression and derivation (`tools/stage15/compress_glb.sh`, `tools/stage15/glb/*.mjs`).
   Approved originals are never overwritten.
5. Vite imports the runtime GLBs and WebPs by URL; the shared package imports metadata JSON at build time.

## 5. CI and deployment

| Workflow | Trigger | Jobs |
|---|---|---|
| `.github/workflows/checks.yml` | Pull requests | `test` (Blender validation of greybox, metadata rebuild diff, environment export + browser check, Watcher export + validation, contestant validation, greybox rebuild diff, glTF validator); `app` (typecheck, unit tests, build, wrangler dry run, load, round, e2e, obstacles, colorways, ui, quality) |
| `.github/workflows/deploy.yml` | Push to `main` | Build, `wrangler deploy` with `CLOUDFLARE_API_TOKEN`, smoke test `/api/health` |

Last runs (GitHub Actions, VERIFIED via API): Checks run 37 on PR #22 **success**; Deploy run 17 on `main` @ `7ccb1ba`
**success** (22 Nov 2026 07:04 UTC). `main` has no required checks (CLAUDE.md).

Not in CI: `test:thirty` (about 20 minutes of six software renderers), `test:contestant-perf`, `tests/e2e/views.mjs`.

## 6. Performance (measured, with limits)

| Measure | Value | Source |
|---|---|---|
| Menu chunk / game chunk | 324.8 KB (79.4 KB gzip) / 1,570 KB (463 KB gzip) | This audit's `npm run build` (Vite warns the game chunk is over 1,500 KB) |
| Runtime models | Environment 2,310 KB, Watcher 1,347 KB, contestant 764 KB | This audit's build output |
| Textures shipped | Matte 186 KB, tree atlas 221 KB, contestant 162 KB | Build output |
| Server tick, 30 clients | See 08 §1 (this audit's `test:load`) | `tests/reports/load-30-clients.json` |
| Draw calls High + 30 players | 232 (software renderer, before decision 031) | P08 report |
| Real-GPU FPS, frame time, 1 % lows | **NOT MEASURED** (no GPU in the build environment; K2) | — |
| Internet latency / deployed-edge behaviour | **NOT MEASURED** (local `wrangler dev` only) | — |

## 7. Technical problems and risks found in this audit

None of these were changed. Each has a PROPOSED safe correction.

| # | Severity | Finding | Evidence | PROPOSED correction |
|---|---|---|---|---|
| T1 | Medium (latent; becomes a bug with Stage 02) | `geo` and `OBSTACLES` are **module-level variables** in `room.ts`, reassigned in `startRound`. Cloudflare can run several Durable Object instances in one isolate, so once `TOURNAMENT_ORDER` has two stages, one room starting a round could change another room's geometry mid-round. Also, `RoundEngine` keeps the geometry it was constructed with (`constructor(private geo)`), so after `startRound` switches `geo` to a new stage, finish and ranking would still use the old stage's geometry. Harmless today because every room uses Stage 01 | `apps/server/src/room.ts` lines 14–17, field `engine`, `startRound`; `packages/shared/src/round.ts` `RoundEngine` constructor | Move both to `TrialRoom` instance fields and build a new `RoundEngine` (or pass geometry to `start`) per stage before adding Stage 02; add a two-room, two-stage test |
| T2 | Medium | Reconnect rejoins as a **new player** (mid-round: waits until the next round). GDD §6.2 / §8 ask for a grace-period resume | `room.ts` `leave`; known issue K7 | Session token + grace period (protocol change) |
| T3 | Medium | Room state lives only in memory. A deploy (every merge to `main`) or Durable Object eviction ends live rooms; clients see "Connection lost" | Design of `room.ts` (no storage) | Avoid merging during team sessions; later, persist minimal room state or show a friendly "updated" message |
| T4 | Low | Game chunk 1.57 MB minified (Vite size warning) | Build log | Split drei/three extras or postprocessing into separate chunks |
| T5 | Low | `tests/reports/*.json` and screenshots are committed and rewritten by every local test run, so test runs create large noisy diffs | `git status` after running suites | Write local runs to an ignored folder; keep CI artifacts |
| T6 | Low | Host can start alone and without an all-ready warning (GDD §6.2 asks for an explicit override after a warning) | `room.ts` `startRound`, `GameHud.tsx` | Add a confirm when not everyone is ready |
| T7 | Low | Joins are not locked when a tournament starts (late joiners wait instead). Acceptable for Standup; revisit for multi-stage tournaments | `room.ts` `join` | Decide with the tournament milestone |
| T8 | Info | `yaw` from the client is only checked for finiteness (cosmetic; facing is derived from movement since 031) | `room.ts` `simStep` | Clamp or drop the field in a future protocol version |
| T9 | Info | Fog value source of truth is split between JSON and code | 01 §9 C7 | Document or regenerate |
| T10 | Info | `test:thirty` had 1 timeout in 3 runs on 21 Nov (K10); not in CI | Known issues | Run on a faster machine before a 30-person session |

## 8. Security and privacy notes

- No accounts, no personal data stored; the player key is an opaque random token kept for the room's lifetime only.
- Room codes are guessable in principle (31^5 ≈ 28.6 million codes for generated ones); fine for an internal game.
- The Cloudflare account id in `deploy.yml` is not a secret; the API token is a repository secret.
