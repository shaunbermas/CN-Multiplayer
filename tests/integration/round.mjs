// Red Light, Green Light round against the Worker + Durable Object (wrangler dev), with seeded bots.
//  - the host starts a seeded round (test-only short briefing and 25 s round)
//  - "Careful" walks only on green and stops just before red (no warning since decision 037); "Reckless" never stops; "Statue" never moves
//  - expected: Reckless is spotted at the first red after the grace window; Careful and Statue are not;
//    results order Careful, Statue, Reckless; spawns are shuffled and distinct; a late joiner waits on the
//    bench and joins in when the room returns to the lobby
//  - results carry the round id, stage id, points per player (0 here: nobody finishes) and the match standings
//  - a two-stage match (decision 033): stage 1 results, then stage 2 starts by itself; points accumulate, each
//    stage is recorded once, the final results carry the final flag and the room returns to the lobby
//  - server bots: the host adds bots, fills the room to 30, a human joining a full lobby replaces a bot,
//    non-hosts cannot add bots, and clearing removes them
// Usage: npm run test:round
import { execSync } from 'node:child_process';
import { RoomClient, buildSchedule, segmentAt } from '../../packages/shared/src/index.ts';
import { root, sleep, startWorker, writeReport } from '../lib.mjs';

const PORT = Number(process.env.ROUND_PORT ?? 8796);
const SEED = 12345;
const ROUND_S = 25;
const errors = [];
let match2 = null, botReport = null;
if (process.env.SKIP_BUILD !== '1') execSync('npm run build', { cwd: root, stdio: 'ignore' });
const worker = startWorker(PORT);

const waitFor = async (fn, label, ms = 60_000) => {
  const t = Date.now();
  while (Date.now() - t < ms) { if (fn()) return; await sleep(50); }
  throw new Error(`Timed out: ${label}`);
};

