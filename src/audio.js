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
