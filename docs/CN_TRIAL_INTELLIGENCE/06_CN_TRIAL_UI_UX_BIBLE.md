# CN TRIAL · 06 UI/UX Bible

Audit date 24 Nov 2026, `main` @ `7ccb1ba`. Labels: see 01. UI code: `apps/web/src/App.tsx`, `ui/Menu.tsx`,
`ui/GameHud.tsx`, `ui/settings.ts`, `styles.css`. Visual reference: `references/STAGE_1_5/UI_UX/CN_TRIAL_UI_UX_CONCEPT_BOARD.png`
(layout and style only). Screens captured by `npm run test:ui` into `tests/reports/screenshots/ui_*.png`.

## 1. Approved UI rules

| Rule | Source |
|---|---|
| Name CN TRIAL everywhere visible; never The Last Trial | Owner brief; 027 (1) |
| Signals use word + icon + colour (+ Watcher pose and light) | GDD §5.2, §6.4 |
| Centre of the screen clear; timer and objective at the top; status in a consistent corner | GDD §6.3 |
| No character selection: colourways are dealt at random and shown as "You are <colourway>" | 029 (1), 030 |
| Obstacles always on, so no host obstacle toggle | 031 (5) |
| Lobby ready state; host can still start at any time | 027 (3) |

## 2. Screen inventory (implemented vs GDD §6.1 vs concept board)

| Screen | GDD §6.1 | Concept board | Implemented | Evidence |
|---|---|---|---|---|
| Main menu / title | Required | Panel 01 | Yes: wordmark, nickname, Create private room, Join with a code, How to play, Settings | `Menu.tsx` `MainMenu`; `ui_01_menu.png` |
| Create room (capacity, settings) | Required | — | Partial: one click creates a room with a random code; no capacity or room settings (capacity fixed at 30) | `App.tsx`, `net.ts` |
| Join room (code or invite) | Required | — | Yes: code field, `?room=CODE` invite notice | `ui_04_join_with_code.png`, `ui_05_invite_link.png` |
| Character selection | Required (GDD) | Panel 03 | **Replaced by decision** (029/030): dealt colourway shown in the lobby | `ui_07_dealt_contestant.png` (`ui_07_character_select_pending.png` is a stale capture) |
| Lobby | Required | Panel 02 | Yes: code, Copy code, Copy link, 30 slots with colourway stripe, host ★, ready ✓, counts, Ready, host "Full tournament rules" + Start game | `GameHud.tsx` `Lobby`; `ui_06_lobby_30_slots.png` |
| Stage briefing | Required | — | Yes: stage name, rule, detail; skippable (Space/Enter) | `ui_08_briefing.png` |
| Countdown | — | — | Yes (3 s) | `ui_09_countdown.png` |
| In-game HUD | Required | Panels 04, 05 | Yes: stage label, signal banner (icon + word), timer, alive/eliminated counts, qualified target, objective box, ping, progress bar with distance, key hints, help and settings buttons | `ui_10_hud_green.png`, `ui_11_hud_red_scanning.png` |
| Red-light feedback | — | Panel 05 | Yes: SCANNING label, optional red edge pulse, "YOU WERE SPOTTED" stamp, elimination feed | `ui_11`, `ui_12`, `ui_13` |
| Elimination / spectator | Required | Panel 06 | Yes: Eliminated tag, who you watch, Tab to switch | `ui_14_spectator.png` |
| Round results | Required | Panel 06 | Yes: qualified and eliminated counts, Stage winner, full rankings, return timer, Exit to menu | `ui_15_results.png` |
| Winner screen (champion, final placements, match duration) | Required | — | NOT YET IMPLEMENTED (single-stage tournament) |
| Settings / pause | Required | — | Partial: Graphics (Auto/High/Medium/Low), mouse sensitivity, invert Y, interface size, red edge pulse. No audio volumes (no audio), no FOV, no reduced-shake (no shake exists), no pause menu, **no "leave room" during a round** (only "Exit to menu" on results, or closing the tab) | `Menu.tsx` `SettingsPanel`; `ui_03_settings.png` |
| How to play | — | Main menu button | Yes (modal with rules and keys) | `ui_02_how_to_play.png` |
| Connection states | GDD §7 | — | Connection lost (Reconnect), Room full, Update needed (reload), Opened elsewhere | `App.tsx` `describeClose`; `ui_16_room_full.png`, `ui_17_connection_lost.png`; update-needed state not executed by tests (QA matrix) |
| Loading / stage error | — | — | Yes | `GameHud.tsx` |
| "Watch replay", "View rankings", "Next stage" | — | Panel 06 | Rankings inline; replay and next stage NOT YET IMPLEMENTED (no replay system, no Stage 02) |
| Jump key hint | — | Panel 04 shows SPACE JUMP | Not shown in rounds (no gameplay jump; emote only in lobby) | Consistent with the approved spec |

