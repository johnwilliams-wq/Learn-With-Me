// Scoring, unlocking and mission make-up. Pure functions (no DOM) so they are unit-tested.

export const XP = { first: 10, second: 4, mission: 15, patience: 10, perfect: 10 };

export const RANKS = [
  { xp: 0, name: 'Rookie' },
  { xp: 150, name: 'Scout' },
  { xp: 400, name: 'Ranger' },
  { xp: 800, name: 'Knight' },
  { xp: 1400, name: 'Captain' },
  { xp: 2200, name: 'Champion' },
  { xp: 3200, name: 'Hero' },
  { xp: 4500, name: 'Legend' },
];

export function rankFor(xp) {
  let i = 0;
  while (i + 1 < RANKS.length && xp >= RANKS[i + 1].xp) i++;
  const cur = RANKS[i];
  const next = RANKS[i + 1] || null;
  return { index: i, name: cur.name, next: next ? next.name : null, into: xp - cur.xp, span: next ? next.xp - cur.xp : 0 };
}

/** 3 stars = every instruction right on the first listen; 2 = at least 80%; 1 = finished. */
export function starsFor(correctFirst, total) {
  if (total <= 0) return 1;
  if (correctFirst >= total) return 3;
  if (correctFirst / total >= 0.8) return 2;
  return 1;
}

export function missionXp({ correctFirst, correctSecond, total, earlyTaps }) {
  let xp = correctFirst * XP.first + correctSecond * XP.second + XP.mission;
  if (earlyTaps === 0) xp += XP.patience;
  if (correctFirst >= total) xp += XP.perfect;
  return xp;
}

/** Flat ordered list of levels from the worlds file. */
export function flattenLevels(worlds) {
  const out = [];
  for (const w of worlds) for (const l of w.levels) out.push({ ...l, world: w.id, worldName: w.name });
  return out;
}

/**
 * A level opens when the one before it has 2+ stars. So that he can never get
 * stuck, it also opens after three tries at the previous level with most right.
 */
export function isUnlocked(levelId, levels, state) {
  if (state.flags && state.flags.unlockAll) return true;
  const i = levels.findIndex((l) => l.id === levelId);
  if (i <= 0) return i === 0;
  const prev = state.levels[levels[i - 1].id];
  if (!prev) return false;
  const need = Math.ceil((levels[i - 1].trials || 6) * 0.66);
  return prev.stars >= 2 || (prev.plays >= 3 && prev.best >= need);
}

/** The level the big "Play" button should start: the furthest unlocked one not yet at 2 stars. */
export function nextLevel(levels, state) {
  let pick = levels[0];
  for (const l of levels) {
    if (!isUnlocked(l.id, levels, state)) break;
    pick = l;
    if ((state.levels[l.id]?.stars || 0) < 2) break;
  }
  return pick;
}

/**
 * Choose the items for one mission: least-recently-used first (so he cannot
 * memorise answers), honouring the level's `quota` (e.g. how many "do nothing"
 * trials) and avoiding the same sentence pattern twice in a row where possible.
 */
export function pickItems(items, seen, level, rng) {
  const n = level.trials || 6;
  const fresh = (list) =>
    rng
      .shuffle(list)
      .map((it) => ({ it, last: seen[it.id] || 0 }))
      .sort((a, b) => a.last - b.last)
      .map((x) => x.it);

  let chosen = [];
  if (level.quota) {
    const used = new Set();
    for (const [group, count] of Object.entries(level.quota)) {
      const pool = fresh(items.filter((it) => it.g === group));
      for (const it of pool.slice(0, count)) {
        chosen.push(it);
        used.add(it.id);
      }
    }
    if (chosen.length < n) chosen.push(...fresh(items.filter((it) => !used.has(it.id))).slice(0, n - chosen.length));
    chosen = chosen.slice(0, n);
  } else {
    chosen = fresh(items).slice(0, n);
  }
  return spread(rng.shuffle(chosen));
}

/** Reorder so identical patterns (`v`) and identical groups (`g`) are not adjacent when avoidable. */
function spread(list) {
  const out = list.slice();
  for (let i = 1; i < out.length; i++) {
    const same = (a, b) => (a.v && a.v === b.v) || (a.g && b.g && a.g === b.g && a.g !== 'go');
    if (!same(out[i], out[i - 1])) continue;
    const j = out.findIndex((x, k) => k > i && !same(x, out[i - 1]) && (k + 1 >= out.length || !same(out[i], out[k + 1])));
    if (j > i) [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Sum up a finished mission from its trial results. */
export function summarize(results) {
  const total = results.length;
  const correctFirst = results.filter((r) => r.correctFirst).length;
  const correctSecond = results.filter((r) => !r.correctFirst && r.correctSecond).length;
  const earlyTaps = results.reduce((n, r) => n + (r.earlyTaps || 0), 0);
  const replays = results.reduce((n, r) => n + (r.replays || 0), 0);
  const stars = starsFor(correctFirst, total);
  const xp = missionXp({ correctFirst, correctSecond, total, earlyTaps });
  return { total, correctFirst, correctSecond, earlyTaps, replays, stars, xp };
}
