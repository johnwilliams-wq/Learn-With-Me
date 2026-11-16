// An INDEPENDENT check of every "paint" item (the Paint Shop).
//
// The generators (tools/content/worlds/paint.mjs) decide which thing gets which colour while
// they build each picture. This file works the answer out a second time, from scratch, by
// reading only the spoken sentence and the finished picture - and insists the two agree.
// It shares no code with the generators and never looks at item.expect to decide.
// A new sentence pattern (`v`) must get its own rule in RULES before this test passes.
//
//   node --test tests/unit/oracle-paint.test.mjs                                    the real game data
//   LWM_ITEMS_DIR=tests/e2e/out/paint node --test tests/unit/oracle-paint.test.mjs  a preview folder

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { itemsOfType, ROOT } from './oracles/load.mjs';
import { OBJECT_KINDS, CHARACTER_KINDS } from '../../src/art/sprites.js';

const COLORS = ['red', 'blue', 'green', 'yellow', 'purple', 'orange'];
const KINDS = [...OBJECT_KINDS, ...CHARACTER_KINDS];
const SOUND_ALIKE = [['boot', 'book'], ['heart', 'hat'], ['coin', 'crown']];
const C = `(${COLORS.join('|')})`;
const K = `(${KINDS.join('|')})`;
const SZ = '(big|small)';
const ORD = '(first|second|third|fourth|fifth)';
const NTH = { first: 1, second: 2, third: 3, fourth: 4, fifth: 5 };
const re = (src) => new RegExp(`^${src}$`);

// ---- reading the sentence -------------------------------------------------------------------

/** The parts of the sentence a pattern captures - or a failure that names the pattern. */
function rx(it, src) {
  const m = re(src).exec(it.say);
  assert.ok(m, `${it.id}: "${it.say}" does not look like pattern "${it.v}"`);
  return m.slice(1);
}
/** "keys" -> "key", "torches" -> "torch" */
function singular(it, word) {
  const k = KINDS.find((x) => word === `${x}s` || word === `${x}es`);
  assert.ok(k, `${it.id}: "${word}" is not the plural of a thing`);
  return k;
}
/** "Paint A red, B blue, and C green." -> [['A', 'red'], ['B', 'blue'], ['C', 'green']] (and nothing left over) */
function clauses(it, count) {
  const parts = [...it.say.matchAll(new RegExp(`(?:^Paint |, and |, | and )(.+?) ${C}(?=, and |, | and |\\.$)`, 'g'))].map((m) => [m[1], m[2]]);
  const said = parts.map(([p, c]) => `${p} ${c}`);
  const joined = said.length < 3 ? said.join(' and ') : `${said.slice(0, -1).join(', ')}, and ${said.at(-1)}`;
  assert.equal(`Paint ${joined}.`, it.say, `${it.id}: could not read every part of "${it.say}"`);
  assert.equal(parts.length, count, `${it.id}: expected ${count} paint jobs in "${it.say}"`);
  return parts;
}

// ---- reading the picture ----------------------------------------------------------------------

const things = (it) => it.scene.objects;
const ids = (list) => list.map((o) => o.id);
function single(it, hits, what) {
  assert.equal(hits.length, 1, `${it.id}: "${it.say}" - ${what} should be exactly one thing, found ${hits.length}`);
  return hits[0];
}
function rowOf(it) {
  assert.equal(it.scene.cols, things(it).length, `${it.id}: "${it.say}" talks about places, so the things must stand in one row`);
  return things(it);
}
/** "the key" (the only one) or "the big key" (and then a small key must be there too, or "big" is not needed). */
function named(it, kind, size) {
  if (!size) return single(it, things(it).filter((o) => o.kind === kind), `the ${kind}`);
  const hit = single(it, things(it).filter((o) => o.kind === kind && o.size === size), `the ${size} ${kind}`);
  assert.ok(things(it).some((o) => o.kind === kind && o.size !== size), `${it.id}: "${size}" is not needed - there is no other ${kind}`);
  return hit;
}
/** "the bell" = the only one; "the bells" = all of them, and there must be several. (With a size: only that size.) */
function oneOrAll(it, word, size) {
  const fits = (kind) => things(it).filter((o) => o.kind === kind && (!size || o.size === size));
  if (KINDS.includes(word)) return { kind: word, things: [single(it, fits(word), `the ${size || ''} ${word}`)] };
  const kind = singular(it, word);
  assert.ok(fits(kind).length >= 2, `${it.id}: "${word}" means more than one`);
  return { kind, things: fits(kind) };
}
function counted(it, list, word, side, what) {
  const n = NTH[word];
  assert.ok(n <= list.length, `${it.id}: there is no ${word} ${what}`);
  // counted from the other side it must be a different thing, or "from the ${side}" is not needed
  assert.notEqual(list[n - 1], list[list.length - n], `${it.id}: "${it.say}" - the ${word} ${what} is the same from both sides, so the side word is not needed`);
  return side === 'left' ? list[n - 1] : list[list.length - n];
}
/** "the one between the A and the B": exactly one thing stands between the two. */
function between(it, a, b) {
  const row = rowOf(it);
  const i = row.indexOf(named(it, a));
  const j = row.indexOf(named(it, b));
  assert.equal(Math.abs(i - j), 2, `${it.id}: exactly one thing must stand between the ${a} and the ${b}`);
  return row[(i + j) / 2];
}
/** "both things next to" a named thing: its neighbour on each side. */
function neighbours(it, kind) {
  const row = rowOf(it);
  const i = row.indexOf(named(it, kind));
  assert.ok(i > 0 && i < row.length - 1, `${it.id}: the ${kind} needs a neighbour on both sides`);
  return [row[i - 1], row[i + 1]];
}
/** Which sides a sentence counts from, in the order they are spoken: ['left', 'right'] */
const sidesSaid = (it) => [...it.say.matchAll(/ from the (left|right)\b/g)].map((m) => m[1]);

