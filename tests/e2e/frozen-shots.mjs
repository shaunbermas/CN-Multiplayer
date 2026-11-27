// Decision 054 review pictures: a contestant frozen in ice after moving in a red light, the Frozen banner, and the
// thaw countdown after the next GO. One browser plus ten random players in a seeded test round; the host pauses the
// room right after the catch to hold the moment for the close-ups (the pause panel is hidden in those pictures).
// Usage: NODE_PATH=$(npm root -g) npx tsx tests/e2e/frozen-shots.mjs [outDir]
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { root, sleep, startWorker } from '../lib.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const PORT = Number(process.env.SHOTS_PORT ?? 8794);
const out = process.argv[2] ?? `${root}tests/reports/screenshots/frozen`;
mkdirSync(out, { recursive: true });
if (process.env.SKIP_BUILD !== '1') execSync('npm run build', { cwd: root, stdio: 'ignore' });
const worker = startWorker(PORT);
let browser;
const waitFor = async (fn, label, ms = 60_000) => {
  const t = Date.now();
  while (Date.now() - t < ms) { if (await fn()) return; await sleep(150); }
  throw new Error(`Timed out: ${label}`);
};
try {
  await worker.ready;
  browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 810 }, deviceScaleFactor: 1 })).newPage();
  page.on('pageerror', (e) => console.error('pageerror', e));
  await page.goto(`http://127.0.0.1:${PORT}/?name=Nomad&autojoin=1&quality=${process.env.SHOTS_QUALITY ?? 'medium'}&testSeed=777&testRound=90&testBriefing=1&testStages=1&obstacles=0`);
  await waitFor(() => page.evaluate(() => !!window.__cn), 'joined');
  await waitFor(async () => { const a = await page.evaluate(() => window.__cn.assets()); return a.environment === 'ready' && a.watcher === 'ready'; }, 'assets', 120_000);
  await page.locator('[data-testid=add-bots]').click({ noWaitAfter: true, timeout: 60_000 });
  await sleep(500);
  await page.locator('[data-testid=add-bots]').click({ noWaitAfter: true, timeout: 60_000 });
  await sleep(800);
  await page.locator('[data-testid=start]').click({ noWaitAfter: true, timeout: 60_000 });
  await waitFor(async () => (await page.evaluate(() => window.__cn.round().phase)) === 'active', 'active', 60_000);
  const id = await page.evaluate(() => window.__cn.sessionId);
  const me = async () => (await page.evaluate(() => window.__cn.players())).find((p) => p.id === id);
  // Pause the instant the Frozen banner appears (and again when the thaw countdown shows): software WebGL draws a
  // frame every second or two, so polling from here would miss the short freeze.
  await page.evaluate((waiting) => {
    window.__shot = 'wait-freeze';
    const pressP = () => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyP', key: 'p' }));
    new MutationObserver(() => {
      const confirmed = () => (window.__cn.players().find((p) => p.id === window.__cn.sessionId)?.frozen ?? 0) > 0;
      const sel = waiting ? '[data-testid=frozen][data-thawing="0"]' : '[data-testid=frozen]';
      if (window.__shot === 'wait-freeze' && document.querySelector(sel) && confirmed()) { window.__shot = 'paused-freeze'; pressP(); }
      if (window.__shot === 'wait-thaw' && document.querySelector('[data-testid=frozen][data-thawing="1"]')) { window.__shot = 'paused-thaw'; pressP(); }
    }).observe(document.body, { subtree: true, childList: true, attributes: true });
  }, !!process.env.WAITING);
  await page.keyboard.down('KeyW');
  if (process.env.SHOTS_DEBUG) for (let i = 0; i < 25; i++) {
    console.log(JSON.stringify(await page.evaluate((id) => { const m = window.__cn.players().find((p) => p.id === id); const s = window.__cn.self(); const r = window.__cn.round(); return { t: r.elapsed, sig: r.signal, z: m.z.toFixed(2), sz: s?.z?.toFixed(2), fr: m.frozen, tp: m.tp, shot: window.__shot, ev: window.__cn.events().filter((e) => e.kind === 'spotted').map((e) => e.roundT) }; }, id)));
    await sleep(300);
  }
  await waitFor(() => page.evaluate(() => window.__shot === 'paused-freeze'), 'frozen', 90_000).catch(async (e) => {
    console.log(JSON.stringify(await page.evaluate(() => ({ events: window.__cn.events(), round: window.__cn.round(), self: window.__cn.self() }))));
    throw e;
  });
  await page.keyboard.up('KeyW');
  await waitFor(() => page.evaluate(() => !!window.__cn.round().paused), 'paused', 20_000);
  await page.addStyleTag({ content: '[data-testid=pause-menu]{display:none!important}' });
  await sleep(1500);
  if (process.env.SHOTS_DEBUG) console.log(JSON.stringify(await page.evaluate((id) => ({ me: window.__cn.players().find((p) => p.id === id), self: window.__cn.self(), round: window.__cn.round(), events: window.__cn.events(), banner: document.querySelectorAll('[data-testid=frozen]').length }), id)));
  await page.screenshot({ path: `${out}/1-frozen-third-person.png` });
  const p = await me();
  await page.evaluate(({ x, z }) => { window.__cnView = { pos: [x - 1.5, 1.6, z - 3.0], look: [x, 0.95, z] }; }, p);
  await sleep(800);
  await page.screenshot({ path: `${out}/2-frozen-close-up.png` });
  const bot = (await page.evaluate(() => window.__cn.players())).find((q) => q.bot && q.frozen > 0);
  if (bot) {
    await page.evaluate(({ x, z }) => { window.__cnView = { pos: [x + 2.2, 2.0, z - 3.2], look: [x, 0.9, z] }; }, bot);
    await sleep(800);
    await page.screenshot({ path: `${out}/3-frozen-other-player.png` });
  }
  await page.evaluate(() => { delete window.__cnView; window.__shot = 'wait-thaw'; });
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyP', key: 'p' }))); // resume
  const thawShot = await waitFor(() => page.evaluate(() => window.__shot === 'paused-thaw'), 'thawing', 60_000).then(() => true, () => false);
  if (thawShot) {
    await waitFor(() => page.evaluate(() => !!window.__cn.round().paused), 'paused again', 20_000);
    await sleep(1500);
    await page.screenshot({ path: `${out}/4-thaw-countdown.png` });
  } else console.log('thaw countdown picture skipped: the slow software renderer missed the 2 s countdown');
  console.log(JSON.stringify({ ok: true, out, botFrozen: !!bot }));
} catch (e) {
  console.error(e);
  process.exitCode = 1;
} finally {
  await browser?.close();
  worker.stop();
}
process.exit(process.exitCode ?? 0);
