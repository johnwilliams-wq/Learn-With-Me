// Unit tests for the pure game logic: answer checking, scoring, unlocking, saving, insights.

import test from 'node:test';
import assert from 'node:assert/strict';
import { check, demoOrder } from '../../src/listening/checker.js';
import { starsFor, missionXp, rankFor, isUnlocked, nextLevel, worldOpen, worldCleared, openCount, pickItems, summarize, flattenLevels, RANKS } from '../../src/listening/progress.js';
import { createStore, defaultState } from '../../src/core/store.js';
import { makeRng } from '../../src/core/rng.js';
import { skillStats, errorStats, overview, observations, SKILLS } from '../../src/listening/insights.js';
import { CARDS, nextCard } from '../../src/listening/cards.js';
import { OBJECT_KINDS, CHARACTER_KINDS, PALETTE } from '../../src/art/sprites.js';

const objs = [
  { id: 'a', kind: 'gem', color: 'red', size: 'big' },
  { id: 'b', kind: 'gem', color: 'blue', size: 'big' },
  { id: 'c', kind: 'key', color: 'red', size: 'big' },
  { id: 'd', kind: 'map', color: 'green', size: 'big' },
];
const memory = () => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k) };
};

test('checker: single target', () => {
  assert.equal(check(['a'], [['a']], objs).correct, true);
  assert.deepEqual(check(['b'], [['a']], objs), { correct: false, error: 'attribute', at: 0, prefix: 0, total: 1 });
  assert.equal(check(['c'], [['a']], objs).error, 'object');
});

test('checker: ordered steps', () => {
  const expect = [['a'], ['c'], ['d']];
  assert.equal(check(['a', 'c', 'd'], expect, objs).correct, true);
  assert.equal(check(['c', 'a', 'd'], expect, objs).error, 'order');
  const short = check(['a', 'c'], expect, objs);
  assert.equal(short.error, 'incomplete');
  assert.equal(short.prefix, 2);
  assert.equal(check(['a', 'c', 'd', 'b'], expect, objs).error, 'extra');
  const wrongLater = check(['a', 'b', 'd'], expect, objs);
  assert.equal(wrongLater.error, 'object');
  assert.equal(wrongLater.at, 1);
});

test('checker: sets, counts and mixed groups', () => {
  assert.equal(check(['c', 'a'], [['a', 'c']], objs).correct, true, 'any order inside a group');
  assert.equal(check(['a'], [['a', 'c']], objs).error, 'incomplete');
  assert.equal(check(['a', 'a'], [['a', 'a']], objs).correct, true, 'tap twice');
  assert.equal(check(['a'], [['a', 'a']], objs).error, 'incomplete');
  assert.equal(check(['a', 'a', 'a'], [['a', 'a']], objs).error, 'extra');
  assert.equal(check(['a', 'b', 'c'], [['a', 'b'], ['c']], objs).correct, true);
  assert.equal(check(['c', 'a', 'b'], [['a', 'b'], ['c']], objs).error, 'order');
});

test('checker: instructions that must not be followed', () => {
  assert.equal(check([], [], objs).correct, true);
  assert.equal(check(['a'], [], objs).error, 'false-alarm');
  assert.equal(check([], [['a']], objs).error, 'no-response');
  assert.deepEqual(demoOrder([['a', 'b'], ['c']]), ['a', 'b', 'c']);
});

test('stars, xp and ranks', () => {
  assert.equal(starsFor(6, 6), 3);
  assert.equal(starsFor(5, 6), 2);
  assert.equal(starsFor(4, 6), 1);
  assert.equal(starsFor(0, 6), 1, 'finishing always earns a star');
  assert.equal(missionXp({ correctFirst: 6, correctSecond: 0, total: 6, earlyTaps: 0 }), 60 + 15 + 10 + 10);
  assert.equal(missionXp({ correctFirst: 3, correctSecond: 2, total: 6, earlyTaps: 4 }), 30 + 8 + 15);
  assert.equal(rankFor(0).name, 'Rookie');
  assert.equal(rankFor(RANKS[1].xp).name, RANKS[1].name);
  assert.equal(rankFor(1e9).next, null);
});

