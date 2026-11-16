// Grown-ups' area, behind a PIN that the parent chooses on this device:
//   Progress - what he has practised and what the patterns are
//   Rewards  - daily and lifetime rewards, and what is waiting to be handed out
//   Chores   - the chore list, and photos waiting to be checked
//   Settings - voice, daily limit, backup, PIN, and the optional family account
// Everything shown here is computed from data stored on this device - unless a grown-up has
// signed in to the family account on their own device (src/family/sync.js): then the Rewards,
// Chores and Expectations tabs show and change HIS lists, on the device he plays on.

import { h, mount } from '../core/dom.js';
import { overview, observations, skillStats, errorStats } from '../listening/insights.js';
import { rankFor } from '../listening/progress.js';
import { badges } from '../rewards/logic.js';
import { iconSVG } from '../art/sprites.js';
import { pinGate, changePinButton, rewardsTab, choresTab, expectationsTab, closeForms } from './admin.js';
import { keepOnlyPhotos } from '../core/photos.js';
import { familySection, familyNote, ago, resetFamilyPanel } from './family.js';

const TIPS = [
  'Get his eyes first. Say his name, wait until he looks at you, then give the instruction.',
  'One breath, one instruction. Keep it short, and pause between steps.',
  'Ask him to say it back in his own words before he starts. That is the same “say it in your head” trick the game teaches.',
  'Use the game’s tricky words on purpose in daily life: “Before you get your shoes, put your plate away.”',
  'Praise the listening, not the result: “You waited until I finished - that was great listening.”',
  'Asking “can you say that again?” is a good listening habit. Treat it as a win, never a failure.',
  'Short and often beats long and rare: one or two missions a day, most days.',
];

const section = (title, ...kids) => h('section', { class: 'panel' }, h('h2', {}, title), ...kids);

