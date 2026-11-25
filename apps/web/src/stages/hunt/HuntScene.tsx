// Stage 03 · THE HUNT scene module: a greybox (blockout) of the industrial facility, drawn from the same layout the
// server simulates (packages/shared/src/hunt/layout.ts), so what you see is exactly what collides. Art direction
// from the design pack (02_STAGE_03_THE_HUNT): charcoal and cold steel blue, restrained red warning lamps, small
// amber practicals, haze but no opaque fog on routes. Final art replaces these boxes later; gameplay stays.
// Presentation only: the gates open when the server's public state says the head start is over.
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { getStage, HUNT, type HuntWall, type WallKind } from '@cn-trials/shared';
import type { TrialRoom } from '../../net.ts';
import { useQuality } from '../../game/quality.ts';

const def = getStage(HUNT.id);
const layout = def.hunt!.layout;

/** Load status for tests and the HUD's loading screen (a greybox has nothing to download). */
export const huntAssets = {
  environment: 'ready' as const,
  watcher: 'ready' as const,
  problems: [] as string[],
  walls: layout.walls.length,
  hideSpots: layout.hideSpots.length,
  lights: 0,
  drawCalls: 0,
};

const COLOR: Record<WallKind, string> = {
  shell: '#56616b', partition: '#6c7882', rail: '#d9b232', glass: '#8fb0c6', rack: '#6f7f8c', crate: '#9a7348', container: '#9a4232',
  locker: '#6f8799', tarp: '#8a865c', machine: '#5f7262', console: '#4c555c', barrel: '#a8542f', pallet: '#957a4f', pipe: '#808b94', gate: '#b0281f',
};
const LAMP: Record<'cold' | 'amber' | 'red', string> = { cold: '#9fc2ff', amber: '#ffb35c', red: '#ff3b2f' };

/** One instanced mesh per wall kind: about 15 draw calls for the whole facility. */
function Walls() {
  const meshes = useMemo(() => {
    const byKind = new Map<WallKind, HuntWall[]>();
    for (const w of layout.walls) { if (!byKind.has(w.kind)) byKind.set(w.kind, []); byKind.get(w.kind)!.push(w); }
    const box = new THREE.BoxGeometry(1, 1, 1);
    const out: THREE.InstancedMesh[] = [];
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), pos = new THREE.Vector3(), scl = new THREE.Vector3();
    for (const [kind, list] of byKind) {
      const see = kind === 'glass';
      const mat = new THREE.MeshStandardMaterial({
        color: COLOR[kind], roughness: kind === 'glass' ? 0.1 : 0.85, metalness: ['rack', 'container', 'locker', 'rail', 'pipe', 'machine'].includes(kind) ? 0.45 : 0.05,
        transparent: see, opacity: see ? 0.28 : 1, depthWrite: !see,
      });
      const mesh = new THREE.InstancedMesh(box, mat, list.length);
      mesh.name = `S02_BLOCKOUT_${kind.toUpperCase()}`;
      list.forEach((w, i) => {
        pos.set((w.minX + w.maxX) / 2, w.h / 2, (w.minZ + w.maxZ) / 2);
        scl.set(w.maxX - w.minX, w.h, w.maxZ - w.minZ);
        mesh.setMatrixAt(i, m.compose(pos, q, scl));
      });
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
      out.push(mesh);
    }
    return out;
  }, []);
  useEffect(() => () => { for (const m of meshes) (m.material as THREE.Material).dispose(); meshes[0]?.geometry.dispose(); }, [meshes]);
  return <>{meshes.map((m) => <primitive key={m.name} object={m} />)}</>;
}

/** Instanced helper: one draw call for many copies of a box or plane (optimisation pass, 25 Nov 2026). */
function useInstanced(make: () => THREE.InstancedMesh, deps: unknown[]) {
  const mesh = useMemo(make, deps); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { mesh.geometry.dispose(); (mesh.material as THREE.Material).dispose(); mesh.dispose(); }, [mesh]);
  return mesh;
}

