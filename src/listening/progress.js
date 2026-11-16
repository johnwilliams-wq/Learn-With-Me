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

/** 3 stars = every instruction right on the first try; 2 = at least 80%; 1 = finished. */
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

/** Flat ordered list of levels from the worlds file, each carrying what it needs to know about its world. */
export function flattenLevels(worlds) {
  const out = [];
  for (const w of worlds) {
    for (const l of w.levels) {
      out.push({ ...l, world: w.id, worldName: w.name, color: w.color, needs: w.needs || [], needsCount: w.needsCount ?? (w.needs || []).length, starter: !!w.starter });
    }
  }
  return out;
}

const inWorld = (worldId, levels) => levels.filter((l) => l.world === worldId);

/** Has he got past this level? Two stars - or, so that he can never be stuck, three finished
 *  tries with most right, or five tries whatever happened. */
export function passed(level, state) {
  const p = state.levels[level.id];
  if (!p) return false;
  const need = Math.ceil((level.trials || 6) * 0.66);
  return p.stars >= 2 || (p.plays >= 3 && p.best >= need) || p.plays >= 5;
}

/** A world is cleared by beating its boss (2 stars) - the skip-ahead - or by passing every level in it. */
export function worldCleared(worldId, levels, state) {
  const ls = inWorld(worldId, levels);
  if (!ls.length) return false;
  const boss = ls.find((l) => l.boss);
  return (!!boss && (state.levels[boss.id]?.stars || 0) >= 2) || ls.every((l) => passed(l, state));
}

/** A world opens when enough of the worlds it needs are cleared (Starter worlds are always open). */
export function worldOpen(worldId, levels, state) {
  if (state.flags?.unlockAll) return true;
  const first = levels.find((l) => l.world === worldId);
  if (!first) return false;
  if (first.starter || !first.needs.length) return true;
  return first.needs.filter((w) => worldCleared(w, levels, state)).length >= first.needsCount;
}

/**
 * Inside an open world: the first level and the boss are always open (the boss is the way to
 * skip ahead); every other level opens when the one before it is passed, or once the world is cleared.
 */
export function isUnlocked(levelId, levels, state) {
  if (state.flags?.unlockAll) return true;
  const level = levels.find((l) => l.id === levelId);
  if (!level) return false;
  if (level.starter) return true;
  if (!worldOpen(level.world, levels, state)) return false;
  const ls = inWorld(level.world, levels);
  const i = ls.indexOf(level);
  if (i === 0 || level.boss) return true;
  return passed(ls[i - 1], state) || worldCleared(level.world, levels, state);
}

/**
 * What the big Play button starts. Among the open worlds he has not cleared, take the one he
 * has played least recently (so the activities rotate), and in it the first level he has not passed.
 */
export function nextLevel(levels, state) {
  const candidates = [];
  for (const worldId of new Set(levels.filter((l) => !l.starter).map((l) => l.world))) {
    if (!worldOpen(worldId, levels, state) || worldCleared(worldId, levels, state)) continue;
    const ls = inWorld(worldId, levels);
    const level = ls.find((l) => !passed(l, state) && isUnlocked(l.id, levels, state) && !l.boss) || ls.find((l) => l.boss) || ls[0];
    candidates.push({ level, last: Math.max(0, ...ls.map((l) => state.levels[l.id]?.last || 0)) });
  }
  if (!candidates.length) {
    // everything is cleared (or only Starter levels exist): offer the last thing in the game
    const main = levels.filter((l) => !l.starter);
    return (main.length ? main : levels).at(-1);
  }
  candidates.sort((a, b) => a.last - b.last); // stable: worlds never played keep their map order
  return candidates[0].level;
}

/** How many levels are open right now (the results screen compares before and after a mission). */
export const openCount = (levels, state) => levels.filter((l) => !l.starter && isUnlocked(l.id, levels, state)).length;

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
  // With a quota (e.g. "do nothing" turns) the order must be truly random: spacing them out
  // would make them predictable, and he could stop listening for the key word.
  return level.quota ? rng.shuffle(chosen) : spread(rng.shuffle(chosen));
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
