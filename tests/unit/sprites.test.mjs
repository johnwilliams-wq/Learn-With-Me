import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PALETTE, OBJECT_KINDS, CHARACTER_KINDS, spriteSVG, chestOpenSVG, guideSVG, iconSVG,
} from '../../src/art/sprites.js';

const COLORS = ['red', 'blue', 'green', 'yellow', 'purple', 'orange', 'gray'];
const MOODS = ['idle', 'talk', 'happy', 'oops', 'wait'];
const ICONS = ['ear', 'replay', 'check', 'hand', 'lock', 'play', 'home', 'back', 'gear', 'star', 'star-empty', 'speaker', 'cards', 'parent', 'close'];
const FORBIDDEN = [' id=', '<defs', '<style', '<text', 'url(', '<use', 'Gradient', '<filter', '<clipPath', '<mask', '<image', 'href', ' width="100', 'NaN', 'undefined'];

function checkSVG(svg, viewBox, cls) {
  assert.equal(typeof svg, 'string');
  assert.ok(svg.startsWith('<svg'), 'starts with <svg');
  assert.ok(svg.endsWith('</svg>'), 'ends with </svg>');
  assert.ok(svg.includes('xmlns="http://www.w3.org/2000/svg"'), 'has xmlns');
  assert.ok(svg.includes(`viewBox="${viewBox}"`), `viewBox ${viewBox}`);
  assert.ok(svg.includes(`class="${cls}"`), `class ${cls}`);
  assert.ok(svg.includes('aria-hidden="true"'), 'aria-hidden');
  const open = svg.slice(0, svg.indexOf('>') + 1);
  assert.ok(!/\s(width|height)=/.test(open), 'no width/height on the root');
  for (const bad of FORBIDDEN) assert.ok(!svg.includes(bad), `must not contain ${bad}`);
  assert.equal(svg.match(/<svg/g).length, 1, 'exactly one svg element');
  assert.equal((svg.match(/<g[ >]/g) || []).length, (svg.match(/<\/g>/g) || []).length, 'balanced groups');
}

test('palette has the six play colours plus gray, each with three distinct hex tones', () => {
  assert.deepEqual(Object.keys(PALETTE), COLORS);
  const mains = new Set();
  for (const c of COLORS) {
    const t = PALETTE[c];
    assert.deepEqual(Object.keys(t).sort(), ['dark', 'light', 'main']);
    for (const v of Object.values(t)) assert.match(v, /^#[0-9a-f]{6}$/);
    assert.equal(new Set(Object.values(t)).size, 3);
    mains.add(t.main);
  }
  assert.equal(mains.size, COLORS.length);
});

test('kind lists are complete and unique', () => {
  assert.equal(OBJECT_KINDS.length, 22);
  assert.equal(CHARACTER_KINDS.length, 8);
  assert.equal(new Set([...OBJECT_KINDS, ...CHARACTER_KINDS]).size, 30);
  for (const k of ['gem', 'key', 'potion', 'chest', 'map', 'torch', 'heart']) assert.ok(OBJECT_KINDS.includes(k));
  for (const k of ['robot', 'dragon', 'ghost', 'fox']) assert.ok(CHARACTER_KINDS.includes(k));
});

test('every kind renders in every colour', () => {
  for (const kind of [...OBJECT_KINDS, ...CHARACTER_KINDS]) {
    for (const color of COLORS) {
      const svg = spriteSVG(kind, color);
      checkSVG(svg, '0 0 100 100', `sprite sprite-${kind}`);
      assert.ok(svg.includes(PALETTE[color].main), `${color} ${kind} uses the main colour`);
      for (const other of COLORS) {
        if (other === color) continue;
        for (const tone of Object.values(PALETTE[other])) {
          assert.ok(!svg.includes(tone), `${color} ${kind} must not use ${other} tone ${tone}`);
        }
      }
      assert.ok(svg.length < 4000, `${kind} stays compact (${svg.length} chars)`);
    }
  }
});

test('the default colour is red and sprites of different kinds differ', () => {
  assert.equal(spriteSVG('gem'), spriteSVG('gem', 'red'));
  const all = new Set([...OBJECT_KINDS, ...CHARACTER_KINDS].map((k) => spriteSVG(k, 'blue')));
  assert.equal(all.size, 30);
});

test('unknown kinds and colours throw', () => {
  assert.throws(() => spriteSVG('banana', 'red'), Error);
  assert.throws(() => spriteSVG('gem', 'pink'), Error);
  assert.throws(() => spriteSVG('toString', 'red'), Error);
  assert.throws(() => spriteSVG('gem', 'constructor'), Error);
  assert.throws(() => spriteSVG(undefined, 'red'), Error);
  assert.throws(() => chestOpenSVG('pink'), Error);
  assert.throws(() => guideSVG('angry'), Error);
  assert.throws(() => iconSVG('banana'), Error);
  assert.throws(() => iconSVG('constructor'), Error);
});

test('open chest renders in every colour', () => {
  assert.equal(chestOpenSVG(), chestOpenSVG('yellow'));
  for (const color of COLORS) {
    const svg = chestOpenSVG(color);
    checkSVG(svg, '0 0 100 100', 'sprite sprite-chest-open');
    assert.ok(svg.includes(PALETTE[color].main));
    assert.notEqual(svg, spriteSVG('chest', color));
  }
});

test('guide renders every mood and each mood looks different', () => {
  assert.equal(guideSVG(), guideSVG('idle'));
  const seen = new Set();
  for (const mood of MOODS) {
    const svg = guideSVG(mood);
    checkSVG(svg, '0 0 200 200', `guide guide-${mood}`);
    for (const c of COLORS) assert.ok(!svg.includes(PALETTE[c].main), `guide avoids play colour ${c}`);
    seen.add(svg);
  }
  assert.equal(seen.size, MOODS.length);
});

test('icons render with currentColor only', () => {
  const seen = new Set();
  for (const name of ICONS) {
    const svg = iconSVG(name);
    checkSVG(svg, '0 0 100 100', `icon icon-${name}`);
    assert.ok(svg.includes('currentColor'), `${name} uses currentColor`);
    assert.ok(!/#[0-9a-fA-F]{3,6}/.test(svg), `${name} has no hard-coded colour`);
    seen.add(svg);
  }
  assert.equal(seen.size, ICONS.length);
});
