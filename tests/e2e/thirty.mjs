// Stage 1.5 (Prompt 08): the full combined scene with 30 players in one room, against `wrangler dev`.
//   - 5 REAL Chromium pages (1 observer on High at 1280×720, 4 on Low at 640×360) + 25 simulated bot clients
//   - host starts a seeded round WITH the obstacle twist; half the bots walk through red and get spotted
//   - observer: 30 player representations drawn, draw calls, triangles, JS heap, software frame rate
//   - every real page: sees 30 players, the same signal and the same final results (order and eliminations)
//   - memory: join → leave cycles on one page, heap measured after forced garbage collection
// Real-browser count is limited by this 4-core, GPU-less machine; the 25 bots are simulated network clients,
// not browsers, and are reported as such. Usage: npm run test:thirty
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { RoomClient, buildSchedule, segmentAt } from '../../packages/shared/src/index.ts';
import { root, sleep, startWorker, writeReport } from '../lib.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const PORT = Number(process.env.THIRTY_PORT ?? 8791);
const SEED = 12345, ROUND_S = 60, ROOM = 'thirty';
const shots = `${root}tests/reports/screenshots`;
mkdirSync(shots, { recursive: true });
if (process.env.SKIP_BUILD !== '1') execSync('npm run build', { cwd: root, stdio: 'ignore' });
const errors = [];
const report = { real_browsers: 5, simulated_clients: 25 };
const worker = startWorker(PORT);
let browser;
const waitFor = async (fn, label, ms = 90_000) => {
  const t = Date.now();
  while (Date.now() - t < ms) { if (await fn()) return; await sleep(250); }
  throw new Error(`Timed out: ${label}`);
};
const fpsOver = (page, ms) => page.evaluate((ms) => new Promise((done) => {
  let n = 0; const t0 = performance.now();
  const tick = () => { n++; if (performance.now() - t0 < ms) requestAnimationFrame(tick); else done(n / ((performance.now() - t0) / 1000)); };
  requestAnimationFrame(tick);
}), ms);

