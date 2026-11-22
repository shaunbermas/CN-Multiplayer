# PROMPT 06 — Integrate the Final 30 Contestants and Approved Watcher

This prompt is for **integration and faithful 3D production of the already-finalized character set**, not character ideation.

## Locked reference sources
Use all six files in `references/FINAL_CHARACTER_BIBLE_LOCKED/` and the canonical 30-character manifest identified in Prompt 01.

## Absolute restrictions
- Do not create new characters.
- Do not change any of the 30 final character designs.
- Do not replace the roster with generic tracksuit contestants or generated placeholder designs.
- Do not merge different roster versions or change character names / IDs without owner approval.
- Do not alter silhouette, head, face, hair, mask, clothes, footwear, color palette or accessories.
- Do not use the UI concept board as a character reference.

## Tasks
1. Confirm the canonical 30-character ID/name manifest from the existing project.
2. Inventory all existing 3D character models, rigs, materials, animations and selection thumbnails.
3. Reuse existing approved models when available.
4. For any approved character that exists only as a final 2D reference, create a faithful 3D model without concept changes. If the required view/detail is not visible in the source material, flag it rather than inventing a significant design feature.
5. Preserve the character's recognizable silhouette and costume details while optimizing topology, UVs, materials and textures.
6. Use shared rigging / animation assets only where they do not distort different character proportions or clothing.
7. Add appropriate LODs and distance culling.
8. Map each model to its stable player ID and selection slot.
9. Confirm all 30 appear correctly in lobby, character selection and in-game multiplayer.
10. Polish the existing approved full-body robotic Watcher only if needed; do not redesign or replace it.

## Required animation compatibility
Reuse the animation system already built. Verify idle, walk/run, jump, fall/stumble, hit/elimination and victory clips. Add clips only when required by the existing gameplay. Do not change animation behavior that would break network synchronization.

## Deliverables
- canonical roster mapping;
- all 30 correctly mapped model references / GLBs;
- rig and animation compatibility report;
- LOD and material report;
- selection thumbnails generated from the actual final 3D models;
- Watcher integration verification;
- screenshots of the 30-player lobby and in-game scene;
- performance comparison with 30 visible characters.

If Prompt 01 did not establish a canonical roster because the supplied sources conflict, stop and request owner direction. Do not proceed by guessing.
