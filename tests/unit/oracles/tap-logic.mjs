// Independent answer rules for the tap sentence patterns of the Logic Lab world.
//   RULES[v] = (item, mentions, helpers) => expected groups of object ids
// `mentions` = every "the big red gem"-style phrase of item.say, in spoken order;
// `helpers` = the tools exported by ./tap-base.mjs (one, all, ids, rx, index, ...).
// A rule must work from item.say and item.scene only - never from item.expect.
//
// Besides the answer, each rule insists that the item is FAIR: every clue word changes the
// answer (there is a look-alike that the word rules out), and nothing arguable is on screen.

import assert from 'node:assert/strict';

const COLOUR = '(red|blue|green|yellow|purple|orange)';
const SIZE = '(big|small)';
const ORD = '(first|second|third|fourth|fifth|sixth)';
const ORDINAL = { first: 0, second: 1, third: 2, fourth: 3, fifth: 4, sixth: 5 };
const NUMBER = { two: 2, three: 3, four: 4 };
const FLAMES = ['torch', 'rocket']; // drawn with a yellow flame: unfair wherever a colour decides

const objs = (it) => it.scene.objects;
const ids = (list) => list.map((o) => o.id);
const count = (it, f) => objs(it).filter(f).length;
/** "gems" -> "gem", "torches" -> "torch" (it must be a kind that is on screen or at least a real word form). */
const singular = (word) => (word.endsWith('ches') ? word.slice(0, -2) : word.replace(/s$/, ''));
const oneRow = (it) => assert.equal(it.scene.cols, objs(it).length, `${it.id}: must be a single row`);
const fromSide = (it, side) => (side === 'left' ? objs(it) : objs(it).slice().reverse());
const neighbours = (it, o) => { const i = objs(it).indexOf(o); return [objs(it)[i - 1], objs(it)[i + 1]].filter(Boolean); };
const noFlames = (it) => assert.ok(!objs(it).some((o) => FLAMES.includes(o.kind)), `${it.id}: a torch or rocket in a colour question`);
// Wherever a colour decides, nothing that matters may have a colour that is easily mistaken for it.
const CLOSE = { orange: ['red', 'yellow'], red: ['orange'], yellow: ['orange'] };
const clearColour = (it, C, list = objs(it)) => assert.ok(!list.some((o) => (CLOSE[C] || []).includes(o.color)), `${it.id}: ${C} is asked about, and something is ${CLOSE[C]?.join(' or ')}`);
const single = (it, hits, why = '') => { assert.equal(hits.length, 1, `${it.id}: "${it.say}" should fit exactly one thing ${why}`); return [[hits[0].id]]; };
// Pictures that contain another thing: the knight holds a sword and a shield, the wizard's hat has
// a star, the ring carries a gem, the hat and the book are decorated with stars. Counting is only
// fair when none of them is on screen.
const DRAWN_ON = { sword: ['knight'], shield: ['knight'], hat: ['wizard'], star: ['wizard', 'hat', 'book'], gem: ['ring'] };
function kindCount(it, pluralWord) {
  const k = singular(pluralWord);
  const n = count(it, (o) => o.kind === k);
  assert.ok(n >= 1, `${it.id}: no ${k} on screen`);
  for (const other of DRAWN_ON[k] || []) assert.ok(!objs(it).some((o) => o.kind === other), `${it.id}: the ${other} picture has a ${k} in it, so counting ${pluralWord} is unfair`);
  return n;
}

/** "the second <fitting> one from the right": count only the things that fit. */
function nthOf(it, which, side, fits) {
  oneRow(it);
  const k = ORDINAL[which];
  const hits = fromSide(it, side).filter(fits);
  assert.ok(hits.length > k, `${it.id}: there is no ${which} one`);
  const t = hits[k];
  assert.notEqual(hits.slice().reverse()[k], t, `${it.id}: left or right would make no difference`);
  return t;
}

