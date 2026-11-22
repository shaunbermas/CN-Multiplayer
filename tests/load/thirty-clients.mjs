// 30-client load test (GDD M0 / §11.2) plus the S1-3 straight-line walk timing, against the
// Cloudflare Worker + Durable Object room running under `wrangler dev`.
//  - 30 clients join one room; each sees all 30 players
//  - a 31st client is rejected (capacity 30)
//  - all 30 send inputs at 30 Hz; the room's simulation tick stays well inside its 33 ms budget
//  - one client walks straight from spawn 1 to the finish; the server-recorded time is reported
// Usage: npm run test:load   (runs with tsx so it can import the shared TypeScript client)
import { execSync } from 'node:child_process';
import { RoomClient } from '../../packages/shared/src/index.ts';
import { root, sleep, startWorker, writeReport } from '../lib.mjs';

const PORT = Number(process.env.LOAD_PORT ?? 8798);
// LOAD_CLIENTS=1|10|20|30 for staged runs (Stage 1.5 Prompt 08); the 31st-client check runs at 30.
const N = Math.max(1, Math.min(30, Number(process.env.LOAD_CLIENTS ?? 30)));
const ROOM = `load-test-${N}`;
const errors = [];
if (process.env.SKIP_BUILD !== '1') execSync('npm run build', { cwd: root, stdio: 'ignore' });
const worker = startWorker(PORT);

try {
  await worker.ready;
  const base = `http://127.0.0.1:${PORT}/api/room/${ROOM}`;
  const wsUrl = `ws://127.0.0.1:${PORT}/api/room/${ROOM}/ws`;

  // ---- join 30
  const clients = [];
  const joinMs = [];
  for (let i = 0; i < N; i++) {
    const t = performance.now();
    clients.push(await RoomClient.connect(wsUrl, i === 0 ? 'Walker' : `Bot ${i + 1}`));
    joinMs.push(performance.now() - t);
  }
  await sleep(500);
  const seen = clients.map((c) => c.players.size);
  if (!seen.every((n) => n === N)) errors.push(`Not every client sees ${N} players: ${seen.join(',')}`);
  // Shared contestant: the server deals every player a different colourway (owner pack, 22 Nov 2026).
  const colorways = [...clients[0].players.values()].map((p) => p.colorway);
  const uniqueColorways = new Set(colorways).size;
  if (uniqueColorways !== N || colorways.some((c) => !/^CW\d{2}$/.test(c ?? ''))) errors.push(`Colourways not unique: ${uniqueColorways} distinct for ${N} players`);

  // ---- 31st must be rejected
  let rejected = false;
  let rejectMessage = '';
  if (N === 30) try {
    const extra = await RoomClient.connect(wsUrl, 'Extra');
    extra.leave();
  } catch (e) {
    rejected = e?.code === 'full';
    rejectMessage = String(e?.message ?? e);
  }
  if (N === 30 && !rejected) errors.push(`A 31st client was not rejected as full (${rejectMessage || 'it joined'})`);

  // ---- load: everyone sends 30 Hz input; client 0 walks straight to the finish
  await fetch(`${base}/metrics/reset`, { method: 'POST' });
  const startSnaps = clients.map((c) => c.snapshots);
  const seqs = new Array(N).fill(0);
  const t0 = Date.now();
  const timer = setInterval(() => {
    const t = (Date.now() - t0) / 1000;
    clients.forEach((c, i) => {
      let mx = 0, mz = 0;
      if (i === 0) mz = -1;                                                  // the walker: straight to the finish
      else { const a = t * 0.7 + i; mx = Math.cos(a) * 0.8; mz = Math.sin(a) * 0.8; } // bots wander in place
      c.send({ t: 'input', seq: ++seqs[i], mx, mz, yaw: 0 });
    });
  }, 1000 / 30);

  const walker = clients[0];
  while (walker.self?.status !== 'finished' && Date.now() - t0 < 70_000) await sleep(250);
  clearInterval(timer);
  // Round trip per client (ping/pong through the room), sampled 5 times each under load.
  const rtts = [];
  for (let k = 0; k < 5; k++) { clients.forEach((c) => c.ping()); await sleep(400); rtts.push(...clients.map((c) => c.rttMs).filter((x) => x >= 0)); }
  rtts.sort((a, b) => a - b);
  const loadSeconds = (Date.now() - t0) / 1000;
  const health = await (await fetch(`${base}/health`)).json();
  const finishTime = walker.self?.finishTime ?? -1;
  if (walker.self?.status !== 'finished') errors.push('The walker did not reach the finish within 70 s');
  if (health.tickMs.p95 > 10) errors.push(`Room tick p95 ${health.tickMs.p95} ms is above 10 ms`);
  const rates = clients.map((c, i) => (c.snapshots - startSnaps[i]) / loadSeconds);
  const minRate = Math.min(...rates);
  if (minRate < 12) errors.push(`A client received only ${minRate.toFixed(1)} snapshots per second`);

  // Moving fraction with signals (spec §3): green 3-6 s + warning 0.8 s vs red 3-5 s.
  const movingFraction = (4.5 + 0.8) / (4.5 + 0.8 + 4.0);
  const report = {
    result: errors.length ? 'FAIL' : 'PASS',
    errors,
    date: new Date().toISOString(),
    server: 'Cloudflare Worker + Durable Object (wrangler dev, local)',
    clients: N,
    join_ms: { avg: +(joinMs.reduce((a, b) => a + b, 0) / N).toFixed(1), max: +Math.max(...joinMs).toFixed(1) },
    every_client_sees: seen[0],
    unique_colorways: uniqueColorways,
    client_31: { rejected, message: rejectMessage },
    load_seconds: +loadSeconds.toFixed(1),
    rtt_ms: rtts.length ? { median: rtts[Math.floor(rtts.length / 2)], p95: rtts[Math.floor(rtts.length * 0.95)], max: rtts[rtts.length - 1] } : null,
    room: health,
    snapshots_per_client_per_s: { min: +minRate.toFixed(1), avg: +(rates.reduce((a, b) => a + b, 0) / N).toFixed(1) },
    walk_test: {
      from: 'spawn 1 (front row, centre)',
      distance_m: 162,
      server_finish_time_s: +finishTime.toFixed(2),
      projected_with_signals_s: +(finishTime / movingFraction).toFixed(1),
      note: 'Projection assumes the average signal cycle in STAGE_01_SPEC.md §3 and a player who never hesitates.',
    },
  };
  writeReport(N === 30 ? 'load-30-clients.json' : `load-${N}-clients.json`, report);
  console.log(JSON.stringify(report, null, 2));
  clients.forEach((c) => c.leave());
} catch (e) {
  errors.push(String(e?.stack ?? e));
  console.error(e);
} finally {
  worker.stop();
}
process.exit(errors.length ? 1 : 0);
