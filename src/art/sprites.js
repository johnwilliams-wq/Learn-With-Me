// Game art for Learn With Me: every sprite is a small inline SVG string.
// Pure string building: runs unchanged in the browser and in Node (no DOM, no imports).
// Rules: no ids, defs, gradients, filters, <use>, <style> or text, so many copies can share a page.

export const PALETTE = {
  red: { main: '#e3242b', dark: '#9c1220', light: '#ff8478' },
  blue: { main: '#2478f0', dark: '#124aa8', light: '#86bdff' },
  green: { main: '#2bb24a', dark: '#17742f', light: '#93e594' },
  yellow: { main: '#ffd21c', dark: '#d39b00', light: '#fff29a' },
  purple: { main: '#8a3fd6', dark: '#5a1f9e', light: '#c79bf6' },
  orange: { main: '#ff8a1c', dark: '#c45a00', light: '#ffc27a' },
  gray: { main: '#9aa1b5', dark: '#6a7189', light: '#cdd2e0' },
};

export const OBJECT_KINDS = ['gem', 'key', 'potion', 'shield', 'sword', 'chest', 'map', 'star', 'coin', 'crown', 'bell', 'drum', 'torch', 'boot', 'book', 'mushroom', 'hat', 'ring', 'rocket', 'egg', 'flag', 'heart'];
export const CHARACTER_KINDS = ['robot', 'dragon', 'wizard', 'knight', 'cat', 'owl', 'ghost', 'fox'];

// ---- shared tones and tiny shape helpers -------------------------------------------------

const INK = '#1b1f3b';
const W = '#ffffff';
const STEEL = '#dfe5f0';
const STEEL_D = '#a4adc2';
const WOOD = '#b07a45';
const PAPER = '#fff4d9';
const SKIN = '#ffd3ad';
const GOLD = '#ffd447';
const PINK = '#ff9db0';
const FLAME = '#ffe45c';

const rd = (n) => Math.round(n * 10) / 10;
const RJ = 'stroke-linejoin="round" stroke-linecap="round"';
// P: outlined path. F: flat fill. S: stroke only. C/O: outlined / flat circle. E: ellipse. R: rect.
const P = (d, fill, sw = 4) => `<path d="${d}" fill="${fill}" stroke="${INK}" stroke-width="${sw}" ${RJ}/>`;
const F = (d, fill, op) => `<path d="${d}" fill="${fill}"${op ? ` fill-opacity="${op}"` : ''}/>`;
const S = (d, col = INK, sw = 4, extra = '') => `<path d="${d}" fill="none" stroke="${col}" stroke-width="${sw}" ${RJ}${extra}/>`;
const C = (cx, cy, r, fill, sw = 4) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" stroke="${INK}" stroke-width="${sw}"/>`;
const O = (cx, cy, r, fill, op) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}"${op ? ` fill-opacity="${op}"` : ''}/>`;
const E = (cx, cy, rx, ry, fill, sw = 4) => `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${fill}"${sw ? ` stroke="${INK}" stroke-width="${sw}"` : ''}/>`;
const R = (x, y, w, h, rx, fill, sw = 4) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}"${sw ? ` stroke="${INK}" stroke-width="${sw}" stroke-linejoin="round"` : ''}/>`;
const G = (transform, inner) => `<g transform="${transform}">${inner}</g>`;

const starD = (cx, cy, R1, r1, n = 5) => {
  let s = '';
  for (let i = 0; i < n * 2; i++) {
    const a = (Math.PI * i) / n - Math.PI / 2;
    const q = i % 2 ? r1 : R1;
    s += `${i ? 'L' : 'M'}${rd(cx + q * Math.cos(a))} ${rd(cy + q * Math.sin(a))}`;
  }
  return s + 'Z';
};
const ringD = (cx, cy, R1, r1) =>
  `M${cx} ${cy - R1}a${R1} ${R1} 0 0 1 0 ${2 * R1}a${R1} ${R1} 0 0 1 0-${2 * R1}ZM${cx} ${cy - r1}a${r1} ${r1} 0 0 0 0 ${2 * r1}a${r1} ${r1} 0 0 0 0-${2 * r1}Z`;
// A big friendly eye: white ball, dark pupil, glint.
const eye = (cx, cy, r = 8, dx = 0, dy = 1) =>
  C(cx, cy, r, W, 2.5) + O(cx + dx, cy + dy, rd(r * 0.58), INK) + O(rd(cx + dx + r * 0.22), rd(cy + dy - r * 0.26), rd(r * 0.2), W);
const flame = (x, y) =>
  G(`translate(${x} ${y})`,
    P('M0-22C10-12 16-4 14 6C13 14 7 19 0 19S-13 14-14 6C-15 0-11-4-8-8C-7-4-5-2-3-2C-5-10-4-16 0-22Z', FLAME, 3.5) +
    F('M0-2C4 2 6 6 5 10C4 14-4 14-5 10C-6 6-3 2 0-2Z', W));

// ---- objects ---------------------------------------------------------------------------

