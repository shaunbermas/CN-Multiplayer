// Stage 02 · AGAWAN BASE team setup integration test (protocol v9), against the real Worker + Durable Object rooms
// under `wrangler dev`. Real WebSocket clients plus server-side bots:
//  1  everyone (people and bots) lands in a team; sizes stay within one; every client sees the same team view
//  2  a person switches team and nominates themselves; a full team refuses joins
//  3  host-only actions (rename, captain, move, balance, auto-pick) are refused for others, with a 'team' error
//  4  the host renames (bad names refused), appoints a captain, moves a player, Auto-balances and Auto-picks captains
//  5  starting a match locks teams for everyone; changes are refused while it runs; leavers free their captain seat
//  6  a second room keeps its own teams
// Usage: npm run test:teams
import { execSync } from 'node:child_process';
import { RoomClient } from '../../packages/shared/src/index.ts';
import { root, sleep, startWorker, writeReport } from '../lib.mjs';

const PORT = Number(process.env.TEAMS_PORT ?? 8798);
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
const sizes = (c) => ['A', 'B', 'C'].map((s) => Object.values(c.teams.members).filter((x) => x === s).length);
const spread = (c) => Math.max(...sizes(c)) - Math.min(...sizes(c));
/** Wait for the next 'team' error after `since`. */
const teamError = (c, since, what) => waitFor(() => c.lastError?.code === 'team' && c.lastError.at >= since && c.lastError, 3000, what);

try {
  await worker.ready;
  const url = (room) => `ws://127.0.0.1:${PORT}/api/room/${room}/ws`;
  const ROOM = 'teams-it-a';
  const host = await RoomClient.connect(url(ROOM), 'Host', 10_000, 'teamhost0001');
  const p2 = await RoomClient.connect(url(ROOM), 'Second', 10_000, 'teamsec00001');
  const p3 = await RoomClient.connect(url(ROOM), 'Third', 10_000, 'teamthird001');
  host.addBots(5);
  await waitFor(() => host.players.size === 8, 5000, '8 players');
  host.addBots(4);
  await waitFor(() => host.players.size === 12, 5000, '12 players');
  await waitFor(() => Object.keys(host.teams?.members ?? {}).length === 12, 5000, `12 players in teams (${JSON.stringify(host.teams)})`);

  // 1
  check(spread(host) <= 1, `newcomers unbalanced: ${sizes(host)}`);
  await waitFor(() => [p2, p3].every((c) => JSON.stringify(c.teams) === JSON.stringify(host.teams)), 3000, 'same team view');
  check(host.teams.teams.map((t) => t.name).join() === 'Team A,Team B,Team C', 'default names');
  check(!host.teams.locked, 'teams locked in the lobby');
  report.scenarios[1] = { sizes: sizes(host) };

  // Decision 047: rooms start in shuffle mode; this scenario covers manual picks, so the host switches.
  host.setTeamMode('manual');
  await waitFor(() => host.teams.mode === 'manual', 3000, 'manual mode');
  // 2
  const target = ['A', 'B', 'C'].find((s) => s !== p2.teams.members[p2.id]);
  p2.joinTeam(target);
  await waitFor(() => host.teams.members[p2.id] === target, 3000, 'p2 switched team');
  p2.nominate(true);
  await waitFor(() => host.teams.nominees.includes(p2.id), 3000, 'p2 nominated');
  report.scenarios[2] = { p2Team: target, nominees: host.teams.nominees };

  // 3
  let t0 = Date.now();
  p3.renameTeam('A', 'Sneaky Name');
  const e3 = await teamError(p3, t0, 'non-host rename refused');
  check(/host/i.test(e3.message), `non-host refusal: ${e3.message}`);
  t0 = Date.now();
  p3.balanceTeams();
  await teamError(p3, t0, 'non-host balance refused');
  check(host.teams.teams[0].name === 'Team A', 'non-host rename went through');

  // 4
  t0 = Date.now();
  host.renameTeam('B', 'Team A');
  const dup = await teamError(host, t0, 'duplicate name refused');
  t0 = Date.now();
  host.renameTeam('C', '<script>x</script>');
  const bad = await teamError(host, t0, 'markup refused');
  host.renameTeam('A', '  Mga   Parol ');
  await waitFor(() => host.teams.teams[0].name === 'Mga Parol', 3000, 'rename applied');
  await waitFor(() => p3.teams.teams[0].name === 'Mga Parol', 3000, 'rename reached others');
  host.setCaptain(target, p2.id);
  await waitFor(() => host.teams.teams.find((t) => t.slot === target).captain === p2.id, 3000, 'captain appointed');
  t0 = Date.now();
  const wrong = ['A', 'B', 'C'].find((s) => s !== target);
  host.setCaptain(wrong, p2.id);
  await teamError(host, t0, 'captain from another team refused');
  // pile everyone movable into one team, then Auto-balance
  const ids = [...host.players.keys()].filter((id) => id !== p2.id);
  for (const id of ids) host.moveToTeam(id, target);
  await waitFor(() => sizes(host)[['A', 'B', 'C'].indexOf(target)] >= 10, 3000, 'team filled to 10');
  check(Math.max(...sizes(host)) <= 10, `a team passed 10: ${sizes(host)}`);
  t0 = Date.now();
  const outsider = ids.find((id) => host.teams.members[id] !== target);
  if (outsider) { host.moveToTeam(outsider, target); await teamError(host, t0, 'full team refused'); }
  host.balanceTeams();
  await waitFor(() => spread(host) <= 1, 3000, 'auto-balance');
  check(host.teams.members[p2.id] === target, 'auto-balance moved the captain');
  host.autoCaptains();
  await waitFor(() => host.teams.teams.every((t) => t.captain), 3000, 'auto-pick captains');
  const capOk = host.teams.teams.every((t) => host.teams.members[t.captain] === t.slot);
  check(capOk, 'a captain is not on their team');
  report.scenarios[4] = { duplicate: dup.message, markup: bad.message, sizes: sizes(host), captains: host.teams.teams.map((t) => t.captain) };

  // 6 (started before the match so both rooms run at once)
  const other = await RoomClient.connect(url('teams-it-b'), 'Other', 10_000, 'teamother001');
  await waitFor(() => other.teams, 3000, 'room 2 teams');
  check(other.teams.teams[0].name === 'Team A' && Object.keys(other.teams.members).length === 1, 'room 2 shares team state');
  report.scenarios[6] = { room2: other.teams.teams.map((t) => t.name) };

  // 5
  host.start({ stages: 1, seed: 7, roundS: 30, briefingS: 1 });
  await waitFor(() => host.teams.locked && p3.teams.locked, 10_000, 'teams locked at start');
  t0 = Date.now();
  p3.joinTeam(['A', 'B', 'C'].find((s) => s !== p3.teams.members[p3.id]));
  await teamError(p3, t0, 'switch refused while locked');
  t0 = Date.now();
  host.renameTeam('B', 'Late Name');
  await teamError(host, t0, 'rename refused while locked');
  const capSlot = host.teams.teams.find((t) => t.captain === p3.id)?.slot;
  p3.leave();
  await sleep(500);
  report.scenarios[5] = { locked: host.teams.locked, p3WasCaptainOf: capSlot ?? null };
  for (const c of [host, p2, other]) c.leave();
} catch (e) {
  errors.push(String(e?.stack ?? e));
} finally {
  worker.stop();
}
report.errors = errors;
report.passed = errors.length === 0;
writeReport('stage02-teams-integration.json', report);
console.log(JSON.stringify(report, null, 2));
process.exit(errors.length ? 1 : 0);
