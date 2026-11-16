// An INDEPENDENT check of every "truth" item (the picture + one statement that is true or not).
//
// The generators (tools/content/worlds/truth.mjs) decide while they build a picture whether the
// statement is true. This file decides it a second time, from scratch: it parses the spoken
// sentence with regular expressions, looks at the finished picture, and insists that the two
// agree. It shares no code with the generators and never reads item.expect to decide.
// A sentence pattern (`v`) with no rule here fails the test - add its rule first.
//
// It also checks that nothing debatable is ever said (see the notes on each rule) and that a
// statement that is not true is a near miss.
//
//   LWM_ITEMS_DIR=tests/e2e/out/truth node --test tests/unit/oracle-truth.test.mjs    (a preview folder)

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { OBJECT_KINDS, CHARACTER_KINDS } from '../../src/art/sprites.js';
import { itemsOfType, ROOT } from './oracles/load.mjs';

const COLOURS = ['red', 'blue', 'green', 'yellow', 'purple', 'orange'];
const SIZES = ['big', 'small'];
const KINDS = [...OBJECT_KINDS, ...CHARACTER_KINDS];
const NUMBERS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6 };
const SOUND_ALIKE = [['boot', 'book'], ['heart', 'hat'], ['coin', 'crown']];
const TWO_TONE = ['torch', 'rocket', 'drum']; // yellow flames, pale drum skin with brown sticks: "is it yellow?" could be argued about

// --- the pieces sentences are made of (each one captures its words) ---
const COL = `(${COLOURS.join('|')})`;
const SIZE = `(${SIZES.join('|')})`;
const KIND = `(${KINDS.join('|')})`;
const MANY = `(${KINDS.join('|')})(?:es|s)`; // "gems", "torches"
const NUM = `(${Object.keys(NUMBERS).join('|')})`;
const NP = `(?:${COL} )?${KIND}`; // "key" or "red key" (two captures)
const re = (...parts) => new RegExp(`^${parts.join('')}$`);

// --- looking at the picture ---
const isSo = (o, word) => (COLOURS.includes(word) ? o.color === word : SIZES.includes(word) ? o.size === word : assert.fail(`not a colour or a size: ${word}`));
const ofKind = (it, kind) => it.scene.objects.filter((o) => o.kind === kind);
const count = (it, f) => it.scene.objects.filter(f).length;
const note = (it, ok, why) => assert.ok(ok, `${it.id} "${it.say}": ${why}`);

/** "the key" / "the red key": exactly one thing in the picture may fit, or the sentence is unclear. */
function the(it, kind, colour) {
  const hits = it.scene.objects.filter((o) => o.kind === kind && (!colour || o.color === colour));
  note(it, hits.length === 1, `"the ${colour ? `${colour} ` : ''}${kind}" fits ${hits.length} things`);
  if (colour) note(it, ofKind(it, kind).length > 1, `the colour word in "the ${colour} ${kind}" is not needed`);
  return hits[0];
}
/** A group that is talked about ("all the keys", "more keys than...") has to be in the picture. */
function group(it, kind, min = 1) {
  const hits = ofKind(it, kind);
  note(it, hits.length >= min, `"${kind}s" needs at least ${min} in the picture, there are ${hits.length}`);
  return hits;
}
/** A size word is only fair when the picture shows both sizes; a colour word when that colour is in it. */
function fair(it, word) {
  if (SIZES.includes(word)) note(it, SIZES.every((s) => count(it, (o) => o.size === s) > 0), `"${word}" is said but the picture does not show both sizes`);
  else note(it, count(it, (o) => o.color === word) > 0 || /\b(no|not|none|neither)\b/i.test(it.say), `"${word}" is said but nothing in the picture is ${word}`);
}
const pos = (it, o) => it.scene.objects.indexOf(o);
function row(it) {
  note(it, it.scene.cols === it.scene.objects.length, 'a statement about places needs a single row');
  return it.scene.objects.length;
}
const near = (it, a, b) => note(it, Math.abs(a - b) <= 1, `the numbers ${a} and ${b} are not a near miss`);

