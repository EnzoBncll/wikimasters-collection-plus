import { ctx } from './ctx';

/**
 * Sons synthétisés (Web Audio, aucun fichier), passés dans une réverbération pour l'ampleur.
 * Une signature par rareté, de plus en plus grandiose à partir de SR. Volume réglable dans Collection+.
 */

export type RevealSound = 'C' | 'PC' | 'R' | 'SR' | 'UR' | 'L' | 'S';

let audio: AudioContext | null = null;
let busNodes: { out: GainNode; rev: ConvolverNode } | null = null;

function context(): AudioContext | null {
  if (!ctx.settings.sound) return null;
  try {
    audio ??= new AudioContext();
    if (audio.state === 'suspended') audio.resume();
    return audio;
  } catch {
    return null;
  }
}

function impulse(a: AudioContext, sec: number, decay: number) {
  const len = Math.floor(a.sampleRate * sec);
  const buf = a.createBuffer(2, len, a.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** decay;
  }
  return buf;
}

function bus(a: AudioContext) {
  if (!busNodes) {
    const out = a.createGain();
    const comp = a.createDynamicsCompressor();
    const rev = a.createConvolver();
    const wet = a.createGain();
    comp.threshold.value = -16;
    comp.ratio.value = 5;
    comp.attack.value = 0.003;
    comp.release.value = 0.25;
    rev.buffer = impulse(a, 3.8, 2.2);
    wet.gain.value = 0.9;
    out.connect(comp).connect(a.destination);
    rev.connect(wet).connect(comp);
    busNodes = { out, rev };
  }
  busNodes.out.gain.value = 0.55 * Math.max(0, Math.min(1, ctx.settings.soundVolume));
  return busNodes;
}

interface Shape {
  v?: number;
  attack?: number;
  d?: number;
  rev?: number;
  pan?: number;
  swell?: boolean;
}

function route(a: AudioContext, node: AudioNode, t0: number, { v = 0.1, attack = 0.015, d = 0.5, rev = 0.15, pan = 0, swell = false }: Shape) {
  const g = a.createGain();
  const p = a.createStereoPanner();
  const send = a.createGain();
  const b = bus(a);
  p.pan.value = Math.max(-1, Math.min(1, pan));
  send.gain.value = rev;
  g.gain.setValueAtTime(swell ? 0.0001 : 0, t0);
  if (swell) {
    g.gain.exponentialRampToValueAtTime(v, t0 + d);
    g.gain.linearRampToValueAtTime(0, t0 + d + 0.03);
  } else {
    g.gain.linearRampToValueAtTime(v, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + d);
  }
  node.connect(g).connect(p).connect(b.out);
  p.connect(send).connect(b.rev);
}

interface ToneOpts extends Shape {
  filter?: number;
  filterFrom?: number;
  filterTime?: number;
}

export function tone(freq: number, at: number, dur: number, type: OscillatorType = 'sine', vol = 0.1, freqEnd?: number | null, opts: ToneOpts = {}) {
  const a = context();
  if (!a) return;
  const o = a.createOscillator();
  const t0 = a.currentTime + Math.max(0, at);
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (freqEnd) o.frequency.exponentialRampToValueAtTime(freqEnd, t0 + dur);
  let out: AudioNode = o;
  if (opts.filter) {
    const fl = a.createBiquadFilter();
    fl.type = 'lowpass';
    fl.frequency.setValueAtTime(opts.filterFrom ?? opts.filter, t0);
    if (opts.filterFrom) fl.frequency.exponentialRampToValueAtTime(opts.filter, t0 + (opts.filterTime ?? 0.2));
    o.connect(fl);
    out = fl;
  }
  route(a, out, t0, { v: vol, d: dur, ...opts });
  o.start(t0);
  o.stop(t0 + dur + 0.1);
}

