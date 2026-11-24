// Stage 01 scene module (Prompt 07): the approved environment GLB (Prompt 05), The Watcher GLB (Prompt 06)
// and the runtime lighting description, all placed from the shared stage geometry (approved metadata).
// Everything here is presentation: signal colours, lamps and The Watcher's clips follow the server's
// public round state; no gameplay decision is made in the browser.
import { useAnimations, useGLTF } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { RectAreaLightUniformsLib } from 'three/examples/jsm/lights/RectAreaLightUniformsLib.js';
// Stage 1.5 (Prompt 08): meshopt-compressed copies of the approved GLBs (tools/stage15/compress_glb.sh). The
// approved originals are unchanged; geometry is identical after decoding (asset checks below still run).
import envUrl from '../../../../../blender/exports/stage15/STAGE_01_ENVIRONMENT.meshopt.glb?url';
import watcherUrl from '../../../../../blender/exports/stage15/THE_WATCHER.meshopt.glb?url';
import lighting from '../../../../../blender/exports/STAGE_01_LIGHTING.json';
import type { TrialRoom } from '../../net.ts';
import { useQuality, type Quality } from '../../game/quality.ts';
import { signalView } from '../../game/roundClock.ts';
import { stageGeo } from '../../game/stage.ts';
import { Surroundings, surroundingsStatus } from './Surroundings.tsx';
import { buildSkyEnvironment } from './skyModel.ts';
import { Atmosphere, atmosphereStatus } from './Atmosphere.tsx';
import { Obstacles, obstacleStatus } from './Obstacles.tsx';
import { FOG } from './fog.ts';
import { setPuddles } from '../../game/groundFx.ts';
import { driveLens, eyeState, upgradeWatcherMaterials, watcherLookStatus, type WatcherLook } from './watcherLook.ts';
import { WatcherFX, watcherFxStatus } from './WatcherFX.tsx';
import { CLIP_SECONDS, MISSING_FROM_MANIFEST, WATCHER_CLIPS, chooseWatcherClip, type WatcherChoice } from './watcherAnimation.ts';

export const ENV_URL = envUrl;
export const WATCHER_URL = watcherUrl;

/** Load status, exposed to tests through window.__cn.assets. */
export const stage01Assets = {
  environment: 'loading' as 'loading' | 'ready',
  watcher: 'loading' as 'loading' | 'ready',
  problems: [] as string[],
  watcherHeight: 0,
  watcherClips: [] as string[],
  watcherClip: '',
  /** Recent clip changes (newest last), for tests: [clip, local time ms]. */
  clipHistory: [] as [string, number][],
  quality: 'high' as Quality,
  /** What the current tier turned on, for tests: light ids, shadow casters, dust count, haze. */
  effects: { lights: [] as string[], shadows: [] as string[], dust: 0, haze: false },
  /** Stage 1.5 painted surroundings: matte layers and tree cutouts drawn, and load problems. */
  surroundings: surroundingsStatus,
  /** Midground trees are retired (Phase 04: no 3D trees); kept at 0 so older test reports still parse. */
  midground: { trees: 0 },
  /** Cone-tree triangles removed from ENV_VISUAL_FOLIAGE (grass tufts kept), and whether the sky env map is set. */
  foliageTrianglesRemoved: 0,
  /** Stage 1.5 atmosphere (sky, light cones, mist, signal wash, post-processing) for the current tier. */
  atmosphere: atmosphereStatus,
  /** Stage 01 obstacles (always on since decision 031, lobby included). */
  obstacles: obstacleStatus,
  /** Puddle cells (0.5 m) found for the splash effects. */
  wetCells: 0,
  /** Scene fog (decision 031: visible by default on every tier). */
  fog: { type: 'none', density: 0, color: '' } as { type: string; density: number; color: string },
  /** Stage 1.5 Watcher detection presentation (scan beam, searchlight) and lens emissive boost. */
  watcherFx: watcherFxStatus,
  /** Phase 05: upgraded Watcher materials and the current eye state (neutral, green, red, detect). */
  watcherLook: watcherLookStatus,
  environmentMap: false,
};

