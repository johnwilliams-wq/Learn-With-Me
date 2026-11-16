// World "route" - MAP ROUTES. He steers a little rover across a map the way the voice says.
//
// The ladder (one new difficulty per level):
//   1 one counted move            "Go up two squares."
//   2 two and three counted moves "Go right three, then up one."
//   3 a landmark                  "Go to the tree."            (any way there is right)
//   4 stops in order              "Go to the tree, then to the tower."
//   5 rules                       "Do not touch the bridge." / "Pick up only the key."
//   6 said backwards, and "if"    "Before you go to the tower, visit the pond." / "..., unless there is a rock next to it."
//   7 long routes from memory     the map is covered while the voice talks
//
// Squares are [column, row], [0, 0] at the top left. A draft's `goal` refers to the things on the
// map themselves; tools/content/types/route.mjs turns them into squares and checks there is a way.

import { COLORS, an } from '../lib.mjs';
import { LANDMARKS, LOOT, walk } from '../types/route.mjs';

const NUM = ['zero', 'one', 'two', 'three', 'four'];
const squares = (n) => `${NUM[n]} ${n === 1 ? 'square' : 'squares'}`;
const again = (why) => { throw new Error(`try again: ${why}`); };
const same = (a, b) => a[0] === b[0] && a[1] === b[1];
const dist = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);
const apart = (a, b) => Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1])); // 1 = touching, even at a corner
const among = (list, p) => list.some((q) => same(p, q));
const flat = (dir) => dir === 'left' || dir === 'right';

/** How a thing is named: "the tree", "the red flag", "the blue key" (a colour only when it is needed). */
const the = (o) => `the ${o.say ? `${o.color} ` : ''}${o.kind}`;

/** The squares on the two "round the corner" ways from a to b (without a and b). */
function between(a, b) {
  const out = [];
  const add = (p) => { if (!same(p, a) && !same(p, b) && !among(out, p)) out.push(p); };
  for (let c = Math.min(a[0], b[0]); c <= Math.max(a[0], b[0]); c++) { add([c, a[1]]); add([c, b[1]]); }
  for (let r = Math.min(a[1], b[1]); r <= Math.max(a[1], b[1]); r++) { add([a[0], r]); add([b[0], r]); }
  return out;
}
/** ...along every part of a drive: start -> stop -> stop. */
const onTheWay = (...stops) => stops.slice(1).flatMap((p, i) => between(stops[i], p));

/** An empty map to put things on. Every square is handed out once. */
function mapOf(rng, cols, rows) {
  const free = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) free.push([c, r]);
  const kinds = rng.shuffle(LANDMARKS);
  const m = { cols, rows, marks: [], loot: [] };
  /** a free square that passes the test (in random order) */
  m.spot = (ok = () => true) => {
    const hits = free.filter(ok);
    if (!hits.length) again('no room on the map');
    const p = rng.pick(hits);
    free.splice(free.indexOf(p), 1);
    return p;
  };
  m.start = m.spot();
  /** a landmark of a kind that is not on the map yet */
  m.mark = (ok, kind) => {
    if (kind) kinds.splice(kinds.indexOf(kind), 1);
    const o = { kind: kind || kinds.pop(), at: m.spot(ok) };
    m.marks.push(o);
    return o;
  };
  m.flag = (color, ok) => {
    const o = { kind: 'flag', color, say: true, at: m.spot(ok) };
    m.marks.push(o);
    return o;
  };
  /** something to pick up; `say` = its colour has to be said to tell it from its twin */
  m.thing = (kind, color, ok, say = false) => {
    const o = { kind, color, say, at: m.spot(ok) };
    m.loot.push(o);
    return o;
  };
  /** landmarks just to fill the map, so that the place words are needed */
  m.fill = (n, ok) => { while (m.marks.length < n) m.mark(ok); };
  m.draft = (say, goal, s, v, extra = {}) => ({
    t: 'route', say, cols, rows, start: m.start, marks: m.marks, loot: m.loot,
    goal: { via: [], need: [], avoid: [], ...goal }, s, v, ...extra,
  });
  return m;
}

const far = (from, n = 2) => (p) => dist(p, from) >= n;

