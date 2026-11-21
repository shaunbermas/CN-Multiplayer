import { useEffect, useState } from 'react';
import { MAX_PLAYERS } from '@cn-trials/shared';
import { joinTrial, type TrialRoom } from './net.ts';
import { hud } from './game/hudStore.ts';
import { Scene } from './game/Scene.tsx';
import { signalView } from './game/roundClock.ts';

const SIGNAL_UI = {
  green: { word: 'GO', icon: '🚶', cls: 'go' },
  warning: { word: 'GO', icon: '🚶', cls: 'warn' },
  red: { word: 'FREEZE', icon: '✋', cls: 'stop' },
} as const;

function testStartOptions() {
  // Test hook: ?testSeed=…&testRound=…&testBriefing=… (the server honours these only in test mode).
  const q = new URLSearchParams(location.search);
  if (!q.get('testSeed')) return undefined;
  return { seed: Number(q.get('testSeed')), roundS: Number(q.get('testRound') ?? 30), briefingS: Number(q.get('testBriefing') ?? 2) };
}

function Hud({ room }: { room: TrialRoom }) {
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick((n) => n + 1), 100); return () => clearInterval(t); }, []);
  const r = room.round;
  const me = room.self;
  const sig = signalView(room);
  const remaining = room.remaining();
  const players = [...room.players.values()];
  const inRound = players.filter((p) => p.status !== 'waiting');
  const qualified = inRound.filter((p) => p.status === 'finished').length;
  const recentSpot = room.events.find((e) => e.kind === 'spotted' && e.id === room.id && Date.now() - e.at < 2500);

  return (
    <div className="hud" data-testid="hud" data-phase={r.phase} data-signal={r.signal}>
      <div className="hud-top">
        <div className="pill">Stage 01 · Red Light, Green Light</div>
        {r.phase === 'active' ? (
          <div className="timer" data-testid="timer">{Math.ceil(remaining)} s</div>
        ) : r.phase === 'lobby' ? (
          <div className="timer" data-testid="timer">{hud.walkTime.toFixed(1)} s</div>
        ) : <div />}
        <div className="pill" data-testid="players">{r.phase === 'active' ? `${qualified} finished · ` : ''}{players.length} / {MAX_PLAYERS}</div>
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
          {room.isHost
            ? <button className="primary" data-testid="start" onClick={() => room.start(testStartOptions())}>Start round</button>
            : <p className="muted">Waiting for the host to start the round.</p>}
        </div>
      )}

      {r.phase === 'briefing' && (
        <div className="panel briefing" data-testid="briefing">
          <h2>Red Light, Green Light</h2>
          <p className="rule">Move on <b>GO</b>. Freeze when <b>The Shepherd</b> turns.</p>
          <p className="muted">Reach the finish line before time runs out. Moving while it watches gets you spotted.</p>
          {me?.status === 'waiting'
            ? <p className="muted">You joined mid-round: you'll play the next one.</p>
            : <button className="primary" onClick={() => room.skipBriefing()}>Got it (Space)</button>}
          <p className="muted">Starting in {Math.ceil(remaining)} s</p>
        </div>
      )}

      {r.phase === 'countdown' && <div className="countdown" data-testid="countdown">{Math.max(1, Math.ceil(remaining))}</div>}

      {recentSpot && <div className="stamp" data-testid="spotted">SPOTTED!</div>}

      {r.phase === 'active' && me?.status === 'spotted' && !recentSpot && (
        <div className="objective">Spotted! Watching the others · Tab to switch</div>
      )}
      {r.phase === 'active' && me?.status === 'waiting' && <div className="objective">Round in progress · you'll join the next one</div>}
      {r.phase === 'active' && me?.status === 'finished' && <div className="objective">Finished in {me.finishTime.toFixed(2)} s · safe!</div>}

      {r.phase === 'results' && (
        <div className="panel results" data-testid="results">
          <h2>{room.results[0] ? `${room.results[0].name} wins!` : 'Results'}</h2>
          <ol>
            {room.results.map((p) => (
              <li key={p.id} className={p.id === room.id ? 'me' : ''}>
                <span>{p.name}</span>
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

  if (room) return (<><Scene room={room} /><Hud room={room} /></>);
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
