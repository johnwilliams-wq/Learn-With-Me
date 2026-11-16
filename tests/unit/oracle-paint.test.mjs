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
  return side === 'left' ? list[n - 1] : list[list.length - n];
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
  between: [`the one between the ${K} and the ${K}`, (it, a, b) => {
    const row = rowOf(it);
    const i = row.indexOf(named(it, a));
    const j = row.indexOf(named(it, b));
    assert.equal(Math.abs(i - j), 2, `${it.id}: exactly one thing must stand between the ${a} and the ${b}`);
    return [row[(i + j) / 2]];
  }],
  sides: [`both things next to the ${K}`, (it, kind) => {
    const row = rowOf(it);
    const i = row.indexOf(named(it, kind));
    assert.ok(i > 0 && i < row.length - 1, `${it.id}: the ${kind} needs a neighbour on both sides`);
    return [row[i - 1], row[i + 1]];
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

  // level 5: where it is in a row
  'row-ord': (it) => {
    const { types, jobs } = listed(it, 3, ['nth', 'first', 'last', 'middle']);
    assert.deepEqual(types.slice(0, 2), ['nth', 'nth']);
    assert.notEqual(types[2], 'nth');
    assert.ok(/from the left .* from the right/.test(it.say), `${it.id}: one counted from each end`);
    differ(it, ...jobs.map((j) => j[1]));
    return paint(it, jobs);
  },
  'row-ends': (it) => {
    const { types, jobs } = listed(it, 3, ['first', 'first-two', 'last', 'last-two', 'middle']);
    assert.deepEqual(types.map((t) => t.replace('-two', '')).sort(), ['first', 'last', 'middle']);
    differ(it, ...jobs.map((j) => j[1]));
    return paint(it, jobs);
  },
  'row-between': (it) => {
    const { types, jobs } = listed(it, 3, ['between', 'thing', 'nth']);
    assert.deepEqual(types, ['between', 'thing', 'nth']);
    const [a, b] = /between the (\w+) and the (\w+)/.exec(it.say).slice(1);
    assert.ok([a, b].includes(jobs[1][0][0].kind), `${it.id}: the named thing is one of the two it stands between`);
    differ(it, ...jobs.map((j) => j[1]));
    return paint(it, jobs);
  },
  'row-sides': (it) => {
    const { types, jobs } = listed(it, 3, ['sides', 'thing', 'first', 'last']);
    assert.deepEqual(types.slice(0, 2), ['sides', 'thing']);
    assert.ok(['first', 'last'].includes(types[2]));
    assert.equal(jobs[1][0][0].kind, /next to the (\w+)/.exec(it.say)[1]);
    differ(it, ...jobs.map((j) => j[1]));
    return paint(it, jobs);
  },
  'row-kind': (it) => {
    const { types, jobs } = listed(it, 3, ['nth-kind', 'thing']);
    assert.deepEqual(types, ['nth-kind', 'nth-kind', 'thing']);
    assert.ok(/from the left .* from the right/.test(it.say), `${it.id}: one counted from each end`);
    differ(it, ...jobs.map((j) => j[1]));
    // the kind word must matter: counting every thing instead has to give a different answer somewhere
    const row = rowOf(it);
    const [n1] = /the (\w+) \w+ from the left/.exec(it.say).slice(1);
    const [n2] = /the (\w+) \w+ from the right/.exec(it.say).slice(1);
    assert.ok(row[NTH[n1] - 1] !== jobs[0][0][0] || row[row.length - NTH[n2]] !== jobs[1][0][0], `${it.id}: the kind word is not needed`);
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
    const [k1, k2, c1, word, c2] = rx(it, `Paint everything that is neither an? ${K} nor an? ${K} ${C}\\. Paint the (\\w+) ${C}\\.`);
    assert.notEqual(k1, k2);
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
  return rule(it);
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
  assert.deepEqual(answer('row-ord', 'Paint the second one from the left red, the second one from the right blue, and the first one green.', ['key', 'gem', 'gem', 'key', 'gem']), { o1: 'green', o2: 'red', o4: 'blue' });
  assert.deepEqual(answer('row-ends', 'Paint the last one red, the one in the middle blue, and the first one green.', ['key', 'gem', 'gem', 'key', 'gem']), { o1: 'green', o3: 'blue', o5: 'red' });
  assert.deepEqual(answer('row-ends', 'Paint the first two red, the one in the middle blue, and the last two green.', ['key', 'gem', 'gem', 'key', 'gem', 'gem', 'key']), { o1: 'red', o2: 'red', o4: 'blue', o6: 'green', o7: 'green' });
  assert.deepEqual(answer('row-between', 'Paint the one between the key and the bell green, the bell blue, and the first one from the right red.', ['gem', 'key', 'gem', 'bell', 'gem']), { o3: 'green', o4: 'blue', o5: 'red' });
  assert.deepEqual(answer('row-sides', 'Paint both things next to the star blue, the star green, and the first one red.', ['gem', 'egg', 'gem', 'star', 'egg']), { o1: 'red', o3: 'blue', o4: 'green', o5: 'blue' });
  assert.deepEqual(answer('row-kind', 'Paint the first key from the left red, the first key from the right blue, and the egg green.', ['gem', 'key', 'key', 'egg', 'key', 'gem']), { o2: 'red', o4: 'green', o5: 'blue' });
  assert.deepEqual(answer('not-size', 'Paint every hat red, but not the big one. Paint that one blue.', ['s-hat', 'hat', 's-hat', 'gem']), { o1: 'red', o2: 'blue', o3: 'red' });
  assert.deepEqual(answer('if-size', 'If a thing is small, paint it red. Paint the big ones blue.', ['s-hat', 'hat', 's-gem']), { o1: 'red', o2: 'blue', o3: 'red' });
  assert.deepEqual(answer('neither', 'Paint everything that is neither a key nor an egg green. Paint the egg red.', ['key', 'egg', 'gem', 's-gem', 'star']), { o2: 'red', o3: 'green', o4: 'green', o5: 'green' });
  assert.deepEqual(answer('neither', 'Paint everything that is neither a key nor an egg green. Paint the keys red.', ['key', 'egg', 'gem', 's-key']), { o1: 'red', o3: 'green', o4: 'red' });
  assert.deepEqual(answer('unless', 'Paint all the small things blue, unless they are keys. Paint the big key red.', ['s-key', 's-gem', 's-egg', 'key', 'gem']), { o2: 'blue', o3: 'blue', o4: 'red' });
  assert.deepEqual(answer('unless', 'Paint all the small things blue, unless they are keys. Paint the big keys red.', ['s-key', 's-gem', 'key', 'key', 'gem']), { o2: 'blue', o3: 'red', o4: 'red' });
  assert.deepEqual(answer('only-if', 'Paint all the gems red. Paint the key blue, but only if it is small.', ['gem', 's-gem', 'key']), { o1: 'red', o2: 'red' });
  assert.deepEqual(answer('only-if', 'Paint all the gems red. Paint the key blue, but only if it is small.', ['gem', 's-gem', 's-key']), { o1: 'red', o2: 'red', o3: 'blue' });
  assert.deepEqual(answer('if-more', 'If there are more gems than keys, paint the gems red. If not, paint the keys blue.', ['gem', 'key', 'key', 'egg', 'gem', 'key']), { o2: 'blue', o3: 'blue', o6: 'blue' });
  assert.deepEqual(answer('if-more', 'If there are more gems than keys, paint the gems red. If not, paint the keys blue.', ['gem', 'key', 'gem', 'egg', 'gem', 'key']), { o1: 'red', o3: 'red', o5: 'red' });
  assert.deepEqual(answer('mem-except', 'Paint all the gems red except the small one. Paint that one blue and the bell green.', ['gem', 's-gem', 'gem', 'bell', 'hat']), { o1: 'red', o2: 'blue', o3: 'red', o4: 'green' });
  assert.deepEqual(answer('mem-row', 'Paint the drum red, the one in the middle green, and the second one from the left blue.', ['drum', 'gem', 'egg', 'gem', 'egg']), { o1: 'red', o2: 'blue', o3: 'green' });
  assert.deepEqual(answer('mem-not', 'Paint every small thing red, but not the hat. Paint the hat blue.', ['s-gem', 's-hat', 'gem', 's-egg']), { o1: 'red', o2: 'blue', o4: 'red' });
  assert.deepEqual(answer('mem-all', 'Paint all the gems red, all the eggs blue, and the hat green.', ['gem', 'egg', 's-gem', 'hat', 's-egg', 'key']), { o1: 'red', o2: 'blue', o3: 'red', o4: 'green', o5: 'blue' });

  assert.throws(() => solve(it('brand-new', 'Paint the key red.', ['key', 'gem'])), /no independent rule/);
  assert.throws(() => solve(it('toString', 'Paint the key red.', ['key', 'gem'])), /no independent rule/);
  assert.throws(() => solve(it('one', 'Splash the key red.', ['key', 'gem'])), /does not look like/);
  assert.throws(() => solve(it('one', 'Paint the key red.', ['key', 'key', 'gem'])), /exactly one/); // which key?
  assert.throws(() => solve(it('size-pair', 'Paint the big key red and the small key blue.', ['key', 's-key', 's-key'])), /exactly one/);
  assert.throws(() => solve(it('size-one', 'Paint the big key red and the gem blue.', ['key', 'gem', 'egg'])), /is not needed/); // "big" with no small key
  assert.throws(() => solve(it('row-ord', 'Paint the second one from the left red, the second one from the right blue, and the last one green.', ['key', 'gem', 'key'])), /twice/);
  assert.throws(() => solve(it('row-between', 'Paint the one between the key and the bell green, the key blue, and the first one from the right red.', ['key', 'bell', 'gem', 'gem'])), /between/);
  assert.throws(() => solve(it('neither', 'Paint everything that is neither a key nor an egg green. Paint the eggs red.', ['key', 'egg', 'gem'])), /more than one/);
  assert.throws(() => solve(it('row-ends', 'Paint the first one red, the last one blue, and the one in the middle green.', ['key', 'gem', 'key', 'gem'])), /no middle/);
  assert.throws(() => solve({ ...it('row-ends', 'Paint the first one red, the last one blue, and the one in the middle green.', ['key', 'gem', 'key', 'gem', 'egg']), scene: { ...picture(['key', 'gem', 'key', 'gem', 'egg']), cols: 3 } }), /one row/);
  assert.throws(() => solve(it('two', 'Paint the key red and the gem blue and so on.', ['key', 'gem', 'egg'])), /could not read every part/);
});
