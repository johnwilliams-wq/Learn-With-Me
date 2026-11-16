// After a mission: stars, XP, and a treasure chest with a new card (always - effort is rewarded).

import { h, wait, todayKey } from '../core/dom.js';
import { rankFor, isUnlocked } from '../listening/progress.js';
import { spriteSVG, chestOpenSVG, iconSVG, guideSVG } from '../art/sprites.js';

export function resultsScreen(ctx, { levelId, sum, card, prevStars }) {
  const { store, sfx, voice, audio } = ctx;
  const s = store.get();
  const levels = ctx.levels;
  const i = levels.findIndex((l) => l.id === levelId);
  const next = levels[i + 1] || null;
  const nextOpen = next && isUnlocked(next.id, levels, s);
  const justOpened = nextOpen && prevStars < 2 && (s.levels[levelId]?.plays || 0) >= 1 && (s.levels[next.id]?.plays || 0) === 0;
  const rank = rankFor(s.xp);
  const rankedUp = rankFor(s.xp - sum.xp).index < rank.index;
  const today = s.days[todayKey()]?.missions || 0;
  const enough = today >= (s.settings.dailyMissions || 3);
  const locked = enough && s.settings.hardStop;
  let alive = true;

  const headline = sum.stars === 3 ? 'Perfect listening!' : sum.stars === 2 ? 'Great listening!' : 'Mission complete!';
  const stars = [1, 2, 3].map((n) => h('span', { class: `big-star${n <= sum.stars ? ' on' : ''}`, html: iconSVG(n <= sum.stars ? 'star' : 'star-empty') }));

  const chest = h('button', { class: 'chest', type: 'button', 'aria-label': 'Open the treasure chest', html: spriteSVG('chest', 'yellow') });
  const cardBox = h('div', { class: 'card-reveal', hidden: true });
  const chestHint = h('p', { class: 'chest-hint' }, card ? 'Tap the chest!' : '');
  if (!card) chest.hidden = true;
  chest.addEventListener('click', async () => {
    if (chest.disabled) return;
    chest.disabled = true;
    sfx.chest();
    chest.innerHTML = chestOpenSVG('yellow');
    chest.classList.add('open');
    chestHint.textContent = 'New card!';
    await wait(450);
    if (!alive) return;
    cardBox.replaceChildren(
      h('div', { class: `card${card.rare ? ' rare' : ''}` },
        h('div', { class: 'card-art', html: spriteSVG(card.kind, card.color) }),
        h('div', { class: 'card-name' }, card.name)));
    cardBox.hidden = false;
  });

  const go = (name, params) => { audio.unlock(); sfx.tap(); ctx.go(name, params); };
  const buttons = h('div', { class: 'row result-buttons' },
    !locked && nextOpen ? h('button', { class: 'btn btn-primary btn-big', type: 'button', dataset: { act: 'next' }, onclick: () => go('mission', { levelId: next.id }) }, 'Next level') : null,
    !locked ? h('button', { class: `btn${nextOpen ? '' : ' btn-primary btn-big'}`, type: 'button', dataset: { act: 'again' }, onclick: () => go('mission', { levelId }) }, sum.stars < 2 ? 'Try for 2 stars' : 'Play again') : null,
    h('button', { class: 'btn', type: 'button', dataset: { act: 'map' }, onclick: () => go('map') }, 'Map'));

  const el = h('div', { class: 'screen results' },
    h('div', { class: 'results-main' },
      h('div', { class: 'guide medium', html: guideSVG('happy') }),
      h('h1', {}, headline),
      h('div', { class: 'stars' }, stars),
      h('p', { class: 'result-line' }, `${sum.correctFirst} of ${sum.total} right on the first listen`),
      h('div', { class: 'tags' },
        h('span', { class: 'tag xp' }, `+${sum.xp} XP`),
        sum.earlyTaps === 0 ? h('span', { class: 'tag' }, 'Patient listener bonus') : null,
        rankedUp ? h('span', { class: 'tag gold' }, `New rank: ${rank.name}!`) : null,
        justOpened ? h('span', { class: 'tag gold' }, 'New level unlocked!') : null),
      h('div', { class: 'chest-area' }, chest, chestHint, cardBox),
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
      if (rankedUp || justOpened) sfx.fanfare();
      voice.sayPool(enough ? 'enough' : `result${sum.stars}`);
    },
    destroy() { alive = false; },
  };
}
