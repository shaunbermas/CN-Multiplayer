// Ground effects (owner feedback, 22 Nov 2026; decision 031): dust kicked up from the dirty concrete and
// water splashes with ripples in the puddles, depending on where a contestant's feet land. Footsteps,
// skids, jump landings, dives and flops all emit. Presentation only.
//
// One pooled particle system (a single THREE.Points draw call) plus a small pool of ripple rings (one
// instanced draw call). The puddle footprint comes from the environment's MAT_Puddle triangles, rasterised
// once into a 0.5 m grid (setPuddles), so a ground lookup is one array read.
import * as THREE from 'three';

export type GroundKind = 'step' | 'skid' | 'land' | 'dive' | 'flop';

const CELL = 0.5;
let grid: { minX: number; minZ: number; w: number; h: number; data: Uint8Array } | null = null;

/** Rasterises puddle triangles (world XZ) into the wet-ground grid. */
export function setPuddles(meshes: THREE.Mesh[]): number {
  const tris: number[][] = [];
  let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
  const v = new THREE.Vector3();
  for (const m of meshes) {
    m.updateWorldMatrix(true, false);
    const pos = m.geometry.getAttribute('position');
    const idx = m.geometry.index;
    const n = idx ? idx.count : pos.count;
    const at = (i: number) => { v.fromBufferAttribute(pos, idx ? idx.getX(i) : i).applyMatrix4(m.matrixWorld); return [v.x, v.z]; };
    for (let i = 0; i + 2 < n; i += 3) {
      const t = [...at(i), ...at(i + 1), ...at(i + 2)];
      tris.push(t);
      minX = Math.min(minX, t[0], t[2], t[4]); maxX = Math.max(maxX, t[0], t[2], t[4]);
      minZ = Math.min(minZ, t[1], t[3], t[5]); maxZ = Math.max(maxZ, t[1], t[3], t[5]);
    }
  }
  if (!tris.length) { grid = null; return 0; }
  const w = Math.ceil((maxX - minX) / CELL) + 1, h = Math.ceil((maxZ - minZ) / CELL) + 1;
  const data = new Uint8Array(w * h);
  // point-in-triangle by the signs of the three edge functions
  const inside = (px: number, pz: number, t: number[]) => {
    const e = (ax: number, az: number, bx: number, bz: number) => (bx - ax) * (pz - az) - (bz - az) * (px - ax);
    const a = e(t[0], t[1], t[2], t[3]), b = e(t[2], t[3], t[4], t[5]), c = e(t[4], t[5], t[0], t[1]);
    return (a >= 0 && b >= 0 && c >= 0) || (a <= 0 && b <= 0 && c <= 0);
  };
  for (const t of tris) {
    const x0 = Math.floor((Math.min(t[0], t[2], t[4]) - minX) / CELL), x1 = Math.ceil((Math.max(t[0], t[2], t[4]) - minX) / CELL);
    const z0 = Math.floor((Math.min(t[1], t[3], t[5]) - minZ) / CELL), z1 = Math.ceil((Math.max(t[1], t[3], t[5]) - minZ) / CELL);
    for (let gz = z0; gz <= z1; gz++) for (let gx = x0; gx <= x1; gx++) {
      if (gx < 0 || gz < 0 || gx >= w || gz >= h) continue;
      if (inside(minX + (gx + 0.5) * CELL, minZ + (gz + 0.5) * CELL, t)) data[gz * w + gx] = 1;
    }
  }
  grid = { minX, minZ, w, h, data };
  let wet = 0;
  for (const c of data) wet += c;
  groundFxStatus.wetCells = wet;
  return wet;
}

/** Nearest wet cell centre to (x, z), for tests and previews. */
export function nearestWet(x: number, z: number): [number, number] | null {
  if (!grid) return null;
  let best: [number, number] | null = null, bd = Infinity;
  for (let gz = 0; gz < grid.h; gz++) for (let gx = 0; gx < grid.w; gx++) {
    if (!grid.data[gz * grid.w + gx]) continue;
    const cx = grid.minX + (gx + 0.5) * CELL, cz = grid.minZ + (gz + 0.5) * CELL, d = (cx - x) ** 2 + (cz - z) ** 2;
    if (d < bd) { bd = d; best = [cx, cz]; }
  }
  return best;
}

export function isWet(x: number, z: number): boolean {
  if (!grid) return false;
  const gx = Math.floor((x - grid.minX) / CELL), gz = Math.floor((z - grid.minZ) / CELL);
  return gx >= 0 && gz >= 0 && gx < grid.w && gz < grid.h && grid.data[gz * grid.w + gx] === 1;
}

/** Counters for tests (window.__cn.groundFx()). */
export const groundFxStatus = { wetCells: 0, dust: 0, splash: 0, ripples: 0, live: 0 };

// ------------------------------------------------------------------------------------------- particles
const MAX = 1400;
const MAX_RIPPLES = 40;
// lit by the floodlights: lighter than the ground they come from, so they read at night
const DUST = new THREE.Color(0.58, 0.5, 0.41);
const WATER = new THREE.Color(0.78, 0.86, 0.95);

