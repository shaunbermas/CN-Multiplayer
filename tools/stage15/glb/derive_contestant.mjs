// Runtime copy of the shared contestant GLB: dedup, prune, then meshopt-compress geometry and animation.
// Input:  blender/exports/contestant/CNTRIAL_CONTESTANT_MASTER.glb  (written by blender/scripts/contestant_export.py)
// Output: blender/exports/contestant/CNTRIAL_CONTESTANT_MASTER.meshopt.glb
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { meshopt, prune, dedup, resample } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import { statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const IN = `${ROOT}blender/exports/contestant/CNTRIAL_CONTESTANT_MASTER.glb`;
const OUT = `${ROOT}blender/exports/contestant/CNTRIAL_CONTESTANT_MASTER.meshopt.glb`;
await MeshoptDecoder.ready;
await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
const doc = await io.read(IN);
await doc.transform(resample(), prune({ keepAttributes: true }), dedup(), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
await io.write(OUT, doc);
console.log(JSON.stringify({ in_bytes: statSync(IN).size, out_bytes: statSync(OUT).size }));
