// World "panel" - CONTROL ROOM. He works the control panel of a spaceship the way the voice says:
// push buttons (once or several times), lever switches, a dial, a number pad for codes, a status
// light and the launch button. Activity type "panel" (tools/content/types/panel.mjs).
//
// The ladder, one new difficulty per level:
//   1 one press or one flip            2 how many times, and two things in order
//   3 the dial                         4 codes of three and four numbers
//   5 five numbers / three things      6 tricky words: backwards, before, after, except, neither, second...
//   7 all of it from memory (the panel is covered while the voice talks), with "if", "unless", "only if"
//
// Scenes always hold look-alikes: a button and a switch of the same colour, and other colours of each,
// so both the colour word and the word "button" / "switch" are needed.

import { pickColors, cap } from '../lib.mjs';

const NUM = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
const flipped = (pos) => (pos === 'up' ? 'down' : 'up');
const flipped2 = (colour) => (colour === 'red' ? 'green' : 'red'); // the light's other colour

/**
 * A panel. Switches reuse the buttons' colours, so "the red button" always has a red switch beside it.
 * B buttons, S switches, D dial, K number pad, L light, G launch (null when not on this panel).
 */
function desk(rng, { buttons = 3, switches = 2, dial = false, keypad = false, launch = false, light = null } = {}) {
  const colours = pickColors(rng, buttons);
  const B = colours.map((color) => ({ type: 'button', color }));
  const S = rng.sample(colours, switches).map((color) => ({ type: 'switch', color, pos: rng.pick(['up', 'down']) }));
  const D = dial ? { type: 'dial', value: rng.range(0, 9) } : null;
  const K = keypad ? { type: 'keypad' } : null;
  const L = light ? { type: 'light', color: light } : null;
  const G = launch ? { type: 'launch' } : null;
  const twins = B.filter((b) => S.some((s) => s.color === b.color)); // buttons that have a switch of their colour
  return { B, S, D, K, L, G, twins, controls: [L, ...B, ...S, D, K, G].filter(Boolean) };
}

// One thing to do: the words for it and what it asks of the panel.
const press = (b, n = 1) => ({ text: `press the ${b.color} button${n > 1 ? ` ${NUM[n]} times` : ''}`, e: [{ c: b, v: n }] });
const flip = (s) => ({ text: `flip the ${s.color} switch`, e: [{ c: s, v: flipped(s.pos) }] });
const flipBoth = (S) => ({ text: 'flip both switches', e: S.map((s) => ({ c: s, v: flipped(s.pos) })) });
const setDial = (d, v) => ({ text: `set the dial to ${NUM[v]}`, e: [{ c: d, v }] });
const typeCode = (k, digits) => ({ text: `type the code ${digits.map((n) => NUM[n]).join(', ')}`, e: [{ c: k, v: digits.join('') }] });
const fire = (g) => ({ text: 'press launch', e: [{ c: g, v: true }] });

/** A code of n digits, all different (so it never reads the same backwards and never stutters). */
const digits = (rng, n) => rng.sample([0, 1, 2, 3, 4, 5, 6, 7, 8, 9], n);
const spoken = (code) => code.map((n) => NUM[n]).join(', ');

/** A new setting for the dial, never far away (so a long order is not mostly dial pressing). */
function nearby(rng, d, most = 4) {
  const options = [];
  for (let v = 0; v <= 9; v++) if (v !== d.value && Math.abs(v - d.value) <= most) options.push(v);
  return rng.pick(options);
}

/** k different things to do, chosen from what is on the panel. Launch, when it is in, comes last. */
function several(rng, p, k, { counts = [1, 1, 2, 3], withLaunch = false, both = false } = {}) {
  const pool = [];
  const twins = rng.shuffle(p.twins);
  pool.push(press(twins[0], rng.pick(counts)));
  if (both && p.S.length === 2) pool.push(flipBoth(p.S));
  else pool.push(flip(rng.pick(p.S)));
  if (p.D) pool.push(setDial(p.D, nearby(rng, p.D)));
  if (twins[1] && pool.length < k + 1) pool.push(press(twins[1], 1));
  const out = rng.sample(pool, withLaunch ? k - 1 : k);
  if (out.length < (withLaunch ? k - 1 : k)) throw new Error('cannot pick enough things to do');
  if (withLaunch) out.push(fire(p.G));
  return out;
}

