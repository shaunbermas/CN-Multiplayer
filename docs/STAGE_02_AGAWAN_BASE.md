# Stage 02 · AGAWAN BASE

Status: **PROPOSED, built in PRs C (#35), D and E (26 Nov 2026).** Decisions 045 and 046.
Source: the owner's `CN_TRIAL_STAGE_02_AGAWAN_BASE_PRODUCTION_HANDOFF.zip` (authoritative for this stage) and the
owner's answers on the plan (decision 045 (6)). Where the zip assumed a two-stage game, the owner's three-stage
order wins: 01 Red Light, 02 Agawan Base, 03 The Hunt.

## 1. Rules

A three-team Filipino street game of tag, prison, rescue and base raid on a Philippine Christmas street at night.
Every number below lives in `packages/shared/src/agawan/config.ts` (the pack: "one Stage 02 configuration object").

| Rule | Value |
|---|---|
| Teams | A (purple `#A16FCD`), B (cyan `#36B2C9`), C (magenta `#D56FA0`), up to 10 each, sizes within one. Picked in the lobby before Stage 01, one captain each (or host Auto-pick captains), locked for the whole match. At least 3 players (bots count). |
| Match | 4:00. Everyone starts at their own base. |
| Tag (hold `E`) | An opponent within 1.5 m, inside a 60° half-angle cone in front of you, with clear line of sight, held for 0.45 s. 1.75 s cooldown after a tag. |
| Prison | The tagged player is moved to the tagging team's pen (5 x 4 = 20 fixed slots, see-through fence). They cannot move, tag, rescue or score. Automatic release after 15 s. |
| Rescue (hold `E`) | A teammate held in an opponent's pen, within 1.5 m with sight through the fence, held for 1 s. A rescue and the automatic release can never both happen. |
| Protection | 2 s after a release or rescue: you cannot be tagged and cannot tag, rescue or raid. |
| Base raid (hold `E`) | Inside the 3 m ring of an opponent's marker for 1.5 s. A tag on the raider cancels it. 20 s cooldown per attacking team and target base (A's cooldown on B never blocks C on B). |
| Team score | +5 per raid; +1 for the first tag of each opponent and +1 for the first rescue of each teammate (once per team per player per match, so farming scores nothing). |
| End | Highest team score. A tie at the top plays 30 s of sudden death in which the first raid by a tied team wins. Then raids, unique tags, unique rescues, then a shared place. |
| Individual board | Every member gets 2 / 1 / 0 by team place, like the other stages (secondary board). |
| Team championship | 3 / 2 / 1 per stage for every stage of a match with teams (§4). |

## 2. Map

`packages/shared/src/agawan/layout.ts`: a 96 x 80 m block from the pack's map, game coordinates with the plaza at the
origin (`gameX = packX - 48`, `gameZ = 40 - packZ`). Bases at A (0, -28), B (-32, 28), C (32, 28); pens on the plaza
side of each base with the gate facing the plaza. Three main streets of about 65 m (equal within 5 %), side alleys
to the plaza, two approaches per base. Cover from the pack's obstacle CSV, mirrored so every street gets the same.
Positions that differ from the CSV are marked "moved" in the file (a point inside a house or one that sealed a
street). The plaza tree has a 2.4 m planter collider. Unit tests check spawns, pen slots, sight through the fences,
route lengths, clear width along the routes and the two approaches per base.

## 3. Server and bots

- `AgawanEngine` (`agawan/agawan.ts`) implements the shared `StageEngine`. The room runs it at 30 Hz and builds
  it fresh per stage. Inputs are only "hold E" or "release E"; the server checks reach, facing, sight, state and
  cooldowns on every tick. Snapshots carry the public state (scores, prisoners, cooldowns, teams) and each
  socket's private state (`ag`); tags, rescues, releases and raids go out as feed events.
- Bots (`agawan/agawanBots.ts`) only use what a person can see. About 45 % are raiders: a team's raiders gather on
  a flank of the same enemy base and rush it together, so a defender who can tag one at a time lets one through.
  About 22 % are defenders, who guard their base and pen. The rest are rovers, who free teammates and hunt
  rivals. Anyone tags a rival who walks into reach.

## 4. Team championship

`packages/shared/src/teamChampionship.ts`, turned on for every match with Agawan Base in it.

