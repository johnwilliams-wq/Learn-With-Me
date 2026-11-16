// Independent answer rules for the tap activity: the sentence parser, small helpers, and one
// rule per sentence pattern `v` of the Starter levels. A rule works the answer out from the
// spoken sentence and the finished scene only - never from item.expect.
//
//   ORACLE[v] = (item, mentions, helpers) => expected groups of object ids
//
// Rules for patterns added later live in tap-memory.mjs, tap-logic.mjs and tap-stories.mjs.

import assert from 'node:assert/strict';
import { OBJECT_KINDS, CHARACTER_KINDS } from '../../../src/art/sprites.js';

export const COLORS = ['red', 'blue', 'green', 'yellow', 'purple', 'orange'];
export const KINDS = [...OBJECT_KINDS, ...CHARACTER_KINDS];
const NP = new RegExp(`\\b(the|a|an|both|all the)\\s+(?:(big|small)\\s+)?(?:(${COLORS.join('|')})\\s+)?(${KINDS.join('|')})(?:es|s)?\\b`, 'gi');

/** Every "the big red gem"-style phrase in the sentence, in the order it is spoken. */
export function mentions(say) {
  return [...say.matchAll(NP)].map((m) => {
    const q = { kind: m[4].toLowerCase() };
    if (m[2]) q.size = m[2].toLowerCase();
    if (m[3]) q.color = m[3].toLowerCase();
    return Object.assign(q, { article: m[1].toLowerCase() });
  });
}
export const fits = (o, q) => o.kind === q.kind && (!q.color || o.color === q.color) && (!q.size || o.size === q.size);
export const all = (it, q) => it.scene.objects.filter((o) => fits(o, q));
export function one(it, q) {
  const hits = all(it, q);
  assert.equal(hits.length, 1, `"${it.say}" - ${JSON.stringify(q)} should match exactly one object, matched ${hits.length}`);
  return hits[0].id;
}
export const ids = (list) => list.map((o) => o.id);
export const rx = (it, re) => {
  const m = re.exec(it.say);
  assert.ok(m, `"${it.say}" does not look like pattern ${it.v}`);
  return m.slice(1);
};
const inOrder = (it, m) => m.map((q) => [one(it, q)]);
const lastOne = (it, m) => [[one(it, m.at(-1))]];
const nothing = () => [];
const firstIndefinite = (it, m) => [[one(it, m.find((q) => q.article === 'a' || q.article === 'an'))]];
export const picked = (it) => [...it.say.matchAll(/picked up an? (\w+)/g)].map((m) => one(it, { kind: m[1] }));
export const index = (it, id) => it.scene.objects.findIndex((o) => o.id === id);

