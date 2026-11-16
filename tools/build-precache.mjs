#!/usr/bin/env node
// Regenerates the list of files the service worker caches for offline use, and a version
// stamp made from their contents (so any change to the app produces a new service worker).
// Also writes assets/data/audio.json: every instruction clip, which the app downloads
// quietly in the background so that everything keeps working without internet.
// Run with: npm run build:shell      (npm test fails if this is out of date)

import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function walk(dir, keep) {
  const abs = join(ROOT, dir);
  if (!existsSync(abs)) return [];
  return readdirSync(abs)
    .flatMap((name) => {
      const rel = `${dir}/${name}`;
      return statSync(join(ROOT, rel)).isDirectory() ? walk(rel, keep) : keep(rel) ? [rel] : [];
    })
    .sort();
}

export function shellFiles() {
  return [
    'index.html',
    'manifest.webmanifest',
    ...walk('css', (f) => f.endsWith('.css')),
    ...walk('src', (f) => f.endsWith('.js')),
    ...walk('assets/icons', (f) => /\.(png|svg)$/.test(f)),
    ...walk('assets/data', (f) => f.endsWith('.json') && f !== 'assets/data/audio.json'),
    ...walk('assets/audio/ui', (f) => f.endsWith('.mp3')),
  ];
}

export function audioFiles() {
  return walk('assets/audio/listening', (f) => f.endsWith('.mp3'));
}

export function compute() {
  const files = shellFiles();
  const hash = createHash('sha1');
  for (const f of files) hash.update(f).update(readFileSync(join(ROOT, f)));
  const audio = audioFiles();
  hash.update(audio.join('|'));
  return { version: hash.digest('hex').slice(0, 10), shell: ['./', ...files, 'assets/data/audio.json'], audio };
}

export function render(sw, { version, shell }) {
  const block = `/* precache:start */\nconst VERSION = '${version}';\nconst SHELL = ${JSON.stringify(shell)};\n/* precache:end */`;
  if (!/\/\* precache:start \*\/[\s\S]*?\/\* precache:end \*\//.test(sw)) throw new Error('sw.js markers not found');
  return sw.replace(/\/\* precache:start \*\/[\s\S]*?\/\* precache:end \*\//, block);
}

if (process.argv[1] && relative(process.argv[1], fileURLToPath(import.meta.url)) === '') {
  const result = compute();
  writeFileSync(join(ROOT, 'assets/data/audio.json'), `${JSON.stringify(result.audio)}\n`);
  const swPath = join(ROOT, 'sw.js');
  writeFileSync(swPath, render(readFileSync(swPath, 'utf8'), result));
  console.log(`service worker ${result.version}: ${result.shell.length} shell files, ${result.audio.length} instruction clips`);
}
