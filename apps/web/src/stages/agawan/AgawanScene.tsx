// Stage 02 · AGAWAN BASE scene module: a Philippine Christmas street at night (handoff pack 05 and the three
// reference photos), built in code from the same layout the server simulates (packages/shared/src/agawan/layout.ts),
// so what you see is exactly what collides. Team colours come from the room (dealt per match, decision 047). See streetKit.ts for how the
// street is put together in a handful of draw calls.
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { AGAWAN, TEAM_SLOTS, getStage, type TeamSlot } from '@cn-trials/shared';
import type { TrialRoom } from '../../net.ts';
import { useQuality } from '../../game/quality.ts';
import { buildStreet, starGeometry, type StreetBuild } from './streetKit.ts';
import { colorOf, useTeamColors, type TeamColors } from '../../game/teamColors.ts';
import art from '../../../../../blender/exports/stage02/STAGE_02_ART.json';
import cloudsUrl from '../../../../../blender/exports/stage02/MP01_NightClouds.webp?url';
import townUrl from '../../../../../blender/exports/stage02/MP02_FarTown.webp?url';
import barangayUrl from '../../../../../blender/exports/stage02/MP03_Barangay.webp?url';
import atlasUrl from '../../../../../blender/exports/stage02/T02_StreetAtlas.webp?url';
import asphaltUrl from '../../../../../blender/exports/stage02/T02_Asphalt.webp?url';
import paversUrl from '../../../../../blender/exports/stage02/T02_Pavers.webp?url';

const def = getStage(AGAWAN.id);
const layout = def.agawan!.layout;

/** Load status for tests and the HUD's loading screen (everything is built in code: nothing to download). */
export const agawanAssets = {
  environment: 'ready' as const,
  watcher: 'ready' as const,
  problems: [] as string[],
  walls: layout.walls.length,
  drawCalls: 0,
  parts: { solid: 0, glow: 0, decals: 0, lit: 0, bulbs: 0, halos: 0, wires: 0, pools: 0 },
  /** Vertices in the street meshes of the current mount (tests: a stage switch must not leave them empty). */
  verts: { solid: 0, glow: 0, decals: 0 },
  /** Painted background layers drawn (decision 050). */
  matte: 0,
  /** How many times the street has mounted since the page loaded. */
  mounts: 0,
};

const FOG = { color: '#1a1830', near: 38, far: 125 };
/** Largest bulb and glow sprite, in CSS pixels, per tier (performance pass, 26 Nov 2026). */
export const POINT_MAX = { high: { bulb: 48, halo: 112 }, medium: { bulb: 40, halo: 84 }, low: { bulb: 32, halo: 60 } } as const;

let cached: { key: string; k: StreetBuild } | null = null;
function street(colors: TeamColors): StreetBuild {
  // Team colours are baked into the merged street mesh (arches, pen posts), so a new colour deal rebuilds it once.
  const key = TEAM_SLOTS.map((t) => colors[t]).join(',');
  if (!cached || cached.key !== key) cached = { key, k: buildStreet({ colors }) };
  return cached.k;
}

const loader = new THREE.TextureLoader();
function texture(url: string, label: string, repeat?: number[]): THREE.Texture {
  const t = loader.load(url, undefined, undefined, () => agawanAssets.problems.push(`${label} failed to load`));
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  return t;
}

/** Soft round sprites with per-point size (bulbs and glows), faded by the scene fog. */
function pointsMaterial(halo: boolean): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { uScale: { value: 400 }, uMax: { value: 140 }, uNear: { value: FOG.near }, uFar: { value: FOG.far }, uAlpha: { value: halo ? 0.42 : 1 } },
    vertexShader: /* glsl */ `
      attribute float size; varying vec3 vColor; varying float vFog; uniform float uScale, uMax, uNear, uFar;
      void main() {
        vColor = color;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = clamp(size * uScale / -mv.z, 1.5, uMax);
        vFog = smoothstep(uNear, uFar, -mv.z);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      varying vec3 vColor; varying float vFog; uniform float uAlpha;
      void main() {
        float d = length(gl_PointCoord - 0.5) * 2.0;
        if (d > 1.0) discard;
        ${halo ? 'float a = pow(1.0 - d, 2.2) * uAlpha;' : 'float a = smoothstep(1.0, 0.35, d); vec3 core = mix(vColor, vec3(1.0), smoothstep(0.5, 0.0, d) * 0.6);'}
        a *= 1.0 - vFog * ${halo ? '0.9' : '0.75'};
        gl_FragColor = vec4(${halo ? 'vColor' : 'core'} * a, a);
      }`,
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    blending: halo ? THREE.AdditiveBlending : THREE.NormalBlending,
  });
}

function radialTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.4, 'rgba(255,255,255,0.45)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** The whole street: merged solids, merged self-lit surfaces, bulbs, glows, wires and warm light pools. */
function Street({ colors }: { colors: TeamColors }) {
  const tier = useQuality();
  const { size, camera, gl } = useThree();
  const k = street(colors);
  const objs = useMemo(() => {
    // Atlas details (decision 050): one texture for every capiz window, grille, door, tin roof, sign and gift wrap.
    const atlas = texture(atlasUrl, 'street atlas');
    const decals = new THREE.Mesh(k.decals.build(), new THREE.MeshStandardMaterial({ map: atlas, vertexColors: true, roughness: 0.85, metalness: 0.04, alphaTest: 0.5, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4 }));
    decals.name = 'S02A_STREET_DETAILS';
    const lit = new THREE.Mesh(k.lit.build(), new THREE.MeshBasicMaterial({ map: atlas, vertexColors: true, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4 }));
    lit.name = 'S02A_STREET_LIT_DETAILS';
    const solid = new THREE.Mesh(k.solid.build(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0.04 }));
    solid.name = 'S02A_STREET_SOLID';
    const glow = new THREE.Mesh(k.glow.build(), new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }));
    glow.name = 'S02A_STREET_GLOW';
    const bulbs = new THREE.Points(k.bulbs.build(), pointsMaterial(false));
    bulbs.name = 'S02A_STRING_LIGHTS';
    const halos = new THREE.Points(k.halos.build(), pointsMaterial(true));
    halos.name = 'S02A_GLOWS';
    halos.renderOrder = 2;
    const wg = new THREE.BufferGeometry();
    wg.setAttribute('position', new THREE.Float32BufferAttribute(k.wires, 3));
    const wires = new THREE.LineSegments(wg, new THREE.LineBasicMaterial({ color: '#0d0d12', transparent: true, opacity: 0.8 }));
    wires.name = 'S02A_WIRES';
    const tex = radialTexture();
    const pools = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.22, toneMapped: false }), k.pools.length);
    pools.name = 'S02A_LIGHT_POOLS';
    const m = new THREE.Matrix4(), c = new THREE.Color();
    k.pools.forEach((p, i) => {
      pools.setMatrixAt(i, m.makeScale(p.r * 2, 1, p.r * 2).setPosition(p.x, 0.03 + i * 0.0001, p.z));
      pools.setColorAt(i, c.set(p.color));
    });
    pools.instanceMatrix.needsUpdate = true;
    if (pools.instanceColor) pools.instanceColor.needsUpdate = true;
    pools.computeBoundingSphere();
    pools.renderOrder = 1;
    agawanAssets.parts = { solid: k.solid.count, glow: k.glow.count, decals: k.decals.count, lit: k.lit.count, bulbs: k.bulbs.size.length, halos: k.halos.size.length, wires: k.wires.length / 6, pools: k.pools.length };
    agawanAssets.verts = { solid: solid.geometry.getAttribute('position')?.count ?? 0, glow: glow.geometry.getAttribute('position')?.count ?? 0, decals: decals.geometry.getAttribute('position')?.count ?? 0 };
    agawanAssets.mounts++;
    return { solid, glow, decals, lit, bulbs, halos, wires, pools, tex, atlas };
  }, [k]);
  useEffect(() => () => {
    for (const o of [objs.solid, objs.glow, objs.decals, objs.lit, objs.bulbs, objs.halos, objs.wires, objs.pools]) { o.geometry.dispose(); (o.material as THREE.Material).dispose(); }
    objs.tex.dispose();
    objs.atlas.dispose();
  }, [objs]);
  useFrame(() => {
    const cam = camera as THREE.PerspectiveCamera;
    const scale = (size.height * gl.getPixelRatio()) / (2 * Math.tan((cam.fov * Math.PI) / 360));
    (objs.bulbs.material as THREE.ShaderMaterial).uniforms.uScale.value = scale;
    (objs.halos.material as THREE.ShaderMaterial).uniforms.uScale.value = scale;
    // Glows are additive sprites, so a big one near the camera shades many pixels several times over (overdraw).
    // Performance pass (26 Nov 2026): their largest size follows the tier and the render resolution, which keeps
    // the fill cost on integrated GPUs (Intel Macs) in check without changing how the street looks from afar.
    const dpr = gl.getPixelRatio();
    (objs.bulbs.material as THREE.ShaderMaterial).uniforms.uMax.value = POINT_MAX[tier].bulb * dpr;
    (objs.halos.material as THREE.ShaderMaterial).uniforms.uMax.value = POINT_MAX[tier].halo * dpr;
  });
  return (
    <>
      <primitive object={objs.solid} />
      <primitive object={objs.glow} />
      <primitive object={objs.decals} />
      <primitive object={objs.lit} />
      <primitive object={objs.wires} />
      <primitive object={objs.pools} />
      <primitive object={objs.bulbs} />
      <primitive object={objs.halos} />
    </>
  );
}

