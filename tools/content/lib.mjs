// Helpers for building listening items. Everything here is deterministic given the rng.

import { createHash } from 'node:crypto';

export const OBJECTS = ['gem', 'key', 'potion', 'shield', 'sword', 'chest', 'map', 'star', 'coin', 'crown', 'bell', 'drum', 'torch', 'boot', 'book', 'mushroom', 'hat', 'ring', 'rocket', 'egg', 'flag', 'heart'];
export const CHARS = ['robot', 'dragon', 'wizard', 'knight', 'cat', 'owl', 'ghost', 'fox'];
export const COLORS = ['red', 'blue', 'green', 'yellow', 'purple', 'orange'];
export const SIZES = ['big', 'small'];

// Words that sound alike are never put in the same scene: the game tests listening and
// understanding, not telling near-identical sounds apart.
const CLASH = [['boot', 'book'], ['heart', 'hat'], ['coin', 'crown']];
export const clashes = (a, b) => a !== b && CLASH.some((p) => p.includes(a) && p.includes(b));

const PLURAL = { torch: 'torches' };
export const plural = (k) => PLURAL[k] || `${k}s`;
export const an = (word) => (/^[aeiou]/i.test(word) ? 'an' : 'a');
export const other = (size) => (size === 'big' ? 'small' : 'big');
export const cap = (s) => s[0].toUpperCase() + s.slice(1);

export const obj = (kind, color, size = 'big') => ({ kind, color, size });

/** n different kinds, none of which sound alike (or clash with `avoid`). */
export function pickKinds(rng, n, { from = OBJECTS, avoid = [] } = {}) {
  const out = [];
  for (const k of rng.shuffle(from)) {
    if (avoid.includes(k) || [...out, ...avoid].some((o) => clashes(o, k))) continue;
    out.push(k);
    if (out.length === n) return out;
  }
  throw new Error(`cannot pick ${n} kinds`);
}

export function pickColors(rng, n, { avoid = [] } = {}) {
  const pool = rng.shuffle(COLORS.filter((c) => !avoid.includes(c)));
  if (pool.length < n) throw new Error(`cannot pick ${n} colours`);
  return pool.slice(0, n);
}

/** Objects matching a partial description, e.g. find(objs, { kind: 'gem', color: 'red' }). */
export const find = (objects, q) => objects.filter((o) => Object.entries(q).every(([k, v]) => o[k] === v));

/** The single object matching the description. Throws if the wording would be ambiguous. */
export function only(objects, q) {
  const hits = find(objects, q);
  if (hits.length !== 1) throw new Error(`ambiguous: ${JSON.stringify(q)} matches ${hits.length}`);
  return hits[0];
}

export function autoCols(n) {
  if (n <= 5) return n;
  if (n === 6) return 3;
  if (n <= 8) return 4;
  if (n === 9) return 3;
  if (n === 10) return 5;
  return 4;
}

/**
 * Turn a draft (objects + references) into a finished item.
 * `expect` is a list of groups of object REFERENCES; they become ids here.
 */
export function finish(rng, draft) {
  const { say, objects, expect, cols, keepOrder = false, ...rest } = draft;
  if (objects.length > 12) throw new Error('too many objects');
  for (let i = 0; i < objects.length; i++) for (let j = i + 1; j < objects.length; j++) {
    if (clashes(objects[i].kind, objects[j].kind)) throw new Error('sound-alike kinds in one scene');
  }
  const placed = keepOrder ? objects.slice() : rng.shuffle(objects);
  const ids = new Map(placed.map((o, i) => [o, `o${i + 1}`]));
  return {
    say,
    scene: {
      cols: cols || autoCols(placed.length),
      objects: placed.map((o) => ({ id: ids.get(o), kind: o.kind, color: o.color, size: o.size || 'big' })),
    },
    expect: expect.map((group) => group.map((o) => {
      const id = ids.get(o);
      if (!id) throw new Error('expect refers to an object that is not in the scene');
      return id;
    })),
    ...rest,
  };
}

/** Clip file name: a hash of exactly what is spoken, so identical sentences share one clip. */
const AUDIO_REV = 2; // bump when the way clips are produced changes (padding, loudness...), so every clip gets a new name
export function clipName(text, voice, speed) {
  return `${createHash('sha1').update(`${AUDIO_REV}|${voice}|${speed}|${text}`).digest('hex').slice(0, 12)}.mp3`;
}