const OBJECTS = {
  gem: (m, d, l) =>
    F('M26 12H74L92 38 50 92 8 38Z', m) +
    F('M26 12 8 38H37Z', l) + F('M50 12 37 38H63Z', l) + F('M74 12 92 38H63Z', d) +
    F('M63 38H92L50 92Z', d) +
    F('M30 18H40L34 30H22Z', W, 0.8) +
    S('M8 38H92M26 12 37 38 50 92 63 38 74 12M37 38 50 12 63 38', INK, 2.5) +
    S('M26 12H74L92 38 50 92 8 38Z'),

  key: (m, d, l) =>
    G('rotate(-45 50 50)',
      P('M41 30H59V60H75V72H59V80H69V92H59V98H41Z', m) +
      F('M45 40H49V94H45Z', l) + F('M43 37H57V43H43Z', d) +
      `<path fill-rule="evenodd" d="${ringD(50, 16, 21, 9)}" fill="${m}" stroke="${INK}" stroke-width="4" ${RJ}/>` +
      S('M35 14A15 15 0 0 1 48 1', l, 4)),

  potion: (m, d, l) =>
    P('M42 4H58L57 17H43Z', WOOD) +
    F('M40 22V34C24 39 16 50 16 62A34 30 0 0 0 84 62C84 50 76 39 60 34V22Z', l) +
    F('M18 50Q34 42 50 50T82 50C83 54 84 58 84 62A34 30 0 0 1 16 62C16 58 17 54 18 50Z', m) +
    F('M50 92A34 30 0 0 0 84 62C84 58 83 54 82 50Q80 80 42 91.5Z', d) +
    O(42, 68, 5, l) + O(58, 62, 3.5, l) + O(54, 79, 3, l) +
    S('M25 60C25 71 30 80 37 84', W, 4.5) +
    S('M40 22V34C24 39 16 50 16 62A34 30 0 0 0 84 62C84 50 76 39 60 34V22') +
    R(34, 15, 32, 10, 5, m),

  shield: (m, d, l) =>
    F('M50 6C38 14 24 16 12 16V46C12 70 28 86 50 94C72 86 88 70 88 46V16C76 16 62 14 50 6Z', m) +
    F('M50 6C62 14 76 16 88 16V46C88 70 72 86 50 94Z', d) +
    S('M50 17C41 23 31 25 22 25V46C22 63 33 76 50 83C67 76 78 63 78 46V25C69 25 59 23 50 17Z', l, 4) +
    S('M50 6C38 14 24 16 12 16V46C12 70 28 86 50 94C72 86 88 70 88 46V16C76 16 62 14 50 6Z') +
    C(50, 48, 10, STEEL, 3.5) + O(47, 45, 3, W),

  sword: (m, d, l) =>
    G('rotate(45 50 50)',
      F('M50-6 62 10V63H38V10Z', m) + F('M50-6 62 10V63H50Z', d) + S('M44 16V56', l, 4) +
      S('M50-6 62 10V63H38V10Z') +
      R(45, 70, 10, 22, 3, WOOD) +
      R(20, 62, 60, 11, 5.5, STEEL) +
      C(50, 97, 7.5, STEEL)),

  chest: (m, d, l) =>
    F('M10 88V32C10 22 18 14 28 14H72C82 14 90 22 90 32V88Z', m) +
    F('M17 30C17 24 22 21 28 21H72C78 21 83 24 83 30V32H17Z', l) +
    F('M10 76H90V88H10Z', d) +
    R(21, 14, 11, 74, 0, d, 2.5) + R(68, 14, 11, 74, 0, d, 2.5) +
    S('M10 48H90', INK, 3.5) +
    S('M10 88V32C10 22 18 14 28 14H72C82 14 90 22 90 32V88Z') +
    R(41, 39, 18, 22, 5, STEEL, 3.5) + O(50, 47, 3.2, INK) + F('M48.4 48H51.6L52.6 56H47.4Z', INK),

  map: (m, d, l) =>
    P('M16 23C36 19 60 27 84 23V77C64 81 40 73 16 77Z', m) +
    F('M30 48 38 34 46 48Z', l) + F('M26 52 31 44 36 52Z', l) +
    S('M27 66C35 59 43 70 52 62S60 48 64 45', W, 5.5, ' stroke-dasharray="0.1 9.5"') +
    S('M62 30 78 46M78 30 62 46', INK, 10) + S('M62 30 78 46M78 30 62 46', W, 4.5) +
    R(7, 13, 15, 74, 7.5, d) + R(78, 13, 15, 74, 7.5, d) +
    S('M12 21V78', l, 3) + S('M83 21V78', l, 3),

  star: (m, d, l) =>
    P(starD(50, 54, 46, 22), m) + F(starD(50, 55, 21, 10), l) + O(37, 41, 4, W, 0.9),

  coin: (m, d, l) =>
    C(50, 54, 41, d) + C(50, 47, 41, m) +
    `<circle cx="50" cy="47" r="30" fill="none" stroke="${d}" stroke-width="4"/>` +
    R(43.5, 29, 13, 36, 5, l, 0) + S('M43.5 34V60', W, 3) +
    S('M17 41A34 34 0 0 1 38 15', W, 4),

  crown: (m, d, l) =>
    P('M14 84 10 32 31 52 50 18 69 52 90 32 86 84Z', m) +
    F('M50 22 66 52 50 68Z', d, 0.55) +
    R(13, 68, 74, 17, 4, d) +
    C(10, 30, 6, l, 3.5) + C(50, 16, 6.5, l, 3.5) + C(90, 30, 6, l, 3.5) +
    O(30, 76.5, 4, l) + O(70, 76.5, 4, l) + F('M50 70.5 56 76.5 50 82.5 44 76.5Z', W),

  bell: (m, d, l) =>
    C(50, 12, 6.5, d) +
    C(50, 86, 8.5, l) +
    F('M50 15C30 15 27 38 26 56C25 66 18 70 12 76H88C82 70 75 66 74 56C73 38 70 15 50 15Z', m) +
    F('M50 15C70 15 73 38 74 56C75 66 82 70 88 76H68C68 56 66 28 50 15Z', d) +
    S('M37 28C34 36 33 46 33 56', W, 4.5) +
    S('M50 15C30 15 27 38 26 56C25 66 18 70 12 76H88C82 70 75 66 74 56C73 38 70 15 50 15Z') +
    R(7, 71, 86, 11, 5.5, d),

  drum: (m, d, l) =>
    F('M10 34V76C10 86 28 93 50 93S90 86 90 76V34Z', m) +
    F('M10 34V45C10 55 28 62 50 62S90 55 90 45V34Z', d) +
    F('M10 66C10 76 28 83 50 83S90 76 90 66V76C90 86 72 93 50 93S10 86 10 76Z', d) +
    S('M13 55 25 76 37 61 50 83 63 61 75 76 87 55', W, 3.5) +
    S('M10 45C10 55 28 62 50 62S90 55 90 45M10 66C10 76 28 83 50 83S90 76 90 66', INK, 3) +
    S('M10 34V76C10 86 28 93 50 93S90 86 90 76V34') +
    E(50, 34, 40, 14, PAPER) +
    S('M26 9 56 34', INK, 9) + S('M26 9 56 34', WOOD, 4.5) + C(24, 8, 5, WOOD, 3) +
    S('M76 9 46 37', INK, 9) + S('M76 9 46 37', WOOD, 4.5) + C(78, 8, 5, WOOD, 3),

  torch: (m, d, l) =>
    G('translate(50 27) scale(1.15)', flame(0, 0)) +
    P('M40 62H60L56 92Q50 98 44 92Z', m) +
    F('M41.5 71H58.5L57.7 77H42.3Z', d) + F('M43 83H57L56.4 88H43.6Z', d) +
    P('M26 50H74L62 65H38Z', m) + F('M52 52H71L61 63H52Z', d, 0.6) +
    R(20, 41, 60, 11, 5.5, l),

  boot: (m, d, l) =>
    P('M16 80H90V88Q90 93 85 93H46L44 88H38V93H21Q16 93 16 88Z', d) +
    F('M22 18H54V50C54 56 58 58 66 60C80 63 88 70 88 82H18C20 64 22 44 22 18Z', m) +
    F('M70 61C81 64 88 71 88 82H66C66 73 67 66 70 61Z', d) +
    F('M21.5 44H54V53H21Z', d) + S('M27 26V40', l, 4) +
    S('M22 18H54V50C54 56 58 58 66 60C80 63 88 70 88 82H18C20 64 22 44 22 18Z') +
    R(35, 42, 11, 13, 2.5, STEEL, 3) +
    R(16, 8, 44, 17, 6, l),

  book: (m, d, l) =>
    P('M22 14H88V93H22Z', PAPER, 3.5) + S('M30 89.5H86M84 20V86', STEEL_D, 2) +
    R(12, 7, 70, 79, 6, m) +
    F('M14 13Q14 9 18 9H25V84H18Q14 84 14 80Z', d) + S('M26 8V85', INK, 3) +
    P(starD(54, 44, 21, 8, 4), l, 3) + O(54, 44, 4, W) +
    O(36, 17, 2.5, l) + O(73, 17, 2.5, l) + O(36, 75, 2.5, l) + O(73, 75, 2.5, l) +
    S('M12 13Q12 7 18 7H76Q82 7 82 13V80Q82 86 76 86H18Q12 86 12 80Z'),

  mushroom: (m, d, l) =>
    P('M35 58C35 74 31 82 33 89Q50 96 67 89C69 82 65 74 65 58Z', PAPER) +
    F('M8 52C8 26 28 8 50 8S92 26 92 52C92 62 78 65 50 65S8 62 8 52Z', m) +
    F('M92 52C92 62 78 65 50 65S8 62 8 52C20 58 80 58 92 52Z', d) +
    O(31, 34, 9, W) + O(60, 24, 6.5, W) + O(73, 43, 7.5, W) + O(49, 46, 4.5, W) + O(16, 48, 3.5, W) +
    S('M8 52C8 26 28 8 50 8S92 26 92 52C92 62 78 65 50 65S8 62 8 52Z'),

  hat: (m, d, l) =>
    E(50, 80, 44, 12, m) +
    F('M25 80 43 28Q49 6 72 8Q62 15 63 28L75 80Q50 89 25 80Z', m) +
    F('M57 10Q64 7 72 8Q62 15 63 28L75 80Q62 85 54 85Q60 50 57 10Z', d, 0.7) +
    F('M29 68Q50 77 72 68L75 80Q50 89 25 80Z', d) + S('M29 68Q50 77 72 68', INK, 3) +
    P(starD(45, 50, 8, 3.2, 4), l, 0) + F(starD(54, 33, 5, 2, 4), l) +
    S('M25 80 43 28Q49 6 72 8Q62 15 63 28L75 80') +
    R(43, 71, 14, 12, 2.5, STEEL, 3) + R(47.5, 75, 5, 4.5, 1, d, 0),

  ring: (m, d, l) =>
    `<path fill-rule="evenodd" d="${ringD(50, 61, 35, 20)}" fill="${m}" stroke="${INK}" stroke-width="4" ${RJ}/>` +
    S('M50 90.5A29.5 29.5 0 0 0 79.5 61', d, 5) + S('M22 53A29 29 0 0 1 37 35', W, 4.5) +
    P('M37 25H63L59 36H41Z', d) +
    P('M33 14 41 3H59L67 14 50 32Z', l) + F('M41 3H50L43 14H33Z', W) + S('M33 14H67', INK, 2.5),

  rocket: (m, d, l) =>
    flame(50, 82) +
    P('M35 46C22 54 15 66 15 82L37 73Z', d) + P('M65 46C78 54 85 66 85 82L63 73Z', d) +
    F('M50 3C65 15 71 36 68 58L64 77H36L32 58C29 36 35 15 50 3Z', m) +
    F('M50 6C56 11 60 18 62 25H38C40 18 44 11 50 6Z', l, 0.55) + S('M35 27H65', INK, 3) +
    F('M33.5 66H66.5L64 77H36Z', d) +
    S('M38 34C37 42 37 50 39 60', l, 4) +
    S('M50 3C65 15 71 36 68 58L64 77H36L32 58C29 36 35 15 50 3Z') +
    C(50, 46, 11, STEEL, 3.5) + C(50, 46, 6, l, 2.5),

  egg: (m, d, l) =>
    F('M50 7C72 7 87 40 87 60C87 80 71 93 50 93S13 80 13 60C13 40 28 7 50 7Z', m) +
    F('M87 60C87 80 71 93 50 93C38 93 28 89 21 82C50 90 80 78 86 50C87 54 87 57 87 60Z', d) +
    O(36, 40, 7.5, l) + O(62, 30, 5.5, l) + O(67, 58, 8.5, l) + O(38, 70, 6.5, l) + O(52, 52, 4, l) +
    S('M27 44C29 32 35 22 42 17', W, 4) +
    S('M50 7C72 7 87 40 87 60C87 80 71 93 50 93S13 80 13 60C13 40 28 7 50 7Z'),

  flag: (m, d, l) =>
    F('M22 14C40 3 60 27 93 13V60C60 74 40 50 22 61Z', m) +
    F('M22 50C40 39 60 63 93 49V60C60 74 40 50 22 61Z', d) +
    S('M29 23C44 16 58 30 74 29', l, 4.5) +
    S('M22 14C40 3 60 27 93 13V60C60 74 40 50 22 61Z') +
    R(8, 86, 24, 9, 4, STEEL_D, 3.5) +
    R(15.5, 9, 9, 80, 3, WOOD, 3.5) + C(20, 9, 6.5, STEEL, 3.5),

  heart: (m, d, l) =>
    F('M50 90C20 68 7 50 7 33C7 19 18 9 30 9C40 9 47 15 50 23C53 15 60 9 70 9C82 9 93 19 93 33C93 50 80 68 50 90Z', m) +
    F('M50 90C80 68 93 50 93 33C93 28 92 24 90 21C89 46 72 66 43 84Z', d) +
    S('M19 34C19 26 24 20 31 19', l, 6) + O(20, 41, 3, l) +
    S('M50 90C20 68 7 50 7 33C7 19 18 9 30 9C40 9 47 15 50 23C53 15 60 9 70 9C82 9 93 19 93 33C93 50 80 68 50 90Z'),
};

