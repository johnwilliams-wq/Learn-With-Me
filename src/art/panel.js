// Art for the "panel" activity (Control Room): chunky spaceship controls as inline SVG strings.
// Same rules as sprites.js: pure string building, no ids, defs, gradients, filters, <use>,
// <style> or text, so many copies can share a page. Digits are drawn by the page as HTML text.
//
//   buttonSVG(color)           a round push button (the cap is the group .pnl-cap, so CSS can push it in)
//   switchSVG(color, pos)      a two-position lever switch, pos = 'up' | 'down'
//   dialSVG(value)             a gauge with ten marks and a pointer on mark `value` (0-9)
//   lightSVG(color)            a status beacon, 'red' | 'green' (only to look at)
//   launchSVG(pressed)         the big launch button with a rocket on it
//   stepSVG(dir)               the plus (1) or minus (-1) sign for the dial's buttons

import { PALETTE } from './sprites.js';

const INK = '#1b1f3b';
const W = '#ffffff';
const STEEL = '#dfe5f0';
const STEEL_D = '#a4adc2';
const WELL = '#1a2147';
const GOLD = '#ffd447';
const FLAME = '#ffb347';
const MINT = '#3ddc97';

const rd = (n) => Math.round(n * 10) / 10;
const svg = (name, box, inner) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${box}" class="pnl-art pnl-art-${name}" aria-hidden="true">${inner}</svg>`;
const tones = (color) => {
  if (!Object.prototype.hasOwnProperty.call(PALETTE, color)) throw new Error(`Unknown colour: ${color}`);
  return PALETTE[color];
};
const circle = (cx, cy, r, fill, sw = 4) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}"${sw ? ` stroke="${INK}" stroke-width="${sw}"` : ''}/>`;
const dot = (cx, cy, r, fill, op) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}"${op ? ` fill-opacity="${op}"` : ''}/>`;
const rect = (x, y, w, h, rx, fill, sw = 4) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}"${sw ? ` stroke="${INK}" stroke-width="${sw}" stroke-linejoin="round"` : ''}/>`;
const line = (d, col, sw, op) => `<path d="${d}" fill="none" stroke="${col}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"${op ? ` stroke-opacity="${op}"` : ''}/>`;
const shape = (d, fill, sw = 4) => `<path d="${d}" fill="${fill}"${sw ? ` stroke="${INK}" stroke-width="${sw}" stroke-linejoin="round" stroke-linecap="round"` : ''}/>`;

/** A round push button: steel collar, dark well, and a fat coloured cap standing proud of it. */
export function buttonSVG(color) {
  const t = tones(color);
  return svg('button', '0 0 100 100',
    circle(50, 52, 45, STEEL_D) + dot(50, 49, 41, STEEL) + circle(50, 52, 35, WELL, 3) +
    circle(50, 59, 30, t.dark) +
    `<g class="pnl-cap">${circle(50, 47, 30, t.main)}${line('M30 40A22 22 0 0 1 50 25', t.light, 7)}${dot(33, 37, 4, W, 0.8)}</g>`);
}

/** A lever switch on a steel plate: a fat coloured handle that points up or down from its pivot. */
export function switchSVG(color, pos) {
  const t = tones(color);
  if (pos !== 'up' && pos !== 'down') throw new Error(`Unknown switch position: ${pos}`);
  const up = pos === 'up';
  // the handle: narrow at the pivot (y 60), wide and round at its free end
  const handle = up ? 'M31 62 25 31A15 15 0 0 1 55 31L49 62Z' : 'M31 58 25 89A15 15 0 0 0 55 89L49 58Z';
  const shine = up ? 'M35 50 32 32A8 8 0 0 1 38 24' : 'M35 68 32 86';
  return svg(`switch pnl-art-switch-${pos}`, '0 0 80 120',
    rect(5, 5, 70, 110, 16, STEEL) + rect(11, 11, 58, 98, 11, t.light, 0) +
    dot(18, 18, 3, STEEL_D) + dot(62, 18, 3, STEEL_D) + dot(18, 102, 3, STEEL_D) + dot(62, 102, 3, STEEL_D) +
    circle(40, 60, 17, WELL, 3) +
    shape(handle, t.main) + line(shine, t.light, 5) +
    circle(40, 60, 9, STEEL_D, 3) + dot(40, 60, 3, INK));
}

