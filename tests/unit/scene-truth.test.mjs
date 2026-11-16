// Activity type "truth": unit tests of the checker (src/listening/scenes/truth.js), of the content
// rules (tools/content/types/truth.mjs) and of the shape of the Truth Detector world.

import test from 'node:test';
import assert from 'node:assert/strict';
import scene from '../../src/listening/scenes/truth.js';
import type from '../../tools/content/types/truth.mjs';
import world from '../../tools/content/worlds/truth.mjs';
import { makeRng } from '../../src/core/rng.js';
import { SKILLS, ERRORS } from '../../src/listening/insights.js';
import { buildLevel, prepare, levelMeta } from '../../tools/content/pipeline.mjs';

const item = (expect) => ({ t: 'truth', expect, auto: true, scene: { cols: 2, objects: [{ id: 'o1', kind: 'key', color: 'red', size: 'big' }, { id: 'o2', kind: 'gem', color: 'blue', size: 'small' }] } });

test('check: the right button is right, the other one is a wrong choice', () => {
  for (const expect of [true, false]) {
    const right = scene.check(expect, item(expect));
    assert.deepEqual(right, { correct: true, error: '', at: -1, prefix: 1, total: 0 });
    const wrong = scene.check(!expect, item(expect));
    assert.equal(wrong.correct, false);
    assert.equal(wrong.error, 'choice');
    assert.equal(wrong.at, 0);
    assert.equal(wrong.prefix, 0);
    assert.equal(wrong.total, 0, 'no step dots: there is only one thing to do');
  }
});

test('check: an empty answer is never right (nothing chosen, or the hand was pressed)', () => {
  for (const expect of [true, false]) {
    for (const empty of [null, undefined]) {
      const res = scene.check(empty, item(expect));
      assert.equal(res.correct, false);
      assert.equal(res.error, 'no-response');
    }
  }
});

test('check: only a real true / false counts, and every error is one the parent view knows', () => {
  for (const odd of ['true', 'false', 1, 0, '', [], {}]) {
    for (const expect of [true, false]) assert.equal(scene.check(odd, item(expect)).correct, false, `${JSON.stringify(odd)} against ${expect}`);
  }
  for (const answer of [true, false, null]) {
    for (const expect of [true, false]) {
      const { error, correct } = scene.check(answer, item(expect));
      assert.ok(correct ? error === '' : error in ERRORS, `error key "${error}"`);
    }
  }
});

test('check is pure, and "do nothing" is never the right answer in this activity', () => {
  const it = item(true);
  const before = JSON.stringify(it);
  scene.check(true, it);
  scene.check(false, it);
  assert.equal(JSON.stringify(it), before);
  assert.equal(scene.isNone(item(true)), false);
  assert.equal(scene.isNone(item(false)), false);
  assert.equal(type.isNone(item(false)), false);
});

// ---------------------------------------------------------------------------- content rules

const key = { kind: 'key', color: 'red', size: 'big' };
const gem = { kind: 'gem', color: 'blue', size: 'small' };
const bell = { kind: 'bell', color: 'green', size: 'big' };
const tools = { fail: (why) => { throw new Error(why); }, checkObjects: () => {} };

test('finish: the picture, a true / false answer, one tap', () => {
  const out = type.finish(makeRng('a'), { t: 'truth', say: 'The key is red.', objects: [key, gem, bell], truth: true, g: 'yes', s: ['truth'], v: 'x' });
  assert.equal(out.t, 'truth');
  assert.equal(out.expect, true);
  assert.equal(out.auto, true);
  assert.equal(out.g, 'yes');
  assert.equal(out.scene.objects.length, 3);
  assert.deepEqual(out.scene.objects.map((o) => o.id), ['o1', 'o2', 'o3']);
  assert.equal(out.scene.about, undefined);
  type.validate(out, tools);
  assert.throws(() => type.finish(makeRng('a'), { t: 'truth', say: 'x', objects: [key], s: ['truth'], v: 'x' }), /truth: true or false/);
});

test('finish: a row keeps its order, and "about" becomes ids (group by group, each in reading order)', () => {
  const out = type.finish(makeRng('b'), { t: 'truth', say: 'x', objects: [key, gem, bell], about: [[bell], [gem, key]], truth: false, keepOrder: true, cols: 3, s: ['truth'], v: 'x' });
  assert.deepEqual(out.scene.objects.map((o) => o.kind), ['key', 'gem', 'bell']);
  assert.equal(out.scene.cols, 3);
  assert.deepEqual(out.scene.about, ['o3', 'o1', 'o2']);
  assert.equal(out.expect, false);
  type.validate(out, tools);
  assert.throws(() => type.finish(makeRng('b'), { t: 'truth', say: 'x', objects: [key, gem], about: [[bell]], truth: true, s: ['truth'], v: 'x' }), /not in the scene/);
});

