// The family account: how the device he plays on and a grown-up's own devices stay in step.
// Optional - until a grown-up signs in (parent area, Settings) none of this does anything and
// nothing leaves the device.
//
//   The device he plays on ("player") stays the one source of truth. After every change it
//   sends a summary of what a grown-up needs (src/family/shape.js) to the family's row in the
//   database, carries out what grown-ups asked for on their own devices, and keeps the
//   pictures in the family's private folder (reward pictures, chore photos waiting for a check).
//
//   A grown-up's own device ("manager") shows that summary in its parent area. What is done
//   there (add / change / remove, approve a chore, hand out a reward) is written down as a
//   command; his device carries the commands out in order with the same act() the parent
//   area uses (src/rewards/actions.js). Two devices never merge their states, so nothing can
//   be lost to a conflict.
//
// Everything this device remembers about the account (the sign-in, which kind of device it is,
// what is waiting to be sent) lives under its own name in localStorage - never inside the
// save, so it is not part of a backup.

import { todayKey } from '../core/dom.js';
import { act } from '../rewards/actions.js';
import { uid } from '../rewards/logic.js';
import { snapshot, sameNews, viewOf } from './shape.js';

const KEY = 'lwm.family.v1';
const PHOTO = /^[a-z0-9]{6,40}$/;
const HOUR = 3600000;
const rows = (v) => (Array.isArray(v) ? v : []);

export function newId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  const b = new Uint8Array(16);
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(b);
  else for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const hex = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

const blank = () => ({
  v: 1,
  device: '', // this browser's own name, made up once
  email: '', // the address last signed in with (to fill the box in)
  account: '', // whose account the rest belongs to
  session: null, // the sign-in (see api.js)
  role: '', // 'player' = he plays here; 'manager' = a grown-up's own device; '' = not chosen yet
  moved: false, // another device took over as the one he plays on
  // the device he plays on:
  applied: [], // commands carried out (so that none is ever carried out twice)
  uploaded: [], // pictures known to be in the family's folder
  trash: [], // pictures to delete from the folder
  tidied: 0, // when the folder and the old commands were last tidied
  // a grown-up's device:
  snap: null, // { data, at, player }: his state as last heard
  outbox: [], // [{ id, type, payload, sent }]: what was done here and his device has not carried out yet
  lastSync: 0,
});

/** The little record this device keeps about the family account. */
export function createBox(storage) {
  let store = storage;
  if (!store) {
    try {
      store = globalThis.localStorage;
      store.getItem(KEY);
    } catch {
      store = null;
    }
  }
  let data = blank();
  const read = () => {
    try {
      const saved = JSON.parse(store?.getItem(KEY) || 'null');
      data = { ...blank(), ...(saved && typeof saved === 'object' ? saved : {}) };
      for (const k of ['applied', 'uploaded', 'trash', 'outbox']) if (!Array.isArray(data[k])) data[k] = [];
    } catch { /* start afresh: signing in again brings everything back */ }
  };
  read();
  // The same game open in a second tab shares this record: take over what the other tab wrote
  // (above all a renewed sign-in - the old one stops working once it has been renewed).
  globalThis.addEventListener?.('storage', (e) => { if (e.key === KEY && e.storageArea === store) read(); });
  return {
    get: () => data,
    set(fn) {
      fn(data);
      try { store?.setItem(KEY, JSON.stringify(data)); } catch { /* storage full or blocked: it still works until the app is closed */ }
    },
  };
}

/**
 * store   his save (src/core/store.js)          api     the calls (src/family/api.js)
 * box     createBox()                           photos  { load, save, has, delete }: pictures on this device
 * screen  () => the screen that is showing, so a mission is never disturbed
 */
