// Stage 02 · AGAWAN BASE HUD, after the pack's reference (04_UI_REFERENCES/STAGE_02_IN_GAME_HUD_REFERENCE.png,
// 06_UI_UX_AND_HUD_SPEC) in the game's existing frosted style, with decision 047's rules: timer, team scores and the
// three bases (owner colour and takeover progress) top right; your team, your hearts and your home base top left; a
// "Press E" prompt only when something is in reach; short banners; the team status board on Tab. Everything is read
// from the server's public and private state: the client decides nothing. The prompt is a hint from positions the
// client already has; the server still checks every press.
import { useEffect, useState } from 'react';
import { AGAWAN, TeamChampionship, getStage, type AgawanPublic, type TeamSlot } from '@cn-trials/shared';
import type { TrialRoom } from '../net.ts';
import { colorOf } from '../game/teamColors.ts';

const pad2 = (n: number) => String(n).padStart(2, '0');
const clock = (t: number) => { const c = Math.ceil(Math.max(0, t)); return `${pad2(Math.floor(c / 60))}:${pad2(c % 60)}`; };
const layout = getStage(AGAWAN.id).agawan!.layout;
const teamVar = (room: TrialRoom, s: TeamSlot) => ({ ['--team' as string]: colorOf(room, s) });

export function teamName(room: TrialRoom, slot: TeamSlot): string {
  return room.teams?.teams.find((t) => t.slot === slot)?.name ?? `Team ${slot}`;
}
function playerName(room: TrialRoom, id: string): string { return room.players.get(id)?.name ?? 'Someone'; }
const baseName = (room: TrialRoom, s: TeamSlot) => `${teamName(room, s)}'s base`;

/** The small team letter chip in the team's colour (never colour alone: the letter is always there). */
export function TeamChip({ room, slot }: { room: TrialRoom; slot: TeamSlot }) {
  return <i className="ag-chip" style={teamVar(room, slot)} aria-hidden="true">{slot}</i>;
}

/** Hearts as pips: filled for what is left. */
export function Hearts({ hp, max = AGAWAN.health.max, big = false }: { hp: number; max?: number; big?: boolean }) {
  return (
    <span className={`ag-hearts${big ? ' big' : ''}${hp <= 1 ? ' low' : ''}`} aria-label={`${hp} of ${max} hearts`} data-testid={big ? 'agawan-hearts' : undefined}>
      {Array.from({ length: max }, (_, i) => <i key={i} className={i < hp ? 'on' : ''} aria-hidden="true">♥</i>)}
    </span>
  );
}

