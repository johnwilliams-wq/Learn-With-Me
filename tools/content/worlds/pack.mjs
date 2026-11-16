// World "pack" - Move and Pack (activity type "put", see src/listening/scenes/put.js).
//
// Things stand on a shelf; he moves them where the voice says: into a container, onto the
// table or under it. The ladder, one new difficulty per level:
//   1 one move                         "Put the key in the chest."
//   2 two moves, detail words          colour, size, and where: in / on / under
//   3 counting                         "Put three coins in the pot."  (any three - but exactly three)
//   4 sorting                          all, everything, except, all but one
//   5 order                            first / then / last, before and after said backwards, not ... until
//   6 conditions                       if / if not, only if, unless, neither ... nor, more than
//   7 from memory                      the shelf is covered while the voice talks; four or five moves
//   boss                               a mix of 5, 6 and 7
//
// Every generator returns a draft for tools/content/types/put.mjs: things, places and moves.
// Wording rules: a detail word is only ever said when it is needed (the() works out the
// shortest description that fits exactly one thing), and counts are always smaller than what
// is on the shelf, so the number has to be listened to.

import { COLORS, obj, pickKinds, pickColors, plural, an, cap } from '../lib.mjs';
import { THING_KINDS, PLACE_CLASH, CAPACITY as ROOM } from '../types/put.mjs';

const CONTAINERS = ['chest', 'bag', 'basket', 'pot', 'cart'];
const NUM = ['no', 'one', 'two', 'three', 'four', 'five'];

const col = (rng) => rng.pick(COLORS);
/** "in the chest", "on the table", "under the table" */
const at = (p) => `${p.prep} the ${p.kind}`;
/** "three coins", "one coin", "two red gems" */
const many = (n, kind, detail = '') => `${NUM[n]} ${detail ? `${detail} ` : ''}${n === 1 ? kind : plural(kind)}`;
const copies = (n, kind, color, size) => Array.from({ length: n }, () => obj(kind, color, size));
const mv = (what, to, n) => ({ what: [].concat(what), to, ...(n ? { n } : {}) });

/** The places of a scene (containers, and perhaps the table) and the kinds of thing that may stand next to them. */
function setting(rng, containers, table = false) {
  const boxes = rng.sample(CONTAINERS, containers).map((kind) => ({ kind, prep: 'in' }));
  const places = table ? [...boxes, { kind: 'table', prep: 'on' }, { kind: 'table', prep: 'under' }] : boxes;
  const banned = places.flatMap((p) => PLACE_CLASH[p.kind] || []);
  const roomy = (need, not = []) => places.filter((p) => ROOM[p.prep] >= need && !not.includes(p));
  return {
    places,
    /** a place with room for `need` things that is none of `not` */
    spot(need = 1, not = []) {
      const pool = roomy(need, not);
      if (!pool.length) throw new Error('no place is big enough - try again');
      return rng.pick(pool);
    },
    /** k different kinds of thing, none of which sounds like another or like a place */
    kinds: (k) => pickKinds(rng, k, { from: THING_KINDS.filter((x) => !banned.includes(x)) }),
  };
}
/** Two containers, or a container and the table, or (harder to scan) two containers and the table. */
function anywhere(rng, three = 0.25) {
  const r = rng.next();
  return r < three ? setting(rng, 2, true) : r < three + (1 - three) / 2 ? setting(rng, 1, true) : setting(rng, 2);
}

/** The shortest description that fits exactly this thing: "the key", "the red key", "the small key", "the small red key". */
function the(t, things) {
  const twins = things.filter((o) => o !== t && o.kind === t.kind);
  const size = t.size || 'big';
  const sizeOf = (o) => o.size || 'big';
  if (!twins.length) return `the ${t.kind}`;
  if (twins.every((o) => o.color !== t.color)) return `the ${t.color} ${t.kind}`;
  if (twins.every((o) => sizeOf(o) !== size)) return `the ${size} ${t.kind}`;
  if (twins.every((o) => o.color !== t.color || sizeOf(o) !== size)) return `the ${size} ${t.color} ${t.kind}`;
  throw new Error('ambiguous: two things look exactly the same');
}

const draft = (S, say, things, moves, s, v, extra = {}) => ({ t: 'put', say, things, places: S.places, moves, s, v, ...extra });

