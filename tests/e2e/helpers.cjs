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
  const notFound = new Set(); // paths that really did not exist when they were asked for
  let down = false; // setDown(true) = the network is gone (also for the service worker's own requests)
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      if (down) return void req.socket.destroy();
      let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      if (p.endsWith('/')) p += 'index.html';
      const file = path.join(ROOT, p);
      if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        notFound.add(p);
        res.writeHead(404);
        return res.end('not found');
      }
      res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
      fs.createReadStream(file).pipe(res);
    });
    server.listen(0, '127.0.0.1', () => resolve({ url: `http://127.0.0.1:${server.address().port}/`, notFound, setDown: (v) => { down = !!v; }, close: () => server.close() }));
  });
}

const phase = (page) => page.evaluate(() => document.querySelector('.mission')?.dataset.phase || null);
const waitPhase = (page, want, timeout = 20000) =>
  page.waitForFunction((w) => document.querySelector('.mission')?.dataset.phase === w, want, { timeout });

/** Tap what the item asks for (or deliberately something else when wrong = true). */
/** The robot for an activity type (tests/e2e/robots/<type>.cjs). */
function robotFor(type) {
  return require(path.join(__dirname, 'robots', `${type || 'tap'}.cjs`));
}

/** Answer the turn on screen: correctly, or (wrong = true) with a deliberately wrong answer. */
async function answer(page, { wrong = false } = {}) {
  const item = await page.evaluate(() => globalThis.__lwm.debug.item);
  const robot = robotFor(item.t);
  const nothing = robot.isNone(item);
  if (wrong) await robot.wrong(page, item); // (for a "do nothing" item, wrong = acting anyway)
  else if (!nothing) await robot.solve(page, item);
  if (!wrong && nothing) await page.click('.btn-hand');
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
      await waitPhase(page, 'ready'); // after a miss he taps the ear again; it is said slower, with support
      await page.click('.btn-listen', { force: true });
      await waitPhase(page, 'respond');
      await answer(page, { wrong: how === 'miss' });
    }
  }
  await page.waitForSelector('.screen.results', { timeout: 30000 });
  return seen;
}

// ---------------------------------------------------------------------------------------------
// Extras used by the full suite (run.cjs)

const STATE_KEY = 'lwm.state.v1';

/** Console errors and page errors of one page. A 404 for a voice clip that is not on disk yet is only noted. */
function watchErrors(page, server) {
  const log = { errors: [], missingClips: new Set(), tolerate: null };
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const text = m.text();
    const url = m.location().url || '';
    if (/Failed to load resource/.test(text) && /404/.test(text) && url) {
      const p = decodeURIComponent(new URL(url).pathname);
      if (p.includes('/assets/audio/') && p.endsWith('.mp3') && server.notFound.has(p)) return void log.missingClips.add(p);
    }
    const line = `${text}${url ? ` [${url}]` : ''}`;
    if (log.tolerate && log.tolerate(line)) return;
    log.errors.push(line);
  });
  page.on('pageerror', (e) => log.errors.push(`pageerror: ${e.message}`));
  return log;
}

/** A fresh context + page on the title screen. `state` (partial store state) is written before the app boots. */
async function openPage(browser, server, { viewport = { width: 1180, height: 820 }, state = null, query = 'fast=1&nosw=1' } = {}) {
  const ctx = await browser.newContext({ viewport, hasTouch: true, deviceScaleFactor: 1 });
  if (state) {
    await ctx.addInitScript(([k, v]) => {
      try { if (!localStorage.getItem(k)) localStorage.setItem(k, v); } catch { /* ignore */ }
    }, [STATE_KEY, JSON.stringify({ v: 1, ...state })]);
  }
  const page = await ctx.newPage();
  const log = watchErrors(page, server);
  await page.goto(server.url + (query ? `?${query}` : ''));
  await page.waitForSelector('.screen.title .btn-huge');
  return { ctx, page, log };
}

