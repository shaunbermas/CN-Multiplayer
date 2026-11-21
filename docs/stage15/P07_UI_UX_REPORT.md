# CN TRIAL · Stage 1.5 Prompt 07: complete CN TRIAL UI/UX

Status: **PASS**, with character selection showing an honest "roster pending" state (the roster is blocked by the owner decision; see Prompt 06).

## Design tokens (`apps/web/src/styles.css`, `:root`)

- **Colours:** near-black background; panel `rgba(10,12,17,.86)`; red accent `#d42a2a` / `#8f1717` with glow; signal green `#27c25c`; amber `#f2a51e`; winner gold `#d9b45a`.
- **Type:** condensed uppercase headings (Bahnschrift / DIN Condensed / Roboto Condensed stack, no external font download) and system body text.
- **Shape and focus:** 6 px radius and slanted signal banners. Focus is visible (amber outline) on every control.
- **Scaling:** `--hud-scale` (Settings: 100 / 125 / 150 %) scales all HUD text.
- **Reduced motion:** `prefers-reduced-motion` stops the pulse, blink and edge animations.

Direction comes from the concept board: wordmark with red slash, dark industrial panels, numbered 30-slot grid, slanted GREEN / RED LIGHT banners, results with qualified and eliminated counts and a winner card. Its placeholder avatars and its doll figure are **not** used.

## Components and screens

| # | Screen / state | Where | Live data |
|---|----------------|-------|-----------|
| 1 | Main menu: wordmark, guest nickname, Create private room, Join with a code, How to play, Settings | `ui/Menu.tsx` `MainMenu` | — |
| 2 | How to play and controls | `HowToPlay` (menu and in game) | — |
| 3 | Settings: graphics (Auto / High / Medium / Low, applied live), mouse sensitivity, invert look, interface size, red edge pulse; saved in this browser | `SettingsPanel`, `ui/settings.ts` | Applies to `quality.ts` and `input.ts` |
| 4 | Create room (new 5-character code) / join by code | `MainMenu`, `net.ts` `newRoomCode` | Server rooms `/api/room/<code>` |
| 5 | Invite: code display, Copy code, Copy link (`?room=CODE`), and the invite landing state | `GameHud` `Lobby`, `MainMenu` | Room id |
| 6 | 30-slot lobby: names by slot, host ★, you, ready ✓, counts, Ready toggle; host controls (tournament rules, obstacle twist, Start game) | `Lobby` | Roster + **new ready state** (protocol `ready` message, server roster) |
| 7 | Character selection: 30 numbered slots read from `CONTESTANT_ROSTER`. Disabled with a "roster pending" notice until the owner approves a canonical roster | `CharacterSelect`, `packages/shared/src/roster.ts` | Roster module (empty, by decision) |
| 8 | Briefing and countdown transition | `GameHud` | Phase, remaining time, mode, obstacles |
| 9 | HUD: stage label, signal banner (word + icon + colour), timer, alive / total, eliminated, qualified / target, objective, progress with flag, controls hint, connection quality (ping) | `GameHud` | Snapshots, round state, RTT (new ping / pong) |
| 10 | Red light: SCANNING label, red edge pulse (setting); detection beam in the scene (Prompt 06); YOU WERE SPOTTED stamp; elimination and qualified feed for others | `GameHud`, `WatcherFX` | Server `spotted` / `finished` events |
| 11 | Spectator: eliminated tag, name of the player watched, Tab to switch | `GameHud` | `hud.spectating` from the camera controller |
| 12 | Results: qualified and eliminated counts, stage winner (or "No finisher"), rankings with tags, return-to-lobby countdown, Exit to menu | `Results` | Server results message |
| 13 | Connection states: connecting; connection lost (Reconnect / Main menu); room full (rejected cleanly on the menu); update needed (version); replaced; stage load error | `App.tsx`, `GameHud` | Socket close codes, join errors |

## QA

`npm run test:ui` (new, in CI) drives the real flow against `wrangler dev`, with bots joining through the shared client. It **passes all 18 steps**:

- **Menu and setup:** menu, keyboard focus, How to play, Settings, join by code, invite link.
- **Lobby:** 5 players with 3 ready; the room code matches.
- **Character select:** the pending notice shows.
- **Round:** briefing, countdown, HUD green, HUD red with scanning, a real elimination toast (a bot walked into red), our own real spot, spectator, results.
- **Connection states:** room full (30 bots, then the 31st is rejected with the message), connection lost (server stopped).

Screenshots: `tests/reports/screenshots/ui_*.png`.

| Area | Notes |
|------|-------|
| Responsive | Layouts collapse at ≤ 760 px (the slot grid goes to 6 columns, the results grid stacks, the objective box hides). Desktop is the target (1280 × 720 tested) |
| Accessibility | Visible focus, keyboard-reachable controls, `aria-live` on the signal and feed, signals carry a word and an icon (not colour alone), Escape closes dialogs, interface size option |

Not covered:
- **Audio:** none exists, so no audio setting is shown.
- **Hosting:** the host can't kick players or transfer host (out of scope).
- **Next stage:** there is no "Next stage" button, because Stage 02 is not built. Results say so.
