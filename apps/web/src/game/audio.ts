// CN TRIAL audio (second pass, decision 034 B). Every sound is synthesised in the browser with the Web Audio
// API: no audio files, no downloads, nothing to license, nothing in Git LFS. The palette follows the game's tone
// (decision 008: light suspense and comedy, no horror): toy-like chimes for green, a wind-up tick for the
// warning, a low mechanical "bwomp" and servo whir when The Watcher turns, a slide-whistle when you are
// spotted, and a little fanfare when you finish. A soft night-yard ambience sits underneath.
//
// Browsers only allow sound after the player interacts with the page, so the engine starts on the first click
// or key press. Mute and volume live in the player settings (localStorage), and M toggles mute in a game.
import { settings, updateSettings } from '../ui/settings.ts';

type Bus = 'sfx' | 'ui' | 'amb';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
const buses: Partial<Record<Bus, GainNode>> = {};
let noiseBuf: AudioBuffer | null = null;
let ambience: { stop: () => void } | null = null;
let scanLoop: { stop: () => void } | null = null;
/** Calls made before the engine could start are dropped (never queued into a burst). */
let unlockBound = false;

const BUS_LEVEL: Record<Bus, number> = { sfx: 0.9, ui: 0.5, amb: 0.35 };

function engine(): AudioContext | null {
  if (ctx) return ctx;
  const AC = (globalThis as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext
    ?? (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  try { ctx = new AC({ latencyHint: 'interactive' }); } catch { return null; }
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14; comp.knee.value = 12; comp.ratio.value = 4;
  master = ctx.createGain();
  master.connect(comp).connect(ctx.destination);
  for (const b of Object.keys(BUS_LEVEL) as Bus[]) {
    const g = ctx.createGain();
    g.gain.value = BUS_LEVEL[b];
    g.connect(master);
    buses[b] = g;
  }
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  let seed = 1234567;
  for (let i = 0; i < d.length; i++) { seed = (seed * 1103515245 + 12345) & 0x7fffffff; d[i] = (seed / 0x3fffffff) - 1; }
  applyVolume();
  return ctx;
}

/** Master level from the settings (muted = silent). */
export function applyVolume(): void {
  if (!ctx || !master) return;
  const v = settings.muted ? 0 : settings.volume;
  master.gain.setTargetAtTime(v * v, ctx.currentTime, 0.03); // perceptual curve
}

export function isMuted(): boolean { return settings.muted; }
export function setMuted(m: boolean): void { updateSettings({ muted: m }); applyVolume(); }
export function toggleMute(): void { setMuted(!settings.muted); }

/** Start the engine on the first interaction (browser autoplay rule). Safe to call more than once. */
export function bindAudioUnlock(): void {
  if (unlockBound || typeof window === 'undefined') return;
  unlockBound = true;
  const unlock = () => {
    const c = engine();
    if (c && c.state !== 'running') void c.resume();
  };
  window.addEventListener('pointerdown', unlock, { capture: true });
  window.addEventListener('keydown', unlock, { capture: true });
  // A tiny click on every button, menus included.
  window.addEventListener('click', (e) => {
    const el = (e.target as HTMLElement | null)?.closest?.('button');
    if (el && !(el as HTMLButtonElement).disabled) sfx.uiClick();
  }, { capture: true });
}

function ready(): AudioContext | null {
  return ctx && ctx.state === 'running' && !settings.muted ? ctx : null;
}

interface ToneOpts { type?: OscillatorType; gain?: number; to?: number; attack?: number; bus?: Bus; vibrato?: number; filter?: number }

/** One enveloped oscillator note. `at` is seconds from now. */
function tone(freq: number, at: number, dur: number, o: ToneOpts = {}): void {
  const c = ready(); if (!c) return;
  const t = c.currentTime + at;
  const osc = c.createOscillator();
  osc.type = o.type ?? 'triangle';
  osc.frequency.setValueAtTime(freq, t);
  if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t + dur);
  const g = c.createGain();
  const peak = o.gain ?? 0.3;
  const atk = o.attack ?? 0.008;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + atk);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  let node: AudioNode = osc;
  if (o.filter) {
    const f = c.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = o.filter;
    node.connect(f); node = f;
  }
  node.connect(g).connect(buses[o.bus ?? 'sfx']!);
  if (o.vibrato) {
    const lfo = c.createOscillator(); const lg = c.createGain();
    lfo.frequency.value = 7; lg.gain.value = o.vibrato;
    lfo.connect(lg).connect(osc.frequency);
    lfo.start(t); lfo.stop(t + dur + 0.05);
  }
  osc.start(t); osc.stop(t + dur + 0.05);
}

