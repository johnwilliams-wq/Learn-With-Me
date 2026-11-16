// Story Cave (world "stories"): tests of the generators and of their independent oracle.
//
// These build the world straight from its module (they do not need the game data to have been
// rebuilt), draw many more stories than the game ships - with other random seeds - and insist
// that the oracle in tests/unit/oracles/tap-stories.mjs works out the same answer for every one.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeRng } from '../../src/core/rng.js';
import world from '../../tools/content/worlds/stories.mjs';
import { buildLevel, validateItem, prepare } from '../../tools/content/pipeline.mjs';
import { TYPES } from '../../tools/content/types/index.mjs';
import { ORACLE, helpers, mentions } from './oracles/tap-base.mjs';
import { RULES } from './oracles/tap-stories.mjs';
import { RULES as MEMORY } from './oracles/tap-memory.mjs';
import { RULES as LOGIC } from './oracles/tap-logic.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const SOUND_ALIKE = [['boot', 'book'], ['heart', 'hat'], ['coin', 'crown']];
// names that are too close by ear to share a story
const NAMES_ALIKE = [['Zip', 'Zazz'], ['Boo', 'Hoot']];
// words that sound like a colour: never said at all in a story
const SOUNDS_LIKE_A_COLOUR = /\b(read|reads|blew)\b/i;
// words that sound like something that can be on screen: never said while that thing is shown
const SOUNDS_LIKE_A_THING = [[/\b(rang|rung|ringing)\b/i, 'ring'], [/\bnights?\b/i, 'knight'], [/\bcrows?\b/i, 'crown'], [/\bnaps?\b/i, 'map'],
  [/\bboats?\b/i, 'boot'], [/\bdreams?\b/i, 'drum'], [/\bflat\b/i, 'flag']];
// things that are drawn on another card (src/art/sprites.js): a hidden one must not send him to the wrong card
const DRAWN_ON = { book: ['star'], hat: ['star'], crown: ['gem'] };
const ALLOWED_TAGS = ['story', 'infer', 'order', 'detail', 'hidden', 'steps3', 'not', 'all'];
const norm = (groups) => groups.map((g) => [...g].sort());
const words = (say) => say.split(/\s+/).length;
const own = world.levels.filter((l) => l.gen);
for (const level of world.levels) prepare(world, level);

/** What the oracle says the answer is. */
const solve = (it) => RULES[it.v](it, mentions(it.say), helpers);
/** Draw `n` finished items from a level's generator with a seed of our own. */
function draw(level, seed, n) {
  const rng = makeRng(`${level.id}-${seed}`);
  const out = [];
  for (let tries = 0; out.length < n; tries++) {
    assert.ok(tries < n * 50, `${level.id}: the generator keeps failing`);
    let item;
    try {
      item = TYPES.tap.finish(rng, level.gen(rng, out.length));
    } catch (err) {
      if (/ambiguous|cannot pick|sound-alike|try again/.test(err.message)) continue;
      throw err;
    }
    const { t, ...rest } = item;
    assert.equal(t, 'tap');
    out.push({ id: `${level.id}-x${out.length}`, audio: 'x.mp3', ...rest });
  }
  return out;
}
const built = new Map(own.map((level) => [level.id, buildLevel(world, level, () => 'preview.mp3')]));
const shipped = [...built.values()].flat();

test('stories: the world has seven levels and a boss made of the hardest three', () => {
  assert.equal(world.id, 'stories');
  assert.equal(own.length, 7);
  const boss = world.levels.at(-1);
  assert.ok(boss.boss && !boss.gen);
  assert.deepEqual(boss.mix, own.slice(-3).map((l) => l.id));
  for (const level of world.levels) {
    assert.ok(level.tip.length <= 200, `${level.id}: tip has ${level.tip.length} characters`);
    assert.ok(!level.allowNone, `${level.id}: no story asks him to do nothing`);
    if (level.gen) assert.ok(level.n >= 18, `${level.id}: ${level.n} items`);
  }
  // the levels that need the Done button say what it looks like
  for (const id of ['stories6', 'stories7']) assert.match(world.levels.find((l) => l.id === id).tip, /green check mark/);
  // level 6: the first hidden cards of this world are announced, and nobody is told to tap everything he hears
  const six = world.levels.find((l) => l.id === 'stories6').tip;
  assert.match(six, /hidden/);
  assert.match(six, /only the ones that fit/);
  assert.ok(!/everything on my list/.test(six), 'stories6: half of what is listed must NOT be tapped');
});

