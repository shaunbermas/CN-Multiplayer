// Stage 02 · AGAWAN BASE team setup in the lobby (decisions 045 and 047).
// The host picks how teams are made: Shuffle (the host deals everyone into random teams, captains picked for them) or
// Pick your team (everyone joins a team themselves, nominates, the host appoints captains). Team colours are dealt at
// random; the host can deal new ones, and picks 2 or 3 teams (decision 049). One card per team: a colour band with the name (host renames), members in a
// compact two-column grid with the captain marked, and the one action that fits (join, nominate).
// The room checks every rule; refusals come back as room.lastError (code 'team') and show under the cards.
import { useState, type CSSProperties } from 'react';
import { AGAWAN_ENABLED, TEAMS, colorwayById, type TeamSlot } from '@cn-trials/shared';
import type { TrialRoom } from '../net.ts';

/** Team setup shows once Agawan Base is switched on, or with ?teams=1 for previews and tests. */
export const teamsVisible = () => AGAWAN_ENABLED || new URLSearchParams(location.search).get('teams') === '1';

function TeamName({ room, slot, name, host, locked }: { room: TrialRoom; slot: TeamSlot; name: string; host: boolean; locked: boolean }) {
  const [draft, setDraft] = useState<string | null>(null);
  if (!host || locked) return <span className="team-name" data-testid={`team-name-${slot}`}>{name}</span>;
  if (draft === null) {
    return (
      <button className="team-name editable" title="Rename team" onClick={() => setDraft(name)} data-testid={`team-name-${slot}`}>
        {name}<span className="pen" aria-hidden="true">✎</span>
      </button>
    );
  }
  const save = () => { if (draft.trim() && draft.trim() !== name) room.renameTeam(slot, draft); setDraft(null); };
  return (
    <input className="team-name-input" autoFocus value={draft} maxLength={TEAMS.nameMax + 4} aria-label={`New name for ${name}`} placeholder={name}
      data-testid={`team-rename-${slot}`} onChange={(e) => setDraft(e.target.value)} onBlur={save} onFocus={(e) => e.currentTarget.select()}
      onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') save(); if (e.key === 'Escape') setDraft(null); }} />
  );
}

