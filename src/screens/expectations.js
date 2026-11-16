// His expectations: things he is simply expected to do every day. No points, no rewards -
// but his rewards stay locked until today's list is all done. A grown-up sets the list.

import { h, mount } from '../core/dom.js';
import { expectationsToday, tickExpectation } from '../rewards/logic.js';
import { iconSVG, guideSVG } from '../art/sprites.js';

export function expectationsScreen(ctx) {
  const { store, audio, sfx, voice } = ctx;
  const body = h('main', { class: 'list-body' });

  const say = (text) => h('button', { class: 'icon-btn small', type: 'button', 'aria-label': 'Read it to me', html: iconSVG('speaker'),
    onclick: () => { audio.unlock(); audio.speak(text); } });

  function render() {
    const s = store.get();
    const ex = expectationsToday(s);
    if (!ex.total) {
      return mount(body, h('div', { class: 'empty-state' },
        h('div', { class: 'guide medium', html: guideSVG('idle') }),
        h('p', {}, 'Nothing here yet. A grown-up can add some.')));
    }
    const hasRewards = s.rewards.daily.length || s.rewards.tiers.length || s.rewards.earned.some((e) => !e.given);
    mount(body,
      ex.allDone
        ? h('section', { class: 'panel glow-panel all-done' },
            h('h2', {}, 'All done for today!'),
            hasRewards ? h('button', { class: 'btn btn-primary', type: 'button', dataset: { open: 'rewards' }, onclick: () => ctx.go('rewards') },
              h('span', { class: 'btn-icon', html: iconSVG('gift') }), h('span', {}, 'Rewards')) : null)
        : null,
      h('section', { class: 'panel' },
        h('h2', {}, `Today: ${ex.done} of ${ex.total}`),
        ex.items.map((e) => h('div', { class: `chore-row expect-row state-${e.state}`, dataset: { expect: e.id } },
          h('span', { class: 'emoji' }, e.icon || '✅'),
          h('div', { class: 'reward-main' },
            h('div', { class: 'reward-title' }, e.title),
            e.note ? h('div', { class: 'reward-note' }, e.note) : null,
            e.state === 'pending' ? h('div', { class: 'chore-sub' }, h('span', { class: 'tag' }, 'Waiting for a grown-up')) : null),
          say(e.note ? `${e.title}. ${e.note}.` : e.title),
          h('button', { class: `tick-btn${e.state !== 'open' ? ' on' : ''}`, type: 'button', dataset: { act: 'tick' },
            'aria-label': e.state === 'open' ? `Done: ${e.title}` : `Not done: ${e.title}`,
            'aria-pressed': e.state === 'open' ? 'false' : 'true', html: iconSVG('check'),
            onclick: () => tick(e.id) })))));
  }

  function tick(id) {
    audio.unlock();
    sfx.unlock();
    const before = expectationsToday(store.get()).allDone;
    let now = 'open';
    store.update((s) => { now = tickExpectation(s, id); });
    if (now === 'open') sfx.undo();
    else sfx.good();
    const after = expectationsToday(store.get()).allDone;
    render();
    if (after && !before) {
      sfx.fanfare();
      voice.say('expect-done');
    }
  }

  const el = h('div', { class: 'screen expectations' },
    h('header', { class: 'sub-head' },
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Back', html: iconSVG('back'), onclick: () => ctx.go('map') }),
      h('h1', {}, 'Expectations'),
      h('div', {})),
    body);
  render();
  return { el, destroy: () => audio.stop() };
}
