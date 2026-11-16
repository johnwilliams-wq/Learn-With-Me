// Independent answer rules for the tap sentence patterns of the Story Cave world.
//   RULES[v] = (item, mentions, helpers) => expected groups of object ids
// `mentions` = every "the big red gem"-style phrase of item.say, in spoken order;
// `helpers` = the tools exported by ./tap-base.mjs (one, all, ids, rx, index, ...).
// A rule must work from item.say and item.scene only - never from item.expect.
//
// How these rules read a story: the clip is cut into sentences; the last one is the question.
// Things are found by their names in the text ("named"), characters by "Zip the robot"
// ("castOf"). Nothing here is shared with the generators in tools/content.

import assert from 'node:assert/strict';

const CHARACTERS = ['robot', 'dragon', 'wizard', 'knight', 'cat', 'owl', 'ghost', 'fox'];
const COLOUR = '(red|blue|green|yellow|purple|orange)';
const PLACE = '(?:inside|under|behind) the (\\w+)';

/** The clip as sentences. The last one is always the question (or the "Tap ..." instruction). */
const sentences = (it) => it.say.match(/[^.?!]+[.?!]/g).map((s) => s.trim());
const storyOf = (it) => sentences(it).slice(0, -1);
const questionOf = (it) => sentences(it).at(-1);
const shownKinds = (it) => [...new Set(it.scene.objects.map((o) => o.kind))];
/** The things on screen that a piece of text names, in spoken order (once per time it is said). */
function named(it, text) {
  return [...text.matchAll(new RegExp(`\\b(${shownKinds(it).join('|')})(?:es|s)?\\b`, 'gi'))].map((m) => m[1].toLowerCase());
}
/** { Zip: 'robot', 'Sir Clank': 'knight', ... } for every "Name the kind" in the clip. */
function castOf(it) {
  const cast = {};
  for (const m of it.say.matchAll(new RegExp(`((?:Sir )?[A-Z][a-z]+) the (${CHARACTERS.join('|')})\\b`, 'g'))) cast[m[1]] = m[2];
  return cast;
}
/** The object for a character's name. */
function who(it, h, name) {
  const kind = castOf(it)[name];
  assert.ok(kind, `"${it.say}" - who is ${name}?`);
  return h.one(it, { kind });
}
const distinct = (it, list, n) => {
  assert.equal(list.length, n, `"${it.say}" - expected ${n} things, found ${list.join(', ')}`);
  assert.equal(new Set(list).size, n, `"${it.say}" - something is named twice: ${list.join(', ')}`);
  return list;
};
/** The one sentence of the story that matches `re`; the single shown thing it names. */
function thingInTheSentence(it, h, re) {
  const hits = storyOf(it).filter((s) => re.test(s));
  assert.equal(hits.length, 1, `"${it.say}" - exactly one sentence should match ${re}`);
  const [kind] = distinct(it, named(it, hits[0]), 1);
  // the other things on screen that are named must each have their own, different sentence
  const others = storyOf(it).filter((s) => !re.test(s)).flatMap((s) => named(it, s));
  assert.ok(others.length >= 2 && !others.includes(kind), `"${it.say}" - needs competing things`);
  return [[h.one(it, { kind })]];
}

/** The events of a routine story (one thing each), in the order they are TOLD. */
function told(it, n = 4) {
  const events = named(it, storyOf(it).join(' '));
  return distinct(it, events, n);
}
const asGroups = (it, h, kinds) => kinds.map((kind) => [h.one(it, { kind })]);
const swap = (list, i, j) => { [list[i], list[j]] = [list[j], list[i]]; };

