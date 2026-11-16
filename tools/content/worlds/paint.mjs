// World "paint" - PAINT SHOP. He colours things the way the voice says (activity type "paint").
//
// The ladder, one new difficulty per level:
//   1 one thing, one colour          2 two paint jobs            3 big / small look-alikes
//   4 all, everything, except        5 where it is in a row      6 not, neither, unless, if, only if
//   7 three or four jobs from memory (the picture is hidden while the voice talks)
//
// A generator returns a draft for tools/content/types/paint.mjs:
//   { t: 'paint', say, objects: [thing...], jobs: [[thing or things, colour]...], pots?, cols?, keepOrder?, hide?, s, v }
// Things are always unpainted; `jobs` are done in order and give the colour each thing ends up with.

import { OBJECTS, COLORS, SIZES, obj, pickKinds, pickColors, plural, an, other } from '../lib.mjs';

const KINDS = OBJECTS.filter((k) => k !== 'torch'); // (the torch has too little to colour in)
const ORD = ['first', 'second', 'third', 'fourth'];

const thing = (kind, size = 'big') => obj(kind, 'gray', size);
const kindsOf = (rng, n) => pickKinds(rng, n, { from: KINDS });
const size = (rng) => rng.pick(SIZES);
const retry = (why) => { throw new Error(`try again: ${why}`); };
const draft = (say, objects, jobs, s, v, extra = {}) => ({ t: 'paint', say, objects, jobs, s, v, ...extra });
/** "A, B, and C" / "A and B" */
const list = (parts) => (parts.length < 3 ? parts.join(' and ') : `${parts.slice(0, -1).join(', ')}, and ${parts.at(-1)}`);
/** A row of n things drawn from a few kinds, never all the same. */
function rowOf(rng, n, pool) {
  for (;;) {
    const row = Array.from({ length: n }, () => thing(rng.pick(pool)));
    if (new Set(row.map((o) => o.kind)).size > 1) return row;
  }
}
const row = (say, objects, jobs, s, v, extra = {}) => draft(say, objects, jobs, s, v, { keepOrder: true, cols: objects.length, ...extra });

