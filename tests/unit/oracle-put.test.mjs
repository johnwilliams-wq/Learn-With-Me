// An INDEPENDENT check of every "put" item (Move and Pack).
//
// The generators (tools/content/worlds/pack.mjs) decide the right answer while they build each
// scene. This file works the answer out a second time, from scratch: it reads only the spoken
// sentence (with regular expressions) and the finished scene, and insists the two agree. It
// shares no code with the generators. A sentence pattern (`v`) without a rule here fails.
//
//   LWM_ITEMS_DIR=tests/e2e/out/pack node --test tests/unit/oracle-put.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';
import { itemsOfType } from './oracles/load.mjs';
import { check } from '../../src/listening/scenes/put.js';

const items = itemsOfType('put');

// ---- the words the sentences are made of ------------------------------------------------
const COLORS = ['red', 'blue', 'green', 'yellow', 'purple', 'orange'];
const THINGS = ['gem', 'key', 'potion', 'shield', 'sword', 'map', 'star', 'coin', 'crown', 'bell', 'drum', 'torch', 'boot', 'book', 'mushroom', 'hat', 'ring', 'rocket', 'egg', 'flag', 'heart'];
const CONTAINERS = ['chest', 'bag', 'basket', 'pot', 'cart'];
const NUMBER = { one: 1, two: 2, three: 3, four: 4, five: 5 };
const SOUND_ALIKE = [['boot', 'book'], ['heart', 'hat'], ['coin', 'crown'], ['pot', 'potion'], ['cart', 'heart'], ['bag', 'flag'], ['bag', 'basket']];
const ROOM = { in: 6, on: 6, under: 3 };

const more = (kind) => (kind === 'torch' ? 'torches' : `${kind}s`);
const ONE_OF = new Map(THINGS.flatMap((k) => [[k, k], [more(k), k]])); // "coins" -> coin, "coin" -> coin
const alt = (list) => list.join('|');

// Pieces of regular expression. Each comment says how many groups the piece captures.
const KIND = `(${alt(THINGS)})`; // 1: gem
const KINDS = `(${alt(THINGS.map(more))})`; // 1: gems
const COLOR = `(${alt(COLORS)})`; // 1: red
const THE = `the (?:(big|small) )?(?:(${alt(COLORS)}) )?(${alt(THINGS)})`; // 3: size, colour, kind  "the small red key"
const COUNT = `(${alt(Object.keys(NUMBER))}) (?:(big|small) )?(?:(${alt(COLORS)}) )?(${alt([...THINGS.map(more), ...THINGS])})`; // 4: number, size, colour, kind(s)
const WHERE = `(in|on|under) the (${alt([...CONTAINERS, 'table'])})`; // 2: in, chest
const IF_THERE = `there is an? ${KIND} on the shelf`; // 1: the thing to look for

/** Match the whole sentence against a pattern built from the pieces above; returns the captured groups. */
function parse(it, source) {
  const m = new RegExp(`^${source}$`).exec(it.say);
  assert.ok(m, `${it.id}: "${it.say}" does not look like pattern "${it.v}"`);
  return m.slice(1);
}

// ---- reading the scene ------------------------------------------------------------------
const sizeOf = (o) => o.size || 'big';
const fits = (o, q) => (!q.kind || o.kind === q.kind) && (!q.color || o.color === q.color) && (!q.size || sizeOf(o) === q.size);
const all = (it, q) => it.scene.objects.filter((o) => fits(o, q));
const ids = (list) => list.map((o) => o.id);