// --- single facts: each returns true or false for a picture ---
const more = (word, a, b) => (word === 'more' ? a > b : word === 'fewer' ? a < b : assert.fail(word));
function allAre(it, kind, word) {
  fair(it, word);
  const g = group(it, kind, 2);
  const n = g.filter((o) => isSo(o, word)).length;
  note(it, n >= g.length - 1, `"all" with ${g.length - n} that are not is not a near miss`);
  return n === g.length;
}
function noneAre(it, kind, word) {
  fair(it, word);
  const n = group(it, kind, 2).filter((o) => isSo(o, word)).length;
  note(it, n <= 1, `"none" with ${n} that are is not a near miss`);
  note(it, count(it, (o) => isSo(o, word)) > n, `nothing else is ${word}, so the thing word is not needed`);
  return n === 0;
}
function countIs(it, n, f) {
  const real = count(it, f);
  near(it, real, n);
  return real === n; // a number is true only when it is exactly right
}

/** One rule per sentence pattern: [pattern of the sentence, (words, item) => the facts it states]. All facts true = true. */
const RULES = {
  // ---- 1: one fact
  'there-is-colour': [re('There is an? ', COL, ' ', KIND, '\\.'), ([c, k], it) => {
    note(it, ofKind(it, k).some((o) => o.color !== c), `no ${k} of another colour: the colour word is not needed`);
    note(it, count(it, (o) => o.color === c && o.kind !== k) > 0, `no other ${c} thing: the thing word is not needed`);
    return [count(it, (o) => o.kind === k && o.color === c) > 0];
  }],
  'the-is-colour': [re('The ', KIND, ' is ', COL, '\\.'), ([k, c], it) => { fair(it, c); return [the(it, k).color === c]; }],
  'there-is-size': [re('There is a ', SIZE, ' ', KIND, '\\.'), ([s, k], it) => {
    fair(it, s);
    note(it, ofKind(it, k).some((o) => o.size !== s), `no ${k} of the other size: the size word is not needed`);
    note(it, count(it, (o) => o.size === s && o.kind !== k) > 0, `no other ${s} thing: the thing word is not needed`);
    return [count(it, (o) => o.kind === k && o.size === s) > 0];
  }],
  'the-is-size': [re('The ', KIND, ' is ', SIZE, '\\.'), ([k, s], it) => { fair(it, s); return [the(it, k).size === s]; }],

  // ---- 2: counting
  'count-kind': [re('There (?:is|are) ', NUM, ' ', MANY, '\\.'), ([n, k], it) => [countIs(it, NUMBERS[n], (o) => o.kind === k)]],
  'count-colour': [re('There (?:is|are) ', NUM, ' ', COL, ' things\\.'), ([n, c], it) => [countIs(it, NUMBERS[n], (o) => o.color === c)]],
  'count-size': [re('There (?:is|are) ', NUM, ' ', SIZE, ' things\\.'), ([n, s], it) => { fair(it, s); return [countIs(it, NUMBERS[n], (o) => o.size === s)]; }],
  'count-colour-kind': [re('There (?:is|are) ', NUM, ' ', COL, ' ', MANY, '\\.'), ([n, c, k], it) => {
    note(it, ofKind(it, k).some((o) => o.color !== c), `every ${k} is ${c}: the colour word is not needed`);
    note(it, count(it, (o) => o.color === c && o.kind !== k) > 0, `only ${k}s are ${c}: the thing word is not needed`);
    return [countIs(it, NUMBERS[n], (o) => o.kind === k && o.color === c)];
  }],

  // ---- 3: all, none, some
  'all-colour': [re('All the ', MANY, ' are ', COL, '\\.'), ([k, c], it) => [allAre(it, k, c)]],
  'all-size': [re('All the ', MANY, ' are ', SIZE, '\\.'), ([k, s], it) => [allAre(it, k, s)]],
  'none-colour': [re('None of the ', MANY, ' are ', COL, '\\.'), ([k, c], it) => [noneAre(it, k, c)]],
  'none-size': [re('None of the ', MANY, ' are ', SIZE, '\\.'), ([k, s], it) => [noneAre(it, k, s)]],
  'some-colour': [re('Some of the ', MANY, ' are ', COL, '\\.'), (m, it) => some(it, m)],
  'some-size': [re('Some of the ', MANY, ' are ', SIZE, '\\.'), (m, it) => some(it, m)],

  // ---- 4: comparing
  'more-kind': [re('There are (more) ', MANY, ' than ', MANY, '\\.'), (m, it) => compareKinds(it, m)],
  'fewer-kind': [re('There are (fewer) ', MANY, ' than ', MANY, '\\.'), (m, it) => compareKinds(it, m)],
  'more-colour': [re('There are (more) ', COL, ' things than ', COL, ' things\\.'), (m, it) => compareColours(it, m)],
  'fewer-colour': [re('There are (fewer) ', COL, ' things than ', COL, ' things\\.'), (m, it) => compareColours(it, m)],
  'as-many-kind': [re('There are as many ', MANY, ' as ', MANY, '\\.'), ([k1, k2], it) => {
    const [a, b] = [group(it, k1).length, group(it, k2).length];
    near(it, a, b);
    return [a === b];
  }],
  'as-many-colour': [re('There are as many ', COL, ' things as ', COL, ' things\\.'), ([c1, c2], it) => {
    const [a, b] = [count(it, (o) => o.color === c1), count(it, (o) => o.color === c2)];
    note(it, a > 0 && b > 0, 'a colour that is compared is not in the picture');
    near(it, a, b);
    return [a === b];
  }],
  bigger: [re('The ', KIND, ' is (bigger) than the ', KIND, '\\.'), (m, it) => sizes(it, m)],
  smaller: [re('The ', KIND, ' is (smaller) than the ', KIND, '\\.'), (m, it) => sizes(it, m)],

  // ---- 5: where (a single row, places counted from the left)
  'next-to': [re('The ', NP, ' is next to the ', NP, '\\.'), ([c1, k1, c2, k2], it) => {
    row(it);
    const d = Math.abs(pos(it, the(it, k1, c1)) - pos(it, the(it, k2, c2)));
    note(it, d <= 2, 'not next to it by a long way is not a near miss');
    return [d === 1];
  }],
  'left-of': [re('The ', NP, ' is to the (left) of the ', NP, '\\.'), (m, it) => sideOf(it, m)],
  'right-of': [re('The ', NP, ' is to the (right) of the ', NP, '\\.'), (m, it) => sideOf(it, m)],
  between: [re('The ', NP, ' is between the ', NP, ' and the ', NP, '\\.'), ([c1, k1, c2, k2, c3, k3], it) => {
    row(it);
    const [a, b, c] = [pos(it, the(it, k1, c1)), pos(it, the(it, k2, c2)), pos(it, the(it, k3, c3))];
    note(it, new Set([a, b, c]).size === 3, 'between needs three different things');
    const yes = (a - b) * (a - c) < 0;
    // only clear-cut pictures: the three stand side by side, and it is either in the middle of them or not
    note(it, Math.max(a, b, c) - Math.min(a, b, c) === 2, 'the three things do not stand side by side');
    return [yes];
  }],
  'left-end': [re('The ', NP, ' is at the (left) end of the row\\.'), (m, it) => atEnd(it, m)],
  'right-end': [re('The ', NP, ' is at the (right) end of the row\\.'), (m, it) => atEnd(it, m)],
  middle: [re('The ', NP, ' is in the middle of the row\\.'), ([c, k], it) => {
    const n = row(it);
    note(it, n % 2 === 1, 'a row with an even number of things has no middle');
    const d = Math.abs(pos(it, the(it, k, c)) - (n - 1) / 2);
    note(it, d <= 1, 'far from the middle is not a near miss');
    return [d === 0];
  }],
  'second-from-left': [re('The second thing from the (left) is an? ', NP, '\\.'), (m, it) => second(it, m)],
  'second-from-right': [re('The second thing from the (right) is an? ', NP, '\\.'), (m, it) => second(it, m)],

  // ---- 6: two facts joined
  'and-no': [re('There is an? ', COL, ' ', KIND, ' and no ', COL, ' ', KIND, '\\.'), ([c1, k1, c2, k2], it) => {
    for (const [c, k] of [[c1, k1], [c2, k2]]) {
      note(it, count(it, (o) => o.kind === k && o.color !== c) > 0, `no ${k} of another colour than ${c}`);
      note(it, count(it, (o) => o.color === c && o.kind !== k) > 0, `no other ${c} thing than a ${k}`);
    }
    return [count(it, (o) => o.kind === k1 && o.color === c1) > 0, count(it, (o) => o.kind === k2 && o.color === c2) === 0];
  }],
  'but-not': [re('The ', KIND, ' is ', COL, ', but the ', KIND, ' is not ', COL, '\\.'), ([k1, c1, k2, c2], it) => {
    note(it, count(it, (o) => o.color === c1) > 0 && count(it, (o) => o.color === c2) > 0, 'a colour that is said is not in the picture');
    return [the(it, k1).color === c1, the(it, k2).color !== c2];
  }],
  'neither-colour': [re('Neither the ', KIND, ' nor the ', KIND, ' is ', COL, '\\.'), (m, it) => pair(it, m, (n) => n === 0, [0, 1])],
  'neither-size': [re('Neither the ', KIND, ' nor the ', KIND, ' is ', SIZE, '\\.'), (m, it) => pair(it, m, (n) => n === 0, [0, 1])],
  // "either ... or" is never said when both are so (then people would disagree about it)
  'either-colour': [re('Either the ', KIND, ' or the ', KIND, ' is ', COL, '\\.'), (m, it) => pair(it, m, (n) => n === 1, [0, 1])],
  'either-size': [re('Either the ', KIND, ' or the ', KIND, ' is ', SIZE, '\\.'), (m, it) => pair(it, m, (n) => n === 1, [0, 1])],
  'both-colour': [re('Both the ', KIND, ' and the ', KIND, ' are ', COL, '\\.'), (m, it) => pair(it, m, (n) => n === 2, [1, 2])],
  'both-size': [re('Both the ', KIND, ' and the ', KIND, ' are ', SIZE, '\\.'), (m, it) => pair(it, m, (n) => n === 2, [1, 2])],
  'all-except': [re('Everything is ', COL, ' except the ', KIND, '\\.'), ([c, k], it) => {
    // one fact: the things that are NOT that colour are the key, and nothing else
    const odd = the(it, k);
    const different = it.scene.objects.filter((o) => o.color !== c);
    note(it, count(it, (o) => o.color === c) >= 4, 'too few things of that colour for "everything"');
    note(it, different.length <= 2, `${different.length} things are not ${c}: not a near miss`);
    return [different.length === 1 && different[0] === odd];
  }],

  // ---- 7: two-part statements (said while the picture is covered)
  'more-and-none': [re('There are (more) ', COL, ' things than ', COL, ' things, and none of the ', MANY, ' are ', SIZE, '\\.'), ([w, c1, c2, k, s], it) =>
    [...compareColours(it, [w, c1, c2]), noneAre(it, k, s)]],
  'count-and-all-colour': [re('There are ', NUM, ' ', MANY, ', and all of them are ', COL, '\\.'), ([n, k, c], it) => [countIs(it, NUMBERS[n], (o) => o.kind === k), allAre(it, k, c)]],
  'count-and-all-size': [re('There are ', NUM, ' ', MANY, ', and all of them are ', SIZE, '\\.'), ([n, k, s], it) => [countIs(it, NUMBERS[n], (o) => o.kind === k), allAre(it, k, s)]],
  'fewer-but-more': [re('There are (fewer) ', MANY, ' than ', MANY, ', but (more) ', MANY, ' than ', MANY, '\\.'), ([w1, k1, k2, w2, k1again, k3], it) => {
    note(it, k1 === k1again && new Set([k1, k2, k3]).size === 3, 'both parts must be about the same thing, compared with two others');
    return [...compareKinds(it, [w1, k1, k2]), ...compareKinds(it, [w2, k1, k3])];
  }],
  'none-but-count': [re('None of the ', MANY, ' are ', COL, ', but ', NUM, ' of the ', MANY, ' are\\.'), ([k1, c, n, k2], it) => {
    note(it, k1 !== k2, 'the two parts are about the same thing');
    const g = group(it, k2, 2);
    note(it, g.some((o) => o.color !== c), `every ${k2} is ${c}: "${n} of the" is odd`);
    // "two of them are" when three are could be argued about, so the number is never too small
    note(it, g.filter((o) => o.color === c).length <= NUMBERS[n], `more than ${n} of the ${k2}s are ${c}: people could disagree`);
    return [noneAre(it, k1, c), countIs(it, NUMBERS[n], (o) => o.kind === k2 && o.color === c)];
  }],
  'all-but-one-and-more': [re('All but one of the ', MANY, ' are ', COL, ', and there are (more) ', MANY, ' than ', MANY, '\\.'), ([k1, c, w, k1again, k2], it) => {
    note(it, k1 === k1again, 'both parts must be about the same thing');
    const g = group(it, k1, 3);
    const different = g.filter((o) => o.color !== c).length;
    near(it, different, 1);
    return [different === 1, ...compareKinds(it, [w, k1, k2])];
  }],
  'all-and-count': [re('All the ', MANY, ' are ', SIZE, ', and there are ', NUM, ' ', COL, ' things\\.'), ([k, s, n, c], it) => [allAre(it, k, s), countIs(it, NUMBERS[n], (o) => o.color === c)]],
};

