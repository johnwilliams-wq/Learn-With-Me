// Grown-ups' tools: the PIN lock, and the Rewards and Chores tabs of the parent area.

import { h, mount } from '../core/dom.js';
import { hasPin, setPin, checkPin, validPin } from '../core/pin.js';
import { uid, owed, decideChore, expectationsToday, setExpectation, REWARD_ICONS, CHORE_ICONS, EXPECT_ICONS } from '../rewards/logic.js';
import { loadPhoto, deletePhoto } from '../core/photos.js';

// ------------------------------------------------------------------ PIN lock

/**
 * Shows the lock. First time: a sum only a grown-up can do, then "choose a PIN".
 * After that: the PIN pad. Calls onOpen() once the door is open.
 */
export function pinGate(ctx, body, onOpen) {
  const { store } = ctx;

  function pad(title, hint, onDone) {
    let value = '';
    const dots = h('div', { class: 'pin-dots' });
    const msg = h('p', { class: 'gate-msg' }, hint || '');
    const draw = () => mount(dots, Array.from({ length: Math.max(6, value.length) }, (_, i) => h('i', { class: i < value.length ? 'on' : '' })));
    const press = (d) => {
      if (d === 'del') value = value.slice(0, -1);
      else if (value.length < 8) value += d;
      draw();
    };
    const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'del', '0', 'ok'].map((k) =>
      h('button', { class: `btn pin-key${k === 'ok' ? ' btn-primary' : ''}`, type: 'button', dataset: { key: k },
        onclick: async () => {
          if (k !== 'ok') return press(k);
          const res = await onDone(value);
          if (res) {
            msg.textContent = res;
            value = '';
            draw();
          }
        } }, k === 'del' ? '⌫' : k === 'ok' ? 'OK' : k));
    draw();
    mount(body, h('div', { class: 'panel small gate' }, h('h2', {}, title), dots, h('div', { class: 'pin-pad' }, keys), msg));
  }

  function choose() {
    pad('Choose a parent PIN', '4 to 8 digits. You will need it every time.', async (first) => {
      if (!validPin(first)) return 'Use 4 to 8 digits.';
      pad('Type the PIN again', '', async (second) => {
        if (second !== first) {
          choose();
          return '';
        }
        await setPin(store, first);
        onOpen();
        return '';
      });
      return '';
    });
  }

  function sum() {
    const a = 12 + Math.floor(Math.random() * 7);
    const b = 6 + Math.floor(Math.random() * 4);
    const input = h('input', { type: 'text', inputmode: 'numeric', autocomplete: 'off', class: 'gate-input', 'aria-label': 'Answer' });
    const msg = h('p', { class: 'gate-msg' });
    const form = h('form', { class: 'panel small gate' },
      h('h2', {}, 'Grown-ups only'),
      h('p', {}, `First time here. What is ${a} × ${b}?`),
      input, h('button', { class: 'btn btn-primary', type: 'submit' }, 'Next'), msg);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (Number(input.value.trim()) === a * b) choose();
      else {
        msg.textContent = 'Not quite - try again.';
        input.value = '';
      }
    });
    mount(body, form);
  }

  if (!hasPin(store)) return sum();
  pad('Parent PIN', '', async (pin) => {
    const res = await checkPin(store, pin);
    if (res === 'ok') {
      onOpen();
      return '';
    }
    return res === 'locked' ? 'Too many tries. Wait half a minute.' : 'Wrong PIN.';
  });
}

/** "Change PIN" for the settings tab. */
export function changePinButton(ctx, body, back) {
  return h('button', { class: 'btn', type: 'button', onclick: () => {
    ctx.store.update((s) => { s.admin = { hash: '', salt: '', tries: 0, lockUntil: 0 }; });
    pinGate(ctx, body, back);
  } }, 'Change PIN');
}

// ------------------------------------------------------------------ small form helpers

