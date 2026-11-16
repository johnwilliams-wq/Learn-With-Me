// Art for the Robot Workshop (activity type "build"): a robot assembled from parts, and one
// small picture per part option. Pure string building like sprites.js, and the same rules:
// no ids, defs, gradients, filters, <use>, <style> or text, so many copies can share a page.

import { PALETTE } from './sprites.js';

/** Every part of the robot and every value it can take (the vocabulary of a build scene). */
export const BUILD_PARTS = {
  antennas: [0, 1, 2, 3],
  head: ['round', 'square', 'pointy'],
  eyes: [1, 2, 3, 4],
  nose: ['red', 'blue', 'green', 'yellow', 'purple', 'orange'],
  body: ['red', 'blue', 'green', 'yellow', 'purple', 'orange'],
  buttons: [1, 2, 3, 4],
  arms: ['short', 'mid', 'long', 'claws'],
  bottom: ['legs', 'legs-short', 'legs-long', 'wheels', 'wheels-small', 'wheels-big', 'jet'],
};
/** Rows are always shown in this order: from the top of the robot to the bottom. */
export const BUILD_ORDER = Object.keys(BUILD_PARTS);

const INK = '#1b1f3b';
const W = '#ffffff';
const STEEL = '#dfe5f0';
const STEEL_D = '#a4adc2';
const STEEL_DD = '#77819f';
const SLATE = '#414a73';
const FLAME = '#ffe45c';
const GHOST = '#8f9bff';

const rd = (n) => Math.round(n * 10) / 10;
const RJ = 'stroke-linejoin="round" stroke-linecap="round"';
const P = (d, fill, sw) => `<path d="${d}" fill="${fill}" stroke="${INK}" stroke-width="${rd(sw)}" ${RJ}/>`;
const F = (d, fill, op) => `<path d="${d}" fill="${fill}"${op ? ` fill-opacity="${op}"` : ''}/>`;
const S = (d, col, sw) => `<path d="${d}" fill="none" stroke="${col}" stroke-width="${rd(sw)}" ${RJ}/>`;
const C = (cx, cy, r, fill, sw) => `<circle cx="${rd(cx)}" cy="${rd(cy)}" r="${rd(r)}" fill="${fill}" stroke="${INK}" stroke-width="${rd(sw)}"/>`;
const O = (cx, cy, r, fill, op) => `<circle cx="${rd(cx)}" cy="${rd(cy)}" r="${rd(r)}" fill="${fill}"${op ? ` fill-opacity="${op}"` : ''}/>`;
const R = (x, y, w, h, rx, fill, sw) => `<rect x="${rd(x)}" y="${rd(y)}" width="${rd(w)}" height="${rd(h)}" rx="${rd(rx)}" fill="${fill}" stroke="${INK}" stroke-width="${rd(sw)}" stroke-linejoin="round"/>`;
const G = (transform, inner) => `<g transform="${transform}">${inner}</g>`;
const DASH = (shape, sw) => `<${shape} fill="${GHOST}" fill-opacity="0.12" stroke="${GHOST}" stroke-width="${rd(sw * 0.8)}" stroke-dasharray="${rd(sw * 2)} ${rd(sw * 2)}" stroke-linecap="round"/>`;
const wrap = (cls, inner, viewBox) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" class="${cls}" aria-hidden="true">${inner}</svg>`;

function tones(color) {
  const t = Object.prototype.hasOwnProperty.call(PALETTE, color) ? PALETTE[color] : null;
  if (!t) throw new Error(`Unknown build colour: ${color}`);
  return t;
}
function known(part, value) {
  if (!Object.prototype.hasOwnProperty.call(BUILD_PARTS, part)) throw new Error(`Unknown robot part: ${part}`);
  if (!BUILD_PARTS[part].includes(value) && !(part === 'body' && value === 'gray')) throw new Error(`Unknown ${part}: ${value}`);
}

// ---- the parts, all in the robot's own coordinates (240 wide, the head centred on x = 120) ----

const CX = 120;
/** Where the eyes sit in each head (the nose and the mouth hang below them). */
const EYE_Y = { round: 88, square: 88, pointy: 109 };
const eyeY = (head) => EYE_Y[head] ?? 88;