// Twins (two flags, two keys) are told apart by colour alone, so their colours must be easy to tell apart at a glance.
const TOO_CLOSE = [['yellow', 'orange'], ['red', 'orange']];
function twoColours(rng) {
  for (;;) {
    const [a, b] = rng.shuffle(COLORS);
    if (!TOO_CLOSE.some((pair) => pair.includes(a) && pair.includes(b))) return [a, b];
  }
}

// ---------------------------------------------------------------------------------- counted routes

/**
 * A counted route: `legs` moves that turn a corner every time. The rover never reaches the edge of
 * the map at the end of a move (so the number is needed, not the wall), never crosses its own trail,
 * and the scenery keeps out of its way.
 */
function counted(rng, cols, rows, legs, { most = 3, total = 99, least = legs > 1 ? legs + 1 : 1, scenery = 3 } = {}) {
  for (let tries = 0; tries < 400; tries++) {
    const moves = [];
    let across = rng.chance(0.5);
    for (let k = 0; k < legs; k++, across = !across) {
      moves.push([rng.pick(across ? ['left', 'right'] : ['up', 'down']), rng.range(1, Math.min(most, (across ? cols : rows) - 2))]);
    }
    const sum = moves.reduce((n, m) => n + m[1], 0);
    if (sum > total || sum < least) continue; // (a route of nothing but single squares is too easy)
    const scene = { cols, rows, start: [rng.int(cols), rng.int(rows)] };
    let path;
    let room = true;
    try {
      path = walk(scene, moves);
      // one more square must fit after every move
      for (let k = 1; k <= legs; k++) walk(scene, [...moves.slice(0, k - 1), [moves[k - 1][0], moves[k - 1][1] + 1]]);
    } catch { room = false; }
    if (!room) continue;
    const seen = [scene.start, ...path];
    if (new Set(seen.map(String)).size !== seen.length) continue;
    // keep the scenery off the trail and off the squares just past each turn
    const keepClear = [...seen];
    for (let k = 1; k <= legs; k++) keepClear.push(walk(scene, [...moves.slice(0, k - 1), [moves[k - 1][0], moves[k - 1][1] + 1]]).at(-1));
    const free = [];
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) if (!among(keepClear, [c, r])) free.push([c, r]);
    if (free.length < scenery) continue;
    const kinds = rng.shuffle(LANDMARKS);
    const marks = rng.sample(free, scenery).map((at, i) => ({ kind: kinds[i], at }));
    return { moves, base: { t: 'route', cols, rows, start: scene.start, marks, moves } };
  }
  return again('no counted route fits');
}

const short = ([dir, n]) => `${dir} ${NUM[n]}`; // "up two"
const long = ([dir, n]) => `${dir} ${squares(n)}`; // "up two squares"

// ---------------------------------------------------------------------------------- the levels

const level1 = {
  id: 'route1', title: 'First Drive', n: 18,
  tip: 'Steer the rover with the four big arrows. Up, down, left and right mean the directions on the screen. One tap moves one square. Then press the green check mark.',
  gen(rng, i) {
    const { moves: [m], base } = counted(rng, 5, 4, 1, { scenery: 2 });
    const say = [
      `Go ${long(m)}.`,
      flat(m[0]) ? `Drive ${squares(m[1])} to the ${m[0]}.` : `Drive ${squares(m[1])} ${m[0]}.`,
      `Move the rover ${long(m)}.`,
    ][i % 3];
    return { ...base, say, s: ['route', 'count'], v: ['leg', 'leg-drive', 'leg-move'][i % 3] };
  },
};

const level2 = {
  id: 'route2', title: 'Turn the Corner', n: 18,
  tip: 'Now the route has a turn in it. Drive the first part, then turn and drive the next part. Made a slip? The arrow at the bottom of the screen takes one move back.',
  gen(rng, i) {
    if (i % 3 === 2) {
      const { moves: [a, b, c], base } = counted(rng, 6, 4, 3);
      return { ...base, say: `Go ${short(a)}, ${short(b)}, then ${short(c)}.`, s: ['route', 'count', 'turn', 'steps3'], v: 'legs3' };
    }
    const { moves: [a, b], base } = counted(rng, 6, 4, 2);
    const say = i % 3 === 0 ? `Go ${short(a)}, then ${short(b)}.` : `First go ${long(a)}. Then go ${long(b)}.`;
    return { ...base, say, s: ['route', 'count', 'turn', 'steps2'], v: i % 3 === 0 ? 'legs2' : 'legs2-first' };
  },
};