/** Environment-map strength per tier: reflections in puddles, wet asphalt and steel (Prompt 03). */
const ENV_INTENSITY: Record<Quality, number> = { low: 0, medium: 0.5, high: 0.6 };

type Tier = { dynamicLights: string[] | string; dust?: number; hazeCards?: boolean; shadows?: string[] | boolean };
const tierOf = (q: Quality) => lighting.qualityTiers[q] as Tier;
const shadowLights = (q: Quality) => { const s = tierOf(q).shadows; return Array.isArray(s) ? s : []; };

// Course volume the moon's shadow camera must cover (game metres): the fenced field, the towers and The Watcher.
const SHADOW_VOLUME = new THREE.Box3(new THREE.Vector3(-48, 0, -200), new THREE.Vector3(48, 34, 25));

/** Fits a directional light's orthographic shadow camera tightly around SHADOW_VOLUME. */
function fitShadow(light: THREE.DirectionalLight, dir: THREE.Vector3) {
  const centre = SHADOW_VOLUME.getCenter(new THREE.Vector3());
  light.target.position.copy(centre);
  light.position.copy(centre).addScaledVector(dir, -200);
  light.updateMatrixWorld();
  light.target.updateMatrixWorld();
  const view = new THREE.Matrix4().lookAt(light.position, light.target.position, new THREE.Vector3(0, 1, 0));
  const inv = view.clone().invert();
  const b = new THREE.Box3();
  const { min, max } = SHADOW_VOLUME;
  for (const x of [min.x, max.x]) for (const y of [min.y, max.y]) for (const z of [min.z, max.z]) {
    b.expandByPoint(new THREE.Vector3(x, y, z).sub(light.position).applyMatrix4(inv));
  }
  const cam = light.shadow.camera;
  cam.left = b.min.x - 1; cam.right = b.max.x + 1; cam.bottom = b.min.y - 1; cam.top = b.max.y + 1;
  cam.near = Math.max(0.5, -b.max.z - 5); cam.far = -b.min.z + 5;
  cam.updateProjectionMatrix();
  light.shadow.mapSize.set(2048, 2048);
  light.shadow.bias = -0.0004;
  light.shadow.normalBias = 0.04;
  light.castShadow = true;
}

let rectLibReady = false;

/** Lights that followed the retired Shepherd placeholder (decision 023) are not used with The Watcher. */
export const retiredLight = (l: { follows?: string }) => !!l.follows?.startsWith('ENM_Shepherd_Placeholder');

function dispose(root: THREE.Object3D) {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.geometry) m.geometry.dispose();
    const mats = m.material ? ([] as THREE.Material[]).concat(m.material) : [];
    for (const mat of mats) {
      for (const v of Object.values(mat)) if (v instanceof THREE.Texture) v.dispose();
      mat.dispose();
    }
  });
}

