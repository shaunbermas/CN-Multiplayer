# CN TRIAL · Stage 1.5 Prompt 03: foreground and midground polish, tree LODs

Status: **PASS**. Gameplay geometry, collision, triggers, spawns and the approved GLB are unchanged. All changes are runtime presentation in the client.

## Changes

| Area | Before | After | Where |
|------|--------|-------|-------|
| Puddles | `MAT_Puddle` is a near-black mirror (roughness 0.04) with no environment, so it rendered as black holes | Reflects a prefiltered night-sky environment map (moon, horizon glow, warm floodlight banks); roughness 0.12 spreads highlights | `skyModel.ts`, `Stage01Scene.tsx` (Environment) |
| Steel, wet asphalt, chain-link, concrete | No environment light; metal read flat black | The scene environment map (Medium 0.5, High 0.6; off on Low since Prompt 08, see the P04 report) gives metal and wet surfaces sky reflections | `Stage01Scene.tsx` (Lighting) |
| Midground trees (49, at the approved `STG01_BG_Tree_*` positions) | Stacked cones (3,088-triangle foliage node) | Lit crossed-plane impostors from the Prompt 02 atlas: 6 triangles each, one instanced draw call per shape (4 shapes), alpha clip, shadows on High, deterministic size and rotation per tree id | `MidgroundTrees.tsx` |
| Grass tufts | Merged with the cone trees | Kept: the cone triangles above 1 m and the trunks are stripped from `ENV_VISUAL_FOLIAGE` at load (the GLB file is unchanged) | `stripConeTrees()` |

## Tree LOD rule (the three distance bands)

| Band | Treatment | Cost |
|------|-----------|------|
| Yard edge to about 10 m beyond the dressed yard | Lit 3D impostors (3 crossed planes), shadows on High | 49 trees, 4 draw calls, 294 triangles |
| From there to about 400 m | Camera-facing cutout billboards, fogged (Prompt 02) | 1 draw call; 440 / 770 / 1,100 instances by tier |
| Beyond about 470 m | Painted forest layer | 1 draw call |

Billboards and impostors have no collision.

## Measurements (SwiftShader, High, 1280 × 720)

| View | P01 baseline | P02 | P03 |
|------|--------------|-----|-----|
| Spawn | 119 calls / 136,292 tris | 126 / 140,026 | 132 / 135,518 |
| Side (west) | 108 / 135,004 | 115 / 138,738 | 121 / 134,230 |
| Overview | 120 / 136,340 | 127 / 140,074 | 133 / 135,566 |

- **Triangles:** 1,100 billboards plus 49 impostors cost fewer triangles than the old cone trees.
- **Draw calls:** +6 against P02 (4 tree batches, each also in the shadow pass on High).

Screenshots: `docs/stage15/screenshots/p03_foreground/`; compare with `p02_matte/` and `p01_baseline/`.

## Not changed (out of scope or locked)

- **Fences, towers and props:** keep their approved geometry and materials. The environment map improves how they read; re-modelling is not needed.
- **Instancing the GLB:** the approved GLB already merges static meshes per collection (decision 022), so instancing it would not reduce draw calls further.
- **Obstacles:** none added. They are Prompt 05.
