import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { inputFromKeys, MOVEMENT, progress, SIM_DT } from '@cn-trials/shared';
import { Component, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import * as THREE from 'three';
import { GroundFx, groundFx, groundFxStatus, nearestWet } from './groundFx.ts';
import { ContestantInstance, assignLods, contestantCpu, enableShadowLayer, contestantAsset, contestantStatus, loadContestant, setColorway, type ContestantAsset } from './contestant.ts';
import type { PlayerView, TrialRoom } from '../net.ts';
import { hud } from './hudStore.ts';
import { AdaptiveQuality, quality } from './quality.ts';
import { attachInput, input } from './input.ts';
import { Predictor } from './predictor.ts';
import { sfx } from './audio.ts';
import { PerfProbe, perfEnabled } from './PerfOverlay.tsx';
import { STAGE_SCENES } from '../stages/registry.ts';
import { activeStage } from './stage.ts';
import { STAGE02, greenTime, obstacleWalls, type Rect } from '@cn-trials/shared';
import { scheduleFor, signalView } from './roundClock.ts';


/** Collision walls for prediction: the same set the server uses (stage walls + obstacle twist in a round). */
export function wallsFor(room: TrialRoom): Rect[] {
  const { geo, obstacles, def } = activeStage(room);
  // Stage 02: the hunter gates are walls until the server opens them (end of the head start).
  if (def.hunt) return room.round.phase !== 'lobby' && !room.round.hunt?.released ? [...geo.walls, ...def.hunt.layout.gates] : geo.walls;
  if (!room.round.obstacles || !obstacles) return geo.walls;
  const elapsed = room.round.phase === 'active' ? signalView(room).elapsed : 0; // lobby: the gate at rest
  return [...geo.walls, ...obstacleWalls(obstacles, greenTime(scheduleFor(room.round.seed), elapsed))];
}

/** Live contestant instances by player id (test hooks and stats), and their camera distance this frame. */
export const contestantInstances = new Map<string, ContestantInstance>();
/** Seconds a spotted player watches their own fall before the camera spectates others (decision 037). */
export const SPOTTED_HOLD_S = 3;

const lodDist = new Map<string, number>();
const cpuAcc = { ms: 0 };

function useContestantAsset(): ContestantAsset | null {
  const [asset, setAsset] = useState(contestantAsset());
  useEffect(() => {
    if (asset) return;
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
  if (me.down > 0) return false; // knocked down by a collision (server-authoritative): no control until back up
  if (room.round.phase === 'lobby') return true;
  if (room.round.paused) return false; // the host paused the room
  if (room.hunt && (room.hunt.captured || room.hunt.hide)) return false; // Stage 02: caught, or inside a hiding place
  return room.round.phase === 'active' && (me.status === 'active' || me.status === 'finished');
}

function Contestant({ id, room, local, predictor }: { id: string; room: TrialRoom; local: boolean; predictor?: React.RefObject<Predictor | null> }) {
  const group = useRef<THREE.Group>(null);
  const marker = useRef<THREE.Group>(null);
  const { camera } = useThree();
  const [status, setStatus] = useState(room.players.get(id)?.status ?? 'active');
  const p0 = room.players.get(id);
  const [colorway, setColorwayState] = useState(p0?.colorway);
  const asset = useContestantAsset();
  // Shared contestant: one clone per player (geometry and textures shared), created once the asset is loaded.
  const inst = useMemo(() => (asset ? new ContestantInstance(asset, colorway ?? 'CW01') : null), [asset]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!inst) return;
    contestantInstances.set(id, inst);
    return () => { contestantInstances.delete(id); lodDist.delete(id); inst.dispose(); };
  }, [inst, id]);
  useEffect(() => { if (inst && colorway) setColorway(inst.material, colorway); }, [inst, colorway]);
  const anim = useRef({ speed: 0, vx: 0, vz: 0, face: p0?.yaw ?? 0, lastX: p0?.x ?? 0, lastZ: p0?.z ?? 0, fall: 0, emoteAt: Date.now(), stepDist: 0, side: 1, audioDist: 0, turn: 0, animDt: 0, animN: 0, animStatus: p0?.status ?? 'active' });
  const tmp = useMemo(() => new THREE.Vector3(), []);
  useFrame((_, dt) => {
    const g = group.current;
    const p = room.players.get(id);
    if (!g || !p) return;
    if (p.status !== status) setStatus(p.status);
    if (p.colorway !== colorway) setColorwayState(p.colorway);
    const spotted = p.status === 'spotted' || p.status === 'captured';
    // Stage 02 snapshots leave out players you cannot see (walls, hiding places): their model is hidden too.
    g.visible = (p.seen || local) && !(status === 'waiting' && local) && !(local && room.hunt?.hide);
    const hunter = !!room.round.hunt?.hunters.includes(id);
    if (marker.current) marker.current.visible = hunter && room.round.phase !== 'lobby' && p.status !== 'captured';
    // Crouch (Stage 02): a lower stance, presentation only (the local player shows their own key at once).
    const crouching = room.round.hunt && p.status === 'active' && (local ? input.crouch : false);
    if (inst) inst.root.scale.y += ((crouching ? 0.8 : 1) - inst.root.scale.y) * Math.min(1, dt * 12);
    if (local && predictor?.current && canMove(room)) {
      // Interpolated between fixed steps (LocalController runs first each frame), so no stair-stepping.
      const r = predictor.current.render;
      g.position.set(r.x, 0, r.z);
    } else {
      // Remote players (and a frozen local player): snapshots arrive at 20 Hz. Optimisation pass (25 Nov 2026):
      // drawn from an interpolation buffer 0.1 s behind the server (room.sample), so they move at their real speed
      // without the stutter of extrapolate-and-correct. A light smoothing pass removes any remaining step.
      const sm = room.sample(id);
      const tx = sm ? sm.x : p.x, tz = sm ? sm.z : p.z;
      if (Math.hypot(tx - g.position.x, tz - g.position.z) > 6) g.position.set(tx, 0, tz); // respawn: cut
      const k = 1 - Math.exp(-dt * 30);
      g.position.x += (tx - g.position.x) * k;
      g.position.z += (tz - g.position.z) * k;
    }
    const a = anim.current;
    const step = Math.min(dt, 0.1);
    const dx = g.position.x - a.lastX, dz = g.position.z - a.lastZ;
    a.lastX = g.position.x; a.lastZ = g.position.z;
    const ks = 1 - Math.exp(-step * 10);
    a.vx += ((step > 0 ? dx / step : 0) - a.vx) * ks;
    a.vz += ((step > 0 ? dz / step : 0) - a.vz) * ks;
    a.speed = Math.min(8, Math.hypot(a.vx, a.vz));
    // Owner feedback (decision 031): contestants turn to face where they move, all the way round (360°),
    // instead of always facing the camera. Facing is presentation only; the server owns positions.
    const faceBefore = a.face;
    if (a.speed > 0.35 && !spotted) {
      const target = Math.atan2(-a.vx, -a.vz); // yaw 0 faces -Z
      let d = target - a.face;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      a.face += d * (1 - Math.exp(-step * 12));
    }
    a.turn += ((step > 0 ? (a.face - faceBefore) / step : 0) - a.turn) * (1 - Math.exp(-step * 10));
    g.rotation.y = a.face;
    a.stepDist += Math.hypot(dx, dz);
    // Your own footsteps (sound, decision 034 B): one soft scuff per stride while you walk.
    if (local && inst && !inst.airborne && a.speed > 0.8 && p.status === 'active') {
      a.audioDist += Math.hypot(dx, dz);
      if (a.audioDist > 0.62) { a.audioDist = 0; sfx.footstep(); }
    }
    a.fall += ((spotted ? 1 : 0) - a.fall) * (1 - Math.exp(-step * 6));
    const tint = 1 - a.fall * 0.5; // spotted contestants grey out (playful, no harm: spec §7)
    if (inst) {
      // lobby emotes broadcast by the server (visual only)
      for (const e of room.emotes) if (e.id === id && e.at > a.emoteAt) { a.emoteAt = e.at; inst.emote(e.e); }
      // Optimisation pass (25 Nov 2026): far crowd members (lowest LOD) animate every 2nd frame, very far ones every
      // 3rd, with the skipped time added in, so they keep their pace; near ones and you update every frame.
      const prevDist = lodDist.get(id) ?? 0;
      const every = local || inst.lod < 2 ? 1 : prevDist > 45 ? 3 : 2;
      a.animDt += step;
      if (++a.animN % every === 0 || p.status !== a.animStatus) {
        const t0 = performance.now();
        inst.update(a.animDt, { speed: a.speed, status: p.status === 'captured' ? 'spotted' : p.status, greenActive: room.round.phase === 'active' && room.round.signal === 'green', down: p.down, turn: a.turn });
        cpuAcc.ms += performance.now() - t0;
        a.animDt = 0;
        a.animStatus = p.status;
      }
      const dist = camera.position.distanceTo(g.getWorldPosition(tmp));
      lodDist.set(id, dist);
      // Ground effects (decision 031): dust on dry concrete, splashes in puddles.
      const fx = groundFx.current;
      if (fx) {
        const fwdX = -Math.sin(a.face), fwdZ = -Math.cos(a.face);
        const dirX = a.speed > 0.2 ? a.vx / a.speed : 0, dirZ = a.speed > 0.2 ? a.vz / a.speed : 0;
        for (const ev of inst.events) {
          const ahead = ev === 'dive' ? 0.55 : 0;
          fx.emit(ev, g.position.x + fwdX * ahead, g.position.z + fwdZ * ahead, dirX, dirZ);
        }
        // footsteps: one puff per stride, near the camera only (Low: only your own contestant)
        const stride = a.speed > 2.2 ? 0.46 : 0.32;
        if (a.stepDist > stride) {
          a.stepDist = 0;
          if (a.speed > 0.5 && !spotted && !inst.airborne && (quality.tier === 'low' ? local : dist < 30)) {
            a.side = -a.side;
            fx.emit('step', g.position.x + Math.cos(a.face) * 0.08 * a.side, g.position.z - Math.sin(a.face) * 0.08 * a.side, dirX, dirZ);
          }
        }
      }
      inst.events.length = 0;
      inst.material.color.setRGB(tint, tint, tint);
      return;
    }
  });
  return (
    <group ref={group} position={[p0?.x ?? 0, 0, p0?.z ?? 0]} name={`PLAYER_${id}`}>
      {inst && <primitive object={inst.root} />}
      {/* Stage 02 hunter marker and Pulse Detector blockout (one shared model; no new character). */}
      <group ref={marker} visible={false} name="S02_HUNTER_MARKER">
        <mesh position={[0, 1.95, 0]} rotation={[Math.PI, 0, 0]}><coneGeometry args={[0.12, 0.22, 4]} /><meshBasicMaterial color="#e2332b" /></mesh>
        <mesh position={[0.32, 0.72, -0.12]} name="S02_PULSE_DETECTOR"><boxGeometry args={[0.1, 0.06, 0.3]} /><meshStandardMaterial color="#2b2f33" metalness={0.6} roughness={0.5} emissive="#ff7a1a" emissiveIntensity={0.25} /></mesh>
      </group>
    </group>
  );
}


/**
 * Name tags for every contestant in ONE overlay (optimisation pass, 25 Nov 2026). Before, each contestant had its
 * own drei <Html>, which projected, measured and restyled 30 DOM nodes every frame. Here one pass projects them,
 * hides the ones behind the camera, too far to read (over 45 m) or not visible to us, and touches the DOM only
 * when a value changes. Same look: the tag scales with distance like Html's distanceFactor 9 did.
 */
const TAG_MAX_DIST = 45;
function NameTags({ room }: { room: TrialRoom }) {
  const { gl, camera, size } = useThree();
  const layer = useMemo(() => {
    const d = document.createElement('div');
    d.className = 'nametags';
    d.style.cssText = 'position:absolute;inset:0;pointer-events:none;overflow:hidden;z-index:1';
    return d;
  }, []);
  const tags = useRef(new Map<string, { el: HTMLDivElement; text: string; cls: string; shown: boolean; tf: string }>());
  useEffect(() => {
    const parent = gl.domElement.parentElement;
    parent?.appendChild(layer);
    return () => { layer.remove(); tags.current.clear(); };
  }, [gl, layer]);
  const v = useMemo(() => new THREE.Vector3(), []);
  useFrame(() => {
    const cam = camera as THREE.PerspectiveCamera;
    const k = 9 / (2 * Math.tan((cam.fov * Math.PI) / 360));
    const seenIds = new Set<string>();
    for (const [id, p] of room.players) {
      const out = p.status === 'spotted' || p.status === 'captured';
      if (id === room.id && !out) continue;
      seenIds.add(id);
      let t = tags.current.get(id);
      if (!t) {
        const el = document.createElement('div');
        el.style.cssText = 'position:absolute;left:0;top:0;will-change:transform';
        layer.appendChild(el);
        t = { el, text: '', cls: '', shown: true, tf: '' };
        tags.current.set(id, t);
      }
      const obj = contestantInstances.get(id)?.root.parent ?? null; // the PLAYER_<id> group (drawn position)
      const x = obj ? obj.position.x : p.x, z = obj ? obj.position.z : p.z;
      v.set(x, 1.65, z);
      const dist = v.distanceTo(cam.position);
      v.project(cam);
      const show = (p.seen !== false || id === room.id) && v.z < 1 && dist < TAG_MAX_DIST && Math.abs(v.x) < 1.2 && Math.abs(v.y) < 1.2;
      if (show !== t.shown) { t.el.style.display = show ? '' : 'none'; t.shown = show; }
      if (!show) continue;
      const text = p.status === 'spotted' ? 'SPOTTED!' : p.status === 'captured' ? 'CAUGHT' : p.name;
      const cls = `nametag ${out ? 'spotted' : p.status}`;
      if (text !== t.text) { t.el.textContent = text; t.text = text; }
      if (cls !== t.cls) { t.el.className = cls; t.cls = cls; }
      const sx = ((v.x + 1) / 2) * size.width, sy = ((1 - v.y) / 2) * size.height;
      const sc = Math.min(2, k / Math.max(dist, 0.5));
      const tf = `translate3d(${sx.toFixed(1)}px,${sy.toFixed(1)}px,0) translate(-50%,-50%) scale(${sc.toFixed(3)})`;
      if (tf !== t.tf) { t.el.style.transform = tf; t.tf = tf; }
      t.el.style.zIndex = String(Math.round(1000 - dist * 10));
    }
    for (const [id, t] of tags.current) if (!seenIds.has(id)) { t.el.remove(); tags.current.delete(id); }
  });
  return null;
}

/** Contestant statistics for tests (window.__cn.contestants()). */
function contestantStats(scene: THREE.Object3D) {
  const geos = new Map<string, THREE.BufferGeometry>(), mats = new Set<string>(), tex = new Set<string>(), skels = new Set<string>();
  const lod = [0, 0, 0];
  let meshes = 0;
  scene.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || !/^CNT_Contestant_LOD/.test(m.name)) return;
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
    system: 'shared',
    ready: contestantStatus.state === 'ready',
    state: contestantStatus.state, error: contestantStatus.error, loadMs: contestantStatus.loadMs, clips: contestantStatus.clips,
    instances: contestantInstances.size,
    meshes, uniqueGeometries: geos.size, skeletons: skels.size,
    geometryBytes: [...geos.values()].reduce((n, g) => n + Object.values(g.attributes).reduce((k, a) => k + ((a as THREE.BufferAttribute).array?.byteLength ?? 0), 0) + (g.index?.array.byteLength ?? 0), 0),
    animationCpuMsPerFrame: +contestantCpu.msPerFrame.toFixed(3), uniqueMaterials: mats.size, uniqueTextures: tex.size, lod,
    colorways: [...contestantInstances.values()].map((i) => i.material.userData.colorway as string),
  };
}

