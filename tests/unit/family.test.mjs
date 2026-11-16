// The family account: the named actions, what is shared, and two devices (the one he plays on
// and a grown-up's own) keeping in step through a stand-in for the family database
// (tests/e2e/family-server.cjs). The real client code is used throughout - only the server
// and the picture store are stand-ins.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createStore, memoryBackend, defaultState } from '../../src/core/store.js';
import { act } from '../../src/rewards/actions.js';
import { submitChore, addItem, owed, expectationsToday } from '../../src/rewards/logic.js';
import { snapshot, stateFrom, viewOf, sameNews } from '../../src/family/shape.js';
import { createApi } from '../../src/family/api.js';
import { createFamily, createBox, newId } from '../../src/family/sync.js';
import { familyConfig } from '../../src/family/config.js';

const { startFamilyServer } = createRequire(import.meta.url)('../e2e/family-server.cjs');

// ---------------------------------------------------------------- helpers

const jpeg = (text = 'a picture') => new Blob([text], { type: 'image/jpeg' });
function photoShelf() {
  const kept = new Map();
  let n = 0;
  return {
    kept,
    load: async (id) => kept.get(id) || null,
    has: async (id) => kept.has(id),
    save: async (blob, id = `ptest${String(++n).padStart(4, '0')}`) => { kept.set(id, blob); return id; },
    delete: async (id) => void kept.delete(id),
  };
}
/** One device: its own save, its own pictures, its own record of the account. */
function device(server, { clock, screen, slow = 0 } = {}) {
  const store = createStore(memoryBackend());
  const box = createBox(memoryBackend());
  const photos = photoShelf();
  const fetchFn = slow ? (...a) => new Promise((r) => setTimeout(r, slow)).then(() => fetch(...a)) : undefined;
  const api = createApi({ url: server.url, key: 'test-key', timeout: 3000, session: { get: () => box.get().session, set: (s) => box.set((b) => { b.session = s; }) }, ...(fetchFn ? { fetchFn } : {}) });
  const family = createFamily({ store, api, box, photos, ...(clock ? { clock } : {}), ...(screen ? { screen } : {}) });
  return { store, box, photos, api, family };
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** A family with the device he plays on (with a few things on it) and a grown-up's device, both signed in. */
async function household(t) {
  const server = await startFamilyServer();
  t.after(() => server.close());
  const ipad = device(server);
  ipad.store.update((s) => {
    s.xp = 500;
    addItem(s, 'daily', { title: 'Game time', icon: '🎮', missions: 2 });
    addItem(s, 'tier', { title: 'Trampoline park', icon: '🏆', points: 800 });
    addItem(s, 'chore', { title: 'Make your bed', icon: '🛏️', points: 20, repeat: 'daily' });
    addItem(s, 'expect', { title: 'Brush your teeth', icon: '🦷' });
  });
  assert.equal(await ipad.family.signUp('family@example.com', 'correct horse'), 'in');
  assert.deepEqual(await ipad.family.setRole('player'), { ok: true });
  const phone = device(server);
  await phone.family.signIn('family@example.com', 'correct horse');
  assert.deepEqual(await phone.family.setRole('manager'), { ok: true });
  /** One exchange: the phone sends, the device he plays on carries out and reports, the phone reads. */
  const settle = async () => { await phone.family.sync(); await ipad.family.sync(); await phone.family.sync(); };
  return { server, ipad, phone, settle };
}
const titles = (list) => list.map((x) => x.title);

// ---------------------------------------------------------------- the named actions

test('actions: add, change, remove - and the same thing arriving twice is done once', () => {
  const s = defaultState();
  const added = act(s, 'add', { kind: 'tier', item: { id: 'abc123def', title: '  New   bike ', points: 2000, photo: 'pnew0001' } });
  assert.equal(added.ok, true);
  assert.deepEqual([added.result.id, added.result.title, added.result.points], ['abc123def', 'New bike', 2000]);
  act(s, 'add', { kind: 'tier', item: { id: 'abc123def', title: 'New bike', points: 2000 } });
  assert.equal(s.rewards.tiers.length, 1, 'the same id is added once');
  const edited = act(s, 'edit', { kind: 'tier', id: 'abc123def', item: { title: 'Red bike', photo: 'pnew0002' } });
  assert.deepEqual([edited.ok, edited.result.title, edited.drop], [true, 'Red bike', ['pnew0001']], 'the old picture is handed back to be deleted');
  assert.equal(act(s, 'edit', { kind: 'tier', id: 'abc123def', item: { title: 'Red bike', photo: 'pnew0002' } }).drop.length, 0, 'a second time changes nothing');
  const gone = act(s, 'edit', { kind: 'tier', id: 'nothere', item: { title: 'x', photo: 'porphan01' } });
  assert.deepEqual([gone.ok, gone.why, gone.drop], [false, 'gone', ['porphan01']], 'a picture sent for a thing that has gone is handed back too');
  assert.deepEqual(act(s, 'remove', { kind: 'tier', id: 'abc123def' }).drop, ['pnew0002']);
  assert.equal(s.rewards.tiers.length, 0);
  assert.equal(act(s, 'remove', { kind: 'tier', id: 'abc123def' }).ok, true, 'removing what is gone is fine');
});

test('actions: handing out, checking a chore, expectations and the switches', () => {
  const s = defaultState();
  s.xp = 100;
  const tier = addItem(s, 'tier', { title: 'Cinema', points: 50 }); // reached already: won at once
  const [e] = owed(s);
  assert.equal(e.ref, tier.id);
  // pressed on another device, which only knew it under its own made-up id
  assert.equal(act(s, 'given', { id: 'someoneelses', src: 'tier', ref: tier.id, day: e.day }).ok, true);
  assert.equal(owed(s).length, 0);
  assert.equal(act(s, 'given', { id: e.id }).ok, false, 'already handed out: nothing to do');

  const chore = addItem(s, 'chore', { title: 'Dishes', points: 30, repeat: 'daily' });
  const entry = submitChore(s, chore, 'pchore001');
  const ok = act(s, 'chore', { id: entry.id, ok: true });
  assert.deepEqual([ok.ok, ok.drop, s.xp], [true, ['pchore001'], 130]);
  assert.deepEqual([act(s, 'chore', { id: entry.id, ok: true }).ok, s.xp], [false, 130], 'approved twice: the points arrive once');

  const ex = addItem(s, 'expect', { title: 'Teeth' });
  act(s, 'expect', { id: ex.id, done: true });
  assert.equal(expectationsToday(s).done, 1);
  assert.equal(act(s, 'expect', { id: 'nothere', done: true }).ok, false);
  act(s, 'option', { name: 'confirm', on: true });
  act(s, 'option', { name: 'requirePhoto', on: false });
  act(s, 'option', { name: 'countPerfected', on: 1 });
  assert.deepEqual([s.expectations.confirm, s.chores.requirePhoto, s.rewards.countPerfected], [true, false, true]);
});

test('actions: what arrives from another device is not trusted', () => {
  const s = defaultState();
  const before = JSON.stringify(s);
  for (const [type, payload] of [
    ['nope', {}], ['__proto__', {}], ['constructor', {}], ['add', null], ['add', { kind: '__proto__', item: { title: 'x' } }], ['add', { kind: 'tier' }],
    ['add', { kind: 'tier', item: 'text' }], ['edit', { kind: 'chore', id: { $ne: 1 }, item: [] }], ['remove', { kind: 'nope', id: 'x' }],
    ['given', { id: 7 }], ['chore', { id: null, ok: true }], ['expect', {}], ['option', { name: 'admin', on: true }], ['option', { name: 'toString', on: true }], ['option', []],
  ]) {
    const out = act(s, type, payload);
    assert.equal(out.ok, false, `${type} ${JSON.stringify(payload)} should do nothing`);
  }
  assert.equal(JSON.stringify(s), before, 'nothing changed');
  const long = act(s, 'add', { kind: 'chore', item: { title: 'x'.repeat(500), note: 'y'.repeat(5000), points: 1e12, repeat: 'hourly', icon: '<script>', id: '../../etc' } });
  assert.deepEqual([long.result.title.length, long.result.note.length, long.result.points, long.result.repeat], [60, 200, 10000, 'daily']);
  assert.match(long.result.id, /^[a-z0-9]+$/, 'an odd id is replaced');
});

// ---------------------------------------------------------------- what is shared

test('what is shared: the lists, his points and what is waiting - not his play history', () => {
  const s = defaultState();
  s.xp = 640;
  s.trials = [{ t: 1, l: 'camp1', i: 'x', c1: 1 }];
  s.missions = [{ t: 1700000000000, l: 'camp1', c: 6, n: 6, st: 3, ms: 60000 }];
  s.levels = { camp1: { stars: 3, plays: 1 } };
  s.cards = ['c1'];
  s.admin = { hash: 'secret-hash', salt: 'salt', tries: 0, lockUntil: 0 };
  s.settings.slowVoice = true;
  addItem(s, 'tier', { title: 'Cinema', points: 800, photo: 'ppic00001' });
  const now = new Date(2026, 10, 16, 15, 0);
  s.days['2026-11-16'] = { missions: 3, trials: 18, ms: 600000, counted: 2 };
  const snap = snapshot(s, now);
  assert.deepEqual(Object.keys(snap).sort(), ['at', 'chores', 'counted', 'expectations', 'rewards', 'summary', 'today', 'v', 'xp']);
  const text = JSON.stringify(snap);
  for (const secret of ['secret-hash', 'salt', 'trials', 'camp1', 'slowVoice', '"cards"']) assert.ok(!text.includes(secret), `${secret} must not be shared`);
  assert.deepEqual([snap.xp, snap.counted, snap.summary.missions, snap.summary.minutes], [640, 2, 3, 10]);
  assert.ok(sameNews(snap, snapshot(s, new Date(+now + 5000))), 'only the time differs');

  const view = stateFrom(snap, now);
  assert.deepEqual(view.rewards.tiers, s.rewards.tiers);
  assert.equal(view.days['2026-11-16'].counted, 2);
  assert.equal(stateFrom(snap, new Date(2026, 10, 17, 9, 0)).days['2026-11-17'].counted, 0, 'a new day starts at nothing');
  // junk from the database never breaks the parent area
  for (const junk of [null, 7, 'x', [], { rewards: 3, chores: { list: [null, 5, { id: 9 }, { id: 'ok', title: 'Fine' }] }, xp: 'lots', expectations: { days: 4 } }]) {
    const v = stateFrom(junk, now);
    assert.ok(Array.isArray(v.rewards.tiers) && Array.isArray(v.chores.log) && typeof v.xp === 'number');
  }
  assert.deepEqual(titles(stateFrom({ chores: { list: [null, { id: 'ok', title: 'Fine' }] } }).chores.list), ['Fine']);
  const withMine = viewOf(snap, [{ id: newId(), type: 'add', payload: { kind: 'chore', item: { id: 'chore0001', title: 'Dishes' } } }, { id: newId(), type: 'bogus', payload: null }], now);
  assert.deepEqual(titles(withMine.chores.list), ['Dishes'], 'a change still waiting shows at once');
});

test('the address of the family database cannot be redirected by a link', () => {
  const real = familyConfig({ hostname: 'example.github.io', search: '' });
  assert.match(real.url, /^https:\/\/[a-z0-9]+\.supabase\.co$/);
  assert.match(real.key, /^sb_publishable_/, 'only the publishable key belongs in the app');
  assert.deepEqual(familyConfig({ hostname: 'example.github.io', search: '?family=http://127.0.0.1:9' }), real, 'ignored on the published site');
  assert.deepEqual(familyConfig({ hostname: 'localhost', search: '?family=https://evil.example' }), real, 'only this computer');
  assert.deepEqual(familyConfig({ hostname: 'localhost', search: '?family=javascript:alert(1)' }), real);
  assert.equal(familyConfig({ hostname: '127.0.0.1', search: '?family=http://127.0.0.1:4321/x' }).url, 'http://127.0.0.1:4321');
});

// ---------------------------------------------------------------- two devices

test('without a sign-in nothing is sent anywhere', async (t) => {
  const server = await startFamilyServer();
  t.after(() => server.close());
  const d = device(server);
  d.store.update((s) => { addItem(s, 'tier', { title: 'Cinema', points: 50 }); });
  d.family.kick('change');
  d.family.kick('look');
  await d.family.sync();
  assert.equal(d.family.desk().remote, false);
  d.family.desk().run('add', { kind: 'chore', item: { title: 'Dishes' } });
  assert.equal(await d.family.picture('pwhatever1'), null);
  await new Promise((r) => setTimeout(r, 400));
  assert.deepEqual(server.requests, []);
  assert.deepEqual(titles(d.store.get().chores.list), ['Dishes'], 'the parent area works as before');
});

test('a grown-up manages his lists from their own device', async (t) => {
  const { server, ipad, phone, settle } = await household(t);
  const desk = phone.family.desk();
  assert.equal(desk.remote, true);
  assert.equal(ipad.family.desk().remote, false);
  assert.deepEqual(titles(desk.state().rewards.tiers), ['Trampoline park'], 'the phone sees what is on his device');
  assert.equal(desk.state().xp, 500);
  assert.deepEqual(titles(phone.store.get().rewards.tiers), [], 'the phone\'s own game is left alone');

  // add with a picture, change, remove
  const pic = await desk.savePhoto(jpeg('the bike'));
  const bike = desk.run('add', { kind: 'tier', item: { title: 'New bike', points: 2000, photo: pic } });
  const daily = desk.state().rewards.daily[0];
  desk.run('edit', { kind: 'daily', id: daily.id, item: { title: 'Thirty minutes of game time', note: 'After homework' } });
  desk.run('remove', { kind: 'chore', id: desk.state().chores.list[0].id });
  desk.run('add', { kind: 'tier', item: { title: 'Ice cream', points: 400 } }); // he has 500 points: won at once
  desk.run('option', { name: 'confirm', on: true });
  assert.deepEqual(titles(desk.state().rewards.tiers), ['Trampoline park', 'New bike', 'Ice cream'], 'shown on the phone at once');
  assert.equal(phone.family.status().waiting, 5);
  assert.deepEqual(titles(ipad.store.get().rewards.tiers), ['Trampoline park'], 'not on his device before it has been in touch');

  await settle();
  const his = ipad.store.get();
  assert.deepEqual(titles(his.rewards.tiers), ['Trampoline park', 'New bike', 'Ice cream']);
  assert.equal(his.rewards.tiers[1].id, bike.id, 'both devices know the new reward by the same id');
  assert.deepEqual([his.rewards.daily[0].title, his.rewards.daily[0].note], ['Thirty minutes of game time', 'After homework']);
  assert.deepEqual([his.chores.list.length, his.expectations.confirm], [0, true]);
  assert.equal(await (await ipad.photos.load(pic)).text(), 'the bike', 'the picture came along and is kept on his device');
  assert.deepEqual(owed(his).map((e) => e.title), ['Ice cream'], 'a reward he had already reached is his straight away');
  assert.equal(phone.family.status().waiting, 0);
  assert.deepEqual(phone.family.desk().state().rewards, JSON.parse(JSON.stringify(his.rewards)), 'and the phone shows exactly what is on his device');
  assert.ok(server.db.commands.every((c) => c.applied_at && c.outcome === 'done'));

  // handing out: pressed on the phone
  phone.family.desk().run('given', { id: owed(phone.family.desk().state())[0].id });
  await settle();
  assert.equal(owed(ipad.store.get()).length, 0);
});

test('a chore photo reaches the grown-up, and goes when the chore is checked', async (t) => {
  const { server, ipad, phone, settle } = await household(t);
  const chore = ipad.store.get().chores.list[0];
  const photo = await ipad.photos.save(jpeg('a made bed'));
  let entry;
  ipad.store.update((s) => { entry = submitChore(s, chore, photo); });
  await ipad.family.sync();
  const folder = () => [...server.db.objects.keys()].map((k) => k.split('/')[1]);
  assert.deepEqual(folder(), [photo], 'the photo is in the family\'s folder');

  await phone.family.sync();
  const desk = phone.family.desk();
  assert.deepEqual(desk.state().chores.log.filter((e) => e.status === 'pending').map((e) => e.title), ['Make your bed']);
  assert.equal(await (await phone.family.picture(photo)).text(), 'a made bed', 'the grown-up can look at it');
  desk.run('chore', { id: entry.id, ok: true });
  assert.equal(desk.state().xp, 520, 'the phone shows the points at once');
  await settle();
  assert.equal(ipad.store.get().xp, 520);
  assert.equal(ipad.store.get().chores.log[0].status, 'approved');
  assert.equal(await ipad.photos.has(photo), false, 'deleted from his device');
  assert.deepEqual(folder(), [], 'and from the family\'s folder');

  // sent back with a note, this time decided on his own device
  const second = await ipad.photos.save(jpeg('again'));
  ipad.store.update((s) => { s.chores.list[0].repeat = 'once'; entry = submitChore(s, s.chores.list[0], second); });
  await ipad.family.sync();
  assert.deepEqual(folder(), [second]);
  ipad.family.desk().run('chore', { id: entry.id, ok: false, note: 'The pillow too' });
  await ipad.family.sync();
  assert.deepEqual(folder(), []);
  await phone.family.sync();
  assert.equal(phone.family.desk().state().chores.log.at(-1).note, 'The pillow too');
});

test('reward pictures: from his device to the phone, replaced, removed', async (t) => {
  const { server, ipad, phone, settle } = await household(t);
  const folder = () => [...server.db.objects.keys()].map((k) => k.split('/')[1]).sort();
  const first = await ipad.photos.save(jpeg('park'));
  const tier = ipad.store.get().rewards.tiers[0];
  ipad.family.desk().run('edit', { kind: 'tier', id: tier.id, item: { photo: first } });
  await ipad.family.sync();
  assert.deepEqual(folder(), [first]);
  await phone.family.sync();
  assert.equal(await (await phone.family.picture(first)).text(), 'park');

  const second = await phone.family.desk().savePhoto(jpeg('better park'));
  phone.family.desk().run('edit', { kind: 'tier', id: tier.id, item: { photo: second } });
  await settle();
  assert.equal(ipad.store.get().rewards.tiers[0].photo, second);
  assert.deepEqual([await ipad.photos.has(first), await ipad.photos.has(second)], [false, true]);
  assert.deepEqual(folder(), [second], 'the old picture is gone from the folder');

  phone.family.desk().run('remove', { kind: 'tier', id: tier.id });
  await settle();
  assert.deepEqual([ipad.store.get().rewards.tiers.length, await ipad.photos.has(second), folder()], [0, false, []]);

  // a picture his device has lost (cleared storage) is fetched back
  const kept = await ipad.photos.save(jpeg('keep me'));
  ipad.family.desk().run('add', { kind: 'tier', item: { title: 'Zoo', points: 900, photo: kept } });
  await ipad.family.sync();
  ipad.photos.kept.clear();
  await ipad.family.sync();
  assert.equal(await (await ipad.photos.load(kept)).text(), 'keep me');
});

test('the sign-in renews itself; when it cannot, the device asks for a new sign-in and keeps working on its own', async (t) => {
  const { server, ipad, phone, settle } = await household(t);
  server.expireTokens();
  phone.family.desk().run('add', { kind: 'expect', item: { title: 'Pack your bag' } });
  await settle();
  assert.deepEqual(titles(ipad.store.get().expectations.list), ['Brush your teeth', 'Pack your bag'], 'both devices renewed quietly');
  assert.equal(phone.family.status().error, '');

  server.revoke();
  await phone.family.sync();
  assert.deepEqual([phone.family.status().signedIn, phone.family.status().error], [false, 'auth']);
  assert.equal(phone.family.desk().remote, false, 'the parent area falls back to this device\'s own game');
  await ipad.family.sync();
  assert.equal(ipad.family.status().signedIn, false);
  ipad.family.desk().run('add', { kind: 'chore', item: { title: 'Feed the dog' } });
  assert.ok(titles(ipad.store.get().chores.list).includes('Feed the dog'), 'his device carries on as before');

  // signing in again picks up where it left off
  await ipad.family.signIn('family@example.com', 'correct horse');
  assert.equal(ipad.family.status().role, 'player', 'the same account: it still knows what this device is');
  await phone.family.signIn('family@example.com', 'correct horse');
  await phone.family.sync();
  assert.ok(titles(phone.family.desk().state().chores.list).includes('Feed the dog'));
});

test('no internet: nothing is lost, and it catches up afterwards', async (t) => {
  const { server, ipad, phone, settle } = await household(t);
  server.setDown(true);
  phone.family.desk().run('add', { kind: 'chore', item: { title: 'Water the plants', points: 15 } });
  await phone.family.sync();
  assert.deepEqual([phone.family.status().error, phone.family.status().waiting], ['network', 1]);
  assert.ok(titles(phone.family.desk().state().chores.list).includes('Water the plants'), 'still shown on the phone');
  ipad.store.update((s) => { s.xp += 60; });
  await ipad.family.sync();
  assert.equal(ipad.family.status().error, 'network');
  server.setDown(false);
  await settle();
  assert.deepEqual([phone.family.status().error, phone.family.status().waiting, ipad.family.status().error], ['', 0, '']);
  assert.ok(titles(ipad.store.get().chores.list).includes('Water the plants'));
  assert.equal(phone.family.desk().state().xp, 560);
});

test('a command is carried out once, even when ticking it off fails', async (t) => {
  const { server, ipad, phone, settle } = await household(t);
  const chore = ipad.store.get().chores.list[0];
  let entry;
  ipad.store.update((s) => { entry = submitChore(s, chore, null); });
  await ipad.family.sync();
  await phone.family.sync();
  phone.family.desk().run('chore', { id: entry.id, ok: true });
  await phone.family.sync();
  server.failOnce(/^PATCH \/rest\/v1\/commands/);
  await ipad.family.sync();
  assert.equal(ipad.family.status().error, 'server');
  assert.equal(ipad.store.get().xp, 520, 'carried out');
  assert.equal(server.db.commands.filter((c) => !c.applied_at).length, 1, 'but not ticked off');
  // meanwhile something else changes on his device; the command must not be replayed over it
  ipad.store.update((s) => { s.xp += 5; });
  await settle();
  assert.equal(ipad.store.get().xp, 525, 'not carried out a second time');
  assert.equal(server.db.commands.filter((c) => !c.applied_at).length, 0);
  assert.equal(phone.family.desk().state().xp, 525);
});

test('only one device is the one he plays on', async (t) => {
  const { server, ipad, phone } = await household(t);
  const third = device(server);
  await third.family.signIn('family@example.com', 'correct horse');
  assert.equal(third.family.status().role, '', 'a new device is asked what it is');
  assert.deepEqual(await third.family.setRole('player'), { taken: true });
  assert.equal(third.family.status().role, '');
  assert.equal(server.db.family_state[0].player_device, ipad.box.get().device);

  third.store.update((s) => { s.xp = 42; });
  assert.deepEqual(await third.family.setRole('player', { takeOver: true }), { ok: true });
  assert.equal(server.db.family_state[0].data.xp, 42, 'the new device reports its own state');
  await ipad.family.sync();
  assert.deepEqual([ipad.family.status().role, ipad.family.status().moved], ['manager', true], 'the old one steps back');
  assert.equal(ipad.store.get().xp, 500, 'his game on it is untouched');
  assert.equal(server.db.family_state[0].data.xp, 42, 'and it no longer writes the family\'s state');

  // and back again
  assert.deepEqual(await ipad.family.setRole('player', { takeOver: true }), { ok: true });
  await third.family.sync();
  assert.equal(third.family.status().role, 'manager');
  await phone.family.sync();
  assert.equal(phone.family.desk().state().xp, 500);
  // a device that stops being the one he plays on frees the place
  await ipad.family.setRole('manager');
  assert.equal(server.db.family_state[0].player_device, null);
  assert.deepEqual(await third.family.setRole('player'), { ok: true }, 'no take-over needed now');
});

test('before his device has signed in, a grown-up can already prepare things', async (t) => {
  const server = await startFamilyServer();
  t.after(() => server.close());
  const phone = device(server);
  assert.equal(await phone.family.signUp('early@example.com', 'correct horse'), 'in');
  await phone.family.setRole('manager');
  assert.equal(phone.family.status().connected, false);
  // what was typed into the phone's own game earlier can be sent along
  phone.store.update((s) => { addItem(s, 'daily', { title: 'Game time', missions: 3 }); addItem(s, 'chore', { title: 'Dishes', points: 25 }); });
  const pic = await phone.photos.save(jpeg('a kite'));
  phone.store.update((s) => { addItem(s, 'tier', { title: 'Kite', points: 600, photo: pic }); });
  assert.equal(await phone.family.sendOwnLists(), 3);
  assert.equal(await phone.family.sendOwnLists(), 0, 'not twice');
  await phone.family.sync();

  const ipad = device(server);
  ipad.store.update((s) => { addItem(s, 'chore', { title: 'Dishes', points: 10 }); });
  await ipad.family.signIn('early@example.com', 'correct horse');
  await ipad.family.setRole('player');
  const his = ipad.store.get();
  assert.deepEqual([titles(his.rewards.daily), titles(his.rewards.tiers), titles(his.chores.list)], [['Game time'], ['Kite'], ['Dishes', 'Dishes']]);
  assert.equal(await (await ipad.photos.load(his.rewards.tiers[0].photo)).text(), 'a kite');
  await phone.family.sync();
  assert.deepEqual([phone.family.status().connected, phone.family.status().waiting], [true, 0]);
});

test('accounts: wrong password, an address that needs confirming, another family, deleting', async (t) => {
  const { server, ipad, phone, settle } = await household(t);
  const stranger = device(server);
  await assert.rejects(stranger.family.signIn('family@example.com', 'wrong'), { code: 'credentials' });
  await assert.rejects(stranger.family.signUp('family@example.com', 'another one'), { code: 'exists' });
  await assert.rejects(stranger.family.signUp('short@example.com', '123'), { code: 'weak' });
  server.setConfirm(true);
  assert.equal(await stranger.family.signUp('other@example.com', 'their password'), 'confirm');
  assert.equal(stranger.family.status().signedIn, false);
  await assert.rejects(stranger.family.signIn('other@example.com', 'their password'), { code: 'confirm' });
  server.confirmAll();
  await stranger.family.signIn('other@example.com', 'their password');
  await stranger.family.setRole('manager');
  assert.deepEqual(titles(stranger.family.desk().state().rewards.tiers), [], 'another family sees nothing of this one');
  assert.equal(await stranger.family.picture('ptest0001'), null);
  stranger.family.desk().run('add', { kind: 'tier', item: { title: 'Theirs', points: 100 } });
  await stranger.family.sync();
  await settle();
  assert.deepEqual(titles(ipad.store.get().rewards.tiers), ['Trampoline park'], 'and changes nothing in it');

  // signing out forgets the account on that device; signing in as another family starts clean
  phone.family.desk().run('add', { kind: 'chore', item: { title: 'Unsent' } });
  await phone.family.signOut();
  assert.deepEqual([phone.family.status().signedIn, phone.family.status().role, phone.box.get().outbox.length], [false, '', 0]);
  await phone.family.signIn('other@example.com', 'their password');
  assert.equal(phone.family.status().role, '', 'asked again what this device is');

  // deleting the account removes the rows and the pictures; his device keeps everything it has
  const pic = await ipad.photos.save(jpeg('x'));
  ipad.family.desk().run('edit', { kind: 'tier', id: ipad.store.get().rewards.tiers[0].id, item: { photo: pic } });
  await ipad.family.sync();
  const owner = ipad.box.get().session.user.id;
  assert.equal([...server.db.objects.keys()].filter((k) => k.startsWith(owner)).length, 1);
  await ipad.family.deleteAccount();
  assert.equal(server.db.family_state.filter((r) => r.owner === owner).length, 0);
  assert.equal([...server.db.objects.keys()].filter((k) => k.startsWith(owner)).length, 0);
  assert.equal(ipad.family.status().signedIn, false);
  assert.deepEqual([titles(ipad.store.get().rewards.tiers), await ipad.photos.has(pic)], [['Trampoline park'], true]);
  await assert.rejects(ipad.family.signIn('family@example.com', 'correct horse'), { code: 'credentials' });
});

test('housekeeping: old commands and pictures nothing points to are cleared away', async (t) => {
  const server = await startFamilyServer();
  t.after(() => server.close());
  let time = Date.now();
  const ipad = device(server, { clock: () => time });
  await ipad.family.signUp('tidy@example.com', 'correct horse');
  await ipad.family.setRole('player');
  const phone = device(server);
  await phone.family.signIn('tidy@example.com', 'correct horse');
  await phone.family.setRole('manager');
  const used = await phone.family.desk().savePhoto(jpeg('used'));
  await phone.family.desk().savePhoto(jpeg('abandoned')); // a form that was never saved
  phone.family.desk().run('add', { kind: 'tier', item: { title: 'Kite', points: 600, photo: used } });
  await phone.family.sync();
  await ipad.family.sync();
  assert.equal(server.db.objects.size, 2, 'a fresh stray picture is left alone (its command may still be on the way)');
  time += 13 * 3600000;
  for (const o of server.db.objects.values()) o.created_at = new Date(time - 2 * 3600000).toISOString();
  for (const c of server.db.commands) c.applied_at = new Date(time - 8 * 24 * 3600000).toISOString();
  await ipad.family.sync();
  assert.deepEqual([...server.db.objects.keys()].map((k) => k.split('/')[1]), [used]);
  assert.equal(server.db.commands.length, 0);
});

// ---------------------------------------------------------------- what a review found (each of these went wrong once)

test('an expectation is ticked for the day it was pressed on, never for the next one', async (t) => {
  const server = await startFamilyServer();
  t.after(() => server.close());
  let time = new Date(2026, 10, 16, 21, 0).getTime(); // Monday evening
  const clock = () => time;
  const ipad = device(server, { clock });
  let ex;
  ipad.store.update((s) => { ex = addItem(s, 'expect', { title: 'Brush your teeth' }); s.expectations.confirm = true; });
  await ipad.family.signUp('days@example.com', 'correct horse');
  await ipad.family.setRole('player');
  const phone = device(server, { clock });
  await phone.family.signIn('days@example.com', 'correct horse');
  await phone.family.setRole('manager');
  phone.family.desk().run('expect', { id: ex.id, done: true });
  assert.equal(expectationsToday(phone.family.desk().state(), new Date(time)).done, 1, 'shown as done on the phone, on Monday');
  await phone.family.sync();
  time = new Date(2026, 10, 17, 7, 0).getTime(); // his device is next opened on Tuesday morning
  await ipad.family.sync();
  assert.equal(expectationsToday(ipad.store.get(), new Date(time)).done, 0, 'Tuesday starts with nothing done');
  assert.deepEqual(server.db.commands.map((c) => c.outcome), ['late']);
  await phone.family.sync();
  assert.equal(expectationsToday(phone.family.desk().state(), new Date(time)).done, 0, 'and the phone agrees');
  assert.equal(phone.family.status().waiting, 0);
  // the same day works as before; an odd day changes nothing
  phone.family.desk().run('expect', { id: ex.id, done: true });
  await phone.family.sync(); await ipad.family.sync();
  assert.equal(expectationsToday(ipad.store.get(), new Date(time)).done, 1);
  assert.equal(act(ipad.store.get(), 'expect', { id: ex.id, done: false, day: '../../x' }, new Date(time)).why, 'late');
});

test('a change made while the device is busy sending the one before is sent right after it', async (t) => {
  const server = await startFamilyServer();
  t.after(() => server.close());
  const phone = device(server, { slow: 120 });
  await phone.family.signUp('quick@example.com', 'correct horse');
  await phone.family.setRole('manager');
  phone.family.desk().run('add', { kind: 'chore', item: { title: 'First' } });
  await sleep(500); // the round that sends it is under way
  assert.equal(phone.family.status().busy, true);
  phone.family.desk().run('add', { kind: 'chore', item: { title: 'Second' } });
  assert.equal(phone.family.status().unsent >= 1, true);
  await sleep(2500);
  assert.deepEqual(server.db.commands.map((c) => c.payload.item.title), ['First', 'Second'], 'both left the device without waiting for the clock');
  assert.equal(phone.family.status().unsent, 0);
});

test('trouble with a picture does not keep his state and the grown-ups\' changes waiting', async (t) => {
  const { server, ipad, phone, settle } = await household(t);
  const photo = await ipad.photos.save(jpeg('bed'));
  let entry;
  ipad.store.update((s) => { entry = submitChore(s, s.chores.list[0], photo); s.xp += 7; });
  phone.family.desk().run('add', { kind: 'expect', item: { title: 'Pack your bag' } });
  await phone.family.sync();
  server.failOnce(/^POST \/storage\/v1\/object\/photos/);
  await ipad.family.sync();
  assert.equal(ipad.family.status().error, 'server', 'the trouble is reported');
  assert.ok(server.db.commands.every((c) => c.applied_at), 'but the command was carried out and ticked off');
  assert.equal(server.db.family_state[0].data.xp, 507, 'and his state was published');
  assert.equal(server.db.objects.size, 0);
  await ipad.family.sync();
  assert.deepEqual([ipad.family.status().error, server.db.objects.size], ['', 1], 'the picture follows in the next round');

  // a picture that could not be deleted from the folder stays on the list until it can be
  ipad.family.desk().run('chore', { id: entry.id, ok: true });
  server.failOnce(/^DELETE \/storage\/v1\/object\/photos/);
  await ipad.family.sync();
  assert.deepEqual([ipad.family.status().error, server.db.objects.size, ipad.box.get().trash], ['server', 1, [photo]]);
  await ipad.family.sync();
  assert.deepEqual([ipad.family.status().error, server.db.objects.size, ipad.box.get().trash], ['', 0, []]);
  await settle();
  assert.equal(phone.family.desk().state().xp, 527);
});

test('a device made "his" by mistake cannot lose the real one\'s pictures for good', async (t) => {
  const { server, ipad } = await household(t);
  const pic = await ipad.photos.save(jpeg('park'));
  ipad.family.desk().run('edit', { kind: 'tier', id: ipad.store.get().rewards.tiers[0].id, item: { photo: pic } });
  await ipad.family.sync();
  const folder = () => [...server.db.objects.keys()].map((k) => k.split('/')[1]);
  assert.deepEqual(folder(), [pic]);

  let time = Date.now();
  const wrong = device(server, { clock: () => time });
  await wrong.family.signIn('family@example.com', 'correct horse');
  await wrong.family.setRole('player', { takeOver: true });
  for (const o of server.db.objects.values()) o.created_at = new Date(time - 2 * 3600000).toISOString();
  await wrong.family.sync();
  assert.deepEqual(folder(), [pic], 'a device that has just become "his" does not tidy the folder');
  time += 13 * 3600000; // the mistake goes unnoticed for a day: now it does tidy
  await wrong.family.sync();
  assert.deepEqual(folder(), []);
  await ipad.family.sync();
  assert.equal(ipad.family.status().role, 'manager');
  await ipad.family.setRole('player', { takeOver: true });
  assert.deepEqual(folder(), [pic], 'taking the place back sends every picture again');
});

test('signing out on his device takes his chore photos out of the folder; deleting the account never leaves pictures behind', async (t) => {
  const { server, ipad } = await household(t);
  const reward = await ipad.photos.save(jpeg('park'));
  ipad.family.desk().run('edit', { kind: 'tier', id: ipad.store.get().rewards.tiers[0].id, item: { photo: reward } });
  const chore = await ipad.photos.save(jpeg('bed'));
  ipad.store.update((s) => { submitChore(s, s.chores.list[0], chore); });
  await ipad.family.sync();
  const folder = () => [...server.db.objects.keys()].map((k) => k.split('/')[1]).sort();
  assert.deepEqual(folder(), [reward, chore].sort());
  await ipad.family.signOut();
  assert.deepEqual(folder(), [reward], 'the photo of his room does not stay online');
  assert.equal(await ipad.photos.has(chore), true, 'it is still on his device, waiting for a check');

  await ipad.family.signIn('family@example.com', 'correct horse');
  await ipad.family.setRole('player');
  assert.deepEqual(folder(), [reward, chore].sort(), 'signed in again, it is sent again');
  server.failOnce(/^DELETE \/storage\/v1\/object\/photos/);
  await assert.rejects(ipad.family.deleteAccount(), { code: 'server' });
  assert.deepEqual([server.db.users.length, ipad.family.status().signedIn, folder().length], [1, true, 2], 'pictures could not be removed: nothing is deleted');
  await ipad.family.deleteAccount();
  assert.deepEqual([server.db.users.length, ipad.family.status().signedIn, folder().length], [0, false, 0]);
});

test('a sign-in that could not be renewed once does not stop later ones from being renewed', async (t) => {
  const { server, phone } = await household(t);
  phone.box.set((b) => { b.session = { ...b.session, refresh_token: '', expires_at: 1 }; }); // nothing to renew with
  await phone.family.sync();
  assert.deepEqual([phone.family.status().signedIn, phone.family.status().lapsed, phone.family.status().lapsedRole], [false, true, 'manager']);
  assert.equal(phone.family.desk().remote, false);
  await phone.family.signIn('family@example.com', 'correct horse');
  assert.equal(phone.family.status().lapsed, false);
  server.expireTokens();
  await phone.family.sync();
  assert.deepEqual([phone.family.status().error, phone.family.status().signedIn], ['', true], 'renewed as usual');
  // a grown-up may also decide not to use the account on this device any more
  server.revoke();
  await phone.family.sync();
  assert.equal(phone.family.status().lapsed, true);
  await phone.family.signOut();
  assert.deepEqual([phone.family.status().lapsed, phone.family.status().role, phone.box.get().account], [false, '', '']);
});

test('a picture that was not there yet is asked for again later', async (t) => {
  const server = await startFamilyServer();
  t.after(() => server.close());
  let time = Date.now();
  const ipad = device(server);
  await ipad.family.signUp('late@example.com', 'correct horse');
  await ipad.family.setRole('player');
  const phone = device(server, { clock: () => time });
  await phone.family.signIn('late@example.com', 'correct horse');
  await phone.family.setRole('manager');
  const pic = await ipad.photos.save(jpeg('kite'));
  for (let i = 0; i < 4; i++) assert.equal(await phone.family.picture(pic), null);
  const asked = server.requests.filter((r) => r.startsWith('GET /storage')).length;
  assert.equal(asked, 3, 'asked a few times, then left alone');
  ipad.family.desk().run('add', { kind: 'tier', item: { title: 'Kite', points: 600, photo: pic } });
  await ipad.family.sync();
  assert.equal(await phone.family.picture(pic), null, 'not asked again straight away');
  time += 6 * 60000;
  assert.equal(await (await phone.family.picture(pic)).text(), 'kite', 'but a few minutes later it is found');
  // no connection is not "not there": it is simply tried again the next time
  const other = await ipad.photos.save(jpeg('ball'));
  ipad.family.desk().run('add', { kind: 'tier', item: { title: 'Ball', points: 700, photo: other } });
  await ipad.family.sync();
  server.setDown(true);
  for (let i = 0; i < 5; i++) assert.equal(await phone.family.picture(other), null);
  server.setDown(false);
  assert.equal(await (await phone.family.picture(other)).text(), 'ball');
});

test('creating an account with an address that has one already says so, also when addresses must be confirmed', async (t) => {
  const { server } = await household(t);
  server.setConfirm(true);
  const d = device(server);
  await assert.rejects(d.family.signUp('family@example.com', 'another password'), { code: 'exists' });
  assert.equal(await d.family.signUp('brand-new@example.com', 'another password'), 'confirm');
});

test('nothing of a grown-up\'s is carried out while he is in a mission', async (t) => {
  const server = await startFamilyServer();
  t.after(() => server.close());
  let screen = 'mission';
  const ipad = device(server, { screen: () => screen });
  await ipad.family.signUp('calm@example.com', 'correct horse');
  await ipad.family.setRole('player');
  const phone = device(server);
  await phone.family.signIn('calm@example.com', 'correct horse');
  await phone.family.setRole('manager');
  phone.family.desk().run('add', { kind: 'chore', item: { title: 'Dishes' } });
  await phone.family.sync();
  await ipad.family.sync();
  assert.deepEqual([ipad.store.get().chores.list.length, server.db.commands[0].applied_at], [0, null]);
  screen = 'map';
  await ipad.family.sync();
  assert.deepEqual([titles(ipad.store.get().chores.list), !!server.db.commands[0].applied_at], [['Dishes'], true]);
});

test('a photo store that has stopped answering does not hang the device', async (t) => {
  const server = await startFamilyServer();
  t.after(() => server.close());
  const store = createStore(memoryBackend());
  const box = createBox(memoryBackend());
  const stuck = { load: () => new Promise(() => {}), has: () => new Promise(() => {}), save: () => new Promise(() => {}), delete: () => new Promise(() => {}) };
  const api = createApi({ url: server.url, key: 'test-key', timeout: 3000, session: { get: () => box.get().session, set: (s) => box.set((b) => { b.session = s; }) } });
  const realTimeout = globalThis.setTimeout;
  globalThis.setTimeout = (fn, ms, ...a) => realTimeout(fn, ms === 8000 ? 30 : ms, ...a); // the photo time limit, shortened for the test
  t.after(() => { globalThis.setTimeout = realTimeout; });
  const family = createFamily({ store, api, box, photos: stuck });
  store.update((s) => { addItem(s, 'tier', { title: 'Kite', points: 600, photo: 'pstuck0001' }); s.xp = 12; });
  await family.signUp('stuck@example.com', 'correct horse');
  await family.setRole('player');
  assert.equal(family.status().busy, false, 'the round ended');
  assert.equal(family.status().error, 'photos');
  assert.equal(server.db.family_state[0].data.xp, 12, 'and his state was still published');
});

