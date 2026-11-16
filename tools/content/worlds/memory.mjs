// World "memory" - MEMORY MOUNTAIN: long instructions and working memory (activity type "tap").
//
// The ladder, one new difficulty per level:
//   1 three steps with colours      2 four steps                 3 three steps with colours, hidden
//   4 five steps                    5 backwards (2, 3, 4 things) 6 leave one out / how many times each
//   7 six steps, and three hidden steps with size AND colour     boss = mix of 5-7
//
// This world is about ORDER, so every sentence whose answer has an order says so in words
// ("then", "First ... Next ... Last", "After that", "backwards", "the opposite order"); the
// oracle insists on it.
//
// Drafts are finished by tools/content/lib.mjs (see the top of tools/content/levels.mjs).
// Every pattern name `v` has its own rule in tests/unit/oracles/tap-memory.mjs.

import { OBJECTS, CHARS, COLORS, SIZES, obj, pickKinds, pickColors } from '../lib.mjs';

const ANY = [...OBJECTS, ...CHARS];
const ORDINALS = ['first', 'second', 'third', 'fourth', 'fifth'];
const TIMES = { 1: 'once', 2: 'two times', 3: 'three times' };

const col = (rng) => rng.pick(COLORS);

// Never in one scene: "cat" and "hat" sound alike, and some pictures contain another thing
// (the knight holds a sword and a shield, the wizard wears a hat with a star on it, the ring
// carries a gem, the hat and the book are decorated with stars).
const NEVER_TOGETHER = [['cat', 'hat'], ['knight', 'sword'], ['knight', 'shield'], ['wizard', 'hat'], ['wizard', 'star'], ['ring', 'gem'], ['star', 'hat'], ['star', 'book']];

/** n different kinds that are fair to show together. */
function kinds(rng, n, from = ANY) {
  const ks = pickKinds(rng, n, { from });
  if (NEVER_TOGETHER.some(([a, b]) => ks.includes(a) && ks.includes(b))) throw new Error('kinds that should not share a scene: try again');
  return ks;
}
const things = (rng, n) => kinds(rng, n).map((k) => obj(k, col(rng)));

// --- how things are said -------------------------------------------------------------------
const plain = (o) => `the ${o.kind}`;
const hue = (o) => `the ${o.color} ${o.kind}`;
const exact = (o) => `the ${o.size} ${o.color} ${o.kind}`;
/** "the key and the gem" / "the key, the gem, and the star" - only where the order is given by another word ("backwards") */
const series = (p) => (p.length === 2 ? `${p[0]} and ${p[1]}` : `${p.slice(0, -1).join(', ')}, and ${p.at(-1)}`);
/** "the key, then the gem, then the star": the order is part of the instruction */
const inOrder = (p) => p.join(', then ');

const FORMS = {
  then: (p) => `Tap ${p.join(', then ')}.`,
  list: (p) => `Tap ${p.slice(0, -1).join(', ')}, and then ${p.at(-1)}.`,
  first: (p) => (p.length === 3
    ? `First, tap ${p[0]}. Then, ${p[1]}. Last, ${p[2]}.`
    : `First, tap ${p[0]}. Next, ${p[1]}. Then, ${p[2]}. Last, ${p[3]}.`),
  // said in two halves: a natural way to chunk a long list
  halves: (p) => {
    const h = Math.ceil(p.length / 2);
    return `Tap ${p.slice(0, h).join(', then ')}. After that, tap ${p.slice(h).join(', then ')}.`;
  },
};

/** An ordered chain: tap the targets in the order they are said. */
function chain(prefix, forms, i, targets, objects, say, s, extra = {}) {
  const form = forms[i % forms.length];
  return { say: FORMS[form](targets.map(say)), objects, expect: targets.map((o) => [o]), auto: false, s, v: `${prefix}-${form}`, ...extra };
}

/**
 * Three targets where BOTH words of "the red gem" are needed: every target has a twin of the
 * same kind in another colour, and its colour is also worn by a different kind (8 objects).
 */
function colourTrio(rng) {
  const [K1, K2, K3, K4, K5] = kinds(rng, 5);
  const [C1, C2, C3] = pickColors(rng, 3);
  const targets = [obj(K1, C1), obj(K2, C2), obj(K3, C3)];
  const objects = [...targets, obj(K1, C2), obj(K2, C3), obj(K3, C1), obj(K4, rng.pick([C1, C2, C3])), obj(K5, rng.pick([C1, C2, C3]))];
  return { targets: rng.shuffle(targets), objects };
}

/**
 * Two kinds x two colours x two sizes = 8 objects, so every one of the three words in
 * "the small blue key" is needed. Three of them are the targets (one more word per thing than
 * the hidden level before, not one more thing as well). The colours must be easy to tell
 * apart on a small picture found in a hurry: no torch or rocket (yellow flames), and never
 * orange against red or yellow.
 */
function detailCube(rng) {
  const [K1, K2] = kinds(rng, 2, OBJECTS.filter((k) => k !== 'torch' && k !== 'rocket'));
  const [C1, C2] = pickColors(rng, 2);
  if ([C1, C2].includes('orange') && (C1 === 'red' || C2 === 'red' || C1 === 'yellow' || C2 === 'yellow')) throw new Error('colours too close: try again');
  const objects = [K1, K2].flatMap((k) => [C1, C2].flatMap((c) => SIZES.map((sz) => obj(k, c, sz))));
  return { targets: rng.sample(objects, 3), objects };
}