const field = (label, control) => h('label', { class: 'field' }, h('span', {}, label), control);
const text = (placeholder, max = 60) => h('input', { type: 'text', maxlength: max, placeholder, autocomplete: 'off' });
const number = (value, min = 1, max = 100000) => h('input', { type: 'number', inputmode: 'numeric', min, max, value });
function iconPicker(icons) {
  const sel = h('select', { class: 'icon-select', 'aria-label': 'Picture' }, icons.map((i) => h('option', { value: i }, i)));
  return sel;
}
const when = (t) => new Date(t).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
const section = (title, ...kids) => h('section', { class: 'panel' }, h('h2', {}, title), ...kids);
const del = (label, fn) => h('button', { class: 'btn btn-chip btn-danger', type: 'button', 'aria-label': `Delete ${label}`, onclick: fn }, 'Delete');

// ------------------------------------------------------------------ Rewards tab

export function rewardsTab(ctx, refresh) {
  const { store } = ctx;
  const s = store.get();
  const R = s.rewards;
  const waiting = owed(s);
  const sourceName = { daily: 'daily reward', tier: 'lifetime reward', chore: 'chore reward' };

  const dIcon = iconPicker(REWARD_ICONS);
  const dTitle = text('e.g. 15 minutes of game time');
  const dNeed = number(3, 1, 20);
  const tIcon = iconPicker(REWARD_ICONS);
  const tTitle = text('e.g. Trip to the trampoline park');
  const tNeed = number(1000, 10, 1000000);
  const repeat = h('input', { type: 'checkbox' });
  repeat.checked = !!R.countPerfected;
  repeat.addEventListener('change', () => store.update((st) => { st.rewards.countPerfected = repeat.checked; }));

  const add = (list, make) => (e) => {
    e.preventDefault();
    const item = make();
    if (!item.title) return;
    store.update((st) => { st.rewards[list].push(item); });
    refresh();
  };
  const remove = (list, id) => () => {
    store.update((st) => { st.rewards[list] = st.rewards[list].filter((r) => r.id !== id); });
    refresh();
  };

  const ex = expectationsToday(s);
  return [
    ex.total && !ex.allDone
      ? h('section', { class: 'panel note-panel', dataset: { note: 'locked' } }, h('p', {}, `Today's expectations are not all done yet (${ex.done} of ${ex.total}), so his rewards are locked on his side.`))
      : null,
    section(`To hand out (${waiting.length})`,
      waiting.length
        ? h('div', { class: 'admin-list' }, waiting.map((e) => h('div', { class: 'admin-row', dataset: { earned: e.id } },
            h('span', { class: 'emoji' }, e.icon || '🎁'),
            h('span', { class: 'grow' }, h('b', {}, e.title), h('small', {}, `${sourceName[e.src] || 'reward'}, won ${when(e.t)}`)),
            h('button', { class: 'btn btn-chip btn-primary', type: 'button', onclick: () => {
              store.update((st) => { const x = st.rewards.earned.find((y) => y.id === e.id); if (x) x.given = true; });
              refresh();
            } }, 'Given'))))
        : h('p', { class: 'fine' }, 'Nothing waiting. When he wins a reward it appears here until you mark it as given.')),
    section('Daily rewards',
      h('p', { class: 'fine' }, 'He wins one of these each day he finishes that many missions. A mission is 6 instructions, about 3 to 5 minutes.'),
      h('div', { class: 'admin-list' }, R.daily.slice().sort((a, b) => a.missions - b.missions).map((r) => h('div', { class: 'admin-row' },
        h('span', { class: 'emoji' }, r.icon), h('span', { class: 'grow' }, h('b', {}, r.title), h('small', {}, `${r.missions} ${r.missions === 1 ? 'mission' : 'missions'} in a day`)), del(r.title, remove('daily', r.id))))),
      h('form', { class: 'admin-form', dataset: { form: 'daily' }, onsubmit: add('daily', () => ({ id: uid(), icon: dIcon.value, title: dTitle.value.trim(), missions: Math.max(1, Math.min(20, Number(dNeed.value) || 1)) })) },
        dIcon, field('Reward', dTitle), field('Missions in a day', dNeed), h('button', { class: 'btn btn-primary', type: 'submit' }, 'Add')),
      h('label', { class: 'setting' }, repeat, h('span', {}, h('b', {}, 'Count easy and repeated missions too'),
        h('small', {}, 'Off: only levels below 3 stars count - so replaying something he has already mastered does not earn rewards.')))),
    section('Lifetime rewards',
      h('p', { class: 'fine' }, `Won once, when his total points reach the number you set. He has ${s.xp} points now. A mission earns roughly 40 to 95 points; a chore earns what you give it.`),
      h('div', { class: 'admin-list' }, R.tiers.slice().sort((a, b) => a.points - b.points).map((t) => h('div', { class: 'admin-row' },
        h('span', { class: 'emoji' }, t.icon), h('span', { class: 'grow' }, h('b', {}, t.title), h('small', {}, `at ${t.points} points${s.xp >= t.points ? ' (reached)' : ''}`)), del(t.title, remove('tiers', t.id))))),
      h('form', { class: 'admin-form', dataset: { form: 'tier' }, onsubmit: add('tiers', () => ({ id: uid(), icon: tIcon.value, title: tTitle.value.trim(), points: Math.max(10, Number(tNeed.value) || 10) })) },
        tIcon, field('Reward', tTitle), field('Total points needed', tNeed), h('button', { class: 'btn btn-primary', type: 'submit' }, 'Add'))),
  ];
}

