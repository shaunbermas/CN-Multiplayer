// Stage 01 refinement (Phase 05): The Watcher's surface and lens polish, at runtime only.
//
// APPROVED MODEL LOCK: geometry, proportions, silhouette, hairstyle, coat, face structure and the single
// camera-lens eye are untouched. Nothing here moves a vertex, bone or mesh; THE_WATCHER.glb is unchanged
// (untouched originals: blender/backups/THE_WATCHER_ORIGINAL_2026-11-24/). Only permitted changes:
//   - materials and shaders: glazed porcelain (clearcoat), lacquered hair sheen, glassier lens cover,
//     a procedural grime and wear pass (darker toward the base and in the folds, by world height and noise)
//   - decision 039 (owner, 25 Nov 2026): years of use. Rust blooms and streaks, speckle and cracks in the shader,
//     a near-black dress, dry matte hair. (The face and hair geometry were reworked in watcher_build.py with
//     the owner's approval, decisions 038 and 039.)
//   - emissive behaviour of the signal lens: four readable eye states
//       neutral  (lobby, briefing, countdown, results)  cool, slow breathing glow
//       green    (green light)                          steady green
//       red      (warning and red light)                hot red with a slight mechanical flicker
//       detect   (just after the server spots someone)  brighter red-orange strobe for about 1.7 s
// Presentation only: the server decides every spot; this only shows it.
import * as THREE from 'three';

export type EyeState = 'neutral' | 'green' | 'red' | 'detect';
export const watcherLookStatus = { upgraded: [] as string[], eye: 'neutral' as EyeState, lensMaterials: 0 };

const GRIME_GLSL = /* glsl */ `
float cnHash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float cnNoise(vec3 x) {
  vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(cnHash(i), cnHash(i + vec3(1,0,0)), f.x), mix(cnHash(i + vec3(0,1,0)), cnHash(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(cnHash(i + vec3(0,0,1)), cnHash(i + vec3(1,0,1)), f.x), mix(cnHash(i + vec3(0,1,1)), cnHash(i + vec3(1,1,1)), f.x), f.y), f.z);
}
// decision 039: crack lines (distance to the nearest cell edge of a 3D Voronoi pattern)
float cnCrack(vec3 x) {
  vec3 i = floor(x); vec3 f = fract(x); float d1 = 8.0, d2 = 8.0;
  for (int a = -1; a <= 1; a++) for (int b = -1; b <= 1; b++) for (int c = -1; c <= 1; c++) {
    vec3 g = vec3(float(a), float(b), float(c));
    vec3 o = vec3(cnHash(i + g), cnHash(i + g + 17.0), cnHash(i + g + 31.0));
    float d = length(g + o - f);
    if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) { d2 = d; }
  }
  return d2 - d1;
}`;

/** Grime and wear: darker and rougher low on the figure and in noisy patches; runs off the world position. */
function addGrime(m: THREE.MeshStandardMaterial, amount: number, base: number, height: number, rust = 0, cracks = 0) {
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uGrime = { value: amount };
    sh.uniforms.uRust = { value: rust };
    sh.uniforms.uCracks = { value: cracks };
    sh.uniforms.uGrimeBase = { value: base };
    sh.uniforms.uGrimeHeight = { value: height };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vCnWorld;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvCnWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vCnWorld; uniform float uGrime; uniform float uGrimeBase; uniform float uGrimeHeight; uniform float uRust; uniform float uCracks;\n${GRIME_GLSL}`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
  float cnH = clamp((vCnWorld.y - uGrimeBase) / uGrimeHeight, 0.0, 1.0);
  float cnN = cnNoise(vCnWorld * 1.7) * 0.6 + cnNoise(vCnWorld * 6.0) * 0.4;
  float cnG = uGrime * clamp((1.0 - cnH) * 0.9 + (cnN - 0.55) * 1.2, 0.0, 1.0);
  diffuseColor.rgb *= 1.0 - cnG * 0.38;
  roughnessFactor = clamp(roughnessFactor + cnG * 0.3, 0.0, 1.0);
  // years of use (decision 039): rust blooms and vertical rust streaks, grime speckle, and cracks
  float cnStreak = cnNoise(vec3(vCnWorld.x * 3.1, vCnWorld.y * 0.35, vCnWorld.z * 3.1));
  float cnR = uRust * clamp(smoothstep(0.58, 0.78, cnNoise(vCnWorld * 0.8) * 0.65 + cnNoise(vCnWorld * 4.3) * 0.35)
            + smoothstep(0.62, 0.8, cnStreak) * 0.7, 0.0, 1.0);
  vec3 cnRustCol = mix(vec3(0.12, 0.045, 0.02), vec3(0.3, 0.11, 0.04), cnNoise(vCnWorld * 9.0));
  diffuseColor.rgb = mix(diffuseColor.rgb, cnRustCol, cnR * 0.85);
  roughnessFactor = clamp(roughnessFactor + cnR * 0.45, 0.0, 1.0);
  float cnSpeck = step(0.83, cnNoise(vCnWorld * 26.0)) * uRust;
  diffuseColor.rgb *= 1.0 - cnSpeck * 0.55;
  float cnC = uCracks * (1.0 - smoothstep(0.0, 0.035, cnCrack(vCnWorld * 1.1))) * smoothstep(0.35, 0.6, cnNoise(vCnWorld * 0.7 + 3.0));
  diffuseColor.rgb *= 1.0 - cnC * 0.8;`);
  };
  m.customProgramCacheKey = () => `cn-grime-${amount}-${rust}-${cracks}`;
  m.needsUpdate = true;
}

