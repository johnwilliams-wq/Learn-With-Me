// The "route" checker (src/listening/scenes/route.js): is the path he drove the one that was asked for?

import test from 'node:test';
import assert from 'node:assert/strict';
import route, { check, solve } from '../../src/listening/scenes/route.js';
import { landmarkSVG, roverSVG, arrowSVG, LANDMARK_KINDS } from '../../src/art/route.js';
import { ERRORS } from '../../src/listening/insights.js';
import types from '../../tools/content/types/route.mjs';

const STEP = { u: [0, -1], d: [0, 1], l: [-1, 0], r: [1, 0] };
/** drive('rru', start) -> the squares driven onto */
function drive(moves, start) {
  let at = start;
  return [...moves].map((m) => (at = [at[0] + STEP[m][0], at[1] + STEP[m][1]]));
}

// A 6 x 5 map. S = start [0, 2]. tree [3, 2], pond [5, 2], cave [3, 0], rock [1, 4], red flag [5, 4], blue flag [0, 0];
// a key at [1, 2] and a coin at [2, 1].
const scene = {
  cols: 6, rows: 5, start: [0, 2],
  marks: [
    { id: 'm1', kind: 'tree', at: [3, 2] }, { id: 'm2', kind: 'pond', at: [5, 2] }, { id: 'm3', kind: 'cave', at: [3, 0] },
    { id: 'm4', kind: 'rock', at: [1, 4] }, { id: 'm5', kind: 'flag', color: 'red', at: [5, 4] }, { id: 'm6', kind: 'flag', color: 'blue', at: [0, 0] },
  ],
  loot: [{ id: 'p1', kind: 'key', color: 'yellow', at: [1, 2] }, { id: 'p2', kind: 'coin', color: 'red', at: [2, 1] }],
};
const places = (expect) => ({ t: 'route', scene, expect: { via: [], need: [], avoid: [], ...expect } });
const counted = (moves) => ({ t: 'route', scene: { cols: 6, rows: 5, start: [2, 3], marks: [] }, expect: { path: drive(moves, [2, 3]) } });
const mark = (item, moves) => check(drive(moves, item.scene.start), item);
const right = (res) => { assert.equal(res.correct, true, JSON.stringify(res)); assert.equal(res.error, ''); };
const wrong = (res, error) => { assert.equal(res.correct, false, JSON.stringify(res)); assert.equal(res.error, error); assert.ok(error in ERRORS, error); };

test('counted routes: only the exact path is right', () => {
  const item = counted('uurrr'); // "Go up two, then right three."
  right(mark(item, 'uurrr'));
  assert.equal(mark(item, 'uurrr').total, 5);
  assert.equal(mark(item, 'uurrr').prefix, 5);
  wrong(mark(item, 'uurr'), 'count'); // one square short on the last part
  wrong(mark(item, 'uuurrr'), 'count'); // one too many on the first part
  wrong(mark(item, 'urrr'), 'count');
  wrong(mark(item, 'uu'), 'incomplete'); // stopped after the first part
  wrong(mark(item, 'u'), 'incomplete');
  wrong(mark(item, 'uurrrd'), 'extra'); // the whole route, and then more
  wrong(mark(item, 'rrruu'), 'order'); // the right parts in the wrong order
  wrong(mark(item, 'uulll'), 'path'); // turned the wrong way
  wrong(mark(item, 'ddrrr'), 'path');
  wrong(mark(item, 'l'), 'path');
  assert.equal(mark(item, 'uurr').at, 4);
  assert.equal(mark(item, 'uulll').at, 2);
  assert.equal(mark(item, 'uulll').prefix, 2);
  // the same squares reached another way are not the route that was said
  wrong(check([[2, 2], [2, 1], [3, 1], [4, 1], [5, 1]].reverse(), item), 'path');
});

test('counted routes: a one-move route', () => {
  const item = counted('l');
  right(mark(item, 'l'));
  wrong(mark(item, 'll'), 'count');
  wrong(mark(item, 'r'), 'path');
  wrong(mark(item, 'lu'), 'extra');
});

test('an empty answer is never right', () => {
  wrong(check([], counted('uu')), 'no-response');
  wrong(check([], places({ end: [3, 2] })), 'no-response');
  wrong(check(null, places({ end: [3, 2] })), 'no-response');
  assert.equal(check([], counted('uu')).total, 2);
  assert.equal(route.isNone(counted('uu')), false);
  assert.equal(types.isNone(counted('uu')), false);
});

