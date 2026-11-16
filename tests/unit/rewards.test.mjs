// Rewards, chores and the parent PIN: the rules, without a browser.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createStore, defaultState } from '../../src/core/store.js';
import { todayKey } from '../../src/core/dom.js';
import { collectRewards, missionCounts, countedToday, owed, choreStatus, submitChore, decideChore, badges, weekKey } from '../../src/rewards/logic.js';
import { hasPin, setPin, checkPin, validPin } from '../../src/core/pin.js';

const memory = () => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k) };
};
const at = (y, mo, d, h = 12) => new Date(y, mo - 1, d, h);
const MON = at(2026, 11, 16);
const TUE = at(2026, 11, 17);
const NEXT_MON = at(2026, 11, 23);

function withRewards() {
  const s = defaultState();
  s.rewards.daily.push({ id: 'd2', title: 'Sticker', icon: 'x', missions: 2 }, { id: 'd4', title: 'Game time', icon: 'x', missions: 4 });
  s.rewards.tiers.push({ id: 't1', title: 'Pizza night', icon: 'x', points: 300 }, { id: 't2', title: 'Big trip', icon: 'x', points: 1000 });
  return s;
}
const play = (s, n, now) => { (s.days[todayKey(now)] ||= { missions: 0, trials: 0, ms: 0, counted: 0 }).counted += n; };

test('daily rewards: won once per day when enough missions are done, and again the next day', () => {
  const s = withRewards();
  play(s, 1, MON);
  assert.deepEqual(collectRewards(s, MON), []);
  play(s, 1, MON);
  assert.deepEqual(collectRewards(s, MON).map((e) => e.ref), ['d2']);
  assert.deepEqual(collectRewards(s, MON), [], 'not awarded twice on the same day');
  play(s, 2, MON);
  assert.deepEqual(collectRewards(s, MON).map((e) => e.ref), ['d4']);
  assert.equal(countedToday(s, TUE), 0, 'a new day starts from zero');
  play(s, 2, TUE);
  assert.deepEqual(collectRewards(s, TUE).map((e) => e.ref), ['d2']);
  assert.equal(owed(s).length, 3);
  s.rewards.earned[0].given = true;
  assert.equal(owed(s).length, 2);
});

test('lifetime tiers: won once, ever, when total points pass the mark', () => {
  const s = withRewards();
  s.xp = 299;
  assert.deepEqual(collectRewards(s, MON), []);
  s.xp = 1200;
  assert.deepEqual(collectRewards(s, MON).map((e) => e.ref).sort(), ['t1', 't2']);
  assert.deepEqual(collectRewards(s, TUE), [], 'never awarded again');
  s.rewards.earned.forEach((e) => { e.given = true; });
  assert.deepEqual(collectRewards(s, NEXT_MON), []);
});

test('repeating a perfected level does not count toward daily rewards unless switched on', () => {
  assert.equal(missionCounts(0, { countPerfected: false }), true);
  assert.equal(missionCounts(2, { countPerfected: false }), true);
  assert.equal(missionCounts(3, { countPerfected: false }), false);
  assert.equal(missionCounts(3, { countPerfected: true }), true);
});

