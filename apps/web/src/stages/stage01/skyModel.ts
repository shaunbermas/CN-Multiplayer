// Stage 1.5: one description of the Stage 01 night sky, shared by the visible sky dome (Prompt 04) and the
// environment map used for reflections (Prompt 03), so puddles and steel reflect the sky the player sees.
import * as THREE from 'three';

/** Sky colours (sRGB hex): zenith to horizon, plus the moon and the warm glow of the yard's floodlights. */
export const SKY = {
  zenith: '#060c18',       // Phase 10: teal-blue night with a purple undertone higher up
  upper: '#171d3a',
  horizon: '#456569',      // equals the scene fog colour (STAGE_01_LIGHTING.json fog), so fog melts into the sky
  horizonGlow: '#55777a',
  below: '#0b1416',
  moon: '#dfe8f2',
  /** Direction toward the moon (game space, normalised at use). Matches LGT_STG01_Moon's light travelling
   *  along (0.568, -0.469, 0.676): the moon sits opposite that direction. */
  moonDir: [-0.568, 0.469, -0.676] as [number, number, number],
  amber: '#ffb15c',
};

/** GLSL for the sky gradient; `dir` must be a normalised world direction. */
export const SKY_GRADIENT_GLSL = /* glsl */ `
uniform vec3 uZenith; uniform vec3 uUpper; uniform vec3 uHorizon; uniform vec3 uGlow; uniform vec3 uBelow;
vec3 skyGradient(vec3 dir) {
  float h = dir.y;
  vec3 c = mix(uHorizon, uUpper, smoothstep(0.02, 0.35, h));
  c = mix(c, uZenith, smoothstep(0.35, 0.95, h));
  c = mix(c, uGlow, exp(-abs(h) * 22.0) * 0.6);         // thin bright band at the horizon
  c = mix(uBelow, c, smoothstep(-0.12, 0.0, h));        // ground side
  return c;
}`;

export function skyUniforms() {
  const lin = (h: string) => new THREE.Color(h); // THREE.Color converts sRGB hex to linear working space
  return {
    uZenith: { value: lin(SKY.zenith) }, uUpper: { value: lin(SKY.upper) }, uHorizon: { value: lin(SKY.horizon) },
    uGlow: { value: lin(SKY.horizonGlow) }, uBelow: { value: lin(SKY.below) },
  };
}

/**
 * Builds a prefiltered environment map of the night sky: the gradient, a soft moon and a few warm patches
 * where the floodlight banks are, so wet ground and metal pick up believable highlights. Rendered once.
 */
export function buildSkyEnvironment(renderer: THREE.WebGLRenderer): THREE.WebGLRenderTarget {
  const scene = new THREE.Scene();
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: { ...skyUniforms(), uMoonDir: { value: new THREE.Vector3(...SKY.moonDir).normalize() }, uMoon: { value: new THREE.Color(SKY.moon) } },
    vertexShader: 'varying vec3 vDir; void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `${SKY_GRADIENT_GLSL}
      uniform vec3 uMoonDir; uniform vec3 uMoon; varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        vec3 c = skyGradient(d);
        float m = max(dot(d, uMoonDir), 0.0);
        c += uMoon * (pow(m, 900.0) * 6.0 + pow(m, 24.0) * 0.12);   // moon disc and halo
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  scene.add(new THREE.Mesh(new THREE.SphereGeometry(50, 48, 24), mat));
  // Floodlight banks (two rows along the course) as warm emissive strips just above the horizon.
  const amber = new THREE.MeshBasicMaterial({ color: new THREE.Color(SKY.amber).multiplyScalar(2.2), side: THREE.DoubleSide });
  for (const x of [-1, 1]) {
    for (let k = 0; k < 5; k++) {
      const q = new THREE.Mesh(new THREE.PlaneGeometry(3.5, 1.2), amber);
      const a = (k / 4 - 0.5) * 2.2;
      q.position.set(x * 30, 9, Math.sin(a) * 30 - 10 * k + 10);
      q.lookAt(0, 0, q.position.z);
      scene.add(q);
    }
  }
  const pmrem = new THREE.PMREMGenerator(renderer);
  const rt = pmrem.fromScene(scene, 0.02);
  pmrem.dispose();
  scene.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { m.geometry.dispose(); (m.material as THREE.Material).dispose(); } });
  rt.texture.name = 'STG01_SkyEnvironment';
  return rt;
}
