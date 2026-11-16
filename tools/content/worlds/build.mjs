// World "build" - ROBOT WORKSHOP. He builds a robot to a spoken description: one row of
// pictures per part the sentence talks about, one choice in every row (activity type "build").
//
// The ladder, one new difficulty per level:
//   1 two parts            2 three parts            3 "not" (work out which picture is left)
//   4 numbers, four parts  5 comparing (longest, bigger, more, fewer, the same number)
//     (also "twice as many", "one more than")
//   6 thinking twice, four parts, one of: an if rule, an unless rule, neither / nor,
//     "the second head", a change of plan ("Wait, no. Not wheels. Give it a jet.")
//   7 five parts with the pictures hidden
//
// The workshop only looks at the finished robot, never at the order he chose the parts in, so
// no sentence may claim an order ("before", "after", "then").
//
// Every generator builds its rows so that exactly ONE option in every row fits the sentence,
// and so that each word is needed: two colour rows always show the same colours, and number
// rows show each other's numbers, so "three eyes and two antennas" cannot be done by halves.
// tests/unit/oracle-build.test.mjs works every answer out again from the sentence alone.

const COLORS = ['red', 'blue', 'green', 'yellow', 'purple', 'orange'];
const HEADS = ['round', 'square', 'pointy'];
const ARMS = ['short', 'long', 'claws'];
const BOTTOMS = ['legs', 'wheels', 'jet'];
const RANGE = { eyes: [1, 2, 3, 4], antennas: [0, 1, 2, 3], buttons: [1, 2, 3, 4] };
const COUNTS = Object.keys(RANGE);
const KINDS = ['head', 'body', 'nose', 'arms', 'bottom']; // parts named by a describing word
const NUM = ['no', 'one', 'two', 'three', 'four'];
const NOUN = { eyes: ['eye', 'eyes'], antennas: ['antenna', 'antennas'], buttons: ['button', 'buttons'] };
const ARM_WORDS = { short: 'short arms', long: 'long arms', claws: 'claws' };
const BOTTOM_WORDS = { legs: 'legs', wheels: 'wheels', jet: 'a jet' };

/** How one chosen part is said: "a round head", "claws", "a jet", "three eyes", "no antennas". */
function np(part, v) {
  if (part === 'head' || part === 'body' || part === 'nose') return `${an(v)} ${v} ${part}`;
  if (part === 'arms') return ARM_WORDS[v];
  if (part === 'bottom') return BOTTOM_WORDS[v];
  return `${NUM[v]} ${NOUN[part][v === 1 ? 0 : 1]}`;
}
const an = (word) => (/^[aeiou]/.test(word) ? 'an' : 'a');
/**
 * "a, b and c". "No antennas" never stands right before a part that has no word of its own in
 * front of it: "no antennas and wheels" could be heard as no wheels either, so it goes last.
 */
function list(a) {
  const i = a.indexOf('no antennas');
  if (i >= 0 && i < a.length - 1 && /^(legs|wheels|claws|short arms|long arms)$/.test(a[i + 1])) a = [...a.slice(0, i), ...a.slice(i + 1), a[i]];
  return a.length === 1 ? a[0] : `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}`;
}
const again = (why) => new Error(`try again: ${why}`);
const steps = (rows) => `steps${rows.length}`;

/** `must` first, then random values from `pool` until there are `size` different ones. */
function fill(rng, must, pool, size) {
  const out = [...new Set(must)];
  for (const v of rng.shuffle(pool)) {
    if (out.length >= size) break;
    if (!out.includes(v)) out.push(v);
  }
  return out;
}

/** A value for each part: two colour parts get different colours, number parts different numbers. */
function targets(rng, parts) {
  const want = {};
  const colours = rng.shuffle(COLORS);
  const taken = [];
  for (const part of parts) {
    if (part === 'head') want.head = rng.pick(HEADS);
    else if (part === 'arms') want.arms = rng.pick(ARMS);
    else if (part === 'bottom') want.bottom = rng.pick(BOTTOMS);
    else if (part === 'body' || part === 'nose') want[part] = colours.pop();
    else {
      want[part] = rng.pick(RANGE[part].filter((n) => !taken.includes(n)));
      taken.push(want[part]);
    }
  }
  return want;
}