// ---- rules of wording that hold for every sentence ------------------------------------------------

/**
 * A bare place ("the first one", "the last two", "the one in the middle") straight after "from the right"
 * can be heard as counted from the right too. So a bare place is only ever said BEFORE any side is named.
 */
export function bareAfterSide(say) {
  const m = /\bfrom the (?:left|right)\b.*\b(the (?:first|last) (?:one|two)(?! from the (?:left|right)\b)|the one in the middle)/.exec(say);
  return m ? m[1] : null;
}
/** Patterns whose paint job may not happen at all: there the colour after a name is only a "maybe". */
const MAYBE = ['only-if', 'if-more'];
/**
 * A colour word straight after the name of a thing ("the ring yellow", "a crown yellow", "the keys red")
 * is heard as: that thing gets that colour. So it must be true - at least one such thing ends up that colour.
 */
export function colourAfterName(it, answer) {
  for (const [, kind, colour] of it.say.matchAll(new RegExp(`\\b${K}(?:es|s)? ${C}\\b`, 'g'))) {
    if (!things(it).some((o) => o.kind === kind && answer[o.id] === colour)) return `the ${kind} ${colour}`;
  }
  return null;
}

/** Every way a sentence can point at things: phrase type -> [pattern, (item, ...captures) => things]. */
const PHRASES = {
  thing: [`the ${K}`, (it, kind) => [named(it, kind)]],
  'sized-thing': [`the ${SZ} ${K}`, (it, size, kind) => [named(it, kind, size)]],
  first: ['the first one', (it) => [rowOf(it)[0]]],
  last: ['the last one', (it) => [rowOf(it).at(-1)]],
  'first-two': ['the first two', (it) => rowOf(it).slice(0, 2)],
  'last-two': ['the last two', (it) => rowOf(it).slice(-2)],
  middle: ['the one in the middle', (it) => {
    const row = rowOf(it);
    assert.equal(row.length % 2, 1, `${it.id}: a row of ${row.length} has no middle`);
    return [row[(row.length - 1) / 2]];
  }],
  nth: [`the ${ORD} one from the (left|right)`, (it, word, side) => [counted(it, rowOf(it), word, side, 'thing')]],
  'nth-kind': [`the ${ORD} ${K} from the (left|right)`, (it, word, kind, side) => {
    const row = rowOf(it);
    const mine = row.filter((o) => o.kind === kind);
    assert.ok(mine.length >= 2 && mine.length < row.length, `${it.id}: counting ${kind}s needs several of them among other things`);
    return [counted(it, mine, word, side, kind)];
  }],
};
/** What a phrase points at. Only the phrase types this pattern is allowed to use are tried. */
function target(it, phrase, allowed) {
  for (const type of allowed) {
    const [src, find] = PHRASES[type];
    const m = re(src).exec(phrase);
    if (m) return { type, things: find(it, ...m.slice(1)) };
  }
  assert.fail(`${it.id}: pattern "${it.v}" cannot contain the phrase "${phrase}"`);
}

/** Put paint jobs together: [[things, colour], ...] -> { id: colour }. No thing may be painted twice. */
function paint(it, jobs) {
  const out = {};
  for (const [list, colour] of jobs) {
    assert.ok(list.length > 0, `${it.id}: "${it.say}" - a paint job has nothing to paint`);
    for (const o of list) {
      assert.ok(!(o.id in out), `${it.id}: "${it.say}" paints ${o.id} twice`);
      out[o.id] = colour;
    }
  }
  return out;
}
/** A sentence that is a list of "phrase colour" jobs. */
function listed(it, count, allowed) {
  const found = clauses(it, count).map(([phrase, colour]) => ({ ...target(it, phrase, allowed), colour }));
  return { types: found.map((f) => f.type), jobs: found.map((f) => [f.things, f.colour]), found };
}
const differ = (it, ...colours) => assert.equal(new Set(colours).size, colours.length, `${it.id}: "${it.say}" uses one colour for two different jobs`);
const NP = ['sized-thing', 'thing'];

// ---- one rule per sentence pattern ----------------------------------------------------------------