/** "the small red key": exactly one thing fits, and every detail word was needed to pick it out. */
function single(it, size, color, kind) {
  const q = { kind, ...(size ? { size } : {}), ...(color ? { color } : {}) };
  const hits = all(it, q);
  assert.equal(hits.length, 1, `${it.id}: "${it.say}" - ${JSON.stringify(q)} must fit exactly one thing, fits ${hits.length}`);
  if (color) assert.ok(all(it, { kind, ...(size ? { size } : {}) }).length > 1, `${it.id}: the word "${color}" is not needed`);
  if (size) assert.ok(all(it, { kind, ...(color ? { color } : {}) }).length > 1, `${it.id}: the word "${size}" is not needed`);
  if (!color && !size) assert.ok(it.scene.objects.some((o) => o.kind !== kind), `${it.id}: there is nothing else to choose from`);
  return hits[0].id;
}
/** "all the keys", "everything red", "the big stars": every thing that fits; there must be several, and others that do not fit. */
function every(it, q) {
  const hits = all(it, q);
  assert.ok(hits.length >= 2, `${it.id}: "${it.say}" - only ${hits.length} thing(s) fit ${JSON.stringify(q)}`);
  assert.ok(hits.length < it.scene.objects.length, `${it.id}: everything on the shelf fits ${JSON.stringify(q)}`);
  for (const k of Object.keys(q)) {
    const loose = { ...q };
    delete loose[k];
    assert.ok(all(it, loose).length > hits.length, `${it.id}: the word "${q[k]}" is not needed`);
  }
  return ids(hits);
}
/** "three red gems": n of the things that fit - and there must be more of them than that, or the number would not matter. */
function some(it, number, size, color, word) {
  const n = NUMBER[number];
  const kind = ONE_OF.get(word);
  assert.equal(word, n === 1 ? kind : more(kind), `${it.id}: "${number} ${word}" is bad grammar`);
  const q = { kind, ...(size ? { size } : {}), ...(color ? { color } : {}) };
  const hits = all(it, q);
  assert.ok(hits.length > n, `${it.id}: "${it.say}" asks for ${n} of ${hits.length}: the number does not matter`);
  if (color) assert.ok(all(it, { kind }).length > hits.length, `${it.id}: the word "${color}" is not needed`);
  return { ids: ids(hits), n };
}
/** "under the table": that place, which must be in the scene - next to at least one other place. */
function place(it, prep, kind) {
  const hits = it.scene.places.filter((p) => p.kind === kind && p.prep === prep);
  assert.equal(hits.length, 1, `${it.id}: "${prep} the ${kind}" must be exactly one place`);
  assert.ok(it.scene.places.length >= 2, `${it.id}: only one place to choose from`);
  return hits[0].id;
}
/** Is there one on the shelf? (Never more than one: "if there is a crown" must be easy to settle.) */
function thereIs(it, kind) {
  const n = all(it, { kind }).length;
  assert.ok(n <= 1, `${it.id}: ${n} ${more(kind)} on the shelf`);
  return n === 1;
}

const to = (list, where) => ({ ids: [].concat(list), n: [].concat(list).length, to: where });
const nOf = (group, where) => ({ ids: group.ids, n: group.n, to: where });
const free = (...moves) => ({ moves });
const inOrder = (...moves) => ({ moves, ordered: true });

// ---- one rule per sentence pattern ---------------------------------------------------------
// Each rule returns { moves: [{ ids, n, to }], ordered? } worked out from the sentence and the scene.

/** "Put A <where> and B <where>." - two things, two places, in any order */
const twoMoves = (it) => {
  const [s1, c1, k1, p1, w1, s2, c2, k2, p2, w2] = parse(it, `Put ${THE} ${WHERE} and ${THE} ${WHERE}\\.`);
  const a = single(it, s1, c1, k1);
  const b = single(it, s2, c2, k2);
  assert.notEqual(a, b, it.id);
  return free(to(a, place(it, p1, w1)), to(b, place(it, p2, w2)));
};
/** "Put three coins <where>." */
const countOne = (it) => {
  const [n, s, c, k, p, w] = parse(it, `Put ${COUNT} ${WHERE}\\.`);
  return free(nOf(some(it, n, s, c, k), place(it, p, w)));
};

