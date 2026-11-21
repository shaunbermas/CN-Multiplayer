// Red Light, Green Light round against the Worker + Durable Object (wrangler dev), with seeded bots.
//  - the host starts a seeded round (test-only short briefing and 25 s round)
//  - "Careful" walks only on green and stops at the warning; "Reckless" never stops; "Statue" never moves
//  - expected: Reckless is spotted at the first red after the grace window; Careful and Statue are not;
//    results order Careful, Statue, Reckless; spawns are shuffled and distinct; a late joiner waits on the
//    bench and joins in when the room returns to the lobby
//  - results carry the round id and stage id (handed to the tournament manager once); standup qualifies finishers only
//  - a second, tournament-mode round: the server publishes the qualifier target (R3) and, with no finishers,
//    qualifies the two furthest unspotted players (R4)
// Usage: npm run test:round
import { execSync } from 'node:child_process';
import { RoomClient, buildSchedule, segmentAt } from '../../packages/shared/src/index.ts';
import { root, sleep, startWorker, writeReport } from '../lib.mjs';

const PORT = Number(process.env.ROUND_PORT ?? 8796);
const SEED = 12345;
const ROUND_S = 25;
const errors = [];
let target = -1, q2 = [];
if (process.env.SKIP_BUILD !== '1') execSync('npm run build', { cwd: root, stdio: 'ignore' });
const worker = startWorker(PORT);

const waitFor = async (fn, label, ms = 60_000) => {
  const t = Date.now();
  while (Date.now() - t < ms) { if (fn()) return; await sleep(50); }
  throw new Error(`Timed out: ${label}`);
};

