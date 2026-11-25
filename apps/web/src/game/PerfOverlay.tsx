// Performance readout for real-hardware testing (second pass, decision 034 D). Opt-in with ?perf=1 in the URL;
// nothing is drawn or measured otherwise. Shows the frame rate, the slowest 1 % of frames, frame time, draw
// calls, triangles, quality tier, resolution scale and the graphics chip, with a button that copies a plain-text
// report to paste into the team chat. It reads renderer counters only and changes nothing in the game.
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import { quality } from './quality.ts';
import type { TrialRoom } from '../net.ts';

export const perfEnabled = typeof location !== 'undefined' && new URLSearchParams(location.search).get('perf') === '1';

interface Sample { t: number; ms: number }

function gpuName(gl: WebGLRenderingContext | WebGL2RenderingContext): string {
  try {
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
  } catch { return 'unknown'; }
}

export function PerfProbe({ room }: { room: TrialRoom }) {
  const { gl } = useThree();
  const samples = useRef<Sample[]>([]);
  const box = useRef<HTMLDivElement | null>(null);
  const text = useRef('');
  const last = useRef(0);

  useEffect(() => {
    const el = document.createElement('div');
    el.className = 'perf-overlay';
    el.setAttribute('data-testid', 'perf');
    const pre = document.createElement('pre');
    const btn = document.createElement('button');
    btn.textContent = 'Copy report';
    btn.className = 'btn';
    btn.onclick = () => { void navigator.clipboard?.writeText(text.current).then(() => { btn.textContent = 'Copied'; setTimeout(() => { btn.textContent = 'Copy report'; }, 1500); }); };
    el.append(pre, btn);
    document.body.append(el);
    box.current = el;
    (window as unknown as { __cnPerf?: () => string }).__cnPerf = () => text.current;
    return () => { el.remove(); };
  }, []);

  useFrame((_, dt) => {
    const now = performance.now();
    const s = samples.current;
    s.push({ t: now, ms: dt * 1000 });
    while (s.length && now - s[0].t > 10_000) s.shift(); // 10 s window
    if (now - last.current < 500 || !box.current) return; // refresh twice a second
    last.current = now;
    const sorted = s.map((x) => x.ms).sort((a, b) => b - a);
    const avgMs = sorted.reduce((a, b) => a + b, 0) / Math.max(1, sorted.length);
    const worst = sorted.slice(0, Math.max(1, Math.floor(sorted.length / 100)));
    const lowMs = worst.reduce((a, b) => a + b, 0) / worst.length;
    const info = gl.info.render;
    const players = room.players.size;
    const lines = [
      `FPS        ${(1000 / avgMs).toFixed(0)}  (1% low ${(1000 / lowMs).toFixed(0)})`,
      `Frame      ${avgMs.toFixed(1)} ms avg, ${sorted[0]?.toFixed(1) ?? '-'} ms worst`,
      `Draws      ${info.calls}   Tris ${(info.triangles / 1000).toFixed(0)}k`,
      `Quality    ${quality.tier}  scale ${gl.getPixelRatio().toFixed(2)}`,
      `Players    ${players}   Phase ${room.round.phase}`,
      `Screen     ${gl.domElement.width}×${gl.domElement.height}`,
      `GPU        ${gpuName(gl.getContext())}`,
      `Browser    ${navigator.userAgent.replace(/^Mozilla\/5\.0 /, '').slice(0, 90)}`,
    ];
    text.current = `CN TRIAL performance (${new Date().toISOString()}), last 10 s\n${lines.join('\n')}`;
    box.current.firstChild!.textContent = lines.join('\n');
  });
  return null;
}