function noise(at: number, dur: number, vol = 0.12, type: BiquadFilterType = 'bandpass', f = 1200, f2?: number | null, opts: Shape & { q?: number } = {}) {
  const a = context();
  if (!a) return;
  const len = Math.ceil(a.sampleRate * dur);
  const buf = a.createBuffer(1, len, a.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  const src = a.createBufferSource();
  const fl = a.createBiquadFilter();
  const t0 = a.currentTime + Math.max(0, at);
  src.buffer = buf;
  fl.type = type;
  fl.frequency.setValueAtTime(f, t0);
  if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t0 + dur);
  fl.Q.value = opts.q ?? 0.8;
  src.connect(fl);
  route(a, fl, t0, { v: vol, d: dur, attack: dur * 0.2, ...opts });
  src.start(t0);
  src.stop(t0 + dur + 0.1);
}

// ---------------- briques ----------------
const whoosh = (t: number, v = 0.1) => noise(t, 0.35, v, 'bandpass', 600, 3200);
const arp = (t: number, notes: number[], gap: number, type: OscillatorType = 'triangle', v = 0.07, d = 0.5, o: ToneOpts = {}) =>
  notes.forEach((f, i) => tone(f, t + i * gap, d, type, v, null, { pan: (i / Math.max(1, notes.length - 1)) * 1.2 - 0.6, ...o }));
const kick = (t: number, v = 0.5, from = 150, to = 40, d = 0.6) => tone(from, t, d, 'sine', v, to, { rev: 0.1 });
const sub = (t: number, v = 0.45, d = 2.5) => tone(55, t, d, 'sine', v, 28, { rev: 0.05 });
const crash = (t: number, v = 0.14, d = 2.8) => {
  noise(t, d, v, 'highpass', 5200, null, { rev: 0.5, attack: 0.005 });
  noise(t, d * 0.6, v * 0.7, 'bandpass', 8000, 3000, { rev: 0.5, attack: 0.005 });
};
const swell = (t: number, d: number, v = 0.12, from = 400, to = 9000) => noise(t, d, v, 'bandpass', from, to, { swell: true, rev: 0.4, q: 1.4 });
const gong = (t: number, base = 98, v = 0.16, d = 4) =>
  [1, 2.76, 5.4, 8.93, 13.3].forEach((m, i) => tone(base * m, t, d / (1 + i * 0.35), 'sine', v / (1 + i * 0.8), null, { rev: 0.6, attack: 0.004 }));
const brass = (t: number, freqs: number[], d = 1.4, v = 0.05) =>
  freqs.forEach((f, i) =>
    [-7, 0, 7].forEach((det) => tone(f * 2 ** (det / 1200), t, d, 'sawtooth', v, null, { filter: 2600, filterFrom: 300, filterTime: 0.18, rev: 0.35, attack: 0.03, pan: i % 2 ? 0.3 : -0.3 })),
  );
const bells = (t: number, notes: number[], gap: number, v = 0.06) =>
  notes.forEach((f, i) => {
    tone(f, t + i * gap, 1.6, 'sine', v, null, { rev: 0.55, attack: 0.003, pan: Math.sin(i) * 0.6 });
    tone(f * 2.01, t + i * gap, 0.9, 'sine', v * 0.35, null, { rev: 0.55, attack: 0.003 });
  });
