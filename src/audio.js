// Tiny procedural sound effects via WebAudio. No asset files.

let ctx = null;
let master = null;
let noise = null;
let muted = false;

function makeNoise() {
  const len = ctx.sampleRate * 1;
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

function envGain(t, peak, attack, decay) {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  g.connect(master);
  return g;
}

function tone(type, from, to, t, peak, decay) {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(from, t);
  o.frequency.exponentialRampToValueAtTime(to, t + decay);
  o.connect(envGain(t, peak, 0.008, decay));
  o.start(t);
  o.stop(t + decay + 0.05);
}

export const audio = {
  unlock() {
    if (!ctx) {
      ctx = new AudioContext();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
      noise = makeNoise();
    }
    if (ctx.state === 'suspended') ctx.resume();
  },
  get muted() {
    return muted;
  },
  toggleMute() {
    muted = !muted;
    if (master) master.gain.value = muted ? 0 : 0.5;
    return muted;
  },
  plop(freq = 300, vol = 0.5) {
    if (!ctx || muted) return;
    const t = ctx.currentTime;
    const f = freq * (0.9 + Math.random() * 0.2);
    tone('sine', f * 1.6, f * 0.6, t, 0.05 + vol * 0.45, 0.14);
  },
  sizzle() {
    if (!ctx || muted) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = noise;
    const bp = ctx.createBiquadFilter();
    bp.type = 'highpass';
    bp.frequency.value = 2500;
    src.connect(bp).connect(envGain(t, 0.12, 0.05, 0.7));
    src.start(t);
    src.stop(t + 0.8);
  },
  squelch() {
    if (!ctx || muted) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = noise;
    const lp = ctx.createBiquadFilter();
    lp.type = 'bandpass';
    lp.Q.value = 4;
    lp.frequency.setValueAtTime(300, t);
    lp.frequency.exponentialRampToValueAtTime(1400, t + 0.25);
    src.connect(lp).connect(envGain(t, 0.5, 0.02, 0.3));
    src.start(t);
    src.stop(t + 0.4);
  },
  splat() {
    if (!ctx || muted) return;
    const t = ctx.currentTime;
    tone('sine', 220, 50, t, 0.6, 0.18);
    this.squelch();
  },
  // Low church-bell "shame" toll: a few inharmonic partials with a long decay.
  shameBell() {
    if (!ctx || muted) return;
    const t = ctx.currentTime;
    for (const [f, a, d] of [[196, 0.35, 2.2], [392, 0.15, 1.6], [466, 0.1, 1.2], [587, 0.08, 0.9]]) {
      tone('sine', f, f * 0.995, t, a, d);
    }
  },
  // Wah wah wah waaah.
  sadTrombone() {
    if (!ctx || muted) return;
    const t0 = ctx.currentTime + 0.25;
    const notes = [[311, 0.38], [294, 0.38], [277, 0.38], [262, 1.2]];
    let t = t0;
    for (const [f, d] of notes) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(f, t);
      if (d > 1) {
        const lfo = ctx.createOscillator();
        const depth = ctx.createGain();
        lfo.frequency.value = 6;
        depth.gain.value = 6;
        lfo.connect(depth).connect(o.frequency);
        lfo.start(t);
        lfo.stop(t + d);
        o.frequency.linearRampToValueAtTime(f * 0.94, t + d);
      }
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(500, t);
      lp.frequency.linearRampToValueAtTime(1300, t + 0.08);
      lp.frequency.linearRampToValueAtTime(600, t + d);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.22, t + 0.04);
      g.gain.setValueAtTime(0.22, t + d - 0.08);
      g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      o.connect(lp).connect(g).connect(master);
      o.start(t);
      o.stop(t + d + 0.05);
      t += d;
    }
  },
  whoosh() {
    if (!ctx || muted) return;
    const t = ctx.currentTime;
    tone('triangle', 500, 140, t, 0.2, 0.18);
  },
  ding() {
    if (!ctx || muted) return;
    const t = ctx.currentTime;
    tone('triangle', 880, 878, t, 0.3, 0.6);
    tone('triangle', 1318, 1316, t + 0.12, 0.3, 0.8);
  },
};
