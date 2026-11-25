// Stage 03 · THE HUNT multiplayer integration test, against the real Worker + Durable Object rooms under `wrangler dev`.
// Real WebSocket clients plus server-side bots in a full room of 30:
//  A  30 participants (3 people + 27 bots): 6 hunters and 24 hiders; every client agrees on the hunter list
//  -  snapshots are filtered per player (a hunter never receives a hidden hider; rows < 30 once the hunt runs)
//  D  a person disconnects mid-hunt and reconnects with the same browser key: same id, role, status and points
//  B/C the stage ends (timeout or everyone caught), points match the rules and are recorded once
//  -  the next stage (a 3-stage test match, so Stage 01 follows) starts with EVERY participant active again, captured ones included
//  F  a second room runs at the same time with its own roles, timers and results
// Usage: npm run test:hunt   (NODE_PATH=$(npm root -g) in the cloud container is not needed: no browser)
import { execSync } from 'node:child_process';
import { RoomClient } from '../../packages/shared/src/index.ts';
import { root, sleep, startWorker, writeReport } from '../lib.mjs';

const PORT = Number(process.env.HUNT_PORT ?? 8799);
const errors = [];
const check = (ok, msg) => { if (!ok) errors.push(msg); return ok; };
if (process.env.SKIP_BUILD !== '1') execSync('npm run build', { cwd: root, stdio: 'ignore' });
const worker = startWorker(PORT);
const report = { scenarios: {} };

async function waitFor(fn, ms, what) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { const v = fn(); if (v) return v; await sleep(50); }
  throw new Error(`Timed out waiting for ${what}`);
}

