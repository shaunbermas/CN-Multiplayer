// Stage 02 · THE HUNT scene module: a greybox (blockout) of the industrial facility, drawn from the same layout the
// server simulates (packages/shared/src/stage02/layout.ts), so what you see is exactly what collides. Art direction
// from the design pack (02_STAGE_02_THE_HUNT): charcoal and cold steel blue, restrained red warning lamps, small
// amber practicals, haze but no opaque fog on routes. Final art replaces these boxes later; gameplay stays.
// Presentation only: the gates open when the server's public state says the head start is over.
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { getStage, STAGE02, type HuntWall, type WallKind } from '@cn-trials/shared';
import type { TrialRoom } from '../../net.ts';
import { useQuality } from '../../game/quality.ts';

const def = getStage(STAGE02.id);
const layout = def.hunt!.layout;

/** Load status for tests and the HUD's loading screen (a greybox has nothing to download). */
export const stage02Assets = {
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
      {layout.hideSpots.map((s) => (
        <mesh key={s.id} rotation={[-Math.PI / 2, 0, 0]} position={[s.fx, 0.01, s.fz]}><planeGeometry args={[1.1, 1.1]} /><meshBasicMaterial color="#b8901f" transparent opacity={0.22} /></mesh>
      ))}
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

/** Lamps: emissive fittings everywhere; real point lights for the strongest few (by quality tier). */
function Lamps() {
  const quality = useQuality();
  const { scene } = useThree();
  const budget = quality === 'high' ? 14 : quality === 'medium' ? 8 : 0;
  const lit = useMemo(() => [...layout.lamps].sort((a, b) => b.intensity - a.intensity).slice(0, budget), [budget]);
  useEffect(() => {
    stage02Assets.lights = lit.length;
    const hemi = new THREE.HemisphereLight('#9fb6d0', '#3a3f44', quality === 'low' ? 3.2 : 2.4);
    hemi.name = 'LGT_STG02_Ambient';
    scene.add(hemi);
    return () => { scene.remove(hemi); hemi.dispose(); };
  }, [scene, quality, lit.length]);
  return (
    <group name="S02_LAMPS">
      {layout.lamps.map((l, i) => (
        <mesh key={`f${i}`} position={[l.x, l.y, l.z]}><boxGeometry args={[l.color === 'red' ? 0.3 : 1.2, 0.12, 0.3]} /><meshBasicMaterial color={LAMP[l.color]} toneMapped={false} /></mesh>
      ))}
      {lit.map((l, i) => <pointLight key={`l${i}`} position={[l.x, l.y - 0.3, l.z]} color={LAMP[l.color]} intensity={l.intensity * (l.color === 'cold' ? 140 : 80)} distance={l.color === 'cold' ? 28 : 16} decay={1.4} />)}
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
  useFrame(({ gl: r }) => { stage02Assets.drawCalls = r.info.render.calls; });
  return null;
}

export function Stage02Scene({ room }: { room: TrialRoom }) {
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

export function preloadStage02() { /* greybox: nothing to download */ }
