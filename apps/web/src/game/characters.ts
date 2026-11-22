// CN TRIAL contestants: one shared low-poly body (1.2 m, the gameplay capsule height) with per-character costume
// parts, merged into ONE mesh per character with per-vertex colours. Walking is animated on the GPU: legs and arms
// carry a swing tag and a pivot (hip / shoulder), and the vertex shader rotates them, so each contestant is a
// single draw call (30 players = 30 calls). Presets: packages/shared/src/roster.ts (dealt by the server).
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { MOVEMENT, type ContestantEntry } from '@cn-trials/shared';

type Part = { geo: THREE.BufferGeometry; color: string; swing?: number; pivot?: [number, number, number] };

const H = MOVEMENT.capsuleHeight; // 1.2 m
const col = new THREE.Color();

function prep(p: Part): THREE.BufferGeometry {
  const g = (p.geo.index ? p.geo.toNonIndexed() : p.geo).clone();
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal'].includes(k)) g.deleteAttribute(k);
  const n = g.attributes.position.count;
  col.set(p.color).convertSRGBToLinear();
  const c = new Float32Array(n * 3), sw = new Float32Array(n), pv = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    c.set([col.r, col.g, col.b], i * 3);
    sw[i] = p.swing ?? 0;
    pv.set(p.pivot ?? [0, 0, 0], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  g.setAttribute('aSwing', new THREE.BufferAttribute(sw, 1));
  g.setAttribute('aPivot', new THREE.BufferAttribute(pv, 3));
  return g;
}

const at = (g: THREE.BufferGeometry, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) => {
  const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));
  return g.applyMatrix4(m);
};
const cyl = (rt: number, rb: number, h: number, seg = 10) => new THREE.CylinderGeometry(rt, rb, h, seg, 1);
const sph = (r: number, ws = 12, hs = 9, tStart = 0, tLen = Math.PI) => new THREE.SphereGeometry(r, ws, hs, 0, Math.PI * 2, tStart, tLen);
const box = (x: number, y: number, z: number) => new THREE.BoxGeometry(x, y, z);