/** Two things to move, each with a look-alike in another colour, plus `extra` other things. */
function pair(rng, S, extra = 1) {
  const [K1, K2, ...more] = S.kinds(2 + extra);
  const [C1, C1b] = pickColors(rng, 2);
  const [C2, C2b] = pickColors(rng, 2);
  const a = obj(K1, C1);
  const b = obj(K2, C2);
  const rest = more.map((k) => obj(k, col(rng)));
  return { a, b, rest, things: [a, b, obj(K1, C1b), obj(K2, C2b), ...rest] };
}
/** One thing with a colour look-alike, `singles` things that are the only one of their kind, and `extra` more. */
function oddments(rng, S, singles, extra = 1) {
  const [K, ...kinds] = S.kinds(1 + singles + extra);
  const [C, Cb] = pickColors(rng, 2);
  const a = obj(K, C);
  const others = kinds.map((k) => obj(k, col(rng)));
  return { a, singles: others.slice(0, singles), things: [a, obj(K, Cb), ...others] };
}

// --------------------------------------------------------------------------------- level 1

function one(rng, i) {
  const S = setting(rng, 2);
  const things = S.kinds(4).map((k) => obj(k, col(rng)));
  const t = things[0];
  const P = S.spot();
  const say = [`Put the ${t.kind} ${at(P)}.`, `The ${t.kind} goes ${at(P)}.`, `Find the ${t.kind} and put it ${at(P)}.`][i % 3];
  return draft(S, say, things, [mv(t, P)], ['put'], ['put-one', 'goes-one', 'find-one'][i % 3]);
}

// --------------------------------------------------------------------------------- level 2

function two(rng, i) {
  const k = i % 6;
  if (k === 0 || k === 1) {
    const S = setting(rng, 2);
    const { a, b, things } = pair(rng, S);
    const X = S.spot();
    if (k === 1) return draft(S, `Put ${the(a, things)} and ${the(b, things)} ${at(X)}.`, things, [mv([a, b], X)], ['put', 'steps2', 'detail'], 'two-together');
    const Y = S.spot(1, [X]);
    return draft(S, `Put ${the(a, things)} ${at(X)} and ${the(b, things)} ${at(Y)}.`, things, [mv(a, X), mv(b, Y)], ['put', 'steps2', 'detail'], 'two-colour');
  }
  if (k === 2) {
    // on and under: the table's two places, with a container as the place that is not asked for
    const S = setting(rng, 1, true);
    const things = S.kinds(4).map((kind) => obj(kind, col(rng)));
    const [X, Y] = rng.shuffle(S.places.filter((p) => p.kind === 'table'));
    return draft(S, `Put ${the(things[0], things)} ${at(X)} and ${the(things[1], things)} ${at(Y)}.`, things, [mv(things[0], X), mv(things[1], Y)], ['put', 'steps2', 'spatial'], 'on-under');
  }
  if (k === 3) {
    // big and small: the same thing in the same colour, twice
    const S = anywhere(rng, 0);
    const [K, K2, K3] = S.kinds(3);
    const C = col(rng);
    const [a, b] = rng.shuffle([obj(K, C, 'big'), obj(K, C, 'small')]);
    const things = [a, b, obj(K2, col(rng), 'big'), obj(K3, col(rng), 'small')];
    const X = S.spot();
    const Y = S.spot(1, [X]);
    return draft(S, `Put ${the(a, things)} ${at(X)} and ${the(b, things)} ${at(Y)}.`, things, [mv(a, X), mv(b, Y)], ['put', 'steps2', 'detail'], 'two-size');
  }
  if (k === 4) {
    const S = setting(rng, 1, true);
    const { a, b, things } = pair(rng, S);
    const X = S.spot();
    const Y = S.spot(1, [X]);
    return draft(S, `${cap(the(a, things))} goes ${at(X)}. ${cap(the(b, things))} goes ${at(Y)}.`, things, [mv(a, X), mv(b, Y)], ['put', 'steps2', 'detail', 'spatial'], 'goes-two');
  }
  // the same kind of thing in three colours: two of them go to different places
  const S = setting(rng, 1, true);
  const [K, K2, K3] = S.kinds(3);
  const [C1, C2, C3] = pickColors(rng, 3);
  const a = obj(K, C1);
  const b = obj(K, C2);
  const things = [a, b, obj(K, C3), obj(K2, col(rng)), obj(K3, col(rng))];
  const X = S.spot();
  const Y = S.spot(1, [X]);
  return draft(S, `Put ${the(a, things)} ${at(X)} and ${the(b, things)} ${at(Y)}.`, things, [mv(a, X), mv(b, Y)], ['put', 'steps2', 'detail', 'spatial'], 'two-apart');
}

