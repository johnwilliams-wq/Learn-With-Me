// World "truth" - TRUTH DETECTOR. He looks at a picture, hears ONE statement about it and decides
// whether it is true (the green check mark) or not true (the cross).
//
// The ladder, one new difficulty per level:
//   1 one fact (a colour or a size)      2 counting               3 all / none / some
//   4 comparing (more, fewer, bigger)    5 where (a single row)   6 two facts joined (and, but, neither...)
//   7 two-part statements about counting, comparing and all / none, with the picture covered while
//     the voice talks (the whole sentence has to be held in his head)
//
// Rules every generator keeps (tests/unit/oracle-truth.test.mjs checks them a second time):
//   - half of every level is true and half is not (plan() alternates; g = 'yes' | 'no' for the quota);
//   - a statement that is not true is a NEAR MISS - one detail is wrong (the colour, the number, the
//     size, the place) and the picture always contains the thing that would have made it true;
//   - nothing debatable: "the key" means there is exactly one key; size words are only used when both
//     sizes are in the picture; "some" is true only for two-or-more-but-not-all; "either / or" is never
//     used when both are so; "to the left of" and "between" are true only when directly beside;
//     a number is true only when it is exactly right (the level 2 tip says so).

import { OBJECTS, COLORS, SIZES, obj, pickKinds, pickColors, plural, an, other, cap } from '../lib.mjs';

const NUM = ['zero', 'one', 'two', 'three', 'four', 'five', 'six'];

// "There are two yellow things" must never be arguable, so things drawn with a part in another colour
// (the flame of the torch and of the rocket, the pale skin and brown sticks of the drum) stay out of this world.
const PLAIN = OBJECTS.filter((k) => !['torch', 'rocket', 'drum'].includes(k));
const things = (rng, n) => pickKinds(rng, n, { from: PLAIN });

/** Pattern p of k for item i, and whether it must be true: every level comes out half and half. */
const plan = (i, k) => ({ p: i % k, truth: ((i % k) + Math.floor(i / k)) % 2 === 0 });
const again = (why) => { throw new Error(`try again: ${why}`); };
const rep = (n, f) => Array.from({ length: n }, (_, j) => f(j));
/** A number one away from n (the near miss for counting). */
const off = (rng, n, lo = 1, hi = 5) => rng.pick([n - 1, n + 1].filter((x) => x >= lo && x <= hi));
const col = (rng, not = []) => rng.pick(COLORS.filter((c) => !not.includes(c)));

/**
 * A finished draft. `about` = one test per group of things the sentence talks about ("the keys", "the red
 * things"): after two misses the guide points at them before showing the answer.
 */
function draft(say, objects, about, truth, s, v, extra = {}) {
  const taken = new Set();
  const groups = about.map((test) => objects.filter((o) => test(o) && !taken.has(o) && taken.add(o))).filter((g) => g.length);
  return { t: 'truth', say, objects, about: groups, truth, g: truth ? 'yes' : 'no', s: ['truth', ...s], v, ...extra };
}
const kindIs = (...kinds) => kinds.map((k) => (o) => o.kind === k);
const colourIs = (...colours) => colours.map((c) => (o) => o.color === c);

/** "red" or "small" as a property of an object: which field it is and what the other values are. */
function quality(rng, kind = rng.pick(['color', 'size'])) {
  if (kind === 'size') {
    const V = rng.pick(SIZES);
    return { key: 'size', V, not: () => other(V), make: (K, v) => obj(K, col(rng), v) };
  }
  const V = col(rng);
  return { key: 'color', V, not: () => col(rng, [V]), make: (K, v) => obj(K, v) };
}

// ----------------------------------------------------------------------------- 1: one fact

