# PROMPT 03 — Foreground and Midground Environment Polish

Continue CN TRIAL Stage 1.5 using the approved matte-painting output and existing Stage 01 scene.

## Objective
Improve the playable environment while preserving the approved level layout, collision and stage rules.

## Priorities
1. Playable ground: asphalt / concrete / dirt, lane markings, cracks, puddles, mud, debris, drainage and restrained decals.
2. Perimeter fence, gates, barriers, observation structures, floodlight towers and playground props.
3. Nearby utility buildings, overpass supports, cables and industrial details.
4. Nearby and mid-distance tree treatment.
5. Shared PBR materials and optimized material assignments.

## Tree LOD strategy
- foreground / reachable trees: optimized 3D only where necessary;
- mid-distance trees: low-poly variants or impostors;
- distant trees: transparent PNG cutouts / billboard atlas;
- background forest: matte painting layer.
Use LOD transitions, mipmaps, alpha clip where suitable, varied scale and rotation, and no repetitive visible tiling. Billboards are decorative and have no collision.

## Requirements
- Preserve all approved gameplay collision and trigger geometry.
- Separate render meshes from collision meshes.
- Reuse and instance repeated props.
- Keep naming and collections consistent with the existing project.
- Do not add new characters or alter the Watcher or contestant designs.
- Do not add gameplay obstacles yet; those are handled in Prompt 05.

## Deliverables
Updated Blender scene, optimized GLB(s), ground/material atlas, tree LOD assets, modular prop manifest, before/after screenshots, triangle and draw-call comparison, and validation report. Request approval before final visual lock.