// --------------------------------------------------------------------------------- level 3

function counting(rng, i) {
  const k = i % 6;
  if (k === 0) {
    // "Put three coins in the chest." - there are more coins than that, and other things too
    const S = anywhere(rng, 0);
    const [K, J] = S.kinds(2);
    const N = rng.range(2, 4);
    const pile = copies(N + rng.range(1, 2), K, col(rng));
    const things = [...pile, ...copies(3, J, col(rng))];
    const X = S.spot(N);
    return draft(S, `Put ${many(N, K)} ${at(X)}.`, things, [mv(pile, X, N)], ['put', 'quantity'], 'count-one');
  }
  if (k === 1) {
    // "Put two gems in the bag and one in the chest."
    const S = anywhere(rng, 0);
    const [K, J] = S.kinds(2);
    const [N, M] = rng.pick([[2, 1], [1, 2], [3, 1], [1, 3], [2, 2]]);
    const pile = copies(N + M + 1, K, col(rng));
    const things = [...pile, ...copies(2, J, col(rng))];
    const X = S.spot(N);
    const Y = S.spot(M, [X]);
    return draft(S, `Put ${many(N, K)} ${at(X)} and ${NUM[M]} ${at(Y)}.`, things, [mv(pile, X, N), mv(pile, Y, M)], ['put', 'quantity', 'steps2'], 'count-split');
  }
  if (k === 2) {
    // "Put two coins in the pot and three stars in the cart."
    const S = anywhere(rng, 0);
    const [K, J] = S.kinds(2);
    const N = rng.range(1, 3);
    const M = rng.range(N === 1 ? 2 : 1, 3);
    const p1 = copies(N + rng.range(1, 2), K, col(rng));
    const p2 = copies(M + 1, J, col(rng));
    const X = S.spot(N);
    const Y = S.spot(M, [X]);
    return draft(S, `Put ${many(N, K)} ${at(X)} and ${many(M, J)} ${at(Y)}.`, [...p1, ...p2], [mv(p1, X, N), mv(p2, Y, M)], ['put', 'quantity', 'steps2'], 'count-two-kinds');
  }
  if (k === 3) {
    // "Put two red gems in the bag." - gems in two colours, and other red things
    const S = setting(rng, 2);
    const [K, J] = S.kinds(2);
    const [C, C2] = pickColors(rng, 2);
    const N = rng.range(2, 3);
    const pile = copies(N + 1, K, C);
    const things = [...pile, ...copies(3, K, C2), ...copies(2, J, C)];
    const X = S.spot(N);
    return draft(S, `Put ${many(N, K, C)} ${at(X)}.`, things, [mv(pile, X, N)], ['put', 'quantity', 'detail'], 'count-colour');
  }
  if (k === 4) {
    // "Put two coins and the map on the table."
    const S = setting(rng, 1, true);
    const [K, J, L] = S.kinds(3);
    const pile = copies(4, K, col(rng));
    const j = obj(J, col(rng));
    const things = [...pile, j, obj(L, col(rng))];
    const X = S.spot(3);
    return draft(S, `Put ${many(2, K)} and ${the(j, things)} ${at(X)}.`, things, [mv(pile, X, 2), mv(j, X)], ['put', 'quantity', 'steps2', 'spatial'], 'count-and-one');
  }
  // "Put three coins and two stars in the cart."
  const S = setting(rng, 2);
  const [K, J] = S.kinds(2);
  const [N, M] = rng.pick([[2, 1], [1, 2], [3, 2], [2, 3], [3, 1], [1, 3], [2, 2]]);
  const p1 = copies(N + 1, K, col(rng));
  const p2 = copies(M + 1, J, col(rng));
  const X = S.spot(N + M);
  return draft(S, `Put ${many(N, K)} and ${many(M, J)} ${at(X)}.`, [...p1, ...p2], [mv(p1, X, N), mv(p2, X, M)], ['put', 'quantity', 'steps2'], 'count-together');
}

