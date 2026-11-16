// World "stories" - STORY CAVE: longer, harder listening-comprehension stories (activity type "tap").
// He hears a story of three to six sentences and ONE question in a single clip, then answers by
// tapping the thing(s) or character(s) on screen.
//
// The ladder, one new difficulty per level:
//   1 who has what after a swap (colour AND thing matter)   2 what happened when (four events)
//   3 where it ended up after being moved twice             4 why: which thing caused it
//   5 detective: the answer is never named                  6 what was NOT in the story / everything on the list
//   7 retell four or five events in order (from memory, or told out of order) and plans that change      boss = mix of 5-7
//
// Drafts are finished by tools/content/lib.mjs (see the top of tools/content/levels.mjs).
// Every pattern name `v` has its own rule in tests/unit/oracles/tap-stories.mjs, which works the
// answer out again from the spoken text alone. Rules of thumb for anything added here:
//   - a thing that can be on screen is only ever named when it is really part of the story
//     (so no "the stars came out");
//   - no word that SOUNDS like a colour or like something that can be on screen: no "read" (red),
//     no "blew" (blue), no "rang" beside a ring, no "night" beside the knight, no "crow" beside a crown,
//     no "boat" beside a boot, no "dream" beside a drum, no "flat" beside a flag;
//   - two characters whose names sound alike never share a story (castOf);
//   - the question is always the last sentence; the clip stays under 420 characters;
//   - no colour words unless the colour is a clue; no possessive names (hard for the voice);
//   - when a story is told out of order, its sentences must leave exactly ONE possible order
//     (the oracle tries every order of the events against what each sentence says).

import { OBJECTS, obj, pickKinds, pickColors, plural, an, cap } from '../lib.mjs';

// The cast. In Story Cave each of them always has the same colour, so "Dash the fox" is the same
// orange fox in every story (colour is never a clue when the choices are characters).
const CAST = [
  { name: 'Zip', kind: 'robot', color: 'blue', he: 'he', him: 'him', his: 'his' },
  { name: 'Puff', kind: 'dragon', color: 'green', he: 'he', him: 'him', his: 'his' },
  { name: 'Zazz', kind: 'wizard', color: 'purple', he: 'he', him: 'him', his: 'his' },
  { name: 'Sir Clank', kind: 'knight', color: 'red', he: 'he', him: 'him', his: 'his' },
  { name: 'Pounce', kind: 'cat', color: 'yellow', he: 'she', him: 'her', his: 'her' },
  { name: 'Hoot', kind: 'owl', color: 'purple', he: 'she', him: 'her', his: 'her' },
  { name: 'Boo', kind: 'ghost', color: 'blue', he: 'he', him: 'him', his: 'his' },
  { name: 'Dash', kind: 'fox', color: 'orange', he: 'she', him: 'her', his: 'her' },
];
// Names that are too close by ear never meet in one story: he must not have to tell them apart.
const NAME_CLASH = [['Zip', 'Zazz'], ['Boo', 'Hoot']];
/** n different members of the cast whose names do not sound alike. */
function castOf(rng, n) {
  const cast = rng.sample(CAST, n);
  const has = (name) => cast.some((c) => c.name === name);
  if (NAME_CLASH.some(([x, y]) => has(x) && has(y))) throw new Error('names that sound alike: try again');
  return cast;
}
const full = (c) => `${c.name} the ${c.kind}`;
const a = (word) => `${an(word)} ${word}`; // "a key", "an egg", "an orange flag"
/** "a key and a gem" / "a key, a gem, and a star" */
const series = (p) => (p.length < 3 ? p.join(' and ') : `${p.slice(0, -1).join(', ')}, and ${p.at(-1)}`);
/** One thing of each kind, each in a different colour (colour is not a clue, it just keeps the picture clear). */
function things(rng, kinds, { avoid = [] } = {}) {
  const colours = pickColors(rng, kinds.length, { avoid });
  return kinds.map((k, i) => obj(k, colours[i]));
}
/** Members of the cast as things on screen. */
const faces = (cast) => cast.map((c) => obj(c.kind, c.color));
const single = (say, objects, target, s, v, extra = {}) => ({ t: 'tap', say, objects, expect: [[target]], auto: true, s, v, ...extra });
const several = (say, objects, expect, s, v, extra = {}) => ({ t: 'tap', say, objects, expect, auto: false, s, v, ...extra });

// ----------------------------------------------------------------------------- 1: who has what

const SPOTS = ['under the bridge', 'behind the castle', 'in the garden', 'on the beach', 'in the cave', 'by the river', 'on the hill', 'in the forest'];
const OUTINGS = ['a picnic by the lake', 'the village fair', 'a sleepover at the castle', 'the beach'];
const WATCHING = ['sat on a rock and watched', 'walked behind them, carrying nothing at all', 'waved at them from the top'];