test('go to a place: any way there is right, as long as he stops on it', () => {
  const item = places({ end: [3, 0] }); // "Go to the cave."
  right(mark(item, 'uurrr'));
  right(mark(item, 'rrruu'));
  right(mark(item, 'ddrrruuuu')); // a long way round
  right(mark(item, 'uurrrrl')); // past it and back
  assert.equal(mark(item, 'uurrr').total, 0); // no dots: the number of moves is up to him
  wrong(mark(item, 'uurrrr'), 'extra'); // reached it, then drove on
  wrong(mark(item, 'rrr'), 'object'); // stopped on the tree
  wrong(mark(item, 'uurr'), 'incomplete'); // stopped on an empty square
  const flag = places({ end: [5, 4] }); // "Go to the red flag."
  wrong(mark(flag, 'uu'), 'attribute'); // the blue flag: right kind of thing, wrong colour
  wrong(mark(flag, 'rrr'), 'object');
  right(mark(flag, 'ddrrrrr'));
});

test('stops in order', () => {
  const item = places({ via: [[3, 2]], end: [3, 0] }); // "Go to the tree, then to the cave."
  right(mark(item, 'rrruu'));
  right(mark(item, 'uurrrdduu')); // past the cave first, but then to the tree and back to the cave
  wrong(mark(item, 'uurrr'), 'incomplete'); // straight to the cave
  wrong(mark(item, 'uurrrdd'), 'order'); // both, the wrong way round
  wrong(mark(item, 'rrr'), 'incomplete'); // stopped at the first stop
  wrong(mark(item, 'rrrrr'), 'object'); // the tree, then on to the pond
  const three = places({ via: [[3, 2], [5, 2]], end: [3, 0] }); // tree, pond, cave
  right(mark(three, 'rrrrruull'));
  wrong(mark(three, 'rrruu'), 'incomplete');
  wrong(mark(three, 'uurrrrrddlluu'), 'order'); // (cave) pond, tree, cave
  assert.equal(mark(three, 'rrruu').prefix, 1);
  assert.equal(mark(three, 'rrrrruull').prefix, 3);
});

test('things to drive over, in any order', () => {
  const item = places({ end: [3, 2], need: [[1, 2], [2, 1]] }); // tree; pick up the key and the coin
  right(mark(item, 'rurdr'));
  right(mark(item, 'urrdllrrr'));
  wrong(mark(item, 'rrr'), 'incomplete'); // the key only
  wrong(mark(item, 'ddrrruu'), 'incomplete'); // neither
  wrong(mark(item, 'ru'), 'incomplete'); // stopped before the end
});

test('squares to keep off', () => {
  const noTree = places({ end: [5, 2], avoid: [[3, 2]] }); // "Go to the pond. Do not touch the tree."
  right(mark(noTree, 'rrurrdr'));
  wrong(mark(noTree, 'rrrrr'), 'path'); // straight through the tree
  wrong(mark(noTree, 'rrrrrlr'), 'path');
  const onlyKey = places({ end: [3, 2], need: [[1, 2]], avoid: [[2, 1]] }); // "pick up only the key"
  right(mark(onlyKey, 'rrr'));
  wrong(mark(onlyKey, 'rurdr'), 'extra'); // picked up the coin as well
  wrong(mark(onlyKey, 'drrru'), 'incomplete'); // left the key behind
  const neither = places({ end: [3, 0], avoid: [[3, 2], [2, 1]] });
  right(mark(neither, 'uurrr'));
  wrong(mark(neither, 'rrruu'), 'path'); // through the tree
  wrong(mark(neither, 'rruur'), 'extra'); // over the coin
});

test('every error is one the parent view knows', () => {
  const item = places({ via: [[3, 2]], end: [3, 0], need: [[1, 2]], avoid: [[2, 1]] });
  for (const moves of ['r', 'rr', 'rrr', 'rrruu', 'uurrr', 'ururr', 'dd', 'rrrrr', 'uurrrdd', 'rrruur', 'drrruuu']) {
    const res = mark(item, moves);
    assert.ok(res.correct ? res.error === '' : res.error in ERRORS, `${moves}: ${res.error}`);
    assert.ok(Number.isInteger(res.at) && Number.isInteger(res.prefix) && Number.isInteger(res.total));
  }
});

