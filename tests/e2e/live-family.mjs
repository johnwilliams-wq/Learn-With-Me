// A try-out of the family account against the REAL family database (src/family/config.js),
// with the app's own client code and two made-up devices. It creates a throw-away account,
// goes through the whole exchange (lists, a reward picture, a chore photo, a sign-in that is
// renewed) and deletes the account and its files again - also when something fails.
//
//   node tests/e2e/live-family.mjs --yes        (behind a proxy: NODE_USE_ENV_PROXY=1 node ...)
//
// It only runs when new accounts need no email confirmation (otherwise an email would be sent
// to a made-up address) and never touches a real family's rows: the database itself only
// shows an account its own.

import assert from 'node:assert/strict';
import { createStore, memoryBackend } from '../../src/core/store.js';
import { addItem, submitChore, owed } from '../../src/rewards/logic.js';
import { createApi } from '../../src/family/api.js';
import { createFamily, createBox } from '../../src/family/sync.js';
import { familyConfig } from '../../src/family/config.js';

if (!process.argv.includes('--yes')) {
  console.log('This creates (and deletes again) a throw-away account in the real family database. Run it with --yes.');
  process.exit(2);
}
const { url, key } = familyConfig(null);
const say = (ok, text) => console.log(`${ok ? 'ok  ' : 'FAIL'}  ${text}`);

const settings = await (await fetch(`${url}/auth/v1/settings`, { headers: { apikey: key } })).json();
if (settings.disable_signup) { console.log('New accounts are switched off in the project: nothing to try. (That is the right setting once the family account exists.)'); process.exit(2); }
if (!settings.mailer_autoconfirm) { console.log('"Confirm email" is on in the project: not creating a test account (it would send an email to a made-up address).'); process.exit(2); }

