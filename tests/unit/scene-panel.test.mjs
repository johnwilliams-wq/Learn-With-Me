// The "panel" activity (Control Room): the pure parts of the play area - how actions change the
// controls (replay), whether an answer is right (check), and the art.

import test from 'node:test';
import assert from 'node:assert/strict';
import panel, { check, replay, initialState, touches, solution, MAX_PRESSES, MAX_CODE } from '../../src/listening/scenes/panel.js';
import { buttonSVG, switchSVG, dialSVG, lightSVG, launchSVG, stepSVG } from '../../src/art/panel.js';
import { PALETTE } from '../../src/art/sprites.js';
import { ERRORS } from '../../src/listening/insights.js';
import { itemsOfType } from './oracles/load.mjs';

// A full console: light, three buttons, two switches, dial on 3, number pad, launch.
const scene = { controls: [
  { id: 'l1', type: 'light', color: 'green' },
  { id: 'b1', type: 'button', color: 'red' }, { id: 'b2', type: 'button', color: 'blue' }, { id: 'b3', type: 'button', color: 'green' },
  { id: 's1', type: 'switch', color: 'red', pos: 'up' }, { id: 's2', type: 'switch', color: 'blue', pos: 'down' },
  { id: 'd1', type: 'dial', value: 3 },
  { id: 'k1', type: 'keypad' },
  { id: 'go', type: 'launch' },
] };
const item = (expect) => ({ scene, expect });
const B = (id) => ({ c: id });
const up = { c: 'd1', d: 1 };
const down = { c: 'd1', d: -1 };
const keys = (s) => [...s].map((k) => ({ c: 'k1', k }));
const verdict = (actions, expect) => check({ actions }, item(expect));
const right = (actions, expect) => assert.deepEqual(verdict(actions, expect).correct, true, JSON.stringify(verdict(actions, expect)));
const wrong = (actions, expect, error) => {
  const res = verdict(actions, expect);
  assert.equal(res.correct, false);
  assert.equal(res.error, error);
  assert.ok(error in ERRORS, `${error} is not an error the parent view knows`);
};

test('replay: every control follows from the list of actions', () => {
  assert.deepEqual(initialState(scene), { b1: 0, b2: 0, b3: 0, s1: 'up', s2: 'down', d1: 3, k1: '', go: false });
  const { state, last } = replay(scene, [B('b1'), B('b1'), B('s1'), up, up, ...keys('40'), B('go'), B('s2'), B('s2')]);
  assert.deepEqual(state, { b1: 2, b2: 0, b3: 0, s1: 'down', s2: 'down', d1: 5, k1: '40', go: true });
  assert.equal(last.b1, 1);
  assert.equal(last.go, 7);
  assert.equal(last.s2, 9);
  assert.equal(last.b2, undefined);
});

test('replay: things a control cannot do are ignored', () => {
  const many = Array.from({ length: 9 }, () => B('b1'));
  assert.equal(replay(scene, many).state.b1, MAX_PRESSES);
  assert.equal(replay(scene, Array.from({ length: 12 }, () => up)).state.d1, 9);
  assert.equal(replay(scene, Array.from({ length: 12 }, () => down)).state.d1, 0);
  assert.equal(replay(scene, keys('1234567890123')).state.k1.length, MAX_CODE);
  assert.equal(replay(scene, [B('go'), B('go')]).last.go, 0); // launch can only be pressed once
  assert.deepEqual(replay(scene, [B('l1'), { c: 'nope' }, { c: 'k1', k: 'x' }]).state, initialState(scene));
});

test('check: one press, a count, a flip', () => {
  right([B('b1')], [[{ c: 'b1', v: 1 }]]);
  right([B('b3'), B('b3'), B('b3')], [[{ c: 'b3', v: 3 }]]);
  right([B('s2')], [[{ c: 's2', v: 'up' }]]);
  wrong([B('b3'), B('b3')], [[{ c: 'b3', v: 3 }]], 'count');
  wrong([B('b3'), B('b3'), B('b3'), B('b3')], [[{ c: 'b3', v: 3 }]], 'count');
  wrong([B('b2')], [[{ c: 'b1', v: 1 }]], 'attribute'); // a button, but the wrong colour
  wrong([B('s1')], [[{ c: 'b1', v: 1 }]], 'object'); // the red switch instead of the red button
  wrong([B('b1'), B('b2')], [[{ c: 'b1', v: 1 }]], 'extra');
});

