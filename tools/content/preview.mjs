#!/usr/bin/env node
// Build ONE world on its own, without touching the real game data. For developing a new
// world or activity type:
//
//   node tools/content/preview.mjs tools/content/worlds/pack.mjs tests/e2e/out/pack
//
// Writes one file per level to the output folder: { level, items }. That file can be
//   - played in the real mission screen:  index.html?sandbox=tests/e2e/out/pack/pack1.json&fast=1&nosw=1
//   - checked by an oracle test:           LWM_ITEMS_DIR=tests/e2e/out/pack node --test tests/unit/oracle-put.test.mjs
// Every item is validated exactly as in the real build. Mix (boss) levels are skipped.

import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildLevel, levelMeta, prepare } from './pipeline.mjs';

const [file, outDir] = process.argv.slice(2);
if (!file || !outDir) {
  console.error('usage: node tools/content/preview.mjs <world module> <output folder>');
  process.exit(2);
}
const world = (await import(pathToFileURL(resolve(file)).href)).default;
if (!world) {
  console.error(`${file} exports no world yet`);
  process.exit(1);
}
mkdirSync(outDir, { recursive: true });
let total = 0;
for (const level of world.levels) {
  prepare(world, level);
  if (!level.gen) continue;
  const items = buildLevel(world, level, () => 'preview.mp3');
  total += items.length;
  const meta = { ...levelMeta(level), world: world.id, worldName: world.name };
  writeFileSync(join(outDir, `${level.id}.json`), `${JSON.stringify({ level: meta, items }, null, 1)}\n`);
  console.log(`${level.id.padEnd(14)} ${String(items.length).padStart(3)} items   e.g. ${items[0].say}`);
}
console.log(`${world.name}: ${world.levels.length} levels, ${total} items -> ${outDir}`);
