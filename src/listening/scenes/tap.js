// Activity type "tap": a grid of objects that he taps - one, several in order, a set, or
// (for instructions that must not be followed) none at all.

import { createBoard } from '../board.js';
import { check as checkTaps, demoOrder } from '../checker.js';

const MAX_ACTIONS = 12;

export default {
  create(item, host) {
    let actions = [];
    let mode = 'off';
    const board = createBoard(item.scene, { onTap });

    function onTap(id) {
      if (mode === 'listening') {
        board.nudge(id);
        return host.onEarly();
      }
      if (mode === 'ready') return host.onIdle();
      if (mode !== 'respond') return;
      if (item.mode === 'pick') {
        const i = actions.indexOf(id);
        if (i >= 0) actions.splice(i, 1);
        else actions.push(id);
      } else {
        if (actions.length >= MAX_ACTIONS) return;
        actions.push(id);
      }
      host.sfx.tap();
      board.mark(actions, item.mode);
      host.onChange();
      if (item.auto) host.onSubmit();
    }

    return {
      el: board.el,
      fit: board.fit,
      setMode(m) {
        mode = m;
        board.setLocked(m !== 'respond');
      },
      setCovered: board.setCovered,
      reset() {
        actions = [];
        board.mark(actions, item.mode);
      },
      answer: () => actions.slice(),
      size: () => actions.length,
      undo() {
        actions.pop();
        board.mark(actions, item.mode);
      },
      demo: (onStep) => board.demo(demoOrder(item.expect), item.mode, onStep),
      celebrate: () => board.celebrate(item.expect.flat()),
      shake: board.shake,
    };
  },
  check: (answer, item) => checkTaps(answer, item.expect, item.scene.objects),
  isNone: (item) => item.expect.flat().length === 0,
};
