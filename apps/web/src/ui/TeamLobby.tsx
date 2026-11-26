// Stage 02 · AGAWAN BASE team setup in the lobby (decision 045; handoff pack 03_TEAM_LOBBY_AND_CAPTAIN_MANAGEMENT).
// Three team cards: name (host renames), captain (host appoints from nominees or any member), members x/10.
// Everyone can join a team and nominate themselves; the host can move players, Auto-balance and Auto-pick captains.
// The room checks every rule; refusals come back as room.lastError (code 'team') and show under the cards.
import { useState, type CSSProperties } from 'react';
import { AGAWAN_ENABLED, TEAMS, TEAM_SLOTS, type TeamSlot } from '@cn-trials/shared';
import type { TrialRoom } from '../net.ts';

/** Team setup shows once Agawan Base is switched on, or with ?teams=1 for previews and tests. */
export const teamsVisible = () => AGAWAN_ENABLED || new URLSearchParams(location.search).get('teams') === '1';

function TeamName({ room, slot, name, host, locked }: { room: TrialRoom; slot: TeamSlot; name: string; host: boolean; locked: boolean }) {
  const [draft, setDraft] = useState<string | null>(null);
  if (!host || locked) return <span className="team-name" data-testid={`team-name-${slot}`}>{name}</span>;
  if (draft === null) return <button className="team-name editable" title="Rename team" onClick={() => setDraft(name)} data-testid={`team-name-${slot}`}>{name}</button>;
  const save = () => { if (draft.trim() && draft.trim() !== name) room.renameTeam(slot, draft); setDraft(null); };
  return (
    <input className="team-name-input" autoFocus value={draft} maxLength={TEAMS.nameMax + 4} aria-label={`New name for ${name}`}
      data-testid={`team-rename-${slot}`} onChange={(e) => setDraft(e.target.value)} onBlur={save}
      onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') save(); if (e.key === 'Escape') setDraft(null); }} />
  );
}

export function TeamLobby({ room }: { room: TrialRoom }) {
  const t = room.teams;
  if (!t) return null;
  const host = room.isHost;
  const mySlot = t.members[room.id] as TeamSlot | undefined;
  const nominated = t.nominees.includes(room.id);
  const err = room.lastError?.code === 'team' && Date.now() - room.lastError.at < 6000 ? room.lastError.message : '';
  const players = [...room.players.values()].sort((a, b) => a.spawn - b.spawn);
  return (
    <section className="teams" data-testid="teams" aria-label="Teams for Agawan Base">
      <header className="card-head">
        <span className="card-title">Teams · Agawan Base</span>
        <span className="eyebrow" style={{ marginLeft: 'auto' }}>{t.locked ? 'Locked for this match' : 'Pick a team; the host appoints captains'}</span>
      </header>
      <div className="team-cards">
        {t.teams.map((team) => {
          const ids = players.filter((p) => t.members[p.id] === team.slot);
          const captain = team.captain ? room.players.get(team.captain) : undefined;
          const full = ids.length >= TEAMS.maxPerTeam;
          return (
            <article key={team.slot} className={`team-card${mySlot === team.slot ? ' mine' : ''}`} style={{ '--team': team.color } as CSSProperties} data-testid={`team-${team.slot}`}>
              <div className="team-top">
                <i className="team-dot" aria-hidden="true" />
                <TeamName room={room} slot={team.slot} name={team.name} host={host} locked={t.locked} />
                <span className="team-count num" data-testid={`team-count-${team.slot}`}>{ids.length}/{TEAMS.maxPerTeam}</span>
              </div>
              <div className="team-captain">
                <span className="eyebrow">Captain</span>
                {host && !t.locked
                  ? <select value={team.captain ?? ''} onChange={(e) => room.setCaptain(team.slot, e.target.value || null)} aria-label={`Captain of ${team.name}`} data-testid={`team-captain-${team.slot}`}>
                      <option value="">None yet</option>
                      {ids.map((p) => <option key={p.id} value={p.id}>{p.name}{t.nominees.includes(p.id) ? ' (nominated)' : ''}{p.bot ? ' (bot)' : ''}</option>)}
                    </select>
                  : <b data-testid={`team-captain-${team.slot}`}>{captain?.name ?? 'None yet'}</b>}
              </div>
              <ul className="team-members">
                {ids.map((p) => (
                  <li key={p.id} className={p.id === room.id ? 'me' : undefined}>
                    <span className="slot-name">{p.name}</span>
                    <span className="slot-meta">{p.id === team.captain ? 'Captain' : t.nominees.includes(p.id) ? 'Nominee' : p.bot ? 'Bot' : ''}</span>
                    {host && !t.locked && (
                      <span className="team-move">
                        {TEAM_SLOTS.filter((s) => s !== team.slot).map((s) => (
                          <button key={s} className="mini" title={`Move to ${t.teams.find((x) => x.slot === s)?.name}`} onClick={() => room.moveToTeam(p.id, s)}
                            style={{ '--team': TEAMS.colors[s] } as CSSProperties}>{s}</button>
                        ))}
                      </span>
                    )}
                  </li>
                ))}
                {ids.length === 0 && <li className="empty">No players yet</li>}
              </ul>
              {!t.locked && mySlot !== team.slot && (
                <button className="btn wide" disabled={full} onClick={() => room.joinTeam(team.slot)} data-testid={`team-join-${team.slot}`}>{full ? 'Full' : 'Join team'}</button>
              )}
              {!t.locked && mySlot === team.slot && (
                <button className={`btn wide${nominated ? ' on' : ''}`} aria-pressed={nominated} onClick={() => room.nominate(!nominated)} data-testid="team-nominate">
                  {nominated ? '✓ Nominated as captain' : 'Nominate me as captain'}
                </button>
              )}
            </article>
          );
        })}
      </div>
      {host && !t.locked && (
        <div className="team-tools">
          <button className="btn ghost" onClick={() => room.balanceTeams()} data-testid="team-balance">Auto-balance</button>
          <button className="btn ghost" onClick={() => room.autoCaptains()} data-testid="team-auto-captains">Auto-pick captains</button>
        </div>
      )}
      <p className="team-error" role="status" aria-live="polite" data-testid="team-error">{err}</p>
    </section>
  );
}
