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
  await page.goto(`http://127.0.0.1:${PORT}/?name=Viewer&autojoin=1&quality=${quality}${extra}`);
  const t = Date.now();
  while (Date.now() - t < 120_000) {
    if (await page.evaluate(() => { const a = window.__cn?.assets(); return a?.environment === 'ready' && a?.watcher === 'ready'; })) break;
    await sleep(500);
  }
  await page.evaluate(() => document.querySelectorAll('.hud, .panel, .overlay, header, footer').forEach((e) => { e.style.visibility = 'hidden'; }));
  const info = {};
  for (const [name, v] of Object.entries(VIEWS)) {
    await page.evaluate((v) => { window.__cnView = v ?? undefined; }, v);
    await sleep(3500);
    await page.screenshot({ path: `${out}/${name}.png` });
    info[name] = await page.evaluate(() => window.__cn.renderInfo());
  }
  writeFileSync(`${out}/views.json`, JSON.stringify({ quality, date: new Date().toISOString(), renderer: 'SwiftShader', errors, renderInfo: info }, null, 2));
  console.log(JSON.stringify({ out, errors, renderInfo: info }, null, 2));
} finally {
  await browser?.close();
  worker.stop();
}
process.exit(errors.length ? 1 : 0);