const WORLDS = [
  { id: 'camp', name: 'Camp', levels: [{ id: 'c1', trials: 6 }, { id: 'c2', trials: 6 }, { id: 'c3', trials: 6 }, { id: 'cb', trials: 6, boss: true }] },
  { id: 'za', name: 'Zone A', needs: ['camp'], levels: [{ id: 'a1', trials: 6 }, { id: 'a2', trials: 6 }, { id: 'ab', trials: 6, boss: true }] },
  { id: 'zb', name: 'Zone B', needs: ['camp'], levels: [{ id: 'b1', trials: 6 }, { id: 'bb', trials: 6, boss: true }] },
  { id: 'top', name: 'Top', needs: ['za', 'zb'], needsCount: 2, levels: [{ id: 't1', trials: 6 }, { id: 'tb', trials: 6, boss: true }] },
  { id: 'old', name: 'Starter', starter: true, levels: [{ id: 's1', trials: 6 }, { id: 's2', trials: 6 }] },
];
const levels = flattenLevels(WORLDS);
const open = (s) => levels.filter((l) => isUnlocked(l.id, levels, s)).map((l) => l.id).join(' ');
const stars = (n, extra = {}) => ({ stars: n, plays: 1, best: n === 3 ? 6 : 5, last: 1, ...extra });

test('a new player: the first camp level and the camp boss are open, other worlds are shut, Starter levels are open', () => {
  const s = defaultState();
  assert.equal(open(s), 'c1 cb s1 s2');
  assert.equal(worldOpen('za', levels, s), false);
  assert.equal(nextLevel(levels, s).id, 'c1');
  assert.equal(openCount(levels, s), 2, 'Starter levels are not counted as "newly opened"');
});

test('inside a world: two stars opens the next level, and he can never get stuck', () => {
  const s = defaultState();
  s.levels.c1 = { stars: 1, plays: 1, best: 4 };
  assert.equal(isUnlocked('c2', levels, s), false);
  s.levels.c1 = { stars: 1, plays: 3, best: 4 };
  assert.equal(isUnlocked('c2', levels, s), true, 'three tries with most right opens it');
  assert.equal(nextLevel(levels, s).id, 'c2', 'Play moves on with him');
  s.levels.c1 = { stars: 1, plays: 4, best: 2 };
  assert.equal(isUnlocked('c2', levels, s), false);
  s.levels.c1 = { stars: 1, plays: 5, best: 2 };
  assert.equal(isUnlocked('c2', levels, s), true, 'five finished tries always opens it');
  s.levels.c1 = stars(2);
  assert.equal(open(s), 'c1 c2 cb s1 s2');
  assert.equal(nextLevel(levels, s).id, 'c2');
});

test('beating a boss clears its world: everything in it opens and so do the worlds that needed it', () => {
  const s = defaultState();
  s.levels.cb = stars(1);
  assert.equal(worldCleared('camp', levels, s), false, 'one star on the boss is not enough');
  s.levels.cb = stars(2);
  assert.equal(worldCleared('camp', levels, s), true);
  assert.equal(open(s), 'c1 c2 c3 cb a1 ab b1 bb s1 s2');
  assert.equal(worldOpen('top', levels, s), false);
  s.levels.ab = stars(2);
  assert.equal(worldOpen('top', levels, s), false, 'the top world needs two cleared zones');
  s.levels.bb = stars(3);
  assert.equal(worldOpen('top', levels, s), true);
  // a world is also cleared by passing every level in it
  const t = defaultState();
  for (const id of ['c1', 'c2', 'c3', 'cb']) t.levels[id] = { stars: 1, plays: 5, best: 2 };
  assert.equal(worldCleared('camp', levels, t), true);
});

test('Play rotates between the open worlds he has not cleared, least recently played first', () => {
  const s = defaultState();
  s.levels.cb = stars(2, { last: 10 });
  assert.equal(nextLevel(levels, s).id, 'a1', 'worlds never played come first, in map order');
  s.levels.a1 = stars(2, { last: 20 });
  assert.equal(nextLevel(levels, s).id, 'b1', 'then the other zone');
  s.levels.b1 = stars(2, { last: 30 });
  assert.equal(nextLevel(levels, s).id, 'a2', 'then back to the first zone, at its next level');
  s.levels.a2 = stars(2, { last: 40 });
  assert.equal(nextLevel(levels, s).id, 'bb', 'a world with only its boss left offers the boss');
  s.levels.bb = stars(2, { last: 50 });
  s.levels.ab = stars(2, { last: 60 });
  assert.equal(nextLevel(levels, s).id, 't1');
  s.levels.tb = stars(3, { last: 70 });
  assert.equal(nextLevel(levels, s).id, 'tb', 'with everything cleared it offers the last level of the game');
  const all = defaultState();
  all.flags.unlockAll = true;
  assert.equal(levels.every((l) => isUnlocked(l.id, levels, all)), true);
});

