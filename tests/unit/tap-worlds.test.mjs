// Memory Mountain and Logic Lab (the two worlds of harder tap levels): the shape of the
// ladders, and a second run of the independent answer rules on items built here and now -
// so these worlds are checked even before their data is part of assets/data.

import test from 'node:test';
import assert from 'node:assert/strict';
import memory from '../../tools/content/worlds/memory.mjs';
import logic from '../../tools/content/worlds/logic.mjs';
import { buildLevel, prepare, levelMeta } from '../../tools/content/pipeline.mjs';
import { check } from '../../src/listening/checker.js';
import { ORACLE, helpers, mentions } from './oracles/tap-base.mjs';
import { RULES as MEMORY_RULES } from './oracles/tap-memory.mjs';
import { RULES as LOGIC_RULES } from './oracles/tap-logic.mjs';

const WORLDS = [[memory, MEMORY_RULES], [logic, LOGIC_RULES]];
// "cat" and "hat" sound alike; the other pairs are pictures that contain each other (the knight
// holds a sword and a shield, the wizard's hat has a star, the ring carries a gem, ...).
const NEVER_TOGETHER = [['cat', 'hat'], ['knight', 'sword'], ['knight', 'shield'], ['wizard', 'hat'], ['wizard', 'star'], ['ring', 'gem'], ['star', 'hat'], ['star', 'book']];
const norm = (groups) => groups.map((g) => [...g].sort());
const words = (say) => say.split(/\s+/).length;

// Build every level once (the same seeded items the real build makes).
const built = new Map();
for (const [world] of WORLDS) {
  for (const level of world.levels) {
    prepare(world, level);
    if (level.gen) built.set(level.id, buildLevel(world, level, () => '000000000000.mp3'));
  }
}
const itemsOf = (level) => (level.mix || [level.id]).flatMap((id) => built.get(id));
const isNone = (it) => it.expect.flat().length === 0;

test('each world is seven levels and a boss that mixes the hardest three', () => {
  for (const [world] of WORLDS) {
    const real = world.levels.filter((l) => l.gen);
    const boss = world.levels.at(-1);
    assert.equal(real.length, 7, world.id);
    assert.equal(world.levels.length, 8, world.id);
    assert.ok(boss.boss && !boss.gen, `${world.id}: the boss is the last level`);
    assert.deepEqual(boss.mix, real.slice(-3).map((l) => l.id), `${world.id}: boss mix`);
    assert.equal(new Set(world.levels.map((l) => l.id)).size, 8, `${world.id}: level ids`);
    for (const level of world.levels) {
      assert.ok(level.id.startsWith(world.id), level.id);
      assert.ok(level.tip.length <= 200 && /[.!?]$/.test(level.tip), `${level.id}: tip`);
      assert.ok(!/\d/.test(level.tip), `${level.id}: numbers in a tip are written as words`);
      if (level.gen) assert.equal(built.get(level.id).length, 18, level.id);
    }
  }
});

test('every pattern is new, has its own rule, and the rule agrees with the generator', () => {
  for (const [world, rules] of WORLDS) {
    const used = new Set();
    for (const level of world.levels.filter((l) => l.gen)) {
      for (const it of built.get(level.id)) {
        assert.ok(!(it.v in ORACLE), `${it.id}: pattern name "${it.v}" belongs to the Starter levels`);
        assert.ok(rules[it.v], `${it.id}: no rule for "${it.v}" in the ${world.id} oracle`);
        assert.deepEqual(norm(rules[it.v](it, mentions(it.say), helpers)), norm(it.expect), `${it.id}: ${it.say}`);
        used.add(it.v);
      }
    }
    for (const v of Object.keys(rules)) assert.ok(used.has(v), `${world.id}: rule "${v}" is never used`);
  }
  const shared = Object.keys(MEMORY_RULES).filter((v) => v in LOGIC_RULES);
  assert.deepEqual(shared, [], 'the two worlds must not share pattern names');
});

test('the rules work from the sentence and the picture, never from the stored answer', () => {
  for (const [world, rules] of WORLDS) {
    for (const level of world.levels.filter((l) => l.gen)) {
      for (const it of built.get(level.id)) {
        const blind = { ...it, expect: [['nonsense']] };
        assert.deepEqual(norm(rules[it.v](blind, mentions(it.say), helpers)), norm(it.expect), it.id);
      }
    }
  }
});

test('the rules notice a wrong picture (a changed scene changes the answer or fails)', () => {
  // Swap the look of two objects that the answer tells apart: the stored answer is now wrong.
  let caught = 0;
  let tried = 0;
  for (const [world, rules] of WORLDS) {
    for (const level of world.levels.filter((l) => l.gen)) {
      for (const it of built.get(level.id)) {
        const right = new Set(it.expect.flat());
        const a = it.scene.objects.find((o) => right.has(o.id));
        const b = it.scene.objects.find((o) => !right.has(o.id) && (!a || o.kind !== a.kind || o.color !== a.color || o.size !== a.size));
        if (!a || !b) continue;
        const look = ({ kind, color, size }) => ({ kind, color, size });
        const objects = it.scene.objects.map((o) => (o === a ? { ...o, ...look(b) } : o === b ? { ...o, ...look(a) } : o));
        const changed = { ...it, scene: { ...it.scene, objects } };
        tried++;
        try {
          const got = norm(rules[it.v](changed, mentions(it.say), helpers));
          if (JSON.stringify(got) !== JSON.stringify(norm(it.expect))) caught++;
        } catch { caught++; }
      }
    }
  }
  // (a swap does not always change the answer - e.g. counting by position - but it mostly must)
  assert.ok(tried > 200 && caught / tried > 0.85, `only ${caught} of ${tried} swapped scenes were noticed`);
});

