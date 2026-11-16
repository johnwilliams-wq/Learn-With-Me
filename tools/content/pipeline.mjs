// Shared by build.mjs (the real build) and preview.mjs (one world on its own):
// turns a level's generator into finished, validated items.

import { makeRng } from '../../src/core/rng.js';
import { SKILLS } from '../../src/listening/insights.js';
import { OBJECT_KINDS, CHARACTER_KINDS, PALETTE } from '../../src/art/sprites.js';
import { TYPES } from './types/index.mjs';

export const SEED = 'v1'; // change to reshuffle every level's items
export const KINDS = new Set([...OBJECT_KINDS, ...CHARACTER_KINDS]);
export const COLOURS = new Set(Object.keys(PALETTE).filter((c) => c !== 'gray'));

/** Flags an item may carry besides id / say / audio / t / scene / expect / s / v. */
const FLAGS = ['auto', 'mode', 'hide', 'g'];

/** A list of scene objects ({ id, kind, color, size }) is well formed. */
function checkObjects(fail, objects, { min = 1, max = 12 } = {}) {
  if (!Array.isArray(objects) || objects.length < min || objects.length > max) fail(`scene needs ${min}-${max} objects`);
  if (new Set(objects.map((o) => o.id)).size !== objects.length) fail('duplicate object ids');
  for (const o of objects) {
    if (!KINDS.has(o.kind)) fail(`unknown kind ${o.kind}`);
    if (!COLOURS.has(o.color) && o.color !== 'gray') fail(`unknown colour ${o.color}`);
    if (!['big', 'small'].includes(o.size)) fail(`unknown size ${o.size}`);
  }
}

/** Checks every activity type shares, then the type's own. Throws with the item id on any problem. */
export function validateItem(item, level) {
  const fail = (why) => { throw new Error(`${item.id}: ${why} | ${item.say}`); };
  const type = TYPES[item.t || 'tap'];
  if (!type) fail(`unknown activity type ${item.t}`);
  if (!item.s?.length || item.s.some((t) => !(t in SKILLS))) fail(`bad skill tags ${item.s} (they must exist in src/listening/insights.js SKILLS)`);
  if (!item.v) fail('missing pattern name (v)');
  if (!/^[A-Z].*[.?!]$/.test(item.say) || /\s\s/.test(item.say) || /undefined|null|NaN|\[object/.test(item.say)) fail('badly formed sentence');
  if (item.say.length > 420) fail('sentence too long for one clip');
  type.validate(item, { fail, KINDS, COLOURS, checkObjects: (objects, opts) => checkObjects(fail, objects, opts) });
  if (type.isNone(item) && !level.allowNone) fail('"do nothing" item in a level without the hand button');
  return item;
}

/**
 * Build one level's items. `clip(dir, text, speed)` returns the clip file name (and lets the
 * caller record that the clip is needed).
 */
export function buildLevel(world, level, clip) {
  const rng = makeRng(`${level.id}-${SEED}`);
  const speed = level.speed ?? world.speed ?? 0.95;
  const items = [];
  const seen = new Set();
  const perSentence = new Map();
  const maxSame = level.maxSame ?? 1;
  for (let tries = 0; items.length < level.n; tries++) {
    if (tries > level.n * 300) throw new Error(`${level.id}: could not make ${level.n} different items (got ${items.length})`);
    let item;
    try {
      const draft = level.gen(rng, items.length);
      const type = TYPES[draft.t || 'tap'];
      if (!type) throw new Error(`${level.id}: unknown activity type ${draft.t}`);
      item = type.finish(rng, draft);
    } catch (err) {
      if (/ambiguous|cannot pick|sound-alike|try again/.test(err.message)) continue; // unlucky draw
      throw err;
    }
    const key = `${item.say}|${JSON.stringify(item.scene)}`;
    if (seen.has(key) || (perSentence.get(item.say) || 0) >= maxSame) continue;
    seen.add(key);
    perSentence.set(item.say, (perSentence.get(item.say) || 0) + 1);
    const out = { id: `${level.id}-${String(items.length + 1).padStart(2, '0')}`, say: item.say, audio: clip('listening', item.say, speed) };
    if (item.t && item.t !== 'tap') out.t = item.t;
    out.scene = item.scene;
    out.expect = item.expect;
    for (const f of FLAGS) if (item[f]) out[f] = item[f];
    out.s = item.s;
    out.v = item.v;
    validateItem(out, level);
    items.push(out);
  }
  return items;
}

/** What the game needs to know about a level (goes into levels.json). */
export function levelMeta(level) {
  const out = { id: level.id, title: level.title, tip: `tip-${level.id}`, tipText: level.tip, trials: level.trials ?? 6 };
  if (level.allowNone) out.allowNone = true;
  if (level.holdMs) out.holdMs = level.holdMs;
  if (level.quota) out.quota = level.quota;
  if (level.boss) out.boss = true;
  if (level.mix) out.mix = level.mix;
  return out;
}

export function worldMeta(world, levels) {
  const out = { id: world.id, name: world.name, blurb: world.blurb, color: world.color || '#4f7cff' };
  if (world.needs?.length) out.needs = world.needs;
  if (world.needsCount) out.needsCount = world.needsCount;
  if (world.starter) out.starter = true;
  out.levels = levels;
  return out;
}

/** Fill in the defaults a level inherits from its world. */
export function prepare(world, level) {
  level.allowNone = level.allowNone ?? world.allowNone ?? false;
  if (!level.tip) throw new Error(`${level.id}: every level needs a spoken tip`);
  if (level.tip.length > 200) throw new Error(`${level.id}: tip is too long (${level.tip.length} > 200 characters)`);
  if (!level.gen && !level.mix) throw new Error(`${level.id}: needs a generator (gen) or a mix`);
  if (level.gen && !level.n) throw new Error(`${level.id}: say how many items to make (n)`);
  return level;
}
