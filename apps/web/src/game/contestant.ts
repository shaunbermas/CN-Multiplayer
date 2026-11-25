// CN TRIAL shared contestant (owner pack, 22 Nov 2026): ONE model for all players, 30 colourways.
//
// The GLB (blender/exports/contestant) holds LOD0/1/2 skinned to one armature and 16 animation clips. It is
// loaded once; each player gets a SkeletonUtils clone (shares geometry, only bones are new), one material
// whose shader program is shared by everyone (only colour uniforms differ), its own AnimationMixer over the
// shared clips, and an LOD switch by camera distance. The vertex colour stores a region id (R) and baked
// occlusion (G); the shader maps regions to the colourway's colours. No per-player textures or geometry.
// Animation is presentation only: the server owns every position (GDD §7.3).
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { COLLISION, colorwayById, CONTESTANT_COLORWAYS, type Colorway, type Emote } from '@cn-trials/shared';
import type { GroundKind } from './groundFx.ts';
import glbUrl from '../../../../blender/exports/contestant/CNTRIAL_CONTESTANT_MASTER.meshopt.glb?url';
import detailUrl from '../../../../blender/exports/contestant/CNT_Detail.webp?url';
import normalUrl from '../../../../blender/exports/contestant/CNT_Normal.webp?url';
import manifest from '../../../../blender/exports/contestant/CNTRIAL_CONTESTANT_MANIFEST.json';

export const CONTESTANT_URLS = { glb: glbUrl, detail: detailUrl, normal: normalUrl };

// Region ids (manifest.regions): 0-4 colourway colours, 5+ fixed for everyone.
const FIXED = manifest.fixed_region_colours as Record<string, string>;
const REGIONS = manifest.regions as Record<string, number>;
const N_REGIONS = Math.max(...Object.values(REGIONS)) + 1;

/** Status for tests and the HUD (window.__cn.contestants()). */
export const contestantStatus = {
  state: 'idle' as 'idle' | 'loading' | 'ready' | 'error',
  error: '',
  loadMs: 0,
  clips: [] as string[],
  instances: 0,
};

export interface ContestantAsset {
  scene: THREE.Object3D;
  clips: Map<string, THREE.AnimationClip>;
  detail: THREE.Texture;
  normal: THREE.Texture;
}

let assetPromise: Promise<ContestantAsset> | null = null;
let assetReady: ContestantAsset | null = null;

export function loadContestant(): Promise<ContestantAsset> {
  if (assetPromise) return assetPromise;
  contestantStatus.state = 'loading';
  const t0 = performance.now();
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const tex = new THREE.TextureLoader();
  const loadTex = (url: string) => tex.loadAsync(url).then((t) => {
    t.colorSpace = THREE.NoColorSpace; // data maps
    t.flipY = false; // glTF UV convention
    t.anisotropy = 4;
    return t;
  });
  assetPromise = Promise.all([loader.loadAsync(glbUrl), loadTex(detailUrl), loadTex(normalUrl)]).then(([gltf, detail, normal]) => {
    const clips = new Map(gltf.animations.map((c) => [c.name, c]));
    shareSkeleton(gltf.scene);
    gltf.scene.traverse((o) => {
      const m = o as THREE.SkinnedMesh;
      if (m.isSkinnedMesh) {
        m.castShadow = true;
        m.receiveShadow = false;
        // generous fixed bounds (lying and diving poses leave the bind-pose sphere)
        m.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.6, 0), 1.5);
      }
    });
    assetReady = { scene: gltf.scene, clips, detail, normal };
    contestantStatus.state = 'ready';
    contestantStatus.loadMs = Math.round(performance.now() - t0);
    contestantStatus.clips = [...clips.keys()];
    return assetReady;
  }).catch((e) => {
    contestantStatus.state = 'error';
    contestantStatus.error = e instanceof Error ? e.message : String(e);
    assetPromise = null;
    throw e;
  });
  return assetPromise;
}

export function contestantAsset(): ContestantAsset | null { return assetReady; }

