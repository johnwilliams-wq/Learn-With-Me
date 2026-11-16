// Rewards and chores: the rules. Pure functions over the saved state (no DOM), unit-tested.
//
//   Daily rewards   - "do N missions today" -> won once per day.
//   Lifetime tiers  - "reach N points in total" -> won once, ever. Points = XP from missions
//                     plus points from chores a grown-up has approved.
//   Chores          - set by a grown-up; he marks one done (with a photo); it waits until a
//                     grown-up approves it or sends it back. Points arrive on approval.
// Everything a grown-up owes him goes into state.rewards.earned until marked as given.

import { todayKey } from '../core/dom.js';

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

/** Key of the week (Monday to Sunday) that `d` falls in. */
export function weekKey(d = new Date()) {
  const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7));
  return `w${todayKey(monday)}`;
}

/**
 * Does a finished mission count toward today's reward goal? Repeating a level he has
 * already perfected (3 stars) does not, unless the grown-up turns that on - otherwise
 * the quickest way to a reward would be to replay the easiest level.
 */
export const missionCounts = (starsBefore, rewards) => starsBefore < 3 || !!rewards.countPerfected;

export const countedToday = (state, now = new Date()) => state.days[todayKey(now)]?.counted || 0;

function earn(src, r, now) {
  return { id: uid(), src, ref: r.id, title: r.title, icon: r.icon || '', day: todayKey(now), t: +now, given: false };
}

/** Add any rewards that have just been reached to state.rewards.earned. Returns the new ones. */
export function collectRewards(state, now = new Date()) {
  const day = todayKey(now);
  const counted = countedToday(state, now);
  const earned = state.rewards.earned;
  const won = [];
  for (const r of state.rewards.daily) {
    if (r.missions > 0 && counted >= r.missions && !earned.some((e) => e.src === 'daily' && e.ref === r.id && e.day === day)) won.push(earn('daily', r, now));
  }
  for (const t of state.rewards.tiers) {
    if (t.points > 0 && state.xp >= t.points && !earned.some((e) => e.src === 'tier' && e.ref === t.id)) won.push(earn('tier', t, now));
  }
  earned.push(...won);
  // Keep the list from growing for ever: drop old rewards that were handed out long ago.
  // Tier wins are kept, because they are how we know a tier has already been awarded.
  if (earned.length > 400) {
    const cutoff = +now - 120 * 86400000;
    state.rewards.earned = earned.filter((e) => e.src === 'tier' || !e.given || e.t > cutoff);
  }
  return won;
}

/** Rewards that have been won but not handed over yet. */
export const owed = (state) => state.rewards.earned.filter((e) => !e.given);

/**
 * Where a chore stands for him right now:
 *   'open'      he can do it        'pending'  sent, waiting for a grown-up
 *   'approved'  done for this period 'rejected' sent back - he can try again (entry.note says why)
 *   'finished'  a one-off chore that has been approved (it leaves his list)
 */
export function choreStatus(chore, log, now = new Date()) {
  const day = todayKey(now);
  const week = weekKey(now);
  const mine = log.filter((e) => e.chore === chore.id && (chore.repeat === 'daily' ? e.day === day : chore.repeat === 'weekly' ? e.week === week : true));
  const last = mine[mine.length - 1] || null;
  if (!last) return { state: 'open', entry: null };
  if (last.status === 'pending') return { state: 'pending', entry: last };
  if (last.status === 'approved') return { state: chore.repeat === 'once' ? 'finished' : 'approved', entry: last };
  return { state: 'rejected', entry: last };
}

/** He says a chore is done. Returns the new log entry (status 'pending'). */
export function submitChore(state, chore, photoId, now = new Date()) {
  const entry = {
    id: uid(), chore: chore.id, title: chore.title, icon: chore.icon || '', points: Number(chore.points) || 0, reward: chore.reward || '',
    t: +now, day: todayKey(now), week: weekKey(now), status: 'pending', photo: photoId || null, note: '',
  };
  state.chores.log.push(entry);
  if (state.chores.log.length > 300) state.chores.log.splice(0, state.chores.log.length - 300);
  return entry;
}

/**
 * A grown-up approves a chore or sends it back.
 * Returns { photo, won } - the photo id to delete, and any rewards this unlocked.
 */
export function decideChore(state, entryId, approve, note = '', now = new Date()) {
  const entry = state.chores.log.find((e) => e.id === entryId);
  if (!entry || entry.status !== 'pending') return { photo: null, won: [] };
  entry.status = approve ? 'approved' : 'rejected';
  entry.note = approve ? '' : String(note || '').slice(0, 120);
  entry.decided = +now;
  const photo = entry.photo;
  entry.photo = null;
  const won = [];
  if (approve) {
    state.xp += entry.points;
    if (entry.reward) {
      const e = earn('chore', { id: entry.chore, title: entry.reward, icon: entry.icon }, now);
      state.rewards.earned.push(e);
      won.push(e);
    }
    won.push(...collectRewards(state, now));
  }
  return { photo, won };
}

/** Counts shown as badges: chores he can do now, rewards waiting, and things a grown-up should look at. */
export function badges(state, now = new Date()) {
  const statuses = state.chores.list.map((c) => choreStatus(c, state.chores.log, now).state);
  return {
    choresOpen: statuses.filter((s) => s === 'open' || s === 'rejected').length,
    rewardsOwed: owed(state).length,
    toCheck: state.chores.log.filter((e) => e.status === 'pending').length,
  };
}

export const REWARD_ICONS = ['🎁', '🎮', '🍦', '🍕', '🎬', '📺', '⚽', '🚲', '🧸', '🍪', '🍿', '🎨', '📚', '💵', '⭐', '🏆', '🎟️', '🛹', '🏊', '🎳'];
export const CHORE_ICONS = ['✅', '🛏️', '🍽️', '🗑️', '🧹', '🧺', '🐕', '🐈', '🦷', '🚿', '📚', '🎒', '🌱', '🧦', '🧽', '👕', '🚪', '🍎', '🧸', '🚗'];
