# Reference manifest

Status: v0.2, 21 November 2026. Covers every visual reference currently in `references/`. Project renamed to **CN Trials** (GDD v0.2).

## How to use this file

- `docs/GAME_DESIGN_DOCUMENT.md` (GDD v0.1) is the canonical source for **rules, numbers and scope**.
- Approved images set **visual direction only**: mood, palette, silhouette language, material feel.
- The two current images are AI-generated overview boards. They are **not** blueprints. Do not take
  dimensions, layouts, proportions or any embedded text (titles, labels, enemy names) from them as a
  specification. Where a board and the GDD disagree, the GDD wins.
- Approval status is set by the project owner only. Nothing in this file changes an approval.

### Status labels

| Label | Meaning |
|-------|---------|
| RECEIVED | In the repo, reviewed, approval for production use not yet confirmed by the owner |
| APPROVED | Owner has confirmed it as a production reference (scope stated per image) |
| MISSING | Slot defined in the project structure, no image yet |
| CONFLICT | The image contradicts the GDD or another reference; needs an owner decision |

## 1. Inventory

| # | File | Size | SHA-256 (first 16) | Source | Status |
|---|------|------|--------------------|--------|--------|
| G1 | `references/GLOBAL/stage_environment_and_tournament_overview.png` | 1536 × 1024 PNG, 2.6 MB | `d6c8565cf9008899` | Stage 01 production pack | RECEIVED |
| G2 | `references/GLOBAL/stage_enemy_and_asset_overview.png` | 1536 × 1024 PNG, 2.6 MB | `25f830cb6418e244` | Stage 01 production pack | RECEIVED |
| S1 | *Not in the repository*: `playground_mood_reference_cropped.png` | 656 × 339 PNG | `befb149660249010` | Prompt 02 reference pack | RECEIVED, mood only |
| S2 | *Not in the repository*: `user_uploaded_reference_with_prompt_context.png` (full screenshot of S1 with the prompt text) | 656 × 1105 PNG | `4ebcac0e2bf9a6c0` | Prompt 02 reference pack | RECEIVED, source context |
| S3 | *Not in the repository*: `03_PROPOSED_CINEMATIC_ENVIRONMENT_RENDER.png` | 1672 × 941 PNG | `443b503c462447d9` | Prompt 05 reference pack (AI-generated proposal derived from S1) | RECEIVED; used by the owner's Prompt 05 request as the cinematic mood and lighting reference (decision 022). Not a layout |

S1 and S2 are a third-party image of unknown origin carrying a website watermark and partly legible
lettering. This repository is public, so they are recorded here by description and fingerprint and not
committed (design spec decision E12). S3 is generated from S1, so it is handled the same way. The Prompt 05 pack's
S1/S2 and G1 copies match these fingerprints exactly; its G2 copy is a different encoding with pixel differences
(not used for Prompt 05, which takes mood from S1/S3 and the approved design spec). The pack's copies of G1, G2 and the GDD match the files already
here (G2 differs only in file encoding).

The files keep their original names. They are not renamed to the planned slot names in §3, because
neither board is a dedicated art-direction sheet, enemy sheet or roster sheet. §3 records which planned
slot each board partly covers.

## 2. What each image communicates

### G1: "Game Environment & Stage Bible"

| Area of the board | What it usefully communicates | What it must NOT be used for |
|-------------------|-------------------------------|------------------------------|
| Hero banner (castle-factory on a cliff, hooded giant with glowing eyes, red banners) | Overall world tone: dark industrial fantasy, cold blue-grey night, warm amber windows, red banner accent | Architecture or scale of any stage |
| Tournament flow strip | Matches GDD §2.3 round order (R1 to R7) | Advancement numbers (use GDD) |
| Stage pool thumbnails (10) | One mood frame per stage | Layouts |
| Stage 01 panel | Outdoor night yard, packed-dirt ground with white painted lines, floodlight masts, red banners, industrial silhouettes behind, giant doll-like figure at the far end facing the players, small hooded contestants with backpacks running toward it | Field size, lane count, finish position, and **the figure**: the doll is retired and replaced by The Shepherd (C1, C5) |
| Stage 02–10 panels | Mood and key set pieces for later stages | Anything for Stage 01 |
| Enemies & threats strip | Five silhouettes: "Observer (Stage 01)", "Warden (Stage 05)", "Stalker (Stage 07)", "Overseer (General / Cutscene)", "Automaton (Stage 03/10)" | Enemy names or stage assignments (not in GDD) |
| Key obstacles & interactables | Gear, swinging hammer, moving platform, collapsing floor, conveyor, crate, lever, pressure plate: the modular-kit idea from GDD §9.5 | Exact prop designs |
| Environment style & modular sets | Six kit families (factory, house, hospital, cave, archive, train) as small room cut-aways | Kit dimensions |
| Arena / level layout examples (top view) | "Red Light Area" shown as a long rectangle with start and finish bands | Proportions or measurements |