## 3. User flow (implemented)

```
Open site ─▶ Main menu ─▶ nickname ─┬─▶ Create private room ─▶ (new code) ─┐
                                    └─▶ Join with code / invite link ──────┤
                                                                           ▼
          Lobby (practice walk, emotes, Ready) ── host: Standup or Full tournament rules ─▶ Start game
                                                                           ▼
     Briefing (skip) ─▶ Countdown ─▶ Round: GREEN / GET READY / RED ─▶ finish = Qualified, spotted = Spectate
                                                                           ▼
                           Results (20 s) ─▶ back to Lobby (same room)   or   Exit to menu
Connection drop at any point ─▶ Connection lost ─▶ Reconnect (rejoins as a new player) or Main menu
```

## 4. Interaction states

| Element | States implemented |
|---|---|
| Buttons | Default, hover, disabled (no nickname / busy), keyboard focus visible (`ui_01b_menu_keyboard_focus.png`), pressed (Ready `aria-pressed`) |
| Signal banner | GREEN LIGHT, GET READY (amber), RED LIGHT, with `aria-live="assertive"` |
| Player status | Active, Qualified, Eliminated/Spectating, Waiting (late joiner) |
| Lobby slot | Open, taken, me, ready, host |
| Connection badge | Connecting, ms value with quality colour |

## 5. Accessibility

| GDD §6.4 item | Status |
|---|---|
| Signals not by colour alone | Implemented |
| Readable text size | Interface size Normal / Large / Extra large |
| Reduced flashing | Red edge pulse can be turned off |
| Camera sensitivity | Implemented (0.3–2.5×), invert Y |
| FOV setting | NOT YET IMPLEMENTED |
| Independent audio volumes, captions for audio cues | NOT YET IMPLEMENTED (no audio exists) |
| Reduced camera shake | Not needed yet (no shake) |
| Keyboard-only menus | Focus visible; full keyboard pass NEEDS VERIFICATION |

## 6. Visual consistency with the concept board

| Item | Observation |
|---|---|
| Layout | Matches the board's structure (dark industrial panels, red accent, top-left stage label, top-centre signal banner, top-right timer and counts, objective box, bottom progress bar) |
| Typography | Board uses a condensed brush-italic wordmark and condensed caps. Implementation uses system font stacks (`--head`: Bahnschrift, DIN Condensed, Roboto Condensed, Arial Narrow, Oswald, Impact). No web font is loaded, so the look varies by operating system (Linux test captures fall back to a generic sans) |
| Wordmark | Text plus a CSS slash, not the board's brush lettering |
| Lobby slots | Board shows avatar silhouettes; implementation shows colourway stripes and names |
| Results | Board shows a laurel "Stage winner" card and "Next stage"; implementation has a plain winner card, no next stage |

PROPOSED (not started): self-host one licensed condensed web font and an SVG wordmark so the brand renders the same on
every machine; this needs owner approval of the font and wordmark artwork.

## 7. Validation

- `npm run test:ui` (18 steps, CI): every screen and the lost/full states. This audit's run: see 08 §1.
- Browser coverage: Chromium only (Playwright). Edge, Firefox, Safari: NEEDS VERIFICATION (GDD §8 browser baseline).
- No usability test with non-gamer colleagues is recorded: NEEDS VERIFICATION (GDD §1.4 audience).
