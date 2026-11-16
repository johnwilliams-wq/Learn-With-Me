// Activity type "route": he steers a little rover across a map the way the voice says.
//
// The map is a grid of squares, [column, row] with [0, 0] at the top left. The rover starts on
// scene.start; LANDMARKS (scene.marks) and things to pick up (scene.loot) sit on other squares.
// Four big arrows move the rover one square per tap (up, down, left and right are the directions
// on the screen); tapping a square next to the rover moves there too. His answer is the path:
// the list of squares he drove onto, in order (the start square is not in it).
//
// `expect` is one of
//   { path: [[c, r], ...] }                    counted moves ("up two, then right three"): exactly this path
//   { end, via: [...], need: [...], avoid: [...] }
//                                              places: any path is right that finishes on `end`, comes past
//                                              the `via` squares in that order, drives over every `need`
//                                              square at some point, and never touches an `avoid` square

import { h, pulse, wait } from '../../core/dom.js';
import { spriteSVG } from '../../art/sprites.js';
import { landmarkSVG, roverSVG, arrowSVG } from '../../art/route.js';

export const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const MAX_MOVES = 40;

const same = (a, b) => !!a && !!b && a[0] === b[0] && a[1] === b[1];
const key = (p) => `${p[0]},${p[1]}`;
const has = (list, p) => (list || []).some((q) => same(p, q));
const inside = (scene, p) => p[0] >= 0 && p[1] >= 0 && p[0] < scene.cols && p[1] < scene.rows;
const things = (scene) => [...(scene.marks || []), ...(scene.loot || [])];

/** A path as legs: [['up', 2], ['right', 3]]. */
function legsOf(start, path) {
  const legs = [];
  let at = start;
  for (const p of path) {
    const dir = Object.keys(DIRS).find((d) => at[0] + DIRS[d][0] === p[0] && at[1] + DIRS[d][1] === p[1]) || '?';
    if (legs.length && legs.at(-1)[0] === dir) legs.at(-1)[1]++;
    else legs.push([dir, 1]);
    at = p;
  }
  return legs;
}

function checkExact(path, expect, scene) {
  const want = expect.path;
  const total = want.length;
  let at = 0;
  while (at < path.length && at < want.length && same(path[at], want[at])) at++;
  if (at === want.length && at === path.length) return { correct: true, error: '', at: -1, prefix: total, total };
  const fail = (error) => ({ correct: false, error, at, prefix: at, total });
  const mine = legsOf(scene.start, path);
  const theirs = legsOf(scene.start, want);
  const sameTurns = (a, b) => a.every((leg, i) => leg[0] === b[i][0]);
  if (mine.length === theirs.length && sameTurns(mine, theirs)) return fail('count'); // the right turns, the wrong number of squares
  if (at === path.length) return fail('incomplete'); // right so far, but he stopped early
  if (at === want.length) return fail('extra'); // the whole route, and then more
  if (mine.length < theirs.length && sameTurns(mine, theirs)) return fail('count');
  const sorted = (legs) => legs.map((l) => l.join(' ')).sort().join('|');
  if (sorted(mine) === sorted(theirs)) return fail('order'); // the right parts in the wrong order
  return fail('path');
}

function checkPlaces(path, expect, scene) {
  const { end, via = [], need = [], avoid = [] } = expect;
  let done = 0; // how many of the stops on the way he has come past, in order
  for (const p of path) if (done < via.length && same(p, via[done])) done++;
  const visited = (p) => has(path, p);
  const last = path.at(-1);
  const fail = (error) => ({ correct: false, error, at: done, prefix: done, total: 0 });

  if (!same(last, end)) {
    if (has(via, last)) return fail(via.every(visited) && visited(end) ? 'order' : 'incomplete'); // finished on a stop that was not the last one
    if (visited(end)) return fail('extra'); // got there, then drove on
    const there = (scene.marks || []).find((m) => same(m.at, last));
    if (there) {
      const goal = (scene.marks || []).find((m) => same(m.at, end));
      return fail(goal && goal.kind === there.kind ? 'attribute' : 'object'); // another place (or the right kind, wrong colour)
    }
    return fail('incomplete');
  }
  if (done < via.length) return fail(via.every(visited) ? 'order' : 'incomplete');
  if (!need.every(visited)) return fail('incomplete');
  const touched = avoid.find(visited);
  if (touched) return fail((scene.loot || []).some((l) => same(l.at, touched)) ? 'extra' : 'path'); // picked up too much / drove where he must not
  const total = via.length + need.length + 1;
  return { correct: true, error: '', at: -1, prefix: total, total: 0 };
}

