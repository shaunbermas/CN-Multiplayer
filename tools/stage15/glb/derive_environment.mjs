// Stage 1.5 (owner feedback, 22 Nov 2026): "remove any actual 3D backgrounds to minimise the overall game size;
// 2D PNGs and matte painting only. Obstacles, characters, objects and ground near the player stay 3D."
//
// Derives the runtime environment from the approved blender/exports/STAGE_01_ENVIRONMENT.glb (never modified):
//   - ENV_VISUAL_BACKDROP: keeps only the far ground plane (MAT_Ground_Far) so the land between the yard and the
//     painted hills is not empty; drops the 3D overpass, piers, street lamps, factory silhouettes and water
//     tower (the matte painting and tree cutouts replace them)
//   - drops the retired Shepherd placeholder nodes (hidden since decision 023)
//   - prunes unused materials and textures, then meshopt-compresses geometry
// Output: blender/exports/stage15/STAGE_01_ENVIRONMENT.meshopt.glb
// Usage: (cd tools/stage15/glb && npm ci && node derive_environment.mjs)
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { meshopt, prune, dedup } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import { statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const SRC = `${ROOT}blender/exports/STAGE_01_ENVIRONMENT.glb`;
const OUT = `${ROOT}blender/exports/stage15/STAGE_01_ENVIRONMENT.meshopt.glb`;

await MeshoptDecoder.ready;
await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
const doc = await io.read(SRC);
const root = doc.getRoot();
const report = { removedPrimitives: [], removedNodes: [], keptBackdropMaterials: [] };

for (const node of root.listNodes()) {
  const name = node.getName();
  if (name.startsWith('ENM_Shepherd_Placeholder')) { report.removedNodes.push(name); node.dispose(); continue; }
  if (name !== 'ENV_VISUAL_BACKDROP') continue;
  const mesh = node.getMesh();
  if (!mesh) continue;
  for (const prim of mesh.listPrimitives()) {
    const mat = prim.getMaterial()?.getName() ?? '';
    if (mat === 'MAT_Ground_Far') { report.keptBackdropMaterials.push(mat); continue; }
    report.removedPrimitives.push(mat);
    prim.dispose();
  }
}
await doc.transform(prune(), dedup(), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
await io.write(OUT, doc);
const mb = (p) => +(statSync(p).size / 1048576).toFixed(2);
console.log(JSON.stringify({ ...report, source_mb: mb(SRC), output_mb: mb(OUT), materials: root.listMaterials().map((m) => m.getName()).length, textures: root.listTextures().length }, null, 1));
