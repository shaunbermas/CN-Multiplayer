import { Html, useGLTF } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { inputFromKeys, MOVEMENT, progress, SIM_DT } from '@cn-trials/shared';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import type { PlayerView, TrialRoom } from '../net.ts';
import { hud } from './hudStore.ts';
import { attachInput, input } from './input.ts';
import { Predictor } from './predictor.ts';
import { signalView } from './roundClock.ts';
import { STAGE_URL, stageGeo } from './stage.ts';

const CAPSULE_LENGTH = MOVEMENT.capsuleHeight - 2 * MOVEMENT.capsuleRadius;
const capsuleGeo = new THREE.CapsuleGeometry(MOVEMENT.capsuleRadius, CAPSULE_LENGTH, 6, 12);
capsuleGeo.translate(0, MOVEMENT.capsuleHeight / 2, 0);
const noseGeo = new THREE.BoxGeometry(0.16, 0.12, 0.2);
noseGeo.translate(0, 0.85, -0.3);
const spottedMat = new THREE.MeshStandardMaterial({ color: '#8a8f99', roughness: 0.9, transparent: true, opacity: 0.55 });

const LANTERN = { none: '#ffcf8a', green: '#4ade80', warning: '#fbbf24', red: '#ef4444' } as const;

function colorFor(spawn: number) {
  return new THREE.Color().setHSL(((spawn * 0.137) % 1), 0.65, 0.55);
}

/** Movement is allowed in the lobby (practice) and for active or finished players during the round. */
export function canMove(room: TrialRoom): boolean {
  const me = room.self;
  if (!me) return false;
  if (room.round.phase === 'lobby') return true;
  return room.round.phase === 'active' && (me.status === 'active' || me.status === 'finished');
}

/**
 * The stage GLB plus The Shepherd's signal animation (spec §6): turned away on GREEN, turning to face
 * the players during WARNING, facing and scanning ±55° on RED. Lantern colour follows the signal.
 */
function StageModel({ room }: { room: TrialRoom }) {
  const gltf = useGLTF(STAGE_URL);
  const rig = useMemo(() => {
    const scene = gltf.scene;
    const find = (n: string) => scene.getObjectByName(n);
    const body = find('ENM_Shepherd_Placeholder_Body');
    if (!body) return null;
    const sh = stageGeo.shepherd!;
    const pivot = new THREE.Group();
    pivot.name = 'ShepherdPivot';
    pivot.position.set(sh.x, sh.y, sh.z);
    scene.add(pivot);
    const headPivot = new THREE.Group();
    headPivot.name = 'ShepherdHeadPivot';
    headPivot.position.set(0, sh.headY - sh.y, 0); // pivot has no rotation yet, so local = world offset
    pivot.add(headPivot);
    scene.updateMatrixWorld(true);
    for (const n of ['ENM_Shepherd_Placeholder_Body', 'ENM_Shepherd_Placeholder_Lantern', 'ENM_Shepherd_Placeholder_Crook']) {
      const o = find(n);
      if (o) pivot.attach(o);
    }
    for (const n of ['ENM_Shepherd_Placeholder_Head', 'ENM_Shepherd_Placeholder_Face']) {
      const o = find(n);
      if (o) headPivot.attach(o);
    }
    let lanternMat: THREE.MeshStandardMaterial | null = null;
    const lantern = find('ENM_Shepherd_Placeholder_Lantern') as THREE.Mesh | undefined;
    if (lantern?.material) {
      lanternMat = (lantern.material as THREE.MeshStandardMaterial).clone();
      lantern.material = lanternMat;
    }
    return { pivot, headPivot, lanternMat, yaw: 0 };
  }, [gltf]);

  useFrame((_, dt) => {
    if (!rig) return;
    const v = signalView(room);
    // Yaw 0 = facing the players (+Z); PI = turned away toward the backdrop.
    let target = 0;
    let head = 0;
    if (v.signal === 'green') target = Math.PI;
    else if (v.signal === 'warning') target = Math.PI * (1 - v.progress); // turns to face exactly as RED starts
    else if (v.signal === 'red') head = Math.sin(v.into * Math.PI / 2) * THREE.MathUtils.degToRad(55);
    const k = v.signal === 'warning' ? 1 : 1 - Math.exp(-dt * 6);
    rig.yaw += (target - rig.yaw) * k;
    rig.pivot.rotation.y = rig.yaw;
    rig.headPivot.rotation.y += (head - rig.headPivot.rotation.y) * (1 - Math.exp(-dt * 10));
    if (rig.lanternMat) {
      const c = new THREE.Color(LANTERN[v.signal]);
      rig.lanternMat.color.copy(c);
      rig.lanternMat.emissive.copy(c);
      rig.lanternMat.emissiveIntensity = v.signal === 'red' ? 6 : v.signal === 'none' ? 1.5 : 4;
    }
  });
  return <primitive object={gltf.scene} />;
}