/** Owns the scene's ground effects (dust and splashes): one particle draw call and one ripple draw call. */
function GroundFxLayer() {
  const { scene, size, camera } = useThree();
  const fx = useMemo(() => new GroundFx(), []);
  useEffect(() => {
    scene.add(fx.points, fx.rings);
    groundFx.current = fx;
    return () => { scene.remove(fx.points, fx.rings); fx.dispose(); if (groundFx.current === fx) groundFx.current = null; };
  }, [scene, fx]);
  useFrame((_, dt) => {
    fx.density = 0; // owner (25 Nov 2026): no particles; puddle ripples only
    fx.setViewport(size.height, (camera as THREE.PerspectiveCamera).fov ?? 60);
    fx.update(Math.min(dt, 0.1));
  });
  return null;
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
    w.__cnGroundFx = () => ({ ...groundFxStatus });
    w.__cnNearestWet = (x: number, z: number) => nearestWet(x, z);
    // Test / preview hook: emit a ground effect and advance it, so a capture can show it mid-air.
    w.__cnEmitGround = (kind: 'step' | 'skid' | 'land' | 'dive' | 'flop', x: number, z: number, advance = 0.15) => {
      const fx = groundFx.current;
      if (!fx) return null;
      fx.emit(kind, x, z);
      fx.update(advance);
      return { ...groundFxStatus };
    };
    w.__cnFacing = (playerId: string) => scene.getObjectByName(`PLAYER_${playerId}`)?.rotation.y ?? null;
    // Test / preview hook: play any clip of the library on a player (presentation only).
    w.__cnPlayClip = (playerId: string, clip: string) => { contestantInstances.get(playerId)?.play(clip); return contestantInstances.get(playerId)?.currentShot ?? null; };
    // Test hook: render one frame and read it back in the same task (independent of page compositing).
    w.__cnSnapshot = (type = 'image/jpeg') => { gl.render(scene, camera); return gl.domElement.toDataURL(type, 0.9); };
    // Test hook for performance measurements (tests and profiling scripts only).
    w.__cnThree = { scene, gl, camera, THREE };
    return () => { delete w.__cnContestants; delete w.__cnGroundFx; delete w.__cnFacing; delete w.__cnNearestWet; delete w.__cnEmitGround; delete w.__cnPlayClip; delete w.__cnSnapshot; delete w.__cnThree; };
  }, [scene, room, gl, camera]);
  return null;
}