// The groups, written down a second time. `never` = things that would make the group arguable.
const GROUPS = {
  'group-wear': { say: 'Tap everything you can wear.', members: ['hat', 'boot', 'ring', 'crown'], never: ['shield', 'gem', 'heart', 'bell', 'key', 'star', 'flag', 'wizard', 'knight', 'coin'] },
  'group-animals': { say: 'Tap all the animals.', members: ['cat', 'owl', 'fox'], never: ['dragon', 'wizard', 'knight', 'egg'] },
  'group-fly': { say: 'Tap everything that can fly.', members: ['owl', 'rocket', 'dragon'], never: ['ghost', 'wizard', 'robot', 'star', 'flag', 'egg'] },
  'group-music': { say: 'Tap everything you can make music with.', members: ['bell', 'drum'], never: ['ring', 'coin', 'key', 'chest', 'shield', 'sword', 'rocket', 'cat', 'owl', 'fox', 'dragon', 'robot', 'wizard', 'knight', 'ghost'] },
  'group-people': { say: 'Tap all the people.', members: ['wizard', 'knight'], never: ['ghost', 'robot'] },
  'group-read': { say: 'Tap everything you can read.', members: ['book', 'map'], never: ['flag', 'coin', 'potion', 'chest', 'shield', 'wizard', 'robot'] },
};
function group(it) {
  const g = GROUPS[it.v];
  assert.equal(it.say, g.say, it.id);
  assert.equal(it.mode, 'pick', `${it.id}: a set is chosen with tick marks`);
  for (const o of objs(it)) assert.ok(!g.never.includes(o.kind), `${it.id}: ${o.kind} makes "${g.say}" arguable`);
  const hits = objs(it).filter((o) => g.members.includes(o.kind));
  assert.ok(hits.length >= 1 && objs(it).length - hits.length >= 3, `${it.id}: needs members and at least three others`);
  return [ids(hits)];
}

/** Two yes/no clues (colour C, size S): every corner the sentence has to rule in or out must be on screen. */
function twoClues(it, re, keep, corners) {
  const [a, b] = re.exec(it.say)?.slice(1) || assert.fail(`${it.id}: "${it.say}" does not look like pattern ${it.v}`);
  const [C, S] = /^(big|small)$/.test(a) ? [b, a] : [a, b];
  assert.equal(it.mode, 'pick', it.id);
  noFlames(it);
  clearColour(it, C);
  const corner = (o) => `${o.color === C ? 'C' : 'c'}${o.size === S ? 'S' : 's'}`;
  for (const need of corners) assert.ok(objs(it).some((o) => corner(o) === need), `${it.id}: no ${need} thing, so a clue word would not matter`);
  const hits = objs(it).filter((o) => keep(o.color === C, o.size === S));
  assert.ok(hits.length >= 1 && hits.length < objs(it).length, it.id);
  return [ids(hits)];
}

function groupColour(what, members, never) {
  return (it, m, h) => {
    const [C] = h.rx(it, new RegExp(`^Tap the ${what} that are ${COLOUR}\\.$`));
    assert.equal(it.mode, 'pick', it.id);
    noFlames(it);
    clearColour(it, C);
    for (const o of objs(it)) assert.ok(!never.includes(o.kind), `${it.id}: ${o.kind} makes the group arguable`);
    const hits = objs(it).filter((o) => members.includes(o.kind) && o.color === C);
    assert.ok(hits.length >= 1, it.id);
    assert.ok(objs(it).some((o) => members.includes(o.kind) && o.color !== C), `${it.id}: the colour word must matter`);
    assert.ok(objs(it).some((o) => !members.includes(o.kind) && o.color === C), `${it.id}: the group word must matter`);
    return [ids(hits)];
  };
}

/** more / fewer / as many, between two kinds that are both on screen. */
const holds = (relation, a, b) => (relation === 'more' ? a > b : relation === 'fewer' ? a < b : a === b);

function compare(relation) {
  const cond = relation === 'same' ? 'as many (\\w+) as (\\w+)' : `${relation} (\\w+) than (\\w+)`;
  return (it, m, h) => {
    const [A, B, yes, no] = h.rx(it, new RegExp(`^If there are ${cond}, tap the (\\w+)\\. If not, tap the (\\w+)\\.$`));
    const choice = holds(relation, kindCount(it, A), kindCount(it, B)) ? yes : no;
    assert.notEqual(yes, no);
    h.one(it, { kind: yes });
    h.one(it, { kind: no });
    return [[h.one(it, { kind: choice })]];
  };
}