function oneFact(rng, i) {
  const { p, truth } = plan(i, 4);
  const [K, K2, K3, K4] = things(rng, 4);
  const [C, C2, C3, C4] = pickColors(rng, 4);
  const S = rng.pick(SIZES);
  const S2 = other(S);
  if (p === 0) {
    // the colour word and the thing word are both needed: another key and another red thing are always there
    const objects = [obj(K, truth ? C : C3), obj(K, C2), obj(K2, C), obj(K3, rng.pick([C2, C3, C4])), obj(K4, rng.pick([C, C4]))];
    return draft(`There is ${an(C)} ${C} ${K}.`, objects, kindIs(K), truth, ['detail'], 'there-is-colour');
  }
  if (p === 1) {
    const objects = [obj(K, truth ? C : C2), obj(K2, truth ? C2 : C), obj(K3, C3), obj(K4, rng.pick([C, C2, C4]))];
    return draft(`The ${K} is ${C}.`, objects, kindIs(K), truth, ['detail'], 'the-is-colour');
  }
  if (p === 2) {
    const objects = [obj(K, C, truth ? S : S2), obj(K, C2, S2), obj(K2, C3, S), obj(K3, C4, truth ? S2 : S), obj(K4, col(rng), S2)];
    return draft(`There is a ${S} ${K}.`, objects, kindIs(K), truth, ['detail'], 'there-is-size');
  }
  const objects = [obj(K, C, truth ? S : S2), obj(K2, C2, truth ? S2 : S), obj(K3, C3, S), obj(K4, C4, S2)];
  return draft(`The ${K} is ${S}.`, objects, kindIs(K), truth, ['detail'], 'the-is-size');
}

// ----------------------------------------------------------------------------- 2: counting

function counting(rng, i) {
  const { p, truth } = plan(i, 4);
  const kinds = things(rng, 5);
  const [K, K2, K3, K4] = kinds;
  const [C, C2, C3, C4] = pickColors(rng, 4);
  const are = (n) => (n === 1 ? 'is' : 'are');
  // (pictures are filled up to about the same number of things, so their size says nothing about the answer)
  const fill = (n, used) => Math.max(1, n - used);
  if (p === 0) {
    // "There are three stars." - and another kind of thing that there really are three of
    const N = rng.range(2, 4);
    const a = truth ? N : off(rng, N);
    const b = truth ? off(rng, N, 1, 4) : N;
    const objects = [...rep(a, () => obj(K, col(rng))), ...rep(b, () => obj(K2, col(rng))), ...rep(fill(8, a + b), () => obj(rng.pick([K3, K4]), col(rng)))];
    return draft(`There ${are(N)} ${NUM[N]} ${plural(K)}.`, objects, kindIs(K), truth, ['count'], 'count-kind');
  }
  if (p === 1) {
    const N = rng.range(2, 4);
    const a = truth ? N : off(rng, N);
    const b = truth ? off(rng, N, 1, 4) : N;
    const any = () => rng.pick(kinds.slice(0, 4));
    const objects = [...rep(a, () => obj(any(), C)), ...rep(b, () => obj(any(), C2)), ...rep(fill(8, a + b), () => obj(any(), rng.pick([C3, C4])))];
    return draft(`There ${are(N)} ${NUM[N]} ${C} things.`, objects, colourIs(C), truth, ['count', 'detail'], 'count-colour');
  }
  if (p === 2) {
    // "There are two red keys." - with keys that are not red and red things that are not keys
    const N = rng.range(2, 3);
    const a = truth ? N : off(rng, N, 1, 4);
    const others = a === N - 1 ? 1 : rng.range(1, 2); // (one short: the keys still add up to the number)
    const same = rng.range(1, 2);
    const objects = [
      ...rep(a, () => obj(K, C)),
      ...rep(others, () => obj(K, C2)),
      ...rep(same, () => obj(K2, C)),
      ...rep(fill(8, a + others + same), () => obj(rng.pick([K2, K3]), C3)),
    ];
    return draft(`There ${are(N)} ${NUM[N]} ${C} ${plural(K)}.`, objects, [(o) => o.kind === K && o.color === C], truth, ['count', 'detail'], 'count-colour-kind');
  }
  const N = rng.range(2, 4);
  const S = rng.pick(SIZES);
  const a = truth ? N : off(rng, N);
  const total = Math.max(a + 2, rng.range(6, 8));
  const objects = rep(total, (j) => obj(rng.pick(kinds), col(rng), j < a ? S : other(S)));
  return draft(`There ${are(N)} ${NUM[N]} ${S} things.`, objects, [(o) => o.size === S], truth, ['count', 'detail'], 'count-size');
}

