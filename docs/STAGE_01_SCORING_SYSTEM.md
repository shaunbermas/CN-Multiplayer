# CN TRIAL: Stage 01 scoring system (match points)

Stage 01 refinement, Phase 08 (owner brief, 24 Nov 2026; decision 033). Code: `packages/shared/src/match.ts`
(rules, pure), `apps/server/src/room.ts` (records each stage once), `apps/web/src/ui/GameHud.tsx` (screens).
Tests: `packages/shared/test/match.test.ts`, `tests/integration/round.mjs` (two-stage match on the real server).

## 1. A match

A match is a fixed number of stages (`MATCH.stages`, default **3**). Every player in the room plays every
stage. Players spotted in one stage come back for the next one (nobody is knocked out of the match). Only
Stage 01 exists and Stage 02 must not be started, so for now a match plays Stage 01 three times with a new
seeded light schedule each time; `matchOrder()` will list Stage 02+ once they exist.

Flow: lobby → stage 1 briefing (6 s) → countdown → stage → stage results (9 s, host can skip) → stage 2
briefing (4 s) → … → final results (16 s, host can return early) → lobby.

## 2. Points per stage

| Result in the stage | Points |
|---|---|
| First player to cross the finish line | **2** |
| Every other player who finishes | **1** |
| Spotted on a red light (eliminated for this stage) | 0 |
| Did not finish before the round closed | 0 |

- **The server decides the first finisher**, from its own finish times (`RoundEngine`, 30 Hz simulation). The
  client never reports a finish. Ties on the exact tick are broken by the engine's deterministic placing order,
  so there is always at most one 2-point award per stage.
- **No duplicate awards**: `Match.record(roundId, …)` remembers every round id it has scored and returns `null`
  for a repeat, so a re-sent results message or a phase handler running twice cannot add points again.
- Once the first player finishes, the others have **30 s** (`ROUND.closeAfterFirstS`) before the stage closes.
- A player who joins mid-match gets a row with 0 points and `null` for the stages they missed. A player who
  leaves keeps their points on the board, marked "left".

## 3. Overall ranking and tie-breakers

Players are ranked by, in order:

1. more total points
2. more stage wins (first finishes)
3. more stages finished
4. lower total finish time over the stages they finished
5. better place in the last stage played
6. earlier to join the room (a deterministic last resort, so there is always exactly one winner)

The final screen names the tie-breaker that decided the winner when the top two have equal points
(`tieBreakReason`), for example "Tied on 4 points with Mochi: won on more stage wins."

## 4. Screens

- **HUD**: stage chip (`STAGE 02 / 03`) and the player's own points.
- **Stage results**: first finisher (+2), this stage's placings with points gained, and the overall standings so far.
- **Next stage**: briefing reminder that spotted players play too.
- **Final results**: winner card with points and the tie-breaker, podium, full standings with per-stage points,
  and the last stage's placings (folded).

## 5. What it replaces

The tournament qualifier rules (R3 target, R4 fallback; decision 025) are no longer used by the room: the
lobby has no mode selector and every stage runs with standup rules plus points. The `Tournament` code and its
tests stay in `packages/shared` untouched, so the old flow can be restored if the owner wants it back.