/** Swap a standard material for a physical one with the same maps (adds clearcoat / sheen). */
function toPhysical(m: THREE.MeshStandardMaterial, extra: Partial<THREE.MeshPhysicalMaterialParameters>): THREE.MeshPhysicalMaterial {
  const p = new THREE.MeshPhysicalMaterial();
  THREE.MeshStandardMaterial.prototype.copy.call(p, m);
  p.name = m.name;
  p.setValues(extra);
  p.userData = { ...m.userData };
  return p;
}

export interface WatcherLook { lenses: { mat: THREE.MeshStandardMaterial; kind: 'neutral' | 'green' | 'red'; base: number; color: THREE.Color }[]; dispose: () => void }

/** Upgrade the loaded Watcher's materials in place (geometry untouched). `plinthY` = world height of its feet. */
export function upgradeWatcherMaterials(root: THREE.Object3D, plinthY: number, height: number): WatcherLook {
  const swapped = new Map<THREE.Material, THREE.Material>();
  const created: THREE.Material[] = [];
  const lenses: WatcherLook['lenses'] = [];
  const upgraded = new Set<string>();
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const next = mats.map((mat) => {
      const m = mat as THREE.MeshStandardMaterial;
      if (swapped.has(m)) return swapped.get(m)!;
      let out: THREE.Material = m;
      switch (m.name) {
        case 'MAT_Watcher_Porcelain':     // decision 039: old, dirty, cracked porcelain with rust bleeding from the joints
          out = toPhysical(m, { clearcoat: 0.3, clearcoatRoughness: 0.4 }); (out as THREE.MeshPhysicalMaterial).color.multiplyScalar(0.7);
          addGrime(out as THREE.MeshStandardMaterial, 0.7, plinthY, height, 0.75, 1); break;
        case 'MAT_Watcher_HairLacquer':   // decision 039: dark, dry, matte hair
          m.color.multiplyScalar(0.55); m.roughness = Math.max(m.roughness, 0.7); m.metalness = 0; m.side = THREE.DoubleSide; break;
        case 'MAT_Watcher_EnamelTeal':    // decision 039: the coat is a dark, worn dress (near black, a hint of teal), rusted at the seams
          out = toPhysical(m, { clearcoat: 0.15, clearcoatRoughness: 0.6 }); (out as THREE.MeshPhysicalMaterial).color.set('#1a2224');
          addGrime(out as THREE.MeshStandardMaterial, 0.6, plinthY, height, 0.28, 0.3); break;
        case 'MAT_Watcher_Textile':
          m.color.multiplyScalar(0.45); addGrime(m, 0.8, plinthY, height, 0.4, 0); break;
        case 'MAT_Watcher_Brass':         // tarnished brass: rougher, rusty
          m.roughness = Math.min(1, m.roughness * 1.3); addGrime(m, 0.5, plinthY, height, 0.7, 0); break;
        case 'MAT_Watcher_SteelDark':
          addGrime(m, 0.6, plinthY, height, 0.9, 0); break;
        case 'MAT_Watcher_LensGlass':     // the eye's cover glass: deep, wet reflection
          out = toPhysical(m, { clearcoat: 1, clearcoatRoughness: 0.02, roughness: 0.04, metalness: 0.1, envMapIntensity: 1.6 }); break;
      }
      if (out !== m) { swapped.set(m, out); created.push(out); }
      if (m.name.startsWith('MAT_Watcher_Lens_')) {
        const kind = m.name.endsWith('Neutral') ? 'neutral' : m.name.endsWith('Green') ? 'green' : 'red';
        if (!lenses.some((l) => l.mat === m)) lenses.push({ mat: m, kind, base: m.emissiveIntensity, color: m.emissive.clone() });
      }
      if (out !== m || m.name.startsWith('MAT_Watcher_')) upgraded.add(m.name);
      return out;
    });
    mesh.material = Array.isArray(mesh.material) ? next : next[0];
  });
  watcherLookStatus.upgraded = [...upgraded].sort();
  watcherLookStatus.lensMaterials = lenses.length;
  return { lenses, dispose: () => created.forEach((m) => m.dispose()) };
}

/** Eye state from the public round state (presentation only). */
export function eyeState(phase: string, signal: string, sinceSpotted: number): EyeState {
  if (phase === 'active' && sinceSpotted < 1.7) return 'detect';
  if (phase === 'active' && (signal === 'red' || signal === 'warning')) return 'red';
  if (phase === 'active' && signal === 'green') return 'green';
  return 'neutral';
}

const DETECT = new THREE.Color('#ff5a32');

/** Drive the lens emissive each frame. The clips choose which lens shows; this sets how it glows. */
export function driveLens(look: WatcherLook, state: EyeState, t: number): void {
  watcherLookStatus.eye = state;
  for (const l of look.lenses) {
    let k = 1;
    if (l.kind === 'neutral') k = state === 'neutral' ? 0.75 + 0.25 * Math.sin(t * 1.3) : 0.5;           // slow breathing
    else if (l.kind === 'green') k = state === 'green' ? 1.05 + 0.05 * Math.sin(t * 2.2) : 0.6;
    else if (state === 'detect') k = 2.1 + (Math.sin(t * 38) > 0 ? 0.6 : -0.4);                              // strobe
    else if (state === 'red') k = 1.15 + 0.06 * Math.sin(t * 7) + (Math.sin(t * 53) > 0.97 ? -0.35 : 0);    // mechanical flicker
    else k = 0.6;
    l.mat.emissiveIntensity = l.base * k;
    if (l.kind === 'red') l.mat.emissive.copy(l.color).lerp(DETECT, state === 'detect' ? 0.55 : 0);
  }
}
