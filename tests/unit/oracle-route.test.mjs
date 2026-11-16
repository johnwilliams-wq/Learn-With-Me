// An INDEPENDENT check of every "route" item (see tests/unit/content.test.mjs for the idea).
//
// The generators (tools/content/worlds/route.mjs) decide what the right answer is while they
// build each map. This file works the answer out a second time, from scratch, by reading only
// the spoken sentence and the finished map - and insists the two agree. It shares no code with
// the generators or with the game. A sentence pattern (`v`) without a rule here fails.
//
//   LWM_ITEMS_DIR=tests/e2e/out/route node --test tests/unit/oracle-route.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';
import { itemsOfType } from './oracles/load.mjs';

const items = itemsOfType('route');

// ---- reading the sentence ------------------------------------------------------------------
const STEP = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const COUNT = { one: 1, two: 2, three: 3, four: 4 };
const D = '(up|down|left|right)';
const N = '(one|two|three|four)';
const COLOUR = 'red|blue|green|yellow|purple|orange';
const PLACE = 'tree|cave|tower|pond|rock|house|bridge|tent';
const PICKUP = 'key|coin|star|gem';
const T = `(the (?:(?:${COLOUR}) )?(?:${PLACE}|flag|${PICKUP}))`; // "the tree", "the red flag", "the blue key"

const rx = (it, re) => {
  const m = re.exec(it.say);
  assert.ok(m, `"${it.say}" does not look like pattern ${it.v}`);
  return m.slice(1);
};
const str = (p) => `${p[0]},${p[1]}`;
const all = (it) => [...it.scene.marks, ...(it.scene.loot || [])];
const dist = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);
const onMap = (it, p) => p[0] >= 0 && p[1] >= 0 && p[0] < it.scene.cols && p[1] < it.scene.rows;

/** The square of the one thing a phrase names. A colour word is only allowed when it is needed. */
function where(it, phrase, group = all(it)) {
  const m = new RegExp(`^the (?:(${COLOUR}) )?(\\w+)$`).exec(phrase);
  assert.ok(m, `cannot read "${phrase}" in "${it.say}"`);
  const [, colour, kind] = m;
  const kindred = group.filter((o) => o.kind === kind);
  const hits = kindred.filter((o) => !colour || o.color === colour);
  assert.equal(hits.length, 1, `"${it.say}": "${phrase}" should mean exactly one thing on the map, it means ${hits.length}`);
  if (colour) assert.ok(kindred.length > 1, `"${it.say}": the word ${colour} is not needed`);
  return hits[0].at;
}
const place = (it, phrase) => where(it, phrase, it.scene.marks); // somewhere to drive to
const pickup = (it, phrase) => where(it, phrase, it.scene.loot || []); // something to pick up

/** Counted moves -> the squares the rover drives onto. */
function drive(it, ...pairs) {
  const path = [];
  let at = it.scene.start;
  for (let i = 0; i < pairs.length; i += 2) {
    assert.ok(i === 0 || (pairs[i] in { up: 1, down: 1 }) !== (pairs[i - 2] in { up: 1, down: 1 }), `"${it.say}": every new part must turn a corner`);
    for (let k = 0; k < COUNT[pairs[i + 1]]; k++) {
      at = [at[0] + STEP[pairs[i]][0], at[1] + STEP[pairs[i]][1]];
      assert.ok(onMap(it, at), `"${it.say}" drives off the map`);
      path.push(at);
    }
  }
  return { path };
}
/** "one square" but "two squares" */
function grammar(it) {
  for (const [, n, s] of it.say.matchAll(/\b(one|two|three|four) square(s?)\b/g)) assert.equal(s === 's', n !== 'one', `"${it.say}": square or squares?`);
}
const stops = (it, ...phrases) => {
  const at = phrases.map((p) => place(it, p));
  return { end: at.at(-1), via: at.slice(0, -1), need: [], avoid: [] };
};

const legs = (n) => new RegExp(`^Go ${Array.from({ length: n }, (_, i) => `${i === n - 1 ? 'then ' : ''}${D} ${N}`).join(', ')}\\.$`);

