#!/usr/bin/env node
// Builds the game data from the level generators:
//   assets/data/listening/levels.json      the map (worlds and levels)
//   assets/data/listening/<level>.json     the items for each level
//   assets/data/voice.json                 the guide's lines
//   tools/tts/manifest.json                every sentence that needs a voice clip
// Run with: npm run build:content   (then npm run build:audio to make any new clips)

import { mkdirSync, writeFileSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeRng } from '../../src/core/rng.js';
import { SKILLS } from '../../src/listening/insights.js';
import { OBJECT_KINDS, CHARACTER_KINDS, PALETTE } from '../../src/art/sprites.js';
import { WORLDS } from './levels.mjs';
import { VOICE, UI_SPEED, LINES, POOLS } from './voice.mjs';
import { finish, clipName } from './lib.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DATA = join(ROOT, 'assets', 'data');
const SEED = 'v1'; // change to reshuffle every level's items
const KINDS = new Set([...OBJECT_KINDS, ...CHARACTER_KINDS]);
const COLOURS = new Set(Object.keys(PALETTE).filter((c) => c !== 'gray'));

const clips = new Map(); // file -> { file, text, voice, speed }
function clip(dir, text, speed) {
  const name = clipName(text, VOICE, speed);
  clips.set(`assets/audio/${dir}/${name}`, { file: `assets/audio/${dir}/${name}`, text, voice: VOICE, speed });
  return name;
}

function validate(item, level) {
  const fail = (why) => { throw new Error(`${item.id}: ${why} | ${item.say}`); };
  const ids = new Set(item.scene.objects.map((o) => o.id));
  if (ids.size !== item.scene.objects.length) fail('duplicate object ids');
  if (item.scene.objects.length < 2 || item.scene.objects.length > 12) fail('scene size');
  for (const o of item.scene.objects) {
    if (!KINDS.has(o.kind)) fail(`unknown kind ${o.kind}`);
    if (!COLOURS.has(o.color)) fail(`unknown colour ${o.color}`);
    if (!['big', 'small'].includes(o.size)) fail(`unknown size ${o.size}`);
  }
  for (const id of item.expect.flat()) if (!ids.has(id)) fail(`expect names missing object ${id}`);
  if (item.auto && item.expect.flat().length > 1) fail('auto-submit item needs more than one tap');
  if (item.mode === 'pick' && (item.expect.length !== 1 || new Set(item.expect[0]).size !== item.expect[0].length)) fail('pick items need one group of different objects');
  if (!item.s?.length || item.s.some((t) => !(t in SKILLS))) fail(`bad skill tags ${item.s}`);
  if (!/[.?!]$/.test(item.say) || /\s\s/.test(item.say) || /undefined|null|NaN/.test(item.say)) fail('badly formed sentence');
  if (!item.expect.flat().length && !level.allowNone) fail('"do nothing" item in a level without the hand button');
}

function buildLevel(world, level) {
  const rng = makeRng(`${level.id}-${SEED}`);
  const speed = level.speed ?? world.speed;
  const items = [];
  const seen = new Set();
  const perSentence = new Map();
  const maxSame = level.maxSame ?? 1;
  for (let tries = 0; items.length < level.n; tries++) {
    if (tries > level.n * 200) throw new Error(`${level.id}: could not make ${level.n} different items (got ${items.length})`);
    let item;
    try {
      item = finish(rng, level.gen(rng, items.length));
    } catch (err) {
      if (/ambiguous|cannot pick|sound-alike/.test(err.message)) continue; // unlucky draw: try again
      throw err;
    }
    const key = `${item.say}|${item.scene.objects.map((o) => o.kind + o.color + o.size).join(',')}`;
    if (seen.has(key) || (perSentence.get(item.say) || 0) >= maxSame) continue;
    seen.add(key);
    perSentence.set(item.say, (perSentence.get(item.say) || 0) + 1);
    const out = { id: `${level.id}-${String(items.length + 1).padStart(2, '0')}`, say: item.say, audio: clip('listening', item.say, speed), scene: item.scene, expect: item.expect };
    if (item.auto) out.auto = true;
    if (item.mode) out.mode = item.mode;
    if (item.hide) out.hide = true;
    out.s = item.s;
    out.v = item.v;
    if (item.g) out.g = item.g;
    validate(out, level);
    items.push(out);
  }
  return items;
}