function whoHasWhat(rng, i) {
  const s = ['story', 'detail'];
  switch (i % 4) {
    case 0: { // each finds a thing, they swap
      const [p, q] = castOf(rng, 2);
      const [K1, K2] = pickKinds(rng, 2);
      const [C1, C2] = pickColors(rng, 2);
      const x = obj(K1, C1);
      const y = obj(K2, C2);
      const why = rng.pick([
        `${p.name} liked the ${K2} better, and ${q.name} liked the ${K1} better, so they swapped.`,
        'Each of them wanted what the other one had, so they traded.',
        'Then they swapped, just for fun.',
      ]);
      const ask = rng.pick([p, q]);
      return single(`${full(p)} found ${a(C1)} ${K1} ${rng.pick(SPOTS)}. ${full(q)} found ${a(C2)} ${K2}. ${why} What does ${ask.name} have now?`,
        [x, y, obj(K1, C2), obj(K2, C1)], ask === p ? y : x, s, 'st-swap-what');
    }
    case 1: { // two carriers swap loads, a third only watches: who has it now?
      const cast = castOf(rng, 3);
      const [p, q, w] = cast;
      const [K1, K2] = pickKinds(rng, 2);
      const objects = faces(cast);
      const askFirst = rng.chance(0.5);
      return single(`${full(p)} was carrying ${a(K1)} up the hill. ${full(q)} was carrying ${a(K2)}. ${full(w)} ${rng.pick(WATCHING)}. Halfway up, ${p.name} and ${q.name} swapped. Who is carrying the ${askFirst ? K1 : K2} now?`,
        objects, objects[askFirst ? 1 : 0], ['story'], 'st-swap-who');
    }
    case 2: { // two of the same thing: one is given away, "the other" is kept
      const [p, q] = castOf(rng, 2);
      const [K, K2] = pickKinds(rng, 2);
      const [C1, C2, C3] = pickColors(rng, 3);
      const given = obj(K, C1);
      const kept = obj(K, C2);
      const ask = rng.pick([p, q]);
      const t = ask === p ? kept : given;
      return single(`${full(p)} had two ${plural(K)}, ${a(C1)} one and ${a(C2)} one. ${full(q)} had none. So ${p.name} gave ${q.name} the ${C1} one and kept the other. Which ${K} does ${ask.name} have now?`,
        [given, kept, obj(K, C3), obj(K2, t.color)], t, s, 'st-gave-kept');
    }
    default: { // each goes home with the other one's thing
      const [p, q] = castOf(rng, 2);
      const [K1, K2] = pickKinds(rng, 2);
      const [C1, C2] = pickColors(rng, 2);
      const x = obj(K1, C1);
      const y = obj(K2, C2);
      const ask = rng.pick([p, q]);
      return single(`${full(p)} and ${full(q)} went to ${rng.pick(OUTINGS)}. ${p.name} brought ${a(C1)} ${K1}, and ${q.name} brought ${a(C2)} ${K2}. When it was time to go home, they each picked up the wrong thing by mistake. What did ${ask.name} take home?`,
        [x, y, obj(K1, C2), obj(K2, C1)], ask === p ? y : x, s, 'st-mixup');
    }
  }
}

// ----------------------------------------------------------------------------- 2: what happened when

// A theme is a small job with many things to do, in any order. In an act, "@" stands for the
// thing with its article: "a coin" when the story tells it, "the coin" when the question asks.
// ("rang the bell" is only in the parade, which has no ring; the market has a ring, so its bell is jingled.)
const THEMES = [
  {
    setup: (c) => `${full(c)} was getting ready for the big parade.`,
    end: () => 'Then the parade began.',
    acts: { sword: 'polished the sword', crown: 'put on the crown', flag: 'waved the flag', bell: 'rang the bell', drum: 'banged the drum', boot: 'cleaned the muddy boot', shield: 'painted the shield', hat: 'brushed the hat' },
  },
  {
    setup: (c) => `${full(c)} put on a magic show for the whole village.`,
    end: () => 'The crowd clapped and cheered.',
    acts: { coin: 'made @ vanish', egg: 'made @ float', hat: 'pulled a rabbit out of @', ring: 'made @ spin in the air', potion: 'made @ bubble', star: 'made @ glow', key: 'bent @ in half', book: 'made @ fly' },
  },
  {
    setup: (c) => `It was cleaning day at the castle, and ${full(c)} had a lot to do.`,
    end: () => 'By dinner time, the castle was sparkling.',
    acts: { shield: 'scrubbed the shield', bell: 'polished the bell', map: 'folded the map', boot: 'washed the boot', chest: 'dusted the chest', drum: 'wiped the drum', crown: 'shined the crown', torch: 'put away the torch' },
  },
  {
    setup: (c) => `${full(c)} spent the morning at the village market.`,
    end: (c) => `Then ${c.he} walked home for lunch.`,
    acts: { mushroom: 'bought @', hat: 'tried on @', potion: 'sniffed @', bell: 'jingled @', map: 'looked at @', ring: 'tried on @', drum: 'tapped on @', egg: 'bought @', flag: 'waved @', book: 'flipped through @' },
  },
  {
    setup: (c) => `${full(c)} set up camp in the forest at sunset.`,
    end: (c) => `Then ${c.he} fell fast asleep by the fire.`,
    acts: { torch: 'lit the torch', map: 'checked the map', flag: 'put up the flag', chest: 'unpacked the chest', drum: 'played the drum', book: 'opened the book', mushroom: 'picked @', bell: 'hung up the bell', potion: 'sipped the potion' },
  },
];
const STEP_WORDS = [['First,', 'Then', 'After that,', 'Last of all,'], ['To start with,', 'Next,', 'Then', 'At the very end,'], ['First,', 'Next,', 'After that,', 'Finally,']];

