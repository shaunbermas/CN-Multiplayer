// Stage 1.5 (Prompt 05): visible models for the obstacle twist. Collision lives in packages/shared/src/
// obstacles.ts and runs on the server (authority) and in prediction; this only draws the same shapes.
//   - barricade rows: low-poly jersey barriers (trapezoid section) merged into one draw call
//   - sliding gate: steel panel with hazard stripes on ground rails; its beacon blinks amber while it moves
//     (green / warning) and turns solid red when it is frozen (red light), so its state is readable
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { gateX, greenTime, type Rect } from '@cn-trials/shared';
import type { TrialRoom } from '../../net.ts';
import { scheduleFor, signalView } from '../../game/roundClock.ts';
import { stageObstacles } from '../../game/stage.ts';

export const obstacleStatus = { shown: false, barricades: 0, gateX: 0, gateMoving: false };

function hazardTexture() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = '#8d8a84'; g.fillRect(0, 0, 256, 64);                 // weathered concrete
  for (let i = 0; i < 400; i++) { g.fillStyle = `rgba(40,38,34,${Math.random() * 0.12})`; g.fillRect(Math.random() * 256, Math.random() * 64, 3, 2); }
  g.save(); g.beginPath(); g.rect(0, 6, 256, 18); g.clip();             // hazard band near the top
  for (let x = -64; x < 320; x += 32) { g.fillStyle = '#e0a21c'; g.beginPath(); g.moveTo(x, 24); g.lineTo(x + 16, 24); g.lineTo(x + 34, 6); g.lineTo(x + 18, 6); g.fill(); }
  g.restore();
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** One merged mesh of jersey barriers: trapezoid section (full depth at the base, 40 % at the top). */
function barricadeGeometry(rects: Rect[], height: number) {
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  for (const r of rects) {
    const cz = (r.minZ + r.maxZ) / 2, d = (r.maxZ - r.minZ) / 2, len = r.maxX - r.minX;
    const prof: [number, number][] = [[-d, 0], [-d * 0.75, height * 0.18], [-d * 0.4, height], [d * 0.4, height], [d * 0.75, height * 0.18], [d, 0]];
    // side and top strips along X
    for (let k = 0; k < prof.length - 1; k++) {
      const b = pos.length / 3;
      const [z0, y0] = prof[k], [z1, y1] = prof[k + 1];
      pos.push(r.minX, y0, cz + z0, r.maxX, y0, cz + z0, r.minX, y1, cz + z1, r.maxX, y1, cz + z1);
      const v0 = 1 - y0 / height, v1 = 1 - y1 / height;
      uv.push(0, v0, len / 4, v0, 0, v1, len / 4, v1);
      idx.push(b, b + 1, b + 2, b + 2, b + 1, b + 3);
    }
    for (const x of [r.minX, r.maxX]) { // end caps (fan)
      const b = pos.length / 3;
      for (const [z, y] of prof) { pos.push(x, y, cz + z); uv.push(0.5 + z / (4 * d), 1 - y / height); }
      for (let k = 1; k < prof.length - 1; k++) idx.push(b, b + k, b + k + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export function Obstacles({ room, shadows }: { room: TrialRoom; shadows: boolean }) {
  const o = stageObstacles;
  const gate = useRef<THREE.Group>(null);
  const beacon = useRef<THREE.MeshStandardMaterial>(null);
  const root = useRef<THREE.Group>(null);
  const built = useMemo(() => {
    if (!o) return null;
    const tex = hazardTexture();
    const concrete = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85, metalness: 0, side: THREE.DoubleSide });
    const barricades = new THREE.Mesh(barricadeGeometry(o.barricades, o.barricadeHeight), concrete);
    barricades.name = 'OBS_STG01_Barricades';
    const steelTex = tex.clone(); steelTex.repeat.set(2, 1); steelTex.needsUpdate = true;
    const steel = new THREE.MeshStandardMaterial({ map: steelTex, color: '#b9b4aa', roughness: 0.45, metalness: 0.6 });
    const rail = new THREE.MeshStandardMaterial({ color: '#3a3d40', roughness: 0.4, metalness: 0.8 });
    const travel = o.gate.amplitude + o.gate.halfWidth;
    const rails = new THREE.Mesh(new THREE.BoxGeometry(travel * 2 + 2, 0.06, 0.14), rail);
    rails.position.set(o.gate.centreX, 0.03, o.gate.z);
    rails.name = 'OBS_STG01_GateRail';
    return { tex, steelTex, concrete, steel, rail, barricades, rails };
  }, [o]);
  useEffect(() => () => {
    if (!built) return;
    built.barricades.geometry.dispose(); built.rails.geometry.dispose();
    built.tex.dispose(); built.steelTex.dispose(); built.concrete.dispose(); built.steel.dispose(); built.rail.dispose();
  }, [built]);
  useEffect(() => { if (root.current) root.current.traverse((x) => { if ((x as THREE.Mesh).isMesh) { x.castShadow = shadows; x.receiveShadow = shadows; } }); }, [shadows, built]);
  useFrame((state) => {
    const r = root.current;
    if (!r || !o) return;
    const on = room.round.obstacles; // always on (decision 031), lobby included
    r.visible = on;
    obstacleStatus.shown = on;
    obstacleStatus.barricades = on ? o.barricades.length : 0;
    if (!on) return;
    const v = signalView(room);
    const gt = room.round.phase === 'active' ? greenTime(scheduleFor(room.round.seed), v.elapsed) : 0;
    const x = gateX(o, gt);
    if (gate.current) gate.current.position.x = x;
    const moving = room.round.phase === 'active' && v.signal !== 'red';
    obstacleStatus.gateX = +x.toFixed(2);
    obstacleStatus.gateMoving = moving;
    if (beacon.current) {
      const blink = moving ? (Math.sin(state.clock.elapsedTime * 9) > 0 ? 6 : 0.3) : 3;
      beacon.current.emissive.set(moving ? '#ffae22' : '#ff2a1a');
      beacon.current.emissiveIntensity = blink;
    }
  });
  if (!o || !built) return null;
  const w = o.gate.halfWidth * 2, h = o.gate.height, d = o.gate.halfDepth * 2;
  return (
    <group ref={root} name="OBS_STG01" visible={false}>
      <primitive object={built.barricades} />
      <primitive object={built.rails} />
      <group ref={gate} position={[o.gate.centreX, 0, o.gate.z]} name="OBS_STG01_Gate">
        <mesh material={built.steel} position={[0, h * 0.55, 0]}><boxGeometry args={[w, h * 0.7, d * 0.5]} /></mesh>
        <mesh material={built.rail} position={[-w / 2, h / 2, 0]}><boxGeometry args={[0.18, h, d]} /></mesh>
        <mesh material={built.rail} position={[w / 2, h / 2, 0]}><boxGeometry args={[0.18, h, d]} /></mesh>
        <mesh material={built.rail} position={[0, 0.12, 0]}><boxGeometry args={[w, 0.24, d]} /></mesh>
        <mesh position={[0, h + 0.15, 0]}>
          <sphereGeometry args={[0.16, 12, 8]} />
          <meshStandardMaterial ref={beacon} color="#331100" emissive="#ffae22" emissiveIntensity={2} />
        </mesh>
      </group>
    </group>
  );
}
