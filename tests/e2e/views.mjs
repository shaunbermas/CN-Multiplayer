// Review screenshots from fixed viewpoints (Stage 1.5 before/after comparisons), against `wrangler dev`.
// Usage: tsx tests/e2e/views.mjs <out-dir relative to the repo> [quality=high] [extra query]
// Software WebGL (SwiftShader): images show the picture, not real-GPU performance.
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { root, sleep, startWorker } from '../lib.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const out = `${root}${process.argv[2] ?? 'tests/reports/views'}`;
const quality = process.argv[3] ?? 'high';
const extra = process.argv[4] ?? '';
mkdirSync(out, { recursive: true });
if (process.env.SKIP_BUILD !== '1') execSync('npm run build', { cwd: root, stdio: 'ignore' });

// Game coordinates: start line z 0, finish z -160, The Watcher on its plinth near z -185.
export const VIEWS = {
  spawn_gameplay: null, // the normal third-person camera at spawn
  midfield_to_watcher: { pos: [6, 3, -80], look: [0, 10, -185] },
  finish_looking_back: { pos: [0, 4, -152], look: [0, 3, 0] },
  side_skyline_west: { pos: [0, 2.5, -40], look: [-120, 18, -70] },
  side_skyline_east: { pos: [0, 2.5, -120], look: [120, 18, -90] },
  overview_high: { pos: [60, 45, 40], look: [0, 0, -100] },
  watcher_close: { pos: [8, 10, -158], look: [0, 22, -185] },
};

const PORT = Number(process.env.VIEWS_PORT ?? 8795);
const worker = startWorker(PORT);
let browser;
const errors = [];
try {
  await worker.ready;
  browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(`http://127.0.0.1:${PORT}/?name=Viewer&autojoin=1&quality=${quality}&testSeed=12345&testRound=40&testBriefing=1${extra}`);
  const t = Date.now();
  while (Date.now() - t < 120_000) {
    if (await page.evaluate(() => { const a = window.__cn?.assets(); return a?.environment === 'ready' && a?.watcher === 'ready'; })) break;
    await sleep(500);
  }
  await page.evaluate(() => document.querySelectorAll('.hud, .panel, .overlay, header, footer').forEach((e) => { e.style.visibility = 'hidden'; }));
  const info = {};
  // VIEWS_ROUND_FIRST=1: start the seeded round first (shows round-only content such as the obstacle twist).
  if (process.env.VIEWS_ROUND_FIRST === '1') {
    await page.evaluate(() => document.querySelectorAll('.hud, .panel, .overlay, header, footer').forEach((e) => { e.style.visibility = ''; }));
    await page.locator('[data-testid=start]').click();
    const t1 = Date.now();
    while (Date.now() - t1 < 60_000 && (await page.evaluate(() => window.__cn.round().phase)) !== 'active') await sleep(200);
    await page.evaluate(() => document.querySelectorAll('.hud, .panel, .overlay, header, footer').forEach((e) => { e.style.visibility = 'hidden'; }));
  }
  const views = process.env.VIEWS_ROUND_FIRST === '1' ? { obstacles_overview: { pos: [24, 16, -25], look: [0, 0, -90] }, obstacles_runner: { pos: [3, 2.2, -32], look: [0, 1, -75] }, ...VIEWS } : VIEWS;
  for (const [name, v] of Object.entries(views)) {
    await page.evaluate((v) => { window.__cnView = v ?? undefined; }, v);
    await sleep(3500);
    await page.screenshot({ path: `${out}/${name}.png` });
    info[name] = await page.evaluate(() => ({ ...window.__cn.renderInfo(), phase: window.__cn.round().phase, obstacles: window.__cn.assets().obstacles }));
  }
  // Signal states on this tier: start a seeded test round (test mode only) and capture GREEN and RED from
  // midfield toward The Watcher (lamps, signal wash, Watcher clip), with the HUD visible.
  if (process.env.VIEWS_SIGNALS !== '0' && process.env.VIEWS_ROUND_FIRST !== '1') {
    await page.evaluate(() => document.querySelectorAll('.hud, .panel, .overlay, header, footer').forEach((e) => { e.style.visibility = ''; }));
    await page.evaluate(() => { window.__cnView = { pos: [6, 3, -80], look: [0, 10, -185] }; });
    await page.locator('[data-testid=start]').click();
    // Wait for the round, then hold the client's signal VIEW on each state (test-only presentation hook;
    // server decisions are unaffected) so each capture shows exactly that state: HUD, lamps, wash, Watcher.
    const t0 = Date.now();
    while (Date.now() - t0 < 60_000 && (await page.evaluate(() => window.__cn.round().phase)) !== 'active') await sleep(200);
    const got = new Set();
    for (const s of ['green', 'warning', 'red']) {
      await page.evaluate((s) => { globalThis.__cnSignalHold = { signal: s, since: Date.now() }; }, s);
      await sleep(5000); // opening clip (TurnAway / FocusLock) and the wash fade complete
      await page.screenshot({ path: `${out}/signal_${s}.png` });
      got.add(s);
    }
    await page.evaluate(() => { delete globalThis.__cnSignalHold; });
    if (got.size < 3) errors.push(`signal captures: only ${[...got].join(', ')}`);
  }
  writeFileSync(`${out}/views.json`, JSON.stringify({ quality, date: new Date().toISOString(), renderer: 'SwiftShader', errors, renderInfo: info, signalCaptures: 'held via window.__cnSignalHold (presentation only)' }, null, 2));
  console.log(JSON.stringify({ out, errors, renderInfo: info }, null, 2));
} finally {
  await browser?.close();
  worker.stop();
}
process.exit(errors.length ? 1 : 0);
