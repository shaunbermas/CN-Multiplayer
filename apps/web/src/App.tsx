import { useEffect, useState } from 'react';
import { MAX_PLAYERS } from '@cn-trials/shared';
import { joinTrial, type TrialRoom } from './net.ts';
import { hud } from './game/hudStore.ts';
import { Scene } from './game/Scene.tsx';

function Hud({ room }: { room: TrialRoom }) {
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick((n) => n + 1), 100); return () => clearInterval(t); }, []);
  const finished = hud.status === 'finished';
  return (
    <div className="hud">
      <div className="hud-top">
        <div className="pill">Stage 01 · Walk test</div>
        <div className="timer" data-testid="timer">{hud.walkTime.toFixed(1)} s</div>
        <div className="pill" data-testid="players">{hud.players} / {MAX_PLAYERS}</div>
      </div>
      {/* Objective and progress sit at the bottom so nothing covers The Shepherd (the signal) at the top centre. */}
      <div className="hud-lower">
        <div className="objective">{finished ? `Finished in ${hud.finishTime.toFixed(2)} s` : 'Walk to the finish line'}</div>
        <div className="progress"><div style={{ width: `${(hud.progress * 100).toFixed(1)}%` }} /></div>
      </div>
      <div className="hud-bottom">
        <span>{hud.distance.toFixed(0)} m to go</span>
        <span>WASD move · click to look · R respawn</span>
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
      <p className="tagline">Stage 01 greybox · walk test build</p>
      <form onSubmit={(e) => { e.preventDefault(); void join(name); }}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your nickname" maxLength={16} aria-label="Nickname" autoFocus />
        <button type="submit" disabled={busy}>{busy ? 'Joining…' : 'Join'}</button>
      </form>
      {error && <p className="error" role="alert">{error}</p>}
    </main>
  );
}
