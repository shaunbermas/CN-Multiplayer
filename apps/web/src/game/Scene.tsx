import { Html, useGLTF } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { inputFromKeys, MOVEMENT, progress, SIM_DT } from '@cn-trials/shared';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import type { PlayerView, TrialRoom } from '../net.ts';
import { hud } from './hudStore.ts';
import { attachInput, input } from './input.ts';
import { Predictor } from './predictor.ts';
import { STAGE_URL, stageGeo } from './stage.ts';

const CAPSULE_LENGTH = MOVEMENT.capsuleHeight - 2 * MOVEMENT.capsuleRadius;
const capsuleGeo = new THREE.CapsuleGeometry(MOVEMENT.capsuleRadius, CAPSULE_LENGTH, 6, 12);
capsuleGeo.translate(0, MOVEMENT.capsuleHeight / 2, 0);
const noseGeo = new THREE.BoxGeometry(0.16, 0.12, 0.2);
noseGeo.translate(0, 0.85, -0.3);

function colorFor(spawn: number) {
  return new THREE.Color().setHSL(((spawn * 0.137) % 1), 0.65, 0.55);
}

function StageModel() {
  const gltf = useGLTF(STAGE_URL);
  return <primitive object={gltf.scene} />;
}

function Contestant({ id, room, local, predictor }: { id: string; room: TrialRoom; local: boolean; predictor?: React.RefObject<Predictor | null> }) {
  const group = useRef<THREE.Group>(null);
  const p0 = room.players.get(id);
  const material = useMemo(() => new THREE.MeshStandardMaterial({ color: colorFor(p0?.spawn ?? 1), roughness: 0.6 }), [p0?.spawn]);
  useFrame((_, dt) => {
    const g = group.current;
    const p = room.players.get(id);
    if (!g || !p) return;
    if (local && predictor?.current) {
      const s = predictor.current.state;
      g.position.set(s.x, 0, s.z);
      g.rotation.y = input.yaw;
    } else {
      // Remote players: smooth toward the latest server position (20 Hz patches).
      const k = 1 - Math.exp(-dt * 15);
      g.position.x += (p.x - g.position.x) * k;
      g.position.z += (p.z - g.position.z) * k;
      g.rotation.y = p.yaw;
    }
  });
  return (
    <group ref={group} position={[p0?.x ?? 0, 0, p0?.z ?? 0]}>
      <mesh geometry={capsuleGeo} material={material} />
      <mesh geometry={noseGeo} material={material} />
      {!local && (
        <Html position={[0, 1.65, 0]} center distanceFactor={14} zIndexRange={[10, 0]}>
          <div className="nametag">{p0?.name}</div>
        </Html>
      )}
    </group>
  );
}

function LocalController({ room, predictor }: { room: TrialRoom; predictor: React.RefObject<Predictor | null> }) {
  const { camera, gl } = useThree();
  const acc = useRef(0);
  const camPos = useRef(new THREE.Vector3());
  const firstMove = useRef<number | null>(null);
  const clock = useRef(0);

  useEffect(() => attachInput(gl.domElement), [gl]);

  useFrame((_, dtRaw) => {
    const pr = predictor.current;
    const me = room.players.get(room.id);
    if (!pr || !me) return;
    const dt = Math.min(dtRaw, 0.25);
    clock.current += dt;
    if (input.respawn) {
      input.respawn = false;
      room.send({ t: 'respawn' });
      const sp = stageGeo.spawns.find((s) => s.index === me.spawn)!;
      pr.reset({ x: sp.x, z: sp.z, vx: 0, vz: 0 });
      firstMove.current = null;
    }
    pr.reconcile(me);
    // Fixed 30 Hz steps, matching the server simulation.
    acc.current += dt;
    while (acc.current >= SIM_DT) {
      acc.current -= SIM_DT;
      const mv = inputFromKeys(input.forward, input.right, input.yaw);
      if (firstMove.current === null && (mv.mx || mv.mz)) firstMove.current = clock.current;
      const seq = pr.apply(mv);
      room.send({ t: 'input', seq, mx: mv.mx, mz: mv.mz, yaw: input.yaw });
    }
    // Third-person follow camera: behind and above, looking past the player.
    const s = pr.state;
    const fx = -Math.sin(input.yaw), fz = -Math.cos(input.yaw);
    const dist = 5.5;
    const target = new THREE.Vector3(s.x - fx * dist * Math.cos(input.pitch), 2.2 - Math.sin(input.pitch) * dist, s.z - fz * dist * Math.cos(input.pitch));
    camPos.current.lerp(target, 1 - Math.exp(-dt * 12));
    if (camPos.current.lengthSq() === 0) camPos.current.copy(target);
    camera.position.copy(camPos.current);
    camera.lookAt(s.x + fx * 4, 1.4 + Math.sin(input.pitch) * 4, s.z + fz * 4);

    hud.progress = progress(stageGeo, s.z);
    hud.distance = Math.max(0, s.z - stageGeo.finishZ);
    hud.status = me.status;
    hud.finishTime = me.finishTime;
    hud.walkTime = me.status === 'finished' ? me.finishTime : firstMove.current === null ? 0 : clock.current - firstMove.current;
  });
  return null;
}

function Players({ room, predictor }: { room: TrialRoom; predictor: React.RefObject<Predictor | null> }) {
  const ids = useRef<string[]>([]);
  const [, force] = useForceUpdate();
  useFrame(() => {
    const now: string[] = [];
    room.players.forEach((_p: PlayerView, id: string) => { now.push(id); });
    hud.players = now.length;
    if (now.join() !== ids.current.join()) { ids.current = now; force(); }
  });
  return <>{ids.current.map((id) => <Contestant key={id} id={id} room={room} local={id === room.id} predictor={predictor} />)}</>;
}

function useForceUpdate(): [number, () => void] {
  const [n, setN] = useState(0);
  return [n, () => setN((x) => x + 1)];
}

export function Scene({ room }: { room: TrialRoom }) {
  const predictor = useRef<Predictor | null>(null);
  if (!predictor.current) {
    const me = room.players.get(room.id);
    const sp = stageGeo.spawns.find((s) => s.index === me?.spawn) ?? stageGeo.spawns[0];
    predictor.current = new Predictor({ x: me?.x ?? sp.x, z: me?.z ?? sp.z, vx: 0, vz: 0 }, stageGeo.walls);
  }
  useEffect(() => {
    (window as unknown as { __cn: unknown }).__cn = {
      roomId: room.room,
      sessionId: room.id,
      players: () => { const out: unknown[] = []; room.players.forEach((p, id) => out.push({ id, name: p.name, x: p.x, z: p.z, status: p.status, finishTime: p.finishTime })); return out; },
      self: () => predictor.current?.state,
      shepherd: stageGeo.shepherd,
    };
  }, [room]);
  return (
    <Canvas camera={{ fov: 60, near: 0.1, far: 1200 }} gl={{ antialias: true, preserveDrawingBuffer: true }} dpr={[1, 2]}>
      <color attach="background" args={['#141a2b']} />
      <fog attach="fog" args={['#141a2b', 90, 420]} />
      <hemisphereLight args={['#9fb3ff', '#2a2420', 1.1]} />
      <directionalLight position={[-40, 80, 30]} intensity={1.3} color="#ffe2b8" />
      <StageModel />
      <Players room={room} predictor={predictor} />
      <LocalController room={room} predictor={predictor} />
    </Canvas>
  );
}

useGLTF.preload(STAGE_URL);
