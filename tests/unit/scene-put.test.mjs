// Unit tests of the "put" checker (src/listening/scenes/put.js) and of its art (src/art/put.js).
// The checker is pure: an item and an answer in, a verdict out.

import test from 'node:test';
import assert from 'node:assert/strict';
import put, { check, solution, CAPACITY } from '../../src/listening/scenes/put.js';
import { placeSVG, PLACE_KINDS, CONTAINER_KINDS, PLACE_BOX, TABLE_BOX } from '../../src/art/put.js';
import { PALETTE } from '../../src/art/sprites.js';
import { ERRORS } from '../../src/listening/insights.js';

// A shelf: a red key, a blue key, a red gem, a map and four coins that all look the same.
const objects = [
  { id: 'o1', kind: 'key', color: 'red', size: 'big' },
  { id: 'o2', kind: 'key', color: 'blue', size: 'big' },
  { id: 'o3', kind: 'gem', color: 'red', size: 'big' },
  { id: 'o4', kind: 'map', color: 'green', size: 'big' },
  { id: 'o5', kind: 'coin', color: 'yellow', size: 'big' },
  { id: 'o6', kind: 'coin', color: 'yellow', size: 'big' },
  { id: 'o7', kind: 'coin', color: 'yellow', size: 'big' },
  { id: 'o8', kind: 'coin', color: 'yellow', size: 'big' },
];
const places = [{ id: 'p1', kind: 'chest', prep: 'in' }, { id: 'p2', kind: 'bag', prep: 'in' }, { id: 'p3', kind: 'table', prep: 'on' }, { id: 'p4', kind: 'table', prep: 'under' }];
const COINS = ['o5', 'o6', 'o7', 'o8'];
const item = (moves, ordered = false) => ({ t: 'put', scene: { objects, places }, expect: ordered ? { moves, ordered: true } : { moves } });
const mv = (ids, to, n = ids.length) => ({ ids, n, to });

/** An answer made of moves in order; `null` as the place = taken out again. */
function did(...moves) {
  const where = {};
  for (const [id, to] of moves) {
    if (to) where[id] = to;
    else delete where[id];
  }
  return { moves, where };
}
const verdict = (it, ...moves) => check(did(...moves), it);
const wrong = (it, error, ...moves) => {
  const res = verdict(it, ...moves);
  assert.equal(res.correct, false);
  assert.equal(res.error, error);
  assert.ok(error in ERRORS, `${error} is not a known kind of slip`);
  return res;
};
const right = (it, ...moves) => {
  const res = verdict(it, ...moves);
  assert.deepEqual([res.correct, res.error, res.at], [true, '', -1]);
  return res;
};

test('one thing in one place', () => {
  const it = item([mv(['o1'], 'p1')]); // "Put the red key in the chest."
  const res = right(it, ['o1', 'p1']);
  assert.equal(res.total, 1);
  assert.equal(res.prefix, 1);
  wrong(it, 'no-response');
  wrong(it, 'place', ['o1', 'p2']);
  wrong(it, 'attribute', ['o2', 'p1']); // a key, but the blue one
  wrong(it, 'object', ['o3', 'p1']); // not a key at all
  wrong(it, 'extra', ['o1', 'p1'], ['o4', 'p1']); // the key and something nobody asked for
  wrong(it, 'extra', ['o1', 'p1'], ['o4', 'p2']);
});

test('an empty or missing answer is never right when there is something to do', () => {
  const it = item([mv(['o1'], 'p1')]);
  for (const answer of [null, undefined, {}, { moves: [], where: {} }, { moves: [['o1', 'p1'], ['o1', null]], where: {} }]) {
    const res = check(answer, it);
    assert.deepEqual([res.correct, res.error], [false, 'no-response']);
  }
});

test('several moves: every one is needed, in any order', () => {
  const it = item([mv(['o1'], 'p1'), mv(['o3'], 'p2')]); // "Put the red key in the chest and the red gem in the bag."
  right(it, ['o1', 'p1'], ['o3', 'p2']);
  right(it, ['o3', 'p2'], ['o1', 'p1']);
  const res = wrong(it, 'incomplete', ['o1', 'p1']);
  assert.deepEqual([res.prefix, res.total], [1, 2]);
  wrong(it, 'place', ['o1', 'p2'], ['o3', 'p1']); // swapped
  wrong(it, 'place', ['o1', 'p1'], ['o3', 'p4']);
  wrong(it, 'attribute', ['o2', 'p1'], ['o3', 'p2']);
  wrong(it, 'extra', ['o1', 'p1'], ['o3', 'p2'], ['o5', 'p2']);
});

test('only where things END counts: taking out and putting back is fine', () => {
  const it = item([mv(['o1'], 'p1'), mv(['o3'], 'p2')]);
  right(it, ['o2', 'p1'], ['o2', null], ['o1', 'p2'], ['o1', null], ['o1', 'p1'], ['o3', 'p2']);
});

