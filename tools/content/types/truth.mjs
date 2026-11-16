// Content rules for activity type "truth" (see src/listening/scenes/truth.js):
// a picture (objects in a grid or a single row, as in "tap") and a sentence that is true or not true.
import { finish as finishTap } from '../lib.mjs';

export default {
  /**
   * draft: { t: 'truth', say, objects, truth: boolean, about?, cols?, keepOrder?, hide?, s, v, g? }
   *   about   optional: groups of object REFERENCES - the things the sentence talks about. After two misses
   *           the guide points at them (group by group, each group in reading order) before showing the answer.
   *   g       optional quota group; 'yes' / 'no' must agree with `truth` (levels use quota: { yes: 2, no: 2 }).
   */
  finish(rng, draft) {
    const { truth, t, about, ...rest } = draft;
    if (typeof truth !== 'boolean') throw new Error('a truth item needs truth: true or false');
    const item = finishTap(rng, { ...rest, expect: about || [] }); // (borrows the reference -> id step for `about`)
    const place = new Map(item.scene.objects.map((o, i) => [o.id, i]));
    const ids = [...new Set(item.expect.flatMap((group) => [...group].sort((a, b) => place.get(a) - place.get(b))))];
    const scene = ids.length ? { ...item.scene, about: ids } : item.scene;
    return { ...item, scene, t: 'truth', expect: truth, auto: true };
  },
  validate(item, { fail, checkObjects }) {
    checkObjects(item.scene.objects, { min: 1 });
    if (typeof item.expect !== 'boolean') fail('expect must be true or false');
    if (!item.auto) fail('truth items are answered with one tap (auto)');
    if (item.mode) fail('truth items have no mode');
    if ((item.g === 'yes' || item.g === 'no') && item.g !== (item.expect ? 'yes' : 'no')) fail(`quota group "${item.g}" does not match the answer`);
    const { about } = item.scene;
    if (about !== undefined) {
      const ids = new Set(item.scene.objects.map((o) => o.id));
      if (!Array.isArray(about) || !about.length || new Set(about).size !== about.length || about.some((id) => !ids.has(id))) fail('scene.about must list different objects of the picture');
    }
  },
  isNone: () => false,
};
