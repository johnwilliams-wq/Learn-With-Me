// Activity type "panel" (Control Room): he works a spaceship's control panel the way the voice says.
//
// The scene is a list of controls:
//   { id, type: 'button', color }           a push button; dots under it count the presses
//   { id, type: 'switch', color, pos }      a lever, pos = 'up' | 'down'; a tap flips it
//   { id, type: 'dial', value }             shows one digit 0-9; plus and minus buttons change it
//   { id, type: 'keypad' }                  the digits 0-9 and a little screen showing what was typed
//   { id, type: 'light', color }            a red or green status light - only to look at
//   { id, type: 'launch' }                  the big rocket button (it can only be pressed once)
//
// What he does is kept as a list of ACTIONS, in order:
//   { c: id }  press a button / flip a switch / press launch      { c: id, d: 1 | -1 }  dial up / down
//   { c: id, k: '7' }  a key on the number pad
// The state of every control follows from the scene and that list (replay), so Undo is just
// "drop the last action". The answer handed to check() is { actions, state }.
//
// `expect` is an ordered list of GROUPS of { c: id, v: the state that control must end in }:
//   button -> how many presses, switch -> 'up' | 'down', dial -> digit, keypad -> the code as a
//   string ('472'), launch -> true. Inside a group any order; a later group must be finished after
//   the one before it. Every control that is not named must end exactly as it started.

import { h, pulse, wait } from '../../core/dom.js';
import { buttonSVG, switchSVG, dialSVG, lightSVG, launchSVG, stepSVG } from '../../art/panel.js';

export const MAX_PRESSES = 5; // dots under a button
export const MAX_CODE = 7; // digits that fit on the screen
const MAX_ACTIONS = 60;
const MAX_SCALE = 1.45;

/** The state every control starts in. */
export function initialState(scene) {
  const state = {};
  for (const c of scene.controls) {
    if (c.type === 'button') state[c.id] = 0;
    else if (c.type === 'switch') state[c.id] = c.pos;
    else if (c.type === 'dial') state[c.id] = c.value;
    else if (c.type === 'keypad') state[c.id] = '';
    else if (c.type === 'launch') state[c.id] = false;
  }
  return state;
}

/** What one action does to one control's value; undefined = nothing (the action is not possible). */
function step(control, value, action) {
  switch (control.type) {
    case 'button': return value < MAX_PRESSES ? value + 1 : undefined;
    case 'switch': return value === 'up' ? 'down' : 'up';
    case 'dial': {
      const next = value + (action.d === -1 ? -1 : 1);
      return next < 0 || next > 9 ? undefined : next;
    }
    case 'keypad': return /^[0-9]$/.test(String(action.k)) && value.length < MAX_CODE ? value + action.k : undefined;
    case 'launch': return value ? undefined : true;
    default: return undefined; // the light does nothing
  }
}

/**
 * Work out where every control ends up. Returns { state, last } where last[id] is the position (in
 * the action list) of the last thing that was done to that control - "when it was finished".
 */
export function replay(scene, actions) {
  const byId = new Map(scene.controls.map((c) => [c.id, c]));
  const state = initialState(scene);
  const last = {};
  (actions || []).forEach((a, i) => {
    const control = a && byId.get(a.c);
    if (!control) return;
    const next = step(control, state[control.id], a);
    if (next === undefined) return;
    state[control.id] = next;
    last[control.id] = i;
  });
  return { state, last };
}

/** How many touches the right answer takes (the dots of the supported second try). */
export function touches(item) {
  const start = initialState(item.scene);
  const type = new Map(item.scene.controls.map((c) => [c.id, c.type]));
  let n = 0;
  for (const e of item.expect.flat()) {
    const t = type.get(e.c);
    n += t === 'button' ? e.v : t === 'dial' ? Math.abs(e.v - start[e.c]) : t === 'keypad' ? e.v.length : 1;
  }
  return n;
}

/** The right answer as a list of actions (used to show it after two misses). */
export function solution(item) {
  const start = initialState(item.scene);
  const type = new Map(item.scene.controls.map((c) => [c.id, c.type]));
  const out = [];
  for (const e of item.expect.flat()) {
    const t = type.get(e.c);
    if (t === 'button') for (let i = 0; i < e.v; i++) out.push({ c: e.c });
    else if (t === 'dial') for (let i = 0; i < Math.abs(e.v - start[e.c]); i++) out.push({ c: e.c, d: e.v > start[e.c] ? 1 : -1 });
    else if (t === 'keypad') for (const k of e.v) out.push({ c: e.c, k });
    else out.push({ c: e.c });
  }
  return out;
}