function head(shape, sw) {
  if (shape === 'round') {
    return R(44, 84, 16, 30, 7, STEEL_D, sw) + R(180, 84, 16, 30, 7, STEEL_D, sw) +
      `<ellipse cx="120" cy="100" rx="62" ry="54" fill="${STEEL}" stroke="${INK}" stroke-width="${rd(sw)}"/>` +
      S('M72 84Q78 62 100 55', W, sw * 1.3);
  }
  if (shape === 'square') {
    return R(44, 84, 16, 30, 7, STEEL_D, sw) + R(180, 84, 16, 30, 7, STEEL_D, sw) +
      R(58, 46, 124, 108, 12, STEEL, sw) + S('M70 78V66Q70 58 78 58H94', W, sw * 1.3);
  }
  if (shape === 'pointy') {
    return P('M120 24 200 156H40Z', STEEL, sw) + S('M106 62 88 92', W, sw * 1.3);
  }
  throw new Error(`Unknown head: ${shape}`);
}
const headGhost = (sw) => DASH('rect x="58" y="46" width="124" height="108" rx="34"', sw);

/** The y of the top of the head at x = 120 + dx (where an antenna stands). */
function headTop(shape, dx) {
  if (shape === 'round') return 100 - 54 * Math.sqrt(1 - (dx / 62) ** 2);
  if (shape === 'pointy') return 24 + Math.abs(dx) * (132 / 80);
  return 46;
}
const ANTENNA_X = { 0: [], 1: [0], 2: [-25, 25], 3: [-31, 0, 31] };
function antennas(n, shape, sw) {
  let out = '';
  for (const dx of ANTENNA_X[n]) {
    const top = headTop(shape, dx);
    out += S(`M${CX + dx} ${rd(top + 4)}V${rd(top - 22)}`, INK, sw * 1.5) + C(CX + dx, top - 27, 8, W, sw);
  }
  return out;
}

const EYES = { 1: { r: 14, gap: 0 }, 2: { r: 12, gap: 38 }, 3: { r: 10.5, gap: 27 }, 4: { r: 9, gap: 21.5 } };
function eyes(n, y, sw, zoom = 1, cx = CX) {
  const { r, gap } = EYES[n];
  let out = '';
  for (let i = 0; i < n; i++) {
    const x = cx + (i - (n - 1) / 2) * gap * zoom;
    out += C(x, y, r * zoom, W, sw * 0.8) + O(x, y + zoom, r * zoom * 0.56, INK) + O(x + r * zoom * 0.22, y - r * zoom * 0.2, r * zoom * 0.2, W);
  }
  return out;
}
const nose = (color, y, sw, r = 8, cx = CX) => {
  const t = tones(color);
  return C(cx, y, r, t.main, sw * 0.8) + O(cx - r * 0.3, y - r * 0.3, r * 0.3, t.light);
};
const mouth = (y, sw) => S(`M${CX - 13} ${y}Q${CX} ${y + 10} ${CX + 13} ${y}`, INK, sw);

const neck = (sw) => R(106, 148, 28, 22, 5, STEEL_DD, sw);
function body(color, sw) {
  const t = tones(color);
  return R(68, 164, 104, 88, 18, t.main, sw) +
    F('M70 228H170V234Q170 250 154 250H86Q70 250 70 234Z', t.dark, 0.55) +
    R(84, 186, 72, 38, 10, t.light, sw * 0.75) +
    S('M78 184V180Q78 173 85 173H96', t.light, sw * 1.2);
}
const bodyGhost = (sw) => DASH('rect x="68" y="164" width="104" height="88" rx="18"', sw);
function buttons(n, sw) {
  let out = '';
  for (let i = 0; i < n; i++) {
    const x = CX + (i - (n - 1) / 2) * 17;
    out += R(x - 6.5, 198.5, 13, 13, 3.5, SLATE, sw * 0.6) + S(`M${rd(x - 3)} 202.2H${rd(x + 3)}`, STEEL_D, 1.8);
  }
  return out;
}