// ---- one rule per sentence pattern -----------------------------------------------------------
const RULES = {
  // counted moves: exactly this path
  leg: (it) => drive(it, ...rx(it, new RegExp(`^Go ${D} ${N} squares?\\.$`))),
  'leg-drive': (it) => {
    const [n, across, upDown] = rx(it, new RegExp(`^Drive ${N} squares? (?:to the (left|right)|(up|down))\\.$`));
    return drive(it, across || upDown, n);
  },
  'leg-move': (it) => drive(it, ...rx(it, new RegExp(`^Move the rover ${D} ${N} squares?\\.$`))),
  legs2: (it) => drive(it, ...rx(it, legs(2))),
  'legs2-first': (it) => drive(it, ...rx(it, new RegExp(`^First go ${D} ${N} squares?\\. Then go ${D} ${N} squares?\\.$`))),
  legs3: (it) => drive(it, ...rx(it, legs(3))),
  'legs3-hidden': (it) => drive(it, ...rx(it, legs(3))), // the same words as legs3, but the map is covered while he listens
  legs4: (it) => drive(it, ...rx(it, legs(4))),
  legs5: (it) => drive(it, ...rx(it, legs(5))),

  // places: where to finish, what to come past first (in order), what to drive over, what to keep off
  to: (it) => stops(it, ...rx(it, new RegExp(`^Go to ${T}\\.$`))),
  'to-flag': (it) => {
    const [flag] = rx(it, new RegExp(`^Go to (the (?:${COLOUR}) flag)\\.$`));
    return stops(it, flag);
  },
  'to-flag-drive': (it) => {
    const [flag] = rx(it, new RegExp(`^Drive the rover to (the (?:${COLOUR}) flag)\\.$`));
    return stops(it, flag);
  },
  chain2: (it) => stops(it, ...rx(it, new RegExp(`^Go to ${T}, then to ${T}\\.$`))),
  'chain2-first': (it) => stops(it, ...rx(it, new RegExp(`^First drive to ${T}\\. Then drive to ${T}\\.$`))),
  chain3: (it) => stops(it, ...rx(it, new RegExp(`^Go to ${T}, then to ${T}, then to ${T}\\.$`))),
  'mem-chain': (it) => stops(it, ...rx(it, new RegExp(`^Go to ${T}, then ${T}, then ${T}, then ${T}\\.$`))),

  avoid: (it) => {
    const [end, no] = rx(it, new RegExp(`^Go to ${T}\\. Do not touch ${T}\\.$`));
    return { ...stops(it, end), avoid: [place(it, no)] };
  },
  'chain-avoid': (it) => {
    const [a, b, no] = rx(it, new RegExp(`^Go to ${T}, then to ${T}, but do not touch ${T}\\.$`));
    return { ...stops(it, a, b), avoid: [place(it, no)] };
  },
  // "do not touch A or B": keep off both
  'chain-avoid-two': (it) => {
    const [a, b, no1, no2] = rx(it, new RegExp(`^Go to ${T}, then to ${T}\\. Do not touch ${T} or ${T}\\.$`));
    return { ...stops(it, a, b), avoid: [place(it, no1), place(it, no2)] };
  },
  // Sentences that say "on the way" also return `onWay`: the squares of the things they say are on the way.
  // "only": everything else that could be picked up must be left where it is
  'pickup-only': (it) => {
    const [end, get] = rx(it, new RegExp(`^Go to ${T}\\. On the way, pick up only ${T}\\.$`));
    const need = [pickup(it, get)];
    const rest = it.scene.loot.map((o) => o.at).filter((p) => str(p) !== str(need[0]));
    assert.ok(rest.length >= 1, `"${it.say}": the word only needs something to leave behind`);
    return { ...stops(it, end), need, avoid: rest, onWay: need };
  },
  'pickup-not': (it) => {
    const [end, yes, kind, no] = rx(it, new RegExp(`^Go to ${T}\\. Pick up (the (?:${COLOUR}) (${PICKUP})) on the way, but not the (${COLOUR}) one\\.$`));
    const need = [pickup(it, yes)];
    return { ...stops(it, end), need, avoid: [pickup(it, `the ${no} ${kind}`)], onWay: need };
  },
  'pickup-two': (it) => {
    const [end, a, b] = rx(it, new RegExp(`^Go to ${T}\\. On the way, pick up ${T} and ${T}, but nothing else\\.$`));
    const need = [pickup(it, a), pickup(it, b)];
    const rest = it.scene.loot.map((o) => o.at).filter((p) => !need.map(str).includes(str(p)));
    assert.ok(rest.length >= 1, `"${it.say}": "nothing else" needs something to leave behind`);
    // he may fetch them in either order, but they are named in the order that is the shorter drive
    const round = (x, y) => dist(it.scene.start, x) + dist(x, y) + dist(y, place(it, end));
    assert.ok(round(need[0], need[1]) < round(need[1], need[0]), `"${it.say}": the thing he comes to first should be named first`);
    return { ...stops(it, end), need, avoid: rest, onWay: need };
  },

  // said backwards
  'before-flip': (it) => {
    const [last, first] = rx(it, new RegExp(`^Before you go to ${T}, visit ${T}\\.$`));
    return stops(it, first, last);
  },
  'before-before': (it) => {
    const [last, mid, mid2, first] = rx(it, new RegExp(`^Before you go to ${T}, visit ${T}\\. But before ${T}, go to ${T}\\.$`));
    assert.equal(mid, mid2, it.say);
    return stops(it, first, mid, last);
  },
  // "after you visit A and B": both, in either order, and then the last stop
  'after-both': (it) => {
    const [last, a, b] = rx(it, new RegExp(`^Go to ${T}, but only after you visit ${T} and ${T}\\.$`));
    return { ...stops(it, last), need: [place(it, a), place(it, b)] };
  },
  'flip-avoid': (it) => {
    const [last, first, no] = rx(it, new RegExp(`^Go to ${T} after you visit ${T}, and do not touch ${T}\\.$`));
    return { ...stops(it, first, last), avoid: [place(it, no)] };
  },

  // "every place except": all the landmarks but that one, in any order, and the one to finish at last
  'all-except': (it) => {
    const [no, end] = rx(it, new RegExp(`^Visit every place except ${T}, and finish at ${T}\\.$`));
    const out = { ...stops(it, end), avoid: [place(it, no)] };
    assert.ok(!it.scene.loot?.length && !it.scene.marks.some((m) => m.kind === 'flag'), `"${it.say}": only named places on this map`);
    out.need = it.scene.marks.map((m) => m.at).filter((p) => str(p) !== str(out.end) && str(p) !== str(out.avoid[0]));
    assert.ok(out.need.length >= 3, `"${it.say}": too few places to visit`);
    return out;
  },

  // the map decides
  unless: (it) => {
    const [home, kind, other] = rx(it, new RegExp(`^Go to ${T}, unless there is an? (${PLACE}) next to it\\. If there is, go to ${T}\\.$`));
    const h = place(it, home);
    const what = place(it, `the ${kind}`);
    const gap = Math.max(Math.abs(what[0] - h[0]), Math.abs(what[1] - h[1]));
    const beside = dist(what, h) === 1;
    // no doubt allowed: either it shares a side with the place, or it is not even touching a corner of it
    assert.ok(beside || gap >= 2, `"${it.say}": is the ${kind} next to it or not?`);
    assert.ok(it.scene.marks.some((o) => dist(o.at, h) === 1), `"${it.say}": something must always be next to the first place`);
    return stops(it, beside ? other : home);
  },
  'pickup-if': (it) => {
    const [end, thing, colour] = rx(it, new RegExp(`^Go to ${T}\\. Pick up (the (?:${PICKUP})) on the way, but only if it is (${COLOUR})\\.$`));
    const at = pickup(it, thing);
    const it2 = it.scene.loot.find((o) => str(o.at) === str(at));
    // the colour word and the thing word are both needed: something else has the colour that was asked for, or does not
    assert.ok(it.scene.loot.some((o) => o !== it2 && (o.color === colour) !== (it2.color === colour)), `"${it.say}": needs a second thing of the other colour`);
    return it2.color === colour ? { ...stops(it, end), need: [at], onWay: [at] } : { ...stops(it, end), avoid: [at], onWay: [at] };
  },
};