export const ORACLE = {
  // one phrase -> the one thing it describes
  name: lastOne, colour: lastOne, size: lastOne, 'colour-kind': lastOne, 'size-colour-kind': lastOne,
  'hidden-one': lastOne, 'lead-in': lastOne, 'captain-go': lastOne,
  'trailing-colour': (it) => { const [kind, color] = rx(it, /^Tap the (\w+)\. The (\w+) one\.$/); return [[one(it, { kind, color })]]; },
  'trailing-size': (it) => { const [kind, size] = rx(it, /^Tap the (\w+)\. The (\w+) one\.$/); return [[one(it, { kind, size })]]; },
  // several phrases, done in the order they are said
  two: inOrder, 'two-colour': inOrder, 'hidden-two': inOrder, 'hidden-two-colour': inOrder, 'first-then': inOrder,
  after: inOrder, before: inOrder, three: inOrder, 'three-colour': inOrder, 'three-hidden': inOrder, four: inOrder, 'captain-two': inOrder,
  // ...or in the opposite order
  'before-flipped': (it, m) => [[one(it, m[1])], [one(it, m[0])]],
  'after-flipped': (it, m) => [[one(it, m[1])], [one(it, m[0])]],
  // must not be done
  'captain-no': nothing, impostor: nothing, 'plain-two': nothing,
  instead: (it, m) => [[one(it, m[1])]],
  'and-too': (it, m) => [[one(it, m[0]), one(it, m[1])]],
  'count-2': (it, m) => { const x = one(it, m[0]); return [[x, x]]; },
  'count-3': (it, m) => { const x = one(it, m[0]); return [[x, x, x]]; },
  'count-then': (it, m) => { const x = one(it, m[0]); return [[x, x], [one(it, m[1])]]; },
  'then-count': (it, m) => { const y = one(it, m[1]); return [[one(it, m[0])], [y, y]]; },
  'not-colour': (it) => {
    const [kind, color] = rx(it, /^Tap the (\w+) that is not (\w+)\.$/);
    const hits = it.scene.objects.filter((o) => o.kind === kind && o.color !== color);
    assert.equal(hits.length, 1, it.say);
    assert.ok(it.scene.objects.some((o) => o.kind === kind && o.color === color), `${it.say}: nothing to rule out`);
    return [ids(hits)];
  },
  'not-kind': (it) => {
    const [color, kind] = rx(it, /^Tap the (\w+) one that is not an? (\w+)\.$/);
    const hits = it.scene.objects.filter((o) => o.color === color && o.kind !== kind);
    assert.equal(hits.length, 1, it.say);
    assert.ok(it.scene.objects.some((o) => o.color === color && o.kind === kind), `${it.say}: needs a same-colour thing to rule out`);
    assert.ok(it.scene.objects.some((o) => o.color !== color && o.kind !== kind), `${it.say}: needs a different-colour thing to rule out`);
    return [ids(hits)];
  },
  'all-kind': (it, m) => [ids(it.scene.objects.filter((o) => o.kind === m[0].kind))],
  both: (it, m) => { const hits = it.scene.objects.filter((o) => o.kind === m[0].kind); assert.equal(hits.length, 2, it.say); return [ids(hits)]; },
  'all-colour': (it) => { const [color] = rx(it, /everything that is (\w+)\.$/); return [ids(it.scene.objects.filter((o) => o.color === color))]; },
  'all-colour-kind': (it, m) => [ids(all(it, m[0]))],
  'except-colour': (it, m) => { const [color] = rx(it, /except the (\w+) one\.$/); return [ids(it.scene.objects.filter((o) => o.kind === m[0].kind && o.color !== color))]; },
  'except-kind': (it) => { const [kind] = rx(it, /^Tap everything except the (\w+)\.$/); return [ids(it.scene.objects.filter((o) => o.kind !== kind))]; },
  'except-colour-kind': (it) => { const [color, kind] = rx(it, /^Tap all the (\w+) things except the (\w+)\.$/); return [ids(it.scene.objects.filter((o) => o.color === color && o.kind !== kind))]; },
  // where things are (objects are laid out row by row, `cols` per row)
  middle: (it) => { const n = it.scene.objects.length; assert.equal(n % 2, 1); assert.equal(it.scene.cols, n); return [[it.scene.objects[(n - 1) / 2].id]]; },
  'next-to': (it, m) => {
    const anchor = index(it, one(it, { kind: m[1].kind }));
    assert.equal(it.scene.cols, it.scene.objects.length, 'one row');
    const hits = it.scene.objects.filter((o, i) => o.kind === m[0].kind && Math.abs(i - anchor) === 1);
    assert.equal(hits.length, 1, it.say);
    return [ids(hits)];
  },
  between: (it, m) => {
    const a = index(it, one(it, { kind: m[0].kind }));
    const b = index(it, one(it, { kind: m[1].kind }));
    assert.equal(Math.abs(a - b), 2, it.say);
    assert.equal(it.scene.cols, it.scene.objects.length, 'one row');
    return [[it.scene.objects[(a + b) / 2].id]];
  },
  row: (it) => {
    const [kind, which] = rx(it, /^Tap the (\w+) in the (top|bottom) row\.$/);
    const rows = Math.ceil(it.scene.objects.length / it.scene.cols);
    assert.equal(rows, 2, it.say);
    const hits = it.scene.objects.filter((o, i) => o.kind === kind && (which === 'top') === i < it.scene.cols);
    assert.equal(hits.length, 1, it.say);
    return [ids(hits)];
  },
  'on-side': (it) => {
    const [kind, side] = rx(it, /^Tap the (\w+) on the (left|right)\.$/);
    const hits = it.scene.objects.filter((o) => o.kind === kind);
    assert.equal(hits.length, 2, it.say);
    assert.equal(it.scene.cols, it.scene.objects.length, 'one row');
    return [[(side === 'left' ? hits[0] : hits[1]).id]];
  },
  'side-of': (it) => {
    const [side, kind] = rx(it, /^Tap the one to the (left|right) of the (\w+)\.$/);
    const ref = index(it, one(it, { kind }));
    assert.equal(it.scene.cols, it.scene.objects.length, 'one row');
    const hits = it.scene.objects.filter((o, i) => (side === 'left' ? i < ref : i > ref));
    assert.equal(hits.length, 1, `${it.say}: exactly one thing must be on that side`);
    return [ids(hits)];
  },
  // "if"
  'if-see': (it) => { const [who, kind] = rx(it, /^If you see an? (\w+), tap the (\w+)\.$/); return it.scene.objects.some((o) => o.kind === who) ? [[one(it, { kind })]] : []; },
  'if-colour': (it) => { const [kind, color] = rx(it, /^If the (\w+) is (\w+), tap it\.$/); const id = one(it, { kind }); return it.scene.objects.find((o) => o.id === id).color === color ? [[id]] : []; },
  'if-else': (it) => { const [cond, yes, no] = rx(it, /^If there is an? (\w+), tap the (\w+)\. If not, tap the (\w+)\.$/); return [[one(it, { kind: it.scene.objects.some((o) => o.kind === cond) ? yes : no })]]; },
  'if-else-see': (it) => { const [cond, yes, no] = rx(it, /^If you see an? (\w+), tap the (\w+)\. If not, tap the (\w+)\.$/); return [[one(it, { kind: it.scene.objects.some((o) => o.kind === cond) ? yes : no })]]; },
  'only-if-go': (it) => { const [kind, color] = rx(it, /^Tap the (\w+), but only if it is (\w+)\.$/); return [[one(it, { kind, color })]]; },
  'only-if-no': (it) => { const [kind, color] = rx(it, /^Tap the (\w+), but only if it is (\w+)\.$/); assert.equal(all(it, { kind, color }).length, 0); one(it, { kind }); return []; },
  // stories
  'what-found': firstIndefinite, 'what-carrying': firstIndefinite, market: firstIndefinite,
  'who-gave': (it) => { const [giver] = rx(it, /^The (\w+) gave an? \w+ to the (\w+)\./); return [[one(it, { kind: giver })]]; },
  'who-got': (it) => { const [, getter] = rx(it, /^The (\w+) gave an? \w+ to the (\w+)\./); return [[one(it, { kind: getter })]]; },
  'where-hidden': (it) => { const [kind] = rx(it, /hid the \w+ (?:inside|under|behind) the (\w+)\./); return [[one(it, { kind })]]; },
  'who-packed': (it) => {
    const [n1, k1, n2, k2, ask] = rx(it, /^(.+?) packed an? (\w+) for the trip\. (.+?) packed an? (\w+)\. .* What did (.+?) pack\?$/);
    assert.notEqual(n1, n2);
    return [[one(it, { kind: ask === n1 ? k1 : k2 })]];
  },
  shelf: (it) => { const [kind] = rx(it, /knocked the (\w+) onto the floor/); return [[one(it, { kind })]]; },
  'gave-away': (it) => {
    const [c1, k1, c2, k2, gone] = rx(it, /had an? (\w+) (\w+) and an? (\w+) (\w+)\. \w+ gave the (\w+) to a friend/);
    return [[one(it, gone === k1 ? { kind: k2, color: c2 } : { kind: k1, color: c1 })]];
  },
  'story-first': (it) => [[picked(it)[0]]],
  'story-last': (it) => [[picked(it)[2]]],
  'story-after': (it) => { const [kind] = rx(it, /right after the (\w+)\?$/); const p = picked(it); return [[p[p.indexOf(one(it, { kind })) + 1]]]; },
  'story-before': (it) => { const [kind] = rx(it, /right before the (\w+)\?$/); const p = picked(it); return [[p[p.indexOf(one(it, { kind })) - 1]]]; },
  'story-retell': (it) => picked(it).map((id) => [id]),
  // "work it out": the answer must never be said out loud, and there is exactly one of it
  clue: (it) => {
    const target = it.scene.objects.find((o) => o.id === it.expect[0][0]);
    assert.ok(!new RegExp(`\\b${target.kind}s?\\b`, 'i').test(it.say), `${it.say}: the answer is given away`);
    return [[one(it, { kind: target.kind })]];
  },
};

/** Everything a rule in another file may want to use. */
export const helpers = { COLORS, KINDS, mentions, fits, all, one, ids, rx, index, picked, inOrder, lastOne, nothing, firstIndefinite };
