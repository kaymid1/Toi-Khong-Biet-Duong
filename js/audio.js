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

export function playChatPop(enabled) {
  if (!enabled) return;
  tone(540, 0.06, "sine", 0.07, 0);
  tone(760, 0.08, "sine", 0.06, 0.045);
}

let cachedViVoices = [];
function refreshViVoices() {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  const list = window.speechSynthesis.getVoices() || [];
  cachedViVoices = list.filter((v) => v.lang && v.lang.toLowerCase().startsWith("vi"));
}
if (typeof window !== "undefined" && "speechSynthesis" in window) {
  refreshViVoices();
  if (typeof window.speechSynthesis.addEventListener === "function") {
    window.speechSynthesis.addEventListener("voiceschanged", refreshViVoices);
  }
}

export function stopSpeech() {
  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    try {
      window.speechSynthesis.cancel();
    } catch (e) {}
  }
}

export function speakChat(text, enabled = true, opts = {}) {
  if (!enabled || !text) return;
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  try {
    const ss = window.speechSynthesis;
    if (!cachedViVoices.length) refreshViVoices();
    // Tránh dồn hàng đợi quá dài nếu nhiều người chat liên tục
    if (ss.pending || ss.speaking) ss.cancel();

    const utter = new SpeechSynthesisUtterance(String(text).slice(0, 120));
    utter.lang = "vi-VN";
    if (cachedViVoices.length) {
      const viIdx = Math.abs(opts.voiceIndex || 0) % cachedViVoices.length;
      utter.voice = cachedViVoices[viIdx];
    }
    utter.pitch = Math.max(0.75, Math.min(1.45, opts.pitch ?? 1.05));
    utter.rate = Math.max(0.85, Math.min(1.3, opts.rate ?? 1.06));
    utter.volume = Math.max(0, Math.min(1, opts.volume ?? 0.92));
    ss.speak(utter);
  } catch (e) {}
}