// ----------------------------------------------------------------------------- 3: all, none, some

function allNoneSome(rng, i) {
  const { p, truth } = plan(i, 6);
  const [K, K2, K3] = things(rng, 3);
  const q = quality(rng, p % 2 === 0 ? 'color' : 'size');
  const { V } = q;
  const word = ['all', 'none', 'some'][p % 3];
  const n = word === 'some' ? 4 : rng.range(3, 4);
  // how many of the n things have the quality
  const have = word === 'all' ? (truth ? n : n - 1) : word === 'none' ? (truth ? 0 : 1) : (truth ? 2 : 0);
  // "some" is only called true when it is two or more but not all, and only called false when it is none at all
  const lone = q.not(); // the colour (or size) of the ones that are different
  const objects = [
    ...rep(n, (j) => q.make(K, j < have ? V : (word === 'none' && q.key === 'color' ? q.not() : lone))),
    // other things that do have the quality, and one that does not: the thing word matters too
    ...rep(2, () => q.make(K2, V)),
    q.make(K3, lone),
    q.make(K3, rng.chance(0.5) ? V : lone),
  ];
  const say = word === 'all' ? `All the ${plural(K)} are ${V}.` : `${cap(word)} of the ${plural(K)} are ${V}.`;
  return draft(say, objects, kindIs(K), truth, [word === 'none' ? 'not' : 'all', 'detail'], `${word}-${q.key === 'color' ? 'colour' : 'size'}`);
}

// ----------------------------------------------------------------------------- 4: comparing

const MORE = { yes: [[2, 1], [3, 2], [4, 3], [3, 1], [4, 2]], no: [[2, 2], [3, 3], [2, 3], [3, 4], [1, 2]] };
const SAME = { yes: [[2, 2], [3, 3]], no: [[2, 3], [3, 2], [3, 4], [4, 3]] };

function comparing(rng, i) {
  const { p, truth } = plan(i, 4);
  const kinds = things(rng, 4);
  const [K, K2, K3, K4] = kinds;
  const [C, C2, C3, C4] = pickColors(rng, 4);
  const any = () => rng.pick(kinds);
  if (p === 2) {
    // "The key is bigger than the gem." - one is big and one is small, never two of the same size
    const word = Math.floor(i / 8) % 2 === 0 ? 'bigger' : 'smaller';
    const first = (word === 'bigger') === truth ? 'big' : 'small';
    const S = rng.pick(SIZES);
    const objects = [obj(K, col(rng), first), obj(K2, col(rng), other(first)), obj(K3, col(rng), S), obj(K4, col(rng), other(S))];
    return draft(`The ${K} is ${word} than the ${K2}.`, objects, kindIs(K, K2), truth, ['compare', 'detail'], word);
  }
  // (which wording comes up is tied to the item number, so that every wording is both true and not true in the level)
  const turn = Math.floor(i / 8) % 2 === 0;
  const byKind = p === 0 || (p === 3 && turn);
  const word = p === 3 ? 'as many' : turn === (p === 0) ? 'more' : 'fewer';
  let [a, b] = rng.pick((p === 3 ? SAME : MORE)[truth ? 'yes' : 'no']);
  if (word === 'fewer') [a, b] = [b, a];
  const extra = Math.max(1, 7 - a - b); // (filled up to about seven things, so the size of the picture says nothing)
  const objects = byKind
    ? [...rep(a, () => obj(K, col(rng))), ...rep(b, () => obj(K2, col(rng))), ...rep(extra, () => obj(rng.pick([K3, K4]), col(rng)))]
    : [...rep(a, () => obj(any(), C)), ...rep(b, () => obj(any(), C2)), ...rep(extra, () => obj(any(), rng.pick([C3, C4])))];
  const [x, y] = byKind ? [plural(K), plural(K2)] : [`${C} things`, `${C2} things`];
  const say = word === 'as many' ? `There are as many ${x} as ${y}.` : `There are ${word} ${x} than ${y}.`;
  return draft(say, objects, byKind ? kindIs(K, K2) : colourIs(C, C2), truth, ['compare', 'count'], `${word.replace(' ', '-')}-${byKind ? 'kind' : 'colour'}`);
}

