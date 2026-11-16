// Rewards, chores and the parent PIN: the rules, without a browser.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createStore, defaultState } from '../../src/core/store.js';
import { todayKey } from '../../src/core/dom.js';
import { collectRewards, missionCounts, countedToday, owed, choreStatus, submitChore, decideChore, badges, weekKey, expectationsToday, tickExpectation, setExpectation, rewardsLocked,
  addItem, editItem, removeItem, cleanItem, ladder, NOTE_MAX, TITLE_MAX } from '../../src/rewards/logic.js';
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
  assert.deepEqual(s.expectations, { list: [], days: {}, confirm: false });
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

test('expectations: ticked each day; rewards stay locked until all of them are done', () => {
  const s = defaultState();
  assert.equal(rewardsLocked(s, MON), false, 'with no expectations nothing is ever locked');
  s.expectations.list.push({ id: 'e1', title: 'Brush teeth', icon: 'x' }, { id: 'e2', title: 'Homework', icon: 'x' });
  assert.equal(rewardsLocked(s, MON), true);
  assert.equal(tickExpectation(s, 'e1', MON), 'done');
  assert.equal(rewardsLocked(s, MON), true, 'one of two is not enough');
  assert.equal(badges(s, MON).expectLeft, 1);
  assert.equal(tickExpectation(s, 'e2', MON), 'done');
  assert.equal(rewardsLocked(s, MON), false);
  assert.equal(tickExpectation(s, 'e2', MON), 'open', 'he can take a tick back');
  assert.equal(rewardsLocked(s, MON), true);
  tickExpectation(s, 'e2', MON);
  assert.equal(expectationsToday(s, MON).done, 2);
  assert.equal(rewardsLocked(s, TUE), true, 'a new day starts unticked');
  assert.equal(expectationsToday(s, TUE).done, 0);

  // "needs my OK": his tick only asks; a grown-up decides
  s.expectations.confirm = true;
  assert.equal(tickExpectation(s, 'e1', TUE), 'pending');
  assert.equal(badges(s, TUE).toConfirm, 1);
  assert.equal(rewardsLocked(s, TUE), true, 'a tick that is waiting does not unlock anything');
  setExpectation(s, 'e1', true, TUE);
  setExpectation(s, 'e2', true, TUE);
  assert.equal(rewardsLocked(s, TUE), false);
  assert.equal(tickExpectation(s, 'e1', TUE), 'done', 'he cannot undo what a grown-up confirmed');
  setExpectation(s, 'e1', false, TUE);
  assert.equal(rewardsLocked(s, TUE), true);

  // history is trimmed to two weeks
  for (let d = 1; d <= 28; d++) tickExpectation(s, 'e2', at(2026, 12, d));
  assert.ok(Object.keys(s.expectations.days).length <= 15);
});

test('erasing his progress keeps the expectations a grown-up set up', () => {
  const store = createStore(memory());
  store.update((s) => { s.expectations.list.push({ id: 'e1', title: 'Brush teeth', icon: 'x' }); s.expectations.confirm = true; s.xp = 50; tickExpectation(s, 'e1'); });
  store.resetProgress();
  const s = store.get();
  assert.equal(s.xp, 0);
  assert.equal(s.expectations.list.length, 1);
  assert.equal(s.expectations.confirm, true);
  assert.deepEqual(s.expectations.days, {});
});

test('a save that cannot be read is kept under another name, never thrown away', () => {
  for (const raw of ['{"v":1,"xp":4476,"cards":["g-shield-blue"', 'null', '[]', '"oops"']) {
    const backend = memory();
    backend.setItem('lwm.state.v1', raw);
    const store = createStore(backend);
    assert.equal(store.get().xp, 0, 'play starts again from nothing');
    store.update((s) => { s.xp = 5; }); // the first save overwrites the unreadable one...
    assert.equal(backend.getItem('lwm.state.v1.bad'), raw, `...but a copy is kept (${raw.slice(0, 12)})`);
    // a later bad save does not replace the first copy
    backend.setItem('lwm.state.v1', '{{{');
    createStore(backend);
    assert.equal(backend.getItem('lwm.state.v1.bad'), raw);
  }
  // a good save leaves no such copy
  const fine = memory();
  createStore(fine).update((s) => { s.xp = 7; });
  createStore(fine);
  assert.equal(fine.getItem('lwm.state.v1.bad'), null);
});