function LocalController({ room, predictor }: { room: TrialRoom; predictor: React.RefObject<Predictor | null> }) {
  const { camera, gl } = useThree();
  const acc = useRef(0);
  const camPos = useRef(new THREE.Vector3());
  /** Smoothed point the camera rig hangs from; position and look target both derive from it. */
  const anchor = useRef<THREE.Vector3 | null>(null);
  const firstMove = useRef<number | null>(null);
  const clock = useRef(0);
  const watch = useRef(0);
  /** Local clock time when we were spotted, for the death cam (decision 037), or null. */
  const spottedAt = useRef<number | null>(null);
  const capHeld = useRef(false);

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
        const sp = activeStage(room).geo.spawns.find((s) => s.index === me.spawn)!;
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
    // Stage 02 actions (the server validates every one): Q pulse, E hide (hider) or hold to capture (hunter).
    const hp = room.hunt;
    if (hp && phase === 'active') {
      if (input.pulse && hp.role === 'hunter') room.pulse();
      if (input.interactPressed && hp.role === 'hider') room.hide();
      const holding = hp.role === 'hunter' && input.interact;
      if (holding !== capHeld.current) { capHeld.current = holding; room.capture(holding); }
    } else if (capHeld.current) { capHeld.current = false; room.capture(false); }
    input.pulse = false; input.interactPressed = false;
    pr.reconcile(me);
    if (!mobile) pr.reset({ x: me.x, z: me.z, vx: 0, vz: 0 }); // frozen: the server position is the truth
    // Fixed 30 Hz steps, matching the server simulation. Locked phases still send (zero) inputs so acks flow.
    acc.current += dt;
    while (acc.current >= SIM_DT) {
      acc.current -= SIM_DT;
      const mv = mobile ? inputFromKeys(input.forward, input.right, input.yaw) : { mx: 0, mz: 0 };
      if (phase === 'lobby' && firstMove.current === null && (mv.mx || mv.mz)) firstMove.current = clock.current;
      const seq = pr.apply(mv);
      const k = room.hunt ? (input.crouch ? 1 : 0) | (input.sprint ? 2 : 0) : 0;
      room.send({ t: 'input', seq, mx: mv.mx, mz: mv.mz, yaw: input.yaw, ...(k ? { k } : {}) });
    }
    const rp = pr.updateRender(acc.current / SIM_DT, dt);
    // Follow ourselves, or spectate an active player once spotted or while waiting (spec §7).
    let fx = me.x, fz = me.z;
    // Spotted (decision 037): first watch your own fall for SPOTTED_HOLD_S, then spectate other players.
    const out = me.status === 'spotted' || me.status === 'captured';
    if (out) { if (spottedAt.current === null) spottedAt.current = clock.current; } else spottedAt.current = null;
    const deathCam = spottedAt.current !== null ? Math.min(1, (clock.current - spottedAt.current) / SPOTTED_HOLD_S) : -1;
    if (mobile || me.status === 'finished') {
      fx = rp.x; fz = rp.z;
    } else if (deathCam >= 0 && deathCam < 1) {
      fx = me.x; fz = me.z;
      hud.spectating = '';
    } else if (out || me.status === 'waiting') {
      const active = [...room.players.values()].filter((p) => p.status === 'active' && p.seen);
      if (active.length) {
        const t = active[watch.current % active.length];
        fx = t.x; fz = t.z;
        hud.spectating = t.name;
      } else hud.spectating = '';
    }
    // Hidden (Stage 02): look out from the hiding place's front.
    if (room.hunt?.hide) {
      const spot = activeStage(room).def.hunt?.layout.hideSpots.find((x) => x.id === room.hunt!.hide);
      if (spot) { fx = spot.fx; fz = spot.fz; }
    }
    // Camera rig: smooth one anchor point, then place the camera and its look target rigidly from it.
    // (Before, the position was smoothed but the look target was not, so every sideways step swung the view.)
    if (!anchor.current) anchor.current = new THREE.Vector3(fx, 0, fz);
    const an = anchor.current;
    if (Math.hypot(fx - an.x, fz - an.z) > 8) an.set(fx, 0, fz); // spectator switch or respawn: cut
    else { const k = 1 - Math.exp(-dt * 14); an.x += (fx - an.x) * k; an.z += (fz - an.z) * k; }
    const fwx = -Math.sin(input.yaw), fwz = -Math.cos(input.yaw);
    if (deathCam >= 0 && deathCam < 1) {
      // Death cam: ease up and back while turning to look down at the body on the ground.
      const e = 1 - Math.pow(1 - Math.min(1, deathCam * 2.2), 3);
      const back = 5.5 + 1.5 * e, up = 2.2 + 1.6 * e, side = 1.8 * e;
      camPos.current.set(an.x - fwx * back + fwz * side, up, an.z - fwz * back - fwx * side);
      camera.position.copy(camPos.current);
      camera.lookAt(an.x + fwx * 4 * (1 - e), 1.4 - 1.1 * e, an.z + fwz * 4 * (1 - e));
    } else {
      const dist = 5.5;
      camPos.current.set(an.x - fwx * dist * Math.cos(input.pitch), 2.2 - Math.sin(input.pitch) * dist, an.z - fwz * dist * Math.cos(input.pitch));
      camera.position.copy(camPos.current);
      camera.lookAt(an.x + fwx * 4, 1.4 + Math.sin(input.pitch) * 4, an.z + fwz * 4);
    }
    // Test hook for fixed review viewpoints (tests/e2e/views.mjs); never set by the game itself.
    const view = (window as unknown as { __cnView?: { pos: [number, number, number]; look: [number, number, number] } }).__cnView;
    if (view) { camera.position.set(...view.pos); camera.lookAt(...view.look); }

    const s = pr.state;
    const geo = activeStage(room).geo;
    hud.progress = progress(geo, mobile ? s.z : me.z);
    hud.distance = Math.max(0, (mobile ? s.z : me.z) - geo.finishZ);
    hud.down = me.down;
    hud.status = me.status;
    hud.finishTime = me.finishTime;
    hud.walkTime = phase === 'lobby'
      ? (me.status === 'finished' ? me.finishTime : firstMove.current === null ? 0 : clock.current - firstMove.current)
      : 0;
  }, -1); // before the contestants, so they draw this frame's interpolated position
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