/** Pure: is what he did what the voice asked for? answer = { actions } (or just the list of actions). */
export function check(answer, item) {
  const actions = Array.isArray(answer) ? answer : (answer && answer.actions) || [];
  const want = item.expect.flat();
  const total = touches(item);
  const fail = (error, at) => ({ correct: false, error, at, prefix: at, total });
  if (!actions.length) return fail('no-response', 0);

  const type = new Map(item.scene.controls.map((c) => [c.id, c.type]));
  const start = initialState(item.scene);
  const { state, last } = replay(item.scene, actions);
  const named = new Set(want.map((e) => e.c));
  const changed = (id) => state[id] !== start[id];

  const firstBad = Math.max(0, want.findIndex((e) => state[e.c] !== e.v));
  const missing = want.filter((e) => !changed(e.c)); // named, but still as it started
  const off = want.filter((e) => changed(e.c) && state[e.c] !== e.v); // named and changed, but not to the right thing
  const extra = Object.keys(start).filter((id) => !named.has(id) && changed(id)); // not named, but changed

  if (missing.length && extra.length) {
    // He worked a different control instead: the same sort of control (wrong colour) or another sort altogether.
    const sorts = new Set(missing.map((e) => type.get(e.c)));
    return fail(extra.some((id) => sorts.has(type.get(id))) ? 'attribute' : 'object', firstBad);
  }
  if (off.length) return fail(valueError(type.get(off[0].c), state[off[0].c], off[0].v), firstBad);
  if (missing.length) return fail('incomplete', firstBad);
  if (extra.length) return fail('extra', want.length);

  // Everything ends up right. Was it done in the order that was asked for?
  let before = -1;
  let seen = 0;
  for (const group of item.expect) {
    const when = group.map((e) => last[e.c]);
    if (Math.min(...when) < before) return fail('order', seen);
    before = Math.max(...when);
    seen += group.length;
  }
  return { correct: true, error: '', at: -1, prefix: want.length, total };
}

function valueError(type, got, wanted) {
  if (type === 'button') return 'count';
  if (type !== 'keypad') return 'value';
  if ([...got].sort().join('') === [...wanted].sort().join('')) return 'order'; // the right digits, mixed up
  if (wanted.startsWith(got)) return 'incomplete';
  if (got.startsWith(wanted)) return 'extra';
  return 'value';
}

// ------------------------------------------------------------------------------------------------

