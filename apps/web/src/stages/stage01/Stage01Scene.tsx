// Stage 01 scene module (Prompt 07): the approved environment GLB (Prompt 05), The Watcher GLB (Prompt 06)
// and the runtime lighting description, all placed from the shared stage geometry (approved metadata).
// Everything here is presentation: signal colours, lamps and The Watcher's clips follow the server's
// public round state; no gameplay decision is made in the browser.
import { useAnimations, useGLTF } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import envUrl from '../../../../../blender/exports/STAGE_01_ENVIRONMENT.glb?url';
import watcherUrl from '../../../../../blender/exports/THE_WATCHER.glb?url';
import lighting from '../../../../../blender/exports/STAGE_01_LIGHTING.json';
import type { TrialRoom } from '../../net.ts';
import { signalView } from '../../game/roundClock.ts';
import { stageGeo } from '../../game/stage.ts';
import { CLIP_SECONDS, MISSING_FROM_MANIFEST, WATCHER_CLIPS, chooseWatcherClip, type WatcherChoice } from './watcherAnimation.ts';

export const ENV_URL = envUrl;
export const WATCHER_URL = watcherUrl;

export type Quality = 'low' | 'medium' | 'high';
export function qualityFromUrl(): Quality {
  const q = new URLSearchParams(location.search).get('quality');
  return q === 'low' || q === 'high' ? q : 'medium';
}

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
  quality: 'medium' as Quality,
};

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
    out.push(hemi);
    const tier = L.qualityTiers[quality] as { dynamicLights: string[] | string };
    const wanted = (id: string) => tier.dynamicLights === 'all' || (tier.dynamicLights as string[]).some((p) => (p.endsWith('*') ? id.startsWith(p.slice(0, -1)) : id === p));
    for (const l of L.lights) {
      if (!wanted(l.id)) continue;
      const col = new THREE.Color(...(l.color as [number, number, number]));
      let o: THREE.Light | null = null;
      if (l.type === 'directional') o = new THREE.DirectionalLight(col, 0.6);
      else if (l.type === 'spot') o = new THREE.SpotLight(col, l.id.includes('Rim') ? 2600 : 1700, 110, THREE.MathUtils.degToRad(l.angleDeg ?? 40), l.penumbra ?? 0.5, 1.5);
      else if (l.type === 'point') o = new THREE.PointLight(col, 260, (l.range ?? 25) * 1.4, 1.5);
      if (!o) continue;
      o.name = l.id;
      o.position.set(...(l.position as [number, number, number]));
      const t = (o as THREE.SpotLight | THREE.DirectionalLight).target;
      if (t) {
        const [dx, dy, dz] = l.direction as [number, number, number];
        t.position.set(l.position[0] + dx * 10, l.position[1] + dy * 10, l.position[2] + dz * 10);
        out.push(t);
      }
      out.push(o);
    }
    return out;
  }, [quality, L]);
  useEffect(() => {
    scene.background = new THREE.Color(...(L.background.horizon as [number, number, number])).multiplyScalar(1.4);
    scene.fog = quality === 'low'
      ? new THREE.Fog(new THREE.Color(...(L.fog.color as [number, number, number])), 60, 260)
      : new THREE.FogExp2(new THREE.Color(...(L.fog.color as [number, number, number])), L.fog.density);
    return () => { scene.fog = null; scene.background = null; };
  }, [scene, quality, L]);
  return <>{lights.map((o) => <primitive key={o.uuid} object={o} />)}</>;
}

// ------------------------------------------------------------------------------------------ environment
const LAMP: Record<string, string> = { green: 'MAT_Signal_Green', warning: 'MAT_Signal_Amber', red: 'MAT_Signal_Red' };

function Environment({ room, quality }: { room: TrialRoom; quality: Quality }) {
  const gltf = useGLTF(ENV_URL);
  const lamps = useMemo(() => {
    const mats = new Map<string, THREE.MeshStandardMaterial>();
    gltf.scene.traverse((o) => {
      // The Prompt 05 environment still carries the retired Shepherd placeholder; The Watcher replaces it (decision 023).
      if (o.name.startsWith('ENM_Shepherd_Placeholder')) o.visible = false;
      if (o.name === 'VFX_GroundHaze') o.visible = quality === 'high';
      const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
      if (m && m.name?.startsWith('MAT_Signal_')) mats.set(m.name, m);
    });
    for (const n of Object.values(LAMP)) if (!mats.has(n)) stage01Assets.problems.push(`environment: material ${n} missing`);
    stage01Assets.environment = 'ready';
    return mats;
  }, [gltf, quality]);
  useEffect(() => () => { dispose(gltf.scene); useGLTF.clear(ENV_URL); stage01Assets.environment = 'loading'; }, [gltf]);
  useFrame(() => {
    const sig = signalView(room).signal;
    for (const [name, mat] of lamps) mat.emissiveIntensity = LAMP[sig] === name ? 6 : sig === 'none' ? 0.35 : 0.08;
  });
  return <primitive object={gltf.scene} />;
}

// ------------------------------------------------------------------------------------------ The Watcher
function Watcher({ room }: { room: TrialRoom }) {
  const gltf = useGLTF(WATCHER_URL);
  const group = useRef<THREE.Group>(null);
  const { actions } = useAnimations(gltf.animations, group);
  const current = useRef<WatcherChoice | null>(null);
  const resultsAt = useRef<number | null>(null);
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
    gltf.scene.traverse((o) => { if ((o as THREE.Mesh).isMesh) o.frustumCulled = false; }); // skinned bounds move with the clips
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
    stage01Assets.watcher = 'ready';
    return () => { dispose(gltf.scene); useGLTF.clear(WATCHER_URL); stage01Assets.watcher = 'loading'; };
  }, [gltf, w.height]);

  useFrame(() => {
    const v = signalView(room);
    const phase = room.round.phase;
    if (phase === 'results' && resultsAt.current === null) resultsAt.current = Date.now();
    if (phase !== 'results') resultsAt.current = null;
    const spotted = [...room.events].reverse().find((e) => e.kind === 'spotted');
    const choice = chooseWatcherClip({
      phase, signal: v.signal, into: v.into, segmentLength: v.segLength, segmentStart: v.segStart, redIndex: v.redIndex,
      sinceSpotted: spotted && phase === 'active' ? (Date.now() - spotted.at) / 1000 : Infinity,
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
    <group ref={group} position={[w.x, w.y, w.z]} rotation={[0, w.yaw - Math.PI, 0]}>
      <primitive object={gltf.scene} />
    </group>
  );
}

export function Stage01Scene({ room }: { room: TrialRoom }) {
  const quality = useMemo(qualityFromUrl, []);
  stage01Assets.quality = quality;
  return (
    <>
      <Lighting quality={quality} />
      <Environment room={room} quality={quality} />
      <Watcher room={room} />
    </>
  );
}

export function preloadStage01() {
  useGLTF.preload(ENV_URL);
  useGLTF.preload(WATCHER_URL);
}
