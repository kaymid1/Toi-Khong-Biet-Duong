let ctx = null;
let osc = null;
let gain = null;
let filter = null;

function ensureCtx() {
  if (ctx) return true;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return false;
  ctx = new AC();
  osc = ctx.createOscillator();
  osc.type = "sawtooth";
  osc.frequency.value = 50;
  filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 180;
  gain = ctx.createGain();
  gain.gain.value = 0;
  osc.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);
  osc.start();
  return true;
}

export function setSoundEnabled(on) {
  if (on && ensureCtx() && ctx.state === "suspended") ctx.resume();
  if (!on && gain && ctx) gain.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
}

export function updateEngineSound(enabled, speed, outOfFuel, bike) {
  if (!enabled || !ctx || !gain) return;
  if (outOfFuel) {
    gain.gain.setTargetAtTime(0, ctx.currentTime, 0.08);
    return;
  }
  const s = Math.abs(speed);
  const base = bike ? bike.engineBase : 50;
  const pitch = bike ? bike.enginePitch : 2.5;
  const targetFreq = base + s * pitch;
  const targetGain = s > 0.2 ? Math.min(0.055, 0.014 + s * 0.001) : 0.007;
  osc.frequency.setTargetAtTime(targetFreq, ctx.currentTime, 0.06);
  filter.frequency.setTargetAtTime(130 + s * 11, ctx.currentTime, 0.06);
  gain.gain.setTargetAtTime(targetGain, ctx.currentTime, 0.06);
}

function tone(freq, dur, type = "sine", vol = 0.12, delay = 0) {
  if (!ensureCtx()) return;
  if (ctx.state === "suspended") ctx.resume();
  const t0 = ctx.currentTime + delay;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  o.connect(g);
  g.connect(ctx.destination);
  o.start(t0);
  o.stop(t0 + dur);
}

export function playHorn(enabled, bike) {
  if (!enabled) return;
  const [f1, f2] = bike ? bike.hornFreq : [480, 480];
  const tp = bike ? bike.hornType : "square";
  tone(f1, 0.11, tp, 0.09, 0);
  tone(f2, 0.14, tp, 0.09, 0.08);
}

export function playDiscover(enabled) {
  if (!enabled) return;
  tone(659.25, 0.1, "sine", 0.09, 0);
  tone(783.99, 0.16, "sine", 0.09, 0.08);
}

export function playSuccess(enabled) {
  if (!enabled) return;
  tone(587.33, 0.14, "triangle", 0.14, 0);
  tone(880, 0.24, "triangle", 0.14, 0.1);
}

export function playError(enabled) {
  if (!enabled) return;
  tone(190, 0.22, "sawtooth", 0.08, 0);
}

export function playRefuel(enabled) {
  if (!enabled) return;
  tone(330, 0.1, "sine", 0.1, 0);
  tone(440, 0.1, "sine", 0.1, 0.09);
  tone(660, 0.18, "sine", 0.12, 0.18);
}
