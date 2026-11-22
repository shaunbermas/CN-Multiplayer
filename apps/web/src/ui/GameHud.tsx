// Stage 1.5 (Prompt 07): in-game interface driven by the live room state (no demo values).
// Lobby (30 slots, invite, ready, host controls) · briefing · countdown · HUD (stage, signal, timer, alive /
// eliminated, objective, connection) · red-light scan and elimination alerts · spectator · results.
import { useEffect, useState } from 'react';
import { MAX_PLAYERS } from '@cn-trials/shared';
import type { TrialRoom } from '../net.ts';
import { inviteLink } from '../net.ts';
import { hud } from '../game/hudStore.ts';
import { signalView } from '../game/roundClock.ts';
import { stageDef } from '../game/stage.ts';
import { STAGE_SCENES } from '../stages/registry.ts';
import { Brand, HowToPlay, SettingsPanel } from './Menu.tsx';
import { colorwayById } from '@cn-trials/shared';
import { useSettings } from './settings.ts';

const SIGNAL_UI = {
  green: { word: 'GREEN LIGHT', icon: '🚶', cls: 'go', sub: 'Move' },
  warning: { word: 'GET READY', icon: '⚠', cls: 'warn', sub: 'Stopping soon' },
  red: { word: 'RED LIGHT', icon: '✋', cls: 'stop', sub: 'Freeze' },
} as const;

