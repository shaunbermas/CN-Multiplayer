// Main-menu backgrounds (decision 047): renders each stage's real 3D scene from a fixed viewpoint in the composition
// of the owner's reference (scene on the right, room for the menu on the left), with no players and no HUD, and
// then they are saved as apps/web/src/assets/landing/MENU_STG0x.webp (WebP q80). Run against `wrangler dev`, High tier, SwiftShader.
// Usage: tsx tests/e2e/menu-art.mjs [only=STG01|STG02|STG03]   (writes PNGs to tests/reports/menu-art first)
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { root, sleep, startWorker } from '../lib.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const out = `${root}tests/reports/menu-art`;
mkdirSync(out, { recursive: true });
if (process.env.SKIP_BUILD !== '1') execSync('npm run build', { cwd: root, stdio: 'ignore' });

export const SHOTS = {
  STG01: { stage: 'STAGE_01_RED_LIGHT', view: JSON.parse(process.env.V1 ?? 'null') ?? { pos: [-4, 2.4, -95], look: [-17, 9, -185] } },
  STG02: { stage: 'STAGE_02_AGAWAN_BASE', view: JSON.parse(process.env.V2 ?? 'null') ?? { pos: [-24, 2.0, 31], look: [8, 5, 31] } }, // 27 Nov 2026: the dim, lit Christmas street
  STG03: { stage: 'STAGE_03_THE_HUNT', view: JSON.parse(process.env.V3 ?? 'null') ?? { pos: [-22, 2.2, -24], look: [18, 2.4, 8] } },
};
const only = process.argv[2];
// Trying viewpoints: SHOTS_JSON='{"try1":{"stage":"STAGE_02_AGAWAN_BASE","view":{"pos":[..],"look":[..]}}}'
if (process.env.SHOTS_JSON) { for (const k of Object.keys(SHOTS)) delete SHOTS[k]; Object.assign(SHOTS, JSON.parse(process.env.SHOTS_JSON)); }
const PORT = Number(process.env.VIEWS_PORT ?? 8797);
const worker = startWorker(PORT);
let browser;
const errors = [];
try {
  await worker.ready;
  browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  let n = 0;
  for (const [key, shot] of Object.entries(SHOTS)) {
    if (only && only !== key) continue;
    const page = await (await browser.newContext({ viewport: { width: 1920, height: 1080 } })).newPage();
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(`http://127.0.0.1:${PORT}/?name=Viewer&autojoin=1&quality=high&teams=1&room=menuart${n++}${Date.now() % 10000}&startStage=${shot.stage}`);
    const t = Date.now();
    while (Date.now() - t < 120_000) {
      if (await page.evaluate((id) => { const c = window.__cn; return c?.stage === id && c.round().stage === id && c.assets()?.environment === 'ready'; }, shot.stage).catch(() => false)) break;
      await sleep(500);
    }
    await page.addStyleTag({ content: '.hud, .panel, .overlay, header, footer, .nametags, .game-hud, .perf { visibility: hidden !important; } body * { cursor: none !important; }' });
    await page.evaluate((v) => { window.__cnHidePlayers = true; window.__cnView = v; }, shot.view);
    await sleep(6000);
    await page.screenshot({ path: `${out}/${key}.png` });
    await page.close();
  }
} catch (e) {
  errors.push(String(e?.stack ?? e));
} finally {
  await browser?.close();
  worker.stop();
}
if (errors.length) { console.error(errors.join('\n')); process.exitCode = 1; }
