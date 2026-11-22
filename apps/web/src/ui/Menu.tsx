// Stage 1.5 (Prompt 07): out-of-game screens and shared panels. Visual direction from the CN TRIAL UI/UX
// concept board (layout and style only; its placeholder avatars and imagery are not used).
import { useState, type ReactNode } from 'react';
import { MAX_PLAYERS } from '@cn-trials/shared';
import { applyGraphicsSetting } from '../game/qualityStore.ts';
import { updateSettings, useSettings, type GraphicsSetting } from './settings.ts';

export function Brand({ small = false }: { small?: boolean }) {
  return (
    <div className={`brand${small ? ' small' : ''}`} aria-label="CN TRIAL">
      <span className="brand-word">CN TRIAL</span>
      <span className="brand-slash" aria-hidden="true" />
    </div>
  );
}

export function Modal({ title, onClose, children, wide = false, testid }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean; testid?: string }) {
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={title} data-testid={testid}
      onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}>
      <section className={`card modal${wide ? ' wide' : ''}`}>
        <header className="card-head"><h2>{title}</h2><button className="icon-btn" onClick={onClose} aria-label="Close" autoFocus>✕</button></header>
        {children}
      </section>
    </div>
  );
}

export function HowToPlay({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="How to play" onClose={onClose} testid="howto">
      <ol className="howto">
        <li><b>Green light: move.</b> Walk toward the finish line at the far end of the yard.</li>
        <li><b>Amber: get ready.</b> The Watcher is turning back. Stop before it faces you.</li>
        <li><b>Red light: freeze.</b> Anyone still moving after a short grace moment is spotted and eliminated. Eliminated players spectate.</li>
        <li><b>Finish</b> before the timer runs out. In tournament rules, only the first finishers qualify.</li>
        <li><b>Obstacle twist</b> (host option): barricade rows to weave through and a gate that slides only on green.</li>
        <li><b>Your contestant</b> wears colours dealt at random when you join (kept if you rejoin). Nobody in the room has the same ones. In the lobby, <kbd>Space</kbd> jumps and <kbd>E</kbd> dives, just for fun.</li>
      </ol>
      <table className="keys">
        <tbody>
          <tr><td><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> / arrows</td><td>Move</td></tr>
          <tr><td>Mouse (click the game first)</td><td>Look around</td></tr>
          <tr><td><kbd>Space</kbd></td><td>Skip the briefing · jump (lobby, just for show)</td></tr>
          <tr><td><kbd>E</kbd></td><td>Dive (lobby, just for show)</td></tr>
          <tr><td><kbd>Tab</kbd></td><td>Switch the player you spectate</td></tr>
          <tr><td><kbd>R</kbd></td><td>Respawn (lobby practice only)</td></tr>
          <tr><td><kbd>Esc</kbd></td><td>Release the mouse</td></tr>
        </tbody>
      </table>
      <p className="muted">The server decides every signal, spot and finish; your browser only sends your moves.</p>
    </Modal>
  );
}

export function SettingsPanel({ onClose }: { onClose: () => void }) {
  const s = useSettings();
  const setGraphics = (g: GraphicsSetting) => { updateSettings({ graphics: g }); applyGraphicsSetting(g); };
  return (
    <Modal title="Settings" onClose={onClose} testid="settings">
      <div className="form">
        <label>Graphics
          <select value={s.graphics} onChange={(e) => setGraphics(e.target.value as GraphicsSetting)} data-testid="graphics">
            <option value="auto">Auto (High, lowers itself if the game stutters)</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low (weak or older computers)</option>
          </select>
        </label>
        <label>Mouse sensitivity <output>{s.sensitivity.toFixed(1)}×</output>
          <input type="range" min={0.3} max={2.5} step={0.1} value={s.sensitivity} onChange={(e) => updateSettings({ sensitivity: Number(e.target.value) })} />
        </label>
        <label className="check"><input type="checkbox" checked={s.invertY} onChange={(e) => updateSettings({ invertY: e.target.checked })} /> Invert vertical look</label>
        <label>Interface size
          <select value={s.hudScale} onChange={(e) => updateSettings({ hudScale: Number(e.target.value) })}>
            <option value={1}>Normal</option><option value={1.25}>Large</option><option value={1.5}>Extra large</option>
          </select>
        </label>
        <label className="check"><input type="checkbox" checked={s.edgeFlash} onChange={(e) => updateSettings({ edgeFlash: e.target.checked })} /> Red screen-edge pulse on red light</label>
        <p className="muted">Signals always show a word and an icon as well as a colour. There is no sound yet, so there are no audio settings.</p>
      </div>
    </Modal>
  );
}

export function MainMenu({ initialName, inviteCode, busy, error, onJoin }: {
  initialName: string; inviteCode: string | null; busy: boolean; error: string;
  onJoin: (name: string, code: string | null) => void;
}) {
  const [name, setName] = useState(initialName);
  const [code, setCode] = useState(inviteCode ?? '');
  const [panel, setPanel] = useState<'none' | 'join' | 'howto' | 'settings'>(inviteCode ? 'join' : 'none');
  const nameOk = name.trim().length > 0;
  return (
    <main className="menu" data-testid="menu">
      <div className="menu-art" aria-hidden="true" />
      <section className="menu-col">
        <Brand />
        <p className="menu-sub">Multiplayer elimination game · up to {MAX_PLAYERS} per private room</p>
        <label className="name-field">Your nickname
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Guest nickname" maxLength={16} autoFocus={!inviteCode} data-testid="nickname" />
        </label>
        {inviteCode && <p className="notice" data-testid="invite-notice">You were invited to room <b>{inviteCode.toUpperCase()}</b>.</p>}
        <div className="menu-actions">
          {inviteCode ? (
            <button className="btn primary big" disabled={!nameOk || busy} onClick={() => onJoin(name.trim(), inviteCode)} data-testid="join-invite">▶ Join room {inviteCode.toUpperCase()}</button>
          ) : (
            <button className="btn primary big" disabled={!nameOk || busy} onClick={() => onJoin(name.trim(), null)} data-testid="create-room">▶ Create private room</button>
          )}
          <button className="btn" onClick={() => setPanel(panel === 'join' ? 'none' : 'join')} aria-expanded={panel === 'join'}>Join with a code</button>
          {panel === 'join' && (
            <form className="join-row" onSubmit={(e) => { e.preventDefault(); if (nameOk && code.trim()) onJoin(name.trim(), code.trim().toLowerCase()); }}>
              <input value={code} onChange={(e) => setCode(e.target.value.replace(/[^a-zA-Z0-9-]/g, '').slice(0, 32))} placeholder="Room code" aria-label="Room code" data-testid="room-code" />
              <button className="btn primary" disabled={!nameOk || !code.trim() || busy} data-testid="join-code">Join</button>
            </form>
          )}
          <button className="btn" onClick={() => setPanel('howto')}>How to play</button>
          <button className="btn" onClick={() => setPanel('settings')}>Settings</button>
        </div>
        {busy && <p className="muted" role="status">Connecting…</p>}
        {error && <p className="error" role="alert" data-testid="menu-error">{error}</p>}
        <p className="menu-foot muted">Stage 01 · Red Light, Green Light</p>
      </section>
      {panel === 'howto' && <HowToPlay onClose={() => setPanel('none')} />}
      {panel === 'settings' && <SettingsPanel onClose={() => setPanel('none')} />}
    </main>
  );
}