const level3 = {
  id: 'route3', title: 'Landmarks', n: 18,
  tip: 'Now I name a place on the map. Drive the rover there any way you like, and stop on its square. Then press the green check mark.',
  gen(rng, i) {
    const m = mapOf(rng, 5, 4);
    if (i % 3 === 2) {
      // flags: the colour word is needed
      const [c1, c2] = twoColours(rng);
      const end = m.flag(c1, far(m.start));
      m.flag(c2);
      m.fill(5);
      return m.draft(`Go to ${the(end)}.`, { end }, ['route', 'landmark'], 'to-flag');
    }
    const end = m.mark(far(m.start));
    m.fill(5);
    return m.draft(i % 3 === 0 ? `Go to ${the(end)}.` : `Drive the rover to ${the(end)}.`, { end }, ['route', 'landmark'], i % 3 === 0 ? 'to' : 'to-drive');
  },
};

/** n stops, each at least two squares from the one before. Every third map also has flags to stop at. */
function stops(rng, m, n, flags = false) {
  const out = [];
  const colours = twoColours(rng);
  const flagAt = flags ? rng.int(n) : -1;
  let from = m.start;
  for (let k = 0; k < n; k++) {
    const ok = (p) => dist(p, from) >= 2 && !out.some((o) => dist(o.at, p) < 2);
    out.push(k === flagAt ? m.flag(colours[0], ok) : m.mark(ok));
    from = out[k].at;
  }
  if (flags) m.flag(colours[1]);
  return out;
}

const level4 = {
  id: 'route4', title: 'Road Trip', n: 18,
  tip: 'Now there are stops on the way. Drive to each place in the order I say, and finish on the last one. You can see a number on every place you have been.',
  gen(rng, i) {
    const m = mapOf(rng, 6, 4);
    if (i % 3 === 2) {
      const [a, b, c] = stops(rng, m, 3);
      m.fill(6);
      return m.draft(`Go to ${the(a)}, then to ${the(b)}, then to ${the(c)}.`, { via: [a, b], end: c }, ['route', 'landmark', 'steps3'], 'chain3');
    }
    const [a, b] = stops(rng, m, 2, i % 3 === 1);
    m.fill(5);
    const say = i % 3 === 0 ? `Go to ${the(a)}, then to ${the(b)}.` : `First drive to ${the(a)}. Then drive to ${the(b)}.`;
    return m.draft(say, { via: [a], end: b }, ['route', 'landmark', 'steps2'], i % 3 === 0 ? 'chain2' : 'chain2-first');
  },
};

