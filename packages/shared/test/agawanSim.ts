// Full-room Agawan bot simulation helper (30 bots, real engine, movement, collisions, bot code, 1-in-3 decisions
// like the room). Used by agawan.test.ts and for tuning.
import { AGAWAN, AgawanEngine, getStage, newRoundPlayer, agawanBotInput, makeBot, step, sanitizeInput, resolvePlayerContacts, SIM_DT, TEAM_SLOTS, type AgawanBody, type TeamSlot, type BotBrain } from '../src/index.ts';

export function simulateAgawan(seed: number, roundS: number, n = 30, trace?: (t: number, e: AgawanEngine, ps: (AgawanBody & { brain: BotBrain })[]) => void, teamCount: 2 | 3 = 3) {
  const def = getStage(AGAWAN.id);
  const layout = def.agawan!.layout, nav = def.agawan!.nav;
  const ps: (AgawanBody & { vx: number; vz: number; brain: BotBrain; mv: { mx: number; mz: number; yaw: number } })[] = [];
  const teams: Record<string, TeamSlot> = {};
  for (let i = 0; i < n; i++) {
    const id = `b${i}`;
    ps.push({ ...newRoundPlayer(id, i + 1, i + 1, 0, 0), yaw: 0, vx: 0, vz: 0, brain: makeBot(seed * 31 + i * 7919), mv: { mx: 0, mz: 0, yaw: 0 } });
    teams[id] = TEAM_SLOTS[i % teamCount];
  }
  const e = new AgawanEngine(layout);
  e.start(ps, { seed, briefingS: 0, resultsS: 2, teams, roundS, teamCount });
  let t = 0, tick = 0;
  const counts = { hit: 0, tag: 0, rescue: 0, base: 0 };
  while (e.phase !== 'results' && t < roundS + 60) {
    t += SIM_DT; tick++;
    const ev = e.tick(t, ps);
    for (const x of e.events.splice(0)) counts[x.kind]++;
    void ev;
    const pub = e.phase === 'active' ? e.publicState() : null;
    ps.forEach((p, i) => {
      if (pub && (tick + i) % 3 === 0) {
        const act = agawanBotInput(p.brain, p, e.privateState(p.id), e, pub, ps, nav, t);
        e.setHold(p, act.hold);
        p.mv = { mx: act.mx, mz: act.mz, yaw: act.yaw };
      }
      if (!e.canMove(p)) return;
      const s = step(p, sanitizeInput(p.mv.mx, p.mv.mz), SIM_DT, layout.walls);
      Object.assign(p, s, { yaw: p.mv.yaw });
    });
    if (trace && tick % 300 === 0) trace(t, e, ps);
    resolvePlayerContacts(ps.filter((p) => p.status === 'active'), t, layout.walls, (a, b) => teams[a] === teams[b]);
  }
  return { counts, teams: e.publicState().teams };
}