const sentence = (text) => `${cap(text)}.`;
const groups = (acts) => acts.map((a) => a.e); // one group per thing, in the order given
const stepsTag = (n) => (n >= 4 ? 'steps4' : n === 3 ? 'steps3' : 'steps2');
const item = (say, p, expect, s, v, extra = {}) => ({ t: 'panel', say, controls: p.controls, expect, s: [...new Set(s)], v, ...extra });
const counted = (acts) => (acts.some((a) => a.e.some((e) => typeof e.v === 'number' && e.v > 1 && e.c.type === 'button')) ? ['count'] : []);

// ------------------------------------------------------------------------------------------------

const levels = [
  {
    id: 'panel1', title: 'Push and Flip', n: 18, maxSame: 2,
    tip: 'Welcome to the Control Room! Round buttons are for pressing. Switches flip up and down. Listen for the color, and for button or switch. Then do it.',
    gen(rng, i) {
      const p = desk(rng);
      const a = i % 2 === 0 ? press(rng.pick(p.twins)) : flip(rng.pick(p.S));
      return item(sentence(a.text), p, [a.e], ['panel'], i % 2 === 0 ? 'press-one' : 'flip-one', { auto: true });
    },
  },
  {
    id: 'panel2', title: 'How Many Times', n: 18,
    tip: 'Now listen for how many times, and for two things in order. Little dots count your presses. When you are done, press the green check mark. The arrow takes one back.',
    gen(rng, i) {
      const p = desk(rng);
      if (i % 3 === 0) {
        const a = press(rng.pick(p.twins), rng.range(2, 4));
        return item(sentence(a.text), p, [a.e], ['panel', 'count'], 'press-times');
      }
      if (i % 3 === 1) {
        const [b1, b2] = rng.shuffle(p.twins);
        const acts = rng.chance(0.3) ? [press(b1), press(b2)] : rng.shuffle([press(b1), flip(rng.pick(p.S))]);
        return item(sentence(acts.map((a) => a.text).join(', then ')), p, groups(acts), ['panel', 'steps2', 'order'], 'two-then');
      }
      const acts = rng.shuffle([press(rng.pick(p.twins), rng.range(2, 3)), flip(rng.pick(p.S))]);
      return item(sentence(acts.map((a) => a.text).join(', then ')), p, groups(acts), ['panel', 'count', 'steps2', 'order'], 'times-then');
    },
  },
  {
    id: 'panel3', title: 'The Dial', n: 18,
    tip: 'Here is the dial. It shows one number. The plus button makes the number go up. The minus button makes it go down. Set it to the number I say.',
    gen(rng, i) {
      const p = desk(rng, { dial: true });
      const k = i % 4;
      if (k === 0) {
        const a = setDial(p.D, rng.pick([0, 1, 2, 3, 4, 5, 6, 7, 8, 9].filter((v) => v !== p.D.value)));
        return item(sentence(a.text), p, [a.e], ['panel'], 'dial-set');
      }
      if (k === 1) {
        const other = rng.chance(0.5) ? press(rng.pick(p.twins), rng.pick([1, 2, 3])) : flip(rng.pick(p.S));
        const acts = rng.shuffle([setDial(p.D, nearby(rng, p.D, 5)), other]);
        return item(sentence(acts.map((a) => a.text).join(', then ')), p, groups(acts), ['panel', 'steps2', 'order', ...counted(acts)], 'dial-then');
      }
      if (k === 2) {
        const by = rng.range(1, 4);
        const up = rng.chance(0.5);
        const v = p.D.value + (up ? by : -by);
        if (v < 0 || v > 9) throw new Error('try again: the dial cannot go that far');
        return item(`Turn the dial ${up ? 'up' : 'down'} by ${NUM[by]}.`, p, [[{ c: p.D, v }]], ['panel', 'count'], 'dial-by');
      }
      const other = rng.chance(0.5) ? press(rng.pick(p.twins)) : flip(rng.pick(p.S));
      const acts = [setDial(p.D, nearby(rng, p.D, 5)), other];
      return item(sentence(acts.map((a) => a.text).join(' and ')), p, [acts.flatMap((a) => a.e)], ['panel', 'steps2'], 'dial-and');
    },
  },
  {
    id: 'panel4', title: 'Secret Codes', n: 18,
    tip: 'Now the number pad. I will tell you a code. Type the numbers in the same order. The little screen shows what you typed. The big rocket button is launch.',
    gen(rng, i) {
      const p = desk(rng, { buttons: 2, keypad: true, launch: true });
      const k = i % 3;
      if (k === 0 || k === 1) {
        const code = digits(rng, k === 0 ? 3 : 4);
        return item(`The code is ${spoken(code)}.`, p, [[{ c: p.K, v: code.join('') }]], ['panel', 'code'], k === 0 ? 'code3' : 'code4');
      }
      const code = typeCode(p.K, digits(rng, 3));
      const pick = rng.int(3);
      const acts = pick === 0 ? [code, fire(p.G)] : pick === 1 ? [flip(rng.pick(p.S)), code] : [press(rng.pick(p.twins), rng.pick([1, 2])), code];
      return item(sentence(acts.map((a) => a.text).join(', then ')), p, groups(acts), ['panel', 'code', 'steps2', 'order', ...counted(acts)], 'code-then');
    },
  },
  {
    id: 'panel5', title: 'Long Orders', n: 18, holdMs: 600,
    tip: 'Longer orders now. Codes with five numbers, and three things to do in a row. Say them in your head while you listen. Keep them in the same order.',
    gen(rng, i) {
      const p = desk(rng, { dial: true, keypad: true, launch: true });
      const k = i % 4;
      if (k === 0) {
        const code = digits(rng, 5);
        return item(`The code is ${spoken(code)}.`, p, [[{ c: p.K, v: code.join('') }]], ['panel', 'code'], 'code5');
      }
      if (k === 1) {
        const acts = several(rng, p, 3, { withLaunch: rng.chance(0.4) });
        return item(sentence(acts.map((a) => a.text).join(', then ')), p, groups(acts), ['panel', 'steps3', 'order', ...counted(acts)], 'three-then');
      }
      if (k === 2) {
        const code = typeCode(p.K, digits(rng, rng.pick([3, 4])));
        const other = rng.chance(0.5) ? flip(rng.pick(p.S)) : press(rng.pick(p.twins), rng.pick([1, 2]));
        const acts = [...rng.shuffle([code, other]), fire(p.G)];
        return item(sentence(acts.map((a) => a.text).join(', then ')), p, groups(acts), ['panel', 'code', 'steps3', 'order', ...counted(acts)], 'code-three');
      }
      const acts = several(rng, p, 3, { withLaunch: rng.chance(0.5), counts: [1, 2, 3] });
      return item(`First, ${acts[0].text}. Next, ${acts[1].text}. Last, ${acts[2].text}.`, p, groups(acts), ['panel', 'steps3', 'order', ...counted(acts)], 'first-next-last');
    },
  },
  {
    id: 'panel6', title: 'Tricky Talk', n: 18, holdMs: 700,
    tip: 'Tricky words now. Before and after can be said backwards. Except means leave that one out. Backwards means start with the last number. Think first, then press.',
    gen(rng, i) {
      const k = i % 8;
      if (k === 0) {
        const p = desk(rng, { buttons: 2, keypad: true, launch: true });
        const code = digits(rng, rng.pick([3, 4, 4]));
        return item(`Type this code backwards: ${spoken(code)}.`, p, [[{ c: p.K, v: code.slice().reverse().join('') }]], ['panel', 'code', 'reverse'], 'code-backwards');
      }
      if (k === 1) {
        // "Before you Z, X and Y." - X and Y come first (in either order), then Z.
        const p = desk(rng, { dial: true, launch: true });
        const acts = several(rng, p, 3, { withLaunch: rng.chance(0.6), both: rng.chance(0.5), counts: [1, 2, 2, 3] });
        const [x, y, z] = acts;
        return item(`Before you ${z.text}, ${x.text} and ${y.text}.`, p, [[...x.e, ...y.e], z.e], ['panel', 'before', 'flip', 'steps3', ...counted(acts)], 'before-flipped');
      }
      if (k === 3) {
        // "Z after you X. But first, Y." - said last, done first: Y, then X, then Z.
        const p = desk(rng, { dial: true, launch: true });
        const acts = several(rng, p, 3, { withLaunch: rng.chance(0.6), counts: [1, 2, 2, 3] });
        const [y, x, z] = acts;
        return item(`${cap(z.text)} after you ${x.text}. But first, ${y.text}.`, p, [y.e, x.e, z.e], ['panel', 'after', 'flip', 'steps3', 'order', ...counted(acts)], 'after-flipped');
      }
      if (k === 2) {
        const p = desk(rng, { buttons: 4, switches: 3, launch: true });
        if (rng.chance(0.5)) {
          const out = rng.pick(p.twins);
          const tail = rng.chance(0.5) ? fire(p.G) : flip(rng.pick(p.S));
          const all = p.B.filter((b) => b !== out).map((b) => ({ c: b, v: 1 }));
          return item(`Press every button except the ${out.color} one, then ${tail.text}.`, p, [all, tail.e], ['panel', 'except', 'all', 'order'], 'all-except');
        }
        const out = rng.pick(p.S);
        const tail = rng.chance(0.5) ? fire(p.G) : press(rng.pick(p.twins), rng.pick([1, 2]));
        const all = p.S.filter((s) => s !== out).map((s) => ({ c: s, v: flipped(s.pos) }));
        return item(`Flip every switch except the ${out.color} one, then ${tail.text}.`, p, [all, tail.e], ['panel', 'except', 'all', 'order', ...counted([tail])], 'all-except');
      }
      if (k === 4) {
        const p = desk(rng, { buttons: 4, switches: 3 });
        const [n1, n2] = rng.sample(p.B, 2);
        const tail = flip(rng.pick(p.S));
        const all = p.B.filter((b) => b !== n1 && b !== n2).map((b) => ({ c: b, v: 1 }));
        return item(`Press every button that is neither ${n1.color} nor ${n2.color}, then ${tail.text}.`, p, [all, tail.e], ['panel', 'logic', 'all', 'order'], 'neither');
      }
      if (k === 5) {
        const p = desk(rng, { buttons: 3, switches: 3 });
        const which = rng.pick(['up', 'down']);
        const hits = p.S.filter((s) => s.pos === which);
        if (hits.length < 1 || hits.length > 2) throw new Error('try again: one or two switches must match');
        const tail = press(rng.pick(p.twins), rng.pick([1, 2, 3]));
        return item(`Flip every switch that is ${which}, then ${tail.text}.`, p, [hits.map((s) => ({ c: s, v: flipped(s.pos) })), tail.e], ['panel', 'all', 'order', ...counted([tail])], 'switch-state');
      }
      if (k === 6) {
        // Counting along the row. The order on screen is the order of the lists, so it is fixed here.
        const p = desk(rng, { buttons: 4, switches: 3 });
        const B = rng.shuffle(p.B);
        const S = rng.shuffle(p.S);
        const place = (list, max) => {
          const n = rng.range(1, max);
          const side = rng.pick(['left', 'right']);
          return { words: `${['first', 'second', 'third'][n - 1]}`, side, hit: side === 'left' ? list[n - 1] : list[list.length - n] };
        };
        const b = place(B, 3);
        const s = place(S, 2);
        const n = rng.pick([1, 2, 3]);
        const first = { text: `press the ${b.words} button from the ${b.side}${n > 1 ? ` ${NUM[n]} times` : ''}`, e: [{ c: b.hit, v: n }] };
        const second = { text: `flip the ${s.words} switch from the ${s.side}`, e: [{ c: s.hit, v: flipped(s.hit.pos) }] };
        const acts = rng.shuffle([first, second]);
        return { ...item(sentence(acts.map((a) => a.text).join(', then ')), { controls: [...B, ...S] }, groups(acts), ['panel', 'ordinal', 'side', 'steps2', 'order', ...(n > 1 ? ['count'] : [])], 'ordinal'), keepOrder: true };
      }
      const p = desk(rng, { buttons: 3, switches: 3 });
      const which = rng.pick(['up', 'down']);
      const n = p.S.filter((s) => s.pos === which).length;
      if (n < 2) throw new Error('try again: at least two switches must match');
      const b = rng.pick(p.twins);
      return item(`Press the ${b.color} button one time for each switch that is ${which}.`, p, [[{ c: b, v: n }]], ['panel', 'count'], 'count-up');
    },
  },
  {
    id: 'panel7', title: 'Blackout', n: 18, holdMs: 800,
    tip: 'Blackout! The controls stay covered while I talk, so remember everything. Sometimes the light decides what you do. Look at it when the cover opens.',
    gen(rng, i) {
      const k = i % 7;
      const turn = Math.floor(i / 7) % 2; // the light items come out both ways, turn and turn about
      const lit = ['green', 'red'][turn];
      const hidden = { hide: true };
      if (k === 0) {
        const p = desk(rng, { buttons: 2, keypad: true, launch: true });
        const code = digits(rng, 6);
        return item(`The code is ${spoken(code)}.`, p, [[{ c: p.K, v: code.join('') }]], ['panel', 'code', 'hidden'], 'code6', hidden);
      }
      if (k === 1) {
        // Three things, then one more that depends on the light.
        const p = desk(rng, { dial: true, launch: true, light: lit });
        const [b1] = rng.shuffle(p.twins);
        const [s1, s2] = rng.shuffle(p.S);
        const first = rng.shuffle([press(b1, rng.pick([1, 1, 2])), flip(s1), setDial(p.D, nearby(rng, p.D, 3))]);
        const [c1, c2] = rng.shuffle(['red', 'green']);
        const [a1, a2] = rng.shuffle([fire(p.G), flip(s2)]);
        const taken = c1 === lit ? a1 : a2;
        const say = `${cap(first[0].text)}, ${first[1].text}, then ${first[2].text}. If the light is ${c1}, ${a1.text}. If it is ${c2}, ${a2.text} instead.`;
        return item(say, p, [...groups(first), taken.e], ['panel', 'if', 'hidden', 'steps4', 'order', ...counted(first)], 'if-light', hidden);
      }
      if (k === 2 || k === 4) {
        // "Then press launch, unless the light is red."  /  "Then press launch only if the light is green."
        const go = k === 2 ? turn === 0 : turn === 1; // is launch pressed in the end?
        const colour = rng.pick(['red', 'green']); // the colour the sentence names
        const shown = (k === 2) === go ? flipped2(colour) : colour; // "unless red" launches on green; "only if red" launches on red
        const p = desk(rng, { dial: k === 2, keypad: k === 4, launch: true, light: shown });
        if (k === 2) {
          const first = several(rng, p, 2, { both: rng.chance(0.6), counts: [1, 2, 3] });
          const say = `${cap(first[0].text)}, then ${first[1].text}. Then press launch, unless the light is ${colour}.`;
          return item(say, p, [...groups(first), ...(go ? [fire(p.G).e] : [])], ['panel', 'logic', 'if', 'hidden', go ? 'steps3' : 'steps2', 'order', ...counted(first)], 'unless', hidden);
        }
        const code = typeCode(p.K, digits(rng, 4));
        const say = `${cap(code.text)}. Then press launch only if the light is ${colour}.`;
        return item(say, p, [code.e, ...(go ? [fire(p.G).e] : [])], ['panel', 'code', 'if', 'hidden'], 'only-if', hidden);
      }
      if (k === 3) {
        const p = desk(rng, { dial: true, launch: true });
        const acts = several(rng, p, 4, { withLaunch: true, counts: [1, 1, 2, 3] });
        const say = `${cap(acts[0].text)}, ${acts[1].text}, ${acts[2].text}, then ${acts[3].text}.`;
        return item(say, p, groups(acts), ['panel', 'steps4', 'order', 'hidden', ...counted(acts)], 'four-hidden', hidden);
      }
      if (k === 5) {
        const p = desk(rng, { buttons: 2, keypad: true, launch: true });
        const code = digits(rng, 4);
        return item(`Type this code backwards: ${spoken(code)}. Then press launch.`, p, [[{ c: p.K, v: code.slice().reverse().join('') }], fire(p.G).e], ['panel', 'code', 'reverse', 'hidden', 'steps2'], 'backwards-hidden', hidden);
      }
      // He cannot see which buttons there are while he listens: he has to keep the rule, not a picture.
      const p = desk(rng, { buttons: 4, switches: 3, launch: true });
      const out = rng.pick(p.twins);
      const tail = rng.chance(0.5) ? fire(p.G) : flip(rng.pick(p.S));
      const all = p.B.filter((b) => b !== out).map((b) => ({ c: b, v: 1 }));
      return item(`Press every button except the ${out.color} one, then ${tail.text}.`, p, [all, tail.e], ['panel', 'except', 'all', 'hidden', 'order'], 'hidden-except', hidden);
    },
  },
  {
    id: 'panel-boss', title: 'Control Room Boss', boss: true, mix: ['panel5', 'panel6', 'panel7'], holdMs: 800,
    tip: 'Control Room Boss! Long codes, tricky words, and covered controls. Listen to every word. Then take your time and check your work before the green check mark.',
  },
];

export default {
  id: 'panel', name: 'Control Room', blurb: 'Buttons, switches, dials and secret codes. Work the spaceship.', color: '#2aa9d8', speed: 0.92,
  levels,
};
