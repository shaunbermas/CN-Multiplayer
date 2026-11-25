// In-game interface driven by the live room state (no demo values). Stage 01 refinement redesign (24 Nov 2026):
// visual reference docs/ui/STAGE_01_UI_MOCKUP.html (same stylesheet). Screens: lobby (ready / start, add random
// players, player count) · briefing and next-stage intro · countdown · HUD (stage of match, your points, signal
// lens, timer, counts) · spotted / finished / knocked-down banners · feed · spectator · stage results with points
// and overall standings · final winner and leaderboard.
import { useEffect, useState } from 'react';
import { BOT_LIMITS, MATCH, MAX_PLAYERS, colorwayById, tieBreakReason, type Standing } from '@cn-trials/shared';
import type { TrialRoom } from '../net.ts';
import { inviteLink } from '../net.ts';
import { hud } from '../game/hudStore.ts';
import { signalView } from '../game/roundClock.ts';
import { activeStage } from '../game/stage.ts';
import { STAGE_SCENES } from '../stages/registry.ts';
import { Brand, HowToPlay, SettingsPanel } from './Menu.tsx';
import { useSettings } from './settings.ts';
import { setMuted } from '../game/audio.ts';
import { settings } from './settings.ts';
import { HuntBriefingRole, HuntPanel, HuntRoleChip, HuntTop, captureText } from './HuntHud.tsx';

// Decision 037 (owner, 25 Nov 2026): the HUD shows only GREEN LIGHT or RED LIGHT. No time-left bar, no
// "get ready" warning and no hint text: knowing when red comes is part of the challenge.
const SIGNAL_UI = {
  green: { word: 'GREEN LIGHT', cls: 'go', lens: 'go' },
  warning: { word: 'GREEN LIGHT', cls: 'go', lens: 'go' },
  red: { word: 'RED LIGHT', cls: 'stop', lens: 'stop' },
} as const;

const pad2 = (n: number) => String(n).padStart(2, '0');
const coat = (id: string | undefined) => colorwayById(id);
const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
const fmtClock = (t: number) => `${Math.floor(Math.max(0, t) / 60)}:${pad2(Math.ceil(Math.max(0, t)) % 60)}`;

function startOptions() {
  // Obstacles are always on (decision 031). Test hooks: ?testSeed=…&testRound=…&testBriefing=…&testStages=…&obstacles=0
  // (the server honours these only in test mode).
  const q = new URLSearchParams(location.search);
  const test: Record<string, unknown> = q.get('obstacles') === '0' ? { obstacles: false } : {};
  // The stage picked on the main menu (decision 042). ?startStage=… overrides it (tests).
  test.startStage = q.get('startStage') ?? settings.startStage;
  if (q.get('testStages')) test.stages = Number(q.get('testStages'));
  if (q.get('testResults')) test.resultsS = Number(q.get('testResults'));
  if (!q.get('testSeed')) return test;
  return { ...test, seed: Number(q.get('testSeed')), roundS: Number(q.get('testRound') ?? 30), briefingS: Number(q.get('testBriefing') ?? 2) };
}

function useTick(ms: number) {
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick((n) => n + 1), ms); return () => clearInterval(t); }, [ms]);
}

function ConnectionBadge({ room }: { room: TrialRoom }) {
  useEffect(() => { room.ping(); const t = setInterval(() => room.ping(), 2000); return () => clearInterval(t); }, [room]);
  const ms = room.rttMs;
  const q = ms < 0 ? 'unknown' : ms < 120 ? 'good' : ms < 250 ? 'fair' : 'poor';
  return <span className={`conn ${q}`} data-testid="connection" title="Connection to the room"><i aria-hidden="true" />{ms < 0 ? 'Connecting' : `${ms} ms`}</span>;
}

function Swatch({ colorway }: { colorway: string | undefined }) {
  const c = coat(colorway);
  return <span className="swatch" style={{ background: `#${c?.coatSecondary ?? '445'}`, borderColor: `#${c?.identifierAccent ?? 'ccc'}` }} aria-hidden="true" />;
}