export function parentScreen(ctx, { tab: startTab } = {}) {
  const { store, family } = ctx;
  const body = h('main', { class: 'parent-body' });
  const tabs = h('nav', { class: 'tabs', hidden: true });
  let tab = startTab || 'progress';
  let backupText = ''; // survives a redraw of the Settings tab, so Make backup -> Erase -> Restore works
  const el = h('div', { class: 'screen parent' },
    h('header', { class: 'sub-head' },
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Back', html: iconSVG('back'), onclick: () => ctx.go('map') }),
      h('h1', {}, 'For parents'),
      h('div', {})),
    tabs, body);

  let open = false; // the PIN has been typed
  /** Is a grown-up in the middle of typing something? Then news from another device waits for the next redraw. */
  const typing = () => {
    if (body.querySelector('.admin-row.is-open')) return true;
    if ([...body.querySelectorAll('input[type="text"], input[type="email"], input[type="password"], textarea')].some((x) => x.value !== (x.dataset.was ?? ''))) return true;
    const at = document.activeElement;
    return !!at && body.contains(at) && (at.tagName === 'SELECT' || at.tagName === 'TEXTAREA' || (at.tagName === 'INPUT' && at.type !== 'checkbox'));
  };
  const stopNews = family.subscribe((what) => {
    if (!open || typing() || (what !== 'data' && tab !== 'settings')) return;
    show(tab, { keep: true });
  });

  function show(which, { keep = false } = {}) {
    if (which !== tab) closeForms(); // a form left open on another tab does not come back
    if (!keep) family.kick('look'); // a grown-up is looking: fetch what is new
    open = true;
    tab = which;
    const at = body.scrollTop;
    const b = badges(family.desk().state());
    mount(tabs, [['progress', 'Progress', 0], ['rewards', 'Rewards', b.rewardsOwed], ['chores', 'Chores', b.toCheck], ['expectations', 'Expectations', b.toConfirm], ['settings', 'Settings', 0]].map(([id, label, n]) =>
      h('button', { class: `tab${id === tab ? ' on' : ''}`, type: 'button', dataset: { tab: id }, onclick: () => show(id) }, label, n ? h('span', { class: 'dot' }, String(n)) : null)));
    tabs.hidden = false;
    const refresh = () => show(tab);
    mount(body, tab === 'settings' ? null : familyNote(ctx),
      tab === 'rewards' ? rewardsTab(ctx, refresh) : tab === 'chores' ? choresTab(ctx, refresh) : tab === 'expectations' ? expectationsTab(ctx, refresh) : tab === 'settings' ? settingsTab(refresh) : progressTab());
    body.scrollTop = keep ? at : 0;
  }

  /** On a grown-up's own device: his points and what is waiting. The detail stays on the device he plays on. */
  function progressFromAfar(s) {
    const b = badges(s);
    const stat = (value, label) => h('div', { class: 'stat' }, h('b', {}, String(value)), h('span', {}, label));
    return [
      section('At a glance',
        h('div', { class: 'stats' },
          stat(s.xp, `points (${rankFor(s.xp).name})`), stat(s.summary.missions, 'missions'), stat(s.summary.days, 'days played'),
          stat(`${s.summary.minutes} min`, 'total practice'), stat(b.rewardsOwed, 'rewards to hand out'), stat(b.toCheck, 'chores to check')),
        h('p', { class: 'fine' }, s.summary.last ? `He last finished a mission ${ago(s.summary.last)}.` : 'He has not finished a mission yet.'),
        h('p', { class: 'fine' }, 'What he practised, turn by turn, stays on the device he plays on. Open For parents there to see how he is doing skill by skill.')),
      section('Helping the same skills away from the screen', h('ul', { class: 'obs' }, TIPS.map((t) => h('li', {}, t)))),
    ];
  }

  function progressTab() {
    if (family.desk().remote) return progressFromAfar(family.desk().state());
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
    return [
      section('At a glance',
        h('div', { class: 'stats' },
          stat(o.missions, 'missions'), stat(o.days, 'days played'), stat(`${o.minutes} min`, 'total practice'),
          stat(`${s.xp}`, `points (${rank.name})`), stat(o.trials ? `${o.firstPct}%` : '-', 'right on the first try'), stat(o.trials ? `${o.earlyPct}%` : '-', 'turns he jumped in early')),
        o.trials ? h('p', { class: 'fine' }, `Based on his last ${Math.min(60, o.trials)} turns. First-try accuracy${trend(o.firstPct, o.prevPct, false)}; jumping in early${trend(o.earlyPct, o.prevEarlyPct, true)}; asked to hear it again on ${o.replayPct}% of turns (asking again is a good habit). Levels get harder as he goes, so a small dip after a new level opens is normal.`) : null),
      section('What stands out', h('ul', { class: 'obs' }, observations(s).map((t) => h('li', {}, t)))),
      section('By skill (right on the first try)',
        skills.length
          ? h('div', { class: 'bars' }, skills.map((k) => h('div', { class: 'bar-row' },
              h('span', { class: 'bar-label' }, k.label),
              h('span', { class: 'bar' }, h('i', { style: { width: `${k.pct}%` } })),
              h('span', { class: 'bar-num' }, `${k.correct}/${k.n}`))))
          : h('p', { class: 'fine' }, 'Nothing yet.'),
        h('p', { class: 'fine' }, 'An instruction can count under more than one skill, so one slip may lower two bars.')),
      section('When it goes wrong, what happens?',
        errors.length
          ? h('ul', { class: 'obs' }, errors.map((e) => h('li', {}, `${e.label}: ${e.n}`)))
          : h('p', { class: 'fine' }, 'No slips recorded yet.'),
        h('p', { class: 'fine' }, 'The game responds to every slip the same way: no buzzers; he taps the ear and hears it again a little slower; if needed the guide shows him.')),
      section('Helping the same skills away from the screen', h('ul', { class: 'obs' }, TIPS.map((t) => h('li', {}, t)))),
    ];
  }

  function settingsTab(refresh) {
    const s = store.get();
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
    backup.value = backupText;
    backup.addEventListener('input', () => { backupText = backup.value; });
    const afar = family.desk().remote;
    return [
      familySection(ctx, refresh),
      section(afar ? 'Settings of this device' : 'Settings',
        afar ? h('p', { class: 'fine' }, 'These settings, the backup below and the PIN belong to this device and the game on it - not to the device he plays on.') : null,
        toggle('Sound effects', (st) => st.settings.sfx, (st, v) => { st.settings.sfx = v; }),
        toggle('Slower voice', (st) => st.settings.slowVoice, (st, v) => { st.settings.slowVoice = v; }, 'Plays every instruction about 12% slower.'),
        toggle('Remind him to wait', (st) => st.settings.earlyReminder !== false, (st, v) => { st.settings.earlyReminder = v; }, 'If he touches something before the voice has finished, it stops and asks him to listen until it is finished; then he taps the ear again. Off: it only shows a “wait” sign and carries on.'),
        h('label', { class: 'setting' }, daily, h('span', {}, h('b', {}, 'Suggest stopping after'), h('small', {}, 'Short, regular practice works better than long sessions. If a daily reward needs more missions than this, the suggestion waits until he has won it.'))),
        toggle('Lock for the day after that', (st) => st.settings.hardStop, (st, v) => { st.settings.hardStop = v; }, 'Otherwise it is only a friendly suggestion.'),
        toggle('Unlock every level', (st) => st.flags.unlockAll, (st, v) => { st.flags.unlockAll = v; }, 'Lets you jump anywhere. Leave off for normal step-by-step progress.'),
        h('div', { class: 'row', style: { justifyContent: 'flex-start' } }, changePinButton(ctx, body, () => show('settings')))),
      section('Backup',
        h('p', { class: 'fine' }, 'His progress is stored only on the device he plays on. Copy a backup if you want to move it or keep it safe. (Chore photos, reward pictures and the family account sign-in are not part of a backup.)'),
        h('div', { class: 'row' },
          h('button', { class: 'btn', type: 'button', onclick: async () => {
            backup.value = backupText = store.exportJSON();
            try { await navigator.clipboard.writeText(backup.value); backupMsg.textContent = 'Backup copied. It is also in the box below.'; }
            catch { backupMsg.textContent = 'Backup is in the box below - select it and copy.'; }
          } }, 'Make backup'),
          h('button', { class: 'btn', type: 'button', onclick: () => {
            try {
              store.importJSON(backup.value);
              const st = store.get(); // pictures that the restored save does not point to are of no use any more
              keepOnlyPhotos([...st.rewards.tiers.map((t) => t.photo), ...st.chores.log.map((e) => e.photo)]);
              ctx.applySettings();
              refresh();
            }
            catch { backupMsg.textContent = 'That does not look like a backup.'; }
          } }, 'Restore'),
          h('button', { class: 'btn btn-danger', type: 'button', dataset: { act: 'erase' }, onclick: (e) => {
            const b = e.currentTarget;
            if (b.dataset.sure) { store.resetProgress(); ctx.applySettings(); refresh(); }
            else { b.dataset.sure = '1'; b.textContent = 'Tap again to erase his progress'; }
          } }, 'Erase his progress')),
        h('p', { class: 'fine' }, 'Erasing clears his levels, points, cards and history. Your rewards, chores, expectations, settings and PIN are kept.'),
        backup, backupMsg),
      section('About this game',
        h('p', { class: 'fine' }, 'Each turn follows one routine: he chooses when to listen, waits while the voice talks, then does what was said. Levels add one difficulty at a time: more details, more steps, tricky words (not, except, before, after, if), listening from memory, and stories. A level opens when the one before it earns two stars, or after a few honest tries, so he is never stuck.'),
        h('p', { class: 'fine' }, 'This is practice, not a test or a diagnosis. If you are worried about his hearing, understanding or attention - for example he often mishears, struggles to follow speech in noise, or things are not improving - talk to his teacher, your family doctor, an audiologist or a speech-language pathologist.'),
        h('p', { class: 'fine', dataset: { soundcheck: '1' } }, `Sound check since the app was opened: ${ctx.audio.stats.clip} recorded clips played, ${ctx.audio.stats.speech} read by the device voice, ${ctx.audio.stats.none} silent${ctx.audio.stats.lastError ? ` (last problem: ${ctx.audio.stats.lastError})` : ''}. Offline copy: ${navigator.serviceWorker?.controller ? 'ready' : 'not yet'}.`),
        h('p', { class: 'fine' }, `No ads, no tracking. The family account is optional: without it, nothing leaves this device. Version ${ctx.version}.`)),
    ];
  }

  closeForms();
  resetFamilyPanel();
  pinGate(ctx, body, () => show(tab));
  return { el, destroy() { stopNews(); closeForms(); } };
}
