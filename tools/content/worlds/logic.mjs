// World "logic" - LOGIC LAB: understanding, not memory (activity type "tap"). Nothing is hidden;
// the work is in the words.
//
// The ladder, one new difficulty per level:
//   1 counting places in a row      2 which one, by its neighbours     3 groups (wear, animals, fly...)
//   4 two conditions at once        5 count, compare, decide           6 unless / only if / exactly
//   7 two orders, pick the true one and keep its sequence              boss = mix of 5-7
//
// Drafts are finished by tools/content/lib.mjs (see the top of tools/content/levels.mjs).
// Every pattern name `v` has its own rule in tests/unit/oracles/tap-logic.mjs.

import { OBJECTS, CHARS, COLORS, SIZES, obj, pickKinds, pickColors, plural, an, other } from '../lib.mjs';

const ANY = [...OBJECTS, ...CHARS];
// The torch and the rocket are drawn with a yellow flame, so they stay out of every scene
// where "is it yellow?" (or any other colour question) decides the answer.
const PLAIN = OBJECTS.filter((k) => k !== 'torch' && k !== 'rocket');
const ORDINALS = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth'];
const NUMBER = { 2: 'two', 3: 'three', 4: 'four' };

const col = (rng) => rng.pick(COLORS);
/** n colours that are easy to tell apart at a glance: never orange together with red or yellow. Used wherever a colour decides. */
function hues(rng, n) {
  const out = [];
  for (const c of rng.shuffle(COLORS)) {
    if (c === 'orange' ? out.includes('red') || out.includes('yellow') : (c === 'red' || c === 'yellow') && out.includes('orange')) continue;
    out.push(c);
    if (out.length === n) break;
  }
  return out;
}
const retry = (why) => { throw new Error(`${why}: try again`); };

// Never in one scene: "cat" and "hat" sound alike, and some pictures contain another thing
// (the knight holds a sword and a shield, the wizard wears a hat with a star on it, the ring
// carries a gem, the hat and the book are decorated with stars) - unfair when things are counted.
const NEVER_TOGETHER = [['cat', 'hat'], ['knight', 'sword'], ['knight', 'shield'], ['wizard', 'hat'], ['wizard', 'star'], ['ring', 'gem'], ['star', 'hat'], ['star', 'book']];

/** n different kinds that are fair to show together (and together with `avoid`, which is already in the scene). */
function kinds(rng, n, from = OBJECTS, avoid = []) {
  const ks = pickKinds(rng, n, { from, avoid });
  const scene = [...ks, ...avoid];
  if (NEVER_TOGETHER.some(([a, b]) => scene.includes(a) && scene.includes(b))) retry('kinds that should not share a scene');
  return ks;
}
const things = (rng, n, from, avoid) => kinds(rng, n, from, avoid).map((k) => obj(k, col(rng)));
/** `n` things of one kind, in mixed colours (for counting). */
const several = (rng, kind, n) => Array.from({ length: n }, () => obj(kind, col(rng)));

const single = { auto: true };
const row = (objects) => ({ objects, keepOrder: true, cols: objects.length });
const pick = { mode: 'pick', auto: false };
const adjacent = (list, a, b) => Math.abs(list.indexOf(a) - list.indexOf(b)) === 1;

/** A random order of `parts` that passes `ok` (for one-row scenes with rules about neighbours). */
function arrange(rng, parts, ok) {
  for (let t = 0; t < 400; t++) {
    const list = rng.shuffle(parts);
    if (ok(list)) return list;
  }
  return retry('no arrangement fits');
}

// ----------------------------------------------------------------------------- level 1: places