/** answer: the squares he drove onto, in order ([] = he pressed the hand, which is never right here) */
export function check(answer, item) {
  const path = Array.isArray(answer) ? answer : [];
  const exact = Array.isArray(item.expect.path);
  if (!path.length) return { correct: false, error: 'no-response', at: 0, prefix: 0, total: exact ? item.expect.path.length : 0 };
  return exact ? checkExact(path, item.expect, item.scene) : checkPlaces(path, item.expect, item.scene);
}

/**
 * A good path to show him (the demo after two misses). Counted routes have exactly one. For places
 * it is the shortest tidy one: it never touches an `avoid` square, and it prefers not to drive over
 * a later stop, another landmark or a thing nobody asked for.
 */
export function solve(item) {
  const { scene, expect } = item;
  if (Array.isArray(expect.path)) return expect.path.map((p) => p.slice());
  const { end, via = [], need = [], avoid = [] } = expect;
  const full = (1 << need.length) - 1;
  const busy = new Map(things(scene).map((t) => [key(t.at), t]));
  const start = { p: scene.start, v: 0, m: 0 };
  const id = (s) => `${key(s.p)}|${s.v}|${s.m}`;
  const cost = new Map([[id(start), 0]]);
  const from = new Map();
  const open = [start];
  while (open.length) {
    let best = 0;
    for (let i = 1; i < open.length; i++) if (cost.get(id(open[i])) < cost.get(id(open[best]))) best = i;
    const s = open.splice(best, 1)[0];
    if (same(s.p, end) && s.v === via.length && s.m === full) {
      const out = [];
      for (let k = id(s), state = s; from.has(k); state = from.get(k), k = id(state)) out.unshift(state.p);
      return out;
    }
    for (const d of Object.values(DIRS)) {
      const p = [s.p[0] + d[0], s.p[1] + d[1]];
      if (!inside(scene, p) || has(avoid, p)) continue;
      const next = { p, v: s.v, m: s.m };
      let wanted = false;
      if (next.v < via.length && same(p, via[next.v])) { next.v++; wanted = true; }
      const n = need.findIndex((q) => same(p, q));
      if (n >= 0) { wanted = wanted || !(next.m & (1 << n)); next.m |= 1 << n; }
      const goal = same(p, end);
      const early = goal && !(next.v === via.length && next.m === full);
      const step = 1 + (early ? 6 : !wanted && !goal && busy.has(key(p)) ? 3 : 0);
      const c = cost.get(id(s)) + step;
      if (!cost.has(id(next)) || c < cost.get(id(next))) {
        if (!cost.has(id(next))) open.push(next);
        cost.set(id(next), c);
        from.set(id(next), s);
      }
    }
  }
  return [];
}

const thingSVG = (t, loot) => (loot || t.kind === 'flag' ? spriteSVG(t.kind, t.color || 'red') : landmarkSVG(t.kind));

