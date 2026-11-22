# CN TRIAL — Stage 1.5 Production Pack

**Purpose:** Polish and complete existing Stage 01 before Stage 02.  
**Important:** The six supplied contestant-character boards are included unchanged and are locked references. Do not create new characters or redesign the final 30.

## Start here
1. Read `docs/STAGE_1_5_PRODUCTION_PLAN.md`.
2. Read `docs/CHARACTER_LOCK_REGISTER.md`.
3. Inspect the six images under `references/FINAL_CHARACTER_BIBLE_LOCKED/`.
4. Read `docs/UI_UX_REFERENCE_NOTES.md` and view the UI concept board.
5. Send Prompt 01 to Claude Code. Do not send all eight prompts at once.
6. Wait for each prompt's deliverables and review checkpoint before proceeding.

## Eight-prompt sequence
1. Preflight, baseline audit and lock final characters.
2. Matte painting and surrounding world.
3. Foreground / midground environment polish and tree LODs.
4. Cinematic atmosphere, lighting and VFX.
5. Stage 01 obstacle twist.
6. Integrate the final 30 contestants and approved Watcher.
7. Complete CN TRIAL UI/UX.
8. Optimization, 30-player QA and Stage 1.5 sign-off.

## Critical character note
The six images visibly contain different roster / name versions. They are preserved as the owner's final reference files, but they are not identical roster lists. Prompt 01 requires Claude to inspect the existing project and identify the canonical 30-character ID/name mapping. If no clear mapping exists, Claude must stop and report discrepancies instead of merging or guessing. This is specifically to protect the final character designs.

## UI reference note
`references/UI_UX/CN_TRIAL_UI_UX_CONCEPT_BOARD.png` is for UI composition and visual style only. Its generic avatar silhouettes are placeholders. Use actual approved character assets for the final character-selection screen.

## Project naming
Use **CN TRIAL** in new prompts, docs, interface labels and visible branding. Existing technical identifiers / filenames should be migrated only when safe; do not break imports or asset paths merely to rename them.
