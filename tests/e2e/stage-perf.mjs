// Performance audit of every stage on every quality tier, with 30 players (one person and 29 server bots), against
// the Worker under `wrangler dev`. For each stage and tier, one fresh page measures, during the live stage:
//  - draw calls, triangles and points for one whole frame (all passes, including post-processing)
//  - shader programs, textures and geometries held by the renderer
//  - main-thread milliseconds per frame (every requestAnimationFrame callback: game logic, animation, three.js
//    submission). This is the part of the frame that carries over to a real machine.
//  - frames per second. This machine has no GPU (SwiftShader software rendering), so the frame rate says almost
//    nothing about a real GPU and is reported for comparison between runs only.
//  - shaders: all compiled up front (warm-up), none compiled while the stage is played (a compile is a hitch)
// Usage: npm run test:perf  (STAGES=01,02 TIERS=high to narrow it). Writes tests/reports/stage-perf.json.
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { root, sleep, startWorker, writeReport } from '../lib.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const PORT = Number(process.env.PERF_PORT ?? 8797);
const ALL = { '01': 'STAGE_01_RED_LIGHT', '02': 'STAGE_02_AGAWAN_BASE', '03': 'STAGE_03_THE_HUNT' };
const stages = (process.env.STAGES ?? '01,02,03').split(',');
const tiers = (process.env.TIERS ?? 'high,medium,low').split(',');
// Budgets for one frame with 30 players, from the reference Intel Mac target (decision D: Intel Mac laptop).
const BUDGET = { high: { calls: 260, triangles: 900_000 }, medium: { calls: 200, triangles: 600_000 }, low: { calls: 150, triangles: 400_000 } };
// Main-thread time per frame. Under software rendering most of it is waiting for the rasteriser (a CPU profile shows
// about 99 % native time), so this is a loose ceiling that catches runaway per-frame work, not a frame-time target.
const MAIN_MS = 12;
if (process.env.SKIP_BUILD !== '1') execSync('npm run build', { cwd: root, stdio: 'ignore' });
const errors = [];
const rows = [];
const worker = startWorker(PORT);
let browser;
const waitFor = async (page, fn, label, ms = 90_000) => {
  const t = Date.now();
  while (Date.now() - t < ms) { if (await page.evaluate(fn).catch(() => false)) return; await sleep(300); }
  throw new Error(`Timed out: ${label}`);
};

const INIT = () => {
  // Time every animation-frame callback (the game's whole per-frame main-thread work).
  const raf = window.requestAnimationFrame.bind(window);
  window.__perf = { ms: [], on: false };
  window.requestAnimationFrame = (cb) => raf((t) => {
    const a = performance.now(); cb(t); const d = performance.now() - a;
    if (window.__perf.on) window.__perf.ms.push(d);
  });
};

