// Unit tests for the "build" activity (the Robot Workshop): the checker, and the art it is drawn with.
import test from 'node:test';
import assert from 'node:assert/strict';
import build from '../../src/listening/scenes/build.js';
import rules from '../../tools/content/types/build.mjs';
import { BUILD_PARTS, BUILD_ORDER, robotSVG, partSVG } from '../../src/art/build.js';
import { ERRORS } from '../../src/listening/insights.js';
import { PALETTE } from '../../src/art/sprites.js';
import { makeRng } from '../../src/core/rng.js';

const item = {
  t: 'build',
  say: 'Give the robot three eyes, a red body, the longest arms and the bigger wheels.',
  scene: {
    base: { head: 'round' },
    rows: [
      { part: 'eyes', options: [2, 3, 1] },
      { part: 'body', options: ['blue', 'red', 'green'] },
      { part: 'arms', options: ['short', 'long', 'mid'] },
      { part: 'bottom', options: ['wheels-small', 'legs-long', 'wheels-big', 'legs-short'] },
    ],
  },
  expect: { eyes: 3, body: 'red', arms: 'long', bottom: 'wheels-big' },
  s: ['build', 'steps4', 'compare'],
  v: 'build-size',
};
const right = { ...item.expect };
const check = (answer) => build.check(answer, item);

test('the right robot is accepted, whatever order the parts were chosen in', () => {
  assert.deepEqual(check(right), { correct: true, error: '', at: -1, prefix: 4, total: 4 });
  assert.equal(check({ bottom: 'wheels-big', arms: 'long', body: 'red', eyes: 3 }).correct, true);
});

test('an empty answer is never right (the hand, or Done with nothing chosen)', () => {
  for (const nothing of [{}, null, undefined, [], '']) {
    const res = check(nothing);
    assert.equal(res.correct, false);
    assert.equal(res.error, 'no-response');
    assert.equal(res.total, 4);
    assert.equal(res.prefix, 0);
  }
  assert.equal(build.isNone(item), false);
});

test('a row left empty makes the robot incomplete', () => {
  const { arms, ...rest } = right;
  assert.deepEqual(check(rest), { correct: false, error: 'incomplete', at: 2, prefix: 3, total: 4 });
  assert.deepEqual(check({ eyes: 3 }), { correct: false, error: 'incomplete', at: 1, prefix: 1, total: 4 });
});

test('every row must be right, and the slip is named after the first wrong row', () => {
  assert.deepEqual(check({ ...right, eyes: 2 }), { correct: false, error: 'count', at: 0, prefix: 3, total: 4 });
  assert.deepEqual(check({ ...right, body: 'blue' }), { correct: false, error: 'value', at: 1, prefix: 3, total: 4 });
  assert.equal(check({ ...right, arms: 'short' }).error, 'attribute'); // arms, but the wrong length
  assert.equal(check({ ...right, bottom: 'wheels-small' }).error, 'attribute'); // wheels, but the wrong size
  assert.equal(check({ ...right, bottom: 'legs-long' }).error, 'object'); // not wheels at all
  // a wrong row counts even when other rows are still empty
  assert.deepEqual(check({ body: 'green' }), { correct: false, error: 'value', at: 1, prefix: 0, total: 4 });
  // two wrong rows: the first one (from the top) is reported
  assert.deepEqual(check({ ...right, eyes: 1, bottom: 'legs-short' }), { correct: false, error: 'count', at: 0, prefix: 2, total: 4 });
});

test('claws for arms (and the other way round) is a different thing, not a missed detail', () => {
  const claws = { ...item, scene: { rows: [{ part: 'head', options: ['round', 'square', 'pointy'] }, { part: 'arms', options: ['short', 'long', 'claws'] }] }, expect: { head: 'round', arms: 'claws' } };
  assert.equal(build.check({ head: 'round', arms: 'long' }, claws).error, 'object');
  assert.equal(build.check({ head: 'square', arms: 'claws' }, claws).error, 'object');
  assert.equal(build.check({ head: 'round', arms: 'claws' }, claws).correct, true);
});

test('values are compared exactly: the number 3 is not the text "3", extra keys do not help', () => {
  assert.equal(check({ ...right, eyes: '3' }).correct, false);
  assert.equal(check({ ...right, nose: 'red' }).correct, true); // a part without a row is ignored
  assert.equal(check({ nose: 'red' }).error, 'no-response');
});

test('every error the checker can give is one the parent view knows', () => {
  const answers = [{}, { eyes: 3 }, { ...right, eyes: 1 }, { ...right, body: 'green' }, { ...right, arms: 'mid' }, { ...right, bottom: 'legs-short' }];
  for (const a of answers) assert.ok(check(a).error in ERRORS, `unknown error key ${check(a).error}`);
});

// ---- the content rules (finish / validate) ------------------------------------------------

const fail = (why) => { throw new Error(why); };
const draft = () => ({
  t: 'build', say: 'Give the robot a round head and two eyes.', s: ['build', 'steps2', 'detail'], v: 'build-list',
  rows: [{ part: 'eyes', options: [1, 2, 3] }, { part: 'head', options: ['round', 'square', 'pointy'] }],
  expect: { head: 'round', eyes: 2 },
});