test('the demo path is always a right answer, and a tidy one', () => {
  right(check(solve(counted('uurrr')), counted('uurrr')));
  assert.deepEqual(solve(counted('uurrr')), drive('uurrr', [2, 3]));
  const cases = [
    places({ end: [3, 0] }),
    places({ via: [[3, 2]], end: [3, 0] }),
    places({ via: [[3, 2], [5, 2]], end: [3, 0] }),
    places({ end: [5, 2], avoid: [[3, 2]] }),
    places({ end: [3, 2], need: [[1, 2]], avoid: [[2, 1]] }),
    places({ end: [3, 2], need: [[1, 2], [2, 1]] }),
    places({ via: [[3, 0]], end: [5, 4], need: [[2, 1]], avoid: [[3, 2], [1, 2]] }),
  ];
  for (const item of cases) {
    const path = solve(item);
    assert.ok(path.length > 0, JSON.stringify(item.expect));
    right(check(path, item));
    let at = scene.start;
    for (const p of path) {
      assert.equal(Math.abs(p[0] - at[0]) + Math.abs(p[1] - at[1]), 1, 'one square at a time');
      at = p;
    }
  }
  assert.equal(solve(places({ end: [3, 0] })).length, 5); // the shortest way
  // it goes round a landmark that has nothing to do with the instruction when that costs nothing
  const round = solve(places({ end: [5, 2] }));
  assert.ok(!round.some((p) => p[0] === 3 && p[1] === 2), 'the demo should not drive over the tree on its way to the pond');
  // a place that cannot be reached has no demo
  const boxed = { t: 'route', scene: { cols: 5, rows: 4, start: [0, 0], marks: [] }, expect: { end: [2, 2], via: [], need: [], avoid: [[1, 0], [0, 1]] } };
  assert.deepEqual(solve(boxed), []);
});

test('the content rules accept a good item and reject broken ones', () => {
  const tools = { fail: (why) => { throw new Error(why); }, COLOURS: new Set(['red', 'blue', 'green', 'yellow', 'purple', 'orange']) };
  const good = { say: 'Go to the cave.', ...places({ end: [3, 0] }) };
  types.validate(good, tools);
  types.validate({ say: 'x', ...counted('uurrr') }, tools);
  const bad = (change, why) => {
    const item = structuredClone(good);
    change(item);
    assert.throws(() => types.validate(item, tools), why);
  };
  bad((it) => { it.expect.end = [4, 4]; }, /landmark/); // nothing there
  bad((it) => { it.expect.end = [9, 9]; }, /landmark/);
  bad((it) => { it.scene.marks[1].at = [3, 2]; }, /two things/);
  bad((it) => { it.scene.marks[1].kind = 'tree'; }, /look the same/);
  bad((it) => { it.scene.marks[0].kind = 'banana'; }, /unknown landmark/);
  bad((it) => { it.scene.marks[0].at = [0, 2]; }, /two things/); // on the start square
  bad((it) => { it.auto = true; }, /check mark/);
  bad((it) => { delete it.expect.avoid; }, /expect/);
  bad((it) => { it.expect.avoid = [[3, 0]]; }, /twice/);
  bad((it) => { it.scene.start = [0, 0]; it.scene.marks[5].at = [5, 0]; it.expect.avoid = [[1, 2], [2, 1]]; it.scene.loot[0].at = [1, 0]; it.scene.loot[1].at = [0, 1]; it.expect.avoid = [[1, 0], [0, 1]]; }, /a way to do it/);
  const off = { say: 'x', ...counted('uuuu') };
  assert.throws(() => types.validate(off, tools), /jumps or leaves/);
  const loop = { say: 'x', t: 'route', scene: { cols: 6, rows: 5, start: [2, 3], marks: [] }, expect: { path: drive('urdl', [2, 3]) } };
  assert.throws(() => types.validate(loop, tools), /cross itself/);
});

test('the art: every landmark, the rover and the arrows are clean inline SVG', () => {
  const FORBIDDEN = [' id=', '<defs', '<style', '<text', 'url(', '<use', 'Gradient', '<filter', '<clipPath', '<mask', '<image', 'href', 'NaN', 'undefined'];
  const all = [...LANDMARK_KINDS.map((k) => landmarkSVG(k)), roverSVG(), ...['up', 'down', 'left', 'right'].map(arrowSVG)];
  assert.deepEqual(LANDMARK_KINDS, ['tree', 'cave', 'tower', 'pond', 'rock', 'house', 'bridge', 'tent']);
  assert.equal(new Set(all).size, all.length, 'every picture is different');
  for (const svg of all) {
    assert.ok(svg.startsWith('<svg') && svg.endsWith('</svg>') && svg.includes('viewBox="0 0 100 100"') && svg.includes('aria-hidden="true"'));
    for (const bad of FORBIDDEN) assert.ok(!svg.includes(bad), `must not contain ${bad}`);
    assert.equal(svg.match(/<svg/g).length, 1);
    assert.ok(svg.length < 4000);
  }
  assert.ok(arrowSVG('up').includes('currentColor') && !/#[0-9a-f]{6}/i.test(arrowSVG('up')));
  assert.throws(() => landmarkSVG('banana'), Error);
  assert.throws(() => landmarkSVG('constructor'), Error);
  assert.throws(() => arrowSVG('north'), Error);
});