/**
 * Rows for parts that are simply named. Colour rows share one set of colours, and a number row
 * shows the numbers of the other number parts, so the part word is needed as well as the detail.
 * `wide` = how likely a colour or number row is to have four options instead of three.
 */
function plainRows(rng, want, wide = 0, extraNumbers = []) {
  const parts = Object.keys(want);
  const colours = fill(rng, parts.filter((p) => p === 'body' || p === 'nose').map((p) => want[p]), COLORS, rng.chance(wide) ? 4 : 3);
  const numbers = [...parts.filter((p) => p in RANGE).map((p) => want[p]), ...extraNumbers];
  return parts.map((part) => {
    if (part === 'head') return { part, options: HEADS.slice() };
    if (part === 'arms') return { part, options: ARMS.slice() };
    if (part === 'bottom') return { part, options: BOTTOMS.slice() };
    if (part === 'body' || part === 'nose') return { part, options: colours.slice() };
    const must = [want[part], ...numbers.filter((n) => n !== want[part] && RANGE[part].includes(n))].slice(0, 4);
    return { part, options: fill(rng, must, RANGE[part], rng.chance(wide) ? 4 : 3) };
  });
}

/** n parts: `kinds` of them named by a describing word, the rest by a number. */
function someParts(rng, kinds, counts = 0) {
  return rng.shuffle([...rng.sample(KINDS, kinds), ...rng.sample(COUNTS, counts)]);
}
const draft = (say, rows, expect, s, v, extra = {}) => ({ t: 'build', say, rows, expect, s: ['build', steps(rows), ...s], v, ...extra });

// ----------------------------------------------------------------------------- 1, 2: naming parts

const FRAMES = [
  (x) => `Give the robot ${x}.`,
  (x) => `Build a robot with ${x}.`,
  (x) => `This robot has ${x}.`,
];
/** A plain list of parts: "Give the robot a round head, a red body and claws." */
function listed(rng, i, parts, wide, tags, extra) {
  const want = targets(rng, parts);
  return draft(FRAMES[i % FRAMES.length](list(parts.map((p) => np(p, want[p])))), plainRows(rng, want, wide), want, tags, 'build-list', extra);
}

// ----------------------------------------------------------------------------- 3: not

/** "wheels, not legs" / "a round head, not a square one": the thing to choose, then one it is not. */
function notThat(part, v, foil) {
  if (part === 'arms' || part === 'bottom') return `${np(part, v)}, not ${np(part, foil)}`;
  return `${an(v)} ${v} ${part}, not ${an(foil)} ${foil} one`;
}

function negation(rng, i) {
  const parts = someParts(rng, 3);
  const want = targets(rng, parts);
  const rows = plainRows(rng, want);
  const options = (part) => rows.find((r) => r.part === part).options;
  const [a, b, c] = parts;
  if (i % 2 === 0) {
    // two parts are said with a decoy after them: he must not grab the last word he heard
    const foil = (p) => rng.pick(options(p).filter((x) => x !== want[p]));
    // nothing may follow a "not ..." inside its sentence: "legs, not wheels, and a blue body" could
    // be heard as two things the robot must not have
    const say = i % 4 === 0
      ? `Give the robot ${notThat(a, want[a], foil(a))}. It also needs ${np(c, want[c])}, and ${notThat(b, want[b], foil(b))}.`
      : `Build a robot with ${np(c, want[c])} and ${notThat(a, want[a], foil(a))}. Give it ${notThat(b, want[b], foil(b))}.`;
    return draft(say, rows, want, ['not'], 'build-not');
  }
  // one part is only described by what it is NOT: two of its three pictures are ruled out
  const out = options(a).filter((x) => x !== want[a]);
  if (out.length !== 2) throw again('the ruled-out part needs exactly three options');
  const [x, y] = rng.shuffle(out);
  const rest = list([np(b, want[b]), np(c, want[c])]);
  if (a === 'arms' || a === 'bottom') return draft(`Do not give the robot ${np(a, x)} or ${np(a, y)}. Give it ${rest}.`, rows, want, ['not'], 'build-dont');
  return draft(`The ${a} is not ${x} and not ${y}. Give the robot ${rest}.`, rows, want, ['not'], 'build-notnot');
}

