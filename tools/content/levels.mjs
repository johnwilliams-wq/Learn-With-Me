// The curriculum: worlds -> levels -> an item generator for each level.
//
// The ladder follows the way speech-language therapists usually grade "following
// directions" work: one new difficulty at a time, in this order -
//   1 step, more detail words  ->  2 steps  ->  concept words (not / all / except / where)
//   ->  time-order words (first, then, after, before - including "said backwards")
//   ->  waiting and "if" (only act when the instruction really applies)
//   ->  3 and 4 steps, from memory  ->  short stories (recall, order, working it out).
//
// Every generator returns a DRAFT: { say, objects, expect, ...flags }.
//   say      the exact sentence that is spoken
//   objects  what is on screen (references; lib.finish() shuffles them and assigns ids)
//   expect   ordered groups of object references that must be tapped ([] = do nothing)
//   auto     true = the answer is checked on the first tap (single-tap items)
//   mode     'pick' = choose a set (tick marks, tap again to un-pick); default = ordered taps
//   hide     true = the objects are face-down while the voice is talking
//   s        skill tags (see src/listening/insights.js)      v  sentence pattern name
//   g        group used by a level's `quota` (e.g. how many "do nothing" turns per mission)

import { OBJECTS, CHARS, COLORS, SIZES, obj, pickKinds, pickColors, plural, an, other, cap } from './lib.mjs';

const col = (rng) => rng.pick(COLORS);

/** n different things, any colours. */
function things(rng, n, opts) {
  return pickKinds(rng, n, opts).map((k) => obj(k, col(rng)));
}

/** Target plus foils so that BOTH the colour word and the thing word are needed (6 objects). */
function colourAndKind(rng) {
  const [K, K2, K3, K4] = pickKinds(rng, 4);
  const [C, C2, C3, C4] = pickColors(rng, 4);
  const t = obj(K, C);
  return { t, objects: [t, obj(K, C2), obj(K, C3), obj(K2, C), obj(K3, C), obj(K4, C4)] };
}

/** Lighter version for the Captain levels (5 objects). */
function captainScene(rng) {
  const [K, K2, K3, K4] = pickKinds(rng, 4);
  const [C, C2] = pickColors(rng, 2);
  const t = obj(K, C);
  return { t, objects: [t, obj(K, C2), obj(K2, C), obj(K3, col(rng)), obj(K4, col(rng))] };
}

/** Two targets, each with a same-thing-different-colour foil (6 objects). */
function twoColourScene(rng) {
  const [K1, K2, K3, K4] = pickKinds(rng, 4);
  const [C1, C1b] = pickColors(rng, 2);
  const [C2, C2b] = pickColors(rng, 2);
  const a = obj(K1, C1);
  const b = obj(K2, C2);
  return { a, b, objects: [a, b, obj(K1, C1b), obj(K2, C2b), obj(K3, col(rng)), obj(K4, col(rng))] };
}

const single = (say, objects, t, s, v, extra = {}) => ({ say, objects, expect: [[t]], auto: true, s, v, ...extra });

// Lead-in sentences for "the important part comes at the end". None of them names
// anything that can appear on screen, so they cannot be mistaken for the instruction.
const LEAD_INS = [
  'The castle is very quiet today.',
  'Blip just woke up from a long nap.',
  'It is a sunny day at camp.',
  'The heroes are getting ready for an adventure.',
  'Wow, what a windy morning.',
  'Blip ate pancakes for breakfast.',
  'A little bird is singing outside.',
  'The camp fire is warm and cozy.',
  'Everybody is waiting for you.',
  'It rained all night long.',
  'Blip polished his antenna today.',
  'The mountain path is very long.',
];

// ----------------------------------------------------------------------------- world 1

