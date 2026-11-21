# PROMPT 02 — Matte Painting and Surrounding World

Continue CN TRIAL Stage 1.5. Use the approved Stage 01 scene and `docs/MATTE_PAINTING_AND_TREE_CUTOUT_BRIEF.md`.

## Objective
Create the distant world that surrounds the playable arena using matte painting, layered background planes and sky / environment artwork. This is scenery only; it must not replace playable geometry.

## Visual direction
An isolated industrial competition ground at night / late dusk: distant forest, hills, overpass, factory silhouettes, utility structures, hazy skyline, clouds and deep atmospheric perspective. Match the existing Stage 01 art direction and palette. Do not change the arena's approved footprint, gameplay markings or camera gameplay geometry.

## Tasks
1. Review allowed gameplay camera positions and camera rotation limits.
2. Propose matte-painting dimensions, aspect ratio, color-space and layer strategy.
3. Create a panoramic background / skybox or curved backdrop suitable for the existing renderer.
4. Separate sky, clouds, distant hills, forest line, overpass and factory skyline into layers where parallax helps.
5. Keep all contestants, the Watcher, arena ground, start/finish zones and interactive props out of the matte image.
6. Provide transparent PNG distant tree silhouettes / foliage cutouts and an atlas, or clearly document the missing art-generation dependency if the current environment cannot generate them.
7. Add billboard placements / distance bands to the scene using a small number of reusable cutout assets.
8. Avoid repeating patterns, flat-card edges and visible seams.
9. Validate camera movement, horizon joins, fog integration and alpha artifacts.

## Restrictions
- No collision on matte paintings or decorative cutouts.
- Do not use the UI mockup or character references as environment maps.
- Do not use copyrighted / unlicensed source images.
- Do not silently change approved scene dimensions.

## Deliverables
- source matte painting / layered image files;
- optimized runtime textures;
- tree cutout PNGs / atlas;
- `STAGE_01_MATTE_PAINTING_MANIFEST.json` with dimensions, color space, placement, layer and licensing/source notes;
- updated scene and comparison screenshots;
- validation report.

Stop for visual approval before replacing all existing background assets.
