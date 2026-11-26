// Winner ceremony (decision 049) in a real browser, against the Worker under `wrangler dev`:
//  - a full match (Stage 01 -> 02 -> 03, short test rounds, bots) ends on the winner reveal over confetti, then the
//    podium (1st, 2nd, 3rd) and everyone else's stats below
//  - a one-stage match ends on the plain results: no reveal, no podium, no confetti
// Screenshots go to tests/reports/screenshots/ceremony-*.png. Usage: npm run test:e2e:ceremony
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { root, sleep, startWorker, writeReport } from '../lib.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const PORT = Number(process.env.E2E_PORT ?? 8796);
const shots = `${root}tests/reports/screenshots`;
mkdirSync(shots, { recursive: true });
if (process.env.SKIP_BUILD !== '1') execSync('npm run build', { cwd: root, stdio: 'ignore' });
const errors = [];
const check = (ok, msg) => { if (!ok) errors.push(msg); return ok; };
const report = {};
const worker = startWorker(PORT);
let browser;

async function addBots(page, times) {
  for (let i = 0; i < times; i++) { await page.click('[data-testid=add-bots]'); await sleep(350); }
}

try {
  await worker.ready;
  browser = await chromium.launch();

  // ---- Full match: all three stages from Stage 01.
  {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const pageErrors = [];
    page.on('pageerror', (e) => pageErrors.push(e.message));
    await page.goto(`http://127.0.0.1:${PORT}/?name=Host&autojoin=1&quality=low&room=ceremony-full&testSeed=21&testRound=8&testBriefing=1&testStages=3&testResults=2`);
    await page.waitForSelector('[data-testid=start]', { timeout: 60_000 });
    await addBots(page, 2);
    await page.click('[data-testid=start]');
    // Stage results take 2 s in test rooms; the final results of a full match keep the ceremony length.
    await page.waitForSelector('[data-testid=ceremony]', { timeout: 180_000 });
    const reveal = await page.evaluate(() => ({
      step: document.querySelector('[data-testid=ceremony]')?.getAttribute('data-step'),
      name: document.querySelector('.cer-name')?.textContent ?? '',
      confetti: !!document.querySelector('[data-testid=confetti]'),
    }));
    report.reveal = reveal;
    check(reveal.step === 'reveal', `ceremony opens on the reveal, got ${reveal.step}`);
    check(reveal.name.length > 0, 'winner name in the reveal');
    check(reveal.confetti, 'confetti canvas');
    await sleep(1900); // the name pops in at 1 s
    const still = await page.evaluate(() => document.querySelector('[data-testid=ceremony]')?.getAttribute('data-step'));
    check(still === 'reveal', `the reveal holds for a few seconds, got ${still}`);
    await page.screenshot({ path: `${shots}/ceremony-reveal.png` });
    await page.waitForSelector('[data-testid=podium]', { timeout: 10_000 });
    await sleep(1600);
    const podium = await page.evaluate(() => ({
      places: [1, 2, 3].map((i) => document.querySelector(`[data-testid=podium-${i}] .cer-pname`)?.textContent ?? ''),
      rest: document.querySelectorAll('[data-testid=ceremony-rest] tbody tr').length,
      me: document.querySelector('[data-testid=ceremony-me]')?.textContent ?? '',
    }));
    report.podium = podium;
    check(podium.places.every((x) => x.length > 0), `three podium places: ${JSON.stringify(podium.places)}`);
    check(podium.places[0].replace(' (you)', '') === reveal.name, `podium 1st (${podium.places[0]}) matches the reveal (${reveal.name})`);
    check(podium.rest > 0, 'everyone else is listed below the podium');
    check(/You (placed|finished)/.test(podium.me), `your line: ${podium.me}`);
    await page.screenshot({ path: `${shots}/ceremony-podium.png` });
    await page.evaluate(() => document.querySelector('.ceremony')?.scrollTo(0, 99999));
    await sleep(300);
    await page.screenshot({ path: `${shots}/ceremony-list.png` });
    check(pageErrors.length === 0, `full match page errors: ${pageErrors.join(' | ')}`);
    await page.close();
  }

  // ---- One-stage match: plain results, no ceremony.
  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await page.goto(`http://127.0.0.1:${PORT}/?name=Solo&autojoin=1&quality=low&room=ceremony-one&testSeed=22&testRound=6&testBriefing=1&testStages=1&testResults=20`);
    await page.waitForSelector('[data-testid=start]', { timeout: 60_000 });
    await addBots(page, 1);
    await page.click('[data-testid=start]');
    await page.waitForSelector('[data-testid=final]', { timeout: 60_000 });
    await sleep(500);
    const one = await page.evaluate(() => ({ ceremony: !!document.querySelector('[data-testid=ceremony]'), podium: !!document.querySelector('[data-testid=podium]') }));
    report.oneStage = one;
    check(!one.ceremony && !one.podium, 'a one-stage match shows no winner ceremony');
    await page.close();
  }
} catch (e) {
  errors.push(`crashed: ${e?.stack ?? e}`);
} finally {
  await browser?.close();
  worker.stop();
}
report.errors = errors;
report.passed = errors.length === 0;
writeReport('ceremony.json', report);
console.log(JSON.stringify(report, null, 2));
process.exit(errors.length ? 1 : 0);