test('validate: rejects anything malformed', () => {
  const good = () => type.finish(makeRng('c'), { t: 'truth', say: 'x', objects: [key, gem, bell], about: [[key]], truth: true, g: 'yes', s: ['truth'], v: 'x' });
  type.validate(good(), tools);
  assert.throws(() => type.validate({ ...good(), expect: [] }, tools), /true or false/);
  assert.throws(() => type.validate({ ...good(), expect: 'true' }, tools), /true or false/);
  assert.throws(() => type.validate({ ...good(), auto: false }, tools), /one tap/);
  assert.throws(() => type.validate({ ...good(), mode: 'pick' }, tools), /no mode/);
  assert.throws(() => type.validate({ ...good(), g: 'no' }, tools), /quota group/);
  const bad = good();
  bad.scene = { ...bad.scene, about: ['o9'] };
  assert.throws(() => type.validate(bad, tools), /about/);
  bad.scene = { ...bad.scene, about: ['o1', 'o1'] };
  assert.throws(() => type.validate(bad, tools), /about/);
  bad.scene = { ...bad.scene, about: [] };
  assert.throws(() => type.validate(bad, tools), /about/);
});

// ---------------------------------------------------------------------------- the world

test('the Truth Detector world: seven levels and a boss, each with a spoken tip and a balanced quota', () => {
  assert.equal(world.id, 'truth');
  assert.ok(world.name && world.blurb && /^#[0-9a-f]{6}$/.test(world.color));
  const own = world.levels.filter((l) => l.gen);
  const boss = world.levels.at(-1);
  assert.equal(own.length, 7);
  assert.equal(world.levels.length, 8);
  assert.equal(boss.boss, true);
  assert.deepEqual(boss.mix, own.slice(-3).map((l) => l.id), 'the boss mixes the three hardest levels');
  assert.equal(new Set(world.levels.map((l) => l.id)).size, 8);
  for (const level of world.levels) {
    assert.match(level.id, /^truth/);
    assert.ok(level.title, level.id);
    assert.ok(level.tip && level.tip.length <= 200, `${level.id}: tip (${level.tip?.length} characters)`);
    assert.match(level.tip, /^[A-Za-z ,.:!]+$/, `${level.id}: the tip is spoken - plain words only`);
    assert.deepEqual(level.quota, { yes: 2, no: 2 }, `${level.id}: at least two true and two not true per mission`);
    assert.ok(!level.allowNone, `${level.id}: no hand button here`);
    if (level.gen) assert.equal(level.n, 18, level.id);
  }
  // the first tip says what the two buttons look like
  assert.match(world.levels[0].tip, /green check mark/);
  assert.match(world.levels[0].tip, /cross/);
});

test('every level builds: valid items, known skill tags, half true and half not', () => {
  for (const level of world.levels.filter((l) => l.gen)) {
    const items = buildLevel(world, prepare(world, level), () => '000000000000.mp3');
    assert.equal(items.length, 18, level.id);
    assert.equal(items.filter((it) => it.expect === true).length, 9, `${level.id}: true items`);
    assert.equal(items.filter((it) => it.g === 'no').length, 9, `${level.id}: not-true items`);
    for (const it of items) {
      assert.equal(it.t, 'truth', it.id);
      for (const tag of it.s) assert.ok(tag in SKILLS, `${it.id}: unknown skill ${tag}`);
      assert.ok(it.scene.about?.length, `${it.id}: nothing for the guide to point at`);
      assert.equal(!!it.hide, level.id === 'truth7', `${it.id}: only the last level covers the picture`);
    }
    const meta = levelMeta(level);
    assert.deepEqual(meta.quota, { yes: 2, no: 2 });
    assert.equal(meta.trials, 6);
  }
});

test('building is repeatable (the same seed gives the same items)', () => {
  const level = world.levels[4];
  const a = buildLevel(world, prepare(world, level), () => 'x.mp3');
  const b = buildLevel(world, prepare(world, level), () => 'x.mp3');
  assert.deepEqual(a, b);
});
