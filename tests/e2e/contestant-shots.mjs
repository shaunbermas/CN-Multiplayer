// In-game views of the shared contestant in Stage 01 (1 browser on High + 29 simulated clients, lobby).
// Writes docs/stage15/screenshots/contestant/ingame_*.png from the rendered frame (window.__cnSnapshot).
// Usage: tsx tests/e2e/contestant-shots.mjs
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { RoomClient } from '../../packages/shared/src/index.ts';
import { root, sleep, startWorker } from '../lib.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const PORT = Number(process.env.SHOTS_PORT ?? 8797);
const out = `${root}docs/stage15/screenshots/contestant`;
mkdirSync(out, { recursive: true });
if (process.env.SKIP_BUILD !== '1') execSync('npm run build', { cwd: root, stdio: 'ignore' });
const worker = startWorker(PORT);
let browser, code = 0;
try {
  await worker.ready;
  browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  await page.goto(`http://127.0.0.1:${PORT}/?name=Viewer&autojoin=1&room=shots&quality=high`);
  await page.waitForFunction(() => !!window.__cn && window.__cn.assets().environment === 'ready', null, { timeout: 180_000 });
  const bots = [];
  for (let i = 0; i < 29; i++) bots.push(await RoomClient.connect(`ws://127.0.0.1:${PORT}/api/room/shots/ws`, `Bot${i + 1}`));
  await page.waitForFunction(() => window.__cn.players().length === 30 && window.__cn.contestants()?.instances === 30, null, { timeout: 180_000 });
  await sleep(3000);
  const snap = async (name) => {
    await sleep(3500);
    const url = await page.evaluate(() => window.__cnSnapshot('image/png'));
    writeFileSync(`${out}/${name}.png`, Buffer.from(url.split(',')[1], 'base64'));
    console.log('wrote', name);
  };
  const sp = await page.evaluate(() => window.__cn.spawns);
  const cx = sp.reduce((s, p) => s + p.x, 0) / sp.length, cz = sp.reduce((s, p) => s + p.z, 0) / sp.length;
  const minZ = Math.min(...sp.map((p) => p.z));
  // behind the crowd, looking toward The Watcher: what players see most of the time
  await page.evaluate(([cx, cz]) => { window.__cnView = { pos: [cx + 1.5, 2.6, cz + 7.5], look: [cx, 0.7, cz - 2] }; }, [cx, cz]);
  await snap('ingame_crowd_from_behind');
  // the front row, close (LOD0 for the nearest)
  await page.evaluate(([cx, z]) => { window.__cnView = { pos: [cx + 0.8, 1.15, z - 3.2], look: [cx, 0.75, z] }; }, [cx, minZ]);
  await snap('ingame_front_row_close');
  // lobby emotes: half the bots jump, the others dive (visual only)
  bots.forEach((b, i) => b.send({ t: 'emote', e: i % 2 ? 'jump' : 'dive' }));
  await page.evaluate(([cx, cz]) => { window.__cnView = { pos: [cx + 6, 2.2, cz + 2], look: [cx, 0.6, cz - 1] }; }, [cx, cz]);
  await sleep(200);
  const url = await page.evaluate(() => window.__cnSnapshot('image/png'));
  writeFileSync(`${out}/ingame_lobby_emotes.png`, Buffer.from(url.split(',')[1], 'base64'));
  bots.forEach((b) => b.leave());
} catch (e) { console.error(e); code = 1; } finally { await browser?.close(); worker.stop(); }
process.exit(code);
