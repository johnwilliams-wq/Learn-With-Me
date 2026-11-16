// Content rules for activity type "route" (see src/listening/scenes/route.js): a map of squares,
// a rover on its start square, landmarks, and sometimes things to pick up.
//
// A generator's draft:
//   { t: 'route', say, cols, rows, start: [c, r],
//     marks: [{ kind, color?, at: [c, r] }],        landmarks (and flags, which have a colour)
//     loot:  [{ kind, color, at: [c, r] }],         things that are picked up by driving over them
//     moves: [['up', 2], ['right', 3]],             counted route: exactly this path is right
//     goal:  { end, via: [], need: [], avoid: [] }, places: REFERENCES to marks / loot (see the scene file)
//     hide?, s, v }
// [c, r] = [column, row], [0, 0] is the top left square.

import { check, solve, DIRS } from '../../../src/listening/scenes/route.js';
import { LANDMARK_KINDS } from '../../../src/art/route.js';

export { DIRS };
export const LANDMARKS = LANDMARK_KINDS;
export const LOOT = ['key', 'coin', 'star', 'gem']; // none of these sound like each other or like a landmark
export const MARK_KINDS = [...LANDMARK_KINDS, 'flag'];
export const MAX_PATH = 16;

const same = (a, b) => a[0] === b[0] && a[1] === b[1];
const inside = (scene, p) => Number.isInteger(p?.[0]) && Number.isInteger(p?.[1]) && p[0] >= 0 && p[1] >= 0 && p[0] < scene.cols && p[1] < scene.rows;

/** The squares a counted route drives onto. Throws "try again" when it would leave the map. */
export function walk(scene, moves) {
  const path = [];
  let at = scene.start;
  for (const [dir, n] of moves) {
    for (let k = 0; k < n; k++) {
      at = [at[0] + DIRS[dir][0], at[1] + DIRS[dir][1]];
      if (!inside(scene, at)) throw new Error('try again: the route leaves the map');
      path.push(at);
    }
  }
  return path;
}

export default {
  finish(rng, draft) {
    const { t, say, cols, rows, start, marks = [], loot = [], moves, goal, ...rest } = draft;
    const scene = { cols, rows, start: start.slice() };
    // ids are handed out in a shuffled order, so they say nothing about the answer
    const ids = new Map();
    const place = (list, letter) => rng.shuffle(list).map((o, i) => {
      const out = { id: `${letter}${i + 1}`, kind: o.kind };
      if (o.color) out.color = o.color;
      out.at = o.at.slice();
      ids.set(o, out);
      return out;
    });
    scene.marks = place(marks, 'm');
    if (loot.length) scene.loot = place(loot, 'p');
    const at = (o) => {
      const placed = ids.get(o);
      if (!placed) throw new Error('the goal refers to something that is not on the map');
      return placed.at.slice();
    };
    let expect;
    if (moves) expect = { path: walk(scene, moves) };
    else if (goal) expect = { end: at(goal.end), via: (goal.via || []).map(at), need: (goal.need || []).map(at), avoid: (goal.avoid || []).map(at) };
    else throw new Error('a route item needs moves or a goal');
    const item = { say, t: 'route', scene, expect, ...rest };
    if (!moves) {
      const best = solve(item);
      if (!best.length) throw new Error('try again: no way to do this');
      if (best.length > MAX_PATH) throw new Error('try again: the drive is too long');
    }
    return item;
  },

  validate(item, { fail, COLOURS }) {
    const { scene, expect } = item;
    if (!scene || !(scene.cols >= 3 && scene.cols <= 6) || !(scene.rows >= 3 && scene.rows <= 5)) fail('the map must be 3-6 squares wide and 3-5 high');
    if (!inside(scene, scene.start)) fail('the rover starts off the map');
    const marks = scene.marks || [];
    const loot = scene.loot || [];
    const all = [...marks, ...loot];
    if (new Set(all.map((o) => o.id)).size !== all.length) fail('duplicate ids');
    const taken = new Set([String(scene.start)]);
    for (const o of all) {
      if (!inside(scene, o.at)) fail(`${o.id} is off the map`);
      if (taken.has(String(o.at))) fail(`two things on square ${o.at}`);
      taken.add(String(o.at));
    }
    for (const m of marks) {
      if (!MARK_KINDS.includes(m.kind)) fail(`unknown landmark ${m.kind}`);
      if (m.kind === 'flag' ? !COLOURS.has(m.color) : m.color !== undefined) fail(`${m.id}: only flags have a colour`);
    }
    for (const l of loot) if (!LOOT.includes(l.kind) || !COLOURS.has(l.color)) fail(`bad thing to pick up ${l.kind} ${l.color}`);
    // nothing may have a double: "the tree", "the red flag", "the blue key" must each mean one thing
    const names = all.map((o) => `${o.color || ''} ${o.kind}`);
    if (new Set(names).size !== names.length) fail('two things on the map look the same');
    if (item.auto || item.mode) fail('route items are finished with the green check mark');

    if (!expect || typeof expect !== 'object' || Array.isArray(expect)) fail('expect must be { path } or { end, via, need, avoid }');
    if ('path' in expect) {
      if (Object.keys(expect).length !== 1 || !Array.isArray(expect.path) || expect.path.length < 1 || expect.path.length > MAX_PATH) fail(`a counted route has 1-${MAX_PATH} moves`);
      let at = scene.start;
      for (const p of expect.path) {
        if (!inside(scene, p) || Math.abs(p[0] - at[0]) + Math.abs(p[1] - at[1]) !== 1) fail('the route jumps or leaves the map');
        if (all.some((o) => same(o.at, p))) fail('a counted route must not drive over anything');
        at = p;
      }
      if (new Set(expect.path.map(String)).size !== expect.path.length || expect.path.some((p) => same(p, scene.start))) fail('a counted route must not cross itself');
    } else {
      const { end, via, need, avoid } = expect;
      if (Object.keys(expect).sort().join() !== 'avoid,end,need,via' || ![via, need, avoid].every(Array.isArray)) fail('expect must be { end, via, need, avoid }');
      const on = (list, p) => list.some((o) => same(o.at, p));
      if (!inside(scene, end) || !on(marks, end)) fail('the last stop must be a landmark');
      for (const p of via) if (!inside(scene, p) || !on(marks, p)) fail('every stop on the way must be a landmark');
      for (const p of need) if (!inside(scene, p) || !on(all, p)) fail('a square to drive over must have something on it');
      for (const p of avoid) if (!inside(scene, p) || !on(all, p)) fail('a square to keep off must have something on it');
      const named = [end, ...via, ...need, ...avoid].map(String);
      if (new Set(named).size !== named.length) fail('one square is named twice in expect');
      const best = solve(item);
      if (!best.length || best.length > MAX_PATH) fail(`there must be a way to do it in at most ${MAX_PATH} moves`);
      if (!check(best, item).correct) fail('the demo path is not accepted by the checker');
    }
    if (check([], item).correct) fail('an empty answer must never be right');
  },

  isNone: () => false,
};