test('stories: every pattern is new and has its own oracle rule', () => {
  const patterns = new Set(own.flatMap((level) => draw(level, 'patterns', 48)).map((it) => it.v));
  assert.ok(patterns.size >= 25, `only ${patterns.size} patterns`);
  for (const v of patterns) {
    assert.match(v, /^st-/, `${v}: Story Cave patterns start with "st-"`);
    assert.equal(typeof RULES[v], 'function', `no oracle rule for ${v}`);
    assert.ok(!(v in ORACLE) && !(v in MEMORY) && !(v in LOGIC), `${v} is already used by another world`);
  }
  for (const v of Object.keys(RULES)) assert.ok(patterns.has(v), `oracle rule ${v} is never used`);
});

test('stories: the oracle agrees with the generator on a thousand more stories', () => {
  let n = 0;
  for (const level of own) {
    for (const seed of ['a', 'b', 'c']) {
      for (const it of draw(level, seed, 60)) {
        validateItem(it, level);
        assert.deepEqual(norm(solve(it)), norm(it.expect), `${it.id} (${it.v}): ${it.say}`);
        n++;
      }
    }
  }
  assert.ok(n > 1000);
});

test('stories: every story is a real story, fits one clip, and is fair', () => {
  for (const level of own) {
    for (const it of [...built.get(level.id), ...draw(level, 'fair', 80)]) {
      const where = `${it.id} (${it.v}): ${it.say}`;
      assert.ok(it.say.length <= 420, `${where} - ${it.say.length} characters`);
      assert.ok(words(it.say) >= 25 && words(it.say) <= 70, `${where} - ${words(it.say)} words`);
      const sentences = it.say.match(/[^.?!]+[.?!]/g);
      assert.ok(sentences.length >= 4 && sentences.length <= 9, `${where} - ${sentences.length} sentences`);
      assert.ok(!/[0-9"“”’'&%+=/()]/.test(it.say), `${where} - digits or symbols`);
      for (const tag of it.s) assert.ok(ALLOWED_TAGS.includes(tag), `${where} - tag ${tag}`);
      const objects = it.scene.objects;
      const answers = it.expect.flat();
      assert.ok(objects.length >= 3 && objects.length <= 6, where);
      assert.ok(answers.length >= 1 && (answers.length < objects.length || it.expect.length > 1), `${where} - there must be something to get wrong`);
      assert.equal(!!it.auto, answers.length === 1, `${where} - one tap answers at once, several need the check mark`);
      assert.equal(!!it.hide, it.s.includes('hidden'), where);
      if (it.mode === 'pick') assert.ok(it.s.includes('all'), where);
      // no two choices look the same, and nothing on screen sounds like something in the story
      assert.equal(new Set(objects.map((o) => `${o.color} ${o.kind}`)).size, objects.length, where);
      for (const pair of SOUND_ALIKE) {
        for (const [shown, said] of [pair, [...pair].reverse()]) {
          if (objects.some((o) => o.kind === shown)) assert.ok(!new RegExp(`\\b${said}s?\\b`, 'i').test(it.say), `${where} - "${said}" is said while ${shown} is on screen`);
        }
      }
      // ... and no word of the story can be heard as a colour, or as a thing that is on screen
      assert.ok(!SOUNDS_LIKE_A_COLOUR.test(it.say), `${where} - a word that sounds like a colour`);
      for (const [word, shown] of SOUNDS_LIKE_A_THING) {
        if (objects.some((o) => o.kind === shown)) assert.ok(!word.test(it.say), `${where} - ${word} is said while the ${shown} is on screen`);
      }
      // he never has to tell two names apart that sound alike
      for (const [x, y] of NAMES_ALIKE) assert.ok(!(new RegExp(`\\b${x}\\b`).test(it.say) && new RegExp(`\\b${y}\\b`).test(it.say)), `${where} - ${x} and ${y} in one story`);
    }
  }
});

test('stories: a mission is varied, and the hard levels ask for a lot', () => {
  const count = (items, f) => items.filter(f).length;
  for (const level of own) {
    const items = built.get(level.id);
    assert.equal(items.length, level.n);
    assert.ok(items.length >= 15, `${level.id}: too few items for varied missions`);
    assert.equal(new Set(items.map((it) => it.say)).size, items.length, `${level.id}: the same story twice`);
    assert.ok(new Set(items.map((it) => it.v)).size >= (level.id === 'stories5' ? 2 : 4), `${level.id}: needs several patterns`);
    // the right answer is not always in the same place in the telling
    if (level.id !== 'stories5') assert.ok(new Set(items.map((it) => it.say.split(' ').slice(0, 3).join(' '))).size >= 6, `${level.id}: stories start alike`);
  }
  // levels 1-5: one tap. Level 6: sets of two to four. Level 7: three to five things to do.
  for (const id of ['stories1', 'stories2', 'stories3', 'stories4', 'stories5']) assert.ok(built.get(id).every((it) => it.auto), id);
  const six = built.get('stories6');
  assert.ok(count(six, (it) => it.mode === 'pick' && it.expect[0].length >= 3) >= 8, 'stories6: sets of three or four');
  const seven = built.get('stories7');
  assert.ok(seven.every((it) => !it.auto));
  assert.ok(count(seven, (it) => it.expect.flat().length >= 4) >= 9, 'stories7: four or five things to do');
  assert.ok(count(seven, (it) => it.hide) >= 6 && count(seven, (it) => !it.hide) >= 6, 'stories7: some from memory, some not');
  // the answer of an ordered story is not simply "the order it was told in" every time
  assert.ok(count(seven, (it) => it.v === 'st-retell-back') >= 4);
});

test('stories: each kind of story keeps the promise of its level', () => {
  const named = (it, text) => it.scene.objects.filter((o) => new RegExp(`\\b${o.kind}s?\\b`, 'i').test(text));
  for (const it of [...shipped, ...own.flatMap((level) => draw(level, 'promise', 40))]) {
    const where = `${it.id} (${it.v}): ${it.say}`;
    const answer = it.scene.objects.filter((o) => it.expect.flat().includes(o.id));
    if (it.v.startsWith('st-detect')) {
      // work it out: the answer is never named
      assert.equal(named(it, it.say).filter((o) => answer.includes(o)).length, 0, where);
    } else if (it.v === 'st-not-in') {
      assert.deepEqual(named(it, it.say).length, it.scene.objects.length - 1, where);
      assert.equal(named(it, it.say).includes(answer[0]), false, where);
    } else if (['st-swap-what', 'st-swap-who', 'st-mixup', 'st-order-before', 'st-order-after', 'st-order-nth', 'st-order-between',
      'st-pass-who', 'st-why-lost', 'st-all-packed', 'st-all-came', 'st-all-left', 'st-retell-back', 'st-plan-visit'].includes(it.v)) {
      // every choice on screen is part of the story (a wrong tap is always a tempting one)
      assert.equal(named(it, it.say).length, it.scene.objects.length, where);
    } else {
      // at most one choice that the story never names
      assert.ok(named(it, it.say).length >= it.scene.objects.length - 1, where);
    }
    if (it.v.startsWith('st-move')) {
      // the thing that is moved is never shown, so it must not be drawn on one of the cards either
      const hidden = [...it.say.matchAll(/\b(?:hid|put) an? (\w+) (?:inside|under|behind)\b| and an? (\w+) (?:inside|under|behind)\b/g)].map((m) => m[1] || m[2]);
      assert.equal(hidden.length, it.v === 'st-move-two' ? 2 : 1, where);
      for (const k of hidden) {
        assert.ok(!it.scene.objects.some((o) => o.kind === k), `${where} - the ${k} is on screen`);
        for (const o of it.scene.objects) assert.ok(!(DRAWN_ON[o.kind] || []).includes(k), `${where} - the ${o.kind} card has a ${k} drawn on it`);
      }
    }
    if (/\bgolden\b/.test(it.say)) {
      // "golden" is a clue: the answer is yellow, and nothing else on screen is yellow or orange
      assert.equal(answer[0].color, 'yellow', where);
      assert.equal(it.scene.objects.filter((o) => o.color === 'yellow' || o.color === 'orange').length, 1, where);
    }
    // colour words are only spoken when the scene makes them matter
    for (const colour of new Set(it.say.match(/\b(red|blue|green|yellow|purple|orange)\b/g) || [])) {
      const twin = it.scene.objects.some((o) => o.color === colour && it.scene.objects.some((p) => p.kind === o.kind && p.color !== colour));
      assert.ok(twin, `${where} - "${colour}" is said, but nothing on screen has a look-alike in another colour`);
    }
  }
});

// --- the oracle itself: it must really read the story (and say so when a story is unfair) ----------------

const scene = (...kinds) => ({ cols: kinds.length, objects: kinds.map((k, i) => { const [color, kind] = k.includes(' ') ? k.split(' ') : ['red', k]; return { id: `o${i + 1}`, kind, color, size: 'big' }; }) });
const ask = (v, say, ...kinds) => solve({ id: 'hand', v, say, scene: scene(...kinds) });

test('stories oracle: changing the story changes the answer', () => {
  const swap = (who) => `Zip the robot found a red gem in the cave. Hoot the owl found a blue key. Then they swapped, just for fun. What does ${who} have now?`;
  const four = ['red gem', 'blue key', 'blue gem', 'red key'];
  assert.deepEqual(ask('st-swap-what', swap('Zip'), ...four), [['o2']]);
  assert.deepEqual(ask('st-swap-what', swap('Hoot'), ...four), [['o1']]);

  const order = (q) => `Zip the robot set up camp in the forest at sunset. First, he lit the torch. Next, he checked the map. Then he put up the flag. Finally, he played the drum. ${q}`;
  const camp = ['torch', 'map', 'flag', 'drum'];
  assert.deepEqual(ask('st-order-before', order('What did Zip do right before he put up the flag?'), ...camp), [['o2']]);
  assert.deepEqual(ask('st-order-after', order('What did Zip do right after he put up the flag?'), ...camp), [['o4']]);
  assert.deepEqual(ask('st-order-nth', order('What was the third thing Zip did?'), ...camp), [['o3']]);
  assert.deepEqual(ask('st-order-between', order('What did Zip do after he lit the torch but before he put up the flag?'), ...camp), [['o2']]);
  assert.throws(() => ask('st-order-between', order('What did Zip do after he lit the torch but before he played the drum?'), ...camp), /exactly one thing/);
  assert.throws(() => ask('st-order-before', order('What did Zip do right before he lit the torch?'), ...camp));

  const two = (what) => `Zip the robot put a coin under the hat and an egg behind the drum. Later, he moved the coin inside the chest. Then he moved the egg to the place where the coin was at the start. Where is the ${what} now?`;
  assert.deepEqual(ask('st-move-two', two('egg'), 'hat', 'drum', 'chest', 'bell'), [['o1']]);
  assert.deepEqual(ask('st-move-two', two('coin'), 'hat', 'drum', 'chest', 'bell'), [['o3']]);

  const pass = (end) => `Zip the robot found a map and gave it to Hoot the owl. Hoot did not need it, so she passed it on to Dash the fox. ${end} Who has the map now?`;
  const three = ['robot', 'owl', 'fox'];
  assert.deepEqual(ask('st-pass-who', pass('Dash kept it safe.'), ...three), [['o3']]);
  assert.deepEqual(ask('st-pass-who', pass('Dash took it back to the one who found it.'), ...three), [['o1']]);
  assert.deepEqual(ask('st-pass-who', pass('Dash did not want it either, so she gave it back to Hoot.'), ...three), [['o2']]);

  const lost = (first, second) => `Dash the fox set off for the old tower with a key, a map, a flag, and a bell. On the way, ${first}. Later, ${second}. In the end, Dash had to turn back. Why did Dash have to turn back?`;
  const trip = ['key', 'map', 'flag', 'bell'];
  assert.deepEqual(ask('st-why-lost', lost('the map fell in the mud, but she wiped it clean', 'a big bird flew off with the bell and never came back'), ...trip), [['o4']]);
  assert.deepEqual(ask('st-why-lost', lost('the map sank to the bottom of the river, and it was gone for good', 'the bell rolled down a hill, but she got it back'), ...trip), [['o2']]);
  assert.throws(() => ask('st-why-lost', lost('the map fell in the mud, but she wiped it clean', 'the bell rolled down a hill, but she got it back'), ...trip), /lost for good/);

  const back = (story) => `Zip the robot was getting ready for the big parade. ${story} Tap the four things in the order they really happened.`;
  const parade = ['bell', 'flag', 'drum', 'sword'];
  assert.deepEqual(ask('st-retell-back', back('He rang the bell. But before he did that, he waved the flag. After those two things, he banged the drum. Last of all, he polished the sword.'), ...parade), [['o2'], ['o1'], ['o3'], ['o4']]);
  assert.deepEqual(ask('st-retell-back', back('First, he rang the bell. Then he waved the flag. At the very end, he banged the drum. But just before the end, he polished the sword.'), ...parade), [['o1'], ['o2'], ['o4'], ['o3']]);
  assert.deepEqual(ask('st-retell-back', back('Before he rang the bell, he waved the flag. Last of all, he banged the drum. But right before that, he polished the sword.'), ...parade), [['o2'], ['o1'], ['o4'], ['o3']]);
  assert.throws(() => ask('st-retell-back', back('First, he rang the bell. Then he waved the flag. Next, he banged the drum. Finally, he polished the sword.'), ...parade), /no twist/);

  // the same story, read by the level-two rules, is in order
  assert.deepEqual(ask('st-order-before', `${back('First, he rang the bell. Then he waved the flag. Next, he banged the drum. Finally, he polished the sword.').replace(/ Tap .*$/, '')} What did Zip do right before he banged the drum?`, ...parade), [['o2']]);

  const visit = (change) => `Dash the fox had three friends to visit. She planned to see Zip the robot first, then Hoot the owl, and Boo the ghost last. ${change} Tap the friends in the order Dash really saw them.`;
  const friends = ['fox', 'robot', 'owl', 'ghost'];
  assert.deepEqual(ask('st-plan-visit', visit('But Zip was not home in the morning, so Dash went back and saw him last of all.'), ...friends), [['o3'], ['o4'], ['o2']]);
  assert.deepEqual(ask('st-plan-visit', visit('But on the way, Dash bumped into Boo, so Boo was the first one she saw.'), ...friends), [['o4'], ['o2'], ['o3']]);
  assert.deepEqual(ask('st-plan-visit', visit('But Hoot was fast asleep, so Dash skipped her and saw the other two.'), ...friends), [['o2'], ['o4']]);
  assert.deepEqual(ask('st-plan-visit', visit('But Dash started with the last friend, so she visited them the other way around.'), ...friends), [['o4'], ['o3'], ['o2']]);
  assert.throws(() => ask('st-plan-visit', visit('But then it rained, so Dash stayed home.'), ...friends), /unknown change/);

  const bag = (change) => `Puff the dragon packed a bag for a camping trip. He put in a map, a torch, and a red flag. Then he changed his mind. ${change} Just before he left, he added a key. Tap everything that is in the bag now.`;
  const things = ['map', 'torch', 'red flag', 'blue flag', 'key', 'drum'];
  assert.deepEqual(norm(ask('st-plan-bag', bag('He took out the red flag and put in a blue flag instead.'), ...things)), [['o1', 'o2', 'o4', 'o5']]);
  assert.deepEqual(norm(ask('st-plan-bag', bag('He took out the map and the torch.'), ...things)), [['o3', 'o5']]);
  assert.throws(() => ask('st-plan-bag', bag('He took out the drum and put in a blue flag instead.'), ...things), /never put in/);
});

test('stories oracle: a story told out of order must leave exactly one possible order', () => {
  // The oracle tries every order of the events against what each sentence says. These are tellings
  // that sound fine but that two or more orders fit - it must refuse every one of them.
  const back = (story) => `Zip the robot was getting ready for the big parade. ${story} Tap the four things in the order they really happened.`;
  const parade = ['bell', 'flag', 'drum', 'sword'];
  const refuses = (story, orders) => assert.throws(() => ask('st-retell-back', back(story), ...parade), new RegExp(`more than one order fits the story \\(${orders}\\)`), story);
  // the telling the reviewer caught: "only after" does not say WHEN the sword was polished
  refuses('Before he rang the bell, he waved the flag. Then he banged the drum, but only after he polished the sword.', 3);
  // "before" twice, with nothing pinned to the start or the end
  refuses('Before he rang the bell, he waved the flag. Before he banged the drum, he polished the sword.', 6);
  // "then" after a step back in time: later than the flag, but before or after the bell?
  refuses('He rang the bell. But before he did that, he waved the flag. Then he banged the drum. Last of all, he polished the sword.', 2);
  // a sentence the rules cannot place in time at all is refused, not guessed
  assert.throws(() => ask('st-retell-back', back('He rang the bell. Earlier, he waved the flag. Then he banged the drum. Last of all, he polished the sword.'), ...parade), /cannot tell when/);
  // sentences that contradict each other leave no order at all
  assert.throws(() => ask('st-retell-back', back('First, he rang the bell. Last of all, he waved the flag. Then he banged the drum. But before he did that, he polished the sword.'), ...parade), /no order fits/);
  assert.throws(() => ask('st-retell-back', back('First, he rang the bell while he waved the flag. Then he banged the drum. Last of all, he polished the sword.'), ...parade));

  // Every story with an order, shipped or freshly drawn: exactly one order fits (solve() insists on
  // it), it is the stored answer, and all three ways of telling a story backwards are in use.
  const ORDERED = ['st-order-before', 'st-order-after', 'st-order-nth', 'st-order-between', 'st-retell-4', 'st-retell-5', 'st-retell-back'];
  const tellings = new Set();
  let n = 0;
  for (const level of own.filter((l) => ['stories2', 'stories7'].includes(l.id))) {
    for (const it of [...built.get(level.id), ...draw(level, 'one-order', 240)].filter((x) => ORDERED.includes(x.v))) {
      const order = solve(it);
      if (it.v.startsWith('st-retell')) assert.deepEqual(order, it.expect, `${it.id} (${it.v}): ${it.say}`);
      if (it.v === 'st-retell-back') tellings.add(it.say.match(/[^.?!]+[.?!]/g).slice(1, -1).map((x) => x.trim().split(' ')[0].replace(/^She$/, 'He')).join(' / '));
      n++;
    }
  }
  assert.ok(n > 350, `only ${n} ordered stories`);
  assert.deepEqual([...tellings].sort(), ['Before / Last / But', 'First, / Then / At / But', 'He / But / After / Last']);
});

test('stories oracle: it refuses riddles and lists that are not fair', () => {
  const bell = 'Boo the ghost found something in the attic. It was made of metal, and it was much too big to wear on a finger. When he shook it, it went ding dong so loudly that the bats flew away. What did Boo find?';
  assert.deepEqual(ask('st-detect-thing', bell, 'ring', 'bell', 'drum', 'key'), [['o2']]);
  // two choices fit the clues
  assert.throws(() => ask('st-detect-thing', bell.replace('much too big to wear on a finger', 'kept behind a lock'), 'ring', 'bell', 'drum', 'key'), /exactly one choice/);
  // nothing on screen fits
  assert.throws(() => ask('st-detect-thing', bell, 'ring', 'star', 'drum', 'key'), /exactly one choice/);
  // the answer is said out loud
  assert.throws(() => ask('st-detect-thing', bell.replace('found something', 'found a bell'), 'ring', 'bell', 'drum', 'key'), /given away/);
  // a "who" riddle must be about a character
  assert.throws(() => ask('st-detect-who', bell, 'ring', 'bell', 'drum', 'key'));

  // "golden" must be something he can see: a yellow crown, and no other card that looks gold
  const king = 'The old king was sad, because nobody at the market knew who he was. So he went home and came back with something golden and shiny on his head. Now everybody bowed. What did the king put on?';
  assert.deepEqual(ask('st-detect-thing', king, 'blue hat', 'red ring', 'yellow crown', 'purple gem'), [['o3']]);
  assert.throws(() => ask('st-detect-thing', king, 'blue hat', 'yellow ring', 'orange crown', 'purple gem'), /look golden/);
  assert.throws(() => ask('st-detect-thing', king, 'yellow hat', 'red ring', 'purple crown', 'blue gem'), /look golden/);
  assert.throws(() => ask('st-detect-thing', king, 'orange hat', 'red ring', 'yellow crown', 'blue gem'), /look golden/);

  const attic = 'Zip the robot climbed up into the dusty attic. Behind the door, he saw a drum. On the floor lay a map and a flag. Hanging from the roof was a bell. He sneezed three times and climbed back down. Which one of these was not in the attic?';
  assert.deepEqual(ask('st-not-in', attic, 'drum', 'map', 'key', 'flag', 'bell'), [['o3']]);
  assert.throws(() => ask('st-not-in', attic, 'drum', 'map', 'key', 'star', 'bell'));

  const packed = 'Zip the robot packed a bag for a camping trip. He put in a map and a bell. He wanted a drum and a flag too, but there was no more room. At the last minute, he squeezed in a key. Tap everything Zip packed.';
  assert.deepEqual(norm(ask('st-all-packed', packed, 'map', 'bell', 'drum', 'flag', 'key')), [['o1', 'o2', 'o5']]);
  // a choice the story never mentions makes the list unfair
  assert.throws(() => ask('st-all-packed', packed, 'map', 'bell', 'drum', 'flag', 'key', 'star'));

  const party = 'There was a big party at the castle yesterday. Zip the robot danced for hours and hours. Hoot the owl was sick in bed and could not come. Boo the ghost wanted to come, but he had to work. Dash the fox brought a huge cake. Tap everyone who was at the party.';
  assert.deepEqual(norm(ask('st-all-came', party, 'robot', 'owl', 'ghost', 'fox')), [['o1', 'o4']]);
});

test('stories oracle: it is independent of the generators', () => {
  const source = readFileSync(join(HERE, 'oracles', 'tap-stories.mjs'), 'utf8');
  const code = source.split('\n').filter((line) => !/^\s*\/\//.test(line)).join('\n');
  assert.ok(!/tools\/content/.test(code), 'the oracle must not share code with the generators');
  assert.ok(!/\.expect\b/.test(code), 'the oracle must never look at the stored answer');
  assert.deepEqual([...code.matchAll(/^import .* from '(.+)';$/gm)].map((m) => m[1]), ['node:assert/strict']);
});