const RULES = {
  // level 1: one thing, one colour
  one: (it) => { const [kind, c] = rx(it, `Paint the ${K} ${C}\\.`); return paint(it, [[[named(it, kind)], c]]); },
  'one-make': (it) => { const [kind, c] = rx(it, `Make the ${K} ${C}\\.`); return paint(it, [[[named(it, kind)], c]]); },
  'one-use': (it) => { const [c, kind] = rx(it, `Use the ${C} paint on the ${K}\\.`); return paint(it, [[[named(it, kind)], c]]); },

  // level 2: two paint jobs
  two: (it) => {
    const { types, jobs } = listed(it, 2, ['thing']);
    assert.deepEqual(types, ['thing', 'thing']);
    differ(it, jobs[0][1], jobs[1][1]);
    return paint(it, jobs);
  },
  'two-use': (it) => {
    const [c1, k1, c2, k2] = rx(it, `Use ${C} on the ${K} and ${C} on the ${K}\\.`);
    differ(it, c1, c2);
    return paint(it, [[[named(it, k1)], c1], [[named(it, k2)], c2]]);
  },
  'two-same': (it) => { const [k1, k2, c] = rx(it, `Paint the ${K} and the ${K} ${C}\\.`); return paint(it, [[[named(it, k1), named(it, k2)], c]]); },
  'two-should': (it) => {
    const [k1, c1, k2, c2] = rx(it, `The ${K} should be ${C}, and the ${K} should be ${C}\\.`);
    differ(it, c1, c2);
    return paint(it, [[[named(it, k1)], c1], [[named(it, k2)], c2]]);
  },

  // level 3: big and small
  'size-pair': (it) => {
    const { types, jobs } = listed(it, 2, NP);
    assert.deepEqual(types, ['sized-thing', 'sized-thing']);
    assert.equal(jobs[0][0][0].kind, jobs[1][0][0].kind, `${it.id}: both must be the same kind of thing`);
    differ(it, jobs[0][1], jobs[1][1]);
    return paint(it, jobs);
  },
  'size-mixed': (it) => {
    const { types, jobs } = listed(it, 2, NP);
    assert.deepEqual(types, ['sized-thing', 'sized-thing']);
    assert.notEqual(jobs[0][0][0].kind, jobs[1][0][0].kind, `${it.id}: two different kinds of thing`);
    differ(it, jobs[0][1], jobs[1][1]);
    return paint(it, jobs);
  },
  'size-one': (it) => {
    const { types, jobs } = listed(it, 2, NP);
    assert.deepEqual([...types].sort(), ['sized-thing', 'thing']);
    differ(it, jobs[0][1], jobs[1][1]);
    return paint(it, jobs);
  },
  'size-same': (it) => {
    const [s1, k1, s2, k2, c] = rx(it, `Paint the ${SZ} ${K} and the ${SZ} ${K} ${C}\\.`);
    return paint(it, [[[named(it, k1, s1), named(it, k2, s2)], c]]);
  },

  // level 4: all and except
  'all-kind': (it) => {
    const [word, c] = rx(it, `Paint all the (\\w+) ${C}\\.`);
    const mine = things(it).filter((o) => o.kind === singular(it, word));
    assert.ok(mine.length >= 2 && mine.length < things(it).length, `${it.id}: "all" needs several, and something else to leave alone`);
    return paint(it, [[mine, c]]);
  },
  'all-size': (it) => {
    const [size, c] = rx(it, `Paint all the ${SZ} things ${C}\\.`);
    const mine = things(it).filter((o) => o.size === size);
    assert.ok(mine.length >= 2 && mine.length < things(it).length, `${it.id}: "all the ${size} things" needs several, and others to leave alone`);
    assert.ok(mine.some((o) => things(it).some((x) => x.kind === o.kind && x.size !== size)), `${it.id}: a ${size} thing needs a look-alike of the other size`);
    return paint(it, [[mine, c]]);
  },
  'except-size': (it) => {
    const [word, c, size] = rx(it, `Paint all the (\\w+) ${C} except the ${SZ} one\\.`);
    const kind = singular(it, word);
    const odd = single(it, things(it).filter((o) => o.kind === kind && o.size === size), `the ${size} ${kind}`);
    const mine = things(it).filter((o) => o.kind === kind && o !== odd);
    assert.ok(mine.length >= 2, `${it.id}: "all the ${word}" needs at least two to paint`);
    return paint(it, [[mine, c]]);
  },
  'except-kind': (it) => {
    const [c, kind] = rx(it, `Paint everything ${C} except the ${K}\\.`);
    const odd = named(it, kind);
    return paint(it, [[things(it).filter((o) => o !== odd), c]]);
  },
  'all-two': (it) => {
    const [w1, c1, w2, c2] = rx(it, `Paint all the (\\w+) ${C} and all the (\\w+) ${C}\\.`);
    const [k1, k2] = [singular(it, w1), singular(it, w2)];
    assert.notEqual(k1, k2);
    differ(it, c1, c2);
    const a = things(it).filter((o) => o.kind === k1);
    const b = things(it).filter((o) => o.kind === k2);
    assert.ok(a.length >= 2 && b.length >= 2 && a.length + b.length < things(it).length, `${it.id}: two real groups, and something to leave alone`);
    return paint(it, [[a, c1], [b, c2]]);
  },

  // level 5: where it is in a row - always two paint jobs
  'row-ord': (it) => {
    const { types, jobs } = listed(it, 2, ['nth', 'first', 'last', 'middle']);
    assert.ok(['first', 'last', 'middle'].includes(types[0]) && types[1] === 'nth', `${it.id}: an end or the middle first, then one counted place`);
    differ(it, ...jobs.map((j) => j[1]));
    return paint(it, jobs);
  },
  'row-both': (it) => {
    const { types, jobs } = listed(it, 2, ['nth']);
    assert.deepEqual(types, ['nth', 'nth']);
    assert.deepEqual(sidesSaid(it).sort(), ['left', 'right'], `${it.id}: one counted from each end`);
    differ(it, ...jobs.map((j) => j[1]));
    return paint(it, jobs);
  },
  'row-ends': (it) => {
    const { types, jobs } = listed(it, 2, ['first', 'first-two', 'last', 'last-two', 'middle']);
    const places = types.map((t) => t.replace('-two', ''));
    assert.equal(new Set(places).size, 2, `${it.id}: two different places`);
    differ(it, ...jobs.map((j) => j[1]));
    return paint(it, jobs);
  },
  'row-between': (it) => {
    const [c1, a, b, kind, c2] = rx(it, `Use ${C} on the one between the ${K} and the ${K}\\. Paint the ${K} ${C}\\.`);
    assert.notEqual(a, b);
    assert.ok([a, b].includes(kind), `${it.id}: the named thing is one of the two it stands between`);
    differ(it, c1, c2);
    return paint(it, [[[between(it, a, b)], c1], [[named(it, kind)], c2]]);
  },
  'row-sides': (it) => {
    const [kind, c1, c2] = rx(it, `Paint the ${K} ${C}\\. Use ${C} on both things next to it\\.`); // "it" = the thing just named
    differ(it, c1, c2);
    return paint(it, [[[named(it, kind)], c1], [neighbours(it, kind), c2]]);
  },
  'row-kind': (it) => {
    const { types, jobs } = listed(it, 2, ['nth-kind']);
    assert.deepEqual(types, ['nth-kind', 'nth-kind']);
    differ(it, ...jobs.map((j) => j[1]));
    const said = Object.fromEntries([...it.say.matchAll(new RegExp(`the ${ORD} ${K} from the (left|right) `, 'g'))].map((m) => [m[3], { n: NTH[m[1]], kind: m[2] }]));
    assert.ok(said.left && said.right, `${it.id}: one counted from each end`);
    assert.equal(said.left.kind, said.right.kind, `${it.id}: both count the same kind of thing`);
    // the kind word must matter: counting every thing instead has to give a different answer somewhere
    const row = rowOf(it);
    const mine = row.filter((o) => o.kind === said.left.kind);
    assert.ok(row[said.left.n - 1] !== mine[said.left.n - 1] || row[row.length - said.right.n] !== mine[mine.length - said.right.n], `${it.id}: the kind word is not needed`);
    return paint(it, jobs);
  },

  // level 6: not, neither, unless, if, only if
  'not-size': (it) => {
    const [kind, c1, size, c2] = rx(it, `Paint every ${K} ${C}, but not the ${SZ} one\\. Paint that one ${C}\\.`);
    differ(it, c1, c2);
    const odd = single(it, things(it).filter((o) => o.kind === kind && o.size === size), `the ${size} ${kind}`);
    const mine = things(it).filter((o) => o.kind === kind && o !== odd);
    assert.ok(mine.length >= 2, `${it.id}: "every ${kind}" needs at least two to paint`);
    return paint(it, [[mine, c1], [[odd], c2]]);
  },
  'if-size': (it) => {
    const [s1, c1, s2, c2] = rx(it, `If a thing is ${SZ}, paint it ${C}\\. Paint the ${SZ} ones ${C}\\.`);
    assert.notEqual(s1, s2);
    differ(it, c1, c2);
    return paint(it, [[things(it).filter((o) => o.size === s1), c1], [things(it).filter((o) => o.size === s2), c2]]);
  },
  neither: (it) => {
    const [c1, a1, k1, a2, k2, word, c2] = rx(it, `Use ${C} on everything that is neither (an?) ${K} nor (an?) ${K}\\. Paint the (\\w+) ${C}\\.`);
    assert.notEqual(k1, k2);
    for (const [article, kind] of [[a1, k1], [a2, k2]]) assert.equal(article, /^[aeiou]/.test(kind) ? 'an' : 'a', `${it.id}: "${article} ${kind}"`);
    differ(it, c1, c2);
    assert.ok(things(it).some((o) => o.kind === k1) && things(it).some((o) => o.kind === k2), `${it.id}: both kinds must be in the picture`);
    const second = oneOrAll(it, word);
    assert.ok([k1, k2].includes(second.kind), `${it.id}: the second job is for one of the two kinds that were ruled out`);
    return paint(it, [[things(it).filter((o) => o.kind !== k1 && o.kind !== k2), c1], [second.things, c2]]);
  },
  unless: (it) => {
    const [size, c1, word, size2, word2, c2] = rx(it, `Paint all the ${SZ} things ${C}, unless they are (\\w+)\\. Paint the ${SZ} (\\w+) ${C}\\.`);
    const kind = singular(it, word);
    assert.notEqual(size, size2);
    differ(it, c1, c2);
    assert.ok(things(it).some((o) => o.size === size && o.kind === kind), `${it.id}: "unless" must rule something out`);
    const second = oneOrAll(it, word2, size2);
    assert.equal(second.kind, kind, `${it.id}: the second job is about the same kind of thing`);
    assert.ok(things(it).some((o) => o.size === size2 && o.kind !== kind), `${it.id}: something must be left alone`);
    return paint(it, [[things(it).filter((o) => o.size === size && o.kind !== kind), c1], [second.things, c2]]);
  },
  'only-if': (it) => {
    const [word, c1, kind, c2, size] = rx(it, `Paint all the (\\w+) ${C}\\. Paint the ${K} ${C}, but only if it is ${SZ}\\.`);
    differ(it, c1, c2);
    const all = things(it).filter((o) => o.kind === singular(it, word));
    assert.ok(all.length >= 2, `${it.id}: "all" needs several`);
    const maybe = named(it, kind);
    const jobs = [[all, c1]];
    if (maybe.size === size) jobs.push([[maybe], c2]);
    return paint(it, jobs);
  },
  'if-more': (it) => {
    const [w1, w2, w3, c1, w4, c2] = rx(it, `If there are more (\\w+) than (\\w+), paint the (\\w+) ${C}\\. If not, paint the (\\w+) ${C}\\.`);
    assert.equal(w3, w1);
    assert.equal(w4, w2);
    differ(it, c1, c2);
    const a = things(it).filter((o) => o.kind === singular(it, w1));
    const b = things(it).filter((o) => o.kind === singular(it, w2));
    assert.ok(a.length >= 1 && b.length >= 1 && a.length !== b.length, `${it.id}: both kinds must be there, and it must not be a tie`);
    return paint(it, [a.length > b.length ? [a, c1] : [b, c2]]);
  },

  // level 7: three or four jobs, from memory
  'mem-three': (it) => {
    const { types, jobs } = listed(it, 3, NP);
    assert.deepEqual([...types].sort(), ['sized-thing', 'sized-thing', 'thing']);
    differ(it, ...jobs.map((j) => j[1]));
    return paint(it, jobs);
  },
  'mem-four': (it) => {
    const { types, jobs } = listed(it, 4, NP);
    assert.deepEqual([...types].sort(), ['sized-thing', 'sized-thing', 'thing', 'thing']);
    differ(it, ...jobs.map((j) => j[1]));
    return paint(it, jobs);
  },
  'mem-except': (it) => {
    const [word, c1, size, c2, solo, c3] = rx(it, `Paint all the (\\w+) ${C} except the ${SZ} one\\. Paint that one ${C} and the ${K} ${C}\\.`);
    differ(it, c1, c2, c3);
    const kind = singular(it, word);
    const odd = single(it, things(it).filter((o) => o.kind === kind && o.size === size), `the ${size} ${kind}`);
    const mine = things(it).filter((o) => o.kind === kind && o !== odd);
    assert.ok(mine.length >= 2, `${it.id}: "all the ${word}" needs at least two to paint`);
    return paint(it, [[mine, c1], [[odd], c2], [[named(it, solo)], c3]]);
  },
  'mem-row': (it) => {
    const { types, jobs } = listed(it, 3, ['nth', 'middle', 'thing']);
    assert.deepEqual([...types].sort(), ['middle', 'nth', 'thing']);
    assert.ok(types.indexOf('middle') < types.indexOf('nth'), `${it.id}: the middle one is said before the counted one`);
    differ(it, ...jobs.map((j) => j[1]));
    return paint(it, jobs);
  },
  'mem-not': (it) => {
    const [size, c1, k1, k2, c2] = rx(it, `Paint every ${SZ} thing ${C}, but not the ${K}\\. Paint the ${K} ${C}\\.`);
    assert.equal(k1, k2);
    differ(it, c1, c2);
    const odd = named(it, k1);
    assert.equal(odd.size, size, `${it.id}: "but not the ${k1}" only matters if the ${k1} is ${size}`);
    const mine = things(it).filter((o) => o.size === size && o !== odd);
    assert.ok(mine.length >= 2 && things(it).some((o) => o.size !== size), `${it.id}: several ${size} things, and some that are not`);
    return paint(it, [[mine, c1], [[odd], c2]]);
  },
  'mem-all': (it) => {
    const [w1, c1, w2, c2, solo, c3] = rx(it, `Paint all the (\\w+) ${C}, all the (\\w+) ${C}, and the ${K} ${C}\\.`);
    differ(it, c1, c2, c3);
    const a = things(it).filter((o) => o.kind === singular(it, w1));
    const b = things(it).filter((o) => o.kind === singular(it, w2));
    assert.ok(a.length >= 2 && b.length >= 2, `${it.id}: "all" needs several`);
    return paint(it, [[a, c1], [b, c2], [[named(it, solo)], c3]]);
  },
};