export const RULES = {
  // ---- level 1: places in one row
  nth: (it, m, h) => {
    const [which, side] = h.rx(it, new RegExp(`^Tap the ${ORD} one from the (left|right)\\.$`));
    return [[nthOf(it, which, side, () => true).id]];
  },
  'nth-colour': (it, m, h) => {
    const [which, C, side] = h.rx(it, new RegExp(`^Tap the ${ORD} ${COLOUR} one from the (left|right)\\.$`));
    noFlames(it);
    clearColour(it, C);
    const t = nthOf(it, which, side, (o) => o.color === C);
    assert.notEqual(fromSide(it, side)[ORDINAL[which]], t, `${it.id}: the colour word would not matter`);
    return [[t.id]];
  },
  'nth-kind': (it, m, h) => {
    const [which, K, side] = h.rx(it, new RegExp(`^Tap the ${ORD} (\\w+) from the (left|right)\\.$`));
    assert.notEqual(K, 'one');
    const t = nthOf(it, which, side, (o) => o.kind === K);
    assert.notEqual(fromSide(it, side)[ORDINAL[which]], t, `${it.id}: the thing word would not matter`);
    return [[t.id]];
  },

  // ---- level 2: which one, by its neighbours (look-alikes are the same kind, colour and size)
  'between-two': (it, m, h) => {
    const [K, G] = h.rx(it, /^Tap the (\w+) that is between the two (\w+)\.$/);
    oneRow(it);
    const g = singular(G);
    assert.equal(kindCount(it, G), 2, `${it.id}: "the two ${G}"`);
    assert.ok(count(it, (o) => o.kind === K) >= 2, `${it.id}: needs a look-alike`);
    return single(it, objs(it).filter((o) => o.kind === K && neighbours(it, o).filter((x) => x.kind === g).length === 2));
  },
  'beside-colour': (it, m, h) => {
    const [K, C, N] = h.rx(it, new RegExp(`^Tap the (\\w+) next to the ${COLOUR} (\\w+)\\.$`));
    oneRow(it);
    noFlames(it);
    clearColour(it, C, objs(it).filter((o) => o.kind === N));
    const anchor = h.one(it, { kind: N, color: C });
    const hits = objs(it).filter((o) => o.kind === K && neighbours(it, o).some((x) => x.id === anchor));
    assert.ok(objs(it).some((o) => o.kind === K && neighbours(it, o).some((x) => x.kind === N && x.color !== C) && !hits.includes(o)), `${it.id}: the colour word must matter`);
    return single(it, hits);
  },
  'side-of-twin': (it, m, h) => {
    const [K, side, N] = h.rx(it, /^Tap the (\w+) to the (left|right) of the (\w+)\.$/);
    oneRow(it);
    const at = h.index(it, h.one(it, { kind: N }));
    const left = objs(it).filter((o, i) => o.kind === K && i < at);
    const right = objs(it).filter((o, i) => o.kind === K && i > at);
    assert.ok(left.length === 1 && right.length === 1, `${it.id}: one ${K} on each side of the ${N}`);
    assert.equal(objs(it)[side === 'left' ? at - 1 : at + 1], (side === 'left' ? left : right)[0], `${it.id}: it should be right beside the ${N}`);
    return single(it, side === 'left' ? left : right);
  },
  'not-beside': (it, m, h) => {
    const [K, G] = h.rx(it, /^Tap the (\w+) that is not next to an? (\w+)\.$/);
    oneRow(it);
    const beside = (o) => neighbours(it, o).some((x) => x.kind === G);
    assert.ok(objs(it).some((o) => o.kind === K && beside(o)), `${it.id}: needs a ${K} that IS next to the ${G}`);
    return single(it, objs(it).filter((o) => o.kind === K && !beside(o)));
  },

  // ---- level 3: groups
  'group-wear': group, 'group-animals': group, 'group-fly': group, 'group-music': group, 'group-people': group, 'group-read': group,

  // ---- level 4: two conditions at once
  'both-colour-size': (it) => twoClues(it, new RegExp(`^Tap everything that is ${COLOUR} and ${SIZE}\\.$`), (c, s) => c && s, ['CS', 'Cs', 'cS']),
  'neither-nor': (it) => twoClues(it, new RegExp(`^Tap the things that are neither ${COLOUR} nor ${SIZE}\\.$`), (c, s) => !c && !s, ['cs', 'Cs', 'cS']),
  'size-not-colour': (it) => twoClues(it, new RegExp(`^Tap everything that is ${SIZE} but not ${COLOUR}\\.$`), (c, s) => s && !c, ['cS', 'CS', 'cs']),
  'either-or': (it) => twoClues(it, new RegExp(`^Tap everything that is ${COLOUR} or ${SIZE}\\.$`), (c, s) => c || s, ['CS', 'Cs', 'cS', 'cs']),
  'group-colour-animals': groupColour('animals', GROUPS['group-animals'].members, GROUPS['group-animals'].never),
  'group-colour-wear': groupColour('things you can wear', GROUPS['group-wear'].members, GROUPS['group-wear'].never),

  // ---- level 5: count, compare, decide
  'more-than': compare('more'),
  'fewer-than': compare('fewer'),
  'as-many': compare('same'),
  'more-colour': (it, m, h) => {
    const [C, D, yes, no] = h.rx(it, new RegExp(`^If there are more ${COLOUR} things than ${COLOUR} things, tap the (\\w+)\\. If not, tap the (\\w+)\\.$`));
    noFlames(it);
    const [a, b] = [C, D].map((x) => count(it, (o) => o.color === x));
    assert.ok(a >= 1 && b >= 1 && C !== D, it.id);
    clearColour(it, C);
    clearColour(it, D);
    for (const kind of [yes, no]) {
      const o = objs(it).find((x) => x.id === h.one(it, { kind }));
      assert.ok(o.color !== C && o.color !== D, `${it.id}: the ${kind} would be counted too`);
    }
    return [[h.one(it, { kind: a > b ? yes : no })]];
  },
  'tap-per': (it, m, h) => {
    const [A, T] = h.rx(it, /^Count the (\w+)\. Tap the (\w+) that many times\.$/);
    const n = kindCount(it, A);
    assert.ok(n >= 2 && n <= 6, it.id);
    assert.ok(objs(it).some((o) => o.kind !== singular(A) && o.kind !== T && count(it, (x) => x.kind === o.kind) !== n), `${it.id}: needs something else to count by mistake`);
    return [Array(n).fill(h.one(it, { kind: T }))];
  },

  // ---- level 6: unless / only if / exactly ([] = hands off: he presses the hand)
  'unless-see': (it, m, h) => {
    const [K, who] = h.rx(it, /^Tap the (\w+), unless (?:there is|you see) an? (\w+)\.$/);
    const id = h.one(it, { kind: K });
    return objs(it).some((o) => o.kind === who) ? [] : [[id]];
  },
  'only-if-exactly': (it, m, h) => {
    const [K, n] = h.rx(it, /^Tap all the (\w+), but only if there are exactly (two|three|four)\.$/);
    const hits = objs(it).filter((o) => o.kind === singular(K));
    assert.equal(kindCount(it, K), hits.length);
    assert.ok(hits.length >= 2 && Math.abs(hits.length - NUMBER[n]) <= 1, `${it.id}: the count should be close`);
    return hits.length === NUMBER[n] ? [ids(hits)] : [];
  },
  'unless-colour': (it, m, h) => {
    const [S, K, C] = h.rx(it, new RegExp(`^Tap the ${SIZE} (\\w+), unless it is ${COLOUR}\\.$`));
    noFlames(it);
    const t = objs(it).find((o) => o.id === h.one(it, { kind: K, size: S }));
    const twin = objs(it).find((o) => o.kind === K && o.size !== S);
    assert.ok(twin && (twin.color === C) !== (t.color === C), `${it.id}: the other ${K} must be the opposite, so the size word matters`);
    clearColour(it, C, [t, twin]);
    return t.color === C ? [] : [[t.id]];
  },
  'only-if-more': (it, m, h) => {
    const [K, A, B] = h.rx(it, /^Tap the (\w+), but only if there are more (\w+) than (\w+)\.$/);
    const id = h.one(it, { kind: K });
    return kindCount(it, A) > kindCount(it, B) ? [[id]] : [];
  },
  'only-if-both': (it, m, h) => {
    const [K, a, b] = h.rx(it, /^Tap the (\w+), but only if you see both an? (\w+) and an? (\w+)\.$/);
    const id = h.one(it, { kind: K });
    const seen = [a, b].filter((who) => objs(it).some((o) => o.kind === who)).length;
    assert.ok(a !== b && seen >= 1, `${it.id}: at least one of the two should be there`);
    return seen === 2 ? [[id]] : [];
  },

  // ---- level 7: two orders - do the true one, in its sequence
  'if-colour-order': (it, m, h) => {
    const [S, K, C, a1, a2, b1, b2] = h.rx(it, new RegExp(`^If the ${SIZE} (\\w+) is ${COLOUR}, tap the (\\w+) and then the (\\w+)\\. If it is not, tap the (\\w+) and then the (\\w+)\\.$`));
    noFlames(it);
    const t = objs(it).find((o) => o.id === h.one(it, { kind: K, size: S }));
    const twin = objs(it).find((o) => o.kind === K && o.size !== S);
    assert.ok(twin && (twin.color === C) !== (t.color === C), `${it.id}: the other ${K} must be the opposite, so the size word matters`);
    clearColour(it, C, [t, twin]);
    assert.ok(a1 !== a2 && (a1 !== b1 || a2 !== b2), `${it.id}: the two orders must differ`);
    return (t.color === C ? [a1, a2] : [b1, b2]).map((kind) => [h.one(it, { kind })]);
  },
  'if-count-order': (it, m, h) => {
    const [A, B, a1, a2, b1, b2] = h.rx(it, /^If there are more (\w+) than (\w+), tap the (\w+) and then the (\w+)\. If not, tap the (\w+) and then the (\w+)\.$/);
    assert.ok(a1 !== a2 && (a1 !== b1 || a2 !== b2), `${it.id}: the two orders must differ`);
    return (kindCount(it, A) > kindCount(it, B) ? [a1, a2] : [b1, b2]).map((kind) => [h.one(it, { kind })]);
  },
  'if-see-pairs': (it, m, h) => {
    const [who, a1, a2, b1, b2] = h.rx(it, /^If you see an? (\w+), tap the (\w+) and then the (\w+)\. If you do not, tap the (\w+) and then the (\w+)\.$/);
    assert.equal(new Set([a1, a2, b1, b2]).size, 4, it.id);
    for (const kind of [a1, a2, b1, b2]) h.one(it, { kind });
    return (objs(it).some((o) => o.kind === who) ? [a1, a2] : [b1, b2]).map((kind) => [h.one(it, { kind })]);
  },
  'if-both-order': (it, m, h) => {
    const [A, C, B, D, a1, a2, b1, b2] = h.rx(it, new RegExp(`^If the (\\w+) is ${COLOUR} and the (\\w+) is ${COLOUR}, tap the (\\w+) and then the (\\w+)\\. If not, tap the (\\w+) and then the (\\w+)\\.$`));
    noFlames(it);
    const a = objs(it).find((o) => o.id === h.one(it, { kind: A }));
    const b = objs(it).find((o) => o.id === h.one(it, { kind: B }));
    assert.ok(a1 !== a2 && (a1 !== b1 || a2 !== b2), `${it.id}: the two orders must differ`);
    assert.ok(A === a1 && B === a2 && B === b1 && A === b2, `${it.id}: the orders are about the two things in the question`);
    clearColour(it, C, [a]);
    clearColour(it, D, [b]);
    return (a.color === C && b.color === D ? [a1, a2] : [b1, b2]).map((kind) => [h.one(it, { kind })]);
  },
};
