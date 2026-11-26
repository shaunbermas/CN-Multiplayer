// In-game interface driven by the live room state (no demo values). Stage 01 refinement redesign (24 Nov 2026):
// visual reference docs/ui/STAGE_01_UI_MOCKUP.html (same stylesheet). Screens: lobby (ready / start, add random
// players, player count) · briefing and next-stage intro · countdown · HUD (stage of match, your points, signal
// lens, timer, counts) · spotted / finished / knocked-down banners · feed · spectator · stage results with points
// and overall standings · final winner and leaderboard.
import { useEffect, useState } from 'react';
import { AGAWAN_STAGE_ID, BOT_LIMITS, DEFAULT_STAGE_ID, MATCH, MAX_PLAYERS, OFFICIAL_ORDER, STARTABLE_STAGES, colorwayById, getStage, matchOrder, stageNumber, tieBreakReason, type Standing, type TeamSlot } from '@cn-trials/shared';
import type { TrialRoom } from '../net.ts';
import { inviteLink } from '../net.ts';
import { hud } from '../game/hudStore.ts';
import { signalView } from '../game/roundClock.ts';
import { activeStage } from '../game/stage.ts';
import { STAGE_SCENES } from '../stages/registry.ts';
import { Brand, HowToPlay, SettingsPanel } from './Menu.tsx';
import { useSettings } from './settings.ts';
import { settings, updateSettings } from './settings.ts';
import { IconBars, IconCheck, IconFlag, IconGear, IconHome, IconMouse, IconPause, IconPin, IconPlay, IconRestart, IconRestartCcw, IconUsers, IconVolume, IconVolumeOff, IconX } from './icons.tsx';
import { setMuted } from '../game/audio.ts';
import { HuntBriefingRole, HuntPanel, HuntRoleChip, HuntTop, captureText } from './HuntHud.tsx';
import { AgawanPanel, AgawanResultsBoard, AgawanTeamChip, AgawanTeamStatus, AgawanTop, TeamChampionshipBoard, teamName } from './AgawanHud.tsx';
import { TeamLobby, teamsVisible } from './TeamLobby.tsx';
import { WinnerCeremony } from './WinnerCeremony.tsx';

// Decision 037: no time-left bar, no "get ready" warning and no hint text: knowing when red comes is part of the
// challenge. Owner's HUD design (25 Nov 2026): the signal reads GO or STOP, with no lens icon.
const SIGNAL_UI = {
  green: { word: 'GO', cls: 'go' },
  warning: { word: 'GO', cls: 'go' },
  red: { word: 'STOP', cls: 'stop' },
} as const;

const pad2 = (n: number) => String(n).padStart(2, '0');
const coat = (id: string | undefined) => colorwayById(id);
// Decision 045: a stage keeps its own number everywhere (The Hunt is always Stage 03), whatever its place in the match.
// "/ 03" counts the official stages; "2 of 2" counts the stages in this match.
const ALL_STAGES = pad2(OFFICIAL_ORDER.length);
/** Registry id of the stage at 1-based match position n (the client knows the same order as the server). */
const stageAt = (total: number, n: number) => matchOrder(total)[n - 1] ?? DEFAULT_STAGE_ID;
const stageNoAt = (total: number, n: number) => pad2(stageNumber(stageAt(total, n)));
const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
const fmtClock = (t: number) => { const c = Math.ceil(Math.max(0, t)); return `${pad2(Math.floor(c / 60))}:${pad2(c % 60)}`; };

/** The stage this player wants the match to start at: ?startStage=… (tests), else the main-menu pick. */
function pickedStage(): string {
  const q = new URLSearchParams(location.search).get('startStage');
  return getStage(q ?? settings.startStage).id;
}

