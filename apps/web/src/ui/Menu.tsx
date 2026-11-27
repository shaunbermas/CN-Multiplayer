// Out-of-game screens and shared panels. Stage 01 refinement redesign (24 Nov 2026): visual reference
// docs/ui/STAGE_01_UI_MOCKUP.html, which uses the same stylesheet (styles.css).
import { useState, type ReactNode } from 'react';
import { AGAWAN_ENABLED, AGAWAN_STAGE_ID, DEFAULT_STAGE_ID, HUNT, MATCH, MAX_PLAYERS, STARTABLE_STAGES, stageNumber } from '@cn-trials/shared';
import { IconArrowRight, IconBook, IconClaws, IconCode, IconGear, IconParol, IconUser, IconUsers } from './icons.tsx';
import { applyGraphicsSetting } from '../game/qualityStore.ts';
import { updateSettings, useSettings, type GraphicsSetting } from './settings.ts';
import { applyVolume, setMuted } from '../game/audio.ts';

/** The CN TRIAL wordmark (decision 037: no eye logo; a heavy condensed display face, slanted, with a red slash). */
export function Brand({ small = false }: { small?: boolean }) {
  return (
    <div className={`brand${small ? ' small' : ''}`} aria-label="CN TRIAL">
      <span className="brand-word">CN TRIAL</span>
      <span className="brand-slash" aria-hidden="true">//</span>
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
        <li><b>Red light: freeze.</b> There is no warning: red can come at any moment. Anyone still moving a split second after it turns red is frozen in ice. The ice breaks 2 seconds after the next GO, and you race on: nobody is out.</li>
        <li><b>Finish</b> before the timer runs out. Once the first player finishes, everyone else has 30 seconds.</li>
        <li><b>Points.</b> First to finish a stage: 2 points. Every other finisher: 1. Not over the line when time runs out: 0. A match has several stages; everyone plays every stage, and the most points wins.</li>
        <li><b>Bumping into someone</b> knocks you both over for a moment. Falling never eliminates you, but it costs time.</li>
        <li><b>Obstacles</b>: barricade rows to weave through and a gate that slides only on green. The yard is foggy: you only see them up close.</li>
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
          <tr><td><kbd>M</kbd></td><td>Mute or unmute the sound</td></tr>
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
            <option value="low">Low</option>
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
        <label className="check"><input type="checkbox" checked={!s.muted} onChange={(e) => setMuted(!e.target.checked)} data-testid="sound-on" /> Sound on <span className="muted">(<kbd>M</kbd> in a game)</span></label>
        <label>Volume <output>{Math.round(s.volume * 100)} %</output>
          <input type="range" min={0} max={1} step={0.05} value={s.volume} disabled={s.muted} onChange={(e) => { updateSettings({ volume: Number(e.target.value) }); applyVolume(); }} data-testid="volume" />
        </label>
        <p className="muted">Signals always show a word as well as a colour, and each one also has its own sound, so the game works with the sound off.</p>
      </div>
    </Modal>
  );
}

/**
 * Stages on the main menu, in the official order (decision 045): 01 Red Light, Green Light, 02 Agawan Base, 03 The Hunt.
 * Agawan Base shows as "Coming soon" and cannot be picked until it is built and switched on (AGAWAN_ENABLED).
 */
const STAGE_PICKS = [
  { id: DEFAULT_STAGE_ID, name: 'Red Light, Green Light', sub: '', icon: null },
  { id: AGAWAN_STAGE_ID, name: 'Agawan Base', sub: AGAWAN_ENABLED ? '' : 'Coming soon', icon: <IconParol size={44} /> },
  { id: HUNT.id, name: 'The Hunt', sub: '', icon: <IconClaws size={64} /> },
].map((p) => ({ ...p, no: String(stageNumber(p.id)).padStart(2, '0'), enabled: STARTABLE_STAGES.includes(p.id) }));

