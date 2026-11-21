# ADR 0003: Pinned stack versions for M0

Status: ACCEPTED (21 November 2026). GDD §7.2 asks for a stable, compatible, pinned release set.

| Area | Package | Version | Why this line |
|------|---------|---------|---------------|
| Server | `@colyseus/core`, `@colyseus/ws-transport` | 0.16.26, 0.16.5 | Mature 0.16 line with documented APIs. Colyseus 0.18 is newer; upgrade deliberately after M2 |
| State sync | `@colyseus/schema` | 3.0.76 | Matches Colyseus 0.16 |
| Client SDK | `colyseus.js` | 0.16.22 | Matches the 0.16 server |
| Renderer | `three` | 0.187.0 | Current release; WebGL 2 baseline (GDD §7.2) |
| React renderer | `@react-three/fiber`, `@react-three/drei` | 9.8.2, 10.7.9 | Stable R3F line for React 19 (v10 is alpha, GDD §7.2) |
| UI | `react`, `react-dom` | 19.2.9 | Pairs with R3F 9 |
| Build | `vite`, `@vitejs/plugin-react` | 7.3.8, 5.2.0 | Stable line; Vite 8 is newer, upgrade later |
| Language and tests | `typescript`, `vitest`, `tsx` | 5.9.3, 3.2.7, 4.23.15 | Stable lines; TypeScript 7 and Vitest 5 are very recent |
| 3D source | Blender / `bpy` | 5.3.0 | Owner's desktop version (decision 002) |
| Browser tests | `playwright` | 1.63.0 | Preinstalled in Claude cloud sessions; pinned in CI |

All versions are exact in `package.json` files and locked in `package-lock.json`.