// --------------------------------------------------------------------------------- level 4

function sorting(rng, i) {
  const k = i % 7;
  const S = setting(rng, 2);
  if (k === 0) {
    // "Put everything red in the basket." - red things of several kinds, the same kinds in other colours
    const [K1, K2, K3, K4, K5] = S.kinds(5);
    const [C, C2, C3] = pickColors(rng, 3);
    const mine = [obj(K1, C), obj(K2, C), obj(K3, C), ...(rng.chance(0.5) ? [obj(K4, C)] : [])];
    const things = [...mine, obj(K1, C2), obj(K2, C3), obj(K5, C2), obj(K4, C3)];
    const X = S.spot(mine.length);
    return draft(S, `Put everything ${C} ${at(X)}.`, things, [mv(mine, X)], ['put', 'sort', 'all'], 'all-colour');
  }
  if (k === 1) {
    // "Put all the keys in the chest except the green one." - something else is green too
    const [K, J, L] = S.kinds(3);
    const [C, ...others] = pickColors(rng, 4);
    const mine = others.map((c) => obj(K, c));
    const things = [...mine, obj(K, C), obj(J, C), obj(L, rng.pick(others))];
    const X = S.spot(3);
    return draft(S, `Put all the ${plural(K)} ${at(X)} except the ${C} one.`, things, [mv(mine, X)], ['put', 'sort', 'all', 'except'], 'all-except-colour');
  }
  if (k === 2) {
    // "Put all the gems in the bag and all the keys in the chest."
    const [K, J, L, M] = S.kinds(4);
    const g1 = pickColors(rng, 3).map((c) => obj(K, c));
    const g2 = pickColors(rng, rng.range(2, 3)).map((c) => obj(J, c));
    const things = [...g1, ...g2, obj(L, col(rng)), obj(M, col(rng))];
    const X = S.spot(3);
    const Y = S.spot(3, [X]);
    return draft(S, `Put all the ${plural(K)} ${at(X)} and all the ${plural(J)} ${at(Y)}.`, things, [mv(g1, X), mv(g2, Y)], ['put', 'sort', 'all', 'steps2'], 'sort-kinds');
  }
  if (k === 3) {
    // "Put everything in the cart except the stars."
    const [K, ...kinds] = S.kinds(rng.range(5, 6));
    const mine = kinds.map((kind) => obj(kind, col(rng)));
    const things = [...mine, ...pickColors(rng, 2).map((c) => obj(K, c))];
    const X = S.spot(mine.length);
    return draft(S, `Put everything ${at(X)} except the ${plural(K)}.`, things, [mv(mine, X)], ['put', 'sort', 'all', 'except'], 'all-but-kind');
  }
  if (k === 4) {
    // "Put everything red in the pot and everything blue in the cart."
    const [K1, K2, K3, K4, K5] = S.kinds(5);
    const [C1, C2, C3, C4] = pickColors(rng, 4);
    const g1 = [obj(K1, C1), obj(K2, C1), obj(K3, C1)];
    const g2 = [obj(K1, C2), obj(K4, C2), ...(rng.chance(0.5) ? [obj(K5, C2)] : [])];
    const things = [...g1, ...g2, obj(K2, C3), obj(K4, C4)];
    const X = S.spot(3);
    const Y = S.spot(3, [X]);
    return draft(S, `Put everything ${C1} ${at(X)} and everything ${C2} ${at(Y)}.`, things, [mv(g1, X), mv(g2, Y)], ['put', 'sort', 'all', 'steps2'], 'sort-colours');
  }
  if (k === 5) {
    // "Put the big stars in the pot and the small stars in the cart." - colours do not matter here
    const [K, J, L] = S.kinds(3);
    const cs = pickColors(rng, 2);
    const big = Array.from({ length: rng.range(2, 3) }, () => obj(K, rng.pick(cs), 'big'));
    const small = Array.from({ length: 2 }, () => obj(K, rng.pick(cs), 'small'));
    const things = [...big, ...small, obj(J, col(rng), 'big'), obj(L, col(rng), 'small')];
    const [g1, g2] = rng.shuffle([big, small]);
    const X = S.spot(3);
    const Y = S.spot(3, [X]);
    const name = (g) => `the ${g === big ? 'big' : 'small'} ${plural(K)}`;
    return draft(S, `Put ${name(g1)} ${at(X)} and ${name(g2)} ${at(Y)}.`, things, [mv(g1, X), mv(g2, Y)], ['put', 'sort', 'detail', 'steps2'], 'sort-size');
  }
  // "Put all but one of the coins in the pot."
  const [K, J] = S.kinds(2);
  const pile = copies(rng.range(3, 5), K, col(rng));
  const things = [...pile, ...copies(3, J, col(rng))];
  const X = S.spot(pile.length - 1);
  return draft(S, `Put all but one of the ${plural(K)} ${at(X)}.`, things, [mv(pile, X, pile.length - 1)], ['put', 'quantity', 'all', 'except'], 'all-but-one');
}