const w1 = {
  id: 'w1', name: 'Rookie Camp', blurb: 'One thing at a time. Listen for every clue.', speed: 0.88,
  levels: [
    {
      id: 'w1l1', title: 'Name It', n: 30,
      tip: 'Welcome to Rookie Camp! Here is how it works. Tap the ear when you are ready to listen. Wait until I finish talking. Then tap what I said.',
      gen(rng, i) {
        const all = [...OBJECTS, ...CHARS];
        const target = all[i % all.length];
        const objects = [target, ...pickKinds(rng, 2, { from: CHARS.includes(target) ? CHARS : OBJECTS, avoid: [target] })].map((k) => obj(k, col(rng)));
        return single(`Tap the ${target}.`, objects, objects[0], ['name'], 'name');
      },
    },
    {
      id: 'w1l2', title: 'Color It', n: 24,
      tip: 'Now listen for the color. Some of them look the same, so the color tells you which one.',
      gen(rng) {
        const [K, K2] = pickKinds(rng, 2);
        const [C, C2, C3, C4] = pickColors(rng, 4);
        const t = obj(K, C);
        return single(`Tap the ${C} ${K}.`, [t, obj(K, C2), obj(K, C3), obj(K2, C4)], t, ['detail'], 'colour');
      },
    },
    {
      id: 'w1l3', title: 'Big or Small', n: 24,
      tip: 'This time, listen for big or small.',
      gen(rng) {
        const [K, K2, K3] = pickKinds(rng, 3);
        const S = rng.pick(SIZES);
        const C = col(rng);
        const t = obj(K, C, S);
        return single(`Tap the ${S} ${K}.`, [t, obj(K, C, other(S)), obj(K2, col(rng), S), obj(K3, col(rng), other(S))], t, ['detail'], 'size');
      },
    },
    {
      id: 'w1l4', title: 'Two Clues', n: 24,
      tip: 'Two clues now: the color, and the thing. You need both.',
      gen(rng, i) {
        const { t, objects } = colourAndKind(rng);
        const say = i % 3 === 2 ? `Find the ${t.color} ${t.kind} and tap it.` : `Tap the ${t.color} ${t.kind}.`;
        return single(say, objects, t, ['detail'], 'colour-kind');
      },
    },
    {
      id: 'w1l5', title: 'Three Clues', n: 24,
      tip: 'Three clues! The size, the color, and the thing. Here is a trick: say it back in your head.',
      gen(rng) {
        const [K, K2, K3] = pickKinds(rng, 3);
        const [C, C2, C3] = pickColors(rng, 3);
        const S = rng.pick(SIZES);
        const S2 = other(S);
        const t = obj(K, C, S);
        const objects = [t, obj(K, C, S2), obj(K, C2, S), obj(K, C2, S2), obj(K2, C, S), obj(K2, C, S2), obj(K2, C2, S), obj(K3, C3, S2)];
        return single(`Tap the ${S} ${C} ${K}.`, objects, t, ['detail'], 'size-colour-kind');
      },
    },
    {
      id: 'w1l6', title: 'Wait For It', n: 24,
      tip: 'Sometimes the important part comes at the very end. Keep listening until I stop talking.',
      gen(rng, i) {
        if (i % 2 === 0) {
          const { t, objects } = colourAndKind(rng);
          return single(`${LEAD_INS[(i / 2) % LEAD_INS.length]} Now, tap the ${t.color} ${t.kind}.`, objects, t, ['end', 'detail'], 'lead-in');
        }
        const [K, K2, K3] = pickKinds(rng, 3);
        if (i % 4 === 1) {
          const [C, C2, C3] = pickColors(rng, 3);
          const t = obj(K, C);
          return single(`Tap the ${K}. The ${C} one.`, [t, obj(K, C2), obj(K, C3), obj(K2, C), obj(K3, col(rng))], t, ['end', 'detail'], 'trailing-colour');
        }
        const S = rng.pick(SIZES);
        const C = col(rng);
        const t = obj(K, C, S);
        return single(`Tap the ${K}. The ${S} one.`, [t, obj(K, C, other(S)), obj(K2, col(rng), S), obj(K3, col(rng), other(S))], t, ['end', 'detail'], 'trailing-size');
      },
    },
    { id: 'w1l7', title: 'Camp Challenge', boss: true, mix: ['w1l2', 'w1l3', 'w1l4', 'w1l5', 'w1l6'], tip: 'Camp challenge! A mix of everything you have learned so far.' },
  ],
};

// ----------------------------------------------------------------------------- world 2

const w2 = {
  id: 'w2', name: 'Two-Step Trail', blurb: 'Two things to do, in the right order.', speed: 0.9,
  levels: [
    {
      id: 'w2l1', title: 'This, Then That', n: 24,
      tip: 'Two things to do now. Tap them in the order I say. Then press the green check mark. Made a slip? The arrow takes it back.',
      gen(rng, i) {
        const objects = things(rng, 4);
        const [a, b] = objects;
        const say = i % 2 ? `Tap the ${a.kind}. Then tap the ${b.kind}.` : `Tap the ${a.kind}, then tap the ${b.kind}.`;
        return { say, objects, expect: [[a], [b]], auto: false, s: ['steps2'], v: 'two' };
      },
    },
    {
      id: 'w2l2', title: 'Two Colors', n: 24,
      tip: 'Two steps, with colors. Here is a trick: make a picture of each one in your mind.',
      gen(rng) {
        const { a, b, objects } = twoColourScene(rng);
        return { say: `Tap the ${a.color} ${a.kind}, then the ${b.color} ${b.kind}.`, objects, expect: [[a], [b]], auto: false, s: ['steps2', 'detail'], v: 'two-colour' };
      },
    },
    {
      id: 'w2l3', title: 'How Many', n: 24,
      tip: 'Listen for how many times.',
      gen(rng, i) {
        const objects = things(rng, 4);
        const [a, b] = objects;
        const base = { objects, auto: false };
        switch (i % 4) {
          case 0: return { ...base, say: `Tap the ${a.kind} two times.`, expect: [[a, a]], s: ['count'], v: 'count-2' };
          case 1: return { ...base, say: `Tap the ${a.kind} three times.`, expect: [[a, a, a]], s: ['count'], v: 'count-3' };
          case 2: return { ...base, say: `Tap the ${a.kind} two times, then tap the ${b.kind}.`, expect: [[a, a], [b]], s: ['count', 'steps2'], v: 'count-then' };
          default: return { ...base, say: `Tap the ${a.kind}, then tap the ${b.kind} two times.`, expect: [[a], [b, b]], s: ['count', 'steps2'], v: 'then-count' };
        }
      },
    },
    {
      id: 'w2l4', title: 'Listen, Then Look', n: 24, holdMs: 700,
      tip: 'This time the cards are hidden while I talk. Listen first, hold it in your head, then look.',
      gen(rng) {
        const { t, objects } = colourAndKind(rng);
        return single(`Tap the ${t.color} ${t.kind}.`, objects, t, ['hidden', 'detail'], 'hidden-one', { hide: true });
      },
    },
    {
      id: 'w2l5', title: 'Memory Trail', n: 24, holdMs: 700,
      tip: 'Two steps, and the cards are hidden. Say them back in your head while you wait.',
      gen(rng, i) {
        if (i % 2 === 0) {
          const objects = things(rng, 5);
          const [a, b] = objects;
          return { say: `Tap the ${a.kind}, then the ${b.kind}.`, objects, expect: [[a], [b]], auto: false, hide: true, s: ['hidden', 'steps2'], v: 'hidden-two' };
        }
        const { a, b, objects } = twoColourScene(rng);
        return { say: `Tap the ${a.color} ${a.kind}, then the ${b.color} ${b.kind}.`, objects, expect: [[a], [b]], auto: false, hide: true, s: ['hidden', 'steps2', 'detail'], v: 'hidden-two-colour' };
      },
    },
    { id: 'w2l6', title: 'Trail Boss', boss: true, mix: ['w2l1', 'w2l2', 'w2l3', 'w2l4', 'w2l5'], holdMs: 700, tip: 'Trail boss! Two steps, counting, and hidden cards, all mixed up.' },
  ],
};