// ------------------------------------------------------------------------------------------ lighting
function Lighting({ quality }: { quality: Quality }) {
  const { scene } = useThree();
  const L = lighting;
  const lights = useMemo(() => {
    const out: THREE.Object3D[] = [];
    const amb = L.ambient;
    const hemi = new THREE.HemisphereLight(new THREE.Color(...(amb.sky as [number, number, number])), new THREE.Color(...(amb.ground as [number, number, number])),
      amb.intensity * (quality === 'low' ? 1.9 : 1.4));
    hemi.name = 'LGT_STG01_Ambient';
    out.push(hemi);
    const tier = tierOf(quality);
    const casters = shadowLights(quality);
    const wanted = (id: string) => tier.dynamicLights === 'all' || (tier.dynamicLights as string[]).some((p) => (p.endsWith('*') ? id.startsWith(p.slice(0, -1)) : id === p));
    for (const l of L.lights) {
      if (!wanted(l.id) || retiredLight(l)) continue;
      const col = new THREE.Color(...(l.color as [number, number, number]));
      let o: THREE.Light | null = null;
      if (l.type === 'directional') o = new THREE.DirectionalLight(col, 0.6);
      else if (l.type === 'spot') o = new THREE.SpotLight(col, 1700, 110, THREE.MathUtils.degToRad(l.angleDeg ?? 40), l.penumbra ?? 0.5, 1.5);
      else if (l.type === 'point') o = new THREE.PointLight(col, 260, (l.range ?? 25) * 1.4, 1.5);
      else if (l.type === 'rect_area') {
        // The finish gate's lamp strip: a wide, thin area light shining down (MeshStandard materials only).
        if (!rectLibReady) { RectAreaLightUniformsLib.init(); rectLibReady = true; }
        const r = new THREE.RectAreaLight(col, 9, l.width ?? 10, l.height ?? 1);
        r.name = l.id;
        r.position.set(...(l.position as [number, number, number]));
        const [dx, dy, dz] = l.direction as [number, number, number];
        r.lookAt(l.position[0] + dx, l.position[1] + dy, l.position[2] + dz);
        out.push(r);
        continue;
      }
      if (!o) continue;
      o.name = l.id;
      o.position.set(...(l.position as [number, number, number]));
      if (o instanceof THREE.DirectionalLight && casters.includes(l.id)) {
        fitShadow(o, new THREE.Vector3(...(l.direction as [number, number, number])).normalize());
        out.push(o.target, o);
        continue;
      }
      const t = (o as THREE.SpotLight | THREE.DirectionalLight).target;
      if (t) {
        const [dx, dy, dz] = l.direction as [number, number, number];
        t.position.set(l.position[0] + dx * 10, l.position[1] + dy * 10, l.position[2] + dz * 10);
        out.push(t);
      }
      out.push(o);
    }
    stage01Assets.effects.lights = out.filter((o) => (o as THREE.Light).isLight).map((o) => o.name).filter(Boolean);
    stage01Assets.effects.shadows = out.filter((o) => (o as THREE.Light).castShadow).map((o) => o.name);
    return out;
  }, [quality, L]);
  const gl = useThree((st) => st.gl);
  useEffect(() => {
    // Low tier: no environment map. Measured as the biggest Low-tier cost (6x CPU-throttled software WebGL:
    // 1.49 fps with it, 2.48 without), and Low exists for weak machines (Prompt 08).
    if (quality === 'low') { scene.environment = null; stage01Assets.environmentMap = false; return; }
    const rt = buildSkyEnvironment(gl);
    scene.environment = rt.texture;
    stage01Assets.environmentMap = true;
    return () => { scene.environment = null; stage01Assets.environmentMap = false; rt.dispose(); };
  }, [gl, scene, quality]);
  useEffect(() => { scene.environmentIntensity = ENV_INTENSITY[quality]; }, [scene, quality]);
  useEffect(() => {
    // The Stage 1.5 sky dome draws the sky; this colour only shows for a frame before it mounts.
    // Owner feedback (decision 031): visible fog by default on every tier (fog.ts). Replaces the approved
    // lighting file's light haze (density 0.0045) and Low's linear 60-260 m fog.
    scene.background = FOG.color.clone();
    scene.fog = new THREE.FogExp2(FOG.color.clone(), FOG.density);
    stage01Assets.fog = { type: 'exp2', density: FOG.density, color: `#${FOG.color.getHexString()}` };
    return () => { scene.fog = null; scene.background = null; };
  }, [scene, quality, L]);
  return <>{lights.map((o) => <primitive key={o.uuid} object={o} />)}</>;
}

// ------------------------------------------------------------------------------------------ environment
/**
 * Stage 01 refinement (Phase 04): no 3D trees at all; the painted matte layers carry the forest. The cone trees are
 * merged into ENV_VISUAL_FOLIAGE together with the grass tufts, so drop the tree trunks (wood) and every
 * foliage triangle above 1 m (tufts are 0.45–0.55 m tall). The GLB itself is unchanged.
 */
