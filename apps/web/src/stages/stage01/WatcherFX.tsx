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

export const watcherFxStatus = { anchor: false, search: false, spotBeams: 0, lastSpotId: '' };

const SPOT_S = 1.6;
const beamMat = () => new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff2a1a').multiplyScalar(3), transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, toneMapped: false });

export function WatcherFX({ room, root, search }: { room: TrialRoom; root: THREE.Object3D | null; search: boolean }) {
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
    const coneMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff3020'), transparent: true, opacity: 0.06, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
    const cone = new THREE.Mesh(coneGeo, coneMat);
    cone.visible = false;
    cone.frustumCulled = false;
    g.add(beam, ring, cone);
    return { g, beam, ring, cone };
  }, []);
  useEffect(() => () => { fx.g.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { m.geometry.dispose(); (m.material as THREE.Material).dispose(); } }); }, [fx]);

  const tmp = useMemo(() => ({ a: new THREE.Vector3(), b: new THREE.Vector3(), d: new THREE.Vector3(), up: new THREE.Vector3(0, 1, 0) }), []);
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
    const p = ev && phase === 'active' && (now - ev.at) / 1000 < SPOT_S ? room.players.get(ev.id) : undefined;
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
      fx.ring.scale.setScalar(1 + ((now - ev!.at) / 1000) * 0.6);
      (fx.ring.material as THREE.MeshBasicMaterial).opacity = 0.9 * (1 - (now - ev!.at) / 1000 / SPOT_S);
      if (watcherFxStatus.lastSpotId !== `${ev!.id}@${ev!.at}`) { watcherFxStatus.lastSpotId = `${ev!.id}@${ev!.at}`; watcherFxStatus.spotBeams++; }
    }
    fx.beam.visible = fx.ring.visible = !!p;
    // Searchlight sweep during red (presentation only; detection is not line-of-sight, decision E9).
    const sweeping = search && phase === 'active' && sig === 'red' && !p;
    fx.cone.visible = sweeping;
    watcherFxStatus.search = sweeping;
    if (sweeping) {
      const t = state.clock.elapsedTime;
      tmp.b.set(Math.sin(t * 0.7) * 22, 0, -60 + Math.sin(t * 0.37) * 35);
      tmp.d.subVectors(tmp.b, tmp.a);
      const len = tmp.d.length();
      fx.cone.position.copy(tmp.a);
      fx.cone.quaternion.setFromUnitVectors(tmp.up, tmp.d.normalize());
      fx.cone.scale.set(len * 0.09, len, len * 0.09);
    }
  });
  return <primitive object={fx.g} />;
}
