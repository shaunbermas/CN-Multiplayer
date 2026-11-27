// Stage 02 · AGAWAN BASE multiplayer integration test, against the real Worker + Durable Object rooms under
// `wrangler dev` (test rooms may play Agawan Base before it is switched on). Real WebSocket clients plus server bots:
//  A  a full room of 30 (3 people + 27 bots) balanced 10/10/10; Start goes straight to Agawan Base
//  -  every player starts at their own base; every client sees the same public team state; each person gets `ag`
//  B  bots play on their own: tags, prisoners, rescues or releases and bases change hands; scores match the feed
//  C  a person disconnects mid-stage and reconnects with the same browser key: same id and team
//  D  the stage ends with team places by score (board points 2 / 1 / 0), recorded once; prisoners cleared; teams unlock
//  E  Start is refused when a team has no players (the room lists the reason); there are no captains (decision 053)
//  F  a second room plays at the same time with its own teams, scores and timer
// Usage: npm run test:agawan
import { execSync } from 'node:child_process';
import { RoomClient, AGAWAN, getStage } from '../../packages/shared/src/index.ts';
import { root, sleep, startWorker, writeReport } from '../lib.mjs';

const PORT = Number(process.env.AGAWAN_PORT ?? 8795);
const errors = [];
const check = (ok, msg) => { if (!ok) errors.push(msg); return ok; };
if (process.env.SKIP_BUILD !== '1') execSync('npm run build', { cwd: root, stdio: 'ignore' });
const worker = startWorker(PORT);
const report = { scenarios: {} };
const layout = getStage(AGAWAN.id).agawan.layout;

async function waitFor(fn, ms, what) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { const v = fn(); if (v) return v; await sleep(50); }
  throw new Error(`Timed out waiting for ${what}`);
}

