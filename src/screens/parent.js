// Grown-ups' area: what he has practised, what the patterns are, and the settings.
// Everything shown here is computed from data stored on this device only.

import { h, mount } from '../core/dom.js';
import { overview, observations, skillStats, errorStats } from '../listening/insights.js';
import { rankFor } from '../listening/progress.js';
import { iconSVG } from '../art/sprites.js';

const TIPS = [
  'Get his eyes first. Say his name, wait until he looks at you, then give the instruction.',
  'One breath, one instruction. Keep it short, and pause between steps.',
  'Ask him to say it back in his own words before he starts. That is the same “say it in your head” trick the game teaches.',
  'Use the game’s tricky words on purpose in daily life: “Before you get your shoes, put your plate away.”',
  'Praise the listening, not the result: “You waited until I finished - that was great listening.”',
  'Asking “can you say that again?” is a good listening habit. Treat it as a win, never a failure.',
  'Short and often beats long and rare: one or two missions a day, most days.',
];

export function parentScreen(ctx) {
  const { store } = ctx;
  const body = h('main', { class: 'parent-body' });
  const el = h('div', { class: 'screen parent' },
    h('header', { class: 'sub-head' },
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Back', html: iconSVG('back'), onclick: () => ctx.go('map') }),
      h('h1', {}, 'For parents'),
      h('div', {})),
    body);

  function gate() {
    const a = 12 + Math.floor(Math.random() * 7);
    const b = 6 + Math.floor(Math.random() * 4);
    const input = h('input', { type: 'text', inputmode: 'numeric', autocomplete: 'off', class: 'gate-input', 'aria-label': 'Answer' });
    const msg = h('p', { class: 'gate-msg' });
    const form = h('form', { class: 'panel small gate' },
      h('h2', {}, 'Grown-ups only'),
      h('p', {}, `What is ${a} × ${b}?`),
      input,
      h('button', { class: 'btn btn-primary', type: 'submit' }, 'Open'),
      msg);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (Number(input.value.trim()) === a * b) dashboard();
      else {
        msg.textContent = 'Not quite - try again.';
        input.value = '';
      }
    });
    mount(body, form);
  }

  function dashboard() {
    const s = store.get();
    const o = overview(s);
    const rank = rankFor(s.xp);
    const recent = s.trials.slice(-150);
    const skills = skillStats(recent);
    const errors = errorStats(recent);
    const trend = (now, before, lowerIsBetter) => {
      if (before === null) return '';
      const d = now - before;
      if (Math.abs(d) < 5) return ' (steady)';
      return (d > 0) !== !!lowerIsBetter ? ` (up from ${before}%)` : ` (down from ${before}%)`;
    };

    const stat = (value, label) => h('div', { class: 'stat' }, h('b', {}, String(value)), h('span', {}, label));
    const section = (title, ...kids) => h('section', { class: 'panel' }, h('h2', {}, title), ...kids);

    const toggle = (label, get, set, note) => {
      const box = h('input', { type: 'checkbox' });
      box.checked = !!get(store.get());
      box.addEventListener('change', () => { store.update((st) => set(st, box.checked)); ctx.applySettings(); });
      return h('label', { class: 'setting' }, box, h('span', {}, h('b', {}, label), note ? h('small', {}, note) : null));
    };
    const daily = h('select', {}, [2, 3, 4, 5, 8].map((n) => h('option', { value: n }, `${n} missions`)));
    daily.value = String(s.settings.dailyMissions || 3);
    daily.addEventListener('change', () => store.update((st) => { st.settings.dailyMissions = Number(daily.value); }));

    const backup = h('textarea', { class: 'backup', rows: 3, placeholder: 'Paste a backup here, then press Restore', 'aria-label': 'Backup text' });
    const backupMsg = h('p', { class: 'gate-msg' });

    mount(body,
      section('At a glance',
        h('div', { class: 'stats' },
          stat(o.missions, 'missions'), stat(o.days, 'days played'), stat(`${o.minutes} min`, 'total practice'),
          stat(rank.name, 'rank'), stat(o.trials ? `${o.firstPct}%` : '-', 'right on first listen'), stat(o.trials ? `${o.earlyPct}%` : '-', 'turns he jumped in early')),
        o.trials ? h('p', { class: 'fine' }, `Based on his last ${Math.min(60, o.trials)} turns. First-listen accuracy${trend(o.firstPct, o.prevPct, false)}; jumping in early${trend(o.earlyPct, o.prevEarlyPct, true)}; asked to hear it again on ${o.replayPct}% of turns (asking again is a good habit).`) : null),
      section('What stands out', h('ul', { class: 'obs' }, observations(s).map((t) => h('li', {}, t)))),
      section('By skill (right on the first listen)',
        skills.length
          ? h('div', { class: 'bars' }, skills.map((k) => h('div', { class: 'bar-row' },
              h('span', { class: 'bar-label' }, k.label),
              h('span', { class: 'bar' }, h('i', { style: { width: `${k.pct}%` } })),
              h('span', { class: 'bar-num' }, `${k.correct}/${k.n}`))))
          : h('p', { class: 'fine' }, 'Nothing yet.')),
      section('When it goes wrong, what happens?',
        errors.length
          ? h('ul', { class: 'obs' }, errors.map((e) => h('li', {}, `${e.label}: ${e.n}`)))
          : h('p', { class: 'fine' }, 'No slips recorded yet.'),
        h('p', { class: 'fine' }, 'The game responds to every slip the same way: no buzzers, he hears the instruction again a little slower, and if needed the guide shows him.')),
      section('Helping the same skills away from the screen', h('ul', { class: 'obs' }, TIPS.map((t) => h('li', {}, t)))),
      section('Settings',
        toggle('Sound effects', (st) => st.settings.sfx, (st, v) => { st.settings.sfx = v; }),
        toggle('Slower voice', (st) => st.settings.slowVoice, (st, v) => { st.settings.slowVoice = v; }, 'Plays every instruction about 12% slower.'),
        h('label', { class: 'setting' }, daily, h('span', {}, h('b', {}, 'Suggest stopping after'), h('small', {}, 'Short, regular practice works better than long sessions.'))),
        toggle('Lock for the day after that', (st) => st.settings.hardStop, (st, v) => { st.settings.hardStop = v; }, 'Otherwise it is only a friendly suggestion.'),
        toggle('Unlock every level', (st) => st.flags.unlockAll, (st, v) => { st.flags.unlockAll = v; }, 'Lets you jump anywhere. Leave off for normal step-by-step progress.')),
      section('Backup',
        h('p', { class: 'fine' }, 'Progress is stored only on this device. Copy a backup if you want to move it or keep it safe.'),
        h('div', { class: 'row' },
          h('button', { class: 'btn', type: 'button', onclick: async () => {
            backup.value = store.exportJSON();
            try { await navigator.clipboard.writeText(backup.value); backupMsg.textContent = 'Backup copied. It is also in the box below.'; }
            catch { backupMsg.textContent = 'Backup is in the box below - select it and copy.'; }
          } }, 'Make backup'),
          h('button', { class: 'btn', type: 'button', onclick: () => {
            try { store.importJSON(backup.value); backupMsg.textContent = 'Backup restored.'; dashboard(); }
            catch { backupMsg.textContent = 'That does not look like a backup.'; }
          } }, 'Restore'),
          h('button', { class: 'btn btn-danger', type: 'button', onclick: (e) => {
            const b = e.currentTarget;
            if (b.dataset.sure) { store.reset(); ctx.applySettings(); dashboard(); }
            else { b.dataset.sure = '1'; b.textContent = 'Tap again to erase everything'; }
          } }, 'Erase all progress')),
        backup, backupMsg),
      section('About this game',
        h('p', { class: 'fine' }, 'Each turn follows one routine: he chooses when to listen, waits while the voice talks, then does what was said. Levels add one difficulty at a time: more details, more steps, tricky words (not, except, before, after, if), listening from memory, and stories. A level opens when the one before it earns two stars.'),
        h('p', { class: 'fine' }, 'This is practice, not a test or a diagnosis. If you are worried about his hearing, understanding or attention - for example he often mishears, struggles to follow speech in noise, or things are not improving - talk to his teacher, your family doctor, an audiologist or a speech-language pathologist.'),
        h('p', { class: 'fine' }, `No accounts, no ads, no tracking. Version ${ctx.version}.`)));
  }

  gate();
  return { el };
}
