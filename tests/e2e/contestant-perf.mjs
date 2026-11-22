// Contestant performance: the same scene measured before and after a character-system change.
// One real browser (High, 1280x720, fixed camera over the spawn area) plus 29 simulated clients.
// It measures the scene with 1 player and with 30, so the difference is the cost of 29 contestants:
// draw calls, triangles, geometries and textures held by the renderer, JS heap, software frame rate,
// and the bytes and time of any contestant asset download. Writes tests/reports/<CONTESTANT_PERF_OUT>.
// Usage: CONTESTANT_PERF_OUT=contestant-perf-before.json tsx tests/e2e/contestant-perf.mjs
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { RoomClient } from '../../packages/shared/src/index.ts';
import { root, sleep, startWorker, writeReport } from '../lib.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const PORT = Number(process.env.PERF_PORT ?? 8794);
const OUT = process.env.CONTESTANT_PERF_OUT ?? 'contestant-perf.json';
const Q = process.env.PERF_QUALITY ?? 'high';
if (process.env.SKIP_BUILD !== '1') execSync('npm run build', { cwd: root, stdio: 'ignore' });
const worker = startWorker(PORT);
let browser; const errors = []; const report = { quality: Q, viewport: '1280x720', camera: 'fixed, 9 m behind and 6 m above the spawn grid' };
const fps = (page, ms) => page.evaluate((ms) => new Promise((done) => {
  let n = 0; const t0 = performance.now();
  const tick = () => { n++; if (performance.now() - t0 < ms) requestAnimationFrame(tick); else done(n / ((performance.now() - t0) / 1000)); };
  requestAnimationFrame(tick);
}), ms);
const sample = async (page) => {
  await sleep(4000);
  const s = await page.evaluate(() => ({
    render: window.__cn.renderInfo(),
    heap_mb: performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(1) : null,
    contestants: window.__cn.contestants?.() ?? null,
    players: window.__cn.players().length,
  }));
  s.software_fps = +(await fps(page, 6000)).toFixed(2);
  return s;
};
try {
  await worker.ready;
  browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-precise-memory-info'] });
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`http://127.0.0.1:${PORT}/?name=Perf&autojoin=1&room=perf&quality=${Q}`);
  await page.waitForFunction(() => !!window.__cn && window.__cn.assets().environment === 'ready' && window.__cn.assets().watcher === 'ready', null, { timeout: 180_000 });
  const spawns = await page.evaluate(() => window.__cn.spawns);
  const cx = spawns.reduce((s, p) => s + p.x, 0) / spawns.length, cz = spawns.reduce((s, p) => s + p.z, 0) / spawns.length;
  await page.evaluate(([cx, cz]) => { window.__cnView = { pos: [cx, 6, cz + 9], look: [cx, 0.5, cz - 2] }; document.querySelector('.lobby')?.setAttribute('style', 'display:none'); }, [cx, cz]);
  report.one_player = await sample(page);
  const tJoin = Date.now();
  const bots = [];
  for (let i = 0; i < 29; i++) bots.push(await RoomClient.connect(`ws://127.0.0.1:${PORT}/api/room/perf/ws`, `Bot${i + 1}`));
  await page.waitForFunction(() => window.__cn.players().length === 30, null, { timeout: 120_000 });
  await page.waitForFunction(() => (window.__cn.contestants?.().ready ?? true), null, { timeout: 120_000 });
  report.thirty_ready_after_join_ms = Date.now() - tJoin;
  report.thirty_players = await sample(page);
  report.contestant_downloads = await page.evaluate(() => performance.getEntriesByType('resource')
    .filter((r) => /CNTRIAL_CONTESTANT|contestant/i.test(r.name))
    .map((r) => ({ file: r.name.split('/').pop(), bytes: r.transferSize || r.encodedBodySize, ms: Math.round(r.duration) })));
  const a = report.one_player.render, b = report.thirty_players.render;
  report.cost_of_29_contestants = {
    draw_calls: b.calls - a.calls, triangles: b.triangles - a.triangles,
    geometries: (b.geometries ?? 0) - (a.geometries ?? 0), textures: b.textures - a.textures, programs: b.programs - a.programs,
    heap_mb: +(report.thirty_players.heap_mb - report.one_player.heap_mb).toFixed(1),
    fps_drop: +(report.one_player.software_fps - report.thirty_players.software_fps).toFixed(2),
  };
  await page.screenshot({ path: `${root}tests/reports/screenshots/${OUT.replace('.json', '')}.png`, timeout: 120_000 });
  bots.forEach((x) => x.leave());
} catch (e) { errors.push(String(e?.stack ?? e)); } finally { await browser?.close(); worker.stop(); }
const out = { result: errors.length ? 'FAIL' : 'PASS', errors, date: new Date().toISOString(), machine: '4 vCPU, no GPU (SwiftShader software WebGL); frame rates compare runs on this machine only', ...report };
writeReport(OUT, out);
console.log(JSON.stringify(out, null, 2));
process.exit(errors.length ? 1 : 0);