/** "Some of the keys are red": called true only for two or more but not all, and not true only for none at all. */
function some(it, [k, word]) {
  fair(it, word);
  const g = group(it, k, 3);
  const n = g.filter((o) => isSo(o, word)).length;
  note(it, n === 0 || (n >= 2 && n < g.length), `${n} of ${g.length}: people could disagree about "some"`);
  if (n === 0) note(it, count(it, (o) => isSo(o, word)) > 0, `nothing at all is ${word}`);
  return [n >= 2];
}
function compareKinds(it, [word, k1, k2]) {
  const [a, b] = [group(it, k1).length, group(it, k2).length];
  note(it, Math.abs(a - b) <= 2, `${a} against ${b}: too far apart to need counting`);
  return [more(word, a, b)];
}
function compareColours(it, [word, c1, c2]) {
  const [a, b] = [count(it, (o) => o.color === c1), count(it, (o) => o.color === c2)];
  note(it, a > 0 && b > 0 && c1 !== c2, 'a colour that is compared is not in the picture');
  note(it, Math.abs(a - b) <= 2, `${a} against ${b}: too far apart to need counting`);
  return [more(word, a, b)];
}
/** "The key is bigger than the gem": only ever said about one big thing and one small thing. */
function sizes(it, [k1, word, k2]) {
  const [a, b] = [the(it, k1), the(it, k2)];
  note(it, a.size !== b.size, 'two things of the same size class: which is bigger is a matter of opinion');
  return [word === 'bigger' ? a.size === 'big' : a.size === 'small'];
}
/** "to the left of": called true only when it stands directly beside it on that side; not true only when it is on the other side. */
function sideOf(it, [c1, k1, side, c2, k2]) {
  row(it);
  const [a, b] = [pos(it, the(it, k1, c1)), pos(it, the(it, k2, c2))];
  const yes = side === 'left' ? a < b : a > b;
  if (yes) note(it, Math.abs(a - b) === 1, 'on that side but not directly beside it: people could disagree');
  else note(it, Math.abs(a - b) <= 2, 'far away on the other side is not a near miss');
  return [yes];
}
function atEnd(it, [c, k, side]) {
  const n = row(it);
  const a = pos(it, the(it, k, c));
  const end = side === 'left' ? 0 : n - 1;
  note(it, a === end || a === n - 1 - end || Math.abs(a - end) === 1, 'not at an end and not next to that end: not a near miss');
  return [a === end];
}
function second(it, [side, c, k]) {
  const n = row(it);
  note(it, n >= 5, 'the row is too short for "second from the left" and "second from the right" to differ');
  const o = it.scene.objects[side === 'left' ? 1 : n - 2];
  the(it, k, c); // the thing that is named must be in the row, once
  return [o.kind === k && (!c || o.color === c)];
}
/** "Neither / either / both the key (and, or, nor) the bell is red": how many of the two are so. */
function pair(it, [k1, k2, word], rule, allowed) {
  fair(it, word);
  note(it, k1 !== k2, 'the same thing twice');
  const n = [the(it, k1), the(it, k2)].filter((o) => isSo(o, word)).length;
  note(it, allowed.includes(n), `${n} of the two are ${word}: not clear-cut or not a near miss`);
  note(it, count(it, (o) => isSo(o, word)) > n, `nothing else is ${word}`);
  return [rule(n)];
}