// ---- characters --------------------------------------------------------------------------

const CHARACTERS = {
  robot: (m, d, l) =>
    S('M50 15V8') + C(50, 7, 5, l, 3.5) +
    R(8, 28, 12, 16, 4, STEEL, 3.5) + R(80, 28, 12, 16, 4, STEEL, 3.5) +
    R(11, 64, 13, 23, 6.5, d) + R(76, 64, 13, 23, 6.5, d) +
    R(29, 84, 17, 11, 4, d) + R(54, 84, 17, 11, 4, d) +
    R(43, 54, 14, 10, 0, STEEL_D, 3.5) +
    R(24, 61, 52, 28, 8, m) + R(35, 67, 30, 15, 5, l, 3) + O(43, 74.5, 3.5, W) + O(57, 74.5, 3.5, d) +
    R(16, 14, 68, 44, 13, m) + S('M24 24Q26 20 32 20', l, 4) +
    eye(35, 33, 10) + eye(65, 33, 10) +
    R(39, 46, 22, 7, 3.5, W, 2.5) + S('M46.3 46v7M53.7 46v7', INK, 2),

  dragon: (m, d, l) =>
    P('M29 58C22 36 7 33 3 49C9 48 12 52 12 58C18 55 22 59 24 70Z', m, 3.5) +
    P('M71 58C78 36 93 33 97 49C91 48 88 52 88 58C82 55 78 59 76 70Z', m, 3.5) +
    S('M26 56C22 46 15 42 8 45M74 56C78 46 85 42 92 45', d, 2.5) +
    P('M66 82C78 90 90 86 92 76C86 80 80 78 72 72Z', m) + P('M87 73 97 67 96 81Z', d, 3) +
    E(37, 92, 10, 5.5, m) + E(63, 92, 10, 5.5, m) +
    E(50, 74, 25, 20, m) + E(50, 79, 15, 13, l, 0) + S('M40 75H60M39 82H61', d, 2.5) +
    P('M31 17 25 2 42 10Z', PAPER, 3.5) + P('M69 17 75 2 58 10Z', PAPER, 3.5) +
    P('M43.5 11 50 1 56.5 11Z', d, 3.5) +
    E(50, 35, 31, 26, m) +
    E(50, 49, 17, 10, l, 0) + O(44, 46, 2.2, INK) + O(56, 46, 2.2, INK) + S('M42 53Q50 59 58 53', INK, 2.5) +
    F('M45 55.5 47.5 60 50 56.7Z', W) +
    eye(35, 29, 10) + eye(65, 29, 10),

  wizard: (m, d, l) =>
    P('M15 95C17 74 30 62 50 62S83 74 85 95Z', m) + S('M50 86V95', d, 3) +
    E(50, 49, 21, 18, SKIN) +
    P('M29 54C29 76 42 89 50 93C58 89 71 76 71 54C62 64 38 64 29 54Z', W) +
    O(50, 56.5, 4.2, '#f3a57c') +
    eye(41, 48, 6.5) + eye(59, 48, 6.5) +
    E(50, 26, 38, 7.5, d) +
    P('M28 25 45 5Q52-2 59 5L72 25Q50 32.5 28 25Z', m) +
    F(starD(51, 16.5, 7, 2.8, 5), l),

  knight: (m, d, l) =>
    P('M48 15C44 1 62-4 77 4C67 8 62 12 59 21Z', l, 3.5) +
    P('M29 66H71L75 95H25Z', m) + F('M27 80H73L74 86H26Z', d) +
    P('M20 42C20 24 33 12 50 12S80 24 80 42V62C80 66 77 69 73 69H27C23 69 20 66 20 62Z', m) +
    S('M28 33C30 26 35 21 41 19', l, 4) +
    P('M28 36Q28 32 32 32H68Q72 32 72 36V51Q72 55 68 55H55V64H45V55H32Q28 55 28 51Z', '#2a3058', 3.5) +
    eye(39.5, 43.5, 8) + eye(60.5, 43.5, 8) +
    P('M8 64H34V79C34 87 28 93 21 96C14 93 8 87 8 79Z', l, 3.5) + F('M18.5 68H23.5V75H30V80H23.5V90H18.5V80H12V75H18.5Z', d) +
    P('M84 50 89 57V80H79V57Z', STEEL, 3) + R(74, 79, 20, 6, 3, d, 3) + R(81, 85, 6, 10, 2, WOOD, 3),

  cat: (m, d, l) =>
    S('M68 88C86 90 92 74 84 62', INK, 13) + S('M68 88C86 90 92 74 84 62', m, 5.5) +
    P('M28 95C26 78 34 62 50 62S74 78 72 95Z', m) + E(50, 83, 10, 11, l, 0) +
    E(40, 93, 7.5, 4.5, W, 3) + E(60, 93, 7.5, 4.5, W, 3) +
    P('M21 32 18 5 43 19Z', m) + P('M79 32 82 5 57 19Z', m) +
    F('M24.5 25 23 12 35 19Z', PINK) + F('M75.5 25 77 12 65 19Z', PINK) +
    E(50, 41, 33, 26, m) +
    S('M50 17V24M42 18 43.5 24M58 18 56.5 24', d, 3.5) +
    E(50, 51, 12, 8, l, 0) +
    F('M46 46.5H54L50 51.5Z', PINK) + S('M46 46.5H54L50 51.5Z', INK, 2) +
    S('M50 51.5V54M50 54Q46.5 58 43.5 55M50 54Q53.5 58 56.5 55', INK, 2.5) +
    S('M25 48 9 45M25 53 9 56M75 48 91 45M75 53 91 56', INK, 2.5) +
    eye(35, 38, 9.5) + eye(65, 38, 9.5),

  owl: (m, d, l) =>
    P('M21 32 18 8 42 18Z', m) + P('M79 32 82 8 58 18Z', m) +
    E(39, 93, 8, 4, GOLD, 3) + E(61, 93, 8, 4, GOLD, 3) +
    P('M50 12C74 12 85 32 85 56C85 80 70 92 50 92S15 80 15 56C15 32 26 12 50 12Z', m) +
    P('M15 52C9 64 13 78 24 85C21 73 21 62 22 52Z', d, 3.5) + P('M85 52C91 64 87 78 76 85C79 73 79 62 78 52Z', d, 3.5) +
    F('M50 56C62 56 68 65 68 74C68 84 60 89 50 89S32 84 32 74C32 65 38 56 50 56Z', l) +
    S('M40 69q5 5 10 0q5 5 10 0M40 78q5 5 10 0q5 5 10 0', d, 2.5) +
    C(35, 40, 15.5, l, 3) + C(65, 40, 15.5, l, 3) +
    eye(35, 40, 11) + eye(65, 40, 11) +
    P('M44.5 47H55.5L50 58Z', GOLD, 3),

  ghost: (m, d, l) =>
    P('M18 50C9 45 3 53 7 60C10 65 15 64 18 62Z', m) + P('M82 50C91 45 97 53 93 60C90 65 85 64 82 62Z', m) +
    P('M16 46C16 22 30 6 50 6S84 22 84 46C84 62 86 74 95 82C88 90 79 89 73 83C69 91 59 94 52 88C46 94 36 93 30 86C25 90 18 90 12 86C17 74 16 60 16 46Z', m) +
    S('M26 36C28 26 33 19 40 15', W, 4.5) +
    O(26, 54, 5.5, l) + O(74, 54, 5.5, l) +
    eye(37, 40, 11) + eye(63, 40, 11) +
    P('M41 57H59C59 65 55 70 50 70S41 65 41 57Z', INK, 2.5) + F('M45.5 66Q50 62 54.5 66Q52.5 69 50 69T45.5 66Z', PINK),

  fox: (m, d, l) =>
    P('M64 92C84 96 97 80 89 60C87 55 82 57 82 62C80 72 74 78 66 80Z', m) +
    F('M89.5 62C87.5 56 83 57.5 83 62C83 67 86 71 91 72C92 68 91 65 89.5 62Z', W) +
    P('M30 95C28 78 36 64 50 64S72 78 70 95Z', m) +
    F('M50 67C58 69 60 80 58 93H42C40 80 42 69 50 67Z', W) +
    P('M19 36 14 4 42 20Z', m) + P('M81 36 86 4 58 20Z', m) +
    F('M22.5 27 20 11 34 20Z', d) + F('M77.5 27 80 11 66 20Z', d) +
    F('M50 14C68 14 80 24 84 38L93 48C85 60 68 68 50 68S15 60 7 48L16 38C20 24 32 14 50 14Z', m) +
    F('M9 49C20 61 34 66.5 50 66.5S80 61 91 49C80 51 70 47 62 44C57 48 54 55 50 55S43 48 38 44C30 47 20 51 9 49Z', W) +
    S('M50 14C68 14 80 24 84 38L93 48C85 60 68 68 50 68S15 60 7 48L16 38C20 24 32 14 50 14Z') +
    E(50, 56, 5.5, 4, INK, 0) + S('M44.5 61.5Q50 65 55.5 61.5', INK, 2.5) +
    eye(35, 36, 9) + eye(65, 36, 9),
};