export function createFamily({ store, api, box, photos, screen = () => '', clock = () => Date.now() }) {
  const listeners = new Set();
  const seen = new Map(); // pictures fetched since the app was opened
  const tried = new Map(); // id -> { n, at }: pictures that were not in the folder when we asked
  let view = null; // a grown-up's device: his state with our own waiting changes on top
  let running = null; // the round that is going on
  let again = ''; // a round was asked for while that one was running: why
  let own = false; // the change to the save is our own (a command being carried out)
  let hold = false; // the account or this device's part in it is being changed: no rounds meanwhile
  let timer = null;
  let error = '';
  let late = null; // trouble with pictures in a round that otherwise went through
  let sent = null; // the device he plays on: what was last published, and when
  let sentAt = 0;

  const B = () => box.get();
  const now = () => new Date(clock());
  const signedIn = () => !!B().session;
  const role = () => (signedIn() ? B().role : '');
  const device = () => {
    if (!B().device) box.set((b) => { b.device = `d-${newId()}`; });
    return B().device;
  };
  /**
   * The pictures on this device, each call with a time limit: a photo store that has stopped
   * answering (it happens on an iPad after the app was put away) must not hold a round up for ever.
   */
  const within = (work, ms = 8000) => new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(Object.assign(new Error('the photo store did not answer'), { code: 'photos' })), ms);
    Promise.resolve().then(work).then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
  const shelf = {
    load: (id) => within(() => photos.load(id)),
    has: (id) => within(() => photos.has(id)),
    save: (blob, id) => within(() => photos.save(blob, id)),
    delete: (id) => { within(() => photos.delete(id)).catch(() => {}); },
  };
  /** Trouble that passes by itself (no connection, a busy server): the same thing is tried again next round. */
  const passing = (e) => e?.code === 'network' || e?.code === 'busy' || e?.code === 'photos' || e?.status >= 500;
  /** A picture that was not in the folder is asked for a few times, then left alone for five minutes. */
  const mayAsk = (id, most) => { const t = tried.get(id); return !t || t.n < most || clock() - t.at > 5 * 60000; };
  const missed = (id) => { const t = tried.get(id); tried.set(id, { n: (t && clock() - t.at <= 5 * 60000 ? t.n : 0) + 1, at: clock() }); };
  /** No round is running and none starts by itself until `hold` is taken off again. */
  const settle = async () => {
    hold = true;
    clearTimeout(timer);
    again = '';
    while (running) await running;
  };
  /** what: 'data' = the lists a grown-up looks at may have changed; 'status' = only how the account is doing. */
  const tell = (what = 'status') => { for (const fn of [...listeners]) { try { fn(what); } catch { /* a listener's own trouble */ } } };
  const forgetAccount = (b) => Object.assign(b, { ...blank(), device: b.device, email: b.email });

  // ------------------------------------------------------------------ pictures

  /** Pictures nothing uses any more: off this device, and (signed in) out of the family's folder at the next round. */
  function drop(ids) {
    for (const id of ids) {
      shelf.delete(id);
      seen.delete(id);
    }
    if (signedIn() && ids.length) box.set((b) => { b.trash.push(...ids.filter((id) => PHOTO.test(id))); });
  }

  async function fetchPicture(id) {
    const blob = await api.download(id);
    await shelf.save(blob, id);
    return blob;
  }

  /**
   * A picture that is not on this device (asked for by the screens through src/core/photos.js):
   * looked for in the family's folder. Null when there is none or it cannot be reached.
   */
  async function picture(id) {
    if (!signedIn() || !PHOTO.test(id || '')) return null;
    if (seen.has(id)) return seen.get(id);
    if (!mayAsk(id, 3)) return null;
    try {
      const blob = await api.download(id);
      tried.delete(id);
      seen.set(id, blob);
      if (seen.size > 40) seen.delete(seen.keys().next().value);
      if (role() === 'player') shelf.save(blob, id).catch(() => {}); // he keeps his pictures for when there is no internet
      return blob;
    } catch (e) {
      if (!passing(e)) missed(id); // not there (yet); "could not be reached" is simply tried again the next time it is shown
      return null;
    }
  }

  /** The pictures his state points to: the rewards in the mine, and chore photos waiting for a check. */
  const wanted = (s) => [...s.rewards.tiers.map((t) => t.photo), ...s.chores.log.filter((e) => e.status === 'pending').map((e) => e.photo)].filter((id) => PHOTO.test(id || ''));

  /**
   * Bring the family's folder in step with his state: send what is new, fetch what this device
   * lacks, delete what nothing points to. One picture's trouble does not stop the others; trouble
   * that will pass is thrown at the end, so that it is tried again in the next round.
   */
  async function syncPictures() {
    const want = wanted(store.get());
    const up = new Set(B().uploaded);
    let trouble = null;
    for (const id of want) {
      let here = false;
      try {
        here = await shelf.has(id);
        if (here && up.has(id)) continue;
        if (here) {
          const blob = await shelf.load(id);
          if (blob) await api.upload(id, blob);
        } else {
          if (!mayAsk(id, 2)) continue;
          await fetchPicture(id); // it came from a grown-up's device, or this device has lost it
          tried.delete(id);
        }
        up.add(id);
      } catch (e) {
        if (e.code === 'auth') throw e;
        if (passing(e)) trouble ||= e;
        else if (here) up.add(id); // refused for good (too big, not a picture): the other devices show the emoji instead
        else missed(id); // not in the folder (yet)
      }
    }
    const listed = [...new Set(B().trash)];
    const gone = listed.filter((id) => !want.includes(id));
    let keep = []; // could not be deleted now: stays on the list
    if (gone.length) {
      try {
        await api.remove(gone);
      } catch (e) {
        if (e.code === 'auth') throw e;
        if (passing(e)) { keep = gone; trouble ||= e; } // (refused for good: tidy() catches it)
      }
    }
    // only what this round dealt with leaves the list - something may have been added to it meanwhile
    box.set((b) => { b.uploaded = want.filter((id) => up.has(id)); b.trash = b.trash.filter((id) => !listed.includes(id) || keep.includes(id)); });
    if (trouble) throw trouble;
  }

  /** Now and then: old commands go, and so do pictures in the folder that nothing points to. */
  async function tidy() {
    if (clock() - (B().tidied || 0) < 12 * HOUR) return;
    try {
      await api.del('commands', `applied_at=lt.${new Date(clock() - 7 * 24 * HOUR).toISOString()}`);
      const keep = new Set(wanted(store.get()));
      const folder = await api.list();
      const stale = folder.filter((o) => !keep.has(o.name) && Date.parse(o.created_at) < clock() - HOUR).map((o) => o.name);
      if (stale.length) await api.remove(stale);
      // a picture we believe is in the folder but is not (another device tidied it away) is sent again
      const there = new Set(folder.map((o) => o.name));
      box.set((b) => { b.tidied = clock(); b.uploaded = b.uploaded.filter((id) => there.has(id)); });
    } catch { /* next time */ }
  }

  // ------------------------------------------------------------------ the device he plays on

  async function playerRound() {
    const dev = device();
    const row = (await api.get('family_state', 'select=player_device'))[0] || null;
    if (row?.player_device && row.player_device !== dev) {
      // Another device has been made the one he plays on. This one steps back; his game here is untouched.
      box.set((b) => Object.assign(b, { role: 'manager', moved: true, snap: null, outbox: [] }));
      view = null;
      return managerRound();
    }
    const waiting = rows(await api.get('commands', 'select=id,type,payload&applied_at=is.null&order=created_at.asc,id.asc&limit=100'));
    const outcome = new Map();
    let carried = 0;
    for (const c of waiting) {
      if (screen() === 'mission') break; // he has started a mission meanwhile: the rest waits for the next round
      let word = 'done';
      carried++;
      if (!B().applied.includes(c.id)) {
        const pic = c.payload?.item?.photo;
        if (typeof pic === 'string' && PHOTO.test(pic) && !(await shelf.has(pic).catch(() => true))) await fetchPicture(pic).catch(() => {});
        let out = { ok: false, why: 'error', drop: [] };
        own = true;
        try {
          store.update((s) => { try { out = act(s, c.type, c.payload, now()); } catch { /* an odd command changes nothing */ } });
        } finally {
          own = false;
        }
        box.set((b) => { b.applied.push(c.id); if (b.applied.length > 300) b.applied.splice(0, b.applied.length - 300); });
        drop(out.drop);
        word = out.ok ? 'done' : out.why || 'nothing';
      }
      outcome.set(word, [...(outcome.get(word) || []), c.id]);
    }
    // Pictures: trouble with one of them (a slow connection, a full photo store) must not keep his
    // state and the grown-ups' commands waiting - it is reported once everything else is done.
    try {
      await syncPictures();
    } catch (e) {
      if (e.code === 'auth') throw e;
      late = e;
    }

    // Tell the family account how things stand - before the commands are ticked off, so that a
    // grown-up's device never sees "carried out" without also seeing the result.
    const data = snapshot(store.get(), now());
    if (!row || !sent || !sameNews(sent, data) || clock() - sentAt > 10 * 60000) {
      if (row) {
        const mine = row.player_device ? `player_device=eq.${encodeURIComponent(dev)}` : 'player_device=is.null';
        if (!(await api.patch('family_state', mine, { data, player_device: dev })).length) throw Object.assign(new Error('moved'), { code: 'server' }); // taken over this very moment: the next round sorts it out
      } else {
        await api.insert('family_state', { data, player_device: dev }, { ignore: true });
      }
      sent = data;
      sentAt = clock();
    }
    const at = now().toISOString();
    for (const [word, ids] of outcome) await api.patch('commands', `id=in.(${ids.join(',')})`, { applied_at: at, outcome: word });
    await tidy();
    return carried > 0;
  }

  // ------------------------------------------------------------------ a grown-up's own device

  async function managerRound() {
    const dev = device();
    // 1. what was done here, in the order it was done
    for (const c of [...B().outbox]) {
      if (c.sent) continue;
      try {
        await api.insert('commands', { id: c.id, device: dev, type: c.type, payload: c.payload }, { ignore: true });
      } catch (e) {
        if (e.code !== 'server' || !(e.status >= 400 && e.status < 500)) throw e; // could not be reached: try again next round
        box.set((b) => { b.outbox = b.outbox.filter((x) => x.id !== c.id); }); // refused for good: it must not hold up the ones behind it
        continue;
      }
      box.set((b) => { const mine = b.outbox.find((x) => x.id === c.id); if (mine) mine.sent = true; });
    }
    // 2. which of those his device has carried out - asked BEFORE his state is read, so the state is at least as new
    const out = B().outbox.filter((c) => c.sent).map((c) => c.id).slice(0, 60);
    let finished = new Set();
    if (out.length) {
      const open = new Set(rows(await api.get('commands', `select=id&applied_at=is.null&id=in.(${out.join(',')})`)).map((r) => r.id));
      finished = new Set(out.filter((id) => !open.has(id)));
    }
    // 3. how things stand on his device
    const row = (await api.get('family_state', 'select=data,player_device,updated_at'))[0] || null;
    const before = `${B().snap?.at}|${B().outbox.length}`;
    box.set((b) => {
      b.snap = row ? { data: row.data, at: row.updated_at, player: row.player_device || '' } : null;
      b.outbox = b.outbox.filter((c) => !finished.has(c.id));
    });
    view = null;
    return before !== `${B().snap?.at}|${B().outbox.length}`;
  }

  // ------------------------------------------------------------------ rounds

  function sync() {
    if (running) return running;
    if (!role()) return Promise.resolve();
    running = (async () => {
      let news = false;
      const was = role();
      late = null;
      try {
        news = role() === 'player' ? await playerRound() : await managerRound();
        error = late ? late.code || 'server' : '';
        box.set((b) => { b.lastSync = clock(); });
      } catch (e) {
        error = e?.code || 'server';
      } finally {
        running = null;
        if (role() !== was) { view = null; news = true; } // signed out by the server, or another device took over
        tell(news ? 'data' : 'status');
        if (again && !hold) {
          const why = again;
          again = '';
          kick(why);
        }
      }
    })();
    return running;
  }

  /**
   * Ask for a round soon. why: 'change' (the save changed; wait until things settle),
   * 'now' (a grown-up did something), 'look' (a screen wants fresh news), 'tick' (the clock).
   */
  function kick(why = 'change') {
    if (own || hold || !role() || (why === 'change' && role() !== 'player')) return;
    if (running) {
      if (why !== 'tick' && again !== 'now') again = why; // asked for again once this round is over ('now' outranks the rest)
      return;
    }
    if (why === 'tick' && clock() - (B().lastSync || 0) < (role() === 'player' ? 40000 : 12000)) return;
    clearTimeout(timer);
    const go = () => {
      if (screen() === 'mission') timer = setTimeout(go, 5000); // never in the middle of a mission
      else sync();
    };
    timer = setTimeout(go, why === 'change' ? 2500 : 300);
  }

  // ------------------------------------------------------------------ the parent area's way in

  const local = {
    remote: false,
    state: () => store.get(),
    run(type, payload) {
      let out;
      store.update((s) => { out = act(s, type, payload, now()); });
      drop(out.drop);
      return out.result;
    },
    savePhoto: (blob) => shelf.save(blob),
  };
  const remote = {
    remote: true,
    state: () => (view ||= viewOf(B().snap?.data, B().outbox, now())),
    run(type, payload) {
      const p = JSON.parse(JSON.stringify(payload || {}));
      const s = remote.state();
      if (type === 'add' && p.item && !p.item.id) p.item.id = uid(); // both devices call the new thing by the same id
      if (type === 'given') {
        const e = s.rewards.earned.find((x) => x.id === p.id);
        if (e) Object.assign(p, { src: e.src, ref: e.ref, day: e.day }); // his device may know it under another id
      }
      if (type === 'expect') p.day = todayKey(now()); // it is about today: arriving tomorrow, it must not tick tomorrow's
      const out = act(s, type, p, now());
      for (const id of out.drop) seen.delete(id); // his device tidies the folder when it carries this out
      box.set((b) => { b.outbox.push({ id: newId(), type, payload: p, sent: false }); });
      tell('status');
      kick('now');
      return out.result;
    },
    /** The picture goes straight into the family's folder; his device fetches it with the command. */
    async savePhoto(blob) {
      const id = `p${clock().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
      await api.upload(id, blob);
      seen.set(id, blob);
      return id;
    },
  };

  return {
    /** How the parent area reads and changes his lists: this device's own save, or (a grown-up's device) his device from afar. */
    desk: () => (role() === 'manager' ? remote : local),
    picture,
    sync,
    kick,
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    status() {
      const b = B();
      return {
        signedIn: signedIn(), email: b.session?.user?.email || b.email || '', role: role(), moved: !!b.moved,
        busy: !!running, error, lastSync: b.lastSync || 0,
        waiting: b.outbox.length, // a grown-up's device: changes his device has not carried out yet
        unsent: b.outbox.filter((c) => !c.sent).length, // ... of which these have not even left this device
        heard: b.snap ? Date.parse(b.snap.at) || 0 : 0, // ... when his device last reported
        connected: !!b.snap?.player, // ... and whether there is a device he plays on at all
        lapsed: !b.session && !!b.account && !!b.role, // it was signed in and set up, and the sign-in has run out
        lapsedRole: !b.session && b.account ? b.role : '',
      };
    },

    /** Returns 'in', or 'confirm' when the email address has to be confirmed before signing in. */
    async signUp(email, password) {
      const inNow = await api.signUp(email, password);
      box.set((b) => { b.email = email; });
      if (!inNow) return 'confirm';
      const session = B().session;
      box.set((b) => { forgetAccount(b); Object.assign(b, { email, account: session.user.id, session }); });
      error = '';
      view = null;
      tell('data');
      return 'in';
    },
    async signIn(email, password) {
      await api.signIn(email, password);
      const session = B().session;
      const who = session.user.id;
      box.set((b) => {
        if (b.account !== who) forgetAccount(b); // another family's leftovers never mix in
        Object.assign(b, { email, account: who, session });
      });
      error = '';
      view = null;
      tell('data');
      while (running) await running;
      if (role()) await sync();
    },
    /** Signing out forgets the account on this device (also one whose sign-in has run out). His save is not touched. */
    async signOut() {
      await settle();
      try {
        if (role() === 'player') {
          // his chore photos do not stay behind in the folder of an account this device no longer reports to
          const his = [...store.get().chores.log.filter((e) => e.status === 'pending').map((e) => e.photo), ...B().trash].filter((id) => PHOTO.test(id || ''));
          if (his.length) await api.remove(his).catch(() => {});
        }
        await api.signOut();
        box.set(forgetAccount);
        view = null;
        sent = null;
        error = '';
        seen.clear();
        tried.clear();
      } finally {
        hold = false;
      }
      tell('data');
    },

    /**
     * Say what this device is. 'player': he plays here - when another device is that already,
     * nothing changes and { taken: true } comes back unless `takeOver` is set.
     */
    async setRole(next, { takeOver = false } = {}) {
      await settle(); // no round with the old part while the part changes
      try {
        const dev = device();
        const me = `owner=eq.${api.userId()}`;
        const row = (await api.get('family_state', 'select=player_device'))[0] || null;
        if (next === 'player') {
          if (row?.player_device && row.player_device !== dev && !takeOver) return { taken: true };
          if (row) await api.patch('family_state', me, { player_device: dev });
          // Starting (again) as the device he plays on: every picture is sent afresh - another device may
          // have cleared the folder meanwhile - and the folder is not tidied for a while, so that a
          // device made "his" by mistake cannot clear away the real one's pictures at once.
          box.set((b) => Object.assign(b, { role: 'player', moved: false, snap: null, outbox: [], uploaded: [], tidied: clock() }));
          sent = null;
        } else {
          if (row?.player_device === dev) await api.patch('family_state', me, { player_device: null });
          box.set((b) => Object.assign(b, { role: 'manager', moved: false }));
        }
        view = null;
      } finally {
        hold = false;
      }
      tell('data');
      await sync();
      return { ok: true };
    },

    /**
     * A grown-up's device: send the rewards, chores and expectations that were typed into THIS
     * device's own game to his device (those it does not have by name). Returns how many.
     */
    async sendOwnLists() {
      if (role() !== 'manager') return 0;
      const mine = store.get();
      const his = remote.state();
      let n = 0;
      for (const [kind, from, to] of [['daily', mine.rewards.daily, his.rewards.daily], ['tier', mine.rewards.tiers, his.rewards.tiers], ['chore', mine.chores.list, his.chores.list], ['expect', mine.expectations.list, his.expectations.list]]) {
        for (const it of from) {
          if (to.some((x) => x.title === it.title)) continue;
          const item = { ...it, id: undefined, photo: null };
          const blob = it.photo ? await shelf.load(it.photo).catch(() => null) : null;
          if (blob) item.photo = await remote.savePhoto(blob).catch(() => null);
          remote.run('add', { kind, item });
          n++;
        }
      }
      return n;
    },

    /** Delete the family account and everything it holds online. What is on this device stays. */
    async deleteAccount() {
      await settle();
      try {
        // The pictures first, and only then the account: once it is gone nobody could remove them
        // any more. If they cannot be removed now, nothing is deleted and the grown-up tries again.
        for (let i = 0; i < 20; i++) {
          let names = [];
          try {
            names = (await api.list()).map((o) => o.name);
          } catch (e) {
            if (e.code !== 'setup') throw e; // (no folder at all: nothing to remove)
          }
          if (!names.length) break;
          await api.remove(names);
        }
        await api.rpc('delete_my_account');
        box.set(forgetAccount);
        view = null;
        sent = null;
        error = '';
        seen.clear();
        tried.clear();
      } finally {
        hold = false;
      }
      tell('data');
    },
  };
}