/** Re-renders when the server moves the room to another stage (09 A2: the scene module follows round.stage). */
function useStageId(room: TrialRoom): string {
  const [id, setId] = useState(room.round.stage || room.stage);
  useEffect(() => {
    const t = setInterval(() => { const now = room.round.stage || room.stage; setId((old) => (old === now ? old : now)); }, 200);
    return () => clearInterval(t);
  }, [room]);
  return id;
}

/** Stage 02 movement speed for prediction: the server's sprint timer, or crouch while C is held. */
function speedFor(room: TrialRoom): number {
  const h = room.hunt;
  if (!h || room.round.phase !== 'active') return 1;
  if (h.sprintLeft > 0) return STAGE02.sprint.speed;
  return input.crouch ? STAGE02.crouch.speed : 1;
}

export function Scene({ room, onStageError }: { room: TrialRoom; onStageError: (msg: string) => void }) {
  const predictor = useRef<Predictor | null>(null);
  useStageId(room);
  const stage = activeStage(room);
  const stageModule = STAGE_SCENES[stage.def.id] ?? Object.values(STAGE_SCENES)[0];
  if (!predictor.current) {
    const me = room.self;
    const sp = stage.geo.spawns.find((s) => s.index === me?.spawn) ?? stage.geo.spawns[0];
    predictor.current = new Predictor({ x: me?.x ?? sp.x, z: me?.z ?? sp.z, vx: 0, vz: 0 }, () => wallsFor(room), () => speedFor(room));
  }
  useEffect(() => {
    (window as unknown as { __cn: unknown }).__cn = {
      roomId: room.room,
      sessionId: room.id,
      stage: stage.def.id,
      players: () => [...room.players.values()].map((p) => ({ id: p.id, name: p.name, x: p.x, z: p.z, status: p.status, finishTime: p.finishTime, colorway: p.colorway, bot: p.bot, down: p.down, seen: p.seen })),
      hunt: () => (room.hunt ? JSON.parse(JSON.stringify(room.hunt)) : null),
      contestants: () => (window as unknown as { __cnContestants?: () => unknown }).__cnContestants?.() ?? null,
      self: () => predictor.current?.state,
      round: () => ({ ...room.round }),
      results: () => room.results,
      resultsMeta: () => room.resultsMeta,
      events: () => room.events.map((e) => ({ ...e })),
      watcher: stage.geo.watcher,
      spawns: stage.geo.spawns,
      standings: () => room.standings,
      match: () => ({ ...room.round.match }),
      assets: () => JSON.parse(JSON.stringify(stageModule.assets)),
      quality: () => JSON.parse(JSON.stringify(quality)),
      renderInfo: () => ({ ...renderInfo }),
    };
  }, [room, stageModule, stage]);
  const StageScene = stageModule.Scene;
  return (
    // Shadow maps stay enabled; whether anything casts a shadow is up to the tier (only High's moon does).
    <Canvas camera={{ fov: 60, near: 0.1, far: 1500 }} gl={{ antialias: true, powerPreference: 'high-performance' }} dpr={quality.dpr}
      shadows={{ type: THREE.PCFShadowMap }}>
      <AdaptiveQuality />
      <RenderInfo />
      <StageErrorBoundary onError={onStageError}>
        <Suspense fallback={null}>
          <StageScene key={stage.def.id} room={room} />
        </Suspense>
      </StageErrorBoundary>
      <Players room={room} predictor={predictor} />
      <NameTags room={room} />
      <ContestantHooks room={room} />
      <GroundFxLayer />
      <LocalController room={room} predictor={predictor} />
      {perfEnabled && <PerfProbe room={room} />}
    </Canvas>
  );
}

for (const m of Object.values(STAGE_SCENES)) m.preload();
