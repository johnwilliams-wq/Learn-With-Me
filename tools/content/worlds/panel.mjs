// World "panel" - CONTROL ROOM. He works the control panel of a spaceship the way the voice says:
// push buttons (once or several times), lever switches, a dial, a number pad for codes, a status
// light and the launch button. Activity type "panel" (tools/content/types/panel.mjs).
//
// The ladder, one new difficulty per level:
//   1 one press or one flip            2 how many times, and two things in order
//   3 the dial                         4 codes of three and four numbers
//   5 five numbers / three things      6 tricky words (backwards, before, after, except) and the status
//                                         light, met with the controls in view ("unless", "only if")
//   7 all of it from memory (the panel is covered while the voice talks), with "if", "unless", "only if"
//
// Scenes always hold look-alikes: a button and a switch of the same colour, and other colours of each,
// so both the colour word and the word "button" / "switch" are needed.
//
// Nothing on a panel may be countable as part of what a sentence names without being wanted:
//   - "every round button" is only said on panels with no dial and no number pad (their keys are buttons
//     too), and the rocket button is only there when the sentence ends with "press launch";
//   - a panel with a status light has no red and no green button or switch, so "red" and "green" can
//     only mean the light.

import { pickColors, cap } from '../lib.mjs';

const NUM = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
const flipped = (pos) => (pos === 'up' ? 'down' : 'up');
const flipped2 = (colour) => (colour === 'red' ? 'green' : 'red'); // the light's other colour

/**
 * A panel. Switches reuse the buttons' colours, so "the red button" always has a red switch beside it.
 * B buttons, S switches, D dial, K number pad, L light, G launch (null when not on this panel).
 */
