// Graphics quality check (decision 026), in headless Chromium against the Worker under `wrangler dev`.
//  - each pinned tier (?quality=low|medium|high) turns on exactly the effects STAGE_01_LIGHTING.json lists:
//    dynamic lights, the moon's shadow (High), dust motes, haze cards; no asset problems or console errors
//  - with no ?quality, the game starts on High, and the adaptive monitor steps down when frames are slow.
//    Software WebGL here is far slower than any real GPU, so it must reach Low and keep rendering.
//  - per tier: draw calls, triangles, shader programs and the software-rendered frame rate (for comparison
//    between tiers only; a real GPU is many times faster), plus a screenshot of each tier
// Builds the web app first unless SKIP_BUILD=1. Usage: npm run test:quality
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync } from 'node:fs';
import { root, sleep, startWorker, writeReport } from '../lib.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const lighting = JSON.parse(readFileSync(`${root}blender/exports/STAGE_01_LIGHTING.json`, 'utf8'));

const PORT = Number(process.env.QUALITY_PORT ?? 8796);
const shots = `${root}tests/reports/screenshots`;
mkdirSync(shots, { recursive: true });
if (process.env.SKIP_BUILD !== '1') execSync('npm run build', { cwd: root, stdio: 'ignore' });
const errors = [];
const tiers = {};
let auto = null;
const worker = startWorker(PORT);
let browser;

const waitFor = async (fn, label, ms = 60_000) => {
  const t = Date.now();
  while (Date.now() - t < ms) { if (await fn()) return; await sleep(250); }
  throw new Error(`Timed out: ${label}`);
};
const expectedLights = (q) => {
  const want = lighting.qualityTiers[q].dynamicLights;
  return lighting.lights.map((l) => l.id).filter((id) => want === 'all' || want.some((p) => (p.endsWith('*') ? id.startsWith(p.slice(0, -1)) : id === p)));
};
const fpsOver = (page, ms) => page.evaluate((ms) => new Promise((done) => {
  let n = 0; const t0 = performance.now();
  const tick = () => { n++; if (performance.now() - t0 < ms) requestAnimationFrame(tick); else done(n / ((performance.now() - t0) / 1000)); };
  requestAnimationFrame(tick);
}), ms);

async function openPage(name, query) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  const consoleErrors = [];
  page.on('pageerror', (e) => consoleErrors.push(`${name}: ${e}`));
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(`${name}: ${m.text()}`); });
  await page.goto(`http://127.0.0.1:${PORT}/?name=${name}&autojoin=1${query}`);
  await waitFor(() => page.evaluate(() => { const a = window.__cn?.assets(); return a?.environment === 'ready' && a?.watcher === 'ready'; }), `${name}: stage loaded`, 120_000);
  return { ctx, page, consoleErrors };
}

try {
  await worker.ready;
  browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });

  // ---- each pinned tier shows exactly its effects
  for (const q of ['low', 'medium', 'high']) {
    const { ctx, page, consoleErrors } = await openPage(`Q${q}`, `&quality=${q}`);
    await sleep(2500); // shader compiles and first shadow pass
    const a = await page.evaluate(() => window.__cn.assets());
    const qs = await page.evaluate(() => window.__cn.quality());
    const tier = lighting.qualityTiers[q];
    const want = expectedLights(q).sort();
    const got = [...a.effects.lights].sort();
    if (qs.tier !== q || !qs.pinned) errors.push(`${q}: quality state ${qs.tier} (pinned ${qs.pinned})`);
    if (want.join() !== got.join()) errors.push(`${q}: lights ${got.join(', ')}; expected ${want.join(', ')}`);
    const wantShadows = Array.isArray(tier.shadows) ? tier.shadows : [];
    if (a.effects.shadows.join() !== wantShadows.join()) errors.push(`${q}: shadow casters ${a.effects.shadows.join(', ') || 'none'}; expected ${wantShadows.join(', ') || 'none'}`);
    if (a.effects.dust !== (tier.dust ?? 0)) errors.push(`${q}: dust ${a.effects.dust}; expected ${tier.dust}`);
    if (a.effects.haze !== !!tier.hazeCards) errors.push(`${q}: haze ${a.effects.haze}; expected ${!!tier.hazeCards}`);
    if (a.problems.length) errors.push(`${q}: asset problems ${a.problems.join('; ')}`);
    const fps = await fpsOver(page, 3000);
    const info = await page.evaluate(() => window.__cn.renderInfo());
    // A software-rendered High frame can take many seconds on a 2-core CI runner; a screenshot waits for one.
    await page.screenshot({ path: `${shots}/quality_${q}.png`, timeout: 120_000 });
    tiers[q] = { lights: got.length, shadows: a.effects.shadows, dust: a.effects.dust, haze: a.effects.haze, draw_calls: info.calls, triangles: info.triangles, shader_programs: info.programs, software_fps: +fps.toFixed(1) };
    errors.push(...consoleErrors);
    await ctx.close();
  }

  // ---- default: starts on High; the adaptive monitor protects the frame rate
  {
    const { ctx, page, consoleErrors } = await openPage('Qauto', '');
    const first = await page.evaluate(() => window.__cn.quality());
    const startTier = first.changes[0]?.from.split('@')[0] ?? first.tier;
    if (first.pinned) errors.push('default page is pinned');
    if (startTier !== 'high') errors.push(`default page started on ${startTier}, expected high`);
    await waitFor(() => page.evaluate(() => window.__cn.quality().tier === 'low'), 'adaptive monitor reaches low on software WebGL', 60_000)
      .catch(() => {});
    const qs = await page.evaluate(() => window.__cn.quality());
    if (qs.tier !== 'low') errors.push(`adaptive monitor stopped at ${qs.tier} (changes: ${JSON.stringify(qs.changes)})`);
    await sleep(1500);
    const a = await page.evaluate(() => window.__cn.assets());
    if (a.environment !== 'ready' || a.watcher !== 'ready' || a.quality !== 'low') errors.push(`after stepping down: env ${a.environment}, watcher ${a.watcher}, tier ${a.quality}`);
    const fps = await fpsOver(page, 2000);
    if (!(fps > 0)) errors.push('page stopped rendering after stepping down');
    auto = { started_on: startTier, changes: qs.changes.map((c) => `${c.from} -> ${c.to} at ${c.fps} fps`), final_tier: qs.tier, software_fps_after: +fps.toFixed(1) };
    errors.push(...consoleErrors);
    await ctx.close();
  }

  const report = {
    result: errors.length ? 'FAIL' : 'PASS', errors, date: new Date().toISOString(),
    renderer: 'headless Chromium, software WebGL (SwiftShader); frame rates compare tiers only',
    tiers, adaptive_default: auto,
    screenshots: ['low', 'medium', 'high'].map((q) => `tests/reports/screenshots/quality_${q}.png`),
  };
  writeReport('quality.json', report);
  console.log(JSON.stringify(report, null, 2));
} catch (e) {
  errors.push(String(e?.stack ?? e));
  console.error(e);
} finally {
  await browser?.close();
  worker.stop();
}
process.exit(errors.length ? 1 : 0);
