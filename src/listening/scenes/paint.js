// Activity type "paint": he colours things the way the voice says.
//
// The play area is a picture of unpainted (gray) things and, under it, a shelf of paint pots
// and a soapy sponge. He taps a pot (a brush pops up in it, so it is clearly the one in use),
// then taps things to paint them that colour. Painting over a thing replaces its colour; the
// sponge washes paint off again; Undo takes back the last thing he did.
//
//   item.scene  = { cols, objects: [{ id, kind, color: 'gray', size }], paints: ['red', 'blue', ...] }
//   item.expect = { o2: 'red', o5: 'blue' }   the colour every painted thing must end up with;
//                                             a thing that is not listed must stay unpainted
//   answer()    = the same shape: { id: colour } for every thing that is painted right now

import { h, pulse, wait } from '../../core/dom.js';
import { createBoard } from '../board.js';
import { PALETTE, spriteSVG } from '../../art/sprites.js';
import { potSVG, brushSVG, washSVG } from '../../art/paint.js';

const WASH = 'wash';
const clamp = (lo, v, hi) => Math.max(lo, Math.min(hi, v));

/** Pure: is this picture painted the way the sentence said? */
export function check(answer, item) {
  const expect = item.expect || {};
  const painted = answer && typeof answer === 'object' ? answer : {};
  const want = Object.keys(expect);
  const got = Object.keys(painted).filter((id) => painted[id]);
  const total = want.length <= 8 ? want.length : 0;
  const right = want.filter((id) => painted[id] === expect[id]);
  const fail = (error) => ({ correct: false, error, at: 0, prefix: right.length, total });

  if (!got.length) return want.length ? fail('no-response') : { correct: true, error: '', at: -1, prefix: 0, total };
  if (!want.length) return fail('false-alarm');

  const missing = want.filter((id) => !painted[id]);
  const recoloured = want.filter((id) => painted[id] && painted[id] !== expect[id]);
  const extra = got.filter((id) => !(id in expect));
  if (!missing.length && !recoloured.length && !extra.length) return { correct: true, error: '', at: -1, prefix: want.length, total };

  if (extra.length && missing.length) {
    // He painted a different thing from the one that was meant. The same kind of thing (the big
    // one for the small one) = he missed a detail word; anything else = a different thing.
    const kind = new Map((item.scene?.objects || []).map((o) => [o.id, o.kind]));
    const lookalike = extra.some((x) => missing.some((m) => kind.get(m) !== undefined && kind.get(m) === kind.get(x)));
    return fail(lookalike ? 'attribute' : 'object');
  }
  if (recoloured.length) return fail('value'); // the right things, a wrong colour
  if (extra.length) return fail('extra'); // everything asked for, and more
  return fail('incomplete'); // right so far, but not finished
}

