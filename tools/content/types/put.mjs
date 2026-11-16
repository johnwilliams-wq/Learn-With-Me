// Content rules for activity type "put" (see src/listening/scenes/put.js): things on a shelf
// are moved into, onto or under places.
//
// A generator's draft:
//   { t: 'put', say, things: [obj(kind, color, size)...], places: [{ kind, prep }...],
//     moves: [{ what: [thing references], n?, to: place reference }...], ordered?, hide?, s, v, g? }
//   - a place is a container ({ kind: 'bag', prep: 'in' }) or one of the table's two places
//     ({ kind: 'table', prep: 'on' } and { kind: 'table', prep: 'under' }: always both);
//   - a move says: `n` of the things in `what` (default: all of them) must end up in `to`;
//   - ordered: true = the moves must be made in the order they are listed.
// finish() shuffles the shelf and the places, gives ids, and turns the references into ids.

import { clashes } from '../lib.mjs';
import { OBJECT_KINDS } from '../../../src/art/sprites.js';
import { CONTAINER_KINDS } from '../../../src/art/put.js';
import put, { CAPACITY, check, solution } from '../../../src/listening/scenes/put.js';

/** How many things fit in a place: { in, on, under } (the play area enforces the same numbers). */
export { CAPACITY };
/** Things whose names sound too much like a place's name are never in a scene with it. */
export const PLACE_CLASH = { pot: ['potion'], cart: ['heart'], bag: ['flag'] };
/** What may stand on the shelf: every object except the chest (here "the chest" is a place). */
export const THING_KINDS = OBJECT_KINDS.filter((k) => k !== 'chest');

const num = (id) => Number(id.slice(1));
const soundsAlike = (things, places) => {
  for (let i = 0; i < things.length; i++) for (let j = i + 1; j < things.length; j++) if (clashes(things[i].kind, things[j].kind)) return true;
  return places.some((p) => things.some((t) => (PLACE_CLASH[p.kind] || []).includes(t.kind)));
};

export default {
  finish(rng, draft) {
    const { t, say, things, places, moves, ordered, ...rest } = draft;
    if (things.length > 12) throw new Error('too many things on the shelf');
    if (soundsAlike(things, places)) throw new Error('sound-alike words in one scene - try again');

    const shelf = rng.shuffle(things);
    const thingId = new Map(shelf.map((o, i) => [o, `o${i + 1}`]));
    // the table's two places stay together (on, then under); otherwise the places are shuffled
    const table = ['on', 'under'].map((prep) => places.find((p) => p.kind === 'table' && p.prep === prep)).filter(Boolean);
    const units = rng.shuffle([...places.filter((p) => p.kind !== 'table').map((p) => [p]), ...(table.length ? [table] : [])]);
    const placeId = new Map(units.flat().map((p, i) => [p, `p${i + 1}`]));

    const expect = {
      moves: moves.map((m) => {
        const ids = m.what.map((o) => thingId.get(o));
        const to = placeId.get(m.to);
        if (ids.some((id) => !id) || !to) throw new Error('a move refers to something that is not in the scene');
        return { ids: ids.sort((a, b) => num(a) - num(b)), n: m.n ?? ids.length, to };
      }),
    };
    if (ordered) expect.ordered = true;
    return {
      say, t: 'put',
      scene: {
        objects: shelf.map((o) => ({ id: thingId.get(o), kind: o.kind, color: o.color, size: o.size || 'big' })),
        places: units.flat().map((p) => ({ id: placeId.get(p), kind: p.kind, prep: p.prep || 'in' })),
      },
      expect, ...rest,
    };
  },

  validate(item, { fail, checkObjects }) {
    const { objects, places } = item.scene;
    checkObjects(objects, { min: 2, max: 12 });
    for (const o of objects) if (!THING_KINDS.includes(o.kind)) fail(`${o.kind} cannot stand on the shelf`);
    if (item.hide && objects.length > 9) fail('too much to remember on a hidden shelf');
    if (item.auto || item.mode) fail('put items are finished with the Done button');

    // the places
    if (!Array.isArray(places) || places.length < 2) fail('a scene needs at least two places');
    if (new Set(places.map((p) => p.id)).size !== places.length) fail('duplicate place ids');
    const containers = places.filter((p) => p.kind !== 'table');
    const table = places.filter((p) => p.kind === 'table');
    for (const p of containers) if (!CONTAINER_KINDS.includes(p.kind) || p.prep !== 'in') fail(`unknown place ${p.prep} ${p.kind}`);
    if (new Set(containers.map((p) => p.kind)).size !== containers.length) fail('two containers of the same kind');
    if (table.length && (table.length !== 2 || table[0].prep !== 'on' || table[1].prep !== 'under' || places.indexOf(table[1]) !== places.indexOf(table[0]) + 1)) fail('the table needs its two places, on then under, side by side');
    if (containers.length + (table.length ? 1 : 0) > 3) fail('too many places to fit on the screen');
    if (soundsAlike(objects, places)) fail('sound-alike words in one scene');

    // the answer
    const moves = item.expect?.moves;
    if (!Array.isArray(moves)) fail('expect.moves must be a list');
    if ('ordered' in item.expect && (item.expect.ordered !== true || moves.length < 2)) fail('ordered needs at least two moves');
    const ids = new Set(objects.map((o) => o.id));
    const prep = new Map(places.map((p) => [p.id, p.prep]));
    const load = new Map();
    moves.forEach((m, i) => {
      if (!Array.isArray(m.ids) || !m.ids.length || new Set(m.ids).size !== m.ids.length || m.ids.some((id) => !ids.has(id))) fail(`move ${i + 1} names things that are not on the shelf`);
      if (!Number.isInteger(m.n) || m.n < 1 || m.n > m.ids.length) fail(`move ${i + 1} has an impossible count`);
      if (!prep.has(m.to)) fail(`move ${i + 1} goes to a place that is not there`);
      load.set(m.to, (load.get(m.to) || 0) + m.n);
      for (const other of moves.slice(0, i)) {
        const shared = m.ids.filter((id) => other.ids.includes(id)).length;
        if (shared && (shared !== m.ids.length || shared !== other.ids.length)) fail('two moves share only some of their things');
        if (shared && other.to === m.to) fail('two moves put the same things in the same place');
      }
      const sameThings = moves.filter((o) => o.ids.includes(m.ids[0]));
      if (sameThings.reduce((n, o) => n + o.n, 0) > m.ids.length) fail('more is asked for than there is');
    });
    for (const [to, n] of load) if (n > CAPACITY[prep.get(to)]) fail(`more than fits ${prep.get(to)} one place`);

    // the checker must accept the model answer, and must not accept nothing (or anything short of it)
    const steps = solution(item);
    const answer = (list) => ({ moves: list, where: Object.fromEntries(list) });
    if (!check(answer(steps), item).correct) fail('the model answer is not accepted by the checker');
    if (steps.length && check(answer([]), item).correct) fail('doing nothing is accepted');
    if (steps.length > 1 && check(answer(steps.slice(0, -1)), item).correct) fail('stopping one move short is accepted');
    if (item.expect.ordered && check(answer(steps.slice().reverse()), item).correct) fail('the order does not matter although the item says it does');
    // there must be a way to get it wrong by putting one thing in one place (also used by the test robot)
    if (!objects.some((o) => places.some((p) => !moves.some((m) => m.ids.includes(o.id) && m.to === p.id)))) fail('every thing may go everywhere');
  },

  isNone: put.isNone,
};