const FIVE_STEP_WORDS = ['First,', 'Next,', 'Then', 'After that,', 'Last of all,'];

/** A character, a theme, and `n` things to do (plus `spare` more kinds from the same theme). */
function routine(rng, n, spare = 0) {
  const c = rng.pick(CAST);
  const theme = rng.pick(THEMES);
  const kinds = pickKinds(rng, n + spare, { from: Object.keys(theme.acts) });
  const told = (k) => theme.acts[k].replace('@', a(k)); // in the story
  const asked = (k) => theme.acts[k].replace('@', `the ${k}`); // in the question
  return { c, theme, kinds: kinds.slice(0, n), extra: kinds.slice(n), told, asked };
}

function whatHappenedWhen(rng, i) {
  const { c, theme, kinds, told, asked } = routine(rng, 4);
  const words = rng.pick(STEP_WORDS);
  const story = `${theme.setup(c)} ${kinds.map((k, n) => `${words[n]} ${c.he} ${told(k)}.`).join(' ')}`;
  const objects = things(rng, kinds);
  const s = ['story', 'order'];
  switch (i % 4) {
    case 0: {
      const n = rng.range(1, 3);
      return single(`${story} What did ${c.name} do right before ${c.he} ${asked(kinds[n])}?`, objects, objects[n - 1], s, 'st-order-before');
    }
    case 1: {
      const n = rng.range(0, 2);
      return single(`${story} What did ${c.name} do right after ${c.he} ${asked(kinds[n])}?`, objects, objects[n + 1], s, 'st-order-after');
    }
    case 2: {
      const n = rng.range(1, 2);
      return single(`${story} What was the ${['first', 'second', 'third'][n]} thing ${c.name} did?`, objects, objects[n], s, 'st-order-nth');
    }
    default: {
      const n = rng.range(0, 1);
      return single(`${story} What did ${c.name} do after ${c.he} ${asked(kinds[n])} but before ${c.he} ${asked(kinds[n + 2])}?`, objects, objects[n + 1], s, 'st-order-between');
    }
  }
}

// ----------------------------------------------------------------------------- 3: where did it go

const WHERE = {
  chest: 'inside the chest', boot: 'inside the boot', hat: 'under the hat', shield: 'behind the shield', drum: 'behind the drum', bell: 'under the bell',
  book: 'behind the book', crown: 'under the crown', rocket: 'inside the rocket', flag: 'under the flag', map: 'under the map',
};
// No star: the book and the hat have stars drawn on them, and the hidden thing is never shown.
const HIDEABLE = ['gem', 'key', 'coin', 'ring', 'egg'];
/** Things that must not be hidden in these places (the crown has a jewel drawn on it). */
const notHiddenIn = (places) => [...places, ...(places.includes('crown') ? ['gem'] : [])];
const WORRIES = ['A bird was watching', 'That did not feel safe enough', 'Then it started to rain', 'The wind began to blow', 'A mouse came sniffing around', 'Somebody walked by'];

function whereDidItGo(rng, i) {
  const s = ['story'];
  if (i % 4 === 3) { // handed from friend to friend
    const cast = castOf(rng, 3);
    const [p, q, r] = cast;
    const k = rng.pick(OBJECTS);
    const objects = faces(cast);
    const [ending, holder] = [
      [`${r.name} kept it safe.`, 2],
      [`${r.name} took it back to the one who found it.`, 0],
      [`${r.name} did not want it either, so ${r.he} gave it back to ${q.name}.`, 1],
    ][Math.floor(i / 4) % 3];
    return single(`${full(p)} found ${a(k)} and gave it to ${full(q)}. ${q.name} did not need it, so ${q.he} passed it on to ${full(r)}. ${ending} Who has the ${k} now?`,
      objects, objects[holder], s, 'st-pass-who');
  }
  const c = rng.pick(CAST);
  const places = pickKinds(rng, 4, { from: Object.keys(WHERE) });
  const [p1, p2, p3] = places;
  const objects = things(rng, places);
  const [w1, w2] = rng.sample(WORRIES, 2);
  switch (i % 4) {
    case 0: { // one thing, three hiding places
      const [k] = pickKinds(rng, 1, { from: HIDEABLE, avoid: notHiddenIn(places) });
      const [q, at] = [
        [`Where is the ${k} now?`, 2],
        [`Where did ${c.name} put the ${k} at the very start?`, 0],
        [`Where was the ${k} before the very last move?`, 1],
      ][Math.floor(i / 4) % 3];
      return single(`${full(c)} put ${a(k)} ${WHERE[p1]}. ${w1}, so ${c.he} moved it ${WHERE[p2]}. ${w2}, so ${c.he} moved it one more time, ${WHERE[p3]}. ${q}`,
        objects, objects[at], s, 'st-move-twice');
    }
    case 1: { // moved once, a third place only thought about, then back - or left alone
      const [k] = pickKinds(rng, 1, { from: HIDEABLE, avoid: notHiddenIn(places) });
      const back = Math.floor(i / 4) % 2 === 0;
      const ending = back ? `In the end, ${c.he} put it back where it was at the start.` : `In the end, ${c.he} left it right where it was.`;
      return single(`${full(c)} put ${a(k)} ${WHERE[p1]}. ${w1}, so ${c.he} moved it ${WHERE[p2]}. ${cap(c.he)} thought about putting it ${WHERE[p3]}, but ${c.he} did not. ${ending} Where is the ${k} now?`,
        objects, objects[back ? 0 : 1], s, 'st-move-back');
    }
    default: { // two things; the second goes where the first one used to be
      const [k1, k2] = pickKinds(rng, 2, { from: HIDEABLE, avoid: notHiddenIn(places) });
      const askFirst = rng.chance(0.5);
      return single(`${full(c)} put ${a(k1)} ${WHERE[p1]} and ${a(k2)} ${WHERE[p2]}. Later, ${c.he} moved the ${k1} ${WHERE[p3]}. Then ${c.he} moved the ${k2} to the place where the ${k1} was at the start. Where is the ${askFirst ? k1 : k2} now?`,
        objects, objects[askFirst ? 2 : 0], s, 'st-move-two');
    }
  }
}