/** The oracle: every fact the sentence states, worked out from the sentence and the picture. */
function facts(it) {
  const rule = RULES[it.v];
  assert.ok(rule, `${it.id}: no independent rule for pattern "${it.v}" - add one to tests/unit/oracle-truth.test.mjs`);
  const m = rule[0].exec(it.say);
  assert.ok(m, `${it.id}: "${it.say}" does not look like pattern "${it.v}"`);
  return rule[1](m.slice(1), it);
}

const items = itemsOfType('truth');
const preview = !!process.env.LWM_ITEMS_DIR;
const built = preview || JSON.parse(readFileSync(join(ROOT, 'assets', 'data', 'listening', 'levels.json'), 'utf8')).worlds.some((w) => w.id === 'truth');
const skip = built ? false : 'the Truth Detector world is not in the game data yet (npm run build)';
const levelOf = (it) => it.id.replace(/-\d+$/, '');

test('truth: the answer worked out from the sentence and the picture matches the stored answer', { skip }, () => {
  for (const it of items) {
    const f = facts(it);
    assert.ok(f.length >= 1 && f.every((x) => typeof x === 'boolean'), it.id);
    assert.equal(f.every(Boolean), it.expect, `${it.id}: "${it.say}" is ${f.every(Boolean) ? 'TRUE' : 'NOT TRUE'} in its picture, but the stored answer says otherwise`);
  }
  assert.ok(items.length >= (preview ? 1 : 100), `only ${items.length} truth items`);
});

