// Stage 02 · THE HUNT interface (same design system as Stage 01: panels, chips, banners, display type). Driven only by
// the server: the public hunt state (round.hunt) and your own private state (room.hunt). Role-specific:
//   hunters  role chip, head start / hunt timer, Pulse Detector (ready, cooldown, signal bars, rough direction),
//            capture ring while holding E, captures count
//   hiders   role chip, head start / hunt timer, threat warning (no direction), hiding status and cooldown, sprint
//   captured caught banner, spectating, "you return next stage"
import { STAGE02 } from '@cn-trials/shared';
import type { TrialRoom } from '../net.ts';
import { input } from '../game/input.ts';
import { hud } from '../game/hudStore.ts';
import { activeStage } from '../game/stage.ts';

const fmt = (t: number) => `${Math.floor(Math.max(0, t) / 60)}:${String(Math.ceil(Math.max(0, t)) % 60).padStart(2, '0')}`;
const STRENGTH = ['No signal', 'Weak signal', 'Signal', 'Strong signal'];

/** Room name for where you stand (helps people call out locations). */
function roomAt(room: TrialRoom): string {
  const me = room.self;
  const layout = activeStage(room).def.hunt?.layout;
  if (!me || !layout) return '';
  return layout.rooms.find((r) => me.x >= r.minX && me.x <= r.maxX && me.z >= r.minZ && me.z <= r.maxZ)?.label ?? '';
}

export function HuntTop({ room }: { room: TrialRoom }) {
  const pub = room.round.hunt;
  const me = room.hunt;
  if (!pub || room.round.phase !== 'active') return null;
  const head = pub.headStartLeft > 0;
  const remaining = room.remaining();
  return (
    <div className={`hunt-clock${head ? ' head' : ''}`} data-testid="hunt-clock">
      {head
        ? <><small>{me?.role === 'hunter' ? 'Gates open in' : 'Head start'}</small><b className="num">{Math.ceil(pub.headStartLeft)}</b></>
        : <><small>Hunt</small><b className="num">{fmt(remaining)}</b></>}
      <span className="hunt-count num" data-testid="hunt-counts">{pub.hidersLeft}/{pub.hiders} hiders free · {pub.hunters.length} hunters</span>
    </div>
  );
}

export function HuntRoleChip({ room }: { room: TrialRoom }) {
  const me = room.hunt;
  if (!me || room.round.phase === 'lobby' || room.round.phase === 'results') return null;
  return <div className={`chip role-chip ${me.role}`} data-testid="role-chip"><b>{me.role === 'hunter' ? 'HUNTER' : 'HIDER'}</b><span>{roomAt(room)}</span></div>;
}

/** Arrow for a pulse sector, relative to where the camera looks (sector 0 = -Z; yaw 0 also faces -Z). */
function sectorArrow(sector: number): number {
  const yaw = (sector * Math.PI * 2) / STAGE02.pulse.sectors;
  return -(yaw - input.yaw) * (180 / Math.PI); // degrees, clockwise on screen
}