// ----------------------------------------------------------------------------- 4: numbers

function numbers(rng, i) {
  const parts = i % 3 === 0 ? someParts(rng, 1, 3) : someParts(rng, 2, 2);
  const want = targets(rng, parts);
  const rows = plainRows(rng, want, 0.5);
  if (i % 3 === 2) {
    const nums = parts.filter((p) => p in RANGE);
    const kinds = parts.filter((p) => !(p in RANGE));
    return draft(`This robot has ${list(nums.map((p) => np(p, want[p])))}. Give it ${list(kinds.map((p) => np(p, want[p])))}.`, rows, want, ['count'], 'build-list');
  }
  return draft(FRAMES[i % 2](list(parts.map((p) => np(p, want[p])))), rows, want, ['count'], 'build-list');
}

// ----------------------------------------------------------------------------- 5: comparing

const SIZED = {
  'legs-short': 'the shorter legs', 'legs-long': 'the longer legs',
  'wheels-small': 'the smaller wheels', 'wheels-big': 'the bigger wheels',
};
/** Arms in three lengths and legs / wheels in two sizes, plus plainly named parts. */
function sizes(rng, n, extra) {
  const others = rng.sample(['head', 'body', 'nose', ...COUNTS], n - 2);
  const want = targets(rng, others);
  const rows = plainRows(rng, want, 0.5);
  want.arms = rng.pick(['short', 'long']);
  want.bottom = rng.pick(Object.keys(SIZED));
  rows.push({ part: 'arms', options: ['short', 'mid', 'long'] }, { part: 'bottom', options: Object.keys(SIZED) });
  const said = rng.shuffle([`the ${want.arms}est arms`, SIZED[want.bottom], ...others.map((p) => np(p, want[p]))]);
  return draft(`Give the robot ${list(said)}.`, rows, want, ['compare'], 'build-size', extra);
}

/** "It has more eyes than antennas": one number is said, the other has to be worked out from it. */
function moreFewer(rng) {
  const [x, y] = rng.sample(COUNTS, 2);
  const kinds = rng.sample(KINDS, 2);
  const want = targets(rng, [y, ...kinds]);
  const more = rng.chance(0.5);
  const fits = RANGE[x].filter((n) => (more ? n > want[y] : n < want[y]));
  const foils = RANGE[x].filter((n) => (more ? n <= want[y] : n >= want[y]));
  if (!fits.length || foils.length < 2) throw again('no single number fits');
  want[x] = rng.pick(fits);
  const rows = plainRows(rng, { [y]: want[y], ...Object.fromEntries(kinds.map((k) => [k, want[k]])) }, 0.5, [want[x]]);
  rows.push({ part: x, options: [want[x], ...fill(rng, foils.includes(want[y]) ? [want[y]] : [], foils, rng.pick([2, 3]))] });
  const said = rng.shuffle([y, ...kinds]).map((p) => np(p, want[p]));
  return draft(`Give the robot ${list(said)}. It has ${more ? 'more' : 'fewer'} ${x} than ${y}.`, rows, want, ['compare', 'count'], 'build-more');
}