try {
  await worker.ready;
  browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  for (const s of stages) {
    for (const tier of tiers) {
      const ctx = await browser.newContext({ viewport: { width: 800, height: 450 } });
      await ctx.addInitScript(INIT);
      const page = await ctx.newPage();
      const pageErrors = [];
      page.on('pageerror', (e) => pageErrors.push(e.message));
      const room = `perf${s}${tier}${Date.now() % 100000}`;
      await page.goto(`http://127.0.0.1:${PORT}/?name=Perf&autojoin=1&room=${room}&quality=${tier}&teams=1&startStage=${ALL[s]}&testSeed=7&testRound=90&testBriefing=1`);
      await waitFor(page, () => !!document.querySelector('[data-testid=add-bots]'), 'lobby');
      for (let i = 0; i < 12; i++) {
        const n = await page.evaluate(() => window.__cn.players().length);
        if (n >= 30) break;
        await page.evaluate(() => document.querySelector('[data-testid=add-bots]')?.click()); await sleep(400);
      }
      await page.evaluate(() => document.querySelector('[data-testid=start]')?.click());
      await waitFor(page, () => window.__cn.round().phase === 'active', 'active', 120_000);
      await sleep(5000); // shader compiles, texture uploads and the adaptive warm-up
      const row = await page.evaluate(async () => {
        const t = window.__cnThree; const gl = t.gl;
        const one = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        await one();
        gl.info.autoReset = false; gl.info.reset();
        await new Promise((r) => requestAnimationFrame(r));
        const info = { calls: gl.info.render.calls, triangles: gl.info.render.triangles, points: gl.info.render.points, lines: gl.info.render.lines };
        gl.info.autoReset = true;
        const programsBefore = gl.info.programs?.length ?? 0;
        const idsBefore = new Set((gl.info.programs ?? []).map((p) => p.id));
        const warmBefore = window.__cn.renderInfo().warmup.key;
        window.__perf.ms = []; window.__perf.on = true;
        const t0 = performance.now();
        await new Promise((r) => setTimeout(r, 8000));
        window.__perf.on = false;
        const ms = window.__perf.ms.slice().sort((a, b) => a - b);
        const q = (p) => +(ms[Math.min(ms.length - 1, Math.floor(p * ms.length))] ?? 0).toFixed(2);
        let lights = 0, shadowLights = 0;
        t.scene.traverse((o) => { if (o.isLight && o.visible) { lights++; if (o.castShadow) shadowLights++; } });
        return {
          ...info,
          programs: gl.info.programs?.length ?? 0, programs_compiled_during_play: (gl.info.programs?.length ?? 0) - programsBefore, warmup: window.__cn.renderInfo().warmup, warmup_key_before: warmBefore, new_programs: (gl.info.programs ?? []).filter((p) => !idsBefore.has(p.id)).map((p) => p.name), textures: gl.info.memory.textures, geometries: gl.info.memory.geometries,
          lights, shadowLights, dpr: gl.getPixelRatio(),
          main_ms_median: q(0.5), main_ms_p95: q(0.95),
          software_fps: +(ms.length / ((performance.now() - t0) / 1000)).toFixed(1),
          players: window.__cn.players().length, playing: window.__cn.round().stage, tier: window.__cn.quality().tier,
          heap_mb: performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(1) : null,
        };
      });
      row.stage = s; row.asked = tier; row.page_errors = pageErrors.length;
      rows.push(row);
      console.log(JSON.stringify(row));
      writeReport('stage-perf.json', { partial: true, rows });
      const b = BUDGET[tier];
      if (row.playing !== ALL[s]) errors.push(`${s}/${tier}: measured ${row.playing}`);
      if (!row.warmup?.key) errors.push(`${s}/${tier}: shaders were not warmed up`);
      if (row.programs_compiled_during_play > 0) errors.push(`${s}/${tier}: ${row.programs_compiled_during_play} shaders compiled during play`);
      if (row.players < 30) errors.push(`${s}/${tier}: ${row.players} players`);
      if (row.calls > b.calls) errors.push(`${s}/${tier}: ${row.calls} draw calls (budget ${b.calls})`);
      if (row.triangles > b.triangles) errors.push(`${s}/${tier}: ${row.triangles} triangles (budget ${b.triangles})`);
      if (row.main_ms_median > MAIN_MS) errors.push(`${s}/${tier}: main thread ${row.main_ms_median} ms a frame (budget ${MAIN_MS})`);
      if (pageErrors.length) errors.push(`${s}/${tier}: page errors ${pageErrors.slice(0, 2).join(' | ')}`);
      await ctx.close();
    }
  }
} catch (e) {
  errors.push(String(e?.stack ?? e));
} finally {
  await browser?.close();
  worker.stop();
}
const out = { passed: errors.length === 0, errors, date: new Date().toISOString(), machine: 'cloud container, no GPU (SwiftShader); fps not meaningful', budget: { ...BUDGET, main_ms: MAIN_MS }, rows };
writeReport('stage-perf.json', out);
console.log(JSON.stringify({ passed: out.passed, errors }, null, 2));
process.exit(errors.length ? 1 : 0);
