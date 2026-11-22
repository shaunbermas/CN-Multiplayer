// Stage 1.5 (Prompt 03): midground trees. The approved scene's 49 tree positions (STG01_BG_Tree_*, exported
// read-only to blender/stage15/STAGE_01_SCENERY_ZONES.json) get lit crossed-plane impostors using the
// Prompt 02 cutout atlas, instead of the stacked cones. One instanced draw call per tree shape; alpha clip,
// so shadows and depth are correct without blended transparency. Decorative only (no collision).
//
// Tree LOD rule (docs/stage15/P03_FOREGROUND_REPORT.md):
//   yard edge to ~10 m beyond the visual collections: these lit 3D impostors (3 crossed planes, 6 triangles)
//   beyond: camera-facing cutout billboards (Surroundings.tsx); past ~470 m: the painted forest layer.
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import zones from '../../../../../blender/stage15/STAGE_01_SCENERY_ZONES.json';
import matte from '../../../../../blender/exports/stage15/STAGE_01_MATTE_PAINTING_MANIFEST.json';
import atlasUrl from '../../../../../blender/exports/stage15/TREE_Cutout_Atlas.webp?url';

export const midgroundStatus = { trees: 0, batches: 0 };

/** Deterministic 0..1 hash of a string (stable variation per approved tree id). */
function hash(s: string) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return ((h >>> 0) % 10000) / 10000; }

/** Three planes crossed at 60 degrees, UVs on one atlas cell, normals bent outward for soft lighting. */
function crossedPlanes(cell: { uv: number[]; aspect: number; top_frac: number }) {
  const g = new THREE.BufferGeometry();
  const pos: number[] = [], nor: number[] = [], uv: number[] = [], idx: number[] = [];
  const h = 1 / Math.max(0.5, cell.top_frac); // the tree's top reaches height 1
  const w = h * cell.aspect;
  const [u0, v0, du, dv] = cell.uv;
  for (let p = 0; p < 3; p++) {
    const a = (p * Math.PI) / 3;
    const cx = Math.cos(a), cz = Math.sin(a);
    const base = pos.length / 3;
    for (const [sx, sy] of [[-0.5, 0], [0.5, 0], [-0.5, 1], [0.5, 1]]) {
      const x = sx * w * cx, z = sx * w * cz, y = sy * h;
      pos.push(x, y, z);
      const n = new THREE.Vector3(x, (y - 0.45 * h) * 0.6 + 0.35, z).normalize();
      nor.push(n.x, n.y, n.z);
      uv.push(u0 + (0.004 + (sx + 0.5) * 0.992) * du, v0 + sy * 0.998 * dv);
    }
    idx.push(base, base + 1, base + 2, base + 2, base + 1, base + 3);
  }
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

export function MidgroundTrees({ shadows }: { shadows: boolean }) {
  const group = useMemo(() => {
    const out = new THREE.Group();
    out.name = 'STG01_MidgroundTrees';
    const atlas = new THREE.TextureLoader().load(atlasUrl);
    atlas.colorSpace = THREE.SRGBColorSpace;
    atlas.anisotropy = 4;
    const mat = new THREE.MeshStandardMaterial({ map: atlas, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.92, metalness: 0, envMapIntensity: 0.4 });
    const conifers = matte.cutouts.cells.filter((c) => c.kind.startsWith('conifer'));
    const byCell = new Map<number, typeof zones.existing_trees>();
    for (const t of zones.existing_trees) {
      const c = conifers[Math.floor(hash(t.id) * conifers.length)];
      if (!byCell.has(c.index)) byCell.set(c.index, []);
      byCell.get(c.index)!.push(t);
    }
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    for (const [index, trees] of byCell) {
      const cell = matte.cutouts.cells[index];
      const im = new THREE.InstancedMesh(crossedPlanes(cell), mat, trees.length);
      trees.forEach((t, k) => {
        const r = hash(`${t.id}:s`);
        const height = t.height * (0.9 + 0.45 * r); // approved 12 m trees, with natural variation
        q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), hash(`${t.id}:r`) * Math.PI * 2);
        im.setMatrixAt(k, m.compose(p.set(t.pos[0], t.pos[1], t.pos[2]), q, s.setScalar(height)));
      });
      im.computeBoundingSphere();
      im.name = `STG01_Tree_${cell.kind}`;
      out.add(im);
    }
    midgroundStatus.trees = zones.existing_trees.length;
    midgroundStatus.batches = byCell.size;
    return out;
  }, []);
  useEffect(() => { group.traverse((o) => { if ((o as THREE.Mesh).isMesh) { o.castShadow = shadows; o.receiveShadow = false; } }); }, [group, shadows]);
  useEffect(() => () => {
    let mat: THREE.MeshStandardMaterial | null = null;
    group.traverse((o) => { const im = o as THREE.InstancedMesh; if (im.isMesh) { im.geometry.dispose(); mat = im.material as THREE.MeshStandardMaterial; } });
    if (mat) { (mat as THREE.MeshStandardMaterial).map?.dispose(); (mat as THREE.MeshStandardMaterial).dispose(); }
  }, [group]);
  return <primitive object={group} />;
}
