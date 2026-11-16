// Activity type "put" (Move and Pack): things stand on a shelf; below are PLACES - big
// containers (in), and sometimes a table (on / under). He taps a thing (it lifts and glows),
// then taps a place: it goes there. Tapping a thing that is already in a place takes it out
// again; Undo takes back the last move.
//
//   item.scene  = { objects: [{ id, kind, color, size }], places: [{ id, kind, prep }] }
//                 prep is 'in' (containers) or 'on' / 'under' (the table: always both)
//   item.expect = { moves: [{ ids: [...], n, to }], ordered?: true }
//                 each move: exactly `n` of the things `ids` must end up in place `to`
//                 (n < ids.length = "put three coins": any three of them);
//                 everything no move allows must stay on the shelf;
//                 ordered = the moves must be done in the order they are listed;
//                 moves: [] = the right thing is to move nothing (he presses the hand).
//   answer      = { moves: [[thingId, placeId | null], ...], where: { thingId: placeId } }
//                 moves = what he did, in order (null = back to the shelf); where = how it ended.

import { h, pulse, wait } from '../../core/dom.js';
import { spriteSVG } from '../../art/sprites.js';
import { placeSVG, PLACE_BOX, TABLE_BOX } from '../../art/put.js';

/** How many things fit in one place (so every thing inside stays big enough to tap). */
export const CAPACITY = { in: 6, on: 6, under: 3 };
const PREP_WORD = { in: 'in the', on: 'on the', under: 'under the' };

/** One way of doing it right: [[thingId, placeId], ...] in an order that is always accepted. */
export function solution(item) {
  const used = new Set();
  const out = [];
  for (const move of item.expect.moves) {
    const free = move.ids.filter((id) => !used.has(id)).slice(0, move.n);
    for (const id of free) {
      used.add(id);
      out.push([id, move.to]);
    }
  }
  return out;
}

/**
 * Is it right? Everything must END where the sentence says, everything else must still be on
 * the shelf, and - only for sentences that give an order - the moves must have been made in
 * that order (judged by when each thing was last put where it ended up).
 */
export function check(answer, item) {
  const rules = item.expect.moves;
  const total = rules.reduce((n, r) => n + r.n, 0);
  const where = (answer && answer.where) || {};
  const moves = (answer && answer.moves) || [];
  const placed = Object.keys(where).filter((id) => where[id]);
  const fail = (error, prefix = 0) => ({ correct: false, error, at: prefix, prefix, total });

  if (!rules.length) return placed.length ? fail('false-alarm') : { correct: true, error: '', at: -1, prefix: 0, total };
  if (!placed.length) return fail('no-response');

  const kindOf = new Map(item.scene.objects.map((o) => [o.id, o.kind]));
  const got = rules.map((r) => r.ids.filter((id) => where[id] === r.to)); // the things that satisfy each rule
  const prefix = rules.reduce((n, r, i) => n + Math.min(got[i].length, r.n), 0);
  const short = rules.filter((r, i) => got[i].length < r.n);
  const over = rules.some((r, i) => got[i].length > r.n);

  const strangers = []; // moved, but the sentence never asked for them
  let misplaced = false; // asked for, but put somewhere else
  for (const id of placed) {
    const mine = rules.filter((r) => r.ids.includes(id));
    if (!mine.length) strangers.push(id);
    else if (!mine.some((r) => r.to === where[id])) misplaced = true;
  }

  if (strangers.length && short.length) {
    // something else was moved in place of what was asked for: the same kind of thing (wrong
    // colour or size) or a different thing altogether
    const wanted = new Set(short.flatMap((r) => r.ids.map((id) => kindOf.get(id))));
    return fail(strangers.some((id) => wanted.has(kindOf.get(id))) ? 'attribute' : 'object', prefix);
  }
  if (misplaced) return fail('place', prefix);
  if (over) return fail('count', prefix);
  if (short.length) {
    // "put three coins" and he put two: a counting slip, not a forgotten step
    const counting = short.some((r) => r.n < r.ids.length && got[rules.indexOf(r)].length > 0);
    return fail(counting ? 'count' : 'incomplete', prefix);
  }
  if (strangers.length) return fail('extra', prefix);

  if (item.expect.ordered) {
    const when = (id) => {
      for (let i = moves.length - 1; i >= 0; i--) if (moves[i][0] === id && moves[i][1] === where[id]) return i;
      return -1;
    };
    let last = -1;
    let done = 0;
    for (let i = 0; i < rules.length; i++) {
      const times = got[i].map(when);
      if (times.some((t) => t < 0) || Math.min(...times) < last) return fail('order', done);
      last = Math.max(...times);
      done += rules[i].n;
    }
  }
  return { correct: true, error: '', at: -1, prefix: total, total };
}