// Level 5 ("work it out"): the answer is never named, so the rule cannot read it off the text.
// Instead this table says, for every thing and character, which clue words point to it. A rule
// then (1) drops every part of the story that says what the answer is NOT ("too big to wear on a
// finger", "she did not purr"), (2) looks for clue words of each of the four choices, and
// (3) insists that exactly ONE choice is pointed to - and that its name is never spoken.
const CLUES = {
  gem: /sparkl|jewel/, key: /\block/, potion: /drank|fizzy|gulp/, shield: /held it in front/, sword: /sharp|cut the rope/, chest: /box with a lid/,
  map: /drawn on it/, star: /twinkl/, coin: /\bpa(y|id)\b|\bbuy\b/, crown: /bowed/, bell: /\brang\b/, drum: /\bsticks\b|boom/, torch: /flame/,
  boot: /\b(foot|feet)\b/, book: /\bpages\b|read out loud/, mushroom: /\bstem\b|growing/, hat: /\bbrim\b/, ring: /finger/, rocket: /\bmoon\b|counted down/,
  egg: /\bnest\b|hatch|cracked open/, flag: /\bpole\b|flapped/, heart: /\blove/,
  robot: /\boil\b|beep|charge/, dragon: /burned|breath\w* fire/, wizard: /\bwand\b|\bspell/, knight: /armor/, cat: /purr|whisker/, owl: /feather/,
  ghost: /float\w* straight through|float\w* through/, fox: /bushy tail/,
};
const DENIED = /\b(not|no|too|never|nobody|nothing|without|neither|nor)\b/i;
function detective(it, h, wantCharacter) {
  const text = storyOf(it).join(' ');
  const positive = text.split(/[.,;!?]|\bbut\b|\band\b/).filter((part) => !DENIED.test(part)).join(' | ');
  const kinds = shownKinds(it);
  assert.equal(kinds.length, it.scene.objects.length, `"${it.say}" - every choice must be a different thing`);
  for (const k of kinds) assert.ok(CLUES[k], `no clue words for "${k}" - add them to CLUES`);
  const fits = kinds.filter((k) => CLUES[k].test(positive));
  assert.equal(fits.length, 1, `"${it.say}" - the clues should point to exactly one choice, they point to: ${fits.join(', ') || 'none'}`);
  assert.ok(!new RegExp(`\\b${fits[0]}s?\\b`, 'i').test(it.say), `"${it.say}" - the answer is given away`);
  assert.equal(CHARACTERS.includes(fits[0]), wantCharacter, it.say);
  assert.match(questionOf(it), wantCharacter ? /^Who / : /^What /, it.say);
  return [[h.one(it, { kind: fits[0] })]];
}

function retell(it, h, n, word) {
  const events = told(it, n);
  assert.ok(!/\b(before|only after)\b/i.test(it.say), `${it.say}: this pattern is told in order`);
  assert.equal(it.scene.objects.length, n + 1, `${it.say}: one extra thing on screen`);
  assert.equal(questionOf(it), `Tap the ${word} things in the order they happened.`);
  return asGroups(it, h, events);
}

/** "a key", "a red flag" -> a description for helpers.one() */
function phrase(text) {
  const m = new RegExp(`^(?:an? |the )?(?:${COLOUR} )?(\\w+)$`).exec(text.trim());
  assert.ok(m, `cannot read "${text}"`);
  return m[1] ? { color: m[1], kind: m[2] } : { kind: m[2] };
}
/** "a key, a gem, and a star" -> the three descriptions */
const listed = (text) => text.split(/,\s*(?:and\s+)?|\s+and\s+/).filter(Boolean).map(phrase);