/**
 * The exporter may give LODs their own skin (same 29 joints, different order). Remap every LOD's joint
 * indices to LOD0's order and bind all three to one skeleton, so each player has one skeleton (one bone
 * texture, one update per frame) driving whichever LOD is drawn.
 */
function shareSkeleton(root: THREE.Object3D): void {
  const meshes: THREE.SkinnedMesh[] = [];
  root.traverse((o) => { if ((o as THREE.SkinnedMesh).isSkinnedMesh) meshes.push(o as THREE.SkinnedMesh); });
  meshes.sort((a, b) => a.name.localeCompare(b.name));
  const ref = meshes[0]?.skeleton;
  if (!ref) return;
  const index = new Map(ref.bones.map((b, i) => [b.name, i]));
  for (const m of meshes.slice(1)) {
    if (m.skeleton === ref) continue;
    const map = m.skeleton.bones.map((b) => index.get(b.name) ?? 0);
    const si = m.geometry.getAttribute('skinIndex') as THREE.BufferAttribute;
    for (let i = 0; i < si.count; i++) for (let c = 0; c < 4; c++) si.setComponent(i, c, map[si.getComponent(i, c)]);
    si.needsUpdate = true;
    m.bind(ref, m.bindMatrix);
  }
}

/** CPU time spent animating contestants (ms per frame, smoothed), for the performance report. */
export const contestantCpu = { msPerFrame: 0 };

// ------------------------------------------------------------------------------------------- material
const linear = (hex: string) => new THREE.Color(`#${hex}`); // ColorManagement converts sRGB hex to linear

/** Colourway colours lifted for Stage 01's night (the pack's coats are very dark; value is what separates them at night). */
export const NIGHT_LIFT = 1.55;

/** Render layer seen only by shadow cameras (see enableShadowLayer). */
export const SHADOW_LAYER = 5;

/** Lets every shadow-casting light see the contestants' shadow-only LOD2 meshes. */
export function enableShadowLayer(scene: THREE.Object3D): void {
  scene.traverse((o) => { const l = o as THREE.DirectionalLight; if (l.isLight && l.shadow?.camera) l.shadow.camera.layers.enable(SHADOW_LAYER); });
}

function palette(cw: Colorway): THREE.Color[] {
  const p = new Array(N_REGIONS).fill(null).map(() => new THREE.Color(0x222222));
  p[REGIONS.coatBase] = linear(cw.coatBase).multiplyScalar(NIGHT_LIFT);
  p[REGIONS.coatSecondary] = linear(cw.coatSecondary).multiplyScalar(NIGHT_LIFT);
  p[REGIONS.trim] = linear(cw.trim);
  p[REGIONS.beltAccent] = linear(cw.beltAccent);
  p[REGIONS.identifierAccent] = linear(cw.identifierAccent);
  for (const [name, hex] of Object.entries(FIXED)) p[REGIONS[name]] = linear(hex);
  return p;
}

const VERT_HEAD = /* glsl */ `
#ifndef USE_COLOR
attribute vec4 color;
#endif
varying vec2 vCntUv;
flat varying float vCntRegion;
varying float vCntAO;
`;
const FRAG_HEAD = /* glsl */ `
uniform vec3 uPalette[${N_REGIONS}];
uniform sampler2D uDetail;
uniform float uAccentGlow;
varying vec2 vCntUv;
flat varying float vCntRegion;
varying float vCntAO;
`;