// (need and avoid are sets; `onWay` is not part of the answer - the fairness test below uses it)
const tidy = (e) => ('path' in e ? { path: e.path } : { end: e.end, via: e.via, need: e.need.map(str).sort(), avoid: e.avoid.map(str).sort() });

test('every route item: the answer worked out from the sentence matches the stored answer', (t) => {
  if (!items.length && !process.env.LWM_ITEMS_DIR) return t.skip('the route world is not in the game data yet');
  for (const it of items) {
    const rule = RULES[it.v];
    assert.ok(rule, `${it.id}: no independent rule for pattern "${it.v}" - add one to tests/unit/oracle-route.test.mjs`);
    grammar(it);
    assert.deepEqual(tidy(rule(it)), tidy(it.expect), `${it.id}: ${it.say}`);
  }
  assert.ok(items.length >= 100, `only ${items.length} route items`);
});

// ---- fairness: the map must make every word matter, and there must be a way to do it ---------

/** The squares on the two "round the corner" ways from a to b. */
function corners(a, b) {
  const out = new Set();
  for (let c = Math.min(a[0], b[0]); c <= Math.max(a[0], b[0]); c++) { out.add(str([c, a[1]])); out.add(str([c, b[1]])); }
  for (let r = Math.min(a[1], b[1]); r <= Math.max(a[1], b[1]); r++) { out.add(str([a[0], r])); out.add(str([b[0], r])); }
  return out;
}

