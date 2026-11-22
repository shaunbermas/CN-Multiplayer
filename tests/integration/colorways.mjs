// Shared contestant colourways and lobby emotes against the real Worker + Durable Object (wrangler dev).
//  - 30 clients join one room: 30 different colourways (CW01–CW30)
//  - reconnect: five players leave and rejoin with the same browser key: each gets the same colourway back
//  - a player without a key rejoining still gets a free (unique) colourway
//  - emote: a lobby jump is rebroadcast to everyone and never moves the player (server-owned position)
// Usage: npm run test:colorways
import { execSync } from 'node:child_process';
import { RoomClient } from '../../packages/shared/src/index.ts';
import { root, sleep, startWorker, writeReport } from '../lib.mjs';

const PORT = Number(process.env.COLORWAY_PORT ?? 8796);
const ROOM = 'colours';
const url = `ws://127.0.0.1:${PORT}/api/room/${ROOM}/ws`;
const errors = [];
const report = {};
if (process.env.SKIP_BUILD !== '1') execSync('npm run build', { cwd: root, stdio: 'ignore' });
const worker = startWorker(PORT);
const key = (i) => `testkey${String(i).padStart(4, '0')}abcdef`;
const waitFor = async (fn, label, ms = 20_000) => { const t = Date.now(); while (Date.now() - t < ms) { if (fn()) return; await sleep(50); } throw new Error(`Timed out: ${label}`); };
try {
  await worker.ready;
  const clients = [];
  for (let i = 0; i < 30; i++) clients.push(await RoomClient.connect(url, `C${i}`, 10_000, key(i)));
  await waitFor(() => clients[0].players.size === 30, '30 in roster');
  const mine = (c) => c.players.get(c.id)?.colorway;
  const first = clients.map(mine);
  report.unique_colorways_30 = new Set(first).size;
  if (report.unique_colorways_30 !== 30 || first.some((c) => !/^CW\d{2}$/.test(c ?? ''))) errors.push(`30 players got ${report.unique_colorways_30} distinct colourways`);

  // reconnect with the same key: same colourway (the room keeps key -> colourway)
  const back = [];
  for (const i of [3, 7, 11, 19, 26]) {
    clients[i].leave();
    await waitFor(() => clients[0].players.size === 29, `player ${i} left`);
    const c = await RoomClient.connect(url, `C${i}`, 10_000, key(i));
    clients[i] = c;
    await waitFor(() => !!mine(c), `player ${i} back`);
    back.push({ player: i, before: first[i], after: mine(c) });
    if (mine(c) !== first[i]) errors.push(`Player ${i} reconnected with ${mine(c)}, had ${first[i]}`);
  }
  report.reconnects = back;
  // a keyless rejoin still gets a unique colourway
  clients[29].leave();
  await waitFor(() => clients[0].players.size === 29, 'player 29 left');
  clients[29] = await RoomClient.connect(url, 'NoKey');
  await waitFor(() => clients[0].players.size === 30, 'keyless back');
  const now = clients.map(mine);
  report.unique_after_rejoins = new Set(now).size;
  if (report.unique_after_rejoins !== 30) errors.push(`After rejoins: ${report.unique_after_rejoins} distinct colourways`);

  // emote: rebroadcast to others, position unchanged
  const actor = clients[5];
  await sleep(300);
  const before = { ...actor.players.get(actor.id) };
  actor.send({ t: 'emote', e: 'jump' });
  await waitFor(() => clients[9].emotes.some((e) => e.id === actor.id && e.e === 'jump'), 'emote received by another player');
  actor.send({ t: 'emote', e: 'jump' }); // too soon: rate limited
  actor.send({ t: 'emote', e: 'fly' });  // unknown: ignored
  await sleep(600);
  const after = actor.players.get(actor.id);
  report.emote = { received_by_others: true, count_seen_by_c9: clients[9].emotes.filter((e) => e.id === actor.id).length, moved_m: Math.hypot(after.x - before.x, after.z - before.z) };
  if (report.emote.count_seen_by_c9 !== 1) errors.push(`Expected 1 emote after rate limiting, saw ${report.emote.count_seen_by_c9}`);
  if (report.emote.moved_m > 1e-6) errors.push(`An emote moved the player by ${report.emote.moved_m} m`);
  clients.forEach((c) => c.leave());
} catch (e) { errors.push(String(e?.stack ?? e)); } finally { worker.stop(); }
const out = { result: errors.length ? 'FAIL' : 'PASS', errors, date: new Date().toISOString(), ...report };
writeReport('colorways-integration.json', out);
console.log(JSON.stringify(out, null, 2));
process.exit(errors.length ? 1 : 0);
