// An INDEPENDENT check of every "build" item (the Robot Workshop).
//
// The generators (tools/content/worlds/build.mjs) decide which option of every row is right
// while they build each item. This file works the answer out a second time from scratch: it
// reads only the spoken sentence (item.say) and the rows on screen (item.scene), turns every
// phrase into a rule about one row, and insists that exactly ONE option of every row fits -
// and that those options are the stored answer. It shares no code with the generators, and a
// sentence pattern (`v`) without an entry in PATTERNS below fails.
//
//   LWM_ITEMS_DIR=tests/e2e/out/build node --test tests/unit/oracle-build.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { itemsOfType, ROOT } from './oracles/load.mjs';

// ---- the words ---------------------------------------------------------------------------

const COLOR = 'red|blue|green|yellow|purple|orange';
const SHAPE = 'round|square|pointy';
const NUMBER = { no: 0, one: 1, two: 2, three: 3, four: 4 };
const NUM = Object.keys(NUMBER).join('|');
const COUNTED = 'eyes|antennas|buttons';
const KIND = `an? (?:${SHAPE}) head|an? (?:${COLOR}) (?:body|nose)|short arms|long arms|claws|legs|wheels|a jet`;
const COUNT = `(?:${NUM}) (?:eyes?|antennas?|buttons?)`;

/** "a round head" -> { part: 'head', value: 'round' };  "a jet" -> { part: 'bottom', value: 'jet' } */
function kind(phrase) {
  let m;
  if ((m = phrase.match(new RegExp(`^an? (${SHAPE}) head$`)))) return { part: 'head', value: m[1] };
  if ((m = phrase.match(new RegExp(`^an? (${COLOR}) (body|nose)$`)))) return { part: m[2], value: m[1] };
  const fixed = { 'short arms': ['arms', 'short'], 'long arms': ['arms', 'long'], claws: ['arms', 'claws'], legs: ['bottom', 'legs'], wheels: ['bottom', 'wheels'], 'a jet': ['bottom', 'jet'] }[phrase];
  assert.ok(fixed, `not a part I know: "${phrase}"`);
  return { part: fixed[0], value: fixed[1] };
}
/** "three eyes" -> { part: 'eyes', value: 3 };  "one antenna" -> { part: 'antennas', value: 1 } */
function counted(phrase) {
  const m = phrase.match(new RegExp(`^(${NUM}) (eye|antenna|button)(s?)$`));
  assert.ok(m, `not a number of things: "${phrase}"`);
  const value = NUMBER[m[1]];
  assert.equal(m[3] === 's', value !== 1, `singular / plural does not match the number in "${phrase}"`);
  return { part: `${m[2]}s`, value };
}
/** Either of the two: "a jet" or "three eyes". */
const named = (phrase) => (/^(?:no|one|two|three|four) /.test(phrase) ? counted(phrase) : kind(phrase));

// What the pictures of sized options mean (written out here, not taken from the game's code).
const ARM_LENGTH = { short: 1, mid: 2, long: 3 };
const SIZED = { 'legs-short': ['legs', 1], 'legs-long': ['legs', 2], 'wheels-small': ['wheels', 1], 'wheels-big': ['wheels', 2] };

// ---- phrases -> rules --------------------------------------------------------------------
// A rule is { part, test(value, row, solved), needs? }: `test` says whether an option of that
// part's row fits; `needs` lists other parts whose answer must be known first.

const is = (part, value) => ({ part, test: (v) => v === value });
const isNot = (part, values) => ({ part, test: (v) => !values.includes(v) });

