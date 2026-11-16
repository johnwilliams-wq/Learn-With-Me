// Content rules for activity type "build" (see src/listening/scenes/build.js): a robot is
// built to a spoken description, one choice in every row of part pictures.
//
//   draft = { t: 'build', say, rows: [{ part, options, fixed? }], expect: { part: value }, base?, hide?, s, v }
//   item  = { t: 'build', say, scene: { base, rows: [{ part, options }] }, expect, hide?, s, v }
//
// finish() puts the rows in body order (antennas at the top, legs at the bottom), shuffles the
// options of every row (unless the row is `fixed`, for sentences such as "the second head")
// and dresses the parts the sentence does not talk about.
import { BUILD_PARTS, BUILD_ORDER } from '../../../src/art/build.js';

/** The plain values a part may wear when the sentence says nothing about it. */
const BASE = { head: ['round', 'square', 'pointy'], arms: ['short', 'long'], bottom: ['legs', 'wheels'] };
const same = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

export default {
  finish(rng, draft) {
    const { rows, expect, base: given, t, ...rest } = draft;
    if (!Array.isArray(rows) || !expect) throw new Error('a build item needs rows and expect');
    const placed = rows
      .slice()
      .sort((a, b) => BUILD_ORDER.indexOf(a.part) - BUILD_ORDER.indexOf(b.part))
      .map((r) => ({ part: r.part, options: r.fixed ? r.options.slice() : rng.shuffle(r.options) }));
    const base = {};
    for (const part of Object.keys(BASE)) {
      if (!placed.some((r) => r.part === part)) base[part] = given?.[part] ?? rng.pick(BASE[part]);
    }
    return { ...rest, t: 'build', scene: { base, rows: placed }, expect: { ...expect } };
  },

  validate(item, { fail }) {
    const { scene, expect } = item;
    if (!scene || !Array.isArray(scene.rows)) fail('a build scene needs rows');
    const { rows, base = {} } = scene;
    if (rows.length < 2 || rows.length > 5) fail(`a build scene needs 2 to 5 rows, not ${rows.length}`);
    const parts = rows.map((r) => r.part);
    if (new Set(parts).size !== parts.length) fail('two rows for the same part');
    for (const row of rows) {
      const all = BUILD_PARTS[row.part];
      if (!all) fail(`unknown robot part ${row.part}`);
      if (!Array.isArray(row.options) || row.options.length < 3 || row.options.length > 4) fail(`the ${row.part} row needs 3 or 4 options`);
      if (new Set(row.options).size !== row.options.length) fail(`the ${row.part} row repeats an option`);
      for (const v of row.options) if (!all.includes(v)) fail(`unknown ${row.part} option ${v}`);
      if (!row.options.includes(expect?.[row.part])) fail(`the answer for ${row.part} is not one of its options`);
    }
    if (!same(parts, BUILD_ORDER.filter((p) => parts.includes(p)))) fail('rows must be in body order');
    if (!expect || typeof expect !== 'object' || Array.isArray(expect) || !same(Object.keys(expect).sort(), parts.slice().sort())) fail('expect must name exactly one value for every row');
    for (const [part, v] of Object.entries(base)) {
      if (parts.includes(part)) fail(`base dresses ${part}, which has its own row`);
      if (!BASE[part]?.includes(v)) fail(`bad base ${part}: ${v}`);
    }
    if (item.auto || item.mode) fail('build items are finished with the green check mark (no auto, no mode)');
  },

  isNone: () => false,
};