const ORACLE = {
  // level 1: one thing, one place
  'put-one': (it) => { const [s, c, k, p, w] = parse(it, `Put ${THE} ${WHERE}\\.`); return free(to(single(it, s, c, k), place(it, p, w))); },
  'goes-one': (it) => { const [s, c, k, p, w] = parse(it, `The${THE.slice(3)} goes ${WHERE}\\.`); return free(to(single(it, s, c, k), place(it, p, w))); },
  'find-one': (it) => { const [s, c, k, p, w] = parse(it, `Find ${THE} and put it ${WHERE}\\.`); return free(to(single(it, s, c, k), place(it, p, w))); },

  // level 2: two things; colour, size and in / on / under
  'two-colour': twoMoves,
  'two-size': twoMoves,
  'two-apart': twoMoves,
  'on-under': (it) => {
    const out = twoMoves(it);
    const preps = out.moves.map((m) => it.scene.places.find((p) => p.id === m.to)).map((p) => `${p.prep} ${p.kind}`).sort();
    assert.deepEqual(preps, ['on table', 'under table'], it.id);
    return out;
  },
  'two-together': (it) => {
    const [s1, c1, k1, s2, c2, k2, p, w] = parse(it, `Put ${THE} and ${THE} ${WHERE}\\.`);
    const where = place(it, p, w);
    return free(to(single(it, s1, c1, k1), where), to(single(it, s2, c2, k2), where));
  },
  'goes-two': (it) => {
    const The = `The${THE.slice(3)}`;
    const [s1, c1, k1, p1, w1, s2, c2, k2, p2, w2] = parse(it, `${The} goes ${WHERE}\\. ${The} goes ${WHERE}\\.`);
    return free(to(single(it, s1, c1, k1), place(it, p1, w1)), to(single(it, s2, c2, k2), place(it, p2, w2)));
  },

  // level 3: how many
  'count-one': countOne,
  'count-colour': (it) => { assert.match(it.say, new RegExp(` ${COLOR} `), `${it.id}: no colour word`); return countOne(it); },
  'count-split': (it) => {
    // "Put two gems in the bag and one in the chest." - the second number is about the same things
    const [n, s, c, k, p1, w1, m, p2, w2] = parse(it, `Put ${COUNT} ${WHERE} and (one|two|three|four|five) ${WHERE}\\.`);
    const first = some(it, n, s, c, k);
    assert.ok(first.n + NUMBER[m] < first.ids.length, `${it.id}: all of them are used up, the numbers do not matter`);
    return free(nOf(first, place(it, p1, w1)), { ids: first.ids, n: NUMBER[m], to: place(it, p2, w2) });
  },
  'count-two-kinds': (it) => {
    const [n1, s1, c1, k1, p1, w1, n2, s2, c2, k2, p2, w2] = parse(it, `Put ${COUNT} ${WHERE} and ${COUNT} ${WHERE}\\.`);
    assert.notEqual(ONE_OF.get(k1), ONE_OF.get(k2), it.id);
    return free(nOf(some(it, n1, s1, c1, k1), place(it, p1, w1)), nOf(some(it, n2, s2, c2, k2), place(it, p2, w2)));
  },
  'count-and-one': (it) => {
    const [n, s, c, k, s2, c2, k2, p, w] = parse(it, `Put ${COUNT} and ${THE} ${WHERE}\\.`);
    const where = place(it, p, w);
    return free(nOf(some(it, n, s, c, k), where), to(single(it, s2, c2, k2), where));
  },
  'count-together': (it) => {
    const [n1, s1, c1, k1, n2, s2, c2, k2, p, w] = parse(it, `Put ${COUNT} and ${COUNT} ${WHERE}\\.`);
    assert.notEqual(ONE_OF.get(k1), ONE_OF.get(k2), it.id);
    const where = place(it, p, w);
    return free(nOf(some(it, n1, s1, c1, k1), where), nOf(some(it, n2, s2, c2, k2), where));
  },

  // level 4: all, everything, except
  'all-colour': (it) => { const [color, p, w] = parse(it, `Put everything ${COLOR} ${WHERE}\\.`); return free(to(every(it, { color }), place(it, p, w))); },
  'all-except-colour': (it) => {
    const [ks, p, w, color] = parse(it, `Put all the ${KINDS} ${WHERE} except the ${COLOR} one\\.`);
    const kind = ONE_OF.get(ks);
    assert.equal(all(it, { kind, color }).length, 1, `${it.id}: "the ${color} one" must be exactly one ${kind}`);
    const rest = every(it, { kind }).filter((id) => id !== all(it, { kind, color })[0].id);
    assert.ok(rest.length >= 2, it.id);
    return free(to(rest, place(it, p, w)));
  },
  'sort-kinds': (it) => {
    const [k1, p1, w1, k2, p2, w2] = parse(it, `Put all the ${KINDS} ${WHERE} and all the ${KINDS} ${WHERE}\\.`);
    assert.notEqual(k1, k2, it.id);
    return free(to(every(it, { kind: ONE_OF.get(k1) }), place(it, p1, w1)), to(every(it, { kind: ONE_OF.get(k2) }), place(it, p2, w2)));
  },
  'all-but-kind': (it) => {
    const [p, w, ks] = parse(it, `Put everything ${WHERE} except the ${KINDS}\\.`);
    const out = every(it, { kind: ONE_OF.get(ks) }); // "the stars": there are several, and they stay
    const rest = ids(it.scene.objects.filter((o) => !out.includes(o.id)));
    assert.ok(rest.length >= 2, it.id);
    return free(to(rest, place(it, p, w)));
  },
  'sort-colours': (it) => {
    const [c1, p1, w1, c2, p2, w2] = parse(it, `Put everything ${COLOR} ${WHERE} and everything ${COLOR} ${WHERE}\\.`);
    assert.notEqual(c1, c2, it.id);
    return free(to(every(it, { color: c1 }), place(it, p1, w1)), to(every(it, { color: c2 }), place(it, p2, w2)));
  },
  'sort-size': (it) => {
    const [s1, k1, p1, w1, s2, k2, p2, w2] = parse(it, `Put the (big|small) ${KINDS} ${WHERE} and the (big|small) ${KINDS} ${WHERE}\\.`);
    assert.ok(s1 !== s2 && k1 === k2, it.id);
    const kind = ONE_OF.get(k1);
    return free(to(every(it, { kind, size: s1 }), place(it, p1, w1)), to(every(it, { kind, size: s2 }), place(it, p2, w2)));
  },
  'all-but-one': (it) => {
    const [ks, p, w] = parse(it, `Put all the ${KINDS} ${WHERE} except one\\.`);
    const group = every(it, { kind: ONE_OF.get(ks) });
    assert.ok(group.length >= 3, it.id);
    return free({ ids: group, n: group.length - 1, to: place(it, p, w) });
  },

  // level 5: the order matters
  'first-then-last': (it) => {
    const [s1, c1, k1, p1, w1, s2, c2, k2, p2, w2, s3, c3, k3, p3, w3] = parse(it, `First put ${THE} ${WHERE}, then ${THE} ${WHERE}, and last ${THE} ${WHERE}\\.`);
    const three = [single(it, s1, c1, k1), single(it, s2, c2, k2), single(it, s3, c3, k3)];
    assert.equal(new Set(three).size, 3, it.id);
    return inOrder(to(three[0], place(it, p1, w1)), to(three[1], place(it, p2, w2)), to(three[2], place(it, p3, w3)));
  },
  'before-flip': (it) => {
    // "Before you put A and B there, put C here."  ->  C, then A and B (either first)
    const [s1, c1, k1, s2, c2, k2, p2, w2, s3, c3, k3, p1, w1] = parse(it, `Before you put ${THE} and ${THE} ${WHERE}, put ${THE} ${WHERE}\\.`);
    return inOrder(to(single(it, s3, c3, k3), place(it, p1, w1)), to([single(it, s1, c1, k1), single(it, s2, c2, k2)], place(it, p2, w2)));
  },
  'not-until': (it) => {
    // "Put three coins there, but not until you have put A here."  ->  A, then the coins
    const [n, s2, c2, k2, p2, w2, s1, c1, k1, p1, w1] = parse(it, `Put ${COUNT} ${WHERE}, but not until you have put ${THE} ${WHERE}\\.`);
    return inOrder(to(single(it, s1, c1, k1), place(it, p1, w1)), nOf(some(it, n, s2, c2, k2), place(it, p2, w2)));
  },
  'after-flip-two': (it) => {
    // "Put C there after you put A and B here."  ->  A and B (either first), then C
    const [s3, c3, k3, p2, w2, s1, c1, k1, s2, c2, k2, p1, w1] = parse(it, `Put ${THE} ${WHERE} after you put ${THE} and ${THE} ${WHERE}\\.`);
    return inOrder(to([single(it, s1, c1, k1), single(it, s2, c2, k2)], place(it, p1, w1)), to(single(it, s3, c3, k3), place(it, p2, w2)));
  },
  'before-flip-count': (it) => {
    // "Before you put the map there, put two coins here."  ->  the coins, then the map
    const [s2, c2, k2, p2, w2, n, s1, c1, k1, p1, w1] = parse(it, `Before you put ${THE} ${WHERE}, put ${COUNT} ${WHERE}\\.`);
    return inOrder(nOf(some(it, n, s1, c1, k1), place(it, p1, w1)), to(single(it, s2, c2, k2), place(it, p2, w2)));
  },
  'after-all': (it) => {
    const [ks, p1, w1, s, c, k, p2, w2] = parse(it, `After you put all the ${KINDS} ${WHERE}, put ${THE} ${WHERE}\\.`);
    return inOrder(to(every(it, { kind: ONE_OF.get(ks) }), place(it, p1, w1)), to(single(it, s, c, k), place(it, p2, w2)));
  },

  // level 6: only when the sentence really applies
  'if-else': (it) => {
    const [cond, p1, w1, other, p2, w2] = parse(it, `If ${IF_THERE}, put it ${WHERE}\\. If not, put the ${KIND} ${WHERE}\\.`);
    assert.notEqual(cond, other, it.id);
    const [yes, no] = [place(it, p1, w1), place(it, p2, w2)];
    const fallback = single(it, '', '', other); // it is there either way, so its presence gives nothing away
    return thereIs(it, cond) ? free(to(single(it, '', '', cond), yes)) : free(to(fallback, no));
  },
  'only-if': (it) => {
    const [s1, c1, k1, s2, c2, k2, p1, w1, s3, c3, k3, p2, w2, cond] = parse(it, `Put ${THE} and ${THE} ${WHERE} and ${THE} ${WHERE}, but only if ${IF_THERE}\\.`);
    const [first, second] = [place(it, p1, w1), place(it, p2, w2)];
    const moves = [to(single(it, s1, c1, k1), first), to(single(it, s2, c2, k2), first), to(single(it, s3, c3, k3), second)];
    return thereIs(it, cond) ? free(...moves) : free();
  },
  unless: (it) => {
    const [ks, p, w, cond] = parse(it, `Put all the ${KINDS} ${WHERE}, unless ${IF_THERE}\\.`);
    const move = to(every(it, { kind: ONE_OF.get(ks) }), place(it, p, w));
    return thereIs(it, cond) ? free() : free(move);
  },
  'if-more': (it) => {
    const [a, b, n1, s1, c1, k1, p1, w1, n2, s2, c2, k2, p2, w2] = parse(it, `If there are more ${KINDS} than ${KINDS}, put ${COUNT} ${WHERE}\\. If not, put ${COUNT} ${WHERE}\\.`);
    assert.ok(ONE_OF.get(k1) === ONE_OF.get(a) && ONE_OF.get(k2) === ONE_OF.get(b) && a !== b, `${it.id}: the two halves must be about the two things that are compared`);
    const [na, nb] = [all(it, { kind: ONE_OF.get(a) }).length, all(it, { kind: ONE_OF.get(b) }).length];
    assert.notEqual(na, nb, `${it.id}: as many of one as of the other`);
    const [yes, no] = [nOf(some(it, n1, s1, c1, k1), place(it, p1, w1)), nOf(some(it, n2, s2, c2, k2), place(it, p2, w2))];
    return free(na > nb ? yes : no);
  },
  'if-one': (it) => {
    // "If there is a red key on the shelf, put it in the chest."  ->  that one thing, or nothing at all
    const [color, kind, p, w] = parse(it, `If there is an? ${COLOR} ${KIND} on the shelf, put it ${WHERE}\\.`);
    assert.match(it.say, new RegExp(`there is ${/^[aeiou]/.test(color) ? 'an' : 'a'} ${color} `), `${it.id}: a / an`);
    const hits = all(it, { kind, color });
    assert.ok(hits.length <= 1, `${it.id}: ${hits.length} things fit`);
    // both words have to be checked: the same kind in another colour and another kind in that colour are always there
    assert.ok(all(it, { kind }).some((o) => o.color !== color), `${it.id}: the word "${color}" is not needed`);
    assert.ok(all(it, { color }).some((o) => o.kind !== kind), `${it.id}: the word "${kind}" is not needed`);
    return hits.length ? free(to(hits[0].id, place(it, p, w))) : free();
  },
  'if-where': (it) => {
    const [cond, ks, p1, w1, p2, w2] = parse(it, `If ${IF_THERE}, put all the ${KINDS} ${WHERE}\\. If not, put them ${WHERE}\\.`);
    const [yes, no] = [place(it, p1, w1), place(it, p2, w2)];
    assert.notEqual(yes, no, it.id);
    return free(to(every(it, { kind: ONE_OF.get(ks) }), thereIs(it, cond) ? yes : no));
  },

  // level 7: the same kinds of sentence, longer, heard while the shelf is covered
  'pack-list': (it) => {
    const [w, s1, c1, k1, s2, c2, k2, n, s3, c3, k3] = parse(it, `Pack the (${alt(CONTAINERS)}) with ${THE}, ${THE} and ${COUNT}\\.`);
    const where = place(it, 'in', w);
    return free(to(single(it, s1, c1, k1), where), to(single(it, s2, c2, k2), where), nOf(some(it, n, s3, c3, k3), where));
  },
  'pack-two-places': (it) => {
    const [s1, c1, k1, n, s2, c2, k2, p1, w1, s3, c3, k3, p2, w2] = parse(it, `Put ${THE} and ${COUNT} ${WHERE}, and ${THE} ${WHERE}\\.`);
    const [first, second] = [place(it, p1, w1), place(it, p2, w2)];
    assert.notEqual(first, second, it.id);
    return free(to(single(it, s1, c1, k1), first), nOf(some(it, n, s2, c2, k2), first), to(single(it, s3, c3, k3), second));
  },
  'order-three': (it) => {
    const [n, s1, c1, k1, p1, w1, s2, c2, k2, p2, w2, s3, c3, k3, p3, w3] = parse(it, `First put ${COUNT} ${WHERE}, then ${THE} ${WHERE}, and last ${THE} ${WHERE}\\.`);
    return inOrder(nOf(some(it, n, s1, c1, k1), place(it, p1, w1)), to(single(it, s2, c2, k2), place(it, p2, w2)), to(single(it, s3, c3, k3), place(it, p3, w3)));
  },
  'except-then': (it) => {
    const [ks, p1, w1, color, s, c, k, p2, w2] = parse(it, `Put all the ${KINDS} ${WHERE} except the ${COLOR} one\\. After that, put ${THE} ${WHERE}\\.`);
    const kind = ONE_OF.get(ks);
    assert.equal(all(it, { kind, color }).length, 1, `${it.id}: "the ${color} one" must be exactly one ${kind}`);
    const rest = every(it, { kind }).filter((id) => id !== all(it, { kind, color })[0].id);
    assert.ok(rest.length >= 2, it.id);
    return inOrder(to(rest, place(it, p1, w1)), to(single(it, s, c, k), place(it, p2, w2)));
  },
  'flip-count': (it) => {
    // "Before you put three coins there, put A and B here."  ->  A and B (either first), then the coins
    const [n, s3, c3, k3, p2, w2, s1, c1, k1, s2, c2, k2, p1, w1] = parse(it, `Before you put ${COUNT} ${WHERE}, put ${THE} and ${THE} ${WHERE}\\.`);
    return inOrder(to([single(it, s1, c1, k1), single(it, s2, c2, k2)], place(it, p1, w1)), nOf(some(it, n, s3, c3, k3), place(it, p2, w2)));
  },
  'if-list': (it) => {
    const [s1, c1, k1, s2, c2, k2, n, s3, c3, k3, cond, p1, w1, p2, w2] = parse(it, `Take ${THE}, ${THE} and ${COUNT}\\. If ${IF_THERE}, put them ${WHERE}\\. If not, put them ${WHERE}\\.`);
    const [yes, no] = [place(it, p1, w1), place(it, p2, w2)];
    assert.notEqual(yes, no, it.id);
    const where = thereIs(it, cond) ? yes : no;
    return free(to(single(it, s1, c1, k1), where), to(single(it, s2, c2, k2), where), nOf(some(it, n, s3, c3, k3), where));
  },
};