/** Chain-link prison fences: see-through panels (the fence walls block movement, not sight). */
function Fences() {
  const mesh = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d')!;
    g.strokeStyle = 'rgba(205,210,215,1)';
    g.lineWidth = 4;
    g.beginPath(); g.moveTo(0, 0); g.lineTo(64, 64); g.moveTo(64, 0); g.lineTo(0, 64); g.stroke();
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    const parts: THREE.BufferGeometry[] = [];
    for (const w of layout.walls) {
      if (w.kind !== 'fence') continue;
      const sx = w.maxX - w.minX, sz = w.maxZ - w.minZ, alongX = sx > sz, L = Math.max(sx, sz);
      const p = new THREE.PlaneGeometry(L, 1.5);
      const uv = p.getAttribute('uv') as THREE.BufferAttribute;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * L / 0.22, uv.getY(i) * 1.5 / 0.22);
      p.rotateY(alongX ? 0 : Math.PI / 2);
      p.translate((w.minX + w.maxX) / 2, 0.8, (w.minZ + w.maxZ) / 2);
      parts.push(p);
    }
    const merged = parts.length ? mergeAll(parts) : new THREE.BufferGeometry();
    const mesh2 = new THREE.Mesh(merged, new THREE.MeshStandardMaterial({ map: tex, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.5, metalness: 0.5, color: '#c8cdd2' }));
    mesh2.name = 'S02A_PEN_FENCES';
    return mesh2;
  }, []);
  useEffect(() => () => { mesh.geometry.dispose(); const m = mesh.material as THREE.MeshStandardMaterial; m.map?.dispose(); m.dispose(); }, [mesh]);
  return <primitive object={mesh} />;
}
function mergeAll(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  // PlaneGeometry parts share the same attributes: concatenate them (indexed).
  const pos: number[] = [], nor: number[] = [], uv: number[] = [], idx: number[] = [];
  let off = 0;
  for (const p of parts) {
    pos.push(...(p.getAttribute('position').array as Float32Array));
    nor.push(...(p.getAttribute('normal').array as Float32Array));
    uv.push(...(p.getAttribute('uv').array as Float32Array));
    for (const i of p.index!.array as Uint16Array) idx.push(i + off);
    off += p.getAttribute('position').count;
    p.dispose();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

/** Asphalt, base pads, capture rings and pen floors. Pads and pens keep the home team's colour; the capture ring
 *  takes the colour of whoever owns the base now, and a disc in the attacker's colour grows inside it as they take
 *  it over (decision 047). */
function Ground({ room, colors }: { room: TrialRoom; colors: TeamColors }) {
  const ground = useMemo(() => ({
    asphalt: texture(asphaltUrl, 'asphalt', art.ground.T02_Asphalt.repeat),
    pavers: texture(paversUrl, 'plaza pavers', art.ground.T02_Pavers.repeat),
  }), []);
  useEffect(() => () => { ground.asphalt.dispose(); ground.pavers.dispose(); }, [ground]);
  const rings = useRef<Partial<Record<TeamSlot, { ring: THREE.MeshBasicMaterial | null; fill: THREE.MeshBasicMaterial | null; cap: THREE.Mesh | null }>>>({});
  const R = AGAWAN.base.zoneM;
  useFrame(({ clock }) => {
    const ag = room.round.agawan;
    for (const s of TEAM_SLOTS) {
      const m = rings.current[s];
      if (!m) continue;
      const b = ag?.bases.find((x) => x.slot === s);
      const owner = b?.owner ?? s;
      const contested = !!b && b.inside.length > 1;
      m.ring?.color.set(colorOf(room, owner)).multiplyScalar(contested ? 0.75 + 0.35 * Math.sin(clock.elapsedTime * 10) : 1);
      m.fill?.color.set(colorOf(room, owner));
      if (m.cap) {
        const p = b?.cap?.p ?? 0;
        m.cap.visible = p > 0.01;
        if (b?.cap) { m.cap.scale.setScalar(Math.max(0.01, p)); (m.cap.material as THREE.MeshBasicMaterial).color.set(colorOf(room, b.cap.team)); }
      }
    }
  });
  const slot = (s: TeamSlot) => (rings.current[s] ??= { ring: null, fill: null, cap: null });
  return (
    <group name="S02A_GROUND">
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.03, 0]}><planeGeometry args={[260, 240]} /><meshStandardMaterial color="#1d1c22" roughness={1} /></mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} name="S02A_ASPHALT"><planeGeometry args={[96, 80]} /><meshStandardMaterial map={ground.asphalt} color="#45434b" roughness={0.62} metalness={0.08} /></mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.006, 0]} name="S02A_PLAZA"><circleGeometry args={[8, 48]} /><meshStandardMaterial map={ground.pavers} color="#6a655c" roughness={0.85} /></mesh>
      {TEAM_SLOTS.map((s) => {
        const b = layout.bases[s], pen = layout.pens[s].area;
        return (
          <group key={s}>
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[(b.area.minX + b.area.maxX) / 2, 0.007, (b.area.minZ + b.area.maxZ) / 2]} name={`S02A_BASE_PAD_${s}`}>
              <planeGeometry args={[b.area.maxX - b.area.minX, b.area.maxZ - b.area.minZ]} />
              <meshStandardMaterial color={colors[s]} transparent opacity={0.16} roughness={0.9} />
            </mesh>
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[b.x, 0.009, b.z]} name={`S02A_CAPTURE_ZONE_${s}`}>
              <ringGeometry args={[R - 0.22, R, 64]} />
              <meshBasicMaterial ref={(m) => { slot(s).ring = m; }} color={colors[s]} transparent opacity={0.9} toneMapped={false} />
            </mesh>
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[b.x, 0.008, b.z]}>
              <circleGeometry args={[R - 0.22, 64]} />
              <meshBasicMaterial ref={(m) => { slot(s).fill = m; }} color={colors[s]} transparent opacity={0.12} toneMapped={false} depthWrite={false} />
            </mesh>
            <mesh ref={(m) => { slot(s).cap = m; }} visible={false} rotation={[-Math.PI / 2, 0, 0]} position={[b.x, 0.0095, b.z]} name={`S02A_CAPTURE_FILL_${s}`}>
              <circleGeometry args={[R - 0.22, 64]} />
              <meshBasicMaterial color="#ffffff" transparent opacity={0.38} toneMapped={false} depthWrite={false} />
            </mesh>
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[(pen.minX + pen.maxX) / 2, 0.008, (pen.minZ + pen.maxZ) / 2]} name={`S02A_PEN_FLOOR_${s}`}>
              <planeGeometry args={[pen.maxX - pen.minX, pen.maxZ - pen.minZ]} />
              <meshStandardMaterial color={colors[s]} transparent opacity={0.26} roughness={0.9} />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}

