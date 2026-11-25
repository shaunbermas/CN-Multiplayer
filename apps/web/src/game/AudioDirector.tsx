// Plays the game's sound cues from the room state (second pass, decision 034 B). Sound is presentation only:
// it reads the same signal schedule and events the HUD shows and never affects the simulation.
import { useEffect } from 'react';
import type { TrialRoom } from '../net.ts';
import { signalView } from './roundClock.ts';
import { audioState, bindAudioUnlock, setHeartbeat, sfx, startAmbience, startHeartbeat, startScan, stopAmbience, stopHeartbeat, stopScan, toggleMute } from './audio.ts';

export function AudioDirector({ room }: { room: TrialRoom }) {
  useEffect(() => {
    bindAudioUnlock();
    (window as unknown as { __cnAudio?: () => unknown }).__cnAudio = audioState;
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT' || e.repeat) return;
      if (e.code === 'KeyM') toggleMute();
    };
    window.addEventListener('keydown', onKey);

    let phase = room.round.phase;
    let signal = 'none';
    let count = -1;
    let lastEventAt = Date.now();
    let lastOther = 0;
    let released = false, pulseN = -1, wasHidden = false;
    const tick = () => {
      startAmbience(); // no-op until sound is allowed and unmuted, or once running
      const r = room.round;
      // Countdown 3, 2, 1, then GO when the round starts.
      if (r.phase === 'countdown') {
        const n = Math.max(1, Math.ceil(room.remaining()));
        if (n !== count) { count = n; sfx.count(n); }
      }
      if (r.phase !== phase) {
        if (phase === 'countdown' && r.phase === 'active') sfx.count(0);
        if (phase === 'active') { stopScan(); stopHeartbeat(); signal = 'none'; released = false; pulseN = -1; wasHidden = false; }
        if (r.phase === 'results') sfx.stageEnd();
        if (r.phase !== 'countdown') count = -1;
        phase = r.phase;
      }
      if (r.phase === 'active' && r.hunt) {
        // Stage 02: heartbeat follows the hider's threat level; the hunter's is steady. Gates, pulses, hiding.
        startHeartbeat();
        const h = room.hunt;
        if (!h || h.captured) setHeartbeat(64, 0.25);
        else if (h.role === 'hider') setHeartbeat(h.threat === 2 ? 160 : h.threat === 1 ? 128 : 92, h.threat ? 0.9 : 0.4);
        else setHeartbeat(100, 0.35);
        if (r.hunt.released && !released) sfx.gates();
        released = r.hunt.released;
        if (h?.pulse && h.pulse.n !== pulseN) { sfx.pulse(h.pulse.strength); pulseN = h.pulse.n; }
        const hidden = !!h?.hide;
        if (hidden !== wasHidden) { sfx.hide(); wasHidden = hidden; }
      } else if (r.phase === 'active') {
        // Heartbeat (decision 037): races on green while you are still in it, pounds on red; calm once you are out.
        startHeartbeat();
        const me = room.self;
        const sv = signalView(room);
        const out = me && me.status !== 'active';
        if (out) setHeartbeat(64, 0.25);
        else if (sv.signal === 'red') setHeartbeat(150, 1);
        else setHeartbeat(118 + 30 * Math.min(1, room.round.elapsed / 60), 0.6);
        const s = sv.signal;
        if (s !== signal) {
          const first = signal === 'none';
          if (s === 'green' && !first) sfx.green(); // the first green is covered by the GO beep
          if (s === 'warning') sfx.warning();
          if (s === 'red') { sfx.red(); startScan(); }
          if (s !== 'red') stopScan();
          signal = s;
        }
      }
      // Spotted, finished and collision events (newest first in no particular order: walk them all).
      const now = Date.now();
      for (const e of room.events) {
        if (e.at <= lastEventAt) continue;
        const mine = e.id === room.id || e.other === room.id;
        if (e.kind === 'spotted') {
          if (e.id === room.id) sfx.spottedMe();
          else if (now - lastOther > 150) { sfx.spottedOther(); lastOther = now; }
        } else if (e.kind === 'finished') {
          if (e.id === room.id) sfx.finishMe();
          else if (now - lastOther > 150) { sfx.finishOther(); lastOther = now; }
        } else if (e.kind === 'captured') {
          if (e.id === room.id) sfx.caught();
          else if (e.other === room.id) sfx.captureMade();
          else if (now - lastOther > 150) { sfx.spottedOther(); lastOther = now; }
        } else if (e.kind === 'collision') {
          if (mine) sfx.bump(true);
          else if (now - lastOther > 150) { sfx.bump(false); lastOther = now; }
        }
      }
      for (const e of room.events) if (e.at > lastEventAt) lastEventAt = e.at;
    };
    const t = setInterval(tick, 40);
    return () => {
      clearInterval(t);
      window.removeEventListener('keydown', onKey);
      stopScan();
      stopHeartbeat();
      stopAmbience();
    };
  }, [room]);
  return null;
}