test('truth: a statement that is not true is a near miss - exactly one of its facts is wrong', { skip }, () => {
  for (const it of items) {
    const wrong = facts(it).filter((x) => !x).length;
    if (!it.expect) assert.equal(wrong, 1, `${it.id}: "${it.say}" has ${wrong} wrong facts`);
  }
});

test('truth: an oracle that cannot be fooled - a changed picture or sentence changes its answer', { skip }, () => {
  // (guards the oracle itself: if it just agreed with everything, these would not flip)
  const flip = { red: 'blue', blue: 'green', green: 'yellow', yellow: 'purple', purple: 'orange', orange: 'red' };
  let flipped = 0;
  for (const it of items.filter((x) => x.v === 'the-is-colour')) {
    const [kind] = /^The (\w+) is/.exec(it.say).slice(1);
    const other = { ...it, scene: { ...it.scene, objects: it.scene.objects.map((o) => (o.kind === kind ? { ...o, color: it.expect ? flip[o.color] : it.say.match(/is (\w+)\.$/)[1] } : o)) } };
    let now;
    try { now = facts(other).every(Boolean); } catch { continue; } // (the changed picture may no longer be a fair one)
    assert.equal(now, !it.expect, it.id);
    flipped++;
  }
  if (items.some((x) => x.v === 'the-is-colour')) assert.ok(flipped > 0);
  assert.throws(() => facts({ id: 'x', v: 'no-such-pattern', say: 'The key is red.', scene: { cols: 1, objects: [] } }), /no independent rule/);
  assert.throws(() => facts({ id: 'x', v: 'the-is-colour', say: 'The key is not red.', scene: { cols: 1, objects: [] } }), /does not look like/);
});