function letterTexture(slot: TeamSlot, color: string): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 160;
  const g = c.getContext('2d')!;
  g.fillStyle = color;
  g.fillRect(0, 0, 256, 160);
  g.fillStyle = 'rgba(0,0,0,0.18)';
  g.fillRect(0, 128, 256, 32);
  g.fillStyle = '#ffffff';
  g.font = 'bold 112px "Barlow Condensed", "Arial Narrow", sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(slot, 128, 70);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const MARKER_STAR = starGeometry(0.75, 0.14);

/** Base markers: a white post with the base's letter banner (home colour) and a big parol on top in the colour of
 *  the team that owns the base now. The parol flickers fast while someone is taking the base over. */
function Markers({ room, colors }: { room: TrialRoom; colors: TeamColors }) {
  const mats = useRef<Record<string, { banner: THREE.MeshStandardMaterial | null; star: THREE.MeshBasicMaterial | null }>>({});
  const textures = useMemo(() => Object.fromEntries(TEAM_SLOTS.map((s) => [s, letterTexture(s, colors[s])])) as Record<TeamSlot, THREE.Texture>, [colors]);
  useEffect(() => () => { for (const t of Object.values(textures)) t.dispose(); }, [textures]);
  useFrame(({ clock }) => {
    const ag = room.round.agawan;
    for (const s of TEAM_SLOTS) {
      const m = mats.current[s];
      if (!m) continue;
      const b = ag?.bases.find((x) => x.slot === s);
      const owner = b?.owner ?? s;
      const taking = !!b?.cap && b.cap.p > 0.01;
      const t = clock.elapsedTime;
      if (m.star) m.star.color.set(colorOf(room, owner)).multiplyScalar(taking ? 0.7 + 0.5 * Math.abs(Math.sin(t * 7)) : 1 + 0.15 * Math.sin(t * 2 + s.charCodeAt(0)));
    }
  });
  return (
    <group name="S02A_BASE_MARKERS">
      {TEAM_SLOTS.map((s) => {
        const b = layout.bases[s];
        const face = Math.atan2(-b.x, -b.z); // the banner faces the plaza
        return (
          <group key={s} position={[b.x, 0, b.z]} rotation={[0, face, 0]} name={`S02_BaseMarker_${s}`}>
            <mesh position={[0, 0.1, 0]}><cylinderGeometry args={[0.45, 0.55, 0.2, 16]} /><meshStandardMaterial color="#d8d2c2" roughness={0.7} /></mesh>
            <mesh position={[0, 2.1, 0]}><cylinderGeometry args={[0.09, 0.09, 4.2, 8]} /><meshStandardMaterial color="#e8e2d2" roughness={0.6} /></mesh>
            <mesh position={[0.62, 3.0, 0]} rotation={[0, Math.PI, 0]}>
              <planeGeometry args={[1.1, 0.7]} />
              <meshStandardMaterial ref={(m) => { (mats.current[s] ??= { banner: null, star: null }).banner = m; }} map={textures[s]} emissiveMap={textures[s]} emissive="#ffffff" emissiveIntensity={0.55} side={THREE.DoubleSide} />
            </mesh>
            <mesh position={[0, 4.75, 0]} geometry={MARKER_STAR}>
              <meshBasicMaterial ref={(m) => { (mats.current[s] ??= { banner: null, star: null }).star = m; }} color={colors[s]} toneMapped={false} />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}

/** Night sky: a gradient dome with stars, fog matched to the horizon, two lights. */
function Sky() {
  const { scene, gl } = useThree();
  const dome = useMemo(() => {
    const g = new THREE.SphereGeometry(400, 32, 16);
    const m = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { top: { value: new THREE.Color('#070818') }, mid: { value: new THREE.Color('#171535') }, bottom: { value: new THREE.Color('#3a2448') } },
      vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'uniform vec3 top, mid, bottom; varying vec3 vP; void main(){ float h = vP.y; vec3 c = h > 0.12 ? mix(mid, top, smoothstep(0.12, 0.7, h)) : mix(bottom, mid, smoothstep(-0.05, 0.12, h)); gl_FragColor = vec4(c, 1.0); }',
    });
    const mesh = new THREE.Mesh(g, m);
    mesh.name = 'S02A_SKY';
    mesh.renderOrder = -10;
    // stars
    const sp: number[] = [];
    let s = 7;
    const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 700; i++) {
      const a = r() * Math.PI * 2, y = 0.15 + r() * 0.85, rr = Math.sqrt(1 - y * y);
      sp.push(Math.cos(a) * rr * 380, y * 380, Math.sin(a) * rr * 380);
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
    const stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: '#cfd6ff', size: 1.3, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.75, depthWrite: false }));
    stars.name = 'S02A_STARS';
    return { mesh, stars };
  }, []);
  useEffect(() => {
    const prevFog = scene.fog, prevBg = scene.background, prevExp = gl.toneMappingExposure;
    scene.fog = new THREE.Fog(FOG.color, FOG.near, FOG.far);
    scene.background = new THREE.Color('#0b0b1c');
    gl.toneMappingExposure = 1.1;
    const hemi = new THREE.HemisphereLight('#8a88c4', '#6a4a30', 1.5);
    const key = new THREE.DirectionalLight('#ffbf7a', 1.15); // warm street glow from one side
    key.position.set(-30, 40, 25);
    const moon = new THREE.DirectionalLight('#8fa4ff', 0.5);
    moon.position.set(35, 60, -40);
    hemi.name = 'LGT_STG02A_Ambient'; key.name = 'LGT_STG02A_Key'; moon.name = 'LGT_STG02A_Moon';
    scene.add(hemi, key, moon);
    return () => { scene.fog = prevFog; scene.background = prevBg; gl.toneMappingExposure = prevExp; scene.remove(hemi, key, moon); hemi.dispose(); key.dispose(); moon.dispose(); };
  }, [scene, gl]);
  useEffect(() => () => { dome.mesh.geometry.dispose(); (dome.mesh.material as THREE.Material).dispose(); dome.stars.geometry.dispose(); (dome.stars.material as THREE.Material).dispose(); }, [dome]);
  useFrame(({ gl: r, camera }) => { agawanAssets.drawCalls = r.info.render.calls; dome.mesh.position.copy(camera.position); dome.stars.position.copy(camera.position); });
  return <><primitive object={dome.mesh} /><primitive object={dome.stars} /></>;
}

