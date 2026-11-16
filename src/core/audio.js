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
// - Nothing here can wait for ever: every network wait and every playback has a time limit.

const SILENT =
  'data:audio/mpeg;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjYwLjE2LjEwMAAAAAAAAAAAAAAA//OEwAAAAAAAAAAAAEluZm8AAAAPAAAABwAAAhAAdHR0dHR0dHR0dHR0dHSLi4uLi4uLi4uLi4uLi6KioqKioqKioqKioqKiurq6urq6urq6urq6urq60dHR0dHR0dHR0dHR0dHo6Ojo6Ojo6Ojo6Ojo6P//////////////////AAAAAExhdmM2MC4zMQAAAAAAAAAAAAAAACQCQAAAAAAAAAIQM82HUQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA//MkxAAAAANIAAAAAExBTUUzLjEwMFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV//MkxCMAAANIAAAAAFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV//MkxEYAAANIAAAAAFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV//MkxGkAAANIAAAAAFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV//MkxIwAAANIAAAAAFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV//MkxK8AAANIAAAAAFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV//MkxNIAAANIAAAAAFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV';

const LOAD_WAIT = 4000; // longest we wait for a clip that was not preloaded before falling back

export function createAudio() {
  let el = null;
  let unlocked = false;
  let speechPrimed = false;
  let fast = false; // test mode: resolve almost immediately without real playback
  const blobs = new Map(); // url -> object URL, or null when the fetch failed
  const inflight = new Map(); // url -> promise of a fetch that is still running
  let current = null; // { finish } of the clip that is playing now
  let playId = 0; // bumps on every play()/stop(), so a clip that was still loading knows it was cancelled
  let utterance = null; // keep a reference so Safari does not garbage-collect it mid-speech
  // What actually came out of the speaker, for the "Sound check" line in the parent area
  // (a home-screen app has no console to look at).
  const stats = { clip: 0, speech: 0, none: 0, cancelled: 0, lastError: '' };

  function ensureEl() {
    if (!el) {
      el = new Audio();
      el.preload = 'auto';
      el.setAttribute('playsinline', '');
    }
    return el;
  }

  /** Call from inside a tap handler before any voice is needed (safe to call on every tap). */
  function unlock() {
    ensureEl();
    try {
      if (navigator.audioSession) navigator.audioSession.type = 'playback';
    } catch { /* not supported: fine */ }
    // iOS only lets the built-in voice speak later if it has spoken once inside a tap.
    if (!speechPrimed && globalThis.speechSynthesis && typeof SpeechSynthesisUtterance !== 'undefined') {
      speechPrimed = true;
      try { globalThis.speechSynthesis.speak(new SpeechSynthesisUtterance('')); } catch { /* ignore */ }
    }
    if (unlocked) return Promise.resolve(true);
    unlocked = true;
    el.src = SILENT;
    const p = el.play();
    return p && p.then ? p.then(() => true, () => { unlocked = false; return false; }) : Promise.resolve(true);
  }

  function fetchClip(u) {
    let p = inflight.get(u);
    if (!p) {
      p = (async () => {
        try {
          const r = await fetch(u);
          if (!r.ok) throw new Error(String(r.status));
          const o = URL.createObjectURL(new Blob([await r.arrayBuffer()], { type: 'audio/mpeg' }));
          if (blobs.get(u)) URL.revokeObjectURL(o);
          else blobs.set(u, o);
        } catch {
          if (!blobs.get(u)) blobs.set(u, null);
        } finally {
          inflight.delete(u);
        }
      })();
      inflight.set(u, p);
    }
    return p;
  }

  /** Fetch clips into memory so they play instantly and survive a dropped connection. */
  async function preload(urls) {
    await Promise.all([...new Set(urls)].filter((u) => u && !blobs.get(u)).map(fetchClip));
    return urls.every((u) => !u || blobs.get(u));
  }

  function release(urls) {
    for (const u of urls) {
      const o = blobs.get(u);
      if (o) URL.revokeObjectURL(o);
      blobs.delete(u);
    }
  }

  function quiet() {
    if (!el) return;
    el.onended = el.onerror = el.onloadedmetadata = el.onpause = el.onplaying = null;
    try { el.pause(); } catch { /* ignore */ }
  }

  function stop() {
    playId++;
    if (current) current.finish({ ok: false, how: 'cancelled' });
    quiet();
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
    // Always play from memory: fetch the clip first if it was not preloaded - but not for ever.
    const ready = url && !blobs.get(url) ? Promise.race([preload([url]), new Promise((r) => setTimeout(r, LOAD_WAIT))]) : Promise.resolve();
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
          stats[res.how] = (stats[res.how] || 0) + 1;
          resolve(res);
        },
      };
      current = me;
      const fallback = (why) => {
        if (done) return;
        stats.lastError = `${why}${el.error ? ` (media error ${el.error.code})` : ''}`;
        quiet();
        speak(text, rate).then((res) => me.finish(res));
      };
      // The watchdog looks at how far playback got before deciding what went wrong.
      const stuck = () => {
        if (done) return;
        const d = el.duration;
        if (isFinite(d) && d > 0 && el.currentTime >= d - 0.35) return me.finish({ ok: true, how: 'clip' }); // it played; only the 'ended' event was lost
        if (el.currentTime > 0.25) { // the system paused it part-way (Siri, a call...): he taps the ear again
          quiet();
          return me.finish({ ok: false, how: 'cancelled' });
        }
        fallback('clip did not start');
      };
      const arm = (ms) => {
        clearTimeout(watchdog);
        watchdog = setTimeout(stuck, ms);
      };

      const src = url ? blobs.get(url) : null;
      if (!src) return fallback('clip not available');
      el.onended = () => me.finish({ ok: true, how: 'clip' });
      el.onerror = () => fallback('clip could not be played');
      el.onloadedmetadata = () => {
        const d = isFinite(el.duration) ? el.duration : 20;
        arm((d / rate) * 1000 + 4000);
      };
      el.onplaying = () => { if (el.playbackRate !== rate) el.playbackRate = rate; };
      // A pause we did not ask for means the system interrupted us. ('pause' also fires just before 'ended'.)
      el.onpause = () => setTimeout(() => {
        if (!done && current === me && el.paused && !el.ended) stuck();
      }, 500);
      el.src = src;
      el.defaultPlaybackRate = rate;
      el.playbackRate = rate;
      if ('preservesPitch' in el) el.preservesPitch = true;
      else if ('webkitPreservesPitch' in el) el.webkitPreservesPitch = true;
      arm(8000); // until metadata arrives (instant for an in-memory clip)
      const p = el.play();
      if (p && p.catch) p.catch(() => fallback('play() was refused'));
    });
  }

  /** Built-in device voice. Only used when a recorded clip is unavailable, or for words a grown-up typed. */
  function speak(text, rate = 1) {
    return new Promise((resolve) => {
      const synth = globalThis.speechSynthesis;
      if (!text || !synth || typeof SpeechSynthesisUtterance === 'undefined') return resolve({ ok: false, how: 'none' });
      let done = false;
      let probe = null;
      const end = (ok) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        clearTimeout(probe);
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
        // If the browser silently dropped the request, give up after a moment instead of a long wait.
        probe = setTimeout(() => { if (!done && !synth.speaking && !synth.pending) end(false); }, 1200);
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
    /** Read arbitrary text aloud with the device's built-in voice (for words a grown-up typed in). */
    speak: (text) => {
      stop();
      return globalThis.document?.hidden ? Promise.resolve({ ok: false, how: 'cancelled' }) : speak(text);
    },
    stats,
    isUnlocked: () => unlocked,
    hasClip: (url) => !!blobs.get(url),
    setFast: (v) => { fast = !!v; },
  };
}