test('truth: every item is well formed, fair to hear, and answered with one tap', { skip }, () => {
  for (const it of items) {
    assert.equal(typeof it.expect, 'boolean', it.id);
    assert.equal(it.auto, true, it.id);
    assert.ok(it.s.includes('truth'), `${it.id}: needs the "truth" skill tag`);
    const objs = it.scene.objects;
    assert.ok(objs.length >= 4 && objs.length <= 10, `${it.id}: ${objs.length} things in the picture`);
    for (const o of objs) assert.ok(KINDS.includes(o.kind) && COLOURS.includes(o.color) && SIZES.includes(o.size), `${it.id}: ${JSON.stringify(o)}`);
    for (const [a, b] of SOUND_ALIKE) assert.ok(!(objs.some((o) => o.kind === a) && objs.some((o) => o.kind === b)), `${it.id}: ${a} and ${b} sound alike`);
    // a statement about colours must not be arguable: no art with a part in another colour (flames, drum skin)
    for (const o of objs) assert.ok(!TWO_TONE.includes(o.kind), `${it.id}: a ${o.kind} is drawn in two colours`);
    assert.match(it.say, /^[A-Z][A-Za-z ,]*\.$/, `${it.id}: plain words only`);
    assert.ok(it.say.split(' ').length <= 35, `${it.id}: too long`);
    // every thing, colour and size word that is spoken is about this picture
    for (const w of it.say.toLowerCase().match(/[a-z]+/g)) {
      const kind = KINDS.find((k) => w === k || w === `${k}s` || w === `${k}es`);
      if (kind) assert.ok(objs.some((o) => o.kind === kind), `${it.id}: says "${w}" but the picture has none`);
    }
    if (it.hide) assert.ok(it.s.includes('hidden'), `${it.id}: a covered picture needs the "hidden" skill tag`);
  }
});

