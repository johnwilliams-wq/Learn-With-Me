// Activity type "truth": he looks at a picture, hears a sentence about it, and decides
// whether the sentence is true. Two big buttons: a tick for "true", a cross for "not true".
//
// The picture is the same grid of objects as "tap", shown in a frame because it is there to be
// looked at. Touching a thing in it only marks it (a finger to count with); the marks are not
// part of the answer. On levels with `hide`, one curtain covers the whole picture while the
// voice talks. After two misses the guide points at the things the sentence is about
// (`scene.about`, when the content gives it) and then at the right button.

import { h, pulse, wait } from '../../core/dom.js';
import { createBoard } from '../board.js';
import { iconSVG } from '../../art/sprites.js';

const FRAME = 18; // padding + border of the picture frame on each side (see css/scenes/truth.css)
const BUTTONS = 158; // height kept free for the two answer buttons and the air around them

export default {
  create(item, host) {
    let choice = null; // true | false | null
    let mode = 'off';
    let alive = true;
    const marks = new Set();

    /** Is it his turn? Otherwise tell the mission what he did (too early / before pressing the ear). */
    const act = () => {
      if (mode === 'listening') return void host.onEarly();
      if (mode === 'ready') return void host.onIdle();
      return mode === 'respond';
    };
    const board = createBoard(item.scene, { onTap });
    const cell = (id) => board.el.querySelector(`.obj[data-id="${id}"]`);
    function onTap(id) {
      if (act() !== true) return;
      if (marks.has(id)) marks.delete(id);
      else marks.add(id);
      cell(id)?.classList.toggle('truth-mark', marks.has(id));
      host.sfx.tap();
    }
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
    // (a touch on the curtain counts like a touch on the picture: too early, or "press the ear first")
    const curtain = h('div', { class: 'truth-curtain', 'aria-hidden': 'true', onclick: () => { act(); } }, h('span', { class: 'truth-curtain-icon', html: iconSVG('ear') }));
    const frame = h('div', { class: 'truth-frame' }, board.el, curtain);
    const picture = h('div', { class: 'truth-picture' }, frame);
    const el = h('div', { class: 'truth-scene locked' }, picture, h('div', { class: 'truth-buttons' }, yes, no));

    const paint = () => {
      yes.classList.toggle('chosen', choice === true);
      no.classList.toggle('chosen', choice === false);
    };
    const clear = () => {
      marks.clear();
      el.classList.remove('demo');
      for (const b of board.el.querySelectorAll('.obj')) b.classList.remove('truth-mark', 'truth-about');
      yes.classList.remove('answer');
      no.classList.remove('answer');
    };
    board.setLocked(false); // the picture is never dimmed: it is what he is checking the sentence against

    return {
      el,
      fit(container) {
        const box = container.getBoundingClientRect();
        if (!box.width || !box.height) return;
        const height = Math.max(120, box.height - BUTTONS);
        picture.style.height = `${height}px`;
        // the board sizes itself to the room inside the frame
        board.fit({ getBoundingClientRect: () => ({ width: box.width - 2 * FRAME, height: height - 2 * FRAME }) });
      },
      setMode(m) {
        mode = m;
        el.classList.toggle('locked', m !== 'respond');
      },
      setCovered(v) {
        board.setCovered(v);
        frame.classList.toggle('covered', !!v);
      },
      reset() {
        choice = null;
        clear();
        paint();
      },
      answer: () => choice,
      size: () => (choice === null ? 0 : 1),
      undo() {
        choice = null;
        paint();
      },
      /** Point at each thing the sentence is about, then light up the right button. */
      async demo(onStep) {
        choice = null;
        clear();
        paint();
        const about = (item.scene.about || []).map(cell).filter(Boolean);
        if (about.length) {
          el.classList.add('demo');
          for (let i = 0; i < about.length; i++) {
            await wait(about.length > 5 ? 300 : 420);
            if (!alive) return;
            about[i].classList.add('truth-about');
            pulse(about[i], 'win', 700);
            onStep?.(i);
          }
          await wait(700);
          if (!alive) return;
        }
        const right = item.expect ? yes : no;
        right.classList.add('answer');
        pulse(right, 'win', 900);
        onStep?.(about.length);
        await wait(1500);
      },
      celebrate: () => pulse(item.expect ? yes : no, 'win', 900),
      shake: () => pulse(el, 'shake', 500),
      destroy() { alive = false; },
    };
  },
  /** answer: true | false | null (null = nothing chosen, or he pressed the hand - never right here) */
  check(answer, item) {
    const correct = typeof answer === 'boolean' && answer === item.expect;
    return { correct, error: correct ? '' : typeof answer === 'boolean' ? 'choice' : 'no-response', at: correct ? -1 : 0, prefix: correct ? 1 : 0, total: 0 };
  },
  isNone: () => false,
};