function startOptions(lobbyStage?: string) {
  // Obstacles are always on (decision 031). Test hooks: ?testSeed=…&testRound=…&testBriefing=…&testStages=…&obstacles=0
  // (the server honours these only in test mode).
  const q = new URLSearchParams(location.search);
  const test: Record<string, unknown> = q.get('obstacles') === '0' ? { obstacles: false } : {};
  // The stage picked on the main menu (decision 042). ?startStage=… overrides it (tests).
  // Decision 047: the lobby already shows the host's pick, so the match starts where everyone practised.
  test.startStage = q.get('startStage') ?? lobbyStage ?? settings.startStage;
  if (q.get('testStages')) test.stages = Number(q.get('testStages'));
  if (q.get('testResults')) test.resultsS = Number(q.get('testResults'));
  if (!q.get('testSeed')) return test;
  return { ...test, seed: Number(q.get('testSeed')), roundS: Number(q.get('testRound') ?? 30), briefingS: Number(q.get('testBriefing') ?? 2) };
}

function useTick(ms: number) {
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick((n) => n + 1), ms); return () => clearInterval(t); }, [ms]);
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
  const lobbyStage = getStage(r.stage || DEFAULT_STAGE_ID).id;
  // Decision 047 (owner, 26 Nov 2026): the lobby is the stage the host picked on the main menu, not always Stage 01.
  const isHost = room.isHost;
  useEffect(() => {
    if (!isHost || r.phase !== 'lobby') return;
    const want = pickedStage();
    if (STARTABLE_STAGES.includes(want) && want !== lobbyStage) room.setLobbyStage(want);
  }, [isHost, r.phase]); // eslint-disable-line react-hooks/exhaustive-deps
  const pickStage = (id: string) => { updateSettings({ startStage: id }); room.setLobbyStage(id); };
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
        {/* Decision 048: team setup shows only in an Agawan Base lobby; Stage 01 and The Hunt have no teams. */}
        {teamsVisible() && lobbyStage === AGAWAN_STAGE_ID && <TeamLobby room={room} />}
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
        <div className="lobby-stage" data-testid="lobby-stage">
          <span className="eyebrow">{isHost ? 'Start at' : 'Starting at'}</span>
          <div className="lobby-stage-row" role="radiogroup" aria-label="Stage the match starts at">
            {STARTABLE_STAGES.map((id) => {
              const st = getStage(id);
              return (
                <button key={id} role="radio" aria-checked={id === lobbyStage} disabled={!isHost && id !== lobbyStage}
                  className={`lobby-stage-pick${id === lobbyStage ? ' on' : ''}`} data-testid={`lobby-stage-${pad2(st.number)}`}
                  onClick={() => { if (isHost && id !== lobbyStage) pickStage(id); }}>
                  <small>Stage {pad2(st.number)}</small><b>{st.name}</b>
                </button>
              );
            })}
          </div>
        </div>
        <div>
          <span className="eyebrow">Players</span>
          <div className="count-big num" data-testid="players">{players.length}<small>/ {MAX_PLAYERS}</small></div>
          <div className="count-split"><span><b data-testid="humans">{humans}</b> {humans === 1 ? 'person' : 'people'}</span><span><b data-testid="bots">{bots}</b> random</span><span><b>{ready}</b> ready</span></div>
        </div>
        <div className="lobby-actions">
          {room.isHost
            ? <button className="btn go big wide" data-testid="start" onClick={() => room.start(startOptions(lobbyStage))}>Start game</button>
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
          ? `${lobbyStage !== DEFAULT_STAGE_ID ? `The match starts at Stage ${pad2(getStage(lobbyStage).number)} · ${getStage(lobbyStage).name}. ` : `${MATCH.stages} stages, starting with Red Light. `}Points add up across stages. Walk around this stage to practise.`
          : 'Waiting for the host to start. Walk around this stage to practise.'}</p>
      </aside>
    </section>
  );
}

/** A centred confirm pop-up (owner, 25 Nov 2026: restart asks in a pop-up, not a small inline prompt). */
function Confirm({ title, text, yes, onYes, onNo, testid, yesId, noId }: {
  title: string; text: string; yes: string; onYes: () => void; onNo: () => void; testid: string; yesId: string; noId: string;
}) {
  return (
    <div className="modal-backdrop" role="alertdialog" aria-modal="true" aria-label={title} data-testid={testid} onKeyDown={(e) => { if (e.key === 'Escape') onNo(); }}>
      <section className="glass-card confirm">
        <h2>{title}</h2>
        <p>{text}</p>
        <div className="confirm-row">
          <button className="pause-btn" onClick={onNo} data-testid={noId} autoFocus>Cancel</button>
          <button className="pause-btn danger" onClick={onYes} data-testid={yesId}>{yes}</button>
        </div>
      </section>
    </div>
  );
}