export default {
  create(item, host) {
    const scene = item.scene;
    const of = (type) => scene.controls.filter((c) => c.type === type);
    const start = initialState(scene);
    let actions = [];
    let now = replay(scene, actions);
    let mode = 'off';
    let dead = false;

    const parts = new Map(); // control id -> { el, paint(value) }
    const badge = () => h('span', { class: 'pnl-badge', 'aria-hidden': 'true' });

    function act(action) {
      if (mode !== 'respond') return; // (touching too soon is handled once, on the whole panel, below)
      const control = scene.controls.find((c) => c.id === action.c);
      if (actions.length >= MAX_ACTIONS || step(control, now.state[control.id], action) === undefined) {
        return void pulse(parts.get(control.id).el, 'nudge', 450); // nothing more this control can do
      }
      actions.push(action);
      host.sfx.tap();
      paint();
      pulse(touched(action), 'pnl-press', 180);
      host.onChange();
      if (item.auto) host.onSubmit();
    }

    /** The thing on screen that an action presses: a key, a plus or minus button, or the control itself. */
    const touched = (a) => (a.k !== undefined ? el.querySelector(`.pnl-key[data-key="${a.k}"]`)
      : a.d !== undefined ? el.querySelector(`.pnl-step[data-step="${a.d}"]`) : parts.get(a.c).el);

    // --- the controls ----------------------------------------------------------------------
    const makeButton = (c) => {
      const pips = Array.from({ length: MAX_PRESSES }, () => h('i'));
      const el = h('button', { class: 'pnl-ctl pnl-btn', type: 'button', dataset: { id: c.id, color: c.color }, 'aria-label': `${c.color} button`, onclick: () => act({ c: c.id }) },
        h('span', { class: 'pnl-btn-art', html: buttonSVG(c.color) }),
        h('span', { class: 'pnl-pips', 'aria-hidden': 'true' }, pips),
        badge());
      parts.set(c.id, { el, paint: (n) => { el.dataset.count = String(n); pips.forEach((p, i) => p.classList.toggle('on', i < n)); } });
      return el;
    };
    const makeSwitch = (c) => {
      const art = h('span', { class: 'pnl-switch-art' });
      const el = h('button', { class: 'pnl-ctl pnl-switch', type: 'button', dataset: { id: c.id, color: c.color }, onclick: () => act({ c: c.id }) }, art, badge());
      parts.set(c.id, { el, paint: (pos) => {
        if (el.dataset.pos === pos) return;
        el.dataset.pos = pos;
        el.setAttribute('aria-label', `${c.color} switch, ${pos}`);
        art.innerHTML = switchSVG(c.color, pos);
      } });
      return el;
    };
    const makeDial = (c) => {
      const art = h('span', { class: 'pnl-gauge-art' });
      const digit = h('span', { class: 'pnl-digit' });
      const stepBtn = (d) => h('button', { class: `pnl-step pnl-step-${d > 0 ? 'up' : 'down'}`, type: 'button', dataset: { id: c.id, step: String(d) }, 'aria-label': d > 0 ? 'dial up' : 'dial down', html: stepSVG(d), onclick: () => act({ c: c.id, d }) });
      const down = stepBtn(-1);
      const up = stepBtn(1);
      const el = h('div', { class: 'pnl-ctl pnl-dial', dataset: { id: c.id } }, down, h('div', { class: 'pnl-gauge' }, art, digit), up, badge());
      parts.set(c.id, { el, paint: (v) => {
        if (el.dataset.value === String(v)) return;
        el.dataset.value = String(v);
        digit.textContent = String(v);
        art.innerHTML = dialSVG(v);
        down.classList.toggle('pnl-end', v === 0);
        up.classList.toggle('pnl-end', v === 9);
      } });
      return el;
    };
    const makeKeypad = (c) => {
      const typed = h('span', { class: 'pnl-typed' });
      const key = (k) => h('button', { class: 'pnl-key', type: 'button', dataset: { id: c.id, key: k }, onclick: () => act({ c: c.id, k }) }, k);
      const el = h('div', { class: 'pnl-ctl pnl-keypad', dataset: { id: c.id } },
        h('div', { class: 'pnl-display' }, typed),
        h('div', { class: 'pnl-keys' }, [...'123456789'].map(key), h('span', { class: 'pnl-gap' }), key('0'), h('span', { class: 'pnl-gap' })),
        badge());
      parts.set(c.id, { el, paint: (code) => { el.dataset.code = code; typed.textContent = code; } });
      return el;
    };
    const makeLight = (c) => h('div', { class: 'pnl-light', dataset: { id: c.id, color: c.color }, role: 'img', 'aria-label': `${c.color} light`, html: lightSVG(c.color) });
    const makeLaunch = (c) => {
      const art = h('span', { class: 'pnl-launch-art' });
      const el = h('button', { class: 'pnl-ctl pnl-launch', type: 'button', dataset: { id: c.id }, 'aria-label': 'launch', onclick: () => act({ c: c.id }) }, art, badge());
      parts.set(c.id, { el, paint: (on) => {
        if (el.dataset.on === String(on)) return;
        el.dataset.on = String(on);
        art.innerHTML = launchSVG(on);
      } });
      return el;
    };

    // --- the console: buttons on top, switches and dial under them, launch below; the number pad beside or under that
    const mod = (cls, kids) => (kids.length ? h('div', { class: `pnl-mod ${cls}` }, kids) : null);
    const row = (...mods) => h('div', { class: 'pnl-row' }, mods); // (an empty row takes no room)
    const dials = of('dial');
    const pads = of('keypad');
    const launch = mod('pnl-mod-launch', of('launch').map(makeLaunch));
    const middle = row(mod('pnl-mod-switches', of('switch').map(makeSwitch)), mod('pnl-mod-dial', dials.map(makeDial)));
    const bottom = row();
    const main = h('div', { class: 'pnl-bay' }, row(mod('pnl-mod-light', of('light').map(makeLight)), mod('pnl-mod-buttons', of('button').map(makeButton))), middle, bottom);
    const side = pads.length ? h('div', { class: 'pnl-bay pnl-bay-side' }, mod('pnl-mod-keypad', pads.map(makeKeypad))) : null;
    /** The two ways the console can be laid out: number pad beside the rest (wide) or under it (tall). */
    function arrange(shape) {
      el.classList.remove('pnl-wide', 'pnl-tall');
      el.classList.add(shape);
      if (!launch) return;
      if (!dials.length) middle.append(launch); // beside the switches
      else if (shape === 'pnl-tall' && side) side.append(launch); // beside the number pad, to save height
      else bottom.append(launch); // a row of its own under the dial
    }
    const shutter = h('div', { class: 'pnl-shutter', 'aria-hidden': 'true' }, h('span', { class: 'pnl-shutter-mark' }, '?'));
    const desk = h('div', { class: 'pnl-console' }, main, side, shutter);
    const el = h('div', { class: 'panel-scene pnl-locked' }, desk);
    arrange('pnl-wide');

    // Touching the panel before it is his turn (anywhere on it, also on the cover).
    const onTouch = (e) => {
      if (mode === 'ready') return void host.onIdle();
      if (mode !== 'listening') return;
      const hit = e.target.closest?.('.pnl-ctl');
      if (hit) pulse(hit, 'nudge', 450);
      host.onEarly();
    };
    el.addEventListener('click', onTouch);

    /** Show the state of every control, and - once two or more have been worked - the order they were finished in. */
    function paint() {
      now = replay(scene, actions);
      const done = Object.keys(now.last).filter((id) => now.state[id] !== start[id]).sort((a, b) => now.last[a] - now.last[b]);
      for (const [id, part] of parts) {
        part.paint(now.state[id]);
        const place = done.indexOf(id);
        part.el.classList.toggle('pnl-changed', place >= 0);
        part.el.querySelector('.pnl-badge').textContent = place >= 0 && done.length > 1 ? String(place + 1) : '';
      }
    }
    paint();

    return {
      el,
      fit(container) {
        // Every size in the stylesheet is a multiple of --u, so measure once at 1px and scale.
        desk.style.display = 'none';
        const box = container.getBoundingClientRect();
        desk.style.display = '';
        if (!box.width || !box.height) return;
        el.style.setProperty('--u', '1px');
        let best = null;
        for (const shape of ['pnl-wide', 'pnl-tall']) {
          arrange(shape);
          const size = desk.getBoundingClientRect();
          const u = Math.min((box.width - 10) / size.width, (box.height - 18) / size.height, MAX_SCALE);
          if (!best || u > best.u + 0.01) best = { shape, u };
        }
        arrange(best.shape);
        el.style.setProperty('--u', `${Math.max(0.3, Math.floor(best.u * 100) / 100)}px`);
      },
      setMode(m) {
        mode = m;
        el.classList.toggle('pnl-locked', m !== 'respond');
        el.dataset.mode = m;
      },
      setCovered: (v) => el.classList.toggle('pnl-covered', !!v),
      reset() {
        actions = [];
        paint();
      },
      answer: () => ({ actions: actions.map((a) => ({ ...a })), state: { ...now.state } }),
      size: () => actions.length,
      undo() {
        actions.pop();
        paint();
      },
      /** Slowly do the right thing, one touch at a time. */
      async demo(onStep) {
        actions = [];
        paint();
        const steps = solution(item);
        for (let i = 0; i < steps.length; i++) {
          await wait(i && steps[i].c === steps[i - 1].c ? 420 : 700);
          if (dead) return;
          actions.push(steps[i]);
          paint();
          pulse(touched(steps[i]), 'pnl-press', 260);
          pulse(parts.get(steps[i].c).el, 'pnl-show', 600);
          onStep?.(i);
        }
        await wait(1100);
      },
      celebrate() {
        const worked = [...parts].filter(([id]) => now.state[id] !== start[id]);
        for (const [, part] of worked) pulse(part.el, 'pnl-show', 900);
        pulse(desk, 'calm-win', 900);
      },
      shake: () => pulse(desk, 'shake', 500),
      destroy() {
        dead = true;
        el.removeEventListener('click', onTouch);
      },
    };
  },
  check,
  isNone: () => false, // there is always something to do on the panel
};