/** Yellow floor marks in front of every hiding place, in one draw call. */
function HideMarks() {
  const mesh = useInstanced(() => {
    const m = new THREE.InstancedMesh(new THREE.PlaneGeometry(1.1, 1.1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#b8901f', transparent: true, opacity: 0.22, depthWrite: false }), layout.hideSpots.length);
    const mat = new THREE.Matrix4();
    layout.hideSpots.forEach((s, i) => m.setMatrixAt(i, mat.makeTranslation(s.fx, 0.01, s.fz)));
    m.name = 'S02_HIDE_MARKS';
    m.computeBoundingSphere();
    return m;
  }, []);
  return <primitive object={mesh} />;
}

/** Lamp fittings (emissive boxes), one draw call per lamp colour. */
function LampFittings() {
  const meshes = useMemo(() => (['cold', 'amber', 'red'] as const).map((c) => {
    const list = layout.lamps.filter((l) => l.color === c);
    const geo = new THREE.BoxGeometry(c === 'red' ? 0.3 : 1.2, 0.12, 0.3);
    const m = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color: LAMP[c], toneMapped: false }), Math.max(1, list.length));
    const mat = new THREE.Matrix4();
    list.forEach((l, i) => m.setMatrixAt(i, mat.makeTranslation(l.x, l.y, l.z)));
    m.count = list.length;
    m.name = `S02_LAMP_FITTINGS_${c.toUpperCase()}`;
    m.computeBoundingSphere();
    return m;
  }), []);
  useEffect(() => () => { for (const m of meshes) { m.geometry.dispose(); (m.material as THREE.Material).dispose(); m.dispose(); } }, [meshes]);
  return <>{meshes.map((m) => <primitive key={m.name} object={m} />)}</>;
}

/** Floor per room (slightly different concrete tones), hazard stripes at doors are left to final art. */
function Floors() {
  const tone: Record<string, string> = { A: '#4a5056', B: '#4d5154', C: '#474d53', D: '#4b5055', E: '#434a50', F: '#504f4b', G: '#40454a', H: '#555a5e', R: '#553a38' };
  return (
    <group name="S02_FLOORS">
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[6, -0.02, 0]}><planeGeometry args={[150, 110]} /><meshStandardMaterial color="#2a2e32" roughness={1} /></mesh>
      {layout.rooms.map((r) => (
        <mesh key={r.id} rotation={[-Math.PI / 2, 0, 0]} position={[(r.minX + r.maxX) / 2, 0, (r.minZ + r.maxZ) / 2]} name={`S02_FLOOR_${r.id}`}>
          <planeGeometry args={[r.maxX - r.minX, r.maxZ - r.minZ]} />
          <meshStandardMaterial color={tone[r.id] ?? '#222'} roughness={0.75} metalness={0.1} />
        </mesh>
      ))}
      {/* Hiding places: a worn yellow floor marking in front of each one (shows where, never whether it is occupied). */}
      <HideMarks />
    </group>
  );
}

/** The two hunter gates: closed (walls on the server) during the head start, then they lift. */
function Gates({ room }: { room: TrialRoom }) {
  const refs = useRef<THREE.Mesh[]>([]);
  useFrame((_, dt) => {
    const open = room.round.phase === 'lobby' || !!room.round.hunt?.released;
    for (const m of refs.current) if (m) { const target = open ? 3.6 : 1.6; m.position.y += (target - m.position.y) * Math.min(1, dt * 3); }
  });
  return (
    <group name="S02_GATES">
      {layout.gates.map((g, i) => (
        <mesh key={g.id} ref={(m) => { if (m) refs.current[i] = m; }} position={[(g.minX + g.maxX) / 2, 1.6, (g.minZ + g.maxZ) / 2]}>
          <boxGeometry args={[g.maxX - g.minX, 3.2, g.maxZ - g.minZ]} />
          <meshStandardMaterial color={COLOR.gate} emissive="#5a0d0a" emissiveIntensity={0.5} metalness={0.5} roughness={0.6} />
        </mesh>
      ))}
    </group>
  );
}

