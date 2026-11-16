// What the device he plays on tells the family account about itself (snapshot), and how a
// grown-up's own device reads it (stateFrom, viewOf). Pure functions, unit-tested.
//
// Only what a grown-up needs in order to manage things from elsewhere is sent: the lists they
// typed, his points, what he is owed, chores waiting to be checked, today's expectations and a
// few totals. His detailed play history (every turn, every slip) never leaves the device.

import { todayKey } from '../core/dom.js';
import { countedToday, wellFormed } from '../rewards/logic.js';
import { act } from '../rewards/actions.js';

// A copy as plain data. Every text in it is made storable on the way (wellFormed): a name that was
// cut in the middle of an emoji long ago must not stop his device from reporting.
const copy = (v) => JSON.parse(JSON.stringify(v), (key, value) => (typeof value === 'string' ? wellFormed(value) : value));
export const plain = copy;
const rows = (v) => (Array.isArray(v) ? v.filter((x) => x && typeof x === 'object' && typeof x.id === 'string') : []);
const thing = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});

export function snapshot(state, now = new Date()) {
  const today = todayKey(now);
  const days = Object.values(state.days || {});
  const earned = state.rewards.earned;
  const log = state.chores.log;
  return copy({
    v: 1,
    at: +now,
    today,
    xp: state.xp,
    counted: countedToday(state, now), // missions today that count toward the daily rewards
    rewards: {
      daily: state.rewards.daily,
      tiers: state.rewards.tiers,
      // what he is owed, every mine reward he has won (that is how a won one is known), and the latest of the rest
      earned: earned.filter((e, i) => !e.given || e.src === 'tier' || i >= earned.length - 60),
      countPerfected: !!state.rewards.countPerfected,
    },
    chores: {
      list: state.chores.list,
      log: log.filter((e, i) => e.status === 'pending' || i >= log.length - 60),
      requirePhoto: state.chores.requirePhoto !== false,
    },
    expectations: { list: state.expectations.list, days: { [today]: state.expectations.days[today] || {} }, confirm: !!state.expectations.confirm },
    summary: {
      missions: days.reduce((n, d) => n + (d.missions || 0), 0),
      days: days.length,
      minutes: Math.round(days.reduce((n, d) => n + (d.ms || 0), 0) / 60000),
      last: state.missions.length ? state.missions[state.missions.length - 1].t : 0,
    },
  });
}

/** Two snapshots say the same thing when only their time differs. */
export const sameNews = (a, b) => JSON.stringify({ ...a, at: 0 }) === JSON.stringify({ ...b, at: 0 });

/**
 * A snapshot as a state the rules (src/rewards/logic.js) and the parent area can work with.
 * It comes from the database, so nothing about its form is taken for granted.
 */
export function stateFrom(data, now = new Date()) {
  const d = copy(thing(data));
  const today = todayKey(now);
  const r = thing(d.rewards), c = thing(d.chores), x = thing(d.expectations);
  const number = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  return {
    at: number(d.at),
    xp: Math.max(0, number(d.xp)),
    days: { [today]: { counted: d.today === today ? number(d.counted) : 0 } },
    rewards: { daily: rows(r.daily), tiers: rows(r.tiers), earned: rows(r.earned), countPerfected: !!r.countPerfected },
    chores: { list: rows(c.list), log: rows(c.log), requirePhoto: c.requirePhoto !== false },
    expectations: { list: rows(x.list), days: { [today]: thing(thing(x.days)[today]) }, confirm: !!x.confirm },
    summary: { missions: number(thing(d.summary).missions), days: number(thing(d.summary).days), minutes: number(thing(d.summary).minutes), last: number(thing(d.summary).last) },
  };
}

/**
 * What a grown-up's device shows: his state as last heard, with this device's own changes that
 * his device has not carried out yet applied on top (so a change shows at once). Every action
 * can safely be applied a second time, so it does not matter if one of them is in both.
 */
export function viewOf(data, waiting = [], now = new Date()) {
  const state = stateFrom(data, now);
  for (const c of waiting) {
    try { act(state, c.type, c.payload, now); } catch { /* an odd one changes nothing */ }
  }
  return state;
}