const ARM = {
  short: { d: 'M74 190Q52 192 47 212', hand: [46, 218] },
  mid: { d: 'M74 190Q47 194 40 240', hand: [39, 246] },
  long: { d: 'M74 190Q42 196 33 270', hand: [32, 276] },
  claws: { d: 'M74 190Q47 194 40 230', claw: [39, 240] },
};
// a pincer: a horseshoe with two pointed tips, open at the bottom
const CLAW = (sw) => P('M-17 6A17 17 0 0 1 17 6L14 24 5 17 7 7A7 7 0 0 0-7 7L-5 17-14 24Z', STEEL_DD, sw) + O(0, -4, 3.5, STEEL);
function oneArm(kind, sw) {
  const a = ARM[kind];
  if (!a) throw new Error(`Unknown arms: ${kind}`);
  let out = S(a.d, INK, sw + 13) + S(a.d, STEEL_D, 9);
  if (a.hand) out += C(a.hand[0], a.hand[1], 10.5, W, sw);
  if (a.claw) out += G(`translate(${a.claw[0]} ${a.claw[1]})`, CLAW(sw));
  return out;
}
/** The arms as they are drawn on an option button (100 x 100, left arm; the right one is mirrored). */
const PIC_ARM = {
  short: { d: 'M36 18Q20 20 17 36', hand: [16, 40] },
  mid: { d: 'M36 18Q17 21 13 58', hand: [12, 62] },
  long: { d: 'M36 18Q15 22 11 82', hand: [10, 86] },
  claws: { d: 'M36 18Q18 21 15 52', claw: [14, 62] },
};
const arms = (kind, sw) => oneArm(kind, sw) + G('translate(240 0) scale(-1 1)', oneArm(kind, sw));
const armsGhost = (sw) => DASH('circle cx="46" cy="208" r="13"', sw) + DASH('circle cx="194" cy="208" r="13"', sw);

const LEG = { 'legs-short': 22, legs: 40, 'legs-long': 62 };
const WHEEL = { 'wheels-small': 13, wheels: 19, 'wheels-big': 26 };
function bottom(kind, sw) {
  if (kind in LEG) {
    const len = LEG[kind];
    const leg = (x) => R(x, 244, 16, len + 8, 5, STEEL_D, sw) + R(x - 10, 246 + len, 36, 15, 7.5, STEEL_DD, sw);
    return leg(86) + leg(138);
  }
  if (kind in WHEEL) {
    const r = WHEEL[kind];
    const wheel = (x) => C(x, 256 + r, r, SLATE, sw) + C(x, 256 + r, r * 0.5, STEEL, sw * 0.7) + O(x, 256 + r, r * 0.16, INK);
    return R(80, 246, 80, 13, 6.5, STEEL_DD, sw) + wheel(90) + wheel(150);
  }
  if (kind === 'jet') {
    return P('M98 246H142L154 272H86Z', STEEL_D, sw) + R(82, 268, 76, 11, 5.5, STEEL_DD, sw) +
      P('M96 281C96 300 110 310 120 326C130 310 144 300 144 281Z', FLAME, sw) + F('M108 282C108 294 115 300 120 310C125 300 132 294 132 282Z', W);
  }
  throw new Error(`Unknown bottom: ${kind}`);
}
const bottomGhost = (sw) => DASH('rect x="84" y="258" width="72" height="42" rx="14"', sw);

// ---- the whole robot ---------------------------------------------------------------------

/**
 * The robot as it stands now. `spec` names a value for each part that is on the robot;
 * a missing head / body / arms / bottom is drawn as a dashed outline ("still to choose").
 * Missing eyes, nose, antennas and buttons are simply not there - unless they are listed in
 * `waiting` (parts he still has to choose), which get a small dashed marker where they will go.
 */