// ----------------------------------------------------------------------------- world 3

const pick = { mode: 'pick', auto: false };

const w3 = {
  id: 'w3', name: 'Word Woods', blurb: 'Tricky words: not, all, except, next to.', speed: 0.92,
  levels: [
    {
      id: 'w3l1', title: 'Not That One', n: 24,
      tip: 'Tricky word alert: NOT. Listen for the one I do not want.',
      gen(rng, i) {
        if (i % 3 === 2) {
          const [K, K2, K3] = pickKinds(rng, 3);
          const [C, C2] = pickColors(rng, 2);
          const t = obj(K2, C);
          return single(`Tap the ${C} one that is not ${an(K)} ${K}.`, [t, obj(K, C), obj(K, C2), obj(K3, C2)], t, ['not', 'detail'], 'not-kind');
        }
        const [K, K2, K3] = pickKinds(rng, 3);
        const [C, D, E] = pickColors(rng, 3);
        const t = obj(K, D);
        const objects = [t, obj(K, C), obj(K2, C), obj(K3, E)];
        if (i % 3 === 1) objects.push(obj(K, C));
        return single(`Tap the ${K} that is not ${C}.`, objects, t, ['not'], 'not-colour');
      },
    },
    {
      id: 'w3l2', title: 'All of Them', n: 24, maxSame: 2,
      tip: 'When I say ALL, tap every one that fits. Then press the green check mark.',
      gen(rng, i) {
        switch (i % 4) {
          case 0: {
            const [K, ...rest] = pickKinds(rng, 4);
            const ts = pickColors(rng, rng.range(2, 3)).map((c) => obj(K, c));
            return { say: `Tap all the ${plural(K)}.`, objects: [...ts, ...rest.map((k) => obj(k, col(rng)))], expect: [ts], ...pick, s: ['all'], v: 'all-kind' };
          }
          case 1: {
            const n = rng.range(2, 3);
            const ks = pickKinds(rng, n + 3);
            const [C, ...others] = pickColors(rng, 4);
            const ts = ks.slice(0, n).map((k) => obj(k, C));
            return { say: `Tap everything that is ${C}.`, objects: [...ts, ...ks.slice(n).map((k, j) => obj(k, others[j]))], expect: [ts], ...pick, s: ['all'], v: 'all-colour' };
          }
          case 2: {
            const [K, ...rest] = pickKinds(rng, 4);
            const ts = pickColors(rng, 2).map((c) => obj(K, c));
            return { say: `Tap both ${plural(K)}.`, objects: [...ts, ...rest.map((k) => obj(k, col(rng)))], expect: [ts], ...pick, s: ['all'], v: 'both' };
          }
          default: {
            const [K, K2, K3] = pickKinds(rng, 3);
            const [C, C2] = pickColors(rng, 2);
            const ts = [obj(K, C), obj(K, C)];
            return { say: `Tap all the ${C} ${plural(K)}.`, objects: [...ts, obj(K, C2), obj(K2, C), obj(K3, col(rng))], expect: [ts], ...pick, s: ['all', 'detail'], v: 'all-colour-kind' };
          }
        }
      },
    },
    {
      id: 'w3l3', title: 'All Except', n: 24,
      tip: 'Tricky word: EXCEPT. Except means: leave that one out.',
      gen(rng, i) {
        switch (i % 3) {
          case 0: {
            const [K, K2, K3] = pickKinds(rng, 3);
            const all = pickColors(rng, rng.range(3, 4)).map((c) => obj(K, c));
            return { say: `Tap all the ${plural(K)} except the ${all[0].color} one.`, objects: [...all, obj(K2, col(rng)), obj(K3, col(rng))], expect: [all.slice(1)], ...pick, s: ['except', 'all'], v: 'except-colour' };
          }
          case 1: {
            const objects = things(rng, 4);
            return { say: `Tap everything except the ${objects[0].kind}.`, objects, expect: [objects.slice(1)], ...pick, s: ['except', 'all'], v: 'except-kind' };
          }
          default: {
            const ks = pickKinds(rng, 5);
            const [C, C2, C3] = pickColors(rng, 3);
            const same = ks.slice(0, 3).map((k) => obj(k, C));
            return { say: `Tap all the ${C} things except the ${ks[0]}.`, objects: [...same, obj(ks[3], C2), obj(ks[4], C3)], expect: [same.slice(1)], ...pick, s: ['except', 'all'], v: 'except-colour-kind' };
          }
        }
      },
    },
    {
      id: 'w3l4', title: 'Where Is It', n: 24, maxSame: 6,
      tip: 'Now listen for where things are. Next to. Between. In the middle.',
      gen(rng, i) {
        switch (i % 4) {
          case 0: {
            const n = 5;
            const objects = things(rng, n);
            return single('Tap the one in the middle.', objects, objects[(n - 1) / 2], ['where'], 'middle', { keepOrder: true, cols: n });
          }
          case 1: {
            const [K, K2, X, Y] = pickKinds(rng, 4);
            const C = col(rng);
            const t = obj(K, C);
            const part = { T: t, K: obj(K, C), N: obj(K2, col(rng)), x: obj(X, col(rng)), y: obj(Y, col(rng)) };
            // T is beside N; the other K is not.
            const layout = rng.pick(['TNxKy', 'NTxKy', 'KxTNy', 'KxyTN', 'KxNTy', 'xTNyK', 'TNxyK']);
            return single(`Tap the ${K} next to the ${K2}.`, [...layout].map((ch) => part[ch]), t, ['where'], 'next-to', { keepOrder: true, cols: 5 });
          }
          case 2: {
            const objects = things(rng, 5);
            const m = rng.range(1, 3);
            const [l, r] = rng.chance(0.5) ? [m - 1, m + 1] : [m + 1, m - 1];
            return single(`Tap the one between the ${objects[l].kind} and the ${objects[r].kind}.`, objects, objects[m], ['where'], 'between', { keepOrder: true, cols: 5 });
          }
          default: {
            const [K, ...rest] = pickKinds(rng, 5);
            const C = col(rng);
            const top = rng.chance(0.5);
            const a = obj(K, C);
            const b = obj(K, C);
            const rowA = rng.shuffle([a, obj(rest[0], col(rng)), obj(rest[1], col(rng))]);
            const rowB = rng.shuffle([b, obj(rest[2], col(rng)), obj(rest[3], col(rng))]);
            return single(`Tap the ${K} in the ${top ? 'top' : 'bottom'} row.`, [...rowA, ...rowB], top ? a : b, ['where'], 'row', { keepOrder: true, cols: 3 });
          }
        }
      },
    },
    {
      id: 'w3l5', title: 'Left and Right', n: 24,
      tip: 'Left and right. Here is a trick: hold up both hands with your thumbs sticking out. The hand that makes an L is your left.',
      gen(rng, i) {
        const side = i % 2 ? 'right' : 'left';
        if (i % 4 < 2) {
          const [K, X, Y] = pickKinds(rng, 3);
          const C = col(rng);
          const a = obj(K, C); // the left one
          const b = obj(K, C); // the right one
          const x = obj(X, col(rng));
          const y = obj(Y, col(rng));
          const objects = rng.pick([[a, x, y, b], [a, x, b, y], [x, a, y, b]]);
          return single(`Tap the ${K} on the ${side}.`, objects, side === 'left' ? a : b, ['side'], 'on-side', { keepOrder: true, cols: 4 });
        }
        const n = rng.pick([4, 5]);
        const objects = things(rng, n);
        // Only one thing lies on that side of the named object, so "to the left of" cannot be misread.
        const ref = side === 'left' ? objects[1] : objects[n - 2];
        const t = side === 'left' ? objects[0] : objects[n - 1];
        return single(`Tap the one to the ${side} of the ${ref.kind}.`, objects, t, ['side'], 'side-of', { keepOrder: true, cols: n });
      },
    },
    { id: 'w3l6', title: 'Woods Wizard', boss: true, mix: ['w3l1', 'w3l2', 'w3l3', 'w3l4', 'w3l5'], tip: 'Woods challenge! Not, all, except, and where. Listen for the tricky word.' },
  ],
};

