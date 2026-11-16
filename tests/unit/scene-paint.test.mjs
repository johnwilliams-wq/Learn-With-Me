// Unit tests for the Paint Shop: the checker (src/listening/scenes/paint.js), the content
// rules (tools/content/types/paint.mjs) and the art (src/art/paint.js).

import test from 'node:test';
import assert from 'node:assert/strict';
import scene, { check } from '../../src/listening/scenes/paint.js';
import type from '../../tools/content/types/paint.mjs';
import { potSVG, brushSVG, washSVG } from '../../src/art/paint.js';
import { PALETTE } from '../../src/art/sprites.js';
import { ERRORS } from '../../src/listening/insights.js';
import { makeRng } from '../../src/core/rng.js';

const COLORS = ['red', 'blue', 'green', 'yellow', 'purple', 'orange'];
const thing = (id, kind, size = 'big') => ({ id, kind, color: 'gray', size });
// a big and a small star, a big and a small key, a bell
const item = (expect) => ({
  t: 'paint',
  scene: { cols: 5, paints: ['red', 'blue', 'green', 'yellow'], objects: [thing('o1', 'star'), thing('o2', 'star', 'small'), thing('o3', 'key'), thing('o4', 'key', 'small'), thing('o5', 'bell')] },
  expect,
});

test('the plug-in has the shape the mission screen expects', () => {
  assert.equal(typeof scene.create, 'function');
  assert.equal(scene.check, check);
  assert.equal(scene.isNone(item({ o1: 'red' })), false);
});

test('right: every thing has exactly the colour that was asked for, whatever order he painted in', () => {
  const it = item({ o1: 'red', o4: 'blue' });
  assert.deepEqual(check({ o1: 'red', o4: 'blue' }, it), { correct: true, error: '', at: -1, prefix: 2, total: 2 });
  assert.equal(check({ o4: 'blue', o1: 'red' }, it).correct, true);
  assert.equal(check({ o1: 'red' }, item({ o1: 'red' })).correct, true);
});

test('nothing painted is never right', () => {
  for (const empty of [{}, null, undefined, [], '']) {
    const res = check(empty, item({ o1: 'red' }));
    assert.equal(res.correct, false);
    assert.equal(res.error, 'no-response');
    assert.equal(res.prefix, 0);
  }
  assert.equal(check({ o1: null }, item({ o1: 'red' })).error, 'no-response'); // (a washed thing is not painted)
});

test('a wrong colour on the right thing is a "value" slip', () => {
  const it = item({ o1: 'red', o4: 'blue' });
  assert.equal(check({ o1: 'green', o4: 'blue' }, it).error, 'value');
  assert.equal(check({ o1: 'blue', o4: 'red' }, it).error, 'value'); // the two colours swapped
  assert.equal(check({ o1: 'green', o4: 'blue' }, it).prefix, 1);
  assert.equal(check({ o1: 'green' }, item({ o1: 'red' })).error, 'value');
});

test('stopping early is "incomplete"; painting more than was asked is "extra"', () => {
  const it = item({ o1: 'red', o4: 'blue' });
  const part = check({ o1: 'red' }, it);
  assert.deepEqual([part.correct, part.error, part.prefix, part.total], [false, 'incomplete', 1, 2]);
  const more = check({ o1: 'red', o4: 'blue', o5: 'blue' }, it);
  assert.deepEqual([more.correct, more.error, more.prefix], [false, 'extra', 2]);
  // "all the stars red except the small one": painting the small one too is doing more than was asked
  assert.equal(check({ o1: 'red', o2: 'red' }, item({ o1: 'red' })).error, 'extra');
});

test('the look-alike instead of the right thing is "attribute"; a different thing is "object"', () => {
  assert.equal(check({ o2: 'red' }, item({ o1: 'red' })).error, 'attribute'); // the small star for the big star
  assert.equal(check({ o1: 'red', o3: 'blue' }, item({ o1: 'red', o4: 'blue' })).error, 'attribute'); // the big key for the small key
  assert.equal(check({ o5: 'red' }, item({ o1: 'red' })).error, 'object'); // the bell for the star
  assert.equal(check({ o1: 'red', o5: 'blue' }, item({ o1: 'red', o4: 'blue' })).error, 'object');
});