// ----------------------------------------------------------------------------- 4: why did it happen

const TRIPS_TO = ['the mountain', 'the old tower', 'the windy lake', 'the dark forest', 'the snowy hills'];
const CARRIED = ['key', 'map', 'torch', 'coin', 'gem', 'ring', 'flag', 'hat', 'boot', 'book', 'potion', 'bell', 'star', 'egg', 'sword', 'shield'];
// a scare that ends well (always with "but") ...
const SAVED = [
  (k, c) => `the ${k} fell in the mud, but ${c.he} wiped it clean`,
  (k, c) => `the ${k} rolled down a hill, but ${c.he} got it back`,
  (k, c) => `${c.he} dropped the ${k} in a puddle, but ${c.he} fished it out`,
  (k, c) => `the wind carried the ${k} away, but ${c.he} found it in a bush`,
];
// ... and a loss that does not
const LOST = [
  (k) => `the ${k} fell down a deep well, and nobody could reach it`,
  (k) => `the ${k} sank to the bottom of the river, and it was gone for good`,
  (k) => `a big bird flew off with the ${k} and never came back`,
  (k, c) => `${c.he} left the ${k} on a rock and never found it again`,
];
const DULL = [(c) => `${c.he} put it away in a drawer`, (c) => `${c.he} just yawned`, (c) => `${c.he} said a quiet thank you`];
const JOY = [(c) => `${c.he} jumped for joy`, (c) => `${c.he} laughed out loud`, (c) => `${c.he} danced around the room`];
const IN_THE_HALL = ['potion', 'shield', 'sword', 'chest', 'bell', 'drum', 'torch', 'boot', 'book', 'rocket', 'flag', 'crown', 'egg', 'hat'];
const QUIET = [(k, c) => `${c.he} stepped over ${a(k)} without a sound`, (k, c) => `${c.he} slipped past ${a(k)} very quietly`, (k, c) => `${c.he} tiptoed around ${a(k)} as softly as a mouse`];
const LOUD = [(k, c) => `${c.he} bumped into ${a(k)}, and it fell over with a loud crash`, (k, c) => `${c.he} tripped over ${a(k)}, and it rolled away with a loud bang`];
const EVENTS = ['the royal feast', 'the village fair', 'the puppet show', 'the big race'];
const QUICK = [(k, c) => `${c.he} walked right past ${a(k)} without stopping`, (k, c) => `${c.he} looked at ${a(k)} for just one second`, (k, c) => `${c.he} hopped over ${a(k)} and kept going`];
const SLOW = [(k, c) => `${c.he} stopped to play with ${a(k)} for a whole hour`, (k, c) => `${c.he} sat down to look at ${a(k)} for a long, long time`];

/** Three clauses about three things; the one at position `at` is the special one. */
function oneOfThree(rng, kinds, c, at, plain, special) {
  const usual = rng.shuffle(plain);
  return kinds.map((k, n) => (n === at ? rng.pick(special)(k, c) : usual[n](k, c)));
}

