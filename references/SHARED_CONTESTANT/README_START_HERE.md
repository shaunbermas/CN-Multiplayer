# CN TRIAL — Shared Contestant Character System Pack

## Purpose
Replace the 30 individually modeled contestant designs with ONE canonical, highly polished contestant base model and 30 color/material variants. The variants must share the same geometry, skeleton, UV layout, animations, and texture set wherever possible. Only material parameters and small, data-driven identifiers should differ.

This pack is a production brief and reference pack for Claude Code / Blender. It does not contain a finished 3D model. Claude must build and validate the actual Blender and browser-game assets in the existing CN TRIAL project.

## Included
- `01_REFERENCE/CN_TRIAL_SHARED_CONTESTANT_TURNAROUND_REFERENCE.jpg`: supplied character reference, preserved unchanged.
- `02_PROMPTS/MASTER_PROMPT_SHARED_CHARACTER_SYSTEM.md`: main instruction to Claude.
- `03_TECHNICAL_SPEC/CHARACTER_SYSTEM_SPEC.md`: model, rig, animation, material, export, and web-performance requirements.
- `03_TECHNICAL_SPEC/COLORWAY_SYSTEM.csv`: 30 proposed colorway IDs. These are material variants, not separate character designs.
- `04_VALIDATION/ACCEPTANCE_CHECKLIST.md`: implementation and performance acceptance checklist.

## Critical implementation rule
Do not create 30 separate meshes or 30 separate rigs. Create one canonical mesh/rig/animation set, then assign 30 lightweight material configurations. Use instancing, shared geometry, shared skeleton/animation clips, and per-instance color/material parameters where supported by the current renderer.

## Project safety
Inspect the existing repository first. Preserve a backup/Git checkpoint before replacing the old roster system. Do not delete approved old character assets until the new shared system is integrated, tested, and explicitly confirmed as the active system.
