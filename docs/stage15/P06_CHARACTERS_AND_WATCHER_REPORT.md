# CN TRIAL · Stage 1.5 Prompt 06: final 30 contestants and The Watcher

## Contestants: **BLOCKED (owner decision required)**

As Prompt 06 instructs ("If Prompt 01 did not establish a canonical roster … stop and request owner direction. Do not proceed by guessing"), **no contestant was modelled, renamed, imported or invented**. Why:
- The project has no roster manifest and no character asset.
- The six locked boards show six different 30-character rosters.
- The detailed hero on several boards reproduces the protagonist of an existing game (*Little Nightmares*).

Details and the decisions needed are in `docs/CHARACTER_ROSTER_DISCREPANCY_REPORT.md`.

| Prompt 06 deliverable | State |
|-----------------------|-------|
| Canonical roster mapping | Blocked: owner to choose or supply |
| 30 model references / GLBs, LOD and material report, thumbnails from the 3D models | Not started: depends on the roster |
| Rig and animation compatibility | Not started. The GDD §4.2 shared-rig plan stands; the only rig in the project is The Watcher's (not a contestant rig) |
| 30-player lobby and in-game scene | The lobby and HUD support 30 players. In-game, players stay capsule placeholders in 30 distinct colours; the 30-visible test runs in Prompt 08 |

What is ready for the roster when it arrives:
- Players keep one consistent gameplay capsule (GDD §2.5), so any model is cosmetic and cannot change hitboxes.
- Prompt 07's character-selection screen reads a roster list. It shows "roster pending" until a manifest exists, rather than invented characters.

## The Watcher: **PASS** (polished; approved design unchanged)

The approved model, rig, bones, clips, textures and proportions are unchanged; `THE_WATCHER.glb` is untouched. All polish is runtime presentation driven by the server's public state.

| Polish | Implementation |
|--------|----------------|
| Lens materials | `MAT_Watcher_Lens_*` emissive × 1.8 at runtime. The signal lens reads at 190 m, and the High tier's bloom catches it. The spec allows the runtime to drive these materials |
| Detection presentation | `WatcherFX.tsx`. After the server's `spotted` event: a pulsing red beam from the model's own `Watcher_OpticalOrigin` anchor to the spotted player, plus an expanding ring at their feet, for 1.6 s (all tiers) |
| Red-light searchlight | A faint red cone sweeps the field from the lens during red (Medium and High). Presentation only: detection is not line-of-sight (decision E9) |
| Lighting | The retired Shepherd lantern light no longer lights the Watcher; it had blown out the porcelain (Prompt 04) |
| Slow clients | A segment's opening clip (TurnAway, FocusLock) plays in full on a client that first draws the segment late (PR #17 fix) |

## Verification

| Check | Result |
|-------|--------|
| `npm run test:e2e` (2 browsers): clips follow the server (TurnAway and GreenSignal on green, FocusLock on red, Detect after the spot) | PASS |
| `npm run test:e2e`: the beam fires from `Watcher_OpticalOrigin` after the server spots Beta | PASS |
| Asset checks on load: 9 clips with manifest lengths, anchors, height 28.0 m, feet at the root | PASS, no problems |
| Signal states on High (`docs/stage15/screenshots/p04_atmosphere/signal_{green,warning,red}.png`): green lens and wash, turned back on warning, red lens and wash on red | Visually verified |

## Update, 22 Nov 2026 (decision 029)

The contestant roster is no longer blocked: the owner chose **randomised characters**, never duplicated in a room.
30 original characters are built in code and dealt by the server. See `docs/stage15/FEEDBACK_22NOV.md`.
The Watcher also gained a red eye glare, a red searchlight and a darker backdrop.

## Update 2, 22 Nov 2026 (decision 030)

The randomised 30-character roster is superseded by the owner's shared contestant system: ONE master character
(Blender, rigged, 16 clips, 3 LODs) and 30 colourways. Spec: `docs/stage15/CONTESTANT_CHARACTER_SPEC.md`.
Report: `docs/stage15/SHARED_CONTESTANT_REPORT.md`.
