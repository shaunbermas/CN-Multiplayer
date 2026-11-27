// Decision 054 (owner, 27 Nov 2026): "add a ice frozen effect when the player cannot move so they can visually see
// that they are unable to move". A caught contestant is held, mid-pose, inside a faceted block of ice with a few
// shards at its feet and a frosted patch on the ground; their coat takes a cold tint. When the countdown (which
// starts at the next GO) is nearly over the ice trembles, then bursts away and the contestant walks on.
// Built in code: one shared set of geometries and two shared materials for every contestant, so freezing a crowd
// adds no shader compiles (the warm-up block below is compiled with the scene) and only a few draw calls each.
// It is world art, not HUD (the HUD stays green and red only, decision 037) and has no particles (decision 043).
import * as THREE from 'three';

let shared: { block: THREE.BufferGeometry; shard: THREE.BufferGeometry; frost: THREE.BufferGeometry; ice: THREE.MeshStandardMaterial; frostMat: THREE.MeshStandardMaterial } | null = null;

/** Seeded so every client sees the same ice (and tests get the same pictures). */
function rand(seed: number): () => number {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = Math.imul(a ^ (a >>> 15), a | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

function iceMaterial(): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({
    color: '#bfe6ff', emissive: '#2f86c8', emissiveIntensity: 0.35, roughness: 0.05, metalness: 0.15,
    transparent: true, opacity: 0.42, depthWrite: false, flatShading: true,
  });
  // A bright cold rim where the faces turn away from the camera (fresnel), so the block reads as ice in any light,
  // from the dark Stage 02 street to the floodlit Stage 01 yard.
  m.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      float iceRim = pow(1.0 - clamp(abs(dot(normalize(vViewPosition), normal)), 0.0, 1.0), 2.2);
      totalEmissiveRadiance += vec3(0.62, 0.88, 1.0) * iceRim * 1.1;
      diffuseColor.a = clamp(diffuseColor.a + iceRim * 0.45, 0.0, 0.92);`);
  };
  m.customProgramCacheKey = () => 'cn-ice-v1';
  return m;
}

function build() {
  if (shared) return shared;
  // The block: an icosphere with jittered corners (irregular facets), wide enough for the coat and arms.
  const block = new THREE.IcosahedronGeometry(1, 1).toNonIndexed();
  const pos = block.getAttribute('position') as THREE.BufferAttribute;
  const r = rand(54);
  const jitter = new Map<string, [number, number, number]>();
  for (let i = 0; i < pos.count; i++) {
    const key = `${pos.getX(i).toFixed(3)},${pos.getY(i).toFixed(3)},${pos.getZ(i).toFixed(3)}`;
    let j = jitter.get(key);
    if (!j) { j = [1 + (r() - 0.5) * 0.18, 1 + (r() - 0.5) * 0.18, 1 + (r() - 0.5) * 0.18]; jitter.set(key, j); }
    pos.setXYZ(i, pos.getX(i) * j[0], pos.getY(i) * j[1], pos.getZ(i) * j[2]);
  }
  block.scale(0.6, 1.1, 0.6);
  block.translate(0, 0.98, 0);
  block.computeVertexNormals();
  const shard = new THREE.ConeGeometry(0.075, 0.46, 4, 1);
  shard.translate(0, 0.23, 0);
  const frost = new THREE.CircleGeometry(0.8, 10);
  frost.rotateX(-Math.PI / 2);
  const frostMat = new THREE.MeshStandardMaterial({ color: '#e8f6ff', emissive: '#5aa9e6', emissiveIntensity: 0.25, roughness: 0.6, transparent: true, opacity: 0.55, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  shared = { block, shard, frost, ice: iceMaterial(), frostMat };
  return shared;
}

/** One contestant's ice. Add `root` to the contestant's group and call `update` every frame. */
export class IceShell {
  readonly root = new THREE.Group();
  private shell = new THREE.Group();
  private amount = 0;
  private wasFrozen = false;
  private burst = 0;
  private shards: THREE.Mesh[] = [];
  private base: THREE.Vector3[] = [];

  constructor(seed = 1) {
    const s = build();
    this.root.name = 'ICE_SHELL';
    const block = new THREE.Mesh(s.block, s.ice);
    block.renderOrder = 2;
    this.shell.add(block);
    const r = rand(seed * 977 + 13);
    for (let i = 0; i < 7; i++) {
      const m = new THREE.Mesh(s.shard, s.ice);
      const a = (i / 7) * Math.PI * 2 + r() * 0.6;
      const rad = 0.42 + r() * 0.16;
      m.position.set(Math.cos(a) * rad, 0, Math.sin(a) * rad);
      m.rotation.set(Math.sin(a) * (0.5 + r() * 0.4), 0, -Math.cos(a) * (0.5 + r() * 0.4));
      m.scale.setScalar(0.7 + r() * 0.7);
      m.renderOrder = 2;
      this.shards.push(m);
      this.base.push(m.position.clone());
      this.shell.add(m);
    }
    const frost = new THREE.Mesh(s.frost, s.frostMat);
    frost.position.y = 0.012;
    frost.renderOrder = 1;
    this.shell.add(frost);
    this.root.add(this.shell);
    this.root.visible = false;
  }

  /**
   * frozen: in ice now. thawLeft: seconds of countdown left once it has started (Infinity while waiting for GO).
   * Returns how frozen the contestant looks (0..1), for the coat tint.
   */
  update(dt: number, frozen: boolean, thawLeft: number): number {
    const step = Math.min(dt, 0.1);
    if (frozen && !this.wasFrozen) {
      this.amount = 0; this.burst = 0;
      this.shards.forEach((m, i) => m.position.copy(this.base[i]));
      this.shell.children[0].visible = true;
    }
    if (!frozen && this.wasFrozen) this.burst = 1; // the ice breaks
    this.wasFrozen = frozen;
    if (frozen) this.amount = Math.min(1, this.amount + step * 7); // freezes in about 0.15 s
    else if (this.burst > 0) this.burst = Math.max(0, this.burst - step * 5);
    else this.amount = 0;
    const visible = frozen || this.burst > 0;
    this.root.visible = visible;
    if (!visible) return 0;
    if (frozen) {
      // Pop in with a little overshoot (ease-out-back), then sit still; tremble over the last 0.6 s of the countdown.
      const t = this.amount, c = 1.9;
      const pop = 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
      this.shell.scale.set(pop, Math.max(0.05, pop), pop);
      const shake = thawLeft < 0.6 ? (0.6 - thawLeft) / 0.6 : 0;
      const now = performance.now() / 1000;
      this.shell.position.set(Math.sin(now * 61) * 0.025 * shake, 0, Math.cos(now * 53) * 0.025 * shake);
      this.shell.rotation.y = Math.sin(now * 47) * 0.03 * shake;
      return 1;
    }
    // Breaking: the block swells and vanishes, the shards spring outwards and sink.
    const b = 1 - this.burst;
    this.shell.scale.setScalar(1 + b * 0.25);
    this.shell.children[0].visible = b < 0.45;
    for (const m of this.shards) {
      const dir = Math.atan2(m.position.z, m.position.x);
      m.position.x += Math.cos(dir) * step * 3; m.position.z += Math.sin(dir) * step * 3;
      m.position.y = Math.sin(b * Math.PI) * 0.3;
    }
    return this.burst;
  }

  dispose(): void { this.root.removeFromParent(); }
}

/**
 * A block of ice far under the ground that is always "visible", so the shader warm-up compiles the ice materials
 * with the stage (performance pass, 26 Nov 2026) instead of the first time somebody is caught.
 */
export function iceWarmupObject(): THREE.Object3D {
  const s = build();
  const g = new THREE.Group();
  g.name = 'ICE_WARMUP';
  const a = new THREE.Mesh(s.block, s.ice);
  const b = new THREE.Mesh(s.frost, s.frostMat);
  g.add(a, b);
  g.position.set(0, -200, 0);
  g.scale.setScalar(0.001);
  return g;
}
