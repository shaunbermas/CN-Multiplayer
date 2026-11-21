# Matte Painting and Tree Cutout Production Brief

## Matte painting deliverables
Create a panoramic surrounding-world matte painting for the Stage 01 arena, designed for desktop third-person camera coverage. It should communicate an isolated industrial competition facility at night / late dusk, with distant forest, overpass, utility structures, factory skyline, low hills, cloud banks and atmospheric depth.

Keep all playable elements out of the matte painting: no ground plane, no start/finish markings, no contestants, no Watcher, no interactive obstacles and no collision surfaces. Those remain real-time game assets.

Recommended outputs:
- panoramic color background suitable for skybox / curved backdrop or multiple layered planes;
- separate far-sky / cloud layer where useful;
- distant skyline / factory layer;
- distant forest / tree-line layer;
- optional subtle parallax layers for a constrained camera range;
- source file and export textures.

## Tree cutout deliverables
- transparent PNG tree silhouettes / foliage cutouts at several distinct shapes and heights;
- a small foliage atlas with alpha channel;
- optional crossed-billboard arrangement for camera rotation;
- LOD rules defining when a tree changes from 3D to billboard / cutout;
- mipmapped, compressed runtime texture variants.

Avoid repeating the same cutout at obvious intervals. Vary scale, rotation, hue and spacing. Use 3D trees only when close enough for silhouette parallax or interaction to matter.

## Validation
- check transparency fringes and alpha sorting;
- inspect camera movement and horizon joins;
- verify no flat-card reveal in the allowed gameplay camera range;
- ensure billboards have no collision unless a separate invisible gameplay collider is expressly needed;
- verify fog fades the matte painting naturally into the midground.