/** The answer, worked out from the sentence and the picture alone. */
export function solve(it) {
  const rule = Object.prototype.hasOwnProperty.call(RULES, it.v) ? RULES[it.v] : null;
  assert.ok(rule, `${it.id}: no independent rule for paint pattern "${it.v}" - add one to tests/unit/oracle-paint.test.mjs`);
  const bare = bareAfterSide(it.say);
  assert.ok(!bare, `${it.id}: "${it.say}" - "${bare}" comes after "from the left / right" and could be counted from that side`);
  const answer = rule(it);
  const slip = MAYBE.includes(it.v) ? null : colourAfterName(it, answer);
  assert.ok(!slip, `${it.id}: "${it.say}" - he hears "${slip}", but that is not what happens`);
  return answer;
}
const sorted = (o) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b)));

// ---- the tests ----------------------------------------------------------------------------------------

const items = itemsOfType('paint');
// Outside a preview folder: the Paint Shop only has to have items once it has been built into the game data.
const built = !process.env.LWM_ITEMS_DIR && existsSync(join(ROOT, 'assets/data/listening/levels.json'))
  && JSON.parse(readFileSync(join(ROOT, 'assets/data/listening/levels.json'), 'utf8')).worlds.some((w) => w.id === 'paint');

test('paint: the answer worked out from the sentence matches the stored answer, for every item', () => {
  for (const it of items) assert.deepEqual(sorted(solve(it)), sorted(it.expect), `${it.id}: ${it.say}`);
  if (process.env.LWM_ITEMS_DIR || built) assert.ok(items.length >= 100, `only ${items.length} paint items`);
});

