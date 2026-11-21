// Two real browsers in one room (GDD M0 / §11.2) plus the S1-3 viewpoint screenshots, against the
// Cloudflare Worker (page + Durable Object room) running under `wrangler dev`.
//  - two Chromium contexts join through the web app and each sees both players
//  - player A walks forward with the W key; player B sees A move; A's prediction matches the server
//  - Prompt 07: both browsers load the Stage 01 environment GLB and THE_WATCHER.glb with no asset problems
//    (28 m Watcher, every clip present); The Watcher's clip follows the server signal (green / red);
//    the spotted player sees the spectator status, results show qualified / eliminated tags
//  - screenshots: A's third-person view at spawn (Watcher readability), A after walking, B's view
// Builds the web app first. Usage: npm run test:e2e
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { root, sleep, startWorker, writeReport } from '../lib.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const PORT = Number(process.env.E2E_PORT ?? 8797);
const shots = `${root}tests/reports/screenshots`;
mkdirSync(shots, { recursive: true });
if (process.env.SKIP_BUILD !== '1') execSync('npm run build', { cwd: root, stdio: 'ignore' });
const errors = [];
let greenClip = '', redClip = '', assetA = { watcherHeight: 0, watcherClips: [], quality: '', problems: [] };
const worker = startWorker(PORT);
let browser;

const players = (page) => page.evaluate(() => window.__cn.players());
const waitFor = async (fn, label, ms = 30_000) => {
  const t = Date.now();
  while (Date.now() - t < ms) { if (await fn()) return; await sleep(200); }
  throw new Error(`Timed out: ${label}`);
};