function Lobby({ room }: { room: TrialRoom }) {
  const r = room.round;
  const players = [...room.players.values()].sort((a, b) => a.spawn - b.spawn);
  const me = room.self;
  const bots = players.filter((p) => p.bot).length;
  const humans = players.length - bots;
  const ready = players.filter((p) => p.ready).length;
  const free = MAX_PLAYERS - players.length;
  const [copied, setCopied] = useState('');
  const link = inviteLink(room.room);
  const copy = async (text: string, what: string) => {
    try { await navigator.clipboard.writeText(text); setCopied(what); } catch { setCopied('select'); }
    setTimeout(() => setCopied(''), 2500);
  };
  return (
    <section className="card lobby" data-testid="lobby" aria-label="Private room lobby">
      <div className="lobby-roster">
        <header className="card-head"><span className="card-title">Contestants</span><span className="eyebrow" style={{ marginLeft: 'auto' }}>Colours are dealt at random</span></header>
        <ol className="slots30 lobby-slots" aria-label={`${players.length} of ${MAX_PLAYERS} players`}>
          {Array.from({ length: MAX_PLAYERS }, (_, i) => {
            const p = players.find((x) => x.spawn === i + 1);
            const c = coat(p?.colorway);
            const host = p?.id === r.host;
            const meta = !p ? '' : host ? 'Host' : p.bot ? 'Bot' : p.ready ? 'Ready' : '';
            return (
              <li key={i} className={`slot${p ? ' taken' : ' empty'}${p?.id === room.id ? ' me' : ''}${p?.ready ? ' ready' : ''}${host ? ' host' : ''}`}
                title={p ? `${p.name}${p.bot ? ' (bot)' : ''} · ${c?.displayName ?? ''}` : 'Open slot'} data-bot={p?.bot ? '1' : undefined}>
                <i className="coat" style={p ? { background: `#${c?.coatSecondary ?? '445'}`, boxShadow: `inset -2px 0 0 #${c?.identifierAccent ?? 'ccc'}` } : undefined} />
                <span className="slot-name">{p ? p.name : 'Open'}</span>
                <span className="slot-meta">{meta}</span>
                <span className="slot-n">{pad2(i + 1)}</span>
              </li>
            );
          })}
        </ol>
      </div>
      <aside className="lobby-side">
        <div className="invite">
          <span className="eyebrow">Invite code</span>
          <code className="code" data-testid="room-code-display">{room.room.toUpperCase()}</code>
          <div className="invite-row">
            <button className="btn" onClick={() => copy(link, 'link')} data-testid="copy-link">Copy link</button>
            <button className="btn" onClick={() => copy(room.room.toUpperCase(), 'code')}>Copy code</button>
          </div>
          <span className="muted small" aria-live="polite">{copied === 'select' ? `Copy this link: ${link}` : copied ? `${copied === 'link' ? 'Invite link' : 'Code'} copied` : 'Friends open the link, pick a nickname and join.'}</span>
        </div>
        <div>
          <span className="eyebrow">Players</span>
          <div className="count-big num" data-testid="players">{players.length}<small>/ {MAX_PLAYERS}</small></div>
          <div className="count-split"><span><b data-testid="humans">{humans}</b> {humans === 1 ? 'person' : 'people'}</span><span><b data-testid="bots">{bots}</b> random</span><span><b>{ready}</b> ready</span></div>
        </div>
        <div className="lobby-actions">
          {room.isHost
            ? <button className="btn go big wide" data-testid="start" onClick={() => room.start(startOptions())}>Start game</button>
            : <button className={`btn big wide${me?.ready ? ' on' : ''}`} onClick={() => room.setReady(!me?.ready)} data-testid="ready" aria-pressed={!!me?.ready}>{me?.ready ? '✓ Ready' : 'Ready'}</button>}
          {room.isHost && (
            <>
              <button className="btn wide" disabled={free <= 0} onClick={() => room.addBots()} data-testid="add-bots">
                Add random players <span className="k">+{Math.min(BOT_LIMITS.addStep, Math.max(free, 0))}</span>
              </button>
              <div className="bot-tools">
                <div className="row">
                  <button className="btn ghost" disabled={free <= 0} onClick={() => room.fillBots()} data-testid="fill-bots">{free > 0 ? `Fill all ${free} free slots` : 'Room is full'}</button>
                  <button className="btn ghost" disabled={bots === 0} onClick={() => room.clearBots()} data-testid="clear-bots">Remove random players</button>
                </div>
              </div>
            </>
          )}
        </div>
        {me && <div className="my-contestant" data-testid="my-contestant" title="Colours are dealt at random and kept if you rejoin; nobody in the room shares yours">
          <Swatch colorway={me.colorway} />You are <b>{coat(me.colorway)?.displayName ?? 'a contestant'}</b></div>}
        <p className="lobby-hint">{room.isHost
          ? `${settings.startStage === 'STAGE_02_THE_HUNT' ? 'Starts at Stage 02 · The Hunt (picked on the main menu). ' : `${MATCH.stages} stages, starting with Red Light. `}Points add up across stages; most points wins. Walk around to practise.`
          : 'Waiting for the host to start. Walk around to practise.'}</p>
      </aside>
    </section>
  );
}

