// Grown-ups' tools: the PIN lock, and the Rewards, Chores and Expectations tabs of the parent area.
// Everything in those lists can be added, changed (Edit) and removed; each thing has a name, an
// optional description, and - for the rewards in the mine - an optional picture.
//
// The tabs never touch the save themselves: they read and change the lists through a "desk"
// (ctx.family.desk(), src/family/sync.js). On the device he plays on that is this device's own
// save; on a grown-up's own device, signed in to the family account, it is HIS device from afar.
// The PIN is always this device's own.

import { h, mount } from '../core/dom.js';
import { hasPin, setPin, checkPin, validPin } from '../core/pin.js';
import { owed, expectationsToday, tidy, TITLE_MAX, NOTE_MAX, REWARD_ICONS, CHORE_ICONS, EXPECT_ICONS } from '../rewards/logic.js';
import { loadPhoto, shrinkImage, showPhoto } from '../core/photos.js';

// ------------------------------------------------------------------ PIN lock

/**
 * Shows the lock. First time: a sum only a grown-up can do, then "choose a PIN".
 * After that: the PIN pad. Calls onOpen() once the door is open.
 * `change`: a grown-up who is already inside chooses a new PIN. The old one stays in force
 * until the new one has been typed twice - walking away half-way changes nothing.
 */
