import { Html } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { inputFromKeys, MOVEMENT, progress, SIM_DT } from '@cn-trials/shared';
import { Component, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import * as THREE from 'three';
import { CONTESTANT_ROSTER, colorwayIndex } from '@cn-trials/shared';
// Legacy: the 30 procedural characters (kept until the owner confirms the shared contestant; ?characters=legacy).
import { buildContestantGeometry, contestantMaterial as legacyMaterial } from './characters.ts';
import { ContestantInstance, assignLods, contestantCpu, enableShadowLayer, contestantAsset, contestantStatus, loadContestant, setColorway, type ContestantAsset } from './contestant.ts';
import type { PlayerView, TrialRoom } from '../net.ts';
import { hud } from './hudStore.ts';
import { AdaptiveQuality, quality } from './quality.ts';
import { attachInput, input } from './input.ts';
import { Predictor } from './predictor.ts';
import { STAGE_SCENES } from '../stages/registry.ts';
import { stageDef, stageGeo, stageObstacles } from './stage.ts';
import { greenTime, obstacleWalls, type Rect } from '@cn-trials/shared';
import { scheduleFor, signalView } from './roundClock.ts';


/** Collision walls for prediction: the same set the server uses (stage walls + obstacle twist in a round). */
export function wallsFor(room: TrialRoom): Rect[] {
  if (!room.round.obstacles || room.round.phase === 'lobby' || !stageObstacles) return stageGeo.walls;
  const elapsed = room.round.phase === 'active' ? signalView(room).elapsed : 0;
  return [...stageGeo.walls, ...obstacleWalls(stageObstacles, greenTime(scheduleFor(room.round.seed), elapsed))];
}

/** `?characters=legacy` draws the previous 30 procedural characters (comparison and rollback only). */
export const LEGACY_CHARACTERS = typeof location !== 'undefined' && new URLSearchParams(location.search).get('characters') === 'legacy';
/** Legacy geometry per colourway slot (CW01 -> the old CHR_01, ...), built once per slot. */
const legacyGeos = new Map<number, THREE.BufferGeometry>();
function legacyGeometry(colorway: string | undefined): THREE.BufferGeometry {
  const i = colorwayIndex(colorway);
  let g = legacyGeos.get(i);
  if (!g) { g = buildContestantGeometry(CONTESTANT_ROSTER[i]); legacyGeos.set(i, g); }
  return g;
}

/** Live contestant instances by player id (test hooks and stats), and their camera distance this frame. */
export const contestantInstances = new Map<string, ContestantInstance>();
const lodDist = new Map<string, number>();
const cpuAcc = { ms: 0 };

function useContestantAsset(): ContestantAsset | null {
  const [asset, setAsset] = useState(contestantAsset());
  useEffect(() => {
    if (asset || LEGACY_CHARACTERS) return;
    let live = true;
    loadContestant().then((a) => { if (live) setAsset(a); }).catch(() => { /* status says error; the name tag still shows */ });
    return () => { live = false; };
  }, [asset]);
  return asset;
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
  const { camera } = useThree();
  const [status, setStatus] = useState(room.players.get(id)?.status ?? 'active');
  const p0 = room.players.get(id);
  const [colorway, setColorwayState] = useState(p0?.colorway);
  const asset = useContestantAsset();
  // Shared contestant: one clone per player (geometry and textures shared), created once the asset is loaded.
  const inst = useMemo(() => (asset && !LEGACY_CHARACTERS ? new ContestantInstance(asset, colorway ?? 'CW01') : null), [asset]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!inst) return;
    contestantInstances.set(id, inst);
    return () => { contestantInstances.delete(id); lodDist.delete(id); inst.dispose(); };
  }, [inst, id]);
  useEffect(() => { if (inst && colorway) setColorway(inst.material, colorway); }, [inst, colorway]);
  const legacyGeo = useMemo(() => (LEGACY_CHARACTERS ? legacyGeometry(colorway) : null), [colorway]);
  const legacyMat = useMemo(() => (LEGACY_CHARACTERS ? legacyMaterial() : null), []);
  useEffect(() => () => legacyMat?.dispose(), [legacyMat]);
  const anim = useRef({ phase: 0, swing: 0, speed: 0, lastX: p0?.x ?? 0, lastZ: p0?.z ?? 0, fall: 0, t: 0, emoteAt: Date.now() });
  const tmp = useMemo(() => new THREE.Vector3(), []);
  useFrame((_, dt) => {
    const g = group.current;
    const p = room.players.get(id);
    if (!g || !p) return;
    if (p.status !== status) setStatus(p.status);
    if (p.colorway !== colorway) setColorwayState(p.colorway);
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
    const a = anim.current;
    const step = Math.min(dt, 0.1);
    a.t += step;
    const moved = Math.hypot(g.position.x - a.lastX, g.position.z - a.lastZ);
    a.lastX = g.position.x; a.lastZ = g.position.z;
    a.speed += ((step > 0 ? Math.min(8, moved / step) : 0) - a.speed) * (1 - Math.exp(-step * 10));
    a.fall += ((spotted ? 1 : 0) - a.fall) * (1 - Math.exp(-step * 6));
    const tint = 1 - a.fall * 0.5; // spotted contestants grey out (playful, no harm: spec §7)
    if (inst) {
      // lobby emotes broadcast by the server (visual only)
      for (const e of room.emotes) if (e.id === id && e.at > a.emoteAt) { a.emoteAt = e.at; inst.emote(e.e); }
      const t0 = performance.now();
      inst.update(step, { speed: a.speed, status: p.status, greenActive: room.round.phase === 'active' && room.round.signal === 'green' });
      cpuAcc.ms += performance.now() - t0;
      lodDist.set(id, camera.position.distanceTo(g.getWorldPosition(tmp)));
      inst.material.color.setRGB(tint, tint, tint);
      return;
    }
    if (!legacyMat || !body.current) return;
    // Legacy procedural characters: GPU limb swing, bob, sway and a comic topple.
    const walking = !spotted && a.speed > 0.2;
    a.phase += step * (walking ? 4 + a.speed * 1.6 : 1.2);
    a.swing += ((walking ? Math.min(1, a.speed / 3.5) * 0.75 : 0.04) - a.swing) * (1 - Math.exp(-step * 8));
    legacyMat.userData.uniforms.uPhase.value = a.phase;
    legacyMat.userData.uniforms.uSwing.value = a.swing;
    const finished = p.status === 'finished';
    body.current.rotation.x = a.fall * 1.25;
    body.current.position.y = (walking ? Math.abs(Math.sin(a.phase)) * 0.035 * a.swing / 0.75 : 0) + (finished ? Math.abs(Math.sin(a.t * 5)) * 0.12 : 0) + a.fall * 0.08;
    body.current.rotation.z = walking ? Math.sin(a.phase) * 0.04 : Math.sin(a.t * 1.3) * 0.015;
    legacyMat.color.setRGB(tint, tint, tint);
  });
  const waiting = status === 'waiting';
  return (
    <group ref={group} position={[p0?.x ?? 0, 0, p0?.z ?? 0]} visible={!waiting || !local} name={`PLAYER_${id}`}>
      {inst && <primitive object={inst.root} />}
      {legacyGeo && legacyMat && <mesh ref={body} geometry={legacyGeo} material={legacyMat} castShadow name={`CHR_LEGACY_${colorway ?? 'unknown'}`} />}
      {(!local || status === 'spotted') && (
        <Html position={[0, 1.65, 0]} center distanceFactor={9} zIndexRange={[10, 0]}>
          <div className={`nametag ${status}`}>{status === 'spotted' ? 'SPOTTED!' : p0?.name}</div>
        </Html>
      )}
    </group>
  );
}