/** "the most buttons, the fewest eyes": the biggest and the smallest number in a row. */
function mostFewest(rng) {
  const [x, y] = rng.sample(COUNTS, 2);
  const kinds = rng.sample(KINDS, 2);
  const want = targets(rng, kinds);
  const rows = plainRows(rng, want);
  const said = kinds.map((p) => np(p, want[p]));
  for (const [part, most] of [[x, true], [y, false]]) {
    const options = rng.sample(RANGE[part].filter((n) => n > 0), rng.pick([3, 4]));
    if (options.length < 3) throw again('too few numbers');
    want[part] = most ? Math.max(...options) : Math.min(...options);
    rows.push({ part, options });
    said.push(`the ${most ? 'most' : 'fewest'} ${part}`);
  }
  return draft(`Give the robot ${list(rng.shuffle(said))}.`, rows, want, ['compare', 'count'], 'build-most');
}

/** "It has the same number of buttons as eyes." */
function sameNumber(rng) {
  const [x, y] = rng.sample(COUNTS, 2);
  const kinds = rng.sample(KINDS, 2);
  const want = targets(rng, [y, ...kinds]);
  if (!RANGE[x].includes(want[y])) throw again('that number is not possible for the other part');
  want[x] = want[y];
  const other = rng.pick(RANGE[y].filter((n) => n !== want[y] && RANGE[x].includes(n)));
  const rows = plainRows(rng, { [y]: want[y], ...Object.fromEntries(kinds.map((k) => [k, want[k]])) }, 0.5, [other]);
  rows.push({ part: x, options: fill(rng, [want[x], other], RANGE[x], rng.pick([3, 4])) });
  const said = rng.shuffle([y, ...kinds]).map((p) => np(p, want[p]));
  return draft(`Give the robot ${list(said)}. It has the same number of ${x} as ${y}.`, rows, want, ['compare', 'count'], 'build-same');
}

/** "twice as many buttons as eyes" / "one more button than eyes": [said part, worked-out part, its number]. */
function sum(rng) {
  const [x, y] = rng.sample(COUNTS, 2);
  const twice = rng.chance(0.5);
  const ny = rng.pick(RANGE[y].filter((n) => n > 0 && RANGE[x].includes(twice ? n * 2 : n + 1)));
  const nx = twice ? ny * 2 : ny + 1;
  const text = twice ? `twice as many ${x} as ${y}` : `one more ${NOUN[x][0]} than ${y}`;
  const xRow = { part: x, options: fill(rng, [nx, ny, twice ? ny + 1 : ny + 2, nx - 1].filter((n) => RANGE[x].includes(n)), RANGE[x], 3) };
  return { x, y, nx, ny, text, xRow };
}

/** A number to work out, and `n` more parts: "This robot has two eyes and twice as many buttons as eyes. Give it ..." */
function sumPlus(rng, n) {
  const { x, y, nx, ny, text, xRow } = sum(rng);
  const kinds = rng.sample(KINDS, n);
  const want = targets(rng, kinds);
  want[y] = ny;
  const rows = plainRows(rng, want, 0.5, [nx]);
  rows.push(xRow);
  want[x] = nx;
  return draft(`This robot has ${np(y, ny)} and ${text}. Give it ${list(kinds.map((p) => np(p, want[p])))}.`, rows, want, ['compare', 'count'], 'build-sum');
}

// ----------------------------------------------------------------------------- 6: thinking twice

/** "The head is neither round nor square." / "The robot has neither legs nor a jet." */
function neitherSentence(rng, part, want) {
  const pool = { head: HEADS, arms: ARMS, bottom: BOTTOMS }[part];
  const [x, y] = rng.shuffle(pool.filter((v) => v !== want));
  return part === 'head' ? `The head is neither ${x} nor ${y}.` : `The robot has neither ${np(part, x)} nor ${np(part, y)}.`;
}

/** One part by "neither ... nor", the others (`kinds` by a describing word, `counts` by a number) simply named. */
function neitherPlus(rng, kinds, counts) {
  const n = rng.pick(['head', 'arms', 'bottom']);
  const others = rng.shuffle([...rng.sample(KINDS.filter((k) => k !== n), kinds), ...rng.sample(COUNTS, counts)]);
  const want = targets(rng, [n, ...others]);
  // "it" after "The head is ..." would be the head
  const say = `${neitherSentence(rng, n, want[n])} Give ${n === 'head' ? 'the robot' : 'it'} ${list(others.map((p) => np(p, want[p])))}.`;
  return draft(say, plainRows(rng, want, 0.5), want, ['logic'], 'build-neither');
}