/** The angle (degrees, 0 = right, clockwise on screen) of mark n on the dial: 0 bottom-left ... 9 bottom-right. */
const markAngle = (n) => 135 + n * 30;

/** A gauge: ten marks around the rim, the current one lit, and a pointer aimed at it. The digit goes on top as text. */
export function dialSVG(value) {
  if (!Number.isInteger(value) || value < 0 || value > 9) throw new Error(`Unknown dial value: ${value}`);
  let marks = '';
  for (let n = 0; n <= 9; n++) {
    const a = (markAngle(n) * Math.PI) / 180;
    marks += n === value ? circle(rd(60 + 50 * Math.cos(a)), rd(60 + 50 * Math.sin(a)), 6, GOLD, 2.5) : dot(rd(60 + 50 * Math.cos(a)), rd(60 + 50 * Math.sin(a)), 3.2, INK);
  }
  const pointer = `<g transform="rotate(${markAngle(value)} 60 60)">${shape('M102 60 91 53.5V66.5Z', GOLD, 2.5)}</g>`;
  return svg('dial', '0 0 120 120', circle(60, 60, 57, STEEL) + circle(60, 60, 43, WELL, 3) + marks + pointer);
}

/** A status beacon: a glowing dome on a steel foot, with little rays. Not a button. */
export function lightSVG(color) {
  if (color !== 'red' && color !== 'green') throw new Error(`Unknown light colour: ${color}`);
  const t = tones(color);
  return svg(`light pnl-art-light-${color}`, '0 0 80 120',
    dot(40, 52, 38, t.main, 0.32) +
    line('M40 5V13M12 22 18 28M68 22 62 28M4 52H10M76 52H70', t.light, 5) +
    shape('M19 78V50A21 21 0 0 1 61 50V78Z', t.main) +
    line('M28 52A12 12 0 0 1 38 39', t.light, 6) + dot(30, 62, 3, W, 0.7) +
    rect(11, 76, 58, 16, 6, STEEL_D) + rect(23, 92, 34, 16, 5, '#5a6388'));
}

/** The launch button: wide and white with a rocket on it. Pressed = pushed in, lit, rocket firing. */
export function launchSVG(pressed = false) {
  const y = pressed ? 9 : 0; // the cap sinks into its housing
  const rocket =
    shape('M84 26 62 14 72 34ZM84 64 62 76 72 56Z', INK, 0) +
    shape('M70 45C70 31 104 27 132 30C148 32 160 39 166 45C160 51 148 58 132 60C104 63 70 59 70 45Z', INK, 0) +
    dot(130, 45, 7, pressed ? MINT : W);
  const fire = pressed ? shape('M66 45 34 31 46 45 34 59Z', FLAME, 3) + shape('M64 45 48 39 54 45 48 51Z', GOLD, 0) + line('M22 26H36M14 45H28M22 64H36', W, 5, 0.8) : '';
  return svg(`launch${pressed ? ' pnl-art-launch-on' : ''}`, '0 0 220 104',
    rect(3, 6, 214, 95, 22, WELL) +
    rect(13, 27, 194, 66, 17, pressed ? '#1f9c68' : STEEL_D) +
    `<g transform="translate(0 ${y})">${rect(13, 12, 194, 66, 17, pressed ? MINT : '#f4f6fb')}${rocket}${fire}</g>`);
}

/** The sign on the dial's two buttons: 1 = plus, -1 = minus. */
export function stepSVG(dir) {
  if (dir !== 1 && dir !== -1) throw new Error(`Unknown step: ${dir}`);
  return svg(dir === 1 ? 'plus' : 'minus', '0 0 100 100', line(dir === 1 ? 'M50 22V78M22 50H78' : 'M22 50H78', INK, 17));
}
