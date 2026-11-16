// The play area: a grid of tappable objects.

import { h, pulse, wait } from '../core/dom.js';
import { spriteSVG } from '../art/sprites.js';

/**
 * @param scene { cols:number, objects:[{id, kind, color, size}] }  (objects fill the grid row by row)
 * @param onTap (objectId) => void
 */
export function createBoard(scene, { onTap }) {
  const cols = scene.cols || Math.min(scene.objects.length, 4);
  const rows = Math.ceil(scene.objects.length / cols);
  const el = h('div', { class: 'board locked', style: { '--cols': cols, '--rows': rows } });
  const buttons = new Map();

  for (const o of scene.objects) {
    const btn = h(
      'button',
      {
        class: `obj size-${o.size || 'big'}`,
        type: 'button',
        dataset: { id: o.id, kind: o.kind, color: o.color },
        'aria-label': `${o.size === 'small' ? 'small ' : ''}${o.color} ${o.kind}`,
        onclick: () => onTap(o.id),
      },
      h('span', { class: 'obj-art', html: spriteSVG(o.kind, o.color) }),
      h('span', { class: 'obj-cover', 'aria-hidden': 'true' }, '?'),
      h('span', { class: 'obj-badges', 'aria-hidden': 'true' })
    );
    buttons.set(o.id, btn);
    el.append(btn);
  }

  /** Size the cells so the whole grid fits the space it has been given. */
  function fit(container) {
    const box = container.getBoundingClientRect();
    if (!box.width || !box.height) return;
    const gap = Math.max(8, Math.min(18, box.width * 0.015));
    const cell = Math.floor(Math.min((box.width - gap * (cols - 1)) / cols, (box.height - gap * (rows - 1)) / rows, 210));
    el.style.setProperty('--cell', `${Math.max(56, cell)}px`);
    el.style.setProperty('--gap', `${gap}px`);
  }

  /** Show what has been tapped so far. 'seq' = numbered order badges, 'pick' = ticks. */
  function mark(actions, mode = 'seq') {
    for (const btn of buttons.values()) {
      btn.classList.remove('chosen');
      btn.querySelector('.obj-badges').replaceChildren();
    }
    actions.forEach((id, i) => {
      const btn = buttons.get(id);
      if (!btn) return;
      btn.classList.add('chosen');
      btn.querySelector('.obj-badges').append(h('span', { class: 'badge' }, mode === 'pick' ? '✓' : String(i + 1)));
    });
  }

  return {
    el,
    fit,
    mark,
    setLocked: (v) => el.classList.toggle('locked', !!v),
    setCovered: (v) => el.classList.toggle('covered', !!v),
    nudge: (id) => pulse(buttons.get(id), 'nudge', 450),
    shake: () => pulse(el, 'shake', 500),
    celebrate(ids) {
      for (const id of new Set(ids)) pulse(buttons.get(id), 'win', 900);
      if (!ids.length) pulse(el, 'calm-win', 900);
    },
    /** Slowly show the right answer, one tap at a time. */
    async demo(order, mode, onStep) {
      mark([], mode);
      for (let i = 0; i < order.length; i++) {
        await wait(650);
        mark(order.slice(0, i + 1), mode);
        pulse(buttons.get(order[i]), 'win', 700);
        onStep?.(i);
      }
      await wait(900);
    },
  };
}
