// Screenshots of each frame of docs/ui/STAGE_01_UI_MOCKUP.html (the UI visual reference) into docs/ui/mockup/.
// Usage: node tools/ui-mockup-shots.mjs   (needs Playwright's Chromium)
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = fileURLToPath(new URL('..', import.meta.url));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: 1 });
await page.goto(`file://${root}docs/ui/STAGE_01_UI_MOCKUP.html`);
await page.evaluate(() => document.fonts.ready);
const figs = await page.locator('figure').all();
const names = ['01_menu', '02_lobby', '06_countdown', '07_hud_green', '09_red_spotted', '11_finish_warning', '12_stage_results', '14_next_stage', '15_final'];
for (let i = 0; i < figs.length; i++) await figs[i].locator('.frame').screenshot({ path: `${root}docs/ui/mockup/${names[i] ?? i}.jpg`, type: 'jpeg', quality: 86 });
await browser.close();
console.log(`saved ${figs.length} frames`);
