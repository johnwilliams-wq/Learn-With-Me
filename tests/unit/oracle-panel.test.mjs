// An INDEPENDENT check of every "panel" item (Control Room).
//
// The generators (tools/content/worlds/panel.mjs) decide the right answer while they build each
// panel. This file works the answer out a second time, from scratch: it reads only the spoken
// sentence (with regular expressions) and the finished scene, never item.expect and never any
// code from tools/content - and insists the two agree. A sentence pattern (`v`) without a rule
// here fails the test.
//
//   LWM_ITEMS_DIR=tests/e2e/out/panel node --test tests/unit/oracle-panel.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { SKILLS } from '../../src/listening/insights.js';
import { itemsOfType, ROOT } from './oracles/load.mjs';

const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
const NUM = WORDS.join('|');
const COL = 'red|blue|green|yellow|purple|orange';
const LIST = `(?:${NUM})(?:, (?:${NUM}))+`; // "four, seven, two"
const n = (word) => {
  const i = WORDS.indexOf(word);
  assert.ok(i >= 0, `"${word}" is not a number word`);
  return i;
};
const code = (list) => list.split(', ').map(n).join('');

// --- reading the scene ---------------------------------------------------------------------
const sort = (it, type) => it.scene.controls.filter((c) => c.type === type);
function the(it, type, color) {
  const hits = sort(it, type).filter((c) => (color ? c.color === color : true));
  assert.equal(hits.length, 1, `"${it.say}": expected exactly one ${color || ''} ${type}, found ${hits.length}`);
  return hits[0];
}
const other = (pos) => ({ up: 'down', down: 'up' })[pos];
const flipOf = (s) => ({ c: s.id, v: other(s.pos) });
function nth(it, type, word, side) {
  const list = sort(it, type);
  const k = ['first', 'second', 'third'].indexOf(word);
  assert.ok(k >= 0 && k < list.length, `"${it.say}": no ${word} ${type}`);
  return side === 'left' ? list[k] : list[list.length - 1 - k];
}

// --- one thing to do -> what it asks of the panel (a list of { c, v }) ---------------------------
const PHRASES = [
  [new RegExp(`^press the (${COL}) button(?: (${NUM}) times)?$`), (it, color, times) => [{ c: the(it, 'button', color).id, v: times ? n(times) : 1 }]],
  [new RegExp(`^flip the (${COL}) switch$`), (it, color) => [flipOf(the(it, 'switch', color))]],
  [/^flip both switches$/, (it) => {
    assert.equal(sort(it, 'switch').length, 2, `"${it.say}": "both" needs exactly two switches`);
    return sort(it, 'switch').map(flipOf);
  }],
  [new RegExp(`^set the dial to (${NUM})$`), (it, to) => [{ c: the(it, 'dial').id, v: n(to) }]],
  [new RegExp(`^turn the dial (up|down) by (${NUM})$`), (it, way, by) => {
    const d = the(it, 'dial');
    return [{ c: d.id, v: d.value + (way === 'up' ? n(by) : -n(by)) }];
  }],
  [new RegExp(`^type the code (${LIST})$`), (it, list) => [{ c: the(it, 'keypad').id, v: code(list) }]],
  [/^press launch$/, (it) => [{ c: the(it, 'launch').id, v: true }]],
  [new RegExp(`^press every button except the (${COL}) one$`), (it, color) => {
    the(it, 'button', color); // the one to leave out must really be there
    return sort(it, 'button').filter((b) => b.color !== color).map((b) => ({ c: b.id, v: 1 }));
  }],
  [new RegExp(`^flip every switch except the (${COL}) one$`), (it, color) => {
    the(it, 'switch', color);
    return sort(it, 'switch').filter((s) => s.color !== color).map(flipOf);
  }],
  [new RegExp(`^press every button that is neither (${COL}) nor (${COL})$`), (it, c1, c2) => {
    assert.notEqual(c1, c2);
    the(it, 'button', c1);
    the(it, 'button', c2);
    return sort(it, 'button').filter((b) => b.color !== c1 && b.color !== c2).map((b) => ({ c: b.id, v: 1 }));
  }],
  [/^flip every switch that is (up|down)$/, (it, pos) => sort(it, 'switch').filter((s) => s.pos === pos).map(flipOf)],
  [new RegExp(`^press the (first|second|third) button from the (left|right)(?: (${NUM}) times)?$`), (it, word, side, times) => [{ c: nth(it, 'button', word, side).id, v: times ? n(times) : 1 }]],
  [/^flip the (first|second|third) switch from the (left|right)$/, (it, word, side) => [flipOf(nth(it, 'switch', word, side))]],
  [new RegExp(`^press the (${COL}) button one time for each switch that is (up|down)$`), (it, color, pos) => [{ c: the(it, 'button', color).id, v: sort(it, 'switch').filter((s) => s.pos === pos).length }]],
];