// --------------------------------------------------------------------------------- level 5

function ordering(rng, i) {
  const k = i % 6;
  const S = anywhere(rng);
  const ordered = { ordered: true };
  if (k === 0) {
    // three moves, in the order they are said
    const { a, singles: [b, c], things } = oddments(rng, S, 2);
    const X = S.spot();
    const Y = S.spot(1, [X]);
    const Z = S.spot();
    const [x, y, z] = rng.shuffle([a, b, c]);
    return draft(S, `First put ${the(x, things)} ${at(X)}, then ${the(y, things)} ${at(Y)}, and last ${the(z, things)} ${at(Z)}.`, things,
      [mv(x, X), mv(y, Y), mv(z, Z)], ['put', 'order', 'steps3', 'detail'], 'first-then-last', ordered);
  }
  if (k === 1) {
    // "Before you put the red map and the blue key in the bag, put the star under the table."
    const { a, b, rest: [c], things } = pair(rng, S, 2);
    const X = S.spot();
    const Y = S.spot(2, [X]);
    return draft(S, `Before you put ${the(a, things)} and ${the(b, things)} ${at(Y)}, put ${the(c, things)} ${at(X)}.`, things, [mv(c, X), mv([a, b], Y)], ['put', 'before', 'flip', 'steps3', 'detail'], 'before-flip', ordered);
  }
  if (k === 2) {
    // "Put the star under the table after you put the red key and the map in the bag."
    const { a, singles: [b, c], things } = oddments(rng, S, 2);
    const [x, y, z] = rng.shuffle([a, b, c]);
    const X = S.spot(2);
    const Y = S.spot(1, [X]);
    return draft(S, `Put ${the(z, things)} ${at(Y)} after you put ${the(x, things)} and ${the(y, things)} ${at(X)}.`, things, [mv([x, y], X), mv(z, Y)], ['put', 'after', 'flip', 'steps3', 'detail'], 'after-flip-two', ordered);
  }
  if (k === 3) {
    // "Before you put the map in the bag, put two coins in the pot."
    const [K, J, L] = S.kinds(3);
    const N = rng.range(2, 3);
    const pile = copies(N + rng.range(1, 2), K, col(rng));
    const j = obj(J, col(rng));
    const things = [...pile, j, obj(L, col(rng)), obj(L, col(rng))];
    const X = S.spot(N);
    const Y = S.spot(1, [X]);
    return draft(S, `Before you put ${the(j, things)} ${at(Y)}, put ${many(N, K)} ${at(X)}.`, things, [mv(pile, X, N), mv(j, Y)], ['put', 'before', 'flip', 'quantity', 'steps2'], 'before-flip-count', ordered);
  }
  if (k === 4) {
    // "After you put all the keys in the chest, put the star in the bag."
    const [K, J, L] = S.kinds(3);
    const group = pickColors(rng, 3).map((c) => obj(K, c));
    const j = obj(J, col(rng));
    const things = [...group, j, ...pickColors(rng, 2).map((c) => obj(L, c))];
    const X = S.spot(3);
    const Y = S.spot(1, [X]);
    return draft(S, `After you put all the ${plural(K)} ${at(X)}, put ${the(j, things)} ${at(Y)}.`, things, [mv(group, X), mv(j, Y)], ['put', 'after', 'all', 'steps2'], 'after-all', ordered);
  }
  // "Do not put three coins in the pot until you have put the blue key in the chest."
  const [K, KA, L] = S.kinds(3);
  const [C, Cb] = pickColors(rng, 2);
  const N = rng.range(2, 3);
  const pile = copies(N + rng.range(1, 2), K, col(rng));
  const a = obj(KA, C);
  const things = [...pile, a, obj(KA, Cb), obj(L, col(rng))];
  const X = S.spot();
  const Y = S.spot(N, [X]);
  return draft(S, `Do not put ${many(N, K)} ${at(Y)} until you have put ${the(a, things)} ${at(X)}.`, things, [mv(a, X), mv(pile, Y, N)], ['put', 'before', 'flip', 'not', 'quantity', 'steps2', 'detail'], 'not-until', ordered);
}