/**
 * Host only, during a match: restart from stage 1 with everyone in the room (owner request, 25 Nov 2026).
 * Asks once inline, because a restart throws away the stage in progress and everyone's points.
 */
function RestartControl({ room }: { room: TrialRoom }) {
  const [asking, setAsking] = useState(false);
  useEffect(() => {
    if (!asking) return;
    const t = setTimeout(() => setAsking(false), 8000);
    return () => clearTimeout(t);
  }, [asking]);
  if (!asking) {
    return <button className="btn restart-btn" onClick={() => setAsking(true)} title="Restart the game from stage 1" data-testid="restart">↻ Restart</button>;
  }
  return (
    <span className="restart-ask" role="group" aria-label="Restart the game?" data-testid="restart-ask">
      <span>Restart from stage 1? Points reset.</span>
      <button className="btn go" onClick={() => { setAsking(false); room.restart(); }} data-testid="restart-yes">Restart</button>
      <button className="btn ghost" onClick={() => setAsking(false)} data-testid="restart-no">Cancel</button>
    </span>
  );
}

/** First finisher of the current round (server finish times), if any. */
function firstFinisherId(room: TrialRoom): string | null {
  let best: string | null = null, t = Infinity;
  for (const p of room.players.values()) if (p.status === 'finished' && p.finishTime >= 0 && p.finishTime < t) { t = p.finishTime; best = p.id; }
  return best;
}

