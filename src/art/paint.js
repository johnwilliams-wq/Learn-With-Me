// Art for the Paint Shop (activity type "paint"): paint pots, the brush that stands in the
// pot he has picked, and the soapy sponge that washes paint off.
// Same rules as sprites.js: pure strings, no ids, defs, gradients, filters, <use>, <style> or text.

import { PALETTE } from './sprites.js';

const INK = '#1b1f3b';
const W = '#ffffff';
const STEEL = '#dfe5f0';
const STEEL_D = '#a4adc2';
const WOOD = '#c98f52';
const WOOD_D = '#8f5f2e';
const RJ = 'stroke-linejoin="round" stroke-linecap="round"';

const P = (d, fill, sw = 4) => `<path d="${d}" fill="${fill}" stroke="${INK}" stroke-width="${sw}" ${RJ}/>`;
const F = (d, fill, op) => `<path d="${d}" fill="${fill}"${op ? ` fill-opacity="${op}"` : ''}/>`;
const S = (d, col = INK, sw = 4) => `<path d="${d}" fill="none" stroke="${col}" stroke-width="${sw}" ${RJ}/>`;
const C = (cx, cy, r, fill, sw = 3) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" stroke="${INK}" stroke-width="${sw}"/>`;
const O = (cx, cy, r, fill, op) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}"${op ? ` fill-opacity="${op}"` : ''}/>`;
const E = (cx, cy, rx, ry, fill, sw = 4) => `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${fill}"${sw ? ` stroke="${INK}" stroke-width="${sw}"` : ''}/>`;

const wrap = (cls, inner) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" class="${cls}" aria-hidden="true">${inner}</svg>`;

function tones(color) {
  const t = Object.prototype.hasOwnProperty.call(PALETTE, color) ? PALETTE[color] : null;
  if (!t || color === 'gray') throw new Error(`Unknown paint colour: ${color}`);
  return t;
}

/** An open pot of paint: a tin in the colour, full to the brim, with a fat drip down the front. */
export function potSVG(color) {
  const { main: m, dark: d, light: l } = tones(color);
  return wrap('paint-art paint-art-pot',
    // the wire handle, behind the tin
    S('M11 40C4 74 22 82 30 62', STEEL_D, 4) +
    // the tin, in the colour
    P('M10 34V78C10 90 28 97 50 97S90 90 90 78V34Z', m) +
    F('M69 61C81 58 90 53 90 46V78C90 86 81 92 69 95Z', d) +
    F('M17 55C20 59 25 62 31 64V92C25 90.5 20 88 17 84Z', l, 0.8) +
    // its steel collar and rim
    P('M10 34V47C10 59 28 65 50 65S90 59 90 47V34Z', STEEL) +
    F('M70 61.5C81 59 90 54 90 47V34H70Z', STEEL_D, 0.55) +
    S('M10 34V47C10 59 28 65 50 65S90 59 90 47V34') +
    E(50, 34, 40, 15.5, STEEL_D) +
    // the paint inside
    E(50, 34, 33, 11, m, 3) +
    F('M26 31C31 26 42 24.5 50 24.5C46 28 35 30 29 34.5Z', l, 0.9) +
    // a fat drip running over the rim and down the front
    P('M56 45C56 45 55 68 55 73C55 82 69 82 69 73C69 68 68 45 68 45Z', m, 3) +
    O(60, 71, 2.6, l, 0.9));
}

/** A paintbrush standing up, its bristles loaded with the colour. Drawn to sit above a pot. */
export function brushSVG(color) {
  const { main: m, dark: d, light: l } = tones(color);
  return wrap('paint-art paint-art-brush',
    `<g transform="rotate(24 50 60)">` +
    P('M44 6C44 2 56 2 56 6L58 46H42Z', WOOD) + F('M47 7H50V44H46Z', W, 0.35) + F('M54 10 56 46H53Z', WOOD_D, 0.6) +
    P('M38 46H62V62H38Z', STEEL) + S('M38 52H62M38 57H62', STEEL_D, 2.5) + S('M38 46H62V62H38Z') +
    P('M38 62H62C63 76 60 88 50 97C40 88 37 76 38 62Z', m) +
    F('M55 64H61C62 76 59 86 52 93C57 84 56 74 55 64Z', d) + F('M42 65H46C45 74 46 82 49 89C43 83 41 74 42 65Z', l, 0.85) +
    `</g>`);
}

/** The wash-off tool: a soapy sponge with foam and bubbles. (Pink, so it is never taken for one of the paints.) */
export function washSVG() {
  const SP = '#ffb9c8';
  const SP_D = '#f58aa5';
  const WATER = '#bfe9ff';
  const WATER_D = '#6cc4f5';
  return wrap('paint-art paint-art-wash',
    // foam on top of the sponge
    P('M20 52C12 50 12 38 21 38C20 28 34 25 38 33C42 23 58 24 60 34C67 27 80 32 77 42C86 42 87 52 80 54Z', W, 3.5) +
    // the sponge
    P('M18 50H82C87 50 90 53 90 58V80C90 85 87 88 82 88H18C13 88 10 85 10 80V58C10 53 13 50 18 50Z', SP) +
    F('M10 74H90V80C90 85 87 88 82 88H18C13 88 10 85 10 80Z', SP_D) +
    E(30, 64, 6, 4.5, SP_D, 0) + E(54, 70, 5, 4, SP_D, 0) + E(73, 62, 6.5, 4.5, SP_D, 0) + E(42, 60, 3, 2.3, SP_D, 0) + E(66, 78, 3.5, 2.5, '#dc6a88', 0) + E(24, 80, 4, 2.5, '#dc6a88', 0) +
    S('M18 50H82C87 50 90 53 90 58V80C90 85 87 88 82 88H18C13 88 10 85 10 80V58C10 53 13 50 18 50Z') +
    // bubbles floating up
    C(30, 16, 8.5, WATER) + S('M25.5 14A5.5 5.5 0 0 1 30 10.5', W, 2.4) +
    C(56, 9, 5.5, WATER, 2.5) + C(76, 19, 7, WATER) + S('M72.5 17.5A4.2 4.2 0 0 1 76 14.5', W, 2.2) +
    C(47, 23, 3.6, WATER, 2.2) + O(74, 44, 2.6, WATER_D) + O(27, 43, 2.2, WATER_D));
}
