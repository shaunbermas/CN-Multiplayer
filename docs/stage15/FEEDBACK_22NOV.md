# Owner feedback, 22 Nov 2026 (decision 029)

Feedback on the live Stage 1.5 build and what changed. Branch `claude/stage15-feedback`.

## 1. Randomised contestants, never duplicated in a room

- **No character select.** When a player joins, the server deals them one of **30 original characters**
  (`dealCharacter` in `packages/shared/src/roster.ts`), drawn at random from the ones nobody in the room has.
  30 characters for 30 seats, so a duplicate cannot happen. A character freed by a leaving player can be
  dealt again.
- Protocol v5: every roster entry carries `character` (`CHR_01` … `CHR_30`). Clients only display it.
- The lobby shows "You are <name>" with the coat colour; each lobby slot shows its player's coat colour.
- **The characters** (`apps/web/src/game/characters.ts`) share one small body (decision 028's
  "shared base + costume variations") with 12 kinds of headwear, 6 faces (eyes, goggles, gas mask, paper bag,
  bandage, visor), scarves, packs, 30 different coat colours and slight build differences. They are
  original: no board design and no existing game character is copied (no hooded yellow raincoat).
- Cost: each character is one merged mesh (one draw call, about 1,300 triangles). The walk swing runs in
  the vertex shader, so 30 animated characters cost the CPU almost nothing.
- Animations: walk (arm and leg swing, bob), idle sway, falling over and turning grey when spotted, a hop
  on finishing.

## 2. More threatening Watcher, visible spotlights

- A red eye glare and red point light on The Watcher's lens: dim on green, a red pulse on amber/red, a flare on detect.
- A soft red searchlight from the eye sweeps the yard on red, with a hotspot on the ground.
- The sky and the matte painting fall into darkness behind The Watcher; the horizon glows red on red light;
  the whole yard dims on red.
- Floodlight cones and lamp glare are on every tier, Low included.

## 3. No 3D background

- The distant backdrop mesh (hills, skyline and tree masses modelled in 3D) is removed from the runtime
  environment GLB (`tools/stage15/glb/derive_environment.mjs`). Only the far ground plane stays, under the
  painted layers.
- The world beyond the yard is now **2D only**: three matte-painting layers and PNG tree cutouts.
  Obstacles, characters, props and the ground near the players stay 3D.
- Runtime environment GLB: 2.54 MB → 2.31 MB (the approved original, 6.4 MB, is untouched).

## 4. Stress test at 30 players

| Test | Result |
|---|---|
| `LOAD_CLIENTS=30 npm run test:load` (30 network clients) | PASS, 30 distinct characters |
| `npm run test:thirty` (5 real browsers + 25 simulated clients, obstacle twist) | PASS: 30 distinct characters, 30 drawn, same signal and same results on all pages, 13 reckless players spotted, heap 32.8 MB, no heap growth over join cycles |
| Unit tests (`roster.test.ts`) | Deal 30 → 30 distinct whatever the random numbers; the 31st gets none; a freed character is re-dealt |

The frame rates in `tests/reports/thirty-players.json` come from software rendering (SwiftShader, no GPU)
on the test machine and do not represent a real browser on a laptop.

Screenshots: `docs/stage15/screenshots/fb_characters/`, `fb_low/`, `fb_high/`.