try {
  await worker.ready;
  const url = `ws://127.0.0.1:${PORT}/api/room/plain-round-test/ws`;
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

  careful.start({ seed: SEED, roundS: ROUND_S, briefingS: 1, stages: 1, resultsS: 3 });
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
      if (b === careful) mz = seg?.signal === 'green' && seg.end - t > 0.15 ? -1 : 0; // stop just before red (no warning, decision 037)
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
  for (const s of ['green', 'red']) if (!signalsSeen.has(s)) errors.push(`Never saw the ${s} signal`);
  if (signalsSeen.has('warning')) errors.push('Saw a warning signal (decision 037 removed it)');

  if (careful.resultsMeta?.roundId !== 1 || careful.resultsMeta?.stage !== 'STAGE_01_RED_LIGHT')
    errors.push(`Results meta ${JSON.stringify(careful.resultsMeta)}`);
  if (careful.results.some((r) => r.points !== 0)) errors.push(`Nobody finished, yet points were awarded: ${JSON.stringify(careful.results.map((r) => r.points))}`);
  // The late joiner is on the board too (zero points, did not play the stage).
  const lateRow = careful.standings.find((r) => r.name === 'Late');
  if (careful.standings.length !== 4 || !lateRow || lateRow.stagesPlayed !== 0) errors.push(`Standings ${JSON.stringify(careful.standings.map((r) => [r.name, r.stagesPlayed]))}`);

  await waitFor(() => careful.round.phase === 'lobby', 'back to lobby', 30_000);
  await sleep(200);
  if (late.self.status !== 'active') errors.push(`Late joiner is ${late.self.status} in the lobby, expected active`);

  // Two-stage match (Stage 01, then Agawan Base, decision 046): everyone stands still for two short stages. Agawan Base
  // needs a captain per team first; a scoreless Agawan stage plays its 30 s sudden death before the results.
  careful.autoCaptains();
  await waitFor(() => careful.teams?.teams.every((t) => t.captain), 'captains for the two-stage match', 10_000);
  careful.start({ seed: SEED + 1, roundS: 6, briefingS: 0, stages: 2, resultsS: 2 });
  const keepAlive = setInterval(() => {
    for (const b of [...bots, late]) b.send({ t: 'input', seq: Date.now(), mx: 0, mz: 0, yaw: 0 });
  }, 100);
  await waitFor(() => careful.round.phase === 'active' && careful.round.match?.stage === 1, 'match stage 1 active', 30_000);
  if (careful.round.match.total !== 2) errors.push(`Match total ${careful.round.match.total}, expected 2`);
  await waitFor(() => careful.round.phase === 'results' && careful.resultsMeta?.match?.stage === 1, 'stage 1 results', 30_000);
  if (careful.resultsMeta.match.final) errors.push('Stage 1 of 2 is marked final');
  // Host skips the stage results: stage 2 should start without anyone pressing Start.
  careful.nextStage();
  await waitFor(() => careful.round.match?.stage === 2 && careful.round.phase !== 'results', 'stage 2 starts', 30_000);
  await waitFor(() => careful.round.phase === 'results' && careful.resultsMeta?.match?.stage === 2, 'stage 2 results', 70_000);
  if (!careful.resultsMeta.match.final) errors.push('Stage 2 of 2 is not marked final');
  const st = careful.standings;
  if (st.length !== 4) errors.push(`Final standings rows ${st.length}, expected 4`);
  if (st.some((r) => r.stagesPlayed !== 2 || r.perStage.length !== 2)) errors.push(`Each player should have played 2 stages once: ${JSON.stringify(st.map((r) => [r.name, r.stagesPlayed, r.perStage]))}`);
  if (st.map((r) => r.rank).join() !== '1,2,3,4') errors.push(`Ranks ${st.map((r) => r.rank)}`);
  match2 = { standings: st.map((r) => ({ rank: r.rank, name: r.name, points: r.points, perStage: r.perStage })) };
  await waitFor(() => careful.round.phase === 'lobby', 'lobby after the match', 40_000);
  clearInterval(keepAlive);

  // Server bots in a separate room.
  const burl = `ws://127.0.0.1:${PORT}/api/room/plain-bots-test/ws`;
  const host = await RoomClient.connect(burl, 'Host');
  const guest = await RoomClient.connect(burl, 'Guest');
  await waitFor(() => host.players.size === 2 && guest.players.size === 2, 'bot room: 2 players');
  const botsIn = (c) => [...c.players.values()].filter((p) => p.bot).length;
  guest.addBots(5);
  await sleep(400);
  if (botsIn(host) !== 0) errors.push('A non-host added bots');
  host.addBots(5);
  await waitFor(() => botsIn(host) === 5, 'five bots');
  host.fillBots();
  await waitFor(() => host.players.size === 30, 'room filled to 30');
  const filled = { players: host.players.size, bots: botsIn(host) };
  const botNamesSeen = [...host.players.values()].filter((p) => p.bot).map((p) => p.name);
  if (new Set(botNamesSeen.map((n) => n.toLowerCase())).size !== botNamesSeen.length) errors.push('Bot names are not unique');
  const joiner = await RoomClient.connect(burl, 'Joiner');
  await waitFor(() => joiner.self && host.players.size === 30 && botsIn(host) === 27, 'human replaces a bot', 10_000).catch((e) => errors.push(String(e)));
  host.clearBots();
  await waitFor(() => botsIn(host) === 0 && host.players.size === 3, 'bots cleared', 10_000).catch((e) => errors.push(String(e)));
  botReport = { filled, after_human_join: { players: host.players.size }, names_sample: botNamesSeen.slice(0, 6) };
  [host, guest, joiner].forEach((c) => c.leave());

  const report = {
    result: errors.length ? 'FAIL' : 'PASS', errors, date: new Date().toISOString(),
    seed: SEED, round_s: ROUND_S, first_red_s: firstRed.start,
    reckless_spotted_at_s: +spottedAt.toFixed(2), placings, spawns, signals_seen: [...signalsSeen],
    match_two_stages: match2, bots: botReport,
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