const shimmer = (t: number, d: number, v = 0.025) => {
  for (let i = 0; i < 26; i++) tone(2000 + Math.random() * 3000, t + Math.random() * d, 0.25, 'sine', v, null, { rev: 0.7, pan: Math.random() * 2 - 1, attack: 0.002 });
};
function choir(t: number, freqs: number[], d = 3, v = 0.035) {
  const a = context();
  if (!a) return;
  for (const f of freqs) {
    for (const det of [-9, 0, 9]) {
      const o = a.createOscillator();
      const f1 = a.createBiquadFilter();
      const f2 = a.createBiquadFilter();
      const mix = a.createGain();
      const t0 = a.currentTime + Math.max(0, t);
      o.type = 'sawtooth';
      o.frequency.value = f * 2 ** (det / 1200);
      f1.type = 'bandpass';
      f1.frequency.value = 750;
      f1.Q.value = 3;
      f2.type = 'bandpass';
      f2.frequency.value = 1150;
      f2.Q.value = 3;
      o.connect(f1).connect(mix);
      o.connect(f2).connect(mix);
      route(a, mix, t0, { v, d, attack: 0.5, rev: 0.7, pan: det / 20 });
      o.start(t0);
      o.stop(t0 + d + 0.1);
    }
  }
}

/** Son du révélé : `hit` = moment (s) où la carte apparaît, après la charge. */
const REVEAL: Record<RevealSound, (hit: number) => void> = {
  // Commune : un retournement de papier et une note douce.
  C: (hit) => {
    whoosh(hit - 0.3, 0.07);
    tone(523, hit, 0.28, 'triangle', 0.06);
  },
  // Peu commune : deux notes qui montent.
  PC: (hit) => {
    whoosh(hit - 0.3, 0.08);
    arp(hit, [523, 784], 0.07, 'triangle', 0.065, 0.35);
  },
  // Rare : petite cloche (accord majeur) et un éclat aigu.
  R: (hit) => {
    whoosh(hit - 0.3, 0.09);
    bells(hit, [659, 831, 988], 0.06, 0.05);
    tone(1976, hit + 0.2, 0.6, 'sine', 0.025, null, { rev: 0.4 });
  },
  // Super rare : souffle qui monte, coup sourd, gerbe de cloches et scintillement.
  SR: (hit) => {
    tone(110, 0, hit, 'sine', 0.08, 330, { rev: 0.2 });
    swell(0, hit, 0.09, 300, 6000);
    kick(hit, 0.45);
    noise(hit, 0.35, 0.12, 'highpass', 3500, null, { rev: 0.5, attack: 0.003 });
    bells(hit + 0.02, [1047, 1319, 1568, 2093], 0.055, 0.055);
    shimmer(hit + 0.1, 0.9, 0.02);
  },
  // Ultra rare : montée en tension, roulement, double impact, cuivres, cymbale.
  UR: (hit) => {
    tone(110, 0, hit, 'sawtooth', 0.04, 880, { filter: 2400, rev: 0.3 });
    tone(55, 0, hit, 'sine', 0.12, 110);
    swell(0, hit, 0.14, 200, 9000);
    for (let i = 0; i < 8; i++) noise(hit - 0.55 + i * 0.065, 0.05, 0.05 + i * 0.012, 'bandpass', 1800, null, { rev: 0.2, attack: 0.002 });
    kick(hit, 0.6, 170, 35, 0.9);
    sub(hit, 0.35, 2);
    crash(hit, 0.13, 2.6);
    noise(hit + 0.18, 0.25, 0.14, 'bandpass', 1600, null, { rev: 0.4, attack: 0.002 });
    kick(hit + 0.18, 0.4, 140, 45, 0.5);
    brass(hit + 0.05, [262, 330, 392], 0.7, 0.045);
    brass(hit + 0.55, [294, 370, 440, 587], 1.6, 0.05);
    bells(hit + 0.55, [1175, 1480, 1760, 2349], 0.06, 0.05);
    shimmer(hit + 0.5, 1.4, 0.02);
  },
  // Légendaire : cœur qui s'accélère, longue montée, silence, déflagration, gong, chœur et fanfare.
  L: (hit) => {
    [0, 0.48, 0.9, 1.25, 1.52].forEach((s, i) => {
      tone(60, s, 0.2, 'sine', 0.25 + i * 0.04, 40);
      tone(60, s + 0.14, 0.16, 'sine', 0.15 + i * 0.03, 40);
    });
    tone(80, 0.1, hit - 0.35, 'sawtooth', 0.045, 1600, { filter: 3200, rev: 0.35 });
    tone(40, 0.1, hit - 0.35, 'sine', 0.14, 80);
    swell(0.1, hit - 0.35, 0.18, 150, 12000);
    choir(0.4, [131, 196], hit - 0.6, 0.018);
    kick(hit, 0.75, 190, 30, 1.2);
    sub(hit, 0.5, 3.2);
    gong(hit, 98, 0.18, 5);
    crash(hit, 0.16, 3.4);
    noise(hit, 0.9, 0.18, 'lowpass', 900, 200, { rev: 0.3, attack: 0.003 });
    choir(hit + 0.05, [262, 330, 392, 523], 3.6, 0.04);
    brass(hit + 0.25, [262, 330, 392], 0.5, 0.05);
    brass(hit + 0.8, [349, 440, 523], 0.5, 0.05);
    brass(hit + 1.3, [392, 494, 587, 784], 2.2, 0.06);
    bells(hit + 0.2, [523, 659, 784, 1047, 1319, 1568, 2093, 2637], 0.07, 0.055);
    shimmer(hit + 0.3, 2.6, 0.024);
    kick(hit + 1.3, 0.45, 140, 40, 0.6);
    crash(hit + 1.3, 0.1, 2.4);
  },
  // Shiny : cascade cristalline par-dessus.
  S: (hit) => {
    bells(hit, [2349, 2637, 3136, 3520, 3951, 4699], 0.045, 0.04);
    shimmer(hit + 0.2, 1.2, 0.022);
    arp(hit + 0.35, [1568, 1976, 2349], 0.08, 'sine', 0.04, 1, { rev: 0.6 });
  },
};