function stripConeTrees(root: THREE.Object3D): number {
  const node = root.getObjectByName('ENV_VISUAL_FOLIAGE');
  if (!node) { stage01Assets.problems.push('environment: ENV_VISUAL_FOLIAGE missing'); return 0; }
  let removed = 0;
  root.updateMatrixWorld(true);
  node.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const mat = mesh.material as THREE.Material;
    const g = mesh.geometry;
    if (mat.name === 'MAT_Wood_Weathered') { removed += (g.index ? g.index.count : g.attributes.position.count) / 3; mesh.visible = false; return; }
    if (mat.name !== 'MAT_Foliage' || !g.index || g.userData.stripped) return;
    // Height in world metres. The GLB is quantised (KHR_mesh_quantization): local positions are normalised
    // shorts scaled up by the node, so the old local-space test kept every triangle and the cone trees stayed
    // visible in every Stage 1.5 build (found in the Stage 01 refinement, Phase 04).
    const pos = g.attributes.position;
    const e = mesh.matrixWorld.elements;
    const wy = (i: number) => e[1] * pos.getX(i) + e[5] * pos.getY(i) + e[9] * pos.getZ(i) + e[13];
    const src = g.index.array;
    const keep: number[] = [];
    for (let i = 0; i < src.length; i += 3) {
      if (Math.max(wy(src[i]), wy(src[i + 1]), wy(src[i + 2])) < 1.0) keep.push(src[i], src[i + 1], src[i + 2]);
      else removed++;
    }
    g.setIndex(keep);
    g.userData.stripped = true;
    g.computeBoundingSphere();
  });
  return removed;
}

const LAMP: Record<string, string> = { green: 'MAT_Signal_Green', warning: 'MAT_Signal_Amber', red: 'MAT_Signal_Red' };

function Environment({ room, quality }: { room: TrialRoom; quality: Quality }) {
  const gltf = useGLTF(ENV_URL, false, true);
  const scene = useThree((st) => st.scene);
  const puddles = useMemo(() => new Set<THREE.MeshStandardMaterial>(), []);
  const lamps = useMemo(() => {
    const mats = new Map<string, THREE.MeshStandardMaterial>();
    const puddleMeshes: THREE.Mesh[] = [];
    gltf.scene.traverse((o) => {
      if ((o as THREE.Mesh).isMesh && ((o as THREE.Mesh).material as THREE.Material)?.name === 'MAT_Puddle') puddleMeshes.push(o as THREE.Mesh);
      // The Prompt 05 environment still carries the retired Shepherd placeholder; The Watcher replaces it (decision 023).
      if (o.name.startsWith('ENM_Shepherd_Placeholder')) o.visible = false;
      const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
      if (m && m.name?.startsWith('MAT_Signal_')) mats.set(m.name, m);
      // Puddles: a near-black mirror in the approved material; with the sky environment it now reflects.
      if (m && m.name === 'MAT_Puddle') puddles.add(m);
      // Owner feedback (more horror): the warm lamp strips were the brightest thing at the Watcher's end and
      // bloomed into a white bar; tone them down so the doll and its red eye dominate.
      if (m && m.name === 'MAT_Light_Warm' && !m.userData.stage15dim) { m.emissiveIntensity *= 0.35; m.userData.stage15dim = true; }
    });
    for (const n of Object.values(LAMP)) if (!mats.has(n)) stage01Assets.problems.push(`environment: material ${n} missing`);
    stage01Assets.foliageTrianglesRemoved = stripConeTrees(gltf.scene);
    // Wet ground for the splash effects (decision 031): the puddles' footprint, rasterised once.
    stage01Assets.wetCells = setPuddles(puddleMeshes);
    stage01Assets.environment = 'ready';
    return mats;
  }, [gltf]);
  useEffect(() => {
    const haze = !!tierOf(quality).hazeCards;
    const shadows = shadowLights(quality).length > 0;
    gltf.scene.traverse((o) => {
      if (o.name === 'VFX_GroundHaze') o.visible = haze;
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const mats = ([] as THREE.Material[]).concat(mesh.material);
      const solid = mats.every((m) => !m.transparent && !m.name.startsWith('MAT_VFX'));
      mesh.castShadow = shadows && solid;
      mesh.receiveShadow = shadows && solid;
    });
    stage01Assets.effects.haze = haze;
  }, [gltf, quality]);
  useEffect(() => () => { dispose(gltf.scene); useGLTF.clear(ENV_URL); stage01Assets.environment = 'loading'; }, [gltf]);
  useFrame(() => {
    // Puddles (Stage 1.5): give the near-black mirror the sky environment map directly, so its own reflection
    // strength applies (scene.environment ignores per-material intensity), and spread highlights a little.
    for (const m of puddles) {
      if (scene.environment) {
        if (m.envMap === scene.environment) continue;
        m.envMap = scene.environment;
        m.envMapIntensity = 1.4;
        m.roughness = 0.12;
        m.color.set(0.01, 0.013, 0.016);
        m.needsUpdate = true;
      } else if (m.envMap !== null || m.userData.lowLook !== true) {
        // Low tier (no reflections): dull, slightly glossy dark water instead of a black mirror.
        m.envMap = null;
        m.roughness = 0.3;
        m.color.set(0.035, 0.05, 0.058);
        m.userData.lowLook = true;
        m.needsUpdate = true;
      }
    }
    const sig = signalView(room).signal;
    for (const [name, mat] of lamps) mat.emissiveIntensity = LAMP[sig] === name ? 6 : sig === 'none' ? 0.35 : 0.08;
  });
  return <primitive object={gltf.scene} />;
}

