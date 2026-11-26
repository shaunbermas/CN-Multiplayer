// Stage 02 · AGAWAN BASE HUD (greybox step): timer and the three team scores at the top right, your own state (captured
// and the release countdown, protection, the hold in progress) in the middle, and a short feed of tags, rescues and
// raids. Everything is read from the server's public and private state; the client decides nothing. The final
// frosted HUD from the pack's reference (06_UI_UX_AND_HUD_SPEC) comes with the Christmas street (PR D).
import { TEAMS, type TeamSlot } from '@cn-trials/shared';
import type { TrialRoom } from '../net.ts';

const pad2 = (n: number) => String(n).padStart(2, '0');
const clock = (t: number) => { const c = Math.ceil(Math.max(0, t)); return `${pad2(Math.floor(c / 60))}:${pad2(c % 60)}`; };

function teamName(room: TrialRoom, slot: TeamSlot): string {
  return room.teams?.teams.find((t) => t.slot === slot)?.name ?? `Team ${slot}`;
}
function playerName(room: TrialRoom, id: string): string { return room.players.get(id)?.name ?? 'Someone'; }

/** Timer and team scores (top right). */
export function AgawanTop({ room }: { room: TrialRoom }) {
  const ag = room.round.agawan;
  const mine = room.agawan?.team;
  return (
    <div className="glass ag-top" data-testid="agawan-top">
      <div className={`timer num${ag?.sudden ? ' closing' : ''}`} data-testid="timer">{ag?.sudden && <small>Sudden death</small>}{clock(room.remaining())}</div>
      <ol className="ag-scores">
        {(ag?.teams ?? []).map((t) => (
          <li key={t.slot} className={t.slot === mine ? 'mine' : undefined} style={{ ['--team' as string]: TEAMS.colors[t.slot] }} data-testid={`agawan-score-${t.slot}`}>
            <i aria-hidden="true" /><span>{teamName(room, t.slot)}</span><b className="num">{t.score}</b>
          </li>
        ))}
      </ol>
    </div>
  );
}

const ACTION: Record<string, string> = { tag: 'Tagging', rescue: 'Rescuing', raid: 'Raiding' };

/** Your own state and the feed. */
export function AgawanPanel({ room }: { room: TrialRoom }) {
  const me = room.agawan;
  const r = room.round;
  if (!me || r.phase !== 'active') return null;
  const now = Date.now();
  const feed = room.agawanFeed.filter((e) => now - e.at < 4000).slice(-4);
  const target = me.action ? (me.action.kind === 'raid' ? teamName(room, me.action.target as TeamSlot) : playerName(room, me.action.target)) : '';
  return (
    <>
      {me.pen && (
        <div className="banner spotted" data-testid="agawan-captured"><b>Captured</b>
          <span>In {teamName(room, me.pen)}'s pen. A teammate can free you, or you walk home in {Math.ceil(me.releaseLeft)} s.</span></div>
      )}
      {!me.pen && me.protectLeft > 0 && <div className="glass ag-protect" data-testid="agawan-protected">Protected {me.protectLeft.toFixed(1)} s</div>}
      {me.action && (
        <div className="glass ag-hold" data-testid="agawan-hold">
          <span>{ACTION[me.action.kind]} {target}</span>
          <i className="bar"><i style={{ width: `${Math.round(me.action.progress * 100)}%` }} /></i>
        </div>
      )}
      <ul className="ag-feed" aria-live="polite">
        {feed.map((e, i) => (
          <li key={`${e.at}-${i}`}>{
            e.kind === 'tag' ? `${playerName(room, e.by)} tagged ${playerName(room, e.id)}${e.points ? ' +1' : ''}`
              : e.kind === 'rescue' ? `${playerName(room, e.by)} freed ${playerName(room, e.id)}${e.points ? ' +1' : ''}`
              : e.kind === 'release' ? `${playerName(room, e.id)} walked home`
              : `${teamName(room, e.team)} raided ${teamName(room, e.base)}'s base +${e.points}`
          }</li>
        ))}
      </ul>
    </>
  );
}