function placeItem(rng, i) {
  // the side alternates for the plain counts, and switches every four items for the filtered ones
  const side = (i % 2 === 0 ? i / 2 : Math.floor(i / 4)) % 2 ? 'right' : 'left';
  const fromSide = (list) => (side === 'left' ? list : list.slice().reverse());
  if (i % 2 === 0) {
    // "the third one from the left" - never the middle of an odd row, so the side word matters
    const n = rng.pick([5, 6]);
    const objects = things(rng, n, ANY);
    const k = rng.pick([1, 2, 3, 4].filter((x) => x !== n - 1 - x));
    return { say: `Tap the ${ORDINALS[k]} one from the ${side}.`, ...row(objects), expect: [[fromSide(objects)[k]]], ...single, s: ['ordinal', 'side'], v: 'nth' };
  }
  // "the second red one / the second gem from the right": count only the ones that fit
  const byColour = i % 4 === 1;
  const m = rng.pick([3, 4]);
  let objects;
  let fits;
  let word;
  if (byColour) {
    const [C, ...rest] = hues(rng, 3);
    const ks = kinds(rng, 6, PLAIN);
    const slots = rng.shuffle([0, 1, 2, 3, 4, 5]).slice(0, m);
    objects = ks.map((k, j) => obj(k, slots.includes(j) ? C : rest[j % 2]));
    fits = (o) => o.color === C;
    word = `${C} one`;
  } else {
    const [K, ...rest] = kinds(rng, 1 + 6 - m, ANY.filter((k) => k !== 'torch')); // "torches" would not fit the pattern
    objects = rng.shuffle([...several(rng, K, m), ...rest.map((k) => obj(k, col(rng)))]);
    fits = (o) => o.kind === K;
    word = K;
  }
  const hits = fromSide(objects).filter(fits);
  const k = rng.pick([...Array(m).keys()].filter((x) => x !== m - 1 - x));
  const t = hits[k];
  if (fromSide(objects)[k] === t) retry('counting everything would give the same answer');
  return { say: `Tap the ${ORDINALS[k]} ${word} from the ${side}.`, ...row(objects), expect: [[t]], ...single, s: ['ordinal', 'side', 'detail'], v: byColour ? 'nth-colour' : 'nth-kind' };
}

// ----------------------------------------------------------------------------- level 2: neighbours

function neighbourItem(rng, i) {
  switch (i % 4) {
    case 0: { // two keys that look the same; only one sits between the two gems
      const [K, G, X, Y] = kinds(rng, 4);
      const C = col(rng);
      const t = obj(K, C);
      const trio = [obj(G, col(rng)), t, obj(G, col(rng))];
      const rest = rng.shuffle([obj(K, C), obj(X, col(rng)), obj(Y, col(rng))]);
      const at = rng.int(4);
      const objects = [...rest.slice(0, at), ...trio, ...rest.slice(at)];
      return { say: `Tap the ${K} that is between the two ${plural(G)}.`, ...row(objects), expect: [[t]], ...single, s: ['where', 'detail'], v: 'between-two' };
    }
    case 1: { // two stars, two shields: only one star is beside the RED shield
      const [K, N, X, Y] = kinds(rng, 4, PLAIN);
      const [C, D] = hues(rng, 2);
      const KC = col(rng);
      const t = obj(K, KC);
      const twin = obj(K, KC);
      const anchor = obj(N, C);
      const decoy = obj(N, D);
      const objects = arrange(rng, [t, twin, anchor, decoy, obj(X, col(rng)), obj(Y, col(rng))],
        (l) => adjacent(l, t, anchor) && !adjacent(l, twin, anchor) && adjacent(l, twin, decoy));
      return { say: `Tap the ${K} next to the ${C} ${N}.`, ...row(objects), expect: [[t]], ...single, s: ['where', 'detail'], v: 'beside-colour' };
    }
    case 2: { // the same thing on both sides of the key: left or right decides
      const side = Math.floor(i / 4) % 2 ? 'right' : 'left';
      const [K, N, X, Y] = kinds(rng, 4);
      const C = col(rng);
      const left = obj(K, C);
      const right = obj(K, C);
      const rest = [obj(X, col(rng)), obj(Y, col(rng))];
      const at = rng.int(3);
      const objects = [...rest.slice(0, at), left, obj(N, col(rng)), right, ...rest.slice(at)];
      return { say: `Tap the ${K} to the ${side} of the ${N}.`, ...row(objects), expect: [[side === 'left' ? left : right]], ...single, s: ['where', 'side'], v: 'side-of-twin' };
    }
    default: { // two keys: one is beside a gem, the other is not
      const [K, G, X, Y, Z] = kinds(rng, 5);
      const C = col(rng);
      const t = obj(K, C);
      const twin = obj(K, C);
      const gem = obj(G, col(rng));
      const objects = arrange(rng, [t, twin, gem, obj(X, col(rng)), obj(Y, col(rng)), obj(Z, col(rng))], (l) => adjacent(l, twin, gem) && !adjacent(l, t, gem));
      return { say: `Tap the ${K} that is not next to ${an(G)} ${G}.`, ...row(objects), expect: [[t]], ...single, s: ['where', 'not'], v: 'not-beside' };
    }
  }
}