// ----------------------------------------------------------------------------- 5: where (a single row)

function where(rng, i) {
  const { p, truth } = plan(i, 6);
  for (let tries = 0; tries < 60; tries++) {
    // five things in a row; often two of them are the same thing in different colours, so the colour word is needed
    const twins = rng.chance(0.65);
    const kinds = things(rng, twins ? 4 : 5);
    const [T1, T2] = pickColors(rng, 2);
    const row = rng.shuffle(twins ? [obj(kinds[0], T1), obj(kinds[0], T2), ...kinds.slice(1).map((k) => obj(k, col(rng)))] : kinds.map((k) => obj(k, col(rng))));
    const at = (o) => row.indexOf(o);
    const twin = (o) => row.find((x) => x !== o && x.kind === o.kind);
    const name = (o) => (twin(o) ? `${o.color} ${o.kind}` : o.kind);
    const [A, B, C] = rng.shuffle(row);
    const side = ({ 1: 'LRR', 3: 'RRL', 5: 'RLL' }[p] || 'LRL')[Math.floor(i / 6) % 3] === 'L' ? 'left' : 'right'; // both sides come up, true and not true
    const end = side === 'left' ? 0 : 4;
    const inward = side === 'left' ? 1 : -1;
    // fact = the plain meaning; yes / no = the clear-cut cases that are allowed to be spoken
    let say, args, fact, yes, no, s, v;
    if (p === 0) {
      args = [A, B];
      fact = (a, b) => Math.abs(at(a) - at(b)) === 1;
      yes = fact(A, B);
      no = Math.abs(at(A) - at(B)) === 2;
      say = `The ${name(A)} is next to the ${name(B)}.`;
      [s, v] = [['where'], 'next-to'];
    } else if (p === 1) {
      args = [A, B];
      fact = (a, b) => (at(a) - at(b)) * inward < 0;
      yes = at(A) === at(B) - inward; // directly beside it, on that side
      no = !fact(A, B) && Math.abs(at(A) - at(B)) <= 2;
      say = `The ${name(A)} is to the ${side} of the ${name(B)}.`;
      [s, v] = [['where', 'side'], `${side}-of`];
    } else if (p === 2) {
      args = [A, B, C];
      fact = (a, b, c) => (at(a) - at(b)) * (at(a) - at(c)) < 0;
      yes = fact(A, B, C) && Math.abs(at(B) - at(C)) === 2; // directly between them
      const span = [at(A), at(B), at(C)].sort((x, y) => x - y);
      no = !fact(A, B, C) && span[2] - span[0] === 2; // three in a row, but it is on the outside
      say = `The ${name(A)} is between the ${name(B)} and the ${name(C)}.`;
      [s, v] = [['where'], 'between'];
    } else if (p === 3) {
      args = [A];
      fact = (a) => at(a) === end;
      yes = fact(A);
      no = at(A) === 4 - end || at(A) === end + inward; // the other end, or one place short
      say = `The ${name(A)} is at the ${side} end of the row.`;
      [s, v] = [['where', 'side'], `${side}-end`];
    } else if (p === 4) {
      args = [A];
      fact = (a) => at(a) === 2;
      yes = fact(A);
      no = at(A) === 1 || at(A) === 3;
      say = `The ${name(A)} is in the middle of the row.`;
      [s, v] = [['where'], 'middle'];
    } else {
      args = [A];
      fact = (a) => at(a) === end + inward;
      yes = fact(A);
      no = at(A) === end || at(A) === 2 || at(A) === 4 - end - inward; // first, third, or second from the other side
      say = `The second thing from the ${side} is ${an(name(A))} ${name(A)}.`;
      [s, v] = [['where', 'side', 'ordinal'], `second-from-${side}`];
    }
    if (!(truth ? yes : no)) continue;
    // the colour word must matter: with the other twin in its place, the statement would flip
    const swaps = args.map((o, j) => (twin(o) && !args.includes(twin(o)) ? args.map((x, k) => (k === j ? twin(o) : x)) : null)).filter(Boolean);
    if (swaps.some((alt) => fact(...alt) === fact(...args))) continue;
    return draft(say, row, p === 5 ? [(o) => at(o) === end + inward] : args.map((x) => (o) => o === x), truth, s, v, { keepOrder: true, cols: 5 });
  }
  return again('no clear-cut row');
}

