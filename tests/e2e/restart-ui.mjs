// Restart game buttons (owner request, 25 Nov 2026): the host sees ↻ Restart during a match, confirms inline,
// and the match starts again at stage 1; the final results offer ↻ Restart game.
// Run: npm run build && NODE_PATH=$(npm root -g) npx tsx tests/e2e/restart-ui.mjs
import { createRequire } from 'node:module';
import { startWorker, sleep, writeReport, root } from '../lib.mjs';
import { mkdirSync } from 'node:fs';
const { chromium } = createRequire(import.meta.url)('playwright');

const port = 8798;
const base = `http://127.0.0.1:${port}/`;
const shots = `${root}tests/reports/screenshots/restart`;
mkdirSync(shots, { recursive: true });
const report = { steps: [], ok: false };
const check = (name, ok, detail = '') => { report.steps.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${detail}`); if (!ok) throw new Error(name); };
async function waitFor(fn, what, ms = 60_000) {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (await fn()) return; await sleep(200); }
  throw new Error(`timeout: ${what}`);
}
// The software-rendered test browser draws a frame every few hundred ms, so click through the DOM rather than
// waiting for Playwright's stability checks (the inline confirm closes itself after 8 s).
const press = (page, id) => page.locator(`[data-testid=${id}]`).evaluate((el) => el.click());
const phase = (page) => page.locator('[data-testid=hud]').getAttribute('data-phase');

const worker = startWorker(port);
let browser;
try {
  await worker.ready;
  browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`${base}?room=restartui&quality=low&testSeed=4242&testRound=20&testBriefing=2&testStages=1&testResults=30`);
  await page.fill('[data-testid=nickname]', 'Host');
  await page.click('[data-testid=join-invite]');
  await waitFor(() => page.evaluate(() => window.__cn?.assets?.().environment === 'ready'), 'stage loaded', 120_000);
  check('no restart button in the lobby', (await page.locator('[data-testid=restart]').count()) === 0);
  await press(page, 'add-bots');
  await press(page, 'start');
  await waitFor(async () => (await phase(page)) === 'active', 'match active', 30_000);
  check('host sees Restart during the match', await page.locator('[data-testid=restart]').isVisible());
  await press(page, 'restart');
  check('restart asks first', await page.locator('[data-testid=restart-ask]').isVisible());
  await page.screenshot({ path: `${shots}/01_restart_confirm.png` });
  await press(page, 'restart-no');
  check('cancel keeps playing', (await phase(page)) === 'active' && (await page.locator('[data-testid=restart]').isVisible()));
  await press(page, 'restart');
  await press(page, 'restart-yes');
  await waitFor(async () => (await phase(page)) === 'briefing', 'briefing after restart', 5_000);
  check('confirming restarts at the briefing of stage 1', (await page.locator('[data-testid=hud]').getAttribute('data-stage')) === '1');
  await page.screenshot({ path: `${shots}/02_after_restart.png` });

  await waitFor(async () => (await page.locator('[data-testid=final]').count()) > 0, 'final results', 60_000);
  check('final results offer Restart game', await page.locator('[data-testid=play-again]').isVisible());
  await page.screenshot({ path: `${shots}/03_final_restart.png` });
  await press(page, 'play-again');
  await waitFor(async () => (await phase(page)) === 'briefing', 'briefing after restart from final', 5_000);
  check('Restart game on the final results starts a new match', true);
  check('no page errors', errors.length === 0, errors.join(' | '));
  report.ok = true;
} catch (e) {
  report.error = String(e);
  console.error(e);
} finally {
  await browser?.close();
  worker.stop();
  writeReport('restart-ui.json', report);
}
process.exit(report.ok ? 0 : 1);