### G2: "Game Asset Bible"

| Area of the board | What it usefully communicates | What it must NOT be used for |
|-------------------|-------------------------------|------------------------------|
| Hero banner (group of contestants looking at a lit fortress) | **Contestant style**: compact bodies, large heads, hoods, caps, goggles, worn layered clothing, muted palette; this is the best current guide to GDD §4.1 | Final character designs or proportions |
| Stage lineup (10) | A second mood frame per stage | Layouts |
| Stage 01 panel | Alternative Stage 01 mood: open field at dusk, dead trees, overcast sky, doll figure with **glowing red eyes**, white lines, contestants in rows | Same limits as G1; the doll figure is retired |
| Enemy roster (6) | "Warden (main overseer)", "Doll (stage enforcer)", "Nurse (stealth hunter)", "Custodian (patrol)", "Brute (chase)", "Watcher (environmental threat)" | Names, roles or stage assignments |
| Obstacle & hazard assets | Ten hazard concepts (blades, hammer, moving platform, crusher, conveyor, collapsing floor, spikes, rotating arm, pendulum log, rising water) | Exact designs; Stage 01 uses none of them |

### Shared visual language (consistent across G1 and G2)

These points agree with GDD §5 and are safe to carry into production briefs:

- Palette: charcoal, blue-grey, muted teal and weathered stone, with rust, amber and dirty-brass warm
  accents. Red is used sparingly (banners, signal lights).
- Lighting: cool, deep shadows with warm practical lights (lamps, windows, floodlights).
- Atmosphere: fog, haze, distant silhouettes.
- Scale contrast: very small contestants in a world built far too large for them.
- Contestants: hooded, capped or masked, worn fabric, small backpacks, readable silhouettes.

### S1: abandoned playground at night (Prompt 02)

| Communicates | Must not be used for |
|--------------|----------------------|
| Mood for Stage 01's margins and backdrop: abandoned playground (swings, slide, a tall rocket-shaped cage climber), an elevated roadway curving past, a distant water tower, tree silhouettes, damp ground, heavy teal ground haze with violet sky, isolation | Copying its lettering, the antlered water tower or any other distinctive design; tracing; layout or scale. How it combines with the decided night floodlit yard is decision E1 in `STAGE_01_DESIGN_SPEC.md` |

## 3. Planned reference slots

Slots from the agreed project structure plus the Stage 01 pack's suggested sheets.

| Slot | Path | Status | Partly covered by | Needed before |
|------|------|--------|-------------------|---------------|
| Art direction sheet | `references/GLOBAL/art-direction.png` | MISSING | G1 banner + G2 banner (mood only) | Stage 01 art pass (S1-6) |
| Stage and enemy overview | `references/GLOBAL/stage-enemy-overview.png` | MISSING | G1 and G2 together cover this role | Not blocking Stage 01; owner to decide whether G1/G2 fill it |
| Character roster | `references/GLOBAL/character-roster.png` | MISSING | G2 banner (style only) | Contestant base body (S1-3) |
| Stage 01 overview | `references/STAGE_01_RED_LIGHT/stage-overview.png` | MISSING | G1 and G2 Stage 01 panels (they disagree, see C2) | Greybox sign-off (S1-2) |
| Stage 01 environment | `references/STAGE_01_RED_LIGHT/environment-reference.png` | MISSING | G1 Stage 01 panel | Art pass (S1-6) |
| Stage 01 layout | `references/STAGE_01_RED_LIGHT/layout-reference.png` | MISSING | G1 "Red Light Area" thumbnail (no measurements) | Greybox (S1-2), but a layout can instead come from the Stage 01 spec, see §5 |
| The Shepherd turnaround (replaces the planned `watcher-reference.png`) | `references/STAGE_01_RED_LIGHT/shepherd-reference.png` | MISSING | None. The doll figures on G1 and G2 must not be used | Shepherd modelling (S1-5) |
| Obstacle and prop sheet (pack suggestion) | `references/STAGE_01_RED_LIGHT/props-reference.png` | MISSING | none | Art pass (S1-6) |

## 4. Conflicts that need an owner decision