const vert = /* glsl */ `
attribute float aSize; attribute float aAlpha; attribute vec3 aColor;
varying float vAlpha; varying vec3 vColor;
uniform float uScale;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = aSize * uScale / max(-mv.z, 0.1);
  vAlpha = aAlpha; vColor = aColor;
}`;
const frag = /* glsl */ `
varying float vAlpha; varying vec3 vColor;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float r = length(c);
  if (r > 0.5) discard;
  float a = vAlpha * smoothstep(0.5, 0.15, r);
  gl_FragColor = vec4(vColor, a);
  #include <colorspace_fragment>
}`;
const ringFrag = /* glsl */ `
varying vec2 vUv; varying float vA;
void main() {
  float r = length(vUv - 0.5) * 2.0;
  float a = smoothstep(0.62, 0.86, r) * (1.0 - smoothstep(0.86, 1.0, r)) * vA;
  gl_FragColor = vec4(0.7, 0.8, 0.9, a);
  #include <colorspace_fragment>
}`;
const ringVert = /* glsl */ `
attribute float aA; varying vec2 vUv; varying float vA;
void main() { vUv = uv; vA = aA; gl_Position = projectionMatrix * viewMatrix * modelMatrix * instanceMatrix * vec4(position, 1.0); }`;

export class GroundFx {
  readonly points: THREE.Points;
  readonly rings: THREE.InstancedMesh;
  private pos = new Float32Array(MAX * 3);
  private vel = new Float32Array(MAX * 3);
  private life = new Float32Array(MAX);
  private maxLife = new Float32Array(MAX);
  private size0 = new Float32Array(MAX);
  private size1 = new Float32Array(MAX);
  private alpha0 = new Float32Array(MAX);
  private kind = new Uint8Array(MAX); // 0 dust, 1 droplet
  private size = new Float32Array(MAX);
  private alpha = new Float32Array(MAX);
  private color = new Float32Array(MAX * 3);
  private next = 0;
  private ringLife = new Float32Array(MAX_RIPPLES);
  private ringPos = new Float32Array(MAX_RIPPLES * 3);
  private ringMax = new Float32Array(MAX_RIPPLES);
  private ringA = new Float32Array(MAX_RIPPLES);
  private ringNext = 0;
  private m = new THREE.Matrix4();
  /**
   * 0..1 particles per ground contact. Owner (25 Nov 2026): no particles, the fog is enough, so puffs and splash
   * droplets are off (0); the ripples in the puddles stay.
   */
  density = 0;

