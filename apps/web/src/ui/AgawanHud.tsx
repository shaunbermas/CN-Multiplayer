// Stage 02 · AGAWAN BASE HUD, after the pack's reference (04_UI_REFERENCES/STAGE_02_IN_GAME_HUD_REFERENCE.png,
// 06_UI_UX_AND_HUD_SPEC) in the game's existing frosted style: timer and team scores top right, your team and home
// base status top left, a "Hold E" prompt only when something is in reach, short event banners, and the team status
// board on Tab. Everything is read from the server's public and private state: the client decides nothing. The
// prompt is a hint from positions the client already has; the server still checks every hold.
import { useEffect, useState } from 'react';
import { AGAWAN, TEAMS, TEAM_SLOTS, TeamChampionship, getStage, type TeamSlot } from '@cn-trials/shared';
import type { TrialRoom } from '../net.ts';

const pad2 = (n: number) => String(n).padStart(2, '0');
const clock = (t: number) => { const c = Math.ceil(Math.max(0, t)); return `${pad2(Math.floor(c / 60))}:${pad2(c % 60)}`; };
const layout = getStage(AGAWAN.id).agawan!.layout;

export function teamName(room: TrialRoom, slot: TeamSlot): string {
  return room.teams?.teams.find((t) => t.slot === slot)?.name ?? `Team ${slot}`;
}
function playerName(room: TrialRoom, id: string): string { return room.players.get(id)?.name ?? 'Someone'; }

/** The small team letter chip in the team's colour (never colour alone: the letter is always there). */
export function TeamChip({ slot }: { slot: TeamSlot }) {
  return <i className="ag-chip" style={{ ['--team' as string]: TEAMS.colors[slot] }} aria-hidden="true">{slot}</i>;
}

/** Timer and team scores (top right). */
export function AgawanTop({ room }: { room: TrialRoom }) {
  const ag = room.round.agawan;
  const mine = room.agawan?.team;
  return (
    <div className="glass ag-top" data-testid="agawan-top">
      <div className={`timer num${ag?.sudden ? ' closing' : ''}`} data-testid="timer"><small>{ag?.sudden ? 'Sudden death · first raid wins' : 'Match time'}</small>{clock(room.remaining())}</div>
      <ol className="ag-scores" aria-label="Team score">
        {(ag?.teams ?? []).map((t) => (
          <li key={t.slot} className={t.slot === mine ? 'mine' : undefined} data-testid={`agawan-score-${t.slot}`}>
            <TeamChip slot={t.slot} /><span>{teamName(room, t.slot)}</span><b className="num">{pad2(t.score)}</b>
          </li>
        ))}
      </ol>
    </div>
  );
}

/** Your team and your home base (top left, under the stage chip). */
export function AgawanTeamChip({ room }: { room: TrialRoom }) {
  const me = room.agawan, ag = room.round.agawan;
  if (!me || !ag) return null;
  // Your base was raided recently while any rival's cooldown on it runs.
  const cd = Math.max(0, ...TEAM_SLOTS.filter((s) => s !== me.team).map((s) => ag.raidCd[s + me.team] ?? 0));
  return (
    <div className="glass ag-team" data-testid="agawan-team" style={{ ['--team' as string]: TEAMS.colors[me.team] }}>
      <TeamChip slot={me.team} />
      <div><b>{teamName(room, me.team)}</b><span>{cd > 0 ? <>Base {me.team} raided · {clock(cd)}</> : <>Base {me.team} · active</>}</span></div>
    </div>
  );
}

type Prompt = { kind: 'tag' | 'rescue' | 'raid'; label: string } | null;

/** What a hold of E would do right now, by the same priority as the server (tag, then rescue, then raid). */
function nearbyAction(room: TrialRoom): { best: Prompt; others: string[] } {
  const me = room.agawan, ag = room.round.agawan, self = room.self;
  const none = { best: null, others: [] };
  if (!me || !ag || !self || me.pen || me.protectLeft > 0 || self.status !== 'active') return none;
  const opts: NonNullable<Prompt>[] = [];
  let bestTag: { d: number; id: string } | null = null;
  for (const [id, p] of room.players) {
    const t = ag.teamOf[id];
    if (!t || id === room.id) continue;
    const d = Math.hypot(p.x - self.x, p.z - self.z);
    if (t !== me.team && p.status === 'active' && !ag.protected.includes(id) && d <= AGAWAN.tag.distM + 0.2 && me.tagCd <= 0 && (!bestTag || d < bestTag.d)) bestTag = { d, id };
  }
  if (bestTag) opts.push({ kind: 'tag', label: `Tag ${playerName(room, bestTag.id)}` });
  const captive = ag.prisoners.find(([id, pen]) => ag.teamOf[id] === me.team && pen !== me.team && (() => { const p = room.players.get(id); return p && Math.hypot(p.x - self.x, p.z - self.z) <= AGAWAN.rescue.distM + 0.2; })());
  if (captive) opts.push({ kind: 'rescue', label: `Free ${playerName(room, captive[0])}` });
  for (const s of TEAM_SLOTS) {
    if (s === me.team || ag.raidCd[me.team + s]) continue;
    const b = layout.bases[s];
    if (Math.hypot(b.x - self.x, b.z - self.z) <= AGAWAN.raid.radiusM) opts.push({ kind: 'raid', label: `Raid ${teamName(room, s)}'s base` });
  }
  return { best: opts[0] ?? null, others: opts.slice(1).map((o) => o.kind === 'tag' ? 'tag' : o.kind === 'rescue' ? 'free' : 'raid') };
}