function startOptions(tournament: boolean, obstacles: boolean) {
  // Test hook: ?testSeed=…&testRound=…&testBriefing=… (the server honours these only in test mode).
  const q = new URLSearchParams(location.search);
  const mode = tournament ? 'tournament' as const : 'standup' as const;
  if (!q.get('testSeed')) return { mode, obstacles };
  return { mode, obstacles, seed: Number(q.get('testSeed')), roundS: Number(q.get('testRound') ?? 30), briefingS: Number(q.get('testBriefing') ?? 2) };
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

function Lobby({ room, tournament, setTournament, obstacles, setObstacles }: {
  room: TrialRoom; tournament: boolean; setTournament: (b: boolean) => void; obstacles: boolean; setObstacles: (b: boolean) => void;
}) {
  const r = room.round;
  const players = [...room.players.values()].sort((a, b) => a.spawn - b.spawn);
  const me = room.self;
  const ready = players.filter((p) => p.ready).length;
  const [copied, setCopied] = useState('');
  const link = inviteLink(room.room);
  const copy = async (text: string, what: string) => {
    try { await navigator.clipboard.writeText(text); setCopied(what); } catch { setCopied('select'); }
    setTimeout(() => setCopied(''), 2500);
  };
  const target = Math.max(Math.min(2, players.length), Math.min(players.length, Math.round(0.73 * players.length)));
  return (
    <section className="card lobby" data-testid="lobby" aria-label="Private room lobby">
      <header className="card-head"><Brand small /><span className="card-title">Private room</span></header>
      <div className="invite">
        <span className="label">Invite code</span>
        <code className="code" data-testid="room-code-display">{room.room.toUpperCase()}</code>
        <button className="btn" onClick={() => copy(room.room.toUpperCase(), 'code')}>Copy code</button>
        <button className="btn" onClick={() => copy(link, 'link')} data-testid="copy-link">Copy link</button>
      </div>
      <p className="muted small" aria-live="polite">{copied === 'select' ? `Copy this link: ${link}` : copied ? `${copied === 'link' ? 'Invite link' : 'Code'} copied` : 'Friends open the link, pick a nickname and join.'}</p>
      <ol className="slots30 lobby-slots" aria-label={`${players.length} of ${MAX_PLAYERS} players`}>
        {Array.from({ length: MAX_PLAYERS }, (_, i) => {
          const p = players.find((x) => x.spawn === i + 1);
          return (
            <li key={i} className={`slot${p ? ' taken' : ''}${p?.id === room.id ? ' me' : ''}${p?.ready ? ' ready' : ''}`} title={p ? `${p.name} · ${colorwayById(p.colorway)?.displayName ?? ''}` : 'Open slot'}
              style={p ? { boxShadow: `inset 0 -4px 0 #${colorwayById(p.colorway)?.coatSecondary ?? '000'}, inset 0 -6px 0 #${colorwayById(p.colorway)?.identifierAccent ?? '000'}` } : undefined}>
              <span className="slot-n">{String(i + 1).padStart(2, '0')}</span>
              {p && <span className="slot-name">{p.name}{p.id === r.host ? ' ★' : ''}</span>}
              {p?.ready && <span className="slot-ready" aria-label="ready">✓</span>}
            </li>
          );
        })}
      </ol>
      <div className="lobby-status">
        <span><b data-testid="players">{players.length} / {MAX_PLAYERS}</b> players</span>
        <span>{ready} ready</span>
        <span className="muted">Lobby: walk around to practise</span>
      </div>
      <div className="lobby-actions">
        <button className={`btn${me?.ready ? ' on' : ''}`} onClick={() => room.setReady(!me?.ready)} data-testid="ready" aria-pressed={!!me?.ready}>{me?.ready ? '✓ Ready' : 'Ready'}</button>
        {me && <span className="my-contestant" data-testid="my-contestant" title="Colours are dealt at random and kept if you rejoin; nobody in the room shares yours">
          <i style={{ background: `#${colorwayById(me.colorway)?.coatSecondary}`, borderColor: `#${colorwayById(me.colorway)?.identifierAccent}` }} aria-hidden="true" />You are <b>{colorwayById(me.colorway)?.displayName ?? 'a contestant'}</b></span>}
      </div>
      {room.isHost ? (
        <div className="host">
          <label className="check"><input id="tournament-mode" type="checkbox" checked={tournament} onChange={(e) => setTournament(e.target.checked)} /> Full tournament rules (first {target} of {players.length} to finish qualify)</label>
          <label className="check"><input id="obstacle-twist" data-testid="obstacles" type="checkbox" checked={obstacles} onChange={(e) => setObstacles(e.target.checked)} /> Obstacle twist (barricades and a gate that slides only on green)</label>
          <button className="btn primary big" data-testid="start" onClick={() => room.start(startOptions(tournament, obstacles))}>Start game ››</button>
        </div>
      ) : <p className="muted">Waiting for the host to start. Readiness is shown to the host.</p>}
    </section>
  );
}

export function GameHud({ room, stageError, onLeave }: { room: TrialRoom; stageError: string; onLeave: () => void }) {
  useTick(100);
  const s = useSettings();
  const [tournament, setTournament] = useState(false);
  const [obstacles, setObstacles] = useState(() => new URLSearchParams(location.search).get('obstacles') === '1');
  const [overlay, setOverlay] = useState<'none' | 'settings' | 'howto'>('none');
  const assets = STAGE_SCENES[stageDef.id].assets as { environment?: string; watcher?: string; problems: string[] };
  const loading = assets.environment !== 'ready' || assets.watcher !== 'ready';
  const r = room.round;
  const me = room.self;
  const sig = signalView(room);
  const remaining = room.remaining();
  const players = [...room.players.values()];
  const inRound = players.filter((p) => p.status !== 'waiting');
  const alive = inRound.filter((p) => p.status === 'active' || p.status === 'finished').length;
  const eliminated = inRound.filter((p) => p.status === 'spotted').length;
  const qualified = inRound.filter((p) => p.status === 'finished').length;
  const target = r.target > 0 ? r.target : null;
  const now = Date.now();
  const recentSpot = room.events.find((e) => e.kind === 'spotted' && e.id === room.id && now - e.at < 2500);
  const feed = room.events.filter((e) => now - e.at < 3500 && e.id !== room.id).slice(-3);
  const stageNo = String(stageDef.number).padStart(2, '0');
  const ui = r.phase === 'active' && sig.signal !== 'none' ? SIGNAL_UI[sig.signal] : null;
  const fmt = (t: number) => `${Math.floor(Math.max(0, t) / 60)}:${String(Math.ceil(Math.max(0, t)) % 60).padStart(2, '0')}`;

  return (
    <div className="hud" style={{ ['--hud-scale' as string]: s.hudScale }} data-testid="hud" data-phase={r.phase} data-signal={r.phase === 'active' ? sig.signal : 'none'} data-status={me?.status}>
      {stageError && (
        <div className="card error-panel" role="alert" data-testid="stage-error">
          <h2>The stage could not load</h2><p>{stageError}</p>
          <p className="muted">Reload the page. If it keeps happening, the stage files may be missing from this build.</p>
        </div>
      )}
      {!stageError && loading && <div className="loading-stage" data-testid="loading"><Brand /><p>Preparing Stage {stageNo} · {stageDef.name}…</p><div className="spinner" aria-hidden="true" /></div>}
      {ui && s.edgeFlash && sig.signal === 'red' && <div className="edge-red" aria-hidden="true" />}

      <div className="hud-top">
        <div className="stage-label"><b>STAGE {stageNo}</b><span>{stageDef.name}</span></div>
        <div className="hud-centre">
          {ui ? (
            <div className={`signal ${ui.cls}`} data-testid="signal" aria-live="assertive"><span className="signal-icon" aria-hidden="true">{ui.icon}</span>{ui.word}</div>
          ) : null}
          {r.phase === 'active' && sig.signal === 'red' && <div className="scanning" aria-hidden="true">SCANNING…</div>}
        </div>
        <div className="hud-right">
          {r.phase === 'active' ? <div className="timer" data-testid="timer">⏱ {fmt(remaining)}</div>
            : r.phase === 'lobby' ? <div className="timer" data-testid="timer">{hud.walkTime.toFixed(1)} s</div> : null}
          <div className="counts" data-testid={r.phase === 'lobby' ? undefined : 'players'}>
            {r.phase === 'active' || r.phase === 'results'
              ? <><span title="Still in">👥 {alive} / {inRound.length}</span><span className="out" title="Eliminated">✕ {eliminated}</span>{target && <span title="Qualified">✓ {qualified}/{target}</span>}</>
              : <span>👥 {players.length} / {MAX_PLAYERS}</span>}
          </div>
          <div className="hud-tools">
            <ConnectionBadge room={room} />
            <button className="icon-btn" onClick={() => setOverlay('howto')} aria-label="How to play">?</button>
            <button className="icon-btn" onClick={() => setOverlay('settings')} aria-label="Settings" data-testid="open-settings">⚙</button>
          </div>
        </div>
      </div>

      {r.phase === 'active' && (
        <aside className="objective-box" aria-label="Objective">
          <b>Objective</b>
          <p>{me?.status === 'finished' ? 'Finished. Watch the others.' : me?.status === 'spotted' ? 'Eliminated. Spectating.' : `Reach the finish line${target ? ` (first ${target} qualify)` : ''}. Freeze on red.`}</p>
        </aside>
      )}

      {r.phase === 'lobby' && (
        <Lobby room={room} tournament={tournament} setTournament={setTournament} obstacles={obstacles} setObstacles={setObstacles} />
      )}

      {r.phase === 'briefing' && (
        <section className="card briefing" data-testid="briefing">
          <header className="card-head"><span className="card-title">Stage {stageNo} · {stageDef.name}</span></header>
          <p className="rule">{stageDef.briefing.rule}</p>
          <p className="muted">{stageDef.briefing.detail}{r.mode === 'tournament' && target ? ` The first ${target} to finish qualify.` : ''}{r.obstacles ? ' Obstacle twist: weave through the barricade gaps; the gate slides only on green.' : ''}</p>
          {me?.status === 'waiting'
            ? <p className="muted">You joined mid-round: you'll play the next one.</p>
            : <button className="btn primary" onClick={() => room.skipBriefing()}>Got it (Space)</button>}
          <p className="muted">Starting in {Math.ceil(remaining)} s</p>
        </section>
      )}

      {r.phase === 'countdown' && (
        <div className="countdown" data-testid="countdown"><span className="cd-label">Get ready</span><span className="cd-num">{Math.max(1, Math.ceil(remaining))}</span></div>
      )}

      {recentSpot && <div className="stamp" data-testid="spotted">YOU WERE SPOTTED</div>}
      <div className="feed" aria-live="polite">
        {r.phase === 'active' && feed.map((e) => {
          const p = room.players.get(e.id);
          return <div key={`${e.id}${e.at}`} className={`toast ${e.kind}`}>{e.kind === 'spotted' ? '⚠ Contestant eliminated' : '✓ Qualified'} · {p?.name ?? 'Player'}</div>;
        })}
      </div>

      {r.phase === 'active' && me?.status === 'spotted' && !recentSpot && (
        <div className="spectator" data-testid="spectating">
          <span className="tag out">Eliminated</span> Spectating <b>{hud.spectating || 'the field'}</b> · <kbd>Tab</kbd> switch player
        </div>
      )}
      {r.phase === 'active' && me?.status === 'waiting' && <div className="spectator">Round in progress · you'll join the next one</div>}
      {r.phase === 'active' && me?.status === 'finished' && <div className="spectator status-in" data-testid="qualified">Qualified · finished in {me.finishTime.toFixed(2)} s</div>}

      {r.phase === 'results' && <Results room={room} remaining={remaining} onLeave={onLeave} />}

      <div className="hud-lower">
        {r.phase === 'lobby' && <div className="objective">{hud.status === 'finished' ? `Practice: finished in ${hud.finishTime.toFixed(2)} s` : 'Practice: walk to the finish line'}</div>}
        {(r.phase === 'lobby' || r.phase === 'active') && <div className="progress" aria-label="Progress to the finish"><div style={{ width: `${(hud.progress * 100).toFixed(1)}%` }} /><span className="flag" aria-hidden="true">🏁</span></div>}
      </div>
      <div className="hud-bottom">
        <span>{hud.distance.toFixed(0)} m to go</span>
        <span className="keys-hint"><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> move · mouse look{me?.status === 'spotted' ? ' · Tab switch' : ''}{r.phase === 'lobby' ? ' · R respawn' : ''}</span>
        <span className="muted">room {room.room.toUpperCase()}</span>
      </div>

      {overlay === 'settings' && <SettingsPanel onClose={() => setOverlay('none')} />}
      {overlay === 'howto' && <HowToPlay onClose={() => setOverlay('none')} />}
    </div>
  );
}

function Results({ room, remaining, onLeave }: { room: TrialRoom; remaining: number; onLeave: () => void }) {
  const rows = room.results;
  const q = rows.filter((p) => p.qualified).length;
  const out = rows.filter((p) => p.status === 'spotted').length;
  const winner = rows.find((p) => p.status === 'finished');
  const tournament = room.resultsMeta?.mode === 'tournament';
  return (
    <section className="card results" data-testid="results" aria-label="Stage results">
      <header className="card-head"><Brand small /><span className="card-title">Stage {String(stageDef.number).padStart(2, '0')} results</span></header>
      <div className="results-grid">
        <div className="stat in"><span>✓</span><b>{q}</b><small>Qualified</small></div>
        <div className="stat out"><span>✕</span><b>{out}</b><small>Eliminated</small></div>
        <div className="winner" data-testid="winner">
          <small>{tournament ? 'Stage 01 complete' : 'Round complete'}</small>
          <b>{winner ? winner.name : 'No finisher'}</b>
          <span>{winner ? `Stage winner · ${winner.finishTime.toFixed(2)} s` : 'Nobody reached the finish line'}</span>
        </div>
      </div>
      <ol className="rankings">
        {rows.map((p) => (
          <li key={p.id} className={p.id === room.id ? 'me' : ''}>
            <span>{p.name}{p.qualified && <span className="tag in">qualified</span>}{p.status === 'spotted' && <span className="tag out">eliminated</span>}</span>
            <span className="muted">{p.status === 'finished' ? `${p.finishTime.toFixed(2)} s` : p.status === 'spotted' ? 'spotted' : `${Math.round(p.progress * 100)}% of the way`}</span>
          </li>
        ))}
      </ol>
      <footer className="card-foot">
        <span className="muted">{tournament ? 'Stage 02 (Tug of War) is not built yet; ' : ''}Back to the lobby in {Math.ceil(remaining)} s</span>
        <button className="btn" onClick={onLeave} data-testid="exit">Exit to menu</button>
      </footer>
    </section>
  );
}
