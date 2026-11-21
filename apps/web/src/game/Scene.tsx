import { Html } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { inputFromKeys, MOVEMENT, progress, SIM_DT } from '@cn-trials/shared';
import { Component, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { PlayerView, TrialRoom } from '../net.ts';
import { hud } from './hudStore.ts';
import { AdaptiveQuality, quality } from './quality.ts';
import { attachInput, input } from './input.ts';
import { Predictor } from './predictor.ts';
import { STAGE_SCENES } from '../stages/registry.ts';
import { stageDef, stageGeo, stageObstacles } from './stage.ts';
import { greenTime, obstacleWalls, type Rect } from '@cn-trials/shared';
import { scheduleFor, signalView } from './roundClock.ts';

const CAPSULE_LENGTH = MOVEMENT.capsuleHeight - 2 * MOVEMENT.capsuleRadius;
const capsuleGeo = new THREE.CapsuleGeometry(MOVEMENT.capsuleRadius, CAPSULE_LENGTH, 6, 12);
capsuleGeo.translate(0, MOVEMENT.capsuleHeight / 2, 0);
const noseGeo = new THREE.BoxGeometry(0.16, 0.12, 0.2).toNonIndexed();
noseGeo.translate(0, 0.85, -0.3);
// Stage 1.5 (Prompt 08): body and facing nose merged into one mesh: one draw call per contestant (and one in
// the shadow pass) instead of two, which saves 60 calls with 30 players on High.
const contestantGeo = mergeGeometries([capsuleGeo.toNonIndexed(), noseGeo])!;
const spottedMat = new THREE.MeshStandardMaterial({ color: '#8a8f99', roughness: 0.9, transparent: true, opacity: 0.55 });

/** Collision walls for prediction: the same set the server uses (stage walls + obstacle twist in a round). */
export function wallsFor(room: TrialRoom): Rect[] {
  if (!room.round.obstacles || room.round.phase === 'lobby' || !stageObstacles) return stageGeo.walls;
  const elapsed = room.round.phase === 'active' ? signalView(room).elapsed : 0;
  return [...stageGeo.walls, ...obstacleWalls(stageObstacles, greenTime(scheduleFor(room.round.seed), elapsed))];
}

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

function Contestant({ id, room, local, predictor }: { id: string; room: TrialRoom; local: boolean; predictor?: React.RefObject<Predictor | null> }) {
  const group = useRef<THREE.Group>(null);
  const body = useRef<THREE.Mesh>(null);
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
  });
  const waiting = status === 'waiting';
  return (
    <group ref={group} position={[p0?.x ?? 0, 0, p0?.z ?? 0]} visible={!waiting || !local}>
      <mesh ref={body} geometry={contestantGeo} material={material} castShadow />
      {(!local || status === 'spotted') && (
        <Html position={[0, 1.65, 0]} center distanceFactor={9} zIndexRange={[10, 0]}>
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
        hud.spectating = t.name;
      } else hud.spectating = '';
    }
    const fwx = -Math.sin(input.yaw), fwz = -Math.cos(input.yaw);
    const dist = 5.5;
    const target = new THREE.Vector3(fx - fwx * dist * Math.cos(input.pitch), 2.2 - Math.sin(input.pitch) * dist, fz - fwz * dist * Math.cos(input.pitch));
    camPos.current.lerp(target, 1 - Math.exp(-dt * 12));
    if (camPos.current.lengthSq() === 0) camPos.current.copy(target);
    camera.position.copy(camPos.current);
    camera.lookAt(fx + fwx * 4, 1.4 + Math.sin(input.pitch) * 4, fz + fwz * 4);
    // Test hook for fixed review viewpoints (tests/e2e/views.mjs); never set by the game itself.
    const view = (window as unknown as { __cnView?: { pos: [number, number, number]; look: [number, number, number] } }).__cnView;
    if (view) { camera.position.set(...view.pos); camera.lookAt(...view.look); }

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

/** Renderer statistics of the last frame, for tests (window.__cn.renderInfo). */
const renderInfo = { calls: 0, triangles: 0, programs: 0, textures: 0, dpr: 1 };
function RenderInfo() {
  useFrame(({ gl }) => {
    renderInfo.calls = gl.info.render.calls;
    renderInfo.triangles = gl.info.render.triangles;
    renderInfo.programs = gl.info.programs?.length ?? 0;
    renderInfo.textures = gl.info.memory.textures;
    renderInfo.dpr = gl.getPixelRatio();
  });
  return null;
}

/** Shows a readable error instead of a blank or fake stage when an asset fails to load (Prompt 07 contract). */
class StageErrorBoundary extends Component<{ children: ReactNode; onError: (msg: string) => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(e: unknown) { this.props.onError(e instanceof Error ? e.message : String(e)); }
  render() { return this.state.failed ? null : this.props.children; }
}

export function Scene({ room, onStageError }: { room: TrialRoom; onStageError: (msg: string) => void }) {
  const predictor = useRef<Predictor | null>(null);
  const stageModule = STAGE_SCENES[stageDef.id];
  if (!predictor.current) {
    const me = room.self;
    const sp = stageGeo.spawns.find((s) => s.index === me?.spawn) ?? stageGeo.spawns[0];
    predictor.current = new Predictor({ x: me?.x ?? sp.x, z: me?.z ?? sp.z, vx: 0, vz: 0 }, () => wallsFor(room));
  }
  useEffect(() => {
    (window as unknown as { __cn: unknown }).__cn = {
      roomId: room.room,
      sessionId: room.id,
      stage: stageDef.id,
      players: () => [...room.players.values()].map((p) => ({ id: p.id, name: p.name, x: p.x, z: p.z, status: p.status, finishTime: p.finishTime })),
      self: () => predictor.current?.state,
      round: () => ({ ...room.round }),
      results: () => room.results,
      resultsMeta: () => room.resultsMeta,
      events: () => room.events.map((e) => ({ ...e })),
      watcher: stageGeo.watcher,
      spawns: stageGeo.spawns,
      assets: () => JSON.parse(JSON.stringify(stageModule.assets)),
      quality: () => JSON.parse(JSON.stringify(quality)),
      renderInfo: () => ({ ...renderInfo }),
    };
  }, [room, stageModule]);
  const StageScene = stageModule.Scene;
  return (
    // Shadow maps stay enabled; whether anything casts a shadow is up to the tier (only High's moon does).
    <Canvas camera={{ fov: 60, near: 0.1, far: 1500 }} gl={{ antialias: true, powerPreference: 'high-performance' }} dpr={quality.dpr}
      shadows={{ type: THREE.PCFShadowMap }}>
      <AdaptiveQuality />
      <RenderInfo />
      <StageErrorBoundary onError={onStageError}>
        <Suspense fallback={null}>
          <StageScene room={room} />
        </Suspense>
      </StageErrorBoundary>
      <Players room={room} predictor={predictor} />
      <LocalController room={room} predictor={predictor} />
    </Canvas>
  );
}

for (const m of Object.values(STAGE_SCENES)) m.preload();