// ------------------------------------------------------------------------------------------ The Watcher
function Watcher({ room, search }: { room: TrialRoom; search: boolean }) {
  const gltf = useGLTF(WATCHER_URL, false, true);
  const group = useRef<THREE.Group>(null);
  const { actions } = useAnimations(gltf.animations, group);
  const current = useRef<WatcherChoice | null>(null);
  const resultsAt = useRef<number | null>(null);
  const segSeen = useRef<{ key: string; at: number }>({ key: '', at: 0 });
  const spotSeen = useRef<{ key: string; at: number }>({ key: '', at: 0 });
  const look = useRef<WatcherLook | null>(null);
  const w = stageGeo.watcher!;

  useEffect(() => {
    // Verify the asset against the stage contract once: clips, anchors, height (28 m), feet on its root.
    const names = gltf.animations.map((a) => a.name);
    stage01Assets.watcherClips = names;
    for (const c of WATCHER_CLIPS) {
      if (!names.includes(c)) stage01Assets.problems.push(`watcher: clip ${c} missing from THE_WATCHER.glb`);
      const clip = gltf.animations.find((a) => a.name === c);
      if (clip && Math.abs(clip.duration - CLIP_SECONDS[c]) > 0.05) stage01Assets.problems.push(`watcher: ${c} lasts ${clip.duration.toFixed(2)} s, manifest says ${CLIP_SECONDS[c].toFixed(2)} s`);
    }
    for (const c of MISSING_FROM_MANIFEST) stage01Assets.problems.push(`watcher: clip ${c} not in the asset manifest`);
    for (const a of ['Watcher_Root', 'Watcher_OpticalOrigin', 'Watcher_DetectionForward']) {
      if (!gltf.scene.getObjectByName(a)) stage01Assets.problems.push(`watcher: anchor ${a} missing`);
    }
    // Skinned bounds move with the clips, so never frustum-cull; The Watcher casts the moon's shadow on High.
    gltf.scene.traverse((o) => { if ((o as THREE.Mesh).isMesh) { o.frustumCulled = false; o.castShadow = true; } });
    // Stage 1.5 material polish (presentation only, approved design unchanged): the signal lens materials glow a
    // little brighter so the red / green state reads at 190 m and catches the High tier's bloom.
    gltf.scene.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
      if (m?.name?.startsWith('MAT_Watcher_Lens_') && !m.userData.stage15) { m.emissiveIntensity *= 1.8; m.userData.stage15 = true; }
    });
    // Measure in the asset's own frame: by now the scene may already sit under the plinth-height group,
    // so detach it for the measurement (skinned bounds use the bones' world matrices).
    const parent = gltf.scene.parent;
    parent?.remove(gltf.scene);
    gltf.scene.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(gltf.scene, true);
    parent?.add(gltf.scene);
    gltf.scene.updateMatrixWorld(true);
    stage01Assets.watcherHeight = +(box.max.y - box.min.y).toFixed(3);
    if (Math.abs(stage01Assets.watcherHeight - w.height) > 0.2) stage01Assets.problems.push(`watcher: height ${stage01Assets.watcherHeight} m, stage expects ${w.height} m`);
    if (Math.abs(box.min.y) > 0.05) stage01Assets.problems.push(`watcher: feet at ${box.min.y.toFixed(2)} m, expected 0 at the root`);
    // Stage 01 refinement (Phase 05): material and lens polish only; geometry is locked (watcherLook.ts).
    look.current = upgradeWatcherMaterials(gltf.scene, w.y, w.height);
    stage01Assets.watcher = 'ready';
    return () => { look.current?.dispose(); look.current = null; dispose(gltf.scene); useGLTF.clear(WATCHER_URL); stage01Assets.watcher = 'loading'; };
  }, [gltf, w.height, w.y]);

  useFrame(() => {
    const v = signalView(room);
    const phase = room.round.phase;
    if (phase === 'results' && resultsAt.current === null) resultsAt.current = Date.now();
    if (phase !== 'results') resultsAt.current = null;
    const spotted = [...room.events].reverse().find((e) => e.kind === 'spotted');
    // A segment is identified by phase, signal and start time (the countdown and the first green both start at 0).
    const segKey = `${phase}:${v.signal}:${v.segStart}`;
    if (segSeen.current.key !== segKey) segSeen.current = { key: segKey, at: Date.now() };
    // Each server spot plays Watcher_Detect in full from the first frame that draws it, so a slow client whose
    // next frame comes late still shows The Watcher reacting (same rule as the segment opening clips).
    // Only spots from this round count (events from earlier rounds stay in the client's list).
    const goLocal = Date.now() - v.elapsed * 1000;
    const thisRoundSpot = spotted && phase === 'active' && spotted.at >= goLocal - 1000 ? spotted : undefined;
    const spotKey = thisRoundSpot ? `${thisRoundSpot.id}@${thisRoundSpot.at}` : '';
    if (spotSeen.current.key !== spotKey) spotSeen.current = { key: spotKey, at: Date.now() };
    if (look.current) driveLens(look.current, eyeState(phase, v.signal, thisRoundSpot ? (Date.now() - spotSeen.current.at) / 1000 : Infinity), performance.now() / 1000);
    const choice = chooseWatcherClip({
      phase, signal: v.signal, into: v.into, sinceSegmentSeen: (Date.now() - segSeen.current.at) / 1000, segmentLength: v.segLength, segmentStart: v.segStart, redIndex: v.redIndex,
      sinceSpotted: thisRoundSpot ? (Date.now() - spotSeen.current.at) / 1000 : Infinity,
      sinceResults: resultsAt.current === null ? Infinity : (Date.now() - resultsAt.current) / 1000,
    });
    if (current.current?.key === choice.key) return;
    const next = actions[choice.clip];
    if (!next) return;
    const prev = current.current ? actions[current.current.clip] : null;
    next.reset();
    next.setLoop(choice.loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
    next.clampWhenFinished = true;
    next.timeScale = choice.timeScale;
    next.play();
    if (prev && prev !== next) next.crossFadeFrom(prev, 0.2, false);
    current.current = choice;
    stage01Assets.watcherClip = choice.clip;
    stage01Assets.clipHistory.push([choice.clip, Date.now()]);
    if (stage01Assets.clipHistory.length > 60) stage01Assets.clipHistory.shift();
  });

  // The GLB faces +Z (game yaw PI); rotate by the stage's facing relative to that.
  return (
    <>
      <group ref={group} position={[w.x, w.y, w.z]} rotation={[0, w.yaw - Math.PI, 0]}>
        <primitive object={gltf.scene} />
      </group>
      <WatcherFX room={room} root={gltf.scene} search eyeLight={search} />
    </>
  );
}