// ----------------------------------------------------------------------------- level 3: groups

// Every group is kept unarguable by what is allowed beside it: `others` lists the only things
// that may appear as wrong choices (so no dragon among "the animals", no ghost among "the
// people", no flag among "things that can fly", nothing that jingles among the music makers).
const GROUPS = {
  wear: { say: 'Tap everything you can wear.', members: ['hat', 'boot', 'ring', 'crown'],
    others: ['drum', 'map', 'chest', 'egg', 'mushroom', 'potion', 'sword', 'rocket', 'torch', 'owl', 'fox', 'robot', 'dragon', 'ghost'] },
  animals: { say: 'Tap all the animals.', members: ['cat', 'owl', 'fox'],
    others: ['robot', 'ghost', 'mushroom', 'map', 'drum', 'key', 'boot', 'bell', 'star', 'rocket', 'flag', 'gem', 'sword', 'chest'], near: ['robot', 'ghost'] },
  fly: { say: 'Tap everything that can fly.', members: ['owl', 'rocket', 'dragon'],
    others: ['cat', 'fox', 'knight', 'drum', 'chest', 'boot', 'key', 'mushroom', 'bell', 'map', 'sword', 'ring', 'crown'], near: ['cat', 'fox', 'knight'] },
  music: { say: 'Tap everything you can make music with.', members: ['bell', 'drum'],
    others: ['map', 'hat', 'boot', 'mushroom', 'egg', 'flag', 'potion', 'star', 'crown', 'torch', 'gem', 'book'] },
  people: { say: 'Tap all the people.', members: ['wizard', 'knight'],
    others: ['cat', 'owl', 'fox', 'dragon', 'boot', 'crown', 'key', 'bell', 'map', 'drum', 'flag', 'chest'], near: ['cat', 'owl', 'fox', 'dragon'] },
  read: { say: 'Tap everything you can read.', members: ['book', 'map'],
    others: ['gem', 'key', 'sword', 'drum', 'bell', 'egg', 'mushroom', 'hat', 'ring', 'star', 'torch', 'cat', 'owl', 'fox'] },
};
const GROUP_ORDER = ['wear', 'animals', 'fly', 'music', 'people', 'read'];

/** Some members of a group (sometimes one of them twice, in two colours) plus things that do not belong. */
function groupScene(rng, group) {
  const g = GROUPS[group];
  const present = kinds(rng, rng.range(Math.min(2, g.members.length), g.members.length), g.members);
  const targets = present.map((k) => obj(k, col(rng)));
  if (targets.length < 4 && rng.chance(0.5)) {
    const again = rng.pick(targets);
    targets.push(obj(again.kind, pickColors(rng, 1, { avoid: [again.color] })[0]));
  }
  const need = Math.min(8 - targets.length, rng.range(3, 4));
  const near = g.near ? kinds(rng, 1, g.near, present) : [];
  const wrong = [...near, ...kinds(rng, need - near.length, g.others, [...present, ...near])];
  return { targets, wrong };
}

