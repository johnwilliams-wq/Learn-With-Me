// Art for Move and Pack (activity type "put"): the places things are put into, onto or under.
// Same rules as sprites.js: pure strings, no ids, defs, gradients, filters, <use>, <style> or text.
//
// Every container is drawn in two layers with the same view box, so the things inside can sit
// BETWEEN them and look as if they are really in it:
//   placeSVG(kind, 'back')   the inside and the far rim (an open lid, a flap...)
//   placeSVG(kind, 'front')  the near wall, drawn over the feet of the things inside
// In the view box (200 wide, 150 high) things stand on the line y = FLOOR.
// The table is one layer only: things stand on its top or go between its legs.

export const CONTAINER_KINDS = ['chest', 'bag', 'basket', 'pot', 'cart'];
export const PLACE_KINDS = [...CONTAINER_KINDS, 'table'];
/** Size of each kind's view box, and where the things inside stand (y of their feet). */
export const PLACE_BOX = { w: 200, h: 150, floor: 63 };
/** The table: its own view box, the top surface (y) and the room between its legs. */
export const TABLE_BOX = { w: 200, h: 112, top: 8, under: { x: 26, y: 30, w: 148, h: 78 } };

const INK = '#1b1f3b';
const W = '#ffffff';
const DARK = '#141427';
const STEEL = '#dfe5f0';
const STEEL_D = '#a4adc2';
const STEEL_DD = '#7b849c';
const WOOD = '#b9793f';
const WOOD_D = '#8a5527';
const WOOD_L = '#d79a5d';
const WOOD_IN = '#4a2c14';
const GOLD = '#f3c44f';
const GOLD_D = '#bb8a22';
const STRAW = '#ecc070';
const STRAW_D = '#b98a3c';
const STRAW_L = '#ffe2a0';
const STRAW_IN = '#5e3d17';
const CLOTH = '#6fa3c9';
const CLOTH_D = '#44779f';
const CLOTH_L = '#a8cde8';
const CLOTH_IN = '#1f3a52';
const LEATHER = '#c98f52';
const PINE = '#e3b677';
const PINE_D = '#b98848';
const PINE_L = '#f6d6a2';
const WHEEL = '#59607a';
const RJ = 'stroke-linejoin="round" stroke-linecap="round"';

const P = (d, fill, sw = 5) => `<path d="${d}" fill="${fill}" stroke="${INK}" stroke-width="${sw}" ${RJ}/>`;
const F = (d, fill, op) => `<path d="${d}" fill="${fill}"${op ? ` fill-opacity="${op}"` : ''}/>`;
const S = (d, col = INK, sw = 5) => `<path d="${d}" fill="none" stroke="${col}" stroke-width="${sw}" ${RJ}/>`;
const C = (cx, cy, r, fill, sw = 5) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" stroke="${INK}" stroke-width="${sw}"/>`;
const O = (cx, cy, r, fill) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}"/>`;
const E = (cx, cy, rx, ry, fill, sw = 5) => `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${fill}"${sw ? ` stroke="${INK}" stroke-width="${sw}"` : ''}/>`;
const R = (x, y, w, h, rx, fill, sw = 5) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}"${sw ? ` stroke="${INK}" stroke-width="${sw}" stroke-linejoin="round"` : ''}/>`;

