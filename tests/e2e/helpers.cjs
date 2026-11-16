// Shared helpers for the browser tests: a tiny static server and a "robot player"
// that plays missions by reading the current item from window.__lwm.debug.

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg',
};

function startServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      if (p.endsWith('/')) p += 'index.html';
      const file = path.join(ROOT, p);
      if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        res.writeHead(404);
        return res.end('not found');
      }
      res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
      fs.createReadStream(file).pipe(res);
    });
    server.listen(0, '127.0.0.1', () => resolve({ url: `http://127.0.0.1:${server.address().port}/`, close: () => server.close() }));
  });
}

const phase = (page) => page.evaluate(() => document.querySelector('.mission')?.dataset.phase || null);
const waitPhase = (page, want, timeout = 20000) =>
  page.waitForFunction((w) => document.querySelector('.mission')?.dataset.phase === w, want, { timeout });

/** Tap what the item asks for (or deliberately something else when wrong = true). */
async function answer(page, { wrong = false } = {}) {
  const item = await page.evaluate(() => globalThis.__lwm.debug.item);
  let taps = item.expect.flat();
  if (wrong) {
    const all = item.scene.objects.map((o) => o.id);
    const bad = all.find((id) => !taps.includes(id));
    taps = taps.length ? [bad] : [all[0]]; // a wrong object, or acting when he should not
  }
  for (const id of taps) await page.click(`.obj[data-id="${id}"]`);
  if (!taps.length) await page.click('.btn-hand');
  else if (!item.auto && (await phase(page)) === 'respond') await page.click('.btn-done');
  return item;
}

/**
 * Play the mission that is on screen from its intro to the results screen.
 * plan[i] = 'right' | 'second' (miss, then right) | 'miss' (miss twice) for each trial.
 */
async function playMission(page, plan = []) {
  await page.waitForSelector('.overlay.intro .btn-primary:not([disabled])', { timeout: 20000 });
  await page.click('.overlay.intro .btn-primary');
  const trials = await page.evaluate(() => globalThis.__lwm.debug.mission.items.length);
  const seen = [];
  for (let i = 0; i < trials; i++) {
    const how = plan[i] || 'right';
    await waitPhase(page, 'ready');
    await page.click('.btn-listen', { force: true }); // it pulses, so skip the stability wait
    await waitPhase(page, 'respond');
    if (how === 'right') seen.push(await answer(page));
    else {
      seen.push(await answer(page, { wrong: true }));
      await waitPhase(page, 'respond'); // it replays by itself, with support
      await answer(page, { wrong: how === 'miss' });
    }
  }
  await page.waitForSelector('.screen.results', { timeout: 30000 });
  return seen;
}

module.exports = { ROOT, startServer, phase, waitPhase, answer, playMission };