// ----------------------------------------------------------------------------- 6: two facts joined

function twoFacts(rng, i) {
  const { p, truth } = plan(i, 6);
  const [K, K2, K3, K4] = things(rng, 4);
  const [C, C2, C3, C4] = pickColors(rng, 4);
  const second = rng.chance(0.5); // when it is not true: which of the two parts is the wrong one
  if (p === 0) {
    // "There is a red key and no blue gem."
    const has1 = truth || second;
    const has2 = !truth && second;
    const objects = [obj(K, has1 ? C : C3), obj(K, C2), obj(K2, has2 ? C2 : C), obj(K2, C3), obj(K3, has2 ? C : rng.pick([C, C2])), obj(K4, C4)];
    return draft(`There is ${an(C)} ${C} ${K} and no ${C2} ${K2}.`, objects, kindIs(K, K2), truth, ['logic', 'not', 'detail'], 'and-no');
  }
  if (p === 1) {
    // "The star is yellow, but the hat is not green."
    const ok1 = truth || second;
    const ok2 = truth || !second;
    const objects = [obj(K, ok1 ? C : C3), obj(K2, ok2 ? rng.pick([C, C4]) : C2), obj(K3, C2), obj(K4, ok1 ? C3 : C), obj(K4, C4)];
    return draft(`The ${K} is ${C}, but the ${K2} is not ${C2}.`, objects, kindIs(K, K2), truth, ['logic', 'not', 'detail'], 'but-not');
  }
  if (p === 5) {
    // "Everything is red except the key."
    // Not true in three ways: nothing is different at all; the key is different but so is one more thing;
    // or exactly one thing is different and it is not the key (so the thing word has to be heard).
    const how = truth ? 'yes' : Math.floor(i / 6) === 0 ? 'other' : rng.pick(['none', 'two']);
    const odd = how === 'yes' || how === 'two'; // the key really is different
    const stray = how === 'two' || how === 'other'; // one of the other things is different
    const rest = [K2, K3, K4, rng.pick([K2, K3, K4]), rng.pick([K2, K3, K4])];
    const objects = [obj(K, odd ? C2 : C), ...rest.map((k, j) => obj(k, stray && j === 0 ? rng.pick([C2, C3]) : C))];
    return draft(`Everything is ${C} except the ${K}.`, objects, [(o) => o.kind === K, (o) => o.color !== C], truth, ['logic', 'except'], 'all-except');
  }
  // "Neither the key nor the bell is red." / "Either the key or the bell is red." / "Both the key and the bell are red."
  const q = quality(rng, Math.floor(i / 6) % 3 === p % 3 ? 'size' : 'color'); // each of the three is asked once about a size
  const { V } = q;
  const word = ['neither', 'either', 'both'][p - 2];
  const count = word === 'neither' ? (truth ? 0 : 1) : word === 'either' ? (truth ? 1 : 0) : (truth ? 2 : 1); // how many of the two are so ("either" is never used when both are)
  const [v1, v2] = rng.shuffle([count >= 1, count === 2]);
  const lone = q.not();
  const objects = [q.make(K, v1 ? V : lone), q.make(K2, v2 ? V : q.not()), q.make(K3, V), q.make(K4, lone), q.make(K4, rng.chance(0.5) ? V : lone)];
  const say = word === 'neither' ? `Neither the ${K} nor the ${K2} is ${V}.` : word === 'either' ? `Either the ${K} or the ${K2} is ${V}.` : `Both the ${K} and the ${K2} are ${V}.`;
  return draft(say, objects, kindIs(K, K2), truth, ['logic', ...(word === 'neither' ? ['not'] : []), 'detail'], `${word}-${q.key === 'color' ? 'colour' : 'size'}`);
}