function whyDidItHappen(rng, i) {
  const s = ['story', 'infer'];
  const c = rng.pick(CAST);
  const at = Math.floor(i / 4) % 3; // where in the story the cause is told
  switch (i % 4) {
    case 0: { // two things go missing; one comes back, the other is the reason
      const kinds = pickKinds(rng, 4, { from: CARRIED });
      const objects = things(rng, kinds);
      const [saved, lost] = rng.sample(objects, 2);
      const tell = [rng.pick(SAVED)(saved.kind, c), rng.pick(LOST)(lost.kind, c)];
      if (at % 2) tell.reverse();
      return single(`${full(c)} set off for ${rng.pick(TRIPS_TO)} with ${series(kinds.map(a))}. On the way, ${tell[0]}. Later, ${tell[1]}. In the end, ${c.name} had to turn back. Why did ${c.name} have to turn back?`,
        objects, lost, s, 'st-why-lost');
    }
    case 1: { // three presents, one that delights
      const [p, ...givers] = castOf(rng, 4);
      const kinds = pickKinds(rng, 4);
      const objects = things(rng, kinds);
      const how = oneOfThree(rng, kinds.slice(0, 3), p, at, DULL.map((f) => (k, x) => f(x)), JOY.map((f) => (k, x) => f(x)));
      const gifts = givers.map((g, n) => `${full(g)} gave ${p.him} ${a(kinds[n])}, and ${how[n]}.`).join(' ');
      const q = rng.pick([`What made ${p.name} so happy?`, `Which present made ${p.name} the happiest?`]);
      return single(`${full(p)} had a birthday party. ${gifts} ${q}`, objects, objects[at], s, 'st-why-glad');
    }
    case 2: { // creeping through the castle at night: one thing makes the noise
      const kinds = pickKinds(rng, 4, { from: IN_THE_HALL });
      const objects = things(rng, kinds);
      const [s1, s2, s3] = oneOfThree(rng, kinds.slice(0, 3), c, at, QUIET, LOUD);
      return single(`At midnight, the whole castle was asleep. ${full(c)} crept down the hall to find a snack. First, ${s1}. Then ${s2}. After that, ${s3}. Soon everyone was wide awake. Which thing woke everyone up?`,
        objects, objects[at], s, 'st-why-woke');
    }
    default: { // on the way to something: one thing holds him up
      const kinds = pickKinds(rng, 4);
      const objects = things(rng, kinds);
      const [s1, s2, s3] = oneOfThree(rng, kinds.slice(0, 3), c, at, QUICK, SLOW);
      return single(`${full(c)} was on ${c.his} way to ${rng.pick(EVENTS)}. ${cap(s1)}. Then ${s2}. After that, ${s3}. When ${c.he} got there at last, everyone had gone home. Why was ${c.name} so late?`,
        objects, objects[at], s, 'st-why-late');
    }
  }
}

// ----------------------------------------------------------------------------- 5: story detective

// [story and question, the answer, three tempting wrong choices]. The answer is never named: it has
// to be worked out from what the thing is made of, what it does, and what it is NOT.
// (The oracle has its own list of telling clues per thing and checks that the story points to
// exactly one of the four choices.)
const RIDDLES = [
  ['Boo the ghost found something in the attic. It was made of metal, and it was much too big to wear on a finger. When he shook it, it went ding dong so loudly that the bats flew away. What did Boo find?', 'bell', ['ring', 'drum', 'key']],
  ['Somebody took the pie from the kitchen window. There were feathers on the floor. The thief had flown away over the wall without a sound, long after dark. Who took the pie?', 'owl', ['dragon', 'cat', 'fox']],
  ['Sir Clank the knight stood in front of a locked gate. He pushed it, and he kicked it, but it would not open. Then a friend dropped something small and metal into his hand. He turned it in the lock, and the gate swung open. What did the friend bring?', 'key', ['coin', 'ring', 'sword']],
  ['Dash the fox walked into a cave. It was so dark that she could not see her own paws. Then a friend handed her a stick with a flame on top, and at last she could see the way. What did the friend give Dash?', 'torch', ['star', 'potion', 'map']],
  ['The snowman in the castle yard had melted. The grass around it was burned black. Up on the roof, someone with wide wings was trying hard not to sneeze again. Who melted the snowman?', 'dragon', ['owl', 'wizard', 'ghost']],
  ['Puff the dragon was lost in the hills. Every path looked the same. Then he remembered the folded paper in his bag. He opened it up, found the river and the bridge drawn on it, and knew which way to go. What did Puff look at?', 'map', ['book', 'flag', 'key']],
  ['The band was ready to march, but something was missing. Nobody was keeping the beat. Then Pounce the cat picked up two sticks and went boom, boom, boom. Now everyone could march in step. What was Pounce playing?', 'drum', ['bell', 'flag', 'boot']],
  ['The cookie jar was empty, but the kitchen door was still locked from the inside. Nobody had opened the window. The only one who can float straight through a wall was smiling. Who took the cookies?', 'ghost', ['cat', 'wizard', 'robot']],
  ['It rained all night, and the path was full of puddles. Zip the robot did not want rusty feet. So he pulled something tall and rubbery onto each foot and splashed all the way to school. What did Zip put on?', 'boot', ['hat', 'ring', 'crown']],
  ['Snowballs were flying across the castle yard. Sir Clank the knight did not want a cold, wet face. He picked up something big, wide and strong, and held it in front of him. Every snowball went splat against it. What was Sir Clank holding?', 'shield', ['sword', 'hat', 'flag']],
  ['Somebody tidied the whole workshop while everyone slept. There were drops of oil on the floor. A low beeping sound came from the corner, where someone was plugged into the wall to charge. Who tidied the workshop?', 'robot', ['knight', 'wizard', 'cat']],
  ['The old king was sad, because nobody at the market knew who he was. So he went home and came back with something golden and shiny on his head. Now everybody bowed. What did the king put on?', 'crown', ['hat', 'ring', 'gem']],
  ['Zip the robot wanted to visit the moon. Walking was no good, and even his friends with wings could not fly that high. So Zip built something tall with fire coming out of the bottom, climbed inside, and counted down from ten. What did Zip build?', 'rocket', ['torch', 'chest', 'star']],
  ['The milk jug was empty. There were small, muddy paw prints across the kitchen table. Under a chair, someone was licking her whiskers and purring. Who drank the milk?', 'cat', ['fox', 'owl', 'dragon']],
  ['Hoot the owl sat on her nest all week to keep something warm. It was smooth and round, and she had to be very gentle with it. On Sunday it cracked open, and a tiny beak poked out. What was Hoot sitting on?', 'egg', ['coin', 'gem', 'mushroom']],
  ['Zazz the wizard was so small that he could not reach his own door handle. So he mixed something fizzy in a bottle and drank it all in one gulp. In a blink, he was as tall as a tree. What did Zazz drink?', 'potion', ['mushroom', 'egg', 'book']],
  ['The hens were upset. Someone with a bushy tail and pointed ears had sneaked through a hole in the fence and run off into the woods. She did not purr, and she did not fly. Who scared the hens?', 'fox', ['cat', 'owl', 'dragon']],
  ['Pounce the cat could not sleep. So a friend sat beside her, opened something with lots of pages, and told her a story about a brave little mouse. Before the end, Pounce was snoring. What did the friend open?', 'book', ['map', 'chest', 'bell']],
];
const isCast = (k) => CAST.some((c) => c.kind === k);