/** A rule to work out: "If the robot has wheels, it gets two antennas. If it has legs, it gets three antennas. Give it legs, ..." */
function rule(rng, unless) {
  const p = rng.pick(['head', 'arms', 'bottom']);
  const q = rng.pick(COUNTS);
  const kinds = rng.sample(KINDS.filter((k) => k !== p), 2);
  const want = targets(rng, [p, ...kinds]);
  const [n1, n2] = rng.sample(RANGE[q], 2);
  const pool = { head: HEADS, arms: ARMS, bottom: BOTTOMS }[p];
  const elsewhere = rng.pick(pool.filter((v) => v !== want[p]));
  const rows = plainRows(rng, want);
  rows.push({ part: q, options: fill(rng, [n1, n2], RANGE[q], rng.pick([3, 4])) });
  const given = `Give it ${list(rng.shuffle([p, ...kinds]).map((part) => np(part, want[part])))}.`;
  if (unless) {
    // half the time the "unless" really happens, half the time it does not. The second sentence
    // says the exception again with "if ... instead", so it cannot be heard as "and next ...".
    const happens = rng.chance(0.5);
    want[q] = happens ? n2 : n1;
    const x = np(p, happens ? want[p] : elsewhere);
    const say = `The robot gets ${np(q, n1)}, unless it has ${x}. If it has ${x}, it gets ${np(q, n2)} instead. ${given}`;
    return draft(say, rows, want, ['logic'], 'build-unless');
  }
  const branches = rng.shuffle([[want[p], n1], [elsewhere, n2]]);
  want[q] = n1;
  const say = `If the robot has ${np(p, branches[0][0])}, it gets ${np(q, branches[0][1])}. If it has ${np(p, branches[1][0])}, it gets ${np(q, branches[1][1])}. ${given}`;
  return draft(say, rows, want, ['logic'], 'build-if');
}

const PLACE = ['first', 'second', 'third'];
/** "Pick the last head and the second body." - a place in the row instead of a describing word; two more parts simply named. */
function places(rng) {
  const [a, b] = rng.sample(['head', 'body', 'nose'], 2);
  const others = rng.sample([...KINDS.filter((k) => k !== a && k !== b), ...COUNTS], 2);
  const want = targets(rng, others);
  const rows = plainRows(rng, want, 0.5);
  // every colour row shows the same colours, whether its part is named by colour or by place
  const colours = rows.find((r) => r.part === 'body' || r.part === 'nose')?.options ?? rng.sample(COLORS, rng.pick([3, 4]));
  const said = [a, b].map((part) => {
    const options = rng.shuffle(part === 'head' ? HEADS : colours);
    const at = rng.int(options.length);
    want[part] = options[at];
    rows.push({ part, options, fixed: true }); // the order he sees is the order the sentence counts in
    return `the ${at === options.length - 1 ? 'last' : PLACE[at]} ${part}`;
  });
  return draft(`Pick ${list(said)}. The robot also needs ${list(others.map((p) => np(p, want[p])))}.`, rows, want, ['ordinal'], 'build-place');
}

/**
 * A change of plan: "Give the robot four eyes, a green body and wheels. Wait, no. Not wheels. Give it a jet."
 * One part is said, taken back and said again; the part that was taken back is a picture in the
 * same row, so a listener who stops at the end of the list builds a robot that is on offer.
 */