// ----------------------------------------------------------------------------- world 4

/** Two things; `a` must be tapped first, `b` second - however the sentence is arranged. */
function orderItem(forms, s, v) {
  return (rng, i) => {
    const objects = things(rng, 4);
    const [a, b] = objects;
    const form = forms[i % forms.length];
    const [fn, fv] = Array.isArray(form) ? form : [form, v];
    return { say: fn(a.kind, b.kind), objects, expect: [[a], [b]], auto: false, s: fv === v ? s : s.filter((t) => t !== 'flip'), v: fv };
  };
}

const w4 = {
  id: 'w4', name: 'Time Tower', blurb: 'First, then, before, after.', speed: 0.92,
  levels: [
    {
      id: 'w4l1', title: 'First and Then', n: 24,
      tip: 'First, then, last. These words tell you the order.',
      gen: orderItem([
        (a, b) => `First, tap the ${a}. Then, tap the ${b}.`,
        (a, b) => `Tap the ${a} first. Then tap the ${b}.`,
        (a, b) => `Tap the ${a} first, and the ${b} last.`,
      ], ['order', 'steps2'], 'first-then'),
    },
    {
      id: 'w4l2', title: 'After That', n: 24,
      tip: 'Listen for the word AFTER.',
      gen: orderItem([
        (a, b) => `Tap the ${a}. After that, tap the ${b}.`,
        (a, b) => `After you tap the ${a}, tap the ${b}.`,
      ], ['after'], 'after'),
    },
    {
      id: 'w4l3', title: 'Before', n: 24,
      tip: 'Listen for the word BEFORE.',
      gen: orderItem([
        (a, b) => `Tap the ${a} before you tap the ${b}.`,
        (a, b) => `Tap the ${a} before the ${b}.`,
      ], ['before'], 'before'),
    },
    {
      id: 'w4l4', title: 'Flip It: Before', n: 24,
      tip: 'Careful! Sometimes I say it backwards. Before you eat, wash your hands. So washing comes first. Listen for BEFORE, and think: what comes first?',
      gen: orderItem([
        (a, b) => `Before you tap the ${b}, tap the ${a}.`,
        [(a, b) => `Tap the ${a} before you tap the ${b}.`, 'before'],
        (a, b) => `Before tapping the ${b}, tap the ${a}.`,
      ], ['before', 'flip'], 'before-flipped'),
    },
    {
      id: 'w4l5', title: 'Flip It: After', n: 24,
      tip: 'Careful again. Eat after you wash your hands. Washing still comes first. Listen for AFTER, and think: what comes first?',
      gen: orderItem([
        (a, b) => `Tap the ${b} after you tap the ${a}.`,
        [(a, b) => `After you tap the ${a}, tap the ${b}.`, 'after'],
        (a, b) => `Tap the ${b} after the ${a}.`,
      ], ['after', 'flip'], 'after-flipped'),
    },
    { id: 'w4l6', title: 'Tower Boss', boss: true, mix: ['w4l1', 'w4l2', 'w4l3', 'w4l4', 'w4l5'], tip: 'Tower boss! Before and after, all mixed up. Think: what happens first?' },
  ],
};

