// Stage 02 · AGAWAN BASE scene module: a greybox (blockout) of the tri-base street block, drawn from the same layout
// the server simulates (packages/shared/src/agawan/layout.ts), so what you see is exactly what collides. Team
// colours come from TEAMS.colors. The Philippine Christmas street dressing (parols, string lights, facades) replaces
// these boxes in the next step (PR D); gameplay stays the same.
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { AGAWAN, TEAMS, TEAM_SLOTS, getStage, type AgawanWall, type AgawanWallKind } from '@cn-trials/shared';
import type { TrialRoom } from '../../net.ts';

const def = getStage(AGAWAN.id);
const layout = def.agawan!.layout;

/** Load status for tests and the HUD's loading screen (a greybox has nothing to download). */
export const agawanAssets = {
  environment: 'ready' as const,
  watcher: 'ready' as const,
  problems: [] as string[],
  walls: layout.walls.length,
  drawCalls: 0,
};

const COLOR: Record<AgawanWallKind, string> = {
  shell: '#3d3a44', house: '#8a7a6c', fence: '#c9c3b2', barrier: '#a9a59c', crate: '#9a7348', jeepney: '#c4473a', tricycle: '#3b7d5c',
  kiosk: '#d1a24a', cart: '#8a5a3a', planter: '#4f7a45', bench: '#7a5a3f', stall: '#b85f3e',
};

/** One instanced mesh per wall kind: about a dozen draw calls for the whole block. */
function Walls() {
  const meshes = useMemo(() => {
    const byKind = new Map<AgawanWallKind, AgawanWall[]>();
    for (const w of layout.walls) { if (!byKind.has(w.kind)) byKind.set(w.kind, []); byKind.get(w.kind)!.push(w); }
    const box = new THREE.BoxGeometry(1, 1, 1);
    const out: THREE.InstancedMesh[] = [];
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), pos = new THREE.Vector3(), scl = new THREE.Vector3();
    for (const [kind, list] of byKind) {
      const mat = new THREE.MeshStandardMaterial({ color: COLOR[kind], roughness: 0.85, metalness: kind === 'jeepney' || kind === 'tricycle' ? 0.35 : 0.05, transparent: kind === 'fence', opacity: kind === 'fence' ? 0.55 : 1 });
      const mesh = new THREE.InstancedMesh(box, mat, list.length);
      mesh.name = `S02A_BLOCKOUT_${kind.toUpperCase()}`;
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

/** Street, plaza, base pads and pen floors in team colours. */
function Ground() {
  return (
    <group name="S02A_GROUND">
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]}><planeGeometry args={[140, 120]} /><meshStandardMaterial color="#2b2a30" roughness={1} /></mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}><planeGeometry args={[96, 80]} /><meshStandardMaterial color="#55535a" roughness={0.95} /></mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.005, 0]} name="S02A_PLAZA"><circleGeometry args={[8, 40]} /><meshStandardMaterial color="#6d6a62" roughness={0.9} /></mesh>
      {TEAM_SLOTS.map((s) => {
        const b = layout.bases[s], pen = layout.pens[s].area;
        return (
          <group key={s}>
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[(b.area.minX + b.area.maxX) / 2, 0.006, (b.area.minZ + b.area.maxZ) / 2]} name={`S02A_BASE_PAD_${s}`}>
              <planeGeometry args={[b.area.maxX - b.area.minX, b.area.maxZ - b.area.minZ]} />
              <meshStandardMaterial color={TEAMS.colors[s]} transparent opacity={0.18} roughness={0.9} />
            </mesh>
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[b.x, 0.008, b.z]} name={`S02A_RAID_ZONE_${s}`}>
              <ringGeometry args={[AGAWAN.raid.radiusM - 0.15, AGAWAN.raid.radiusM, 48]} />
              <meshBasicMaterial color={TEAMS.colors[s]} transparent opacity={0.7} />
            </mesh>
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[(pen.minX + pen.maxX) / 2, 0.007, (pen.minZ + pen.maxZ) / 2]} name={`S02A_PEN_FLOOR_${s}`}>
              <planeGeometry args={[pen.maxX - pen.minX, pen.maxZ - pen.minZ]} />
              <meshStandardMaterial color={TEAMS.colors[s]} transparent opacity={0.3} roughness={0.9} />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}

/** Base markers: a team-colour post and banner; it dims while your team's raid cooldown on that base runs. */
function Markers({ room }: { room: TrialRoom }) {
  const banners = useRef<Record<string, THREE.MeshStandardMaterial | null>>({});
  useFrame(() => {
    const ag = room.round.agawan, mine = room.agawan?.team;
    for (const s of TEAM_SLOTS) {
      const m = banners.current[s];
      if (!m) continue;
      const cooling = !!(mine && ag?.raidCd[mine + s]);
      m.emissiveIntensity = cooling ? 0.05 : 0.6;
    }
  });
  return (
    <group name="S02A_BASE_MARKERS">
      {TEAM_SLOTS.map((s) => {
        const b = layout.bases[s];
        return (
          <group key={s} position={[b.x, 0, b.z]}>
            <mesh position={[0, 1.6, 0]}><cylinderGeometry args={[0.09, 0.09, 3.2, 8]} /><meshStandardMaterial color="#d8d2c2" /></mesh>
            <mesh position={[0.55, 2.7, 0]}>
              <boxGeometry args={[1.0, 0.7, 0.05]} />
              <meshStandardMaterial ref={(m) => { banners.current[s] = m; }} color={TEAMS.colors[s]} emissive={TEAMS.colors[s]} emissiveIntensity={0.6} />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}

function Sky() {
  const { scene, gl } = useThree();
  useEffect(() => {
    const prevFog = scene.fog, prevBg = scene.background, prevExp = gl.toneMappingExposure;
    scene.fog = new THREE.Fog('#1b1830', 45, 130);
    scene.background = new THREE.Color('#15132a');
    gl.toneMappingExposure = 1.2;
    const hemi = new THREE.HemisphereLight('#c9c0ff', '#3b3329', 2.6);
    const key = new THREE.DirectionalLight('#ffd9a0', 1.4);
    key.position.set(-30, 50, -20);
    hemi.name = 'LGT_STG02A_Ambient'; key.name = 'LGT_STG02A_Key';
    scene.add(hemi, key);
    return () => { scene.fog = prevFog; scene.background = prevBg; gl.toneMappingExposure = prevExp; scene.remove(hemi, key); hemi.dispose(); key.dispose(); };
  }, [scene, gl]);
  useFrame(({ gl: r }) => { agawanAssets.drawCalls = r.info.render.calls; });
  return null;
}

export function AgawanScene({ room }: { room: TrialRoom }) {
  return (
    <group name="STG02_AGAWAN_BASE">
      <Sky />
      <Ground />
      <Walls />
      <Markers room={room} />
      <mesh position={[layout.deco[0].x, 2.5, layout.deco[0].z]} name="S02A_PLAZA_TREE"><coneGeometry args={[1.6, 5, 10]} /><meshStandardMaterial color="#2f6b3a" /></mesh>
    </group>
  );
}

export function preloadAgawan() { /* greybox: nothing to download */ }