const level5 = {
  id: 'route5', title: 'Rules of the Road', n: 18,
  tip: 'Now there are rules. Do not touch means: never drive onto that square. To pick a thing up, drive over it. Listen for the words not and only.',
  gen(rng, i) {
    const m = mapOf(rng, 6, 5);
    const s = m.start;
    switch (i % 6) {
      case 0: { // the thing to keep off is right in the way
        const straight = rng.chance(0.6);
        const end = m.mark((p) => dist(p, s) >= (straight ? 2 : 3) && (!straight || p[0] === s[0] || p[1] === s[1]));
        const no = m.mark((p) => among(between(s, end.at), p));
        m.fill(5);
        return m.draft(`Go to ${the(end)}. Do not touch ${the(no)}.`, { end, avoid: [no] }, ['route', 'landmark', 'not'], 'avoid');
      }
      case 1: { // one thing to fetch, and things to leave alone
        const [kind, ...others] = rng.shuffle(LOOT);
        const flags = twoColours(rng);
        const end = rng.chance(0.5) ? m.flag(flags[0], far(s, 3)) : m.mark(far(s, 3));
        if (end.kind === 'flag') m.flag(flags[1]);
        const get = m.thing(kind, rng.pick(COLORS), (p) => dist(p, s) >= 2 && dist(p, end.at) >= 2);
        const leave = [m.thing(others[0], rng.pick(COLORS), (p) => among(onTheWay(s, get.at, end.at), p)), m.thing(others[1], rng.pick(COLORS))];
        m.fill(4);
        return m.draft(`Go to ${the(end)}. On the way, pick up only ${the(get)}.`, { end, need: [get], avoid: leave }, ['route', 'landmark', 'steps2'], 'pickup-only');
      }
      case 2: { // two stops and a thing to keep off
        const [a, b] = stops(rng, m, 2);
        const no = m.mark((p) => among(onTheWay(s, a.at, b.at), p));
        m.fill(5);
        return m.draft(`Go to ${the(a)}, then to ${the(b)}, but do not touch ${the(no)}.`, { via: [a], end: b, avoid: [no] }, ['route', 'landmark', 'not', 'steps2'], 'chain-avoid');
      }
      case 3: { // twins: the colour word decides
        const kind = rng.pick(LOOT);
        const [yes, no] = twoColours(rng);
        const end = m.mark(far(s, 3));
        const get = m.thing(kind, yes, (p) => dist(p, s) >= 2 && dist(p, end.at) >= 2, true);
        const leave = m.thing(kind, no, (p) => among(onTheWay(s, get.at, end.at), p), true);
        m.fill(4);
        return m.draft(`Go to ${the(end)}. Pick up ${the(get)} on the way, but not the ${leave.color} one.`, { end, need: [get], avoid: [leave] }, ['route', 'landmark', 'not', 'steps2'], 'pickup-not');
      }
      case 4: { // two stops, and something to keep off on each part of the drive
        const [a, b] = stops(rng, m, 2);
        const no1 = m.mark((p) => among(between(s, a.at), p));
        const no2 = m.mark((p) => among(between(a.at, b.at), p));
        m.fill(5);
        return m.draft(`Go to ${the(a)}, then to ${the(b)}. Touch neither ${the(no1)} nor ${the(no2)}.`, { via: [a], end: b, avoid: [no1, no2] }, ['route', 'landmark', 'not', 'steps2'], 'neither');
      }
      default: { // two things to fetch, one to leave
        const [k1, k2, k3] = rng.shuffle(LOOT);
        const end = m.mark(far(s, 3));
        const g1 = m.thing(k1, rng.pick(COLORS), (p) => dist(p, s) >= 2 && dist(p, end.at) >= 2);
        const g2 = m.thing(k2, rng.pick(COLORS), (p) => dist(p, g1.at) >= 2 && dist(p, end.at) >= 2);
        const leave = m.thing(k3, rng.pick(COLORS), (p) => among([...onTheWay(s, g1.at, g2.at, end.at), ...onTheWay(s, g2.at, g1.at, end.at)], p));
        m.fill(4);
        return m.draft(`Go to ${the(end)}. On the way, pick up ${the(g1)} and ${the(g2)}, but nothing else.`, { end, need: [g1, g2], avoid: [leave] }, ['route', 'landmark', 'not', 'steps3'], 'pickup-two');
      }
    }
  },
};

