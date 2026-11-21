// Stage 1.5 (Prompt 04): cinematic atmosphere for Stage 01, tiered for browser performance.
//   SkyDome     gradient night sky, moon with halo, procedural stars and drifting cloud bands (one draw call)
//   LightCones  soft additive cones under the floodlights, a cheap stand-in for volumetric light
//   GroundMist  low animated mist sheets along the fences and behind the finish, never over the lanes
//   SignalWash  a coloured light at the signal gantry that follows the server's public signal
//   PostFX      bloom on emissive lamps and a restrained colour grade with vignette (High only)
// Presentation only: every gameplay decision stays on the server.
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import lighting from '../../../../../blender/exports/STAGE_01_LIGHTING.json';
import type { TrialRoom } from '../../net.ts';
import type { Quality } from '../../game/quality.ts';
import { signalView } from '../../game/roundClock.ts';
import { SKY, SKY_GRADIENT_GLSL, skyUniforms } from './skyModel.ts';

/** What the current tier turned on, for tests (window.__cn.assets().atmosphere). */
export const atmosphereStatus = { sky: '', cones: 0, mist: 0, wash: false, post: 'none' as string };

/** Per-tier atmosphere settings (documented in docs/stage15/P04_ATMOSPHERE_REPORT.md). */
export const ATMOSPHERE: Record<Quality, { stars: boolean; clouds: boolean; cones: boolean; mist: number; wash: boolean; post: 'none' | 'grade' | 'bloom+grade' }> = {
  low: { stars: false, clouds: false, cones: false, mist: 0, wash: false, post: 'none' },
  medium: { stars: true, clouds: true, cones: true, mist: 2, wash: true, post: 'none' },
  high: { stars: true, clouds: true, cones: true, mist: 4, wash: true, post: 'bloom+grade' },
};

