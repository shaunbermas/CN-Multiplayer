// Stage 1.5 (Prompt 06): The Watcher's detection presentation. The approved model, rig, clips and materials
// are untouched; this adds effects driven by the server's public state, anchored on the model's own
// `Watcher_OpticalOrigin` node (the lens):
//   - SearchBeam: during RED, a faint red searchlight cone sweeps the field from the lens (Medium / High)
//   - SpotBeam:   when the server spots a player, a red beam from the lens to that player and a pulsing ring
//                 at their feet for 1.6 s (all tiers; it is the clearest "you were seen" cue)
// Nothing here decides anything: the beam only appears after the server's `spotted` event.
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import type { TrialRoom } from '../../net.ts';
import { signalView } from '../../game/roundClock.ts';

export const watcherFxStatus = { anchor: false, search: false, spotBeams: 0, lastSpotId: '', eye: 'off' as 'off' | 'dim' | 'red' | 'flare', eyeLight: false };

/** Soft radial glow texture for the eye glare (generated once). */
function glowTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,1)'); grad.addColorStop(0.18, 'rgba(255,220,220,0.9)'); grad.addColorStop(0.45, 'rgba(255,60,40,0.35)'); grad.addColorStop(1, 'rgba(255,0,0,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

const SPOT_S = 1.6;
// Phase 10: a softer "laser" (less hot, more translucent) so the spot reads without blowing out the bloom.
const beamMat = () => new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff3a24').multiplyScalar(1.7), transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, toneMapped: false });

export function WatcherFX({ room, root, search, eyeLight }: { room: TrialRoom; root: THREE.Object3D | null; search: boolean; eyeLight: boolean }) {
  const fx = useMemo(() => {
    const g = new THREE.Group();
    g.name = 'STG01_WatcherFX';
    // unit cylinder along +Y, scaled to the beam length each frame
    const beamGeo = new THREE.CylinderGeometry(0.06, 0.06, 1, 8, 1, true);
    beamGeo.translate(0, 0.5, 0);
    const beam = new THREE.Mesh(beamGeo, beamMat());
    beam.visible = false;
    beam.frustumCulled = false;
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.75, 40), beamMat());
    ring.rotation.x = -Math.PI / 2;
    ring.visible = false;
    // searchlight: open cone along +Y with soft additive red, apex at the lens
    const coneGeo = new THREE.ConeGeometry(1, 1, 32, 1, true);
    coneGeo.translate(0, -0.5, 0);
    coneGeo.rotateX(Math.PI); // apex at the origin, opening toward +Y
    // Soft volumetric-looking beam: brightest near the lens, fading along its length and toward its edges.
    const coneMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
      uniforms: { uColor: { value: new THREE.Color('#ff2a18') }, uStrength: { value: 0.2 }, uTime: { value: 0 } }, // decision 038: soft edges now really fade (was 0.22 with hard edges)
      // View-space normal through normalMatrix (the inverse transpose): the cone is scaled very unevenly (long and
      // thin), and transforming its normals by the model matrix bent them along the axis, so the edge fade never
      // happened and the beam drew as a flat, solid band.
      vertexShader: `varying float vAlong; varying vec3 vN; varying vec3 vView;
        void main() { vAlong = position.y; vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal);
          vView = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
      // Owner (25 Nov 2026): the beam read too solid. Softer now: a steeper fade toward the cone's silhouette (no
      // hard edge), a fade to nothing at the far end, a soft start at the lens and slow drifting haze bands.
      fragmentShader: `uniform vec3 uColor; uniform float uStrength; uniform float uTime; varying float vAlong; varying vec3 vN; varying vec3 vView;
        void main() { float facing = abs(dot(normalize(vN), normalize(vView)));
          float edge = smoothstep(0.15, 1.0, facing); edge *= edge * edge;
          float a = clamp(vAlong, 0.0, 1.0); float fall = pow(1.0 - a, 2.6) * smoothstep(0.0, 0.06, a); // clamped: pow of a negative base is NaN on Apple GPUs, and one NaN pixel spread by the bloom blacked out the screen on red
          float haze = 0.7 + 0.18 * sin(a * 23.0 - uTime * 1.7) + 0.12 * sin(a * 57.0 + uTime * 2.9);
          gl_FragColor = vec4(uColor * edge * fall * haze * uStrength, 1.0);
          #include <colorspace_fragment>
        }`,
    });
    const cone = new THREE.Mesh(coneGeo, coneMat);
    cone.visible = false;
    cone.frustumCulled = false;
    // Ground hotspot where the searchlight lands.
    const spot = new THREE.Mesh(new THREE.CircleGeometry(1, 40), new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff2a18').multiplyScalar(1.4), transparent: true, opacity: 0.2, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, toneMapped: false }));
    spot.rotation.x = -Math.PI / 2;
    spot.visible = false;
    // Eye glare: an additive glow on the lens (depth-tested, so the head hides it when The Watcher turns away).
    const glare = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: new THREE.Color('#ff2a1a'), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, toneMapped: false }));
    glare.visible = false;
    // decision 040: two doll eyes, so the second pupil gets its own glare (from `Watcher_OpticalOrigin_L`)
    const glareL = new THREE.Sprite(glare.material);
    glareL.visible = false;
    // Red light on The Watcher's face and the plinth while the eye burns (Medium / High).
    const light = new THREE.PointLight(new THREE.Color('#ff2414'), 0, 40, 1.6);
    light.name = 'LGT_STG15_WatcherEye';
    g.add(beam, ring, cone, spot, glare, glareL);
    if (eyeLight) g.add(light);
    return { g, beam, ring, cone, spot, glare, glareL, light };
  }, []);
  useEffect(() => () => {
    fx.g.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { m.geometry.dispose(); (m.material as THREE.Material).dispose(); } });
    fx.glare.material.map?.dispose(); fx.glare.material.dispose();
  }, [fx]);

  const tmp = useMemo(() => ({ l: new THREE.Vector3(), a: new THREE.Vector3(), b: new THREE.Vector3(), d: new THREE.Vector3(), f: new THREE.Vector3(), v: new THREE.Vector3(), up: new THREE.Vector3(0, 1, 0) }), []);
  const seen = useMemo(() => ({ key: '', at: 0 }), []);
  useFrame((state) => {
    const lens = root?.getObjectByName('Watcher_OpticalOrigin');
    watcherFxStatus.anchor = !!lens;
    if (!lens) return;
    lens.getWorldPosition(tmp.a);
    const phase = room.round.phase;
    const sig = signalView(room).signal;
    const now = Date.now();
    // Spotted beam: newest server 'spotted' event of this round, for SPOT_S seconds.
    const ev = [...room.events].reverse().find((e) => e.kind === 'spotted');
    // Time each spot from the first frame that draws it, so a slow client still shows the beam in full.
    const evKey = ev ? `${ev.id}@${ev.at}` : '';
    if (seen.key !== evKey) { seen.key = evKey; seen.at = now; }
    const age = ev ? (now - Math.max(ev.at, seen.at)) / 1000 : Infinity;
    const p = ev && phase === 'active' && age < SPOT_S ? room.players.get(ev.id) : undefined;
    if (p) {
      tmp.b.set(p.x, 1.1, p.z);
      tmp.d.subVectors(tmp.b, tmp.a);
      const len = tmp.d.length();
      fx.beam.position.copy(tmp.a);
      fx.beam.quaternion.setFromUnitVectors(tmp.up, tmp.d.normalize());
      fx.beam.scale.set(1, len, 1);
      const pulse = 0.6 + 0.4 * Math.sin(state.clock.elapsedTime * 30);
      (fx.beam.material as THREE.MeshBasicMaterial).opacity = 0.85 * pulse;
      fx.ring.position.set(p.x, 0.04, p.z);
      fx.ring.scale.setScalar(1 + age * 0.6);
      (fx.ring.material as THREE.MeshBasicMaterial).opacity = 0.9 * (1 - age / SPOT_S);
      if (watcherFxStatus.lastSpotId !== `${ev!.id}@${ev!.at}`) { watcherFxStatus.lastSpotId = `${ev!.id}@${ev!.at}`; watcherFxStatus.spotBeams++; }
    }
    fx.beam.visible = fx.ring.visible = !!p;
    // Eye: dim ember in the lobby and on green, burning red on warning and red, flaring when the server spots.
    const t = state.clock.elapsedTime;
    const eye = p ? 'flare' : phase === 'active' && (sig === 'red' || sig === 'warning') ? 'red' : 'dim';
    watcherFxStatus.eye = eye;
    // decision 041: hide the glares while the eyes face away (the doll's hair has gaps the glow would shine through)
    const fwd = root?.getObjectByName('Watcher_DetectionForward');
    let facing = true;
    if (fwd) { fwd.getWorldPosition(tmp.f).sub(tmp.a); tmp.v.subVectors(state.camera.position, tmp.a); facing = tmp.f.dot(tmp.v) > 0; }
    fx.glare.visible = facing;
    fx.glare.position.copy(tmp.a);
    const pulse = 0.85 + 0.15 * Math.sin(t * (eye === 'red' ? 6 : 2));
    const size = eye === 'flare' ? 5 + Math.sin(t * 30) * 0.8 : eye === 'red' ? 2.8 * pulse : 1.2 * pulse;  // decision 041: sized to the doll's irises
    fx.glare.scale.set(size, size, 1);
    fx.glare.material.opacity = eye === 'dim' ? 0.45 : 1;
    const lensL = root?.getObjectByName('Watcher_OpticalOrigin_L');
    fx.glareL.visible = !!lensL && facing;
    if (lensL) { lensL.getWorldPosition(tmp.l); fx.glareL.position.copy(tmp.l); fx.glareL.scale.set(size, size, 1); }
    // decision 038: weaker and further forward, so the red reads on the eye and the beam instead of flooding the face.
    // Decision 041: the doll is pale, so the light sits well out in front and lower: it reds the yard, not the doll.
    fx.light.intensity = THREE.MathUtils.lerp(fx.light.intensity, eye === 'flare' ? 380 : eye === 'red' ? 120 * pulse : 0, 0.2);
    fx.light.position.copy(tmp.a).add(new THREE.Vector3(0, -10, 16));
    watcherFxStatus.eyeLight = eyeLight && fx.light.intensity > 1;
    // Searchlight sweep during red (presentation only; detection is not line-of-sight, decision E9).
    const sweeping = search && phase === 'active' && sig === 'red' && !p;
    fx.cone.visible = sweeping;
    fx.spot.visible = sweeping;
    watcherFxStatus.search = sweeping;
    if (sweeping) {
      const t = state.clock.elapsedTime;
      tmp.b.set(Math.sin(t * 0.7) * 22, 0, -60 + Math.sin(t * 0.37) * 35);
      tmp.d.subVectors(tmp.b, tmp.a);
      const len = tmp.d.length();
      (fx.cone.material as THREE.ShaderMaterial).uniforms.uTime.value = t;
      fx.cone.position.copy(tmp.a);
      fx.cone.quaternion.setFromUnitVectors(tmp.up, tmp.d.normalize());
      fx.cone.scale.set(len * 0.06, len, len * 0.06);
      fx.spot.position.set(tmp.b.x, 0.05, tmp.b.z);
      fx.spot.scale.setScalar(len * 0.06 * 1.2);
    }
  });
  return <primitive object={fx.g} />;
}