test('every thing that was not mentioned must stay unpainted', () => {
  const it = item({ o1: 'red', o2: 'red' });
  for (const id of ['o3', 'o4', 'o5']) {
    for (const c of ['red', 'blue']) assert.equal(check({ o1: 'red', o2: 'red', [id]: c }, it).correct, false);
  }
});

test('error names are ones the parent view knows, and total feeds the helper dots', () => {
  const it = item({ o1: 'red', o4: 'blue' });
  for (const answer of [{}, { o1: 'red' }, { o1: 'blue', o4: 'blue' }, { o5: 'red' }, { o2: 'red' }, { o1: 'red', o4: 'blue', o5: 'green' }]) {
    const res = check(answer, it);
    assert.equal(res.correct, false);
    assert.ok(res.error in ERRORS, res.error);
    assert.equal(res.total, 2);
    assert.equal(res.at, 0);
  }
  assert.equal(check({ o1: 'red' }, item({ o1: 'red' })).total, 1);
  const many = Object.fromEntries(Array.from({ length: 9 }, (_, i) => [`o${i + 1}`, 'red']));
  assert.equal(check(many, { scene: { objects: [], paints: ['red'] }, expect: many }).total, 0); // too many to show as dots
});

// ---- content rules ---------------------------------------------------------------------------

const star = { kind: 'star', size: 'big' };
const key = { kind: 'key', size: 'small' };
const bell = { kind: 'bell' };
const base = { t: 'paint', say: 'Paint the star red.', objects: [star, key, bell], s: ['paint'], v: 'one' };
const tools = {
  fail: (why) => { throw new Error(why); },
  COLOURS: new Set(COLORS),
  checkObjects(objects, { min = 1, max = 12 } = {}) { if (objects.length < min || objects.length > max) throw new Error('object count'); },
};

test('finish: things start gray, jobs are done in order, and the shelf has what is needed plus a spare', () => {
  for (let seed = 0; seed < 40; seed++) {
    const out = type.finish(makeRng(seed), { ...base, jobs: [[[star, key], 'red'], [key, 'blue']], pots: 2 });
    assert.equal(out.t, 'paint');
    assert.equal(out.scene.objects.length, 3);
    assert.ok(out.scene.objects.every((o) => o.color === 'gray'));
    const id = (kind) => out.scene.objects.find((o) => o.kind === kind).id;
    assert.deepEqual(out.expect, Object.fromEntries(out.scene.objects.filter((o) => o.kind !== 'bell').map((o) => [o.id, o.kind === 'star' ? 'red' : 'blue'])));
    assert.equal(out.expect[id('bell')], undefined);
    assert.ok(out.scene.paints.includes('red') && out.scene.paints.includes('blue'));
    assert.equal(out.scene.paints.length, 3, 'two needed and one spare');
    assert.deepEqual(out.scene.paints, COLORS.filter((c) => out.scene.paints.includes(c)), 'pots always stand in the same order');
    assert.equal(out.scene.objects.find((o) => o.kind === 'bell').size, 'big');
    type.validate(out, tools);
  }
  assert.equal(type.finish(makeRng(1), { ...base, jobs: [[star, 'red']] }).scene.paints.length, 6);
});

test('finish: a colour of null washes a thing clean; keepOrder keeps a row as written', () => {
  const out = type.finish(makeRng(3), { ...base, jobs: [[[star, key, bell], 'green'], [key, null]], keepOrder: true, cols: 3 });
  assert.deepEqual(out.scene.objects.map((o) => o.kind), ['star', 'key', 'bell']);
  assert.deepEqual(out.expect, { o1: 'green', o3: 'green' });
  assert.equal(out.scene.cols, 3);
});