/** One group: what a single phrase such as "flip both switches" asks for. */
function does(it, text) {
  const phrase = text.trim().toLowerCase();
  for (const [re, rule] of PHRASES) {
    const m = re.exec(phrase);
    if (!m) continue;
    const group = rule(it, ...m.slice(1));
    assert.ok(group.length > 0, `"${it.say}": "${phrase}" asks for nothing on this panel`);
    return group;
  }
  return assert.fail(`"${it.say}": cannot read "${phrase}"`);
}
const rx = (it, re) => {
  const m = re.exec(it.say);
  assert.ok(m, `"${it.say}" does not look like pattern ${it.v}`);
  return m.slice(1);
};
const lightIs = (it) => the(it, 'light').color;

// --- one rule per sentence pattern -----------------------------------------------------------
/** "A, then B, then C." - each thing in the order it is said. `count` = how many things there must be. */
const chain = (count) => (it) => {
  const [body] = rx(it, /^(.+)\.$/);
  const parts = body.split(', then ');
  assert.equal(parts.length, count, `"${it.say}": expected ${count} things to do`);
  return parts.map((p) => does(it, p));
};
/** "The code is ..." with exactly `len` numbers. */
const theCode = (len) => (it) => {
  const [list] = rx(it, new RegExp(`^The code is (${LIST})\\.$`));
  assert.equal(code(list).length, len, `"${it.say}": expected ${len} numbers`);
  return [[{ c: the(it, 'keypad').id, v: code(list) }]];
};
const backwards = (list) => [...code(list)].reverse().join('');

const ORACLE = {
  'press-one': chain(1), 'flip-one': chain(1), 'press-times': chain(1), 'dial-set': chain(1), 'dial-by': chain(1), 'count-up': chain(1),
  'two-then': chain(2), 'times-then': chain(2), 'dial-then': chain(2), 'code-then': chain(2),
  'all-except': chain(2), neither: chain(2), 'switch-state': chain(2), ordinal: chain(2), 'hidden-except': chain(2),
  'three-then': chain(3), 'code-three': chain(3),
  code3: theCode(3), code4: theCode(4), code5: theCode(5), code6: theCode(6),
  // both things, in either order
  'dial-and': (it) => {
    const [a, b] = rx(it, /^(.+) and (.+)\.$/);
    return [[...does(it, a), ...does(it, b)]];
  },
  'first-next-last': (it) => rx(it, /^First, (.+)\. Next, (.+)\. Last, (.+)\.$/).map((p) => does(it, p)),
  'code-backwards': (it) => {
    const [list] = rx(it, new RegExp(`^Type this code backwards: (${LIST})\\.$`));
    return [[{ c: the(it, 'keypad').id, v: backwards(list) }]];
  },
  'backwards-hidden': (it) => {
    const [list] = rx(it, new RegExp(`^Type this code backwards: (${LIST})\\. Then press launch\\.$`));
    return [[{ c: the(it, 'keypad').id, v: backwards(list) }], [{ c: the(it, 'launch').id, v: true }]];
  },
  // "Before you Z, X and Y." - X and Y (either order) and only then Z
  'before-flipped': (it) => {
    const [z, x, y] = rx(it, /^Before you ([^,]+), ([^,]+) and ([^,]+)\.$/);
    return [[...does(it, x), ...does(it, y)], does(it, z)];
  },
  // "Z after you X. But first, Y." - Y, then X, then Z
  'after-flipped': (it) => {
    const [z, x, y] = rx(it, /^([^,.]+) after you ([^,.]+)\. But first, ([^,.]+)\.$/);
    return [does(it, y), does(it, x), does(it, z)];
  },
  'four-hidden': (it) => {
    const [a, b, c, d] = rx(it, /^([^,.]+), ([^,.]+), ([^,.]+), then ([^,.]+)\.$/);
    return [a, b, c, d].map((p) => does(it, p));
  },
  // three things, then one of two depending on the light
  'if-light': (it) => {
    const [a, b, c, c1, x1, c2, x2] = rx(it, /^([^,.]+), ([^,.]+), then ([^,.]+)\. If the light is (red|green), ([^,.]+)\. If it is (red|green), ([^,.]+) instead\.$/);
    assert.notEqual(c1, c2, `"${it.say}": both ifs name the same colour`);
    const [g1, g2] = [does(it, x1), does(it, x2)]; // both must make sense on this panel, whichever is taken
    return [does(it, a), does(it, b), does(it, c), lightIs(it) === c1 ? g1 : g2];
  },
  unless: (it) => {
    const [a, b, last, colour] = rx(it, /^([^,.]+), then ([^,.]+)\. Then ([^,.]+), unless the light is (red|green)\.$/);
    const tail = does(it, last);
    return [does(it, a), does(it, b), ...(lightIs(it) === colour ? [] : [tail])];
  },
  'only-if': (it) => {
    const [first, last, colour] = rx(it, new RegExp(`^(Type the code ${LIST})\\. Then ([^,.]+) only if the light is (red|green)\\.$`));
    const tail = does(it, last);
    return [does(it, first), ...(lightIs(it) === colour ? [tail] : [])];
  },
};