export default {
  create(item, host) {
    const scene = item.scene;
    const { cols, rows, start } = scene;
    let path = []; // the squares he has driven onto, in order
    let mode = 'off';
    let dead = false;
    const here = () => path.at(-1) || start;

    // --- the map ---------------------------------------------------------------------------
    const squares = new Map();
    const map = h('div', { class: 'route-map', style: { '--cols': cols, '--rows': rows } });
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const mark = (scene.marks || []).find((m) => same(m.at, [c, r]));
        const loot = (scene.loot || []).find((l) => same(l.at, [c, r]));
        const thing = mark || loot;
        const label = thing ? `${thing.color ? `${thing.color} ` : ''}${thing.kind}` : same(start, [c, r]) ? 'start' : 'empty square';
        const sq = h('button', { class: `route-sq${(c + r) % 2 ? ' route-alt' : ''}`, type: 'button', dataset: { c, r }, 'aria-label': label, onclick: () => tapSquare([c, r]) },
          same(start, [c, r]) && h('span', { class: 'route-home', 'aria-hidden': 'true' }),
          thing && h('span', { class: `route-thing ${loot ? 'route-loot' : 'route-mark'}`, dataset: { id: thing.id, kind: thing.kind }, html: thingSVG(thing, !!loot) }),
          h('span', { class: 'route-badge', 'aria-hidden': 'true' }));
        squares.set(key([c, r]), sq);
        map.append(sq);
      }
    }
    const trail = h('div', { class: 'route-trail', 'aria-hidden': 'true' });
    const roverArt = h('span', { class: 'route-rover-art', html: roverSVG() });
    const rover = h('div', { class: 'route-rover', 'aria-hidden': 'true' }, h('span', { class: 'route-rover-body' }, roverArt));
    const fog = h('div', { class: 'route-fog', 'aria-hidden': 'true' }, '?');
    map.append(trail, rover, fog);

    // --- the steering arrows ---------------------------------------------------------------
    const arrows = {};
    const pad = h('div', { class: 'route-pad' });
    for (const dir of Object.keys(DIRS)) {
      arrows[dir] = h('button', { class: 'route-arrow', type: 'button', dataset: { dir }, 'aria-label': dir, html: arrowSVG(dir), onclick: () => tapArrow(dir) });
      pad.append(arrows[dir]);
    }
    pad.append(h('span', { class: 'route-pad-mid', 'aria-hidden': 'true', html: roverSVG() }));
    const el = h('div', { class: 'route-scene route-locked', dataset: { layout: 'side' } }, map, pad);

    // --- drawing what he has done so far ---------------------------------------------------
    function paint() {
      const at = here();
      rover.style.setProperty('--x', at[0]);
      rover.style.setProperty('--y', at[1]);
      rover.classList.toggle('route-parked', !!squares.get(key(at)).querySelector('.route-thing'));
      const centre = (p) => `${p[0] * 100 + 50} ${p[1] * 100 + 50}`;
      const line = [start, ...path].map(centre).join(' ');
      const dots = path.slice(0, -1).map((p) => `<circle cx="${p[0] * 100 + 50}" cy="${p[1] * 100 + 50}" r="9"/>`).join('');
      trail.innerHTML = path.length
        ? `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${cols * 100} ${rows * 100}"><polyline class="route-line-edge" points="${line}"/><polyline class="route-line" points="${line}"/><g class="route-dots">${dots}</g></svg>`
        : '';
      // Places he has come past get a number (the order he reached them in); things he drove over are picked up.
      const order = [];
      for (const p of path) if (!order.includes(key(p)) && squares.get(key(p)).querySelector('.route-mark')) order.push(key(p));
      for (const [k, sq] of squares) {
        const visited = path.some((p) => key(p) === k);
        const badge = sq.querySelector('.route-badge');
        const isMark = !!sq.querySelector('.route-mark');
        const isLoot = !!sq.querySelector('.route-loot');
        sq.classList.toggle('route-on', visited);
        sq.classList.toggle('route-here', key(at) === k);
        sq.classList.toggle('route-got', isLoot && visited);
        badge.textContent = visited && isMark ? String(order.indexOf(k) + 1) : visited && isLoot ? '✓' : '';
      }
      for (const dir of Object.keys(DIRS)) {
        arrows[dir].classList.toggle('route-blocked', !inside(scene, [at[0] + DIRS[dir][0], at[1] + DIRS[dir][1]]));
      }
    }

    // --- input -----------------------------------------------------------------------------
    /** true only when it is his turn; otherwise tells the mission he touched too soon (or before the ear). */
    function myTurn() {
      if (mode === 'listening') {
        pulse(roverArt, 'nudge', 450);
        host.onEarly();
      } else if (mode === 'ready') host.onIdle();
      return mode === 'respond';
    }
    function moveTo(p) {
      if (path.length >= MAX_MOVES) return void pulse(roverArt, 'nudge', 450);
      path.push(p);
      host.sfx.tap();
      paint();
      host.onChange();
    }
    function tapArrow(dir) {
      if (!myTurn()) return;
      const at = here();
      const p = [at[0] + DIRS[dir][0], at[1] + DIRS[dir][1]];
      if (!inside(scene, p)) return void pulse(roverArt, 'nudge', 450); // the edge of the map: he stays where he is
      moveTo(p);
    }
    function tapSquare(p) {
      if (!myTurn()) return;
      const at = here();
      if (Math.abs(p[0] - at[0]) + Math.abs(p[1] - at[1]) !== 1) return void pulse(roverArt, 'nudge', 450); // one square at a time
      moveTo(p);
    }
    const onKey = (e) => {
      const dir = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' }[e.key];
      if (!dir || !el.isConnected || mode !== 'respond') return;
      e.preventDefault();
      tapArrow(dir);
    };
    document.addEventListener('keydown', onKey);

    paint();

    return {
      el,
      /** The map and the arrows side by side when the space is wide, the arrows underneath when it is tall. */
      fit(container) {
        const box = container.getBoundingClientRect();
        if (!box.width || !box.height) return;
        const side = box.width >= box.height * 1.15;
        const padCell = Math.round(Math.max(62, Math.min(92, side ? box.height * 0.14 : Math.min(box.width * 0.14, box.height * 0.1))));
        const padSize = padCell * 3 + 16;
        const gap = side ? Math.max(14, Math.min(34, box.width * 0.03)) : 14;
        const w = side ? box.width - padSize - gap : box.width;
        const hgt = side ? box.height : box.height - padSize - gap;
        const cell = Math.floor(Math.min((w - 8) / cols, (hgt - 8) / rows, 150));
        el.dataset.layout = side ? 'side' : 'stack';
        el.style.setProperty('--cell', `${Math.max(44, cell)}px`);
        el.style.setProperty('--pad', `${padCell}px`);
        el.style.setProperty('--gap', `${gap}px`);
      },
      setMode(m) {
        mode = m;
        el.classList.toggle('route-locked', m !== 'respond');
      },
      setCovered: (v) => el.classList.toggle('route-covered', !!v),
      reset() {
        path = [];
        paint();
      },
      answer: () => path.map((p) => p.slice()),
      size: () => path.length,
      undo() {
        path.pop();
        paint();
      },
      /** Drive the right route slowly, one square at a time, pausing a little at every turn. */
      async demo(onStep) {
        path = [];
        paint();
        const route = solve(item);
        let before = null;
        for (let i = 0; i < route.length && !dead; i++) {
          const from = path.at(-1) || start;
          const dir = `${route[i][0] - from[0]},${route[i][1] - from[1]}`;
          await wait(before && dir !== before ? 800 : 420);
          if (dead) return;
          before = dir;
          path.push(route[i]);
          paint();
          host.onChange(); // (the dots count along)
          onStep?.(i);
        }
        pulse(roverArt, 'route-hop', 900);
        await wait(1200);
      },
      celebrate() {
        pulse(roverArt, 'route-hop', 900);
        pulse(map, 'route-cheer', 900);
      },
      shake: () => pulse(map, 'shake', 500),
      destroy() {
        dead = true;
        document.removeEventListener('keydown', onKey);
      },
    };
  },
  check,
  isNone: () => false,
};
