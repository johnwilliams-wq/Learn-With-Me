// Art for the "route" activity: the landmarks on the map, the little rover and the arrow glyph.
// Same rules as sprites.js: small inline SVG strings, pure string building (runs in the browser
// and in Node), no ids, defs, gradients, filters, <use>, <style> or text.

const INK = '#1b1f3b';
const W = '#ffffff';
const RJ = 'stroke-linejoin="round" stroke-linecap="round"';
// P: outlined path. F: flat fill. S: stroke only. C/O: outlined / flat circle. E: ellipse. R: rect.
const P = (d, fill, sw = 4) => `<path d="${d}" fill="${fill}" stroke="${INK}" stroke-width="${sw}" ${RJ}/>`;
const F = (d, fill, op) => `<path d="${d}" fill="${fill}"${op ? ` fill-opacity="${op}"` : ''}/>`;
const S = (d, col = INK, sw = 4) => `<path d="${d}" fill="none" stroke="${col}" stroke-width="${sw}" ${RJ}/>`;
const C = (cx, cy, r, fill, sw = 4) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" stroke="${INK}" stroke-width="${sw}"/>`;
const O = (cx, cy, r, fill, op) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}"${op ? ` fill-opacity="${op}"` : ''}/>`;
const E = (cx, cy, rx, ry, fill, sw = 4) => `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${fill}"${sw ? ` stroke="${INK}" stroke-width="${sw}"` : ''}/>`;
const R = (x, y, w, h, rx, fill, sw = 4) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}"${sw ? ` stroke="${INK}" stroke-width="${sw}" stroke-linejoin="round"` : ''}/>`;

const wrap = (cls, inner, attrs = '') =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" class="${cls}" aria-hidden="true"${attrs}>${inner}</svg>`;

const LEAF = '#63d063';
const LEAF_D = '#35a24a';
const LEAF_L = '#a8f08f';
const WOOD = '#b07a45';
const WOOD_D = '#7c5129';
const STONE = '#c3c9d8';
const STONE_D = '#8d94aa';
const STONE_L = '#eef1f8';
const EARTH = '#c08a52';
const EARTH_D = '#8a5a2c';
const WATER = '#3fa7f5';
const WATER_L = '#b5e3ff';
const WALL = '#fff1d0';
const ROOF = '#e4572e';
const ROOF_D = '#a8391a';
const CLOTH = '#ffb02e';
const CLOTH_D = '#d97a00';