const PHRASES = {
  // A change of plan, always the end of the sentence: "Wait, no. Not wheels. Give it a jet."
  // The part he takes back must be a picture in the same row (it is what a child who stopped
  // listening would choose), and `retracts` makes rulesOf() insist that it really was said before.
  change: [new RegExp(`wait, no\\. not (${KIND}|${COUNT})\\. give it (${KIND}|${COUNT})\\.$`, 'g'), (m) => {
    const old = named(m[1]);
    const now = named(m[2]);
    assert.equal(old.part, now.part, 'a change of plan must take back and give the same part');
    assert.notEqual(old.value, now.value, 'a change of plan must change something');
    return [{ part: now.part, retracts: old.value, test: (v, row) => v === now.value && row.options.includes(old.value) }];
  }],
  // "If the robot has wheels, it gets two antennas."  (only binds when the robot really has wheels)
  if: [new RegExp(`if (?:the robot|it) has (${KIND}), it gets (${COUNT})\\.`, 'g'), (m) => {
    const when = kind(m[1]);
    const then = counted(m[2]);
    return [{ part: then.part, needs: [when.part], test: (v, row, solved) => solved[when.part] !== when.value || v === then.value, binds: (solved) => solved[when.part] === when.value }];
  }],
  // "The robot gets three eyes, unless it has a jet. If it has a jet, it gets one eye instead."
  unless: [new RegExp(`the robot gets (${COUNT}), unless it has (${KIND})\\. if it has (${KIND}), it gets (${COUNT}) instead\\.`, 'g'), (m) => {
    const usual = counted(m[1]);
    const when = kind(m[2]);
    assert.equal(m[3], m[2], 'the "if" after an "unless" must repeat the same exception');
    const instead = counted(m[4]);
    assert.equal(usual.part, instead.part, 'both halves of an "unless" must be about the same part');
    assert.notEqual(usual.value, instead.value);
    return [{ part: usual.part, needs: [when.part], test: (v, row, solved) => v === (solved[when.part] === when.value ? instead.value : usual.value) }];
  }],
  // "The head is neither round nor square." / "The robot has neither legs nor a jet."
  neither: [new RegExp(`the head is neither (${SHAPE}) nor (${SHAPE})|the robot has neither (${KIND}) nor (${KIND})`, 'g'), (m) => {
    if (m[1]) return [isNot('head', [m[1], m[2]])];
    const a = kind(m[3]);
    const b = kind(m[4]);
    assert.equal(a.part, b.part, '"neither ... nor" must rule out two options of one part');
    return [isNot(a.part, [a.value, b.value])];
  }],
  // "The nose is not red and not green."
  notnot: [new RegExp(`the (head|body|nose) is not (${SHAPE}|${COLOR}) and not (${SHAPE}|${COLOR})`, 'g'), (m) => [isNot(m[1], [m[2], m[3]])]],
  // "Do not give the robot claws or long arms."
  dont: [new RegExp(`do not give the robot (${KIND}) or (${KIND})\\.`, 'g'), (m) => {
    const a = kind(m[1]);
    const b = kind(m[2]);
    assert.equal(a.part, b.part, '"do not give ... or ..." must rule out two options of one part');
    return [isNot(a.part, [a.value, b.value])];
  }],
  // "wheels, not legs" / "a round head, not a square one": the first is wanted, the second is a decoy
  not: [new RegExp(`(${KIND}), not (?:(${KIND})|an? (${SHAPE}|${COLOR}) one)`, 'g'), (m) => {
    const want = kind(m[1]);
    const decoy = m[2] ? kind(m[2]) : { part: want.part, value: m[3] };
    assert.equal(decoy.part, want.part, 'the decoy after "not" must be the same part');
    assert.notEqual(decoy.value, want.value);
    return [{ part: want.part, test: (v, row) => v === want.value && row.options.includes(decoy.value) }];
  }],
  // "the last head", "the second body": a place in the row, counted from the left
  place: [new RegExp('the (first|second|third|last) (head|body|nose)', 'g'), (m) => [{
    part: m[2],
    test: (v, row) => row.options.indexOf(v) === (m[1] === 'last' ? row.options.length - 1 : ['first', 'second', 'third'].indexOf(m[1])),
  }]],
  // "twice as many buttons as eyes"
  twice: [new RegExp(`twice as many (${COUNTED}) as (${COUNTED})`, 'g'), (m) => [{ part: m[1], needs: [m[2]], test: (v, row, solved) => v === 2 * solved[m[2]] }]],
  // "one more button than eyes"
  onemore: [new RegExp(`one more (eye|antenna|button) than (${COUNTED})`, 'g'), (m) => [{ part: `${m[1]}s`, needs: [m[2]], test: (v, row, solved) => v === solved[m[2]] + 1 }]],
  // "It has more eyes than antennas." / "It has fewer buttons than eyes."
  more: [new RegExp(`(more|fewer) (${COUNTED}) than (${COUNTED})`, 'g'), (m) => [{ part: m[2], needs: [m[3]], test: (v, row, solved) => (m[1] === 'more' ? v > solved[m[3]] : v < solved[m[3]]) }]],
  // "the same number of buttons as eyes"
  same: [new RegExp(`the same number of (${COUNTED}) as (${COUNTED})`, 'g'), (m) => [{ part: m[1], needs: [m[2]], test: (v, row, solved) => v === solved[m[2]] }]],
  // "the most buttons" / "the fewest eyes": the biggest / smallest number in the row
  most: [new RegExp(`the (most|fewest) (${COUNTED})`, 'g'), (m) => [{ part: m[2], test: (v, row) => v === (m[1] === 'most' ? Math.max(...row.options) : Math.min(...row.options)) }]],
  // "the longest arms", "the bigger wheels", "the shorter legs"
  size: [new RegExp('the (longest|shortest) arms|the (bigger|smaller) wheels|the (longer|shorter) legs', 'g'), (m) => {
    if (m[1]) {
      return [{ part: 'arms', test(v, row) {
        const lengths = row.options.map((o) => ARM_LENGTH[o]);
        assert.ok(lengths.every(Boolean) && lengths.length >= 3, 'every arm in a "longest" row needs a length');
        return ARM_LENGTH[v] === (m[1] === 'longest' ? Math.max(...lengths) : Math.min(...lengths));
      } }];
    }
    const what = m[2] ? 'wheels' : 'legs';
    const bigger = m[2] === 'bigger' || m[3] === 'longer';
    return [{ part: 'bottom', test(v, row) {
      const pair = row.options.filter((o) => SIZED[o]?.[0] === what);
      assert.equal(pair.length, 2, `"the ${m[2] || m[3]} ${what}" needs exactly two sizes of ${what} to compare`);
      assert.ok(!row.options.includes(what), `a plain "${what}" picture next to sized ones would be unclear`);
      return SIZED[v]?.[0] === what && SIZED[v][1] === (bigger ? 2 : 1);
    } }];
  }],
  // simply named: "a round head", "claws", "three eyes", "no antennas"
  plain: [new RegExp(`${KIND}|${COUNT}`, 'g'), (m) => {
    const p = named(m[0]);
    return [{ ...is(p.part, p.value), said: p.value }];
  }],
};
const ORDER = ['change', 'unless', 'if', 'neither', 'notnot', 'dont', 'not', 'place', 'twice', 'onemore', 'more', 'same', 'most', 'size', 'plain'];