/** Where the match starts. The host's pick is used. Owner's menu design (25 Nov 2026): three stage cards. */
function StagePicker({ value }: { value: string }) {
  return (
    <div className="stage-pick-wrap">
    <span className="menu-label" id="stage-pick-label">Select stage</span>
    <div className="stage-picker" role="radiogroup" aria-labelledby="stage-pick-label" data-testid="stage-picker">
      {STAGE_PICKS.map((p) => (
        <button key={p.id} type="button" role="radio" aria-checked={p.id === value} aria-disabled={!p.enabled} className={`stage-opt${p.enabled ? '' : ' soon'}`}
          onClick={() => { if (p.enabled) updateSettings({ startStage: p.id }); }} title={p.enabled ? undefined : 'Coming soon'} data-testid={`stage-pick-${p.no}`}>
          {p.icon && <span className="stage-ico" aria-hidden="true">{p.icon}</span>}
          <b>Stage {p.no}</b><span className="stage-name">{p.name.split(', ').map((w, i, all) => <span key={i}>{w}{i < all.length - 1 ? ',' : ''}<br hidden={i === all.length - 1} /></span>)}</span>{p.sub && <small>{p.sub}</small>}
        </button>
      ))}
    </div>
    </div>
  );
}

export function MainMenu({ initialName, inviteCode, busy, error, onJoin }: {
  initialName: string; inviteCode: string | null; busy: boolean; error: string;
  onJoin: (name: string, code: string | null) => void;
}) {
  const [name, setName] = useState(initialName);
  const [code, setCode] = useState(inviteCode ?? '');
  const [panel, setPanel] = useState<'none' | 'join' | 'howto' | 'settings'>('none');
  const nameOk = name.trim().length > 0;
  const s = useSettings();
  const pick = STAGE_PICKS.find((x) => x.id === s.startStage && x.enabled) ?? STAGE_PICKS[0];
  return (
    <main className="menu" data-testid="menu">
      <div className="menu-art" aria-hidden="true" data-stage={pick.id} data-testid="menu-art">
        {STAGE_PICKS.map((p) => <i key={p.id} className={`menu-shot${p.id === pick.id ? ' on' : ''}`} data-shot={`STG${p.no}`} />)}
      </div>
      <section className="menu-col">
        <div className="menu-title">
          <Brand />
          <p className="menu-tagline">{MATCH.stages} stages. {MAX_PLAYERS} players. 1 champion.</p>
          <span className="menu-rule" aria-hidden="true" />
        </div>
        <StagePicker value={pick.id} />
        <label className="name-field"><span className="menu-label">Your nickname</span>
          <span className="field-box"><IconUser size={22} />
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Guest nickname" maxLength={16} autoFocus={!inviteCode} data-testid="nickname" /></span>
        </label>
        {inviteCode && <p className="notice invite" data-testid="invite-notice"><IconUsers size={24} /><span>You were invited to room <b>{inviteCode.toUpperCase()}</b>.</span></p>}
        <div className="menu-actions">
          {inviteCode ? (
            <button className="btn red big wide" disabled={!nameOk || busy} onClick={() => onJoin(name.trim(), inviteCode)} data-testid="join-invite">
              <span>Join room {inviteCode.toUpperCase()}</span><IconArrowRight size={26} /></button>
          ) : (
            <button className="btn red big wide" disabled={!nameOk || busy} onClick={() => onJoin(name.trim(), null)} data-testid="create-room">
              <span>Create private room</span><IconArrowRight size={26} /></button>
          )}
          <div className="menu-row">
            <button className="btn outline" onClick={() => setPanel(panel === 'join' ? 'none' : 'join')} aria-expanded={panel === 'join'}><IconCode size={22} />Join with a code</button>
            <button className="btn outline" onClick={() => setPanel('howto')}><IconBook size={24} />How to play</button>
          </div>
          {panel === 'join' && (
            <form className="join-row" onSubmit={(e) => { e.preventDefault(); if (nameOk && code.trim()) onJoin(name.trim(), code.trim().toLowerCase()); }}>
              <input value={code} onChange={(e) => setCode(e.target.value.replace(/[^a-zA-Z0-9-]/g, '').slice(0, 32))} placeholder="Room code" aria-label="Room code" data-testid="room-code" autoFocus />
              <button className="btn red" disabled={!nameOk || !code.trim() || busy} data-testid="join-code">Join</button>
            </form>
          )}
          <span className="menu-divider" aria-hidden="true" />
          <button className="btn settings-link" onClick={() => setPanel('settings')}><IconGear size={26} />Settings</button>
        </div>
        {busy && <p className="muted" role="status">Connecting…</p>}
        {error && <p className="error" role="alert" data-testid="menu-error">{error}</p>}
      </section>
      {panel === 'howto' && <HowToPlay onClose={() => setPanel('none')} />}
      {panel === 'settings' && <SettingsPanel onClose={() => setPanel('none')} />}
    </main>
  );
}