/** One material per player; all players share the compiled program (same cache key, same defines). */
export function contestantMaterial(asset: ContestantAsset, colorwayId: string): THREE.MeshStandardMaterial {
  const cw = colorwayById(colorwayId) ?? CONTESTANT_COLORWAYS[0];
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0, normalMap: asset.normal });
  mat.normalScale.set(0.9, 0.9);
  const uniforms = { uPalette: { value: palette(cw) }, uDetail: { value: asset.detail }, uAccentGlow: { value: 0.45 } };
  mat.userData.uniforms = uniforms;
  mat.userData.colorway = cw.id;
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = VERT_HEAD + sh.vertexShader.replace('#include <uv_vertex>', `#include <uv_vertex>
      vCntUv = uv;
      vCntRegion = floor(color.r * 15.0 + 0.5);
      vCntAO = color.g;`);
    sh.fragmentShader = FRAG_HEAD + sh.fragmentShader
      .replace('#include <color_fragment>', `#include <color_fragment>
        int cntR = int(vCntRegion + 0.5);
        vec3 cntDet = texture2D(uDetail, vCntUv).rgb;
        vec3 cntBase = uPalette[cntR];
        // topstitching in the trim colour on garments and leather (not on the faceplate, emblem or soles)
        float cntStitch = (cntR <= 4 || cntR == 7 || cntR == 8 || cntR == 10) ? cntDet.b : 0.0;
        cntBase = mix(cntBase, uPalette[2], cntStitch);
        cntBase *= cntDet.r / 0.85;
        cntBase *= vCntAO;
        diffuseColor.rgb *= cntBase;`)
      .replace('#include <roughnessmap_fragment>', `float roughnessFactor = cntR == 5 ? 0.18 : clamp(cntDet.g, 0.25, 1.0);`)
      .replace('#include <metalnessmap_fragment>', `float metalnessFactor = cntR == 3 ? 0.65 : 0.0;`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        if (cntR == 6) totalEmissiveRadiance += vec3(0.55);
        if (cntR == 4) totalEmissiveRadiance += uPalette[4] * uAccentGlow;`);
  };
  mat.customProgramCacheKey = () => 'cnt-contestant-v1';
  return mat;
}

export function setColorway(mat: THREE.MeshStandardMaterial, colorwayId: string): void {
  const cw = colorwayById(colorwayId) ?? CONTESTANT_COLORWAYS[0];
  mat.userData.uniforms.uPalette.value = palette(cw);
  mat.userData.colorway = cw.id;
}

// ------------------------------------------------------------------------------------------- instance
const smooth = (e0: number, e1: number, x: number) => { const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };

/** Natural ground speed of the authored cycles (m/s): stride length per cycle / cycle time. */
const WALK_SPEED = 0.58;
const RUN_SPEED = 1.83;

export interface ContestantDrive {
  /** Ground speed from the smoothed position (m/s). */
  speed: number;
  status: 'active' | 'finished' | 'spotted' | 'waiting';
  /** Round phase is active and the light is green (a hard stop then means a stumble, not a stop for red). */
  greenActive: boolean;
  /** Seconds of collision knock-down left (server), 0 when standing (Stage 01 refinement). */
  down?: number;
  /** How fast the contestant is turning (rad/s, + = left), for leaning into turns. */
  turn?: number;
}

/** Second pass (decision 034 C), "Fall Guys-inspired movement" as presentation only: a bouncy, wobbly walk.
 *  Stride length for the waddle and bounce cycle (m per step). */
const FEEL_STRIDE = 0.62;
const AXIS_X = new THREE.Vector3(1, 0, 0), AXIS_Y = new THREE.Vector3(0, 1, 0), AXIS_Z = new THREE.Vector3(0, 0, 1);
const qA = new THREE.Quaternion(), qB = new THREE.Quaternion(), qC = new THREE.Quaternion();
/** Under-damped spring (overshoots a little, then settles): the wobble on starts, stops and turns. */
function spring(st: { x: number; v: number }, target: number, dt: number, k = 90, c = 7): number {
  const h = Math.min(dt, 1 / 30);
  st.v += (k * (target - st.x) - c * st.v) * h;
  st.x += st.v * h;
  return st.x;
}

interface Chain { name: string; dur?: number }
interface OneShot { name: string; action: THREE.AnimationAction; t: number; dur: number; hold: boolean; w: number; next: Chain[] }
/** Clips that loop (manifest `loop`); the rest play once and hold their last frame while fading out. */
const LOOPING = new Set((manifest.clips as { name: string; loop: boolean | null }[]).filter((c) => c.loop).map((c) => c.name));

export class ContestantInstance {
  readonly root = new THREE.Group();
  readonly lods: THREE.SkinnedMesh[] = [];
  readonly material: THREE.MeshStandardMaterial;
  readonly mixer: THREE.AnimationMixer;
  private actions = new Map<string, THREE.AnimationAction>();
  private shot: OneShot | null = null;
  private lastStatus: ContestantDrive['status'] = 'active';
  private speedHist: { t: number; v: number }[] = [];
  private clock = 0;
  private hop = { t: -1 };
  /** Procedural feel layer state (lean and roll springs, stride phase). */
  private feel = { phase: 0, lastSpeed: 0, lean: { x: 0, v: 0 }, roll: { x: 0, v: 0 }, weight: 0 };
  /** Ground contacts since the last frame (skid, land, dive, flop) for the dust / splash effects. */
  readonly events: GroundKind[] = [];
  private shotEvent = '';
  /** Collision knock-down presentation: none -> falling (Fall, held) -> recovering (Recover). */
  private downState: 'none' | 'falling' | 'recovering' = 'none';
  lod = 1;

  constructor(asset: ContestantAsset, colorwayId: string) {
    const model = cloneSkinned(asset.scene);
    model.rotation.y = Math.PI; // the glTF model faces +Z; contestants face -Z at yaw 0
    this.root.add(model);
    this.material = contestantMaterial(asset, colorwayId);
    model.traverse((o) => {
      const m = o as THREE.SkinnedMesh;
      if (m.isSkinnedMesh) {
        m.material = this.material;
        m.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.6, 0), 1.5);
        m.castShadow = true;
        const k = Number(/LOD(\d)/.exec(m.name)?.[1] ?? 0);
        this.lods[k] = m;
      }
    });
    // one skeleton per player for all three LODs (the clone gave each mesh its own copy)
    const skel = this.lods[0].skeleton;
    for (const m of this.lods.slice(1)) if (m && m.skeleton !== skel) m.bind(skel, m.bindMatrix);
    this.mixer = new THREE.AnimationMixer(model);
    for (const [name, clip] of asset.clips) {
      const a = this.mixer.clipAction(clip);
      a.enabled = true;
      a.setEffectiveWeight(0);
      a.play();
      this.actions.set(name, a);
    }
    for (const [name, a] of this.actions) {
      if (!LOOPING.has(name)) { a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; }
      if (!['Idle', 'Walk', 'Run'].includes(name)) a.stop();
    }
    this.setLod(1);
    contestantStatus.instances++;
  }

  setLod(k: number): void {
    this.lod = k;
    // Shadows always come from LOD2 (a shadow-only layer the shadow cameras see): the visible LOD0/1 mesh
    // does not cast, so a crowd costs one cheap mesh each in the shadow pass.
    this.lods.forEach((m, i) => {
      if (!m) return;
      if (i === 2) {
        m.visible = true;
        m.castShadow = true;
        m.layers.set(SHADOW_LAYER);
        if (k === 2) m.layers.enable(0);
      } else {
        m.visible = i === k;
        m.castShadow = false;
      }
    });
  }

  /** Plays a one-shot clip over the locomotion layer (fades in and out); `hold` keeps its last pose. */
  play(name: string, opts: { hold?: boolean; next?: Chain[]; dur?: number } = {}): void {
    const a = this.actions.get(name);
    if (!a) return;
    if (this.shot && this.shot.action !== a) { this.shot.action.stop(); this.shot.action.setEffectiveWeight(0); }
    a.reset();
    a.play();
    this.shot = { name, action: a, t: 0, dur: opts.dur ?? a.getClip().duration, hold: !!opts.hold, w: this.shot?.w ?? 0, next: opts.next ?? [] };
    this.shotEvent = '';
    if (name === 'JumpLand') this.events.push('land');
    if (name === 'Stop' || name === 'Stumble') this.events.push('skid');
  }

  /** True while the jump hop lifts the model off the ground (no footsteps then). */
  get airborne(): boolean { return this.hop.t >= 0 || this.shot?.name === 'JumpAir' || this.shot?.name === 'JumpStart'; }

  emote(e: Emote): void {
    if (e === 'jump') { this.play('JumpStart', { next: [{ name: 'JumpAir', dur: 0.36 }, { name: 'JumpLand' }] }); this.hop.t = 0; }
    else if (e === 'dive') this.play('Dive', { next: [{ name: 'Recover' }] });
  }

  get currentShot(): string | null { return this.shot?.name ?? null; }

  update(dt: number, d: ContestantDrive): void {
    this.clock += dt;
    // status-driven one-shots
    if (d.status !== this.lastStatus) {
      if (d.status === 'spotted') this.play('Eliminated', { hold: true });
      else if (this.lastStatus === 'spotted') this.play('Recover');
      if (d.status === 'finished') this.play('Victory', { hold: true });
      else if (this.lastStatus === 'finished' && this.shot?.name === 'Victory') this.shot.hold = false;
      this.lastStatus = d.status;
    }
    // Collision knock-down (server timer): fall and hold on the ground, then get up for the last recoverS.
    const down = d.down ?? 0;
    if (down > 0 && this.downState === 'none') { this.downState = 'falling'; this.play('Fall', { hold: true }); this.speedHist.length = 0; }
    else if (down > 0 && down <= COLLISION.recoverS && this.downState === 'falling') { this.downState = 'recovering'; this.play('Recover', { dur: COLLISION.recoverS }); }
    else if (down <= 0 && this.downState !== 'none') {
      if (this.downState === 'falling') this.play('Recover'); // a late snapshot skipped the recover window
      this.downState = 'none';
    }
    // start / stop / stumble from the speed history
    this.speedHist.push({ t: this.clock, v: d.speed });
    while (this.speedHist.length && this.clock - this.speedHist[0].t > 0.35) this.speedHist.shift();
    const peak = Math.max(...this.speedHist.map((h) => h.v));
    const free = !this.shot || (!this.shot.hold && this.shot.t > this.shot.dur * 0.6);
    if (d.status === 'active' && free && this.downState === 'none') {
      if (peak > 2.6 && d.speed < 0.5) {
        this.play(d.greenActive ? 'Stumble' : 'Stop');
        this.speedHist.length = 0;
      } else if (d.speed > 0.6 && this.speedHist.length > 3 && this.speedHist[0].v < 0.15) {
        this.play('Start');
        this.speedHist.length = 0;
      }
    }
    // locomotion layer: idle / walk / run weighted by ground speed, playback matched to it (no foot sliding)
    const run = smooth(1.5, 3.0, d.speed);
    const walk = smooth(0.12, 0.55, d.speed) * (1 - run);
    const idle = 1 - run - walk;
    const walkA = this.actions.get('Walk'), runA = this.actions.get('Run'), idleA = this.actions.get('Idle');
    if (walkA) walkA.timeScale = Math.min(2.6, Math.max(0.6, d.speed / WALK_SPEED));
    if (runA) runA.timeScale = Math.min(2.4, Math.max(0.8, d.speed / RUN_SPEED));
    // one-shot layer
    let sw = 0;
    const s = this.shot;
    if (s) {
      s.t += dt * s.action.timeScale;
      // body hits the ground part-way through these clips
      const hit = s.name === 'Dive' ? 0.42 : s.name === 'Eliminated' ? 0.55 : s.name === 'Fall' ? 0.5 : -1;
      if (hit > 0 && !this.shotEvent && s.t >= s.dur * hit) { this.shotEvent = 'hit'; this.events.push(s.name === 'Dive' ? 'dive' : 'flop'); }
      const fadeIn = 0.08, fadeOut = 0.16;
      const target = s.hold || s.t < s.dur ? 1 : 0;
      s.w += (target - s.w) * (1 - Math.exp(-dt / (target ? fadeIn : fadeOut) * 3));
      sw = s.w;
      s.action.setEffectiveWeight(sw);
      if (!s.hold && s.t >= s.dur) {
        if (s.next.length) { const [n, ...rest] = s.next; this.play(n.name, { dur: n.dur, next: rest }); }
        else if (s.w < 0.02) { s.action.stop(); s.action.setEffectiveWeight(0); this.shot = null; }
      }
    }
    const lw = 1 - sw;
    idleA?.setEffectiveWeight(idle * lw);
    walkA?.setEffectiveWeight(walk * lw);
    runA?.setEffectiveWeight(run * lw);
    this.mixer.update(dt);
    const model = this.root.children[0];
    // Feel layer (decision 034 C): a springy waddle on top of the clips. It sways side to side with each
    // step, bounces a little with squash and stretch, leans into speeding up, rocks back and wobbles when
    // stopping, and leans into turns. Presentation only: the server position and the rules are unchanged.
    const f = this.feel;
    const standing = (d.status === 'active' || d.status === 'finished') && this.downState === 'none';
    const loco = (walk + run) * lw * (standing ? 1 : 0);
    f.weight += ((standing ? lw : 0) - f.weight) * (1 - Math.exp(-dt * 8));
    f.phase += (d.speed * dt) / FEEL_STRIDE * Math.PI;
    const accel = dt > 0 ? (d.speed - f.lastSpeed) / dt : 0;
    f.lastSpeed = d.speed;
    const lean = spring(f.lean, (Math.max(-0.2, Math.min(0.2, accel * 0.03)) + 0.05 * run) * f.weight, dt);
    const roll = spring(f.roll, Math.max(-0.22, Math.min(0.22, (d.turn ?? 0) * 0.045)) * loco, dt, 70, 8)
      + Math.sin(f.phase) * 0.075 * loco;
    // lean forward = top toward -Z (the facing direction); roll about the facing axis; then the model's base turn
    qA.setFromAxisAngle(AXIS_X, -lean);
    qB.setFromAxisAngle(AXIS_Z, roll);
    qC.setFromAxisAngle(AXIS_Y, Math.PI);
    model.quaternion.copy(qA).multiply(qB).multiply(qC);
    const bounce = Math.abs(Math.sin(f.phase));
    const sy = 1 + (0.05 * Math.cos(2 * f.phase)) * loco; // stretch mid-step, squash on each footfall
    const sxz = 1 / Math.sqrt(sy);
    model.scale.set(sxz, sy, sxz);
    // lobby jump emote: a visual hop of the model only (the server position is untouched)
    if (this.hop.t >= 0) {
      this.hop.t += dt;
      const T = 0.62, t = this.hop.t - 0.12;
      model.position.y = t > 0 && t < T ? 4 * 0.42 * (t / T) * (1 - t / T) : 0;
      if (this.hop.t > T + 0.3) { this.hop.t = -1; model.position.y = 0; }
    } else model.position.y = 0.035 * bounce * loco;
  }

  dispose(): void {
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.root.children[0]);
    this.material.dispose(); // geometry and textures are shared and stay cached
    contestantStatus.instances--;
  }
}

/**
 * LOD with a budget, decided once per frame for everyone: the nearest few may use LOD0 (close / hero), the
 * next ones LOD1, all others LOD2, and distance limits still apply. 30 contestants bunched at the start line
 * would otherwise all be "close". Hysteresis (current LOD keeps a 1 m margin) avoids flicker.
 */
export const LOD_BUDGET = {
  high: { lod0: 2, lod1: 8, near: 6, far: 16 },
  medium: { lod0: 2, lod1: 8, near: 5, far: 14 },
  low: { lod0: 0, lod1: 5, near: 0, far: 10 },
};

export function assignLods(items: { inst: ContestantInstance; dist: number }[], tier: 'high' | 'medium' | 'low'): void {
  const b = LOD_BUDGET[tier];
  items.sort((x, y) => x.dist - y.dist);
  let n0 = 0, n1 = 0;
  for (const { inst, dist } of items) {
    const m = (k: number) => (inst.lod === k ? 1 : 0);
    let lod = 2;
    if (n0 < b.lod0 && dist < b.near + m(0)) { lod = 0; n0++; }
    else if (n1 < b.lod1 && dist < b.far + m(1)) { lod = 1; n1++; }
    if (lod !== inst.lod) inst.setLod(lod);
  }
}