// Each landmark is bold, sits on the ground line near y = 90, and can be named in one common word.
const LANDMARKS = {
  // a round leafy tree
  tree: () =>
    R(42, 56, 16, 36, 5, WOOD) + S('M50 66V86', WOOD_D, 4) +
    C(30, 46, 18, LEAF) + C(70, 46, 18, LEAF) + C(50, 30, 24, LEAF) +
    O(30, 46, 16, LEAF) + O(70, 46, 16, LEAF) + O(50, 31, 22, LEAF) + F('M24 50H76V58H24Z', LEAF) +
    S('M17 54Q32 66 50 60Q68 66 83 54', INK, 4) +
    F('M22 52Q34 62 50 57Q66 62 78 52Q66 56 50 51Q34 56 22 52Z', LEAF_D) +
    S('M37 24Q43 15 54 15', LEAF_L, 5) + O(34, 40, 4, LEAF_L) + O(66, 38, 3.5, LEAF_L),

  // an earth hill with a dark way in
  cave: () =>
    P('M6 90C6 46 24 16 50 16S94 46 94 90Z', EARTH) +
    F('M50 16C76 16 94 46 94 90H78C80 54 68 30 50 16Z', EARTH_D, 0.55) +
    S('M18 60Q22 38 36 28', '#e6b884', 5) +
    P('M30 90C30 62 38 48 50 48S70 62 70 90Z', INK, 3) +
    F('M38 90C38 70 43 60 50 60S62 70 62 90Z', '#3a3f6b') +
    S('M6 90C6 46 24 16 50 16S94 46 94 90Z'),

  // a stone tower with battlements
  tower: () =>
    R(30, 30, 40, 62, 3, STONE) +
    F('M56 32H68V90H56Z', STONE_D, 0.6) +
    P('M22 8H36V18H43V8H57V18H64V8H78V34H22Z', STONE_L) +
    F('M66 20H76V32H66Z', STONE_D, 0.6) +
    S('M36 46H46M52 58H64M36 70H44', STONE_D, 4) +
    P('M42 92V74C42 68 46 66 50 66S58 68 58 74V92Z', WOOD_D, 3.5) +
    R(45, 42, 10, 15, 5, INK, 0),

  // a blue pond with a lily pad
  pond: () =>
    E(50, 58, 44, 30, WATER) +
    S('M22 52Q32 44 44 48', WATER_L, 5) + S('M52 74Q64 80 76 72', WATER_L, 5) +
    P('M58 46A13 9 0 1 0 71 55L58 55Z', LEAF, 3) +
    S('M16 44V22M24 46V30', LEAF_D, 4) + E(16, 20, 4, 8, WOOD_D, 3) + E(24, 28, 3.5, 7, WOOD_D, 3),

  // a big gray rock
  rock: () =>
    P('M10 88 18 54 38 30 64 24 84 46 92 88Z', STONE) +
    F('M64 24 84 46 92 88H62L54 52Z', STONE_D, 0.75) +
    F('M38 30 64 24 54 52 30 58Z', STONE_L) +
    S('M30 58 54 52 62 88M54 52 64 24', INK, 3) +
    S('M10 88 18 54 38 30 64 24 84 46 92 88Z'),

  // a little house with a pointed roof
  house: () =>
    R(62, 18, 11, 22, 2, ROOF_D) +
    R(20, 48, 60, 44, 3, WALL) +
    P('M8 54 50 14 92 54Z', ROOF) + F('M50 14 92 54H74Z', ROOF_D, 0.6) +
    R(43, 64, 15, 28, 3, WOOD) + O(54, 79, 2, INK) +
    R(25, 60, 13, 13, 2, WATER_L, 3.5) + R(63, 60, 13, 13, 2, WATER_L, 3.5),

  // a wooden bridge over a strip of water
  bridge: () =>
    R(2, 54, 96, 38, 12, WATER) + S('M12 82Q20 78 28 82M70 84Q78 80 86 84', WATER_L, 4) +
    P('M4 70Q50 22 96 70V82Q50 40 4 82Z', WOOD) +
    S('M22 55V66M36 45V56M50 41V52M64 45V56M78 55V66', WOOD_D, 3.5) +
    S('M8 52Q50 6 92 52', INK, 9) + S('M8 52Q50 6 92 52', WOOD, 4.5) +
    S('M8 52V68M29 32V47M50 25V40M71 32V47M92 52V68', INK, 4.5),

  // a camping tent
  tent: () =>
    S('M50 16V6', INK, 4.5) +
    P('M50 14 94 90H6Z', CLOTH) + F('M50 14 94 90H72Z', CLOTH_D, 0.75) +
    P('M50 44 66 90H34Z', INK, 3) + F('M50 56 58 90H50Z', '#3a3f6b') +
    S('M30 52 22 66M70 52 78 66', W, 4),
};

export const LANDMARK_KINDS = Object.keys(LANDMARKS);

export function landmarkSVG(kind) {
  const draw = Object.prototype.hasOwnProperty.call(LANDMARKS, kind) ? LANDMARKS[kind] : null;
  if (!draw) throw new Error(`Unknown landmark: ${kind}`);
  return wrap(`landmark landmark-${kind}`, draw());
}

/** The rover, seen from the front. It never turns, so "left" and "right" always mean the screen. */
export function roverSVG() {
  return wrap('rover',
    E(50, 92, 36, 5, INK, 0).replace('/>', ' fill-opacity="0.3"/>') +
    S('M50 30V14', INK, 5) + C(50, 11, 7, '#ff5a5f', 4) +
    R(6, 52, 22, 38, 10, INK, 0) + R(72, 52, 22, 38, 10, INK, 0) +
    S('M11 62H23M11 71H23M11 80H23M77 62H89M77 71H89M77 80H89', '#6a7189', 4) +
    R(18, 28, 64, 54, 18, W, 4.5) +
    F('M24 66H76V70Q76 78 66 78H34Q24 78 24 70Z', '#ff8a3d') +
    R(27, 37, 46, 24, 12, INK, 0) +
    O(40, 49, 6.5, '#7df3ff') + O(60, 49, 6.5, '#7df3ff') + O(42, 47, 2, W) + O(62, 47, 2, W) +
    O(34, 72, 3, W) + O(66, 72, 3, W));
}

const ARROW_TURN = { up: 0, right: 90, down: 180, left: 270 };

/** A chunky solid arrow (currentColor) for the steering buttons. */
export function arrowSVG(dir) {
  if (!Object.prototype.hasOwnProperty.call(ARROW_TURN, dir)) throw new Error(`Unknown direction: ${dir}`);
  return wrap(`arrow arrow-${dir}`,
    `<path d="M50 10 90 54H66V88H34V54H10Z" fill="currentColor" stroke="currentColor" stroke-width="8" ${RJ} transform="rotate(${ARROW_TURN[dir]} 50 50)"/>`,
    ' fill="currentColor"');
}