function detective(rng, i) {
  const [say, answer, wrong] = RIDDLES[i % RIDDLES.length];
  const kinds = [answer, ...wrong];
  let objects;
  if (isCast(answer)) objects = faces(kinds.map((k) => CAST.find((c) => c.kind === k)));
  // "golden" is a clue: the crown is the yellow one, and nothing else looks gold
  else if (/\bgolden\b/.test(say)) objects = [obj(answer, 'yellow'), ...things(rng, wrong, { avoid: ['yellow', 'orange'] })];
  else objects = things(rng, kinds);
  return single(say, objects, objects[0], ['story', 'infer'], isCast(answer) ? 'st-detect-who' : 'st-detect-thing');
}

// ----------------------------------------------------------------------------- 6: in or out

// four things are told, five are shown (face-down while he listens)
const FOUR_THINGS = [
  (c, k) => `${full(c)} tidied up the playroom. ${cap(c.he)} put ${a(k[0])} on the shelf and ${a(k[1])} in the toy box. Under the bed, ${c.he} found ${a(k[2])} and ${a(k[3])}, both covered in dust. Then ${c.he} lay down for a rest. Which one of these was not in the story?`,
  (c, k) => `${full(c)} had a stall at the market. By lunch time, ${c.he} had sold ${a(k[0])} and ${a(k[1])}. A farmer bought ${a(k[2])}. At the end of the day, only ${a(k[3])} was left on the table. Which one of these was not in the story?`,
  (c, k) => `${full(c)} had a very silly dream. In the dream, ${a(k[0])} was chasing ${a(k[1])} around the castle. ${cap(a(k[2]))} was singing a song, and ${a(k[3])} was dancing on the table. Then ${c.he} woke up. Which one of these was not in the dream?`,
  (c, k) => `${full(c)} climbed up into the dusty attic. Behind the door, ${c.he} saw ${a(k[0])}. On the floor lay ${a(k[1])} and ${a(k[2])}. Hanging from the roof was ${a(k[3])}. ${cap(c.he)} sneezed three times and climbed back down. Which one of these was not in the attic?`,
];
const DREAM = 2; // the place of the dream story in FOUR_THINGS
const BAG_TRIPS = ['a camping trip', 'a trip to the beach', 'a long train ride', 'a night at the castle'];
const IN_A_BAG = OBJECTS.filter((k) => k !== 'chest' && k !== 'rocket'); // things that fit in a bag
// packing: every sentence with "but" is about things that did NOT go in the bag
const PACKING = [
  (c, p, r) => `${cap(c.he)} put in ${a(p[0])} and ${a(p[1])}. ${cap(c.he)} wanted ${a(r[0])} and ${a(r[1])} too, but there was no more room. At the last minute, ${c.he} squeezed in ${series(p.slice(2).map(a))}.`,
  (c, p, r) => `${cap(c.he)} picked up ${a(r[0])}, but then ${c.he} put it down again. So ${c.he} put in ${a(p[0])} and ${a(p[1])}. ${cap(c.he)} also packed ${series(p.slice(2).map(a))}. ${cap(c.he)} looked at ${a(r[1])}, but ${c.he} left it on the bed.`,
  (c, p, r) => `First, ${c.he} packed ${a(p[0])}. ${cap(c.he)} wanted ${a(r[0])} and ${a(r[1])} as well, but they would not fit. Then ${c.he} added ${series(p.slice(1).map(a))}.`,
];
const CAME = [(c) => `${full(c)} came early and helped with the food`, (c) => `${full(c)} danced for hours and hours`, (c) => `${full(c)} brought a huge cake`, (c) => `${full(c)} arrived late and stayed to the end`, (c) => `${full(c)} played music for everyone`];
const STAYED_AWAY = [(c) => `${full(c)} was sick in bed and could not come`, (c) => `${full(c)} got lost and never got there`, (c) => `${full(c)} forgot all about it and stayed home`, (c) => `${full(c)} wanted to come, but ${c.he} had to work`];
// moving house: three things go on the cart, three do not
const MOVING = [
  (c, t, l) => `${cap(c.he)} loaded ${a(t[0])} and ${a(t[1])} onto the cart. There was no room for ${c.his} ${l[0]} or ${c.his} ${l[1]}, so they stayed behind. ${cap(c.he)} took ${a(t[2])} as well. In the rush, ${c.he} forgot all about ${c.his} ${l[2]}.`,
  (c, t, l) => `In the rush, ${c.he} forgot all about ${c.his} ${l[0]}. ${cap(c.he)} loaded ${series(t.map(a))} onto the cart. There was no room for ${c.his} ${l[1]} or ${c.his} ${l[2]}, so they stayed behind.`,
  (c, t, l) => `${cap(c.he)} loaded ${a(t[0])} onto the cart. There was no room for ${c.his} ${l[0]}, so it stayed behind. In the rush, ${c.he} forgot all about ${c.his} ${l[1]} and ${c.his} ${l[2]}. ${cap(c.he)} did take ${a(t[1])} and ${a(t[2])}.`,
];