const toMap = async (page) => {
  await page.click('.screen.title .btn-huge');
  await page.waitForSelector('.screen.map');
};
const openLevel = async (page, id) => {
  // Starter levels live in a drawer on the map: open it if this level is inside.
  await page.evaluate((lv) => { const d = document.querySelector(`.level-node[data-level="${lv}"]`)?.closest('details'); if (d) d.open = true; }, id);
  await page.click(`.level-node[data-level="${id}"]`);
  await page.waitForSelector('.overlay.intro');
};
/** Press Start on the intro (and press again to skip the spoken tip when real audio is on). */
async function begin(page) {
  await page.waitForSelector('.overlay.intro .btn-primary:not([disabled])', { timeout: 20000 });
  await page.click('.overlay.intro .btn-primary');
  try {
    await waitPhase(page, 'ready', 1500);
  } catch {
    await page.click('.overlay.intro .btn-primary', { timeout: 2000 }).catch(() => {});
    await waitPhase(page, 'ready');
  }
}
/** Tap the ear and wait until it is his turn. */
async function listen(page) {
  await waitPhase(page, 'ready');
  await page.click('.btn-listen', { force: true });
  await waitPhase(page, 'respond');
}
/** Type a PIN on the parent PIN pad and press OK. */
async function typePin(page, pin) {
  await page.waitForSelector('.pin-pad');
  for (const d of pin) await page.click(`.pin-key[data-key="${d}"]`);
  await page.click('.pin-key[data-key="ok"]');
}
/** Open the parent area from the map. First time: the sum, then choose the PIN twice. */
async function openParent(page, pin = '246810') {
  await page.click('[data-open="parent"]');
  await page.waitForSelector('.gate');
  if (await page.locator('.gate-input').count()) {
    const [, a, b] = (await page.textContent('.gate')).match(/(\d+)\s*\u00d7\s*(\d+)/).map(Number);
    await page.fill('.gate-input', String(a * b));
    await page.click('.gate button[type="submit"]');
    await typePin(page, pin);
    await typePin(page, pin);
  } else {
    await typePin(page, pin);
  }
  await page.waitForSelector('.tabs:not([hidden])', { timeout: 5000 });
}
const openTab = async (page, tab) => { await page.click(`.tab[data-tab="${tab}"]`); await page.waitForSelector(`.tab.on[data-tab="${tab}"]`); };
const curItem = (page) => page.evaluate(() => globalThis.__lwm.debug.item);
const getState = (page) => page.evaluate(() => JSON.parse(JSON.stringify(globalThis.__lwm.store.get())));
const waitTrials = (page, n) => page.waitForFunction((k) => globalThis.__lwm.store.get().trials.length >= k, n, { timeout: 20000 });

/** Play trials correctly until the first item matching pred is up (in the ready phase). Null if the mission has none. */
async function gotoItem(page, pred) {
  const items = await page.evaluate(() => globalThis.__lwm.debug.mission.items);
  const idx = items.findIndex(pred);
  if (idx < 0) return null;
  for (let i = 0; i < idx; i++) {
    await listen(page);
    await answer(page);
  }
  await waitPhase(page, 'ready');
  return items[idx];
}

/** Record every phase change of the mission on screen: [{p, covered, caption, t}] in window.__ph. */
const recordPhases = (page) => page.evaluate(() => {
  const m = document.querySelector('.mission');
  window.__ph = [];
  const rec = () => window.__ph.push({
    p: m.dataset.phase,
    covered: !!m.querySelector('.board')?.classList.contains('covered'),
    caption: !m.querySelector('.caption').hidden,
    t: performance.now(),
  });
  new MutationObserver(rec).observe(m, { attributes: true, attributeFilter: ['data-phase'] });
  new MutationObserver(rec).observe(m.querySelector('.caption'), { attributes: true, attributeFilter: ['hidden'] });
});
const phaseLog = (page) => page.evaluate(() => window.__ph || []);

// --- level data straight from disk (to steer which items a mission picks) ---
function loadLevels() {
  const file = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/data/listening/levels.json'), 'utf8'));
  return file.worlds.flatMap((w) => w.levels.map((l) => ({ ...l, world: w.id })));
}
function loadItems(levelId) {
  const level = loadLevels().find((l) => l.id === levelId);
  const ids = level.mix && level.mix.length ? level.mix : [level.id];
  return ids.flatMap((id) => JSON.parse(fs.readFileSync(path.join(ROOT, `assets/data/listening/${id}.json`), 'utf8')).items);
}
const clipExists = (item) => fs.existsSync(path.join(ROOT, 'assets/audio/listening', item.audio));
/** A `seen` map that marks every item NOT matching pred as just used, so missions prefer the matching ones. */
function seenExcept(levelId, pred) {
  const seen = {};
  const now = Date.now();
  for (const it of loadItems(levelId)) if (!pred(it)) seen[it.id] = now;
  return seen;
}

module.exports = {
  robotFor,
  typePin, openParent, openTab,
  ROOT, STATE_KEY, startServer, phase, waitPhase, answer, playMission,
  watchErrors, openPage, toMap, openLevel, begin, listen, curItem, getState, waitTrials, gotoItem,
  recordPhases, phaseLog, loadLevels, loadItems, clipExists, seenExcept,
};
