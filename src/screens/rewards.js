// His rewards: anything he has won that a grown-up still owes him, today's goals, and the
// REWARD LADDER - every points reward in order, where he stands on it, and what is still ahead.
// The rewards themselves (names, descriptions, pictures) are set by a grown-up in the parent area.

import { h, todayKey } from '../core/dom.js';
import { countedToday, owed, expectationsToday, ladder, collectRewards } from '../rewards/logic.js';
import { showPhoto } from '../core/photos.js';
import { iconSVG, guideSVG } from '../art/sprites.js';

export function rewardsScreen(ctx) {
  const { store, audio, voice, sfx } = ctx;
  let s = store.get();
  const ex = expectationsToday(s);
  if (!ex.allDone) {
    // Expectations come first: until today's list is done, the rewards are not shown at all.
    const el = h('div', { class: 'screen rewards locked' },
      h('header', { class: 'sub-head' },
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Back', html: iconSVG('back'), onclick: () => ctx.go('map') }),
        h('h1', {}, 'Rewards'),
        h('div', {})),
      h('main', { class: 'list-body' },
        h('section', { class: 'panel lock-panel' },
          h('div', { class: 'lock-big', html: iconSVG('lock') }),
          h('h2', {}, 'Finish your expectations first'),
          h('div', { class: 'pips' }, ex.items.map((e) => h('span', { class: `pip${e.state === 'done' ? ' gold' : e.state === 'pending' ? ' silver' : ''}` }))),
          h('button', { class: 'btn btn-primary btn-big', type: 'button', dataset: { open: 'expectations' }, onclick: () => ctx.go('expectations') },
            h('span', { class: 'btn-icon', html: iconSVG('expect') }), h('span', {}, 'Expectations')))));
    return { el, shown: () => voice.say('rewards-locked'), destroy: () => audio.stop() };
  }
  // Anything he has reached but that was not written down yet (a reward added after he passed its mark).
  let fresh = false;
  store.update((st) => { fresh = collectRewards(st).length > 0; });
  s = store.get();
  const R = s.rewards;
  const today = todayKey();
  const counted = countedToday(s);
  const free = []; // pictures on screen, to release when leaving

  // Reward names are typed by a grown-up, so he may not be able to read them: every one can be read aloud.
  const speak = (text) => { audio.unlock(); audio.speak(text); };
  const say = (text) => h('button', { class: 'icon-btn small', type: 'button', 'aria-label': 'Read it to me', html: iconSVG('speaker'), onclick: () => speak(text) });
  const stamp = (given) => h('span', { class: `stamp${given ? ' given' : ''}` }, given ? 'Got it ✓' : 'WON!');
  const withNote = (r) => (r.note ? `${r.title}. ${r.note}.` : `${r.title}.`);
  /** A reward's picture: the grown-up's photo when there is one, otherwise its emoji. */
  const picture = (r, fallback, cls = 'emoji') => {
    const box = h('span', { class: cls }, r.icon || fallback);
    if (r.photo) free.push(showPhoto(box, r.photo, ''));
    return box;
  };
  const tierOf = (e) => (e.src === 'tier' ? R.tiers.find((t) => t.id === e.ref) : null);

  const daily = R.daily.slice().sort((a, b) => a.missions - b.missions).map((r) => {
    const e = R.earned.find((x) => x.src === 'daily' && x.ref === r.id && x.day === today);
    const left = Math.max(0, r.missions - counted);
    return h('div', { class: `reward-row${e ? ' won' : ''}`, dataset: { reward: r.id } },
      h('span', { class: 'emoji' }, r.icon || '🎁'),
      h('div', { class: 'reward-main' },
        h('div', { class: 'reward-title' }, r.title),
        r.note ? h('div', { class: 'reward-note' }, r.note) : null,
        h('div', { class: 'pips' }, Array.from({ length: Math.min(r.missions, 12) }, (_, i) => h('span', { class: `pip${i < counted ? ' gold' : ''}` })))),
      e ? stamp(e.given) : h('span', { class: 'reward-need' }, `${Math.min(counted, r.missions)} / ${r.missions}`),
      say(e ? `${withNote(r)} You won it!` : `${withNote(r)} ${left} more ${left === 1 ? 'mission' : 'missions'} today.`));
  });

  // ---- the ladder: a track he can slide along, with his own marker on it ----
  const L = ladder(s);
  const about = (step) => {
    if (step.state === 'given') return `${withNote(step)} You got it!`;
    if (step.state === 'won') return `${withNote(step)} You won it! Show a grown-up.`;
    return `${withNote(step)} It is at ${step.points} points. You need ${step.left} more.`;
  };
  function openStep(step) {
    sfx.tap();
    const close = () => { audio.stop(); overlay.remove(); };
    const pct = Math.max(0, Math.min(100, (L.xp / step.points) * 100));
    const overlay = h('div', { class: 'overlay rung-overlay', onclick: (e) => { if (e.target === overlay) close(); } },
      h('div', { class: `panel rung-detail is-${step.state}`, dataset: { detail: step.id } },
        picture(step, '🏆', 'rung-pic big'),
        h('h2', {}, step.title),
        step.note ? h('p', { class: 'tip' }, step.note) : null,
        h('div', { class: 'rung-progress' },
          h('div', { class: 'xpbar wide' }, h('i', { style: { width: `${pct}%` } })),
          h('span', { class: 'rung-count' }, `${Math.min(L.xp, step.points)} / ${step.points} XP`)),
        step.state === 'given' || step.state === 'won' ? stamp(step.state === 'given') : h('p', { class: 'rung-left' }, h('b', {}, String(step.left)), ' XP to go'),
        h('div', { class: 'row' },
          say(about(step)),
          h('button', { class: 'btn btn-primary btn-big', type: 'button', dataset: { act: 'close' }, onclick: close }, h('span', { class: 'btn-icon', html: iconSVG('check') }), h('span', {}, 'OK')))));
    el.append(overlay);
    speak(about(step));
  }
  const rung = (step, i) => h('div', { class: `ladder-slot is-${step.state}`, dataset: { step: String(i + 1) } },
    h('span', { class: 'ladder-post' }, step.state === 'given' || step.state === 'won' ? h('span', { class: 'post-icon', html: iconSVG('check') }) : null),
    h('span', { class: 'ladder-points' }, String(step.points)),
    h('button', { class: `rung is-${step.state}${step.state === 'won' || step.state === 'given' ? ' won' : ''}`, type: 'button', dataset: { reward: step.id },
      'aria-label': about(step), onclick: () => openStep(step) },
      picture(step, '🏆', 'rung-pic'),
      h('span', { class: 'reward-title' }, step.title),
      step.state === 'given' || step.state === 'won' ? stamp(step.state === 'given')
        : h('span', { class: 'reward-need' }, step.state === 'ahead' ? h('span', { class: 'need-lock', html: iconSVG('lock') }) : null, `${Math.min(L.xp, step.points)} / ${step.points} XP`)));
  const track = L.steps.length
    ? h('div', { class: 'ladder', tabindex: '0', 'aria-label': 'Reward ladder' },
        h('div', { class: 'ladder-track', style: { '--n': L.steps.length, '--at': L.at.toFixed(3) } },
          h('div', { class: 'ladder-line', 'aria-hidden': 'true' }, h('i')),
          h('div', { class: 'ladder-me', 'aria-hidden': 'true', html: guideSVG('happy') }),
          h('div', { class: 'ladder-slot is-start' }, h('span', { class: 'ladder-post start' }), h('span', { class: 'ladder-points' }, '0'),
            h('div', { class: 'ladder-you' }, h('span', { class: 'btn-icon', html: iconSVG('star') }), h('b', {}, String(L.xp)), h('span', {}, 'XP'))),
          L.steps.map(rung)))
    : null;

  const waiting = owed(s);
  const empty = !R.daily.length && !R.tiers.length && !waiting.length;

  const el = h('div', { class: 'screen rewards' },
    h('header', { class: 'sub-head' },
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Back', html: iconSVG('back'), onclick: () => ctx.go('map') }),
      h('h1', {}, 'Rewards'),
      h('div', { class: 'count' }, `${s.xp} XP`)),
    h('main', { class: 'list-body' },
      empty ? h('div', { class: 'empty-state' },
        h('div', { class: 'guide medium', html: guideSVG('idle') }),
        h('p', {}, 'No rewards yet. Ask a grown-up to add some!')) : null,
      waiting.length ? h('section', { class: 'panel glow-panel' },
        h('h2', {}, 'You won! Show a grown-up'),
        waiting.map((e) => h('div', { class: 'reward-row won', dataset: { earned: e.id } },
          picture({ icon: e.icon, photo: tierOf(e)?.photo }, '🎁'),
          h('div', { class: 'reward-main' }, h('div', { class: 'reward-title' }, e.title)),
          say(`You won ${e.title}. Show a grown-up.`)))) : null,
      track ? h('section', { class: 'panel ladder-panel' },
        h('h2', {}, 'Reward ladder'),
        track,
        L.next
          ? h('div', { class: 'ladder-next' }, h('span', { class: 'btn-icon', html: iconSVG('star') }), h('b', {}, String(L.next.left)), h('span', {}, 'XP to the next reward'),
              say(`You have ${L.xp} points. ${about(L.next)}`))
          : h('div', { class: 'ladder-next' }, h('span', { class: 'btn-icon', html: iconSVG('star') }), h('span', {}, 'You reached the top of the ladder!'))) : null,
      daily.length ? h('section', { class: 'panel' }, h('h2', {}, 'Today'), daily) : null));

  return {
    el,
    shown() {
      // Bring the part of the ladder he is on into view: the step he is working towards.
      const here = el.querySelector('.ladder-slot.is-next') || [...el.querySelectorAll('.ladder-slot.is-won, .ladder-slot.is-given')].pop();
      const box = el.querySelector('.ladder');
      if (here && box) box.scrollLeft = Math.max(0, here.offsetLeft - (box.clientWidth - here.offsetWidth) / 2);
      if (fresh) sfx.fanfare?.();
    },
    destroy() {
      audio.stop();
      for (const f of free) f();
    },
  };
}