- Stage 01 and Stage 03: teams are ranked by the average of their members' unchanged individual points. The
  denominator is the stage's roster, everyone the stage started with: someone who disconnects still counts, and a
  missing score counts as zero.
- Agawan Base: teams are ranked by the engine's team place.
- Points: 1st 3, 2nd 2, 3rd 1. Ties share the place and skip the next one (3, 3, 1).
- Overall: most championship points. Ties go to the higher Agawan Base score, then the higher Stage 01 team
  average, then joint champions.
- The final results lead with the team champion. Each stage's results show the team table. The individual board
  stays below.

## 5. Client

- `apps/web/src/stages/agawan/` contains the street, built in code from the shared layout (`streetKit.ts`):
  - row houses with lit windows, doors, awnings and eave lights
  - parols and string lights on wires across the streets, plus light drops
  - jeepney, tricycle, sari-sari kiosk, stall, food cart, jersey barriers and crates
  - the plaza tree with spiral lights
  - team arches and markers with big parols, and chain-link pens
- Draw calls: all solids are merged into one vertex-coloured mesh, all self-lit surfaces into one unlit mesh, and
  bulbs and glows into two point clouds. Wires take one line set and light pools one instanced mesh. The scene
  has three lights and no real-time point lights.
- HUD (`apps/web/src/ui/AgawanHud.tsx`), after the pack's reference in the existing frosted style:
  - timer and team scores
  - your team and base status
  - a "Hold E" prompt only when something is in reach
  - raid, rescue, release and "teammate needs help" banners
  - Tab for the team status board
  - Agawan results: team ranking, raids, captures, rescues, MVP
- Team identity: a team-coloured ring on the ground and the team letter on the name tag. Coats are untouched.
- Sound: the existing synth with a light Christmas bell motif, and tag, rescue and raid cues.

## 6. Performance (honest numbers)

See §8. Everything was measured in the cloud container: headless Chromium with SwiftShader software rendering,
and the Worker under `wrangler dev`. **No Intel Mac was tested.** Frame rates from software rendering say nothing
about a real GPU; draw calls, triangles, server tick time and bytes on the wire carry over.

## 7. Tests

- `npm test`:
  - `packages/shared/test/agawan.test.ts` (20 tests): map, tag, prison, rescue, raid, end, sudden death, bots
  - `teamChampionship.test.ts` (5 tests)
- `npm run test:agawan`: 30-player room with 3 people and 27 bots in the real Worker. Covers bots tagging,
  rescuing and raiding, a reconnect, results, captains, and two rooms at once.
- `npm run test:e2e:agawan`: real browser. Covers the street, the HUD, the Tab board, the results screen and
  page errors.

## 8. Measurements

Measured on 26 Nov 2026 in the cloud container, with no real GPU:
- Browser: headless Chromium (Playwright) with SwiftShader software rendering, 1440 x 900 viewport, Low tier.
- Server: the Worker under `wrangler dev`.
- Players: 30 is 1 person plus 29 server bots. No 30-person test with real people was run.

| What | Agawan Base | Stage 01 yard (same 30 players, same tier) |
|---|---|---|
| Draw calls per frame | 63 | 132 |
| Triangles per frame | 135 k | 236 k |
| Points (bulbs and glows) | 4,973 | 1,426 |
| JS heap | 51 MB | 45 MB |
| Frame rate | 2.5-2.9 fps (software rendering, not meaningful) | about 1 fps (software rendering, not meaningful) |
| Server tick, 30 players (27 bots) | avg 0.4 ms, p95 1 ms, max 9 ms | (unchanged) |
| Snapshot size, 30 players | about 2.5 KB at 20 Hz, about 50 KB/s per client | (unchanged) |

So on the same machine, Agawan Base draws about half the calls and triangles of Stage 01. That says it should run
at least as well as Stage 01 on the same machine, but it is an inference, not a measurement: **someone needs to play
it on an Intel Mac to confirm**. All three stages on every tier: `docs/PERFORMANCE.md`. The tick and snapshot numbers come from `npm run test:agawan` (`/health`).

## 9. Rollback

`AGAWAN_ENABLED = false` in `packages/shared/src/constants.ts` puts the menu back to "Coming soon" and matches back
to Stage 01 then Stage 03 with the individual winner. Nothing else needs to change.
