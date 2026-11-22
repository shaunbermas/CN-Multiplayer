// Close-up of the dealt contestants in a lobby of 30 (1 browser on High + 29 simulated clients).
// Usage: tsx tests/e2e/lineup.mjs  (writes tests/reports/screenshots/characters_lineup_*.png)
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { RoomClient } from '../../packages/shared/src/index.ts';
import { root, sleep, startWorker } from '../lib.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const PORT = Number(process.env.LINEUP_PORT ?? 8793);
const shots = `${root}tests/reports/screenshots`;
mkdirSync(shots, { recursive: true });
if (process.env.SKIP_BUILD !== '1') execSync('npm run build', { cwd: root, stdio: 'ignore' });
const worker = startWorker(PORT);
let browser, code = 0;
try {
  await worker.ready;
  browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  await page.goto(`http://127.0.0.1:${PORT}/?name=Viewer&autojoin=1&room=lineup&quality=high`);
  await page.waitForFunction(() => !!window.__cn, null, { timeout: 90_000 });
  const bots = [];
  for (let i = 0; i < 29; i++) bots.push(await RoomClient.connect(`ws://127.0.0.1:${PORT}/api/room/lineup/ws`, `Bot${i + 1}`));
  await page.waitForFunction(() => window.__cn.players().length === 30 && window.__cn.assets().environment === 'ready' && window.__cn.contestants()?.ready, null, { timeout: 180_000 });
  await sleep(3000);
  const players = await page.evaluate(() => window.__cn.players());
  console.log('distinct characters:', new Set(players.map((p) => p.colorway)).size);
  const sorted = [...players].sort((a, b) => a.x - b.x || a.z - b.z);
  for (const [k, group] of [[0, sorted.slice(0, 10)], [1, sorted.slice(10, 20)], [2, sorted.slice(20, 30)]]) {
    const cx = group.reduce((s, p) => s + p.x, 0) / group.length, cz = group.reduce((s, p) => s + p.z, 0) / group.length;
    await page.evaluate(([cx, cz]) => { window.__cnView = { pos: [cx, 2.2, cz - 6], look: [cx, 0.6, cz] }; }, [cx, cz]);
    await sleep(2500);
    await page.screenshot({ path: `${shots}/characters_lineup_${k}.png`, timeout: 120_000 });
  }
  bots.forEach((b) => b.leave());
} catch (e) { console.error(e); code = 1; } finally { await browser?.close(); worker.stop(); }
process.exit(code);