/**
 * Every sentence pattern: the kinds of phrase it may contain (`uses`), the ones it must contain
 * (`must`, default: the first of `uses`), and optionally the frame the whole sentence must have
 * (`frame`) or must not have (`never`).
 *
 * The workshop checks the finished robot only, never the order of his choices, so no pattern
 * may claim an order: "before", "after" and "then" are words the oracle does not understand.
 */
const PATTERNS = {
  'build-list': { uses: ['plain'] },
  // nothing may follow a "not ..." inside its sentence ("legs, not wheels, and a blue body" can be
  // heard as two things the robot must not have)
  'build-not': { uses: ['not', 'plain'], never: /, not [^.]*(?:,|\band\b)/ },
  'build-notnot': { uses: ['notnot', 'plain'] },
  'build-dont': { uses: ['dont', 'plain'] },
  'build-size': { uses: ['size', 'plain'] },
  'build-more': { uses: ['more', 'plain'] },
  'build-most': { uses: ['most', 'plain'] },
  'build-same': { uses: ['same', 'plain'] },
  'build-sum': { uses: ['twice', 'onemore', 'plain'], must: [] },
  'build-neither': { uses: ['neither', 'plain'] },
  'build-if': { uses: ['if', 'plain'] },
  'build-unless': { uses: ['unless', 'plain'] },
  'build-place': { uses: ['place', 'plain'] },
  'build-change': { uses: ['change', 'plain'], frame: /^(?:give the robot|build a robot with) [^.]+\. wait, no\. not [^.]+\. give it [^.]+\.$/ },
};
/** Words that carry no information once every phrase has been taken out of a sentence. */
const FILLER = new Set(['give', 'the', 'robot', 'it', 'has', 'and', 'build', 'a', 'with', 'this', 'also', 'needs', 'pick']);