const DRAW = { ...OBJECTS, ...CHARACTERS };

const wrap = (cls, inner, box = '0 0 100 100', attrs = '') =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${box}" class="${cls}" aria-hidden="true"${attrs}>${inner}</svg>`;

const tones = (color) => {
  const t = Object.prototype.hasOwnProperty.call(PALETTE, color) ? PALETTE[color] : null;
  if (!t) throw new Error(`Unknown sprite colour: ${color}`);
  return t;
};

export function spriteSVG(kind, color = 'red') {
  const draw = Object.prototype.hasOwnProperty.call(DRAW, kind) ? DRAW[kind] : null;
  if (!draw) throw new Error(`Unknown sprite kind: ${kind}`);
  const t = tones(color);
  return wrap(`sprite sprite-${kind}`, draw(t.main, t.dark, t.light));
}

// ---- open chest (reward screen) --------------------------------------------------------

export function chestOpenSVG(color = 'yellow') {
  const { main: m, dark: d, light: l } = tones(color);
  const spark = (x, y, r) => P(starD(x, y, r, r * 0.36, 4), W, 2.5);
  return wrap('sprite sprite-chest-open',
    O(50, 40, 44, '#fff6b0', 0.22) + O(50, 42, 31, '#fff6b0', 0.3) +
    P('M13 52V28C13 16 22 8 34 8H66C78 8 87 16 87 28V52Z', d) +
    F('M21 50V29C21 21 27 16 35 16H65C73 16 79 21 79 29V50Z', INK, 0.35) +
    S('M13 30H87', INK, 3) +
    P('M15 60C16 46 26 39 36 43C40 33 56 32 61 41C70 36 84 44 85 60Z', GOLD) +
    E(34, 51, 8, 4.5, '#ffe98a', 2.5) + E(55, 45, 8, 4.5, '#ffe98a', 2.5) + E(71, 53, 8, 4.5, '#ffe98a', 2.5) + E(46, 56, 8, 4.5, '#ffe98a', 2.5) +
    F('M10 56H90V92H10Z', m) + F('M10 80H90V92H10Z', d) + F('M16 61H84V65H16Z', l) +
    R(21, 56, 11, 36, 0, d, 2.5) + R(68, 56, 11, 36, 0, d, 2.5) +
    S('M10 56H90V92H10Z') +
    R(41, 56, 18, 18, 5, STEEL, 3.5) + O(50, 63, 3, INK) + F('M48.5 64H51.5L52.4 70H47.6Z', INK) +
    spark(27, 26, 10) + spark(71, 19, 8.5) + spark(50, 29, 6) + spark(91, 40, 6) + spark(9, 43, 5.5));
}

