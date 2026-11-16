// Tiny synthesized sound effects (no audio files). Deliberately soft and musical:
// there is no buzzer and nothing that sounds like "wrong".

export function createSfx() {
  let ctx = null;
  let enabled = true;

  function ac() {
    if (!enabled) return null;
    try {
      if (!ctx) {
        const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
        if (!AC) return null;
        ctx = new AC();
      }
      if (ctx.state !== 'running') ctx.resume().catch(() => {}); // also 'interrupted' (iOS, after a screen lock)
      return ctx;
    } catch {
      return null;
    }
  }

  function tone(freq, at, dur, { type = 'sine', gain = 0.12, to = null } = {}) {
    const c = ac();
    if (!c) return;
    const t0 = c.currentTime + at;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (to) osc.frequency.exponentialRampToValueAtTime(to, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g).connect(c.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.03);
  }

  const notes = (list, step, opts) => list.forEach((f, i) => tone(f, i * step, opts?.dur ?? step * 1.6, opts));

  return {
    unlock: () => void ac(),
    setEnabled: (v) => { enabled = !!v; },
    tap: () => tone(880, 0, 0.07, { type: 'triangle', gain: 0.08 }),
    undo: () => tone(520, 0, 0.09, { type: 'triangle', gain: 0.07, to: 380 }),
    go: () => notes([660, 990], 0.07, { type: 'triangle', gain: 0.1, dur: 0.14 }),
    good: () => notes([784, 988, 1175, 1568], 0.075, { gain: 0.11, dur: 0.22 }),
    soft: () => notes([440, 392], 0.14, { gain: 0.07, dur: 0.26 }), // gentle "hmm", not a buzzer
    star: () => notes([1047, 1319, 1568], 0.06, { type: 'triangle', gain: 0.09, dur: 0.2 }),
    chest: () => notes([392, 523, 659, 784, 1047], 0.09, { type: 'triangle', gain: 0.1, dur: 0.3 }),
    fanfare: () => notes([523, 659, 784, 1047, 784, 1047], 0.11, { type: 'triangle', gain: 0.11, dur: 0.28 }),
  };
}