// ---- levels ------------------------------------------------------------------------------
mkdirSync(join(DATA, 'listening'), { recursive: true });
const banks = new Map();
const lines = {};
const worldsOut = [];
for (const world of WORLDS) {
  const levelsOut = [];
  for (const level of world.levels) {
    level.allowNone = level.allowNone ?? world.allowNone ?? false;
    if (level.gen) banks.set(level.id, buildLevel(world, level));
    lines[`tip-${level.id}`] = { text: level.tip, file: clip('ui', level.tip, UI_SPEED) };
    const out = { id: level.id, title: level.title, tip: `tip-${level.id}`, tipText: level.tip, trials: level.trials ?? 6 };
    if (level.allowNone) out.allowNone = true;
    if (level.holdMs) out.holdMs = level.holdMs;
    if (level.quota) out.quota = level.quota;
    if (level.boss) out.boss = true;
    if (level.mix) out.mix = level.mix;
    levelsOut.push(out);
  }
  worldsOut.push({ id: world.id, name: world.name, blurb: world.blurb, levels: levelsOut });
}

// cross-checks that need every level to exist
for (const world of WORLDS) {
  for (const level of world.levels) {
    const sources = level.mix || [level.id];
    for (const id of sources) if (!banks.has(id)) throw new Error(`${level.id}: mixes unknown level ${id}`);
    const items = sources.flatMap((id) => banks.get(id));
    if (items.some((it) => !it.expect.flat().length) && !level.allowNone) throw new Error(`${level.id}: has "do nothing" items but no hand button`);
    for (const [group, count] of Object.entries(level.quota || {})) {
      if (items.filter((it) => it.g === group).length < count * 3) throw new Error(`${level.id}: not enough "${group}" items for its quota`);
    }
    if (items.length < (level.trials ?? 6) * 3) throw new Error(`${level.id}: too few items`);
  }
}

const keep = new Set(['levels.json']);
for (const [id, items] of banks) {
  writeFileSync(join(DATA, 'listening', `${id}.json`), `${JSON.stringify({ level: id, items })}\n`);
  keep.add(`${id}.json`);
}
for (const f of readdirSync(join(DATA, 'listening'))) if (!keep.has(f)) rmSync(join(DATA, 'listening', f));
writeFileSync(join(DATA, 'listening', 'levels.json'), `${JSON.stringify({ version: 1, worlds: worldsOut }, null, 1)}\n`);

// ---- guide lines -------------------------------------------------------------------------
const pools = {};
for (const [id, text] of Object.entries(LINES)) lines[id] = { text, file: clip('ui', text, UI_SPEED) };
for (const [pool, texts] of Object.entries(POOLS)) {
  pools[pool] = texts.map((text, i) => {
    const id = `${pool}-${i + 1}`;
    lines[id] = { text, file: clip('ui', text, UI_SPEED) };
    return id;
  });
}
writeFileSync(join(DATA, 'voice.json'), `${JSON.stringify({ voice: VOICE, lines, pools }, null, 1)}\n`);

// ---- what needs a voice clip ---------------------------------------------------------------
mkdirSync(join(ROOT, 'tools', 'tts'), { recursive: true });
const manifest = [...clips.values()].sort((a, b) => a.file.localeCompare(b.file));
writeFileSync(join(ROOT, 'tools', 'tts', 'manifest.json'), `${JSON.stringify(manifest, null, 1)}\n`);

const total = [...banks.values()].reduce((n, b) => n + b.length, 0);
const words = manifest.reduce((n, c) => n + c.text.split(/\s+/).length, 0);
console.log(`${worldsOut.length} worlds, ${worldsOut.reduce((n, w) => n + w.levels.length, 0)} levels, ${total} items, ${manifest.length} clips (${words} words)`);
