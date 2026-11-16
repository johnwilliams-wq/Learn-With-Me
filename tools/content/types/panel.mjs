// Content rules for activity type "panel" (see src/listening/scenes/panel.js): a control panel
// with push buttons, lever switches, a dial, a number pad, a status light and a launch button.
//
// A generator's draft:
//   { t: 'panel', say, controls, expect, keepOrder?, hide?, auto?, s, v }
//   controls  [{ type: 'button', color } | { type: 'switch', color, pos: 'up' | 'down' } | { type: 'dial', value }
//              | { type: 'keypad' } | { type: 'light', color: 'red' | 'green' } | { type: 'launch' }]
//   expect    ordered groups of { c: <one of those control objects>, v: the state it must end in }
//             button -> number of presses, switch -> 'up' | 'down', dial -> digit, keypad -> the code as a
//             string, launch -> true. Inside a group any order. Controls that are not named stay untouched.
// finish() puts the buttons and the switches in a random left-to-right order (unless keepOrder) and
// gives every control an id: b1, b2... s1, s2... d1, k1, l1, go.

import { COLORS } from '../lib.mjs';

const ORDER = ['light', 'button', 'switch', 'dial', 'keypad', 'launch'];
const MOST = { light: 1, button: 4, switch: 3, dial: 1, keypad: 1, launch: 1 };
const LETTER = { light: 'l', button: 'b', switch: 's', dial: 'd', keypad: 'k' };
const MAX_PRESSES = 4; // the panel shows up to five dots; asking for five would leave no room to see "one too many"
const MAX_TOUCHES = 12;

export default {
  finish(rng, draft) {
    const { t, say, controls, expect, keepOrder = false, ...rest } = draft;
    if (!Array.isArray(controls) || !Array.isArray(expect)) throw new Error('a panel item needs controls and expect');
    const placed = ORDER.flatMap((type) => {
      const list = controls.filter((c) => c.type === type);
      return keepOrder ? list : rng.shuffle(list);
    });
    if (placed.length !== controls.length) throw new Error('a panel item has a control of an unknown type');
    const count = {};
    const ids = new Map(placed.map((c) => {
      count[c.type] = (count[c.type] || 0) + 1;
      return [c, c.type === 'launch' ? 'go' : `${LETTER[c.type]}${count[c.type]}`];
    }));
    const scene = { controls: placed.map((c) => {
      const out = { id: ids.get(c), type: c.type };
      if (c.type === 'button' || c.type === 'switch' || c.type === 'light') out.color = c.color;
      if (c.type === 'switch') out.pos = c.pos;
      if (c.type === 'dial') out.value = c.value;
      return out;
    }) };
    return {
      say,
      t: 'panel',
      scene,
      expect: expect.map((group) => group.map((e) => {
        const id = ids.get(e.c);
        if (!id) throw new Error('expect refers to a control that is not on the panel');
        return { c: id, v: e.v };
      })),
      ...rest,
    };
  },

  validate(item, { fail }) {
    const controls = item.scene?.controls;
    if (!Array.isArray(controls) || controls.length < 2) fail('a panel needs at least two controls');
    if (new Set(controls.map((c) => c.id)).size !== controls.length) fail('duplicate control ids');
    const start = new Map();
    for (const type of ORDER) {
      const list = controls.filter((c) => c.type === type);
      if (list.length > MOST[type]) fail(`too many controls of type ${type}`);
      if ((type === 'button' || type === 'switch') && new Set(list.map((c) => c.color)).size !== list.length) fail(`two ${type}s share a colour`);
    }
    for (const c of controls) {
      if (!ORDER.includes(c.type)) fail(`unknown control type ${c.type}`);
      if (typeof c.id !== 'string' || !/^[a-z]+[0-9]*$/.test(c.id)) fail(`bad control id ${c.id}`);
      if ((c.type === 'button' || c.type === 'switch') && !COLORS.includes(c.color)) fail(`unknown colour ${c.color}`);
      if (c.type === 'light' && !['red', 'green'].includes(c.color)) fail(`a light is red or green, not ${c.color}`);
      if (c.type === 'switch' && !['up', 'down'].includes(c.pos)) fail(`a switch is up or down, not ${c.pos}`);
      if (c.type === 'dial' && !(Number.isInteger(c.value) && c.value >= 0 && c.value <= 9)) fail(`bad dial value ${c.value}`);
      start.set(c.id, c);
    }
    if (controls.filter((c) => c.type !== 'light').length < 2) fail('a panel needs at least two controls that can be worked');
    if (controls.map((c) => ORDER.indexOf(c.type)).some((n, i, a) => i && n < a[i - 1])) fail('controls are not in the standard order');

    if (!Array.isArray(item.expect) || !item.expect.length || item.expect.some((g) => !Array.isArray(g) || !g.length)) fail('expect must be a list of groups that are not empty');
    const named = new Set();
    let touches = 0;
    for (const e of item.expect.flat()) {
      const c = start.get(e?.c);
      if (!c) fail(`expect names missing control ${e?.c}`);
      if (named.has(c.id)) fail(`control ${c.id} is named twice`);
      named.add(c.id);
      if (c.type === 'light') fail('the light cannot be worked');
      if (c.type === 'button') {
        if (!(Number.isInteger(e.v) && e.v >= 1 && e.v <= MAX_PRESSES)) fail(`bad number of presses ${e.v}`);
        touches += e.v;
      } else if (c.type === 'switch') {
        if (!['up', 'down'].includes(e.v) || e.v === c.pos) fail(`switch ${c.id} must end flipped`);
        touches += 1;
      } else if (c.type === 'dial') {
        if (!(Number.isInteger(e.v) && e.v >= 0 && e.v <= 9) || e.v === c.value) fail(`dial ${c.id} must end on a different digit`);
        touches += Math.abs(e.v - c.value);
      } else if (c.type === 'keypad') {
        if (typeof e.v !== 'string' || !/^[0-9]{2,6}$/.test(e.v)) fail(`bad code ${e.v}`);
        touches += e.v.length;
      } else {
        if (e.v !== true) fail('launch is either pressed or not');
        touches += 1;
      }
    }
    if (touches > MAX_TOUCHES) fail(`too much to do in one turn (${touches} touches)`);
    if (item.auto && touches !== 1) fail('auto-submit only suits a one-touch answer');
    if (item.mode) fail('panel items have no mode');
  },

  isNone: () => false,
};
