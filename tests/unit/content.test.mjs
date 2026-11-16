// An INDEPENDENT check of every generated item.
//
// The generators (tools/content/levels.mjs) decide what the right answer is while they
// build each scene. This file works the answer out a second time, from scratch, by reading
// only the spoken sentence and the finished scene - and insists the two agree. Any new
// sentence pattern (`v`) must get its own rule here before the tests pass.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SKILLS } from '../../src/listening/insights.js';
import { TYPES } from '../../tools/content/types/index.mjs';
import { RULES as EXTRA_RULES } from './oracles/tap-extra.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p) => JSON.parse(readFileSync(join(ROOT, p), 'utf8'));
const worlds = read('assets/data/listening/levels.json').worlds;
const levels = worlds.flatMap((w) => w.levels);
const voice = read('assets/data/voice.json');
const own = levels.filter((l) => !l.mix);
const bank = (id) => read(`assets/data/listening/${id}.json`).items;
const itemsOf = (level) => (level.mix || [level.id]).flatMap(bank);
const isTap = (it) => !it.t || it.t === 'tap';
const isNone = (it) => TYPES[it.t || 'tap'].isNone(it);

import { ORACLE, helpers, mentions, COLORS, KINDS } from './oracles/tap-base.mjs';
import { itemsOfType } from './oracles/load.mjs';

const norm = (groups) => groups.map((g) => [...g].sort());
const SOUND_ALIKE = [['boot', 'book'], ['heart', 'hat'], ['coin', 'crown']];

test('every item: the answer worked out from the sentence matches the stored answer', () => {
  // (set LWM_ITEMS_DIR to a preview folder to run this on a world that is still being written)
  let n = 0;
  for (const it of itemsOfType('tap')) {
    const rule = ORACLE[it.v] || EXTRA_RULES[it.v];
    assert.ok(rule, `${it.id}: no independent rule for pattern "${it.v}" - add one (tests/unit/oracles/)`);
    assert.deepEqual(norm(rule(it, mentions(it.say), helpers)), norm(it.expect), `${it.id}: ${it.say}`);
    n++;
  }
  assert.ok(n > (process.env.LWM_ITEMS_DIR ? 0 : 700), `only ${n} items`);
});

test('every other activity type has its own independent oracle test', () => {
  const types = new Set(own.flatMap((l) => bank(l.id)).filter((it) => !isTap(it)).map((it) => it.t));
  for (const t of types) {
    assert.ok(TYPES[t], `unknown activity type ${t}`);
    assert.ok(existsSync(join(ROOT, 'tests', 'unit', `oracle-${t}.test.mjs`)), `activity type "${t}" has items but no tests/unit/oracle-${t}.test.mjs`);
  }
});

test('every item is well formed and fair', () => {
  const seenIds = new Set();
  for (const level of own) {
    for (const it of bank(level.id)) {
      assert.ok(!seenIds.has(it.id), `duplicate id ${it.id}`);
      seenIds.add(it.id);
      for (const tag of it.s) assert.ok(tag in SKILLS, `${it.id}: unknown skill ${tag}`);
      if (isNone(it)) assert.ok(level.allowNone, `${it.id}: "do nothing" needs the hand button`);
      if (isTap(it)) {
        const objs = it.scene.objects;
        assert.ok(objs.length >= 2 && objs.length <= 12, it.id);
        for (const o of objs) {
          assert.ok(KINDS.includes(o.kind) && COLORS.includes(o.color) && ['big', 'small'].includes(o.size), `${it.id}: ${JSON.stringify(o)}`);
        }
        for (const [a, b] of SOUND_ALIKE) assert.ok(!(objs.some((o) => o.kind === a) && objs.some((o) => o.kind === b)), `${it.id}: ${a} and ${b} sound alike`);
        if (it.auto) assert.ok(it.expect.flat().length <= 1, `${it.id}: auto item with several taps`);
        if (it.hide) assert.ok(objs.length <= 8, `${it.id}: too much to find after a hidden instruction`);
      }
      assert.match(it.say, /^[A-Z].*[.?!]$/, it.id);
      assert.match(it.audio, /^[0-9a-f]{12}\.mp3$/, it.id);
    }
  }
});

test('detail words are really needed (each clue has a look-alike that differs only by it)', () => {
  const foil = (it, t, same, differ) => it.scene.objects.some((o) => o.id !== t.id && same.every((k) => o[k] === t[k]) && differ.every((k) => o[k] !== t[k]));
  for (const level of own) {
    for (const it of bank(level.id).filter(isTap)) {
      const t = it.scene.objects.find((o) => o.id === it.expect[0]?.[0]);
      if (it.v === 'colour') assert.ok(foil(it, t, ['kind'], ['color']), it.id);
      if (it.v === 'size') assert.ok(foil(it, t, ['kind', 'color'], ['size']), it.id);
      if (['colour-kind', 'hidden-one', 'lead-in', 'market'].includes(it.v)) {
        assert.ok(foil(it, t, ['kind'], ['color']) && foil(it, t, ['color'], ['kind']), it.id);
      }
      if (it.v === 'size-colour-kind') {
        assert.ok(foil(it, t, ['kind', 'color'], ['size']) && foil(it, t, ['kind', 'size'], ['color']) && foil(it, t, ['color', 'size'], ['kind']), it.id);
      }
    }
  }
});

test('every level can fill a mission, and missions can be varied', () => {
  for (const level of levels) {
    const items = itemsOf(level);
    assert.ok(items.length >= level.trials * 2.5, `${level.id}: only ${items.length} items`);
    for (const [group, count] of Object.entries(level.quota || {})) {
      assert.ok(items.filter((it) => it.g === group).length >= count * 3, `${level.id}: quota ${group}`);
    }
    if (items.some(isNone)) assert.ok(level.allowNone, `${level.id} needs the hand button`);
    assert.ok(voice.lines[level.tip], `${level.id}: tip line missing`);
    assert.ok(level.tipText.length <= 200, `${level.id}: tip is too long`);
  }
});

test('"do nothing" turns are a real mix, never predictable', () => {
  for (const level of levels.filter((l) => l.quota && ('nogo' in l.quota))) {
    const { go, nogo } = level.quota;
    assert.ok(go >= nogo && nogo >= 2 && go + nogo <= level.trials, level.id);
  }
});

test('the guide has every line the game asks for, and every clip exists', () => {
  for (const pool of ['hello-back', 'good', 'goodEnd', 'goodWait', 'gotIt', 'retry', 'watch', 'result1', 'result2', 'result3', 'enough']) {
    assert.ok(voice.pools[pool]?.length, `pool ${pool}`);
    for (const id of voice.pools[pool]) assert.ok(voice.lines[id], id);
  }
  assert.ok(voice.lines['hello-first']);
  // the reminder for touching too soon, in the parent's own words (with the player's name when one is set)
  const lead = voice.name ? `${voice.name}, please` : 'Please';
  assert.equal(voice.lines['wait-please'].text, `${lead} try your best to listen until I am finished talking.`);
  const manifest = read('tools/tts/manifest.json');
  const wanted = new Set(manifest.map((c) => c.file));
  for (const line of Object.values(voice.lines)) assert.ok(wanted.has(`assets/audio/ui/${line.file}`), line.text);
  for (const level of own) for (const it of bank(level.id)) assert.ok(wanted.has(`assets/audio/listening/${it.audio}`), it.id);
  const missing = manifest.filter((c) => !existsSync(join(ROOT, c.file)));
  assert.equal(missing.length, 0, `${missing.length} voice clips have not been generated (run tools/tts/synth.py); first: ${missing[0]?.text}`);
});