function inOrOut(rng, i) {
  const c = rng.pick(CAST);
  const turn = Math.floor(i / 4);
  switch (i % 4) {
    case 0: { // which one was NOT in the story
      const which = turn % FOUR_THINGS.length;
      const kinds = pickKinds(rng, 5, { avoid: which === DREAM ? ['drum'] : [] }); // "dream" and "drum" are too close by ear
      const objects = things(rng, kinds);
      return single(FOUR_THINGS[which](c, kinds), objects, objects[4], ['story', 'not', 'hidden'], 'st-not-in', { hide: true });
    }
    case 1: { // everything that went into the bag
      const n = 3 + (turn % 2);
      const kinds = pickKinds(rng, n + 2, { from: IN_A_BAG });
      const objects = things(rng, kinds);
      const story = PACKING[turn % PACKING.length](c, kinds.slice(0, n), kinds.slice(n));
      return several(`${full(c)} packed a bag for ${rng.pick(BAG_TRIPS)}. ${story} Tap everything ${c.name} packed.`,
        objects, [objects.slice(0, n)], ['story', 'all'], 'st-all-packed', { mode: 'pick' });
    }
    case 2: { // everyone who was really there
      const cast = castOf(rng, 5);
      const n = 2 + (turn % 3);
      const objects = faces(cast);
      const came = rng.sample(CAME, n).map((f, k) => [f(cast[k]), k]);
      const away = rng.sample(STAYED_AWAY, 5 - n).map((f, k) => [f(cast[n + k]), n + k]);
      const told = rng.shuffle([...came, ...away]);
      return several(`There was a big party at the castle yesterday. ${told.map(([text]) => `${text}.`).join(' ')} Tap everyone who was at the party.`,
        objects, [objects.slice(0, n)], ['story', 'all', 'not'], 'st-all-came', { mode: 'pick' });
    }
    default: { // everything that was left behind
      const kinds = pickKinds(rng, 6);
      const objects = things(rng, kinds);
      const story = MOVING[turn % MOVING.length](c, kinds.slice(0, 3), kinds.slice(3));
      return several(`${full(c)} moved to a new home across the river. ${story} Tap everything ${c.name} left behind.`,
        objects, [objects.slice(3)], ['story', 'all', 'not'], 'st-all-left', { mode: 'pick' });
    }
  }
}

// ----------------------------------------------------------------------------- 7: tell it back

