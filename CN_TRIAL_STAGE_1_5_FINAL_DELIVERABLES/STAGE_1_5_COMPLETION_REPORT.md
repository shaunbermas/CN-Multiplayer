# CN TRIAL · Stage 1.5 completion report

21 November 2026. Executed autonomously as briefed, Prompts 01 to 08 in order. Branch `claude/stage-1-5`; **not deployed**.

## Summary by prompt

| # | Prompt | Outcome |
|---|--------|---------|
| 01 | Preflight, baseline, character lock | Audit, baseline metrics and screenshots, asset inventory, reference boards preserved (SHA-256 verified). **No canonical roster in the project, and the six boards conflict; contestant workstream stopped** as the lock register requires |
| 02 | Matte painting and surrounding world | Procedural layered panorama (hills, industrial skyline, forest line), 8-tree cutout atlas, 1,100 billboards placed from the approved scene's footprints; 4 draw calls |
| 03 | Foreground polish, tree LODs | Night-sky environment map (puddles reflect; metal and wet surfaces read), 49 lit tree impostors at the approved positions, cone trees removed, 3-band tree LOD rule |
| 04 | Atmosphere, lighting, VFX | Sky dome (moon, stars, clouds), sky-matched fog, light cones, ground mist, signal wash, bloom + grade on High, all tiered |
| 05 | Obstacle twist | Barricade rows (mirror-symmetric, 6 m gaps) and a gate that moves only on green, enforced by the server, host toggle (rollback). Verified against the real server |
| 06 | Contestants + Watcher | Contestants **blocked**. The Watcher is polished without design change: lens glow, server-driven detection beam and ring, red-light searchlight |
| 07 | UI/UX | Complete CN TRIAL flow: menu, how to play, settings, private rooms and invites, 30-slot lobby with ready, character select (roster pending), HUD, red-light feedback, spectator, results, connection states |
| 08 | Optimisation, QA | Menu chunk 1.61 MB → 325 KB; stage models 8.71 → 3.89 MB; 30-player draw calls −60; staged 1 / 10 / 20 / 30-client server tests; 30-player combined scene with 5 real browsers; full regression green |

## What was tested
See `QA_MATRIX.md` and `docs/stage15/P08_OPTIMIZATION_QA_REPORT.md`. All automated suites pass on the final code:
- 49 unit tests;
- round, obstacles, load, two-browser, quality, UI walkthrough;
- the 30-player scene (2 of 3 runs).

## What is unverified
1. Frame rates on real GPUs. Everything here is software rendering on a GPU-less cloud machine.
2. 30 real people playing together. The 30-player test is 5 real browsers + 25 simulated clients.
3. Internet latency and the deployed edge. Tests ran against local `wrangler dev`.
4. The 30 final characters. Blocked by the roster decision.

## Is Stage 01 ready for Stage 02 (Tug of War)?

**Not yet.** Technically, Stage 01 is in good shape:
- the rules, the server authority, the multiplayer flow, the UI and the visual polish are complete and tested;
- the stage registry and tournament manager are ready for a second stage.

But the Stage 1.5 definition of done is not met on three items that need you, not more code:

1. **Characters (blocker):** choose the canonical 30-character roster and settle the originality issue (`docs/CHARACTER_ROSTER_DISCREPANCY_REPORT.md`). The 30 models, thumbnails and selection follow from that.
2. **Real-hardware check:** run the build on one or two named computers and confirm High (or the adaptive fallback) is smooth.
3. **Playtest:** a real 20–30-person session.

You also need to approve the Stage 1.5 visuals and decisions (027), and the merge. Merging deploys publicly.

Stage 02 work could start in parallel on the shared systems (stage registry, tournament flow, UI) if you want, but the brief says not to begin Stage 02 before Stage 1.5 sign-off.