function changeOfPlan(rng, i, parts) {
  const want = targets(rng, parts);
  const rows = plainRows(rng, want, 0.5);
  const changed = rng.pick(parts);
  // what he says first: another picture of that row, but not a colour or number that the list
  // also gives to another part, and never "not no antennas"
  const elsewhere = parts.filter((p) => p !== changed).map((p) => want[p]);
  const firsts = rows.find((r) => r.part === changed).options.filter((v) => v !== want[changed] && v !== 0 && !elsewhere.includes(v));
  if (!firsts.length) throw again('nothing else to say first');
  const first = rng.pick(firsts);
  const said = list(parts.map((p) => np(p, p === changed ? first : want[p])));
  const say = `${FRAMES[i % 2](said)} Wait, no. Not ${np(changed, first)}. Give it ${np(changed, want[changed])}.`;
  return draft(say, rows, want, ['end'], 'build-change');
}

// ----------------------------------------------------------------------------- 7: five parts, hidden

const hidden = (d) => ({ ...d, hide: true, s: [...d.s, 'hidden'] });

// ----------------------------------------------------------------------------- the world

export default {
  id: 'build', name: 'Robot Workshop', blurb: 'Build the robot I describe, part by part.', color: '#2aa9d8', speed: 0.93, allowNone: false,
  levels: [
    { id: 'build1', title: 'Two Parts', n: 18,
      tip: 'Welcome to the Robot Workshop! I tell you what the robot looks like. Tap one picture in each row to build it. When your robot is ready, tap the green check mark.',
      gen: (rng, i) => listed(rng, i, i % 3 === 2 ? rng.shuffle(['body', 'nose']) : someParts(rng, 2), 0, ['detail']) },
    { id: 'build2', title: 'Three Parts', n: 18,
      tip: 'Now the robot needs three parts. Listen to all of them before you start. Picked the wrong one? Tap another picture in that row, or tap the arrow to take it back.',
      gen: (rng, i) => listed(rng, i, someParts(rng, 3), 0.3, ['detail']) },
    { id: 'build3', title: 'Not That One', n: 18,
      tip: 'Listen for the word not. Sometimes I only tell you what the robot does not have. Then look along the row and work out which picture is left.',
      gen: negation },
    { id: 'build4', title: 'How Many', n: 18,
      tip: 'Now listen for numbers. How many eyes, how many antennas, how many buttons? Each number belongs to one part, so do not mix them up.',
      gen: numbers },
    { id: 'build5', title: 'Longest and Most', n: 18,
      tip: 'Now you have to compare. Listen for words like longest, bigger, more and fewer. Twice as many means two times as many. Look along the whole row before you choose.',
      gen: (rng, i) => [() => sizes(rng, 4), moreFewer, mostFewest, sameNumber, () => sumPlus(rng, 2)][i % 5](rng) },
    // five kinds of sentence, each announced by the tip; four rows and ONE of these ideas in every item
    { id: 'build6', title: 'Think Twice', n: 18,
      tip: 'Listen for if and unless. Unless means: but not when. Neither red nor blue means: not red and not blue. The first picture is on the left, like reading. If I change my mind, build the new part.',
      gen: (rng, i) => [
        () => rule(rng, false),
        () => neitherPlus(rng, 2, 1),
        () => changeOfPlan(rng, i, someParts(rng, 2, 2)),
        places,
        () => rule(rng, true),
      ][i % 5](rng) },
    { id: 'build7', title: 'Blind Build', n: 18, holdMs: 800,
      tip: 'Now the pictures stay hidden while I talk. Listen to all five parts and keep them in your head. Build the robot when the pictures turn over.',
      gen: (rng, i) => hidden([
        () => listed(rng, i, someParts(rng, 3, 2), 0.5, ['detail']),
        () => neitherPlus(rng, 2, 2),
        () => changeOfPlan(rng, i, someParts(rng, 3, 2)),
        () => sumPlus(rng, 3),
        () => sizes(rng, 5),
      ][i % 5](rng)) },
    { id: 'build-boss', title: 'Workshop Boss', boss: true, mix: ['build5', 'build6', 'build7'], holdMs: 800,
      tip: 'The Workshop Boss! Hard robots, tricky words and some hidden pictures. Take your time. Listen to the very end, then build.' },
  ],
};
