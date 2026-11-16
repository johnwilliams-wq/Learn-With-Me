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
  [new RegExp(`^type this code: (${LIST})$`), (it, list) => [{ c: the(it, 'keypad').id, v: code(list) }]],
  [/^press launch$/, (it) => [{ c: the(it, 'launch').id, v: true }]],
  // "every round button": the colour buttons. Anything else a child could call a button must not be in
  // the way: no dial (plus and minus), no number pad, and the rocket button only when the sentence ends with it.
  [new RegExp(`^press every round button except the (${COL}) one$`), (it, color) => {
    the(it, 'button', color); // the one to leave out must really be there
    assert.equal(sort(it, 'dial').length + sort(it, 'keypad').length, 0, `"${it.say}": "every round button" on a panel with other keys`);
    assert.equal(sort(it, 'launch').length, / press launch\.$/.test(it.say) ? 1 : 0, `"${it.say}": the rocket button is there if and only if the sentence ends with it`);
    return sort(it, 'button').filter((b) => b.color !== color).map((b) => ({ c: b.id, v: 1 }));
  }],
  [new RegExp(`^flip every switch except the (${COL}) one$`), (it, color) => {
    the(it, 'switch', color);
    return sort(it, 'switch').filter((s) => s.color !== color).map(flipOf);
  }],
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
  'press-one': chain(1), 'flip-one': chain(1), 'press-times': chain(1), 'dial-set': chain(1), 'dial-by': chain(1),
  'two-then': chain(2), 'times-then': chain(2), 'dial-then': chain(2), 'code-then': chain(2),
  'all-except': chain(2), 'hidden-except': chain(2),
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
  // two things, then one of two depending on the light
  'if-light': (it) => {
    const [a, b, c1, x1, c2, x2] = rx(it, /^([^,.]+), then ([^,.]+)\. If the light is (red|green), ([^,.]+)\. If the light is (red|green), ([^,.]+) instead\.$/);
    assert.notEqual(c1, c2, `"${it.say}": both ifs name the same colour`);
    const [g1, g2] = [does(it, x1), does(it, x2)]; // both must make sense on this panel, whichever is taken
    return [does(it, a), does(it, b), lightIs(it) === c1 ? g1 : g2];
  },
  unless, 'unless-hidden': unless,
  'only-if': onlyIf, 'only-if-hidden': onlyIf,
};
/** "A, then B. Then press launch, unless the light is red." - the last thing is left out when the light IS that colour. */
function unless(it) {
  const [a, b, last, colour] = rx(it, /^([^,.]+), then ([^,.]+)\. Then ([^,.]+), unless the light is (red|green)\.$/);
  const tail = does(it, last);
  return [does(it, a), does(it, b), ...(lightIs(it) === colour ? [] : [tail])];
}
/** "Type this code: .... Then press launch only if the light is green." - the last thing is done when the light IS that colour. */
function onlyIf(it) {
  const [first, last, colour] = rx(it, new RegExp(`^(Type this code: ${LIST})\\. Then ([^,.]+) only if the light is (red|green)\\.$`));
  const tail = does(it, last);
  return [does(it, first), ...(lightIs(it) === colour ? [tail] : [])];
}

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
    // on a panel with a light, "red" and "green" can only mean the light
    if (controls.some((c) => c.type === 'light')) {
      for (const c of controls) if (c.type === 'button' || c.type === 'switch') assert.ok(!['red', 'green'].includes(c.color), `${it.id}: a ${c.color} ${c.type} beside the light`);
      assert.doesNotMatch(it.say, /\bit\b/i, `${it.id}: say "the light" again, not "it"`);
    }
    // wordings that are heard two ways, or were never taught
    assert.doesNotMatch(it.say, new RegExp(`\\bcode (?:${NUM}|for|to)\\b`, 'i'), `${it.id}: "the code four" is heard as "the code for"`);
    assert.doesNotMatch(it.say, /\b(neither|nor)\b/i, `${it.id}: neither / nor is not taught in this world`);
    // "every button" could count the rocket button, the dial's plus and minus, the keys: it is always "every round button"
    assert.doesNotMatch(it.say, /\bevery button\b/i, `${it.id}: say "every round button"`);
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
    // "every ... except the yellow one": at least two are left to do, so "every" matters
    const except = /^(Press every round button|Flip every switch) except/.exec(it.say);
    if (except) assert.ok(of(except[1].startsWith('Press') ? 'button' : 'switch').length >= 3, `${it.id}: "every" names only one thing`);
    // codes: no number twice (so a code never reads the same backwards)
    const list = new RegExp(`(?:code is|this code:|backwards:) (${LIST})`).exec(it.say);
    assert.equal(Boolean(list), /\bcode\b/i.test(it.say), `${it.id}: a code is talked about but cannot be read`);
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
  // (worked out from the sentence and the light, not from the stored answer)
  for (const [level, all] of byLevel) {
    for (const [word, v] of [['unless', /^unless/], ['only if', /^only-if/]]) {
      const list = all.filter((it) => v.test(it.v));
      if (!list.length) continue;
      const launched = list.filter((it) => {
        const [colour] = rx(it, new RegExp(`${word} the light is (red|green)\\.$`));
        return (lightIs(it) === colour) === (word === 'only if');
      }).length;
      assert.ok(launched > 0 && launched < list.length, `${level} ${word}: launch is ${launched ? 'always' : 'never'} pressed`);
    }
  }
  const lights = items.filter((it) => it.v === 'if-light').map((it) => it.scene.controls.find((c) => c.type === 'light').color);
  if (lights.length) assert.equal(new Set(lights).size, 2, 'if-light: the light is always the same colour');
  for (const it of items.filter((x) => /^panel7-/.test(x.id))) assert.ok(it.hide, `${it.id}: Blackout items are heard with the panel covered`);
  // the light is met with the controls in view (Tricky Talk) before it is met covered (Blackout), and not earlier
  const lit = (it) => it.scene.controls.some((c) => c.type === 'light');
  for (const it of items.filter(lit)) assert.match(it.id, /^panel[67]-/, `${it.id}: a light before Tricky Talk`);
  const six = byLevel.get('panel6') || [];
  for (const it of six) assert.ok(!it.hide, `${it.id}: nothing is covered in Tricky Talk`);
  if (six.length) {
    assert.ok(new Set(six.map((it) => it.v)).size <= 6, `panel6: ${new Set(six.map((it) => it.v)).size} kinds of sentence (six at most)`);
    for (const word of ['unless', 'only if']) assert.ok(six.some((it) => lit(it) && it.say.includes(`${word} the light is`)), `panel6: no "${word} the light is" with the controls in view`);
  }
});

test('panel: the oracle refuses a pattern it has no rule for, and notices a wrong answer key', () => {
  const it = items[0];
  if (!it) return;
  assert.equal(ORACLE['no-such-pattern'], undefined);
  const wrong = JSON.parse(JSON.stringify(it.expect));
  wrong[0][0].v = wrong[0][0].v === 1 ? 2 : 1;
  assert.notDeepEqual(norm(ORACLE[it.v](it)), norm(wrong));
});