interface NoiseOpts { type?: BiquadFilterType; freq?: number; to?: number; q?: number; gain?: number; bus?: Bus; attack?: number }

/** A filtered burst of noise (footsteps, servo whir, thumps). */
function noise(at: number, dur: number, o: NoiseOpts = {}): void {
  const c = ready(); if (!c || !noiseBuf) return;
  const t = c.currentTime + at;
  const src = c.createBufferSource();
  src.buffer = noiseBuf;
  src.playbackRate.value = 0.9 + Math.random() * 0.2;
  const f = c.createBiquadFilter();
  f.type = o.type ?? 'lowpass';
  f.frequency.setValueAtTime(o.freq ?? 800, t);
  if (o.to) f.frequency.exponentialRampToValueAtTime(o.to, t + dur);
  f.Q.value = o.q ?? 0.8;
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(o.gain ?? 0.2, t + (o.attack ?? 0.005));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(buses[o.bus ?? 'sfx']!);
  src.start(t, Math.random() * Math.max(0, 1.9 - dur)); src.stop(t + dur + 0.05);
}

const N = { C5: 523.25, D5: 587.33, E5: 659.25, G5: 783.99, A5: 880, C6: 1046.5, E6: 1318.5, G4: 392, A4: 440, E4: 329.63 };

export const sfx = {
  /** GREEN LIGHT: a bright toy-xylophone run up. */
  green(): void {
    tone(N.C5, 0, 0.22, { gain: 0.28 });
    tone(N.E5, 0.08, 0.22, { gain: 0.28 });
    tone(N.G5, 0.16, 0.4, { gain: 0.32 });
    tone(N.C6, 0.16, 0.4, { gain: 0.1, type: 'sine' });
  },
  /** GET READY: a wind-up toy's tick-tock, quickening. */
  warning(): void {
    for (let i = 0; i < 4; i++) {
      const at = [0, 0.24, 0.42, 0.56][i];
      noise(at, 0.05, { type: 'bandpass', freq: i % 2 ? 2600 : 1900, q: 6, gain: 0.35 });
      tone(i % 2 ? N.E5 : N.A4, at, 0.08, { type: 'square', gain: 0.05, filter: 2400 });
    }
  },
  /** RED LIGHT: a low cartoon "bwomp" and The Watcher's servo whir as it turns. */
  red(): void {
    tone(220, 0, 0.55, { type: 'sawtooth', to: 98, gain: 0.22, filter: 900 });
    tone(110, 0, 0.6, { type: 'sine', to: 55, gain: 0.25 });
    noise(0.05, 0.75, { type: 'bandpass', freq: 380, to: 1500, q: 4, gain: 0.12, attack: 0.08 });
  },
  /** Spotted (you): a comedic slide-whistle down and a "boop". */
  spottedMe(): void {
    tone(1100, 0, 0.75, { type: 'sine', to: 260, gain: 0.3, vibrato: 18 });
    tone(196, 0.78, 0.25, { type: 'square', gain: 0.12, filter: 700 });
  },
  /** Somebody else spotted: a small descending blip. */
  spottedOther(): void {
    tone(660, 0, 0.18, { type: 'sine', to: 330, gain: 0.1 });
  },
  /** You finished: a short fanfare. */
  finishMe(): void {
    const notes = [N.C5, N.E5, N.G5, N.C6];
    notes.forEach((f, i) => tone(f, i * 0.09, 0.3, { gain: 0.26 }));
    tone(N.C6, 0.36, 0.7, { gain: 0.22, type: 'triangle' });
    tone(N.E6, 0.36, 0.7, { gain: 0.1, type: 'sine' });
    noise(0.36, 0.6, { type: 'highpass', freq: 6000, gain: 0.05 });
  },
  /** Somebody else finished: a soft chime. */
  finishOther(): void {
    tone(N.G5, 0, 0.3, { type: 'sine', gain: 0.08 });
    tone(N.C6, 0.06, 0.35, { type: 'sine', gain: 0.06 });
  },
  /** Countdown beep (3, 2, 1) and GO. */
  count(n: number): void {
    if (n > 0) tone(N.A4 * 1.5, 0, 0.16, { type: 'square', gain: 0.1, filter: 2200 });
    else { tone(N.A5, 0, 0.45, { type: 'square', gain: 0.12, filter: 2600 }); tone(N.C6, 0, 0.45, { type: 'triangle', gain: 0.12 }); }
  },
  /** Collision knock-down: a rubbery boing and a thump. */
  bump(near: boolean): void {
    const g = near ? 1 : 0.35;
    tone(320, 0, 0.35, { type: 'sine', to: 120, gain: 0.25 * g, vibrato: 25 });
    noise(0, 0.12, { freq: 300, gain: 0.25 * g });
  },
  /** One footstep on wet concrete. */
  footstep(): void {
    noise(0, 0.07, { type: 'bandpass', freq: 700 + Math.random() * 400, q: 1.2, gain: 0.07 });
  },
  /** End of a stage. */
  stageEnd(): void {
    tone(N.G4, 0, 0.2, { gain: 0.2 }); tone(N.C5, 0.12, 0.2, { gain: 0.2 }); tone(N.E5, 0.24, 0.5, { gain: 0.22 });
  },
  uiClick(): void {
    tone(1500, 0, 0.04, { type: 'sine', gain: 0.06, bus: 'ui' });
  },
};

