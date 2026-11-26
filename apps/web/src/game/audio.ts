// CN TRIAL audio. Every sound is synthesised in the browser with the Web Audio API: no audio files, no
// downloads, nothing to license, nothing in Git LFS.
//
// Third pass (decision 037, owner 25 Nov 2026: "too cute and not scary... nightmare sound like a thriller
// feeling that they need to rush for survival"). The toy chimes and slide-whistle are gone. The palette is now
// a thriller score made from a few synth building blocks:
//   - under everything, a low detuned drone with wind and the odd distant metal creak (the yard at night);
//   - during a stage, a heartbeat that races on green (rush) and pounds on red (hold still);
//   - GREEN: a low, dirty horn stab; RED: a "braaam" with a metal screech as The Watcher whips round,
//     then a dissonant tremolo while it scans;
//   - spotted: a heavy impact and a sinking tone; finishing: relief, a low swell that resolves.
// A generated reverb gives everything a big, empty space. Sound only: no screams, no gore (decision 008).
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
let heart: { stop: () => void; set: (bpm: number, level: number) => void } | null = null;
let reverb: ConvolverNode | null = null;
let shaper: WaveShaperNode | null = null;
/** Calls made before the engine could start are dropped (never queued into a burst). */
let unlockBound = false;

const BUS_LEVEL: Record<Bus, number> = { sfx: 0.9, ui: 0.45, amb: 0.5 };

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
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  let seed = 1234567;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return (seed / 0x3fffffff) - 1; };
  for (let i = 0; i < d.length; i++) d[i] = rnd();
  // A big, dark hall: 3.2 s of decaying, low-passed noise as the impulse response.
  const len = Math.floor(ctx.sampleRate * 3.2);
  const ir = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const o = ir.getChannelData(ch); let lp = 0;
    for (let i = 0; i < len; i++) { lp += (rnd() - lp) * 0.35; o[i] = lp * Math.pow(1 - i / len, 2.6); }
  }
  reverb = ctx.createConvolver(); reverb.buffer = ir;
  const wet = ctx.createGain(); wet.gain.value = 0.55;
  reverb.connect(wet).connect(master);
  // Soft-clip curve for dirty, overdriven tones (horn, braaam).
  shaper = ctx.createWaveShaper();
  const curve = new Float32Array(1024);
  for (let i = 0; i < curve.length; i++) { const x = (i / (curve.length - 1)) * 2 - 1; curve[i] = Math.tanh(x * 3.5); }
  shaper.curve = curve;
  for (const b of Object.keys(BUS_LEVEL) as Bus[]) {
    const g = ctx.createGain();
    g.gain.value = BUS_LEVEL[b];
    g.connect(master);
    if (b !== 'ui') { const send = ctx.createGain(); send.gain.value = b === 'amb' ? 0.5 : 0.35; g.connect(send).connect(reverb); }
    buses[b] = g;
  }
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

interface ToneOpts { type?: OscillatorType; gain?: number; to?: number; attack?: number; bus?: Bus; vibrato?: number; vibratoHz?: number; filter?: number; filterTo?: number; distort?: boolean; detune?: number }

