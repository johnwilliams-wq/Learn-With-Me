// What a bug hunt on the parent area found in the rules behind it. Each of these went wrong once.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createStore, memoryBackend, defaultState } from '../../src/core/store.js';
import { addItem, editItem, submitChore, decideChore, choreStatus, expectationsToday, rewardsLocked, tickExpectation, setExpectation } from '../../src/rewards/logic.js';
import { act } from '../../src/rewards/actions.js';
import { setPin, checkPin } from '../../src/core/pin.js';
import { overview } from '../../src/listening/insights.js';
import { snapshot } from '../../src/family/shape.js';

const day = (n, h = 10) => new Date(2026, 10, 16 + n, h, 0);

test('a one-time chore that is finished stays finished, however many chores come after it', () => {
  const s = defaultState();
  const car = addItem(s, 'chore', { title: 'Wash the car', points: 300, repeat: 'once', reward: 'Five dollars' });
  const beds = [1, 2, 3, 4].map((i) => addItem(s, 'chore', { title: `Daily ${i}`, points: 5, repeat: 'daily' }));
  decideChore(s, submitChore(s, car, null, day(0)).id, true, '', day(0));
  assert.equal(choreStatus(car, s.chores.log, day(0)).state, 'finished');
  const waiting = submitChore(s, beds[0], 'pwaiting01', day(0)); // one that nobody checks for a long time
  for (let d = 1; d <= 90; d++) {
    for (const bed of beds.slice(1)) decideChore(s, submitChore(s, bed, null, day(d)).id, true, '', day(d));
    for (let k = 0; k < 2; k++) decideChore(s, submitChore(s, beds[0], null, day(d, 11 + k)).id, false, 'again', day(d, 11 + k));
  }
  assert.ok(s.chores.log.length <= 302, `the log stays short (${s.chores.log.length})`);
  assert.equal(choreStatus(car, s.chores.log, day(91)).state, 'finished', 'it must not come back to be done and paid a second time');
  assert.ok(s.chores.log.some((e) => e.id === waiting.id && e.photo === 'pwaiting01'), 'an entry that still waits for a check is never cut away');
});

test('a chore sent back the next morning still tells him why', () => {
  const s = defaultState();
  const bed = addItem(s, 'chore', { title: 'Make your bed', points: 20, repeat: 'daily' });
  const entry = submitChore(s, bed, null, day(0, 19));
  decideChore(s, entry.id, false, 'The pillow too, please', day(1, 7));
  const st = choreStatus(bed, s.chores.log, day(1, 8));
  assert.deepEqual([st.state, st.entry.note], ['rejected', 'The pillow too, please']);
  decideChore(s, submitChore(s, bed, null, day(1, 9)).id, true, '', day(1, 10)); // he tries again and it is approved
  assert.equal(choreStatus(bed, s.chores.log, day(1, 11)).state, 'approved');
  assert.equal(choreStatus(bed, s.chores.log, day(2)).state, 'open', 'a new day starts open again');
  // a weekly chore sent on Sunday and sent back on Monday
  const room = addItem(s, 'chore', { title: 'Tidy your room', points: 50, repeat: 'weekly' });
  const sunday = new Date(2026, 10, 22, 18), monday = new Date(2026, 10, 23, 8);
  decideChore(s, submitChore(s, room, null, sunday).id, false, 'Under the bed', monday);
  assert.equal(choreStatus(room, s.chores.log, monday).entry?.note, 'Under the bed');
});

test('a chore made "one time only" while it waits for a check is not open for a second go', () => {
  const s = defaultState();
  const c = addItem(s, 'chore', { title: 'Rake the leaves', points: 40, repeat: 'daily' });
  const entry = submitChore(s, c, null, day(0, 9));
  editItem(s, 'chore', c.id, { repeat: 'once' }, day(0, 12));
  assert.equal(choreStatus(s.chores.list[0], s.chores.log, day(0, 13)).state, 'pending', 'his entry still waits');
  decideChore(s, entry.id, true, '', day(0, 14));
  assert.deepEqual([choreStatus(s.chores.list[0], s.chores.log, day(1)).state, s.xp], ['finished', 40]);
  // without a waiting entry it starts afresh, as before
  const d = addItem(s, 'chore', { title: 'Dishes', points: 10, repeat: 'daily' });
  decideChore(s, submitChore(s, d, null, day(0)).id, true, '', day(0));
  editItem(s, 'chore', d.id, { repeat: 'once' }, day(1));
  assert.equal(choreStatus(s.chores.list[1], s.chores.log, day(1, 12)).state, 'open');
});

test('switching "needs my OK" off lets the ticks he has already made count', () => {
  const s = defaultState();
  const a = addItem(s, 'expect', { title: 'Brush your teeth' });
  const b = addItem(s, 'expect', { title: 'Pack your bag' });
  act(s, 'option', { name: 'confirm', on: true });
  tickExpectation(s, a.id, day(0));
  tickExpectation(s, b.id, day(0));
  assert.deepEqual([expectationsToday(s, day(0)).waiting, rewardsLocked(s, day(0))], [2, true]);
  act(s, 'option', { name: 'confirm', on: false });
  const ex = expectationsToday(s, day(0));
  assert.deepEqual([ex.done, ex.waiting, ex.allDone, rewardsLocked(s, day(0))], [2, 0, true, false], 'nobody is left to give the OK: they are done');
  act(s, 'option', { name: 'confirm', on: true });
  assert.equal(expectationsToday(s, day(0)).waiting, 2, 'switched on again, they wait again');
});