/** A slow, quiet hum while The Watcher scans (red light). */
export function startScan(): void {
  const c = ready(); if (!c || scanLoop) return;
  const osc = c.createOscillator(); osc.type = 'sine'; osc.frequency.value = 174;
  const osc2 = c.createOscillator(); osc2.type = 'sine'; osc2.frequency.value = 176.5; // gentle beating
  const g = c.createGain(); g.gain.value = 0.0001;
  g.gain.exponentialRampToValueAtTime(0.05, c.currentTime + 0.6);
  osc.connect(g); osc2.connect(g); g.connect(buses.sfx!);
  osc.start(); osc2.start();
  scanLoop = {
    stop: () => {
      const t = c.currentTime;
      g.gain.cancelScheduledValues(t); g.gain.setTargetAtTime(0.0001, t, 0.08);
      osc.stop(t + 0.5); osc2.stop(t + 0.5);
    },
  };
}
export function stopScan(): void { scanLoop?.stop(); scanLoop = null; }

/** Night-yard ambience: a breeze and a distant floodlight hum, very quiet. */
export function startAmbience(): void {
  const c = ready(); if (!c || ambience || !noiseBuf) return;
  const src = c.createBufferSource(); src.buffer = noiseBuf; src.loop = true; src.playbackRate.value = 0.5;
  const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 420; f.Q.value = 0.5;
  const g = c.createGain(); g.gain.value = 0.0001;
  const lfo = c.createOscillator(); lfo.frequency.value = 0.09;
  const lg = c.createGain(); lg.gain.value = 0.04;
  lfo.connect(lg).connect(g.gain);
  const hum = c.createOscillator(); hum.type = 'sine'; hum.frequency.value = 60;
  const hg = c.createGain(); hg.gain.value = 0.012;
  src.connect(f).connect(g).connect(buses.amb!);
  hum.connect(hg).connect(buses.amb!);
  g.gain.exponentialRampToValueAtTime(0.08, c.currentTime + 2);
  src.start(); lfo.start(); hum.start();
  ambience = {
    stop: () => {
      const t = c.currentTime;
      g.gain.cancelScheduledValues(t); g.gain.setTargetAtTime(0.0001, t, 0.3);
      hg.gain.setTargetAtTime(0.0001, t, 0.3);
      src.stop(t + 1.5); lfo.stop(t + 1.5); hum.stop(t + 1.5);
    },
  };
}
export function stopAmbience(): void { ambience?.stop(); ambience = null; }

/** For tests (window.__cnAudio): engine state without exposing nodes. */
export function audioState(): { state: string; muted: boolean; volume: number; ambience: boolean; scanning: boolean } {
  return { state: ctx?.state ?? 'none', muted: settings.muted, volume: settings.volume, ambience: !!ambience, scanning: !!scanLoop };
}