// --------------------------------------------------------------------------------- level 6

function conditions(rng, i) {
  const k = i % 6;
  const round = Math.floor(i / 6);
  const S = anywhere(rng);
  if (k === 0) {
    // "If there is a sword on the shelf, put it in the chest. If not, put the shield in the bag."
    const [K0, J, ...more] = S.kinds(5);
    const there = round % 2 === 0;
    const j = obj(J, col(rng));
    const k0 = obj(K0, col(rng));
    const things = [...(there ? [k0] : []), j, ...more.map((kind) => obj(kind, col(rng)))];
    const X = S.spot();
    const Y = S.spot(1, [X]);
    return draft(S, `If there is ${an(K0)} ${K0} on the shelf, put it ${at(X)}. If not, put the ${J} ${at(Y)}.`, things, [there ? mv(k0, X) : mv(j, Y)], ['put', 'if'], 'if-else');
  }
  if (k === 1) {
    // "Put the red gem and the blue key in the bag and the map in the chest, but only if there is a bell on the shelf."
    const { a, b, rest: [c, k0], things: all } = pair(rng, S, 2);
    const go = round % 2 === 0;
    const things = go ? all : all.filter((o) => o !== k0);
    const X = S.spot(2);
    const Y = S.spot(1, [X]);
    return draft(S, `Put ${the(a, things)} and ${the(b, things)} ${at(X)} and ${the(c, things)} ${at(Y)}, but only if there is ${an(k0.kind)} ${k0.kind} on the shelf.`, things,
      go ? [mv([a, b], X), mv(c, Y)] : [], ['put', 'if', 'steps3', 'detail'], 'only-if', { g: go ? 'go' : 'nogo' });
  }
  if (k === 2) {
    // "Put all the coins in the pot, unless there is a crown on the shelf."
    const [K, K0, J] = S.kinds(3);
    const go = round % 2 === 1;
    const group = pickColors(rng, 4).map((c) => obj(K, c));
    const things = [...group, ...(go ? [] : [obj(K0, col(rng))]), obj(J, col(rng)), obj(J, col(rng))];
    const X = S.spot(4);
    return draft(S, `Put all the ${plural(K)} ${at(X)}, unless there is ${an(K0)} ${K0} on the shelf.`, things, go ? [mv(group, X)] : [], ['put', 'if', 'logic', 'all'], 'unless', { g: go ? 'go' : 'nogo' });
  }
  if (k === 3) {
    // "If there are more coins than stars, put three coins in the bag. If not, put three stars in the pot."
    const [K, J] = S.kinds(2);
    const [nk, nj] = rng.pick([[3, 4], [4, 3], [3, 5], [5, 3], [4, 5], [5, 4]]);
    const N = Math.min(nk, nj) - 1; // fewer than there are of either, so the number has to be listened to
    const pk = copies(nk, K, col(rng));
    const pj = copies(nj, J, col(rng));
    const X = S.spot(N);
    const Y = S.spot(N, [X]);
    return draft(S, `If there are more ${plural(K)} than ${plural(J)}, put ${many(N, K)} ${at(X)}. If not, put ${many(N, J)} ${at(Y)}.`, [...pk, ...pj],
      [nk > nj ? mv(pk, X, N) : mv(pj, Y, N)], ['put', 'if', 'compare', 'quantity'], 'if-more');
  }
  if (k === 4) {
    // "Put everything that is neither red nor blue in the cart."
    const [K1, K2, K3, K4] = S.kinds(4);
    const [C1, C2, C3, C4] = pickColors(rng, 4);
    const mine = [obj(K2, C3), obj(K4, C3), obj(K3, C4), obj(K1, C4)];
    const things = [obj(K1, C1), obj(K2, C1), obj(K1, C2), obj(K3, C2), ...mine];
    const X = S.spot(4);
    return draft(S, `Put everything that is neither ${C1} nor ${C2} ${at(X)}.`, things, [mv(mine, X)], ['put', 'logic', 'not', 'sort'], 'neither');
  }
  // "If there is a crown on the shelf, put all the gems in the chest. If not, put them in the bag."
  const [K, K0, J] = S.kinds(3);
  const there = rng.chance(0.5);
  const group = pickColors(rng, 4).map((c) => obj(K, c));
  const things = [...group, ...(there ? [obj(K0, col(rng))] : []), obj(J, col(rng)), obj(J, col(rng))];
  const X = S.spot(4);
  const Y = S.spot(4, [X]);
  return draft(S, `If there is ${an(K0)} ${K0} on the shelf, put all the ${plural(K)} ${at(X)}. If not, put them ${at(Y)}.`, things, [mv(group, there ? X : Y)], ['put', 'if', 'all'], 'if-where');
}

