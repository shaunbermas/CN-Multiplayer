# PROMPT 01 — Stage 1.5 Preflight, Baseline Audit and Final Character Lock

You are the lead technical artist and game integration lead for **CN TRIAL**. Stage 01: Red Light, Green Light is already built. Stage 1.5 is a polish and completion milestone before Stage 02, not a new project.

## Read first
- `docs/STAGE_1_5_PRODUCTION_PLAN.md`
- `docs/CHARACTER_LOCK_REGISTER.md`
- all six images in `references/FINAL_CHARACTER_BIBLE_LOCKED/`
- `docs/UI_UX_REFERENCE_NOTES.md`
- `references/UI_UX/CN_TRIAL_UI_UX_CONCEPT_BOARD.png`
- existing Stage 01 GDD, design specification, metadata, Blender scenes, GLB assets, frontend, backend, Watcher and existing roster files.

## Non-negotiable character rule
The final 30 contestant designs are already approved. Do not invent, change, remove, replace, merge or redesign any character. The six supplied character boards are protected visual references. The UI concept's generic avatar slots are placeholders, not new character designs. The existing approved full-body robotic Watcher is also locked; do not redesign it.

## Tasks
1. Audit the current Stage 01 repository and identify all source scenes, assets, game systems, dependencies and build scripts.
2. Capture a clean backup / git tag / branch before making changes.
3. Record baseline visuals and performance metrics for the existing stage.
4. Find the canonical approved 30-character roster manifest, IDs, names, model files and animations currently used by the project.
5. Compare the current roster with the six supplied character references. Do not resolve discrepancies by guessing.
6. If a clear canonical roster is absent or references conflict, create `docs/CHARACTER_ROSTER_DISCREPANCY_REPORT.md` and STOP before character modeling, renaming or importing replacements. Ask the owner to identify the canonical mapping.
7. Confirm the existing Watcher model and which materials / animations are already integrated.
8. Inventory current environment trees, background geometry, textures, lights, fog and UI screens.
9. Create `docs/STAGE_1_5_BASELINE_AUDIT.md` and `docs/STAGE_1_5_ASSET_INVENTORY.md`.

## Do not
- do not alter gameplay rules;
- do not create new contestant concepts;
- do not alter any source character image;
- do not delete or replace assets;
- do not begin large-scale modeling before the audit is approved.

## Deliver
A clear baseline report, canonical character manifest location, discrepancy report if needed, stage asset inventory, backup reference and recommended order of work. Wait for approval before Prompt 02.