export function robotSVG(spec = {}, waiting = []) {
  for (const [part, value] of Object.entries(spec)) if (value !== undefined && value !== null) known(part, value);
  const has = (part) => spec[part] !== undefined && spec[part] !== null;
  const waits = (part) => waiting.includes(part); // a small part that is still to choose gets a dashed marker too
  const sw = 4.5;
  const ey = eyeY(spec.head);
  const inner =
    `<ellipse cx="120" cy="334" rx="${spec.bottom === 'jet' ? 44 : 74}" ry="7" fill="#000000" fill-opacity="0.3"/>` +
    (has('arms') ? arms(spec.arms, sw) : armsGhost(sw)) +
    (has('bottom') ? bottom(spec.bottom, sw) : bottomGhost(sw)) +
    neck(sw) +
    (has('body') ? body(spec.body, sw) : bodyGhost(sw)) +
    (has('buttons') ? buttons(spec.buttons, sw) : waits('buttons') ? DASH('rect x="88" y="190" width="64" height="30" rx="8"', sw) : '') +
    (has('antennas') ? antennas(spec.antennas, spec.head, sw) : waits('antennas') ? DASH(`circle cx="120" cy="${rd(headTop(spec.head, 0) - 16)}" r="10"`, sw) : '') +
    (has('head') ? head(spec.head, sw) : headGhost(sw)) +
    (has('eyes') ? eyes(spec.eyes, ey, sw) : waits('eyes') ? DASH(`rect x="86" y="${ey - 12}" width="68" height="24" rx="12"`, sw) : '') +
    (has('nose') ? nose(spec.nose, ey + 22, sw) : waits('nose') ? DASH(`circle cx="120" cy="${ey + 22}" r="7.5"`, sw) : '') +
    (has('head') ? mouth(ey + (has('nose') || waits('nose') ? 35 : 28), sw) : '');
  return wrap('bld-svg bld-svg-robot', G('translate(0 14)', inner), '0 0 240 358');
}

// ---- one picture per option (a close-up of that part) ------------------------------------

/** Show the box (x, y, w, h) of the robot's coordinates in a 100 x 100 picture. */
function closeUp(x, y, w, h, draw) {
  const s = 100 / Math.max(w, h);
  const sw = 4 / s;
  return G(`translate(${rd((100 - w * s) / 2 - x * s)} ${rd((100 - h * s) / 2 - y * s)}) scale(${rd(s * 1000) / 1000})`, draw(sw));
}

const PICTURES = {
  head: (v) => closeUp(34, 14, 172, 150, (sw) => head(v, sw) + mouth(eyeY(v) + 24, sw) + O(CX - 20, eyeY(v) + 2, 5, INK) + O(CX + 20, eyeY(v) + 2, 5, INK)),
  body: (v) => closeUp(56, 152, 128, 112, (sw) => body(v, sw)),
  nose: (v) => closeUp(70, 62, 100, 100, (sw) =>
    `<ellipse cx="120" cy="112" rx="46" ry="44" fill="${STEEL}" stroke="${INK}" stroke-width="${rd(sw)}"/>` +
    O(102, 92, 4.5, INK) + O(138, 92, 4.5, INK) + nose(v, 114, sw, 16) + S('M108 138Q120 146 132 138', INK, sw)),
  eyes: (v) => closeUp(70, 62, 100, 100, (sw) => R(74, 86, 92, 52, 22, STEEL, sw) + eyes(v, 112, sw, v === 1 ? 1.25 : v === 2 ? 1.1 : 1)),
  antennas: (v) => closeUp(62, 0, 116, 116, (sw) => antennas(v, 'round', sw) + P('M66 112C66 70 88 46 120 46S174 70 174 112Z', STEEL, sw) + S('M80 92Q84 68 102 60', W, sw * 1.3)),
  // the chest panel on its own, close enough to count the buttons
  buttons: (v) => closeUp(82, 180, 76, 50, (sw) => R(84, 186, 72, 38, 10, STEEL, sw) + S('M92 200V196Q92 193 95 193H102', W, sw) + buttons(v, sw * 1.3)),
  // a small chest with both arms, so the pair is seen at a glance
  arms: (v) => {
    const a = PIC_ARM[v];
    const one = S(a.d, INK, 15) + S(a.d, STEEL_D, 7) + (a.hand ? C(a.hand[0], a.hand[1], 8, W, 4) : G(`translate(${a.claw[0]} ${a.claw[1]}) scale(0.78)`, CLAW(5)));
    return one + G('translate(100 0) scale(-1 1)', one) + R(33, 8, 34, 40, 10, STEEL_D, 4) + R(40, 17, 20, 13, 4, STEEL, 3);
  },
  // the hips, and what the robot stands on
  bottom: (v) => closeUp(64, 232, 112, 102, (sw) => bottom(v, sw) + R(74, 234, 92, 20, 9, STEEL_D, sw)),
};

/** The picture on an option button: partSVG('head', 'round'), partSVG('eyes', 3), partSVG('body', 'red')... */
export function partSVG(part, value) {
  known(part, value);
  return wrap(`bld-svg bld-svg-${part}`, PICTURES[part](value), '0 0 100 100');
}
