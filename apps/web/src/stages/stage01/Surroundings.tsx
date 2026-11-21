// Stage 1.5 (Prompt 02): the painted world around the yard. Three matte layers on cylinders around the
// course (hills, industrial skyline, forest line) and distant tree cutouts drawn as camera-facing billboards
// in one instanced draw call. Everything is placed from STAGE_01_MATTE_PAINTING_MANIFEST.json (generated from
// the approved metadata and scenery footprints). Decorative only: no collision, no gameplay effect.
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import manifest from '../../../../../blender/exports/stage15/STAGE_01_MATTE_PAINTING_MANIFEST.json';
import hillsUrl from '../../../../../blender/exports/stage15/MP_FarHills.webp?url';
import skylineUrl from '../../../../../blender/exports/stage15/MP_IndustrialSkyline.webp?url';
import forestUrl from '../../../../../blender/exports/stage15/MP_ForestLine.webp?url';
import atlasUrl from '../../../../../blender/exports/stage15/TREE_Cutout_Atlas.webp?url';
import type { Quality } from '../../game/quality.ts';

const LAYER_URL: Record<string, string> = { MP_FarHills: hillsUrl, MP_IndustrialSkyline: skylineUrl, MP_ForestLine: forestUrl };

/** Load status for tests (window.__cn.assets().surroundings). */
export const surroundingsStatus = { layers: 0, cutouts: 0, fog: 'none', problems: [] as string[] };