test('finish: refuses nonsense', () => {
  assert.throws(() => type.finish(makeRng(1), { ...base, jobs: [[star, 'pink']] }), /unknown paint colour/);
  assert.throws(() => type.finish(makeRng(1), { ...base, jobs: [[{ kind: 'gem' }, 'red']] }), /not in the picture/);
  assert.throws(() => type.finish(makeRng(1), { ...base, jobs: [[star, 'red'], [star, null]] }), /leave something painted/);
  assert.throws(() => type.finish(makeRng(1), { ...base, objects: [{ kind: 'boot' }, { kind: 'book' }], jobs: [] }), /sound-alike/);
  assert.throws(() => type.finish(makeRng(1), { ...base, objects: Array.from({ length: 9 }, () => ({ kind: 'gem' })), jobs: [] }), /at most 8/);
});

test('validate: rejects malformed items', () => {
  const good = () => type.finish(makeRng(7), { ...base, jobs: [[star, 'red']], pots: 3 });
  type.validate(good(), tools);
  const bad = (change, why) => {
    const it = good();
    change(it);
    assert.throws(() => type.validate(it, tools), why);
  };
  bad((it) => { it.expect = {}; }, /nothing to paint/);
  bad((it) => { it.expect = [['o1']]; }, /expect must be/);
  bad((it) => { it.expect = { o9: 'red' }; }, /missing thing/);
  bad((it) => { it.expect = { o1: it.scene.paints.includes('blue') ? 'pink' : 'blue' }; }, /not on the shelf/);
  bad((it) => { it.scene.objects[0].color = 'red'; }, /unpainted/);
  bad((it) => { it.scene.paints = ['red']; }, /at least two/);
  bad((it) => { it.scene.paints = ['red', 'red']; }, /at least two/);
  bad((it) => { it.scene.paints = ['red', 'pink']; }, /unknown paint/);
  bad((it) => { it.scene.paints = it.scene.paints.filter((c) => c !== 'red'); it.expect = { o1: it.scene.paints[0] }; }, /says red but there is no red paint/);
  bad((it) => { it.scene.paints = ['red', 'blue']; it.expect = { o1: 'red', o2: 'blue' }; }, /every pot is needed/);
  bad((it) => { it.auto = true; }, /Done button/);
  bad((it) => { it.scene.cols = 9; }, /bad cols/);
  assert.equal(type.isNone(good()), false);
});

// ---- art -----------------------------------------------------------------------------------------

test('paint art follows the sprite rules and uses only its own colour', () => {
  const FORBIDDEN = [' id=', '<defs', '<style', '<text', 'url(', '<use', 'Gradient', '<filter', '<clipPath', '<mask', '<image', 'href', 'NaN', 'undefined'];
  const ok = (svg) => {
    assert.ok(svg.startsWith('<svg') && svg.endsWith('</svg>'));
    assert.ok(svg.includes('viewBox="0 0 100 100"') && svg.includes('aria-hidden="true"'));
    for (const bad of FORBIDDEN) assert.ok(!svg.includes(bad), `must not contain ${bad}`);
    assert.equal(svg.match(/<svg/g).length, 1);
    assert.equal((svg.match(/<g[ >]/g) || []).length, (svg.match(/<\/g>/g) || []).length);
  };
  for (const c of COLORS) {
    for (const svg of [potSVG(c), brushSVG(c)]) {
      ok(svg);
      assert.ok(svg.includes(PALETTE[c].main), `${c} art uses the ${c} tone`);
      for (const other of COLORS) if (other !== c) assert.ok(!svg.includes(PALETTE[other].main), `${c} art must not use ${other}`);
    }
  }
  assert.equal(new Set(COLORS.map(potSVG)).size, 6);
  ok(washSVG());
  for (const c of COLORS) assert.ok(!washSVG().includes(PALETTE[c].main), `the sponge must not look like ${c} paint`);
  for (const bad of ['gray', 'pink', 'constructor', undefined]) {
    assert.throws(() => potSVG(bad), /Unknown paint colour/);
    assert.throws(() => brushSVG(bad), /Unknown paint colour/);
  }
});