// --- the tests -------------------------------------------------------------------------------
const items = itemsOfType('panel');
const norm = (groups) => groups.map((g) => g.map((e) => `${e.c}=${JSON.stringify(e.v)}`).sort());
const levelsFile = join(ROOT, 'assets', 'data', 'listening', 'levels.json');
const built = !process.env.LWM_ITEMS_DIR && existsSync(levelsFile) && JSON.parse(readFileSync(levelsFile, 'utf8')).worlds.some((w) => w.id === 'panel');

test('panel: the answer worked out from the sentence matches the stored answer', () => {
  for (const it of items) {
    const rule = ORACLE[it.v];
    assert.ok(rule, `${it.id}: no independent rule for pattern "${it.v}" - add one to tests/unit/oracle-panel.test.mjs`);
    assert.deepEqual(norm(rule(it)), norm(it.expect), `${it.id}: ${it.say}`);
  }
  // (before the world is in the real game data there is nothing to check unless a preview folder is given)
  if (process.env.LWM_ITEMS_DIR || built) assert.ok(items.length >= 100, `only ${items.length} panel items`);
});

test('panel: every item is well formed and fair', () => {
  for (const it of items) {
    const controls = it.scene.controls;
    const start = new Map(controls.map((c) => [c.id, c.type === 'switch' ? c.pos : c.type === 'dial' ? c.value : c.type === 'keypad' ? '' : c.type === 'button' ? 0 : false]));
    for (const tag of it.s) assert.ok(tag in SKILLS, `${it.id}: unknown skill ${tag}`);
    assert.ok(it.s.includes('panel'), `${it.id}: missing the panel skill tag`);
    assert.ok(it.say.split(' ').length <= 35 && it.say.length <= 420, `${it.id}: sentence too long`);
    assert.doesNotMatch(it.say, /[0-9]/, `${it.id}: numbers must be written as words`);
    const named = it.expect.flat();
    assert.ok(named.length > 0, `${it.id}: nothing to do`);
    assert.equal(new Set(named.map((e) => e.c)).size, named.length, `${it.id}: a control is named twice`);
    for (const e of named) {
      assert.ok(start.has(e.c), `${it.id}: ${e.c} is not on the panel`);
      assert.notDeepEqual(e.v, start.get(e.c), `${it.id}: ${e.c} would not change`);
    }
    // there is always something else on the panel that must be left alone
    assert.ok(controls.some((c) => c.type !== 'light' && !named.some((e) => e.c === c.id)), `${it.id}: nothing to leave alone`);
    const dial = controls.find((c) => c.type === 'dial');
    for (const e of named) if (dial && e.c === dial.id) assert.ok(Number.isInteger(e.v) && e.v >= 0 && e.v <= 9, `${it.id}: the dial cannot show ${e.v}`);
    // a light is only on the panel when the sentence talks about it (and the other way round)
    assert.equal(controls.some((c) => c.type === 'light'), /\blight\b/.test(it.say), `${it.id}: light and sentence do not go together`);
    if (it.auto) assert.ok(named.length === 1 && [1, 'up', 'down', true].includes(named[0].v), `${it.id}: an auto item is answered with one touch`);
  }
});