test('counting: any of the look-alikes, but exactly that many', () => {
  const it = item([mv(COINS, 'p1', 3)]); // "Put three coins in the chest."
  right(it, ['o5', 'p1'], ['o6', 'p1'], ['o7', 'p1']);
  right(it, ['o8', 'p1'], ['o5', 'p1'], ['o7', 'p1']);
  assert.equal(verdict(it, ['o5', 'p1'], ['o6', 'p1'], ['o7', 'p1']).total, 3);
  wrong(it, 'count', ['o5', 'p1'], ['o6', 'p1']); // too few
  wrong(it, 'count', ['o5', 'p1'], ['o6', 'p1'], ['o7', 'p1'], ['o8', 'p1']); // too many
  wrong(it, 'place', ['o5', 'p1'], ['o6', 'p1'], ['o7', 'p2']);
  wrong(it, 'object', ['o1', 'p1']);
});

test('counting: the same things shared between two places', () => {
  const it = item([mv(COINS, 'p1', 2), mv(COINS, 'p2', 1)]); // "Put two coins in the chest and one in the bag."
  right(it, ['o5', 'p1'], ['o6', 'p1'], ['o7', 'p2']);
  right(it, ['o8', 'p2'], ['o7', 'p1'], ['o5', 'p1']);
  wrong(it, 'count', ['o5', 'p1'], ['o6', 'p2'], ['o7', 'p2']); // one and two instead of two and one
  wrong(it, 'incomplete', ['o5', 'p1'], ['o6', 'p1']); // forgot the second part
  wrong(it, 'count', ['o5', 'p1'], ['o6', 'p1'], ['o7', 'p2'], ['o8', 'p2']);
  wrong(it, 'place', ['o5', 'p1'], ['o6', 'p1'], ['o7', 'p3']);
  assert.deepEqual(solution(it), [['o5', 'p1'], ['o6', 'p1'], ['o7', 'p2']]);
});

test('"all but one" is a count too', () => {
  const it = item([mv(COINS, 'p2', 3)]);
  right(it, ['o6', 'p2'], ['o7', 'p2'], ['o8', 'p2']);
  wrong(it, 'count', ['o5', 'p2'], ['o6', 'p2'], ['o7', 'p2'], ['o8', 'p2']);
});

test('order matters only when the item says so', () => {
  const free = item([mv(['o1'], 'p1'), mv(['o4'], 'p2')]);
  const strict = item([mv(['o1'], 'p1'), mv(['o4'], 'p2')], true); // "Before you put the map in the bag, put the red key in the chest."
  right(free, ['o4', 'p2'], ['o1', 'p1']);
  right(strict, ['o1', 'p1'], ['o4', 'p2']);
  const res = wrong(strict, 'order', ['o4', 'p2'], ['o1', 'p1']);
  assert.equal(res.total, 2);
  // he notices, takes the map out and puts it in again after the key: now the order is right
  right(strict, ['o4', 'p2'], ['o1', 'p1'], ['o4', null], ['o4', 'p2']);
  // ...and the other way: right first, then he takes the key out and puts it back last
  wrong(strict, 'order', ['o1', 'p1'], ['o4', 'p2'], ['o1', null], ['o1', 'p1']);
  // a wrong ending is reported as what it is, not as an order slip
  wrong(strict, 'place', ['o4', 'p1'], ['o1', 'p2']);
  wrong(strict, 'incomplete', ['o4', 'p2']);
});

test('ordered groups: any order inside a step, steps in order', () => {
  // "After you put the red key and the map in the chest, put two coins on the table."
  const it = item([mv(['o1', 'o4'], 'p1'), mv(COINS, 'p3', 2)], true);
  right(it, ['o4', 'p1'], ['o1', 'p1'], ['o8', 'p3'], ['o5', 'p3']);
  right(it, ['o1', 'p1'], ['o4', 'p1'], ['o5', 'p3'], ['o6', 'p3']);
  wrong(it, 'order', ['o1', 'p1'], ['o5', 'p3'], ['o4', 'p1'], ['o6', 'p3']);
  wrong(it, 'order', ['o5', 'p3'], ['o6', 'p3'], ['o1', 'p1'], ['o4', 'p1']);
  // three steps
  const three = item([mv(['o1'], 'p1'), mv(['o3'], 'p4'), mv(['o4'], 'p1')], true);
  right(three, ['o1', 'p1'], ['o3', 'p4'], ['o4', 'p1']);
  wrong(three, 'order', ['o1', 'p1'], ['o4', 'p1'], ['o3', 'p4']);
  wrong(three, 'order', ['o3', 'p4'], ['o1', 'p1'], ['o4', 'p1']);
  // an ordered answer needs the list of moves: without it the order cannot be shown to be right
  assert.equal(check({ where: { o1: 'p1', o3: 'p4', o4: 'p1' } }, three).error, 'order');
});

