// Art for the reward mine: ore blocks, what he finds in them, and his pickaxe.
// Inline SVG in the same flat style as sprites.js (no ids, defs or text), all on a 64 x 64 grid.
// Original drawings: the mine is our own, not a copy of any other game's blocks.

const INK = '#1b2140';

/** The ores from the surface down: the first reward is found in coal, the deepest in star ore. */
export const ORES = ['coal', 'ruby', 'copper', 'iron', 'gold', 'emerald', 'lapis', 'diamond', 'star'];
const TONES = {
  coal: { main: '#2a2c3a', light: '#5b5f78', dark: '#12131b', find: 'lump' },
  ruby: { main: '#e5383b', light: '#ff8a8c', dark: '#9d1c1f', find: 'crystal' },
  copper: { main: '#e07a3f', light: '#f7b184', dark: '#9c4a1c', find: 'ingot' },
  iron: { main: '#d9c5b0', light: '#f5ebe0', dark: '#9c8873', find: 'ingot' },
  gold: { main: '#ffcf33', light: '#fff0a3', dark: '#c98f00', find: 'ingot' },
  emerald: { main: '#22c55e', light: '#9df5bd', dark: '#0f7a38', find: 'gem' },
  lapis: { main: '#2f5fe0', light: '#8fb0ff', dark: '#1a3a9c', find: 'gem' },
  diamond: { main: '#4fd8e8', light: '#c9f8fc', dark: '#1e97a8', find: 'gem' },
  star: { main: '#b56bff', light: '#f3d6ff', dark: '#6a2fb5', find: 'star' },
};

/** The ore of the n-th reward (0 = the first). Past the last ore every reward is star ore. */
export const oreFor = (index) => ORES[Math.max(0, Math.min(Math.floor(index) || 0, ORES.length - 1))];

const wrap = (body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" class="mine-art" aria-hidden="true">${body}</svg>`;
const poly = (points, fill, stroke = 'none', width = 0) => `<polygon points="${points}" fill="${fill}"${stroke === 'none' ? '' : ` stroke="${stroke}" stroke-width="${width}" stroke-linejoin="round"`}/>`;
const line = (d, stroke, width) => `<path d="${d}" fill="none" stroke="${stroke}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"/>`;
const tone = (kind) => {
  const t = TONES[kind];
  if (!t) throw new Error(`Unknown ore: ${kind}`);
  return t;
};

// One nugget: a little four-cornered chunk with a lit edge. [x, y] is its top-left corner, s its size.
const nugget = (x, y, s, t) =>
  poly(`${x + s * 0.2},${y} ${x + s},${y + s * 0.15} ${x + s * 0.85},${y + s} ${x},${y + s * 0.8}`, t.main, t.dark, 2)
  + poly(`${x + s * 0.3},${y + s * 0.18} ${x + s * 0.7},${y + s * 0.24} ${x + s * 0.4},${y + s * 0.5}`, t.light);

/** A block of rock with the ore in it. `deep` = the darker rock far down. */
export function oreBlockSVG(kind, deep = false) {
  const t = tone(kind);
  const rock = deep ? '#555b75' : '#8188a0';
  const shade = deep ? '#3f445b' : '#666d85';
  const spots = [[9, 9, 15], [35, 7, 13], [22, 25, 17], [43, 33, 13], [10, 42, 14], [31, 46, 11]];
  return wrap(
    `<rect x="3" y="3" width="58" height="58" rx="9" fill="${rock}" stroke="${INK}" stroke-width="3"/>`
    + poly('61,26 61,52 52,61 20,61', shade)
    + line('M6 33 L15 30 L19 36', shade, 2.5) + line('M44 5 L41 14 L48 19', shade, 2.5)
    + spots.map(([x, y, s]) => nugget(x, y, s, t)).join('')
    + `<rect x="3" y="3" width="58" height="58" rx="9" fill="none" stroke="${INK}" stroke-width="3"/>`,
  );
}

/** What comes out of the ore: a lump of coal, crystals, an ingot, a cut gem or a star. */
export function findSVG(kind) {
  const t = tone(kind);
  const shapes = {
    lump: () => poly('14,40 20,20 36,12 52,24 54,42 40,54 22,52', t.main, INK, 3)
      + poly('22,24 35,17 33,30', t.light) + poly('38,34 48,30 44,44', t.light) + poly('20,40 30,38 26,48', t.dark),
    crystal: () => poly('10,54 12,30 19,22 26,30 26,54', t.main, INK, 3) + poly('24,54 26,18 34,8 42,18 42,54', t.main, INK, 3)
      + poly('40,54 42,34 48,27 54,34 54,54', t.main, INK, 3)
      + poly('28,20 34,12 34,50 28,50', t.light) + poly('13,32 19,25 19,52 13,52', t.light) + poly('43,36 48,30 48,52 43,52', t.light),
    ingot: () => poly('8,44 18,24 50,24 58,44', t.main, INK, 3) + poly('8,44 58,44 56,54 10,54', t.dark, INK, 3)
      + poly('20,28 46,28 49,36 17,36', t.light),
    gem: () => poly('32,58 6,26 16,10 48,10 58,26', t.main, INK, 3)
      + poly('16,10 48,10 42,26 22,26', t.light) + poly('6,26 22,26 32,58', t.dark) + poly('22,26 42,26 32,58', t.main)
      + line('M6 26 L58 26', INK, 2) + line('M22 26 L16 10', INK, 2) + line('M42 26 L48 10', INK, 2) + line('M22 26 L32 58 L42 26', INK, 2),
    star: () => poly('32,4 39,25 60,32 39,39 32,60 25,39 4,32 25,25', t.main, INK, 3)
      + poly('32,12 36,28 32,32 28,28', t.light) + poly('12,32 28,28 32,32 28,36', t.light)
      + `<circle cx="51" cy="13" r="3" fill="${t.light}"/><circle cx="12" cy="50" r="2.5" fill="${t.light}"/><circle cx="52" cy="52" r="2" fill="#ffffff"/>`,
  };
  return wrap(shapes[t.find]());
}

/** His pickaxe. */
export function pickSVG() {
  return wrap(
    line('M14 54 L42 22', INK, 11) + line('M14 54 L42 22', '#b9773d', 6)
    + line('M22 12 Q44 8 56 34', INK, 13) + line('M22 12 Q44 8 56 34', '#c9d2e6', 8)
    + line('M26 13 Q40 11 50 24', '#ffffff', 2.5),
  );
}
