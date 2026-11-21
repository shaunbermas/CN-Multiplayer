# M0 technical spike and Stage 01 walk test (S1-3)

Date: 21 November 2026. Build: `m0/spike-walk-test`. Everything below was run in a Claude cloud
session (Linux, 4 CPU cores, no GPU; browsers use software WebGL) and is re-run by CI on every pull
request.

## M0 exit gate (GDD §10)

| Gate item | Result | Evidence |
|-----------|--------|----------|
| Repo structure with client, server and shared code | Done: `apps/web`, `apps/server`, `packages/shared` (npm workspaces) | README |
| Stable dependency versions | Done, exact pins | `docs/adr/0003-stack-versions.md` |
| Render one Blender GLB in the browser | Done: Stage 01 greybox loads in the web app | screenshots below |
| Two browser clients in one room | **PASS**: two Chromium browsers join one room and see each other move | `tests/reports/e2e-two-browsers.json` |
| 30 simulated clients | **PASS**: 30 clients joined, each sees 30 players; 31st rejected ("room is locked") | `tests/reports/load-30-clients.json` |
| Architecture decision record | Done | `docs/adr/0001` (physics), `0002` (hosting, owner decision), `0003` (versions) |
| Known-risk list | Below | |

### 30-client numbers

| Measure | Result | Budget |
|---------|--------|--------|
| Join time per client | avg 2.9 ms, max 5.9 ms | — |
| Server simulation tick (30 players, 30 Hz) | avg 0.10 ms, p95 0.17 ms, max 8 ms | 33 ms per tick |
| State updates received per client | 19.9 per second | 20 (Colyseus default 50 ms) |
| Inputs dropped by the rate limit | 0 of 36,630 | — |

The 30-client test proves the server and networking side. It is not the GDD's 30-player *rendering*
test (M4), which needs 30 animated characters on the agreed reference desktop.

## S1-3 walk test

| Check | Result |
|-------|--------|
| Straight walk, front-row spawn to finish (162 m at 4 m/s) | **40.6 s** server-recorded |
| Projected crossing with red/green signals (spec §3 average cycle) | about **71 s**, inside the 120 s timer as the spec intended (target about 70 s) |
| Standup Quick length (15 s briefing + 3 s countdown + round + 20 s results) | about 2 to 2.6 minutes |
| Walls | Players cannot leave the yard (unit test) |
| Prediction vs server after a 4 s walk | 0.000 m difference |
| The Shepherd visible from every spawn | Yes (Blender sightline check, all 30) |
| The Shepherd readable from the start line | **Weak**: about 1/10 of the screen height at 192 m, partly behind the finish gate beam |

Screenshots (`tests/reports/screenshots/`): `s1-3_start_view.png` (third-person view at spawn),
`s1-3_after_walk.png`, `s1-3_other_player_view.png` (second browser watching the first player).

**Resolved (decision 014):** The Shepherd is now 28 m tall, and the HUD objective moved to the bottom of
the screen because it covered The Shepherd's head. From the start line it now fills about 1/7 of the
screen height (was about 1/10) and stands above the yard and the buildings behind it
(`s1-3_start_view.png`, rebuilt with the 28 m Shepherd).

## Known risks after M0

| Risk | Status |
|------|--------|
| Hosting | Constraint set (Cloudflare + GitHub only); option to confirm in `docs/adr/0002-hosting.md` |
| Red-light latency fairness | Not yet tested; server timestamps and grace window come with S1-4 |
| 30 characters rendering on weaker laptops | Not tested (needs character art and reference hardware, M4) |
| Client bundle 1.36 MB (383 KB gzipped) | Acceptable for now; split three/drei chunks before release |
| Colyseus 0.16 vs newer 0.18 | Pinned deliberately; plan an upgrade after M2 |
