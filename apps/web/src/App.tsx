// CN TRIAL client shell (Stage 1.5, Prompt 07): main menu → private room → game, with connection states.
//   ?room=<code>               invite link: opens the menu ready to join that room
//   ?name=<n>&autojoin=1       tests and quick links: join straight away (room from ?room, else "default")
import { useEffect, useRef, useState } from 'react';
import { CLOSE } from '@cn-trials/shared';
import { joinTrial, newRoomCode, type TrialRoom } from './net.ts';
import { hud } from './game/hudStore.ts';
import { Scene } from './game/Scene.tsx';
import { GameHud } from './ui/GameHud.tsx';
import { Brand, MainMenu } from './ui/Menu.tsx';

type Lost = { title: string; detail: string; canRetry: boolean };

function describeClose(code: number, reason: string): Lost {
  if (code === CLOSE.full) return { title: 'Room is full', detail: reason || 'This room already has 30 players.', canRetry: true };
  if (code === CLOSE.version) return { title: 'Update needed', detail: 'The game was updated. Reload the page to get the new version.', canRetry: false };
  if (code === CLOSE.replaced) return { title: 'Opened elsewhere', detail: 'This session was replaced by a newer connection.', canRetry: true };
  return { title: 'Connection lost', detail: reason || 'The connection to the room dropped.', canRetry: true };
}

export function App() {
  const params = new URLSearchParams(location.search);
  const invite = params.get('room');
  const [room, setRoom] = useState<TrialRoom | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [lost, setLost] = useState<Lost | null>(null);
  const [stageError, setStageError] = useState('');
  const last = useRef<{ name: string; code: string } | null>(null);
  const leaving = useRef(false);

  const join = async (name: string, code: string) => {
    setBusy(true); setError(''); setLost(null);
    last.current = { name, code };
    try {
      const r = await joinTrial(name, code);
      hud.connected = true; hud.name = name;
      if (code !== 'default') {
        // Keep the room in the address bar (shareable, survives a reload); keep other parameters too.
        const q = new URLSearchParams(location.search);
        q.set('room', code); q.delete('autojoin');
        history.replaceState(null, '', `?${q}`);
      }
      r.onClose((c, reason) => {
        hud.connected = false;
        setRoom(null);
        if (leaving.current) { leaving.current = false; return; }
        setLost(describeClose(c, reason));
      });
      setRoom(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not join');
    } finally { setBusy(false); }
  };

  const leave = () => { leaving.current = true; room?.leave(); setRoom(null); };

  useEffect(() => {
    if (params.get('autojoin') === '1' && params.get('name')) void join(params.get('name')!, (invite ?? 'default').toLowerCase());
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (room) return (<><Scene room={room} onStageError={setStageError} /><GameHud room={room} stageError={stageError} onLeave={leave} /></>);
  if (lost) {
    return (
      <main className="menu" data-testid="connection-lost">
        <div className="menu-art" aria-hidden="true" />
        <section className="menu-col">
          <Brand />
          <div className="card state-card" role="alert">
            <h2>{lost.title}</h2>
            {lost.detail && <p>{lost.detail}</p>}
            <div className="menu-actions">
              {lost.canRetry && last.current && <button className="btn primary big" disabled={busy} onClick={() => void join(last.current!.name, last.current!.code)} data-testid="reconnect">{busy ? 'Reconnecting…' : 'Reconnect'}</button>}
              {!lost.canRetry && <button className="btn primary big" onClick={() => location.reload()}>Reload</button>}
              <button className="btn" onClick={() => setLost(null)}>Main menu</button>
            </div>
            {error && <p className="error">{error}</p>}
            <p className="muted small">Reconnecting rejoins the room; during a round you watch until the next one.</p>
          </div>
        </section>
      </main>
    );
  }
  return (
    <MainMenu initialName={params.get('name') ?? ''} inviteCode={invite} busy={busy} error={error}
      onJoin={(name, code) => void join(name, code ?? newRoomCode())} />
  );
}
