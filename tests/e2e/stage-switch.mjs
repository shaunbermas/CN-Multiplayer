// Stage switches in a real browser, against the Worker under `wrangler dev` (owner report, 26 Nov 2026: after
// switching from Stage 01 to Stage 02 the Agawan street came up empty, with only the floor, base poles, lights and pen).
// Each scene mounts again on a switch, so this checks the geometry that is actually in the scene each time, not just
// that the meshes exist by name:
//  - lobby: Stage 01 -> 02 -> 01 -> 02 -> 03 -> 02; every Stage 02 visit shows the full street (houses and windows)
//  - match: after a look at Stage 02 in the lobby, a match that starts at Stage 01 moves on to Stage 02 with the full street
//  - no page errors on any switch
// Screenshots go to tests/reports/screenshots/switch-*.png. Usage: npm run test:e2e:switch
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
const check = (ok, msg) => { if (!ok) errors.push(msg); return ok; };
const report = { lobby: [], match: null };
const worker = startWorker(PORT);
let browser;

/** What the Stage 02 street holds right now, read from the live scene graph. */
const streetNow = (page) => page.evaluate(() => {
  const t = window.__cnThree;
  const count = (name) => t.scene.getObjectByName(name)?.geometry?.getAttribute('position')?.count ?? -1;
  return {
    stage: window.__cn?.stage,
    solid: count('S02A_STREET_SOLID'),
    glow: count('S02A_STREET_GLOW'),
    bulbs: count('S02A_STRING_LIGHTS'),
    agawanRoot: !!t.scene.getObjectByName('STG02_AGAWAN_BASE'),
  };
});

/** Waits until the scene shows the stage, then lets a few frames render. */
async function waitStage(page, id) {
  await page.waitForFunction((s) => window.__cn?.stage === s && !!window.__cnThree, id, { timeout: 30_000 });
  await sleep(1200);
}

// The full street merges thousands of vertices; an empty merge has 0. Half of the first visit is a generous floor.
let fullSolid = 0;
function checkStreet(label, s) {
  check(s.agawanRoot, `${label}: Stage 02 scene root missing`);
  check(s.solid > 1000, `${label}: street houses and props are empty (${s.solid} vertices)`);
  check(s.glow > 100, `${label}: windows and signs are empty (${s.glow} vertices)`);
  check(s.bulbs > 0, `${label}: string lights missing`);
  if (!fullSolid) fullSolid = s.solid;
  else check(s.solid >= fullSolid * 0.5, `${label}: street has ${s.solid} vertices, first visit had ${fullSolid}`);
}

try {
  await worker.ready;
  browser = await chromium.launch();

  // ---- Lobby: the host flips the starting stage back and forth.
  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const pageErrors = [];
    page.on('pageerror', (e) => pageErrors.push(e.message));
    await page.goto(`http://127.0.0.1:${PORT}/?name=Host&autojoin=1&quality=low&room=switch-lobby&startStage=STAGE_01_RED_LIGHT`);
    await page.waitForSelector('[data-testid=lobby-stage]', { timeout: 60_000 });
    await waitStage(page, 'STAGE_01_RED_LIGHT');
    const path = [['02', 'STAGE_02_AGAWAN_BASE'], ['01', 'STAGE_01_RED_LIGHT'], ['02', 'STAGE_02_AGAWAN_BASE'], ['03', 'STAGE_03_THE_HUNT'], ['02', 'STAGE_02_AGAWAN_BASE']];
    let visit = 0;
    for (const [n, id] of path) {
      await page.click(`[data-testid=lobby-stage-${n}]`);
      await waitStage(page, id);
      if (id !== 'STAGE_02_AGAWAN_BASE') continue;
      visit++;
      const s = await streetNow(page);
      report.lobby.push({ visit, ...s });
      checkStreet(`lobby visit ${visit}`, s);
      await page.screenshot({ path: `${shots}/switch-lobby-stage02-visit${visit}.png` });
    }
    check(pageErrors.length === 0, `lobby page errors: ${pageErrors.join(' | ')}`);
    await page.close();
  }

  // ---- Match: Stage 01 plays out, then the match moves on to Stage 02.
  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const pageErrors = [];
    page.on('pageerror', (e) => pageErrors.push(e.message));
    // A fresh browser starts the lobby at Stage 01. Peek at Stage 02 first (like a host browsing the stages), so the
    // match's Stage 02 is a second mount of the street, which is the case that came up empty.
    await page.goto(`http://127.0.0.1:${PORT}/?name=Runner&autojoin=1&quality=low&room=switch-match&testSeed=7&testRound=8&testBriefing=1&testStages=2&testResults=3`);
    await page.waitForSelector('[data-testid=start]', { timeout: 60_000 });
    await waitStage(page, 'STAGE_01_RED_LIGHT');
    await page.click('[data-testid=lobby-stage-02]');
    await waitStage(page, 'STAGE_02_AGAWAN_BASE');
    await page.click('[data-testid=lobby-stage-01]');
    await waitStage(page, 'STAGE_01_RED_LIGHT');
    await page.click('[data-testid=add-bots]');
    await sleep(500);
    await page.click('[data-testid=start]');
    await waitStage(page, 'STAGE_01_RED_LIGHT');
    await page.waitForFunction(() => window.__cn?.stage === 'STAGE_02_AGAWAN_BASE', null, { timeout: 90_000 });
    await page.waitForSelector('[data-testid=agawan-top]', { timeout: 30_000 });
    await sleep(1500);
    const s = await streetNow(page);
    report.match = s;
    checkStreet('match Stage 01 -> 02', s);
    await page.screenshot({ path: `${shots}/switch-match-stage02.png` });
    check(pageErrors.length === 0, `match page errors: ${pageErrors.join(' | ')}`);
    await page.close();
  }
} catch (e) {
  errors.push(`crashed: ${e?.stack ?? e}`);
} finally {
  await browser?.close();
  worker.stop();
}
writeReport('stage-switch.json', { ok: errors.length === 0, errors, ...report });
console.log(JSON.stringify(report, null, 2));
if (errors.length) { console.error('FAIL\n' + errors.join('\n')); process.exit(1); }
console.log('stage switch: OK');