export function HuntPanel({ room }: { room: TrialRoom }) {
  const me = room.hunt;
  const pub = room.round.hunt;
  if (!me || !pub || room.round.phase !== 'active') return null;
  if (me.captured) {
    return (
      <div className="spectator" data-testid="captured-spectating">
        <span className="tag out">Caught</span> Watching <b>{hud.spectating || 'the hunt'}</b> · <kbd>Tab</kbd> switch · you are back in the next stage with your points
      </div>
    );
  }
  if (me.role === 'hunter') {
    const ready = pub.released && me.pulseCd <= 0;
    const fresh = me.pulse && room.time - me.pulse.at < 4;
    return (
      <div className="hunt-panel hunter" data-testid="hunter-panel">
        <div className={`pulse${ready ? ' ready' : ''}`} data-testid="pulse">
          <span className="eyebrow">Pulse Detector <kbd>Q</kbd></span>
          <div className="pulse-body">
            <div className="pulse-dial" style={{ ['--cd' as string]: `${ready ? 1 : 1 - Math.min(1, me.pulseCd / STAGE02.pulse.cooldownS)}` }}>
              {fresh && me.pulse!.sector >= 0
                ? <i className="pulse-arrow" style={{ transform: `rotate(${sectorArrow(me.pulse!.sector)}deg)` }} aria-hidden="true">▲</i>
                : <i className="pulse-dot" aria-hidden="true" />}
            </div>
            <div>
              <div className="bars" aria-label={fresh ? STRENGTH[me.pulse!.strength] : 'No reading'}>
                {[1, 2, 3].map((n) => <i key={n} className={fresh && me.pulse!.strength >= n ? 'on' : ''} />)}
              </div>
              <span className="pulse-text">{!pub.released ? 'Locked until the gates open' : ready ? 'Ready' : fresh ? STRENGTH[me.pulse!.strength] : `${Math.ceil(me.pulseCd)} s`}</span>
            </div>
          </div>
        </div>
        <div className="caps"><span className="eyebrow">Captures</span><b className="num" data-testid="captures">{me.captures}</b><small>{me.captures >= 2 ? '+2 points (max)' : me.captures === 1 ? '+1 point' : 'Hold E close to a hider'}</small></div>
        {me.capture > 0 && <div className="capture-ring" style={{ ['--p' as string]: me.capture }} data-testid="capture-progress"><span>Capturing</span></div>}
        <Sprint cd={me.sprintCd} left={me.sprintLeft} />
      </div>
    );
  }
  return (
    <div className="hunt-panel hider" data-testid="hider-panel">
      {me.threat > 0 && <div className={`threat t${me.threat}`} data-testid="threat">{me.threat === 2 ? 'DANGER · a hunter is very close' : 'A hunter is nearby'}</div>}
      <div className="hide-state" data-testid="hide-state">
        <span className="eyebrow">Hiding <kbd>E</kbd></span>
        {me.hide ? <b>Hidden · {Math.ceil(me.hideLeft)} s left <small>E to leave</small></b>
          : me.hideCd > 0 ? <b className="muted">Can hide again in {Math.ceil(me.hideCd)} s</b>
          : <b className="muted">Stand on a yellow mark at a locker, crate, container or tarp</b>}
      </div>
      <div className="caps"><span className="eyebrow">Status</span><b>{pub.released ? 'Free' : 'Run and hide'}</b><small>Survive to the end: +2 points</small></div>
      <Sprint cd={me.sprintCd} left={me.sprintLeft} />
    </div>
  );
}

function Sprint({ cd, left }: { cd: number; left: number }) {
  return <div className="sprint"><span className="eyebrow">Sprint <kbd>Shift</kbd></span><b className="num">{left > 0 ? 'GO' : cd > 0 ? `${Math.ceil(cd)} s` : 'Ready'}</b><small><kbd>C</kbd> crouch</small></div>;
}

export function HuntBriefingRole({ room }: { room: TrialRoom }) {
  const me = room.hunt;
  if (!me) return <p className="muted">You joined mid-stage: you watch this one and play the next.</p>;
  return me.role === 'hunter'
    ? <p className="role-line hunter" data-testid="briefing-role"><b>You are a HUNTER.</b> Wait 15 s behind the gate, then find the hiders. Q pulses the detector (direction and strength only); hold E close to a hider, facing them, for 1 s. 1 capture = 1 point, 2 or more = 2.</p>
    : <p className="role-line hider" data-testid="briefing-role"><b>You are a HIDER.</b> You have a 15 s head start. E hides you for up to 10 s in a locker, crate, container or tarp (15 s cooldown). Shift sprints, C crouches. Survive to the end: 2 points.</p>;
}

/** Feed text for a capture event. */
export function captureText(room: TrialRoom, id: string, by?: string): string {
  const v = room.players.get(id)?.name ?? 'A hider';
  const h = by ? room.players.get(by)?.name ?? 'a hunter' : 'a hunter';
  return `${v} was caught by ${h}`;
}
