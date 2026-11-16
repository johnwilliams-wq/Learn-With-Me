// The reward mine: the ladder of points rewards (ladder() in src/rewards/logic.js) drawn as a
// side view of the ground. He starts on the grass and digs straight down as his points grow;
// every reward lies at an ore - coal first, then deeper and rarer ones (src/art/mine.js).
// Part of his Rewards screen (src/screens/rewards.js), which makes the reward cards.

import { h } from '../core/dom.js';
import { guideSVG } from '../art/sprites.js';
import { oreFor, oreBlockSVG, findSVG, pickSVG } from '../art/mine.js';

/** From which reward on the rock is the dark, deep kind (counted in rewards, 1 = the first). */
export const deepFrom = (n) => (n <= 2 ? n + 1 : Math.max(2, Math.ceil(n * 0.6)));

/**
 * L = ladder(state); card(step, index, ore) = the reward's card (a button the caller makes).
 * Depth is counted in "bands": the ore of the i-th reward (i from 1) lies i bands down, and his
 * own place is L.at bands down - so he stands beside an ore exactly when he has reached it.
 * The styles (css/mine.css) turn --n, --at, --deep and each step's --i into positions.
 */
export function buildMine(L, card) {
  const n = L.steps.length;
  const deep = deepFrom(n);
  const found = (step) => step.state === 'won' || step.state === 'given';
  return h('div', { class: 'mine', style: { '--n': n, '--at': L.at.toFixed(3), '--deep': deep }, dataset: { at: L.at.toFixed(3) } },
    h('div', { class: 'mine-sky', 'aria-hidden': 'true' }, h('i', { class: 'mine-sun' }), h('i', { class: 'mine-cloud one' }), h('i', { class: 'mine-cloud two' })),
    h('div', { class: 'mine-ground' },
      h('div', { class: 'mine-grass', 'aria-hidden': 'true' }),
      h('div', { class: 'mine-shaft', 'aria-hidden': 'true' }),
      h('div', { class: 'mine-me', 'aria-hidden': 'true' },
        h('span', { class: 'mine-guide', html: guideSVG('happy') }),
        h('span', { class: 'mine-pick', html: pickSVG() })),
      L.steps.map((step, i) => {
        const ore = oreFor(i);
        return h('div', { class: `mine-step is-${step.state}`, style: { '--i': i + 1 }, dataset: { ore } },
          h('span', { class: `mine-ore${found(step) ? ' is-found' : ''}`, 'aria-hidden': 'true', html: found(step) ? findSVG(ore) : oreBlockSVG(ore, i + 1 > deep) }),
          card(step, i, ore));
      })));
}