/** Builds one contestant's merged geometry, scaled so the figure stands on y = 0 and faces -Z. */
export function buildContestantGeometry(c: ContestantEntry): THREE.BufferGeometry {
  const parts: Part[] = [];
  const w = c.width;
  const headY = 0.93, headR = 0.21;
  // legs + boots (swing around the hips)
  for (const s of [-1, 1]) {
    parts.push({ geo: at(cyl(0.05, 0.045, 0.31), s * 0.08 * w, 0.225, 0), color: c.pants, swing: s, pivot: [s * 0.08 * w, 0.38, 0] });
    parts.push({ geo: at(box(0.11, 0.08, 0.17), s * 0.08 * w, 0.045, -0.02), color: c.boots, swing: s, pivot: [s * 0.08 * w, 0.38, 0] });
  }
  // coat body, trim band and buttons
  parts.push({ geo: at(cyl(0.15 * w, 0.21 * w, 0.42, 12), 0, 0.51, 0), color: c.coat });
  parts.push({ geo: at(cyl(0.212 * w, 0.215 * w, 0.04, 12), 0, 0.31, 0), color: c.trim });
  for (const y of [0.62, 0.53, 0.44]) parts.push({ geo: at(sph(0.014, 6, 4), 0, y, -(0.16 + (0.62 - y) * 0.12) * w), color: c.trim });
  // arms + hands (swing around the shoulders, opposite to the legs)
  for (const s of [-1, 1]) {
    const x = s * 0.19 * w;
    parts.push({ geo: at(cyl(0.05, 0.042, 0.32), x, 0.52, 0, 0, 0, s * 0.12), color: c.coat, swing: -s, pivot: [x, 0.68, 0] });
    parts.push({ geo: at(sph(0.045, 8, 6), x + s * 0.02, 0.35, 0), color: c.skin, swing: -s, pivot: [x, 0.68, 0] });
  }
  // head
  parts.push({ geo: at(sph(headR, 14, 10), 0, headY, 0), color: c.skin });
  // face
  const fz = -headR * 0.92;
  switch (c.face) {
    case 'eyes':
      for (const s of [-1, 1]) parts.push({ geo: at(sph(0.028, 8, 6), s * 0.075, headY + 0.01, fz), color: '#111014' });
      break;
    case 'goggles':
      for (const s of [-1, 1]) {
        parts.push({ geo: at(new THREE.TorusGeometry(0.045, 0.014, 6, 12), s * 0.075, headY + 0.02, fz - 0.01), color: '#7a6a4a' });
        parts.push({ geo: at(new THREE.CircleGeometry(0.04, 12), s * 0.075, headY + 0.02, fz - 0.005, 0, Math.PI), color: '#2a3a40' });
      }
      parts.push({ geo: at(cyl(headR + 0.008, headR + 0.008, 0.03, 16), 0, headY + 0.02, 0), color: '#3a2e22' });
      break;
    case 'gasmask':
      for (const s of [-1, 1]) parts.push({ geo: at(sph(0.035, 8, 6), s * 0.07, headY + 0.03, fz), color: '#1a2226' });
      parts.push({ geo: at(cyl(0.045, 0.06, 0.09, 10), 0, headY - 0.07, fz - 0.02, Math.PI / 2), color: '#3a3f38' });
      parts.push({ geo: at(cyl(0.035, 0.035, 0.02, 10), 0, headY - 0.07, fz - 0.07, Math.PI / 2), color: '#1a1a1a' });
      break;
    case 'bag':
      parts.push({ geo: at(box(0.4, 0.44, 0.4), 0, headY + 0.02, 0), color: '#8a7350' });
      for (const s of [-1, 1]) parts.push({ geo: at(box(0.05, 0.05, 0.01), s * 0.08, headY + 0.04, -0.205), color: '#141210' });
      parts.push({ geo: at(box(0.09, 0.02, 0.01), 0, headY - 0.08, -0.205), color: '#141210' });
      break;
    case 'bandage':
      parts.push({ geo: at(cyl(headR + 0.01, headR + 0.01, 0.07, 16), 0, headY + 0.03, 0, 0.15), color: '#d8d0bc' });
      parts.push({ geo: at(sph(0.028, 8, 6), 0.075, headY - 0.02, fz), color: '#111014' });
      break;
    case 'visor':
      parts.push({ geo: at(cyl(headR + 0.012, headR + 0.012, 0.07, 16, ), 0, headY + 0.02, 0, 0, 0, 0, 1, 1, 1), color: '#151a22' });
      parts.push({ geo: at(box(0.26, 0.05, 0.02), 0, headY + 0.02, fz - 0.015), color: '#7a2a24' });
      break;
  }
  // headwear
  const hc = c.hatColor;
  switch (c.headwear) {
    case 'hood':
      parts.push({ geo: at(sph(headR + 0.04, 14, 10, 0, Math.PI * 0.62), 0, headY + 0.01, 0.02), color: hc });
      parts.push({ geo: at(new THREE.ConeGeometry(0.1, 0.16, 8), 0, headY + 0.1, 0.2, -1.1), color: hc });
      break;
    case 'beanie':
      parts.push({ geo: at(sph(headR + 0.02, 14, 8, 0, Math.PI * 0.5), 0, headY + 0.03, 0, 0, 0, 0, 1, 1.15, 1), color: hc });
      parts.push({ geo: at(cyl(headR + 0.03, headR + 0.03, 0.05, 16), 0, headY + 0.05, 0), color: c.trim });
      break;
    case 'cap':
      parts.push({ geo: at(sph(headR + 0.015, 14, 8, 0, Math.PI * 0.5), 0, headY + 0.03, 0), color: hc });
      parts.push({ geo: at(box(0.24, 0.015, 0.16), 0, headY + 0.06, -0.24), color: hc });
      break;
    case 'bucket':
      parts.push({ geo: at(cyl(0.17, 0.23, 0.14, 14), 0, headY + 0.16, 0), color: hc });
      parts.push({ geo: at(cyl(0.29, 0.29, 0.015, 16), 0, headY + 0.09, 0), color: hc });
      break;
    case 'widebrim':
      parts.push({ geo: at(cyl(0.36, 0.36, 0.015, 18), 0, headY + 0.13, 0), color: hc });
      parts.push({ geo: at(cyl(0.15, 0.18, 0.12, 14), 0, headY + 0.2, 0), color: hc });
      break;
    case 'tophat':
      parts.push({ geo: at(cyl(0.13, 0.13, 0.26, 14), 0, headY + 0.3, 0), color: hc });
      parts.push({ geo: at(cyl(0.24, 0.24, 0.015, 16), 0, headY + 0.17, 0), color: hc });
      parts.push({ geo: at(cyl(0.135, 0.135, 0.035, 14), 0, headY + 0.2, 0), color: c.trim });
      break;
    case 'bandana':
      parts.push({ geo: at(sph(headR + 0.012, 14, 8, 0, Math.PI * 0.45), 0, headY + 0.03, 0), color: hc });
      parts.push({ geo: at(new THREE.ConeGeometry(0.06, 0.12, 6), 0, headY + 0.02, 0.24, 1.3), color: hc });
      break;
    case 'tufts':
      for (let k = 0; k < 5; k++) parts.push({ geo: at(new THREE.ConeGeometry(0.05, 0.16, 6), (k - 2) * 0.06, headY + 0.2 + (k % 2) * 0.03, 0.02 + Math.abs(k - 2) * 0.02, 0, 0, (k - 2) * -0.35), color: hc });
      break;
    case 'bun':
      parts.push({ geo: at(sph(headR + 0.012, 14, 8, 0, Math.PI * 0.5), 0, headY + 0.02, 0.01), color: hc });
      parts.push({ geo: at(sph(0.08, 10, 8), 0, headY + 0.2, 0.1), color: hc });
      break;
    case 'bowler':
      parts.push({ geo: at(sph(0.17, 14, 8, 0, Math.PI * 0.5), 0, headY + 0.12, 0, 0, 0, 0, 1, 1.1, 1), color: hc });
      parts.push({ geo: at(cyl(0.27, 0.27, 0.015, 16), 0, headY + 0.12, 0), color: hc });
      break;
    case 'helmet':
      parts.push({ geo: at(sph(headR + 0.035, 14, 8, 0, Math.PI * 0.55), 0, headY + 0.02, 0), color: '#5a5e60' });
      parts.push({ geo: at(cyl(headR + 0.06, headR + 0.06, 0.02, 16), 0, headY + 0.02, 0), color: '#4a4e50' });
      break;
    case 'earflap':
      parts.push({ geo: at(sph(headR + 0.02, 14, 8, 0, Math.PI * 0.55), 0, headY + 0.02, 0), color: hc });
      for (const s of [-1, 1]) parts.push({ geo: at(box(0.04, 0.16, 0.12), s * (headR + 0.01), headY - 0.06, 0), color: hc });
      break;
  }
  // scarf and pack
  if (c.scarf) {
    parts.push({ geo: at(new THREE.TorusGeometry(0.15 * w, 0.045, 6, 14), 0, 0.74, 0, Math.PI / 2), color: c.scarf });
    parts.push({ geo: at(box(0.08, 0.2, 0.03), 0.07, 0.62, -0.17 * w, 0.1, 0, 0.15), color: c.scarf });
  }
  if (c.pack === 'backpack') parts.push({ geo: at(box(0.26 * w, 0.3, 0.12), 0, 0.56, 0.2 * w), color: '#4a3a2a' });
  if (c.pack === 'satchel') {
    parts.push({ geo: at(box(0.16, 0.13, 0.06), 0.2 * w, 0.4, -0.06), color: '#5a3f28' });
    parts.push({ geo: at(box(0.03, 0.5, 0.02), 0.02, 0.6, -0.17 * w, 0, 0, 0.75), color: '#3a2a1c' });
  }
  const merged = mergeGeometries(parts.map(prep))!;
  merged.scale(1, c.height, 1);
  // pivots scale with the body height too
  const pv = merged.attributes.aPivot as THREE.BufferAttribute;
  for (let i = 0; i < pv.count; i++) pv.setY(i, pv.getY(i) * c.height);
  merged.computeBoundingSphere();
  return merged;
}

/** Material with GPU limb swing: uPhase (walk cycle), uSwing (amplitude, rad). One program for all contestants. */
export function contestantMaterial(): THREE.MeshStandardMaterial & { userData: { uniforms: { uPhase: { value: number }; uSwing: { value: number } } } } {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0 }) as THREE.MeshStandardMaterial & { userData: { uniforms: { uPhase: { value: number }; uSwing: { value: number } } } };
  const uniforms = { uPhase: { value: 0 }, uSwing: { value: 0 } };
  m.userData.uniforms = uniforms;
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aSwing; attribute vec3 aPivot; uniform float uPhase; uniform float uSwing;\nmat3 cnSwing() { float a = aSwing * uSwing * sin(uPhase); float c = cos(a), s = sin(a); return mat3(1.0, 0.0, 0.0, 0.0, c, s, 0.0, -s, c); }')
      .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\nobjectNormal = cnSwing() * objectNormal;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed = cnSwing() * (transformed - aPivot) + aPivot;');
  };
  m.customProgramCacheKey = () => 'cn-contestant-v1';
  return m;
}