// ------------------------------------------------------------------------------------------ dust
const DUST_BOX = new THREE.Vector3(40, 16, 40);
const dustVertex = /* glsl */ `
uniform float uTime; uniform vec3 uCam; uniform vec3 uBox; uniform float uSize; uniform float uScale;
attribute float aSeed;
varying float vAlpha;
void main() {
  vec3 p = position + vec3(uTime * 0.15 + sin(uTime * 0.13 + aSeed * 6.283) * 0.6,
                           uTime * 0.05 * (0.4 + aSeed) + sin(uTime * 0.2 + aSeed * 9.0) * 0.3,
                           cos(uTime * 0.11 + aSeed * 3.14) * 0.6);
  p = mod(p - uCam + uBox * 0.5, uBox) + uCam - uBox * 0.5;   // wrap in a box that follows the camera
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  float d = max(-mv.z, 0.1);
  gl_PointSize = uSize * uScale / d;
  vAlpha = (1.0 - smoothstep(8.0, 19.0, d)) * smoothstep(0.8, 2.5, d);
}`;
const dustFragment = /* glsl */ `
uniform vec3 uColor;
varying float vAlpha;
void main() {
  float r = length(gl_PointCoord - 0.5);
  gl_FragColor = vec4(uColor, (1.0 - smoothstep(0.0, 0.5, r)) * vAlpha * 0.55);
}`;

