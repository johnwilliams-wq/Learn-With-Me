// Content rules for activity type "paint" (see src/listening/scenes/paint.js): a picture of
// unpainted things, a shelf of paint pots, and the colour each thing must end up with.
import { COLORS, autoCols, clashes } from '../lib.mjs';

const MAX_THINGS = 8;

export default {
  /**
   * draft: { t: 'paint', say, objects, jobs, pots?, cols?, keepOrder?, hide?, s, v }
   *   objects  the things in the picture: { kind, size } references (their colour is always gray)
   *   jobs     [[thing or list of things, colour], ...] done in the order given; painting a thing
   *            again replaces its colour, and a colour of null washes it clean
   *   pots     how many paint pots are on the shelf (default: all six). Every colour that is
   *            spoken is always there; the rest are picked at random
   */
  finish(rng, draft) {
    const { say, objects, jobs, pots = COLORS.length, cols, keepOrder = false, t, ...rest } = draft;
    if (!Array.isArray(objects) || objects.length > MAX_THINGS) throw new Error('a paint picture holds at most 8 things');
    for (let i = 0; i < objects.length; i++) for (let j = i + 1; j < objects.length; j++) {
      if (clashes(objects[i].kind, objects[j].kind)) throw new Error('sound-alike kinds in one scene');
    }
    const placed = keepOrder ? objects.slice() : rng.shuffle(objects);
    const ids = new Map(placed.map((o, i) => [o, `o${i + 1}`]));

    const final = new Map();
    const spoken = new Set();
    for (const [what, colour] of jobs) {
      if (colour !== null && !COLORS.includes(colour)) throw new Error(`unknown paint colour ${colour}`);
      if (colour) spoken.add(colour);
      for (const o of Array.isArray(what) ? what : [what]) {
        const id = ids.get(o);
        if (!id) throw new Error('a paint job refers to a thing that is not in the picture');
        if (colour) final.set(id, colour);
        else final.delete(id);
      }
    }
    if (!final.size) throw new Error('a paint item must leave something painted');

    const want = Math.max(Math.min(pots, COLORS.length), spoken.size + 1); // always at least one pot that is not needed
    const others = rng.shuffle(COLORS.filter((c) => !spoken.has(c))).slice(0, Math.max(0, want - spoken.size));
    const paints = COLORS.filter((c) => spoken.has(c) || others.includes(c)); // always in the same order on the shelf

    return {
      say,
      t: 'paint',
      scene: {
        cols: cols || autoCols(placed.length),
        objects: placed.map((o) => ({ id: ids.get(o), kind: o.kind, color: 'gray', size: o.size || 'big' })),
        paints,
      },
      expect: Object.fromEntries(placed.map((o) => ids.get(o)).filter((id) => final.has(id)).map((id) => [id, final.get(id)])),
      ...rest,
    };
  },

  validate(item, { fail, checkObjects, COLOURS }) {
    const { scene, expect } = item;
    checkObjects(scene.objects, { min: 2, max: MAX_THINGS });
    if (scene.objects.some((o) => o.color !== 'gray')) fail('things in a paint picture start unpainted (gray)');
    if (!Number.isInteger(scene.cols) || scene.cols < 1 || scene.cols > scene.objects.length) fail('bad cols');
    if (!Array.isArray(scene.paints) || scene.paints.length < 2 || new Set(scene.paints).size !== scene.paints.length) fail('the shelf needs at least two different paints');
    for (const c of scene.paints) if (!COLOURS.has(c)) fail(`unknown paint ${c}`);
    if (!expect || typeof expect !== 'object' || Array.isArray(expect)) fail('expect must be { thing id: colour }');
    const ids = new Set(scene.objects.map((o) => o.id));
    const entries = Object.entries(expect);
    if (!entries.length) fail('nothing to paint');
    for (const [id, c] of entries) {
      if (!ids.has(id)) fail(`expect names missing thing ${id}`);
      if (!scene.paints.includes(c)) fail(`${c} paint is needed but not on the shelf`);
    }
    if (new Set(Object.values(expect)).size === scene.paints.length) fail('every pot is needed: add one that is not');
    for (const c of COLOURS) {
      const said = new RegExp(`\\b${c}\\b`, 'i').test(item.say);
      if (said && !scene.paints.includes(c)) fail(`the sentence says ${c} but there is no ${c} paint`);
    }
    if (item.auto) fail('paint items are finished with the Done button');
    if (item.mode) fail('paint items have no mode');
  },

  isNone: () => false,
};
