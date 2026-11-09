import { getSettings } from '../data/store.js';
let ctx = null;
function tone(freq, dur = 0.12, type = 'sine', vol = 0.06, when = 0) {
  if (!getSettings().sound) return;
  try {
    ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
    const t = ctx.currentTime + when;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(ctx.destination);
    o.start(t); o.stop(t + dur + 0.02);
  } catch (e) { /* audio non disponibile */ }
}
export const sfx = {
  tap: () => tone(620, 0.05, 'triangle', 0.04),
  ok: () => { tone(523, 0.1, 'triangle'); tone(784, 0.14, 'triangle', 0.06, 0.09); },
  err: () => { tone(160, 0.22, 'sawtooth', 0.05); tone(120, 0.25, 'sawtooth', 0.05, 0.12); },
  win: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.18, 'triangle', 0.06, i * 0.11)),
  tick: () => tone(440, 0.08, 'square', 0.03),
  go: () => tone(880, 0.25, 'square', 0.04),
};
