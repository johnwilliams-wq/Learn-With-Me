// Content rules for activity type "tap" (see src/listening/scenes/tap.js).
import { finish } from '../lib.mjs';

export default {
  /** draft: { say, objects, expect (groups of object references), cols?, keepOrder?, auto?, mode?, hide?, s, v, g? } */
  finish,
  validate(item, { fail, checkObjects }) {
    checkObjects(item.scene.objects, { min: 2 });
    const ids = new Set(item.scene.objects.map((o) => o.id));
    if (!Array.isArray(item.expect) || item.expect.some((g) => !Array.isArray(g))) fail('expect must be a list of groups');
    for (const id of item.expect.flat()) if (!ids.has(id)) fail(`expect names missing object ${id}`);
    if (item.auto && item.expect.flat().length > 1) fail('auto-submit item needs more than one tap');
    if (item.mode === 'pick' && (item.expect.length !== 1 || new Set(item.expect[0]).size !== item.expect[0].length)) fail('pick items need one group of different objects');
  },
  isNone: (item) => item.expect.flat().length === 0,
};