test('what a grown-up types is tidied and kept within limits', () => {
  assert.deepEqual(cleanItem('daily', { title: '  Game \n  time  ', icon: '🎮', note: ' fifteen   minutes ', missions: '99' }), { title: 'Game time', icon: '🎮', note: 'fifteen minutes', missions: 20 });
  assert.deepEqual(cleanItem('tier', { title: 'Bike', points: '3' }), { title: 'Bike', icon: '', note: '', points: 10, photo: null });
  assert.deepEqual(cleanItem('tier', { title: 'Bike', points: 'abc', photo: 'p1' }), { title: 'Bike', icon: '', note: '', points: 10, photo: 'p1' });
  assert.deepEqual(cleanItem('chore', { title: 'Bed', points: -5, repeat: 'hourly', reward: ' $1 ' }), { title: 'Bed', icon: '', note: '', points: 0, repeat: 'daily', reward: '$1' });
  assert.deepEqual(cleanItem('expect', { title: 'Teeth' }), { title: 'Teeth', icon: '', note: '' });
  assert.equal(cleanItem('expect', { title: 'x'.repeat(500), note: 'y'.repeat(500) }).title.length, TITLE_MAX);
  assert.equal(cleanItem('expect', { title: 'x', note: 'y'.repeat(500) }).note.length, NOTE_MAX);
});

test('adding, changing and removing rewards, chores and expectations', () => {
  const s = defaultState();
  assert.equal(addItem(s, 'chore', { title: '   ' }), null, 'nothing without a name');
  const bed = addItem(s, 'chore', { title: 'Make your bed', icon: '🛏️', points: 20, repeat: 'daily', note: 'Pillow on top' });
  const teeth = addItem(s, 'expect', { title: 'Brush your teeth', icon: '🦷' });
  const game = addItem(s, 'daily', { title: 'Game tme', icon: '🎮', missions: 2 }, MON);
  assert.deepEqual(s.chores.list, [{ id: bed.id, title: 'Make your bed', icon: '🛏️', note: 'Pillow on top', points: 20, repeat: 'daily', reward: '' }]);
  assert.equal(s.expectations.list[0].note, '');

  // only what is given changes; the id and the place in the list stay
  const res = editItem(s, 'chore', bed.id, { points: 35 });
  assert.equal(res.item, s.chores.list[0]);
  assert.deepEqual(s.chores.list[0], { id: bed.id, title: 'Make your bed', icon: '🛏️', note: 'Pillow on top', points: 35, repeat: 'daily', reward: '' });
  editItem(s, 'expect', teeth.id, { note: 'Two minutes' });
  assert.deepEqual(s.expectations.list, [{ id: teeth.id, title: 'Brush your teeth', icon: '🦷', note: 'Two minutes' }]);
  assert.equal(editItem(s, 'chore', bed.id, { title: '  ' }), null, 'a name cannot be emptied');
  assert.equal(s.chores.list[0].title, 'Make your bed');
  assert.equal(editItem(s, 'chore', 'nope', { title: 'x' }), null);

  // a reward he has won and is still owed follows a spelling fix; one already handed over keeps its wording
  play(s, 2, MON);
  collectRewards(s, MON);
  assert.equal(owed(s)[0].title, 'Game tme');
  editItem(s, 'daily', game.id, { title: 'Game time', icon: '📺' }, MON);
  assert.deepEqual([owed(s)[0].title, owed(s)[0].icon], ['Game time', '📺']);
  s.rewards.earned[0].given = true;
  editItem(s, 'daily', game.id, { title: 'Screen time' }, MON);
  assert.equal(s.rewards.earned[0].title, 'Game time');

  // an old save has no descriptions: editing fills the field in, nothing else changes
  s.rewards.daily.push({ id: 'old', title: 'Sticker', icon: '⭐', missions: 3 });
  assert.deepEqual(editItem(s, 'daily', 'old', { title: 'Stickers' }, MON).item, { id: 'old', title: 'Stickers', icon: '⭐', missions: 3, note: '' });

  assert.equal(removeItem(s, 'chore', bed.id), null);
  assert.equal(s.chores.list.length, 0);
  assert.equal(removeItem(s, 'chore', bed.id), null, 'removing twice is harmless');
});

