# CN TRIAL: Stage 01 bot system

Stage 01 refinement, Phase 06 (owner brief, 24 Nov 2026; decision 033). Code: `packages/shared/src/bots.ts`
(behaviour, pure), `apps/server/src/room.ts` (bot players). Tests: `packages/shared/test/bots.test.ts`
(headless 30-bot stages), `tests/integration/round.mjs` (add, fill, replace, clear on the real server),
`tests/e2e/refinement-measure.mjs` (a full match with 29 bots and one browser).

## 1. What a bot is

A bot is an ordinary room player **without a socket**. It has an id (`b1`, `b2`, …), a name, a colourway from
the shared contestant's 30 (dealt like a human's, never duplicated), a spawn, and a brain. No browser or
network client is created. Every simulation tick the room asks `botInput()` for a move and queues it through
the same input path and token bucket as a human, so bots use the same movement, walls, obstacles, collisions,
red-light detection, finish line and points. Bots appear in snapshots like anyone else; the roster marks them
`bot: true` and the UI tags them.

## 2. Lobby controls (host only, lobby only)

| Control | Effect |
|---|---|
| Add random players | adds up to 5 bots (`BOT_LIMITS.addStep`) |
| Fill all free slots | adds bots until the room holds 30 players |
| Remove bots | removes every bot |

- **Humans always come first**: when a human joins a full lobby, one bot leaves to make room. During a stage a
  full room still refuses new joiners (as before).
- When the last human leaves, the bots are removed and the room resets.
- Names come from a list of 36 playful original names (`BOT_NAMES`), shuffled with the room's seed and never
  repeating a name already in use. Spawns are dealt like humans' (distinct slots, no overlap).

## 3. Behaviour

Each bot gets a seeded personality when it is created:

| Trait | Range | Effect |
|---|---|---|
| pace | 0.72–1.0 of input | walk speed within the approved 4 m/s (never faster than a human) |
| reaction | 0.08–0.5 s | how long after the warning starts it stops |
| recklessness | 0.008–0.05 per red | chance of stopping too late (keeps walking 0.45–1.05 s into red, past the grace) |
| courtesy | 0.4–0.95 | chance to sidestep a player right ahead; impolite bots cause collisions |
| lane | −0.35..0.35 of a gap | where in a gap it likes to pass |

Per tick: move on green; on warning, keep moving until its reaction time (or keep going if this red is a late
one); stand still on red. Steer toward the nearest gap in the next barricade row within 14 m and around the
sliding gate's current position; sidestep players ahead depending on courtesy; if no progress for 2.5 s,
sidestep for a moment (stuck watchdog). When knocked down it has no control (like a human), then carries on.

## 4. Measured behaviour

Headless, 30 bots, default Stage 01 (`bots.test.ts` → `simulateStage`, three seeds), and in a real match on
the Worker (`tests/reports/refinement-measure.json`): about half finish, a quarter are spotted, the rest are
still walking when the stage closes; the first finish lands around 70 s; collisions happen every stage
(about 20 knock-downs per stage at 30 players). In the measured 3-stage match: 14 / 21 / 12 finished, 13 / 5 / 12
spotted, first finishes at 78.8 / 73.3 / 81.3 s, 63 knock-downs in total. Details: `docs/STAGE_01_QA_REPORT.md`.

Server cost: bots run inside the room's 30 Hz step. With 29 bots the server tick stays far below the 33 ms
budget (QA report §Performance).

## 5. Limits

- Bots do not use emotes, chat or the lobby practice walk; they stand at their spawn in the lobby.
- They know the gap layout (derived from the same obstacle walls) but not the future light schedule: they
  react to the warning like a player would.
- Tuning lives in `makeBot()`; the ranges above are the whole personality.
