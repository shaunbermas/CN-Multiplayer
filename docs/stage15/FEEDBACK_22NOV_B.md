# Owner feedback, 22 Nov 2026, second batch (decision 031)

Feedback after playing the shared-contestant build, and what changed. Branch `claude/feedback-fog-obstacles-facing`.

## 1. Open decisions ("do what you think is best")

| Item | Decision |
|---|---|
| Night colour lift ×1.55 | Kept: the pack's coats are too dark to tell apart at night without it |
| Jump and dive | Lobby-only emotes (Space, E), visual only: real jumping would change the approved Stage 01 rules |
| Push / Pull | In the animation library for a future Tug of War stage |
| Legacy characters | Removed (`characters.ts`, `roster.ts`, `?characters=legacy`) |

## 2. Contestants turn all the way round

Before, a contestant always faced the camera (the mouse-look direction), so walking backward or sideways
never turned the body. Now every contestant, yours and everyone else's, turns smoothly to face its direction
of movement, all the way round. The turn takes about 0.2 s, and the last facing is kept when standing still.
Facing comes from each contestant's movement, so it is the same on every screen. Presentation only: the server
still owns positions.

## 3. Dust and splashes

- **Wet or dry:** the ground under each foot is looked up in a 0.5 m grid built from the stage's puddle meshes
  (`MAT_Puddle`, 1,401 wet cells). Dry concrete gives a warm dust puff; a puddle gives water droplets and
  ripple rings.
- **Triggers:**
  - **Footsteps:** one per stride, for contestants within 30 m of the camera (on Low, only your own).
  - **Skids:** stop and stumble.
  - **Jump landings and dives:** lobby emotes.
  - **Flops:** a spotted contestant falling over.
- **Cost:** one particle draw call and one ripple draw call for everyone (pooled: 1,400 particles, 40 ripples).
- **Screenshots:** `docs/stage15/screenshots/contestant/ingame_fx_dust.png` and `ingame_fx_splash.png`.

## 4. Fog by default, on every tier

`apps/web/src/stages/stage01/fog.ts`:
- **Fog:** exponential-squared, density 0.0085 (the old light haze was 0.0045, and Low used linear 60–260 m fog). Colour is a misty blue-grey lit by the floodlights.
- **How much is hidden:**

  | Distance | Share of fog |
  |---|---|
  | 40 m | 11 % |
  | 60 m | 23 % |
  | 100 m | 51 % |
  | 150 m | 80 % |
  | The Watcher (about 185 m) | 92 % |

  The Watcher reads as a dim silhouette. Its red eye glare, searchlight and the floodlight beams are drawn without fog, so they pierce it.
- **Mist over the course:** ground-hugging sheets drift over the lanes, and soft mist banks hang across the course (3 to 7, by tier), thinning out right in front of the camera. Obstacles come out of the mist as you approach.
- **Backdrop:** the painted backdrop and the low sky fade into the same fog colour, so there is no hard "fog wall".

## 5. Obstacles always on, and more of them

- **Always on:** obstacles are active in every round and in the lobby, so a solo player practising sees and
  collides with them. The host checkbox is gone. Supersedes decision 027 (2). Only test rooms (CN_TEST=1) can
  switch them off, for the straight-line walk-timing and rollback tests.
- **More barricades:** 10 rows (was 4) alternate four mirror-symmetric gap patterns, so the way through keeps
  changing. The sliding gate (green only) stays in the middle of the course. The fairness rules are unchanged
  and unit-tested: every gap is at least 6 m wide (over 8 contestants abreast), there is no sliver at the
  fence, and every lane is within 10 m of a gap.
