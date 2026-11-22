// Stage 1.5 (Prompt 07) UI walkthrough against the Worker under `wrangler dev`: every screen and state, driven
// through the real flow with live room state (bots join with the shared RoomClient). Screenshots of each
// screen go to tests/reports/screenshots/ui_*.png; failures are reported, not hidden.
// Usage: npm run test:ui
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { RoomClient } from '../../packages/shared/src/index.ts';
import { root, sleep, startWorker, writeReport } from '../lib.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const PORT = Number(process.env.UI_PORT ?? 8792);
const shots = `${root}tests/reports/screenshots`;
mkdirSync(shots, { recursive: true });
if (process.env.SKIP_BUILD !== '1') execSync('npm run build', { cwd: root, stdio: 'ignore' });
const errors = [];
const done = [];
const missedShots = [];
let worker = startWorker(PORT);
let browser;
const base = `http://127.0.0.1:${PORT}/`;
const wsUrl = (code) => `ws://127.0.0.1:${PORT}/api/room/${code}/ws`;
const waitFor = async (fn, label, ms = 60_000) => {
  const t = Date.now();
  while (Date.now() - t < ms) { if (await fn()) return; await sleep(200); }
  throw new Error(`Timed out: ${label}`);
};
const step = async (page, name, check) => {
  try { if (check) await check(); await page.screenshot({ path: `${shots}/ui_${name}.png` }); done.push(name); }
  catch (e) { errors.push(`${name}: ${e.message ?? e}`); }
};
const visible = (page, sel) => page.locator(sel).first().isVisible();