try {
  await worker.ready;
  browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  // Low lighting tier (STAGE_01_LIGHTING.json): software WebGL in CI; the stage assets are the same.
  const url = (name, extra = '') => `http://127.0.0.1:${PORT}/?name=${name}&autojoin=1&quality=low${extra}`;
  const ctxA = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const ctxB = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const pageA = await ctxA.newPage();
  const pageB = await ctxB.newPage();
  // Simulate a slow computer for player A (low frame rate): movement speed must not depend on frame rate.
  const throttle = Number(process.env.E2E_CPU_THROTTLE ?? 6);
  if (throttle > 1) await (await ctxA.newCDPSession(pageA)).send('Emulation.setCPUThrottlingRate', { rate: throttle });
  const consoleErrors = [];
  for (const [tag, p] of [['A', pageA], ['B', pageB]]) {
    p.on('pageerror', (e) => consoleErrors.push(`${tag}: ${e}`));
    p.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(`${tag}: ${m.text()}`); });
  }
  // Alpha joins first, so Alpha is the host; the test seed makes the round deterministic (test mode only).
  await pageA.goto(url('Alpha', '&testSeed=12345&testRound=20&testBriefing=1'));
  await waitFor(async () => pageA.evaluate(() => !!window.__cn), 'Alpha joined first (host)');
  await pageB.goto(url('Beta'));
  await waitFor(async () => (await pageA.evaluate(() => !!window.__cn)) && (await pageB.evaluate(() => !!window.__cn)), 'both pages joined');
  await waitFor(async () => (await players(pageA)).length === 2 && (await players(pageB)).length === 2, 'both see 2 players');
  const assets = (page) => page.evaluate(() => window.__cn.assets());
  await waitFor(async () => { const a = await assets(pageA), b = await assets(pageB);
    return a.environment === 'ready' && a.watcher === 'ready' && b.environment === 'ready' && b.watcher === 'ready'; }, 'Stage 01 assets loaded in both browsers', 90_000);
  assetA = await assets(pageA);
  if (assetA.problems.length) errors.push(`Asset problems: ${assetA.problems.join('; ')}`);
  if (Math.abs(assetA.watcherHeight - 28) > 0.2) errors.push(`Watcher height ${assetA.watcherHeight} m in the browser, expected 28`);
  const roomA = await pageA.evaluate(() => window.__cn.roomId);
  const roomB = await pageB.evaluate(() => window.__cn.roomId);
  if (roomA !== roomB) errors.push(`Different rooms: ${roomA} vs ${roomB}`);
  await sleep(1500); // let the stage render and the camera settle
  await pageA.screenshot({ path: `${shots}/s1-3_start_view.png` });

  const idA = await pageA.evaluate(() => window.__cn.sessionId);
  const zBefore = (await players(pageB)).find((p) => p.id === idA).z;
  await pageA.bringToFront();
  await pageA.keyboard.down('KeyW');
  await sleep(4000);
  await pageA.keyboard.up('KeyW');
  await sleep(800);
  // After stopping, the server finishes applying queued inputs; prediction and server must then agree.
  let serverA, predicted;
  const settleStart = Date.now();
  do {
    serverA = (await players(pageA)).find((p) => p.id === idA);
    predicted = await pageA.evaluate(() => window.__cn.self());
    if (Math.hypot(predicted.x - serverA.x, predicted.z - serverA.z) <= 0.05) break;
    await sleep(250);
  } while (Date.now() - settleStart < 5000);
  const fromB = (await players(pageB)).find((p) => p.id === idA);
  const moved = zBefore - fromB.z;
  if (!(moved > 8)) errors.push(`Player A moved only ${moved.toFixed(2)} m as seen by B (expected > 8 m in 4 s)`);
  const predictionError = Math.hypot(predicted.x - serverA.x, predicted.z - serverA.z);
  if (predictionError > 0.5) errors.push(`Prediction differs from the server by ${predictionError.toFixed(2)} m after stopping`);
  await pageA.screenshot({ path: `${shots}/s1-3_after_walk.png` });
  await pageB.screenshot({ path: `${shots}/s1-3_other_player_view.png` });

  // ---- S1-4: a full round through the UI. Alpha (host) starts; Beta keeps walking into the red light.
  const round = (page) => page.evaluate(() => window.__cn.round());
  await pageA.locator('[data-testid=start]').click();
  // Player A is CPU-throttled, so the click can resolve after the 1 s test briefing: accept any started phase.
  await waitFor(async () => (await round(pageB)).phase !== 'lobby', 'round started (seen by Beta)');
  await waitFor(async () => (await round(pageA)).phase === 'active', 'round active', 15_000);
  // Round screenshots and clip checks come from Beta (not CPU-throttled), so they fit inside the signal windows.
  await pageB.bringToFront();
  await waitFor(async () => (await round(pageB)).signal === 'green', 'green signal', 10_000);
  await sleep(2000); // past the turn-away clip
  greenClip = (await assets(pageB)).watcherClip;
  if (!['Watcher_GreenSignal', 'Watcher_TurnAway'].includes(greenClip)) errors.push(`Watcher shows ${greenClip} on GREEN`);
  await pageB.screenshot({ path: `${shots}/s1-4_green_view.png` });
  await pageB.keyboard.down('KeyW');
  await waitFor(async () => (await round(pageB)).signal === 'red', 'red light', 15_000);
  await sleep(700);
  redClip = (await assets(pageB)).watcherClip;
  if (!['Watcher_FocusLock', 'Watcher_RedSignal', 'Watcher_ScanSweep', 'Watcher_Detect'].includes(redClip)) errors.push(`Watcher shows ${redClip} on RED`);
  await pageB.screenshot({ path: `${shots}/s1-4_red_view.png` });
  const idB = await pageB.evaluate(() => window.__cn.sessionId);
  await waitFor(async () => (await players(pageA)).find((p) => p.id === idB)?.status === 'spotted', 'Beta spotted', 5000);
  await sleep(2600); // past the SPOTTED! stamp
  if (!(await pageB.locator('[data-testid=spectating]').count())) errors.push('Spotted player does not see the spectator status');
  await pageB.screenshot({ path: `${shots}/s1-4_spotted_view.png` });
  await pageB.keyboard.up('KeyW');
  const alphaStatus = (await players(pageA)).find((p) => p.id === idA)?.status;
  if (alphaStatus !== 'active') errors.push(`Alpha (standing still) ended up ${alphaStatus}`);
  await waitFor(async () => (await round(pageA)).phase === 'results', 'results', 30_000);
  await sleep(600);
  const results = await pageA.evaluate(() => window.__cn.results());
  if (results.map((r) => r.name).join() !== 'Alpha,Beta') errors.push(`Results order ${results.map((r) => r.name).join(', ')}`);
  if (results.find((r) => r.name === 'Beta')?.status !== 'spotted') errors.push('Beta is not spotted in the results');
  const meta = await pageA.evaluate(() => window.__cn.resultsMeta());
  if (meta?.stage !== 'STAGE_01_RED_LIGHT' || !(meta?.roundId >= 1)) errors.push(`Results meta ${JSON.stringify(meta)}`);
  if (!(await pageA.locator('.results .tag.out').count())) errors.push('Results screen has no eliminated tag');
  await pageA.screenshot({ path: `${shots}/s1-4_results_view.png` });
  if (consoleErrors.length) errors.push(...consoleErrors);

  const report = {
    result: errors.length ? 'FAIL' : 'PASS',
    errors,
    date: new Date().toISOString(),
    same_room: roomA === roomB,
    both_see_players: 2,
    walk_4s: { moved_m_seen_by_other_browser: +moved.toFixed(2), prediction_error_m: +predictionError.toFixed(3) },
    round: { results: 'Alpha (stood still) 1st, Beta (walked into red) spotted', watcher_clips: { green: greenClip, red: redClip } },
    assets: { watcher_height_m: assetA.watcherHeight, clips: assetA.watcherClips.length, quality: assetA.quality, problems: assetA.problems },
    screenshots: ['s1-3_start_view.png', 's1-3_after_walk.png', 's1-3_other_player_view.png', 's1-4_green_view.png', 's1-4_red_view.png', 's1-4_spotted_view.png', 's1-4_results_view.png'].map((f) => `tests/reports/screenshots/${f}`),
    renderer: 'headless Chromium, software WebGL (SwiftShader)',
    player_a_cpu_throttle: throttle,
  };
  writeReport('e2e-two-browsers.json', report);
  console.log(JSON.stringify(report, null, 2));
} catch (e) {
  errors.push(String(e?.stack ?? e));
  console.error(e);
} finally {
  await browser?.close();
  worker.stop();
}
process.exit(errors.length ? 1 : 0);
