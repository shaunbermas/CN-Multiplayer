// Restart game (owner request, 25 Nov 2026) against the Worker + Durable Object (wrangler dev).
//  - a non-host cannot restart; the host can restart during a stage and from the final results
//  - a restart starts a fresh match at stage 1 (new round id, no lobby in between), everyone plays,
//    including a late joiner who was watching from the bench, and the random players stay
//  - points from the abandoned match are gone: the next results carry only the new match's points
// Usage: npm run test:restart
import { execSync } from 'node:child_process';
import { RoomClient } from '../../packages/shared/src/index.ts';
import { root, sleep, startWorker, writeReport } from '../lib.mjs';

const PORT = Number(process.env.RESTART_PORT ?? 8797);
const errors = [];
const steps = [];
if (process.env.SKIP_BUILD !== '1') execSync('npm run build', { cwd: root, stdio: 'ignore' });
const worker = startWorker(PORT);

const waitFor = async (fn, label, ms = 30_000) => {
  const t = Date.now();
  while (Date.now() - t < ms) { if (fn()) return; await sleep(50); }
  throw new Error(`Timed out: ${label}`);
};
const check = (ok, label) => { steps.push([label, ok]); if (!ok) errors.push(label); };

try {
  await worker.ready;
  const url = `ws://127.0.0.1:${PORT}/api/room/restart-test/ws`;
  const host = await RoomClient.connect(url, 'Host');
  const guest = await RoomClient.connect(url, 'Guest');
  await waitFor(() => host.players.size === 2 && guest.players.size === 2 && host.snapshots > 0, 'two players');
  host.addBots(3);
  await waitFor(() => host.players.size === 5, 'bots added');

  const opts = { seed: 777, roundS: 6, briefingS: 1, stages: 1, resultsS: 30 };
  host.start(opts);
  await waitFor(() => host.round.phase === 'active', 'first match active');

  const late = await RoomClient.connect(url, 'Late');
  await waitFor(() => late.self && late.snapshots > 0, 'late joiner snapshot');
  await sleep(200);
  check(late.self.status === 'waiting', `late joiner waits on the bench (got ${late.self?.status})`);

  guest.restart();
  await sleep(500);
  check(host.round.phase === 'active', `a non-host restart is ignored (phase ${host.round.phase})`);

  const phases = new Set();
  const onSnap = () => phases.add(host.round.phase);
  host.onSnapshot(onSnap);
  host.restart();
  await waitFor(() => host.round.phase === 'briefing', 'briefing after restart', 5_000);
  check(!phases.has('lobby'), 'restart goes straight to the briefing, no lobby in between');
  check(host.round.match.stage === 1, `restart begins at stage 1 (got ${host.round.match.stage})`);
  await sleep(300);
  check(late.self.status === 'active', `late joiner plays after the restart (got ${late.self.status})`);
  check(host.players.size === 6 && [...host.players.values()].filter((p) => p.bot).length === 3, 'random players kept');

  // Play the restarted single-stage match to its final results, then restart from there.
  [host, guest, late].forEach((c) => c.skipBriefing());
  await waitFor(() => host.round.phase === 'results' && host.round.match.final, 'final results', 30_000);
  await waitFor(() => host.results.length === 6, 'results message', 5_000);
  const firstResultsRound = host.resultsMeta.roundId;
  check(host.standings.length === 6, `final standings list every player (got ${host.standings.length})`);

  host.restart();
  await waitFor(() => host.round.phase === 'briefing', 'briefing after restart from final results', 5_000);
  check(host.round.match.stage === 1, 'restart from the final results begins a new match at stage 1');
  check(host.standings.length === 0, 'old standings cleared on the client');
  [host, guest, late].forEach((c) => c.skipBriefing());
  await waitFor(() => host.round.phase === 'results', 'results of the new match', 30_000);
  await waitFor(() => host.resultsMeta && host.resultsMeta.roundId !== firstResultsRound, 'new results message', 5_000);
  const played = Math.max(...host.standings.map((s) => s.stagesPlayed));
  check(played === 1, `the new match counts only its own stage (stagesPlayed ${played}, 2 would mean old points carried over)`);

  writeReport('restart-integration.json', { steps, errors });
} catch (e) {
  errors.push(String(e));
} finally {
  worker.stop();
}
for (const [label, ok] of steps) console.log(`${ok ? 'PASS' : 'FAIL'} ${label}`);
if (errors.length) console.error(errors.join('\n'));
process.exit(errors.length ? 1 : 0);