test('reward pictures: replacing or removing one names the old picture so it can be deleted', () => {
  const s = defaultState();
  const t = addItem(s, 'tier', { title: 'Skin pack', points: 400, photo: 'p1' });
  assert.equal(editItem(s, 'tier', t.id, { title: 'New skin pack' }).oldPhoto, null, 'a change that does not mention the picture keeps it');
  assert.equal(s.rewards.tiers[0].photo, 'p1');
  assert.equal(editItem(s, 'tier', t.id, { photo: 'p2' }).oldPhoto, 'p1');
  assert.equal(editItem(s, 'tier', t.id, { photo: null }).oldPhoto, 'p2');
  assert.equal(s.rewards.tiers[0].photo, null);
  editItem(s, 'tier', t.id, { photo: 'p3' });
  assert.equal(removeItem(s, 'tier', t.id), 'p3');
});

test('the reward ladder: every points reward in order, where he stands, and what is ahead', () => {
  const s = defaultState();
  assert.deepEqual(ladder(s), { xp: 0, steps: [], at: 0, next: null });
  addItem(s, 'tier', { title: 'Coins', points: 2000 }, MON);
  addItem(s, 'tier', { title: 'Skin pack', points: 400 }, MON);
  addItem(s, 'tier', { title: 'Mount', points: 800 }, MON);
  const view = () => { const L = ladder(s); return [L.steps.map((x) => `${x.title}:${x.state}:${x.left}`).join(' '), Number(L.at.toFixed(3)), L.next?.title || null]; };
  assert.deepEqual(view(), ['Skin pack:next:400 Mount:ahead:800 Coins:ahead:2000', 0, 'Skin pack']);
  s.xp = 200;
  assert.deepEqual(view(), ['Skin pack:next:200 Mount:ahead:600 Coins:ahead:1800', 0.5, 'Skin pack']);
  s.xp = 463;
  collectRewards(s, MON);
  assert.deepEqual(view(), ['Skin pack:won:0 Mount:next:337 Coins:ahead:1537', Number((1 + 63 / 400).toFixed(3)), 'Mount']);
  owed(s)[0].given = true;
  assert.equal(ladder(s).steps[0].state, 'given');
  s.xp = 800;
  assert.deepEqual(view().slice(1), [2, 'Coins'], 'exactly on a step counts as on it');
  s.xp = 5000;
  collectRewards(s, MON);
  assert.deepEqual(view(), ['Skin pack:given:0 Mount:won:0 Coins:won:0', 3, null], 'never past the last step');

  // a step that is added below his points is his at once; lowering one below his points too
  const s2 = defaultState();
  s2.xp = 500;
  addItem(s2, 'tier', { title: 'Sticker', points: 100 }, MON);
  assert.deepEqual(owed(s2).map((e) => e.title), ['Sticker']);
  const far = addItem(s2, 'tier', { title: 'Bike', points: 9000 }, MON);
  assert.equal(owed(s2).length, 1);
  editItem(s2, 'tier', far.id, { points: 450 }, MON);
  assert.deepEqual(owed(s2).map((e) => e.title), ['Sticker', 'Bike']);
  // raising it again does not take the reward back (rewards are never taken away)
  editItem(s2, 'tier', far.id, { points: 9000 }, MON);
  assert.equal(ladder(s2).steps.find((x) => x.title === 'Bike').state, 'won');
  // a step he had won stays won even when the step is removed from the ladder
  removeItem(s2, 'tier', far.id);
  assert.deepEqual(owed(s2).map((e) => e.title), ['Sticker', 'Bike']);
  assert.deepEqual(ladder(s2).steps.map((x) => x.title), ['Sticker']);
});