// ----------------------------------------------------------------------------- world 5

const IMPOSTORS = ['The pirate', 'The dragon', 'The wizard', 'The parrot'];
const FLAMES = ['torch', 'rocket']; // drawn with a yellow flame, so "is it yellow?" would be unfair

const w5 = {
  id: 'w5', name: "Captain's Deck", blurb: 'Wait for the real order.', speed: 0.95, allowNone: true,
  levels: [
    {
      id: 'w5l1', title: 'Captain Says', n: 25, quota: { go: 4, nogo: 2 },
      tip: 'Captain’s rule: only do it if I say, Captain says. If I do not say Captain says, tap the hand.',
      gen(rng, i) {
        const go = i % 5 < 3;
        const { t, objects } = captainScene(rng);
        const order = `tap the ${t.color} ${t.kind}.`;
        return { say: go ? `Captain says, ${order}` : cap(order), objects, expect: go ? [[t]] : [], auto: true, s: ['wait'], v: go ? 'captain-go' : 'captain-no', g: go ? 'go' : 'nogo' };
      },
    },
    {
      id: 'w5l2', title: 'Who Said It', n: 24, quota: { go: 4, nogo: 2 },
      tip: 'Sneaky pirates are giving orders too. Only listen to the captain.',
      gen(rng, i) {
        const p = i % 6;
        if (p === 2 || p === 5) {
          const objects = things(rng, 5);
          const [a, b] = objects;
          const order = `tap the ${a.kind}, then the ${b.kind}.`;
          return p === 2
            ? { say: `Captain says, ${order}`, objects, expect: [[a], [b]], auto: false, s: ['wait', 'steps2'], v: 'captain-two', g: 'go' }
            : { say: cap(order), objects, expect: [], auto: false, s: ['wait'], v: 'plain-two', g: 'nogo' };
        }
        const { t, objects } = captainScene(rng);
        const order = `tap the ${t.color} ${t.kind}.`;
        return p < 2
          ? { say: `Captain says, ${order}`, objects, expect: [[t]], auto: true, s: ['wait'], v: 'captain-go', g: 'go' }
          : { say: `${rng.pick(IMPOSTORS)} says, ${order}`, objects, expect: [], auto: true, s: ['wait'], v: 'impostor', g: 'nogo' };
      },
    },
    {
      id: 'w5l3', title: 'Only If', n: 24, quota: { go: 3, nogo: 3 },
      tip: 'IF is a tricky word. If it is true, do it. If it is not true, tap the hand.',
      gen(rng, i) {
        const go = i % 2 === 0;
        if (i % 4 < 2) {
          const ch = rng.pick(CHARS);
          const objects = things(rng, 4);
          const t = objects[0];
          const scene = go ? [...objects, obj(ch, col(rng))] : rng.chance(0.6) ? [...objects, obj(rng.pick(CHARS.filter((c) => c !== ch)), col(rng))] : objects;
          return { say: `If you see ${an(ch)} ${ch}, tap the ${t.kind}.`, objects: scene, expect: go ? [[t]] : [], auto: true, s: ['if'], v: 'if-see', g: go ? 'go' : 'nogo' };
        }
        const [K, K2, K3, K4] = pickKinds(rng, 4);
        const [C, D] = pickColors(rng, 2, { avoid: FLAMES.includes(K) ? ['yellow'] : [] });
        const t = obj(K, go ? C : D);
        return { say: `If the ${K} is ${C}, tap it.`, objects: [t, obj(K2, C), obj(K3, col(rng)), obj(K4, col(rng))], expect: go ? [[t]] : [], auto: true, s: ['if'], v: 'if-colour', g: go ? 'go' : 'nogo' };
      },
    },
    {
      id: 'w5l4', title: 'If Not', n: 24, quota: { yes: 3, no: 3 },
      tip: 'Now there are two choices. If it is true, do the first thing. If not, do the second.',
      gen(rng, i) {
        const yes = i % 2 === 0;
        if (i % 4 < 2) {
          const [K1, K2, K3, K4, K5] = pickKinds(rng, 5);
          const a = obj(K2, col(rng));
          const b = obj(K3, col(rng));
          const objects = [a, b, obj(K4, col(rng)), obj(yes ? K1 : K5, col(rng))];
          return { say: `If there is ${an(K1)} ${K1}, tap the ${K2}. If not, tap the ${K3}.`, objects, expect: [[yes ? a : b]], auto: true, s: ['if'], v: 'if-else', g: yes ? 'yes' : 'no' };
        }
        const ch = rng.pick(CHARS);
        const objects = things(rng, 3);
        const [a, b] = objects;
        const extra = obj(yes ? ch : rng.pick(CHARS.filter((c) => c !== ch)), col(rng));
        return { say: `If you see ${an(ch)} ${ch}, tap the ${a.kind}. If not, tap the ${b.kind}.`, objects: [...objects, extra], expect: [[yes ? a : b]], auto: true, s: ['if'], v: 'if-else-see', g: yes ? 'yes' : 'no' };
      },
    },
    {
      id: 'w5l5', title: 'Change of Plan', n: 25,
      tip: 'Sometimes I change my mind at the end. Wait until I have completely finished.',
      gen(rng, i) {
        const p = i % 5;
        if (p === 0 || p === 3) {
          const objects = things(rng, 4);
          const [a, b] = objects;
          return { say: `Tap the ${a.kind}. No, wait! Tap the ${b.kind} instead.`, objects, expect: [[b]], auto: false, s: ['end', 'wait'], v: 'instead' };
        }
        if (p === 1 || p === 4) {
          const go = p === 1;
          const [K, K2, K3, K4] = pickKinds(rng, 4);
          const [C, D] = pickColors(rng, 2, { avoid: FLAMES.includes(K) ? ['yellow'] : [] });
          const t = obj(K, go ? C : D);
          return { say: `Tap the ${K}, but only if it is ${C}.`, objects: [t, obj(K2, C), obj(K3, col(rng)), obj(K4, col(rng))], expect: go ? [[t]] : [], auto: false, s: ['end', 'if'], v: go ? 'only-if-go' : 'only-if-no' };
        }
        const objects = things(rng, 4);
        const [a, b] = objects;
        return { say: `Tap the ${a.kind}. Oh, and tap the ${b.kind} too.`, objects, expect: [[a, b]], auto: false, s: ['end', 'steps2'], v: 'and-too' };
      },
    },
    { id: 'w5l6', title: "Captain's Test", boss: true, mix: ['w5l1', 'w5l2', 'w5l3', 'w5l4', 'w5l5'], tip: 'Captain’s test! Wait for every word before you move.' },
  ],
};