function device() {
  const store = createStore(memoryBackend());
  const box = createBox(memoryBackend());
  const kept = new Map();
  let n = 0;
  const photos = {
    kept,
    load: async (id) => kept.get(id) || null,
    has: async (id) => kept.has(id),
    save: async (blob, id = `plive${Date.now().toString(36)}${++n}`) => { kept.set(id, blob); return id; },
    delete: async (id) => void kept.delete(id),
  };
  const api = createApi({ url, key, session: { get: () => box.get().session, set: (s) => box.set((b) => { b.session = s; }) } });
  return { store, box, photos, api, family: createFamily({ store, api, box, photos }) };
}
// the smallest real JPEG (the folder only takes pictures)
const jpeg = (tag) => new Blob([Uint8Array.from(atob('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/yQALCAABAAEBAREA/8wABgAQEAX/2gAIAQEAAD8A0s8g/9k='), (c) => c.charCodeAt(0)), new TextEncoder().encode(tag)], { type: 'image/jpeg' });
const email = `lwm-tryout-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}@example.com`;
const password = `T-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;

const ipad = device();
const phone = device();
let failed = false;
try {
  ipad.store.update((s) => {
    s.xp = 500;
    addItem(s, 'daily', { title: 'Game time', missions: 2 });
    addItem(s, 'chore', { title: 'Make your bed', points: 20, repeat: 'daily' });
  });
  assert.equal(await ipad.family.signUp(email, password), 'in');
  say(true, 'a new account is signed in straight away');
  assert.deepEqual(await ipad.family.setRole('player'), { ok: true });
  assert.equal(ipad.family.status().error, '', `his device reports: ${ipad.family.status().error}`);
  say(true, 'the device he plays on has reported its lists');

  await phone.family.signIn(email, password);
  await phone.family.setRole('manager');
  const desk = phone.family.desk();
  assert.deepEqual(desk.state().rewards.daily.map((x) => x.title), ['Game time']);
  assert.equal(desk.state().xp, 500);
  say(true, 'a grown-up\'s device sees his lists and his points');

  const pic = await desk.savePhoto(jpeg('reward'));
  desk.run('add', { kind: 'tier', item: { title: 'Kite', points: 400, photo: pic } });
  desk.run('edit', { kind: 'daily', id: desk.state().rewards.daily[0].id, item: { note: 'After homework' } });
  await phone.family.sync();
  await ipad.family.sync();
  await phone.family.sync();
  const his = ipad.store.get();
  assert.deepEqual([his.rewards.tiers.map((x) => x.title), his.rewards.daily[0].note, owed(his).map((e) => e.title)], [['Kite'], 'After homework', ['Kite']]);
  assert.equal((await ipad.photos.load(pic))?.size, jpeg('reward').size, 'the picture should arrive on his device');
  assert.deepEqual([phone.family.status().waiting, phone.family.status().error, ipad.family.status().error], [0, '', '']);
  say(true, 'a reward with a picture, typed on the grown-up\'s device, arrived on his');

  const photo = await ipad.photos.save(jpeg('chore'));
  let entry;
  ipad.store.update((s) => { entry = submitChore(s, s.chores.list[0], photo); });
  await ipad.family.sync();
  await phone.family.sync();
  assert.equal((await phone.family.picture(photo))?.size, jpeg('chore').size, 'the grown-up should be able to see the chore photo');
  // a sign-in that has run out is renewed without anyone noticing
  phone.box.set((b) => { b.session = { ...b.session, access_token: `${b.session.access_token.slice(0, -6)}broken`, expires_at: 1 }; });
  phone.family.desk().run('chore', { id: entry.id, ok: true });
  await phone.family.sync();
  assert.equal(phone.family.status().error, '', `after renewing: ${phone.family.status().error}`);
  await ipad.family.sync();
  assert.deepEqual([ipad.store.get().xp, await ipad.photos.has(photo)], [520, false]);
  const names = (await ipad.api.list()).map((o) => o.name);
  assert.deepEqual(names, [pic], `only the reward picture should be left in the folder (${names})`);
  say(true, 'a chore photo reached the grown-up, was approved there, and is gone again; the sign-in renewed itself');

  // another family sees none of it
  const other = device();
  const otherEmail = email.replace('tryout', 'tryout-other');
  try {
    await other.family.signUp(otherEmail, password);
    await other.family.setRole('manager');
    assert.deepEqual(other.family.desk().state().rewards.tiers, []);
    assert.equal(await other.api.get('commands', 'select=id').then((r) => r.length), 0);
    assert.equal(await other.family.picture(pic), null);
    await assert.rejects(other.api.patch('family_state', `owner=eq.${ipad.api.userId()}`, { data: {} }).then((rows) => { if (!rows.length) throw new Error('nothing changed'); }));
    say(true, 'another account sees and changes nothing of this family');
  } finally {
    await other.family.deleteAccount().catch((e) => { failed = true; say(false, `could not delete the second test account ${otherEmail}: ${e.message}`); });
  }
} catch (e) {
  failed = true;
  say(false, e.message);
} finally {
  if (ipad.family.status().signedIn) {
    await ipad.family.deleteAccount().then(
      async () => {
        const again = device();
        const gone = await again.family.signIn(email, password).then(() => false, (e) => e.code === 'credentials');
        say(gone, gone ? 'the test account and its files are deleted again' : `the test account ${email} could still be signed in to: delete it in the dashboard`);
        if (!gone) failed = true;
        // the other device's sign-in is still good for a while: it must not be able to leave anything behind
        if (phone.family.status().signedIn) {
          const refused = await phone.api.upload('pafterdelete1', jpeg('late')).then(() => false, () => true);
          const left = await phone.api.list().then((o) => o.length, () => -1);
          const rows = await phone.api.insert('commands', { type: 'late', payload: {} }).then(() => false, () => true);
          const clean = refused && rows && left === 0;
          say(clean, clean ? 'a device that is still signed in can add nothing to the deleted account' : `after the account was deleted: upload refused ${refused}, row refused ${rows}, files left ${left}`);
          if (left > 0) await phone.api.remove(['pafterdelete1']).catch(() => {});
          if (!clean) failed = true;
        }
      },
      (e) => { failed = true; say(false, `could not delete the test account ${email} (delete it in the dashboard): ${e.message}`); },
    );
  }
}
process.exit(failed ? 1 : 0);