const level6 = {
  id: 'route6', title: 'Tricky Orders', n: 18,
  tip: 'Tricky orders! Sometimes I say the last stop first. Sometimes the map decides where you go. Think before you drive: what comes first?',
  gen(rng, i) {
    const m = mapOf(rng, 6, 5);
    const s = m.start;
    switch (i % 7) {
      case 0: {
        const [a, b] = stops(rng, m, 2);
        m.fill(5);
        return m.draft(`Before you go to ${the(b)}, visit ${the(a)}.`, { via: [a], end: b }, ['route', 'landmark', 'before', 'flip', 'steps2'], 'before-flip');
      }
      case 1: { // the map decides: is that thing next to it, or not?
        const yes = rng.chance(0.5);
        const home = m.mark((p) => dist(p, s) >= 2 && p[0] > 0 && p[1] > 0 && p[0] < m.cols - 1 && p[1] < m.rows - 1);
        const other = m.mark((p) => dist(p, s) >= 2 && apart(p, home.at) >= 3);
        // the thing that is asked about is either right beside the first place, or well away from it (never just at a corner)
        const beside = (p) => dist(p, home.at) === 1;
        const clear = (p) => apart(p, home.at) >= 2;
        const what = m.mark(yes ? beside : (p) => clear(p) && dist(p, other.at) === 1);
        m.mark(yes ? (p) => clear(p) && dist(p, other.at) === 1 : beside); // a look-alike case: something else is beside the other place
        m.fill(6, clear);
        return m.draft(`Go to ${the(home)}, unless there is ${an(what.kind)} ${what.kind} next to it. If there is, go to ${the(other)}.`,
          { end: yes ? other : home }, ['route', 'landmark', 'if'], 'unless');
      }
      case 2: {
        const [a, b, c] = stops(rng, m, 3);
        m.fill(5);
        return m.draft(`Go to ${the(c)}, but only after you visit ${the(a)} and ${the(b)}.`, { need: [a, b], end: c }, ['route', 'landmark', 'after', 'flip', 'steps3'], 'after-both');
      }
      case 3: { // pick it up only if it is the colour I say
        const yes = rng.chance(0.5);
        const [kind, kind2] = rng.shuffle(LOOT);
        const [asked, not] = twoColours(rng);
        const end = m.mark(far(s, 3));
        const it = m.thing(kind, yes ? asked : not, (p) => dist(p, s) >= 2 && dist(p, end.at) >= 2 && (yes || among(onTheWay(s, end.at), p)));
        m.thing(kind2, yes ? not : asked); // the other thing has the other colour, so both words are needed
        m.fill(4);
        return m.draft(`Go to ${the(end)}. Pick up ${the(it)} on the way, but only if it is ${asked}.`,
          yes ? { end, need: [it] } : { end, avoid: [it] }, ['route', 'landmark', 'if', 'steps2'], 'pickup-if');
      }
      case 4: {
        const [a, b, c] = stops(rng, m, 3);
        m.fill(5);
        return m.draft(`Before you go to ${the(c)}, visit ${the(b)}. But before ${the(b)}, go to ${the(a)}.`, { via: [a, b], end: c }, ['route', 'landmark', 'before', 'flip', 'steps3'], 'before-before');
      }
      case 5: {
        const [a, b] = stops(rng, m, 2);
        const no = m.mark((p) => among(onTheWay(s, a.at, b.at), p));
        m.fill(5);
        return m.draft(`Go to ${the(b)} after you visit ${the(a)}, and do not touch ${the(no)}.`, { via: [a], end: b, avoid: [no] }, ['route', 'landmark', 'after', 'flip', 'not', 'steps2'], 'flip-avoid');
      }
      default: { // every place but one, in any order - and the last stop is said at the very end
        const end = m.mark(far(s, 2));
        m.fill(4);
        const rest = m.marks.filter((o) => o !== end);
        const no = m.mark((p) => among(onTheWay(s, ...rest.map((o) => o.at), end.at), p));
        return m.draft(`Visit every place except ${the(no)}, and finish at ${the(end)}.`, { need: rest, end, avoid: [no] }, ['route', 'landmark', 'except', 'steps4'], 'all-except');
      }
    }
  },
};

const level7 = {
  id: 'route7', title: 'Memory Route', n: 18, speed: 0.88,
  tip: 'Long routes from memory! The map hides while I talk. Say the route in your head, then drive it. The round arrow lets you hear it one more time.',
  gen(rng, i) {
    if (i % 3 === 2) {
      const m = mapOf(rng, 6, 5);
      const [a, b, c, d] = stops(rng, m, 4);
      m.fill(6);
      return m.draft(`Go to ${the(a)}, then ${the(b)}, then ${the(c)}, then ${the(d)}.`, { via: [a, b, c], end: d }, ['route', 'landmark', 'hidden', 'steps4'], 'mem-chain', { hide: true });
    }
    const legs = i % 3 === 0 ? 4 : 5;
    const { moves, base } = counted(rng, 6, 5, legs, { total: legs === 4 ? 9 : 10, least: legs + 2 });
    const say = `Go ${moves.slice(0, -1).map(short).join(', ')}, then ${short(moves.at(-1))}.`;
    return { ...base, say, hide: true, s: ['route', 'count', 'turn', 'hidden', legs === 4 ? 'steps4' : 'steps5'], v: legs === 4 ? 'legs4' : 'legs5' };
  },
};

export default {
  id: 'route', name: 'Map Routes', blurb: 'Steer the rover the way the voice says.', color: '#4caf6a', speed: 0.92,
  levels: [
    level1, level2, level3, level4, level5, level6, level7,
    { id: 'route-boss', title: 'Route Boss', boss: true, mix: ['route5', 'route6', 'route7'],
      tip: 'Route Boss! Rules, tricky orders and long routes from memory. Take your time, and think before you drive.' },
  ],
};