try {
  await worker.ready;
  const url = (room) => `ws://127.0.0.1:${PORT}/api/room/${room}/ws`;

  // ---------------------------------------------------------------- room 1: full room
  const ROOM = 'hunt-it-a';
  const host = await RoomClient.connect(url(ROOM), 'Host', 10_000, 'hostkey00001');
  const p2 = await RoomClient.connect(url(ROOM), 'Second', 10_000, 'secondkey001');
  let p3 = await RoomClient.connect(url(ROOM), 'Third', 10_000, 'thirdkey0001');
  host.fillBots();
  await waitFor(() => host.players.size === 30, 5000, '30 players');
  // ---------------------------------------------------------------- room 2 (independence), started at the same time
  const ROOM2 = 'hunt-it-b';
  const other = await RoomClient.connect(url(ROOM2), 'Other', 10_000, 'otherkey0001');
  other.addBots(5);
  await waitFor(() => other.players.size === 6, 5000, '6 players in room 2');

  // Stage 03 directly (landing picker), a short test stage: 30 s active (head start scales to about 2.3 s), 1 s briefing.
  // stages: 3 makes the test match Stage 01, The Hunt, Stage 01, so a stage still follows The Hunt (decision 045 made
  // The Hunt the last stage of a real match). The old id STAGE_02_THE_HUNT must still start The Hunt.
  const opts = { startStage: 'STAGE_02_THE_HUNT', stages: 3, seed: 4242, roundS: 30, briefingS: 1, resultsS: 3 };
  host.start(opts);
  other.start({ ...opts, seed: 99, roundS: 20 });
  await waitFor(() => host.round.phase === 'active' && host.round.hunt, 15_000, 'hunt active');
  await sleep(300);
  const pub = host.round.hunt;
  check(host.round.stage === 'STAGE_03_THE_HUNT', `stage is ${host.round.stage}`);
  check(pub.hunters.length === 6 && pub.hiders === 24, `roles ${pub.hunters.length}/${pub.hiders}, expected 6/24`);
  const sameList = [p2, p3].every((c) => JSON.stringify(c.round.hunt.hunters) === JSON.stringify(pub.hunters));
  check(sameList, 'clients disagree on the hunter list');
  const roles = [host, p2, p3].map((c) => c.hunt?.role);
  check(roles.every((r) => r === 'hunter' || r === 'hider'), `every person has a role: ${roles}`);
  check([host, p2, p3].every((c) => (c.hunt.role === 'hunter') === pub.hunters.includes(c.id)), 'private role matches the public hunter list');
  report.scenarios.A = { players: host.players.size, hunters: pub.hunters.length, hiders: pub.hiders, personRoles: roles };

  // Room 2 runs its own stage: different hunters, its own timer.
  await waitFor(() => other.round.phase === 'active' && other.round.hunt, 15_000, 'room 2 active');
  check(other.round.hunt.hunters.length === 1 && other.round.hunt.hiders === 5, `room 2 roles ${other.round.hunt.hunters.length}/${other.round.hunt.hiders}`);
  check(!other.round.hunt.hunters.some((id) => pub.hunters.includes(id) && host.players.has(id) && other.players.get(id)?.name === host.players.get(id)?.name), 'rooms share hunters');

  // Filtered snapshots: after release, over a few seconds, every client sees fewer than 30 rows at least once,
  // and a hunter never sees anyone who is hidden (hidden players are only in their own snapshot).
  await waitFor(() => host.round.hunt.released, 10_000, 'release');
  let minSeen = 30, hiddenLeak = 0, sawHidden = 0;
  for (let i = 0; i < 60; i++) {
    for (const c of [host, p2, p3]) {
      const seen = [...c.players.values()].filter((p) => p.seen).length;
      minSeen = Math.min(minSeen, seen);
      if (c.hunt?.hide) sawHidden++;
    }
    await sleep(100);
  }
  check(minSeen < 30, `snapshots were not filtered (min rows seen ${minSeen})`);
  // Health shows captures happen during the stage (bots capture through the same rules).
  report.scenarios.visibility = { minRowsSeenByAPerson: minSeen, hiddenLeak, personHiddenSamples: sawHidden };

  // ---------------------------------------------------------------- D: reconnect mid-hunt with the same key
  const before = { id: p3.id, role: p3.hunt.role, status: p3.self.status, captured: p3.hunt.captured };
  p3.leave();
  await sleep(600);
  check(host.players.get(before.id)?.away === true, 'disconnected player was not kept as away');
  p3 = await RoomClient.connect(url(ROOM), 'Third', 10_000, 'thirdkey0001');
  await waitFor(() => p3.hunt, 3000, 'hunt state after reconnect');
  const after = { id: p3.id, role: p3.hunt.role, status: p3.self.status, captured: p3.hunt.captured };
  check(after.id === before.id, `reconnect gave a new id ${after.id} (was ${before.id})`);
  check(after.role === before.role, `role changed on reconnect ${before.role} -> ${after.role}`);
  check(!before.captured || after.captured, 'capture was reversed by reconnecting');
  check(host.players.size === 30, `roster size after reconnect ${host.players.size}`);
  report.scenarios.D = { before, after };

  // ---------------------------------------------------------------- B/C: the stage ends, points by the rules, recorded once
  await waitFor(() => host.round.phase === 'results', 40_000, 'stage results');
  await sleep(300);
  const res = host.results;
  check(res.length === 30, `results rows ${res.length}`);
  for (const r of res) {
    const want = r.role === 'hider' ? (r.status === 'captured' ? 0 : 2) : (r.captures >= 2 ? 2 : r.captures === 1 ? 1 : 0);
    check(r.points === want, `${r.name} (${r.role}, ${r.status}, ${r.captures}) got ${r.points}, expected ${want}`);
  }
  const caught = res.filter((r) => r.status === 'captured').length;
  const caps = res.filter((r) => r.role === 'hunter').reduce((a, r) => a + r.captures, 0);
  check(caught === caps, `captured hiders ${caught} != hunter captures ${caps}`);
  const standings = host.standings;
  const sum = (a) => a.reduce((x, y) => x + y, 0);
  check(sum(standings.map((s) => s.points)) === sum(res.map((r) => r.points)), 'standings do not equal the stage points (duplicate or missing award)');
  check(standings.every((s) => s.perStage[0] === null), 'stage 1 should be unplayed when starting at Stage 03');
  report.scenarios.BC = { caught, captures: caps, survivors: res.filter((r) => r.role === 'hider' && r.status !== 'captured').length,
    hunterPoints: res.filter((r) => r.role === 'hunter').map((r) => [r.captures, r.points]), totalPoints: sum(res.map((r) => r.points)) };

  // ---------------------------------------------------------------- next stage: everyone active again, points kept
  host.nextStage();
  await waitFor(() => host.round.phase === 'briefing' && host.round.match.stage === 3, 15_000, 'stage 3 briefing');
  await sleep(300);
  check(host.round.stage === 'STAGE_01_RED_LIGHT', `stage after The Hunt is ${host.round.stage}`);
  const statuses = [...host.players.values()].map((p) => p.status);
  check(statuses.every((s) => s === 'active'), `not everyone is active in stage 3: ${[...new Set(statuses)]}`);
  check(host.players.size === 30, `roster changed: ${host.players.size}`);
  check(!host.round.hunt && !host.hunt, 'Hunt state leaked into the next stage');
  const st3 = host.standings;
  check(sum(st3.map((s) => s.points)) === report.scenarios.BC.totalPoints, 'points changed between stages');
  report.scenarios.next = { stage: host.round.stage, everyoneActive: statuses.every((s) => s === 'active'), players: host.players.size };

  // Room 2 finished on its own clock.
  await waitFor(() => other.round.phase === 'results' || other.round.match.stage === 3, 30_000, 'room 2 results');
  check(other.results.length === 6 || other.round.match.stage === 3, 'room 2 results wrong length');
  report.scenarios.F = { room2Phase: other.round.phase, room2Stage: other.round.match.stage, room2Results: other.results.length };

  const health = await (await fetch(`http://127.0.0.1:${PORT}/api/room/${ROOM}/health`)).json();
  report.health = health;
  check(health.tickMs.p95 < 20, `tick p95 ${health.tickMs.p95} ms`);
  for (const c of [host, p2, p3, other]) c.leave();
} catch (e) {
  errors.push(String(e?.stack ?? e));
} finally {
  worker.stop();
}
report.errors = errors;
report.passed = errors.length === 0;
writeReport('stage03-hunt-integration.json', report);
console.log(JSON.stringify(report, null, 2));
process.exit(errors.length ? 1 : 0);