test('truth: every level is half true and half not true, with no pattern that gives the answer away', { skip }, () => {
  const levels = new Map();
  for (const it of items) levels.set(levelOf(it), [...(levels.get(levelOf(it)) || []), it]);
  for (const [id, list] of levels) {
    for (const it of list) assert.equal(it.g, it.expect ? 'yes' : 'no', `${it.id}: quota group`);
    const yes = list.filter((it) => it.expect).length;
    assert.equal(yes * 2, list.length, `${id}: ${yes} of ${list.length} are true`);
    assert.ok(list.length >= 18, `${id}: only ${list.length} items`);
    assert.equal(new Set(list.map((it) => it.say)).size, list.length, `${id}: a sentence is used twice`);
    // several different patterns per level, and no family of patterns that is always true or always not true
    const families = new Map();
    for (const it of list) {
      const fam = it.v.replace(/-(colour|size|kind)$/, '').replace(/^(left|right)-|-(left|right)$/g, '').replace(/^(more|fewer)$/, 'more-fewer').replace(/^(bigger|smaller)$/, 'bigger-smaller');
      families.set(fam, [...(families.get(fam) || []), it.expect]);
    }
    assert.ok(new Set(list.map((it) => it.v)).size >= 4, `${id}: too few kinds of sentence for a varied mission`);
    for (const [fam, answers] of families) assert.equal(new Set(answers).size, 2, `${id}: "${fam}" sentences are always ${answers[0] ? 'true' : 'not true'}`);
    // the number of things in the picture must not give the answer away either
    const sizes = (flag) => list.filter((it) => it.expect === flag).map((it) => it.scene.objects.length);
    const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
    assert.ok(Math.abs(mean(sizes(true)) - mean(sizes(false))) <= 1, `${id}: true pictures (${mean(sizes(true)).toFixed(1)} things) and not-true pictures (${mean(sizes(false)).toFixed(1)}) differ in size`);
  }
});