test('paint: every picture is fair (unpainted, no sound-alikes, the paints that are needed and at least one that is not)', () => {
  for (const it of items) {
    const objs = things(it);
    assert.ok(objs.length >= 2 && objs.length <= 8, `${it.id}: ${objs.length} things`);
    assert.equal(new Set(ids(objs)).size, objs.length, `${it.id}: duplicate ids`);
    for (const o of objs) assert.ok(KINDS.includes(o.kind) && o.color === 'gray' && ['big', 'small'].includes(o.size), `${it.id}: ${JSON.stringify(o)}`);
    for (const [a, b] of SOUND_ALIKE) assert.ok(!(objs.some((o) => o.kind === a) && objs.some((o) => o.kind === b)), `${it.id}: ${a} and ${b} sound alike`);
    const said = COLORS.filter((c) => new RegExp(`\\b${c}\\b`).test(it.say));
    assert.ok(said.length >= 1, `${it.id}: no colour is spoken`);
    for (const c of said) assert.ok(it.scene.paints.includes(c), `${it.id}: ${c} is spoken but not on the shelf`);
    for (const c of it.scene.paints) assert.ok(COLORS.includes(c), `${it.id}: unknown paint ${c}`);
    assert.equal(new Set(it.scene.paints).size, it.scene.paints.length, `${it.id}: the same paint twice`);
    assert.ok(it.scene.paints.length > said.length, `${it.id}: every pot is needed, so the colour words are not`);
    const used = new Set(Object.values(solve(it)));
    for (const c of used) assert.ok(said.includes(c), `${it.id}: ${c} is used but never spoken`);
    assert.ok(!it.auto && !it.mode, `${it.id}: paint items end with the Done button`);
    assert.ok(it.say.split(/\s+/).length <= 35, `${it.id}: more than 35 words`);
  }
});