test('an expectation can always be ticked, also when later days are already on record', () => {
  const s = defaultState();
  const a = addItem(s, 'expect', { title: 'Brush your teeth' });
  for (let d = 1; d <= 20; d++) setExpectation(s, a.id, true, day(d)); // the clock was ahead; now it has been put right
  assert.equal(tickExpectation(s, a.id, day(0)), 'done');
  assert.equal(expectationsToday(s, day(0)).done, 1);
  assert.ok(Object.keys(s.expectations.days).length <= 14);
  assert.equal(act(s, 'expect', { id: a.id, done: false }, day(0)).ok, true, 'and act() never throws for it');
  assert.equal(expectationsToday(s, day(0)).done, 0);
});

test('the PIN: a backup carries none, a restore leaves this device\'s PIN alone, and a clock put back never locks for hours', async () => {
  const store = createStore(memoryBackend());
  await setPin(store, '246810');
  const mine = { ...store.get().admin };
  store.update((s) => { s.xp = 95; });
  const backup = store.exportJSON();
  assert.ok(!('admin' in JSON.parse(backup)) && !backup.includes(mine.hash), 'not even its hash');
  await setPin(store, '112233'); // the PIN is changed after the backup was made
  const now = { ...store.get().admin };
  store.importJSON(backup);
  assert.deepEqual([store.get().admin.hash, store.get().xp], [now.hash, 95], 'the old PIN does not come back');
  store.importJSON(JSON.stringify({ ...JSON.parse(backup), admin: { hash: 'another', salt: 's', tries: 0, lockUntil: 0 } })); // a backup made by an older version
  assert.equal(store.get().admin.hash, now.hash);
  store.importJSON(JSON.stringify({ ...JSON.parse(backup), admin: { hash: '', salt: '', tries: 0, lockUntil: 0 } }));
  assert.equal(store.get().admin.hash, now.hash, 'and a backup without one does not take the lock off');

  const t0 = Date.UTC(2026, 10, 16, 12);
  for (let i = 0; i < 5; i++) await checkPin(store, '000000', t0);
  assert.equal(await checkPin(store, '112233', t0 + 1000), 'locked');
  assert.equal(await checkPin(store, '112233', t0 + 31000), 'ok', 'half a minute later it opens');
  for (let i = 0; i < 5; i++) await checkPin(store, '000000', t0 + 40000);
  assert.equal(await checkPin(store, '112233', t0 - 6 * 3600000), 'ok', 'the clock was put back six hours: that must not mean six hours locked');
});

test('erasing his progress keeps what the grown-up set up - and a finished one-time chore stays finished', () => {
  const store = createStore(memoryBackend());
  store.update((s) => {
    s.xp = 500;
    const car = addItem(s, 'chore', { title: 'Wash the car', points: 300, repeat: 'once' });
    const bed = addItem(s, 'chore', { title: 'Make your bed', points: 20, repeat: 'daily' });
    addItem(s, 'tier', { title: 'Cinema', points: 400 });
    decideChore(s, submitChore(s, car, null, day(0)).id, true, '', day(0));
    submitChore(s, bed, 'pwaiting01', day(0));
  });
  store.resetProgress();
  const s = store.get();
  assert.deepEqual([s.xp, s.rewards.earned.length, s.rewards.tiers.length, s.chores.list.length], [0, 0, 1, 2]);
  assert.equal(choreStatus(s.chores.list[0], s.chores.log, day(1)).state, 'finished');
  assert.ok(s.chores.log.every((e) => e.status === 'approved' && !e.photo), 'nothing waits any more, so no photo is pointed to');
});

test('the Progress numbers are the true totals, and the same on his device and on a grown-up\'s', () => {
  const s = defaultState();
  for (let d = 0; d < 200; d++) {
    const key = `2026-${String(1 + Math.floor(d / 28)).padStart(2, '0')}-${String(1 + (d % 28)).padStart(2, '0')}`;
    s.days[key] = { missions: 3, trials: 18, ms: 600000, counted: 2 };
  }
  s.days['2026-12-30'] = { missions: 0, trials: 2, ms: 0 }; // a day on which he started a mission and did not finish it
  s.missions = Array.from({ length: 400 }, (_, i) => ({ t: i, l: 'camp1', c: 6, n: 6, st: 3, ms: 200000 })); // (the list itself keeps the latest 400)
  const o = overview(s);
  const far = snapshot(s, new Date(2026, 11, 31)).summary;
  assert.deepEqual([o.missions, o.days, o.minutes], [600, 200, 2000]);
  assert.deepEqual([far.missions, far.days, far.minutes], [o.missions, o.days, o.minutes]);
});

test('the game open in a second tab: what it saved is taken over, not undone', () => {
  const handlers = [];
  const had = globalThis.addEventListener;
  globalThis.addEventListener = (type, fn) => { if (type === 'storage') handlers.push(fn); };
  try {
    const backend = memoryBackend();
    const older = createStore(backend);
    const newer = createStore(backend);
    newer.update((s) => { addItem(s, 'tier', { title: 'Added in the other tab', points: 400 }); });
    for (const fn of handlers) fn({ key: 'lwm.state.v1', storageArea: backend }); // what the browser tells the other tabs
    older.update((s) => { s.xp += 10; });
    const saved = JSON.parse(backend.getItem('lwm.state.v1'));
    assert.deepEqual([saved.rewards.tiers.map((x) => x.title), saved.xp], [['Added in the other tab'], 10]);
  } finally {
    if (had) globalThis.addEventListener = had; else delete globalThis.addEventListener;
  }
});