// ---- comparing two answers ------------------------------------------------------------------
// "the key and the map go in the bag" may be written as one move of two things or as two moves of
// one thing: both mean the same, so answers are compared piece by piece. A piece is one thing that
// must go to a place, or "n of these things" to a place. When the order matters, the pieces of
// each step are kept together and the steps stay in order.
const order = (list) => [...list].sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));
const pieces = (m) => (m.n === m.ids.length ? order(m.ids).map((id) => `${id} -> ${m.to}`) : [`${m.n} of ${order(m.ids).join(' ')} -> ${m.to}`]);
function canonical(expect) {
  const steps = expect.moves.map((m) => pieces(m).sort());
  return expect.ordered ? { ordered: true, steps } : { ordered: false, steps: [steps.flat().sort()] };
}

test('put: the answer worked out from the sentence matches the stored answer', () => {
  for (const it of items) {
    const rule = ORACLE[it.v];
    assert.ok(rule, `${it.id}: no independent rule for pattern "${it.v}" - add one to tests/unit/oracle-put.test.mjs`);
    const mine = rule(it);
    assert.deepEqual(canonical(mine), canonical(it.expect), `${it.id}: ${it.say}`);
    // what the sentence asks for must also be possible
    const load = new Map();
    for (const m of mine.moves) load.set(m.to, (load.get(m.to) || 0) + m.n);
    for (const [id, n] of load) assert.ok(n <= ROOM[it.scene.places.find((p) => p.id === id).prep], `${it.id}: ${n} things do not fit in one place`);
    for (const m of mine.moves) {
      const shared = mine.moves.filter((o) => o.ids.some((id) => m.ids.includes(id)));
      assert.ok(shared.reduce((n, o) => n + o.n, 0) <= m.ids.length, `${it.id}: more is asked for than there is`);
    }
  }
  if (process.env.LWM_ITEMS_DIR) assert.ok(items.length > 0, 'no put items in the preview folder');
  if (items.length) assert.ok(items.length >= 100, `only ${items.length} put items`);
});

