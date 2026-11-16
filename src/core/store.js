// All progress lives on this device only (localStorage). Nothing is sent anywhere.
// The state is one JSON object with a version number so it can be migrated later.

import { todayKey } from './dom.js';

const KEY = 'lwm.state.v1';
const MAX_TRIALS = 1500;
const MAX_MISSIONS = 400;

export function defaultState() {
  return {
    v: 1,
    createdAt: Date.now(),
    settings: {
      sfx: true,
      slowVoice: false, // play instructions a little slower
      earlyReminder: true, // say "please listen until I am finished" when he touches something too soon
      dailyMissions: 3, // gentle "that's enough for today" suggestion
      hardStop: false, // if true the suggestion becomes a lock until tomorrow
    },
    xp: 0,
    levels: {}, // levelId -> { stars, plays, best, last }
    seen: {}, // itemId -> timestamp last used
    trials: [], // compact per-trial records (see recordTrial)
    missions: [], // per-mission summaries
    cards: [], // collected card ids, in order earned
    days: {}, // 'YYYY-MM-DD' -> { missions, trials, ms, counted (missions that count toward rewards) }
    flags: {}, // onboarding / tips seen
    // Set up by a grown-up in the parent area (see src/rewards/logic.js):
    rewards: {
      daily: [], // { id, title, icon, missions }  - won each day he finishes that many missions
      tiers: [], // { id, title, icon, points }    - won once when total points (xp) reach the mark
      earned: [], // { id, src, ref, title, icon, day, t, given } - what a grown-up owes him
      countPerfected: false, // do repeats of 3-star levels count toward daily rewards?
    },
    chores: {
      list: [], // { id, title, icon, points, repeat: 'daily' | 'weekly' | 'once', reward }
      log: [], // { id, chore, title, points, t, day, week, status, photo, note }
      requirePhoto: true,
    },
    expectations: {
      list: [], // { id, title, icon } - daily, no reward; rewards stay locked until all are done
      days: {}, // 'YYYY-MM-DD' -> { expectationId: 'done' | 'pending' }
      confirm: false, // true = his tick waits for a grown-up's OK
    },
    admin: { hash: '', salt: '', tries: 0, lockUntil: 0 }, // parent PIN (salted hash only)
  };
}

function memoryBackend() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => void m.set(k, String(v)),
    removeItem: (k) => void m.delete(k),
  };
}

