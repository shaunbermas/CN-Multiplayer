# CN TRIAL Shared Contestant Character — Technical Specification

## Architecture
| Layer | Required implementation |
|---|---|
| Canonical model | One master character mesh set |
| Skeleton | One reusable skeleton |
| Animations | One shared clip library |
| Color variants | 30 material parameter presets |
| Textures | One shared atlas / texture set |
| LOD | Shared LOD0, LOD1, LOD2 |
| Browser runtime | Shared cached geometry, textures and animation assets |
| Network | Replicate gameplay state, not mesh or material data |

## Art direction
- Reference: supplied hooded, dark uniform character turnaround.
- Original CN TRIAL identity; do not reproduce third-party marks or exact franchise details.
- Main silhouette: oversized hood, dark face opening, short stylized body, long coat, gloves and chunky boots.
- The coat is the signature feature and receives the highest modeling/detail priority.
- Coat details: raised collar, layered front panels, seams, reinforced sections, belt and buckle, pockets, cuffs, hem thickness, controlled folds and subtle fabric wear.
- Face emblem: simple, high-contrast white geometric symbol based on the supplied reference, modeled or decal-based as a replaceable component.

## Suggested production budgets
These are starting targets, not hard limits. Profile in the actual browser scene and adjust based on visual quality.
| Asset | Initial target |
|---|---:|
| LOD0 | 12k–20k triangles |
| LOD1 | 6k–10k triangles |
| LOD2 | 1.5k–3.5k triangles |
| Shared base color/normal/ORM maps | 1K–2K, compressed for web |
| Unique per-player texture payload | 0; color parameters only |
| Colorway data | Small JSON/TS object |

Avoid over-modeling hidden surfaces. Use normal maps for fine fabric weave and stitching; use geometry for silhouette and coat layering that affects shadows or close views.

## Coat construction
1. Main coat shell with believable thickness and controlled silhouette.
2. Separate front overlap / placket panels.
3. Raised collar with inner and outer surfaces.
4. Sleeve volume with elbow deformation support.
5. Cuffs and reinforced seam details.
6. Belt, buckle and strap anchor points.
7. Utility pockets with modeled flap and restrained depth.
8. Separate coat tails/panels with simple secondary motion.
9. Hem thickness and reinforced edge.
10. Fabric shader with woven roughness, edge wear and subtle dirt.

## Rig / animation states
- Idle
- Walk
- Run
- Start / stop
- Jump start / airborne / landing
- Dive (if supported by game mechanics)
- Push / pull
- Stumble / hit
- Fall / knocked down
- Recovery
- Elimination
- Victory

Animation should be playful and bouncy, but preserve foot contact, collision readability and server-authoritative movement. Coat secondary motion must remain lightweight.

## Colorway implementation
Each record should contain:
- `id`
- `displayName`
- `coatBase`
- `coatSecondary`
- `trim`
- `beltAccent`
- `identifierAccent`
- optional `patternId` if using a shared atlas mask

Avoid 30 separate material texture images. If a shared material cannot expose per-instance parameters in the current renderer, use a small shared palette texture or a bounded set of material variants while retaining shared geometry and texture maps.

## Suggested colorway list
See `COLORWAY_SYSTEM.csv`. The proposed colors are starting options. Keep them visually distinct under dark lighting and test contrast in the actual scene. Do not introduce costume or geometry differences.

## Export / integration
- Apply transforms and use consistent meters.
- Keep object names and material slots stable.
- Ensure face emblem orientation is correct.
- Include animation clips and a manifest.
- Use GLB/glTF for browser deployment.
- Cache one geometry/skeleton/texture asset set and instantiate it for players.
- Confirm whether the current Three.js character loader supports shared skeleton animation efficiently. If not, implement the smallest compatible shared-asset approach without cloning texture payloads.

## Performance measurement
Capture a baseline before replacing the old system:
- Total character asset download size.
- Geometry memory estimate.
- Texture memory estimate.
- Draw calls with 30 contestants.
- Frame time / FPS in a representative 30-contestant scene.
- Initial loading time.
Repeat after integration using the same browser, hardware, scene and test method. Record methodology and actual values.