export function revealSound(kind: RevealSound, hitSeconds: number) {
  if (!context()) return;
  REVEAL[kind](hitSeconds);
}

/** Album à objectif : sortie de l'album, ouverture, vol de la carte, collage, fermeture, retour. */
export const albumSfx = {
  emerge: () => {
    noise(0, 0.5, 0.07, 'bandpass', 500, 2600, { rev: 0.3 });
    tone(392, 0.1, 0.3, 'triangle', 0.05, null, { rev: 0.3 });
    tone(523, 0.2, 0.4, 'triangle', 0.05, null, { rev: 0.3 });
  },
  open: () => noise(0, 0.35, 0.09, 'bandpass', 900, 300, { rev: 0.2 }),
  fly: () => noise(0, 0.7, 0.06, 'bandpass', 400, 4000, { rev: 0.3 }),
  stick: () => {
    tone(160, 0, 0.3, 'sine', 0.3, 60, { rev: 0.1 });
    noise(0, 0.12, 0.1, 'bandpass', 2500, null, { rev: 0.3, attack: 0.003 });
    bells(0.05, [784, 988, 1175, 1568], 0.06, 0.05);
  },
  close: () => {
    noise(0, 0.25, 0.08, 'bandpass', 700, 250, { rev: 0.2 });
    tone(110, 0.2, 0.2, 'sine', 0.15, 70);
  },
  home: () => {
    noise(0, 0.4, 0.05, 'bandpass', 3000, 600, { rev: 0.3 });
    tone(1568, 0.35, 0.5, 'sine', 0.04, null, { rev: 0.5 });
  },
};

export const sfx = {
  charge: () => tone(200, 0, 0.6, 'sawtooth', 0.02, 800),
  fresh: () => {
    tone(1320, 0, 0.12, 'triangle', 0.05, null, { rev: 0.3 });
    tone(1760, 0.07, 0.16, 'triangle', 0.05, null, { rev: 0.3 });
  },
  toggle: (on: boolean) => tone(on ? 880 : 520, 0, 0.09, 'triangle', 0.04, on ? 1320 : 380),
  tick: () => tone(1200, 0, 0.05, 'sine', 0.02),
};
