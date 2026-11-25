// Decision 037 (owner, 25 Nov 2026): cutout props in the middle distance, between the yard and the painted
// backdrop: light poles, cabins, containers, a factory, water towers, watchtowers and trees. They are flat images
// (one small atlas rendered by tools/stage01/render_midground_props.py, plus the existing tree cutout atlas) on
// alpha-tested quads, so they cost almost nothing: one instanced draw call per prop kind, no collision.
//   - buildings and poles: one quad facing the course, so they do not swim as you walk past;
//   - trees: two crossed quads, so they keep their volume from any angle;
//   - lamps: small additive glows drawn without fog, so their light pierces the mist like the floodlights.
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import manifest from '../../../../../blender/exports/stage01/props/STG01_MIDGROUND_PROPS.json';
import propsUrl from '../../../../../blender/exports/stage01/props/STG01_Midground_Props.webp?url';
import treesUrl from '../../../../../blender/exports/stage15/TREE_Cutout_Atlas.webp?url';
import type { Quality } from '../../game/quality.ts';

/** For tests (window.__cn.assets().midground). */
export const midgroundPropsStatus = { props: 0, trees: 0, glows: 0, batches: 0, problems: [] as string[] };

type Cell = { kind: string; uv: number[]; aspect: number; height_m?: number; top_frac?: number; glows?: number[][] };

/** Unit-height quad (or two crossed quads) standing on y = 0, UVs on one atlas cell. */
function quadGeometry(cell: Cell, crossed: boolean) {
  const [u0, v0, du, dv] = cell.uv;
  const h = cell.top_frac ? 1 / Math.max(0.5, cell.top_frac) : 1;
  const w = h * cell.aspect;
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  const planes = crossed ? 2 : 1;
  for (let p = 0; p < planes; p++) {
    const a = (p * Math.PI) / 2;
    const cx = Math.cos(a), cz = Math.sin(a);
    const base = pos.length / 3;
    for (const [sx, sy] of [[-0.5, 0], [0.5, 0], [-0.5, 1], [0.5, 1]]) {
      pos.push(sx * w * cx, sy * h, sx * w * cz);
      uv.push(u0 + (sx + 0.5) * du, v0 + sy * dv);
    }
    idx.push(base, base + 1, base + 2, base + 2, base + 1, base + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

function glowTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,240,215,1)'); grad.addColorStop(0.2, 'rgba(255,200,140,0.55)'); grad.addColorStop(1, 'rgba(255,150,70,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

/** Share of the props drawn on each tier (trees thin out first on low). */
const TREE_SHARE: Record<string, number> = { low: 0.5, medium: 0.8, high: 1 };

export function MidgroundProps({ quality }: { quality: Quality }) {
  const group = useMemo(() => {
    const out = new THREE.Group();
    out.name = 'STG01_MidgroundProps';
    const loader = new THREE.TextureLoader();
    const load = (url: string, what: string) => {
      const t = loader.load(url, undefined, undefined, () => midgroundPropsStatus.problems.push(`${what} failed to load`));
      t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
    };
    // Pre-lit renders: unlit material, fogged by depth, a touch darker so they sit in the night.
    const propMat = new THREE.MeshBasicMaterial({ map: load(propsUrl, 'prop atlas'), alphaTest: 0.5, side: THREE.DoubleSide, color: new THREE.Color().setScalar(0.85), toneMapped: false });
    const treeMat = new THREE.MeshBasicMaterial({ map: load(treesUrl, 'tree atlas'), alphaTest: 0.5, side: THREE.DoubleSide, color: new THREE.Color(0.32, 0.4, 0.42), toneMapped: false });
    const cells = new Map<string, Cell>((manifest.cells as Cell[]).map((c) => [c.kind, c]));
    const trees = new Map<string, Cell>((manifest.treeCells as Cell[]).map((c) => [c.kind, c]));
    const byKind = new Map<string, typeof manifest.placements>();
    for (const p of manifest.placements) {
      if (!byKind.has(p.kind)) byKind.set(p.kind, []);
      byKind.get(p.kind)!.push(p);
    }
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), v = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    const glowPos: number[] = [];
    let props = 0, treeCount = 0;
    for (const [kind, list] of byKind) {
      const tree = list[0].tree;
      const cell = tree ? trees.get(kind) : cells.get(kind);
      if (!cell) { midgroundPropsStatus.problems.push(`no atlas cell for ${kind}`); continue; }
      const im = new THREE.InstancedMesh(quadGeometry(cell, tree), tree ? treeMat : propMat, list.length);
      list.forEach((p, k) => {
        const [x, , z] = p.pos;
        const height = (tree ? 11 : (cell.height_m ?? 5)) * p.scale;
        // Buildings face the course: toward x = 0 beside the yard, toward the yard's middle beyond its ends.
        const yaw = tree ? (k * 2.39996) % Math.PI : Math.abs(x) > 34 ? (x > 0 ? -Math.PI / 2 : Math.PI / 2) : z > 0 ? 0 : Math.PI;
        q.setFromAxisAngle(up, yaw);
        im.setMatrixAt(k, m.compose(v.set(x, 0, z), q, s.setScalar(height)));
        for (const [gx, gy] of cell.glows ?? []) {
          // glow point on the quad: x across (rotated by yaw), y up
          const across = (gx - 0.5) * height * cell.aspect;
          glowPos.push(x + Math.cos(yaw) * across, gy * height, z - Math.sin(yaw) * across);
        }
      });
      im.computeBoundingSphere();
      im.name = `STG01_Mid_${kind}`;
      out.add(im);
      if (tree) treeCount += list.length; else props += list.length;
    }
    if (glowPos.length) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(glowPos, 3));
      const pts = new THREE.Points(g, new THREE.PointsMaterial({ map: glowTexture(), size: 2.4, sizeAttenuation: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, toneMapped: false, opacity: 0.75 }));
      pts.name = 'STG01_Mid_LampGlows';
      out.add(pts);
    }
    Object.assign(midgroundPropsStatus, { props, trees: treeCount, glows: glowPos.length / 3, batches: out.children.length });
    return out;
  }, []);
  // Thin the trees on lower tiers by drawing fewer instances (no rebuild).
  useEffect(() => {
    const share = TREE_SHARE[quality] ?? 1;
    for (const o of group.children) {
      const im = o as THREE.InstancedMesh;
      if (!im.isInstancedMesh) continue;
      const isTree = (im.material as THREE.MeshBasicMaterial).color.r < 0.5;
      im.count = isTree ? Math.max(1, Math.round(im.instanceMatrix.count * share)) : im.instanceMatrix.count;
    }
  }, [group, quality]);
  useEffect(() => () => {
    const mats = new Set<THREE.Material>();
    group.traverse((o) => { const mm = o as THREE.Mesh; if (mm.isMesh || (o as THREE.Points).isPoints) { mm.geometry.dispose(); mats.add(mm.material as THREE.Material); } });
    for (const mt of mats) { (mt as THREE.MeshBasicMaterial).map?.dispose(); mt.dispose(); }
  }, [group]);
  return <primitive object={group} />;
}