export function createStore(backend) {
  let storage = backend;
  if (!storage) {
    try {
      storage = globalThis.localStorage;
      const probe = '__lwm_probe__';
      storage.setItem(probe, '1');
      storage.removeItem(probe);
    } catch {
      storage = memoryBackend(); // private mode / blocked storage: play still works, just not saved
    }
  }
  let state = load();
  const listeners = new Set();

  function load() {
    try {
      const raw = storage.getItem(KEY);
      if (!raw) return defaultState();
      return migrate(JSON.parse(raw));
    } catch {
      return defaultState();
    }
  }

  function migrate(s) {
    const base = defaultState();
    if (!s || typeof s !== 'object') return base;
    // v1 is the only version so far: fill in anything missing.
    const out = { ...base, ...s, settings: { ...base.settings, ...(s.settings || {}) } };
    for (const k of ['levels', 'seen', 'days', 'flags']) if (!out[k] || typeof out[k] !== 'object') out[k] = {};
    for (const k of ['trials', 'missions', 'cards']) if (!Array.isArray(out[k])) out[k] = [];
    if (typeof out.xp !== 'number' || !isFinite(out.xp)) out.xp = 0;
    // Sections added after the first release: fill in whatever an older save is missing.
    for (const k of ['rewards', 'chores', 'expectations', 'admin']) {
      out[k] = { ...base[k], ...(s[k] && typeof s[k] === 'object' ? s[k] : {}) };
    }
    for (const k of ['daily', 'tiers', 'earned']) if (!Array.isArray(out.rewards[k])) out.rewards[k] = [];
    for (const k of ['list', 'log']) if (!Array.isArray(out.chores[k])) out.chores[k] = [];
    if (!Array.isArray(out.expectations.list)) out.expectations.list = [];
    if (!out.expectations.days || typeof out.expectations.days !== 'object') out.expectations.days = {};
    out.v = 1;
    return out;
  }

  function save() {
    try {
      storage.setItem(KEY, JSON.stringify(state));
      return true;
    } catch {
      // Storage full: drop the oldest half of the detailed logs and try once more.
      state.trials = state.trials.slice(-Math.floor(MAX_TRIALS / 2));
      state.seen = {};
      try {
        storage.setItem(KEY, JSON.stringify(state));
        return true;
      } catch {
        return false;
      }
    }
  }

  const api = {
    get: () => state,
    /** Mutate the state inside fn, then persist. */
    update(fn) {
      fn(state);
      save();
      for (const l of listeners) l(state);
      return state;
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    reset() {
      state = defaultState();
      save();
      for (const l of listeners) l(state);
    },
    /** Wipe HIS progress but keep what the grown-up set up (settings, rewards, chores, PIN). */
    resetProgress() {
      const fresh = defaultState();
      fresh.settings = state.settings;
      fresh.admin = state.admin;
      fresh.rewards = { ...fresh.rewards, daily: state.rewards.daily, tiers: state.rewards.tiers, countPerfected: state.rewards.countPerfected };
      fresh.chores = { ...fresh.chores, list: state.chores.list, requirePhoto: state.chores.requirePhoto };
      fresh.expectations = { ...fresh.expectations, list: state.expectations.list, confirm: state.expectations.confirm };
      fresh.flags = { welcomed: state.flags.welcomed, installHintClosed: state.flags.installHintClosed };
      state = fresh;
      save();
      for (const l of listeners) l(state);
    },
    exportJSON: () => JSON.stringify(state),
    importJSON(text) {
      const parsed = JSON.parse(text);
      if (!parsed || typeof parsed !== 'object' || parsed.v !== 1) throw new Error('Not a Learn With Me backup');
      state = migrate(parsed);
      save();
      for (const l of listeners) l(state);
    },

    /** One finished trial. Kept compact because there will be thousands. */
    recordTrial(t) {
      api.update((s) => {
        s.trials.push({
          t: Date.now(),
          l: t.level, // level id
          i: t.item, // item id
          k: t.skills || [], // skill tags of the item
          c1: t.correctFirst ? 1 : 0, // right on the first listen
          c2: t.correctSecond ? 1 : 0, // right on the supported second try
          e: t.error || '', // error type of the first attempt ('' if none)
          rp: t.replays || 0, // times he asked to hear it again
          et: t.earlyTaps || 0, // taps made while the voice was still talking
          ms: t.ms || 0, // time from end of instruction to answer
        });
        if (s.trials.length > MAX_TRIALS) s.trials.splice(0, s.trials.length - MAX_TRIALS);
        s.seen[t.item] = Date.now();
        const d = (s.days[todayKey()] ||= { missions: 0, trials: 0, ms: 0 });
        d.trials += 1;
      });
    },

    recordMission(m) {
      api.update((s) => {
        s.missions.push({ t: Date.now(), l: m.level, c: m.correctFirst, n: m.total, st: m.stars, ms: m.ms, et: m.earlyTaps || 0 });
        if (s.missions.length > MAX_MISSIONS) s.missions.splice(0, s.missions.length - MAX_MISSIONS);
        const lv = (s.levels[m.level] ||= { stars: 0, plays: 0, best: 0, last: 0 });
        lv.plays += 1;
        lv.last = Date.now();
        lv.stars = Math.max(lv.stars, m.stars);
        lv.best = Math.max(lv.best, m.correctFirst);
        s.xp += m.xp || 0;
        const d = (s.days[todayKey()] ||= { missions: 0, trials: 0, ms: 0 });
        d.missions += 1;
        d.ms += m.ms || 0;
        if (m.counted) d.counted = (d.counted || 0) + 1;
        // keep the "seen" map from growing without bound
        const ids = Object.keys(s.seen);
        if (ids.length > 3000) {
          ids.sort((a, b) => s.seen[a] - s.seen[b]);
          for (const id of ids.slice(0, ids.length - 2000)) delete s.seen[id];
        }
      });
    },
  };
  return api;
}