test('finish: rows in body order, options shuffled but complete, the unnamed parts dressed', () => {
  const done = rules.finish(makeRng('x'), draft());
  assert.equal(done.t, 'build');
  assert.deepEqual(done.scene.rows.map((r) => r.part), ['head', 'eyes']);
  assert.deepEqual([...done.scene.rows[0].options].sort(), ['pointy', 'round', 'square']);
  assert.deepEqual([...done.scene.rows[1].options].sort(), [1, 2, 3]);
  assert.deepEqual(Object.keys(done.scene.base).sort(), ['arms', 'bottom']); // the head has its own row
  assert.deepEqual(done.expect, { head: 'round', eyes: 2 });
  rules.validate(done, { fail });
  // a fixed row keeps the order the sentence counts in ("the second head")
  const d = draft();
  d.rows[1] = { part: 'head', options: ['pointy', 'round', 'square'], fixed: true };
  for (const seed of ['a', 'b', 'c', 'd']) assert.deepEqual(rules.finish(makeRng(seed), d).scene.rows[0], { part: 'head', options: ['pointy', 'round', 'square'] });
  assert.equal(rules.isNone(done), false);
});

test('validate refuses malformed items', () => {
  const good = () => rules.finish(makeRng('y'), draft());
  const bad = (change, why) => {
    const it = good();
    change(it);
    assert.throws(() => rules.validate(it, { fail }), why);
  };
  rules.validate(good(), { fail });
  bad((it) => { it.scene.rows.pop(); delete it.expect.eyes; }, /2 to 5 rows/);
  bad((it) => { it.scene.rows.reverse(); }, /body order/);
  bad((it) => { it.scene.rows[1].options = [1, 2]; }, /3 or 4 options/);
  bad((it) => { it.scene.rows[1].options = [1, 2, 2]; }, /repeats/);
  bad((it) => { it.scene.rows[0].options = ['round', 'square', 'oval']; }, /unknown head option/);
  bad((it) => { it.scene.rows[1].part = 'ears'; }, /unknown robot part/);
  bad((it) => { it.expect.eyes = 4; }, /not one of its options/);
  bad((it) => { it.expect.nose = 'red'; }, /exactly one value for every row/);
  bad((it) => { it.scene.base.head = 'round'; }, /has its own row/);
  bad((it) => { it.scene.base.arms = 'wings'; }, /bad base/);
  bad((it) => { it.auto = true; }, /green check mark/);
});

// ---- the art -------------------------------------------------------------------------------

const FORBIDDEN = [' id=', '<defs', '<style', '<text', 'url(', '<use', 'Gradient', '<filter', '<clipPath', '<mask', '<image', 'href', 'NaN', 'undefined', 'null', 'Infinity'];
function checkSVG(svg, viewBox) {
  assert.ok(svg.startsWith('<svg') && svg.endsWith('</svg>'));
  assert.ok(svg.includes('xmlns="http://www.w3.org/2000/svg"') && svg.includes(`viewBox="${viewBox}"`) && svg.includes('aria-hidden="true"'));
  for (const b of FORBIDDEN) assert.ok(!svg.includes(b), `must not contain ${b}`);
  assert.equal(svg.match(/<svg/g).length, 1);
  assert.equal((svg.match(/<g[ >]/g) || []).length, (svg.match(/<\/g>/g) || []).length, 'balanced groups');
}

test('the vocabulary: eight parts, in body order', () => {
  assert.deepEqual(BUILD_ORDER, ['antennas', 'head', 'eyes', 'nose', 'body', 'buttons', 'arms', 'bottom']);
  assert.deepEqual(BUILD_PARTS.body, Object.keys(PALETTE).filter((c) => c !== 'gray'));
  assert.deepEqual(BUILD_PARTS.nose, BUILD_PARTS.body);
});

test('every option has its own picture', () => {
  for (const [part, values] of Object.entries(BUILD_PARTS)) {
    const seen = new Set();
    for (const v of values) {
      const svg = partSVG(part, v);
      checkSVG(svg, '0 0 100 100');
      assert.ok(svg.length < 5000, `${part} ${v} stays compact (${svg.length})`);
      seen.add(svg);
    }
    assert.equal(seen.size, values.length, `${part}: two options look the same`);
  }
  for (const c of BUILD_PARTS.body) {
    assert.ok(partSVG('body', c).includes(PALETTE[c].main) && partSVG('nose', c).includes(PALETTE[c].main));
    for (const other of BUILD_PARTS.body) if (other !== c) assert.ok(!partSVG('body', c).includes(PALETTE[other].main) && !partSVG('nose', c).includes(PALETTE[other].main));
  }
  assert.throws(() => partSVG('head', 'oval'), Error);
  assert.throws(() => partSVG('ears', 'big'), Error);
  assert.throws(() => partSVG('eyes', '3'), Error);
  assert.throws(() => partSVG('constructor', 1), Error);
});

test('the robot renders with any mixture of parts, and every choice changes the picture', () => {
  checkSVG(robotSVG(), '0 0 240 358'); // nothing chosen yet: dashed outlines
  const base = { head: 'square', body: 'gray', arms: 'short', bottom: 'legs', eyes: 2 };
  checkSVG(robotSVG(base), '0 0 240 358');
  for (const [part, values] of Object.entries(BUILD_PARTS)) {
    const seen = new Set([robotSVG({ ...base, [part]: undefined })]);
    for (const v of values) {
      for (const head of BUILD_PARTS.head) checkSVG(robotSVG({ ...base, head, [part]: v }), '0 0 240 358');
      seen.add(robotSVG({ ...base, [part]: v }));
    }
    const distinct = part === 'antennas' ? values.length : values.length + 1; // no antennas = none chosen yet
    assert.equal(seen.size, distinct, `${part}: every option must change the robot`);
  }
  assert.throws(() => robotSVG({ head: 'oval' }), Error);
  assert.throws(() => robotSVG({ body: 'pink' }), Error);
  assert.throws(() => robotSVG({ tail: 'long' }), Error);
});
