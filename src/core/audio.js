// Voice playback.
//
// Design notes (iPad Safari is the target):
// - ONE shared <audio> element is "unlocked" by playing a silent clip inside the
//   first tap. After that the same element can be given new sources and played.
// - Clips are fetched up-front into Blobs and played from object URLs. That makes
//   playback instant, keeps a mission working if the network drops half-way, and
//   avoids Safari's Range-request problems with service-worker-cached media.
// - A media element (unlike Web Audio) is not silenced by the iPad's mute setting.
// - If a clip cannot be loaded at all we fall back to the device's built-in
//   speech voice so an instruction is never silently skipped.

const SILENT =
  'data:audio/mpeg;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjYwLjE2LjEwMAAAAAAAAAAAAAAA//OEwAAAAAAAAAAAAEluZm8AAAAPAAAABwAAAhAAdHR0dHR0dHR0dHR0dHSLi4uLi4uLi4uLi4uLi6KioqKioqKioqKioqKiurq6urq6urq6urq6urq60dHR0dHR0dHR0dHR0dHo6Ojo6Ojo6Ojo6Ojo6P//////////////////AAAAAExhdmM2MC4zMQAAAAAAAAAAAAAAACQCQAAAAAAAAAIQM82HUQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA//MkxAAAAANIAAAAAExBTUUzLjEwMFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV//MkxCMAAANIAAAAAFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV//MkxEYAAANIAAAAAFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV//MkxGkAAANIAAAAAFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV//MkxIwAAANIAAAAAFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV//MkxK8AAANIAAAAAFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV//MkxNIAAANIAAAAAFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV';

export function createAudio() {
  let el = null;
  let unlocked = false;
  let fast = false; // test mode: resolve almost immediately without real playback
  const blobs = new Map(); // url -> object URL, or null when the fetch failed
  let current = null; // { finish } of the clip that is playing now
  let playId = 0; // bumps on every play()/stop(), so a clip that was still loading knows it was cancelled
  let utterance = null; // keep a reference so Safari does not garbage-collect it mid-speech

  function ensureEl() {
    if (!el) {
      el = new Audio();
      el.preload = 'auto';
      el.setAttribute('playsinline', '');
    }
    return el;
  }

  /** Call from inside a tap handler, once, before any voice is needed. */
  function unlock() {
    ensureEl();
    try {
      if (navigator.audioSession) navigator.audioSession.type = 'playback';
    } catch { /* not supported: fine */ }
    if (unlocked) return Promise.resolve(true);
    unlocked = true;
    el.src = SILENT;
    const p = el.play();
    return p && p.then ? p.then(() => true, () => { unlocked = false; return false; }) : Promise.resolve(true);
  }

  /** Fetch clips into memory so they play instantly and survive a dropped connection. */
  async function preload(urls) {
    await Promise.all(
      [...new Set(urls)].filter((u) => u && !blobs.get(u)).map(async (u) => {
        try {
          const r = await fetch(u);
          if (!r.ok) throw new Error(String(r.status));
          blobs.set(u, URL.createObjectURL(await r.blob()));
        } catch {
          blobs.set(u, null);
        }
      })
    );
    return urls.every((u) => !u || blobs.get(u));
  }

  function release(urls) {
    for (const u of urls) {
      const o = blobs.get(u);
      if (o) URL.revokeObjectURL(o);
      blobs.delete(u);
    }
  }

  function stop() {
    playId++;
    if (current) current.finish({ ok: false, how: 'cancelled' });
    if (el) {
      el.onended = el.onerror = el.onloadedmetadata = null;
      try { el.pause(); } catch { /* ignore */ }
    }
    try { globalThis.speechSynthesis?.cancel(); } catch { /* ignore */ }
  }

  /**
   * Play one clip. Resolves (never rejects) with { ok, how }:
   *   how = 'clip' | 'speech' | 'fast' | 'cancelled' | 'none'
   * `text` is the same sentence as words, used only for the built-in-voice fallback.
   */
  function play(url, { rate = 1, text = '' } = {}) {
    stop();
    // Never talk while the app is in the background or the screen is locked.
    if (globalThis.document?.hidden) return Promise.resolve({ ok: false, how: 'cancelled' });
    if (fast) return new Promise((r) => setTimeout(() => r({ ok: true, how: 'fast' }), 30));
    ensureEl();
    const my = playId;
    // Always play from memory (never stream): fetch the clip first if it was not preloaded.
    const ready = url && !blobs.get(url) ? preload([url]) : Promise.resolve();
    return ready.then(() => (my === playId ? start(url, rate, text) : { ok: false, how: 'cancelled' }));
  }

  function start(url, rate, text) {
    return new Promise((resolve) => {
      let done = false;
      let watchdog = null;
      const me = {
        finish(res) {
          if (done) return;
          done = true;
          clearTimeout(watchdog);
          if (current === me) current = null;
          resolve(res);
        },
      };
      current = me;
      const arm = (ms) => {
        clearTimeout(watchdog);
        watchdog = setTimeout(() => fallback(), ms);
      };
      const fallback = () => {
        if (done) return;
        el.onended = el.onerror = el.onloadedmetadata = null;
        try { el.pause(); } catch { /* ignore */ }
        speak(text, rate).then((res) => me.finish(res));
      };

      const src = url ? blobs.get(url) : null;
      if (!src) return fallback();
      el.onended = () => me.finish({ ok: true, how: 'clip' });
      el.onerror = () => fallback();
      el.onloadedmetadata = () => {
        const d = isFinite(el.duration) ? el.duration : 20;
        arm((d / rate) * 1000 + 4000);
      };
      el.src = src;
      el.defaultPlaybackRate = rate;
      el.playbackRate = rate;
      if ('preservesPitch' in el) el.preservesPitch = true;
      else if ('webkitPreservesPitch' in el) el.webkitPreservesPitch = true;
      arm(12000); // until metadata arrives
      const p = el.play();
      if (p && p.catch) p.catch(() => fallback());
    });
  }

  /** Built-in device voice. Only used when a recorded clip is unavailable. */
  function speak(text, rate = 1) {
    return new Promise((resolve) => {
      const synth = globalThis.speechSynthesis;
      if (!text || !synth || typeof SpeechSynthesisUtterance === 'undefined') return resolve({ ok: false, how: 'none' });
      let done = false;
      const end = (ok) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        resolve({ ok, how: ok ? 'speech' : 'none' });
      };
      const u = new SpeechSynthesisUtterance(text);
      utterance = u;
      u.lang = 'en-US';
      u.rate = 0.92 * rate;
      const voices = synth.getVoices ? synth.getVoices() : [];
      const pick = voices.find((v) => /^en[-_]US/i.test(v.lang) && /Samantha|Ava|Allison|Nicky|Google US/i.test(v.name)) ||
        voices.find((v) => /^en[-_]US/i.test(v.lang)) || voices.find((v) => /^en/i.test(v.lang));
      if (pick) u.voice = pick;
      u.onend = () => end(true);
      u.onerror = () => end(false);
      const timer = setTimeout(() => end(false), 4000 + text.length * 110);
      try {
        synth.cancel();
        synth.speak(u);
      } catch {
        end(false);
      }
    });
  }

  return {
    unlock,
    preload,
    release,
    play,
    stop,
    isUnlocked: () => unlocked,
    hasClip: (url) => !!blobs.get(url),
    setFast: (v) => { fast = !!v; },
  };
}