export default {
  id: 'memory', name: 'Memory Summit', blurb: 'Long orders. Hold every step in your head.', color: '#9b6bff', speed: 0.92,
  levels: [
    {
      id: 'memory1', title: 'Three Colors', n: 18,
      tip: 'Welcome to Memory Summit! Three things to tap, and the colors matter. Tap them in the order I say. Then press the green check mark. Made a slip? The arrow takes it back.',
      gen(rng, i) {
        const { targets, objects } = colourTrio(rng);
        return chain('trio', ['then', 'first', 'list'], i, targets, objects, hue, ['steps3', 'detail']);
      },
    },
    {
      id: 'memory2', title: 'Four Steps', n: 18,
      tip: 'Four steps now. Here is a trick: count them on your fingers while I talk. Then tap one thing for each finger.',
      gen(rng, i) {
        const objects = things(rng, 8);
        return chain('quad', ['then', 'first', 'list'], i, objects.slice(0, 4), objects, plain, ['steps4']);
      },
    },
    {
      id: 'memory3', title: 'Three From Memory', n: 18, holdMs: 900,
      tip: 'Three steps with colors again. But now the cards are hidden while I talk. Listen first. Make a picture of each one in your mind. Then look.',
      gen(rng, i) {
        const { targets, objects } = colourTrio(rng);
        return chain('trio-hidden', ['then', 'list', 'first'], i, targets, objects, hue, ['steps3', 'detail', 'hidden'], { hide: true });
      },
    },
    {
      id: 'memory4', title: 'Five Steps', n: 18,
      tip: 'Five steps! Take a breath. Say the list back in your head, like a little song. Then tap them one at a time.',
      gen(rng, i) {
        const objects = things(rng, 8);
        return chain('five', ['then', 'halves', 'list'], i, objects.slice(0, 5), objects, plain, ['steps5']);
      },
    },
    {
      id: 'memory5', title: 'Backwards', n: 18,
      tip: 'Opposite order means backwards. If I say the key, the gem, and the star, you tap the star first, then the gem, then the key. Start with the last thing I said.',
      gen(rng, i) {
        const n = [2, 3, 3, 4, 3, 4][i % 6];
        const objects = things(rng, n + 3);
        const said = objects.slice(0, n);
        const lead = (i + Math.floor(i / 6)) % 2 ? 'Tap these backwards' : 'Tap these in the opposite order';
        return {
          say: `${lead}: ${series(said.map(plain))}.`, objects, expect: said.slice().reverse().map((o) => [o]), auto: false,
          s: ['reverse', `steps${n}`], v: `reverse-${n}`,
        };
      },
    },
    {
      id: 'memory6', title: 'Skip and Count', n: 18,
      tip: 'Two new tricks. If I say, skip the second one, leave out the second thing I said. And listen for how many times to tap each thing. Once, two times, or three times.',
      gen(rng, i) {
        const p = i % 4;
        if (p === 1) {
          const objects = things(rng, 6);
          const targets = objects.slice(0, 3);
          const counts = targets.map(() => rng.range(1, 3));
          if (new Set(counts).size === 1) throw new Error('same count three times: try again');
          return {
            say: `Tap ${inOrder(targets.map((o, j) => `${plain(o)} ${TIMES[counts[j]]}`))}.`, objects,
            expect: targets.map((o, j) => Array(counts[j]).fill(o)), auto: false, s: ['count', 'steps3'], v: 'count-each',
          };
        }
        const n = p === 3 ? 5 : 4;
        const objects = things(rng, n + 2);
        const said = objects.slice(0, n);
        const k = rng.int(n);
        const kept = said.filter((_, j) => j !== k);
        const verb = rng.pick(['skip', 'leave out']);
        const base = { objects, expect: kept.map((o) => [o]), auto: false };
        if (p === 2) return { ...base, say: `Tap ${inOrder(said.map(plain))}, but ${verb} ${plain(said[k])}.`, s: ['skip', 'steps3'], v: 'skip-named' };
        const which = k === n - 1 && rng.chance(0.5) ? 'last' : ORDINALS[k];
        return { ...base, say: `Tap ${inOrder(said.map(plain))}, but ${verb} the ${which} one.`, s: ['skip', 'ordinal', `steps${n - 1}`], v: 'skip-nth' };
      },
    },
    {
      id: 'memory7', title: 'The Summit', n: 18, holdMs: 900,
      tip: 'The top of the mountain! Six steps in a row. And sometimes three hidden things, with a size and a color for each one. Breathe, listen to the end, and picture them.',
      gen(rng, i) {
        if (i % 2) {
          const { targets, objects } = detailCube(rng);
          return chain('trio-detail-hidden', ['then', 'first'], (i - 1) / 2, targets, objects, exact, ['steps3', 'detail', 'hidden'], { hide: true });
        }
        const objects = things(rng, 9);
        return chain('six', ['list', 'halves', 'then'], i / 2, objects.slice(0, 6), objects, plain, ['steps6']);
      },
    },
    {
      id: 'memory-boss', title: 'Summit Boss', boss: true, mix: ['memory5', 'memory6', 'memory7'], holdMs: 900,
      tip: 'Summit boss! Backwards lists, skipping, counting, and six steps. Listen all the way to the end. Then go one step at a time.',
    },
  ],
};