const DRAW = {
  // A treasure chest: dark wood, gold bands, a big lock. The lid stands open behind.
  chest: {
    back:
      P('M20 62V30C20 14 32 4 48 4H152C168 4 180 14 180 30V62Z', WOOD_D) +
      F('M32 60V32C32 22 40 16 50 16H150C160 16 168 22 168 32V60Z', WOOD_IN) +
      R(42, 4, 16, 58, 0, GOLD_D, 4) + R(142, 4, 16, 58, 0, GOLD_D, 4) +
      R(16, 50, 168, 30, 4, WOOD_IN),
    front:
      P('M12 62H188V138C188 143 184 147 179 147H21C16 147 12 143 12 138Z', WOOD) +
      F('M14.5 124H185.5V138C185.5 141.5 183 144.5 179 144.5H21C17 144.5 14.5 141.5 14.5 138Z', WOOD_D) +
      S('M12 92H188', WOOD_D, 3.5) + S('M12 121H188', INK, 3) +
      R(34, 62, 18, 85, 0, GOLD, 4) + R(148, 62, 18, 85, 0, GOLD, 4) +
      O(43, 76, 3, GOLD_D) + O(43, 134, 3, GOLD_D) + O(157, 76, 3, GOLD_D) + O(157, 134, 3, GOLD_D) +
      R(7, 56, 186, 15, 6, GOLD) + F('M14 59H186V62.5H14Z', W, 0.55) +
      R(84, 64, 32, 38, 8, STEEL) + O(100, 79, 5.5, INK) + F('M97 80H103L105 94H95Z', INK),
  },
  // A backpack: blue cloth, an open flap, a front pocket with a buckle, two leather straps.
  bag: {
    back:
      S('M82 30C82 4 118 4 118 30', INK, 14) + S('M82 30C82 4 118 4 118 30', LEATHER, 6) +
      P('M40 70C34 42 56 22 100 22S166 42 160 70Z', CLOTH_D) +
      F('M52 68C48 48 66 34 100 34S152 48 148 68Z', CLOTH_IN) +
      E(100, 64, 66, 14, CLOTH_IN, 0),
    front:
      P('M20 82C8 86 4 98 6 112S14 136 24 138L30 122C24 118 22 104 28 98Z', LEATHER, 4) +
      P('M180 82C192 86 196 98 194 112S186 136 176 138L170 122C176 118 178 104 172 98Z', LEATHER, 4) +
      P('M30 66Q100 86 170 66L178 126C180 139 171 147 159 147H41C29 147 20 139 22 126Z', CLOTH) +
      F('M174 96 178 126C180 139 171 147 159 147H41C29 147 20 139 22 126L24 112C60 134 140 134 174 96Z', CLOTH_D, 0.55) +
      P('M62 102H138V128C138 134 134 138 128 138H72C66 138 62 134 62 128Z', CLOTH_L, 4) +
      S('M70 112H130', CLOTH_D, 3.5) +
      P('M92 74H108V112C108 115 106 117 103 117H97C94 117 92 115 92 112Z', LEATHER, 4) +
      R(88, 96, 24, 15, 4, GOLD, 4) + S('M100 99V108', INK, 3.5) +
      P('M28 62Q100 82 172 62V72Q100 93 28 72Z', CLOTH_L, 4.5),
  },
  // A woven straw basket with a thick rim and two little handles.
  basket: {
    back:
      S('M22 60C4 46 10 30 28 40', INK, 13) + S('M22 60C4 46 10 30 28 40', STRAW_D, 6) +
      S('M178 60C196 46 190 30 172 40', INK, 13) + S('M178 60C196 46 190 30 172 40', STRAW_D, 6) +
      E(100, 60, 86, 20, STRAW_D) + E(100, 63, 76, 14, STRAW_IN, 0),
    front:
      P('M16 64Q100 92 184 64L168 137C167 143 162 147 156 147H44C38 147 33 143 32 137Z', STRAW) +
      F('M176 100 168 137C167 143 162 147 156 147H44C38 147 33 143 32 137L28 118C70 138 140 136 176 100Z', STRAW_D, 0.45) +
      S('M24 94Q100 120 176 94', STRAW_D, 4) + S('M29 118Q100 142 171 118', STRAW_D, 4) +
      S('M52 78 60 146M76 84 80 147M100 86V147M124 84 120 147M148 78 140 146', STRAW_D, 4) +
      P('M11 58Q100 88 189 58V70Q100 100 11 70Z', STRAW_L, 4.5) +
      S('M30 70 36 82M52 77 56 89M76 82 78 94M100 84V96M124 82 122 94M148 77 144 89M170 70 164 82', STRAW_D, 3.5),
  },
  // A cooking pot: shiny steel, a wide rim, two loop handles.
  pot: {
    back:
      E(100, 58, 84, 20, STEEL_D) + E(100, 61, 73, 13, DARK, 0),
    front:
      S('M22 84C0 82 0 112 24 110', INK, 15) + S('M22 84C0 82 0 112 24 110', STEEL_D, 7) +
      S('M178 84C200 82 200 112 176 110', INK, 15) + S('M178 84C200 82 200 112 176 110', STEEL_D, 7) +
      P('M20 62Q100 88 180 62V108C180 132 148 147 100 147S20 132 20 108Z', STEEL) +
      F('M177.5 92V108C177.5 130 146 144.5 100 144.5S22.5 130 22.5 108V104C50 132 150 134 177.5 92Z', STEEL_D) +
      S('M38 92C38 112 48 124 62 131', W, 7) +
      P('M13 56Q100 86 187 56V68Q100 98 13 68Z', STEEL, 4.5) + S('M26 66Q100 90 174 66', W, 3) +
      S('M70 147H130', STEEL_DD, 4),
  },
  // A wooden cart: pale planks, two big wheels and a handle to pull it.
  cart: {
    back:
      S('M172 70 196 30', INK, 13) + S('M172 70 196 30', PINE_D, 6) + C(194, 30, 7, PINE_D, 4) +
      P('M20 46H180V78H20Z', PINE_D) + R(26, 54, 148, 24, 2, WOOD_IN, 0),
    front:
      P('M10 62H190L180 118H20Z', PINE) +
      F('M186 86 180.5 115.5H19.5L17 102C70 110 140 108 186 86Z', PINE_D, 0.5) +
      S('M14 81H186M17 99H183', PINE_D, 3.5) +
      R(28, 62, 12, 56, 0, PINE_D, 4) + R(160, 62, 12, 56, 0, PINE_D, 4) +
      R(6, 56, 188, 13, 5, PINE_L, 4.5) +
      C(54, 122, 25, WHEEL) + C(54, 122, 15, STEEL_D, 3.5) + O(54, 122, 5, INK) +
      S('M54 107V137M39 122H69', INK, 3) +
      C(146, 122, 25, WHEEL) + C(146, 122, 15, STEEL_D, 3.5) + O(146, 122, 5, INK) +
      S('M146 107V137M131 122H161', INK, 3),
  },
};