| ID | Conflict | Sources | Why it matters | Proposed resolution (owner decides) |
|----|----------|---------|----------------|-------------------------------------|
| C1 | **RESOLVED v0.2: The Shepherd (`ENM_Shepherd`).** Was: Stage 01 figure name. G1 calls it "The Observer", G2 calls it "The Doll", the agreed folder calls it "watcher", and G2 uses "The Watcher" for a different, binocular-headed creature. The GDD calls it the "mechanical observer". | G1, G2, folder names, GDD §4.4 | Asset names (`ENM_…`) are permanent IDs in code and files | Owner decided: **The Shepherd**, asset ID `ENM_Shepherd`, reference slot `shepherd-reference.png` |
| C2 | **RESOLVED: night floodlit yard (G1).** Was: Stage 01 setting. G1: night, floodlit industrial yard with banners. G2: dusk, open field with dead trees. | G1, G2 | Environment kit, lighting and skybox are different builds | Owner decided: **G1 night floodlit yard**. G2's dusk field is not used for Stage 01. Keep G1's mood in a playful register (GDD v0.3 tone) |
| C3 | **Shepherd signal lights.** Was: observer eyes. G2 has glowing red eyes, G1 does not. | G1, G2 | Eyes could become part of the red/green signal | Decide in The Shepherd turnaround (lantern, eyes or both). Any eye glow must be paired with shape and sound, not colour alone (GDD §5.2, §6.4) |
| C4 | **Enemy roster and names.** Boards show 5 and 6 named enemies with roles not in the GDD. The GDD needs only 3 presences (observer, ward pursuer, blackout variant). | G1, G2, GDD §4.4 | Scope creep risk (GDD §13) | Treat board enemies as concept exploration only until a GDD revision adds them |
| C5 | **RESOLVED for the figure in v0.2.** Originality of the Stage 01 figure. The giant girl doll with dark pigtails and an orange pinafore dress, used as a red-light / green-light enforcer, is strongly similar to a well-known doll design from an existing TV series. Some contestant designs also sit very close to an existing horror-platformer style. | G1, G2 Stage 01 panels; GDD §1 "original", §5.4, M10 "legal asset review" | The GDD requires an original visual identity and a legal asset review before release. Fixing a design is cheap now and expensive after modelling | Owner decided: replace the doll with **The Shepherd**, an original giant mechanical shepherd. Still needed: an approved Shepherd concept and turnaround before modelling. The contestant-style similarity remains open for the character design pass |

## 5. Missing technical information for Stage 01

None of this exists in the GDD or the images. Each item is for the owner or the Stage 01 design spec.
I do not invent the values; `STAGE_01_PRODUCTION_PLAN.md` proposes test ranges labelled PROPOSED.

| Area | Missing item | Blocks |
|------|--------------|--------|
| Layout | Field length and width, start-zone depth, finish-gate width, out-of-bounds edges, Shepherd distance from finish | Greybox |
| Layout | Spawn arrangement for up to 30 players (grid spacing, minimum gap) | Greybox, server placement |
| Scale | Contestant gameplay capsule (height, radius); contestant visual height | Everything metric |
| Scale | Shepherd height and platform height | Shepherd model, sightlines |
| Movement | Walk and sprint speed, acceleration, stopping distance (GDD §2.6 says "shared baseline values" but gives none). Whether sprint is enabled in Stage 01 | Field length, red-window tolerance |
| Rules | Green and red durations or ranges, warning cue before red, scan duration, round timer | Server state machine, audio and VFX timing |
| Rules | Movement tolerance during red (speed or distance threshold), grace period after red starts, latency compensation policy | Server validation (GDD §11.1) |
| Rules | Qualification percentage and tie handling (GDD §2.3 says tunable) | Results |
| Rules | What happens to players who are still on the field at time-out | Results |
| Presentation | Elimination presentation (GDD: no gore; "elimination transition") | Animation, VFX |
| Presentation | Spectator camera behaviour on the Stage 01 field | Camera, UI |
| Visual | Shepherd concept and turnaround (front, side, back), which parts move (head, torso, lantern arm, crook), how move and stop are shown on the figure | Shepherd model and rig |
| Visual | Contestant base-body proportions and 3 preset variations (GDD §9.5 item 1) | Character pipeline |
| Visual | Final palette tokens (GDD §5.2: "not locked") | Materials, lighting |
| Audio | Signal cues (green, warning, red, scan), crowd/ambient, elimination cue | Audio pass |
| Tech | Hosting: RESOLVED, Cloudflare Durable Objects (decision 016) | M0 spike |
| Tech | Reference and minimum desktop hardware (GDD §14) | Performance budgets |
| Tech | Pinned Blender version for the owner's desktop and for scripted runs | Pipeline |