test('check: an empty answer is never right', () => {
  wrong([], [[{ c: 'b1', v: 1 }]], 'no-response');
  assert.equal(check(null, item([[{ c: 'b1', v: 1 }]])).error, 'no-response');
  assert.equal(check({ actions: [] }, item([[{ c: 'go', v: true }]])).correct, false);
  wrong([B('s1'), B('s1')], [[{ c: 's1', v: 'down' }]], 'incomplete'); // flipped and flipped back: nothing done
  assert.equal(panel.isNone(item([[{ c: 'b1', v: 1 }]])), false);
});

test('check: the dial is judged by where it ends up', () => {
  right([up, up, up, up], [[{ c: 'd1', v: 7 }]]);
  right([up, up, up, up, up, down], [[{ c: 'd1', v: 7 }]]); // went past it and came back
  right([down, down, down], [[{ c: 'd1', v: 0 }]]);
  wrong([up, up], [[{ c: 'd1', v: 7 }]], 'value');
  wrong([up, down], [[{ c: 'd1', v: 7 }]], 'incomplete');
});

test('check: a code must match digit for digit, in order', () => {
  right(keys('472'), [[{ c: 'k1', v: '472' }]]);
  wrong(keys('427'), [[{ c: 'k1', v: '472' }]], 'order');
  wrong(keys('47'), [[{ c: 'k1', v: '472' }]], 'incomplete');
  wrong(keys('4721'), [[{ c: 'k1', v: '472' }]], 'extra');
  wrong(keys('473'), [[{ c: 'k1', v: '472' }]], 'value');
  wrong(keys('391'), [[{ c: 'k1', v: '193' }]], 'order'); // typed forwards when it had to be backwards
  right(keys('007'), [[{ c: 'k1', v: '007' }]]);
});

test('check: order matters between groups, not inside one', () => {
  const thenLaunch = [[{ c: 'd1', v: 5 }, { c: 's1', v: 'down' }, { c: 's2', v: 'up' }], [{ c: 'go', v: true }]];
  right([up, up, B('s1'), B('s2'), B('go')], thenLaunch);
  right([B('s2'), B('s1'), up, up, B('go')], thenLaunch);
  wrong([B('go'), up, up, B('s1'), B('s2')], thenLaunch, 'order');
  wrong([up, up, B('s1'), B('go'), B('s2')], thenLaunch, 'order');
  wrong([up, B('s1'), B('s2'), B('go'), up], thenLaunch, 'order'); // the dial was only finished after launch
  wrong([up, up, B('s1'), B('go')], thenLaunch, 'incomplete');
  const three = [[{ c: 'b1', v: 2 }], [{ c: 's2', v: 'up' }], [{ c: 'k1', v: '90' }]];
  right([B('b1'), B('b1'), B('s2'), ...keys('90')], three);
  wrong([B('s2'), B('b1'), B('b1'), ...keys('90')], three, 'order');
  wrong([B('b1'), B('b1'), ...keys('90'), B('s2')], three, 'order');
  const res = check({ actions: [B('s2'), B('b1'), B('b1'), ...keys('90')] }, item(three));
  assert.equal(res.total, 5);
});

test('check: what was not named must be left as it was', () => {
  wrong([B('b1'), B('go')], [[{ c: 'b1', v: 1 }]], 'extra');
  wrong([B('b1'), up], [[{ c: 'b1', v: 1 }]], 'extra');
  wrong([B('b1'), ...keys('5')], [[{ c: 'b1', v: 1 }]], 'extra');
  right([B('b1'), B('s1'), B('s1'), up, down], [[{ c: 'b1', v: 1 }]]); // touched and put back: nothing has changed
});

