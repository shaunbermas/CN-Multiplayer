// 30-client load test (GDD M0 / §11.2) plus the S1-3 straight-line walk timing.
//  - 30 Node clients join one room; each sees all 30 players
//  - a 31st client joining that room by id is rejected (capacity 30)
//  - all 30 send inputs at 30 Hz; the server simulation tick stays well inside its 33 ms budget
//  - one client walks straight from spawn 1 to the finish; the server-recorded time is reported
// Usage: node tests/load/thirty-clients.mjs
import { createRequire } from 'node:module';
import { sleep, startServer, writeReport } from '../lib.mjs';

const require = createRequire(import.meta.url);
const { Client } = require('colyseus.js');

const PORT = Number(process.env.LOAD_PORT ?? 2598);
const N = 30;
const errors = [];
const server = startServer(PORT);

try {
  await server.ready;
  const endpoint = `ws://127.0.0.1:${PORT}`;

  // ---- join 30
  const rooms = [];
  const joinMs = [];
  const first = await new Client(endpoint).joinOrCreate('trial', { name: 'Walker' });
  rooms.push(first);
  for (let i = 1; i < N; i++) {
    const t = performance.now();
    rooms.push(await new Client(endpoint).joinById(first.roomId, { name: `Bot ${i + 1}` }));
    joinMs.push(performance.now() - t);
  }
  await sleep(500);
  const seen = rooms.map((r) => r.state.players.size);
  if (!seen.every((n) => n === N)) errors.push(`Not every client sees ${N} players: ${seen.join(',')}`);

  // ---- 31st must be rejected
  let rejected = false;
  let rejectMessage = '';
  try {
    const extra = await new Client(endpoint).joinById(first.roomId, { name: 'Extra' });
    await extra.leave();
  } catch (e) {
    rejected = true;
    rejectMessage = String(e?.message ?? e);
  }
  if (!rejected) errors.push('A 31st client was allowed into a full room');

  // ---- load: everyone sends 30 Hz input; client 0 walks straight to the finish
  await fetch(`http://127.0.0.1:${PORT}/metrics/reset`, { method: 'POST' });
  const patches = new Array(N).fill(0);
  rooms.forEach((r, i) => r.onStateChange(() => { patches[i]++; }));
  const seqs = new Array(N).fill(0);
  const t0 = Date.now();
  const timer = setInterval(() => {
    const t = (Date.now() - t0) / 1000;
    rooms.forEach((r, i) => {
      let mx = 0, mz = 0;
      if (i === 0) mz = -1;                                                  // the walker: straight to the finish
      else { const a = t * 0.7 + i; mx = Math.cos(a) * 0.8; mz = Math.sin(a) * 0.8; } // bots wander in place
      r.send('input', { seq: ++seqs[i], mx, mz, yaw: 0 });
    });
  }, 1000 / 30);

  const walker = () => first.state.players.get(first.sessionId);
  while (walker()?.status !== 'finished' && Date.now() - t0 < 70_000) await sleep(250);
  clearInterval(timer);
  const loadSeconds = (Date.now() - t0) / 1000;
  const health = await (await fetch(`http://127.0.0.1:${PORT}/health`)).json();
  const finishTime = walker()?.finishTime ?? -1;
  if (walker()?.status !== 'finished') errors.push('The walker did not reach the finish within 70 s');
  if (health.tickMs.p95 > 10) errors.push(`Server tick p95 ${health.tickMs.p95} ms is above 10 ms`);
  const patchRates = patches.map((n) => n / loadSeconds);
  const minRate = Math.min(...patchRates);
  if (minRate < 12) errors.push(`A client received only ${minRate.toFixed(1)} state updates per second`);

  // Moving fraction with signals (spec §1): green 3-6 s + warning 0.8 s vs red 3-5 s.
  const movingFraction = (4.5 + 0.8) / (4.5 + 0.8 + 4.0);
  const report = {
    result: errors.length ? 'FAIL' : 'PASS',
    errors,
    date: new Date().toISOString(),
    clients: N,
    join_ms: { avg: +(joinMs.reduce((a, b) => a + b, 0) / joinMs.length).toFixed(1), max: +Math.max(...joinMs).toFixed(1) },
    every_client_sees: seen[0],
    client_31: { rejected, message: rejectMessage },
    load_seconds: +loadSeconds.toFixed(1),
    server: health,
    state_updates_per_client_per_s: { min: +minRate.toFixed(1), avg: +(patchRates.reduce((a, b) => a + b, 0) / N).toFixed(1) },
    walk_test: {
      from: 'spawn 1 (front row, centre)',
      distance_m: 162,
      server_finish_time_s: +finishTime.toFixed(2),
      projected_with_signals_s: +(finishTime / movingFraction).toFixed(1),
      note: 'Projection assumes the average signal cycle in STAGE_01_SPEC.md §3 and a player who never hesitates.',
    },
  };
  writeReport('load-30-clients.json', report);
  console.log(JSON.stringify(report, null, 2));
  await Promise.all(rooms.map((r) => r.leave().catch(() => {})));
} catch (e) {
  errors.push(String(e?.stack ?? e));
  console.error(e);
} finally {
  server.stop();
}
process.exit(errors.length ? 1 : 0);