const ACTION: Record<string, string> = { tag: 'Tag in progress', rescue: 'Rescue in progress', raid: 'Raid in progress' };

/** Your own state, the prompt, banners and the feed. */
export function AgawanPanel({ room }: { room: TrialRoom }) {
  const me = room.agawan;
  const r = room.round;
  const ag = r.agawan;
  if (!me || !ag || r.phase !== 'active') return null;
  const now = Date.now();
  const recent = (ms: number) => room.agawanFeed.filter((e) => now - e.at < ms);
  const feed = recent(4500).filter((e) => e.kind !== 'raid').slice(-4);
  const raid = recent(3200).filter((e) => e.kind === 'raid').at(-1);
  const freed = recent(3000).find((e) => (e.kind === 'rescue' || e.kind === 'release') && e.id === room.id);
  const helpNeeded = recent(4000).filter((e) => e.kind === 'tag' && ag.teamOf[e.id] === me.team && e.id !== room.id && ag.prisoners.some(([id]) => id === e.id)).at(-1);
  const target = me.action ? (me.action.kind === 'raid' ? `${teamName(room, me.action.target as TeamSlot)}'s base` : playerName(room, me.action.target)) : '';
  const prompt = me.action ? null : nearbyAction(room);
  const elapsed = r.elapsed + (now - room.roundAt) / 1000;
  return (
    <>
      {elapsed < 7 && !me.pen && (
        <div className="glass ag-objective" data-testid="agawan-objective"><small>Objective</small>Raid an opponent base · Tag opponents · Rescue teammates</div>
      )}
      {raid && raid.kind === 'raid' && (
        <div className={`ag-raid-banner${raid.base === me.team ? ' against' : raid.team === me.team ? ' ours' : ''}`} data-testid="agawan-raid-banner" style={{ ['--team' as string]: TEAMS.colors[raid.team] }}>
          <b>Base raided</b><span>{teamName(room, raid.team)} raided {teamName(room, raid.base)}'s base</span><em className="num">+{raid.points}</em>
        </div>
      )}
      {me.pen && (
        <div className="banner spotted ag-captured" data-testid="agawan-captured"><b>Captured</b>
          <span>In {teamName(room, me.pen)}'s pen. A teammate can free you.</span>
          <span className="num ag-release">Prison release in {clock(me.releaseLeft)}</span></div>
      )}
      {!me.pen && freed && (
        <div className="banner finished" data-testid="agawan-freed"><b>{freed.kind === 'rescue' ? 'Rescued' : 'Released'}</b>
          <span>{freed.kind === 'rescue' ? `${playerName(room, freed.by)} freed you. ` : ''}Back at your base, protected for {AGAWAN.protectS} s.</span></div>
      )}
      {!me.pen && !freed && me.protectLeft > 0 && <div className="glass ag-protect" data-testid="agawan-protected">Protected {me.protectLeft.toFixed(1)} s</div>}
      {me.action && (
        <div className="glass ag-hold" data-testid="agawan-hold">
          <small>{ACTION[me.action.kind]}</small><span>{target}</span>
          <i className="bar"><i style={{ width: `${Math.round(me.action.progress * 100)}%` }} /></i>
        </div>
      )}
      {prompt?.best && (
        <div className="glass ag-prompt" data-testid="agawan-prompt"><small>Nearby</small>
          <span><kbd>E</kbd> Hold · {prompt.best.label}</span>{prompt.others.length > 0 && <em>also: {prompt.others.join(', ')}</em>}</div>
      )}
      {helpNeeded && helpNeeded.kind === 'tag' && !me.pen && (
        <div className="glass ag-help" data-testid="agawan-help" style={{ ['--team' as string]: TEAMS.colors[me.team] }}>Your teammate needs help · {playerName(room, helpNeeded.id)} is in {teamName(room, helpNeeded.pen)}'s pen</div>
      )}
      <ul className="ag-feed" aria-live="polite">
        {feed.map((e, i) => (
          <li key={`${e.at}-${i}`}>{
            e.kind === 'tag' ? <><TeamChip slot={ag.teamOf[e.by]} />{playerName(room, e.by)} tagged {playerName(room, e.id)}{e.points ? <b> +1</b> : ''}</>
              : e.kind === 'rescue' ? <><TeamChip slot={ag.teamOf[e.by]} />{playerName(room, e.by)} freed {playerName(room, e.id)}{e.points ? <b> +1</b> : ''}</>
              : e.kind === 'release' ? <>{playerName(room, e.id)} walked home</> : null
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
  const held = new Map(ag.prisoners.map(([id, pen, left]) => [id, { pen, left }]));
  return (
    <section className="card ag-status" data-testid="agawan-status" aria-label="Team status">
      <header><span className="eyebrow">Team status</span><span className="muted">Release Tab to close</span></header>
      <div className="ag-status-cols">
        {[...ag.teams].sort((a, b) => b.score - a.score).map((t) => {
          const members = Object.entries(ag.teamOf).filter(([, s]) => s === t.slot).map(([id]) => ({ id, p: room.players.get(id) }));
          return (
            <div key={t.slot} className={`ag-col${t.slot === room.agawan?.team ? ' mine' : ''}`} style={{ ['--team' as string]: TEAMS.colors[t.slot] }}>
              <h3><TeamChip slot={t.slot} />{teamName(room, t.slot)}<b className="num">{t.score}</b></h3>
              <p className="muted num">{t.raids} raids · {t.tags} tagged · {t.rescues} rescued · {t.prisoners} held</p>
              <ul>
                {members.map(({ id, p }) => {
                  const h = held.get(id);
                  return <li key={id} className={id === room.id ? 'me' : undefined}><span>{p?.name ?? 'Player'}{p?.bot && <i className="tag bot">bot</i>}</span>
                    <em className={h ? 'held' : ag.protected.includes(id) ? 'safe' : ''}>{h ? `in ${h.pen}'s pen · ${Math.ceil(h.left)} s` : ag.protected.includes(id) ? 'protected' : 'free'}</em></li>;
                })}
              </ul>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/** Stage results for Agawan Base: team ranking with score, raids, unique tags and rescues, then the MVP. */
export function AgawanResultsBoard({ room }: { room: TrialRoom }) {
  const ag = room.round.agawan;
  const rows = room.results;
  if (!ag || !rows.some((r) => r.teamPlace)) return null;
  const place = (s: TeamSlot) => rows.find((r) => r.team === s)?.teamPlace ?? 3;
  const teams = [...ag.teams].sort((a, b) => place(a.slot) - place(b.slot) || b.score - a.score);
  const best = [...rows].sort((a, b) => ((b.raids ?? 0) * 5 + (b.tags ?? 0) + (b.rescues ?? 0)) - ((a.raids ?? 0) * 5 + (a.tags ?? 0) + (a.rescues ?? 0)))[0];
  return (
    <div className="ag-results" data-testid="agawan-results">
      <ol className="ag-rank">
        {teams.map((t) => {
          const pts = rows.find((r) => r.team === t.slot)?.points ?? 0;
          return (
            <li key={t.slot} className={`p${place(t.slot)}${t.slot === room.agawan?.team ? ' mine' : ''}`} style={{ ['--team' as string]: TEAMS.colors[t.slot] }} data-testid={`agawan-rank-${t.slot}`}>
              <span className="pl">{place(t.slot)}</span><TeamChip slot={t.slot} />
              <div className="nm"><b>{teamName(room, t.slot)}</b><small className="num">{t.raids} base raids · {t.tags} opponents captured · {t.rescues} teammates rescued</small></div>
              <span className="sc num">{t.score}<small>score</small></span>
              <span className="gain num">+{pts}<small>each</small></span>
            </li>
          );
        })}
      </ol>
      {best && ((best.raids ?? 0) + (best.tags ?? 0) + (best.rescues ?? 0)) > 0 && (
        <p className="ag-mvp" data-testid="agawan-mvp"><span className="eyebrow">Most valuable</span> <b>{best.name}</b> <span className="muted num">{best.raids ?? 0} raids · {best.tags ?? 0} tags · {best.rescues ?? 0} rescues</span></p>
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
        <div className="ag-champ-hero" data-testid="team-champion" style={{ ['--team' as string]: TEAMS.colors[champions[0].slot] }}>
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
              <td className="name"><TeamChip slot={t.slot} /> {teamName(room, t.slot)}</td>
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
