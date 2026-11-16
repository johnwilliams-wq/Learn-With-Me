// After a mission: stars, XP, a treasure chest with a new card (always - effort is rewarded),
// and any reward from a grown-up that this mission has just earned.

import { h, wait, todayKey } from '../core/dom.js';
import { rankFor, isUnlocked } from '../listening/progress.js';
import { countedToday } from '../rewards/logic.js';
import { spriteSVG, chestOpenSVG, iconSVG, guideSVG } from '../art/sprites.js';

export function resultsScreen(ctx, { levelId, sum, card, prevStars, nextWasOpen = false, won = [] }) {
  const { store, sfx, voice, audio } = ctx;
  const s = store.get();
  const levels = ctx.levels;
  const i = levels.findIndex((l) => l.id === levelId);
  const next = levels[i + 1] || null;
  const nextOpen = next && isUnlocked(next.id, levels, s);
  const justOpened = nextOpen && !nextWasOpen;
  const rank = rankFor(s.xp);
  const rankedUp = rankFor(s.xp - sum.xp).index < rank.index;
  const today = s.days[todayKey()]?.missions || 0;
  const counted = countedToday(s);
  // The nearest daily reward he has not won yet (so the "good place to stop" hint never
  // talks him out of a reward a grown-up has set).
  const chasing = s.rewards.daily.filter((r) => counted < r.missions).sort((a, b) => a.missions - b.missions)[0] || null;
  const overLimit = today >= (s.settings.dailyMissions || 3);
  const locked = overLimit && s.settings.hardStop;
  const enough = locked || (overLimit && !chasing);
  let alive = true;

  const headline = sum.stars === 3 ? 'Perfect listening!' : sum.stars === 2 ? 'Great listening!' : 'Mission complete!';
  const stars = [1, 2, 3].map((n) => h('span', { class: `big-star${n <= sum.stars ? ' on' : ''}`, html: iconSVG(n <= sum.stars ? 'star' : 'star-empty') }));

  // The chest turns into the card when it is opened, so the screen never grows taller.
  const chest = h('button', { class: 'chest', type: 'button', 'aria-label': 'Open the treasure chest', html: spriteSVG('chest', 'yellow') });
  const chestHint = h('p', { class: 'chest-hint' }, card ? 'Tap the chest!' : '');
  const chestArea = h('div', { class: 'chest-area' }, chest, chestHint);
  if (!card) chestArea.hidden = true;
  chest.addEventListener('click', async () => {
    if (chest.disabled) return;
    chest.disabled = true;
    sfx.chest();
    chest.innerHTML = chestOpenSVG('yellow');
    chest.classList.add('open');
    await wait(550);
    if (!alive) return;
    chestArea.replaceChildren(
      h('div', { class: 'card-reveal' },
        h('div', { class: `card${card.rare ? ' rare' : ''}` },
          h('div', { class: 'card-art', html: spriteSVG(card.kind, card.color) }),
          h('div', { class: 'card-name' }, card.name))),
      h('p', { class: 'chest-hint' }, 'New card!'));
  });

  const go = (name, params) => { audio.unlock(); sfx.tap(); ctx.go(name, params); };
  const btn = (cls, act, icon, label, fn) => h('button', { class: cls, type: 'button', dataset: { act }, onclick: fn },
    h('span', { class: 'btn-icon', html: iconSVG(icon) }), h('span', { class: 'btn-label' }, label));
  const buttons = h('div', { class: 'row result-buttons' },
    !locked && nextOpen ? btn('btn btn-primary btn-big', 'next', 'play', 'Next level', () => go('mission', { levelId: next.id })) : null,
    !locked ? btn(`btn${nextOpen ? '' : ' btn-primary btn-big'}`, 'again', 'replay', sum.stars < 2 ? 'Try for 2 stars' : 'Play again', () => go('mission', { levelId })) : null,
    btn('btn', 'map', 'home', 'Map', () => go('map')));

  const el = h('div', { class: 'screen results' },
    h('div', { class: 'results-main' },
      h('div', { class: 'guide small', html: guideSVG('happy') }),
      h('h1', {}, headline),
      h('div', { class: 'stars' }, stars),
      h('p', { class: 'result-line' }, `${sum.correctFirst} of ${sum.total} right on the first try`),
      h('div', { class: 'tags' },
        h('span', { class: 'tag xp' }, `+${sum.xp} XP`),
        sum.earlyTaps === 0 ? h('span', { class: 'tag' }, 'Patient listener bonus') : null,
        rankedUp ? h('span', { class: 'tag gold' }, `New rank: ${rank.name}!`) : null,
        justOpened ? h('span', { class: 'tag gold' }, 'New level unlocked!') : null,
        !won.length && chasing && !locked ? h('span', { class: 'tag', dataset: { chasing: chasing.id } }, `${chasing.icon || '🎁'} ${chasing.missions - counted} more today`) : null),
      won.length ? h('div', { class: 'won-box', dataset: { won: String(won.length) } },
        h('b', {}, 'You won a reward! Show a grown-up'),
        won.map((w) => h('div', { class: 'won-item' }, h('span', { class: 'emoji' }, w.icon || '🎁'), h('span', {}, w.title)))) : null,
      chestArea,
      enough ? h('p', { class: 'enough' }, locked
        ? 'That’s all the missions for today. Blip needs to recharge - see you tomorrow!'
        : 'Great training today! This is a good place to stop. Come back tomorrow for more.') : null,
      buttons));

  return {
    el,
    async shown() {
      for (let k = 0; k < sum.stars; k++) {
        await wait(380);
        if (!alive) return;
        stars[k].classList.add('pop');
        sfx.star();
      }
      await wait(300);
      if (!alive) return;
      if (rankedUp || justOpened || won.length) sfx.fanfare();
      await voice.sayPool(enough ? 'enough' : `result${sum.stars}`);
      if (alive && won.length) voice.say('reward-won');
    },
    destroy() { alive = false; },
  };
}
