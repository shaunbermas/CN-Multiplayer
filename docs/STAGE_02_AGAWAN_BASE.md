# Stage 02 · AGAWAN BASE

Status: **PROPOSED, built in PRs C (#35), D and E (26 Nov 2026); rules reworked by decision 047 (owner's playtest, 26 Nov 2026).** Decisions 045, 046 and 047.
Source: the owner's `CN_TRIAL_STAGE_02_AGAWAN_BASE_PRODUCTION_HANDOFF.zip` (authoritative for this stage) and the
owner's answers on the plan (decision 045 (6)). Where the zip assumed a two-stage game, the owner's three-stage
order wins: 01 Red Light, 02 Agawan Base, 03 The Hunt.

## 1. Rules

A two- or three-team Filipino street game of tag, prison, rescue and base takeover on a Philippine Christmas street at night.
Every number below lives in `packages/shared/src/agawan/config.ts` (the pack: "one Stage 02 configuration object").

| Rule | Value |
|---|---|
| Teams | A, B and C (up to 10 each), or A and B only (up to 15 each) when the host picks 2 teams (decision 049); sizes within one. With 2 teams base C and its pen are closed: grey, not capturable, not in the HUD. Colours are dealt at random per match (12-colour palette, hues at least 70° apart). The host picks Shuffle (random teams, captains picked automatically) or Pick your team (players join, nominate, host appoints captains). Locked for the whole match. At least one player per team (bots count). |
| Match | 4:00. Everyone starts at their own base, which their team owns. |
| Hearts and hits (tap `E`) | Every player has 3 hearts. Each press on a rival within 2 m, inside a 70° half-angle cone in front of you, with clear line of sight, takes one heart and pushes them back a little. 0.35 s between hits; holding E repeats every 0.5 s. Teammates never knock each other down. |
| Capture and prison | The last heart captures: the player is moved to the attacker's pen (5 x 4 = 20 fixed slots, see-through fence). They cannot move, hit, rescue or score. No release timer (decision 049): they stay in the pen until a teammate rescues them or the stage ends. |
| Rescue (hold `E`) | A teammate held in an opponent's pen, within 1.6 m with sight through the fence, held for 1 s. The rescued player goes back to their own base. |
| After a rescue | 1 heart only, and 2 s of protection (cannot be hit, cannot hit or rescue). |
| Healing | One heart every 1.2 s, only while standing in a base your team owns (within 6 m of its marker). Never in the street. |
| Base takeover | Stand in the 3.5 m inner ring of a base your team does not own. One attacker takes 12 s, two 7 s, three about 5.2 s, four or more about 4.3 s. With rivals in the ring, the team with more players moves the capture at the speed of its lead (3 against 1 counts as 2); equal numbers pause it. With nobody there, progress fades over 20 s; a new team must first undo another team's progress. The base's original team takes its own base back 1.5x faster. A taken base belongs to the new team (their ring colour, their healing) until someone takes it back. |
| Team score | Base taken +10 (including taking your own back); each base held at the final whistle +5; capture +1; rescue +1. |
| End | Highest team score. A tie at the top plays 30 s of sudden death in which the first base taken by a tied team wins. Then bases held, bases taken, captures, rescues, then a shared place. Early end (decision 050): when only one team has free players and that team owns every base, the stage ends at once (no sudden death) and the results say "Ended early". |
| Individual board | Every member gets 2 / 1 / 0 by team place, like the other stages (secondary board); with 2 teams, 2 / 0. Inside a team's place players rank by contribution (decision 050): bases taken x 10 + captures + rescues, then hits. The results show the top three contributors. |
| Teams outside this stage | None (decision 048): the team setup shows only in an Agawan Base lobby, and a match that starts on another stage deals random teams when it reaches Agawan Base. There is no team championship across stages (§4). |

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
  it fresh per stage. Inputs are only "E down" or "E up"; the server turns each press into one hit and checks reach,
  facing, sight, state and the hit cooldown. Snapshots carry the public state (scores, bases with owner and capture
  progress, prisoners, hearts below full, teams) and each socket's private state (`ag`); hits, captures, rescues,
  releases and base takeovers go out as feed events.
- Bots (`agawan/agawanBots.ts`) only use what a person can see, and press E at a person's pace (0.45 s). Jobs are dealt by place in the team, so every team gets the same mix: about
  half are raiders: a team's raiders gather on a flank of the same enemy base, then stand in its ring together to
  take it fast. A fifth are defenders, who guard their base, stand in its ring when rivals come, and retake it
  when it is lost. The rest are rovers, who free teammates and hunt rivals. A bot at 1 heart (unless it is standing alone in an enemy ring) goes to the nearest
  base its team owns to heal. Anyone hits a rival who walks into reach.

## 4. Team championship (retired by decision 048)

Decision 048 turned the cross-stage team championship off: the match winner is the top individual. The code below
stays in `teamChampionship.ts` but is no longer enabled by the room.


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

- Painted backgrounds and textures (decision 050), generated by `tools/stage02/generate_street_art.py` (numpy +
  Pillow, fixed seeds, no photographs or AI images) into `art/stage02/source/*.png` and
  `blender/exports/stage02/*.webp` (`STAGE_02_ART.json` holds placement and atlas cells):
  - `MP02_FarTown` (140, tiled 2x) and `MP03_Barangay` (70, tiled 3x) on inward cylinders, unlit and faded toward
    the fog colour; they replace the old 3D silhouettes. The cloud panorama was removed by decision 051: the sky is
    a clear gradient with stars
  - `T02_StreetAtlas`: 24 cells (capiz windows, curtains, sari-sari front, parol stall wall, signs, plaster,
    hollow blocks, tin, doors, grilles, shutter, planks, gift wraps, tarpaulin, piko chalk, grate, court)
  - ground (decision 051): `T02_ConcreteRoad` (concrete slabs with joints, laid as one strip per street),
    `T02_CementYard` (scored cement everywhere else) and `T02_PlazaTiles` (terracotta and cream plaza)
- Base decor (colliders in `layout.ts`, hugging walls, clear of spawns, rings and streets): A has two gift piles
  and two picket-fenced gardens with a small lit tree; B a swing set, slide and seesaw; C a basketball hoop on a
  painted court, a gift pile and a garden.
- `apps/web/src/stages/agawan/` contains the street, built in code from the shared layout (`streetKit.ts`):
  - row houses with lit windows, doors, awnings and eave lights
  - parols and string lights on wires across the streets, plus light drops
  - jeepney, tricycle, sari-sari kiosk, stall, food cart, jersey barriers and crates
  - the plaza tree with spiral lights, hanging parols and presents
  - light-wrapped poles with stacked parols along the streets, Maligayang Pasko banners, piko squares
  - team arches and markers with big parols, and chain-link pens
- Draw calls: all solids are merged into one vertex-coloured mesh, all self-lit surfaces into one unlit mesh, and
  bulbs and glows into two point clouds. Atlas details are two more meshes (lit by the scene, and self-lit for
  windows and signs) and the backgrounds three. Wires take one line set and light pools one instanced mesh. The scene
  has three dim lights plus one soft lantern that follows the camera (decision 051). Street lamps, windows and parols
  light the walls and ground through a baked per-vertex light term (`bakeLight` / `withBakedLight` in `streetKit.ts`),
  computed once when the street is built (about 160 ms for about 100k vertices in Node). Contestants get a faint warm
  edge light only while this stage is mounted (`CONTESTANT_RIM` in `game/contestant.ts`). With 30 players the stage
  draws about 51 calls and 100k triangles (cloud container, SwiftShader).
- HUD (`apps/web/src/ui/AgawanHud.tsx`), after the pack's reference in the existing frosted style:
  - timer, team scores and the three bases (owner colour, capture progress)
  - your team, your hearts and your home base status (yours, under attack, taken)
  - a "Press E · Hit <name>" prompt (with their hearts) only when a rival is in reach and in front of you, "Hold E"
    to free a teammate, and "Taking <team>'s base" while you stand in an enemy ring
  - base taken / lost, captured, rescued, healing, last-heart and "teammate needs help" banners; a red edge flash
    when you are hit and heart pips over your hit
  - Tab for the team status board (hearts per player)
  - Agawan results: team ranking, bases taken, bases held, captures, rescues, the score key and the MVP
- Team identity: a team-coloured ring on the ground and the team letter on the name tag. Rivals also carry a
  marker above their head in their team colour (like the hunter's marker in The Hunt) with their hearts as pips.
  Coats are untouched. Base capture rings take the owner's colour; the attacker's colour fills the ring as they
  take it.
- Sound: the existing synth with a light Christmas bell motif, and hit, capture, rescue and base cues.

## 6. Performance (honest numbers)

See §8. Everything was measured in the cloud container: headless Chromium with SwiftShader software rendering,
and the Worker under `wrangler dev`. **No Intel Mac was tested.** Frame rates from software rendering say nothing
about a real GPU; draw calls, triangles, server tick time and bytes on the wire carry over.

## 7. Tests

- `npm test`:
  - `packages/shared/test/agawan.test.ts` (25 tests): map, hearts and hits, prison, rescue, healing, base takeover, end, sudden death, bots
  - `teamChampionship.test.ts` (5 tests)
- `npm run test:agawan`: 30-player room with 3 people and 27 bots in the real Worker. Covers bots tagging,
  rescuing and taking bases, a reconnect, results, captains, and two rooms at once.
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