export function GameHud({ room, stageError, onLeave }: { room: TrialRoom; stageError: string; onLeave: () => void }) {
  useTick(100);
  const s = useSettings();
  const [overlay, setOverlay] = useState<'none' | 'settings' | 'howto'>('none');
  const stage = activeStage(room).def;
  const scene = STAGE_SCENES[stage.id] ?? Object.values(STAGE_SCENES)[0];
  const assets = scene.assets as { environment?: string; watcher?: string; problems: string[] };
  const loading = assets.environment !== 'ready' || assets.watcher !== 'ready';
  const r = room.round;
  const m = r.match;
  const me = room.self;
  const sig = signalView(room);
  const remaining = room.remaining();
  const players = [...room.players.values()];
  const inRound = players.filter((p) => p.status !== 'waiting');
  const alive = inRound.filter((p) => p.status === 'active' || p.status === 'finished').length;
  const eliminated = inRound.filter((p) => p.status === 'spotted').length;
  const finished = inRound.filter((p) => p.status === 'finished').length;
  const now = Date.now();
  const recentSpot = room.events.find((e) => e.kind === 'spotted' && e.id === room.id && now - e.at < 3000);
  const recentFinish = room.events.find((e) => e.kind === 'finished' && e.id === room.id && now - e.at < 3500);
  const feed = room.events.filter((e) => now - e.at < 3500 && e.id !== room.id && e.other !== room.id).slice(-3);
  const myStanding = room.standings.find((x) => x.id === room.id);
  const inMatch = r.phase !== 'lobby' && m.stage > 0;
  const stageNo = inMatch ? `STAGE ${pad2(m.stage)}` : `STAGE ${pad2(stage.number)}`;
  const ui = r.phase === 'active' && sig.signal !== 'none' ? SIGNAL_UI[sig.signal] : null;
  const closing = r.phase === 'active' && finished > 0;
  const iWonStage = recentFinish && firstFinisherId(room) === room.id;
  const isHunt = stage.rules === 'hide_and_hunt';
  const recentCaught = room.events.find((e) => e.kind === 'captured' && e.id === room.id && now - e.at < 3000);
  const leaderProgress = Math.max(0, ...inRound.filter((p) => p.id !== room.id).map((p) => {
    const g = activeStage(room).geo;
    return Math.max(0, Math.min(1, (p.z - g.startZ) / (g.finishZ - g.startZ)));
  }));
  const spotSeen = room.events.some((e) => e.kind === 'spotted' && now - e.at < 1200);

  return (
    <div className="hud" style={{ ['--hud-scale' as string]: s.hudScale }} data-testid="hud" data-phase={r.phase} data-signal={r.phase === 'active' ? sig.signal : 'none'} data-status={me?.status}
      data-stage={m.stage} data-stages={m.total}>
      {stageError && (
        <div className="card error-panel" role="alert" data-testid="stage-error">
          <h2>The stage could not load</h2><p>{stageError}</p>
          <p className="muted">Reload the page. If it keeps happening, the stage files may be missing from this build.</p>
        </div>
      )}
      {!stageError && loading && <div className="loading-stage" data-testid="loading"><Brand /><p>Preparing {stageNo} · {stage.name}…</p><div className="spinner" aria-hidden="true" /></div>}
      {ui && s.edgeFlash && sig.signal === 'red' && <div className="edge-red" aria-hidden="true" />}

      <div className="hud-top">
        <div className="hud-left">
          {r.phase === 'lobby'
            ? <div className="chip stage-chip"><b>LOBBY</b><span>Practice walk is open</span></div>
            : <div className="chip stage-chip" data-testid="stage-chip"><b>{stageNo}{inMatch && <i> / {pad2(m.total)}</i>}</b><span>{m.final && inMatch ? 'Final stage' : stage.name}</span></div>}
          {isHunt && <HuntRoleChip room={room} />}
          {inMatch && me && (
            <div className="chip me-chip" data-testid="my-points"><Swatch colorway={me.colorway} />{me.name}
              <span className="pts">{myStanding?.points ?? 0} PTS</span>{myStanding && <span className="muted">#{myStanding.rank}</span>}</div>
          )}
        </div>
        <div className="hud-centre">
          {ui && (
            <div className={`signal ${ui.cls}`} data-testid="signal" aria-live="assertive">
              <span className={`lens ${sig.signal === 'red' && spotSeen ? 'detect' : ui.lens}`} aria-hidden="true" />
              <span className="word">{ui.word}</span>
            </div>
          )}
        </div>
        <div className="hud-right">
          {isHunt && r.phase === 'active' ? <HuntTop room={room} /> : r.phase === 'active' ? <div className={`timer num${closing ? ' closing' : ''}`} data-testid="timer">{closing && <small>Finish closes</small>}{fmtClock(remaining)}</div>
            : r.phase === 'lobby' ? <div className="timer num" data-testid="timer">{hud.walkTime.toFixed(1)} s</div> : null}
          {!isHunt && (r.phase === 'active' || r.phase === 'results' || r.phase === 'countdown') && (
            <div className="counts num" data-testid="round-counts">
              <span title="Still racing">IN {alive}/{inRound.length}</span><span className="out" title="Spotted">✕ {eliminated}</span><span className="in" title="Finished">✓ {finished}</span>
            </div>
          )}
          <div className="hud-tools">
            {room.isHost && r.phase !== 'lobby' && <RestartControl room={room} />}
            <ConnectionBadge room={room} />
            <button className="icon-btn" onClick={() => setOverlay('howto')} aria-label="How to play">?</button>
            <button className="icon-btn" onClick={() => setMuted(!s.muted)} aria-label={s.muted ? 'Unmute sound (M)' : 'Mute sound (M)'} aria-pressed={s.muted} title={s.muted ? 'Sound off (M)' : 'Sound on (M)'} data-testid="mute">{s.muted ? '🔇' : '🔊'}</button>
            <button className="icon-btn" onClick={() => setOverlay('settings')} aria-label="Settings" data-testid="open-settings">⚙</button>
          </div>
        </div>
      </div>

      {r.phase === 'lobby' && <Lobby room={room} />}

      {r.phase === 'briefing' && (
        <section className="card briefing" data-testid="briefing">
          {m.stage > 1 ? (
            <>
              <span className="eyebrow">Next stage</span>
              <div className="stage-of" data-testid="next-stage-intro">Stage {pad2(m.stage)} <i>/ {pad2(m.total)}</i></div>
              <p className="rule">{stage.briefing.rule}</p>
              {isHunt ? <HuntBriefingRole room={room} />
                : <p className="muted">{m.final ? 'Last stage. ' : ''}Everyone plays, including anyone spotted or caught before. First finisher +2, every finisher +1.</p>}
              <ul className="mini-standings">
                {room.standings.slice(0, 3).map((x) => <li key={x.id}><b>{x.rank}</b><span>{x.name}</span><span className="num">{x.points} pts</span></li>)}
              </ul>
            </>
          ) : (
            <>
              <span className="eyebrow">Stage {pad2(m.stage || 1)} of {pad2(m.total || 1)} · {stage.name}</span>
              <p className="rule" style={{ marginTop: 8 }}>{stage.briefing.rule}</p>
              {isHunt && <HuntBriefingRole room={room} />}
              <p className="muted">{stage.briefing.detail} {isHunt ? '' : 'First to finish scores 2 points'}, {isHunt ? '' : 'every other finisher 1. '}Bumping into someone knocks you both over.{r.obstacles ? ' Weave through the barricade gaps; the gate slides only on green.' : ''}</p>
            </>
          )}
          <footer className="card-foot">
            <span className="muted">Starting in {Math.ceil(remaining)} s</span>
            {me?.status === 'waiting'
              ? <span className="muted">You joined mid-stage: you play the next one.</span>
              : <button className="btn primary" onClick={() => room.skipBriefing()}>Got it <span className="k">Space</span></button>}
          </footer>
        </section>
      )}

      {r.phase === 'countdown' && (
        <div className="countdown" data-testid="countdown">
          <div className="dial"><span className="lens" aria-hidden="true" /><span className="cd-num">{Math.max(1, Math.ceil(remaining))}</span></div>
          <span className="cd-label">Get ready</span>
        </div>
      )}

      {recentSpot && r.phase === 'active' && (
        <div className="banner spotted" data-testid="spotted"><b>Spotted</b><span>You moved while The Watcher was looking.{m.total > 1 ? ` You keep your ${myStanding?.points ?? 0} points${m.final ? '' : ' and play the next stage'}.` : ''}</span></div>
      )}
      {recentFinish && r.phase === 'active' && (
        <div className="banner finished" data-testid="finished-banner"><b>{iWonStage ? 'Finished 1st' : 'Finished'}</b>
          <span>{me ? `${me.finishTime.toFixed(2)} s` : ''}</span><span className="pts">+{iWonStage ? MATCH.points.first : MATCH.points.finished} {iWonStage ? 'POINTS' : 'POINT'}</span></div>
      )}
      {recentCaught && r.phase === 'active' && (
        <div className="banner spotted" data-testid="caught-banner"><b>Caught</b><span>{captureText(room, room.id, recentCaught.other)}. You keep your {myStanding?.points ?? 0} points and play the next stage.</span></div>
      )}
      {isHunt && <HuntPanel room={room} />}
      {hud.down > 0 && !recentSpot && (
        <div className="banner down" data-testid="knocked-down"><b>Knocked over</b><span>Back on your feet in a moment</span></div>
      )}
      <div className="feed" aria-live="polite">
        {(r.phase === 'active' || r.phase === 'lobby') && feed.map((e) => {
          const p = room.players.get(e.id);
          const o = e.other ? room.players.get(e.other) : undefined;
          const text = e.kind === 'spotted' ? `${p?.name ?? 'Player'} was spotted`
            : e.kind === 'captured' ? captureText(room, e.id, e.other)
            : e.kind === 'finished' ? `${p?.name ?? 'Player'} finished${firstFinisherId(room) === e.id ? ' first · +2' : ' · +1'}`
            : `${p?.name ?? 'Player'} and ${o?.name ?? 'someone'} collided`;
          return <div key={`${e.kind}${e.id}${e.at}`} className={`toast ${e.kind}`}>{text}</div>;
        })}
      </div>

      {r.phase === 'active' && me?.status === 'spotted' && !recentSpot && (
        <div className="spectator" data-testid="spectating">
          <span className="tag out">Spotted</span> Watching <b>{hud.spectating || 'the field'}</b> · <kbd>Tab</kbd> switch player
        </div>
      )}
      {r.phase === 'active' && me?.status === 'waiting' && <div className="spectator">Stage in progress · you join the next one</div>}
      {r.phase === 'active' && me?.status === 'finished' && !recentFinish && <div className="spectator status-in" data-testid="qualified">Finished in {me.finishTime.toFixed(2)} s · watch the others</div>}

      {r.phase === 'results' && (m.final || m.total <= 1
        ? <FinalResults room={room} remaining={remaining} onLeave={onLeave} />
        : <StageResults room={room} remaining={remaining} onLeave={onLeave} />)}

      <div className="hud-lower">
        {r.phase === 'lobby' && <div className="objective">{hud.status === 'finished' ? `Practice: finished in ${hud.finishTime.toFixed(2)} s` : 'Practice: walk to the finish line'}</div>}
        {(r.phase === 'lobby' || (r.phase === 'active' && !isHunt)) && (
          <div className="track" aria-label="Progress to the finish">
            <div className="fill" style={{ width: `${(hud.progress * 100).toFixed(1)}%` }} />
            {r.phase === 'active' && leaderProgress > 0 && <span className="pip" style={{ left: `${(leaderProgress * 100).toFixed(1)}%` }} title="Furthest rival" />}
          </div>
        )}
      </div>
      <div className="hud-bottom">
        <span className="num">{isHunt && r.phase !== 'lobby' ? '' : `${hud.distance.toFixed(0)} m to go`}</span>
        <span className="keys-hint"><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> move · mouse look{isHunt && r.phase === 'active' ? (room.hunt?.role === 'hunter' ? ' · Q pulse · hold E capture · Shift sprint' : ' · E hide · Shift sprint · C crouch') : ''}{me?.status === 'spotted' ? ' · Tab switch' : ''}{r.phase === 'lobby' ? ' · R respawn' : ''}</span>
        <span>room {room.room.toUpperCase()}</span>
      </div>

      {overlay === 'settings' && <SettingsPanel onClose={() => setOverlay('none')} />}
      {overlay === 'howto' && <HowToPlay onClose={() => setOverlay('none')} />}
    </div>
  );
}

function StagePoints({ perStage }: { perStage: (number | null)[] }) {
  return <span className="stage-pts">{perStage.map((x, i) => <i key={i} className={x === 2 ? 'p2' : x === 1 ? 'p1' : ''}>{x === null ? '–' : x}</i>)}</span>;
}

function StageResults({ room, remaining, onLeave }: { room: TrialRoom; remaining: number; onLeave: () => void }) {
  const rows = room.results;
  const m = room.resultsMeta?.match ?? room.round.match;
  const first = rows.find((p) => p.first);
  const firstPlayer = first ? room.players.get(first.id) : undefined;
  const standings = room.standings;
  return (
    <section className="card results" data-testid="results" aria-label="Stage results">
      <div className="results-head">
        <div><span className="eyebrow">Stage results</span><h2>Stage {pad2(m.stage)} <i>/ {pad2(m.total)}</i></h2></div>
        <div className="first-finisher" data-testid="winner">
          {rows.some((x) => x.role) ? <div><small>The Hunt</small><b>{rows.filter((x) => x.role === 'hider' && x.status !== 'captured').length} hiders survived</b> <span className="muted num">{rows.filter((x) => x.status === 'captured').length} caught</span></div>
            : first ? <><Swatch colorway={firstPlayer?.colorway} /><div><small>First to finish · +2</small><b>{first.name}</b> <span className="muted num">{first.finishTime.toFixed(2)} s</span></div></>
            : <div><small>First to finish</small><b>Nobody finished</b></div>}
        </div>
      </div>
      <div className="results-body">
        <div>
          <span className="eyebrow">This stage</span>
          <StageBoard room={room} />
        </div>
        <div>
          <span className="eyebrow">Overall standings</span>
          <StandingsTable room={room} standings={standings} compact />
        </div>
      </div>
      <footer className="card-foot">
        <span className="next-line">Stage {pad2(m.stage + 1)} starts in {Math.ceil(remaining)} s · spotted and caught players play it too</span>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn" onClick={onLeave} data-testid="exit">Exit to menu</button>
          {room.isHost && <button className="btn go" onClick={() => room.nextStage()} data-testid="next-stage">Start stage {pad2(m.stage + 1)} now</button>}
        </div>
      </footer>
    </section>
  );
}

/** One stage's placings with the points each player earned. */
function StageBoard({ room }: { room: TrialRoom }) {
  const rows = room.results;
  return (
    <table className="board" data-testid="stage-board">
      <thead><tr><th /><th>Contestant</th><th>Result</th><th className="r">Points</th></tr></thead>
      <tbody>
        {rows.map((p) => (
          <tr key={p.id} className={p.id === room.id ? 'me' : ''}>
            <td className="place">{p.place}</td>
            <td className="name">{p.name}{p.bot && <span className="tag bot">bot</span>}{p.status === 'spotted' && <span className="tag out">spotted</span>}{p.status === 'captured' && <span className="tag out">caught</span>}</td>
            <td className="muted">{p.role === 'hunter' ? `Hunter · ${p.captures ?? 0} ${p.captures === 1 ? 'capture' : 'captures'}`
              : p.role === 'hider' ? (p.status === 'captured' ? 'Hider · caught' : 'Hider · survived')
              : p.status === 'finished' ? `${p.finishTime.toFixed(2)} s` : p.status === 'spotted' ? 'Spotted' : `${Math.round(p.progress * 100)}% of the way`}</td>
            <td className={`r gain${p.points ? '' : ' zero'}`}>+{p.points}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
function StandingsTable({ room, standings, compact = false }: { room: TrialRoom; standings: Standing[]; compact?: boolean }) {
  return (
    <table className="board" data-testid="standings">
      <thead><tr><th /><th>Contestant</th><th>{compact ? 'Stages' : 'Per stage'}</th>{!compact && <><th className="r">Wins</th><th className="r">Finished</th></>}<th className="r">Total</th></tr></thead>
      <tbody>
        {standings.map((x) => (
          <tr key={x.id} className={x.id === room.id ? 'me' : ''}>
            <td className="place">{x.rank}</td>
            <td className="name">{x.name}{x.bot && <span className="tag bot">bot</span>}{x.left && <span className="tag left">left</span>}</td>
            <td><StagePoints perStage={x.perStage} /></td>
            {!compact && <><td className="r num">{x.wins}</td><td className="r num">{x.finishes}</td></>}
            <td className="r total">{x.points}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function FinalResults({ room, remaining, onLeave }: { room: TrialRoom; remaining: number; onLeave: () => void }) {
  const st = room.standings;
  const m = room.resultsMeta?.match ?? room.round.match;
  const w = st[0];
  const wp = w ? room.players.get(w.id) : undefined;
  const c = coat(wp?.colorway);
  const why = w ? tieBreakReason(w, st[1]) : null;
  return (
    <section className="card results final" data-testid="results" aria-label="Final results">
      <div data-testid="final" className="results-head"><div><span className="eyebrow">Final results · {m.total} {m.total === 1 ? 'stage' : 'stages'}</span><h2>Match complete</h2></div></div>
      {w ? (
        <div className="winner-hero" data-testid="winner">
          <div className="crest" style={{ background: `#${c?.coatSecondary ?? '445'}`, borderColor: `#${c?.identifierAccent ?? 'ccc'}` }}>1</div>
          <div><span className="eyebrow" style={{ color: 'var(--brass)' }}>Winner</span><h3>{w.name}{w.id === room.id ? ' (you)' : ''}</h3>
            <div className="why">{why ? `Tied on ${w.points} points with ${st[1].name}: won on ${why}.` : `${w.wins} stage ${w.wins === 1 ? 'win' : 'wins'} · finished ${w.finishes} of ${m.total}`}</div></div>
          <div className="score num">{w.points}<small>POINTS</small></div>
        </div>
      ) : <p className="muted">No scores were recorded.</p>}
      {st.length >= 3 && (
        <div className="podium">
          {[1, 0, 2].map((i) => <div key={i} className={`p${i + 1}`}><span>{ordinal(i + 1)}</span><b>{st[i].name}</b><span>{st[i].points} pts · {st[i].wins} {st[i].wins === 1 ? 'win' : 'wins'}</span></div>)}
        </div>
      )}
      <StandingsTable room={room} standings={st} />
      {room.results.length > 0 && (
        <details className="last-stage" open={m.total <= 1}>
          <summary className="eyebrow">Stage {pad2(m.stage)} results</summary>
          <StageBoard room={room} />
        </details>
      )}
      <footer className="card-foot">
        <span className="next-line">Back to the lobby in {Math.ceil(remaining)} s · ties: points, then stage wins, finishes, total time</span>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn" onClick={onLeave} data-testid="exit">Exit to menu</button>
          {room.isHost && <button className="btn" onClick={() => room.nextStage()} data-testid="back-to-lobby">Back to lobby</button>}
          {room.isHost && <button className="btn go" onClick={() => room.restart()} data-testid="play-again">↻ Restart game</button>}
        </div>
      </footer>
    </section>
  );
}