// ------------------------------------------------------------------ Chores tab

export function choresTab(ctx, refresh) {
  const { store } = ctx;
  const s = store.get();
  const C = s.chores;
  const pending = C.log.filter((e) => e.status === 'pending');
  const recent = C.log.filter((e) => e.status !== 'pending').slice(-12).reverse();
  const urls = [];

  const decide = (entry, approve, note) => {
    let photo = null;
    store.update((st) => { ({ photo } = decideChore(st, entry.id, approve, note)); });
    deletePhoto(photo);
    for (const u of urls) URL.revokeObjectURL(u);
    refresh();
  };

  const cIcon = iconPicker(CHORE_ICONS);
  const cTitle = text('e.g. Make your bed');
  const cPoints = number(20, 0, 10000);
  const cRepeat = h('select', {}, h('option', { value: 'daily' }, 'Every day'), h('option', { value: 'weekly' }, 'Once a week'), h('option', { value: 'once' }, 'One time only'));
  const cReward = text('optional, e.g. $1', 40);
  const needPhoto = h('input', { type: 'checkbox' });
  needPhoto.checked = C.requirePhoto !== false;
  needPhoto.addEventListener('change', () => store.update((st) => { st.chores.requirePhoto = needPhoto.checked; }));
  const repeatName = { daily: 'every day', weekly: 'once a week', once: 'one time' };

  return [
    section(`To check (${pending.length})`,
      pending.length
        ? h('div', { class: 'admin-list' }, pending.map((e) => {
            const pic = h('div', { class: 'check-photo' }, e.photo ? 'Loading photo…' : 'No photo');
            if (e.photo) {
              loadPhoto(e.photo).then((blob) => {
                if (!blob) return void (pic.textContent = 'Photo not found');
                const url = URL.createObjectURL(blob);
                urls.push(url);
                pic.replaceChildren(h('img', { src: url, alt: `Photo for ${e.title}` }));
              });
            }
            const note = text('Optional note if not yet (he will see it)', 120);
            return h('div', { class: 'check-card', dataset: { entry: e.id } },
              pic,
              h('div', { class: 'check-info' },
                h('b', {}, `${e.icon} ${e.title}`), h('small', {}, `${when(e.t)} · +${e.points} points${e.reward ? ` · ${e.reward}` : ''}`),
                note,
                h('div', { class: 'row' },
                  h('button', { class: 'btn btn-done', type: 'button', dataset: { act: 'approve' }, onclick: () => decide(e, true) }, 'Approve'),
                  h('button', { class: 'btn', type: 'button', dataset: { act: 'reject' }, onclick: () => decide(e, false, note.value) }, 'Not yet'))));
          }))
        : h('p', { class: 'fine' }, 'Nothing to check. When he marks a chore as done it appears here with his photo.')),
    section('Chores',
      h('div', { class: 'admin-list' }, C.list.map((c) => h('div', { class: 'admin-row' },
        h('span', { class: 'emoji' }, c.icon), h('span', { class: 'grow' }, h('b', {}, c.title), h('small', {}, `${c.points} points, ${repeatName[c.repeat]}${c.reward ? `, plus: ${c.reward}` : ''}`)),
        del(c.title, () => { store.update((st) => { st.chores.list = st.chores.list.filter((x) => x.id !== c.id); }); refresh(); })))),
      h('form', { class: 'admin-form', dataset: { form: 'chore' }, onsubmit: (ev) => {
        ev.preventDefault();
        const title = cTitle.value.trim();
        if (!title) return;
        store.update((st) => { st.chores.list.push({ id: uid(), icon: cIcon.value, title, points: Math.max(0, Number(cPoints.value) || 0), repeat: cRepeat.value, reward: cReward.value.trim() }); });
        refresh();
      } },
        cIcon, field('Chore', cTitle), field('Points', cPoints), field('How often', cRepeat), field('Extra reward', cReward), h('button', { class: 'btn btn-primary', type: 'submit' }, 'Add')),
      h('label', { class: 'setting' }, needPhoto, h('span', {}, h('b', {}, 'Ask for a photo'), h('small', {}, 'Photos stay on this iPad and are deleted once you approve or send the chore back.')))),
    section('Recently checked',
      recent.length
        ? h('ul', { class: 'obs' }, recent.map((e) => h('li', {}, `${e.icon} ${e.title} - ${e.status === 'approved' ? `approved, +${e.points} points` : `sent back${e.note ? `: ${e.note}` : ''}`} (${when(e.decided || e.t)})`)))
        : h('p', { class: 'fine' }, 'Nothing yet.')),
  ];
}