// ----------------------------------------------------------------------------- world 6

function chain(n, forms, s, v, extra = {}) {
  return (rng, i) => {
    const objects = things(rng, n + 3 > 8 ? 8 : n + 3);
    const targets = objects.slice(0, n);
    return { say: forms[i % forms.length](...targets.map((o) => o.kind)), objects, expect: targets.map((o) => [o]), auto: false, s, v, ...extra };
  };
}

const THREE = [
  (a, b, c) => `Tap the ${a}, then the ${b}, then the ${c}.`,
  (a, b, c) => `First, tap the ${a}. Then, tap the ${b}. Last, tap the ${c}.`,
];

const w6 = {
  id: 'w6', name: 'Memory Mountain', blurb: 'Three and four steps.', speed: 0.92,
  levels: [
    { id: 'w6l1', title: 'Three Steps', n: 24, tip: 'Three steps now. Here is a trick: count them on your fingers as you listen.', gen: chain(3, THREE, ['steps3'], 'three') },
    {
      id: 'w6l2', title: 'Three With Colors', n: 24,
      tip: 'Three steps, with colors. Say them back in your head.',
      gen(rng) {
        const [K1, K2, K3, K4, K5] = pickKinds(rng, 5);
        const pairs = [K1, K2, K3].map((K) => {
          const [C, Cb] = pickColors(rng, 2);
          return [obj(K, C), obj(K, Cb)];
        });
        const targets = pairs.map((p) => p[0]);
        const objects = [...pairs.flat(), obj(K4, col(rng)), obj(K5, col(rng))];
        const [a, b, c] = targets;
        return { say: `Tap the ${a.color} ${a.kind}, then the ${b.color} ${b.kind}, then the ${c.color} ${c.kind}.`, objects, expect: targets.map((o) => [o]), auto: false, s: ['steps3', 'detail'], v: 'three-colour' };
      },
    },
    { id: 'w6l3', title: 'Three From Memory', n: 24, holdMs: 900, tip: 'Three steps, and the cards are hidden. You can do it. Picture each one.', gen: chain(3, THREE, ['steps3', 'hidden'], 'three-hidden', { hide: true }) },
    {
      id: 'w6l4', title: 'Four Steps', n: 24,
      tip: 'Four steps! Take a breath, listen all the way, and go one at a time.',
      gen: chain(4, [
        (a, b, c, d) => `Tap the ${a}, then the ${b}, then the ${c}, then the ${d}.`,
        (a, b, c, d) => `First, tap the ${a}. Next, the ${b}. Then, the ${c}. Last, the ${d}.`,
      ], ['steps4'], 'four'),
    },
    { id: 'w6l5', title: 'Mountain Boss', boss: true, mix: ['w6l1', 'w6l2', 'w6l3', 'w6l4'], holdMs: 900, tip: 'Mountain boss! Long instructions. Breathe, listen, and go one step at a time.' },
  ],
};

// ----------------------------------------------------------------------------- world 7

