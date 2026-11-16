// Activity type "build": the Robot Workshop. He hears a description and builds the robot:
// one row of picture buttons per part the sentence talks about, one choice in every row.
// The big robot is put together live from what he has chosen so far.
//
//   item.scene  = { base: { head, arms, bottom }, rows: [{ part: 'head', options: ['round', 'square', 'pointy'] }, ...] }
//   item.expect = { head: 'round', eyes: 3, ... }     exactly one value for every row
//   answer      = { head: 'square', ... }             only the rows he has chosen in

import { h, pulse, wait } from '../../core/dom.js';
import { robotSVG, partSVG } from '../../art/build.js';

/** What the robot wears where the sentence has nothing to say (so it always looks whole). */
const PLAIN = { head: 'square', body: 'gray', arms: 'short', bottom: 'legs', eyes: 2 };

const LABEL = {
  head: (v) => `${v} head`,
  body: (v) => `${v} body`,
  nose: (v) => `${v} nose`,
  arms: (v) => ({ short: 'short arms', mid: 'middle arms', long: 'long arms', claws: 'claws' }[v]),
  bottom: (v) => ({ legs: 'legs', 'legs-short': 'short legs', 'legs-long': 'long legs', wheels: 'wheels', 'wheels-small': 'small wheels', 'wheels-big': 'big wheels', jet: 'jet' }[v]),
  eyes: (v) => `${v} ${v === 1 ? 'eye' : 'eyes'}`,
  antennas: (v) => `${v} ${v === 1 ? 'antenna' : 'antennas'}`,
  buttons: (v) => `${v} ${v === 1 ? 'button' : 'buttons'}`,
};