test('paint: the memory patterns hide the picture, the others do not', () => {
  for (const it of items) assert.equal(!!it.hide, it.v.startsWith('mem-'), `${it.id}: ${it.v} hide=${it.hide}`);
});

test('paint: the oracle itself - hand-checked answers, unknown patterns, ambiguous wording', () => {
  const picture = (kinds) => ({ cols: kinds.length, paints: ['red', 'blue', 'green'], objects: kinds.map((k, i) => ({ id: `o${i + 1}`, kind: k.replace(/^s-/, ''), color: 'gray', size: k.startsWith('s-') ? 'small' : 'big' })) });
  const it = (v, say, kinds) => ({ id: 'x', t: 'paint', v, say, scene: picture(kinds) });
  const answer = (v, say, kinds) => sorted(solve(it(v, say, kinds)));

  assert.deepEqual(answer('one', 'Paint the key red.', ['gem', 'key']), { o2: 'red' });
  assert.deepEqual(answer('one-use', 'Use the blue paint on the gem.', ['gem', 'key']), { o1: 'blue' });
  assert.deepEqual(answer('two-same', 'Paint the key and the gem green.', ['gem', 'key', 'egg']), { o1: 'green', o2: 'green' });
  assert.deepEqual(answer('size-pair', 'Paint the big key red and the small key blue.', ['s-key', 'gem', 'key']), { o1: 'blue', o3: 'red' });
  assert.deepEqual(answer('except-size', 'Paint all the stars red except the small one.', ['star', 's-star', 'star', 's-gem']), { o1: 'red', o3: 'red' });
  assert.deepEqual(answer('except-kind', 'Paint everything blue except the key.', ['gem', 'key', 's-egg']), { o1: 'blue', o3: 'blue' });
  assert.deepEqual(answer('row-ord', 'Paint the first one green and the second one from the right blue.', ['key', 'gem', 'gem', 'key', 'gem']), { o1: 'green', o4: 'blue' });
  assert.deepEqual(answer('row-ord', 'Paint the one in the middle red and the second one from the left blue.', ['key', 'gem', 'gem', 'key', 'gem']), { o2: 'blue', o3: 'red' });
  assert.deepEqual(answer('row-both', 'Paint the third one from the right red and the second one from the left blue.', ['key', 'gem', 'gem', 'key', 'gem', 'egg']), { o2: 'blue', o4: 'red' });
  assert.deepEqual(answer('row-ends', 'Paint the last one red and the one in the middle blue.', ['key', 'gem', 'gem', 'key', 'gem']), { o3: 'blue', o5: 'red' });
  assert.deepEqual(answer('row-ends', 'Paint the first two red and the last two green.', ['key', 'gem', 'gem', 'key', 'gem', 'gem', 'key']), { o1: 'red', o2: 'red', o6: 'green', o7: 'green' });
  assert.deepEqual(answer('row-between', 'Use green on the one between the key and the bell. Paint the bell blue.', ['gem', 'key', 'gem', 'bell', 'gem']), { o3: 'green', o4: 'blue' });
  assert.deepEqual(answer('row-between', 'Use green on the one between the bell and the key. Paint the key blue.', ['gem', 'key', 'gem', 'bell', 'gem']), { o2: 'blue', o3: 'green' });
  assert.deepEqual(answer('row-sides', 'Paint the star green. Use blue on both things next to it.', ['gem', 'egg', 'gem', 'star', 'egg']), { o3: 'blue', o4: 'green', o5: 'blue' });
  assert.deepEqual(answer('row-kind', 'Paint the first key from the left red and the first key from the right blue.', ['gem', 'key', 'key', 'egg', 'key', 'gem']), { o2: 'red', o5: 'blue' });
  assert.deepEqual(answer('row-kind', 'Paint the second key from the right red and the second key from the left blue.', ['key', 'gem', 'key', 'key', 'egg', 'key']), { o3: 'blue', o4: 'red' });
  assert.deepEqual(answer('not-size', 'Paint every hat red, but not the big one. Paint that one blue.', ['s-hat', 'hat', 's-hat', 'gem']), { o1: 'red', o2: 'blue', o3: 'red' });
  assert.deepEqual(answer('if-size', 'If a thing is small, paint it red. Paint the big ones blue.', ['s-hat', 'hat', 's-gem']), { o1: 'red', o2: 'blue', o3: 'red' });
  assert.deepEqual(answer('neither', 'Use green on everything that is neither a key nor an egg. Paint the egg red.', ['key', 'egg', 'gem', 's-gem', 'star']), { o2: 'red', o3: 'green', o4: 'green', o5: 'green' });
  assert.deepEqual(answer('neither', 'Use green on everything that is neither a key nor an egg. Paint the keys red.', ['key', 'egg', 'gem', 's-key']), { o1: 'red', o3: 'green', o4: 'red' });
  assert.deepEqual(answer('unless', 'Paint all the small things blue, unless they are keys. Paint the big key red.', ['s-key', 's-gem', 's-egg', 'key', 'gem']), { o2: 'blue', o3: 'blue', o4: 'red' });
  assert.deepEqual(answer('unless', 'Paint all the small things blue, unless they are keys. Paint the big keys red.', ['s-key', 's-gem', 'key', 'key', 'gem']), { o2: 'blue', o3: 'red', o4: 'red' });
  assert.deepEqual(answer('only-if', 'Paint all the gems red. Paint the key blue, but only if it is small.', ['gem', 's-gem', 'key']), { o1: 'red', o2: 'red' });
  assert.deepEqual(answer('only-if', 'Paint all the gems red. Paint the key blue, but only if it is small.', ['gem', 's-gem', 's-key']), { o1: 'red', o2: 'red', o3: 'blue' });
  assert.deepEqual(answer('if-more', 'If there are more gems than keys, paint the gems red. If not, paint the keys blue.', ['gem', 'key', 'key', 'egg', 'gem', 'key']), { o2: 'blue', o3: 'blue', o6: 'blue' });
  assert.deepEqual(answer('if-more', 'If there are more gems than keys, paint the gems red. If not, paint the keys blue.', ['gem', 'key', 'gem', 'egg', 'gem', 'key']), { o1: 'red', o3: 'red', o5: 'red' });
  assert.deepEqual(answer('mem-except', 'Paint all the gems red except the small one. Paint that one blue and the bell green.', ['gem', 's-gem', 'gem', 'bell', 'hat']), { o1: 'red', o2: 'blue', o3: 'red', o4: 'green' });
  assert.deepEqual(answer('mem-row', 'Paint the drum red, the one in the middle green, and the second one from the left blue.', ['drum', 'gem', 'egg', 'gem', 'egg']), { o1: 'red', o2: 'blue', o3: 'green' });
  assert.deepEqual(answer('mem-row', 'Paint the one in the middle green, the first one from the right blue, and the drum red.', ['drum', 'gem', 'egg', 'gem', 'egg']), { o1: 'red', o3: 'green', o5: 'blue' });
  assert.deepEqual(answer('mem-not', 'Paint every small thing red, but not the hat. Paint the hat blue.', ['s-gem', 's-hat', 'gem', 's-egg']), { o1: 'red', o2: 'blue', o4: 'red' });
  assert.deepEqual(answer('mem-all', 'Paint all the gems red, all the eggs blue, and the hat green.', ['gem', 'egg', 's-gem', 'hat', 's-egg', 'key']), { o1: 'red', o2: 'blue', o3: 'red', o4: 'green', o5: 'blue' });

  assert.throws(() => solve(it('brand-new', 'Paint the key red.', ['key', 'gem'])), /no independent rule/);
  assert.throws(() => solve(it('toString', 'Paint the key red.', ['key', 'gem'])), /no independent rule/);
  assert.throws(() => solve(it('one', 'Splash the key red.', ['key', 'gem'])), /does not look like/);
  assert.throws(() => solve(it('one', 'Paint the key red.', ['key', 'key', 'gem'])), /exactly one/); // which key?
  assert.throws(() => solve(it('size-pair', 'Paint the big key red and the small key blue.', ['key', 's-key', 's-key'])), /exactly one/);
  assert.throws(() => solve(it('size-one', 'Paint the big key red and the gem blue.', ['key', 'gem', 'egg'])), /is not needed/); // "big" with no small key
  assert.throws(() => solve(it('row-ord', 'Paint the first one green and the third one from the left blue.', ['key', 'gem'])), /no third/);
  assert.throws(() => solve(it('row-ord', 'Paint the last one green and the first one from the right blue.', ['key', 'gem', 'key'])), /twice/);
  assert.throws(() => solve(it('row-ord', 'Paint the first one green and the third one from the left blue.', ['key', 'gem', 'key', 'gem', 'egg'])), /side word is not needed/); // third of five = the middle
  assert.throws(() => solve(it('row-kind', 'Paint the second key from the left red and the first key from the right blue.', ['gem', 'key', 'key', 'egg', 'key'])), /side word is not needed/);
  assert.throws(() => solve(it('row-kind', 'Paint the first key from the left red and the first key from the right blue.', ['key', 'key', 'egg', 'gem', 'key'])), /kind word is not needed/);
  assert.throws(() => solve(it('row-both', 'Paint the second one from the left red and the first one from the left blue.', ['key', 'gem', 'key', 'gem', 'egg'])), /each end/);
  assert.throws(() => solve(it('row-ends', 'Paint the first one red and the first two blue.', ['key', 'gem', 'key', 'gem', 'egg'])), /two different places/);
  assert.throws(() => solve(it('row-between', 'Use green on the one between the key and the bell. Paint the key blue.', ['key', 'bell', 'gem', 'gem'])), /between/);
  assert.throws(() => solve(it('row-between', 'Use green on the one between the key and the bell. Paint the egg blue.', ['key', 'egg', 'bell', 'gem'])), /one of the two/);
  assert.throws(() => solve(it('row-sides', 'Paint the star green. Use blue on both things next to it.', ['star', 'egg', 'gem'])), /neighbour on both sides/);
  assert.throws(() => solve(it('neither', 'Use green on everything that is neither a key nor an egg. Paint the eggs red.', ['key', 'egg', 'gem'])), /more than one/);
  assert.throws(() => solve(it('neither', 'Use green on everything that is neither a key nor a egg. Paint the egg red.', ['key', 'egg', 'gem'])), /"a egg"/);
  // a bare place must never follow "from the left / right" (the old wordings of row-ord and mem-row)
  assert.throws(() => solve(it('row-ord', 'Paint the second one from the right blue and the first one green.', ['key', 'gem', 'gem', 'key', 'gem'])), /could be counted from that side/);
  assert.throws(() => solve(it('mem-row', 'Paint the drum red, the second one from the left blue, and the one in the middle green.', ['drum', 'gem', 'egg', 'gem', 'egg'])), /could be counted from that side/);
  assert.equal(bareAfterSide('Paint the third one from the left red, the fourth one from the right orange, and the last one yellow.'), 'the last one');
  assert.equal(bareAfterSide('Paint the fourth one from the left yellow, the third one from the right orange, and the first one purple.'), 'the first one');
  assert.equal(bareAfterSide('Paint the second one from the right red and the last two blue.'), 'the last two');
  assert.equal(bareAfterSide('Paint the second one from the left red and the one in the middle blue.'), 'the one in the middle');
  assert.equal(bareAfterSide('Paint the second one from the left red and the first one from the right blue.'), null);
  assert.equal(bareAfterSide('Paint the last one red, the one in the middle green, and the second one from the right blue.'), null);
  // a colour straight after a thing's name must be that thing's colour (the old wordings of row-sides, row-between and neither)
  const row5 = it('x', '', ['gem', 'ring', 'gem', 'egg', 'crown']);
  assert.equal(colourAfterName({ ...row5, say: 'Paint both things next to the ring yellow, the ring blue, and the last one purple.' }, { o1: 'yellow', o3: 'yellow', o2: 'blue', o5: 'purple' }), 'the ring yellow');
  assert.equal(colourAfterName({ ...row5, say: 'Paint the one between the egg and the ring yellow, the egg green, and the first one from the left red.' }, { o3: 'yellow', o4: 'green', o1: 'red' }), 'the ring yellow');
  assert.equal(colourAfterName({ ...row5, say: 'Paint everything that is neither an egg nor a crown yellow. Paint the egg red.' }, { o1: 'yellow', o2: 'yellow', o3: 'yellow', o4: 'red' }), 'the crown yellow');
  assert.equal(colourAfterName({ ...row5, say: 'Paint the ring blue. Use yellow on both things next to it.' }, { o1: 'yellow', o2: 'blue', o3: 'yellow' }), null);
  assert.equal(colourAfterName({ ...row5, say: 'Paint all the gems red except the small one.' }, { o1: 'red' }), null);
  assert.throws(() => solve(it('row-ends', 'Paint the first one red and the one in the middle green.', ['key', 'gem', 'key', 'gem'])), /no middle/);
  assert.throws(() => solve({ ...it('row-ends', 'Paint the first one red and the one in the middle green.', ['key', 'gem', 'key', 'gem', 'egg']), scene: { ...picture(['key', 'gem', 'key', 'gem', 'egg']), cols: 3 } }), /one row/);
  assert.throws(() => solve(it('row-ends', 'Paint the first one red, the last one blue, and the one in the middle green.', ['key', 'gem', 'key', 'gem', 'egg'])), /expected 2 paint jobs/); // level 5 is two jobs
  assert.throws(() => solve(it('two', 'Paint the key red and the gem blue and so on.', ['key', 'gem', 'egg'])), /could not read every part/);
});