/**
 * Pause panel (owner's HUD design, 25 Nov 2026): Resume, Restart stage, Main menu. The host's pause freezes the whole
 * room for everyone; anyone else gets the same menu while the game keeps running.
 */
function PausePanel({ room, onResume, onRestart, onMenu }: { room: TrialRoom; onResume: () => void; onRestart: () => void; onMenu: () => void }) {
  const paused = !!room.round.paused;
  const host = room.isHost;
  return (
    <section className="glass-card pause-panel" data-testid="pause-menu" aria-label="Paused">
      <h2>Paused</h2>
      {!host && <p className="pause-note">{paused ? 'The host paused the game.' : 'Only the host can pause. The game keeps running.'}</p>}
      {(host || !paused) && <button className="pause-btn" onClick={onResume} data-testid="resume" autoFocus><IconPlay size={24} /><span>Resume</span></button>}
      {host && <button className="pause-btn" onClick={onRestart} data-testid="pause-restart"><IconRestartCcw size={26} /><span>Restart stage</span></button>}
      <button className="pause-btn" onClick={onMenu} data-testid="main-menu"><IconHome size={26} /><span>Main menu</span></button>
    </section>
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
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirm, setConfirm] = useState<'none' | 'restart' | 'leave'>('none');
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
  // Agawan Base has its own feed (tags, rescues, raids); bump toasts there would only be noise.
  const feed = room.events.filter((e) => now - e.at < 3500 && e.id !== room.id && e.other !== room.id && !(room.round.agawan && e.kind === 'collision')).slice(-3);
  const myStanding = room.standings.find((x) => x.id === room.id);
  const inMatch = r.phase !== 'lobby' && m.stage > 0;
  const stageNo = `STAGE ${pad2(stage.number)}`;
  const ui = r.phase === 'active' && sig.signal !== 'none' ? SIGNAL_UI[sig.signal] : null;
  const closing = r.phase === 'active' && finished > 0;
  const iWonStage = recentFinish && firstFinisherId(room) === room.id;
  const isHunt = stage.rules === 'hide_and_hunt';
  const isAgawan = stage.rules === 'agawan_base';
  /** Stages without a finish line (The Hunt, Agawan Base). */
  const noCourse = isHunt || isAgawan;
  const recentCaught = room.events.find((e) => e.kind === 'captured' && e.id === room.id && now - e.at < 3000);
  const leaderProgress = Math.max(0, ...inRound.filter((p) => p.id !== room.id).map((p) => {
    const g = activeStage(room).geo;
    return Math.max(0, Math.min(1, (p.z - g.startZ) / (g.finishZ - g.startZ)));
  }));
  const playing = r.phase === 'briefing' || r.phase === 'countdown' || r.phase === 'active';
  const paused = !!r.paused;
  // The host's pause menu is the room's pause: opening it pauses everyone, Resume carries on.
  const openMenu = () => { setMenuOpen(true); if (room.isHost && playing && !paused) room.pause(true); };
  const resume = () => { setMenuOpen(false); if (room.isHost && paused) room.pause(false); };
  useEffect(() => { if (!playing) setMenuOpen(false); }, [playing]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'KeyP' || e.repeat || (e.target as HTMLElement)?.tagName === 'INPUT') return;
      if (!playing) return;
      if (menuOpen || paused) resume(); else openMenu();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
  const showPause = playing && (menuOpen || paused);

  return (
    <div className="hud" style={{ ['--hud-user' as string]: s.hudScale }} data-testid="hud" data-phase={r.phase} data-signal={r.phase === 'active' ? sig.signal : 'none'} data-status={me?.status}
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
            ? <div className="glass stage-chip"><b>Lobby</b><i className="sep" /><span>{noCourse ? `${stageNo} · ${stage.name}` : 'Practice walk is open'}</span></div>
            : <div className="glass stage-chip" data-testid="stage-chip"><b>{stageNo}{inMatch && <> / {ALL_STAGES}</>}</b><i className="sep" /><span>{stage.name}</span></div>}
          {isHunt && <HuntRoleChip room={room} />}
          {isAgawan && r.phase === 'active' && <AgawanTeamChip room={room} />}
          {inMatch && me && (
            <div className="glass pts-chip" data-testid="my-points"><IconBars size={22} /><span className="pts">{myStanding?.points ?? 0} PTS</span></div>
          )}
        </div>
        <div className="hud-centre">
          {ui && (
            <div className={`glass signal ${ui.cls}`} data-testid="signal" aria-live="assertive">
              <span className="word">{ui.word}</span>
            </div>
          )}
        </div>
        <div className="hud-right">
          {isHunt && r.phase === 'active' ? <HuntTop room={room} /> : isAgawan && r.phase === 'active' ? <AgawanTop room={room} /> : r.phase === 'active' ? <div className={`glass timer num${closing ? ' closing' : ''}`} data-testid="timer">{closing && <small>Finish closes</small>}{fmtClock(remaining)}</div>
            : r.phase === 'lobby' ? <div className="glass timer num" data-testid="timer">{hud.walkTime.toFixed(1)} s</div> : null}
          {/* Owner (25 Nov 2026): the button row is as wide as the counts panel above it. */}
          <div className="hud-stack">
          {!noCourse && (r.phase === 'active' || r.phase === 'results' || r.phase === 'countdown') && (
            <div className="glass counts num" data-testid="round-counts">
              <span title="Still racing"><IconUsers size={22} />{alive} / {inRound.length}</span><i className="sep" />
              <span className="in" title="Finished"><IconCheck size={22} />{finished}</span><i className="sep" />
              <span className="out" title="Spotted"><IconX size={20} />{eliminated}</span>
            </div>
          )}
          <div className="hud-tools">
            {room.isHost && r.phase !== 'lobby' && (
              <button className="tool-btn" onClick={() => setConfirm('restart')} aria-label="Restart stage" title="Restart stage" data-testid="restart"><IconRestart size={30} /></button>
            )}
            {playing && (
              <button className="tool-btn" onClick={() => (showPause ? resume() : openMenu())} aria-label={showPause ? 'Resume (P)' : 'Pause (P)'} title={showPause ? 'Resume (P)' : 'Pause (P)'}
                aria-pressed={showPause} data-testid="pause">{showPause ? <IconPlay size={28} /> : <IconPause size={28} />}</button>
            )}
            {r.phase === 'lobby' && <button className="tool-btn" onClick={() => setConfirm('leave')} aria-label="Main menu" title="Main menu" data-testid="lobby-menu"><IconHome size={28} /></button>}
            <button className="tool-btn" onClick={() => setMuted(!s.muted)} aria-label={s.muted ? 'Unmute sound (M)' : 'Mute sound (M)'} aria-pressed={s.muted}
              title={s.muted ? 'Sound off (M)' : 'Sound on (M)'} data-testid="mute">{s.muted ? <IconVolumeOff size={30} /> : <IconVolume size={30} />}</button>
            <button className="tool-btn" onClick={() => setOverlay('settings')} aria-label="Settings" title="Settings" data-testid="open-settings"><IconGear size={30} /></button>
          </div>
          </div>
          {showPause && <PausePanel room={room} onResume={resume} onRestart={() => setConfirm('restart')} onMenu={() => setConfirm('leave')} />}
        </div>
      </div>
      {paused && !showPause && <div className="glass paused-tag" data-testid="paused">Paused</div>}

      {r.phase === 'lobby' && <Lobby room={room} />}

      {r.phase === 'briefing' && (
        <section className="card briefing" data-testid="briefing">
          {m.stage > 1 ? (
            <>
              <span className="eyebrow">Next stage</span>
              <div className="stage-of" data-testid="next-stage-intro">Stage {pad2(stage.number)} <i>/ {ALL_STAGES}</i></div>
              <p className="rule">{stage.briefing.rule}</p>
              {isHunt ? <HuntBriefingRole room={room} />
                : <p className="muted">{m.final ? 'Last stage. ' : ''}Everyone plays, including anyone spotted or caught before. First finisher +2, every finisher +1.</p>}
              <ul className="mini-standings">
                {room.standings.slice(0, 3).map((x) => <li key={x.id}><b>{x.rank}</b><span>{x.name}</span><span className="num">{x.points} pts</span></li>)}
              </ul>
            </>
          ) : (
            <>
              <span className="eyebrow">Stage {pad2(stage.number)} · {stage.name} · {m.stage || 1} of {m.total || 1}</span>
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
        <div className="countdown" data-testid="countdown" aria-live="assertive">
          <span className="cd-num" data-n={Math.max(1, Math.ceil(remaining))}>{Math.max(1, Math.ceil(remaining))}</span>
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
      {isAgawan && <AgawanPanel room={room} />}
      {isAgawan && playing && <AgawanTeamStatus room={room} />}
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
        {r.phase === 'lobby' && <div className="glass objective">{isAgawan ? `Practice: explore the street and find the ${room.teams?.count === 2 ? 'two bases (base C is closed with 2 teams)' : 'three bases'}` : isHunt ? 'Practice: explore the facility and its hiding places' : hud.status === 'finished' ? `Practice: finished in ${hud.finishTime.toFixed(2)} s` : 'Practice: walk to the finish line'}</div>}
      </div>
      <div className="glass hud-bottom">
        <span className="hb-cell hb-dist num">{isAgawan && r.phase !== 'lobby' ? <>{room.agawan ? (room.teams?.teams.find((t) => t.slot === room.agawan!.team)?.name ?? `Team ${room.agawan.team}`) : 'Agawan Base'}</> : isHunt && r.phase !== 'lobby' ? <>{room.hunt?.role === 'hunter' ? 'Hunter' : room.hunt?.role === 'hider' ? 'Hider' : 'The Hunt'}</> : noCourse ? <>{stage.name}</> : <><IconPin size={24} /><span><b>{hud.distance.toFixed(0)}</b> m to go</span></>}</span>
        <i className="sep" />
        <span className="hb-cell hb-keys"><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd><em>Move</em><span className="dot" aria-hidden="true">•</span><IconMouse size={26} /><em>Look</em>
          {isAgawan && r.phase === 'active' && <em className="extra"><kbd>E</kbd> Hit (tap) / Free (hold) · <kbd>Tab</kbd> Team status</em>}
          {isHunt && r.phase === 'active' && <em className="extra">{room.hunt?.role === 'hunter' ? 'Q pulse · hold E capture · Shift sprint' : 'E hide · Shift sprint · C crouch'}</em>}
          {me?.status === 'spotted' && <em className="extra">Tab switch</em>}{r.phase === 'lobby' && <em className="extra">R respawn</em>}<em className="extra">P pause</em></span>
        <i className="sep" />
        {!noCourse && <><span className="hb-cell hb-finish"><IconFlag size={28} /><b>Finish</b></span><i className="sep" /></>}
        <span className="hb-cell hb-room">Room <b>{room.room.toUpperCase()}</b></span>
      </div>

      {confirm === 'restart' && (
        <Confirm title={`Restart stage ${pad2(stage.number)}?`} testid="restart-ask" yesId="restart-yes" noId="restart-no" yes="Restart stage"
          text={r.phase === 'results' ? 'The whole game starts again from stage 1 and points reset.' : 'Everyone goes back to the start of this stage. Points from earlier stages are kept.'}
          onNo={() => setConfirm('none')} onYes={() => { setConfirm('none'); setMenuOpen(false); room.restartStage(); }} />
      )}
      {confirm === 'leave' && (
        <Confirm title="Back to the main menu?" testid="leave-ask" yesId="leave-yes" noId="leave-no" yes="Main menu"
          text={r.phase === 'lobby' ? 'You leave this room. Your friends can still play.' : 'You leave the game in progress. If you come back with the same invite link, you get your seat and points back.'}
          onNo={() => setConfirm('none')} onYes={() => { setConfirm('none'); resume(); onLeave(); }} />
      )}
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
        <div><span className="eyebrow">Stage results</span><h2>Stage {room.round.stage ? pad2(stageNumber(room.round.stage)) : stageNoAt(m.total, m.stage)} <i>/ {ALL_STAGES}</i></h2></div>
        <div className="first-finisher" data-testid="winner">
          {rows.some((x) => x.teamPlace) ? <div><small>Agawan Base</small><b>{(room.round.agawan?.winners ?? []).map((s) => teamName(room, s)).join(' and ') || 'No winner'} {(room.round.agawan?.winners.length ?? 0) > 1 ? 'share first place' : 'win'}</b></div>
            : rows.some((x) => x.role) ? <div><small>The Hunt</small><b>{rows.filter((x) => x.role === 'hider' && x.status !== 'captured').length} hiders survived</b> <span className="muted num">{rows.filter((x) => x.status === 'captured').length} caught</span></div>
            : first ? <><Swatch colorway={firstPlayer?.colorway} /><div><small>First to finish · +2</small><b>{first.name}</b> <span className="muted num">{first.finishTime.toFixed(2)} s</span></div></>
            : <div><small>First to finish</small><b>Nobody finished</b></div>}
        </div>
      </div>
      <div className="results-body">
        <div>
          <span className="eyebrow">This stage</span>
          <AgawanResultsBoard room={room} />
          <StageBoard room={room} />
        </div>
        <div>
          {room.teamBoard && <><span className="eyebrow">Team championship</span><TeamChampionshipBoard room={room} /></>}
          <span className="eyebrow">{room.teamBoard ? 'Individual board' : 'Overall standings'}</span>
          <StandingsTable room={room} standings={standings} compact />
        </div>
      </div>
      <footer className="card-foot">
        <span className="next-line">Stage {stageNoAt(m.total, m.stage + 1)} starts in {Math.ceil(remaining)} s · spotted and caught players play it too</span>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn" onClick={onLeave} data-testid="exit">Exit to menu</button>
          {room.isHost && <button className="btn go" onClick={() => room.nextStage()} data-testid="next-stage">Start stage {stageNoAt(m.total, m.stage + 1)} now</button>}
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
            <td className="muted">{p.teamPlace ? [`${p.team ? teamName(room, p.team as TeamSlot) : ''} · ${ordinal(p.teamPlace)}`, p.raids ? `${p.raids} ${p.raids === 1 ? 'raid' : 'raids'}` : '', p.tags ? `${p.tags} ${p.tags === 1 ? 'tag' : 'tags'}` : '', p.rescues ? `${p.rescues} ${p.rescues === 1 ? 'rescue' : 'rescues'}` : ''].filter(Boolean).join(' · ')
              : p.role === 'hunter' ? `Hunter · ${p.captures ?? 0} ${p.captures === 1 ? 'capture' : 'captures'}`
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
  const footer = (
    <footer className="card-foot">
      <span className="next-line">Back to the lobby in {Math.ceil(remaining)} s · ties: points, then stage wins, finishes, total time</span>
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn" onClick={onLeave} data-testid="exit">Exit to menu</button>
        {room.isHost && <button className="btn" onClick={() => room.nextStage()} data-testid="back-to-lobby">Back to lobby</button>}
        {room.isHost && <button className="btn go" onClick={() => room.restart()} data-testid="play-again">↻ Restart game</button>}
      </div>
    </footer>
  );
  // Decision 049: the winner is broadcast (confetti, podium) only after a match that played all three stages.
  if (m.champion && st.length > 0) {
    return <WinnerCeremony room={room} standings={st} table={<StandingsTable room={room} standings={st.slice(3)} />} footer={footer} />;
  }
  return (
    <section className="card results final" data-testid="results" aria-label="Final results">
      <div data-testid="final" className="results-head"><div><span className="eyebrow">Final results · {m.total} {m.total === 1 ? 'stage' : 'stages'}</span><h2>Match complete</h2>
        {m.total > 1 && <p className="muted">Play all three stages from Stage 01 to crown a winner.</p>}</div></div>
      <TeamChampionshipBoard room={room} final />
      {st.length ? <StandingsTable room={room} standings={st} /> : <p className="muted">No scores were recorded.</p>}
      {room.results.length > 0 && (
        <details className="last-stage" open={m.total <= 1}>
          <summary className="eyebrow">Stage {stageNoAt(m.total, m.stage)} results</summary>
          <AgawanResultsBoard room={room} />
          <StageBoard room={room} />
        </details>
      )}
      {footer}
    </section>
  );
}