// ---- Blip the guide --------------------------------------------------------------------

const TEAL = '#17b3a6';
const TEAL_D = '#0c7d76';
const TEAL_L = '#8cf0e4';
const GUIDE_MOODS = ['idle', 'talk', 'happy', 'oops', 'wait'];

export function guideSVG(mood = 'idle') {
  if (!GUIDE_MOODS.includes(mood)) throw new Error(`Unknown guide mood: ${mood}`);
  const arm = (d) => S(d, INK, 19) + S(d, TEAL, 9);
  const hand = (x, y) => C(x, y, 11, W, 5);
  const eyeL = E(79, 76, 9.5, 12.5, INK, 0) + O(82, 71, 3.6, W);
  const eyeR = E(121, 76, 9.5, 12.5, INK, 0) + O(124, 71, 3.6, W);
  const cheeks = O(66, 94, 5.5, TEAL_L) + O(134, 94, 5.5, TEAL_L);
  const armDownL = arm('M70 132Q50 140 47 160') + hand(46, 163);
  const armDownR = arm('M130 132Q150 140 153 160') + hand(154, 163);
  let face = eyeL + eyeR;
  let arms = armDownL + armDownR;
  let extra = '';
  let tilt = '';
  if (mood === 'idle') {
    face += S('M89 95Q100 104 111 95', INK, 5);
  } else if (mood === 'talk') {
    face += E(100, 98, 9.5, 7.5, INK, 0) + E(100, 101.5, 5, 3, PINK, 0);
    arms = armDownL + arm('M130 132Q152 138 164 124') + hand(167, 121);
    extra = S('M172 58Q182 76 172 94', TEAL_L, 6) + S('M184 46Q200 76 184 106', TEAL_L, 6) +
      S('M28 58Q18 76 28 94', TEAL_L, 6) + S('M16 46Q0 76 16 106', TEAL_L, 6);
  } else if (mood === 'happy') {
    face = S('M69 81Q79 64 89 81', INK, 6.5) + S('M111 81Q121 64 131 81', INK, 6.5) +
      F('M85 90H115Q113 106 100 106T85 90Z', INK) + F('M92 101Q100 95 108 101Q104 105 100 105T92 101Z', PINK);
    arms = arm('M70 132Q40 138 27 116') + hand(24, 111) + arm('M130 132Q160 138 173 116') + hand(176, 111);
    extra = P(starD(22, 62, 12, 4.4, 4), TEAL_L, 3.5) + P(starD(180, 56, 14, 5, 4), TEAL_L, 3.5) + P(starD(164, 22, 8, 3, 4), W, 3);
  } else if (mood === 'oops') {
    face = eyeL + S('M111 80Q121 68 131 80', INK, 6.5) + S('M90 95Q101 103 111 93', INK, 5);
    arms = armDownL + arm('M130 132Q168 138 172 108') + hand(171, 99);
    tilt = 'rotate(-6 100 124)';
  } else {
    face += S('M90 96Q100 102 110 96', INK, 5);
    arms = armDownL + arm('M130 132Q160 138 172 114') +
      R(158, 72, 32, 42, 12, W, 5) + S('M169 77v17M179 77v17', INK, 3.5);
  }
  const head =
    S('M100 36V22', INK, 5) + C(100, 16, 9.5, TEAL_L, 5) +
    R(30, 60, 20, 34, 9, TEAL_D, 5) + R(150, 60, 20, 34, 9, TEAL_D, 5) +
    R(40, 32, 120, 92, 40, TEAL, 5) + S('M54 62Q56 46 72 42', TEAL_L, 6) +
    R(56, 50, 88, 62, 28, W, 4) + cheeks + face;
  return wrap(`guide guide-${mood}`,
    E(100, 188, 46, 6, INK, 0).replace('/>', ' fill-opacity="0.25"/>') +
    R(70, 168, 26, 17, 8, TEAL_D, 5) + R(104, 168, 26, 17, 8, TEAL_D, 5) +
    R(66, 114, 68, 62, 24, W, 5) + C(100, 150, 13, TEAL, 5) + O(100, 150, 5.5, TEAL_L) +
    (tilt ? G(tilt, head) : head) + arms + extra,
    '0 0 200 200');
}

