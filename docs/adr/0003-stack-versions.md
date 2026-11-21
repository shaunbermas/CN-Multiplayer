# ADR 0003: Pinned stack versions for M0

Status: ACCEPTED (21 November 2026; server rows updated the same day for ADR 0002). GDD §7.2 asks for a stable, compatible, pinned release set.

| Area | Package | Version | Why this line |
|------|---------|---------|---------------|
| Server runtime | Cloudflare Workers + Durable Objects, `compatibility_date` 2026-10-01 | — | ADR 0002 (replaced Colyseus 0.16 on 21 Nov 2026) |
| Deploy and local server | `wrangler` | 4.158.0 | Same line as `shaun-game`; `wrangler dev` runs the Worker and rooms locally and in CI |
| Worker types | `@cloudflare/workers-types` | 5.20261104.1 | Matches the Workers runtime |
| Renderer | `three` | 0.187.0 | Current release; WebGL 2 baseline (GDD §7.2) |
| React renderer | `@react-three/fiber`, `@react-three/drei` | 9.8.2, 10.7.9 | Stable R3F line for React 19 (v10 is alpha, GDD §7.2) |
| UI | `react`, `react-dom` | 19.2.9 | Pairs with R3F 9 |
| Build | `vite`, `@vitejs/plugin-react` | 7.3.8, 5.2.0 | Stable line; Vite 8 is newer, upgrade later |
| Language and tests | `typescript`, `vitest`, `tsx` | 5.9.3, 3.2.7, 4.23.15 | Stable lines; TypeScript 7 and Vitest 5 are very recent |
| 3D source | Blender / `bpy` | 5.3.0 | Owner's desktop version (decision 002) |
| Browser tests | `playwright` | 1.63.0 | Preinstalled in Claude cloud sessions; pinned in CI |

All versions are exact in `package.json` files and locked in `package-lock.json`.
