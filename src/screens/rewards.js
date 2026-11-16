// His rewards: anything he has won that a grown-up still owes him, today's goals, and the
// REWARD MINE - the ladder of points rewards drawn as a mine he digs down into: every reward is
// an ore, his digger stands where his points have brought him, and he can scroll down to look
// at what is still ahead (src/screens/mine.js). The rewards themselves (names, descriptions,
// pictures) are set by a grown-up in the parent area.
//
// Expectations come first: until today's list is done he cannot collect anything - what he has
// won waits. But he can always LOOK at his mine (the owner asked for that): where he is, what he
// has found, what lies ahead. Looking ahead is what makes him want to get there.

import { h, todayKey } from '../core/dom.js';
import { countedToday, owed, expectationsToday, ladder, collectRewards } from '../rewards/logic.js';
import { showPhoto } from '../core/photos.js';
import { iconSVG, guideSVG } from '../art/sprites.js';
import { findSVG, oreBlockSVG } from '../art/mine.js';
import { buildMine } from './mine.js';

export function rewardsScreen(ctx) {
  const { store, audio, voice, sfx } = ctx;
  let s = store.get();
  const ex = expectationsToday(s);
  const locked = !ex.allDone; // today's expectations are still open: he may look, not collect
  // Anything he has reached but that was not written down yet (a reward added after he passed its mark).
  let fresh = false;
  if (!locked) {
    store.update((st) => { fresh = collectRewards(st).length > 0; });
    s = store.get();
  }
  const R = s.rewards;
  let el = null; // the screen (made further down; the big view of a reward is put on top of it)
  const today = todayKey();
  const counted = countedToday(s);
  const free = []; // pictures on screen, to release when leaving
  let closeBig = null; // closes the big view of a reward, when one is open

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

  // ---- the mine: every points reward is an ore; he digs down to them ----
  const L = ladder(s);
  const found = (step) => step.state === 'given' || step.state === 'won';
  const about = (step) => {
    if (step.state === 'given') return `${withNote(step)} You got it!`;
    if (step.state === 'won') return locked ? `${withNote(step)} You found it! Finish your expectations first, then show a grown-up.` : `${withNote(step)} You found it! Show a grown-up.`;
    return `${withNote(step)} It is at ${step.points} points. You need ${step.left} more.`;
  };
  /** On a reward he has found: the stamp - or, while his expectations are open, a lock: found, but not his to collect yet. */
  const badge = (step) => (locked && step.state === 'won'
    ? h('span', { class: 'stamp waits' }, h('span', { class: 'need-lock', html: iconSVG('lock') }), 'Found')
    : stamp(step.state === 'given'));
  function openStep(step, ore) {
    if (el.querySelector('.rung-overlay')) return;
    sfx.tap();
    const close = () => { audio.stop(); overlay.remove(); document.removeEventListener('keydown', onKey); };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    closeBig = close;
    const pct = Math.max(0, Math.min(100, (L.xp / step.points) * 100));
    const overlay = h('div', { class: 'overlay rung-overlay', onclick: (e) => { if (e.target === overlay) close(); } },
      h('div', { class: `panel rung-detail is-${step.state}`, dataset: { detail: step.id } },
        picture(step, '🏆', 'rung-pic big'),
        h('h2', {}, step.title),
        step.note ? h('p', { class: 'tip' }, step.note) : null,
        h('div', { class: 'rung-progress' },
          h('div', { class: 'xpbar wide' }, h('i', { style: { width: `${pct}%` } })),
          h('span', { class: 'rung-count' }, `${Math.min(L.xp, step.points)} / ${step.points} XP`)),
        h('div', { class: 'rung-found' },
          h('span', { class: 'rung-ore', 'aria-hidden': 'true', html: found(step) ? findSVG(ore) : oreBlockSVG(ore) }),
          found(step) ? badge(step) : h('p', { class: 'rung-left' }, h('b', {}, String(step.left)), ' XP to go')),
        h('div', { class: 'row' },
          say(about(step)),
          h('button', { class: 'btn btn-primary btn-big', type: 'button', dataset: { act: 'close' }, onclick: close }, h('span', { class: 'btn-icon', html: iconSVG('check') }), h('span', {}, 'OK')))));
    el.append(overlay);
    overlay.querySelector('[data-act="close"]').focus({ preventScroll: true });
    speak(about(step));
  }
  const card = (step, i, ore) => h('button', { class: `rung is-${step.state}${found(step) ? ' won' : ''}`, type: 'button', dataset: { reward: step.id },
    'aria-label': about(step), onclick: () => openStep(step, ore) },
    picture(step, '🏆', 'rung-pic'),
    h('span', { class: 'rung-points' }, String(step.points)),
    h('span', { class: 'reward-title' }, step.title),
    found(step) ? badge(step)
      : h('span', { class: 'reward-need' }, step.state === 'ahead' ? h('span', { class: 'need-lock', html: iconSVG('lock') }) : null, `${Math.min(L.xp, step.points)} / ${step.points} XP`));
  const mine = L.steps.length ? buildMine(L, card) : null;
  const minePanel = mine ? h('section', { class: 'panel mine-panel' },
    h('div', { class: 'mine-head' },
      h('h2', {}, 'Reward mine'),
      L.next
        ? h('div', { class: 'ladder-next' }, h('span', { class: 'btn-icon', html: iconSVG('star') }), h('b', {}, String(L.next.left)), h('span', {}, 'XP to the next reward'),
            say(`You have ${L.xp} points. ${about(L.next)}`))
        : h('div', { class: 'ladder-next' }, h('span', { class: 'btn-icon', html: iconSVG('star') }), h('span', {}, 'You found everything in the mine!'))),
    mine) : null;
  const head = h('header', { class: 'sub-head' },
    h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Back', html: iconSVG('back'), onclick: () => ctx.go('map') }),
    h('h1', {}, 'Rewards'),
    h('div', { class: 'count' }, `${s.xp} XP`));
  const leave = () => {
    closeBig?.();
    audio.stop();
    for (const f of free) f();
  };

  if (locked) {
    // The lock and the way to his list - and, underneath, the mine to look at.
    el = h('div', { class: 'screen rewards locked' },
      head,
      h('main', { class: 'list-body' },
        h('section', { class: `panel lock-panel${mine ? ' with-mine' : ''}` },
          h('div', { class: 'lock-big', html: iconSVG('lock') }),
          h('h2', {}, 'Finish your expectations first'),
          h('div', { class: 'pips' }, ex.items.map((e) => h('span', { class: `pip${e.state === 'done' ? ' gold' : e.state === 'pending' ? ' silver' : ''}` }))),
          h('button', { class: 'btn btn-primary btn-big', type: 'button', dataset: { open: 'expectations' }, onclick: () => ctx.go('expectations') },
            h('span', { class: 'btn-icon', html: iconSVG('expect') }), h('span', {}, 'Expectations'))),
        minePanel));
    return { el, shown: () => voice.say('rewards-locked'), destroy: leave };
  }

  const waiting = owed(s);
  const empty = !R.daily.length && !R.tiers.length && !waiting.length;

  el = h('div', { class: 'screen rewards' },
    head,
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
      daily.length ? h('section', { class: 'panel' }, h('h2', {}, 'Today'), daily) : null,
      minePanel));

  return {
    el,
    shown() {
      // Ride down to where he is digging, when that is further down than the screen shows.
      const me = el.querySelector('.mine-me');
      const body = el.querySelector('.list-body');
      if (me && body) {
        const top = me.getBoundingClientRect().top - body.getBoundingClientRect().top + body.scrollTop;
        if (top > body.clientHeight * 0.7) {
          const calm = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
          body.scrollTo({ top: Math.max(0, top - body.clientHeight * 0.45), behavior: calm ? 'auto' : 'smooth' });
        }
      }
      if (fresh) sfx.fanfare?.();
    },
    destroy: leave,
  };
}