export const RULES = {
  // ---------------------------------------------------------------- 1: who has what
  // A found X, B found Y, they swapped/traded: each now has the other one's thing.
  'st-swap-what': (it, m, h) => {
    const [n1, c1, k1, n2, c2, k2, ask] = h.rx(it, new RegExp(`^(.+?) the \\w+ found an? ${COLOUR} (\\w+) [^.]*\\. (.+?) the \\w+ found an? ${COLOUR} (\\w+)\\. .*What does (.+?) have now\\?$`));
    assert.match(it.say, /swapped|traded/);
    assert.ok(ask === n1 || ask === n2, it.say);
    return [[h.one(it, ask === n1 ? { kind: k2, color: c2 } : { kind: k1, color: c1 })]];
  },
  // A carries X, B carries Y, a third one only watches; A and B swap: X is now with B.
  'st-swap-who': (it, m, h) => {
    const [n1, k1, n2, k2, s1, s2, ask] = h.rx(it, /^(.+?) the \w+ was carrying an? (\w+) [^.]*\. (.+?) the \w+ was carrying an? (\w+)\. .*Halfway up, (.+?) and (.+?) swapped\. Who is carrying the (\w+) now\?$/);
    assert.deepEqual([s1, s2], [n1, n2], it.say);
    assert.ok(ask === k1 || ask === k2, it.say);
    assert.equal(Object.keys(castOf(it)).length, 3, `${it.say}: two carriers and one who watches`);
    return [[who(it, h, ask === k1 ? n2 : n1)]];
  },
  // A had two, gave B one colour and kept "the other".
  'st-gave-kept': (it, m, h) => {
    const [n1, c1, c2, n2, g1, g2, given, kind, ask] = h.rx(it, new RegExp(`^(.+?) the \\w+ had two \\w+, an? ${COLOUR} one and an? ${COLOUR} one\\. (.+?) the \\w+ had none\\. So (.+?) gave (.+?) the ${COLOUR} one and kept the other\\. Which (\\w+) does (.+?) have now\\?$`));
    assert.deepEqual([g1, g2], [n1, n2], it.say);
    assert.ok(given === c1 || given === c2, it.say);
    assert.ok(ask === n1 || ask === n2, it.say);
    const kept = given === c1 ? c2 : c1;
    return [[h.one(it, { kind, color: ask === n2 ? given : kept })]];
  },
  // Each brought one thing and took "the wrong thing" home: the other one's.
  'st-mixup': (it, m, h) => {
    const [n1, n2, b1, c1, k1, b2, c2, k2, ask] = h.rx(it, new RegExp(`^(.+?) the \\w+ and (.+?) the \\w+ went to [^.]*\\. (.+?) brought an? ${COLOUR} (\\w+), and (.+?) brought an? ${COLOUR} (\\w+)\\. .*picked up the wrong thing by mistake\\. What did (.+?) take home\\?$`));
    assert.deepEqual([b1, b2], [n1, n2], it.say);
    assert.ok(ask === n1 || ask === n2, it.say);
    return [[h.one(it, ask === n1 ? { kind: k2, color: c2 } : { kind: k1, color: c1 })]];
  },

  // ---------------------------------------------------------------- 2: what happened when
  // Four events told in order (First / Next / ...). The order of the things named IS the order.
  'st-order-before': (it, m, h) => {
    const events = told(it);
    assert.match(questionOf(it), /^What did .+ do right before /);
    const at = events.indexOf(distinct(it, named(it, questionOf(it)), 1)[0]);
    assert.ok(at > 0, it.say);
    return [[h.one(it, { kind: events[at - 1] })]];
  },
  'st-order-after': (it, m, h) => {
    const events = told(it);
    assert.match(questionOf(it), /^What did .+ do right after /);
    const at = events.indexOf(distinct(it, named(it, questionOf(it)), 1)[0]);
    assert.ok(at >= 0 && at < 3, it.say);
    return [[h.one(it, { kind: events[at + 1] })]];
  },
  'st-order-nth': (it, m, h) => {
    const events = told(it);
    const [nth] = h.rx(it, /What was the (first|second|third|fourth|last) thing .+ did\?$/);
    return [[h.one(it, { kind: events[{ first: 0, second: 1, third: 2, fourth: 3, last: 3 }[nth]] })]];
  },
  'st-order-between': (it, m, h) => {
    const events = told(it);
    assert.match(questionOf(it), /^What did .+ do after .+ but before /);
    const [from, to] = distinct(it, named(it, questionOf(it)), 2).map((k) => events.indexOf(k));
    assert.equal(to - from, 2, `${it.say}: exactly one thing must lie between`);
    return [[h.one(it, { kind: events[from + 1] })]];
  },

  // ---------------------------------------------------------------- 3: where did it go
  // One thing, three hiding places in the order they are told.
  'st-move-twice': (it, m, h) => {
    const places = distinct(it, [...storyOf(it).join(' ').matchAll(new RegExp(PLACE, 'g'))].map((x) => x[1]), 3);
    const q = questionOf(it);
    const at = /^Where is the \w+ now\?$/.test(q) ? 2 : /at the very start\?$/.test(q) ? 0 : /before the very last move\?$/.test(q) ? 1 : -1;
    assert.ok(at >= 0, `${it.say}: unknown question`);
    return [[h.one(it, { kind: places[at] })]];
  },
  // Moved once; a third place is only thought about; then put back at the start, or left alone.
  'st-move-back': (it, m, h) => {
    const [p1, p2, p3] = h.rx(it, new RegExp(`hid an? \\w+ ${PLACE}\\. [^.]*, so \\w+ moved it ${PLACE}\\. \\w+ thought about putting it ${PLACE}, but \\w+ did not\\.`));
    distinct(it, [p1, p2, p3], 3);
    assert.match(questionOf(it), /^Where is the \w+ now\?$/);
    const end = storyOf(it).at(-1);
    const at = /put it back where it was at the start/.test(end) ? p1 : /left it right where it was/.test(end) ? p2 : null;
    assert.ok(at, `${it.say}: unknown ending`);
    return [[h.one(it, { kind: at })]];
  },
  // Two things. The first moves to a new place; the second moves to where the first one started.
  'st-move-two': (it, m, h) => {
    const [k1, p1, k2, p2, moved1, p3, moved2, ref, ask] = h.rx(it, new RegExp(`put an? (\\w+) ${PLACE} and an? (\\w+) ${PLACE}\\. Later, \\w+ moved the (\\w+) ${PLACE}\\. Then \\w+ moved the (\\w+) to the place where the (\\w+) was at the start\\. Where is the (\\w+) now\\?$`));
    assert.notEqual(k1, k2);
    const start = { [k1]: p1, [k2]: p2 };
    const now = { ...start };
    assert.ok(moved1 in now && moved2 in now && ref in start && ask in now, it.say);
    now[moved1] = p3;
    now[moved2] = start[ref];
    return [[h.one(it, { kind: now[ask] })]];
  },
  // A thing goes from A to B to C, and then: C keeps it / takes it back to the finder / gives it back to someone named.
  'st-pass-who': (it, m, h) => {
    const [finder, , third] = h.rx(it, /^(.+?) the \w+ found an? \w+ and gave it to (.+?) the \w+\. .+? passed it on to (.+?) the \w+\./);
    const end = storyOf(it).at(-1);
    assert.match(end, new RegExp(`^${third} `), it.say);
    let holder = null;
    if (/ kept it\b/.test(end)) holder = third;
    else if (/took it back to the one who found it/.test(end)) holder = finder;
    else holder = /gave it back to (.+?)\.$/.exec(end)?.[1];
    assert.ok(holder, `${it.say}: unknown ending`);
    assert.equal(Object.keys(castOf(it)).length, 3, it.say);
    return [[who(it, h, holder)]];
  },

  // ---------------------------------------------------------------- 4: why did it happen
  // Things go missing on a trip. A sentence with "but" tells of one that came back; the cause is
  // the thing in the one sentence WITHOUT "but" (after the opening list).
  'st-why-lost': (it, m, h) => {
    const [list] = h.rx(it, /^.+? set off for .+? with ([^.]+)\./);
    const carried = listed(list).map((q) => q.kind);
    assert.deepEqual([...carried].sort(), shownKinds(it).sort(), `${it.say}: every choice must be in the list`);
    const mishaps = storyOf(it).slice(1).filter((s) => named(it, s).length);
    assert.equal(mishaps.length, 2, it.say);
    const gone = mishaps.filter((s) => !/\bbut\b/.test(s));
    assert.equal(gone.length, 1, `${it.say}: exactly one thing must be lost for good`);
    assert.match(questionOf(it), /^Why did /);
    return [[h.one(it, { kind: distinct(it, named(it, gone[0]), 1)[0] })]];
  },
  // Three presents; one reaction is delight.
  'st-why-glad': (it, m, h) => thingInTheSentence(it, h, /jumped for joy|laughed out loud|danced around the room/),
  // Three things passed in the dark; one makes a noise.
  'st-why-woke': (it, m, h) => thingInTheSentence(it, h, /with a loud (crash|bang)/),
  // Three things on the way; one takes a long time.
  'st-why-late': (it, m, h) => thingInTheSentence(it, h, /for a whole hour|for a long, long time/),

  // ---------------------------------------------------------------- 5: story detective
  'st-detect-thing': (it, m, h) => detective(it, h, false),
  'st-detect-who': (it, m, h) => detective(it, h, true),

  // ---------------------------------------------------------------- 6: in or out
  // Exactly one thing on screen is never named.
  'st-not-in': (it, m, h) => {
    assert.match(questionOf(it), /^Which one of these was not in the (story|dream|attic)\?$/);
    const said = new Set(named(it, it.say));
    assert.equal(said.size, 4, `${it.say}: four things should be told`);
    const missing = it.scene.objects.filter((o) => !said.has(o.kind));
    assert.equal(missing.length, 1, it.say);
    return [h.ids(missing)];
  },
  // Packing: a sentence with "but" is about things that did not go in; every other thing did.
  'st-all-packed': (it, m, h) => {
    assert.match(questionOf(it), /^Tap everything .+ packed\.$/);
    const inBag = storyOf(it).filter((s) => !/\bbut\b/.test(s)).flatMap((s) => named(it, s));
    const out = storyOf(it).filter((s) => /\bbut\b/.test(s)).flatMap((s) => named(it, s));
    distinct(it, [...inBag, ...out], it.scene.objects.length);
    assert.ok(inBag.length >= 2 && out.length >= 1, it.say);
    return [inBag.map((kind) => h.one(it, { kind }))];
  },
  // A party: one sentence per character; "not", "never", "home" or "but" means they were not there.
  'st-all-came': (it, m, h) => {
    assert.match(questionOf(it), /^Tap everyone who was at the party\.$/);
    const cast = castOf(it);
    const there = [];
    const away = [];
    for (const s of storyOf(it).slice(1)) {
      const names = Object.keys(cast).filter((n) => s.startsWith(`${n} the `));
      assert.equal(names.length, 1, `${it.say}: one character per sentence`);
      (/\b(not|never|home|but)\b/.test(s) ? away : there).push(cast[names[0]]);
    }
    distinct(it, [...there, ...away], it.scene.objects.length);
    assert.ok(there.length >= 1 && away.length >= 1, it.say);
    return [there.map((kind) => h.one(it, { kind }))];
  },
  // Moving house: "stayed behind" and "forgot" sentences name what was left.
  'st-all-left': (it, m, h) => {
    assert.match(questionOf(it), /^Tap everything .+ left behind\.$/);
    const isLeft = (s) => /stayed behind|forgot/.test(s);
    const left = storyOf(it).filter(isLeft).flatMap((s) => named(it, s));
    const taken = storyOf(it).filter((s) => !isLeft(s)).flatMap((s) => named(it, s));
    distinct(it, [...left, ...taken], it.scene.objects.length);
    assert.ok(left.length >= 2 && taken.length >= 2, it.say);
    return [left.map((kind) => h.one(it, { kind }))];
  },

  // ---------------------------------------------------------------- 7: tell it back
  // Four (or five) events told in order; one more thing on screen that is never named.
  'st-retell-4': (it, m, h) => retell(it, h, 4, 'four'),
  'st-retell-5': (it, m, h) => retell(it, h, 5, 'five'),
  // Four events NOT told in order. Each marker swaps two neighbours of the told order:
  //   "X. But before he did that, W."        the first two are the other way around
  //   "Before he X, he W."                   the same
  //   "At the very end, Z. But just before the end, Y."   the last two are the other way around
  //   "Then he Z, but only after he Y."      the same
  'st-retell-back': (it, m, h) => {
    const order = told(it).slice();
    const story = storyOf(it).join(' ');
    let twists = 0;
    if (/\. But before \w+ did that, /.test(story)) { swap(order, 0, 1); twists++; }
    if (/\. Before \w+ [^,.]+, \w+ /.test(story)) { swap(order, 0, 1); twists++; }
    if (/\. But just before the end, /.test(story)) { swap(order, 2, 3); twists++; }
    if (/, but only after \w+ /.test(story)) { swap(order, 2, 3); twists++; }
    assert.ok(twists >= 1 && twists <= 2, `${it.say}: no twist in the telling`);
    assert.equal((story.match(/\bbefore\b|\bonly after\b/gi) || []).length, twists, `${it.say}: a "before" or "after" the rule does not know`);
    assert.match(questionOf(it), /^Tap the four things in the order they really happened\.$/);
    return asGroups(it, h, order);
  },
  // A plan (A first, then B, C last) and one change to it.
  'st-plan-visit': (it, m, h) => {
    const [visitor, a, b, c] = h.rx(it, /^(.+?) the \w+ had three friends to visit\. \w+ planned to see (.+?) the \w+ first, then (.+?) the \w+, and (.+?) the \w+ last\./);
    const change = storyOf(it).at(-1);
    assert.match(change, /^But /);
    let order = null;
    let x;
    if ((x = /^But (.+?) was not home .* saw \w+ last of all\.$/.exec(change))) order = [a, b, c].filter((n) => n !== x[1]).concat(x[1]);
    else if ((x = /bumped into (.+?), so \1 was the first one \w+ saw\.$/.exec(change))) order = [x[1], ...[a, b, c].filter((n) => n !== x[1])];
    else if ((x = /^But (.+?) was fast asleep, so .+ skipped \w+ and saw the other two\.$/.exec(change))) order = [a, b, c].filter((n) => n !== x[1]);
    else if (/visited them the other way around\.$/.test(change)) order = [c, b, a];
    assert.ok(order && order.length >= 2 && order.every((n) => [a, b, c].includes(n)), `${it.say}: unknown change of plan`);
    assert.match(questionOf(it), new RegExp(`^Tap the friends in the order ${visitor} really saw them\\.$`));
    return order.map((n) => [who(it, h, n)]);
  },
  // A bag: what was put in, minus what was taken out, plus what was put in instead or added.
  'st-plan-bag': (it, m, h) => {
    const story = storyOf(it).join(' ');
    const [first] = h.rx(it, /\. \w+ put in ([^.]+)\. Then \w+ changed \w+ mind\. /);
    let bag = listed(first);
    const same = (p, q) => p.kind === q.kind && (p.color || '') === (q.color || '');
    const takeOut = (q) => {
      assert.ok(bag.some((p) => same(p, q)), `${it.say}: ${JSON.stringify(q)} was never put in`);
      bag = bag.filter((p) => !same(p, q));
    };
    let x;
    if ((x = / took out the ([^.]+?) and put in (an? [^.]+?) instead\./.exec(story))) {
      takeOut(phrase(x[1]));
      bag.push(phrase(x[2]));
    } else if ((x = / took out the ([^.]+?) and the ([^.]+?)\./.exec(story))) {
      takeOut(phrase(x[1]));
      takeOut(phrase(x[2]));
    } else assert.fail(`${it.say}: nothing is taken out`);
    const [added] = h.rx(it, /Just before \w+ left, \w+ added ([^.]+)\./);
    bag.push(...listed(added));
    assert.match(questionOf(it), /^Tap everything that is in the bag now\.$/);
    return [bag.map((q) => h.one(it, q))];
  },
};