// ----------------------------------------------------------------------------- 7: two-part statements, from memory

function master(rng, i) {
  const { p, truth } = plan(i, 6);
  const kinds = things(rng, 3);
  const [K, K2, K3] = kinds;
  const [C, C2, C3, C4] = pickColors(rng, 4);
  const S = rng.pick(SIZES);
  const S2 = other(S);
  // (pictures are filled up to about eight things, so their size says nothing about the answer)
  const fill = (used, least = 1) => Math.max(least, 8 - used);
  const first = !truth && rng.chance(0.5); // the first part is the wrong one
  const second = !truth && !first; // the second part is the wrong one
  const hidden = { hide: true };

  if (p === 0) {
    // "There are more red things than blue things, and none of the keys are small."
    const [a, b] = rng.pick(MORE[first ? 'no' : 'yes']);
    const colours = rng.shuffle([...rep(a, () => C), ...rep(b, () => C2), ...rep(fill(a + b), () => rng.pick([C3, C4]))]);
    const nK = rng.range(2, 3);
    const objects = colours.map((c, j) => (j < nK ? obj(K, c, second && j === 0 ? S : S2) : obj(rng.pick([K2, K3]), c, j === nK ? S : rng.pick(SIZES))));
    return draft(`There are more ${C} things than ${C2} things, and none of the ${plural(K)} are ${S}.`, objects, [...colourIs(C, C2), ...kindIs(K)], truth, ['logic', 'compare', 'not', 'hidden'], 'more-and-none', hidden);
  }
  if (p === 1) {
    // "There are three gems, and all of them are red."
    const q = quality(rng);
    const N = rng.range(2, 4);
    const n = first ? off(rng, N, 2) : N; // (never just one: "all of them" needs a few)
    const lone = q.not();
    const objects = [
      ...rep(n, (j) => q.make(K, second && j === 0 ? lone : q.V)),
      q.make(K2, q.V),
      q.make(K2, lone),
      ...rep(fill(n + 2), () => q.make(rng.pick([K2, K3]), rng.chance(0.5) ? q.V : q.not())),
    ];
    return draft(`There are ${NUM[N]} ${plural(K)}, and all of them are ${q.V}.`, objects, kindIs(K), truth, ['logic', 'count', 'all', 'hidden'], `count-and-all-${q.key === 'color' ? 'colour' : 'size'}`, hidden);
  }
  if (p === 2) {
    // "There are fewer keys than gems, but more keys than stars."   [keys, gems, stars]
    const [a, b, c] = rng.pick(first ? [[3, 3, 2], [3, 2, 1], [3, 3, 1], [4, 3, 2]] : second ? [[2, 3, 2], [2, 3, 3], [2, 4, 2], [1, 3, 2]] : [[2, 3, 1], [3, 4, 2], [2, 4, 1], [3, 4, 1]]);
    const objects = [...rep(a, () => obj(K, col(rng))), ...rep(b, () => obj(K2, col(rng))), ...rep(c, () => obj(K3, col(rng)))];
    return draft(`There are fewer ${plural(K)} than ${plural(K2)}, but more ${plural(K)} than ${plural(K3)}.`, objects, kindIs(K, K2, K3), truth, ['logic', 'compare', 'count', 'hidden'], 'fewer-but-more', hidden);
  }
  if (p === 3) {
    // "None of the keys are red, but two of the gems are."
    const N = rng.range(2, 3);
    const n = second ? N - 1 : N; // (one short, never one more: "two of them are" with three could be argued about)
    const nK = rng.range(2, 3);
    const rest = rng.range(1, 2);
    const objects = [
      ...rep(nK, (j) => obj(K, first && j === 0 ? C : rng.pick([C2, C3]))),
      ...rep(n, () => obj(K2, C)),
      ...rep(rest, () => obj(K2, rng.pick([C2, C3]))),
      ...rep(fill(nK + n + rest), () => obj(K3, rng.pick([C, C2, C3]))),
    ];
    return draft(`None of the ${plural(K)} are ${C}, but ${NUM[N]} of the ${plural(K2)} are.`, objects, kindIs(K, K2), truth, ['logic', 'not', 'count', 'hidden'], 'none-but-count', hidden);
  }
  if (p === 4) {
    // "All but one of the keys are red, and there are more keys than gems."
    const n = rng.range(3, 4);
    const different = first ? rng.pick([0, 2]) : 1;
    const b = second ? rng.pick([n, n + 1]) : n - rng.range(1, 2);
    const objects = [
      ...rep(n, (j) => obj(K, j < different ? rng.pick([C2, C3]) : C)),
      ...rep(b, () => obj(K2, rng.pick([C, C2, C3]))),
      ...rep(fill(n + b, 0), () => obj(K3, rng.pick([C, C2]))),
    ];
    return draft(`All but one of the ${plural(K)} are ${C}, and there are more ${plural(K)} than ${plural(K2)}.`, objects, kindIs(K, K2), truth, ['logic', 'all', 'compare', 'hidden'], 'all-but-one-and-more', hidden);
  }
  // "All the keys are small, and there are three red things."
  const N = rng.range(2, 4);
  const n = second ? off(rng, N) : N;
  const total = Math.max(n + 2, rng.range(7, 8));
  const nK = rng.range(2, 3);
  const colours = rng.shuffle([...rep(n, () => C), ...rep(total - n, () => rng.pick([C2, C3]))]);
  const objects = colours.map((c, j) => (j < nK ? obj(K, c, first && j === 0 ? S2 : S) : obj(rng.pick([K2, K3]), c, j === nK ? S2 : j === nK + 1 ? S : rng.pick(SIZES))));
  return draft(`All the ${plural(K)} are ${S}, and there are ${NUM[N]} ${C} things.`, objects, [...kindIs(K), ...colourIs(C)], truth, ['logic', 'all', 'count', 'hidden'], 'all-and-count', hidden);
}

