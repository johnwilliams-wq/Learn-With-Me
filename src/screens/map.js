// The level map: worlds, levels, stars, and one big Play button.

import { h, pulse } from '../core/dom.js';
import { rankFor, isUnlocked, nextLevel } from '../listening/progress.js';
import { CARDS } from '../listening/cards.js';
import { iconSVG, guideSVG } from '../art/sprites.js';

export function mapScreen(ctx) {
  const { store, sfx, audio } = ctx;
  const s = store.get();
  const rank = rankFor(s.xp);
  const upNext = nextLevel(ctx.levels, s);
  const toast = h('div', { class: 'toast', hidden: true });

  const start = (levelId) => {
    audio.unlock();
    sfx.unlock();
    sfx.tap();
    ctx.go('mission', { levelId });
  };

  let n = 0;
  const worlds = ctx.worlds.map((w) =>
    h('section', { class: 'world', dataset: { world: w.id } },
      h('div', { class: 'world-head' }, h('h2', {}, w.name), h('p', {}, w.blurb || '')),
      h('div', { class: 'level-row' }, w.levels.map((l) => {
        n++;
        const open = isUnlocked(l.id, ctx.levels, s);
        const stars = s.levels[l.id]?.stars || 0;
        const btn = h('button', {
          class: `level-node${open ? '' : ' locked'}${l.id === upNext.id ? ' next' : ''}${l.boss ? ' boss' : ''}`,
          type: 'button',
          dataset: { level: l.id },
          'aria-label': `Level ${n}: ${l.title}${open ? '' : ' (locked)'}`,
        },
          h('span', { class: 'node-num' }, open ? String(n) : h('span', { class: 'node-lock', html: iconSVG('lock') })),
          h('span', { class: 'node-stars' }, [1, 2, 3].map((i) => h('span', { class: i <= stars ? 'on' : '', html: iconSVG(i <= stars ? 'star' : 'star-empty') }))),
          h('span', { class: 'node-title' }, l.title));
        btn.addEventListener('click', () => {
          if (open) return start(l.id);
          sfx.soft();
          pulse(btn, 'nudge', 450);
          toast.textContent = 'Earn 2 stars on the level before to open this one.';
          toast.hidden = false;
          clearTimeout(toast._t);
          toast._t = setTimeout(() => { toast.hidden = true; }, 2600);
        });
        return btn;
      }))));

  const el = h('div', { class: 'screen map' },
    h('header', { class: 'map-head' },
      h('div', { class: 'rank' },
        h('div', { class: 'rank-guide', html: guideSVG('idle') }),
        h('div', { class: 'rank-info' },
          h('div', { class: 'rank-name' }, rank.name),
          h('div', { class: 'xpbar' }, h('i', { style: { width: `${rank.span ? Math.min(100, (rank.into / rank.span) * 100) : 100}%` } })),
          h('div', { class: 'rank-sub' }, rank.next ? `${rank.span - rank.into} XP to ${rank.next}` : 'Top rank!'))),
      h('div', { class: 'map-actions' },
        h('button', { class: 'btn btn-chip', type: 'button', onclick: () => ctx.go('collection') },
          h('span', { class: 'btn-icon', html: iconSVG('cards') }), h('span', {}, `${s.cards.length}/${CARDS.length}`)),
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'For parents', html: iconSVG('parent'), onclick: () => ctx.go('parent') }))),
    h('main', { class: 'map-body' }, worlds),
    h('footer', { class: 'map-foot' },
      h('button', { class: 'btn btn-primary btn-big', type: 'button', dataset: { play: upNext.id }, onclick: () => start(upNext.id) },
        h('span', { class: 'btn-icon', html: iconSVG('play') }), h('span', { class: 'btn-label' }, 'Play'))),
    toast);

  return {
    el,
    shown() {
      el.querySelector('.level-node.next')?.scrollIntoView({ block: 'center', inline: 'center' });
    },
  };
}