/** Shortest drive that does what `e` asks (breadth first over square, stops done, things fetched); -1 if there is none. */
function shortest(it, e) {
  const full = (1 << e.need.length) - 1;
  const seen = new Set();
  let layer = [{ p: it.scene.start, v: 0, m: 0 }];
  for (let steps = 0; layer.length; steps++) {
    const next = [];
    for (const s of layer) {
      if (steps > 0 && str(s.p) === str(e.end) && s.v === e.via.length && s.m === full) return steps;
      for (const d of Object.values(STEP)) {
        const p = [s.p[0] + d[0], s.p[1] + d[1]];
        if (!onMap(it, p) || e.avoid.some((q) => str(q) === str(p))) continue;
        const n = { p, v: s.v, m: s.m };
        if (n.v < e.via.length && str(e.via[n.v]) === str(p)) n.v++;
        e.need.forEach((q, i) => { if (str(q) === str(p)) n.m |= 1 << i; });
        const k = `${str(p)}|${n.v}|${n.m}`;
        if (!seen.has(k)) { seen.add(k); next.push(n); }
      }
    }
    layer = next;
  }
  return -1;
}

test('every map is well formed: one thing per square, no doubles, sound-alikes kept apart', () => {
  for (const it of items) {
    const things = all(it);
    const squares = [it.scene.start, ...things.map((o) => o.at)];
    for (const p of squares) assert.ok(onMap(it, p), `${it.id}: something is off the map`);
    assert.equal(new Set(squares.map(str)).size, squares.length, `${it.id}: two things share a square (or sit on the start)`);
    assert.equal(new Set(things.map((o) => o.id)).size, things.length, `${it.id}: duplicate ids`);
    const names = things.map((o) => `${o.color || ''} ${o.kind}`);
    assert.equal(new Set(names).size, names.length, `${it.id}: two things look the same`);
    // twins are told apart by colour alone: never yellow beside orange, or red beside orange
    for (const a of things) for (const b of things) {
      if (a !== b && a.kind === b.kind) assert.ok(![a.color, b.color].includes('orange') || ![a.color, b.color].some((c) => c === 'yellow' || c === 'red'), `${it.id}: ${a.color} and ${b.color} ${a.kind}s are too alike`);
    }
    for (const m of it.scene.marks) assert.match(m.kind, new RegExp(`^(${PLACE}|flag)$`), it.id);
    for (const l of it.scene.loot || []) assert.match(l.kind, new RegExp(`^(${PICKUP})$`), it.id);
    // a place is told apart by its name alone; only flags and twin pick-ups differ by colour
    for (const kind of PLACE.split('|')) assert.ok(it.scene.marks.filter((m) => m.kind === kind).length <= 1, `${it.id}: two ${kind}s`);
    assert.ok(it.scene.cols >= 5 && it.scene.cols <= 6 && it.scene.rows >= 4 && it.scene.rows <= 5, `${it.id}: map size`);
    assert.ok(it.s.includes('route') && !it.auto, it.id);
    assert.ok(it.say.split(' ').length <= 35, `${it.id}: sentence too long`);
    assert.equal(!!it.hide, ['legs3-hidden', 'legs4', 'legs5', 'mem-chain'].includes(it.v), `${it.id}: only the memory routes are covered`);
    // "three" and "tree" sound alike
    if (/\bthree\b/.test(it.say)) assert.ok(!things.some((o) => o.kind === 'tree'), `${it.id}: "${it.say}" - the word three is spoken and there is a tree on the map`);
  }
});

