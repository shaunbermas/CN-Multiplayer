import { useEffect, useState } from 'react';
import { MAX_PLAYERS } from '@cn-trials/shared';
import { joinTrial, type TrialRoom } from './net.ts';
import { hud } from './game/hudStore.ts';
import { Scene } from './game/Scene.tsx';
import { signalView } from './game/roundClock.ts';
import { stageDef } from './game/stage.ts';
import { STAGE_SCENES } from './stages/registry.ts';

const SIGNAL_UI = {
  green: { word: 'GO', icon: '🚶', cls: 'go' },
  warning: { word: 'GO', icon: '🚶', cls: 'warn' },
  red: { word: 'FREEZE', icon: '✋', cls: 'stop' },
} as const;

function startOptions(tournament: boolean, obstacles = false) {
  // Test hook: ?testSeed=…&testRound=…&testBriefing=… (the server honours these only in test mode).
  const q = new URLSearchParams(location.search);
  const mode = tournament ? 'tournament' as const : 'standup' as const;
  if (!q.get('testSeed')) return { mode, obstacles };
  return { mode, obstacles, seed: Number(q.get('testSeed')), roundS: Number(q.get('testRound') ?? 30), briefingS: Number(q.get('testBriefing') ?? 2) };
}

function Hud({ room, stageError }: { room: TrialRoom; stageError: string }) {
  const [, tick] = useState(0);
  const [tournament, setTournament] = useState(false);
  // Stage 1.5 obstacle twist: off by default (the approved rules); ?obstacles=1 pre-ticks it (tests, demos).
  const [obstacles, setObstacles] = useState(() => new URLSearchParams(location.search).get('obstacles') === '1');
  const assets = STAGE_SCENES[stageDef.id].assets as { environment?: string; watcher?: string; problems: string[] };
  const loading = assets.environment !== 'ready' || assets.watcher !== 'ready';
  useEffect(() => { const t = setInterval(() => tick((n) => n + 1), 100); return () => clearInterval(t); }, []);
  const r = room.round;
  const me = room.self;
  const sig = signalView(room);
  const remaining = room.remaining();
  const players = [...room.players.values()];
  const inRound = players.filter((p) => p.status !== 'waiting');
  const qualified = inRound.filter((p) => p.status === 'finished').length;
  const target = r.target > 0 ? r.target : null;
  const recentSpot = room.events.find((e) => e.kind === 'spotted' && e.id === room.id && Date.now() - e.at < 2500);

  return (
    <div className="hud" data-testid="hud" data-phase={r.phase} data-signal={r.signal} data-status={me?.status}>
      {stageError && (
        <div className="panel error-panel" role="alert" data-testid="stage-error">
          <h2>Stage 01 could not load</h2>
          <p>{stageError}</p>
          <p className="muted">Reload the page. If it keeps happening, the stage files may be missing from this build.</p>
        </div>
      )}
      {!stageError && loading && <div className="loading-stage" data-testid="loading">Loading Stage {String(stageDef.number).padStart(2, '0')} · {stageDef.name}…</div>}
      <div className="hud-top">
        <div className="pill">Stage {String(stageDef.number).padStart(2, '0')} · {stageDef.name}</div>
        {r.phase === 'active' ? (
          <div className="timer" data-testid="timer">{Math.ceil(remaining)} s</div>
        ) : r.phase === 'lobby' ? (
          <div className="timer" data-testid="timer">{hud.walkTime.toFixed(1)} s</div>
        ) : <div />}
        <div className="pill" data-testid="players">{r.phase === 'active' ? `${qualified}${target ? ` / ${target}` : ''} qualified · ` : ''}{players.length} / {MAX_PLAYERS}</div>
      </div>

      {r.phase === 'active' && sig.signal !== 'none' && (
        // Signal never relies on colour alone: word + icon + colour (GDD §5.2, §6.4).
        <div className={`signal ${SIGNAL_UI[sig.signal].cls}`} data-testid="signal" aria-live="assertive">
          <span className="signal-icon" aria-hidden="true">{SIGNAL_UI[sig.signal].icon}</span>
          <span>{SIGNAL_UI[sig.signal].word}</span>
        </div>
      )}

      {r.phase === 'lobby' && (
        <div className="panel lobby-panel" data-testid="lobby">
          <h2>Lobby · practice walk</h2>
          <p>{players.length} {players.length === 1 ? 'player' : 'players'} here. Walk around while everyone joins.</p>
          <ul className="roster">
            {players.map((p) => <li key={p.id}>{p.name}{p.id === r.host ? ' · host' : ''}{p.id === room.id ? ' (you)' : ''}</li>)}
          </ul>
          {room.isHost ? (
            <>
              <label className="mode-toggle">
                <input id="tournament-mode" type="checkbox" checked={tournament} onChange={(e) => setTournament(e.target.checked)} />
                Full tournament rules (the first {Math.max(Math.min(2, players.length), Math.min(players.length, Math.round(0.73 * players.length)))} of {players.length} to finish qualify)
              </label>
              <label className="mode-toggle">
                <input id="obstacle-twist" data-testid="obstacles" type="checkbox" checked={obstacles} onChange={(e) => setObstacles(e.target.checked)} />
                Obstacle twist (barricade rows and a gate that slides only on green)
              </label>
              <button className="primary" data-testid="start" onClick={() => room.start(startOptions(tournament, obstacles))}>Start round</button>
            </>
          ) : <p className="muted">Waiting for the host to start the round.</p>}
        </div>
      )}

      {r.phase === 'briefing' && (
        <div className="panel briefing" data-testid="briefing">
          <h2>{stageDef.name}</h2>
          <p className="rule">{stageDef.briefing.rule}</p>
          <p className="muted">{stageDef.briefing.detail}{r.mode === 'tournament' && target ? ` The first ${target} to finish qualify.` : ''}</p>
          {me?.status === 'waiting'
            ? <p className="muted">You joined mid-round: you'll play the next one.</p>
            : <button className="primary" onClick={() => room.skipBriefing()}>Got it (Space)</button>}
          <p className="muted">Starting in {Math.ceil(remaining)} s</p>
        </div>
      )}

      {r.phase === 'countdown' && <div className="countdown" data-testid="countdown">{Math.max(1, Math.ceil(remaining))}</div>}

      {recentSpot && <div className="stamp" data-testid="spotted">SPOTTED!</div>}

      {r.phase === 'active' && me?.status === 'spotted' && !recentSpot && (
        <div className="objective status-out" data-testid="spectating">Eliminated · spectating · Tab to switch player</div>
      )}
      {r.phase === 'active' && me?.status === 'waiting' && <div className="objective">Round in progress · you'll join the next one</div>}
      {r.phase === 'active' && me?.status === 'finished' && <div className="objective status-in" data-testid="qualified">Qualified · finished in {me.finishTime.toFixed(2)} s</div>}

      {r.phase === 'results' && (
        <div className="panel results" data-testid="results">
          <h2>{room.results[0] ? `${room.results[0].name} wins!` : 'Results'}</h2>
          <p className="muted">{stageDef.name} · {room.resultsMeta?.mode === 'tournament' ? 'tournament' : 'standup'} · {room.results.filter((p) => p.qualified).length} qualified</p>
          <ol>
            {room.results.map((p) => (
              <li key={p.id} className={p.id === room.id ? 'me' : ''}>
                <span>{p.name}{p.qualified && <span className="tag in">qualified</span>}{p.status === 'spotted' && <span className="tag out">eliminated</span>}</span>
                <span className="muted">{p.status === 'finished' ? `${p.finishTime.toFixed(2)} s` : p.status === 'spotted' ? 'spotted' : `${Math.round(p.progress * 100)}% of the way`}</span>
              </li>
            ))}
          </ol>
          <p className="muted">Back to the lobby in {Math.ceil(remaining)} s</p>
        </div>
      )}

      <div className="hud-lower">
        {r.phase === 'lobby' && <div className="objective">{hud.status === 'finished' ? `Practice: finished in ${hud.finishTime.toFixed(2)} s` : 'Practice: walk to the finish line'}</div>}
        {(r.phase === 'lobby' || r.phase === 'active') && <div className="progress"><div style={{ width: `${(hud.progress * 100).toFixed(1)}%` }} /></div>}
      </div>
      <div className="hud-bottom">
        <span>{hud.distance.toFixed(0)} m to go</span>
        <span>WASD move · click to look{r.phase === 'lobby' ? ' · R respawn' : ''}</span>
        <span className="muted">room {room.room}</span>
      </div>
    </div>
  );
}

export function App() {
  const params = new URLSearchParams(location.search);
  const [name, setName] = useState(params.get('name') ?? '');
  const [room, setRoom] = useState<TrialRoom | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [stageError, setStageError] = useState('');

  const join = async (n: string) => {
    setBusy(true); setError('');
    try {
      const r = await joinTrial(n);
      hud.connected = true; hud.name = n;
      r.onClose(() => { hud.connected = false; setRoom(null); setError('Disconnected from the server.'); });
      setRoom(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not join');
    } finally { setBusy(false); }
  };

  useEffect(() => { if (params.get('autojoin') === '1' && params.get('name')) void join(params.get('name')!); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (room) return (<><Scene room={room} onStageError={setStageError} /><Hud room={room} stageError={stageError} /></>);
  return (
    <main className="landing">
      <h1>CN Trials</h1>
      <p className="tagline">Stage 01 · Red Light, Green Light</p>
      <form onSubmit={(e) => { e.preventDefault(); void join(name); }}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your nickname" maxLength={16} aria-label="Nickname" autoFocus />
        <button type="submit" disabled={busy}>{busy ? 'Joining…' : 'Join'}</button>
      </form>
      {error && <p className="error" role="alert">{error}</p>}
    </main>
  );
}