const CAST = [
  { name: 'Zip', kind: 'robot', he: 'he' },
  { name: 'Puff', kind: 'dragon', he: 'he' },
  { name: 'Zazz', kind: 'wizard', he: 'he' },
  { name: 'Sir Clank', kind: 'knight', he: 'he' },
  { name: 'Pounce', kind: 'cat', he: 'she' },
  { name: 'Hoot', kind: 'owl', he: 'she' },
  { name: 'Boo', kind: 'ghost', he: 'he' },
  { name: 'Dash', kind: 'fox', he: 'she' },
];
const full = (c) => `${c.name} the ${c.kind}`;
const PLACES = ['under the bridge', 'behind the castle', 'in the garden', 'on the beach', 'in the cave', 'by the river'];
const HIDING = [['inside', 'chest'], ['inside', 'boot'], ['under', 'hat'], ['behind', 'shield'], ['behind', 'drum'], ['under', 'bell'], ['inside', 'book'], ['under', 'crown']];

// "Work it out" questions: [sentence, answer, three wrong choices]. The answer is never named.
const CLUES = [
  ['The door to the tower is locked. What does the knight need to open it?', 'key', ['bell', 'boot', 'flag']],
  ['It is very dark inside the cave. What should Zip take to help him see?', 'torch', ['drum', 'coin', 'hat']],
  ['The wizard is lost in the forest. What should he look at to find his way?', 'map', ['gem', 'bell', 'egg']],
  ['Arrows are flying toward the knight! What should he hold up to stay safe?', 'shield', ['book', 'ring', 'mushroom']],
  ['It is time to wake up the whole castle. What makes a loud ringing sound?', 'bell', ['map', 'boot', 'gem']],
  ['The queen is ready for the royal party. What goes on top of her head?', 'crown', ['sword', 'potion', 'map']],
  ['Puff wants to learn a new magic spell. What should he read?', 'book', ['shield', 'coin', 'star']],
  ['Zip wants to fly all the way to the moon. What should he ride in?', 'rocket', ['boot', 'chest', 'drum']],
  ['The pirates have a pile of gold to hide. What should they lock it in?', 'chest', ['hat', 'flag', 'bell']],
  ['The band is ready to march. What do you hit with sticks to keep the beat?', 'drum', ['key', 'gem', 'torch']],
  ['Sir Clank’s feet are getting wet in the puddles. What should he put on?', 'boot', ['hat', 'ring', 'crown']],
  ['The witch wants a magic drink that will make her invisible. What should she mix?', 'potion', ['map', 'sword', 'flag']],
  ['A baby dragon is about to hatch. What is it inside?', 'egg', ['chest', 'boot', 'bell']],
  ['The team won the race, and they want to wave something high in the air. What should they wave?', 'flag', ['drum', 'potion', 'coin']],
  ['Dash wants to buy an apple at the market. What does she need to pay with?', 'coin', ['key', 'star', 'hat']],
  ['The knight is going to practice fighting. What should he swing?', 'sword', ['book', 'egg', 'bell']],
  ['The wizard’s head is cold, and he wants to look magical. What should he wear?', 'hat', ['boot', 'ring', 'shield']],
  ['Hoot is looking up at the night sky. What does she see twinkling?', 'star', ['mushroom', 'drum', 'key']],
  ['The prince wants to give the princess something small and shiny to wear on her finger. What is it?', 'ring', ['crown', 'boot', 'hat']],
  ['Pounce found something growing under a tree in the damp forest. What was it?', 'mushroom', ['rocket', 'bell', 'sword']],
  ['The king wants to show how much he loves his people. Which shape means love?', 'heart', ['star', 'flag', 'coin']],
  ['A miner was digging and found something sparkly inside a rock. What was it?', 'gem', ['boot', 'drum', 'flag']],
];