const MATTE_URL: Record<string, string> = { MP01_NightClouds: cloudsUrl, MP02_FarTown: townUrl, MP03_Barangay: barangayUrl };

/** Inward-facing open cylinder; u runs once around per `repeat` (the panoramas tile seamlessly). */
function cylinder(radius: number, height: number, bottom: number, repeat: number, uOffset: number, segments = 128) {
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  for (let i = 0; i <= segments; i++) {
    const u = i / segments, a = u * Math.PI * 2;
    const x = Math.sin(a) * radius, z = Math.cos(a) * radius;
    pos.push(x, bottom, z, x, bottom + height, z);
    uv.push(u * repeat + uOffset, 0, u * repeat + uOffset, 1);
    if (i < segments) { const j = i * 2; idx.push(j, j + 2, j + 1, j + 1, j + 2, j + 3); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

/**
 * Painted backgrounds (decision 050): three matte panoramas around the block, generated by
 * tools/stage02/generate_street_art.py. They replace the old 3D silhouettes: the town past the wall is a picture,
 * not geometry, so it costs three draw calls and no vertices to speak of.
 */
function MatteLayers() {
  const tier = useQuality();
  const group = useMemo(() => {
    const g = new THREE.Group();
    g.name = 'S02A_MATTE_LAYERS';
    for (const l of art.layers) {
      const tex = texture(MATTE_URL[l.id], `matte layer ${l.id}`);
      tex.wrapS = THREE.RepeatWrapping;
      tex.userData.drift = l.drift ?? 0;
      const mat = new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color().setScalar(l.brightness ?? 1), transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false, toneMapped: false });
      mat.onBeforeCompile = (sh) => {
        sh.uniforms.uFogTint = { value: new THREE.Color(FOG.color) };
        sh.uniforms.uFogTintMix = { value: l.fogMix };
        sh.fragmentShader = 'uniform vec3 uFogTint; uniform float uFogTintMix;\n' + sh.fragmentShader.replace('#include <opaque_fragment>',
          '#include <opaque_fragment>\n  gl_FragColor.rgb = mix(gl_FragColor.rgb, uFogTint, uFogTintMix);');
      };
      const mesh = new THREE.Mesh(cylinder(l.radius, l.height, l.bottom, l.repeat, l.uOffset), mat);
      mesh.name = l.id;
      mesh.renderOrder = -9 + l.order; // after the sky dome, before everything else; never writes depth
      mesh.frustumCulled = false;
      g.add(mesh);
    }
    agawanAssets.matte = art.layers.length;
    return g;
  }, []);
  useFrame((_, dt) => {
    if (tier === 'low') return;
    for (const o of group.children) {
      const map = ((o as THREE.Mesh).material as THREE.MeshBasicMaterial).map;
      if (map?.userData.drift) map.offset.x = (map.offset.x + map.userData.drift * Math.min(dt, 0.1)) % 1;
    }
  });
  useEffect(() => () => {
    group.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { m.geometry.dispose(); const mat = m.material as THREE.MeshBasicMaterial; mat.map?.dispose(); mat.dispose(); } });
  }, [group]);
  return <primitive object={group} />;
}

export function AgawanScene({ room }: { room: TrialRoom }) {
  const colors = useTeamColors(room);
  return (
    <group name="STG02_AGAWAN_BASE">
      <Sky />
      <MatteLayers />
      <Ground room={room} colors={colors} />
      <Street colors={colors} />
      <Fences />
      <Markers room={room} colors={colors} />
    </group>
  );
}

export function preloadAgawan() { /* built in code: nothing to download */ }