// -----------------------------------------------------------------------------

const quota = { yes: 2, no: 2 }; // every mission: at least two true and two not true; the other two turns are left to chance

export default {
  id: 'truth', name: 'Truth Detector', blurb: 'True, or not true? Look, listen and decide.', color: '#e8507a', speed: 0.93, allowNone: false,
  levels: [
    { id: 'truth1', title: 'True or Not', n: 18, quota, gen: oneFact,
      tip: 'Look at the picture and listen to what I say about it. If it is true, tap the green check mark. If it is not true, tap the cross.' },
    { id: 'truth2', title: 'Count Them', n: 18, quota, gen: counting,
      tip: 'Now you have to count. It is only true if the number is exactly right. When I have finished talking, you can touch the things in the picture to mark them as you count.' },
    { id: 'truth3', title: 'All, None, Some', n: 18, quota, gen: allNoneSome,
      tip: 'Listen for three little words. All means every single one. None means not even one. Some means a few of them. Check each one in the picture.' },
    { id: 'truth4', title: 'More or Fewer', n: 18, quota, gen: comparing,
      tip: 'Now we compare. More means a bigger number. Fewer means a smaller number. As many means the very same number. Look at both groups before you choose.' },
    { id: 'truth5', title: 'Where Is It', n: 18, quota, gen: where,
      tip: 'Everything stands in one row now. Listen for where things are: next to, between, left, right, the end, and the middle. Find the place, then choose.' },
    { id: 'truth6', title: 'Two Facts', n: 18, quota, gen: twoFacts,
      tip: 'Now I say two things in one sentence. Check them both. Listen for the little words that change everything: and, but, not, either, neither, and except.' },
    { id: 'truth7', title: 'Master Detective', n: 18, quota, gen: master, holdMs: 600,
      tip: 'The hardest test. The picture is covered while I talk, so hold the whole sentence in your head. It has two parts, and both must be true. Then look, count and choose.' },
    { id: 'truth-boss', title: 'Truth Boss', boss: true, quota, mix: ['truth5', 'truth6', 'truth7'], holdMs: 600,
      tip: 'Truth Boss! Rows, two facts at once, and covered pictures. Listen to every word, check every part, and then decide. You can do it.' },
  ],
};