export default {
  id: 'paint', name: 'Paint Shop', blurb: 'Grab a paint pot and color things just the way I say.', color: '#e0508f', speed: 0.95,
  levels: [
    // ------------------------------------------------------------------ 1: one thing, one colour
    {
      id: 'paint1', title: 'First Coat', n: 18,
      tip: 'Welcome to the Paint Shop! Tap a paint pot, then tap the thing to paint it. When it looks right, press the green check mark.',
      gen(rng, i) {
        const objects = kindsOf(rng, 4).map((k) => thing(k));
        const K = objects[0].kind;
        const C = rng.pick(COLORS);
        const say = [`Paint the ${K} ${C}.`, `Make the ${K} ${C}.`, `Use the ${C} paint on the ${K}.`][i % 3];
        return draft(say, objects, [[objects[0], C]], ['paint'], ['one', 'one-make', 'one-use'][i % 3], { pots: 4 });
      },
    },
    // ------------------------------------------------------------------ 2: two paint jobs
    {
      id: 'paint2', title: 'Two Colors', n: 18,
      tip: 'Two paint jobs now. Made a slip? Tap the sponge with the bubbles, then the thing, to wash it clean. Or press the arrow to take it back.',
      gen(rng, i) {
        const objects = kindsOf(rng, 5).map((k) => thing(k));
        const [a, b] = objects;
        const [C1, C2] = pickColors(rng, 2);
        const s = ['paint', 'steps2'];
        const extra = { pots: 5 };
        switch (i % 4) {
          case 0: return draft(`Paint the ${a.kind} ${C1} and the ${b.kind} ${C2}.`, objects, [[a, C1], [b, C2]], s, 'two', extra);
          case 1: return draft(`Use ${C1} on the ${a.kind} and ${C2} on the ${b.kind}.`, objects, [[a, C1], [b, C2]], s, 'two-use', extra);
          case 2: return draft(`Paint the ${a.kind} and the ${b.kind} ${C1}.`, objects, [[[a, b], C1]], s, 'two-same', extra);
          default: return draft(`The ${a.kind} should be ${C1}, and the ${b.kind} should be ${C2}.`, objects, [[a, C1], [b, C2]], s, 'two-should', extra);
        }
      },
    },
    // ------------------------------------------------------------------ 3: big and small
    {
      id: 'paint3', title: 'Big and Small', n: 18,
      tip: 'Now listen for big or small. Two things can look the same, so the size tells you which one to paint.',
      gen(rng, i) {
        const [K1, K2, K3, K4] = kindsOf(rng, 4);
        const [C1, C2] = pickColors(rng, 2);
        const S1 = size(rng);
        const S2 = size(rng);
        const s = ['paint', 'detail', 'steps2'];
        const pair = (k) => [thing(k, 'big'), thing(k, 'small')];
        switch (i % 4) {
          case 0: { // both sizes of one kind
            const objects = [...pair(K1), ...pair(K2), thing(K3, size(rng)), thing(K4, size(rng))];
            const a = objects.find((o) => o.kind === K1 && o.size === S1);
            const b = objects.find((o) => o.kind === K1 && o.size === other(S1));
            return draft(`Paint the ${S1} ${K1} ${C1} and the ${other(S1)} ${K1} ${C2}.`, objects, [[a, C1], [b, C2]], s, 'size-pair');
          }
          case 1: { // a size word for each of two kinds
            const objects = [...pair(K1), ...pair(K2), thing(K3, size(rng))];
            const a = objects.find((o) => o.kind === K1 && o.size === S1);
            const b = objects.find((o) => o.kind === K2 && o.size === S2);
            return draft(`Paint the ${S1} ${K1} ${C1} and the ${S2} ${K2} ${C2}.`, objects, [[a, C1], [b, C2]], s, 'size-mixed');
          }
          case 2: { // one needs its size, the other is the only one of its kind
            const objects = [...pair(K1), thing(K2, size(rng)), ...pair(K3), thing(K4, size(rng))];
            const a = objects.find((o) => o.kind === K1 && o.size === S1);
            const b = objects[2];
            const say = rng.chance(0.5) ? `Paint the ${S1} ${K1} ${C1} and the ${K2} ${C2}.` : `Paint the ${K2} ${C2} and the ${S1} ${K1} ${C1}.`;
            return draft(say, objects, [[a, C1], [b, C2]], s, 'size-one');
          }
          default: { // two things, one colour
            const objects = [...pair(K1), ...pair(K2), thing(K3, size(rng))];
            const a = objects.find((o) => o.kind === K1 && o.size === S1);
            const b = objects.find((o) => o.kind === K2 && o.size === S2);
            return draft(`Paint the ${S1} ${K1} and the ${S2} ${K2} ${C1}.`, objects, [[[a, b], C1]], s, 'size-same');
          }
        }
      },
    },
    // ------------------------------------------------------------------ 4: all and except
    {
      id: 'paint4', title: 'All But One', n: 18,
      tip: 'Tricky words: ALL and EXCEPT. All means every one that fits. Except means leave that one alone, with no paint at all.',
      gen(rng, i) {
        const [K1, K2, K3, K4] = kindsOf(rng, 4);
        const [C1, C2] = pickColors(rng, 2);
        const S = size(rng);
        switch (i % 5) {
          case 0: { // all of one kind
            const mine = [thing(K1, 'big'), thing(K1, 'small'), thing(K1, size(rng))];
            const objects = [...mine, thing(K2, 'big'), thing(K2, 'small'), thing(K3, size(rng))];
            return draft(`Paint all the ${plural(K1)} ${C1}.`, objects, [[mine, C1]], ['paint', 'all'], 'all-kind');
          }
          case 1: { // all of one size
            const n = rng.range(6, 7);
            const nS = rng.range(2, 4);
            const pool = [K1, K2, K3, K4];
            const objects = Array.from({ length: n }, (_, j) => thing(pool[j % 4], j < nS ? S : other(S)));
            return draft(`Paint all the ${S} things ${C1}.`, objects, [[objects.slice(0, nS), C1]], ['paint', 'all', 'detail'], 'all-size');
          }
          case 2: { // all of a kind, except the one that is the other size
            const odd = thing(K1, S);
            const mine = Array.from({ length: rng.range(2, 3) }, () => thing(K1, other(S)));
            const objects = [odd, ...mine, thing(K2, S), thing(K2, other(S)), thing(K3, S)];
            return draft(`Paint all the ${plural(K1)} ${C1} except the ${S} one.`, objects, [[mine, C1]], ['paint', 'all', 'except', 'detail'], 'except-size');
          }
          case 3: { // everything except one kind
            const rest = [thing(K2, 'big'), thing(K2, 'small'), thing(K3, size(rng)), thing(K4, size(rng))];
            if (rng.chance(0.5)) rest.push(thing(K3, size(rng)));
            const objects = [thing(K1, size(rng)), ...rest];
            return draft(`Paint everything ${C1} except the ${K1}.`, objects, [[rest, C1]], ['paint', 'all', 'except'], 'except-kind');
          }
          default: { // two groups, two colours
            const a = Array.from({ length: rng.range(2, 3) }, (_, j) => thing(K1, j ? size(rng) : 'big'));
            const b = Array.from({ length: rng.range(2, 3) }, (_, j) => thing(K2, j ? size(rng) : 'small'));
            const objects = [...a, ...b, thing(K3, size(rng))];
            if (objects.length < 8 && rng.chance(0.5)) objects.push(thing(K4, size(rng)));
            return draft(`Paint all the ${plural(K1)} ${C1} and all the ${plural(K2)} ${C2}.`, objects, [[a, C1], [b, C2]], ['paint', 'all', 'steps2'], 'all-two');
          }
        }
      },
    },
    // ------------------------------------------------------------------ 5: where it is in a row
    {
      id: 'paint5', title: 'In a Row', n: 18,
      tip: 'Now they stand in one row. The row starts on the left, like reading. Listen for where: second, last, in the middle, between, next to.',
      gen(rng, i) {
        const [K1, K2, K3, K4] = kindsOf(rng, 4);
        const [C1, C2, C3] = pickColors(rng, 3);
        const n = rng.range(5, 7);
        const cols = [C1, C2, C3];
        const say = (parts) => `Paint ${list(parts.map(([p], j) => `${p} ${cols[j]}`))}.`;
        const jobs = (parts) => parts.map(([, o], j) => [o, cols[j]]);
        const apart = (parts) => { if (new Set(parts.flatMap(([, o]) => o)).size !== parts.flatMap(([, o]) => o).length) retry('same place twice'); return parts; };
        switch (i % 5) {
          case 0: { // counting from each end, and one more place
            const objects = rowOf(rng, n, [K1, K2, K3]);
            const a = rng.range(2, 4);
            const b = rng.range(2, 4);
            const more = [['the first one', objects[0]], ['the last one', objects[n - 1]]];
            if (n % 2) more.push(['the one in the middle', objects[(n - 1) / 2]]);
            const parts = apart([[`the ${ORD[a - 1]} one from the left`, objects[a - 1]], [`the ${ORD[b - 1]} one from the right`, objects[n - b]], rng.pick(more)]);
            return row(say(parts), objects, jobs(parts), ['paint', 'ordinal', 'where', 'steps3'], 'row-ord');
          }
          case 1: { // the two ends (one thing or two) and the middle
            const m = rng.pick([5, 7]);
            const objects = rowOf(rng, m, [K1, K2, K3]);
            const parts = rng.shuffle([
              rng.chance(0.5) ? ['the first one', objects[0]] : ['the first two', objects.slice(0, 2)],
              rng.chance(0.5) ? ['the last one', objects[m - 1]] : ['the last two', objects.slice(m - 2)],
              ['the one in the middle', objects[(m - 1) / 2]],
            ]);
            return row(say(parts), objects, jobs(parts), ['paint', 'ordinal', 'where', 'steps3'], 'row-ends');
          }
          case 2: { // between two named things, one of those two, and one counted
            const objects = rowOf(rng, n, [K3, K4]);
            const p = rng.range(0, n - 3);
            const [A, B] = rng.shuffle([K1, K2]);
            objects[p] = thing(A);
            objects[p + 2] = thing(B);
            const fromLeft = rng.chance(0.5);
            const k = rng.range(1, 3);
            const which = rng.pick([p, p + 2]);
            const [x, y] = rng.chance(0.5) ? [A, B] : [B, A]; // either one may be named first
            const parts = apart([[`the one between the ${x} and the ${y}`, objects[p + 1]], [`the ${objects[which].kind}`, objects[which]],
              [`the ${ORD[k - 1]} one from the ${fromLeft ? 'left' : 'right'}`, objects[fromLeft ? k - 1 : n - k]]]);
            return row(say(parts), objects, jobs(parts), ['paint', 'where', 'ordinal', 'steps3'], 'row-between');
          }
          case 3: { // both neighbours of a named thing, the thing itself, and one end of the row
            const objects = rowOf(rng, n, [K2, K3]);
            const p = rng.range(1, n - 2);
            objects[p] = thing(K1);
            const ends = [];
            if (p >= 2) ends.push(['the first one', objects[0]]);
            if (p <= n - 3) ends.push(['the last one', objects[n - 1]]);
            const parts = [[`both things next to the ${K1}`, [objects[p - 1], objects[p + 1]]], [`the ${K1}`, objects[p]], rng.pick(ends)];
            return row(say(parts), objects, jobs(parts), ['paint', 'where', 'steps4'], 'row-sides');
          }
          default: { // counting only one kind of thing, and a thing that is the only one of its kind
            const m = rng.range(3, 4);
            const objects = rng.shuffle([...Array.from({ length: m }, () => thing(K1)), thing(K2), ...Array.from({ length: rng.range(1, 6 - m) }, () => thing(K3))]);
            const mine = objects.filter((o) => o.kind === K1);
            const a = rng.range(1, m);
            const b = rng.range(1, m);
            const len = objects.length;
            // counting the kind must give a different answer from counting every thing, or the kind word is not needed
            if (objects[a - 1] === mine[a - 1] && objects[len - b] === mine[m - b]) retry('the kind word must matter');
            const parts = apart([[`the ${ORD[a - 1]} ${K1} from the left`, mine[a - 1]], [`the ${ORD[b - 1]} ${K1} from the right`, mine[m - b]], [`the ${K2}`, objects.find((o) => o.kind === K2)]]);
            return row(say(parts), objects, jobs(parts), ['paint', 'ordinal', 'where', 'detail', 'steps3'], 'row-kind');
          }
        }
      },
    },
    // ------------------------------------------------------------------ 6: not, neither, unless, if
    {
      id: 'paint6', title: 'Not and If', n: 18,
      tip: 'Listen for NOT, IF, and UNLESS. They tell you which things get paint, and which things you must leave alone.',
      gen(rng, i) {
        const [K1, K2, K3, K4] = kindsOf(rng, 4);
        const [C1, C2] = pickColors(rng, 2);
        const S = size(rng);
        const T = other(S);
        switch (i % 6) {
          case 0: { // every one but not the odd one - which gets its own colour
            const odd = thing(K1, S);
            const mine = [thing(K1, T), thing(K1, T)];
            const objects = [odd, ...mine, thing(K2, S), thing(K2, T), thing(K3, S)];
            return draft(`Paint every ${K1} ${C1}, but not the ${S} one. Paint that one ${C2}.`, objects, [[mine, C1], [odd, C2]], ['paint', 'not', 'all', 'detail', 'steps3'], 'not-size');
          }
          case 1: { // a rule for every thing in the picture
            const nS = rng.range(2, 4);
            const pool = [K1, K2, K3, K4];
            const objects = Array.from({ length: 6 }, (_, j) => thing(pool[j % 4], j < nS ? S : T));
            return draft(`If a thing is ${S}, paint it ${C1}. Paint the ${T} ones ${C2}.`, objects, [[objects.slice(0, nS), C1], [objects.slice(nS), C2]], ['paint', 'if', 'all', 'detail', 'steps4'], 'if-size');
          }
          case 2: { // neither ... nor - and one of the two gets its own colour
            const quiet = [thing(K1, 'big'), thing(K1, 'small')];
            const second = [thing(K2, size(rng))];
            if (rng.chance(0.5)) second.push(thing(K2, size(rng)));
            const mine = [thing(K3, 'big'), thing(K3, 'small'), thing(K4, size(rng))];
            const [first, last] = rng.chance(0.5) ? [K1, K2] : [K2, K1]; // which of the two is named first
            const others = second.length > 1 ? `the ${plural(K2)}` : `the ${K2}`;
            return draft(`Paint everything that is neither ${an(first)} ${first} nor ${an(last)} ${last} ${C1}. Paint ${others} ${C2}.`, [...quiet, ...second, ...mine],
              [[mine, C1], [second, C2]], ['paint', 'not', 'all', 'steps4'], 'neither');
          }
          case 3: { // unless - and the big ones of that kind get their own colour
            const mine = [thing(K2, S), thing(K3, S)];
            if (rng.chance(0.5)) mine.push(thing(K4, S));
            const others = [thing(K1, T)];
            if (rng.chance(0.5)) others.push(thing(K1, T));
            const objects = [...mine, thing(K1, S), ...others, thing(K2, T), thing(K3, T)];
            const those = others.length > 1 ? `the ${T} ${plural(K1)}` : `the ${T} ${K1}`;
            return draft(`Paint all the ${S} things ${C1}, unless they are ${plural(K1)}. Paint ${those} ${C2}.`, objects, [[mine, C1], [others, C2]], ['paint', 'if', 'not', 'all', 'detail', 'steps4'], 'unless');
          }
          case 4: { // a sure job, and one that depends on what he sees
            const mine = [thing(K1, 'big'), thing(K1, 'small')];
            if (rng.chance(0.5)) mine.push(thing(K1, size(rng)));
            const maybe = thing(K2, size(rng));
            const objects = [...mine, maybe, thing(K3, S), thing(K3, T)];
            const jobs = [[mine, C1]];
            if (maybe.size === S) jobs.push([maybe, C2]);
            return draft(`Paint all the ${plural(K1)} ${C1}. Paint the ${K2} ${C2}, but only if it is ${S}.`, objects, jobs, ['paint', 'if', 'all', 'detail', 'steps3'], 'only-if');
          }
          default: { // count, then decide
            const a = rng.range(2, 4);
            const b = rng.range(2, 4);
            if (a === b) retry('must not be a tie');
            const first = Array.from({ length: a }, () => thing(K1, size(rng)));
            const second = Array.from({ length: b }, () => thing(K2, size(rng)));
            const objects = [...first, ...second, thing(K3, size(rng))];
            return draft(`If there are more ${plural(K1)} than ${plural(K2)}, paint the ${plural(K1)} ${C1}. If not, paint the ${plural(K2)} ${C2}.`, objects,
              [a > b ? [first, C1] : [second, C2]], ['paint', 'if', 'all'], 'if-more');
          }
        }
      },
    },
    // ------------------------------------------------------------------ 7: three or four jobs, from memory
    {
      id: 'paint7', title: 'Paint by Memory', n: 18, holdMs: 700,
      tip: 'Now the things are hidden while I talk, and there are three or four paint jobs. Say each one back in your head. Then paint.',
      gen(rng, i) {
        const [K1, K2, K3, K4, K5] = kindsOf(rng, 5);
        const [C1, C2, C3, C4] = pickColors(rng, 4);
        const S = size(rng);
        const T = other(S);
        const hide = { hide: true };
        switch (i % 6) {
          case 0: { // three things, two of them told apart by size
            const a = thing(K1, size(rng));
            const b = thing(K2, S);
            const c = thing(K2, T);
            const objects = [a, b, c, thing(K3, 'big'), thing(K3, 'small'), thing(K4, size(rng))];
            const parts = rng.shuffle([[`the ${K1}`, a], [`the ${S} ${K2}`, b], [`the ${T} ${K2}`, c]]);
            const cols = [C1, C2, C3];
            return draft(`Paint ${list(parts.map(([p], j) => `${p} ${cols[j]}`))}.`, objects, parts.map(([, o], j) => [o, cols[j]]), ['paint', 'hidden', 'detail', 'steps3'], 'mem-three', hide);
          }
          case 1: { // all except one, the odd one its own colour, and one more thing
            const odd = thing(K1, S);
            const mine = [thing(K1, T), thing(K1, T)];
            const solo = thing(K2, size(rng));
            const objects = [odd, ...mine, solo, thing(K3, S), thing(K3, T)];
            return draft(`Paint all the ${plural(K1)} ${C1} except the ${S} one. Paint that one ${C2} and the ${K2} ${C3}.`, objects, [[mine, C1], [odd, C2], [solo, C3]], ['paint', 'hidden', 'all', 'except', 'detail', 'steps4'], 'mem-except', hide);
          }
          case 2: { // a row: one counted, the middle one, and one named
            const objects = rowOf(rng, 5, [K2, K3]);
            const fromLeft = rng.chance(0.5);
            const k = rng.range(1, 2);
            const at = fromLeft ? k - 1 : 5 - k;
            const spot = rng.pick([0, 1, 3, 4].filter((x) => x !== at));
            objects[spot] = thing(K1);
            const parts = rng.shuffle([[`the ${ORD[k - 1]} one from the ${fromLeft ? 'left' : 'right'}`, objects[at]], ['the one in the middle', objects[2]], [`the ${K1}`, objects[spot]]]);
            const cols = [C1, C2, C3];
            return row(`Paint ${list(parts.map(([p], j) => `${p} ${cols[j]}`))}.`, objects, parts.map(([, o], j) => [o, cols[j]]), ['paint', 'hidden', 'where', 'ordinal', 'steps3'], 'mem-row', hide);
          }
          case 3: { // four things, four colours
            const a = thing(K1, size(rng));
            const b = thing(K2, size(rng));
            const c = thing(K3, 'big');
            const d = thing(K3, 'small');
            const objects = [a, b, c, d, thing(K4, size(rng)), thing(K5, size(rng))];
            const parts = rng.shuffle([[`the ${K1}`, a], [`the ${K2}`, b], [`the big ${K3}`, c], [`the small ${K3}`, d]]);
            const cols = [C1, C2, C3, C4];
            return draft(`Paint ${list(parts.map(([p], j) => `${p} ${cols[j]}`))}.`, objects, parts.map(([, o], j) => [o, cols[j]]), ['paint', 'hidden', 'detail', 'steps4'], 'mem-four', hide);
          }
          case 4: { // every one of a size but not one kind, which gets another colour
            const odd = thing(K1, S);
            const mine = [thing(K2, S), thing(K3, S)];
            if (rng.chance(0.5)) mine.push(thing(K4, S));
            const objects = [odd, ...mine, thing(K2, T), thing(K3, T)];
            return draft(`Paint every ${S} thing ${C1}, but not the ${K1}. Paint the ${K1} ${C2}.`, objects, [[mine, C1], [odd, C2]], ['paint', 'hidden', 'not', 'all', 'detail', 'steps4'], 'mem-not', hide);
          }
          default: { // two groups and a single thing
            const a = [thing(K1, 'big'), thing(K1, 'small')];
            if (rng.chance(0.5)) a.push(thing(K1, size(rng)));
            const b = [thing(K2, size(rng)), thing(K2, size(rng))];
            const c = thing(K3, size(rng));
            const objects = [...a, ...b, c, thing(K4, size(rng))];
            return draft(`Paint all the ${plural(K1)} ${C1}, all the ${plural(K2)} ${C2}, and the ${K3} ${C3}.`, objects, [[a, C1], [b, C2], [c, C3]], ['paint', 'hidden', 'all', 'steps3'], 'mem-all', hide);
          }
        }
      },
    },
    // ------------------------------------------------------------------ boss
    { id: 'paint-boss', title: 'Paint Boss', boss: true, mix: ['paint5', 'paint6', 'paint7'], holdMs: 700,
      tip: 'Paint Boss! Rows, tricky words, and painting from memory, all mixed up. Listen all the way to the end.' },
  ],
};