export function pinGate(ctx, body, onOpen, { change = false } = {}) {
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
    let checking = false;
    const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'del', '0', 'ok'].map((k) =>
      h('button', { class: `btn pin-key${k === 'ok' ? ' btn-primary' : ''}`, type: 'button', dataset: { key: k },
        onclick: async () => {
          if (checking) return;
          if (k !== 'ok') return press(k);
          // OK with nothing (or too little) typed is not a try: the tail of a double tap on OK lands here
          if (value.length < 4) return void (msg.textContent = value ? 'A PIN has 4 to 8 digits.' : msg.textContent);
          checking = true;
          let res = '';
          try {
            res = await onDone(value);
          } finally {
            checking = false;
          }
          if (res) {
            msg.textContent = res;
            value = '';
            draw();
          }
        } }, k === 'del' ? '⌫' : k === 'ok' ? 'OK' : k));
    draw();
    mount(body, h('div', { class: 'panel small gate' }, h('h2', {}, title), dots, h('div', { class: 'pin-pad' }, keys), msg));
  }

  function choose(hint = '4 to 8 digits. You will need it every time.') {
    pad('Choose a parent PIN', hint, async (first) => {
      if (!validPin(first)) return 'Use 4 to 8 digits.';
      pad('Type the PIN again', '', async (second) => {
        if (second !== first) {
          choose('The two were not the same. Choose the PIN again.');
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

  if (change) return choose();
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
  return h('button', { class: 'btn', type: 'button', dataset: { act: 'change-pin' }, onclick: () => pinGate(ctx, body, back, { change: true }) }, 'Change PIN');
}

// ------------------------------------------------------------------ small form helpers

const field = (label, control, cls = '') => h('label', { class: `field${cls ? ` ${cls}` : ''}` }, h('span', {}, label), control);
function text(placeholder, max = TITLE_MAX, value = '') {
  const input = h('input', { type: 'text', maxlength: max, placeholder, autocomplete: 'off' });
  input.value = input.dataset.was = value; // "was": so the parent area can tell a box someone is typing in from an untouched one
  return input;
}
const number = (value, min = 1, max = 100000) => h('input', { type: 'number', inputmode: 'numeric', min, max, value, required: true });
function noteBox(value = '') {
  const box = h('textarea', { rows: 2, maxlength: NOTE_MAX, placeholder: 'optional - a few more words. He sees them, and the speaker button reads them to him.' });
  box.value = box.dataset.was = value;
  return box;
}
function iconPicker(icons, value) {
  const all = value && !icons.includes(value) ? [value, ...icons] : icons;
  const sel = h('select', { class: 'icon-select', 'aria-label': 'Picture' }, all.map((i) => h('option', { value: i }, i)));
  if (value) sel.value = value;
  return sel;
}
function choice(options, value) {
  const sel = h('select', {}, Object.entries(options).map(([v, label]) => h('option', { value: v }, label)));
  if (value) sel.value = value;
  return sel;
}
const when = (t) => new Date(t).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
const section = (title, ...kids) => h('section', { class: 'panel' }, h('h2', {}, title), ...kids);

// ------------------------------------------------------------------ one list of things, with Add / Edit / Delete

const REPEAT = { daily: 'Every day', weekly: 'Once a week', once: 'One time only' };
/** What the form asks for each kind of thing, besides its picture, name and description. */
const KINDS = {
  daily: { icons: REWARD_ICONS, label: 'Reward', example: 'e.g. 15 minutes of game time',
    fields: (it) => ({ missions: ['Missions in a day', number(it?.missions ?? 3, 1, 20)] }) },
  tier: { icons: REWARD_ICONS, label: 'Reward', example: 'e.g. Trip to the trampoline park', picture: true,
    fields: (it) => ({ points: ['Total points needed', number(it?.points ?? 1000, 10, 1000000)] }) },
  chore: { icons: CHORE_ICONS, label: 'Chore', example: 'e.g. Make your bed',
    fields: (it) => ({ points: ['Points', number(it?.points ?? 20, 0, 10000)], repeat: ['How often', choice(REPEAT, it?.repeat)], reward: ['Extra reward', text('optional, e.g. $1', 40, it?.reward || '')] }) },
  expect: { icons: EXPECT_ICONS, label: 'Expectation', example: 'e.g. Brush your teeth', fields: () => ({}) },
};

let editing = null; // 'kind:id' of the row that is open for changes (one at a time)
let pressedAt = 0; // when a button in a row last did something (see once(); a change of tab starts afresh)
let showing = []; // pictures on screen: each entry frees one of them again
const freePictures = () => { for (const free of showing.splice(0)) free(); };
/**
 * What a grown-up has started is never thrown away by a redraw of the tab - and every button on it
 * redraws it, as does news from another device. A form someone has touched is kept as it is and
 * put back in its place; so is a note typed for a chore that is about to be sent back.
 *   add    kind -> the "add" form of that kind       edit  { key: 'kind:id', form } - the row being changed
 *   notes  chore entry id -> the text typed so far
 */
const kept = { add: {}, edit: null, notes: {} };
/** Leaving the parent area or changing tab: no form stays open, no picture stays in memory. */
export const closeForms = () => { editing = null; kept.add = {}; kept.edit = null; kept.notes = {}; pressedAt = 0; freePictures(); };
/** A row is being changed and has not been saved: say so there instead of quietly dropping it. Returns true when there is one. */
function unsavedEdit(except = '') {
  if (!kept.edit || kept.edit.key === except) return false;
  const msg = kept.edit.form.querySelector('.form-msg');
  if (msg) msg.textContent = 'Save or cancel this one first.';
  kept.edit.form.scrollIntoView?.({ block: 'center' });
  return true;
}

/**
 * For the buttons in a row (Given, Approve, Not yet, Delete, Mark done): a second press within a
 * moment of the last one is the tail of a double tap - and by then the list has been redrawn and
 * the NEXT row sits under the finger. It would hand out, approve or delete that one as well.
 */
const once = (fn) => (ev) => {
  if (performance.now() - pressedAt < 500) return;
  pressedAt = performance.now();
  fn(ev);
};

/**
 * The form for one reward, chore or expectation: the same for a new one (item = null) and for
 * changing one. A picture is only stored when the form is saved, so nothing is left behind by
 * a form that is abandoned.
 */
function itemForm(ctx, kind, item, redraw) {
  const key = item ? `${kind}:${item.id}` : '';
  const mine = item ? (kept.edit?.key === key ? kept.edit.form : null) : kept.add[kind];
  if (mine) {
    mine.again?.(); // (its pictures were let go of by the redraw: show them again)
    return mine;
  }
  const desk = ctx.family.desk();
  const K = KINDS[kind];
  const icon = iconPicker(K.icons, item?.icon);
  const title = text(K.example, TITLE_MAX, item?.title || '');
  const note = noteBox(item?.note || '');
  const more = K.fields(item);
  const msg = h('p', { class: 'form-msg', role: 'status' });

  // The picture (rewards in the mine): undefined = leave as it is, null = none, a Blob = a new one.
  let picture;
  let preview = null;
  let busy = false; // a picture is being read or the form is being saved: no second press
  showing.push(() => { if (preview) URL.revokeObjectURL(preview); });
  const show = h('span', { class: 'pic-preview' });
  const drawPicture = () => {
    if (preview) URL.revokeObjectURL(preview);
    preview = null;
    show.className = 'pic-preview';
    show.replaceChildren();
    if (picture) {
      preview = URL.createObjectURL(picture);
      show.append(h('img', { src: preview, alt: 'The picture you chose' }));
      show.classList.add('has-photo');
    } else if (picture === undefined && item?.photo) {
      showing.push(showPhoto(show, item.photo, 'The picture of this reward'));
    }
    removeBtn.hidden = !(picture || (picture === undefined && item?.photo));
  };
  const file = h('input', { type: 'file', accept: 'image/*', class: 'visually-hidden', tabindex: '-1', 'aria-hidden': 'true' });
  file.addEventListener('change', async () => {
    const chosen = file.files && file.files[0];
    file.value = '';
    if (!chosen || busy) return;
    busy = true;
    try {
      picture = await shrinkImage(chosen, 900, 0.82);
      msg.textContent = '';
    } catch {
      msg.textContent = 'That picture could not be read. Try another one.';
    }
    busy = false;
    drawPicture();
  });
  const removeBtn = h('button', { class: 'btn btn-chip', type: 'button', dataset: { act: 'no-picture' }, onclick: () => { picture = null; drawPicture(); touched(); } }, 'Remove picture');
  const pictureRow = K.picture
    ? h('div', { class: 'field wide pic-field' }, h('span', {}, 'Picture of the reward (optional) - he sees it in his mine'),
        h('div', { class: 'pic-row' }, show,
          h('button', { class: 'btn btn-chip', type: 'button', dataset: { act: 'picture' }, onclick: () => file.click() }, 'Choose a picture'), removeBtn, file))
    : null;
  if (K.picture) drawPicture();

  const form = h('form', { class: `admin-form${item ? ' is-edit' : ''}`, dataset: item ? { edit: kind } : { form: kind } },
    icon, field(K.label, title),
    Object.values(more).map(([label, control]) => field(label, control)),
    field('Description', note, 'wide'),
    pictureRow,
    h('div', { class: 'form-buttons' },
      h('button', { class: 'btn btn-primary', type: 'submit' }, item ? 'Save' : 'Add'),
      item ? h('button', { class: 'btn', type: 'button', dataset: { act: 'cancel' }, onclick: () => { editing = null; settled(); redraw(); } }, 'Cancel') : null),
    msg);
  // Someone has started on this form: from now on it is kept across redraws, until it is saved or cancelled.
  function touched() {
    form.dataset.dirty = '1';
    if (item) kept.edit = { key, form };
    else kept.add[kind] = form;
  }
  function settled() {
    delete form.dataset.dirty;
    if (item) { if (kept.edit?.form === form) kept.edit = null; } else if (kept.add[kind] === form) delete kept.add[kind];
  }
  form.addEventListener('input', touched);
  form.addEventListener('change', touched);
  form.again = () => {
    if (!K.picture) return;
    showing.push(() => { if (preview) URL.revokeObjectURL(preview); });
    drawPicture();
  };
  // He has won this reward and it has not been handed over: a new name changes what he is owed.
  if (item && (kind === 'daily' || kind === 'tier') && owed(desk.state()).some((e) => e.src === kind && e.ref === item.id)) {
    msg.textContent = 'He has won this one and it is waiting to be handed out. A new name changes what you owe him - for a new reward, add a new one instead.';
  }
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    if (busy) return;
    if (!tidy(title.value)) {
      msg.textContent = 'It needs a name.';
      return void title.focus();
    }
    const raw = { icon: icon.value, title: title.value, note: note.value };
    for (const [key, [, control]] of Object.entries(more)) raw[key] = control.value;
    busy = true;
    if (picture !== undefined) {
      raw.photo = null;
      if (picture) {
        try {
          raw.photo = await desk.savePhoto(picture);
        } catch {
          // nothing is changed (his old picture stays too): the grown-up decides what to do
          msg.textContent = desk.remote
            ? 'The picture could not be sent to the family account. Check the internet connection and try again, or remove the picture.'
            : 'The picture could not be saved on this device. Remove it or try another one.';
          busy = false;
          return;
        }
      }
    }
    // (A picture that ends up unused - the old one, or a new one for a thing that has gone - is deleted by the desk.)
    desk.run(item ? 'edit' : 'add', item ? { kind, id: item.id, item: raw } : { kind, item: raw });
    if (preview) URL.revokeObjectURL(preview);
    editing = null;
    settled();
    redraw();
  });
  return form;
}

/** One row of a list: picture, name, a line about it, its description, then Edit and Delete. */
function itemRow(ctx, kind, item, about, redraw, { before = [], dataset = {} } = {}) {
  const desk = ctx.family.desk();
  if (editing === `${kind}:${item.id}`) return h('div', { class: 'admin-row is-open', dataset: { ...dataset, row: `${kind}:${item.id}` } }, itemForm(ctx, kind, item, redraw));
  const pic = h('span', { class: 'emoji' }, item.icon);
  if (item.photo) showing.push(showPhoto(pic, item.photo, ''));
  return h('div', { class: 'admin-row', dataset },
    pic,
    h('span', { class: 'grow' }, h('b', {}, item.title), h('small', {}, about), item.note ? h('small', { class: 'row-note' }, item.note) : null),
    before,
    h('button', { class: 'btn btn-chip', type: 'button', dataset: { act: 'edit' }, 'aria-label': `Edit ${item.title}`, onclick: () => {
      if (unsavedEdit(`${kind}:${item.id}`)) return; // another row is half changed: that one first
      editing = `${kind}:${item.id}`;
      redraw();
    } }, 'Edit'),
    h('button', { class: 'btn btn-chip btn-danger', type: 'button', dataset: { act: 'delete' }, 'aria-label': `Delete ${item.title}`, onclick: once(() => {
      desk.run('remove', { kind, id: item.id });
      redraw();
    }) }, 'Delete'));
}

// ------------------------------------------------------------------ Rewards tab

/**
 * Which of the two kinds of reward the Rewards tab is showing. They have a section each, with a
 * switch between them, because they are easy to mix up when they sit one under the other:
 *   'mine'   the reward mine - long-term rewards, each unlocked once when his points reach it
 *   'daily'  daily rewards - won again every day he does that many missions
 */
let rewardsPart = 'mine';

export function rewardsTab(ctx, refresh) {
  const desk = ctx.family.desk();
  const s = desk.state();
  const R = s.rewards;
  const waiting = owed(s);
  const sourceName = { daily: 'daily reward', tier: 'mine reward', chore: 'chore reward' };
  freePictures();

  const repeat = h('input', { type: 'checkbox' });
  repeat.checked = !!R.countPerfected;
  repeat.addEventListener('change', () => desk.run('option', { name: 'countPerfected', on: repeat.checked }));

  const part = rewardsPart === 'daily' ? 'daily' : 'mine';
  // "Lock for the day after N missions" (this device's setting) puts a daily reward that needs more than N out of reach: say so.
  const own = ctx.store.get().settings;
  const lockAt = !desk.remote && own.hardStop ? own.dailyMissions || 3 : 0;
  const choose = (id, title, about, count) => h('button', { class: `part${part === id ? ' on' : ''}`, type: 'button', role: 'tab', 'aria-selected': String(part === id), dataset: { part: id },
    onclick: () => {
      if (rewardsPart === id || unsavedEdit()) return; // (a row that is half changed is finished first)
      rewardsPart = id;
      editing = null; // a row left open in the other section does not come back
      refresh();
    } },
    h('b', {}, title, h('span', { class: 'part-count' }, String(count))), h('small', {}, about));

  const mine = () => h('section', { class: 'panel', dataset: { section: 'mine' } },
    h('h2', {}, 'Reward mine - long-term rewards'),
    h('p', { class: 'fine' }, `Each reward is won once, when his total points reach its number. He sees them as a mine he digs down into: the first reward is in the coal, each next one in a deeper, rarer ore (red crystal, copper, iron, gold, emerald, lapis, diamond, star ore). He can scroll down to look at what is still ahead, with your pictures. He has ${s.xp} points now. A mission earns roughly 40 to 95 points; a chore earns what you give it.`),
    h('p', { class: 'fine' }, 'For a small reward he can win again every day, use Daily rewards instead.'),
    h('div', { class: 'admin-list' }, R.tiers.slice().sort((a, b) => a.points - b.points).map((t) => {
      const e = R.earned.find((x) => x.src === 'tier' && x.ref === t.id);
      const has = e ? (e.given ? ' - he has had this one (for a new reward, add a new one)' : ' - won, waiting to be handed out') : '';
      return itemRow(ctx, 'tier', t, `at ${t.points} points${s.xp >= t.points ? ' (reached)' : ''}${has}`, refresh);
    })),
    itemForm(ctx, 'tier', null, refresh));
  const daily = () => h('section', { class: 'panel', dataset: { section: 'daily' } },
    h('h2', {}, 'Daily rewards - every day'),
    h('p', { class: 'fine' }, 'He wins one of these each day he finishes that many missions - and can win it again the next day. A mission is 6 instructions, about 3 to 5 minutes.'),
    h('p', { class: 'fine' }, 'For a bigger reward he works towards over days or weeks, use the Reward mine instead.'),
    h('div', { class: 'admin-list' }, R.daily.slice().sort((a, b) => a.missions - b.missions).map((r) =>
      itemRow(ctx, 'daily', r, `${r.missions} ${r.missions === 1 ? 'mission' : 'missions'} in a day${lockAt && r.missions > lockAt ? ` - out of reach: the game locks after ${lockAt} missions a day (Settings)` : ''}`, refresh))),
    itemForm(ctx, 'daily', null, refresh),
    h('label', { class: 'setting' }, repeat, h('span', {}, h('b', {}, 'Count easy and repeated missions too'),
      h('small', {}, 'Off: only levels below 3 stars count - so replaying something he has already mastered does not earn rewards.'))));

  const ex = expectationsToday(s);
  return [
    ex.total && !ex.allDone
      ? h('section', { class: 'panel note-panel', dataset: { note: 'locked' } }, h('p', {}, `Today's expectations are not all done yet (${ex.done} of ${ex.total}), so he cannot collect rewards on his side yet. He can still look at his mine.`))
      : null,
    section(`To hand out (${waiting.length})`,
      waiting.length
        ? h('div', { class: 'admin-list' }, waiting.map((e) => h('div', { class: 'admin-row', dataset: { earned: e.id } },
            h('span', { class: 'emoji' }, e.icon || '🎁'),
            h('span', { class: 'grow' }, h('b', {}, e.title), h('small', {}, `${sourceName[e.src] || 'reward'}, won ${when(e.t)}`)),
            h('button', { class: 'btn btn-chip btn-primary', type: 'button', dataset: { act: 'given' }, onclick: once(() => {
              desk.run('given', { id: e.id });
              refresh();
            }) }, 'Given'))))
        : h('p', { class: 'fine' }, 'Nothing waiting. When he wins a reward it appears here until you mark it as given.')),
    h('nav', { class: 'parts', role: 'tablist', 'aria-label': 'The two kinds of reward' },
      choose('mine', 'Reward mine', 'Long-term: unlocked once, when his points reach it', R.tiers.length),
      choose('daily', 'Daily rewards', 'Every day: won again each day he does his missions', R.daily.length)),
    part === 'mine' ? mine() : daily(),
  ];
}

// ------------------------------------------------------------------ Chores tab

export function choresTab(ctx, refresh) {
  const desk = ctx.family.desk();
  const s = desk.state();
  const C = s.chores;
  const pending = C.log.filter((e) => e.status === 'pending');
  const recent = C.log.filter((e) => e.status !== 'pending').slice(-12).reverse();
  const urls = [];
  freePictures();

  const decide = (entry, approve, note) => {
    desk.run('chore', { id: entry.id, ok: approve, note }); // his photo is deleted with it
    delete kept.notes[entry.id];
    for (const u of urls) URL.revokeObjectURL(u);
    refresh();
  };

  const needPhoto = h('input', { type: 'checkbox' });
  needPhoto.checked = C.requirePhoto !== false;
  needPhoto.addEventListener('change', () => desk.run('option', { name: 'requirePhoto', on: needPhoto.checked }));
  const photoNote = ctx.family.status().signedIn
    ? 'With the family account his photos are also kept in your private family folder, so you can check them from your own device. They are deleted once you approve or send the chore back.'
    : 'Photos stay on this device and are deleted once you approve or send the chore back.';
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
            note.value = kept.notes[e.id] || '';
            note.addEventListener('input', () => { kept.notes[e.id] = note.value; });
            return h('div', { class: 'check-card', dataset: { entry: e.id } },
              pic,
              h('div', { class: 'check-info' },
                h('b', {}, `${e.icon} ${e.title}`), h('small', {}, `${when(e.t)} · +${e.points} points${e.reward ? ` · ${e.reward}` : ''}`),
                note,
                h('div', { class: 'row' },
                  h('button', { class: 'btn btn-done', type: 'button', dataset: { act: 'approve' }, onclick: once(() => decide(e, true)) }, 'Approve'),
                  h('button', { class: 'btn', type: 'button', dataset: { act: 'reject' }, onclick: once(() => decide(e, false, note.value)) }, 'Not yet'))));
          }))
        : h('p', { class: 'fine' }, 'Nothing to check. When he marks a chore as done it appears here with his photo.')),
    section('Chores',
      h('div', { class: 'admin-list' }, C.list.map((c) =>
        itemRow(ctx, 'chore', c, `${c.points} points, ${repeatName[c.repeat]}${c.reward ? `, plus: ${c.reward}` : ''}`, refresh))),
      itemForm(ctx, 'chore', null, refresh),
      h('label', { class: 'setting' }, needPhoto, h('span', {}, h('b', {}, 'Ask for a photo'), h('small', {}, photoNote)))),
    section('Recently checked',
      recent.length
        ? h('ul', { class: 'obs' }, recent.map((e) => h('li', {}, `${e.icon} ${e.title} - ${e.status === 'approved' ? `approved, +${e.points} points` : `sent back${e.note ? `: ${e.note}` : ''}`} (${when(e.decided || e.t)})`)))
        : h('p', { class: 'fine' }, 'Nothing yet.')),
  ];
}