export default {
  create(item, host) {
    const paints = item.scene.paints;
    const objects = new Map(item.scene.objects.map((o) => [o.id, o]));
    const colours = new Map(); // thing id -> the colour it is painted now
    let history = []; // [{ id, from, to }] for Undo
    let tool = null; // a colour, WASH, or null (nothing picked up yet)
    let mode = 'off';

    const board = createBoard(item.scene, { onTap: onThing });
    const things = new Map([...board.el.querySelectorAll('.obj')].map((b) => [b.dataset.id, b]));
    const pots = new Map(paints.map((c) => [c, h('button', { class: 'paint-pot', type: 'button', dataset: { paint: c }, 'aria-label': `${c} paint`, style: { '--paint': PALETTE[c].main }, onclick: () => onTool(c) },
      h('span', { class: 'paint-pot-art', html: potSVG(c) }),
      h('span', { class: 'paint-brush', 'aria-hidden': 'true', html: brushSVG(c) }))]));
    const washBtn = h('button', { class: 'paint-pot paint-wash', type: 'button', dataset: { paint: WASH }, 'aria-label': 'Wash the paint off', onclick: () => onTool(WASH) },
      h('span', { class: 'paint-pot-art', html: washSVG() }));
    const shelf = h('div', { class: 'paint-shelf' }, [...pots.values()], h('span', { class: 'paint-sep', 'aria-hidden': 'true' }), washBtn);
    const picture = h('div', { class: 'paint-picture' }, board.el);
    const el = h('div', { class: 'paint-scene locked' }, picture, shelf);

    /** Is this touch allowed to do something? (Otherwise tell the mission what kind of touch it was.) */
    function live() {
      if (mode === 'listening') { host.onEarly(); return false; }
      if (mode === 'ready') { host.onIdle(); return false; }
      return mode === 'respond';
    }

    function drawThing(id) {
      const o = objects.get(id);
      const btn = things.get(id);
      const c = colours.get(id) || 'gray';
      btn.querySelector('.obj-art').innerHTML = spriteSVG(o.kind, c);
      btn.dataset.color = c;
      btn.classList.toggle('painted', c !== 'gray');
      if (c === 'gray') btn.style.removeProperty('--paint');
      else btn.style.setProperty('--paint', PALETTE[c].main);
      btn.setAttribute('aria-label', `${o.size === 'small' ? 'small ' : ''}${o.kind}, ${c === 'gray' ? 'not painted' : `painted ${c}`}`);
    }
    function drawTools() {
      for (const [c, btn] of pots) btn.classList.toggle('on', tool === c);
      washBtn.classList.toggle('on', tool === WASH);
      washBtn.classList.toggle('idle', colours.size === 0 && tool !== WASH);
      el.classList.toggle('need-tool', tool === null);
      if (tool && tool !== WASH) el.style.setProperty('--brush', PALETTE[tool].main);
      else el.style.removeProperty('--brush');
      el.dataset.tool = tool || '';
    }
    function setColour(id, c) {
      if (c) colours.set(id, c);
      else colours.delete(id);
      drawThing(id);
    }

    function onTool(t) {
      if (!live()) return;
      tool = t;
      host.sfx.tap();
      drawTools();
      pulse(t === WASH ? washBtn : pots.get(t), 'paint-pick', 300);
    }

    function onThing(id) {
      if (mode === 'listening') board.nudge(id);
      if (!live()) return;
      if (tool === null) return void pulse(shelf, 'paint-hint', 700); // nothing on the brush yet: the pots wave at him
      const from = colours.get(id) || null;
      const to = tool === WASH ? null : tool;
      if (from === to) return void board.nudge(id); // already that colour (or nothing to wash off)
      history.push({ id, from, to });
      setColour(id, to);
      drawTools();
      host.sfx.tap();
      pulse(things.get(id), 'paint-pop', 320);
      host.onChange();
    }

    drawTools();

    return {
      el,
      fit(container) {
        const box = container.getBoundingClientRect();
        if (!box.width || !box.height) return;
        const n = paints.length + 1;
        const gap = clamp(6, box.width * 0.012, 14);
        const pot = Math.floor(clamp(60, Math.min((box.width - 44 - gap * (n + 1)) / n, box.height * 0.19), 104));
        el.style.setProperty('--pot', `${pot}px`);
        el.style.setProperty('--pgap', `${gap}px`);
        const shelfH = shelf.getBoundingClientRect().height || pot + 30;
        picture.style.height = `${Math.max(100, box.height - shelfH - 26)}px`;
        board.fit(picture);
        // A long row on a narrow screen (a phone): let the tiles shrink rather than run off the side.
        const cols = item.scene.cols || 1;
        const cellGap = parseFloat(board.el.style.getPropertyValue('--gap')) || 12;
        const widest = Math.floor((box.width - cellGap * (cols - 1)) / cols);
        if (widest < 56) board.el.style.setProperty('--cell', `${Math.max(36, widest)}px`);
      },
      setMode(m) {
        mode = m;
        el.classList.toggle('locked', m !== 'respond');
        board.setLocked(m !== 'respond');
      },
      setCovered: board.setCovered,
      reset() {
        for (const id of [...colours.keys()]) setColour(id, null);
        history = [];
        tool = null;
        drawTools();
        el.classList.remove('showing');
      },
      answer: () => Object.fromEntries(item.scene.objects.filter((o) => colours.has(o.id)).map((o) => [o.id, colours.get(o.id)])),
      size: () => colours.size,
      undo() {
        const last = history.pop();
        if (last) setColour(last.id, last.from);
        drawTools();
      },
      async demo(onStep) {
        let step = 0;
        el.classList.add('showing');
        for (const c of paints) {
          const ids = item.scene.objects.map((o) => o.id).filter((id) => item.expect[id] === c);
          if (!ids.length) continue;
          await wait(500);
          tool = c;
          drawTools();
          pulse(pots.get(c), 'paint-pick', 300);
          for (const id of ids) {
            await wait(520);
            setColour(id, c);
            pulse(things.get(id), 'win', 700);
            onStep?.(step++);
          }
        }
        await wait(500);
        tool = null;
        drawTools();
        el.classList.remove('showing');
        await wait(700);
      },
      celebrate() {
        board.celebrate([...colours.keys()]);
      },
      shake: () => pulse(el, 'shake', 500),
    };
  },
  check,
  isNone: () => false, // there is always something to paint
};
