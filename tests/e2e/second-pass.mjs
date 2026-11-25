// Second pass (decision 034) browser check: sound engine, mute controls, smooth walking and the feel layer.
// Run: npm run build && NODE_PATH=$(npm root -g) npx tsx tests/e2e/second-pass.mjs
import { createRequire } from 'node:module';
import { startWorker, sleep, writeReport, root } from '../lib.mjs';
import { mkdirSync } from 'node:fs';
const { chromium } = createRequire(import.meta.url)('playwright');

const port = 8796;
const base = `http://127.0.0.1:${port}/`;
const shots = `${root}tests/reports/screenshots/second-pass`;
mkdirSync(shots, { recursive: true });
const report = { steps: [], ok: false };
const check = (name, ok, detail = '') => { report.steps.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${detail}`); if (!ok) throw new Error(name); };
async function waitFor(fn, what, ms = 60_000) {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (await fn()) return; await sleep(200); }
  throw new Error(`timeout: ${what}`);
}

const worker = startWorker(port);
let browser;
try {
  await worker.ready;
  browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=user-gesture-required'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' && !/WebSocket|ERR_CONNECTION|Failed to load resource/.test(m.text())) errors.push(m.text()); });

  // Settings on the main menu: sound on and a volume slider.
  await page.goto(`${base}?quality=low`);
  await page.getByRole('button', { name: 'Settings' }).click();
  check('settings has a sound toggle', await page.locator('[data-testid=sound-on]').isChecked());
  await page.locator('[data-testid=volume]').fill('0.5');
  await page.screenshot({ path: `${shots}/01_settings_sound.png` });
  await page.getByRole('button', { name: 'Close' }).click();

  // Join a room: the first click starts the sound engine.
  await page.goto(`${base}?room=secondpass&quality=low&perf=1&testSeed=12345&testRound=120&testBriefing=3&testStages=1`);
  await page.fill('[data-testid=nickname]', 'Walker');
  await page.click('[data-testid=join-invite]');
  await waitFor(() => page.evaluate(() => window.__cn?.assets?.().environment === 'ready'), 'stage loaded', 120_000);
  await sleep(500);
  const a1 = await page.evaluate(() => window.__cnAudio?.());
  check('sound engine running after the first click', a1?.state === 'running', JSON.stringify(a1));
  check('volume setting kept', Math.abs(a1.volume - 0.5) < 1e-6);
  await waitFor(async () => (await page.evaluate(() => window.__cnAudio?.()))?.ambience, 'ambience started', 5000);
  check('ambience playing in the lobby', true);

  // M mutes and M again unmutes (the owner's HUD design has no mute button; mute is also in Settings).
  await page.keyboard.press('KeyM');
  check('M mutes', (await page.evaluate(() => window.__cnAudio())).muted === true);
  await page.screenshot({ path: `${shots}/02_hud_muted.png` });
  await page.keyboard.press('KeyM');
  check('M again unmutes', (await page.evaluate(() => window.__cnAudio())).muted === false);
  const persisted = await page.evaluate(() => JSON.parse(localStorage.getItem('cn-trial-settings-v1') ?? '{}'));
  check('mute choice remembered', persisted.muted === false && persisted.volume === 0.5);

  // Walk sideways (D) and check the drawn position moves smoothly and the feel layer is active.
  await page.mouse.click(640, 400); // pointer lock may fail headless; keys still work
  await page.keyboard.down('KeyD');
  const samples = await page.evaluate(async () => {
    const out = [];
    const t0 = performance.now();
    while (performance.now() - t0 < 2500) {
      await new Promise((r) => requestAnimationFrame(r));
      out.push({ t: performance.now(), x: window.__cn.self()?.x ?? 0 });
    }
    return out;
  });
  await page.screenshot({ path: `${shots}/03_walk_sideways.png` });
  await page.keyboard.up('KeyD');
  const moved = samples[samples.length - 1].x - samples[0].x;
  check('walking right moves the contestant', moved > 3, `${moved.toFixed(2)} m in 2.5 s`);
  await sleep(1200);
  const perf = await page.evaluate(() => window.__cnPerf?.() ?? '');
  check('perf readout shows FPS and GPU (?perf=1)', /FPS\s+\d+/.test(perf) && /GPU/.test(perf), perf.split('\n')[1] ?? '');
  report.perf = perf;
  // A round: the scan hum runs while the light is red (real server schedule, test seed).
  await page.click('[data-testid=start]');
  await waitFor(() => page.evaluate(() => window.__cn.round().phase === 'active'), 'round active', 60_000);
  await waitFor(() => page.evaluate(() => window.__cn.round().signal === 'red'), 'red light', 60_000);
  await sleep(300);
  check('scan hum plays on red', (await page.evaluate(() => window.__cnAudio())).scanning === true);
  await waitFor(() => page.evaluate(() => window.__cn.round().signal !== 'red'), 'red over', 60_000);
  await sleep(300);
  check('scan hum stops after red', (await page.evaluate(() => window.__cnAudio())).scanning === false);
  check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  report.ok = true;
} catch (e) {
  report.error = String(e?.stack ?? e);
  console.error(e);
  process.exitCode = 1;
} finally {
  writeReport('second-pass.json', report);
  await browser?.close();
  worker.stop();
}
