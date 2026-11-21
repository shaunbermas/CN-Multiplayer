# PROMPT 07 — Complete and Polish CN TRIAL UI/UX

Build the complete desktop-first CN TRIAL interface using `references/UI_UX/CN_TRIAL_UI_UX_CONCEPT_BOARD.png` as the layout and visual-style reference only.

## Important reference limitation
The concept board's avatar silhouettes and any generated environmental / character imagery are placeholders. Use the final 30 approved contestant assets from the canonical project roster. Do not introduce new characters or copy the mockup portraits.

## Required screens and states
1. Main menu / title screen.
2. How to Play and controls.
3. Settings (audio, graphics, controls, basic accessibility).
4. Create Room / Join Room.
5. Invite code, copy invitation link and room state.
6. 30-slot private lobby, host controls, readiness and countdown.
7. Character selection using the locked final 30 models.
8. Stage countdown transition.
9. In-game HUD: Stage 01 label, timer, red/green state, objective, alive / eliminated count, controls and connection status.
10. Red Light scan / detection feedback and elimination alert.
11. Spectator mode for eliminated players.
12. Stage results, qualification, rankings and Continue / Exit.
13. Reconnect, connection lost, room closed and server error states.

## UX requirements
- Keep important gameplay indicators readable and away from the action center.
- Maintain clear red / green state contrast and do not rely on color alone; pair with labels and icons.
- Support keyboard navigation and visible focus.
- Use real room, player, timer and elimination state from the backend; no hardcoded demo values in production.
- Show loading / asset preparation states and connection feedback.
- Preserve guest nickname and invitation-only room flow.
- Use CN TRIAL branding, not the old project title, in all visible UI.

## Build sequence
Audit current UI → define tokens/components → create approved screen designs → implement reusable components → connect real game state → responsive / resolution test → accessibility and usability pass.

## Deliverables
UI design reference / screen renders, design tokens, reusable component inventory, implemented screens and states, integration notes, screenshot set for all screens and QA report.