test('items are fair and playable', () => {
  for (const [world] of WORLDS) {
    for (const level of world.levels.filter((l) => l.gen)) {
      const items = built.get(level.id);
      assert.ok(new Set(items.map((it) => it.v)).size >= 2, `${level.id}: a mission needs several sentence patterns`);
      for (const it of items) {
        const kinds = it.scene.objects.map((o) => o.kind);
        for (const [a, b] of NEVER_TOGETHER) assert.ok(!(kinds.includes(a) && kinds.includes(b)), `${it.id}: ${a} and ${b} must not share a scene`);
        assert.match(it.say, /^[A-Za-z ,.:]+$/, `${it.id}: only plain words (no digits or symbols)`);
        assert.ok(words(it.say) <= 35, `${it.id}: ${words(it.say)} words`);
        assert.ok(it.expect.flat().length <= 12, `${it.id}: more taps than the board accepts`);
        if (it.hide) assert.ok(it.scene.objects.length <= 8, `${it.id}: too much to find after a hidden instruction`);
        if (it.auto) assert.ok(it.expect.flat().length <= 1, `${it.id}: auto item with several taps`);
        if (isNone(it)) assert.ok(level.allowNone, `${it.id}: "do nothing" needs the hand button`);
        // the right answer is accepted by the game's checker, and a lazy answer is not
        assert.ok(check(it.expect.flat(), it.expect, it.scene.objects).correct, it.id);
        if (!isNone(it)) assert.ok(!check([], it.expect, it.scene.objects).correct, it.id);
        const wrong = it.scene.objects.find((o) => !it.expect.flat().includes(o.id));
        assert.ok(wrong, `${it.id}: there must be something wrong to tap`);
        assert.ok(!check([wrong.id], it.expect, it.scene.objects).correct, it.id);
      }
    }
  }
});

test('every level can fill varied missions, and "hands off" turns are a real mix', () => {
  for (const [world] of WORLDS) {
    for (const level of world.levels) {
      const meta = levelMeta(level);
      const items = itemsOf(level);
      assert.ok(items.length >= meta.trials * 2.5, `${level.id}: only ${items.length} items`);
      if (items.some(isNone)) assert.ok(meta.allowNone, `${level.id} needs the hand button`);
      for (const [group, count] of Object.entries(meta.quota || {})) {
        assert.ok(items.filter((it) => it.g === group).length >= count * 3, `${level.id}: quota ${group}`);
      }
      if (meta.quota && 'nogo' in meta.quota) {
        const { go, nogo } = meta.quota;
        assert.ok(go >= nogo && nogo >= 2 && go + nogo <= meta.trials, level.id);
      }
      if (level.gen && items.some(isNone)) {
        assert.ok(meta.quota?.nogo, `${level.id}: needs a quota so "hands off" turns cannot be guessed`);
        for (const v of new Set(items.filter(isNone).map((it) => it.v))) {
          assert.ok(items.some((it) => it.v === v && !isNone(it)), `${level.id}: pattern ${v} must also have turns where he acts`);
        }
        for (const it of items) assert.equal(it.g, isNone(it) ? 'nogo' : 'go', it.id);
      }
    }
  }
});

test('the ladders really get harder', () => {
  const taps = (id) => built.get(id).map((it) => it.expect.flat().length);
  const max = (id) => Math.max(...taps(id));
  const hidden = (id) => built.get(id).filter((it) => it.hide).length;
  // Memory Mountain: 3, 4, 3 hidden, 5, backwards up to 4, skipping / counting, 6 and hidden detail
  assert.deepEqual(['memory1', 'memory2', 'memory3', 'memory4'].map(max), [3, 4, 3, 5]);
  assert.equal(hidden('memory1') + hidden('memory2') + hidden('memory4'), 0);
  assert.equal(hidden('memory3'), 18);
  assert.equal(max('memory5'), 4);
  assert.ok(max('memory6') >= 4 && max('memory7') === 6);
  assert.ok(hidden('memory7') >= 6 && built.get('memory7').some((it) => it.hide && mentions(it.say).every((q) => q.size && q.color)));
  for (const id of ['memory5', 'memory6', 'memory7']) assert.ok(built.get(id).every((it) => it.expect.flat().length >= 2), id);
  // Logic Lab: both branches of every decision come up
  for (const id of ['logic5', 'logic7']) {
    const byPattern = new Map();
    for (const it of built.get(id)) {
      const m = /tap the (\w+)/.exec(it.say); // the first thing named after "tap" is the "true" branch
      if (!/^If /.test(it.say)) continue;
      const first = it.scene.objects.find((o) => o.id === it.expect[0][0]).kind;
      byPattern.set(it.v, (byPattern.get(it.v) || new Set()).add(first === m[1]));
    }
    for (const [v, seen] of byPattern) assert.equal(seen.size, 2, `${id}: "${v}" is always ${[...seen][0] ? 'true' : 'false'}`);
  }
  const l6 = built.get('logic6');
  assert.equal(l6.filter(isNone).length, 6);
  assert.equal(l6.filter((it) => !isNone(it)).length, 12);
});
