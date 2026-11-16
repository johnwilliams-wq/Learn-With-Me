#!/usr/bin/env node
// Builds the game data from the world and level definitions:
//   assets/data/listening/levels.json      the map (worlds and levels)
//   assets/data/listening/<level>.json     the items for each level
//   assets/data/voice.json                 the guide's lines
//   tools/tts/manifest.json                every sentence that needs a voice clip
// Run with: npm run build:content   (then make any new clips with tools/tts/synth.py)

import { mkdirSync, writeFileSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WORLDS } from './worlds/index.mjs';
import { TYPES } from './types/index.mjs';
import { VOICE, UI_SPEED, LINES, POOLS } from './voice.mjs';
import { clipName } from './lib.mjs';
import { buildLevel, levelMeta, worldMeta, prepare } from './pipeline.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DATA = join(ROOT, 'assets', 'data');

const clips = new Map(); // file -> { file, text, voice, speed }
function clip(dir, text, speed) {
  const name = clipName(text, VOICE, speed);
  clips.set(`assets/audio/${dir}/${name}`, { file: `assets/audio/${dir}/${name}`, text, voice: VOICE, speed });
  return name;
}

// ---- levels ------------------------------------------------------------------------------
mkdirSync(join(DATA, 'listening'), { recursive: true });
const banks = new Map();
const lines = {};
const worldsOut = [];
const worldIds = new Set();
for (const world of WORLDS) {
  if (worldIds.has(world.id)) throw new Error(`two worlds are called ${world.id}`);
  worldIds.add(world.id);
  const levelsOut = [];
  for (const level of world.levels) {
    prepare(world, level);
    if (banks.has(level.id) || lines[`tip-${level.id}`]) throw new Error(`two levels are called ${level.id}`);
    if (level.gen) banks.set(level.id, buildLevel(world, level, clip));
    lines[`tip-${level.id}`] = { text: level.tip, file: clip('ui', level.tip, UI_SPEED) };
    levelsOut.push(levelMeta(level));
  }
  worldsOut.push(worldMeta(world, levelsOut));
}

// cross-checks that need every level to exist
const isNone = (it) => TYPES[it.t || 'tap'].isNone(it);
for (const world of WORLDS) {
  for (const w of world.needs || []) if (!worldIds.has(w)) throw new Error(`${world.id}: needs unknown world ${w}`);
  if (!world.starter && !world.levels.at(-1)?.boss) throw new Error(`${world.id}: the last level of a world must be its boss`);
  for (const level of world.levels) {
    const sources = level.mix || [level.id];
    for (const id of sources) if (!banks.has(id)) throw new Error(`${level.id}: mixes unknown level ${id}`);
    const items = sources.flatMap((id) => banks.get(id));
    if (items.some(isNone) && !level.allowNone) throw new Error(`${level.id}: has "do nothing" items but no hand button`);
    for (const [group, count] of Object.entries(level.quota || {})) {
      if (items.filter((it) => it.g === group).length < count * 3) throw new Error(`${level.id}: not enough "${group}" items for its quota`);
    }
    if (items.length < (level.trials ?? 6) * 2.5) throw new Error(`${level.id}: too few items (${items.length})`);
  }
}

const keep = new Set(['levels.json']);
for (const [id, items] of banks) {
  writeFileSync(join(DATA, 'listening', `${id}.json`), `${JSON.stringify({ level: id, items })}\n`);
  keep.add(`${id}.json`);
}
for (const f of readdirSync(join(DATA, 'listening'))) if (!keep.has(f)) rmSync(join(DATA, 'listening', f));
writeFileSync(join(DATA, 'listening', 'levels.json'), `${JSON.stringify({ version: 2, worlds: worldsOut }, null, 1)}\n`);

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
