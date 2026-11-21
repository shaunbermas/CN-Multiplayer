# CN Trials

A desktop browser 3D multiplayer elimination game for the Creative Nomads team: a quick icebreaker at
standups (Standup mode) and a seven-round tournament for team events. Up to 30 players in a private
invite-link room. Formerly titled THE LAST TRIAL.

Status: M0 technical spike done; Stage 01 greybox walkable in the browser with multiplayer (walk test build). See `docs/reports/M0_S1-3_REPORT.md`.

| Read | For |
|------|-----|
| `docs/GAME_DESIGN_DOCUMENT.md` | Canonical rules and scope (v0.2) |
| `docs/DECISIONS.md` | What has been decided and what is open |
| `docs/STAGE_01_DESIGN_SPEC.md` | Stage 01 environment design: layout, The Shepherd, props, cameras, assets, lighting (approved) |
| `docs/STAGE_01_GREYBOX_REPORT.md` | Stage 01 greybox: files, dimensions, coordinates, validation (awaiting approval) |
| `docs/STAGE_01_SPEC.md` | Stage 01 numbers, states and rules (draft for approval) |
| `docs/STAGE_01_PRODUCTION_PLAN.md` | First stage: Red Light, Green Light with The Shepherd |
| `docs/reports/M0_S1-3_REPORT.md` | Technical spike and walk test results |
| `docs/adr/` | Architecture decisions (physics, hosting, versions) |
| `docs/BLENDER_PIPELINE.md` | Blender 5.3.0 conventions, export and validation |
| `docs/REFERENCE_MANIFEST.md` | Concept images and what each may be used for |

Stack: React + Three.js / React Three Fiber (client), Cloudflare Worker + Durable Objects (server), Blender → GLB (assets).
Live: https://cn-trials.shaun-bermas.workers.dev (deployed from `main` by GitHub Actions).
Versions: `docs/adr/0003-stack-versions.md`.

## Run it locally

Needs Node.js 22+. One command runs the same Worker that Cloudflare runs (page and rooms together):

```bash
npm install
npm run build
npm run dev:server
```

Open http://localhost:8787, enter a nickname and join. Open a second tab to see two players.
WASD to move, click to look around, R to respawn.

For live-reloading the client while you work on it, keep `npm run dev:server` running and also run
`npm run dev:web`, then open http://localhost:5173 (it forwards `/api` to the Worker).

## Deploy

Merging into `main` deploys: `.github/workflows/deploy.yml` builds the client and runs `wrangler deploy`
with the `CLOUDFLARE_API_TOKEN` repository secret.

## Layout

| Folder | What |
|--------|------|
| `apps/web` | Browser client (Vite, React, React Three Fiber) |
| `apps/server` | Cloudflare Worker: serves the client and runs each room as a Durable Object (authoritative movement, `/api/room/<code>/health`) |
| `packages/shared` | Code both sides use: movement, stage data, messages, constants |
| `blender/` | Blender scripts, scenes and exports (`blender/README.md`) |
| `tests/` | Load test (30 clients), end-to-end test (two browsers), reports |
| `tools/asset-check` | glTF validation and browser check for stage exports |

## Tests

```bash
npm test
```

```bash
npm run test:load
```

```bash
npm run test:e2e
```

Unit tests, 30-client load test with walk timing, and two-browser test. CI runs all of them, plus the
Blender asset checks, on every pull request.
