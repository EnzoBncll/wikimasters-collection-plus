/**
 * Bruit de page qui tourne, synthétisé (pas de fichier son) : un souffle de bruit filtré, bref, qui monte puis retombe.
 * `heavy` : couverture (plus grave et plus long).
 */
let ctx: AudioContext | null = null;

export function playPageTurn(heavy = false) {
  try {
    ctx ??= new AudioContext();
    const duration = heavy ? 0.5 : 0.32;
    const rate = ctx.sampleRate;
    const buffer = ctx.createBuffer(1, Math.ceil(rate * duration), rate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      const t = i / data.length;
      // Enveloppe : attaque rapide, crépitement du papier, chute douce.
      const env = Math.min(1, t * 12) * Math.pow(1 - t, 2.2) * (0.75 + 0.25 * Math.sin(t * 90));
      data[i] = (Math.random() * 2 - 1) * env;
    }
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.setValueAtTime(heavy ? 900 : 2200, ctx.currentTime);
    band.frequency.exponentialRampToValueAtTime(heavy ? 400 : 1200, ctx.currentTime + duration);
    band.Q.value = 0.7;
    const gain = ctx.createGain();
    gain.gain.value = heavy ? 0.35 : 0.22;
    src.connect(band).connect(gain).connect(ctx.destination);
    src.start();
  } catch {
    // Audio indisponible : silence.
  }
}

function noiseBurst(duration: number, freq: [number, number], gain: number, q = 0.8) {
  ctx ??= new AudioContext();
  const rate = ctx.sampleRate;
  const buffer = ctx.createBuffer(1, Math.ceil(rate * duration), rate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) {
    const t = i / data.length;
    data[i] = (Math.random() * 2 - 1) * Math.min(1, t * 30) * Math.pow(1 - t, 3);
  }
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const band = ctx.createBiquadFilter();
  band.type = 'bandpass';
  band.frequency.setValueAtTime(freq[0], ctx.currentTime);
  band.frequency.exponentialRampToValueAtTime(freq[1], ctx.currentTime + duration);
  band.Q.value = q;
  const g = ctx.createGain();
  g.gain.value = gain;
  src.connect(band).connect(g).connect(ctx.destination);
  src.start();
}

function tone(freq: number, at: number, duration: number, gain: number, type: OscillatorType = 'sine') {
  ctx ??= new AudioContext();
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.value = freq;
  const t0 = ctx.currentTime + at;
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(gain, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  o.connect(g).connect(ctx.destination);
  o.start(t0);
  o.stop(t0 + duration + 0.05);
}

/** Petit « pop » quand une étiquette est posée (mode revue). */
export function playPop() {
  try {
    tone(880, 0, 0.12, 0.08, 'triangle');
    tone(1320, 0.04, 0.1, 0.05, 'triangle');
  } catch {
    // Audio indisponible.
  }
}

/** Collage d'une carte dans l'album : froissé du papier, « tap » de la carte posée, scintillement. */
export function playStick() {
  try {
    noiseBurst(0.22, [3200, 900], 0.25);
    tone(140, 0.18, 0.18, 0.25, 'sine');
    [1568, 2093, 2637].forEach((f, i) => tone(f, 0.24 + i * 0.06, 0.25, 0.05, 'sine'));
  } catch {
    // Audio indisponible.
  }
}
