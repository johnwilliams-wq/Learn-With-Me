// His rewards: today's goals, the big lifetime rewards, and anything he has won that a
// grown-up still owes him. The rewards themselves are set by a grown-up in the parent area.

import { h, todayKey } from '../core/dom.js';
import { countedToday, owed } from '../rewards/logic.js';
import { iconSVG, guideSVG } from '../art/sprites.js';

export function rewardsScreen(ctx) {
  const { store, audio } = ctx;
  const s = store.get();
  const R = s.rewards;
  const today = todayKey();
  const counted = countedToday(s);

  // Reward names are typed by a grown-up, so he may not be able to read them: every row can be read aloud.
  const say = (text) => h('button', { class: 'icon-btn small', type: 'button', 'aria-label': 'Read it to me', html: iconSVG('speaker'),
    onclick: () => { audio.unlock(); audio.speak(text); } });
  const stamp = (e) => h('span', { class: `stamp${e.given ? ' given' : ''}` }, e.given ? 'Got it ✓' : 'WON!');

  const daily = R.daily.slice().sort((a, b) => a.missions - b.missions).map((r) => {
    const e = R.earned.find((x) => x.src === 'daily' && x.ref === r.id && x.day === today);
    const left = Math.max(0, r.missions - counted);
    return h('div', { class: `reward-row${e ? ' won' : ''}`, dataset: { reward: r.id } },
      h('span', { class: 'emoji' }, r.icon || '🎁'),
      h('div', { class: 'reward-main' },
        h('div', { class: 'reward-title' }, r.title),
        h('div', { class: 'pips' }, Array.from({ length: Math.min(r.missions, 12) }, (_, i) => h('span', { class: `pip${i < counted ? ' gold' : ''}` })))),
      e ? stamp(e) : h('span', { class: 'reward-need' }, `${Math.min(counted, r.missions)} / ${r.missions}`),
      say(e ? `${r.title}. You won it!` : `${r.title}. ${left} more ${left === 1 ? 'mission' : 'missions'} today.`));
  });

  const tiers = R.tiers.slice().sort((a, b) => a.points - b.points).map((t) => {
    const e = R.earned.find((x) => x.src === 'tier' && x.ref === t.id);
    const pct = Math.max(0, Math.min(100, (s.xp / t.points) * 100));
    return h('div', { class: `reward-row${e ? ' won' : ''}`, dataset: { reward: t.id } },
      h('span', { class: 'emoji' }, t.icon || '🏆'),
      h('div', { class: 'reward-main' },
        h('div', { class: 'reward-title' }, t.title),
        h('div', { class: 'xpbar wide' }, h('i', { style: { width: `${pct}%` } }))),
      e ? stamp(e) : h('span', { class: 'reward-need' }, `${Math.min(s.xp, t.points)} / ${t.points} XP`),
      say(e ? `${t.title}. You won it!` : `${t.title}. You need ${t.points - s.xp} more points.`));
  });

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
          h('span', { class: 'emoji' }, e.icon || '🎁'),
          h('div', { class: 'reward-main' }, h('div', { class: 'reward-title' }, e.title)),
          say(`You won ${e.title}. Show a grown-up.`)))) : null,
      daily.length ? h('section', { class: 'panel' }, h('h2', {}, 'Today'), daily) : null,
      tiers.length ? h('section', { class: 'panel' }, h('h2', {}, 'Big rewards'), tiers) : null));

  return { el, destroy: () => audio.stop() };
}