// ------------------------------------------------------------------------------------------ sky dome
function SkyDome({ stars, clouds }: { stars: boolean; clouds: boolean }) {
  const camera = useThree((s) => s.camera);
  const mesh = useMemo(() => {
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false,
      defines: { STARS: stars ? 1 : 0, CLOUDS: clouds ? 1 : 0 },
      uniforms: { ...skyUniforms(), uTime: { value: 0 }, uMoonDir: { value: new THREE.Vector3(...SKY.moonDir).normalize() }, uMoon: { value: new THREE.Color(SKY.moon) } },
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() { vDir = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }`,
      fragmentShader: /* glsl */ `${SKY_GRADIENT_GLSL}
        uniform float uTime; uniform vec3 uMoonDir; uniform vec3 uMoon; varying vec3 vDir;
        float hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
        float noise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
          float a = hash(vec3(i, 1.0)), b = hash(vec3(i + vec2(1, 0), 1.0)), c = hash(vec3(i + vec2(0, 1), 1.0)), d = hash(vec3(i + vec2(1, 1), 1.0));
          return mix(mix(a, b, f.x), mix(c, d, f.x), f.y); }
        float fbm(vec2 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; } return v; }
        void main() {
          vec3 d = normalize(vDir);
          vec3 c = skyGradient(d);
          float m = max(dot(d, uMoonDir), 0.0);
          #if STARS
            vec3 cell = floor(d * 260.0);
            float s = hash(cell);
            float tw = 0.75 + 0.25 * sin(uTime * (1.0 + s * 3.0) + s * 40.0);
            float star = step(0.9965, s) * smoothstep(0.03, 0.4, d.y) * tw * (1.0 - smoothstep(0.96, 0.999, m));
            c += vec3(0.75, 0.82, 1.0) * star * 0.55;
          #endif
          // moon: crisp disc, soft halo
          c += uMoon * (smoothstep(0.99955, 0.99975, m) * 1.6 + pow(m, 60.0) * 0.10 + pow(m, 8.0) * 0.03);
          #if CLOUDS
            // thin cloud bands drifting slowly, lit by the moon on the near side, thicker toward the horizon
            vec2 uv = d.xz / max(d.y + 0.12, 0.05) * 0.7 + vec2(uTime * 0.004, uTime * 0.0015);
            float cl = smoothstep(0.52, 0.86, fbm(uv * 1.3) * 0.85 + fbm(uv * 4.1) * 0.25);
            cl *= smoothstep(0.0, 0.12, d.y) * (1.0 - smoothstep(0.55, 0.95, d.y));
            vec3 cloudCol = mix(uUpper * 1.6, uMoon * 0.32, pow(m, 6.0));
            c = mix(c, cloudCol, cl * 0.55);
          #endif
          gl_FragColor = vec4(c, 1.0);
          #include <colorspace_fragment>
        }`,
    });
    const m = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), mat);
    m.name = 'STG01_SkyDome';
    m.frustumCulled = false;
    m.renderOrder = -100; // first; depthTest off and xyww projection keep it behind everything
    return m;
  }, [stars, clouds]);
  useEffect(() => { atmosphereStatus.sky = `gradient+moon${stars ? '+stars' : ''}${clouds ? '+clouds' : ''}`; }, [stars, clouds]);
  useEffect(() => () => { mesh.geometry.dispose(); (mesh.material as THREE.Material).dispose(); }, [mesh]);
  useFrame((state) => {
    mesh.position.copy(camera.position);
    (mesh.material as THREE.ShaderMaterial).uniforms.uTime.value = state.clock.elapsedTime;
  });
  return <primitive object={mesh} />;
}

// ------------------------------------------------------------------------------------------ light cones
const coneVertex = /* glsl */ `
varying float vAlong; varying vec3 vN; varying vec3 vView;
void main() {
  vAlong = 1.0 - uv.y;                                     // 0 at the lamp, 1 at the far end
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vN = normalize(mat3(modelMatrix) * normal);
  vView = normalize(cameraPosition - wp.xyz);
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;
const coneFragment = /* glsl */ `
uniform vec3 uColor; uniform float uStrength; varying float vAlong; varying vec3 vN; varying vec3 vView;
void main() {
  float edge = pow(abs(dot(normalize(vN), normalize(vView))), 1.6); // soft at the silhouette
  float fall = (1.0 - vAlong) * (1.0 - vAlong) * smoothstep(0.0, 0.08, vAlong);
  gl_FragColor = vec4(uColor * edge * fall * uStrength, 1.0);
  #include <colorspace_fragment>
}`;

function LightCones() {
  const group = useMemo(() => {
    const g = new THREE.Group();
    g.name = 'STG01_LightCones';
    const floods = lighting.lights.filter((l) => l.id.startsWith('LGT_STG01_Flood_'));
    const mat = new THREE.ShaderMaterial({
      vertexShader: coneVertex, fragmentShader: coneFragment, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
      uniforms: { uColor: { value: new THREE.Color(SKY.amber) }, uStrength: { value: 0.07 } },
    });
    for (const l of floods) {
      const len = 26;
      const r = Math.tan(THREE.MathUtils.degToRad((l.angleDeg ?? 40) * 0.5)) * len * 0.85;
      const geo = new THREE.ConeGeometry(r, len, 24, 1, true);
      geo.translate(0, -len / 2, 0); // apex at the lamp
      const cone = new THREE.Mesh(geo, mat);
      cone.position.set(...(l.position as [number, number, number]));
      const dir = new THREE.Vector3(...(l.direction as [number, number, number])).normalize();
      cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir);
      cone.renderOrder = 5;
      g.add(cone);
    }
    atmosphereStatus.cones = floods.length;
    return g;
  }, []);
  useEffect(() => () => { let mat: THREE.Material | null = null; group.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { m.geometry.dispose(); mat = m.material as THREE.Material; } }); (mat as THREE.Material | null)?.dispose(); atmosphereStatus.cones = 0; }, [group]);
  return <primitive object={group} />;
}

// ------------------------------------------------------------------------------------------ ground mist
const mistFragment = /* glsl */ `
uniform float uTime; uniform vec3 uColor; varying vec2 vUv; varying vec3 vWorld;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y); }
void main() {
  vec2 p = vWorld.xz * 0.06 + vec2(uTime * 0.03, uTime * 0.012);
  float n = noise(p) * 0.6 + noise(p * 2.7 + 3.1) * 0.4;
  float edge = smoothstep(0.0, 0.25, vUv.x) * smoothstep(1.0, 0.75, vUv.x) * smoothstep(0.0, 0.3, vUv.y) * smoothstep(1.0, 0.7, vUv.y);
  gl_FragColor = vec4(uColor, smoothstep(0.35, 0.85, n) * edge * 0.33);
  #include <colorspace_fragment>
}`;

/** Mist sheets: along both fences (outside the lanes) and behind the finish, at knee height. */
const MIST_SHEETS: { pos: [number, number, number]; size: [number, number] }[] = [
  { pos: [-36, 0.6, -80], size: [14, 190] },
  { pos: [36, 0.6, -80], size: [14, 190] },
  { pos: [0, 0.8, -205], size: [110, 40] },
  { pos: [0, 0.6, 30], size: [110, 24] },
];

