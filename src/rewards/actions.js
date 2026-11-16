// Everything a grown-up can do to the rewards, chores and expectations, as named actions.
// The parent area does all of it through act(): on the device he plays on the action is carried
// out at once; on a grown-up's own device (the family account, src/family/sync.js) the same
// action is sent to his device, which carries it out with this very function. What arrives from
// another device is treated as untrusted: unknown names and odd values change nothing.

import { todayKey } from '../core/dom.js';
import { addItem, editItem, removeItem, decideChore, setExpectation, markGiven } from './logic.js';

const KINDS = ['daily', 'tier', 'chore', 'expect'];
const OPTIONS = {
  countPerfected: (s, on) => { s.rewards.countPerfected = on; }, // do repeats of 3-star levels count toward daily rewards?
  requirePhoto: (s, on) => { s.chores.requirePhoto = on; }, // does a finished chore need a photo?
  confirm: (s, on) => { s.expectations.confirm = on; }, // does his tick need a grown-up's OK?
};
const text = (v) => (typeof v === 'string' ? v : '');
const thing = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});

const ACTIONS = {
  /** { kind, item }  a new reward, chore or expectation */
  add(s, p, now) {
    const item = addItem(s, p.kind, thing(p.item), now);
    return item ? { result: item } : { fail: 'no name', drop: [thing(p.item).photo] };
  },
  /** { kind, id, item }  change one; only the fields that are given change */
  edit(s, p, now) {
    const done = editItem(s, p.kind, text(p.id), thing(p.item), now);
    return done ? { result: done.item, drop: [done.oldPhoto] } : { fail: 'gone', drop: [thing(p.item).photo] };
  },
  /** { kind, id }  remove one */
  remove(s, p) {
    return { drop: [removeItem(s, p.kind, text(p.id))] };
  },
  /** { id } or { src, ref, day }  a reward has been handed over */
  given(s, p) {
    const e = markGiven(s, { id: text(p.id), src: text(p.src), ref: text(p.ref), day: text(p.day) });
    return e ? { result: e } : { fail: 'gone' };
  },
  /** { id, ok, note }  a chore he sent is approved, or sent back with a note */
  chore(s, p, now) {
    const entry = s.chores.log.find((e) => e.id === text(p.id));
    if (!entry || entry.status !== 'pending') return { fail: 'gone' };
    const { photo, won } = decideChore(s, entry.id, !!p.ok, text(p.note), now);
    return { result: { won }, drop: [photo] };
  },
  /**
   * { id, done, day }  one of today's expectations is set to done / not done. `day` is the day it
   * was pressed on (sent along by another device): pressed on Monday evening and only arriving
   * on Tuesday, it must not tick Tuesday's.
   */
  expect(s, p, now) {
    if (text(p.day) && p.day !== todayKey(now)) return { fail: 'late' };
    if (!s.expectations.list.some((e) => e.id === text(p.id))) return { fail: 'gone' };
    setExpectation(s, text(p.id), !!p.done, now);
    return {};
  },
  /** { name, on }  one of the switches in the parent area */
  option(s, p) {
    if (!Object.hasOwn(OPTIONS, text(p.name))) return { fail: 'unknown' };
    OPTIONS[p.name](s, !!p.on);
    return {};
  },
};
const NEEDS_KIND = ['add', 'edit', 'remove'];

/**
 * Carry out one action on the state.
 * Returns { ok, why, result, drop }: `drop` lists pictures that nothing uses any more (the caller
 * deletes them); `why` says in a word what stopped it ('unknown', 'gone', 'no name', 'late').
 */
export function act(state, type, payload, now = new Date()) {
  const p = thing(payload);
  if (!Object.hasOwn(ACTIONS, text(type)) || (NEEDS_KIND.includes(type) && !KINDS.includes(p.kind))) {
    return { ok: false, why: 'unknown', result: null, drop: [] };
  }
  const out = ACTIONS[type](state, p, now);
  return { ok: !out.fail, why: out.fail || '', result: out.result ?? null, drop: (out.drop || []).filter((id) => typeof id === 'string' && id) };
}