function Contestant({ id, room, local, predictor }: { id: string; room: TrialRoom; local: boolean; predictor?: React.RefObject<Predictor | null> }) {
  const group = useRef<THREE.Group>(null);
  const body = useRef<THREE.Mesh>(null);
  const nose = useRef<THREE.Mesh>(null);
  const [status, setStatus] = useState(room.players.get(id)?.status ?? 'active');
  const p0 = room.players.get(id);
  const material = useMemo(() => new THREE.MeshStandardMaterial({ color: colorFor(p0?.spawn ?? 1), roughness: 0.6 }), [p0?.spawn]);
  useFrame((_, dt) => {
    const g = group.current;
    const p = room.players.get(id);
    if (!g || !p) return;
    if (p.status !== status) setStatus(p.status);
    const spotted = p.status === 'spotted';
    if (local && predictor?.current && canMove(room)) {
      const s = predictor.current.state;
      g.position.set(s.x, 0, s.z);
      g.rotation.y = input.yaw;
    } else {
      // Remote players (and a frozen local player): smooth toward the latest server position (20 Hz).
      const k = 1 - Math.exp(-dt * 15);
      g.position.x += (p.x - g.position.x) * k;
      g.position.z += (p.z - g.position.z) * k;
      if (!local) g.rotation.y = p.yaw;
    }
    // Spotted: a comic slump (tilt) instead of any harm (spec §7).
    const tilt = spotted ? 0.5 : 0;
    g.rotation.z += (tilt - g.rotation.z) * (1 - Math.exp(-dt * 8));
    const m = spotted ? spottedMat : material;
    if (body.current && body.current.material !== m) body.current.material = m;
    if (nose.current && nose.current.material !== m) nose.current.material = m;
  });
  const waiting = status === 'waiting';
  return (
    <group ref={group} position={[p0?.x ?? 0, 0, p0?.z ?? 0]} visible={!waiting || !local}>
      <mesh ref={body} geometry={capsuleGeo} material={material} />
      <mesh ref={nose} geometry={noseGeo} material={material} />
      {(!local || status === 'spotted') && (
        <Html position={[0, 1.65, 0]} center distanceFactor={14} zIndexRange={[10, 0]}>
          <div className={`nametag ${status}`}>{status === 'spotted' ? 'SPOTTED!' : p0?.name}</div>
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
  const watch = useRef(0);

  useEffect(() => attachInput(gl.domElement), [gl]);

  useFrame((_, dtRaw) => {
    const pr = predictor.current;
    const me = room.self;
    if (!pr || !me) return;
    // Count real time down to 1 fps, so a slow computer still sends 30 inputs per second and walks at
    // full speed. Longer pauses, such as a hidden tab, are dropped rather than replayed as a burst.
    const dt = Math.min(dtRaw, 1.0);
    clock.current += dt;
    const phase = room.round.phase;
    const mobile = canMove(room);
    if (input.respawn) {
      input.respawn = false;
      if (phase === 'lobby') {
        room.send({ t: 'respawn' });
        const sp = stageGeo.spawns.find((s) => s.index === me.spawn)!;
        pr.reset({ x: sp.x, z: sp.z, vx: 0, vz: 0 });
        firstMove.current = null;
      }
    }
    if (input.skip) {
      input.skip = false;
      if (phase === 'briefing') room.skipBriefing();
    }
    if (input.cycle) { input.cycle = false; watch.current++; }
    pr.reconcile(me);
    if (!mobile) pr.reset({ x: me.x, z: me.z, vx: 0, vz: 0 }); // frozen: the server position is the truth
    // Fixed 30 Hz steps, matching the server simulation. Locked phases still send (zero) inputs so acks flow.
    acc.current += dt;
    while (acc.current >= SIM_DT) {
      acc.current -= SIM_DT;
      const mv = mobile ? inputFromKeys(input.forward, input.right, input.yaw) : { mx: 0, mz: 0 };
      if (phase === 'lobby' && firstMove.current === null && (mv.mx || mv.mz)) firstMove.current = clock.current;
      const seq = pr.apply(mv);
      room.send({ t: 'input', seq, mx: mv.mx, mz: mv.mz, yaw: input.yaw });
    }
    // Follow ourselves, or spectate an active player once spotted or while waiting (spec §7).
    let fx = me.x, fz = me.z;
    if (mobile || me.status === 'finished') {
      fx = pr.state.x; fz = pr.state.z;
    } else if (me.status === 'spotted' || me.status === 'waiting') {
      const active = [...room.players.values()].filter((p) => p.status === 'active');
      if (active.length) {
        const t = active[watch.current % active.length];
        fx = t.x; fz = t.z;
      }
    }
    const fwx = -Math.sin(input.yaw), fwz = -Math.cos(input.yaw);
    const dist = 5.5;
    const target = new THREE.Vector3(fx - fwx * dist * Math.cos(input.pitch), 2.2 - Math.sin(input.pitch) * dist, fz - fwz * dist * Math.cos(input.pitch));
    camPos.current.lerp(target, 1 - Math.exp(-dt * 12));
    if (camPos.current.lengthSq() === 0) camPos.current.copy(target);
    camera.position.copy(camPos.current);
    camera.lookAt(fx + fwx * 4, 1.4 + Math.sin(input.pitch) * 4, fz + fwz * 4);

    const s = pr.state;
    hud.progress = progress(stageGeo, mobile ? s.z : me.z);
    hud.distance = Math.max(0, (mobile ? s.z : me.z) - stageGeo.finishZ);
    hud.status = me.status;
    hud.finishTime = me.finishTime;
    hud.walkTime = phase === 'lobby'
      ? (me.status === 'finished' ? me.finishTime : firstMove.current === null ? 0 : clock.current - firstMove.current)
      : 0;
  });
  return null;
}

function Players({ room, predictor }: { room: TrialRoom; predictor: React.RefObject<Predictor | null> }) {
  const ids = useRef<string[]>([]);
  const [, force] = useState(0);
  useFrame(() => {
    const now: string[] = [];
    room.players.forEach((_p: PlayerView, id: string) => { now.push(id); });
    hud.players = now.length;
    if (now.join() !== ids.current.join()) { ids.current = now; force((n) => n + 1); }
  });
  return <>{ids.current.map((id) => <Contestant key={id} id={id} room={room} local={id === room.id} predictor={predictor} />)}</>;
}

export function Scene({ room }: { room: TrialRoom }) {
  const predictor = useRef<Predictor | null>(null);
  if (!predictor.current) {
    const me = room.self;
    const sp = stageGeo.spawns.find((s) => s.index === me?.spawn) ?? stageGeo.spawns[0];
    predictor.current = new Predictor({ x: me?.x ?? sp.x, z: me?.z ?? sp.z, vx: 0, vz: 0 }, stageGeo.walls);
  }
  useEffect(() => {
    (window as unknown as { __cn: unknown }).__cn = {
      roomId: room.room,
      sessionId: room.id,
      players: () => [...room.players.values()].map((p) => ({ id: p.id, name: p.name, x: p.x, z: p.z, status: p.status, finishTime: p.finishTime })),
      self: () => predictor.current?.state,
      round: () => ({ ...room.round }),
      results: () => room.results,
      shepherd: stageGeo.shepherd,
    };
  }, [room]);
  return (
    <Canvas camera={{ fov: 60, near: 0.1, far: 1200 }} gl={{ antialias: true, preserveDrawingBuffer: true }} dpr={[1, 2]}>
      <color attach="background" args={['#141a2b']} />
      <fog attach="fog" args={['#141a2b', 90, 420]} />
      <hemisphereLight args={['#9fb3ff', '#2a2420', 1.1]} />
      <directionalLight position={[-40, 80, 30]} intensity={1.3} color="#ffe2b8" />
      <StageModel room={room} />
      <Players room={room} predictor={predictor} />
      <LocalController room={room} predictor={predictor} />
    </Canvas>
  );
}

useGLTF.preload(STAGE_URL);