function GroundMist({ count }: { count: number }) {
  const group = useMemo(() => {
    const g = new THREE.Group();
    g.name = 'STG01_GroundMist';
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, fog: false,
      uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color(SKY.horizonGlow) } },
      vertexShader: 'varying vec2 vUv; varying vec3 vWorld; void main() { vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vWorld = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
      fragmentShader: mistFragment,
    });
    for (const s of MIST_SHEETS.slice(0, count)) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(s.size[0], s.size[1]), mat);
      m.rotation.x = -Math.PI / 2;
      m.position.set(...s.pos);
      m.renderOrder = 4;
      g.add(m);
    }
    atmosphereStatus.mist = Math.min(count, MIST_SHEETS.length);
    return g;
  }, [count]);
  useEffect(() => () => { let mat: THREE.Material | null = null; group.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { m.geometry.dispose(); mat = m.material as THREE.Material; } }); (mat as THREE.Material | null)?.dispose(); atmosphereStatus.mist = 0; }, [group]);
  useFrame((state) => {
    const first = group.children[0] as THREE.Mesh | undefined;
    if (first) (first.material as THREE.ShaderMaterial).uniforms.uTime.value = state.clock.elapsedTime;
  });
  return <primitive object={group} />;
}

// ------------------------------------------------------------------------------------------ signal wash
const WASH: Record<string, string> = { green: '#2bff6a', warning: '#ffb020', red: '#ff2a2a' };

/** A coloured light above the signal gantry: the whole far end of the yard reads the signal state. */
function SignalWash({ room }: { room: TrialRoom }) {
  const light = useRef<THREE.PointLight>(null);
  const anchor = useMemo(() => {
    const lamps = lighting.lights.filter((l) => l.id.startsWith('LGT_STG01_Flood_'));
    const z = Math.min(...lamps.map((l) => l.position[2]));
    return [0, 14, z + 12] as [number, number, number];
  }, []);
  const target = useMemo(() => new THREE.Color(), []);
  useEffect(() => { atmosphereStatus.wash = true; return () => { atmosphereStatus.wash = false; }; }, []);
  useFrame((_, dt) => {
    const l = light.current;
    if (!l) return;
    const sig = signalView(room).signal;
    const on = sig in WASH;
    target.set(on ? WASH[sig] : '#000000');
    l.color.lerp(target, 1 - Math.exp(-dt * 10));
    l.intensity = THREE.MathUtils.lerp(l.intensity, on ? (sig === 'red' ? 900 : 550) : 0, 1 - Math.exp(-dt * 8));
  });
  return <pointLight ref={light} position={anchor} distance={90} decay={1.6} intensity={0} name="LGT_STG15_SignalWash" />;
}

// ------------------------------------------------------------------------------------------ post FX
const GradeShader = {
  uniforms: { tDiffuse: { value: null }, uLift: { value: new THREE.Vector3(0.0, 0.012, 0.022) }, uGain: { value: new THREE.Vector3(1.04, 1.0, 0.95) }, uVignette: { value: 0.32 }, uSat: { value: 0.92 } },
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform vec3 uLift; uniform vec3 uGain; uniform float uVignette; uniform float uSat; varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
      vec3 col = mix(vec3(l), c.rgb, uSat);                 // slightly desaturated
      col = col * uGain + uLift * (1.0 - l);                // teal lift in the shadows, warm highlights
      float v = smoothstep(0.85, 0.25, length(vUv - 0.5));
      col *= mix(1.0 - uVignette, 1.0, v);
      gl_FragColor = vec4(col, c.a);
    }`,
};

function PostFX() {
  const { gl, scene, camera, size } = useThree();
  const composer = useMemo(() => {
    const c = new EffectComposer(gl);
    c.addPass(new RenderPass(scene, camera));
    // Only bright emissive lamps, signal lights and the moon bloom; the threshold keeps contestants crisp.
    c.addPass(new UnrealBloomPass(new THREE.Vector2(size.width / 2, size.height / 2), 0.42, 0.4, 0.93));
    c.addPass(new ShaderPass(GradeShader));
    c.addPass(new OutputPass());
    return c;
  }, [gl, scene, camera]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { composer.setPixelRatio(gl.getPixelRatio()); composer.setSize(size.width, size.height); }, [composer, gl, size]);
  useEffect(() => {
    atmosphereStatus.post = 'bloom+grade';
    gl.info.autoReset = false; // count every pass of a frame, not just the last one (renderer statistics)
    return () => { atmosphereStatus.post = 'none'; gl.info.autoReset = true; composer.dispose(); };
  }, [composer, gl]);
  // Priority 1: this frame callback renders the scene through the composer instead of the default render.
  useFrame(() => { gl.info.reset(); composer.render(); }, 1);
  return null;
}

export function Atmosphere({ room, quality }: { room: TrialRoom; quality: Quality }) {
  const a = ATMOSPHERE[quality];
  return (
    <>
      <SkyDome stars={a.stars} clouds={a.clouds} />
      {a.cones && <LightCones />}
      {a.mist > 0 && <GroundMist count={a.mist} />}
      {a.wash && <SignalWash room={room} />}
      {a.post === 'bloom+grade' && <PostFX />}
    </>
  );
}