export function TeamLobby({ room }: { room: TrialRoom }) {
  const t = room.teams;
  if (!t) return null;
  const host = room.isHost;
  const open = !t.locked;
  const shuffle = t.mode === 'shuffle';
  // Decision 049: the host plays with 2 or 3 teams. 30 players either way, so a team holds 15 or 10.
  const count = t.count ?? 3;
  const cap = Math.ceil(30 / count);
  const slots = t.teams.map((x) => x.slot);
  const mySlot = t.members[room.id] as TeamSlot | undefined;
  const nominated = t.nominees.includes(room.id);
  const err = room.lastError?.code === 'team' && Date.now() - room.lastError.at < 6000 ? room.lastError.message : '';
  const players = [...room.players.values()].sort((a, b) => a.spawn - b.spawn);
  const nameOf = (s: TeamSlot) => t.teams.find((x) => x.slot === s)?.name ?? `Team ${s}`;
  const colorOf = (s: TeamSlot) => t.teams.find((x) => x.slot === s)?.color ?? TEAMS.colors[s];
  const hint = t.locked ? 'Locked for this match'
    : shuffle ? (host ? 'Teams are dealt at random. Shuffle again any time.' : 'The host deals the teams at random')
    : (host ? 'Players pick their team; you appoint captains' : 'Pick a team and nominate yourself as captain');
  return (
    <section className="teams" data-testid="teams" aria-label="Teams for Agawan Base">
      <header className="teams-head">
        <span className="card-title">Teams · Agawan Base</span>
        {host && open
          ? (
            <div className="teams-controls">
            <div className="seg" role="radiogroup" aria-label="How many teams" data-testid="team-count">
              {([2, 3] as const).map((n) => (
                <button key={n} role="radio" aria-checked={count === n} className={count === n ? 'on' : ''} onClick={() => { if (count !== n) room.setTeamCount(n); }} data-testid={`team-count-${n}`}>{n} teams</button>
              ))}
            </div>
            <div className="seg" role="radiogroup" aria-label="How teams are made" data-testid="team-mode">
              <button role="radio" aria-checked={shuffle} className={shuffle ? 'on' : ''} onClick={() => { if (!shuffle) room.setTeamMode('shuffle'); }} data-testid="team-mode-shuffle">Shuffle</button>
              <button role="radio" aria-checked={!shuffle} className={!shuffle ? 'on' : ''} onClick={() => { if (shuffle) room.setTeamMode('manual'); }} data-testid="team-mode-manual">Pick your team</button>
            </div>
            </div>
          )
          : <span className="teams-mode" data-testid="team-mode">{count} teams · {shuffle ? 'Shuffled' : 'Pick your team'}</span>}
      </header>
      <p className="teams-hint">{hint}</p>
      <div className="team-cards" data-count={count}>
        {t.teams.map((team) => {
          const ids = players.filter((p) => t.members[p.id] === team.slot);
          const full = ids.length >= cap;
          const mine = mySlot === team.slot;
          return (
            <article key={team.slot} className={`team-card${mine ? ' mine' : ''}`} style={{ '--team': team.color } as CSSProperties} data-testid={`team-${team.slot}`}>
              <div className="team-band">
                <i className="team-dot" aria-hidden="true" />
                <TeamName room={room} slot={team.slot} name={team.name} host={host} locked={t.locked} />
                <span className="team-count num" data-testid={`team-count-${team.slot}`}>{ids.length}<small>/{cap}</small></span>
              </div>
              {mine && <span className="team-you">Your team</span>}
              <ul className="team-members" aria-label={`${team.name} members`}>
                {ids.map((p) => {
                  const captain = p.id === team.captain;
                  const coat = colorwayById(p.colorway);
                  return (
                    <li key={p.id} className={`${p.id === room.id ? 'me' : ''}${captain ? ' captain' : ''}`} title={`${p.name}${p.bot ? ' (bot)' : ''}${captain ? ' · captain' : ''}`}>
                      <i className="coat" style={{ background: `#${coat?.coatSecondary ?? '445'}` }} aria-hidden="true" />
                      <span className="slot-name">{p.name}</span>
                      {captain ? <span className="crown" aria-label="Captain">★</span>
                        : t.nominees.includes(p.id) ? <span className="nom" aria-label="Nominated">☆</span>
                        : p.bot ? <span className="bot-tag">bot</span> : null}
                      {host && open && (
                        <span className="team-move">
                          {!captain && !shuffle && <button className="mini star" title={`Make ${p.name} captain`} onClick={() => room.setCaptain(team.slot, p.id)}>★</button>}
                          {slots.filter((s) => s !== team.slot).map((s) => (
                            <button key={s} className="mini" title={`Move ${p.name} to ${nameOf(s)}`} onClick={() => room.moveToTeam(p.id, s)}
                              style={{ '--team': colorOf(s) } as CSSProperties} aria-label={`Move to ${nameOf(s)}`} />
                          ))}
                        </span>
                      )}
                    </li>
                  );
                })}
                {ids.length === 0 && <li className="empty">No players yet</li>}
              </ul>
              <div className="team-foot">
                {open && !shuffle && !mine && (
                  <button className="btn wide" disabled={full} onClick={() => room.joinTeam(team.slot)} data-testid={`team-join-${team.slot}`}>{full ? 'Full' : 'Join team'}</button>
                )}
                {open && !shuffle && mine && (
                  <button className={`btn wide${nominated ? ' on' : ''}`} aria-pressed={nominated} onClick={() => room.nominate(!nominated)} data-testid="team-nominate">
                    {nominated ? '✓ Nominated as captain' : 'Nominate me as captain'}
                  </button>
                )}
                {(shuffle || t.locked) && <span className="team-captain-line" data-testid={`team-captain-${team.slot}`}>Captain · <b>{team.captain ? room.players.get(team.captain)?.name ?? 'None yet' : 'Picked at start'}</b></span>}
              </div>
            </article>
          );
        })}
      </div>
      {host && open && (
        <div className="team-tools">
          {shuffle
            ? <button className="btn" onClick={() => room.shuffleTeams()} data-testid="team-shuffle">⟳ Shuffle again</button>
            : <>
                <button className="btn ghost" onClick={() => room.balanceTeams()} data-testid="team-balance">Auto-balance</button>
                <button className="btn ghost" onClick={() => room.autoCaptains()} data-testid="team-auto-captains">Auto-pick captains</button>
              </>}
          <button className="btn ghost" onClick={() => room.recolorTeams()} data-testid="team-recolor">New colours</button>
        </div>
      )}
      <p className="team-error" role="status" aria-live="polite" data-testid="team-error">{err}</p>
    </section>
  );
}