/** Timer, team scores and the three bases (top right). */
export function AgawanTop({ room }: { room: TrialRoom }) {
  const ag = room.round.agawan;
  const mine = room.agawan?.team;
  return (
    <div className="glass ag-top" data-testid="agawan-top">
      <div className={`timer num${ag?.sudden ? ' closing' : ''}`} data-testid="timer"><small>{ag?.sudden ? 'Sudden death · first base taken wins' : 'Match time'}</small>{clock(room.remaining())}</div>
      <ol className="ag-scores" aria-label="Team score">
        {(ag?.teams ?? []).map((t) => (
          <li key={t.slot} className={t.slot === mine ? 'mine' : undefined} data-testid={`agawan-score-${t.slot}`}>
            <TeamChip room={room} slot={t.slot} /><span>{teamName(room, t.slot)}</span><b className="num">{pad2(t.score)}</b>
          </li>
        ))}
      </ol>
      <ul className="ag-bases" aria-label="Bases" data-testid="agawan-bases">
        {(ag?.bases ?? []).map((b) => {
          const taking = b.cap && b.cap.p > 0.01 ? b.cap : null;
          return (
            <li key={b.slot} style={teamVar(room, b.owner)} className={b.owner !== b.slot ? 'stolen' : undefined} data-testid={`agawan-base-${b.slot}`}
              title={`Base ${b.slot}: held by ${teamName(room, b.owner)}${taking ? `, ${teamName(room, taking.team)} taking it` : ''}`}>
              <span className="ag-base-letter">{b.slot}</span>
              <span className="ag-base-owner">{b.owner === mine ? 'Yours' : teamName(room, b.owner)}</span>
              <i className="bar" style={taking ? teamVar(room, taking.team) : undefined}><i style={{ width: `${Math.round((taking?.p ?? 0) * 100)}%` }} /></i>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Your team, your hearts and your home base (top left, under the stage chip). */
export function AgawanTeamChip({ room }: { room: TrialRoom }) {
  const me = room.agawan, ag = room.round.agawan;
  if (!me || !ag) return null;
  const home = ag.bases.find((b) => b.slot === me.team);
  const status = !home ? 'active'
    : home.owner !== me.team ? `taken by ${teamName(room, home.owner)}: take it back`
    : home.cap && home.cap.team !== me.team && home.cap.p > 0.01 ? `under attack · ${Math.round(home.cap.p * 100)}%`
    : 'yours';
  const held = ag.bases.filter((b) => b.owner === me.team).length;
  return (
    <div className="glass ag-team" data-testid="agawan-team" style={teamVar(room, me.team)}>
      <TeamChip room={room} slot={me.team} />
      <div>
        <b>{teamName(room, me.team)}</b>
        <span className={home && (home.owner !== me.team || status.startsWith('under')) ? 'warn' : undefined}>Base {me.team} · {status}</span>
        <span className="muted">{held} of {ag.bases.length} bases held</span>
      </div>
      {!me.pen && <Hearts hp={me.hp} big />}
    </div>
  );
}

type Prompt = { key: 'Press' | 'Hold' | 'Stay'; label: string; extra?: string } | null;

/** What E would do right now, by the same rules as the server (hit first, then free a teammate). */
function nearbyAction(room: TrialRoom, ag: AgawanPublic): Prompt {
  const me = room.agawan, self = room.self;
  if (!me || !self || me.pen || me.protectLeft > 0 || self.status !== 'active') return null;
  const fx = -Math.sin(self.yaw), fz = -Math.cos(self.yaw), cosMax = Math.cos((AGAWAN.health.facingDeg * Math.PI) / 180);
  let best: { d: number; id: string } | null = null;
  for (const [id, p] of room.players) {
    const t = ag.teamOf[id];
    if (!t || id === room.id || t === me.team || p.status !== 'active' || ag.protected.includes(id)) continue;
    const dx = p.x - self.x, dz = p.z - self.z, d = Math.hypot(dx, dz);
    if (d > AGAWAN.health.reachM + 0.15) continue;
    if (d > 0.35 && (dx * fx + dz * fz) / d < cosMax) continue;
    if (!best || d < best.d) best = { d, id };
  }
  if (best) {
    const hp = ag.hp[best.id] ?? AGAWAN.health.max;
    return { key: 'Press', label: `Hit ${playerName(room, best.id)}`, extra: hp <= 1 ? 'last heart: captures them' : `${hp} hearts left` };
  }
  const captive = ag.prisoners.find(([id, pen]) => ag.teamOf[id] === me.team && pen !== me.team && (() => { const p = room.players.get(id); return p && Math.hypot(p.x - self.x, p.z - self.z) <= AGAWAN.rescue.distM + 0.2; })());
  if (captive) return { key: 'Hold', label: `Free ${playerName(room, captive[0])}` };
  for (const b of ag.bases) {
    if (b.owner === me.team) continue;
    const at = layout.bases[b.slot];
    if (Math.hypot(at.x - self.x, at.z - self.z) <= AGAWAN.base.zoneM) {
      const blocked = b.inside.some((t) => t !== me.team);
      return { key: 'Stay', label: blocked ? `Clear the defenders out of ${baseName(room, b.slot)}` : `Taking ${baseName(room, b.slot)}`, extra: blocked ? 'capture paused' : 'more teammates = faster' };
    }
  }
  return null;
}

/** Your own state, the prompt, banners and the feed. */
export function AgawanPanel({ room }: { room: TrialRoom }) {
  const me = room.agawan;
  const r = room.round;
  const ag = r.agawan;
  if (!me || !ag || r.phase !== 'active') return null;
  const now = Date.now();
  const recent = (ms: number) => room.agawanFeed.filter((e) => now - e.at < ms);
  const feed = recent(4500).filter((e) => e.kind === 'tag' || e.kind === 'rescue').slice(-4);
  const base = recent(3500).filter((e) => e.kind === 'base').at(-1);
  const freed = recent(3000).find((e) => e.kind === 'rescue' && e.id === room.id);
  const hitMe = recent(900).filter((e) => e.kind === 'hit' && e.id === room.id).at(-1);
  const hitMade = recent(700).filter((e) => e.kind === 'hit' && e.by === room.id).at(-1);
  const helpNeeded = recent(4000).filter((e) => e.kind === 'tag' && ag.teamOf[e.id] === me.team && e.id !== room.id && ag.prisoners.some(([id]) => id === e.id)).at(-1);
  const prompt = me.rescue ? null : nearbyAction(room, ag);
  const elapsed = r.elapsed + (now - room.roundAt) / 1000;
  return (
    <>
      {elapsed < 8 && !me.pen && (
        <div className="glass ag-objective" data-testid="agawan-objective"><small>Objective</small><span>Take enemy bases (+{AGAWAN.points.baseCapture}) · Tap <kbd>E</kbd> on rivals: 3 hits capture · Hold bases at the whistle (+{AGAWAN.points.baseHeld} each)</span></div>
      )}
      {base && base.kind === 'base' && (
        <div className={`ag-raid-banner${base.from === me.team ? ' against' : base.team === me.team ? ' ours' : ''}`} data-testid="agawan-base-banner" style={teamVar(room, base.team)}>
          <b>{base.team === me.team ? 'Base taken!' : base.from === me.team ? 'Base lost' : 'Base taken'}</b>
          <span>{base.team === base.base ? `${teamName(room, base.team)} took their base back` : `${teamName(room, base.team)} took ${baseName(room, base.base)}`}</span>
          <em className="num">+{base.points}</em>
        </div>
      )}
      {me.pen && (
        <div className="banner spotted ag-captured" data-testid="agawan-captured"><b>Captured</b>
          <span>In {teamName(room, me.pen)}'s pen. Only a teammate can free you.</span>
          <span className="ag-release">Wait for a rescue: a teammate holds <kbd>E</kbd> at the fence</span></div>
      )}
      {!me.pen && freed && (
        <div className="banner finished" data-testid="agawan-freed"><b>Rescued</b>
          <span>{freed.kind === 'rescue' ? `${playerName(room, freed.by)} freed you. ` : ''}1 heart left: go to a base your team owns to heal.</span></div>
      )}
      {!me.pen && hitMe && hitMe.kind === 'hit' && <div className="ag-hit-flash" data-testid="agawan-hit" aria-hidden="true" />}
      {!me.pen && hitMade && hitMade.kind === 'hit' && (
        <div className="ag-hit-pop" key={hitMade.at}><Hearts hp={hitMade.hp} /></div>
      )}
      {!me.pen && !freed && me.protectLeft > 0 && <div className="glass ag-protect" data-testid="agawan-protected">Protected {me.protectLeft.toFixed(1)} s</div>}
      {!me.pen && me.healing && me.hp < AGAWAN.health.max && <div className="glass ag-heal" data-testid="agawan-healing">Healing at your base <Hearts hp={me.hp} /></div>}
      {!me.pen && !me.healing && me.hp <= 1 && me.protectLeft <= 0 && !freed && <div className="glass ag-low" data-testid="agawan-low">1 heart left · go home to heal</div>}
      {me.rescue && (
        <div className="glass ag-hold" data-testid="agawan-hold">
          <small>Freeing</small><span>{playerName(room, me.rescue.target)}</span>
          <i className="bar"><i style={{ width: `${Math.round(me.rescue.progress * 100)}%` }} /></i>
        </div>
      )}
      {prompt && (
        <div className="glass ag-prompt" data-testid="agawan-prompt"><small>{prompt.key === 'Stay' ? 'In the ring' : 'Nearby'}</small>
          <span>{prompt.key !== 'Stay' && <><kbd>E</kbd> {prompt.key} · </>}{prompt.label}</span>{prompt.extra && <em>{prompt.extra}</em>}</div>
      )}
      {helpNeeded && helpNeeded.kind === 'tag' && !me.pen && (
        <div className="glass ag-help" data-testid="agawan-help" style={teamVar(room, me.team)}>Your teammate needs help · {playerName(room, helpNeeded.id)} is in {teamName(room, helpNeeded.pen)}'s pen</div>
      )}
      <ul className="ag-feed" aria-live="polite">
        {feed.map((e, i) => (
          <li key={`${e.at}-${i}`}>{
            e.kind === 'tag' ? <><TeamChip room={room} slot={ag.teamOf[e.by]} />{playerName(room, e.by)} captured {playerName(room, e.id)}{e.points ? <b> +{e.points}</b> : ''}</>
              : e.kind === 'rescue' ? <><TeamChip room={room} slot={ag.teamOf[e.by]} />{playerName(room, e.by)} freed {playerName(room, e.id)}{e.points ? <b> +{e.points}</b> : ''}</>
              : null
          }</li>
        ))}
      </ul>
    </>
  );
}

/** Hold Tab: the three teams with every member's state and the team's numbers. */
export function AgawanTeamStatus({ room }: { room: TrialRoom }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const down = (e: KeyboardEvent) => { if (e.code === 'Tab') { e.preventDefault(); setOpen(true); } };
    const up = (e: KeyboardEvent) => { if (e.code === 'Tab') { e.preventDefault(); setOpen(false); } };
    const blur = () => setOpen(false);
    window.addEventListener('keydown', down); window.addEventListener('keyup', up); window.addEventListener('blur', blur);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); window.removeEventListener('blur', blur); };
  }, []);
  const ag = room.round.agawan;
  if (!open || !ag) return null;
  const held = new Map(ag.prisoners.map(([id, pen]) => [id, { pen }]));
  return (
    <section className="card ag-status" data-testid="agawan-status" aria-label="Team status">
      <header><span className="eyebrow">Team status</span><span className="muted">Release Tab to close</span></header>
      <div className="ag-status-cols" data-count={ag.teams.length}>
        {[...ag.teams].sort((a, b) => b.score - a.score).map((t) => {
          const members = Object.entries(ag.teamOf).filter(([, s]) => s === t.slot).map(([id]) => ({ id, p: room.players.get(id) }));
          return (
            <div key={t.slot} className={`ag-col${t.slot === room.agawan?.team ? ' mine' : ''}`} style={teamVar(room, t.slot)}>
              <h3><TeamChip room={room} slot={t.slot} />{teamName(room, t.slot)}<b className="num">{t.score}</b></h3>
              <p className="muted num">{t.held} {t.held === 1 ? 'base' : 'bases'} held · {t.baseCaptures} taken · {t.captures} captured · {t.rescues} freed</p>
              <ul>
                {members.map(({ id, p }) => {
                  const h = held.get(id);
                  return <li key={id} className={id === room.id ? 'me' : undefined}><span>{p?.name ?? 'Player'}{p?.bot && <i className="tag bot">bot</i>}</span>
                    {h ? <em className="held">in {teamName(room, h.pen)}'s pen · needs a rescue</em>
                      : ag.protected.includes(id) ? <em className="safe">protected</em>
                      : <Hearts hp={ag.hp[id] ?? AGAWAN.health.max} />}</li>;
                })}
              </ul>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/** Stage results for Agawan Base: team ranking with score, bases taken, captures and rescues, then the MVP. */
export function AgawanResultsBoard({ room }: { room: TrialRoom }) {
  const ag = room.round.agawan;
  const rows = room.results;
  if (!ag || !rows.some((r) => r.teamPlace)) return null;
  const place = (s: TeamSlot) => rows.find((r) => r.team === s)?.teamPlace ?? 3;
  const teams = [...ag.teams].sort((a, b) => place(a.slot) - place(b.slot) || b.score - a.score);
  const P = AGAWAN.points;
  const value = (r: (typeof rows)[number]) => (r.raids ?? 0) * P.baseCapture + (r.tags ?? 0) * P.capture + (r.rescues ?? 0) * P.rescue;
  const best = [...rows].sort((a, b) => value(b) - value(a))[0];
  return (
    <div className="ag-results" data-testid="agawan-results">
      <ol className="ag-rank">
        {teams.map((t) => {
          const pts = rows.find((r) => r.team === t.slot)?.points ?? 0;
          return (
            <li key={t.slot} className={`p${place(t.slot)}${t.slot === room.agawan?.team ? ' mine' : ''}`} style={teamVar(room, t.slot)} data-testid={`agawan-rank-${t.slot}`}>
              <span className="pl">{place(t.slot)}</span><TeamChip room={room} slot={t.slot} />
              <div className="nm"><b>{teamName(room, t.slot)}</b><small className="num">{t.baseCaptures} bases taken · {t.held} held at the end · {t.captures} captures · {t.rescues} rescues</small></div>
              <span className="sc num">{t.score}<small>score</small></span>
              <span className="gain num">+{pts}<small>each</small></span>
            </li>
          );
        })}
      </ol>
      <p className="muted ag-score-key">Base taken +{P.baseCapture} · base held at the end +{P.baseHeld} · capture +{P.capture} · rescue +{P.rescue}</p>
      {best && value(best) > 0 && (
        <p className="ag-mvp" data-testid="agawan-mvp"><span className="eyebrow">Most valuable</span> <b>{best.name}</b> <span className="muted num">{best.raids ?? 0} bases · {best.tags ?? 0} captures · {best.rescues ?? 0} rescues</span></p>
      )}
    </div>
  );
}

/** Team championship board (matches with teams): 3 / 2 / 1 per stage, total, and how this stage was ranked. */
export function TeamChampionshipBoard({ room, final = false }: { room: TrialRoom; final?: boolean }) {
  const b = room.teamBoard;
  if (!b) return null;
  const stageIds = b.order;
  const champions = b.standings.filter((t) => t.rank === 1);
  const why = champions.length === 1 ? TeamChampionship.tieBreak(b.standings[0], b.standings[1]) : null;
  return (
    <div className={`ag-champ${final ? ' final' : ''}`} data-testid="team-championship">
      {final && (
        <div className="ag-champ-hero" data-testid="team-champion" style={teamVar(room, champions[0].slot)}>
          <span className="eyebrow">{champions.length > 1 ? 'Joint team champions' : 'Team champion'}</span>
          <h3>{champions.map((t) => teamName(room, t.slot)).join(' and ')}</h3>
          <p className="muted">{champions[0].points} championship points{why ? ` · won the tie on ${why}` : champions.length > 1 ? ' each · tied on every rule' : ''}</p>
        </div>
      )}
      <table className="board ag-champ-table">
        <thead><tr><th /><th>Team</th>{b.standings[0].perStage.map((_, i) => <th key={i} className="r">{stageIds[i] ? `S${pad2(getStage(stageIds[i]).number)}` : `#${i + 1}`}</th>)}<th className="r">Total</th></tr></thead>
        <tbody>
          {b.standings.map((t) => (
            <tr key={t.slot} className={t.slot === room.agawan?.team || room.teams?.members[room.id] === t.slot ? 'me' : ''} data-testid={`team-standing-${t.slot}`}>
              <td className="place">{t.rank}</td>
              <td className="name"><TeamChip room={room} slot={t.slot} /> {teamName(room, t.slot)}</td>
              {t.perStage.map((x, i) => <td key={i} className="r num">{x ?? '–'}</td>)}
              <td className="r total">{t.points}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {b.stage && <p className="muted ag-champ-note">{b.stage.by === 'average' ? 'This stage: teams ranked by their members’ average points' : 'This stage: teams ranked by Agawan Base score'} · 1st 3, 2nd 2, 3rd 1 · ties share the place</p>}
    </div>
  );
}