function rulesOf(item) {
  const pattern = PATTERNS[item.v];
  assert.ok(pattern, `${item.id}: no independent rule for pattern "${item.v}" - add one to PATTERNS in tests/unit/oracle-build.test.mjs`);
  let text = item.say.toLowerCase();
  if (pattern.frame) assert.match(text, pattern.frame, `${item.id}: not the sentence frame of ${item.v}`);
  if (pattern.never) assert.doesNotMatch(text, pattern.never, `${item.id}: a ${item.v} sentence must not be worded like this: "${item.say}"`);
  const rules = [];
  const used = new Set();
  for (const name of ORDER) {
    if (!pattern.uses.includes(name)) continue;
    const [re, make] = PHRASES[name];
    text = text.replace(re, (...m) => {
      rules.push(...make(m));
      used.add(name);
      return ' # ';
    });
  }
  for (const name of pattern.must || [pattern.uses[0]]) assert.ok(used.has(name), `${item.id}: a ${item.v} sentence must contain a "${name}" phrase`);
  if (item.v === 'build-sum') assert.ok(used.has('twice') || used.has('onemore'), `${item.id}: no number to work out`);
  const left = text.replace(/[#.,]/g, ' ').split(/\s+/).filter((w) => w && !FILLER.has(w));
  assert.deepEqual(left, [], `${item.id}: words the oracle did not understand in "${item.say}"`);
  // A change of plan replaces what was said first: that part must have been named exactly once
  // before, with the very thing that is now taken back. Only the new choice stays as a rule.
  for (const change of rules.filter((r) => 'retracts' in r)) {
    const before = rules.filter((r) => r.part === change.part && r !== change);
    assert.ok(before.length === 1 && before[0].said === change.retracts, `${item.id}: "not ..." takes back something that was not said (once) before, in "${item.say}"`);
    rules.splice(rules.indexOf(before[0]), 1);
  }
  return rules;
}

/** The one option of every row that fits everything the sentence says. */
function solve(item) {
  const rows = item.scene.rows;
  const rules = rulesOf(item);
  for (const r of rules) assert.ok(rows.some((row) => row.part === r.part), `${item.id}: the sentence talks about the ${r.part}, which has no row`);
  const solved = {};
  for (let pass = 0; pass <= rows.length; pass++) {
    for (const row of rows) {
      if (row.part in solved) continue;
      const mine = rules.filter((r) => r.part === row.part);
      assert.ok(mine.length, `${item.id}: the sentence says nothing about the ${row.part} row`);
      if (!mine.every((r) => (r.needs || []).every((p) => p in solved))) continue; // wait for the part it depends on
      const live = mine.filter((r) => !r.binds || r.binds(solved));
      assert.ok(live.length, `${item.id}: no rule applies to the ${row.part} row`);
      const fits = row.options.filter((v) => live.every((r) => r.test(v, row, solved)));
      assert.equal(fits.length, 1, `${item.id}: ${fits.length} options fit for the ${row.part} (${fits.join(', ')}) in "${item.say}"`);
      solved[row.part] = fits[0];
    }
  }
  assert.equal(Object.keys(solved).length, rows.length, `${item.id}: could not work out every row of "${item.say}"`);
  return solved;
}

// ---- the tests ---------------------------------------------------------------------------

const items = itemsOfType('build');
/** Are build items expected in the data being tested? (the real game data once the world is in it, or a preview of this world) */
function expected() {
  if (process.env.LWM_ITEMS_DIR) return readdirSync(resolve(process.env.LWM_ITEMS_DIR)).some((f) => /^build\d\.json$/.test(f));
  const file = join(ROOT, 'assets', 'data', 'listening', 'levels.json');
  return existsSync(file) && JSON.parse(readFileSync(file, 'utf8')).worlds.some((w) => w.id === 'build');
}

test('build: the answer worked out from the sentence matches the stored answer, for every item', () => {
  for (const it of items) assert.deepEqual(solve(it), it.expect, `${it.id}: ${it.say}`);
  if (expected()) assert.ok(items.length >= 120, `only ${items.length} build items`);
});

test('build: every item is well formed and fair', () => {
  const COLOURS = COLOR.split('|');
  for (const it of items) {
    const rows = it.scene.rows;
    assert.ok(rows.length >= 2 && rows.length <= 5, `${it.id}: ${rows.length} rows`);
    assert.equal(new Set(rows.map((r) => r.part)).size, rows.length, `${it.id}: a part has two rows`);
    for (const row of rows) {
      assert.ok(row.options.length >= 3 && row.options.length <= 4, `${it.id}: the ${row.part} row has ${row.options.length} options`);
      assert.equal(new Set(row.options).size, row.options.length, `${it.id}: the ${row.part} row repeats an option`);
    }
    assert.deepEqual(Object.keys(it.expect).sort(), rows.map((r) => r.part).sort(), `${it.id}: one answer for every row`);
    assert.ok(it.s.includes('build') && it.s.includes(`steps${rows.length}`), `${it.id}: tags ${it.s} for ${rows.length} rows`);
    assert.equal(!!it.hide, it.s.includes('hidden'), `${it.id}: "hidden" tag and hide flag must go together`);
    assert.ok(!it.auto && !it.mode, `${it.id}: build items end with the green check mark`);
    assert.ok(it.say.split(/\s+/).length <= 35, `${it.id}: more than 35 words`);
    // Only the finished robot is checked, so nothing may be tagged or worded as an order to follow.
    assert.ok(!it.s.some((t) => ['flip', 'before', 'after', 'order'].includes(t)), `${it.id}: the workshop does not check order (tags ${it.s})`);
    assert.doesNotMatch(it.say, /\b(before|after|then|first give|next)\b/i, `${it.id}: the sentence claims an order`);
    // "no antennas and wheels" could be heard as no wheels either.
    assert.doesNotMatch(it.say, /\bno antennas(?:,| and) (?:legs|wheels|claws|short arms|long arms)\b/i, `${it.id}: "no" could be heard to cover the next part too`);
    // A change of plan is about listening to the end; nothing else is.
    assert.equal(it.s.includes('end'), it.v === 'build-change', `${it.id}: the "end" tag belongs to a change of plan`);
    assert.ok(!/\d/.test(it.say), `${it.id}: numbers must be written as words`);
    assert.ok(!/\ba (orange|[aeiou])/.test(it.say.toLowerCase()), `${it.id}: "a" before a vowel`);
    // Two colour rows always offer the same colours, so "body" and "nose" have to be listened to.
    const colourRows = rows.filter((r) => r.part === 'body' || r.part === 'nose');
    for (const r of colourRows) {
      assert.ok(r.options.every((c) => COLOURS.includes(c)), `${it.id}: ${r.part} colours`);
      assert.deepEqual([...r.options].sort(), [...colourRows[0].options].sort(), `${it.id}: the colour rows differ`);
    }
    // In a plain list every number row also shows the other parts' numbers ("three eyes, two antennas").
    if (it.v === 'build-list') {
      const numberRows = rows.filter((r) => typeof it.expect[r.part] === 'number');
      const range = { eyes: [1, 4], antennas: [0, 3], buttons: [1, 4] };
      for (const a of numberRows) for (const b of numberRows) {
        const n = it.expect[b.part];
        if (a !== b && n >= range[a.part][0] && n <= range[a.part][1]) assert.ok(a.options.includes(n), `${it.id}: the ${a.part} row should show ${n} (said for the ${b.part})`);
      }
    }
  }
});

test('build: levels 5 to 7 ask for four or five parts, and the hidden level hides everything', () => {
  const byLevel = new Map();
  for (const it of items) {
    const level = it.id.replace(/-\d+$/, '');
    byLevel.set(level, [...(byLevel.get(level) || []), it]);
  }
  for (const [level, list] of byLevel) {
    const n = Number(level.replace('build', ''));
    if (!n) continue;
    const want = { 1: [2, 2], 2: [3, 3], 3: [3, 3], 4: [4, 4], 5: [4, 4], 6: [4, 4], 7: [5, 5] }[n];
    for (const it of list) assert.ok(it.scene.rows.length >= want[0] && it.scene.rows.length <= want[1], `${it.id}: ${it.scene.rows.length} rows in level ${n}`);
    assert.equal(list.every((it) => it.hide), n === 7, `${level}: only the last level is built from memory`);
    assert.ok(new Set(list.map((it) => it.say)).size === list.length, `${level}: a sentence is repeated`);
    if (n >= 3) assert.ok(new Set(list.map((it) => it.v)).size >= (n === 4 ? 1 : 3), `${level}: too few sentence patterns`);
    assert.ok(new Set(list.map((it) => it.v)).size <= 5, `${level}: more than five kinds of sentence in one level`);
  }
});

// The oracle itself, on hand-written items whose answers are plain to see.
test('build: the oracle works on hand-written examples (and refuses what it cannot be sure of)', () => {
  const row = (part, ...options) => ({ part, options });
  const make = (v, say, rows) => ({ id: 'hand', v, say, scene: { rows } });
  const heads = row('head', 'square', 'pointy', 'round');
  const arms = row('arms', 'claws', 'short', 'long');
  const legs = row('bottom', 'jet', 'legs', 'wheels');
  assert.deepEqual(solve(make('build-list', 'Give the robot a round head and wheels.', [heads, legs])), { head: 'round', bottom: 'wheels' });
  assert.deepEqual(solve(make('build-not', 'Give the robot wheels, not legs. It also needs claws, and a pointy head, not a round one.', [heads, arms, legs])), { head: 'pointy', arms: 'claws', bottom: 'wheels' });
  assert.deepEqual(solve(make('build-notnot', 'The body is not red and not blue. Give the robot a jet and a red nose.', [row('nose', 'red', 'blue', 'green'), row('body', 'blue', 'green', 'red'), legs])), { body: 'green', nose: 'red', bottom: 'jet' });
  assert.deepEqual(solve(make('build-dont', 'Do not give the robot legs or a jet. Give it claws and a square head.', [heads, arms, legs])), { head: 'square', arms: 'claws', bottom: 'wheels' });
  assert.deepEqual(solve(make('build-size', 'Give the robot the longest arms, the smaller wheels and two eyes.', [row('eyes', 1, 2, 3), row('arms', 'mid', 'long', 'short'), row('bottom', 'wheels-big', 'legs-short', 'wheels-small', 'legs-long')])), { eyes: 2, arms: 'long', bottom: 'wheels-small' });
  assert.deepEqual(solve(make('build-more', 'Give the robot two antennas and legs. It has more eyes than antennas.', [row('antennas', 2, 3, 1), row('eyes', 1, 3, 2), legs])), { antennas: 2, eyes: 3, bottom: 'legs' });
  assert.deepEqual(solve(make('build-most', 'Give the robot the most buttons, the fewest eyes and claws.', [row('eyes', 3, 2, 4), row('buttons', 1, 4, 2), arms])), { eyes: 2, buttons: 4, arms: 'claws' });
  assert.deepEqual(solve(make('build-same', 'Give the robot three eyes and a jet. It has the same number of buttons as eyes.', [row('eyes', 1, 3, 2), row('buttons', 3, 4, 1), legs])), { eyes: 3, buttons: 3, bottom: 'jet' });
  assert.deepEqual(solve(make('build-neither', 'The head is neither round nor square. Give the robot claws, a green nose and a blue body.', [heads, row('nose', 'red', 'green', 'blue'), row('body', 'green', 'blue', 'red'), arms])), { head: 'pointy', nose: 'green', body: 'blue', arms: 'claws' });
  const ifSay = (given) => `If the robot has wheels, it gets two antennas. If it has legs, it gets three antennas. Give it ${given} and a round head.`;
  const ifRows = [row('antennas', 3, 0, 2), heads, legs];
  assert.deepEqual(solve(make('build-if', ifSay('legs'), ifRows)), { antennas: 3, head: 'round', bottom: 'legs' });
  assert.deepEqual(solve(make('build-if', ifSay('wheels'), ifRows)), { antennas: 2, head: 'round', bottom: 'wheels' });
  assert.throws(() => solve(make('build-if', ifSay('a jet'), ifRows)), /no rule applies/); // neither "if" happens: no answer
  const unlessSay = (given) => `The robot gets three eyes, unless it has a jet. If it has a jet, it gets one eye instead. Give it ${given} and claws.`;
  const unlessRows = [row('eyes', 1, 2, 3), arms, legs];
  assert.deepEqual(solve(make('build-unless', unlessSay('a jet'), unlessRows)), { eyes: 1, arms: 'claws', bottom: 'jet' });
  assert.deepEqual(solve(make('build-unless', unlessSay('legs'), unlessRows)), { eyes: 3, arms: 'claws', bottom: 'legs' });
  assert.deepEqual(solve(make('build-place', 'Pick the last head and the second body. The robot also needs two eyes and claws.', [heads, row('eyes', 2, 4, 3), row('body', 'red', 'blue', 'green', 'yellow'), arms])), { head: 'round', eyes: 2, body: 'blue', arms: 'claws' });
  assert.deepEqual(solve(make('build-sum', 'This robot has two eyes and one more button than eyes. Give it claws.', [row('eyes', 2, 3, 1), row('buttons', 2, 3, 4), arms])), { eyes: 2, buttons: 3, arms: 'claws' });
  assert.deepEqual(solve(make('build-sum', 'This robot has two eyes and twice as many buttons as eyes. Give it claws.', [row('eyes', 2, 3, 1), row('buttons', 2, 3, 4), arms])), { eyes: 2, buttons: 4, arms: 'claws' });
  const eyes = row('eyes', 4, 2, 3);
  const changeRows = [heads, eyes, legs];
  assert.deepEqual(solve(make('build-change', 'Give the robot four eyes, a round head and wheels. Wait, no. Not wheels. Give it a jet.', changeRows)), { head: 'round', eyes: 4, bottom: 'jet' });
  assert.deepEqual(solve(make('build-change', 'Build a robot with four eyes, a round head and wheels. Wait, no. Not four eyes. Give it two eyes.', changeRows)), { head: 'round', eyes: 2, bottom: 'wheels' });

  // What must be refused:
  assert.throws(() => solve(make('build-new', 'Give the robot a round head and wheels.', [heads, legs])), /no independent rule/);
  assert.throws(() => solve(make('build-list', 'Give the robot a round head.', [heads, legs])), /says nothing about the bottom row/);
  assert.throws(() => solve(make('build-list', 'Give the robot a round head and big wheels.', [heads, legs])), /did not understand/);
  assert.throws(() => solve(make('build-list', 'Give the robot a round head and claws.', [heads, legs])), /has no row/);
  assert.throws(() => solve(make('build-notnot', 'The head is not round and not round. Give the robot legs.', [heads, legs])), /2 options fit/);
  assert.throws(() => solve(make('build-more', 'Give the robot one antenna and legs. It has more eyes than antennas.', [row('antennas', 2, 3, 1), row('eyes', 1, 3, 2), legs])), /2 options fit/);
  assert.throws(() => solve(make('build-list', 'Give the robot a green head and wheels.', [heads, legs])), /did not understand|says nothing/);
  assert.throws(() => solve(make('build-size', 'Give the robot the bigger wheels and claws.', [arms, row('bottom', 'wheels', 'wheels-big', 'legs')])), /exactly two sizes/);
  // something after a "not ..." in the same sentence
  assert.throws(() => solve(make('build-not', 'Give the robot wheels, not legs. It also needs a pointy head, not a round one, and claws.', [heads, arms, legs])), /must not be worded like this/);
  // an order is never checked, so it may never be spoken
  assert.throws(() => solve(make('build-list', 'Give the robot a round head. Then give it wheels.', [heads, legs])), /did not understand/);
  assert.throws(() => solve(make('build-list', 'Before you give the robot a round head, give it wheels.', [heads, legs])), /did not understand/);
  // "unless ... Then ..." (can be heard as "and next") and an "if" about a different exception
  assert.throws(() => solve(make('build-unless', 'The robot gets three eyes, unless it has a jet. Then it gets one eye. Give it legs and claws.', unlessRows)), /did not understand|must contain/);
  assert.throws(() => solve(make('build-unless', 'The robot gets three eyes, unless it has a jet. If it has wheels, it gets one eye instead. Give it legs and claws.', unlessRows)), /same exception/);
  // a change of plan: about a part that was not said, about a different thing than was said, said twice,
  // to a picture that is not there, without a change, in a sentence of another kind, or with two changes
  assert.throws(() => solve(make('build-change', 'Give the robot four eyes and a round head. Wait, no. Not wheels. Give it a jet.', changeRows)), /not said \(once\) before/);
  assert.throws(() => solve(make('build-change', 'Give the robot four eyes, a round head and legs. Wait, no. Not wheels. Give it a jet.', changeRows)), /not said \(once\) before/);
  assert.throws(() => solve(make('build-change', 'Give the robot wheels, a round head and wheels. Wait, no. Not wheels. Give it a jet.', [heads, legs])), /not said \(once\) before/);
  assert.throws(() => solve(make('build-change', 'Give the robot one eye, a round head and wheels. Wait, no. Not one eye. Give it two eyes.', changeRows)), /0 options fit/);
  assert.throws(() => solve(make('build-change', 'Give the robot four eyes, a round head and wheels. Wait, no. Not wheels. Give it wheels.', changeRows)), /must change something/);
  assert.throws(() => solve(make('build-change', 'Give the robot four eyes, a round head and wheels. Wait, no. Not wheels. Give it claws.', changeRows)), /same part/);
  assert.throws(() => solve(make('build-change', 'Give the robot four eyes, a round head and wheels.', changeRows)), /frame/);
  assert.throws(() => solve(make('build-list', 'Give the robot four eyes, a round head and wheels. Wait, no. Not wheels. Give it a jet.', changeRows)), /did not understand|2 options|0 options/);
  assert.throws(() => solve(make('build-change', 'Give the robot four eyes, a round head and wheels. Wait, no. Not four eyes. Give it two eyes. Wait, no. Not wheels. Give it a jet.', changeRows)), /frame|did not understand/);
  // "both" and arithmetic are no longer part of a neither / place sentence
  assert.throws(() => solve(make('build-place', 'Pick the last head. This robot has two eyes and twice as many buttons as eyes.', [heads, row('eyes', 2, 4, 3), row('buttons', 2, 3, 4)])), /did not understand/);
});