test('put: the checker accepts the answer the oracle worked out, and turns down the near misses', () => {
  for (const it of items) {
    const mine = ORACLE[it.v]?.(it);
    if (!mine) continue; // reported by the test above
    // do it the oracle's way: for each move, the first things that are still on the shelf
    const used = new Set();
    const steps = [];
    for (const m of mine.moves) for (const id of m.ids.filter((x) => !used.has(x)).slice(0, m.n)) { used.add(id); steps.push([id, m.to]); }
    const answer = (list) => ({ moves: list, where: Object.fromEntries(list) });
    const verdict = (list) => check(answer(list), it);
    assert.equal(verdict(steps).correct, true, `${it.id}: the right answer is turned down (${verdict(steps).error})`);
    if (!steps.length) {
      // nothing should be moved: moving anything at all is a false alarm
      const res = verdict([[it.scene.objects[0].id, it.scene.places[0].id]]);
      assert.deepEqual([res.correct, res.error], [false, 'false-alarm'], it.id);
      continue;
    }
    assert.deepEqual([verdict([]).correct, verdict([]).error], [false, 'no-response'], `${it.id}: doing nothing`);
    if (steps.length > 1) assert.equal(verdict(steps.slice(0, -1)).correct, false, `${it.id}: one move short is accepted`);
    // one thing too many
    const spare = it.scene.objects.find((o) => !used.has(o.id) && it.scene.places.some((p) => !mine.moves.some((m) => m.ids.includes(o.id) && m.to === p.id)));
    if (spare) {
      const p = it.scene.places.find((q) => !mine.moves.some((m) => m.ids.includes(spare.id) && m.to === q.id));
      assert.equal(verdict([...steps, [spare.id, p.id]]).correct, false, `${it.id}: an extra thing is accepted`);
    }
    // the first thing in a different place
    const other = it.scene.places.find((p) => !mine.moves.some((m) => m.ids.includes(steps[0][0]) && m.to === p.id));
    if (other) assert.equal(verdict([[steps[0][0], other.id], ...steps.slice(1)]).correct, false, `${it.id}: the wrong place is accepted`);
    // the other way round: wrong only when the sentence gives an order
    const backwards = verdict(steps.slice().reverse());
    if (mine.ordered) assert.deepEqual([backwards.correct, backwards.error], [false, 'order'], `${it.id}: the order should matter`);
    else assert.equal(backwards.correct, true, `${it.id}: the order should not matter`);
  }
});