/**
 * Lamps: emissive fittings everywhere; a fixed pool of real point lights that follows the camera onto the nearest
 * lamps (optimisation pass, 25 Nov 2026). Every lit pixel pays for every light, so a pool of 8 near lights looks
 * the same as 12 fixed ones across the facility at a fraction of the cost. The light count never changes during
 * play, so no shader recompiles.
 */
export const LAMP_POOL: Record<'low' | 'medium' | 'high', number> = { low: 0, medium: 5, high: 8 };
function Lamps() {
  const quality = useQuality();
  const { scene, camera } = useThree();
  const budget = LAMP_POOL[quality];
  const refs = useRef<(THREE.PointLight | null)[]>([]);
  const assigned = useRef<number[]>([]);
  useEffect(() => {
    huntAssets.lights = budget;
    assigned.current = [];
    const hemi = new THREE.HemisphereLight('#9fb6d0', '#3a3f44', quality === 'low' ? 3.2 : 2.4);
    hemi.name = 'LGT_STG02_Ambient';
    scene.add(hemi);
    return () => { scene.remove(hemi); hemi.dispose(); };
  }, [scene, quality, budget]);
  const tick = useRef(0);
  useFrame(() => {
    if (!budget || ++tick.current % 6 !== 1) return; // ten times a second is plenty for walking speed
    const c = camera.position;
    const score = (i: number) => { const l = layout.lamps[i]; return Math.hypot(l.x - c.x, l.z - c.z) / (0.6 + l.intensity) - (assigned.current.includes(i) ? 2 : 0); };
    const want = layout.lamps.map((_, i) => i).sort((a, b) => score(a) - score(b)).slice(0, budget);
    if (want.every((i) => assigned.current.includes(i)) && want.length === assigned.current.length) return;
    const lights = refs.current.filter(Boolean) as THREE.PointLight[];
    const free = lights.filter((l) => !want.includes(l.userData.lamp));
    for (const i of want) {
      if (lights.some((l) => l.userData.lamp === i)) continue;
      const l = free.shift(); if (!l) break;
      const lp = layout.lamps[i];
      l.userData.lamp = i;
      l.position.set(lp.x, lp.y - 0.3, lp.z);
      l.color.set(LAMP[lp.color]);
      l.intensity = lp.intensity * (lp.color === 'cold' ? 140 : 80);
      l.distance = lp.color === 'cold' ? 28 : 16;
    }
    assigned.current = want;
  });
  return (
    <group name="S02_LAMPS">
      <LampFittings />
      {Array.from({ length: budget }, (_, i) => <pointLight key={`l${quality}${i}`} ref={(r) => { refs.current[i] = r; }} intensity={0} decay={1.4} />)}
    </group>
  );
}

/** Dark blue haze: readable at room scale, thick enough that far rooms fall off (design pack: no opaque fog on routes). */
function Haze() {
  const { scene, gl } = useThree();
  useEffect(() => {
    const prevFog = scene.fog, prevBg = scene.background, prevExp = gl.toneMappingExposure;
    scene.fog = new THREE.FogExp2('#141b24', 0.016);
    scene.background = new THREE.Color('#0d1117');
    gl.toneMappingExposure = 1.25;
    return () => { scene.fog = prevFog; scene.background = prevBg; gl.toneMappingExposure = prevExp; };
  }, [scene, gl]);
  useFrame(({ gl: r }) => { huntAssets.drawCalls = r.info.render.calls; });
  return null;
}

export function HuntScene({ room }: { room: TrialRoom }) {
  return (
    <group name="STG02_THE_HUNT">
      <Haze />
      <Lamps />
      <Floors />
      <Walls />
      <Gates room={room} />
    </group>
  );
}

export function preloadHunt() { /* greybox: nothing to download */ }