/** Contestant statistics for tests (window.__cn.contestants()). */
function contestantStats(scene: THREE.Object3D) {
  const geos = new Map<string, THREE.BufferGeometry>(), mats = new Set<string>(), tex = new Set<string>(), skels = new Set<string>();
  const lod = [0, 0, 0];
  let meshes = 0;
  scene.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || !(/^CNT_Contestant_LOD|^CHR_LEGACY_/.test(m.name))) return;
    meshes++;
    geos.set(m.geometry.uuid, m.geometry);
    if ((m as THREE.SkinnedMesh).isSkinnedMesh) skels.add((m as THREE.SkinnedMesh).skeleton.uuid);
    const mat = m.material as THREE.MeshStandardMaterial;
    mats.add(mat.uuid);
    if (mat.normalMap) tex.add(mat.normalMap.uuid);
    const det = mat.userData?.uniforms?.uDetail?.value as THREE.Texture | undefined;
    if (det) tex.add(det.uuid);
  });
  for (const i of contestantInstances.values()) lod[i.lod]++;
  return {
    system: LEGACY_CHARACTERS ? 'legacy' : 'shared',
    ready: LEGACY_CHARACTERS || contestantStatus.state === 'ready',
    state: contestantStatus.state, error: contestantStatus.error, loadMs: contestantStatus.loadMs, clips: contestantStatus.clips,
    instances: LEGACY_CHARACTERS ? meshes : contestantInstances.size,
    meshes, uniqueGeometries: geos.size, skeletons: skels.size,
    geometryBytes: [...geos.values()].reduce((n, g) => n + Object.values(g.attributes).reduce((k, a) => k + ((a as THREE.BufferAttribute).array?.byteLength ?? 0), 0) + (g.index?.array.byteLength ?? 0), 0),
    animationCpuMsPerFrame: +contestantCpu.msPerFrame.toFixed(3), uniqueMaterials: mats.size, uniqueTextures: tex.size, lod,
    colorways: [...contestantInstances.values()].map((i) => i.material.userData.colorway as string),
  };
}