function groupItem(rng, i) {
  const group = GROUP_ORDER[i % GROUP_ORDER.length];
  const { targets, wrong } = groupScene(rng, group);
  return { say: GROUPS[group].say, objects: [...targets, ...wrong.map((k) => obj(k, col(rng)))], expect: [targets], ...pick, s: ['category', 'all'], v: `group-${group}` };
}

// ----------------------------------------------------------------------------- level 4: two conditions

/** Eight different things split over the four corners of (is it colour C?) x (is it size S?). */
function corners(rng, S, counts) {
  const [both, colourOnly, sizeOnly, neither] = counts;
  const ks = kinds(rng, both + colourOnly + sizeOnly + neither, PLAIN);
  const [C, ...others] = hues(rng, 3);
  const make = (n, isC, isS) => Array.from({ length: n }, () => obj(ks.pop(), isC ? C : rng.pick(others), isS ? S : other(S)));
  return { C, both: make(both, true, true), colourOnly: make(colourOnly, true, false), sizeOnly: make(sizeOnly, false, true), neither: make(neither, false, false) };
}

function twoClueItem(rng, i) {
  const S = rng.pick(SIZES);
  const split = (a, b, c, d) => corners(rng, S, [a, b, c, d]);
  const all = (q) => [...q.both, ...q.colourOnly, ...q.sizeOnly, ...q.neither];
  switch (i % 5) {
    case 0: {
      const q = split(rng.range(2, 3), 2, 2, 1);
      return { say: `Tap everything that is ${q.C} and ${S}.`, objects: all(q), expect: [q.both], ...pick, s: ['logic', 'all', 'detail'], v: 'both-colour-size' };
    }
    case 1: {
      const q = split(1, rng.range(1, 2), 2, rng.range(2, 3));
      return { say: `Tap the things that are neither ${q.C} nor ${S}.`, objects: all(q), expect: [q.neither], ...pick, s: ['logic', 'not', 'all'], v: 'neither-nor' };
    }
    case 2: { // a group from the level before, and a colour
      const group = Math.floor(i / 5) % 2 ? 'wear' : 'animals';
      const g = GROUPS[group];
      const [C, D] = hues(rng, 2);
      const members = kinds(rng, 3, g.members);
      const wrong = kinds(rng, 4, g.others.filter((k) => PLAIN.includes(k) || CHARS.includes(k)), members);
      const n = rng.range(1, 2);
      const targets = members.slice(0, n).map((k) => obj(k, C));
      const objects = [...targets, ...members.slice(n).map((k) => obj(k, D)), obj(wrong[0], C), obj(wrong[1], C), obj(wrong[2], D), obj(wrong[3], rng.pick([C, D]))];
      const what = group === 'wear' ? 'things you can wear' : 'animals';
      return { say: `Tap the ${what} that are ${C}.`, objects, expect: [targets], ...pick, s: ['category', 'logic', 'all'], v: `group-colour-${group}` };
    }
    case 3: {
      const q = split(rng.range(1, 2), rng.range(0, 1), rng.range(2, 3), 2);
      return { say: `Tap everything that is ${S} but not ${q.C}.`, objects: all(q), expect: [q.sizeOnly], ...pick, s: ['logic', 'not', 'all'], v: 'size-not-colour' };
    }
    default: {
      const q = split(1, rng.range(1, 2), rng.range(1, 2), rng.range(2, 3));
      return { say: `Tap everything that is ${q.C} or ${S}.`, objects: all(q), expect: [[...q.both, ...q.colourOnly, ...q.sizeOnly]], ...pick, s: ['logic', 'all', 'detail'], v: 'either-or' };
    }
  }
}

// ----------------------------------------------------------------------------- level 5: count and compare

