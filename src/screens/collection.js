// The card collection.

import { h } from '../core/dom.js';
import { CARDS } from '../listening/cards.js';
import { spriteSVG, iconSVG } from '../art/sprites.js';

export function collectionScreen(ctx) {
  const owned = new Set(ctx.store.get().cards);
  const el = h('div', { class: 'screen collection' },
    h('header', { class: 'sub-head' },
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Back', html: iconSVG('back'), onclick: () => ctx.go('map') }),
      h('h1', {}, 'My Cards'),
      h('div', { class: 'count' }, `${owned.size} / ${CARDS.length}`)),
    h('main', { class: 'card-grid' }, CARDS.map((c) =>
      owned.has(c.id)
        ? h('div', { class: `card${c.rare ? ' rare' : ''}` },
            h('div', { class: 'card-art', html: spriteSVG(c.kind, c.color) }),
            h('div', { class: 'card-name' }, c.name))
        : h('div', { class: 'card empty' },
            h('div', { class: 'card-art', html: spriteSVG(c.kind, 'gray') }),
            h('div', { class: 'card-name' }, '???')))));
  return { el };
}