test('chores: open -> pending -> approved adds points; rejected can be tried again', () => {
  const s = withRewards();
  const bed = { id: 'c1', title: 'Make your bed', icon: 'x', points: 20, repeat: 'daily', reward: '' };
  const car = { id: 'c2', title: 'Wash the car', icon: 'x', points: 300, repeat: 'once', reward: '$5' };
  s.chores.list.push(bed, car);
  assert.equal(choreStatus(bed, s.chores.log, MON).state, 'open');
  assert.equal(badges(s, MON).choresOpen, 2);

  const e1 = submitChore(s, bed, 'photo1', MON);
  assert.equal(choreStatus(bed, s.chores.log, MON).state, 'pending');
  assert.equal(badges(s, MON).toCheck, 1);
  assert.equal(s.xp, 0, 'no points until a grown-up approves');

  const sentBack = decideChore(s, e1.id, false, 'Pillow too', MON);
  assert.equal(sentBack.photo, 'photo1', 'the photo is handed back for deletion');
  const st = choreStatus(bed, s.chores.log, MON);
  assert.equal(st.state, 'rejected');
  assert.equal(st.entry.note, 'Pillow too');
  assert.equal(s.xp, 0);

  const e2 = submitChore(s, bed, 'photo2', MON);
  decideChore(s, e2.id, true, '', MON);
  assert.equal(s.xp, 20);
  assert.equal(choreStatus(bed, s.chores.log, MON).state, 'approved');
  assert.equal(choreStatus(bed, s.chores.log, TUE).state, 'open', 'a daily chore comes back tomorrow');
  assert.deepEqual(decideChore(s, e2.id, true, '', MON), { photo: null, won: [] }, 'deciding twice does nothing');
  assert.equal(s.xp, 20);

  const e3 = submitChore(s, car, null, TUE);
  const { won } = decideChore(s, e3.id, true, '', TUE);
  assert.equal(s.xp, 320);
  assert.deepEqual(won.map((w) => `${w.src}:${w.title}`).sort(), ['chore:$5', 'tier:Pizza night'], 'its own reward plus the tier the points unlocked');
  assert.equal(choreStatus(car, s.chores.log, NEXT_MON).state, 'finished', 'a one-off chore stays done');
});

test('weekly chores reset on Monday', () => {
  const s = defaultState();
  const room = { id: 'c3', title: 'Tidy room', icon: 'x', points: 50, repeat: 'weekly', reward: '' };
  s.chores.list.push(room);
  const e = submitChore(s, room, null, MON);
  decideChore(s, e.id, true, '', MON);
  assert.equal(choreStatus(room, s.chores.log, TUE).state, 'approved');
  assert.equal(choreStatus(room, s.chores.log, at(2026, 11, 22)).state, 'approved', 'Sunday is still the same week');
  assert.equal(choreStatus(room, s.chores.log, NEXT_MON).state, 'open');
  assert.notEqual(weekKey(MON), weekKey(NEXT_MON));
  assert.equal(weekKey(MON), weekKey(at(2026, 11, 22)));
});

test('the store counts missions for rewards and survives a save and reload', () => {
  const backend = memory();
  const a = createStore(backend);
  a.update((s) => { s.rewards.daily.push({ id: 'd1', title: 'Treat', icon: 'x', missions: 1 }); });
  a.recordMission({ level: 'w1l1', correctFirst: 6, total: 6, stars: 3, xp: 95, ms: 1000, counted: true });
  a.recordMission({ level: 'w1l1', correctFirst: 6, total: 6, stars: 3, xp: 95, ms: 1000, counted: false });
  const b = createStore(backend);
  assert.equal(countedToday(b.get()), 1);
  assert.equal(b.get().days[todayKey()].missions, 2);
  let won;
  b.update((s) => { won = collectRewards(s); });
  assert.equal(won.length, 1);
  assert.equal(createStore(backend).get().rewards.earned.length, 1);
});

test('old saves without the new sections are filled in', () => {
  const backend = memory();
  backend.setItem('lwm.state.v1', JSON.stringify({ v: 1, xp: 50, levels: {}, trials: [], missions: [], cards: [], days: {}, flags: {}, seen: {}, settings: {} }));
  const s = createStore(backend).get();
  assert.equal(s.xp, 50);
  assert.deepEqual(s.rewards.daily, []);
  assert.deepEqual(s.chores.list, []);
  assert.equal(s.admin.hash, '');
});

test('parent PIN: set once, checked by hash, locks after five wrong tries', async () => {
  const store = createStore(memory());
  assert.equal(hasPin(store), false);
  assert.equal(validPin('12'), false);
  assert.equal(validPin('12ab56'), false);
  assert.equal(validPin('246810'), true);
  await setPin(store, '246810');
  assert.equal(hasPin(store), true);
  assert.ok(!JSON.stringify(store.get()).includes('246810'), 'the PIN itself is never stored');
  assert.equal(await checkPin(store, '246810', 1000), 'ok');
  for (let i = 0; i < 4; i++) assert.equal(await checkPin(store, '000000', 2000), 'wrong');
  assert.equal(await checkPin(store, '000000', 2000), 'locked');
  assert.equal(await checkPin(store, '246810', 3000), 'locked', 'even the right PIN waits out the lock');
  assert.equal(await checkPin(store, '246810', 2000 + 31000), 'ok');
});