/** Which kind of slip a wrong row is, in the parent view's words (ERRORS in insights.js). */
const SLIP = { eyes: 'count', antennas: 'count', buttons: 'count', body: 'value', nose: 'value', head: 'object', arms: 'object', bottom: 'object' };
const family = (v) => String(v).split('-')[0]; // 'wheels-big' -> 'wheels'

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export default {
  create(item, host) {
    const rows = item.scene.rows;
    const chosen = new Map(); // part -> value
    const history = []; // [{ part, prev }] so Undo takes back exactly the last choice
    let mode = 'off';

    const robot = h('div', { class: 'bld-robot' });
    const buttons = new Map(); // `${part}|${value}` -> button
    const rowEls = new Map();
    const rowsEl = h('div', { class: 'bld-rows' });
    rows.forEach((row) => {
      const rowEl = h('div', { class: 'bld-row', dataset: { part: row.part } });
      for (const value of row.options) {
        const btn = h('button', { class: 'bld-opt', type: 'button', dataset: { part: row.part, value: String(value) }, 'aria-label': LABEL[row.part](value), 'aria-pressed': 'false',
          onclick: () => onTap(row.part, value, btn) },
          h('span', { class: 'bld-art', html: partSVG(row.part, value) }),
          h('span', { class: 'bld-cover', 'aria-hidden': 'true' }, '?'),
          h('span', { class: 'bld-tick', 'aria-hidden': 'true' }, '✓'));
        buttons.set(`${row.part}|${value}`, btn);
        rowEl.append(btn);
      }
      rowEls.set(row.part, rowEl);
      rowsEl.append(rowEl);
    });
    const el = h('div', { class: 'bld locked', dataset: { rows: rows.length } }, robot, rowsEl);

    function spec() {
      const out = { ...PLAIN, ...(item.scene.base || {}) };
      for (const row of rows) out[row.part] = chosen.get(row.part); // undefined = still to choose
      return out;
    }
    function paint() {
      robot.innerHTML = robotSVG(spec(), rows.map((r) => r.part).filter((part) => !chosen.has(part)));
      for (const row of rows) {
        const now = chosen.get(row.part);
        rowEls.get(row.part).classList.toggle('done', now !== undefined);
        for (const value of row.options) {
          const btn = buttons.get(`${row.part}|${value}`);
          btn.classList.toggle('chosen', value === now);
          btn.setAttribute('aria-pressed', String(value === now));
        }
      }
    }
    function onTap(part, value, btn) {
      if (mode === 'listening') {
        pulse(btn, 'nudge', 450);
        return host.onEarly();
      }
      if (mode === 'ready') return host.onIdle();
      if (mode !== 'respond') return;
      if (chosen.get(part) === value) return; // already on the robot
      history.push({ part, prev: chosen.get(part) });
      chosen.set(part, value);
      host.sfx.tap();
      paint();
      pulse(robot, 'bld-pop', 260);
      host.onChange();
    }
    paint();

    return {
      el,
      /** Robot beside the rows when the space is wide, above them when it is tall. */
      fit(container) {
        const box = container.getBoundingClientRect();
        if (!box.width || !box.height) return;
        const n = rows.length;
        const m = Math.max(...rows.map((r) => r.options.length));
        const gap = clamp(Math.round(box.width * 0.012), 6, 12);
        const pad = clamp(Math.round(box.height * 0.012), 4, 8); // inside each row's tray
        const ratio = 240 / 358; // the robot picture
        const rowH = (cell) => cell + pad * 2 + 4; // a tray: the buttons, its padding and its border
        const beside = () => {
          const rh = Math.min(box.height, 520);
          const rw = Math.min(rh * ratio + 24, box.width * 0.36);
          const cell = Math.min((box.width - rw - gap - pad * 2 - 4 - gap * (m - 1)) / m, (box.height - gap * (n - 1)) / n - pad * 2 - 4, 140);
          return { side: true, cell, rw, rh: Math.min(rh, (rw - 24) / ratio + 40) };
        };
        const above = () => {
          const least = clamp(box.height * 0.33, 150, 330); // the robot always keeps at least this much height
          const cell = Math.min((box.width - pad * 2 - 4 - gap * (m - 1)) / m, (box.height - least - gap * n) / n - pad * 2 - 4, 140);
          const rh = clamp(box.height - gap * n - n * rowH(Math.max(60, Math.floor(cell))), 110, 430);
          return { side: false, cell, rh, rw: Math.min(box.width, Math.max(rh * ratio + 24, m * cell + gap * (m - 1) + pad * 2 + 4)) };
        };
        // Whichever arrangement gives bigger buttons and a bigger robot; a tie goes to the screen's own shape.
        const score = (l) => l.cell * 2 + l.rh + (l.side === box.width >= box.height ? 1 : 0);
        const [best] = [beside(), above()].sort((x, y) => score(y) - score(x));
        const { side, rw, rh } = best;
        const cell = Math.max(60, Math.floor(best.cell));
        el.classList.toggle('bld-side', side);
        el.classList.toggle('bld-tight', best.cell < 60); // a very small screen: the rows scroll instead of shrinking further
        el.style.setProperty('--bld-cell', `${cell}px`);
        el.style.setProperty('--bld-gap', `${gap}px`);
        el.style.setProperty('--bld-pad', `${pad}px`);
        el.style.setProperty('--bld-rw', `${Math.floor(rw)}px`);
        el.style.setProperty('--bld-rh', `${Math.floor(rh)}px`);
      },
      setMode(m) {
        mode = m;
        el.classList.toggle('locked', m !== 'respond');
      },
      setCovered: (v) => el.classList.toggle('covered', !!v),
      reset() {
        chosen.clear();
        history.length = 0;
        paint();
      },
      answer: () => Object.fromEntries(chosen),
      size: () => chosen.size,
      undo() {
        const last = history.pop();
        if (!last) return;
        if (last.prev === undefined) chosen.delete(last.part);
        else chosen.set(last.part, last.prev);
        paint();
      },
      /** Build the right robot, one part at a time. */
      async demo(onStep) {
        chosen.clear();
        history.length = 0;
        paint();
        for (let i = 0; i < rows.length; i++) {
          await wait(750);
          const { part } = rows[i];
          chosen.set(part, item.expect[part]);
          paint();
          pulse(buttons.get(`${part}|${item.expect[part]}`), 'win', 800);
          pulse(robot, 'bld-pop', 260);
          onStep?.(i);
        }
        await wait(1100);
      },
      celebrate() {
        pulse(robot, 'bld-cheer', 900);
        for (const [part, value] of chosen) pulse(buttons.get(`${part}|${value}`), 'win', 900);
      },
      shake: () => pulse(el, 'shake', 500),
    };
  },

  /**
   * answer: { part: value } for the rows he chose in ({} = nothing, which is never right here).
   * Every row must hold the expected value; a row left empty makes the robot incomplete.
   */
  check(answer, item) {
    const rows = item.scene.rows;
    const total = rows.length;
    const got = answer && typeof answer === 'object' ? answer : {};
    const fail = (error, at) => ({ correct: false, error, at, prefix: rows.filter((r) => got[r.part] === item.expect[r.part]).length, total });
    if (!rows.some((r) => got[r.part] !== undefined)) return fail('no-response', 0);
    const wrong = rows.findIndex((r) => got[r.part] !== undefined && got[r.part] !== item.expect[r.part]);
    if (wrong >= 0) {
      const { part } = rows[wrong];
      // the right kind of thing in the wrong size (short legs for long legs) is a missed detail
      const sameKind = family(got[part]) === family(item.expect[part]) || (part === 'arms' && got[part] !== 'claws' && item.expect[part] !== 'claws');
      return fail(SLIP[part] === 'object' && sameKind ? 'attribute' : SLIP[part] || 'object', wrong);
    }
    const empty = rows.findIndex((r) => got[r.part] === undefined);
    if (empty >= 0) return fail('incomplete', empty);
    return { correct: true, error: '', at: -1, prefix: total, total };
  },
  isNone: () => false,
};