try {
  await worker.ready;
  browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  const consoleErrors = [];
  page.on('pageerror', (e) => consoleErrors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' && !/WebSocket|ERR_CONNECTION|Failed to load resource/.test(m.text())) consoleErrors.push(m.text()); });

  // 1–4: menu, how to play, settings, join by code
  await page.goto(`${base}?quality=low`);
  await step(page, '01_menu', async () => { await waitFor(() => visible(page, '[data-testid=menu]'), 'menu'); });
  // keyboard: Tab reaches the primary action and shows a focus ring
  await page.keyboard.press('Tab'); await page.keyboard.press('Tab');
  await step(page, '01b_menu_keyboard_focus');
  await page.getByRole('button', { name: 'How to play' }).click();
  await step(page, '02_how_to_play', async () => { await waitFor(() => visible(page, '[data-testid=howto]'), 'howto'); });
  await page.getByRole('button', { name: 'Close' }).click();
  await page.getByRole('button', { name: 'Settings' }).click();
  await step(page, '03_settings', async () => { await waitFor(() => visible(page, '[data-testid=settings]'), 'settings'); });
  await page.getByRole('button', { name: 'Close' }).click();
  await page.fill('[data-testid=nickname]', 'Host');
  await page.getByRole('button', { name: 'Join with a code' }).click();
  await page.fill('[data-testid=room-code]', 'abc23');
  await step(page, '04_join_with_code');

  // 5: invite link
  const code = 'uitest';
  await page.goto(`${base}?room=${code}&quality=low&testSeed=12345&testRound=120&testBriefing=3`);
  await page.fill('[data-testid=nickname]', 'Host');
  await step(page, '05_invite_link', async () => { await waitFor(() => visible(page, '[data-testid=invite-notice]'), 'invite notice'); });

  // 6–7: lobby with bots, ready states, character selection
  await page.click('[data-testid=join-invite]');
  await waitFor(() => page.evaluate(() => window.__cn?.assets?.().environment === 'ready'), 'stage loaded', 120_000);
  const bots = [];
  for (const n of ['Mara', 'Teo', 'Ines', 'Reckless']) bots.push(await RoomClient.connect(wsUrl(code), n));
  bots[0].setReady(true); bots[2].setReady(true);
  await page.click('[data-testid=ready]');
  await step(page, '06_lobby_30_slots', async () => {
    await waitFor(() => page.evaluate(() => document.querySelectorAll('.lobby-slots .slot.taken').length === 5), '5 taken slots');
    await waitFor(() => page.evaluate(() => document.querySelectorAll('.lobby-slots .slot.ready').length === 3), '3 ready');
    const codeShown = await page.textContent('[data-testid=room-code-display]');
    if (codeShown?.trim() !== code.toUpperCase()) throw new Error(`room code shows ${codeShown}`);
  });
  await page.click('[data-testid=open-characters]');
  await step(page, '07_character_select_pending', async () => { await waitFor(() => visible(page, '[data-testid=roster-pending]'), 'roster pending notice'); });
  await page.getByRole('button', { name: 'Close' }).click();

  // Transient screens (countdown, stamp…) can come and go faster than a software-rendered screenshot on a slow
  // CI runner, so an in-page observer records when each one actually appeared; the test asserts on that and
  // screenshots the screen when it is still showing.
  await page.evaluate(() => {
    window.__seen = {};
    const ids = ['briefing', 'countdown', 'spotted', 'spectating', 'results'];
    const check = () => { for (const id of ids) if (!window.__seen[id] && document.querySelector(`[data-testid=${id}]`)) window.__seen[id] = { at: Date.now(), text: document.querySelector(`[data-testid=${id}]`).textContent.trim().slice(0, 60) }; };
    new MutationObserver(check).observe(document.body, { subtree: true, childList: true, characterData: true });
  });
  const seen = (id) => page.evaluate((id) => !!window.__seen?.[id], id);
  const shotIfShowing = async (id) => { if (await visible(page, `[data-testid=${id}]`)) return; missedShots.push(id); };
  // 8–9: briefing and countdown (host starts; test seed and 3 s briefing)
  await page.click('[data-testid=start]');
  await step(page, '08_briefing', async () => { await waitFor(() => visible(page, '[data-testid=briefing]'), 'briefing'); });
  await step(page, '09_countdown', async () => { await waitFor(() => seen('countdown'), 'countdown', 20_000); await shotIfShowing('countdown'); });

  // 10–11: HUD green and red (client signal view held for exact captures; server state unaffected)
  await waitFor(() => page.evaluate(() => window.__cn.round().phase === 'active'), 'active');
  await page.evaluate(() => { globalThis.__cnSignalHold = { signal: 'green', since: Date.now() }; });
  await step(page, '10_hud_green', async () => { await waitFor(() => page.evaluate(() => document.querySelector('[data-testid=signal]')?.textContent?.includes('GREEN')), 'green banner'); });
  await page.evaluate(() => { globalThis.__cnSignalHold = { signal: 'red', since: Date.now() }; });
  await step(page, '11_hud_red_scanning', async () => { await waitFor(() => visible(page, '.scanning'), 'scanning'); });
  await page.evaluate(() => { delete globalThis.__cnSignalHold; });

  // 12: another player is eliminated (bot keeps walking into the first red) → feed toast
  const reck = bots[3];
  let seq = 1;
  const walker = setInterval(() => reck.send({ t: 'input', seq: seq++, mx: 0, mz: -1, yaw: 0 }), 33);
  await step(page, '12_elimination_feed', async () => { await waitFor(() => visible(page, '.toast.spotted'), 'elimination toast', 30_000); });
  clearInterval(walker);

  // 13–14: we walk into the red ourselves → spotted stamp, then spectator UI
  await page.bringToFront();
  await page.locator('canvas').click();
  await page.keyboard.down('KeyW');
  await step(page, '13_you_were_spotted', async () => { await waitFor(() => seen('spotted'), 'spotted stamp', 60_000); await shotIfShowing('spotted'); });
  await page.keyboard.up('KeyW');
  await step(page, '14_spectator', async () => { await waitFor(() => visible(page, '[data-testid=spectating]'), 'spectator', 15_000); });

  // 15: results (round ends; the remaining bots never finish)
  await step(page, '15_results', async () => { await waitFor(() => seen('results'), 'results', 150_000); await shotIfShowing('results'); });
  for (const b of bots) b.leave();

  // 16: room full (30 players) → clean rejection shown on the menu
  const full = [];
  for (let i = 0; i < 30; i++) full.push(await RoomClient.connect(wsUrl('fullroom'), `Bot${i + 1}`));
  const p2 = await ctx.newPage();
  await p2.goto(`${base}?room=fullroom&quality=low`);
  await p2.fill('[data-testid=nickname]', 'Thirty-one');
  await p2.click('[data-testid=join-invite]');
  await step(p2, '16_room_full', async () => { await waitFor(() => visible(p2, '[data-testid=menu-error]'), 'full error'); const t = await p2.textContent('[data-testid=menu-error]'); if (!/full/i.test(t ?? '')) throw new Error(`error text: ${t}`); });
  for (const b of full) b.leave();
  await p2.close();

  // 17: connection lost (server stops) → reconnect state
  worker.stop();
  await step(page, '17_connection_lost', async () => { await waitFor(() => visible(page, '[data-testid=connection-lost]'), 'connection lost', 30_000); });
  if (consoleErrors.length) errors.push(...consoleErrors.slice(0, 5));
} catch (e) {
  errors.push(String(e?.stack ?? e));
} finally {
  await browser?.close();
  worker.stop();
}
const report = { result: errors.length ? 'FAIL' : 'PASS', errors, date: new Date().toISOString(), screens: done,
  screenshot_after_screen_closed: missedShots, renderer: 'headless Chromium, SwiftShader, low tier' };
writeReport('ui-walkthrough.json', report);
console.log(JSON.stringify(report, null, 2));
process.exit(errors.length ? 1 : 0);