const TABLE =
  // legs first, then the apron under the top, then the thick top with a light edge
  R(8, 22, 16, 88, 4, WOOD_D) + R(176, 22, 16, 88, 4, WOOD_D) +
  F('M11 26H15V104H11Z', WOOD, 0.8) + F('M179 26H183V104H179Z', WOOD, 0.8) +
  R(16, 22, 168, 11, 2, WOOD_D, 4) +
  R(3, 8, 194, 20, 7, WOOD_L) + F('M10 11.5H190V15.5H10Z', W, 0.5) + S('M8 22H192', WOOD, 3);

const svg = (cls, box, inner) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${box.w} ${box.h}" class="${cls}" aria-hidden="true">${inner}</svg>`;

/**
 * A place, as one layer.
 * @param kind  'chest' | 'bag' | 'basket' | 'pot' | 'cart' | 'table'
 * @param layer 'back' | 'front' for containers (the table has a single layer and ignores it)
 */
export function placeSVG(kind, layer = 'front') {
  if (kind === 'table') return svg('put-art put-art-table', TABLE_BOX, TABLE);
  const draw = Object.prototype.hasOwnProperty.call(DRAW, kind) ? DRAW[kind] : null;
  if (!draw) throw new Error(`Unknown place: ${kind}`);
  if (layer !== 'back' && layer !== 'front') throw new Error(`Unknown layer: ${layer}`);
  return svg(`put-art put-art-${kind} put-art-${layer}`, PLACE_BOX, draw[layer]);
}