/** True when the device asks for less movement: things then change place without flying there. */
const calm = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const thingLabel = (o) => `${o.size === 'small' ? 'small ' : ''}${o.color} ${o.kind}`;

function create(item, host) {
  const things = item.scene.objects;
  const places = item.scene.places;
  const prepOf = new Map(places.map((p) => [p.id, p.prep || 'in']));
  let mode = 'off';
  let held = null; // the thing he has picked up (an id), if any
  let where = new Map(); // thing id -> place id, for the things that are in a place
  let history = []; // [{ id, from, to }]  (null = the shelf)

  // ---- the shelf -------------------------------------------------------------------------
  const slots = new Map();
  const buttons = new Map();
  for (const o of things) {
    const btn = h('button', {
      class: `put-thing${o.size === 'small' ? ' put-small' : ''}`, type: 'button',
      dataset: { id: o.id, kind: o.kind, color: o.color, size: o.size || 'big' }, 'aria-label': thingLabel(o),
      onclick: (e) => { e.stopPropagation(); tapThing(o.id); },
    }, h('span', { class: 'put-thing-art', html: spriteSVG(o.kind, o.color) }), h('span', { class: 'put-q', 'aria-hidden': 'true' }, '?'), h('span', { class: 'put-badge', 'aria-hidden': 'true' }));
    buttons.set(o.id, btn);
    slots.set(o.id, h('div', { class: 'put-slot', dataset: { slot: o.id } }, btn));
  }
  const shelf = h('div', { class: 'put-shelf' });

  // ---- the places ------------------------------------------------------------------------
  const zones = new Map(); // place id -> { el, pile }
  function zone(place) {
    const pile = h('div', { class: 'put-pile' });
    const prep = place.prep || 'in';
    const el = h('div', {
      class: `put-zone put-${prep}`, role: 'button',
      dataset: { place: place.id, kind: place.kind, prep }, 'aria-label': `${PREP_WORD[prep]} ${place.kind}`,
      onclick: () => tapPlace(place.id),
    });
    zones.set(place.id, { el, pile });
    return { el, pile };
  }
  const columns = [];
  for (const p of places) {
    const cover = h('span', { class: 'put-cover', 'aria-hidden': 'true' }, '?');
    if (p.kind === 'table') {
      const on = places.find((q) => q.kind === 'table' && q.prep === 'on');
      const under = places.find((q) => q.kind === 'table' && q.prep === 'under');
      if (zones.has(on.id)) continue; // the table's two places make one piece of furniture
      const zOn = zone(on);
      const zUnder = zone(under);
      zOn.el.append(zOn.pile, h('span', { class: 'put-drop', 'aria-hidden': 'true' }));
      zUnder.el.append(zUnder.pile, h('span', { class: 'put-drop', 'aria-hidden': 'true' }));
      columns.push(h('div', { class: 'put-place put-place-table', dataset: { kind: 'table' } },
        h('span', { class: 'put-layer put-table-art', html: placeSVG('table') }), zOn.el, zUnder.el, cover));
    } else {
      const z = zone(p);
      z.el.append(
        h('span', { class: 'put-layer put-back', html: placeSVG(p.kind, 'back') }),
        z.pile,
        h('span', { class: 'put-layer put-front', html: placeSVG(p.kind, 'front') }),
        h('span', { class: 'put-drop', 'aria-hidden': 'true' }));
      columns.push(h('div', { class: 'put-place', dataset: { kind: p.kind } }, z.el, cover));
    }
  }
  const placeRow = h('div', { class: 'put-places' }, columns);
  const el = h('div', { class: 'put-scene put-locked' }, shelf, placeRow);
  let perRow = things.length;
  layShelf();

  function layShelf() {
    const rows = [];
    for (let i = 0; i < things.length; i += perRow) {
      rows.push(h('div', { class: 'put-row' }, things.slice(i, i + perRow).map((o) => slots.get(o.id))));
    }
    shelf.replaceChildren(...rows);
  }

  // ---- drawing the state -------------------------------------------------------------------
  /** Put every thing's button where it belongs (its shelf slot, or the pile of its place). */
  function render(animate = true) {
    const before = animate && !calm() ? new Map([...buttons].map(([id, b]) => [id, b.getBoundingClientRect()])) : null;
    for (const [id, btn] of buttons) {
      const placeId = where.get(id);
      const home = placeId ? zones.get(placeId).pile : slots.get(id);
      if (btn.parentNode !== home) home.append(btn);
      btn.classList.toggle('put-inside', !!placeId);
      btn.classList.toggle('put-held', held === id);
      slots.get(id).classList.toggle('put-empty', !!placeId);
    }
    for (const [id, z] of zones) {
      const n = z.pile.children.length;
      z.el.classList.toggle('put-has', n > 0);
      z.el.classList.toggle('put-full', n >= CAPACITY[prepOf.get(id)]);
    }
    el.classList.toggle('put-holding', held !== null);
    // When the sentence gives an order, each thing shows when it was put away (1, 2, 3...), so he
    // can check the order before he presses Done.
    if (item.expect.ordered) {
      const when = (id) => history.map((m) => m.id === id && m.to === where.get(id)).lastIndexOf(true);
      const sequence = [...where.keys()].sort((a, b) => when(a) - when(b));
      for (const [id, btn] of buttons) btn.querySelector('.put-badge').textContent = where.has(id) ? String(sequence.indexOf(id) + 1) : '';
    }
    if (before) {
      for (const [id, btn] of buttons) {
        const a = before.get(id);
        const b = btn.getBoundingClientRect();
        const dx = a.left + a.width / 2 - (b.left + b.width / 2);
        const dy = a.top + a.height / 2 - (b.top + b.height / 2);
        if ((Math.abs(dx) > 2 || Math.abs(dy) > 2) && btn.animate && b.width) {
          btn.animate([{ transform: `translate(${dx}px, ${dy}px) scale(${a.width / b.width})` }, { transform: 'none' }], { duration: 260, easing: 'cubic-bezier(0.2, 0.9, 0.3, 1.2)' });
        }
      }
    }
  }

  // ---- what he does --------------------------------------------------------------------------
  /** Frozen? Tell the mission why he touched it; only 'respond' lets a touch through. */
  function frozen(touched) {
    if (mode === 'listening') {
      pulse(touched, 'nudge', 450);
      host.onEarly();
    } else if (mode === 'ready') host.onIdle();
    return mode !== 'respond';
  }
  function tapThing(id) {
    if (frozen(buttons.get(id))) return;
    if (where.has(id)) {
      // With something in his hand, a tap on a thing inside a place means "put it in here too".
      if (held !== null) return void place(held, where.get(id));
      history.push({ id, from: where.get(id), to: null });
      where.delete(id);
      if (!where.size) history = []; // everything is back on the shelf: a clean start
    } else {
      held = held === id ? null : id;
      host.sfx.tap();
      return void render(false);
    }
    host.sfx.tap();
    render();
    host.onChange();
  }
  function tapPlace(placeId) {
    if (frozen(zones.get(placeId).el)) return;
    if (held === null) {
      // nothing in his hand yet: show where the things are
      for (const [id, btn] of buttons) if (!where.has(id)) pulse(btn, 'put-hint', 600);
      return;
    }
    place(held, placeId);
  }
  function place(id, placeId) {
    const inside = [...where.values()].filter((p) => p === placeId).length;
    if (inside >= CAPACITY[prepOf.get(placeId)]) return void pulse(zones.get(placeId).el, 'nudge', 450); // full
    history.push({ id, from: null, to: placeId });
    where.set(id, placeId);
    held = null;
    host.sfx.tap();
    render();
    pulse(buttons.get(id), 'put-land', 320);
    host.onChange();
  }

  return {
    el,
    /** Size the shelf and the places so that everything fits the space we have. */
    fit(container) {
      const box = container.getBoundingClientRect();
      if (!box.width || !box.height) return;
      const W = box.width;
      const H = box.height;
      const n = things.length;
      const gap = Math.max(4, Math.min(10, W * 0.01));
      // the shelf: as few rows as keep the things comfortably big
      let best = null;
      for (let rows = 1; rows <= 4; rows++) {
        const per = Math.ceil(n / rows);
        const cell = Math.floor(Math.min(116, (W - 28 - gap * (per - 1)) / per, (H * 0.42) / rows - 18));
        if (!best || cell > best.cell) best = { rows, per, cell };
        if (cell >= 84) { best = { rows, per, cell }; break; }
      }
      const cell = Math.max(48, best.cell);
      if (best.per !== perRow) {
        perRow = best.per;
        layShelf();
      }
      const shelfH = best.rows * (cell + 18);
      // the places: columns side by side, things inside in rows of three
      const cols = columns.length;
      const roomH = H - shelfH - 14;
      const hasTable = places.some((p) => p.kind === 'table');
      let colW = Math.min(340, (W - 14 * (cols - 1)) / cols);
      let tile;
      let under;
      let per = 3;
      const size = () => {
        per = colW >= 208 ? 3 : 2;
        const rows = Math.ceil(CAPACITY.in / per);
        const artH = colW * (PLACE_BOX.h / PLACE_BOX.w);
        const tableH = colW * (TABLE_BOX.h / TABLE_BOX.w);
        tile = Math.min(104, (colW - 16) / per, (roomH - artH * (1 - PLACE_BOX.floor / PLACE_BOX.h) - 4) / rows);
        if (hasTable) tile = Math.min(tile, (roomH - tableH * (1 - TABLE_BOX.top / TABLE_BOX.h) - 4) / rows);
        // between the legs it is a tight fit for three: rather let them touch the legs than become too small to tap
        under = Math.min(tile, Math.max(60, (colW * (TABLE_BOX.under.w / TABLE_BOX.w) - 4) / 3), tableH * (TABLE_BOX.under.h / TABLE_BOX.h) - 4);
      };
      size();
      while (tile < 62 && colW > 208) { // short of height: smaller containers leave more room for what is inside
        colW -= 8;
        size();
      }
      tile = Math.floor(Math.max(40, tile));
      under = Math.floor(Math.max(40, under));
      const artH = colW * (PLACE_BOX.h / PLACE_BOX.w);
      const tableH = colW * (TABLE_BOX.h / TABLE_BOX.w);
      const rows = Math.ceil(CAPACITY.in / per);
      const colH = Math.min(roomH, Math.max(artH * (1 - PLACE_BOX.floor / PLACE_BOX.h), hasTable ? tableH * (1 - TABLE_BOX.top / TABLE_BOX.h) : 0) + rows * tile + 6);
      const set = (k, v) => el.style.setProperty(k, `${Math.round(v * 10) / 10}px`);
      set('--put-cell', cell);
      set('--put-gap', gap);
      set('--put-tile', tile);
      set('--put-under', under);
      set('--put-colw', colW);
      set('--put-colh', colH);
      set('--put-arth', artH);
      set('--put-tableh', tableH);
      set('--put-floor', artH * (1 - PLACE_BOX.floor / PLACE_BOX.h));
      set('--put-top', tableH * (1 - TABLE_BOX.top / TABLE_BOX.h));
      set('--put-legs', tableH * (TABLE_BOX.under.h / TABLE_BOX.h));
      set('--put-between', colW * (TABLE_BOX.under.w / TABLE_BOX.w));
      el.style.setProperty('--put-per', String(per));
    },
    setMode(m) {
      mode = m;
      if (m !== 'respond' && held !== null) {
        held = null;
        render(false);
      }
      el.classList.toggle('put-locked', m !== 'respond');
    },
    setCovered: (v) => el.classList.toggle('put-covered', !!v),
    reset() {
      held = null;
      where = new Map();
      history = [];
      render(false);
    },
    answer: () => ({ moves: history.map((m) => [m.id, m.to]), where: Object.fromEntries(where) }),
    size: () => where.size,
    undo() {
      const m = history.pop();
      if (!m) return;
      held = null;
      if (m.to === null) where.set(m.id, m.from);
      else where.delete(m.id);
      if (!where.size) history = [];
      render();
    },
    /** Slowly show the right answer: each thing lifts, then goes where it belongs. */
    async demo(onStep) {
      held = null;
      where = new Map();
      history = [];
      render(false);
      const steps = solution(item);
      for (let i = 0; i < steps.length; i++) {
        const [id, placeId] = steps[i];
        await wait(550);
        held = id;
        render(false);
        await wait(600);
        held = null;
        where.set(id, placeId);
        history.push({ id, from: null, to: placeId });
        render();
        pulse(zones.get(placeId).el, 'put-glow', 700);
        onStep?.(i);
      }
      await wait(1000);
    },
    celebrate() {
      const used = new Set(where.values());
      for (const id of used) pulse(zones.get(id).el, 'put-glow', 900);
      if (!used.size) pulse(el, 'calm-win', 900);
    },
    shake: () => pulse(el, 'shake', 500),
  };
}

export default {
  create,
  check,
  isNone: (item) => item.expect.moves.length === 0,
};