/** Drifting dust motes around the camera (tier dust count; one draw call, animated on the GPU). */
function Dust({ count }: { count: number }) {
  const { camera, size, viewport } = useThree();
  const points = useMemo(() => {
    const pos = new Float32Array(count * 3);
    const seed = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = Math.random() * DUST_BOX.x; pos[i * 3 + 1] = Math.random() * DUST_BOX.y; pos[i * 3 + 2] = Math.random() * DUST_BOX.z;
      seed[i] = Math.random();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    const c = lighting.particles.dust.color as [number, number, number];
    const mat = new THREE.ShaderMaterial({
      vertexShader: dustVertex, fragmentShader: dustFragment, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uTime: { value: 0 }, uCam: { value: new THREE.Vector3() }, uBox: { value: DUST_BOX }, uSize: { value: 0.06 }, uScale: { value: 1 }, uColor: { value: new THREE.Color(...c) } },
    });
    const p = new THREE.Points(geo, mat);
    p.frustumCulled = false;
    p.name = 'VFX_Dust';
    return p;
  }, [count]);
  useEffect(() => () => { points.geometry.dispose(); (points.material as THREE.Material).dispose(); }, [points]);
  useFrame((state) => {
    const u = (points.material as THREE.ShaderMaterial).uniforms;
    u.uTime.value = state.clock.elapsedTime;
    u.uCam.value.copy(camera.position);
    // Pixels per metre at 1 m for the current resolution and field of view.
    u.uScale.value = (size.height * viewport.dpr) / (2 * Math.tan(THREE.MathUtils.degToRad((camera as THREE.PerspectiveCamera).fov / 2)));
  });
  return <primitive object={points} />;
}

export function Stage01Scene({ room }: { room: TrialRoom }) {
  const quality = useQuality();
  stage01Assets.quality = quality;
  const dust = tierOf(quality).dust ?? 0;
  stage01Assets.effects.dust = dust;
  return (
    <>
      <Lighting quality={quality} />
      <Environment room={room} quality={quality} />
      <Watcher room={room} search={quality !== 'low'} />
      <Atmosphere room={room} quality={quality} />
      <Surroundings quality={quality} />
      <Obstacles room={room} shadows={shadowLights(quality).length > 0} />
      {dust > 0 && <Dust count={dust} />}
    </>
  );
}

export function preloadStage01() {
  useGLTF.preload(ENV_URL, false, true);
  useGLTF.preload(WATCHER_URL, false, true);
}
