// The app shell: the service worker's file list must be current, and the files it names must exist.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compute, render } from '../../tools/build-precache.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

test('sw.js is up to date (run `npm run build` after changing any app file)', () => {
  const sw = readFileSync(join(ROOT, 'sw.js'), 'utf8');
  assert.equal(sw, render(sw, compute()), 'sw.js precache list is stale');
});

test('everything the service worker and the manifest name exists', () => {
  const { shell, audio } = compute();
  for (const f of shell) if (f !== './') assert.ok(existsSync(join(ROOT, f)), f);
  assert.deepEqual(JSON.parse(readFileSync(join(ROOT, 'assets/data/audio.json'), 'utf8')), audio);
  const manifest = JSON.parse(readFileSync(join(ROOT, 'manifest.webmanifest'), 'utf8'));
  for (const icon of manifest.icons) assert.ok(existsSync(join(ROOT, icon.src)), icon.src);
  assert.equal(manifest.start_url, './');
  assert.equal(manifest.scope, './');
  assert.ok(existsSync(join(ROOT, 'assets/icons/icon-180.png')), 'apple-touch-icon');
  assert.ok(existsSync(join(ROOT, '.nojekyll')), '.nojekyll (GitHub Pages must not run Jekyll)');
});

test('all paths are relative, so the app works from a GitHub Pages sub-folder', () => {
  const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
  assert.ok(!/(?:src|href)="\//.test(html), 'index.html has a root-absolute URL');
  const { shell } = compute();
  for (const f of shell.filter((p) => p.endsWith('.js') || p.endsWith('.css'))) {
    const text = readFileSync(join(ROOT, f), 'utf8');
    assert.ok(!/fetch\(\s*['"`]\//.test(text) && !/url\(\s*['"]?\//.test(text), `${f} uses a root-absolute URL`);
  }
});
