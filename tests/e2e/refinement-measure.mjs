// Stage 01 refinement (Phase 12): real measurements, against `wrangler dev`, in headless Chromium with software
// WebGL (SwiftShader). Frame rates here compare builds on the same machine; they are NOT real-GPU numbers.
//
//   part 1 (both builds): load time, transferred bytes by type, JS heap, renderer stats and frame times while
//          idle in the lobby at spawn (MEASURE_LOAD_ONLY=1 stops here, so the baseline build can run it too)
//   part 2 (this build): a full default match, 1 real browser (High, 1280x720) + 29 server bots = 30 players:
//          per-stage results and points, server tick timings, snapshot sizes, WebSocket bytes per second into
//          the browser, collisions, frame-time spikes, heap growth over the match
// Usage: tsx tests/e2e/refinement-measure.mjs [out.json]   (SKIP_BUILD=1 to reuse dist)
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
import { root, sleep, startWorker } from '../lib.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const PORT = Number(process.env.MEASURE_PORT ?? 8797);
const OUT = process.argv[2] ?? `${root}tests/reports/refinement-measure.json`;
const LOAD_ONLY = process.env.MEASURE_LOAD_ONLY === '1';
if (process.env.SKIP_BUILD !== '1') execSync('npm run build', { cwd: root, stdio: 'ignore' });
const worker = startWorker(PORT);
const report = { date: new Date().toISOString(), renderer: 'headless Chromium, SwiftShader software WebGL (no GPU in this container)', errors: [] };
let browser;

const waitFor = async (fn, label, ms = 120_000) => {
  const t = Date.now();
  while (Date.now() - t < ms) { if (await fn()) return; await sleep(250); }
  throw new Error(`Timed out: ${label}`);
};
const pct = (a, p) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : 0; };
// Frame times over a window, measured in the page with requestAnimationFrame.
const frames = (page, ms) => page.evaluate((ms) => new Promise((done) => {
  const d = []; let last = performance.now(); const t0 = last;
  const tick = (t) => { d.push(t - last); last = t; if (t - t0 < ms) requestAnimationFrame(tick); else done(d); };
  requestAnimationFrame(tick);
}), ms);
const frameStats = (d) => ({ frames: d.length, fps: +(1000 / (d.reduce((a, b) => a + b, 0) / Math.max(1, d.length))).toFixed(2),
  p50_ms: +pct(d, 0.5).toFixed(1), p95_ms: +pct(d, 0.95).toFixed(1), max_ms: +Math.max(0, ...d).toFixed(1), spikes_over_250ms: d.filter((x) => x > 250).length });
const heap = (page) => page.evaluate(() => (performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(1) : null));
const health = async (room) => (await fetch(`http://127.0.0.1:${PORT}/api/room/${room}/health`)).json();

try {
  await worker.ready;
  browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-precise-memory-info'] });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => report.errors.push(String(e)));
  const room = `measure${Date.now() % 100000}`;
  const t0 = Date.now();
  await page.goto(`http://127.0.0.1:${PORT}/?name=Measure&autojoin=1&room=${room}&quality=high&testSeed=777&testRound=100&testBriefing=6`);
  await waitFor(() => page.evaluate(() => { const a = window.__cn?.assets(); return a?.environment === 'ready' && a?.watcher === 'ready'; }), 'stage loaded');
  const loadMs = Date.now() - t0;
  const res = await page.evaluate(() => performance.getEntriesByType('resource').map((r) => ({ name: r.name.split('/').pop(), type: r.initiatorType, bytes: r.encodedBodySize || r.transferSize || 0 })));
  const byExt = {};
  for (const r of res) { const ext = (r.name.split('?')[0].split('.').pop() || 'other').toLowerCase(); byExt[ext] = (byExt[ext] ?? 0) + r.bytes; }
  await sleep(3000);
  const idle = await frames(page, 6000);
  report.load = {
    ms_to_stage_ready: loadMs, resources: res.length, bytes_total: res.reduce((a, r) => a + r.bytes, 0), bytes_by_type: byExt,
    heap_mb: await heap(page), render: await page.evaluate(() => window.__cn.renderInfo()), idle_frames: frameStats(idle),
  };
  console.log('load', JSON.stringify(report.load));

  if (!LOAD_ONLY) {
    // WebSocket bytes into the browser (Chrome DevTools Protocol), counted per phase.
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Network.enable');
    let wsBytes = 0;
    cdp.on('Network.webSocketFrameReceived', (e) => { wsBytes += e.response.payloadData.length; });
    // DOM clicks: Playwright's actionability checks wait for stable frames, which take seconds in software WebGL.
    const press = (id) => page.evaluate((id) => document.querySelector(`[data-testid=${id}]`)?.click(), id);
    await waitFor(() => page.evaluate(() => !!document.querySelector('[data-testid=fill-bots]')), 'fill button');
    await press('fill-bots');
    await waitFor(() => page.evaluate(() => window.__cn.players().length === 30), '30 players');
    const hostHeap0 = await heap(page);
    await press('start');
    const stages = [];
    const frameLog = [];
    let wsActive = 0, activeMs = 0;
    for (let s = 1; s <= 3; s++) {
      await waitFor(() => page.evaluate((s) => window.__cn.round().phase === 'active' && window.__cn.round().match?.stage === s, s), `stage ${s} active`, 120_000);
      const wsStart = wsBytes, tStart = Date.now();
      // Sample frame times in slices through the stage until results.
      while ((await page.evaluate(() => window.__cn.round().phase)) === 'active') frameLog.push(...(await frames(page, 4000)));
      wsActive += wsBytes - wsStart; activeMs += Date.now() - tStart;
      await waitFor(() => page.evaluate((s) => window.__cn.resultsMeta()?.match?.stage === s, s), `stage ${s} results`, 60_000);
      const r = await page.evaluate(() => window.__cn.results());
      const h = await health(room);
      stages.push({
        stage: s, finished: r.filter((x) => x.status === 'finished').length, spotted: r.filter((x) => x.status === 'spotted').length,
        unfinished: r.filter((x) => x.status === 'active').length, first: r.find((x) => x.first)?.name ?? null,
        first_time_s: r.find((x) => x.first)?.finishTime ?? null, points_awarded: r.reduce((a, x) => a + x.points, 0),
        knockdowns_total: h.knockdowns, tick_ms: h.tickMs, snapshot_avg_bytes: h.snapshot.avgBytes,
      });
      console.log('stage', JSON.stringify(stages.at(-1)));
    }
    const st = await page.evaluate(() => window.__cn.standings());
    report.match = {
      players: 30, real_browsers: 1, server_bots: 29, stages,
      final_standings_top5: st.slice(0, 5).map((x) => ({ rank: x.rank, name: x.name, points: x.points, wins: x.wins, finishes: x.finishes, perStage: x.perStage })),
      points_total: st.reduce((a, x) => a + x.points, 0),
      ws_bytes_per_s_into_browser_active: Math.round(wsActive / Math.max(1, activeMs / 1000)),
      frames_during_match: frameStats(frameLog), heap_mb_before: hostHeap0, heap_mb_after: await heap(page),
      render_during_match: await page.evaluate(() => window.__cn.renderInfo()), health_end: await health(room),
    };
  }
} catch (e) {
  report.errors.push(String(e?.stack ?? e));
  console.error(e);
} finally {
  await browser?.close();
  worker.stop();
}
writeFileSync(OUT, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
process.exit(report.errors.length ? 1 : 0);
