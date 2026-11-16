// Activity type "truth": he looks at a picture, hears a sentence about it, and decides
// whether the sentence is true. (The picture is the same grid of objects as "tap", but it
// is only there to look at.) Two big buttons: a tick for "true", a cross for "not true".

import { h, pulse } from '../../core/dom.js';
import { createBoard } from '../board.js';
import { iconSVG } from '../../art/sprites.js';

export default {
  create(item, host) {
    let choice = null; // true | false | null
    let mode = 'off';
    const act = () => {
      if (mode === 'listening') return void host.onEarly();
      if (mode === 'ready') return void host.onIdle();
      return mode === 'respond';
    };
    const board = createBoard(item.scene, { onTap: () => { act(); } });
    const button = (value, icon, label) => h('button', { class: `truth-btn truth-${value ? 'yes' : 'no'}`, type: 'button', dataset: { truth: String(value) }, 'aria-label': label,
      onclick: () => {
        if (act() !== true) return;
        choice = value;
        host.sfx.tap();
        paint();
        host.onChange();
        host.onSubmit(); // one tap is the whole answer
      } }, h('span', { class: 'truth-icon', html: iconSVG(icon) }));
    const yes = button(true, 'check', 'True');
    const no = button(false, 'close', 'Not true');
    const el = h('div', { class: 'truth-scene locked' }, h('div', { class: 'truth-picture' }, board.el), h('div', { class: 'truth-buttons' }, yes, no));
    const paint = () => {
      yes.classList.toggle('chosen', choice === true);
      no.classList.toggle('chosen', choice === false);
    };
    board.setLocked(false); // the picture is never dimmed: it is what he is checking the sentence against

    return {
      el,
      fit(container) {
        const box = container.getBoundingClientRect();
        const picture = el.querySelector('.truth-picture');
        picture.style.height = `${Math.max(120, box.height - 150)}px`;
        board.fit(picture);
      },
      setMode(m) {
        mode = m;
        el.classList.toggle('locked', m !== 'respond');
      },
      setCovered: board.setCovered,
      reset() {
        choice = null;
        paint();
      },
      answer: () => choice,
      size: () => (choice === null ? 0 : 1),
      undo() {
        choice = null;
        paint();
      },
      async demo(onStep) {
        choice = item.expect;
        paint();
        pulse(item.expect ? yes : no, 'win', 900);
        onStep?.(0);
        await new Promise((r) => setTimeout(r, 1400));
      },
      celebrate: () => pulse(item.expect ? yes : no, 'win', 900),
      shake: () => pulse(el, 'shake', 500),
    };
  },
  /** answer: true | false | null (null = he pressed the hand, which is never right here) */
  check(answer, item) {
    const correct = answer === item.expect;
    return { correct, error: correct ? '' : answer === null ? 'no-response' : 'choice', at: correct ? -1 : 0, prefix: correct ? 1 : 0, total: 0 };
  },
  isNone: () => false,
};