function desk(rng, { buttons = 3, switches = 2, dial = false, keypad = false, launch = false, light = null } = {}) {
  const colours = pickColors(rng, buttons, { avoid: light ? ['red', 'green'] : [] }); // red and green belong to the light
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
// "type this code: four, ..." - never "the code four", which is heard as "the code for"
const typeCode = (k, digits) => ({ text: `type this code: ${digits.map((n) => NUM[n]).join(', ')}`, e: [{ c: k, v: digits.join('') }] });
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

// --- sentences shared by Tricky Talk (controls in view) and Blackout (controls covered) --------------

/**
 * "Press every round button except the yellow one, then ..." The big rocket button is a button too, so
 * it is only on the panel when the sentence ends with it; "round" keeps it apart from the colour buttons.
 */
function everyRoundExcept(rng, toLaunch) {
  const p = desk(rng, { buttons: 4, switches: 3, launch: toLaunch });
  const out = rng.pick(p.twins);
  const tail = toLaunch ? fire(p.G) : flip(rng.pick(p.S));
  const all = p.B.filter((b) => b !== out).map((b) => ({ c: b, v: 1 }));
  return { p, say: `Press every round button except the ${out.color} one, then ${tail.text}.`, expect: [all, tail.e] };
}

/** "..., then .... Then press launch, unless the light is red." `go` = is launch pressed in the end? */
function unlessLight(rng, go) {
  const colour = rng.pick(['red', 'green']); // the colour the sentence names
  const p = desk(rng, { dial: true, launch: true, light: go ? flipped2(colour) : colour });
  const first = several(rng, p, 2, { both: rng.chance(0.6), counts: [1, 2, 3] });
  const say = `${cap(first[0].text)}, then ${first[1].text}. Then press launch, unless the light is ${colour}.`;
  return { p, say, expect: [...groups(first), ...(go ? [fire(p.G).e] : [])], s: ['panel', 'logic', 'if', go ? 'steps3' : 'steps2', 'order', ...counted(first)] };
}

/** "Type this code: .... Then press launch only if the light is green." */
function onlyIfLight(rng, go, length) {
  const colour = rng.pick(['red', 'green']);
  const p = desk(rng, { keypad: true, launch: true, light: go ? colour : flipped2(colour) });
  const code = typeCode(p.K, digits(rng, length));
  const say = `${cap(code.text)}. Then press launch only if the light is ${colour}.`;
  return { p, say, expect: [code.e, ...(go ? [fire(p.G).e] : [])], s: ['panel', 'code', 'if'] };
}

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
    tip: 'Tricky words now. Before and after can be said backwards. Except means leave that one out. Backwards means start with the last number. The light is red or green. Sometimes it decides what you do.',
    gen(rng, i) {
      // Six kinds of sentence, three of each, every one announced by the tip. Nothing is covered here:
      // this is where he meets the light, with the controls in view.
      const k = i % 6;
      const turn = Math.floor(i / 6) % 2; // the light items come out both ways, turn and turn about
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
      if (k === 2) {
        if (turn === 0) {
          const { p, say, expect } = everyRoundExcept(rng, i < 6); // once ending with launch, once with a switch
          return item(say, p, expect, ['panel', 'except', 'all', 'order'], 'all-except');
        }
        const p = desk(rng, { buttons: 4, switches: 3, launch: true });
        const out = rng.pick(p.S);
        const tail = rng.chance(0.5) ? fire(p.G) : press(rng.pick(p.twins), rng.pick([1, 2]));
        const all = p.S.filter((s) => s !== out).map((s) => ({ c: s, v: flipped(s.pos) }));
        return item(`Flip every switch except the ${out.color} one, then ${tail.text}.`, p, [all, tail.e], ['panel', 'except', 'all', 'order', ...counted([tail])], 'all-except');
      }
      if (k === 3) {
        // "Z after you X. But first, Y." - said last, done first: Y, then X, then Z.
        const p = desk(rng, { dial: true, launch: true });
        const acts = several(rng, p, 3, { withLaunch: rng.chance(0.6), counts: [1, 2, 2, 3] });
        const [y, x, z] = acts;
        return item(`${cap(z.text)} after you ${x.text}. But first, ${y.text}.`, p, [y.e, x.e, z.e], ['panel', 'after', 'flip', 'steps3', 'order', ...counted(acts)], 'after-flipped');
      }
      if (k === 4) {
        const { p, say, expect, s } = unlessLight(rng, turn === 0);
        return item(say, p, expect, s, 'unless');
      }
      const { p, say, expect, s } = onlyIfLight(rng, turn === 1, rng.pick([3, 4]));
      return item(say, p, expect, s, 'only-if');
    },
  },
  {
    id: 'panel7', title: 'Blackout', n: 18, holdMs: 800,
    tip: 'Blackout! The controls stay covered while I talk, so remember everything. The light is red or green, and sometimes it decides what you do. Look at it when the cover opens.',
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
        // Two things, then one more that depends on the light. Both ways have to be kept: he cannot see the light yet.
        const p = desk(rng, { dial: true, launch: true, light: lit });
        const [b1] = rng.shuffle(p.twins);
        const [s1, s2] = rng.shuffle(p.S);
        const first = rng.sample([press(b1, rng.pick([1, 1, 2])), flip(s1), setDial(p.D, nearby(rng, p.D, 3))], 2);
        const [c1, c2] = rng.shuffle(['red', 'green']);
        const [a1, a2] = rng.shuffle([fire(p.G), flip(s2)]);
        const taken = c1 === lit ? a1 : a2;
        const say = `${cap(first[0].text)}, then ${first[1].text}. If the light is ${c1}, ${a1.text}. If the light is ${c2}, ${a2.text} instead.`;
        return item(say, p, [...groups(first), taken.e], ['panel', 'if', 'hidden', 'steps3', 'order', ...counted(first)], 'if-light', hidden);
      }
      if (k === 2) {
        // "Then press launch, unless the light is red." - as in Tricky Talk, but now from memory
        const { p, say, expect, s } = unlessLight(rng, turn === 0);
        return item(say, p, expect, [...s, 'hidden'], 'unless-hidden', hidden);
      }
      if (k === 4) {
        const { p, say, expect, s } = onlyIfLight(rng, turn === 1, 4);
        return item(say, p, expect, [...s, 'hidden'], 'only-if-hidden', hidden);
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
      const { p, say, expect } = everyRoundExcept(rng, turn === 0);
      return item(say, p, expect, ['panel', 'except', 'all', 'hidden', 'order'], 'hidden-except', hidden);
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