function ContestantHooks({ room }: { room: TrialRoom }) {
  const { scene, gl, camera } = useThree();
  // one LOD decision per frame for everyone (budgeted), after each contestant measured its distance
  const shadowCheck = useRef(0);
  useFrame(() => {
    if (++shadowCheck.current % 60 === 1) enableShadowLayer(scene); // lights can change with the quality tier
    contestantCpu.msPerFrame += (cpuAcc.ms - contestantCpu.msPerFrame) * 0.05;
    cpuAcc.ms = 0;
    const items: { inst: ContestantInstance; dist: number }[] = [];
    for (const [id, inst] of contestantInstances) items.push({ inst, dist: id === room.id ? 0 : lodDist.get(id) ?? 99 });
    assignLods(items, quality.tier);
  });
  useEffect(() => {
    const w = window as unknown as Record<string, unknown>;
    w.__cnContestants = () => contestantStats(scene);
    // Test / preview hook: play any clip of the library on a player (presentation only).
    w.__cnPlayClip = (playerId: string, clip: string) => { contestantInstances.get(playerId)?.play(clip); return contestantInstances.get(playerId)?.currentShot ?? null; };
    // Test hook: render one frame and read it back in the same task (independent of page compositing).
    w.__cnSnapshot = (type = 'image/jpeg') => { gl.render(scene, camera); return gl.domElement.toDataURL(type, 0.9); };
    return () => { delete w.__cnContestants; delete w.__cnPlayClip; delete w.__cnSnapshot; };
  }, [scene, room, gl, camera]);
  return null;
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
    if (input.emote) {
      // lobby emotes (or a finished player celebrating): visual only, the server rebroadcasts them to everyone
      if (phase === 'lobby' || me.status === 'finished') room.send({ t: 'emote', e: input.emote });
      input.emote = null;
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
const renderInfo = { calls: 0, triangles: 0, programs: 0, textures: 0, geometries: 0, dpr: 1 };
function RenderInfo() {
  useFrame(({ gl }) => {
    renderInfo.calls = gl.info.render.calls;
    renderInfo.triangles = gl.info.render.triangles;
    renderInfo.programs = gl.info.programs?.length ?? 0;
    renderInfo.textures = gl.info.memory.textures;
    renderInfo.geometries = gl.info.memory.geometries;
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
      players: () => [...room.players.values()].map((p) => ({ id: p.id, name: p.name, x: p.x, z: p.z, status: p.status, finishTime: p.finishTime, colorway: p.colorway })),
      contestants: () => (window as unknown as { __cnContestants?: () => unknown }).__cnContestants?.() ?? null,
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
      <ContestantHooks room={room} />
      <LocalController room={room} predictor={predictor} />
    </Canvas>
  );
}

for (const m of Object.values(STAGE_SCENES)) m.preload();