// --------------------------------------------------------------------------------- level 7

/** For the memory level: one thing with a colour look-alike (a), one single thing (b), four coins-or-whatever, one more thing. */
function luggage(rng, S, extra = 1) {
  const [KA, KB, K, ...more] = S.kinds(3 + extra);
  const [C, Cb] = pickColors(rng, 2);
  const a = obj(KA, C);
  const b = obj(KB, col(rng));
  const pile = copies(4, K, col(rng));
  const rest = more.map((kind) => obj(kind, col(rng)));
  return { a, b, pile, K, rest, things: [a, obj(KA, Cb), b, ...pile, ...rest] };
}

function memory(rng, i) {
  const k = i % 6;
  const hide = { hide: true };
  const inOrder = { hide: true, ordered: true };
  if (k === 0) {
    // "Pack the bag with the red key, the map and three coins."
    const S = setting(rng, 2);
    const { a, b, pile, K, things } = luggage(rng, S);
    const N = rng.range(2, 3);
    const X = S.spot(2 + N);
    return draft(S, `Pack the ${X.kind} with ${the(a, things)}, ${the(b, things)} and ${many(N, K)}.`, things, [mv([a, b], X), mv(pile, X, N)], ['put', 'hidden', 'steps3', 'quantity', 'detail'], 'pack-list', hide);
  }
  if (k === 1) {
    // "Put the red key and two coins in the bag, and the map under the table."
    const S = setting(rng, 1, true);
    const { a, b, pile, K, things } = luggage(rng, S);
    const X = S.spot(3);
    const Y = S.spot(1, [X]);
    return draft(S, `Put ${the(a, things)} and ${many(2, K)} ${at(X)}, and ${the(b, things)} ${at(Y)}.`, things, [mv(a, X), mv(pile, X, 2), mv(b, Y)], ['put', 'hidden', 'steps3', 'quantity', 'spatial', 'detail'], 'pack-two-places', hide);
  }
  if (k === 2) {
    // "First put two coins in the pot, then the red key in the bag, and last the map in the pot."
    const S = anywhere(rng);
    const { a, b, pile, K, things } = luggage(rng, S);
    const N = rng.range(2, 3);
    const X = S.spot(N + 1);
    const Y = S.spot(1, [X]);
    const Z = S.spot(N + 1);
    return draft(S, `First put ${many(N, K)} ${at(X)}, then ${the(a, things)} ${at(Y)}, and last ${the(b, things)} ${at(Z)}.`, things, [mv(pile, X, N), mv(a, Y), mv(b, Z)], ['put', 'hidden', 'order', 'steps3', 'quantity', 'detail'], 'order-three', inOrder);
  }
  if (k === 3) {
    // "Put all the keys in the chest except the green one. After that, put the star in the bag."
    const S = anywhere(rng);
    const [K, J, L] = S.kinds(3);
    const [C, ...others] = pickColors(rng, 4);
    const mine = others.map((c) => obj(K, c));
    const j = obj(J, col(rng));
    const things = [...mine, obj(K, C), j, obj(L, C), obj(L, rng.pick(others))];
    const X = S.spot(3);
    const Y = S.spot(1, [X]);
    return draft(S, `Put all the ${plural(K)} ${at(X)} except the ${C} one. After that, put ${the(j, things)} ${at(Y)}.`, things, [mv(mine, X), mv(j, Y)], ['put', 'hidden', 'all', 'except', 'after', 'steps2'], 'except-then', inOrder);
  }
  if (k === 4) {
    // "Before you put three coins in the pot, put the red key and the map in the bag."
    const S = anywhere(rng);
    const { a, b, pile, K, things } = luggage(rng, S);
    const N = rng.range(2, 3);
    const X = S.spot(2);
    const Y = S.spot(N, [X]);
    return draft(S, `Before you put ${many(N, K)} ${at(Y)}, put ${the(a, things)} and ${the(b, things)} ${at(X)}.`, things, [mv([a, b], X), mv(pile, Y, N)], ['put', 'hidden', 'before', 'flip', 'steps3', 'quantity', 'detail'], 'flip-count', inOrder);
  }
  // "Take the red key, the map and two coins. If there is a crown on the shelf, put them in the chest. If not, put them in the bag."
  const S = anywhere(rng);
  const { a, b, pile, K, rest: [k0], things: all } = luggage(rng, S);
  const there = rng.chance(0.5);
  const things = there ? all : all.filter((o) => o !== k0);
  const N = rng.range(2, 3);
  const X = S.spot(2 + N);
  const Y = S.spot(2 + N, [X]);
  const Z = there ? X : Y;
  return draft(S, `Take ${the(a, things)}, ${the(b, things)} and ${many(N, K)}. If there is ${an(k0.kind)} ${k0.kind} on the shelf, put them ${at(X)}. If not, put them ${at(Y)}.`, things,
    [mv([a, b], Z), mv(pile, Z, N)], ['put', 'hidden', 'if', 'steps3', 'quantity', 'detail'], 'if-list', hide);
}