test('pickItems: fresh items first, quotas respected, right count', () => {
  const items = Array.from({ length: 30 }, (_, i) => ({ id: `i${i}`, v: `p${i % 3}`, g: i % 5 < 3 ? 'go' : 'nogo' }));
  const seen = {};
  for (let i = 0; i < 20; i++) seen[`i${i}`] = 1000 + i;
  const chosen = pickItems(items, seen, { trials: 6 }, makeRng(1));
  assert.equal(chosen.length, 6);
  assert.equal(new Set(chosen.map((c) => c.id)).size, 6);
  assert.ok(chosen.every((c) => !(c.id in seen)), 'unseen items are used before seen ones');
  for (let seed = 0; seed < 25; seed++) {
    const q = pickItems(items, {}, { trials: 6, quota: { go: 4, nogo: 2 } }, makeRng(seed));
    assert.equal(q.filter((c) => c.g === 'nogo').length, 2);
    assert.equal(q.length, 6);
  }
});

test('summarize a mission', () => {
  const sum = summarize([
    { correctFirst: true, correctSecond: false, earlyTaps: 0, replays: 1 },
    { correctFirst: false, correctSecond: true, earlyTaps: 2, replays: 0 },
    { correctFirst: false, correctSecond: false, earlyTaps: 0, replays: 0 },
  ]);
  assert.deepEqual({ ...sum, xp: undefined }, { total: 3, correctFirst: 1, correctSecond: 1, earlyTaps: 2, replays: 1, stars: 1, xp: undefined });
});

test('store: records, survives a reload, exports and imports, tolerates junk', () => {
  const backend = memory();
  const a = createStore(backend);
  a.recordTrial({ level: 'l1', item: 'l1-01', skills: ['detail'], correctFirst: true, correctSecond: false, error: '', replays: 0, earlyTaps: 1, ms: 900 });
  a.recordMission({ level: 'l1', correctFirst: 5, total: 6, stars: 2, xp: 80, ms: 60000, earlyTaps: 1 });
  const b = createStore(backend);
  assert.equal(b.get().xp, 80);
  assert.equal(b.get().levels.l1.stars, 2);
  assert.equal(b.get().trials.length, 1);
  assert.ok(b.get().seen['l1-01']);
  const copy = createStore(memory());
  copy.importJSON(b.exportJSON());
  assert.equal(copy.get().levels.l1.best, 5);
  assert.throws(() => copy.importJSON('{"hello":1}'));
  backend.setItem('lwm.state.v1', '{not json');
  assert.equal(createStore(backend).get().xp, 0, 'corrupt data falls back to a fresh start');
  b.recordMission({ level: 'l1', correctFirst: 3, total: 6, stars: 1, xp: 10, ms: 1 });
  assert.equal(b.get().levels.l1.stars, 2, 'a worse run never takes stars away');
  b.reset();
  assert.equal(b.get().missions.length, 0);
});

test('insights: skills, slips and plain-language observations', () => {
  const s = defaultState();
  const t = (k, c1, e = '', et = 0) => ({ t: 1, l: 'x', i: 'x', k, c1, c2: 0, e, rp: 0, et, ms: 1 });
  for (let i = 0; i < 14; i++) s.trials.push(t(['detail'], 1));
  for (let i = 0; i < 12; i++) s.trials.push(t(['before'], i < 3 ? 1 : 0, 'order', 1));
  const skills = skillStats(s.trials);
  assert.deepEqual(skills.map((k) => k.tag), ['detail', 'before']);
  assert.equal(skills[1].pct, 25);
  assert.equal(errorStats(s.trials)[0].error, 'order');
  assert.equal(overview(s).trials, 26);
  const obs = observations(s).join(' ');
  assert.match(obs, /before/i);
  assert.match(obs, /Going well/);
  assert.match(observations(defaultState())[0], /Not enough practice/);
});

test('cards use real sprites and are handed out without repeats', () => {
  const kinds = new Set([...OBJECT_KINDS, ...CHARACTER_KINDS]);
  assert.equal(new Set(CARDS.map((c) => c.id)).size, CARDS.length);
  for (const c of CARDS) assert.ok(kinds.has(c.kind) && c.color in PALETTE && c.color !== 'gray', c.id);
  const owned = [];
  for (let i = 0; i < CARDS.length; i++) owned.push(nextCard(owned).id);
  assert.equal(new Set(owned).size, CARDS.length);
  assert.equal(nextCard(owned), null);
  assert.ok(Object.keys(SKILLS).length > 10);
});