/** Two counts of at most four that make "more / fewer / as many" true or false; a tie is sometimes the "false". */
function counts(rng, relation, truth) {
  const pairs = [];
  for (let a = 1; a <= 4; a++) for (let b = 1; b <= 4; b++) {
    if (a + b < 4 || a + b > 7 || Math.abs(a - b) > 2) continue;
    const holds = relation === 'more' ? a > b : relation === 'fewer' ? a < b : a === b;
    if (holds === truth) pairs.push([a, b]);
  }
  return rng.pick(pairs);
}

/** Gems and keys to count (a of one, b of the other), in mixed colours. */
function countScene(rng, relation, truth, extra) {
  const [A, B, ...rest] = kinds(rng, 2 + extra);
  const [a, b] = counts(rng, relation, truth);
  return { A, B, counted: [...several(rng, A, a), ...several(rng, B, b)], rest: rest.map((k) => obj(k, col(rng))) };
}

function compareItem(rng, i) {
  const yes = i % 2 === 0;
  const p = i % 5;
  if (p === 0 || p === 2 || p === 3) {
    const relation = ['more', '', 'fewer', 'same'][p];
    const { A, B, counted, rest } = countScene(rng, relation, yes, 2);
    const [y, n] = rest;
    const cond = relation === 'same' ? `as many ${plural(A)} as ${plural(B)}` : `${relation} ${plural(A)} than ${plural(B)}`;
    return {
      say: `If there are ${cond}, tap the ${y.kind}. If not, tap the ${n.kind}.`, objects: [...counted, y, n], expect: [[yes ? y : n]], ...single,
      s: ['compare', 'if'], v: relation === 'same' ? 'as-many' : `${relation}-than`,
    };
  }
  if (p === 1) { // "Count the gems. Tap the chest that many times."
    const [A, B, T, X] = kinds(rng, 4);
    const a = rng.range(2, 4);
    const b = rng.pick([1, 2, 3].filter((x) => x !== a));
    const t = obj(T, col(rng));
    return {
      say: `Count the ${plural(A)}. Tap the ${T} that many times.`, objects: [...several(rng, A, a), ...several(rng, B, b), t, obj(X, col(rng))],
      expect: [Array(a).fill(t)], auto: false, s: ['count', 'compare'], v: 'tap-per',
    };
  }
  // colours instead of kinds: every thing is a different kind, and the two answers are a third colour
  const [C, D, E] = hues(rng, 3);
  const [a, b] = counts(rng, 'more', yes);
  const ks = kinds(rng, a + b + 2, PLAIN);
  const y = obj(ks.pop(), E);
  const n = obj(ks.pop(), E);
  const objects = [...ks.map((k, j) => obj(k, j < a ? C : D)), y, n];
  return { say: `If there are more ${C} things than ${D} things, tap the ${y.kind}. If not, tap the ${n.kind}.`, objects, expect: [[yes ? y : n]], ...single, s: ['compare', 'if', 'detail'], v: 'more-colour' };
}

// ----------------------------------------------------------------------------- level 6: unless / only if