test('counted routes: the number is needed, the trail is clear and never crosses itself', () => {
  for (const it of items.filter((x) => 'path' in x.expect)) {
    const { path } = it.expect;
    const trail = [it.scene.start, ...path];
    assert.equal(new Set(trail.map(str)).size, trail.length, `${it.id}: the route crosses itself`);
    for (const o of all(it)) assert.ok(!trail.some((p) => str(p) === str(o.at)), `${it.id}: the ${o.kind} is in the way`);
    // at the end of every straight part there is room for one more square - so it is the number that stops him, not the edge
    for (let i = 0; i < path.length; i++) {
      const from = i ? path[i - 1] : it.scene.start;
      const step = [path[i][0] - from[0], path[i][1] - from[1]];
      const turnsNext = i === path.length - 1 || path[i + 1][0] - path[i][0] !== step[0] || path[i + 1][1] - path[i][1] !== step[1];
      if (!turnsNext) continue;
      const beyond = [path[i][0] + step[0], path[i][1] + step[1]];
      assert.ok(onMap(it, beyond), `${it.id}: "${it.say}" stops at the edge of the map`);
      assert.ok(!all(it).some((o) => str(o.at) === str(beyond)), `${it.id}: a landmark marks where to stop`);
    }
    assert.ok(path.length <= 12, `${it.id}: too long`);
  }
});

test('places: enough look-alikes, a way to do it, and every "do not" really is in the way', () => {
  for (const it of items.filter((x) => 'end' in x.expect)) {
    const e = it.expect;
    assert.ok(it.scene.marks.length >= 4, `${it.id}: only ${it.scene.marks.length} places, so the place word is hardly needed`);
    const order = [it.scene.start, ...e.via, e.end]; // (when things may be visited in any order there is no "one before")
    if (!e.need.length) for (let i = 1; i < order.length; i++) assert.ok(dist(order[i - 1], order[i]) >= 2, `${it.id}: a stop is right next to the one before`);
    const best = shortest(it, e);
    assert.ok(best > 0 && best <= 16, `${it.id}: "${it.say}" cannot be done in 16 moves (${best})`);
    if (e.avoid.length) {
      // without the "do not" part some shorter or equally short drive would be allowed that now is not: the words matter
      const free = { ...e, avoid: [] };
      const tempting = new Set();
      const legsOf = [it.scene.start, ...e.via, e.end];
      for (let i = 1; i < legsOf.length; i++) for (const k of corners(legsOf[i - 1], legsOf[i])) tempting.add(k);
      for (const perm of [e.need, [...e.need].reverse()]) {
        const way = [it.scene.start, ...perm, ...e.via, e.end];
        for (let i = 1; i < way.length; i++) for (const k of corners(way[i - 1], way[i])) tempting.add(k);
      }
      assert.ok(e.avoid.some((p) => tempting.has(str(p))), `${it.id}: "${it.say}" - nothing that must be left alone is on a natural way there`);
      assert.ok(shortest(it, free) > 0, it.id);
    }
    if (it.v === 'chain-avoid-two') {
      // one of the two is in the way on the first part of the drive, the other on the second part
      const first = corners(it.scene.start, e.via[0]);
      const second = corners(e.via[0], e.end);
      assert.ok(e.avoid.some((p) => first.has(str(p))) && e.avoid.some((p) => second.has(str(p))), `${it.id}: one of the two is not in the way`);
    }
  }
});