test('"do nothing" items: only an untouched shelf is right', () => {
  const it = item([]);
  assert.equal(put.isNone(it), true);
  assert.equal(put.isNone(item([mv(['o1'], 'p1')])), false);
  const res = check({ moves: [], where: {} }, it);
  assert.deepEqual([res.correct, res.error, res.total], [true, '', 0]);
  assert.equal(check(null, it).correct, true); // the hand: nothing was done
  wrong(it, 'false-alarm', ['o1', 'p1']);
  right(it, ['o1', 'p1'], ['o1', null]); // he changed his mind and put it back
  assert.deepEqual(solution(it), []);
});

test('the model answer is always accepted, and uses each thing once', () => {
  const tricky = [
    item([mv(['o1', 'o3'], 'p1'), mv(COINS, 'p1', 2)]),
    item([mv(COINS, 'p1', 2), mv(COINS, 'p4', 2)], true),
    item([mv(['o2'], 'p4'), mv(COINS, 'p3', 3), mv(['o4'], 'p4')], true),
  ];
  for (const it of tricky) {
    const steps = solution(it);
    assert.equal(new Set(steps.map(([id]) => id)).size, steps.length);
    assert.equal(steps.length, it.expect.moves.reduce((n, m) => n + m.n, 0));
    assert.equal(check(did(...steps), it).correct, true);
  }
});

test('every verdict has the fields the mission screen reads', () => {
  const it = item([mv(['o1'], 'p1'), mv(COINS, 'p2', 2)]);
  for (const moves of [[], [['o1', 'p1']], [['o1', 'p1'], ['o5', 'p2'], ['o6', 'p2']], [['o2', 'p3']], [['o1', 'p2']]]) {
    const res = check(did(...moves), it);
    assert.deepEqual(Object.keys(res).sort(), ['at', 'correct', 'error', 'prefix', 'total']);
    assert.equal(res.total, 3);
    assert.ok(res.correct ? res.error === '' : res.error in ERRORS);
    assert.ok(res.prefix >= 0 && res.prefix <= res.total);
  }
});

test('places hold enough for what a sentence may ask', () => {
  assert.deepEqual(Object.keys(CAPACITY).sort(), ['in', 'on', 'under']);
  for (const n of Object.values(CAPACITY)) assert.ok(n >= 3);
});

// ---- art --------------------------------------------------------------------------------
const FORBIDDEN = [' id=', '<defs', '<style', '<text', 'url(', '<use', 'Gradient', '<filter', '<clipPath', '<mask', '<image', 'href', 'NaN', 'undefined'];
function checkSVG(svg, box) {
  assert.ok(svg.startsWith('<svg') && svg.endsWith('</svg>'));
  assert.ok(svg.includes('xmlns="http://www.w3.org/2000/svg"') && svg.includes('aria-hidden="true"'));
  assert.ok(svg.includes(`viewBox="0 0 ${box.w} ${box.h}"`));
  assert.ok(!/\s(width|height)=/.test(svg.slice(0, svg.indexOf('>') + 1)), 'no width/height on the root');
  for (const bad of FORBIDDEN) assert.ok(!svg.includes(bad), `must not contain ${bad}`);
  assert.equal(svg.match(/<svg/g).length, 1);
  assert.doesNotMatch(svg, /\d\.\d{3,}/, 'numbers stay short');
}

test('every place is drawn, in two layers, and no two look the same', () => {
  assert.deepEqual(PLACE_KINDS, [...CONTAINER_KINDS, 'table']);
  const seen = new Set();
  for (const kind of CONTAINER_KINDS) {
    for (const layer of ['back', 'front']) {
      const svg = placeSVG(kind, layer);
      checkSVG(svg, PLACE_BOX);
      assert.ok(svg.includes(`class="put-art put-art-${kind} put-art-${layer}"`));
      seen.add(svg);
    }
    assert.equal(placeSVG(kind), placeSVG(kind, 'front'));
  }
  const table = placeSVG('table');
  checkSVG(table, TABLE_BOX);
  seen.add(table);
  assert.equal(seen.size, CONTAINER_KINDS.length * 2 + 1);
  assert.ok(PLACE_BOX.floor > 0 && PLACE_BOX.floor < PLACE_BOX.h);
  assert.ok(TABLE_BOX.under.x + TABLE_BOX.under.w <= TABLE_BOX.w && TABLE_BOX.under.y + TABLE_BOX.under.h <= TABLE_BOX.h);
});

test('places never use a play colour (so "everything red" can never mean the place)', () => {
  const play = Object.entries(PALETTE).filter(([name]) => name !== 'gray').flatMap(([, tones]) => Object.values(tones));
  for (const kind of PLACE_KINDS) {
    for (const layer of ['back', 'front']) {
      const svg = placeSVG(kind, layer);
      for (const tone of play) assert.ok(!svg.includes(tone), `${kind} uses the play colour ${tone}`);
    }
  }
});

test('unknown places and layers throw', () => {
  assert.throws(() => placeSVG('fridge'), Error);
  assert.throws(() => placeSVG('toString'), Error);
  assert.throws(() => placeSVG('chest', 'middle'), Error);
});