try {
  await worker.ready;
  const url = `ws://127.0.0.1:${PORT}/api/room/round-test/ws`;
  const careful = await RoomClient.connect(url, 'Careful');
  const reckless = await RoomClient.connect(url, 'Reckless');
  const statue = await RoomClient.connect(url, 'Statue');
  const bots = [careful, reckless, statue];
  await waitFor(() => bots.every((b) => b.players.size === 3 && b.snapshots > 0), 'all see 3 players');
  if (!careful.isHost) errors.push('The first player is not the host');

  // A non-host cannot start.
  reckless.start({ seed: SEED });
  await sleep(300);
  if (careful.round.phase !== 'lobby') errors.push('A non-host started the round');

  careful.start({ seed: SEED, roundS: ROUND_S, briefingS: 1 });
  await waitFor(() => careful.round.phase === 'briefing', 'briefing');
  const spawns = bots.map((b) => b.self.spawn);
  if (new Set(spawns).size !== 3) errors.push(`Spawns not distinct: ${spawns}`);
  bots.forEach((b) => b.skipBriefing());
  await waitFor(() => careful.round.phase === 'countdown', 'countdown');
  await waitFor(() => careful.round.phase === 'active', 'active');
  const goLocal = Date.now() - careful.round.elapsed * 1000;
  const schedule = buildSchedule(SEED, ROUND_S);
  if (careful.round.seed !== SEED) errors.push(`Seed ${careful.round.seed} is not the test seed`);

  // Late joiner during the round waits on the bench.
  const late = await RoomClient.connect(url, 'Late');
  await waitFor(() => late.snapshots > 0 && late.self, 'late snapshot');
  await sleep(200);
  if (late.self.status !== 'waiting') errors.push(`Late joiner status ${late.self.status}, expected waiting`);

  const seq = new Map(bots.map((b) => [b, 0]));
  const signalsSeen = new Set();
  const timer = setInterval(() => {
    const t = (Date.now() - goLocal) / 1000;
    const seg = segmentAt(schedule, t);
    signalsSeen.add(careful.round.signal);
    for (const b of bots) {
      let mz = 0;
      if (b === careful) mz = seg?.signal === 'green' && seg.end - t > 0.15 ? -1 : 0; // stop just before the warning
      if (b === reckless) mz = -1;
      b.send({ t: 'input', seq: seq.set(b, seq.get(b) + 1).get(b), mx: 0, mz, yaw: 0 });
    }
  }, 1000 / 30);

  const firstRed = schedule.find((s) => s.signal === 'red');
  await waitFor(() => careful.round.phase === 'results', 'results', (ROUND_S + 10) * 1000);
  clearInterval(timer);
  await waitFor(() => careful.results.length === 3, 'results message');
  const spottedEvent = careful.events.find((e) => e.kind === 'spotted' && e.id === reckless.id);
  const spottedAt = spottedEvent ? spottedEvent.roundT : -1; // server clock, seconds since GO
  const placings = careful.results.map((r) => `${r.place}. ${r.name} (${r.status})`);
  const names = careful.results.map((r) => r.name);
  const statusOf = (n) => careful.results.find((r) => r.name === n)?.status;
  if (statusOf('Reckless') !== 'spotted') errors.push('Reckless was not spotted');
  if (statusOf('Careful') !== 'active') errors.push(`Careful ended ${statusOf('Careful')}, expected active (not spotted)`);
  if (statusOf('Statue') !== 'active') errors.push(`Statue ended ${statusOf('Statue')}, expected active`);
  if (names.join() !== 'Careful,Statue,Reckless') errors.push(`Unexpected order: ${names.join(', ')}`);
  if (!(spottedAt >= firstRed.start + 0.3 && spottedAt <= firstRed.start + 1.2)) {
    errors.push(`Reckless spotted at ${spottedAt.toFixed(2)} s; first red starts at ${firstRed.start} s (expected just after the 0.3-0.5 s grace)`);
  }
  for (const s of ['green', 'warning', 'red']) if (!signalsSeen.has(s)) errors.push(`Never saw the ${s} signal`);

  if (careful.resultsMeta?.roundId !== 1 || careful.resultsMeta?.stage !== 'STAGE_01_RED_LIGHT' || careful.resultsMeta?.mode !== 'standup')
    errors.push(`Results meta ${JSON.stringify(careful.resultsMeta)}`);
  if (careful.results.some((r) => r.qualified)) errors.push('Standup: nobody finished, yet someone qualified');

  await waitFor(() => careful.round.phase === 'lobby', 'back to lobby', 30_000);
  await sleep(200);
  if (late.self.status !== 'active') errors.push(`Late joiner is ${late.self.status} in the lobby, expected active`);

  // Round 2: tournament rules, everyone stands still for a short round.
  careful.start({ seed: SEED + 1, roundS: 6, briefingS: 0, mode: 'tournament' });
  await waitFor(() => careful.round.phase === 'active', 'tournament round active');
  target = careful.round.target;
  if (careful.round.mode !== 'tournament' || target !== 3) errors.push(`Tournament target ${target} (mode ${careful.round.mode}), expected 3 for 4 starters`);
  const keepAlive = setInterval(() => {
    for (const b of [...bots, late]) b.send({ t: 'input', seq: Date.now(), mx: 0, mz: 0, yaw: 0 });
  }, 100);
  await waitFor(() => careful.round.phase === 'results' && careful.resultsMeta?.roundId === 2, 'tournament results', 30_000);
  clearInterval(keepAlive);
  q2 = careful.results.filter((r) => r.qualified).map((r) => r.name);
  if (careful.resultsMeta.mode !== 'tournament' || q2.length !== 2) errors.push(`Tournament R4 fill: qualified ${q2.join(', ')} (expected 2)`);

  const report = {
    result: errors.length ? 'FAIL' : 'PASS', errors, date: new Date().toISOString(),
    seed: SEED, round_s: ROUND_S, first_red_s: firstRed.start,
    reckless_spotted_at_s: +spottedAt.toFixed(2), placings, spawns, signals_seen: [...signalsSeen],
    tournament_round: { target, qualified: q2 },
  };
  writeReport('round-integration.json', report);
  console.log(JSON.stringify(report, null, 2));
  [...bots, late].forEach((b) => b.leave());
} catch (e) {
  errors.push(String(e?.stack ?? e));
  console.error(e);
} finally {
  worker.stop();
}
process.exit(errors.length ? 1 : 0);