test('panel: detail words are really needed (look-alikes on the panel)', () => {
  for (const it of items) {
    const of = (type) => it.scene.controls.filter((c) => c.type === type);
    // "the red button": there is a button of another colour (so "red" matters) and a red switch (so "button" matters)
    for (const [, color] of it.say.toLowerCase().matchAll(new RegExp(`the (${COL}) button`, 'g'))) {
      assert.ok(of('button').some((b) => b.color !== color), `${it.id}: only ${color} buttons`);
      assert.ok(of('switch').some((s) => s.color === color), `${it.id}: no ${color} switch beside the ${color} button`);
    }
    for (const [, color] of it.say.toLowerCase().matchAll(new RegExp(`the (${COL}) switch`, 'g'))) {
      assert.ok(of('switch').some((s) => s.color !== color), `${it.id}: only ${color} switches`);
      assert.ok(of('button').some((b) => b.color === color), `${it.id}: no ${color} button beside the ${color} switch`);
    }
    // "every switch that is up" must leave at least one switch alone; "both" needs exactly two
    const state = /every switch that is (up|down)/.exec(it.say);
    if (state) assert.ok(of('switch').some((s) => s.pos !== state[1]), `${it.id}: every switch is ${state[1]}`);
    // codes: no number twice (so a code never reads the same backwards)
    const list = new RegExp(`(?:code is|the code|backwards:) (${LIST})`).exec(it.say);
    if (list) assert.equal(new Set(list[1].split(', ')).size, list[1].split(', ').length, `${it.id}: a number is said twice`);
    // "if the light is ..." items come out both ways across the level, so the light cannot be guessed (checked below)
  }
});

test('panel: levels are varied, and the light really decides', () => {
  const byLevel = new Map();
  for (const it of items) {
    const level = it.id.replace(/-\d+$/, '');
    if (!byLevel.has(level)) byLevel.set(level, []);
    byLevel.get(level).push(it);
  }
  for (const [level, list] of byLevel) {
    assert.ok(list.length >= 15, `${level}: only ${list.length} items`);
    assert.ok(new Set(list.map((it) => it.v)).size >= 2, `${level}: only one sentence pattern`);
    assert.ok(new Set(list.map((it) => it.say)).size >= list.length * 0.6, `${level}: too many repeated sentences`);
  }
  for (const v of ['unless', 'only-if']) {
    const list = items.filter((it) => it.v === v);
    if (!list.length) continue;
    const launched = list.filter((it) => it.expect.flat().some((e) => e.v === true)).length;
    assert.ok(launched > 0 && launched < list.length, `${v}: launch is ${launched ? 'always' : 'never'} pressed`);
  }
  const lights = items.filter((it) => it.v === 'if-light').map((it) => it.scene.controls.find((c) => c.type === 'light').color);
  if (lights.length) assert.equal(new Set(lights).size, 2, 'if-light: the light is always the same colour');
  for (const it of items.filter((x) => /^panel7-/.test(x.id))) assert.ok(it.hide, `${it.id}: Blackout items are heard with the panel covered`);
});

test('panel: the oracle refuses a pattern it has no rule for, and notices a wrong answer key', () => {
  const it = items[0];
  if (!it) return;
  assert.equal(ORACLE['no-such-pattern'], undefined);
  const wrong = JSON.parse(JSON.stringify(it.expect));
  wrong[0][0].v = wrong[0][0].v === 1 ? 2 : 1;
  assert.notDeepEqual(norm(ORACLE[it.v](it)), norm(wrong));
});