  constructor() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aColor', new THREE.BufferAttribute(this.color, 3).setUsage(THREE.DynamicDrawUsage));
    const mat = new THREE.ShaderMaterial({ vertexShader: vert, fragmentShader: frag, transparent: true, depthWrite: false, uniforms: { uScale: { value: 600 } } });
    this.points = new THREE.Points(g, mat);
    this.points.frustumCulled = false;
    this.points.name = 'FX_GroundParticles';
    this.points.renderOrder = 6;
    const rg = new THREE.PlaneGeometry(1, 1);
    rg.rotateX(-Math.PI / 2);
    rg.setAttribute('aA', new THREE.InstancedBufferAttribute(this.ringA, 1).setUsage(THREE.DynamicDrawUsage));
    const rm = new THREE.ShaderMaterial({ vertexShader: ringVert, fragmentShader: ringFrag, transparent: true, depthWrite: false });
    this.rings = new THREE.InstancedMesh(rg, rm, MAX_RIPPLES);
    this.rings.frustumCulled = false;
    this.rings.name = 'FX_GroundRipples';
    this.rings.renderOrder = 5;
    for (let i = 0; i < MAX_RIPPLES; i++) this.rings.setMatrixAt(i, this.m.makeScale(0, 0, 0));
  }

  setViewport(heightPx: number, fovDeg: number): void {
    (this.points.material as THREE.ShaderMaterial).uniforms.uScale.value = heightPx / (2 * Math.tan((fovDeg * Math.PI) / 360));
  }

  private spawn(kind: 0 | 1, x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, s0: number, s1: number, a0: number) {
    const i = this.next;
    this.next = (this.next + 1) % MAX;
    this.pos.set([x, y, z], i * 3);
    this.vel.set([vx, vy, vz], i * 3);
    this.life[i] = life; this.maxLife[i] = life;
    this.size0[i] = s0; this.size1[i] = s1; this.alpha0[i] = a0;
    this.kind[i] = kind;
    const c = kind === 0 ? DUST : WATER;
    const tint = 0.85 + Math.random() * 0.3;
    this.color.set([c.r * tint, c.g * tint, c.b * tint], i * 3);
  }

  private ripple(x: number, z: number, max: number) {
    const i = this.ringNext;
    this.ringNext = (this.ringNext + 1) % MAX_RIPPLES;
    this.ringPos.set([x, 0.03, z], i * 3);
    this.ringLife[i] = 0.9; this.ringMax[i] = max;
    groundFxStatus.ripples++;
  }

  /** Emit for a ground event at (x, z). dir: the contestant's movement direction (unit) or 0. */
  emit(kind: GroundKind, x: number, z: number, dirX = 0, dirZ = 0): void {
    const wet = isWet(x, z);
    const big = kind === 'land' || kind === 'dive' || kind === 'flop';
    const R = Math.random;
    if (wet) {
      groundFxStatus.splash++;
      const n = Math.round((big ? 26 : kind === 'skid' ? 14 : 5) * this.density);
      for (let k = 0; k < n; k++) {
        const a = R() * Math.PI * 2, sp = (big ? 1.6 : 0.9) + R() * (big ? 1.8 : 0.9);
        this.spawn(1, x + Math.cos(a) * 0.12, 0.05, z + Math.sin(a) * 0.12,
          Math.cos(a) * sp * 0.6 - dirX * 0.6, (big ? 2.6 : 1.6) + R() * 1.4, Math.sin(a) * sp * 0.6 - dirZ * 0.6, 0.45 + R() * 0.3, 0.05, 0.035, 0.85);
      }
      this.ripple(x, z, big ? 2.4 : kind === 'skid' ? 1.4 : 0.8);
      if (big) this.ripple(x + 0.2, z - 0.1, 1.5);
    } else {
      groundFxStatus.dust++;
      const n = Math.round((big ? 34 : kind === 'skid' ? 20 : 5) * this.density);
      for (let k = 0; k < n; k++) {
        const a = R() * Math.PI * 2, sp = (big ? 0.9 : 0.35) + R() * (big ? 0.9 : 0.4);
        const r0 = 0.1 + R() * (big ? 0.35 : 0.15);
        this.spawn(0, x + Math.cos(a) * r0, 0.05 + R() * 0.12, z + Math.sin(a) * r0,
          Math.cos(a) * sp - dirX * (kind === 'skid' ? -0.8 : 0.4), 0.25 + R() * (big ? 0.7 : 0.35), Math.sin(a) * sp - dirZ * (kind === 'skid' ? -0.8 : 0.4),
          (big ? 1.3 : 0.8) + R() * 0.6, (big ? 0.22 : 0.16) + R() * 0.12, (big ? 0.8 : 0.5) + R() * 0.5, (big ? 0.3 : 0.26) + R() * 0.12);
      }
    }
  }

  update(dt: number): void {
    let live = 0;
    for (let i = 0; i < MAX; i++) {
      if (this.life[i] <= 0) { this.alpha[i] = 0; this.size[i] = 0; continue; }
      this.life[i] -= dt;
      const t = 1 - Math.max(0, this.life[i]) / this.maxLife[i];
      const j = i * 3;
      if (this.kind[i] === 1) {
        this.vel[j + 1] -= 9.8 * dt; // droplets fall
        if (this.pos[j + 1] < 0.02 && this.vel[j + 1] < 0) { this.life[i] = 0; this.alpha[i] = 0; continue; }
      } else {
        const drag = Math.exp(-dt * 2.2); // dust slows and drifts up
        this.vel[j] *= drag; this.vel[j + 2] *= drag; this.vel[j + 1] = this.vel[j + 1] * drag + 0.05 * dt;
      }
      this.pos[j] += this.vel[j] * dt; this.pos[j + 1] += this.vel[j + 1] * dt; this.pos[j + 2] += this.vel[j + 2] * dt;
      this.size[i] = this.size0[i] + (this.size1[i] - this.size0[i]) * Math.sqrt(t);
      this.alpha[i] = this.alpha0[i] * (this.kind[i] === 0 ? Math.sin(Math.PI * Math.min(1, t * 1.15)) : 1 - t * t);
      live++;
    }
    groundFxStatus.live = live;
    const g = this.points.geometry;
    for (const n of ['position', 'aSize', 'aAlpha', 'aColor']) (g.getAttribute(n) as THREE.BufferAttribute).needsUpdate = true;
    for (let i = 0; i < MAX_RIPPLES; i++) {
      if (this.ringLife[i] <= 0) { this.ringA[i] = 0; continue; }
      this.ringLife[i] -= dt;
      const t = 1 - Math.max(0, this.ringLife[i]) / 0.9;
      const s = 0.2 + this.ringMax[i] * Math.sqrt(t);
      this.m.makeScale(s, 1, s).setPosition(this.ringPos[i * 3], this.ringPos[i * 3 + 1], this.ringPos[i * 3 + 2]);
      this.rings.setMatrixAt(i, this.m);
      this.ringA[i] = 0.55 * (1 - t);
    }
    this.rings.instanceMatrix.needsUpdate = true;
    (this.rings.geometry.getAttribute('aA') as THREE.BufferAttribute).needsUpdate = true;
  }

  dispose(): void {
    this.points.geometry.dispose(); (this.points.material as THREE.Material).dispose();
    this.rings.geometry.dispose(); (this.rings.material as THREE.Material).dispose();
  }
}

/** The scene's ground effects (one per Canvas), set by GroundFxLayer. */
export const groundFx: { current: GroundFx | null } = { current: null };