test('put: scenes are fair and the sentences are fit to be spoken', () => {
  for (const it of items) {
    const { objects, places } = it.scene;
    const words = it.say.toLowerCase().replace(/[.,]/g, '').split(' ');
    assert.ok(words.length <= 36, `${it.id}: ${words.length} words is too long to hold in mind`);
    assert.doesNotMatch(it.say, /[0-9&+/()"']|\s\s/, `${it.id}: digits or symbols in a spoken sentence`);
    assert.match(it.say, /^[A-Z].*\.$/, it.id);
    // everything the sentence names is of a known kind; every place it names is on the screen
    for (const [, prep, kind] of it.say.matchAll(new RegExp(WHERE, 'g'))) place(it, prep, kind);
    for (const o of objects) assert.ok(THINGS.includes(o.kind) && COLORS.includes(o.color) && ['big', 'small'].includes(o.size), `${it.id}: ${JSON.stringify(o)}`);
    assert.ok(objects.length >= 2 && objects.length <= 12, `${it.id}: ${objects.length} things`);
    if (it.hide) assert.ok(objects.length <= 9, `${it.id}: too much to find after a covered instruction`);
    // places: containers, and a table that always has both its places
    assert.ok(places.length >= 2, it.id);
    for (const p of places) assert.ok(p.kind === 'table' ? ['on', 'under'].includes(p.prep) : CONTAINERS.includes(p.kind) && p.prep === 'in', `${it.id}: ${JSON.stringify(p)}`);
    const table = places.filter((p) => p.kind === 'table').map((p) => p.prep);
    assert.ok(table.length === 0 || table.join() === 'on,under', `${it.id}: half a table`);
    // words that sound alike never share a scene
    const names = new Set([...objects.map((o) => o.kind), ...places.map((p) => p.kind)]);
    for (const [a, b] of SOUND_ALIKE) assert.ok(!(names.has(a) && names.has(b)), `${it.id}: ${a} and ${b} sound alike`);
    assert.ok(!it.auto, `${it.id}: put items are finished with the green check mark`);
  }
});

test('put: every level rotates several sentence patterns', () => {
  const byLevel = new Map();
  for (const it of items) {
    const level = it.id.replace(/-\d+$/, '');
    byLevel.set(level, (byLevel.get(level) || new Set()).add(it.v));
  }
  for (const [level, patterns] of byLevel) assert.ok(patterns.size >= 3, `${level}: only ${patterns.size} sentence pattern(s)`);
});
