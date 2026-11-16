// The family account, as the parent area shows it (Settings tab): signing in, saying what this
// device is, and how the account is doing. The work itself is in src/family/sync.js.

import { h } from '../core/dom.js';

const WHY = {
  network: 'Could not reach the family account. Check the internet connection and try again.',
  credentials: 'That email address and password do not go together.',
  confirm: 'This email address has not been confirmed yet. Open the link in the email that was sent to it, then sign in here.',
  exists: 'There is already an account for this email address. Press Sign in instead.',
  weak: 'That password is too short. Use at least 8 characters.',
  closed: 'New accounts are switched off for the family database.',
  busy: 'Too many tries. Wait a minute, then try again.',
  setup: 'The family database is not set up yet.',
  auth: 'The sign-in has run out. Please sign in again.',
  photos: 'The pictures on this device could not be read just now. Close the game completely, open it again and try once more.',
  server: 'That did not work. Try again in a moment.',
};
export const explain = (e) => WHY[e?.code || e] || WHY.server;

/** "just now", "5 min ago", "today at 14:05", "on Mon 3 Nov". */
export function ago(t, now = Date.now()) {
  if (!t) return 'never';
  const minutes = Math.round((now - t) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const d = new Date(t);
  return d.toDateString() === new Date(now).toDateString()
    ? `today at ${d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
    : `on ${d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}`;
}

// What survives a redraw of the tab (news from another device redraws it at any moment):
let said = ''; // the last thing the panel told the grown-up
let more = false; // is "More" open
/** A fresh visit to the parent area starts with a clean panel. */
export const resetFamilyPanel = () => { said = ''; more = false; };

const PLAY_HERE = 'On the device he plays on: For parents, Settings, Family account - sign in and choose “He plays on this device”.';

/** A grown-up's own device: a line above the lists saying whose they are and how fresh. */
export function familyNote(ctx) {
  const st = ctx.family.status();
  const note = (...lines) => h('section', { class: 'panel note-panel family-note', dataset: { note: 'family' } }, lines.filter(Boolean).map((t) => h('p', {}, t)));
  // The sign-in has run out: say so on every tab, or a grown-up would take these lists for his.
  if (st.lapsed) {
    return note(st.lapsedRole === 'manager'
      ? 'The sign-in to the family account has run out, so these are this device’s OWN lists, not his. Sign in again under Settings to see and change his.'
      : 'The sign-in to the family account has run out, so nothing is being shared with your other devices at the moment. Sign in again under Settings.');
  }
  if (st.role !== 'manager') return null;
  const sent = st.waiting - st.unsent;
  const are = (n) => `${n} ${n === 1 ? 'change is' : 'changes are'}`;
  return note(
    st.connected
      ? `These are HIS lists, from the device he plays on (it last reported ${ago(st.heard)}).`
      : `No device is set as the one he plays on yet, so what you do here waits. ${PLAY_HERE}`,
    st.unsent ? `${are(st.unsent)} still on this device and will be sent as soon as there is a connection.` : null,
    sent > 0 ? `${are(sent)} waiting for his device: ${sent === 1 ? 'it is' : 'they are'} carried out the next time the game is open there with internet.` : null,
    st.error ? explain(st.error) : null);
}

/** The "Family account" section. `redraw` draws the tab again. */
export function familySection(ctx, redraw) {
  const fam = ctx.family;
  const st = fam.status();
  const msg = h('p', { class: 'form-msg', role: 'status' }, said);
  let busy = false;
  /** Run one thing at a time; show why when it fails. `fn` returns a message to show, or nothing (then the tab is drawn again). */
  const job = (fn) => async (ev) => {
    ev?.preventDefault?.();
    if (busy) return;
    busy = true;
    said = '';
    msg.textContent = 'One moment…';
    let say = '';
    try {
      say = (await fn(ev)) || '';
    } catch (e) {
      say = explain(e);
    }
    busy = false;
    said = say.trim();
    if (say) msg.textContent = say;
    else redraw();
  };
  const button = (label, onclick, { cls = '', data = {} } = {}) => h('button', { class: `btn${cls ? ` ${cls}` : ''}`, type: 'button', dataset: data, onclick }, label);
  /** A button that asks to be pressed twice before it does something that cannot be taken back. */
  const twice = (label, sure, fn, opts) => button(label, job(async (ev) => {
    const b = ev.currentTarget;
    if (!b.dataset.sure) {
      b.dataset.sure = '1';
      b.textContent = sure;
      return ' ';
    }
    return fn();
  }), opts);
  const section = (...kids) => h('section', { class: 'panel family', dataset: { family: st.signedIn ? st.role || 'choose' : 'out' } }, h('h2', {}, 'Family account'), ...kids);

  // ---- not signed in
  if (!st.signedIn) {
    const email = h('input', { type: 'email', inputmode: 'email', autocomplete: 'username', autocapitalize: 'none', spellcheck: 'false', placeholder: 'you@example.com', dataset: { was: st.email } });
    email.value = st.email;
    const pass = h('input', { type: 'password', autocomplete: 'current-password', placeholder: 'at least 8 characters', dataset: { was: '' } });
    const typed = (creating) => {
      const e = email.value.trim();
      if (!/^\S+@\S+\.\S+$/.test(e)) return { say: 'Type your email address.' };
      if (!pass.value) return { say: 'Type the password.' };
      if (creating && pass.value.length < 8) return { say: WHY.weak };
      return { e, p: pass.value };
    };
    const form = h('form', { class: 'admin-form family-form', dataset: { form: 'family' } },
      h('label', { class: 'field' }, h('span', {}, 'Email address'), email),
      h('label', { class: 'field' }, h('span', {}, 'Password'), pass),
      h('div', { class: 'form-buttons' },
        h('button', { class: 'btn btn-primary', type: 'submit' }, 'Sign in'),
        button('Create the family account', job(async () => {
          const t = typed(true);
          if (t.say) return t.say;
          if ((await fam.signUp(t.e, t.p)) === 'confirm') return `Almost there: an email was sent to ${t.e}. Open the link in it, then press Sign in here.`;
          return '';
        }), { data: { act: 'create' } })),
      msg);
    form.addEventListener('submit', job(async () => {
      const t = typed(false);
      if (t.say) return t.say;
      await fam.signIn(t.e, t.p);
      return '';
    }));
    if ((st.lapsed || st.error === 'auth') && !said) msg.textContent = WHY.auth;
    return section(
      h('p', { class: 'fine' }, 'Optional. With a family account you can manage his rewards, chores and expectations from your own phone or computer, check his chore photos there, and see his points. Create the account once, then sign in with it on each device. Without it, nothing leaves this device.'),
      form,
      st.lapsed ? h('div', { class: 'row family-foot' }, button('Do not use the family account on this device any more', job(async () => { await fam.signOut(); return ''; }), { data: { act: 'forget' } })) : null);
  }

  /**
   * Before something that empties the list of changes waiting on this device: try to send them.
   * If some cannot be sent, say so once; a second press goes ahead and drops them.
   */
  const unsentFirst = async (b, what) => {
    if (b.dataset.drop) return '';
    await fam.sync();
    const n = fam.status().unsent;
    if (!n) return '';
    b.dataset.drop = '1';
    return `${n} ${n === 1 ? 'change' : 'changes'} made on this device could not be sent yet (no connection?). ${what} now drops ${n === 1 ? 'it' : 'them'} - press again to do it anyway, or try later.`;
  };
  const out = button('Sign out', job(async (ev) => {
    const warn = await unsentFirst(ev.currentTarget, 'Signing out');
    if (warn) return warn;
    await fam.signOut();
    return '';
  }), { data: { act: 'sign-out' } });
  const playHere = (label, cls) => button(label, job(async (ev) => {
    const b = ev.currentTarget;
    const warn = await unsentFirst(b, 'Switching');
    if (warn) return warn;
    const res = await fam.setRole('player', { takeOver: !!b.dataset.sure });
    if (!res.taken) return '';
    b.dataset.sure = '1';
    b.textContent = 'Yes - he plays on THIS device now';
    return 'Another device is already set as the one he plays on. Switch only if he really plays on this one from now on: his progress does not move with it.';
  }), { cls, data: { role: 'player' } });
  const mine = (label, cls) => button(label, job(async () => { await fam.setRole('manager'); return ''; }), { cls, data: { role: 'manager' } });

  // ---- signed in, but this device has not been told what it is
  if (!st.role) {
    return section(
      h('p', {}, 'Signed in as ', h('b', {}, st.email), '. What is this device?'),
      h('div', { class: 'row family-roles' }, playHere('He plays on this device', 'btn-primary'), mine('It is my own device', 'btn-primary')),
      h('p', { class: 'fine' }, 'Choose “He plays on this device” on the one device he plays on: his progress lives there. On every other device choose “It is my own device”: its parent area then shows and changes HIS rewards, chores and expectations.'),
      msg,
      h('div', { class: 'row family-foot' }, out));
  }

  // ---- signed in and working
  const player = st.role === 'player';
  const own = ctx.store.get();
  const ownCount = own.rewards.daily.length + own.rewards.tiers.length + own.chores.list.length + own.expectations.list.length;
  const state = st.error ? explain(st.error)
    : player ? `Up to date in the family account: ${ago(st.lastSync)}.`
      : st.connected ? `His device last reported ${ago(st.heard)}.${st.waiting ? ` ${st.waiting} of your changes ${st.waiting === 1 ? 'is' : 'are'} waiting${st.unsent ? ` (${st.unsent} not sent yet)` : ' for it'}.` : ''}`
        : `No device is set as the one he plays on yet. ${PLAY_HERE}`;
  return section(
    h('p', {}, 'Signed in as ', h('b', {}, st.email), '. ', h('b', { dataset: { is: st.role } }, player ? 'He plays on this device.' : 'This is a grown-up’s device.')),
    st.moved ? h('p', { class: 'form-msg' }, 'Another device was made the one he plays on, so this one now works as a grown-up’s device. His game on this device is untouched.') : null,
    h('p', { class: 'fine' }, player
      ? 'What a grown-up needs is kept up to date in the family account from here: the lists, his points, what he is owed and chore photos waiting to be checked. What you change on your own device is carried out here the next time the game is open with internet.'
      : 'The Rewards, Chores and Expectations tabs on this device show HIS lists. What you change is carried out on his device the next time the game is open there with internet. The game on this device is not his: its own progress and settings stay as they are.'),
    h('p', { class: 'family-state', dataset: { state: st.error || 'ok' } }, state),
    msg,
    h('div', { class: 'row family-foot' },
      button('Check now', job(async () => { await fam.sync(); return ''; }), { cls: 'btn-primary', data: { act: 'sync' } }),
      out),
    h('details', { class: 'family-more', open: more, ontoggle: (e) => { more = e.currentTarget.open; } },
      h('summary', {}, 'More'),
      h('div', { class: 'row family-foot' },
        player ? mine('This is a grown-up’s device after all') : playHere('He plays on this device after all'),
        !player && ownCount
          ? button(`Copy this device’s own lists to his device (${ownCount})`, job(async () => {
              const n = await fam.sendOwnLists();
              return n ? `${n} sent. They appear on his device the next time the game is open there.` : 'His device has all of them already.';
            }), { data: { act: 'send-own' } })
          : null,
        twice('Delete the family account', 'Tap again to delete the account and everything stored online', async () => { await fam.deleteAccount(); return ''; }, { cls: 'btn-danger', data: { act: 'delete-account' } })),
      h('p', { class: 'fine' }, 'Deleting the account removes what is stored online (the lists as last sent, the pictures, the sign-in). What is on the devices themselves stays.')));
}