/** One enveloped oscillator note. `at` is seconds from now. */
function tone(freq: number, at: number, dur: number, o: ToneOpts = {}): void {
  const c = ready(); if (!c) return;
  const t = c.currentTime + at;
  const osc = c.createOscillator();
  osc.type = o.type ?? 'triangle';
  osc.frequency.setValueAtTime(freq, t);
  if (o.detune) osc.detune.value = o.detune;
  if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t + dur);
  const g = c.createGain();
  const peak = o.gain ?? 0.3;
  const atk = o.attack ?? 0.008;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + atk);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  let node: AudioNode = osc;
  if (o.distort && shaper) {
    const pre = c.createGain(); pre.gain.value = 1;
    const ws = c.createWaveShaper(); ws.curve = shaper.curve;
    node.connect(pre).connect(ws); node = ws;
  }
  if (o.filter) {
    const f = c.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.setValueAtTime(o.filter, t);
    if (o.filterTo) f.frequency.exponentialRampToValueAtTime(o.filterTo, t + dur);
    node.connect(f); node = f;
  }
  node.connect(g).connect(buses[o.bus ?? 'sfx']!);
  if (o.vibrato) {
    const lfo = c.createOscillator(); const lg = c.createGain();
    lfo.frequency.value = o.vibratoHz ?? 7; lg.gain.value = o.vibrato;
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

/** A minor-key cluster, low. */
const LOW = { A1: 55, Bb1: 58.27, C2: 65.41, D2: 73.42, E2: 82.41, F2: 87.31, A2: 110, Bb2: 116.54, E3: 164.81, F3: 174.61 };

/** A sub-heavy impact: a pitch-dropping sine thump plus a noise crack. */
function impact(at: number, size: number, bus: Bus = 'sfx'): void {
  tone(90, at, 0.6 * size + 0.2, { type: 'sine', to: 32, gain: 0.55 * size, attack: 0.003, bus });
  noise(at, 0.25 + 0.2 * size, { type: 'lowpass', freq: 2400, to: 180, gain: 0.35 * size, bus });
}

export const sfx = {
  /** GREEN LIGHT: a short, dirty low horn: go, now. */
  green(): void {
    tone(LOW.D2, 0, 0.7, { type: 'sawtooth', gain: 0.2, filter: 1400, filterTo: 300, distort: true, attack: 0.02 });
    tone(LOW.D2 * 1.5, 0, 0.7, { type: 'sawtooth', gain: 0.1, filter: 1200, filterTo: 300, detune: 8, attack: 0.02 });
    noise(0, 0.12, { type: 'bandpass', freq: 900, q: 2, gain: 0.12 });
  },
  /** Old rooms only (decision 037 removed the warning): a single ticking clock. */
  warning(): void {
    noise(0, 0.04, { type: 'bandpass', freq: 2200, q: 8, gain: 0.25 });
  },
  /** RED LIGHT: The Watcher whips round. A metal screech, then a distorted "braaam" with a sub hit. */
  red(): void {
    noise(0, 0.45, { type: 'bandpass', freq: 5200, to: 1900, q: 9, gain: 0.22, attack: 0.01 });
    tone(2300, 0, 0.4, { type: 'sawtooth', to: 1400, gain: 0.05, filter: 4000, vibrato: 60, vibratoHz: 31 });
    impact(0.06, 1);
    for (const [f, d] of [[LOW.A1, 0], [LOW.Bb1, 5], [LOW.E2, -6], [LOW.A2, 4]] as const) {
      tone(f, 0.06, 2.2, { type: 'sawtooth', gain: 0.16, filter: 900, filterTo: 160, distort: true, detune: d, attack: 0.04 });
    }
  },
  /** Spotted (you): a heavy hit, a ringing high tone and a long sinking drone. */
  spottedMe(): void {
    impact(0, 1.3);
    tone(LOW.F3 * 8, 0.02, 1.6, { type: 'sine', gain: 0.07, vibrato: 9, vibratoHz: 5 });
    tone(LOW.A2, 0.05, 2.8, { type: 'sawtooth', to: LOW.A1 / 2, gain: 0.18, filter: 700, filterTo: 120, distort: true });
    tone(LOW.Bb2, 0.05, 2.8, { type: 'sawtooth', to: LOW.Bb1 / 2, gain: 0.12, filter: 700, filterTo: 120 });
  },
  /** Somebody else spotted: a distant thud and a short dissonant sting. */
  spottedOther(): void {
    impact(0, 0.45);
    tone(LOW.E3 * 4, 0.02, 0.5, { type: 'sine', gain: 0.04 });
    tone(LOW.F3 * 4, 0.02, 0.5, { type: 'sine', gain: 0.04 });
  },
  /** You finished: relief. The drone lifts into an open fifth and fades. */
  finishMe(): void {
    tone(LOW.D2 * 2, 0, 2.6, { type: 'sawtooth', gain: 0.1, filter: 600, filterTo: 2200, attack: 0.5 });
    tone(LOW.D2 * 3, 0.1, 2.5, { type: 'triangle', gain: 0.12, attack: 0.5 });
    tone(LOW.D2 * 4, 0.2, 2.4, { type: 'sine', gain: 0.1, attack: 0.6 });
    noise(0, 1.2, { type: 'highpass', freq: 3000, to: 8000, gain: 0.04, attack: 0.4 });
  },
  /** Somebody else finished: one low, far-off bell. */
  finishOther(): void {
    tone(LOW.D2 * 4, 0, 1.4, { type: 'sine', gain: 0.07 });
    tone(LOW.D2 * 4 * 2.76, 0, 0.9, { type: 'sine', gain: 0.025 });
  },
  /** Countdown: a heavy clock tick (3, 2, 1), then GO as a dirty horn with an impact. */
  count(n: number): void {
    if (n > 0) {
      noise(0, 0.05, { type: 'bandpass', freq: 1700, q: 7, gain: 0.35 });
      tone(LOW.A1 * 2, 0, 0.35, { type: 'sine', to: LOW.A1, gain: 0.3 });
    } else {
      impact(0, 0.9);
      sfx.green();
    }
  },
  /** Collision knock-down: a dull body thud. */
  bump(near: boolean): void {
    const g = near ? 1 : 0.35;
    tone(140, 0, 0.25, { type: 'sine', to: 50, gain: 0.35 * g });
    noise(0, 0.14, { freq: 500, to: 120, gain: 0.3 * g });
  },
  /** One footstep on wet concrete. */
  footstep(): void {
    noise(0, 0.08, { type: 'bandpass', freq: 420 + Math.random() * 260, q: 1.4, gain: 0.08 });
  },
  /** End of a stage: a low gong. */
  stageEnd(): void {
    tone(LOW.A1, 0, 3, { type: 'sine', gain: 0.35, attack: 0.005 });
    tone(LOW.A1 * 2.4, 0, 2.2, { type: 'sine', gain: 0.1 });
    tone(LOW.A1 * 3.9, 0, 1.4, { type: 'sine', gain: 0.05 });
  },
  // ---- Stage 03 · The Hunt (same synth, same thriller palette)
  /** Pulse Detector: a rising charge, then a sonar ping whose pitch and repeats follow the signal strength. */
  pulse(strength: number): void {
    tone(220, 0, 0.35, { type: 'sine', to: 880, gain: 0.08, attack: 0.2 });
    for (let i = 0; i < Math.max(1, strength); i++) tone(strength ? 520 + strength * 140 : 300, 0.38 + i * 0.16, 0.5, { type: 'sine', gain: strength ? 0.16 : 0.07, vibrato: 4, vibratoHz: 9 });
    if (!strength) noise(0.38, 0.4, { type: 'bandpass', freq: 900, q: 3, gain: 0.05 });
  },
  /** The gates open: a heavy metal shutter and a low klaxon. */
  gates(): void {
    noise(0, 1.2, { type: 'lowpass', freq: 900, to: 200, gain: 0.3, attack: 0.05 });
    tone(LOW.E2, 0.1, 1.4, { type: 'sawtooth', gain: 0.18, filter: 900, filterTo: 300, distort: true });
    tone(LOW.F2, 0.1, 1.4, { type: 'sawtooth', gain: 0.12, filter: 900, filterTo: 300 });
  },
  /** Locker / crate door: a short metal thunk. */
  hide(): void {
    tone(160, 0, 0.18, { type: 'square', to: 90, gain: 0.12, filter: 900 });
    noise(0, 0.1, { type: 'bandpass', freq: 1300, q: 3, gain: 0.12 });
  },
  /** Captured (you): the same heavy hit as being spotted. Caught someone: a hard metal clamp. */
  caught(): void { sfx.spottedMe(); },
  captureMade(): void { impact(0, 0.7); tone(LOW.A2 * 2, 0.02, 0.6, { type: 'square', gain: 0.06, filter: 1600 }); },
  // ---- Stage 02 · Agawan Base: the thriller palette with a light Christmas bell motif (owner, 25 Nov 2026)
  /** A small church-bell strike: a sine with the inharmonic partials of a bell. */
  bell(freq: number, at = 0, gain = 0.12): void {
    tone(freq, at, 2.2, { type: 'sine', gain, attack: 0.003 });
    tone(freq * 2.0, at, 1.4, { type: 'sine', gain: gain * 0.45, attack: 0.003 });
    tone(freq * 2.76, at, 0.9, { type: 'sine', gain: gain * 0.25, attack: 0.003 });
    tone(freq * 5.4, at, 0.4, { type: 'sine', gain: gain * 0.12, attack: 0.002 });
  },
  /** Sleigh bells: a few bright jingles. */
  jingle(at = 0, n = 4, gain = 0.06): void {
    for (let i = 0; i < n; i++) noise(at + i * 0.07 + Math.random() * 0.02, 0.09, { type: 'highpass', freq: 6500, gain, q: 1.2 });
  },
  /** The motif: four descending bell notes in a minor key over a soft jingle (match start and now and then). */
  bellMotif(gain = 0.09): void {
    const notes = [880, 784, 659.25, 587.33];
    notes.forEach((f, i) => sfx.bell(f, i * 0.32, gain));
    sfx.jingle(0, 6, gain * 0.5);
  },
  /** You tagged a rival: a sharp tap and a bright ping. */
  agTagMade(): void { noise(0, 0.05, { type: 'bandpass', freq: 2600, q: 4, gain: 0.25 }); tone(1046.5, 0.02, 0.35, { type: 'triangle', gain: 0.12 }); },
  /** You were tagged: a lighter version of the spotted hit and a falling tone (no doom: it's a playground game). */
  agTagged(): void { impact(0, 0.7); tone(LOW.A2 * 4, 0.02, 0.9, { type: 'triangle', to: LOW.A2 * 2, gain: 0.1 }); },
  /** Someone else was tagged: a soft distant tap. */
  agTagOther(): void { noise(0, 0.04, { type: 'bandpass', freq: 1800, q: 5, gain: 0.08 }); },
  /** A rescue (you were freed or freed someone): rising bells. */
  agRescue(near: boolean): void { const g = near ? 0.11 : 0.04; [659.25, 783.99, 987.77].forEach((f, i) => sfx.bell(f, i * 0.09, g)); if (near) sfx.jingle(0.1, 4, 0.05); },
  /** Base raid: ours = bell chord and jingle; against us = a low alarm horn; others = one far bell. */
  agRaid(kind: 'ours' | 'against' | 'other'): void {
    if (kind === 'ours') { impact(0, 0.6); [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => sfx.bell(f, i * 0.05, 0.12)); sfx.jingle(0.05, 8, 0.07); }
    else if (kind === 'against') { tone(LOW.E2, 0, 1.2, { type: 'sawtooth', gain: 0.2, filter: 1100, filterTo: 300, distort: true }); tone(LOW.F2, 0, 1.2, { type: 'sawtooth', gain: 0.12, filter: 1100, filterTo: 300 }); sfx.bell(440, 0.05, 0.08); }
    else sfx.bell(392, 0, 0.07);
  },
  uiClick(): void {
    noise(0, 0.03, { type: 'bandpass', freq: 1400, q: 5, gain: 0.12, bus: 'ui' });
  },
};

/** While The Watcher scans (red light): a tense, dissonant tremolo over a rumble. */
export function startScan(): void {
  const c = ready(); if (!c || scanLoop) return;
  const t0 = c.currentTime;
  const g = c.createGain(); g.gain.value = 0.0001;
  g.gain.exponentialRampToValueAtTime(0.09, t0 + 0.5);
  const trem = c.createGain(); trem.gain.value = 0.5;
  const lfo = c.createOscillator(); lfo.frequency.value = 9;
  const lg = c.createGain(); lg.gain.value = 0.5;
  lfo.connect(lg).connect(trem.gain);
  const oscs = [LOW.E3 * 4, LOW.F3 * 4, LOW.A1 * 16 * 1.06].map((f, i) => {
    const o = c.createOscillator(); o.type = i === 2 ? 'sine' : 'sawtooth'; o.frequency.value = f;
    o.detune.value = (i - 1) * 7; return o;
  });
  const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 2600;
  for (const o of oscs) o.connect(f);
  f.connect(trem).connect(g);
  const rumble = c.createOscillator(); rumble.type = 'sine'; rumble.frequency.value = 38;
  const rg = c.createGain(); rg.gain.value = 0.25;
  rumble.connect(rg).connect(g);
  g.connect(buses.sfx!);
  for (const o of [...oscs, lfo, rumble]) o.start();
  scanLoop = {
    stop: () => {
      const t = c.currentTime;
      g.gain.cancelScheduledValues(t); g.gain.setTargetAtTime(0.0001, t, 0.06);
      for (const o of [...oscs, lfo, rumble]) o.stop(t + 0.5);
    },
  };
}
export function stopScan(): void { scanLoop?.stop(); scanLoop = null; }

/**
 * Heartbeat during a stage: lub-dub thumps scheduled a little ahead. `set` changes the pace and loudness, so
 * green can race (rush) and red can pound (hold still). Stops with the stage.
 */
export function startHeartbeat(): void {
  const c = ready(); if (!c || heart) return;
  let bpm = 110, level = 0.5, next = c.currentTime + 0.1, alive = true;
  const beat = (at: number) => {
    const dt = at - c.currentTime;
    tone(62, dt, 0.18, { type: 'sine', to: 38, gain: 0.5 * level, attack: 0.004, bus: 'amb' });
    tone(58, dt + 0.17, 0.16, { type: 'sine', to: 36, gain: 0.32 * level, attack: 0.004, bus: 'amb' });
  };
  const timer = setInterval(() => {
    if (!alive || !ready()) return;
    while (next < c.currentTime + 0.25) { beat(next); next += 60 / bpm; }
    if (next < c.currentTime) next = c.currentTime + 0.05;
  }, 50);
  heart = {
    set: (b, l) => { bpm = b; level = l; },
    stop: () => { alive = false; clearInterval(timer); },
  };
}
export function setHeartbeat(bpm: number, level: number): void { heart?.set(bpm, level); }
export function stopHeartbeat(): void { heart?.stop(); heart = null; }

/** The yard at night: a low detuned drone, wind, and the odd distant creak of metal. */
export function startAmbience(): void {
  const c = ready(); if (!c || ambience || !noiseBuf) return;
  const out = c.createGain(); out.gain.value = 0.0001;
  out.gain.exponentialRampToValueAtTime(1, c.currentTime + 3);
  out.connect(buses.amb!);
  // wind
  const src = c.createBufferSource(); src.buffer = noiseBuf; src.loop = true; src.playbackRate.value = 0.4;
  const wf = c.createBiquadFilter(); wf.type = 'bandpass'; wf.frequency.value = 380; wf.Q.value = 0.7;
  const wg = c.createGain(); wg.gain.value = 0.1;
  const wl = c.createOscillator(); wl.frequency.value = 0.07;
  const wlg = c.createGain(); wlg.gain.value = 0.07;
  wl.connect(wlg).connect(wg.gain);
  const wsweep = c.createOscillator(); wsweep.frequency.value = 0.05;
  const wsg = c.createGain(); wsg.gain.value = 180;
  wsweep.connect(wsg).connect(wf.frequency);
  src.connect(wf).connect(wg).connect(out);
  // drone: A and B-flat, a semitone apart, beating slowly in the dark
  const df = c.createBiquadFilter(); df.type = 'lowpass'; df.frequency.value = 220; df.Q.value = 2;
  const dg = c.createGain(); dg.gain.value = 0.11;
  const drones = [[LOW.A1, -6], [LOW.A1, 7], [LOW.Bb1 * 2, 0], [LOW.A1 / 2, 0]].map(([f, d]) => {
    const o = c.createOscillator(); o.type = f > 100 ? 'triangle' : 'sawtooth'; o.frequency.value = f; o.detune.value = d;
    o.connect(df); return o;
  });
  const dl = c.createOscillator(); dl.frequency.value = 0.03;
  const dlg = c.createGain(); dlg.gain.value = 120;
  dl.connect(dlg).connect(df.frequency);
  df.connect(dg).connect(out);
  // distant metal creaks at random
  let creakAlive = true;
  const creak = () => {
    if (!creakAlive) return;
    if (ready()) {
      const f0 = 300 + Math.random() * 500;
      tone(f0, 0, 1.4, { type: 'sawtooth', to: f0 * (0.7 + Math.random() * 0.2), gain: 0.025, filter: 1800, vibrato: 14, vibratoHz: 23, bus: 'amb', attack: 0.3 });
    }
    creakTimer = setTimeout(creak, 7000 + Math.random() * 9000);
  };
  let creakTimer = setTimeout(creak, 4000);
  const all = [src, wl, wsweep, dl, ...drones];
  for (const o of all) o.start();
  ambience = {
    stop: () => {
      creakAlive = false; clearTimeout(creakTimer);
      const t = c.currentTime;
      out.gain.cancelScheduledValues(t); out.gain.setTargetAtTime(0.0001, t, 0.3);
      for (const o of all) o.stop(t + 1.5);
    },
  };
}
export function stopAmbience(): void { ambience?.stop(); ambience = null; }

/** For tests (window.__cnAudio): engine state without exposing nodes. */
export function audioState(): { state: string; muted: boolean; volume: number; ambience: boolean; scanning: boolean; heartbeat: boolean } {
  return { state: ctx?.state ?? 'none', muted: settings.muted, volume: settings.volume, ambience: !!ambience, scanning: !!scanLoop, heartbeat: !!heart };
}