try {
  await worker.ready;
  const url = (room) => `ws://127.0.0.1:${PORT}/api/room/${room}/ws`;
  const ROOM = 'agawan-it-a';
  const host = await RoomClient.connect(url(ROOM), 'Host', 10_000, 'aghost000001');
  const p2 = await RoomClient.connect(url(ROOM), 'Second', 10_000, 'agsecond0001');
  let p3 = await RoomClient.connect(url(ROOM), 'Third', 10_000, 'agthird00001');
  host.fillBots();
  await waitFor(() => host.players.size === 30 && Object.keys(host.teams?.members ?? {}).length === 30, 8000, '30 players in teams');

  const opts = { startStage: AGAWAN.id, stages: 2, seed: 2026, roundS: 80, briefingS: 1, resultsS: 3, autoNext: true };
  let t0 = Date.now();

  // F: second room, started at the same time
  const ROOM2 = 'agawan-it-b';
  const other = await RoomClient.connect(url(ROOM2), 'Other', 10_000, 'agother00001');
  other.addBots(5);
  await waitFor(() => other.players.size === 6 && Object.keys(other.teams?.members ?? {}).length === 6, 5000, 'room 2 ready');

  // E (in room 2, 6 players): Pick your team with Team C emptied -> Start refused with the reason.
  other.setTeamMode('manual');
  await waitFor(() => other.teams?.mode === 'manual', 4000, 'manual team mode');
  for (const [id, s] of Object.entries(other.teams.members)) if (s === 'C') other.moveToTeam(id, 'A');
  await waitFor(() => !Object.values(other.teams.members).includes('C'), 4000, 'Team C empty');
  check(other.teams.teams.every((t) => !('captain' in t)) && !('nominees' in other.teams), 'no captain state in the team view');
  t0 = Date.now();
  other.start({ ...opts, seed: 7, roundS: 30 });
  const refusal = await waitFor(() => other.lastError?.code === 'team' && other.lastError.at >= t0 && other.lastError, 4000, 'start refused');
  check(/no players/i.test(refusal.message), `refusal names the empty team: ${refusal.message}`);
  check(other.round.phase === 'lobby', 'match started with an empty team');
  report.scenarios.E = { refusal: refusal.message };
  other.balanceTeams();
  await waitFor(() => ['A', 'B', 'C'].every((s) => Object.values(other.teams.members).includes(s)), 4000, 'room 2 balanced');

  // A
  host.start(opts);
  other.start({ ...opts, seed: 7, roundS: 30 });
  await waitFor(() => host.round.phase === 'active' && host.round.agawan, 15_000, 'Agawan active');
  check(host.round.stage === AGAWAN.id, `stage is ${host.round.stage}`);
  check(host.teams.locked, 'teams not locked during the match');
  const pub = host.round.agawan;
  check(pub.teams.map((t) => t.players).join() === '10,10,10', `team sizes ${pub.teams.map((t) => t.players)}`);
  const starts = [...host.players.values()].map((p) => {
    const slot = pub.teamOf[p.id];
    const b = layout.bases[slot];
    return Math.hypot(p.x - b.x, p.z - b.z);
  });
  check(Math.max(...starts) < 14, `everyone starts at their own base (max ${Math.max(...starts).toFixed(1)} m)`);
  check([host, p2, p3].every((c) => c.agawan && c.agawan.team === pub.teamOf[c.id]), 'each person gets their own state with the right team');
  check([p2, p3].every((c) => JSON.stringify(c.round.agawan.teamOf) === JSON.stringify(pub.teamOf)), 'clients agree on teams');
  report.scenarios.A = { players: host.players.size, teams: pub.teams.map((t) => [t.slot, t.players]) };

  // C: p3 drops and comes back with the same key
  await sleep(4000);
  const p3id = p3.id, p3team = pub.teamOf[p3id];
  p3.leave();
  await sleep(800);
  p3 = await RoomClient.connect(url(ROOM), 'Third', 10_000, 'agthird00001');
  await waitFor(() => p3.agawan, 4000, 'p3 state after reconnect');
  check(p3.id === p3id, `reconnect kept the id (${p3.id} vs ${p3id})`);
  check(p3.agawan.team === p3team, 'reconnect kept the team');
  report.scenarios.C = { id: p3.id, team: p3.agawan.team };

  // B: let the bots play; watch the feed
  let maxPrisoners = 0, maxCapture = 0;
  while (host.round.phase === 'active') {
    maxPrisoners = Math.max(maxPrisoners, host.round.agawan?.prisoners.length ?? 0);
    for (const b of host.round.agawan?.bases ?? []) maxCapture = Math.max(maxCapture, b.cap?.p ?? 0);
    await sleep(200);
  }
  const feed = host.agawanFeed;
  const count = (k) => feed.filter((e) => e.kind === k).length;
  report.scenarios.B = { tags: count('tag'), rescues: count('rescue'), releases: count('release'), hits: count('hit'), bases: count('base'), maxCapture: Math.round(maxCapture * 100) / 100, maxPrisoners };
  check(count('hit') >= 6, `bots hit ${count('hit')} times`);
  check(count('tag') >= 3, `bots captured ${count('tag')} times`);
  // Bots attack bases: within the 80 s test round a base either changes hands or a capture gets well past half
  // (real-time play varies run to run; the full-match base rate is checked deterministically in agawan.test.ts).
  check(count('base') >= 1 || maxCapture >= 0.5, `bases changed hands ${count('base')} times and the best capture reached ${Math.round(maxCapture * 100)} %`);
  check(count('rescue') + count('release') >= 1, 'no prisoner was ever rescued or released');
  check(maxPrisoners >= 1, 'nobody was ever in a pen');

  // D: results
  await waitFor(() => host.round.phase === 'results' && host.results.length, 10_000, 'results');
  const res = host.results;
  check(res.length === 30, `results rows ${res.length}`);
  const fin = host.round.agawan;
  const scoreOf = Object.fromEntries((fin?.teams ?? []).map((t) => [t.slot, t.score]));
  // Scores add up from the feed (base takeovers, captures, rescues) plus the bases each team held at the whistle.
  const heldOf = Object.fromEntries((fin?.teams ?? []).map((t) => [t.slot, t.held]));
  for (const s of ['A', 'B', 'C']) {
    const fromFeed = heldOf[s] * AGAWAN.points.baseHeld + feed.filter((e) => (e.kind === 'base' && e.team === s) || ((e.kind === 'tag' || e.kind === 'rescue') && fin.teamOf[e.by] === s)).reduce((n, e) => n + (e.points ?? 0), 0);
    check(fromFeed === scoreOf[s], `team ${s} score ${scoreOf[s]} vs feed ${fromFeed}`);
  }
  const byTeam = {};
  for (const r of res) (byTeam[r.team] ??= new Set()).add(r.points);
  check(Object.values(byTeam).every((x) => x.size === 1), 'teammates share their team points');
  const order = ['A', 'B', 'C'].sort((a, b) => scoreOf[b] - scoreOf[a]);
  check([...byTeam[order[0]]][0] === 2, 'top team gets 2 board points');
  check(res.filter((r) => r.team === order[0]).every((r) => r.teamPlace === 1), 'top team placed first');
  check(fin.prisoners.length === 0, 'prisoners left in pens after the end');
  report.scenarios.D = { scores: scoreOf, winners: fin.winners, sudden: fin.sudden, points: Object.fromEntries(Object.entries(byTeam).map(([k, v]) => [k, [...v][0]])) };
  // Standings recorded once (each player's total equals this stage's points; it was the only stage played).
  check(host.standings.every((s) => s.points === (res.find((r) => r.id === s.id)?.points ?? 0)), 'standings differ from the stage points (double record?)');
  await waitFor(() => host.round.phase === 'lobby', 10_000, 'back to the lobby');
  await waitFor(() => !host.teams.locked, 3000, 'teams unlocked');

  // F
  await waitFor(() => other.round.phase === 'results' || other.round.phase === 'lobby', 30_000, 'room 2 finished');
  check(JSON.stringify(other.round.agawan?.teams ?? []) !== JSON.stringify(fin.teams), 'room 2 shares scores with room 1');
  report.scenarios.F = { room2Phase: other.round.phase, room2Teams: other.round.agawan?.teams?.map((t) => [t.slot, t.players, t.score]) ?? null };

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
writeReport('stage02-agawan-integration.json', report);
console.log(JSON.stringify(report, null, 2));
process.exit(errors.length ? 1 : 0);