function unlessItem(rng, i) {
  const go = i % 3 !== 2; // 12 "do it" and 6 "hands off" turns, spread over every pattern
  const g = go ? 'go' : 'nogo';
  const done = (t) => (go ? [t] : []);
  switch (i % 5) {
    case 0: { // "unless there is a dragon": another character is usually there as a lure
      const ch = rng.pick(CHARS);
      const objects = things(rng, 4, OBJECTS, [ch]);
      const lure = rng.pick(CHARS.filter((c) => c !== ch));
      const scene = go ? (rng.chance(0.75) ? [...objects, ...things(rng, 1, [lure], objects.map((o) => o.kind))] : objects) : [...objects, obj(ch, col(rng))];
      const cond = rng.chance(0.5) ? 'there is' : 'you see';
      return { say: `Tap the ${objects[0].kind}, unless ${cond} ${an(ch)} ${ch}.`, objects: scene, expect: [done(objects[0])].filter((x) => x.length), ...single, s: ['logic', 'wait'], v: 'unless-see', g };
    }
    case 1: { // "all the coins, but only if there are exactly three" (numbered taps, any order: a "pick" item cannot have an empty answer)
      const n = rng.pick([2, 3, 4]);
      const have = go ? n : rng.pick([n - 1, n + 1].filter((x) => x >= 2 && x <= 4));
      const [K, ...rest] = kinds(rng, 4);
      const coins = several(rng, K, have);
      return { say: `Tap all the ${plural(K)}, but only if there are exactly ${NUMBER[n]}.`, objects: [...coins, ...rest.map((k) => obj(k, col(rng)))], expect: go ? [coins] : [], auto: false, s: ['if', 'count', 'all'], v: 'only-if-exactly', g };
    }
    case 2: { // "the big bell, unless it is red": the other bell is the opposite, so the size word matters
      const [K, X, Y] = kinds(rng, 3, PLAIN);
      const [C, D] = hues(rng, 2);
      const S = rng.pick(SIZES);
      const t = obj(K, go ? D : C, S);
      return { say: `Tap the ${S} ${K}, unless it is ${C}.`, objects: [t, obj(K, go ? C : D, other(S)), obj(X, C), obj(Y, col(rng))], expect: go ? [[t]] : [], ...single, s: ['logic', 'detail'], v: 'unless-colour', g };
    }
    case 3: { // "but only if there are more gems than keys"
      const { A, B, counted, rest } = countScene(rng, 'more', go, 2);
      const [t, x] = rest;
      return { say: `Tap the ${t.kind}, but only if there are more ${plural(A)} than ${plural(B)}.`, objects: [...counted, t, x], expect: go ? [[t]] : [], ...single, s: ['if', 'compare'], v: 'only-if-more', g };
    }
    default: { // "only if you see both a cat and an owl": with only one of them, hands off
      const [a, b, c] = rng.sample(CHARS, 3);
      const objects = things(rng, 3, OBJECTS, [a, b, c]);
      const cast = go ? [a, b] : [rng.pick([a, b]), c];
      return { say: `Tap the ${objects[0].kind}, but only if you see both ${an(a)} ${a} and ${an(b)} ${b}.`, objects: [...objects, ...cast.map((k) => obj(k, col(rng)))], expect: go ? [[objects[0]]] : [], ...single, s: ['if', 'logic'], v: 'only-if-both', g };
    }
  }
}

// ----------------------------------------------------------------------------- level 7: two orders