const w7 = {
  id: 'w7', name: 'Story Cave', blurb: 'Listen to a story, then answer.', speed: 0.95,
  levels: [
    {
      id: 'w7l1', title: 'Who and What', n: 24,
      tip: 'Story time! Listen to the story, then answer my question.',
      gen(rng, i) {
        const who = rng.pick(CAST);
        switch (i % 4) {
          case 0: {
            const objects = things(rng, 4);
            const t = objects[0];
            return single(`${full(who)} found ${an(t.color)} ${t.color} ${t.kind} ${rng.pick(PLACES)}. What did ${who.name} find?`, objects, t, ['story'], 'what-found');
          }
          case 1: {
            const objects = things(rng, 4);
            const t = objects[0];
            return single(`${full(who)} is carrying ${an(t.kind)} ${t.kind} to the castle. What is ${who.name} carrying?`, objects, t, ['story'], 'what-carrying');
          }
          case 2: {
            const objects = rng.sample(CHARS, 3).map((c) => obj(c, col(rng)));
            const k = rng.pick(OBJECTS);
            const giver = rng.chance(0.5);
            const q = giver ? `Who gave the ${k} away?` : `Who got the ${k}?`;
            return single(`The ${objects[0].kind} gave ${an(k)} ${k} to the ${objects[1].kind}. ${q}`, objects, objects[giver ? 0 : 1], ['story'], giver ? 'who-gave' : 'who-got');
          }
          default: {
            const places = pickKinds(rng, 4, { from: HIDING.map((p) => p[1]) });
            const prep = HIDING.find((p) => p[1] === places[0])[0];
            const k = pickKinds(rng, 1, { from: ['gem', 'key', 'coin', 'ring', 'star', 'egg'], avoid: places })[0];
            const objects = places.map((p) => obj(p, col(rng)));
            return single(`${full(who)} hid the ${k} ${prep} the ${places[0]}. Where is the ${k}?`, objects, objects[0], ['story'], 'where-hidden');
          }
        }
      },
    },
    {
      id: 'w7l2', title: 'Remember the Details', n: 24,
      tip: 'These stories are a bit longer. Make a movie in your mind as you listen.',
      gen(rng, i) {
        switch (i % 4) {
          case 0: {
            const [a, b] = rng.sample(CAST, 2);
            const objects = things(rng, 4);
            const [x, y] = objects;
            const ask = rng.chance(0.5) ? a : b;
            return single(`${a.name} packed ${an(x.kind)} ${x.kind} for the trip. ${b.name} packed ${an(y.kind)} ${y.kind}. Then they walked to the castle together. What did ${ask.name} pack?`, objects, ask === a ? x : y, ['story'], 'who-packed');
          }
          case 1: {
            const objects = things(rng, 4);
            const [x, y, z] = objects;
            const t = rng.pick([x, y, z]);
            return single(`On the shelf there was ${an(x.kind)} ${x.kind}, ${an(y.kind)} ${y.kind}, and ${an(z.kind)} ${z.kind}. A cat knocked the ${t.kind} onto the floor. What fell on the floor?`, objects, t, ['story'], 'shelf');
          }
          case 2: {
            const ch = rng.pick(CAST);
            const [K1, K2] = pickKinds(rng, 2);
            const [C1, C2] = pickColors(rng, 2);
            const keep = obj(K2, C2);
            return single(`${full(ch)} had ${an(C1)} ${C1} ${K1} and ${an(C2)} ${C2} ${K2}. ${cap(ch.he)} gave the ${K1} to a friend. What does ${ch.name} have now?`, [keep, obj(K1, C1), obj(K2, C1), obj(K1, C2)], keep, ['story', 'detail'], 'gave-away');
          }
          default: {
            const ch = rng.pick(CAST);
            const { t, objects } = colourAndKind(rng);
            return single(`${full(ch)} went to the market. ${cap(ch.he)} bought ${an(t.color)} ${t.color} ${t.kind}, and then ${ch.he} went home for lunch. What did ${ch.name} buy?`, objects, t, ['story', 'detail'], 'market');
          }
        }
      },
    },
    {
      id: 'w7l3', title: 'What Happened First', n: 25,
      tip: 'Listen for what happens first, next, and last.',
      gen(rng, i) {
        const ch = rng.pick(CAST);
        const objects = things(rng, 4);
        const [x, y, z] = objects;
        const story = `${full(ch)} picked up ${an(x.kind)} ${x.kind}. Then ${ch.he} picked up ${an(y.kind)} ${y.kind}. Last, ${ch.he} picked up ${an(z.kind)} ${z.kind}.`;
        const s = ['story', 'order'];
        switch (i % 5) {
          case 0: return single(`${story} What did ${ch.name} pick up first?`, objects, x, s, 'story-first');
          case 1: return single(`${story} What did ${ch.name} pick up last?`, objects, z, s, 'story-last');
          case 2: return single(`${story} What did ${ch.name} pick up right after the ${x.kind}?`, objects, y, s, 'story-after');
          case 3: return single(`${story} What did ${ch.name} pick up right before the ${z.kind}?`, objects, y, s, 'story-before');
          default: return { say: `${story} Tap them in the same order.`, objects, expect: [[x], [y], [z]], auto: false, s, v: 'story-retell' };
        }
      },
    },
    {
      id: 'w7l4', title: 'Story Detective', n: CLUES.length,
      tip: 'Be a detective. I will not tell you the answer. Use the clues to work it out.',
      gen(rng, i) {
        const [say, answer, wrong] = CLUES[i % CLUES.length];
        const objects = [answer, ...wrong].map((k) => obj(k, col(rng)));
        return single(say, objects, objects[0], ['infer'], 'clue');
      },
    },
    { id: 'w7l5', title: 'Cave Boss', boss: true, mix: ['w7l1', 'w7l2', 'w7l3', 'w7l4'], tip: 'Cave boss! Stories and clues. Make a movie in your mind.' },
  ],
};

// ----------------------------------------------------------------------------- world 8

const w8 = {
  id: 'w8', name: "Hero's Trial", blurb: 'Everything, mixed up.', speed: 0.95, allowNone: true,
  levels: [
    { id: 'w8l1', title: 'Hero Mix', boss: true, mix: ['w1l5', 'w1l6', 'w2l2', 'w2l5', 'w3l3', 'w3l5', 'w4l4', 'w4l5'], holdMs: 700, tip: 'Hero’s Trial, part one. Clues, steps, and tricky words.' },
    { id: 'w8l2', title: 'Champion Mix', boss: true, mix: ['w5l2', 'w5l4', 'w5l5', 'w6l2', 'w6l3', 'w7l2', 'w7l3'], holdMs: 900, tip: 'Hero’s Trial, part two. Wait for the real order, and remember every step.' },
    { id: 'w8l3', title: 'Legend Run', boss: true, mix: ['w3l3', 'w4l4', 'w4l5', 'w5l3', 'w5l5', 'w6l3', 'w6l4', 'w7l3', 'w7l4'], holdMs: 900, tip: 'The Legend Run. Everything you have learned. You are ready.' },
  ],
};

export const WORLDS = [w1, w2, w3, w4, w5, w6, w7, w8];