test('check: the result always has the shape the mission screen expects', () => {
  for (const actions of [[], [B('b1')], [B('b2')], keys('12'), [B('go'), B('b1')]]) {
    const res = check({ actions, state: {} }, item([[{ c: 'b1', v: 1 }], [{ c: 'go', v: true }]]));
    assert.deepEqual(Object.keys(res).sort(), ['at', 'correct', 'error', 'prefix', 'total']);
    assert.equal(typeof res.correct, 'boolean');
    assert.ok(res.error === '' ? res.correct : res.error in ERRORS);
    assert.equal(res.total, 2);
  }
  assert.deepEqual(check([B('b1'), B('go')], item([[{ c: 'b1', v: 1 }], [{ c: 'go', v: true }]])), { correct: true, error: '', at: -1, prefix: 2, total: 2 });
});

test('touches and solution: the shown answer is a right answer of the promised length', () => {
  const it = item([[{ c: 'b1', v: 2 }, { c: 's2', v: 'up' }], [{ c: 'd1', v: 0 }], [{ c: 'k1', v: '6172' }], [{ c: 'go', v: true }]]);
  assert.equal(touches(it), 2 + 1 + 3 + 4 + 1);
  assert.equal(solution(it).length, touches(it));
  assert.equal(check({ actions: solution(it) }, it).correct, true);
});

test('every generated panel item: the shown answer is accepted, and a touch on anything else is not', () => {
  for (const it of itemsOfType('panel')) {
    const steps = solution(it);
    assert.equal(check({ actions: steps }, it).correct, true, `${it.id}: ${it.say}`);
    assert.equal(check({ actions: steps.slice(0, -1) }, it).correct, false, `${it.id}: right without the last touch`);
    const named = new Set(it.expect.flat().map((e) => e.c));
    for (const c of it.scene.controls.filter((x) => !named.has(x.id) && x.type !== 'light')) {
      const more = c.type === 'dial' ? { c: c.id, d: c.value < 9 ? 1 : -1 } : c.type === 'keypad' ? { c: c.id, k: '5' } : { c: c.id };
      assert.equal(check({ actions: [...steps, more] }, it).error, 'extra', `${it.id}: ${c.id} was not named`);
    }
    if (it.expect.length > 1) assert.equal(check({ actions: solutionReversed(it) }, it).error, 'order', `${it.id}: order must matter`);
  }
});
function solutionReversed(it) {
  return solution({ ...it, expect: it.expect.slice().reverse() });
}

test('art: every control draws as one clean svg', () => {
  const colours = Object.keys(PALETTE).filter((c) => c !== 'gray');
  const all = [
    ...colours.map((c) => buttonSVG(c)), ...colours.flatMap((c) => [switchSVG(c, 'up'), switchSVG(c, 'down')]),
    ...Array.from({ length: 10 }, (_, v) => dialSVG(v)), lightSVG('red'), lightSVG('green'), launchSVG(false), launchSVG(true), stepSVG(1), stepSVG(-1),
  ];
  for (const svg of all) {
    assert.ok(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ') && svg.endsWith('</svg>'));
    assert.ok(svg.includes('aria-hidden="true"') && svg.includes('class="pnl-art '));
    for (const bad of [' id=', '<defs', '<style', '<text', 'url(', '<use', 'Gradient', '<filter', '<clipPath', '<mask', '<image', 'href', 'NaN', 'undefined']) assert.ok(!svg.includes(bad), `must not contain ${bad}`);
    assert.equal(svg.match(/<svg/g).length, 1);
    assert.equal((svg.match(/<g[ >]/g) || []).length, (svg.match(/<\/g>/g) || []).length);
    assert.ok(svg.length < 3000, `stays compact (${svg.length})`);
  }
  assert.equal(new Set(all).size, all.length, 'every state looks different');
  for (const c of colours) {
    assert.ok(buttonSVG(c).includes(PALETTE[c].main) && switchSVG(c, 'up').includes(PALETTE[c].main));
    for (const o of colours.filter((x) => x !== c)) assert.ok(!buttonSVG(c).includes(PALETTE[o].main) && !switchSVG(c, 'down').includes(PALETTE[o].main));
  }
  assert.throws(() => buttonSVG('pink'));
  assert.throws(() => switchSVG('red', 'sideways'));
  assert.throws(() => dialSVG(10));
  assert.throws(() => lightSVG('blue'));
  assert.throws(() => stepSVG(0));
});
