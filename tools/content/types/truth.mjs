// Content rules for activity type "truth" (see src/listening/scenes/truth.js):
// a picture (objects in a grid, as in "tap") and a sentence that is true or not true.
import { finish as finishTap } from '../lib.mjs';

export default {
  /** draft: { t: 'truth', say, objects, truth: boolean, cols?, keepOrder?, hide?, s, v } */
  finish(rng, draft) {
    const { truth, t, ...rest } = draft;
    if (typeof truth !== 'boolean') throw new Error('a truth item needs truth: true or false');
    const item = finishTap(rng, { ...rest, expect: [] });
    return { ...item, t: 'truth', expect: truth, auto: true };
  },
  validate(item, { fail, checkObjects }) {
    checkObjects(item.scene.objects, { min: 1 });
    if (typeof item.expect !== 'boolean') fail('expect must be true or false');
    if (!item.auto) fail('truth items are answered with one tap (auto)');
  },
  isNone: () => false,
};