function tellItBack(rng, i) {
  const turn = Math.floor(i / 4);
  switch (i % 4) {
    case 0: { // four or five events, told in order, answered from memory
      const n = 4 + (turn % 2);
      const { c, theme, kinds, extra, told } = routine(rng, n, 1);
      const words = n === 5 ? FIVE_STEP_WORDS : rng.pick(STEP_WORDS);
      const objects = things(rng, [...kinds, ...extra]);
      return several(`${theme.setup(c)} ${kinds.map((k, at) => `${words[at]} ${c.he} ${told(k)}.`).join(' ')} ${theme.end(c)} Tap the ${n === 5 ? 'five' : 'four'} things in the order they happened.`,
        objects, objects.slice(0, n).map((o) => [o]), ['story', 'order', 'hidden'], n === 5 ? 'st-retell-5' : 'st-retell-4', { hide: true });
    }
    case 1: { // four events, NOT told in the order they happened (each telling leaves exactly one possible order)
      const { c, theme, kinds, told } = routine(rng, 4);
      const [e1, e2, e3, e4] = kinds.map(told);
      const story = [
        `${cap(c.he)} ${e2}. But before ${c.he} did that, ${c.he} ${e1}. After those two things, ${c.he} ${e3}. Last of all, ${c.he} ${e4}.`,
        `First, ${c.he} ${e1}. Then ${c.he} ${e2}. At the very end, ${c.he} ${e4}. But just before the end, ${c.he} ${e3}.`,
        `Before ${c.he} ${e2}, ${c.he} ${e1}. Last of all, ${c.he} ${e4}. But right before that, ${c.he} ${e3}.`,
      ][turn % 3];
      const objects = things(rng, kinds);
      return several(`${theme.setup(c)} ${story} Tap the four things in the order they really happened.`,
        objects, objects.map((o) => [o]), ['story', 'order'], 'st-retell-back');
    }
    case 2: { // a plan for three visits, and then the plan changes
      const cast = castOf(rng, 4);
      const [c, p, q, r] = cast;
      const objects = faces(cast);
      const [, P, Q, R] = objects;
      const [change, order] = [
        [`But ${p.name} was not home in the morning, so ${c.name} went back and saw ${p.him} last of all.`, [Q, R, P]],
        [`But on the way, ${c.name} bumped into ${r.name}, so ${r.name} was the first one ${c.he} saw.`, [R, P, Q]],
        [`But ${q.name} was fast asleep, so ${c.name} skipped ${q.him} and saw the other two.`, [P, R]],
        [`But ${c.name} started with the last friend, so ${c.he} visited them the other way around.`, [R, Q, P]],
      ][turn % 4];
      return several(`${full(c)} had three friends to visit. ${cap(c.he)} planned to see ${full(p)} first, then ${full(q)}, and ${full(r)} last. ${change} Tap the friends in the order ${c.name} really saw them.`,
        objects, order.map((o) => [o]), ['story', 'order', 'steps3', 'hidden'], 'st-plan-visit', { hide: true });
    }
    default: { // a bag is packed, and then re-packed
      const c = rng.pick(CAST);
      const lead = `${full(c)} packed a bag for ${rng.pick(BAG_TRIPS)}.`;
      const last = 'Tap everything that is in the bag now.';
      if (turn % 2 === 0) { // one thing is swapped for another - sometimes the same thing in another colour
        const [k1, k2, k3, kx, ky, spare] = pickKinds(rng, 6, { from: IN_A_BAG });
        const [C1, C2] = pickColors(rng, 2);
        const sameKind = turn % 4 === 0;
        const out = obj(kx, C1);
        const into = sameKind ? obj(kx, C2) : obj(ky, C2);
        const name = (o) => (sameKind ? `${o.color} ${o.kind}` : o.kind);
        const [o1, o2, o3, o6] = things(rng, [k1, k2, k3, spare], { avoid: [C1, C2] });
        return several(`${lead} ${cap(c.he)} put in ${series([a(k1), a(k2), a(name(out))])}. Then ${c.he} changed ${c.his} mind. ${cap(c.he)} took out the ${name(out)} and put in ${a(name(into))} instead. Just before ${c.he} left, ${c.he} added ${a(k3)}. ${last}`,
          [o1, o2, out, into, o3, o6], [[o1, o2, into, o3]], ['story', 'all', 'detail'], 'st-plan-bag', { mode: 'pick' });
      }
      // two things come out again, one more goes in
      const kinds = pickKinds(rng, 6, { from: IN_A_BAG });
      const objects = things(rng, kinds);
      const [k1, k2, k3, k4, k5] = kinds;
      return several(`${lead} ${cap(c.he)} put in ${series([k1, k2, k3, k4].map(a))}. Then ${c.he} changed ${c.his} mind. ${cap(c.he)} took out the ${k2} and the ${k4}. Just before ${c.he} left, ${c.he} added ${a(k5)}. ${last}`,
        objects, [[objects[0], objects[2], objects[4]]], ['story', 'all'], 'st-plan-bag', { mode: 'pick' });
    }
  }
}

// ----------------------------------------------------------------------------- the world

export default {
  id: 'stories', name: 'Story Island', blurb: 'Long stories. Who, when, where, and why.', color: '#c2713a', speed: 0.95,
  levels: [
    { id: 'stories1', title: 'Who Has What', n: 18, gen: whoHasWhat,
      tip: 'Welcome to Story Island! Listen to the whole story. Keep track of who has what, because things get swapped. Then tap the answer to my question.' },
    { id: 'stories2', title: 'What Happened When', n: 18, gen: whatHappenedWhen,
      tip: 'Now listen for the order things happen in. I will ask what came right before, or right after. Tap the thing from that part of the story.' },
    { id: 'stories3', title: 'Where Did It Go', n: 18, gen: whereDidItGo,
      tip: 'In these stories, things get moved around. Follow every move, like a movie in your mind. Then tap where the thing is, or who has it.' },
    { id: 'stories4', title: 'Why Did It Happen', n: 18, gen: whyDidItHappen,
      tip: 'Now I will ask why something happened. Many things are in the story, but only one of them caused it. Tap the thing that made it happen.' },
    { id: 'stories5', title: 'Story Detective', n: RIDDLES.length, gen: detective,
      tip: 'Be a detective. I will never say the name of the answer. Listen to every clue, and rule out what does not fit. Then tap what it must be.' },
    { id: 'stories6', title: 'In or Out', n: 18, gen: inOrOut,
      tip: 'Sometimes the cards are hidden while I talk. Then tap the one thing that was not in the story. Other times, tap only the ones that fit my question, not the rest, and press the green check mark.' },
    { id: 'stories7', title: 'Tell It Back', n: 18, gen: tellItBack,
      tip: 'The hardest stories. Tap the things in the order they really happened. Then press the green check mark. The arrow takes back a slip. Listen to the very end. Plans can change!' },
    { id: 'stories-boss', title: 'Story Boss', boss: true, mix: ['stories5', 'stories6', 'stories7'],
      tip: 'Story Boss! Clues, lists, and stories told out of order. Make a movie in your mind, and listen all the way to the end.' },
  ],
};