// ------------------------------------------------------------------ Expectations tab

export function expectationsTab(ctx, refresh) {
  const desk = ctx.family.desk();
  const s = desk.state();
  const ex = expectationsToday(s);
  freePictures();
  const confirm = h('input', { type: 'checkbox' });
  confirm.checked = !!s.expectations.confirm;
  confirm.addEventListener('change', () => { desk.run('option', { name: 'confirm', on: confirm.checked }); refresh(); });
  const set = (id, done) => once(() => { desk.run('expect', { id, done }); refresh(); });
  const stateName = { open: 'not done yet', pending: 'he says it is done', done: 'done' };

  return [
    section(`Today (${ex.done} of ${ex.total} done)`,
      h('p', { class: 'fine' }, 'Expectations earn nothing. But each day his rewards stay locked until every one of them is done.'),
      ex.total
        ? h('div', { class: 'admin-list' }, ex.items.map((e) => itemRow(ctx, 'expect', e, stateName[e.state], refresh, {
            dataset: { expect: e.id },
            before: e.state === 'done'
              ? h('button', { class: 'btn btn-chip', type: 'button', dataset: { act: 'undo' }, onclick: set(e.id, false) }, 'Not done')
              : h('button', { class: 'btn btn-chip btn-primary', type: 'button', dataset: { act: 'ok' }, onclick: set(e.id, true) }, e.state === 'pending' ? 'OK' : 'Mark done'),
          })))
        : h('p', { class: 'fine' }, 'No expectations yet. With none, his rewards are never locked.'),
      itemForm(ctx, 'expect', null, refresh),
      h('label', { class: 'setting' }, confirm, h('span', {}, h('b', {}, 'He needs my OK for each one'),
        h('small', {}, 'Off: his own tick counts. On: his tick waits here until you press OK.')))),
  ];
}