/** p lies in the block of squares between a and b: some shortest drive from a to b comes past it. */
const inBlock = (a, b, p) => p[0] >= Math.min(a[0], b[0]) && p[0] <= Math.max(a[0], b[0]) && p[1] >= Math.min(a[1], b[1]) && p[1] <= Math.max(a[1], b[1]);

test('stops in order: no later stop lies on a short way to an earlier one (the numbers on the map would contradict the order)', () => {
  for (const it of items.filter((x) => 'end' in x.expect)) {
    const read = RULES[it.v](it);
    const order = [it.scene.start, ...read.via, read.end];
    for (let k = 1; k < order.length - 1; k++) for (let j = k + 1; j < order.length; j++) {
      assert.ok(!inBlock(order[k - 1], order[k], order[j]), `${it.id}: "${it.say}" - stop ${j} is on the way to stop ${k}`);
    }
    if (it.v === 'after-both') {
      // the two first stops may come in either order; the last one is on no short way to either
      const [a, b] = read.need;
      for (const [x, y] of [[it.scene.start, a], [it.scene.start, b], [a, b]]) assert.ok(!inBlock(x, y, read.end), `${it.id}: "${it.say}" - the last stop is on the way to an earlier one`);
    }
  }
});

test('"on the way" is true: the things it names are near the way, and each one has to be listened for', () => {
  for (const it of items.filter((x) => 'end' in x.expect)) {
    const read = RULES[it.v](it);
    assert.equal(/\bon the way\b/i.test(it.say), !!read.onWay, `${it.id}: "${it.say}" - a sentence that says "on the way" needs the on-the-way check`);
    if (!read.onWay) continue;
    const direct = dist(it.scene.start, read.end);
    // each thing on its own: going past it costs at most two extra moves
    for (const p of read.onWay) assert.ok(dist(it.scene.start, p) + dist(p, read.end) <= direct + 2, `${it.id}: "${it.say}" - a thing is not on the way (${dist(it.scene.start, p) + dist(p, read.end)} moves past it, ${direct} direct)`);
    // the whole right drive (keeping off what must be left alone): at most two extra moves per thing
    const best = shortest(it, read);
    assert.ok(best > 0 && best <= direct + 2 * read.onWay.length, `${it.id}: "${it.say}" - the right drive is ${best} moves, the direct one ${direct}`);
    // a drive that is no longer could miss each thing to fetch - so its name must be heard
    for (const p of read.need) {
      const lazy = shortest(it, { ...read, need: read.need.filter((q) => q !== p), avoid: [...read.avoid, p] });
      assert.ok(lazy > 0 && lazy <= best, `${it.id}: "${it.say}" - every short way there comes past a thing to fetch anyway`);
    }
  }
});

test('each level rotates several sentence patterns, and "if" items go both ways', () => {
  if (!items.length) return;
  const byLevel = new Map();
  for (const it of items) {
    const level = it.id.replace(/-\d+$/, '');
    byLevel.set(level, (byLevel.get(level) || new Set()).add(it.v));
  }
  for (const [level, patterns] of byLevel) assert.ok(patterns.size >= 3, `${level}: only ${patterns.size} sentence patterns`);
  const unless = items.filter((it) => it.v === 'unless').map((it) => str(it.expect.end) === str(place(it, /^Go to (the \w+),/.exec(it.say)[1])));
  if (unless.length >= 3) assert.ok(unless.includes(true) && unless.includes(false), '"unless" must sometimes apply and sometimes not');
  const iff = items.filter((it) => it.v === 'pickup-if').map((it) => it.expect.need.length > 0);
  if (iff.length >= 3) assert.ok(iff.includes(true) && iff.includes(false), '"only if" must sometimes apply and sometimes not');
  // the memory level starts with three counted moves; five is the top, not the rule
  const covered = items.filter((it) => it.hide && 'path' in it.expect);
  if (covered.length) {
    assert.ok(covered.some((it) => it.v === 'legs3-hidden'), 'the covered counted routes should start with three moves');
    assert.ok(covered.filter((it) => it.v === 'legs5').length * 3 <= covered.length, 'at most one covered counted route in three has five moves');
  }
});