// ---- UI icons (currentColor) -----------------------------------------------------------

const CC = 'currentColor';
const IS = (d, sw) => `<path d="${d}" fill="none" stroke="${CC}" stroke-width="${sw}" ${RJ}/>`;
const IF = (d, sw = 0, rule = '') =>
  `<path d="${d}" fill="${CC}"${rule ? ' fill-rule="evenodd"' : ''}${sw ? ` stroke="${CC}" stroke-width="${sw}" ${RJ}` : ''}/>`;
const gearD = () => {
  let s = '';
  for (let i = 0; i < 8; i++) {
    const a = i * 45;
    for (const [r, o] of [[31, -15], [43, -9], [43, 9], [31, 15]]) {
      const t = ((a + o) * Math.PI) / 180;
      s += `${s ? 'L' : 'M'}${rd(50 + r * Math.cos(t))} ${rd(50 + r * Math.sin(t))}`;
    }
  }
  return s + 'ZM50 37a13 13 0 0 0 0 26a13 13 0 0 0 0-26Z';
};

const ICONS = {
  ear: () =>
    IS('M38 44C38 24 50 12 64 12C78 12 88 23 88 37C88 54 73 58 70 72C68 84 60 91 50 90C43 89 39 85 38 80', 9) +
    IS('M54 44C54 35 59 30 65 30C70 30 73 34 73 39C73 46 66 48 62 54', 7) +
    IS('M22 34Q13 46 22 58M9 26Q-3 46 9 66', 7),
  replay: () => IS('M72.6 29.4A32 32 0 1 1 27.4 29.4', 11) + IF('M43 13 40 41 16 21Z', 5),
  check: () => IS('M15 54 39 77 85 25', 15),
  hand: () =>
    `<rect x="26" y="26" width="11" height="40" rx="5.5" fill="${CC}"/><rect x="39" y="12" width="11" height="50" rx="5.5" fill="${CC}"/>` +
    `<rect x="52" y="10" width="11" height="52" rx="5.5" fill="${CC}"/><rect x="65" y="18" width="11" height="46" rx="5.5" fill="${CC}"/>` +
    `<rect x="26" y="46" width="50" height="46" rx="18" fill="${CC}"/>` + IS('M30 70 14 52', 12),
  lock: () =>
    IS('M32 46V33a18 18 0 0 1 36 0V46', 10) +
    IF('M24 44H76Q84 44 84 52V84Q84 92 76 92H24Q16 92 16 84V52Q16 44 24 44ZM50 58a7 7 0 0 0-3.5 13V80H53.5V71A7 7 0 0 0 50 58Z', 0, 'evenodd'),
  play: () => IF('M30 16 84 50 30 84Z', 10),
  home: () => IF('M50 14 10 50H21V86H42V63H58V86H79V50H90Z', 6),
  back: () => IS('M50 18 18 50 50 82M20 50H84', 14),
  gear: () => IF(gearD(), 4, 'evenodd'),
  star: () => IF(starD(50, 54, 43, 20), 6),
  'star-empty': () => IS(starD(50, 54, 42, 20), 7),
  speaker: () => IF('M14 38H30L52 20V80L30 62H14Z', 6) + IS('M66 36Q76 50 66 64M77 23Q96 50 77 77', 8),
  cards: () =>
    `<rect x="16" y="16" width="44" height="60" rx="8" fill="none" stroke="${CC}" stroke-width="7" transform="rotate(-12 38 46)"/>` +
    `<rect x="42" y="24" width="44" height="62" rx="8" fill="${CC}" transform="rotate(8 64 55)"/>`,
  parent: () =>
    `<circle cx="36" cy="22" r="14" fill="${CC}"/>` + IF('M12 93V62C12 48 22 41 36 41S60 48 60 62V93Z') +
    `<circle cx="77" cy="50" r="10" fill="${CC}"/>` + IF('M63 93V78C63 69 69 64 77 64S91 69 91 78V93Z'),
  close: () => IS('M22 22 78 78M78 22 22 78', 15),
  // a wrapped present: lid and box split by a ribbon, with a bow on top
  gift: () =>
    `<rect x="10" y="32" width="32" height="15" rx="4" fill="${CC}"/><rect x="58" y="32" width="32" height="15" rx="4" fill="${CC}"/>` +
    `<rect x="16" y="53" width="26" height="37" rx="4" fill="${CC}"/><rect x="58" y="53" width="26" height="37" rx="4" fill="${CC}"/>` +
    `<rect x="46" y="32" width="8" height="58" rx="2" fill="${CC}"/>` +
    `<circle cx="37" cy="19" r="9" fill="none" stroke="${CC}" stroke-width="7"/><circle cx="63" cy="19" r="9" fill="none" stroke="${CC}" stroke-width="7"/>`,
  // expectations: a round badge with a tick
  expect: () => `<circle cx="50" cy="50" r="38" fill="none" stroke="${CC}" stroke-width="9"/>` + IS('M31 51 45 65 70 36', 11),
  // a camera: body with a ring-shaped lens
  camera: () =>
    IF('M12 34Q12 26 20 26H32L38 16H62L68 26H80Q88 26 88 34V76Q88 84 80 84H20Q12 84 12 76ZM50 38a17 17 0 1 0 0.01 0ZM50 47a8 8 0 1 0 0.01 0Z', 0, 'evenodd'),
  // a to-do list: a card with two ticked lines
  chores: () =>
    IF('M22 12H78Q86 12 86 20V82Q86 90 78 90H22Q14 90 14 82V20Q14 12 22 12ZM25 35 33 43 46 28 41 23 33 32 30 30ZM53 29H76V38H53ZM25 64 33 72 46 57 41 52 33 61 30 59ZM53 58H76V67H53Z', 0, 'evenodd'),
};

export function iconSVG(name) {
  const draw = Object.prototype.hasOwnProperty.call(ICONS, name) ? ICONS[name] : null;
  if (!draw) throw new Error(`Unknown icon: ${name}`);
  return wrap(`icon icon-${name}`, draw(), '0 0 100 100', ` fill="${CC}"`);
}