// ------------------------------------------------------------------ Expectations tab

export function expectationsTab(ctx, refresh) {
  const { store } = ctx;
  const s = store.get();
  const ex = expectationsToday(s);
  const eIcon = iconPicker(EXPECT_ICONS);
  const eTitle = text('e.g. Brush your teeth');
  const confirm = h('input', { type: 'checkbox' });
  confirm.checked = !!s.expectations.confirm;
  confirm.addEventListener('change', () => { store.update((st) => { st.expectations.confirm = confirm.checked; }); refresh(); });
  const set = (id, done) => () => { store.update((st) => setExpectation(st, id, done)); refresh(); };
  const stateName = { open: 'not done yet', pending: 'he says it is done', done: 'done' };

  return [
    section(`Today (${ex.done} of ${ex.total} done)`,
      h('p', { class: 'fine' }, 'Expectations earn nothing. But each day his rewards stay locked until every one of them is done.'),
      ex.total
        ? h('div', { class: 'admin-list' }, ex.items.map((e) => h('div', { class: 'admin-row', dataset: { expect: e.id } },
            h('span', { class: 'emoji' }, e.icon),
            h('span', { class: 'grow' }, h('b', {}, e.title), h('small', {}, stateName[e.state])),
            e.state === 'done'
              ? h('button', { class: 'btn btn-chip', type: 'button', dataset: { act: 'undo' }, onclick: set(e.id, false) }, 'Not done')
              : h('button', { class: 'btn btn-chip btn-primary', type: 'button', dataset: { act: 'ok' }, onclick: set(e.id, true) }, e.state === 'pending' ? 'OK' : 'Mark done'),
            del(e.title, () => { store.update((st) => { st.expectations.list = st.expectations.list.filter((x) => x.id !== e.id); }); refresh(); }))))
        : h('p', { class: 'fine' }, 'No expectations yet. With none, his rewards are never locked.'),
      h('form', { class: 'admin-form', dataset: { form: 'expect' }, onsubmit: (ev) => {
        ev.preventDefault();
        const title = eTitle.value.trim();
        if (!title) return;
        store.update((st) => { st.expectations.list.push({ id: uid(), icon: eIcon.value, title }); });
        refresh();
      } },
        eIcon, field('Expectation', eTitle), h('button', { class: 'btn btn-primary', type: 'submit' }, 'Add')),
      h('label', { class: 'setting' }, confirm, h('span', {}, h('b', {}, 'He needs my OK for each one'),
        h('small', {}, 'Off: his own tick counts. On: his tick waits here until you press OK.')))),
  ];
}
