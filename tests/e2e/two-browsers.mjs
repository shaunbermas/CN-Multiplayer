// Two real browsers in one room (GDD M0 / §11.2) plus the S1-3 viewpoint screenshots.
//  - two Chromium contexts join through the web app and each sees both players
//  - player A walks forward with the W key; player B sees A move; A's prediction matches the server
//  - screenshots: A's third-person view at spawn (Shepherd readability), A after walking, B's view
// Builds the web app first. Usage: node tests/e2e/two-browsers.mjs
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { root, sleep, startPreview, startServer, writeReport } from '../lib.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const SERVER_PORT = Number(process.env.E2E_SERVER_PORT ?? 2597);
const WEB_PORT = Number(process.env.E2E_WEB_PORT ?? 4197);
const shots = `${root}tests/reports/screenshots`;
mkdirSync(shots, { recursive: true });
execSync('npm run build', { cwd: root, stdio: 'ignore' });
const errors = [];
const server = startServer(SERVER_PORT);
const web = startPreview(WEB_PORT);
let browser;

const players = (page) => page.evaluate(() => window.__cn.players());
const waitFor = async (fn, label, ms = 30_000) => {
  const t = Date.now();
  while (Date.now() - t < ms) { if (await fn()) return; await sleep(200); }
  throw new Error(`Timed out: ${label}`);
};

try {
  await Promise.all([server.ready, web.ready]);
  browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const url = (name) => `http://127.0.0.1:${WEB_PORT}/?name=${name}&autojoin=1&server=ws://127.0.0.1:${SERVER_PORT}`;
  const ctxA = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const ctxB = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const pageA = await ctxA.newPage();
  const pageB = await ctxB.newPage();
  const consoleErrors = [];
  for (const [tag, p] of [['A', pageA], ['B', pageB]]) {
    p.on('pageerror', (e) => consoleErrors.push(`${tag}: ${e}`));
    p.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(`${tag}: ${m.text()}`); });
  }
  await pageA.goto(url('Alpha'));
  await pageB.goto(url('Beta'));
  await waitFor(async () => (await pageA.evaluate(() => !!window.__cn)) && (await pageB.evaluate(() => !!window.__cn)), 'both pages joined');
  await waitFor(async () => (await players(pageA)).length === 2 && (await players(pageB)).length === 2, 'both see 2 players');
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
  const fromB = (await players(pageB)).find((p) => p.id === idA);
  const serverA = (await players(pageA)).find((p) => p.id === idA);
  const predicted = await pageA.evaluate(() => window.__cn.self());
  const moved = zBefore - fromB.z;
  if (!(moved > 8)) errors.push(`Player A moved only ${moved.toFixed(2)} m as seen by B (expected > 8 m in 4 s)`);
  const predictionError = Math.hypot(predicted.x - serverA.x, predicted.z - serverA.z);
  if (predictionError > 0.5) errors.push(`Prediction differs from the server by ${predictionError.toFixed(2)} m after stopping`);
  await pageA.screenshot({ path: `${shots}/s1-3_after_walk.png` });
  await pageB.screenshot({ path: `${shots}/s1-3_other_player_view.png` });
  if (consoleErrors.length) errors.push(...consoleErrors);

  const report = {
    result: errors.length ? 'FAIL' : 'PASS',
    errors,
    date: new Date().toISOString(),
    same_room: roomA === roomB,
    both_see_players: 2,
    walk_4s: { moved_m_seen_by_other_browser: +moved.toFixed(2), prediction_error_m: +predictionError.toFixed(3) },
    screenshots: ['s1-3_start_view.png', 's1-3_after_walk.png', 's1-3_other_player_view.png'].map((f) => `tests/reports/screenshots/${f}`),
    renderer: 'headless Chromium, software WebGL (SwiftShader)',
  };
  writeReport('e2e-two-browsers.json', report);
  console.log(JSON.stringify(report, null, 2));
} catch (e) {
  errors.push(String(e?.stack ?? e));
  console.error(e);
} finally {
  await browser?.close();
  server.stop();
  web.stop();
}
process.exit(errors.length ? 1 : 0);