const loader = new THREE.TextureLoader();
function loadTexture(url: string, onError: (e: unknown) => void) {
  const t = loader.load(url, undefined, undefined, onError);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Open cylinder facing inward, u = 0 toward +Z, increasing toward +X (the manifest's convention). */
function layerGeometry(radius: number, height: number, bottom: number, uOffset: number, segments = 128) {
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  for (let i = 0; i <= segments; i++) {
    const u = i / segments;
    const a = u * Math.PI * 2;
    const x = Math.sin(a) * radius, z = Math.cos(a) * radius;
    pos.push(x, bottom, z, x, bottom + height, z);
    uv.push(u + uOffset, 0, u + uOffset, 1);
    if (i < segments) { const k = i * 2; idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

function MatteLayers() {
  const group = useMemo(() => {
    const g = new THREE.Group();
    g.name = 'STG01_MatteLayers';
    g.position.set(manifest.centre[0], 0, manifest.centre[2]);
    for (const l of manifest.layers) {
      const tex = loadTexture(LAYER_URL[l.id], () => surroundingsStatus.problems.push(`matte layer ${l.id} failed to load`));
      tex.wrapS = THREE.RepeatWrapping;
      const mat = new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color().setScalar(l.brightness ?? 1), transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false, toneMapped: false });
      const mesh = new THREE.Mesh(layerGeometry(l.radius, l.height, l.bottom, l.uOffset), mat);
      mesh.name = l.id;
      mesh.renderOrder = -10 + l.order; // far layers first; they never write depth
      mesh.frustumCulled = false;
      g.add(mesh);
    }
    surroundingsStatus.layers = manifest.layers.length;
    return g;
  }, []);
  useEffect(() => () => {
    group.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { m.geometry.dispose(); const mat = m.material as THREE.MeshBasicMaterial; mat.map?.dispose(); mat.dispose(); } });
  }, [group]);
  return <primitive object={group} />;
}

const billboardVertex = /* glsl */ `
attribute vec4 aCell;     // u0, v0, du, dv in the atlas
attribute vec3 aTint;
attribute vec2 aSize;     // width, height (m); negative width mirrors
varying vec2 vUv;
varying vec3 vTint;
varying float vFogDepth;
void main() {
  vec3 base = (instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  vec3 toCam = cameraPosition - base; toCam.y = 0.0;
  vec3 right = normalize(vec3(toCam.z, 0.0, -toCam.x) + vec3(1e-5, 0.0, 0.0));
  vec3 world = base + right * position.x * aSize.x + vec3(0.0, position.y * aSize.y, 0.0);
  vec4 mv = viewMatrix * vec4(world, 1.0);
  gl_Position = projectionMatrix * mv;
  vFogDepth = -mv.z;
  vUv = vec2(aCell.x + (0.004 + uv.x * 0.992) * aCell.z, aCell.y + uv.y * 0.998 * aCell.w);
  vTint = aTint;
}`;
const billboardFragment = /* glsl */ `
uniform sampler2D uAtlas;
uniform vec3 uFogColor;
uniform float uFogDensity;
uniform vec2 uFogNearFar;
uniform float uBrightness;
varying vec2 vUv;
varying vec3 vTint;
varying float vFogDepth;
void main() {
  vec4 c = texture2D(uAtlas, vUv);
  if (c.a < 0.5) discard;
  vec3 col = c.rgb * vTint * uBrightness;
  float f = uFogDensity > 0.0 ? 1.0 - exp(-uFogDensity * uFogDensity * vFogDepth * vFogDepth)
                              : smoothstep(uFogNearFar.x, uFogNearFar.y, vFogDepth);
  // Capped haze: a distant tree must stay a darker silhouette than the painted layers behind it.
  gl_FragColor = vec4(mix(col, uFogColor * 0.85, clamp(f, 0.0, 1.0) * 0.55), 1.0);
  #include <colorspace_fragment>
}`;

function TreeCutouts({ quality }: { quality: Quality }) {
  const { scene } = useThree();
  const cut = manifest.cutouts;
  const mesh = useMemo(() => {
    const frac = cut.qualityFraction[quality];
    const list = cut.instances.filter((i) => i.rank < frac);
    const geo = new THREE.PlaneGeometry(1, 1);
    geo.translate(0, 0.5, 0);
    const cell = new Float32Array(list.length * 4), tint = new Float32Array(list.length * 3), size = new Float32Array(list.length * 2);
    const m = new THREE.Matrix4();
    const atlas = loadTexture(atlasUrl, () => surroundingsStatus.problems.push('tree cutout atlas failed to load'));
    const mat = new THREE.ShaderMaterial({
      vertexShader: billboardVertex, fragmentShader: billboardFragment,
      uniforms: { uAtlas: { value: atlas }, uFogColor: { value: new THREE.Color() }, uFogDensity: { value: 0 }, uFogNearFar: { value: new THREE.Vector2(1, 1000) }, uBrightness: { value: 1 } },
    });
    const im = new THREE.InstancedMesh(geo, mat, list.length);
    list.forEach((inst, k) => {
      const c = cut.cells[inst.cell];
      cell.set(c.uv, k * 4);
      tint.set(inst.tint, k * 3);
      const cellH = inst.height / Math.max(0.5, c.top_frac); // the tree fills top_frac of its cell
      size.set([(inst.flip ? -1 : 1) * cellH * c.aspect, cellH], k * 2);
      im.setMatrixAt(k, m.makeTranslation(inst.pos[0], inst.pos[1], inst.pos[2]));
    });
    geo.setAttribute('aCell', new THREE.InstancedBufferAttribute(cell, 4));
    geo.setAttribute('aTint', new THREE.InstancedBufferAttribute(tint, 3));
    geo.setAttribute('aSize', new THREE.InstancedBufferAttribute(size, 2));
    im.frustumCulled = false; // billboards spread around the whole stage; one draw call either way
    im.name = 'STG01_TreeCutouts';
    surroundingsStatus.cutouts = list.length;
    return im;
  }, [quality, cut]);
  useEffect(() => () => { mesh.geometry.dispose(); const mat = mesh.material as THREE.ShaderMaterial; mat.uniforms.uAtlas.value.dispose(); mat.dispose(); }, [mesh]);
  useFrame(() => {
    // Follow the scene fog so cutouts fade into the same distance haze as the 3D world.
    const u = (mesh.material as THREE.ShaderMaterial).uniforms;
    const fog = scene.fog;
    if (fog instanceof THREE.FogExp2) { u.uFogColor.value.copy(fog.color); u.uFogDensity.value = fog.density; }
    else if (fog instanceof THREE.Fog) { u.uFogColor.value.copy(fog.color); u.uFogDensity.value = 0; u.uFogNearFar.value.set(fog.near, fog.far); }
    surroundingsStatus.fog = fog ? `${fog.constructor.name} #${u.uFogColor.value.getHexString()} ${u.uFogDensity.value}` : 'none';
  });
  return <primitive object={mesh} />;
}

export function Surroundings({ quality }: { quality: Quality }) {
  return (
    <>
      <MatteLayers />
      <TreeCutouts quality={quality} />
    </>
  );
}
