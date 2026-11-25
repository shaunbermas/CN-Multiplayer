// Stage 01 obstacles against the real Worker + Durable Object (wrangler dev): the server, not the client,
// enforces the barricades and the sliding gate. Obstacles are always on (decision 031), in the lobby too.
//  - host starts a seeded test round WITH obstacles; a bot spawns, then walks straight down the course centre,
//    only while the light is green (so it is never spotted)
//  - expected: the server stops it at the first row whose centre is closed (row 2), it is never spotted, the
//    round state publishes obstacles=true, and the gate's server-side position never changes during red
//  - the lobby and a round started without any option both report obstacles on (the default)
//  - a second round with obstacles:false (honoured only in test mode): the same walk passes that row
// Usage: npm run test:obstacles
import { execSync } from 'node:child_process';
import {
  MOVEMENT, RoomClient, buildSchedule, getStage, greenTime, gateRect, resolveObstacles, segmentAt,
} from '../../packages/shared/src/index.ts';
import { root, sleep, startWorker, writeReport } from '../lib.mjs';

const PORT = Number(process.env.OBSTACLE_PORT ?? 8793);
const SEED = 12345;
const ROUND_S = 60;
const errors = [];
const report = {};
if (process.env.SKIP_BUILD !== '1') execSync('npm run build', { cwd: root, stdio: 'ignore' });
const worker = startWorker(PORT);
const geo = getStage('STAGE_01_RED_LIGHT').geometry;
const obs = resolveObstacles(geo);
// the first row (from the start) whose centre is closed: a walker going straight down the centre stops there
const closedRow = obs.barricades.filter((r) => r.minX < obs.gate.centreX && r.maxX > obs.gate.centreX).sort((a, b) => b.maxZ - a.maxZ)[0];
const schedule = buildSchedule(SEED, ROUND_S);

const waitFor = async (fn, label, ms = 90_000) => {
  const t = Date.now();
  while (Date.now() - t < ms) { if (fn()) return; await sleep(50); }
  throw new Error(`Timed out: ${label}`);
};

/** Walk the bot to the course centre line, then straight toward the finish, only on green. One input per
 *  simulation tick (the server applies one per tick), on a local clock anchored at GO, stopping 0.5 s before
 *  the green ends so no queued input can carry it into the red. */
async function walkCentre(bot, untilZ, maxS) {
  let seq = 1;
  const goLocal = Date.now() - bot.round.elapsed * 1000;
  const t0 = Date.now();
  let minZ = Infinity;
  while (Date.now() - t0 < maxS * 1000 && bot.round.phase === 'active') {
    const me = bot.self;
    const t = (Date.now() - goLocal) / 1000;
    const go = segmentAt(schedule, t)?.signal === 'green' && segmentAt(schedule, t + 0.5)?.signal === 'green';
    const mx = go ? Math.max(-1, Math.min(1, (obs.gate.centreX - me.x) * 0.8)) : 0;
    const mz = go ? -1 : 0;
    const len = Math.hypot(mx, mz) || 1;
    bot.send({ t: 'input', seq: seq++, mx: mx / len, mz: mz / len, yaw: 0 });
    minZ = Math.min(minZ, me.z);
    if (me.z < untilZ || me.status !== 'active') break;
    await sleep(33);
  }
  return { z: bot.self.z, x: bot.self.x, minZ, status: bot.self.status };
}

try {
  await worker.ready;
  const url = `ws://127.0.0.1:${PORT}/api/room/obstacle-test/ws`;
  const bot = await RoomClient.connect(url, 'Walker');
  await waitFor(() => bot.snapshots > 0 && bot.self, 'snapshot');
  report.lobby_obstacles = bot.round.obstacles;
  if (bot.round.obstacles !== true) errors.push(`Lobby obstacles=${bot.round.obstacles}, expected true (always on)`);

  // ---- round 1: no option given: obstacles are on by default
  bot.start({ seed: SEED, roundS: ROUND_S, briefingS: 1, stages: 1, resultsS: 3 });
  await waitFor(() => bot.round.phase === 'briefing', 'briefing');
  if (bot.round.obstacles !== true) errors.push(`Round state obstacles=${bot.round.obstacles}, expected true`);
  bot.skipBriefing();
  await waitFor(() => bot.round.phase === 'active', 'active');
  const stopAt = closedRow.maxZ + MOVEMENT.capsuleRadius;
  const r1 = await walkCentre(bot, closedRow.minZ - 3, 45);
  report.with_obstacles = { ...r1, closed_row_face_z: +closedRow.maxZ.toFixed(2), expected_stop_z: +stopAt.toFixed(2) };
  if (r1.status !== 'active') errors.push(`Walker was ${r1.status} with obstacles (walks only on green)`);
  if (!(r1.minZ >= stopAt - 0.05)) errors.push(`Walker passed the closed barricade row: min z ${r1.minZ.toFixed(2)}, face at ${stopAt.toFixed(2)}`);
  if (!(Math.abs(r1.z - stopAt) < 1.0)) errors.push(`Walker did not reach the barricade face: z ${r1.z.toFixed(2)} vs ${stopAt.toFixed(2)}`);
  // The gate the server simulates is frozen through every red segment (pure function of green time).
  for (const s of schedule.filter((x) => x.signal === 'red')) {
    if (Math.abs(gateRect(obs, greenTime(schedule, s.start + 1e-3)).minX - gateRect(obs, greenTime(schedule, s.end - 1e-3)).minX) > 1e-9) errors.push('Gate moves during red');
  }
  await waitFor(() => bot.round.phase === 'results', 'results 1', (ROUND_S + 10) * 1000);
  await waitFor(() => bot.round.phase === 'lobby', 'lobby', 40_000);

  // ---- round 2: obstacles OFF (test mode only): the same walk goes past that row
  bot.start({ seed: SEED, roundS: ROUND_S, briefingS: 1, obstacles: false, stages: 1, resultsS: 3 });
  await waitFor(() => bot.round.phase === 'briefing', 'briefing 2');
  if (bot.round.obstacles !== false) errors.push(`Round 2 obstacles=${bot.round.obstacles}, expected false`);
  bot.skipBriefing();
  await waitFor(() => bot.round.phase === 'active', 'active 2');
  const r2 = await walkCentre(bot, closedRow.minZ - 3, 45);
  report.without_obstacles = r2;
  if (!(r2.minZ < closedRow.minZ - 2)) errors.push(`Without obstacles the walker should pass the row: min z ${r2.minZ.toFixed(2)}`);
  bot.close?.();
} catch (e) {
  errors.push(String(e?.stack ?? e));
} finally {
  worker.stop();
}
const out = { result: errors.length ? 'FAIL' : 'PASS', errors, date: new Date().toISOString(), seed: SEED, layout: obs.id, barricades: obs.barricades.length, ...report };
writeReport('obstacles-integration.json', out);
console.log(JSON.stringify(out, null, 2));
process.exit(errors.length ? 1 : 0);