function twoOrdersItem(rng, i) {
  const yes = Math.floor(i / 4) % 2 === 0;
  const base = { auto: false };
  switch (i % 4) {
    case 0: { // the small key is the opposite colour, so "big" matters
      const [K, A, B, X] = kinds(rng, 4, PLAIN);
      const [C, D] = hues(rng, 2);
      const S = rng.pick(SIZES);
      const a = obj(A, col(rng));
      const b = obj(B, col(rng));
      const objects = [obj(K, yes ? C : D, S), obj(K, yes ? D : C, other(S)), a, b, obj(X, col(rng))];
      return {
        ...base, say: `If the ${S} ${K} is ${C}, tap the ${A} and then the ${B}. If it is not, tap the ${B} and then the ${A}.`, objects,
        expect: yes ? [[a], [b]] : [[b], [a]], s: ['if', 'logic', 'steps2'], v: 'if-colour-order',
      };
    }
    case 1: {
      const { A, B, counted, rest } = countScene(rng, 'more', yes, 2);
      const [a, b] = rest;
      return {
        ...base, say: `If there are more ${plural(A)} than ${plural(B)}, tap the ${a.kind} and then the ${b.kind}. If not, tap the ${b.kind} and then the ${a.kind}.`,
        objects: [...counted, a, b], expect: yes ? [[a], [b]] : [[b], [a]], s: ['if', 'compare', 'steps2'], v: 'if-count-order',
      };
    }
    case 2: { // four different things: each order has its own pair
      const ch = rng.pick(CHARS);
      const objects = things(rng, 4, OBJECTS, [ch]);
      const [a, b, c, d] = objects;
      const seen = obj(yes ? ch : kinds(rng, 1, CHARS.filter((x) => x !== ch), objects.map((o) => o.kind))[0], col(rng));
      return {
        ...base, say: `If you see ${an(ch)} ${ch}, tap the ${a.kind} and then the ${b.kind}. If you do not, tap the ${c.kind} and then the ${d.kind}.`,
        objects: [...objects, seen], expect: yes ? [[a], [b]] : [[c], [d]], s: ['if', 'logic', 'steps2'], v: 'if-see-pairs',
      };
    }
    default: { // BOTH parts must be true; when it is false, exactly one part is wrong
      const [A, B, X, Y] = kinds(rng, 4, PLAIN);
      const [C, D, E] = hues(rng, 3);
      const wrong = yes ? '' : rng.pick(['first', 'second']);
      const a = obj(A, wrong === 'first' ? E : C);
      const b = obj(B, wrong === 'second' ? E : D);
      return {
        ...base, say: `If the ${A} is ${C} and the ${B} is ${D}, tap the ${A} and then the ${B}. If not, tap the ${B} and then the ${A}.`,
        objects: [a, b, obj(X, C), obj(Y, D)], expect: yes ? [[a], [b]] : [[b], [a]], s: ['if', 'logic', 'steps2'], v: 'if-both-order',
      };
    }
  }
}

export default {
  id: 'logic', name: 'Logic Lab', blurb: 'Think it through: count, compare, unless, only if.', color: '#2aa9d8', speed: 0.92,
  levels: [
    {
      id: 'logic1', title: 'Count the Places', n: 18, maxSame: 3, gen: placeItem,
      tip: 'Welcome to the Logic Lab! Everything is in one row. Count along the row to find the right one. Listen for which side to start from: the left, or the right.',
    },
    {
      id: 'logic2', title: 'Neighbors', n: 18, gen: neighbourItem,
      tip: 'Now some things look the same. Listen for what is beside each one. Next to. Between. To the left of. Only one of them fits.',
    },
    {
      id: 'logic3', title: 'Groups', n: 18, maxSame: 3, gen: groupItem,
      tip: 'Now think about groups. Things you can wear, like a hat or a ring. Animals, like a cat. Things that can fly. Tap every one that fits. Then press the green check mark.',
    },
    {
      id: 'logic4', title: 'Two Clues at Once', n: 18, gen: twoClueItem,
      tip: 'Two clues at once. Red and small means it must be both. Neither blue nor big means it is not blue, and it is not big. Tap all that fit. Then the green check mark.',
    },
    {
      id: 'logic5', title: 'Count and Compare', n: 18, gen: compareItem,
      tip: 'Time to count and compare. Count each kind first. Are there more, or fewer, or just as many? Then decide what to tap.',
    },
    {
      id: 'logic6', title: 'Unless and Only If', n: 18, allowNone: true, quota: { go: 4, nogo: 2 }, gen: unlessItem,
      tip: 'Tricky words: unless, and only if. Tap the star, unless there is a dragon. So if you see a dragon, do not tap anything. Press the hand instead.',
    },
    {
      id: 'logic7', title: 'Two Orders', n: 18, gen: twoOrdersItem,
      tip: 'I will give you two orders, but only one is right. Check what is true. Then do only that one, in the right order, and press the green check mark.',
    },
    {
      id: 'logic-boss', title: 'Lab Boss', boss: true, mix: ['logic5', 'logic6', 'logic7'], allowNone: true,
      tip: 'Lab boss! Count, compare, unless, and only if. Think before you tap. If there is nothing you should do, press the hand.',
    },
  ],
};
