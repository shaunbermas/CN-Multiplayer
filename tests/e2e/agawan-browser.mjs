// Stage 02 · AGAWAN BASE in a real browser, against the Worker under `wrangler dev` (test rooms may play Agawan before
// it is switched on). One person and bots, through the web app:
//  - the Christmas street draws (named parts present), with no page errors and a modest draw-call count
//  - no Red Light signal (GO / STOP) during Agawan; the HUD shows the timer, three team scores and your team
//  - every contestant has a team ring; Tab opens the team status board with all three teams
//  - the stage ends on the Agawan results board: three ranked teams, winners first
// Screenshots go to tests/reports/screenshots/stage02-*.png. Usage: npm run test:e2e:agawan
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { root, sleep, startWorker, writeReport } from '../lib.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const PORT = Number(process.env.E2E_PORT ?? 8799);
const ROUND_S = 45;
const shots = `${root}tests/reports/screenshots`;
mkdirSync(shots, { recursive: true });
if (process.env.SKIP_BUILD !== '1') execSync('npm run build', { cwd: root, stdio: 'ignore' });
const errors = [];
const check = (ok, msg) => { if (!ok) errors.push(msg); return ok; };
const report = {};
const worker = startWorker(PORT);
let browser;
try {
  await worker.ready;
  browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  await page.goto(`http://127.0.0.1:${PORT}/?name=Tester&autojoin=1&quality=low&teams=1&startStage=STAGE_02_AGAWAN_BASE&testSeed=11&testRound=${ROUND_S}&testBriefing=1&testResults=60`);
  await page.waitForSelector('[data-testid=teams]', { timeout: 60_000 });
  for (let i = 0; i < 2; i++) { await page.click('[data-testid=add-bots]'); await sleep(400); }
  await page.click('[data-testid=team-auto-captains]');
  await sleep(600);
  await page.click('[data-testid=start]');
  await page.waitForSelector('[data-testid=agawan-top]', { timeout: 60_000 });
  await sleep(2500);

  const scene = await page.evaluate(() => {
    const t = window.__cnThree; const names = new Set();
    t.scene.traverse((o) => { if (o.name) names.add(o.name); });
    t.gl.info.autoReset = false; t.gl.info.reset(); t.gl.render(t.scene, t.camera);
    const i = t.gl.info; const out = { calls: i.render.calls, triangles: i.render.triangles, points: i.render.points };
    t.gl.info.autoReset = true;
    const rings = t.scene.getObjectByName('S02A_TEAM_RINGS');
    return { ...out, names: [...names].filter((n) => /^S02A_|^STG02/.test(n)), rings: rings ? rings.count : -1, players: window.__cn.players().length };
  });
  report.scene = scene;
  for (const n of ['STG02_AGAWAN_BASE', 'S02A_STREET_SOLID', 'S02A_STREET_GLOW', 'S02A_STRING_LIGHTS', 'S02A_GLOWS', 'S02A_PEN_FENCES', 'S02A_BASE_MARKERS']) check(scene.names.includes(n), `scene part missing: ${n}`);
  check(scene.calls > 0 && scene.calls < 140, `draw calls ${scene.calls}`);
  check(scene.rings === scene.players, `team rings ${scene.rings} for ${scene.players} players`);

  const hud = await page.evaluate(() => ({
    signal: !!document.querySelector('[data-testid=signal]'),
    scores: ['A', 'B', 'C'].map((s) => !!document.querySelector(`[data-testid=agawan-score-${s}]`)),
    team: document.querySelector('[data-testid=agawan-team]')?.textContent ?? '',
    timer: document.querySelector('[data-testid=timer]')?.textContent ?? '',
  }));
  report.hud = hud;
  check(!hud.signal, 'a Red Light signal is showing during Agawan Base');
  check(hud.scores.every(Boolean), 'three team scores');
  check(/Base [ABC]/.test(hud.team), `your team chip: ${hud.team}`);
  await page.screenshot({ path: `${shots}/stage02-start.png` });

  await page.keyboard.down('KeyW'); await sleep(1800); await page.keyboard.up('KeyW');
  await page.keyboard.down('Tab'); await sleep(500);
  const status = await page.evaluate(() => document.querySelectorAll('[data-testid=agawan-status] .ag-col').length);
  await page.screenshot({ path: `${shots}/stage02-team-status.png` });
  await page.keyboard.up('Tab'); await sleep(300);
  const closed = await page.evaluate(() => !document.querySelector('[data-testid=agawan-status]'));
  check(status === 3, `team status columns ${status}`);
  check(closed, 'team status stays open after Tab is released');

  await page.waitForSelector('[data-testid=agawan-results]', { timeout: (ROUND_S + 60) * 1000 });
  await sleep(600);
  const res = await page.evaluate(() => [...document.querySelectorAll('[data-testid^=agawan-rank-]')].map((li) => ({ id: li.getAttribute('data-testid'), place: Number(li.querySelector('.pl')?.textContent) })));
  report.results = res;
  check(res.length === 3, `ranked teams ${res.length}`);
  check(res.every((r, i) => i === 0 || r.place >= res[i - 1].place), 'teams listed by place');
  await page.screenshot({ path: `${shots}/stage02-results.png` });
  report.pageErrors = pageErrors;
  check(pageErrors.length === 0, `page errors: ${pageErrors.join(' | ')}`);
} catch (e) {
  errors.push(String(e?.stack ?? e));
} finally {
  await browser?.close();
  worker.stop();
}
report.errors = errors;
report.passed = errors.length === 0;
writeReport('stage02-agawan-browser.json', report);
console.log(JSON.stringify(report, null, 2));
process.exit(errors.length ? 1 : 0);