// -------------------------------------------------------------------------------------------

export default {
  id: 'pack', name: 'Move and Pack', blurb: 'Pick things up and put them where I say.', color: '#18b99a', speed: 0.95,
  levels: [
    { id: 'pack1', title: 'Into the Chest', n: 18, gen: one,
      tip: 'Welcome to Move and Pack! Tap a thing to pick it up. Then tap the place where it goes. When you have finished, press the green check mark.' },
    { id: 'pack2', title: 'Two Trips', n: 18, gen: two,
      tip: 'Two things to move now. Listen for the color or the size, and for where: in, on, or under. Made a slip? Tap the thing to take it out again.' },
    { id: 'pack3', title: 'Count Them', n: 18, gen: counting,
      tip: 'Now listen for how many. If I say three coins, move three. Not two, and not four. Count what is inside before you press the green check mark.' },
    { id: 'pack4', title: 'Sort It Out', n: 18, gen: sorting,
      tip: 'Sorting time! All means every single one. Everything red means every red thing, whatever it is. And except means that one stays on the shelf.' },
    { id: 'pack5', title: 'First Things First', n: 18, gen: ordering, holdMs: 600,
      tip: 'Now the order matters. Listen for first, then, before, and after. Sometimes I say it backwards. So stop and think: which one do I move first? The little numbers show your order.' },
    { id: 'pack6', title: 'Only If', n: 18, gen: conditions, allowNone: true, holdMs: 600,
      tip: 'Now there is an if. Look at the shelf before you move anything. And if there is nothing you should move, tap the hand.' },
    { id: 'pack7', title: 'Pack from Memory', n: 18, gen: memory, holdMs: 700,
      tip: 'Memory time! Everything hides while I talk. Say the list back in your head. Then pack it all, and press the green check mark.' },
    { id: 'pack-boss', title: 'Pack Boss', boss: true, mix: ['pack5', 'pack6', 'pack7'], allowNone: true, holdMs: 700,
      tip: 'Pack Boss! Orders, ifs, and packing from memory, all mixed up. Stop and think before you move. Beat me to clear this world.' },
  ],
};