try {
  await worker.ready;
  browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-precise-memory-info'] });
  const url = (name, q) => `http://127.0.0.1:${PORT}/?name=${name}&autojoin=1&room=${ROOM}&quality=${q}&testSeed=${SEED}&testRound=${ROUND_S}&testBriefing=2&obstacles=1`;
  const pages = [];
  const consoleErrors = [];
  for (let i = 0; i < 5; i++) {
    const ctx = await browser.newContext({ viewport: i === 0 ? { width: 1280, height: 720 } : { width: 640, height: 360 } });
    const p = await ctx.newPage();
    p.on('pageerror', (e) => consoleErrors.push(`P${i}: ${e}`));
    p.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(`P${i}: ${m.text()}`); });
    await p.goto(url(i === 0 ? 'Observer' : `Browser${i}`, i === 0 ? 'high' : 'low'));
    await waitFor(() => p.evaluate(() => !!window.__cn), `page ${i} joined`);
    pages.push(p);
  }
  const bots = [];
  for (let i = 0; i < 25; i++) bots.push(await RoomClient.connect(`ws://127.0.0.1:${PORT}/api/room/${ROOM}/ws`, `Bot${String(i + 1).padStart(2, '0')}`));
  await waitFor(async () => (await Promise.all(pages.map((p) => p.evaluate(() => window.__cn.players().length)))).every((n) => n === 30), 'all pages see 30 players', 180_000)
    .catch(async (e) => {
      report.seen_on_timeout = await Promise.all(pages.map((p) => p.evaluate(() => window.__cn?.players().length ?? -1).catch((x) => String(x))));
      report.page_errors = consoleErrors.slice(0, 8);
      throw e;
    });
  await waitFor(() => pages[0].evaluate(() => { const a = window.__cn.assets(); return a.environment === 'ready' && a.watcher === 'ready'; }), 'observer stage loaded', 180_000);
  await sleep(2000);
  await pages[0].screenshot({ path: `${shots}/thirty_lobby_30_slots.png`, timeout: 120_000 });
  report.lobby_slots_taken = await pages[0].evaluate(() => document.querySelectorAll('.lobby-slots .slot.taken').length);
  // Shared contestant: 30 players, 30 different colourways, ONE shared geometry set and texture set.
  report.unique_colorways = await pages[0].evaluate(() => new Set(window.__cn.players().map((p) => p.colorway)).size);
  if (report.unique_colorways !== 30) errors.push(`${report.unique_colorways} distinct colourways for 30 players`);
  await waitFor(() => pages[0].evaluate(() => window.__cn.contestants()?.ready && window.__cn.contestants().instances === 30), 'shared contestant on 30 players', 120_000);
  report.contestants = await pages[0].evaluate(() => window.__cn.contestants());
  if (report.contestants.uniqueGeometries > 3) errors.push(`Contestants use ${report.contestants.uniqueGeometries} geometries; expected the 3 shared LODs`);
  if (report.contestants.uniqueTextures > 2) errors.push(`Contestants use ${report.contestants.uniqueTextures} textures; expected the 2 shared maps`);
  if (new Set(report.contestants.colorways).size !== 30) errors.push('Contestant materials do not show 30 colourways');
  if (report.lobby_slots_taken !== 30) errors.push(`Lobby shows ${report.lobby_slots_taken} taken slots, expected 30`);

  // ---- round with the obstacle twist
  await pages[0].click('[data-testid=start]');
  await waitFor(() => pages[0].evaluate(() => window.__cn.round().phase === 'active'), 'active', 60_000);
  if (!(await pages[0].evaluate(() => window.__cn.round().obstacles))) errors.push('Round does not report the obstacle twist');
  const schedule = buildSchedule(SEED, ROUND_S);
  const goLocal = Date.now() - (await pages[0].evaluate(() => window.__cn.round().elapsed)) * 1000;
  let seq = 1;
  const walker = setInterval(() => {
    const t = (Date.now() - goLocal) / 1000;
    const green = segmentAt(schedule, t)?.signal === 'green' && segmentAt(schedule, t + 0.5)?.signal === 'green';
    bots.forEach((b, i) => {
      const reckless = i % 2 === 0; // even bots ignore the light and get spotted
      const go = reckless || green;
      b.send({ t: 'input', seq: seq++, mx: go ? Math.sin(i) * 0.3 : 0, mz: go ? -1 : 0, yaw: 0 });
    });
  }, 33);

  // Observer view over the field with the 30 contestants, obstacles, Watcher and effects.
  await pages[0].evaluate(() => { window.__cnView = { pos: [22, 16, 22], look: [0, 0, -50] }; });
  await sleep(6000);
  report.observer = await pages[0].evaluate(() => ({
    render: window.__cn.renderInfo(),
    players_drawn: window.__cn.players().length,
    quality: window.__cn.quality().tier,
    heap_mb: performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(1) : null,
    obstacles: window.__cn.assets().obstacles,
  }));
  report.observer.software_fps = +(await fpsOver(pages[0], 4000)).toFixed(2);
  report.observer.context_lost = await pages[0].evaluate(() => document.querySelector('canvas')?.getContext('webgl2')?.isContextLost() ?? null);
  const shot = await pages[0].screenshot({ path: `${shots}/thirty_ingame_overview.png`, timeout: 120_000 });
  // the frame must show the scene, not a blank canvas: mean brightness of the screenshot's centre
  report.observer.screenshot_mean = await pages[0].evaluate(async (b64) => {
    const img = new Image(); img.src = `data:image/png;base64,${b64}`; await img.decode();
    const c = new OffscreenCanvas(img.width, img.height); const x = c.getContext('2d'); x.drawImage(img, 0, 0);
    const d = x.getImageData(img.width * 0.25, img.height * 0.25, img.width * 0.5, img.height * 0.5).data;
    let s = 0; for (let i = 0; i < d.length; i += 4) s += d[i] + d[i + 1] + d[i + 2];
    return +(s / (d.length / 4) / 3).toFixed(1);
  }, shot.toString('base64'));
  if (report.observer.context_lost) errors.push('Observer WebGL context lost');
  if (report.observer.screenshot_mean < 8) errors.push(`Observer screenshot is blank (mean ${report.observer.screenshot_mean})`);
  await pages[0].evaluate(() => { delete window.__cnView; });
  report.low_pages_software_fps = [];
  for (const p of pages.slice(1)) report.low_pages_software_fps.push(+(await fpsOver(p, 2000)).toFixed(2));

  // Signal synchronisation across real pages: each reports the server signal from its last snapshot.
  const sigs = await Promise.all(pages.map((p) => p.evaluate(() => window.__cn.round().signal)));
  report.signal_seen_by_pages = sigs;
  if (new Set(sigs).size > 1) errors.push(`Pages disagree on the server signal: ${sigs.join(', ')}`);

  await waitFor(() => pages[0].evaluate(() => window.__cn.round().phase === 'results'), 'results', (ROUND_S + 20) * 1000);
  clearInterval(walker);
  await sleep(1500);
  const results = await Promise.all(pages.map((p) => p.evaluate(() => window.__cn.results().map((r) => `${r.name}:${r.status}`).join('|'))));
  report.results_identical_on_all_pages = new Set(results).size === 1;
  if (!report.results_identical_on_all_pages) errors.push('Pages show different results');
  const res0 = await pages[0].evaluate(() => window.__cn.results());
  report.results = { players: res0.length, spotted: res0.filter((r) => r.status === 'spotted').length, active_or_finished: res0.filter((r) => r.status !== 'spotted').length };
  if (res0.length !== 30) errors.push(`Results list ${res0.length} players, expected 30`);
  if (report.results.spotted < 6) errors.push(`Only ${report.results.spotted} reckless players were spotted`);
  await pages[0].screenshot({ path: `${shots}/thirty_results.png`, timeout: 120_000 });
  bots.forEach((b) => b.leave());

  // ---- memory: three join → leave cycles on one page; heap after forced GC
  const mp = pages[4];
  const cdp = await mp.context().newCDPSession(mp);
  const heap = async () => { await cdp.send('HeapProfiler.collectGarbage'); return +((await cdp.send('Runtime.getHeapUsage')).usedSize / 1048576).toFixed(1); };
  const heaps = [await heap()];
  for (let k = 0; k < 3; k++) {
    await mp.goto(`http://127.0.0.1:${PORT}/?quality=low`);
    await sleep(1500);
    await mp.goto(url(`Cycle${k}`, 'low'));
    await waitFor(() => mp.evaluate(() => window.__cn?.assets?.().environment === 'ready'), `cycle ${k} loaded`, 120_000);
    await sleep(1500);
    heaps.push(await heap());
  }
  report.memory_heap_mb_after_gc = heaps;
  report.memory_note = 'Full page reloads between cycles; in-page join/leave reuse is covered by test:ui (Exit to menu).';
  if (heaps[3] > heaps[1] * 1.5) errors.push(`Heap grew from ${heaps[1]} MB to ${heaps[3]} MB over cycles`);
  if (consoleErrors.length) errors.push(...consoleErrors.slice(0, 5));
} catch (e) {
  errors.push(String(e?.stack ?? e));
} finally {
  await browser?.close();
  worker.stop();
}
const out = { result: errors.length ? 'FAIL' : 'PASS', errors, date: new Date().toISOString(), machine: '4 vCPU Xeon 2.3 GHz, 15 GB, no GPU (SwiftShader software WebGL)', ...report };
writeReport('thirty-players.json', out);
console.log(JSON.stringify(out, null, 2));
process.exit(errors.length ? 1 : 0);
