// A rehearsal of the real update: the version that is live (the first release) is used the way a
// family would, then the files on the server are swapped for the version in this repository and
// the update is left to happen by itself. Nothing he had may be lost.
//
//   node tests/e2e/upgrade.cjs             all three runs (about ten minutes)
//   node tests/e2e/upgrade.cjs sw nosw     only these runs (sw, nosw, finished)
//   node tests/e2e/upgrade.cjs -v          also list every check that passed, with what was seen
//
//   sw        service worker ON: a family plays, sets up PIN / rewards / chores / settings; the app is
//             opened again after the new version is published and updates itself; then he plays on
//   nosw      the same without the service worker: is the saved data understood by the new code?
//   finished  a child who has 3 stars on all 44 old levels and all 42 old cards; the update arrives
//             in the middle of a mission
//
// The live version is read from tests/e2e/out/old-release/ (made with `git archive` when missing).
// Saved states and screenshots go to tests/e2e/out/upgrade/. Nothing in the repository is changed.

const { chromium } = require('playwright');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');
const H = require('./helpers.cjs'); // the robot for the NEW version (the old screens are driven by the code below)

const ROOT = H.ROOT;
const OLD_COMMIT = '8cd3c39';
const OLD = path.join(ROOT, 'tests', 'e2e', 'out', 'old-release');
const OUT = path.join(ROOT, 'tests', 'e2e', 'out', 'upgrade');
// To try out a change to the NEW version without touching the repository: LWM_NEW_OVERLAY=<folder> serves
// the files in that folder in place of (or in addition to) the repository's, and LWM_NEW_LEVELS=<path>
// names the level list the new code loads if that is no longer assets/data/listening/levels.json.
const OVERLAY = process.env.LWM_NEW_OVERLAY ? path.resolve(process.env.LWM_NEW_OVERLAY) : null;
const NEW_LEVELS = process.env.LWM_NEW_LEVELS || 'assets/data/listening/levels.json';
const newFile = (p) => (OVERLAY && fs.existsSync(path.join(OVERLAY, p)) ? path.join(OVERLAY, p) : path.join(ROOT, p));
const KEY = 'lwm.state.v1';
/** The Starter drawer of the new map, open. (For a child who has stars in it, it is open already.) */
async function openDrawer(page) {
  const drawer = page.locator('details.starter');
  if (!(await drawer.evaluate((d) => d.open))) await page.click('details.starter summary');
  await page.waitForFunction(() => document.querySelector('details.starter')?.open === true);
  await drawer.evaluate((d) => d.scrollIntoView({ block: 'start' }));
}
const PIN = '271828';
const VIEW = { width: 1180, height: 820 };
const VERBOSE = process.argv.includes('-v');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const short = (v, n = 160) => { const s = JSON.stringify(v); return s && s.length > n ? `${s.slice(0, n)}…` : s; };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const save = (name, data) => fs.writeFileSync(path.join(OUT, name), typeof data === 'string' ? data : JSON.stringify(data, null, 2));
const idsIn = (file) => JSON.parse(fs.readFileSync(file, 'utf8')).worlds.flatMap((w) => w.levels.map((l) => l.id));
const versionIn = (file) => (fs.readFileSync(file, 'utf8').match(/const VERSION = '([^']+)'/) || [])[1];
const OLD_IDS = () => idsIn(path.join(OLD, 'assets/data/listening/levels.json'));
const NEW_IDS = () => idsIn(newFile(NEW_LEVELS));
const OLD_SW = () => versionIn(path.join(OLD, 'sw.js'));
const NEW_SW = () => versionIn(newFile('sw.js'));
const localDay = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

// ------------------------------------------------------------------------------------------------
// One address, two versions: the folder behind it can be swapped, exactly like a new deploy.

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg',
};

function startServer() {
  let root = OLD;
  let holdSw = 0;
  const served = { old: 0, new: 0, sw: [] };
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      if (p.endsWith('/')) p += 'index.html';
      const file = root === OLD ? path.join(OLD, p) : newFile(p);
      if (p.includes('..') || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        res.writeHead(404, { 'cache-control': 'no-store' });
        return res.end('not found');
      }
      served[root === OLD ? 'old' : 'new']++;
      if (p === '/sw.js') served.sw.push(root === OLD ? 'old' : 'new');
      const send = () => {
        res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
        fs.createReadStream(file).pipe(res);
      };
      if (p === '/sw.js' && root !== OLD && holdSw) setTimeout(send, holdSw);
      else send();
    });
    server.listen(0, '127.0.0.1', () => resolve({
      url: `http://127.0.0.1:${server.address().port}/`,
      served,
      /** From now on the address serves the new version. slowUpdateMs: the new sw.js answers that much later (a slower connection than this machine). */
      publishNew: ({ slowUpdateMs = 0 } = {}) => { root = ROOT; holdSw = slowUpdateMs; },
      close: () => server.close(),
    }));
  });
}

/** One browser profile kept on disk (so there is real storage, as on the device), at iPad size. */
async function openProfile(name) {
  const dir = path.join(OUT, 'profiles', name);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const ctx = await chromium.launchPersistentContext(dir, { viewport: VIEW, hasTouch: true, deviceScaleFactor: 1 });
  const page = ctx.pages()[0] || (await ctx.newPage());
  const log = { pageErrors: [], console: [], loads: 0 };
  page.on('pageerror', (e) => log.pageErrors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') log.console.push(`${m.text()}${m.location().url ? ` [${m.location().url}]` : ''}`); });
  page.on('load', () => { log.loads++; });
  return { ctx, page, log, dir };
}

/** Wait for something in the page; unlike waitForFunction this simply carries on when the page reloads itself. */
async function until(page, fn, arg, timeout = 30000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    try {
      const v = await page.evaluate(fn, arg);
      if (v) return v;
    } catch { /* the page is between two documents */ }
    await sleep(150);
  }
  return null;
}

// ------------------------------------------------------------------------------------------------
// Driving the screens. The old and the new version share these selectors (see the old release's own
// tests/e2e/helpers.cjs); only playing a mission differs (the new one has seven activity types).

const waitPhase = (page, want, timeout = 20000) =>
  page.waitForFunction((w) => document.querySelector('.mission')?.dataset.phase === w, want, { timeout });
const phase = (page) => page.evaluate(() => document.querySelector('.mission')?.dataset.phase || null);
const getState = (page) => page.evaluate(() => JSON.parse(JSON.stringify(globalThis.__lwm.store.get())));
const rawState = (page) => page.evaluate((k) => localStorage.getItem(k), KEY);
/** Which CODE is running (only the new store has an "expectations" section), how many levels it has loaded, which screen is up. */
const version = (page) => page.evaluate(() => {
  const L = globalThis.__lwm;
  return { code: !L ? null : 'expectations' in L.store.get() ? 'new' : 'old', levels: L?.levels?.length || 0, screen: L?.debug?.screen || null };
});
/** Wait (through any reload) until the title screen of the given code version is up. */
const titleOf = (page, code, timeout) => until(page, (c) => {
  const L = globalThis.__lwm;
  return !!L && !!document.querySelector('.screen.title .btn-huge') && ('expectations' in L.store.get() ? 'new' : 'old') === c ? L.levels.length : 0;
}, code, timeout);

async function toTitle(page, url) {
  await page.goto(url);
  await page.waitForSelector('.screen.title .btn-huge');
}
async function toMap(page) {
  await page.click('.screen.title .btn-huge');
  await page.waitForSelector('.screen.map');
}
/** He opens the app. Safe to use while the page may be reloading itself: waits for a title screen that stays. */
async function launch(page, url) {
  await page.goto(url, { waitUntil: 'commit' }).catch(() => {});
  for (let i = 0; i < 20; i++) {
    const born = await until(page, () => (document.querySelector('.screen.title .btn-huge') && globalThis.__lwm ? performance.timeOrigin : 0), null, 30000);
    await sleep(2500); // a reload on the title screen (new service worker) comes within a second or two
    const still = await page.evaluate(() => (document.querySelector('.screen.title .btn-huge') ? performance.timeOrigin : 0)).catch(() => 0);
    if (born && still === born) return true;
  }
  return false;
}
/** Title -> map, also when the first tap makes the page reload itself (then he simply taps Play again). */
async function toMapPatient(page) {
  for (let i = 0; i < 4; i++) {
    await until(page, () => !!document.querySelector('.screen.title .btn-huge'), null, 30000);
    await page.click('.screen.title .btn-huge', { timeout: 5000 }).catch(() => {});
    if (await until(page, () => !!document.querySelector('.screen.map'), null, 6000)) return true;
  }
  return false;
}
const backToMap = async (page) => { await page.click('.sub-head .icon-btn'); await page.waitForSelector('.screen.map'); };

/** The OLD version's robot: every item is "tap these things" (copied from the old release's helpers). */
async function oldAnswer(page, wrong) {
  const item = await page.evaluate(() => globalThis.__lwm.debug.item);
  let taps = item.expect.flat();
  if (wrong) {
    const all = item.scene.objects.map((o) => o.id);
    taps = taps.length ? [all.find((id) => !taps.includes(id))] : [all[0]];
  }
  for (const id of taps) await page.click(`.obj[data-id="${id}"]`);
  if (!taps.length) await page.click('.btn-hand');
  else if (!item.auto && (await phase(page)) === 'respond') await page.click('.btn-done');
}
async function oldBegin(page, levelId) {
  await page.click(`.level-node[data-level="${levelId}"]`);
  await page.waitForSelector('.overlay.intro .btn-primary:not([disabled])', { timeout: 20000 });
  await page.click('.overlay.intro .btn-primary');
  await waitPhase(page, 'ready');
}
/** plan[i] = 'right' | 'second' (miss, then right) | 'miss' (miss twice, the guide shows the answer). */
async function oldTrials(page, plan = []) {
  const trials = await page.evaluate(() => globalThis.__lwm.debug.mission.items.length);
  for (let i = 0; i < trials; i++) {
    const how = plan[i] || 'right';
    await waitPhase(page, 'ready');
    await page.click('.btn-listen', { force: true });
    await waitPhase(page, 'respond');
    await oldAnswer(page, how !== 'right');
    if (how !== 'right') {
      await waitPhase(page, 'ready');
      await page.click('.btn-listen', { force: true });
      await waitPhase(page, 'respond');
      await oldAnswer(page, how === 'miss');
    }
  }
  await page.waitForSelector('.screen.results', { timeout: 30000 });
}
/** What a results screen shows (old or new). Opens the chest when there is one. */
async function readResults(page) {
  const r = await page.evaluate(() => ({
    stars: document.querySelectorAll('.big-star.on').length,
    xp: document.querySelector('.tag.xp')?.textContent || '',
    chest: !!document.querySelector('.chest') && !document.querySelector('.chest-area')?.hidden,
    won: [...document.querySelectorAll('.won-item')].map((n) => n.textContent.trim()),
    wonText: document.querySelector('.won-box b')?.textContent || '',
  }));
  r.card = null;
  if (r.chest) {
    await page.click('.chest', { force: true });
    await page.waitForSelector('.card-reveal .card-name', { timeout: 5000 });
    r.card = (await page.textContent('.card-reveal .card-name')).trim();
  }
  return r;
}
const resultsToMap = async (page) => { await page.click('[data-act="map"]'); await page.waitForSelector('.screen.map'); };

async function typePin(page, pin) {
  await page.waitForSelector('.pin-pad');
  for (const d of pin) await page.click(`.pin-key[data-key="${d}"]`);
  await page.click('.pin-key[data-key="ok"]');
}
const tabsOpen = (page, timeout = 5000) => page.waitForSelector('.tabs:not([hidden])', { timeout }).then(() => true, () => false);
const openTab = async (page, tab) => { await page.click(`.tab[data-tab="${tab}"]`); await page.waitForSelector(`.tab.on[data-tab="${tab}"]`); };

/** From the map into the parent area. 'new' = the very first time (a sum, then choose the PIN twice). */
async function parentIn(page, how) {
  await page.click('[data-open="parent"]');
  await page.waitForSelector('.gate');
  const asksSum = (await page.locator('.gate-input').count()) > 0;
  if (how === 'new') {
    const [, a, b] = (await page.textContent('.gate')).match(/(\d+)\s*×\s*(\d+)/).map(Number);
    await page.fill('.gate-input', String(a * b));
    await page.click('.gate button[type="submit"]');
    await typePin(page, PIN);
    await typePin(page, PIN);
    return tabsOpen(page);
  }
  if (asksSum) return false; // it asks a first-time visitor's question: the PIN is gone
  await typePin(page, PIN);
  return tabsOpen(page);
}

/** A picture "taken with the camera" (drawn in the page so it is a real, visible image). */
async function makePhoto(page, word, color) {
  const b64 = await page.evaluate(([w, c]) => {
    const cv = document.createElement('canvas');
    cv.width = 640; cv.height = 480;
    const g = cv.getContext('2d');
    g.fillStyle = c; g.fillRect(0, 0, 640, 480);
    g.fillStyle = '#fff'; g.fillRect(60, 110, 520, 260);
    g.fillStyle = '#223'; g.font = 'bold 90px sans-serif'; g.textAlign = 'center'; g.fillText(w, 320, 275);
    return cv.toDataURL('image/png').split(',')[1];
  }, [word, color]);
  return Buffer.from(b64, 'base64');
}
async function doChore(page, title, photo) {
  const row = `.chore-row:has(.reward-title:text-is("${title}"))`;
  const [chooser] = await Promise.all([page.waitForEvent('filechooser', { timeout: 5000 }), page.click(`${row} [data-act="done"]`)]);
  await chooser.setFiles({ name: 'photo.png', mimeType: 'image/png', buffer: photo });
  await page.waitForSelector('.photo-panel [data-act="send"]', { timeout: 5000 });
  await page.click('.photo-panel [data-act="send"]');
  await page.waitForSelector(`${row}.state-pending .thumb img`, { timeout: 5000 });
}

/** The chore photos in IndexedDB: key, size and a checksum of the bytes. Never creates the database. */
const readPhotos = (page) => page.evaluate(async () => {
  const dbs = await indexedDB.databases();
  if (!dbs.some((d) => d.name === 'lwm-photos')) return [];
  const db = await new Promise((resolve, reject) => {
    const req = indexedDB.open('lwm-photos');
    req.onupgradeneeded = () => req.transaction.abort();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  try {
    if (!db.objectStoreNames.contains('photos')) return [];
    const store = db.transaction('photos', 'readonly').objectStore('photos');
    const all = (r) => new Promise((resolve, reject) => { r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
    const [keys, recs] = await Promise.all([all(store.getAllKeys()), all(store.getAll())]);
    return keys.map((key, i) => {
      const bytes = new Uint8Array(recs[i].data);
      let sum = 0;
      for (const b of bytes) sum = (sum * 31 + b) >>> 0;
      return { key, type: recs[i].type, bytes: bytes.length, sum };
    });
  } finally {
    db.close();
  }
});

// --- what the screens show (the same reader for the old and the new version) ---

const readMap = (page) => page.evaluate(() => {
  const txt = (sel) => document.querySelector(sel)?.textContent.trim() ?? null;
  const nodes = [...document.querySelectorAll('.level-node')];
  return {
    rank: txt('.rank-name'),
    rankSub: txt('.rank-sub'),
    xpBar: document.querySelector('.xpbar i')?.style.width ?? null,
    cards: txt('[data-open="collection"]'),
    dots: { rewards: txt('[data-open="rewards"] .dot'), chores: txt('[data-open="chores"] .dot'), parent: txt('[data-open="parent"] .dot') },
    buttons: [...document.querySelectorAll('.map-actions [data-open]')].map((b) => b.dataset.open),
    play: document.querySelector('.map-foot .btn')?.dataset.play ?? null,
    worlds: [...document.querySelectorAll('section.world')].map((w) => w.dataset.world),
    stars: Object.fromEntries(nodes.map((n) => [n.dataset.level, n.querySelectorAll('.node-stars .on').length])),
    locked: nodes.filter((n) => n.classList.contains('locked')).map((n) => n.dataset.level),
    inDrawer: [...document.querySelectorAll('details.starter .level-node')].map((n) => n.dataset.level),
  };
});

/**
 * Walk through his screens and the parent area and write down what they show. Starts and ends on the map.
 * In the parent area the right PIN must open the door (opts.wrongFirst: and a wrong one must not).
 */
async function readScreens(page, opts = {}) {
  const shot = async (name) => { if (opts.shots?.[name]) await page.screenshot({ path: path.join(OUT, opts.shots[name]) }); };
  const out = { map: await readMap(page) };
  await shot('map');

  await page.click('[data-open="collection"]');
  await page.waitForSelector('.screen.collection');
  out.collection = await page.evaluate(() => ({
    count: document.querySelector('.sub-head .count').textContent.trim(),
    slots: document.querySelectorAll('.card-grid .card').length,
    names: [...document.querySelectorAll('.card-grid .card:not(.empty) .card-name')].map((n) => n.textContent.trim()),
  }));
  await backToMap(page);

  out.rewards = null;
  if (await page.locator('[data-open="rewards"]').count()) {
    await page.click('[data-open="rewards"]');
    await page.waitForSelector('.screen.rewards');
    out.rewards = await page.evaluate(() => ({
      lockedByExpectations: document.querySelector('.screen.rewards').classList.contains('locked'),
      xp: document.querySelector('.sub-head .count')?.textContent.trim() ?? null,
      waiting: [...document.querySelectorAll('.glow-panel [data-earned] .reward-title')].map((n) => n.textContent.trim()),
      rows: [...document.querySelectorAll('.reward-row[data-reward]')].map((r) => ({
        title: r.querySelector('.reward-title').textContent.trim(),
        won: r.classList.contains('won'),
        shows: (r.querySelector('.stamp') || r.querySelector('.reward-need'))?.textContent.trim() ?? null,
        pips: `${r.querySelectorAll('.pip.gold').length}/${r.querySelectorAll('.pip').length}`,
      })),
    }));
    await backToMap(page);
  }

  out.chores = null;
  if (await page.locator('[data-open="chores"]').count()) {
    await page.click('[data-open="chores"]');
    await page.waitForSelector('.screen.chores');
    if (await page.locator('.chore-row.state-pending').count()) await page.waitForSelector('.chore-row.state-pending .thumb img', { timeout: 5000 }).catch(() => {});
    out.chores = await page.evaluate(async () => {
      const rows = [...document.querySelectorAll('.chore-row')];
      for (const img of document.querySelectorAll('.chore-row .thumb img')) await img.decode().catch(() => {});
      return {
        xp: document.querySelector('.sub-head .count').textContent.trim(),
        rows: rows.map((r) => ({
          title: r.querySelector('.reward-title').textContent.trim(),
          state: [...r.classList].find((c) => c.startsWith('state-')).slice(6),
          photoShows: (r.querySelector('.thumb img')?.naturalWidth || 0) > 0,
          stamp: r.querySelector('.stamp')?.textContent.trim() ?? null,
        })),
      };
    });
    await backToMap(page);
  }

  // --- the parent area
  out.parent = { opened: false, askedForSum: false, wrongPin: null };
  await page.click('[data-open="parent"]');
  await page.waitForSelector('.gate');
  out.parent.askedForSum = (await page.locator('.gate-input').count()) > 0;
  if (!out.parent.askedForSum) {
    if (opts.wrongFirst) {
      await typePin(page, '000000');
      await page.waitForFunction(() => (document.querySelector('.gate-msg')?.textContent || '').length > 0, null, { timeout: 5000 }).catch(() => {});
      out.parent.wrongPin = { opened: (await page.locator('.tabs:not([hidden])').count()) > 0, message: await page.textContent('.gate-msg').catch(() => '') };
    }
    await typePin(page, PIN);
    out.parent.opened = await tabsOpen(page);
  }
  if (out.parent.opened) {
    out.parent.tabs = await page.evaluate(() => [...document.querySelectorAll('.tab')].map((t) => t.textContent.trim()));
    out.parent.stats = await page.evaluate(() => [...document.querySelectorAll('.stat')].map((s) => `${s.querySelector('b').textContent} ${s.querySelector('span').textContent}`));
    await openTab(page, 'rewards');
    out.parent.rewards = await page.evaluate(() => {
      const sec = (title) => [...document.querySelectorAll('.parent-body section.panel')].find((s) => s.querySelector('h2')?.textContent.startsWith(title));
      const rows = (s) => [...(s?.querySelectorAll('.admin-row') || [])].map((r) => `${r.querySelector('.emoji').textContent} ${r.querySelector('b').textContent} | ${r.querySelector('small').textContent}`);
      return {
        heading: sec('To hand out')?.querySelector('h2').textContent ?? null,
        toHandOut: [...document.querySelectorAll('[data-earned]')].map((r) => `${r.querySelector('.emoji').textContent} ${r.querySelector('b').textContent} | ${r.querySelector('small').textContent}`),
        daily: rows(sec('Daily rewards')),
        lifetime: rows(sec('Lifetime rewards')),
        countRepeats: sec('Daily rewards')?.querySelector('label.setting input')?.checked ?? null,
      };
    });
    await shot('handOut');
    await openTab(page, 'chores');
    if (await page.locator('.check-card').count()) await page.waitForSelector('.check-card img', { timeout: 5000 }).catch(() => {});
    out.parent.chores = await page.evaluate(async () => {
      for (const img of document.querySelectorAll('.check-card img')) await img.decode().catch(() => {});
      const sec = (title) => [...document.querySelectorAll('.parent-body section.panel')].find((s) => s.querySelector('h2')?.textContent.startsWith(title));
      return {
        heading: sec('To check')?.querySelector('h2').textContent ?? null,
        toCheck: [...document.querySelectorAll('.check-card')].map((c) => ({
          title: c.querySelector('.check-info b').textContent.trim(),
          line: c.querySelector('.check-info small').textContent.trim(),
          photoShows: (c.querySelector('.check-photo img')?.naturalWidth || 0) > 0,
          photoText: c.querySelector('.check-photo').textContent.trim(),
        })),
        list: [...(sec('Chores')?.querySelectorAll('.admin-row') || [])].map((r) => `${r.querySelector('.emoji').textContent} ${r.querySelector('b').textContent} | ${r.querySelector('small').textContent}`),
        askPhoto: sec('Chores')?.querySelector('label.setting input')?.checked ?? null,
        recent: [...(sec('Recently checked')?.querySelectorAll('li') || [])].map((li) => li.textContent.trim()),
      };
    });
    await shot('chores');
    await openTab(page, 'settings');
    out.parent.settings = await page.evaluate(() => {
      const box = (label) => [...document.querySelectorAll('label.setting')].find((l) => l.querySelector('b')?.textContent.startsWith(label))?.querySelector('input')?.checked ?? null;
      return {
        sfx: box('Sound effects'), slowVoice: box('Slower voice'), hardStop: box('Lock for the day'), unlockAll: box('Unlock every level'),
        earlyReminder: box('Remind him to wait'),
        suggestStopAfter: [...document.querySelectorAll('label.setting')].find((l) => l.querySelector('select'))?.querySelector('select').value ?? null,
      };
    });
    await shot('settings');
  }
  await backToMap(page);
  return out;
}

// ------------------------------------------------------------------------------------------------
// Comparing saved states: everything that was there must still be there, unchanged.

function compare(a, b, p = '', out = { lost: [], added: [] }) {
  if (Array.isArray(a)) {
    if (!Array.isArray(b)) out.lost.push(`${p}: was a list of ${a.length}, now ${short(b)}`);
    else {
      if (b.length < a.length) out.lost.push(`${p}: ${a.length} entries before, ${b.length} after`);
      if (b.length > a.length) out.added.push(`${p}[+${b.length - a.length}]`);
      for (let i = 0; i < Math.min(a.length, b.length); i++) compare(a[i], b[i], `${p}[${i}]`, out);
    }
  } else if (a && typeof a === 'object') {
    if (!b || typeof b !== 'object' || Array.isArray(b)) out.lost.push(`${p}: was ${short(a)}, now ${short(b)}`);
    else {
      for (const k of Object.keys(a)) {
        if (!(k in b)) out.lost.push(`${p}.${k}: ${short(a[k])} is gone`);
        else compare(a[k], b[k], `${p}.${k}`, out);
      }
      for (const k of Object.keys(b)) if (!(k in a)) out.added.push(`${p}.${k} = ${short(b[k], 80)}`);
    }
  } else if (a !== b) out.lost.push(`${p}: ${short(a)} -> ${short(b)}`);
  return out;
}
/** New things the new version is allowed to ADD to an old save. */
const ALLOWED_NEW = [/^\.settings\.earlyReminder /, /^\.expectations /, /^\.flags\.skipHint /];

/** Is everything he owned before still there (after playing on, numbers may only have grown)? */
function nothingWentBackwards(t, before, now, label) {
  t.ok(now.xp >= before.xp, `${label}: XP did not go down`, `${before.xp} -> ${now.xp}`);
  const down = Object.keys(before.levels).filter((id) => !now.levels[id] || now.levels[id].stars < before.levels[id].stars || now.levels[id].plays < before.levels[id].plays || now.levels[id].best < before.levels[id].best);
  t.ok(down.length === 0, `${label}: no old level lost stars, plays or its best score`, down.map((id) => `${id}: ${short(before.levels[id])} -> ${short(now.levels[id])}`).join('; ') || `${Object.keys(before.levels).length} levels checked`);
  t.ok(same(now.cards.slice(0, before.cards.length), before.cards), `${label}: the cards he had are all still his, in the same order`, `${before.cards.length} before, ${now.cards.length} now`);
  t.ok(same(now.rewards.earned.slice(0, before.rewards.earned.length), before.rewards.earned), `${label}: every reward he had won is still recorded as it was`, short(now.rewards.earned.map((e) => [e.src, e.title, e.given])));
  t.ok(same(now.rewards.daily, before.rewards.daily) && same(now.rewards.tiers, before.rewards.tiers), `${label}: the parent's reward lists are unchanged`, '');
  t.ok(same(now.chores, before.chores), `${label}: chores (list, log, photo setting) are unchanged`, '');
  t.ok(now.admin.hash === before.admin.hash && now.admin.salt === before.admin.salt, `${label}: the PIN hash is unchanged`, '');
  t.ok(Object.keys(before.settings).every((k) => now.settings[k] === before.settings[k]), `${label}: every setting is as he left it`, short(now.settings));
  t.ok(same(now.trials.slice(0, before.trials.length), before.trials) && same(now.missions.slice(0, before.missions.length), before.missions), `${label}: the history for the parent's Progress tab is still there`, `${before.trials.length} turns / ${before.missions.length} missions before, ${now.trials.length} / ${now.missions.length} now`);
}

// ------------------------------------------------------------------------------------------------
// The family uses the OLD version.

async function familyUsesOld(t, page) {
  await toMap(page);
  t.must(same(await version(page), { code: 'old', levels: 44, screen: 'map' }), `the old release should be on screen with its 44 levels: ${short(await version(page))}`);

  // The parent: PIN, a daily and a lifetime reward, two chores, two settings.
  t.must(await parentIn(page, 'new'), 'old version: choosing a PIN did not open the parent area');
  await openTab(page, 'rewards');
  await page.selectOption('[data-form="daily"] .icon-select', '🎮');
  await page.fill('[data-form="daily"] input[type="text"]', 'Game time');
  await page.fill('[data-form="daily"] input[type="number"]', '2');
  await page.click('[data-form="daily"] button[type="submit"]');
  await page.selectOption('[data-form="tier"] .icon-select', '🍕');
  await page.fill('[data-form="tier"] input[type="text"]', 'Pizza night');
  await page.fill('[data-form="tier"] input[type="number"]', '150');
  await page.click('[data-form="tier"] button[type="submit"]');
  await openTab(page, 'chores');
  for (const [icon, title, points, repeat, extra] of [['🛏️', 'Make your bed', '40', 'daily', 'Sticker'], ['🧹', 'Tidy your desk', '25', 'weekly', '']]) {
    await page.selectOption('[data-form="chore"] .icon-select', icon);
    await page.fill('[data-form="chore"] input[type="text"] >> nth=0', title);
    await page.fill('[data-form="chore"] input[type="number"]', points);
    await page.selectOption('[data-form="chore"] select:not(.icon-select)', repeat);
    await page.fill('[data-form="chore"] input[type="text"] >> nth=1', extra);
    await page.click('[data-form="chore"] button[type="submit"]');
  }
  await openTab(page, 'settings');
  await page.click('label.setting:has-text("Slower voice") input');
  await page.selectOption('label.setting select', '5');
  await backToMap(page);
  let s = await getState(page);
  t.must(s.rewards.daily.length === 1 && s.rewards.tiers.length === 1 && s.chores.list.length === 2 && s.settings.slowVoice === true && s.settings.dailyMissions === 5 && s.admin.hash.length > 20,
    `old version: the parent's set-up was not saved: ${short(s.rewards)} ${short(s.chores.list)} ${short(s.settings)}`);

  // He plays: two perfect missions, one with a slip, one with real misses, and a repeat of level 1.
  const played = [];
  for (const [id, plan] of [['w1l1', []], ['w1l2', ['right', 'second']], ['w1l3', []], ['w1l4', ['miss', 'second', 'miss']], ['w1l1', []]]) {
    await oldBegin(page, id);
    await oldTrials(page, plan);
    played.push({ id, ...(await readResults(page)) });
    await resultsToMap(page);
  }
  s = await getState(page);
  t.must(s.rewards.earned.some((e) => e.src === 'daily') && s.rewards.earned.some((e) => e.src === 'tier'), `old version: playing should have won the daily and the lifetime reward: ${short(s.rewards.earned)}`);

  // He does both chores, each with a photo.
  await page.click('[data-open="chores"]');
  await page.waitForSelector('.screen.chores');
  await doChore(page, 'Make your bed', await makePhoto(page, 'BED', '#2a9d8f'));
  await doChore(page, 'Tidy your desk', await makePhoto(page, 'DESK', '#e76f51'));
  await backToMap(page);

  // The parent approves one chore (the other keeps waiting) and hands out the daily reward.
  t.must(await parentIn(page, 'again'), 'old version: the PIN did not open the parent area');
  await openTab(page, 'chores');
  await page.waitForSelector('.check-card img');
  await page.click('.check-card:has(.check-info b:has-text("Make your bed")) [data-act="approve"]');
  await openTab(page, 'rewards');
  await page.click('[data-earned]:has(b:text-is("Game time")) button');
  await backToMap(page);
  s = await getState(page);
  const log = Object.fromEntries(s.chores.log.map((e) => [e.title, e]));
  t.must(log['Make your bed'].status === 'approved' && log['Tidy your desk'].status === 'pending' && !!log['Tidy your desk'].photo,
    `old version: expected one approved chore and one waiting with a photo: ${short(s.chores.log, 600)}`);
  t.must(s.rewards.earned.filter((e) => !e.given).length === 2 && s.rewards.earned.filter((e) => e.given).length === 1, `old version: expected 2 rewards owed and 1 given: ${short(s.rewards.earned, 600)}`);
  return played;
}

/** Everything worth remembering about the old version, taken at a quiet moment on the old map. */
async function snapshot(page, tag, shots) {
  const screens = await readScreens(page, { shots });
  const raw = await rawState(page);
  const snap = { raw, state: JSON.parse(raw), photos: await readPhotos(page), screens, day: localDay() };
  save(`${tag}-before-state.json`, snap.state);
  save(`${tag}-before-screens.json`, { photos: snap.photos, ...screens });
  return snap;
}

// ------------------------------------------------------------------------------------------------
// After the update.

/** The saved data itself: first exactly as the old version left it, then as the new code reads it. */
async function checkSavedData(t, page, B, tag) {
  const raw = await rawState(page);
  t.ok(raw === B.raw, 'the saved data on the device is byte for byte what the old version left', raw === B.raw ? `${raw.length} characters` : short(compare(B.state, JSON.parse(raw || 'null') || {}), 600));
  const mem = await getState(page);
  const d = compare(B.state, mem);
  t.ok(d.lost.length === 0, 'the new code reads every saved value unchanged (nothing removed, reset or altered)', d.lost.join(' | ') || `xp ${mem.xp}, ${Object.keys(mem.levels).length} levels, ${mem.cards.length} cards, ${mem.trials.length} turns`);
  const odd = d.added.filter((a) => !ALLOWED_NEW.some((re) => re.test(a)));
  t.ok(odd.length === 0, 'the only additions are the new sections and settings', odd.join(' | ') || d.added.join(' | '));
  const photos = await readPhotos(page);
  t.ok(same(photos, B.photos), 'the chore photos in IndexedDB are the same (keys, sizes, bytes)', `before ${short(B.photos)} after ${short(photos)}`);
  save(`${tag}-after-state.json`, mem);
  return mem;
}

/** What the NEW screens show, against what the OLD screens showed. */
async function checkScreens(t, page, B, tag, shots) {
  const before = B.screens;
  const n = B.state.cards.length;
  // the map, with the Starter drawer opened the way he would: by tapping it
  const camp = await page.locator('section.world[data-world="camp"]').count();
  t.ok(camp === 1, 'the new map is on screen (it has the Training Camp)', `${camp} section(s) with data-world="camp"`);
  await openDrawer(page);
  await sleep(700); // the drawer scrolls itself into view
  if (shots.drawer) await page.screenshot({ path: path.join(OUT, shots.drawer) });
  const after = await readScreens(page, { shots, wrongFirst: true });
  save(`${tag}-after-screens.json`, { photos: await readPhotos(page), ...after });
  const m = after.map;
  t.ok(m.rank === before.map.rank && m.rankSub === before.map.rankSub && m.xpBar === before.map.xpBar, 'same rank and the same XP to the next rank', `"${before.map.rank}, ${before.map.rankSub}" -> "${m.rank}, ${m.rankSub}"`);
  t.ok(before.map.cards === `${n}/42` && m.cards === `${n}/180`, 'the card counter shows his cards out of 180', `"${before.map.cards}" -> "${m.cards}"`);
  const oldIds = Object.keys(before.map.stars);
  const moved = oldIds.filter((id) => !m.inDrawer.includes(id));
  t.ok(moved.length === 0 && m.inDrawer.length === 44, 'all 44 old levels are in the Starter drawer', moved.join(', ') || `${m.inDrawer.length} levels in the drawer`);
  const starDiff = oldIds.filter((id) => m.stars[id] !== before.map.stars[id]);
  t.ok(starDiff.length === 0, 'every old level shows the stars it had', starDiff.map((id) => `${id}: ${before.map.stars[id]} -> ${m.stars[id]}`).join(', ') || short(Object.fromEntries(oldIds.filter((id) => before.map.stars[id]).map((id) => [id, m.stars[id]]))));
  const shut = oldIds.filter((id) => m.locked.includes(id) && !before.map.locked.includes(id));
  t.ok(shut.length === 0, 'no old level that was open is locked now', shut.join(', ') || `${before.map.locked.length} were locked before, ${oldIds.filter((id) => m.locked.includes(id)).length} now`);
  t.ok(same(m.dots, before.map.dots), 'the badges on Rewards / Chores / parent buttons are the same', `${short(before.map.dots)} -> ${short(m.dots)}`);
  t.ok(before.map.buttons.every((b) => m.buttons.includes(b)), 'the Rewards and Chores buttons are still on the map', `${before.map.buttons} -> ${m.buttons}`);

  t.ok(after.collection.count === `${n} / 180` && after.collection.slots === 180, 'My Cards: his cards out of 180', `"${before.collection.count}" -> "${after.collection.count}", ${after.collection.slots} slots`);
  t.ok(same(after.collection.names, before.collection.names), 'My Cards shows the very same cards', `${short(before.collection.names)} -> ${short(after.collection.names)}`);

  if (before.rewards) {
    t.ok(!!after.rewards && !after.rewards.lockedByExpectations, 'his Rewards screen is open (not locked by expectations nobody has set)', short(after.rewards));
    t.ok(same(after.rewards, { ...before.rewards, lockedByExpectations: false }), 'his Rewards screen shows the same: what he won, today\'s count, the big rewards, XP', `${short(before.rewards, 400)} -> ${short(after.rewards, 400)}`);
  }
  if (before.chores) {
    t.ok(same(after.chores, before.chores), 'his Chores screen shows the same: done, waiting (with its photo), XP', `${short(before.chores, 400)} -> ${short(after.chores, 400)}`);
    const waiting = after.chores?.rows.filter((r) => r.state === 'pending') || [];
    t.ok(waiting.length === before.chores.rows.filter((r) => r.state === 'pending').length && waiting.every((r) => r.photoShows), 'the waiting chore is still waiting and its photo shows on his side', short(waiting));
  }

  const P = after.parent;
  t.ok(!P.askedForSum, 'the parent area asks for the PIN (not the first-time question)', P.askedForSum ? 'it asked the sum: the PIN is gone' : 'PIN pad');
  if (P.wrongPin) t.ok(!P.wrongPin.opened && /Wrong/.test(P.wrongPin.message || ''), 'a wrong PIN stays shut', short(P.wrongPin));
  t.ok(P.opened, 'the SAME PIN opens the parent area', P.opened ? `tabs: ${P.tabs.join(', ')}` : 'it did not open');
  if (P.opened && before.parent.opened) {
    t.ok(same(P.stats, before.parent.stats), 'Progress tab: the same numbers', `${short(before.parent.stats, 300)} -> ${short(P.stats, 300)}`);
    t.ok(same(P.rewards.toHandOut, before.parent.rewards.toHandOut) && P.rewards.heading === before.parent.rewards.heading, 'Rewards tab: what he is owed is still under "To hand out"', `${before.parent.rewards.heading} ${short(before.parent.rewards.toHandOut)} -> ${P.rewards.heading} ${short(P.rewards.toHandOut)}`);
    t.ok(same(P.rewards.daily, before.parent.rewards.daily) && same(P.rewards.lifetime, before.parent.rewards.lifetime) && P.rewards.countRepeats === before.parent.rewards.countRepeats, 'Rewards tab: the parent\'s daily and lifetime rewards are the same', `${short(P.rewards.daily)} ${short(P.rewards.lifetime)}`);
    t.ok(same(P.chores.toCheck, before.parent.chores.toCheck) && P.chores.toCheck.every((c) => c.photoShows), 'Chores tab: the waiting chore is still to check, with its photo', `${short(before.parent.chores.toCheck, 300)} -> ${short(P.chores.toCheck, 300)}`);
    t.ok(same(P.chores.list, before.parent.chores.list) && P.chores.askPhoto === before.parent.chores.askPhoto, 'Chores tab: the chore list is the same', short(P.chores.list));
    t.ok(same(P.chores.recent, before.parent.chores.recent), 'Chores tab: the approved chore and its points are still listed', `${short(before.parent.chores.recent)} -> ${short(P.chores.recent)}`);
    const { earlyReminder, ...kept } = P.settings;
    const { earlyReminder: _none, ...was } = before.parent.settings;
    t.ok(same(kept, was), 'Settings tab: every switch is where the parent left it', `${short(was)} -> ${short(kept)}`);
    t.ok(earlyReminder === true, 'the new "Remind him to wait" setting starts switched on', String(earlyReminder));
  }
  return after;
}

/** Still nothing lost once the new code has written the save again (the parent area was just used)? */
async function checkRewritten(t, page, B) {
  const d = compare(B.state, JSON.parse(await rawState(page)));
  const odd = d.added.filter((a) => !ALLOWED_NEW.some((re) => re.test(a)));
  t.ok(d.lost.length === 0 && odd.length === 0, 'after the new version has saved again, the save still holds every old value', [...d.lost, ...odd].join(' | ') || `added: ${d.added.join(' | ')}`);
}

/** One mission in the NEW version through the real screens. Returns what happened to the save. */
async function playNew(page, levelId, plan = []) {
  const s0 = await getState(page);
  await H.openLevel(page, levelId);
  await H.playMission(page, plan);
  const results = await readResults(page);
  const s1 = await getState(page);
  return { s0, s1, results, gained: s1.xp - s0.xp, newCards: s1.cards.slice(s0.cards.length) };
}
const cardList = (page) => page.evaluate(async () => (await import(new URL('src/listening/cards.js', document.baseURI).href)).CARDS.map((c) => ({ id: c.id, name: c.name })));

// ------------------------------------------------------------------------------------------------
// Run 1 and 2: a family, with and without the service worker.

async function familyRun(t, { sw }) {
  const tag = sw ? 'sw' : 'nosw';
  const server = await startServer();
  const { ctx, page, log, dir } = await openProfile(tag);
  t.cleanup(async () => { await ctx.close().catch(() => {}); server.close(); fs.rmSync(dir, { recursive: true, force: true }); });
  const url = `${server.url}?fast=1${sw ? '' : '&nosw=1'}`;
  const today = localDay();

  // ---- the live version
  await toTitle(page, url);
  if (sw) {
    t.must(await until(page, () => !!navigator.serviceWorker.controller, null, 60000), 'old version: its service worker never took control of the page');
    const keys = await page.evaluate(() => caches.keys());
    t.must(keys.includes(`shell-${OLD_SW()}`), `old version: expected its shell cache, found ${keys}`);
  }
  const played = await familyUsesOld(t, page);
  const B = await snapshot(page, tag, { map: `${tag}-1-old-map.png`, handOut: `${tag}-1-old-parent-to-hand-out.png`, chores: `${tag}-1-old-parent-chores.png` });
  t.note(`old version, saved: xp ${B.state.xp}, stars ${short(Object.fromEntries(Object.entries(B.state.levels).map(([k, v]) => [k, v.stars])))}, ${B.state.cards.length} cards, today ${short(B.state.days[today])}, owed ${short(B.state.rewards.earned.filter((e) => !e.given).map((e) => e.title))}, photos ${B.photos.length}`);
  t.note(`old version, missions: ${played.map((p) => `${p.id} ${p.stars}* ${p.xp}`).join(', ')}`);
  t.must(B.photos.length === 1 && B.photos[0].bytes > 1000, `old version: expected exactly one photo left in IndexedDB (the waiting chore's): ${short(B.photos)}`);
  t.must(B.state.days[today]?.missions === 5, `old version: expected 5 missions today (did midnight pass during the test?): ${short(B.state.days)}`);

  // ---- the new version is published; the app is opened again
  server.publishNew();
  const t0 = Date.now();
  const loadsBefore = log.loads;
  await page.goto(url);
  if (sw) {
    // He leaves the title screen alone; the app must fetch the new version and reload itself.
    const first = await until(page, () => (document.querySelector('.screen.title .btn-huge') && globalThis.__lwm ? { code: 'expectations' in globalThis.__lwm.store.get() ? 'new' : 'old', levels: globalThis.__lwm.levels.length } : null), null, 20000);
    t.note(`first screen after publishing: ${short(first)} (the app files come from the cache first, the level list from the network first)`);
    let arrived = await titleOf(page, 'new', 90000);
    t.ok(!!arrived, 'the update arrived by itself: the open app reloaded into the new version', arrived ? `${((Date.now() - t0) / 1000).toFixed(1)}s after opening the app, ${log.loads - loadsBefore} page loads, sw.js served: ${server.served.sw}` : `after 90s still ${short(await version(page))}`);
    for (let launch = 2; !arrived; launch++) { // go on with the checks of the saved data all the same: open the app again
      t.must(launch <= 4, `after 4 launches the app is still the old code: ${short(await version(page))}`);
      await page.goto(url);
      arrived = await titleOf(page, 'new', 15000);
      if (arrived) t.note(`the new version only showed at launch ${launch} after publishing`);
    }
    const sws = await page.evaluate(async () => ({ keys: await caches.keys(), regs: (await navigator.serviceWorker.getRegistrations()).length, controlled: !!navigator.serviceWorker.controller }));
    t.ok(sws.keys.includes(`shell-${NEW_SW()}`) && !sws.keys.includes(`shell-${OLD_SW()}`) && sws.controlled && sws.regs === 1, 'the new service worker is in charge and the old app files are gone from the cache', short(sws));
  } else {
    await page.waitForSelector('.screen.title .btn-huge');
    t.must((await version(page)).code === 'new', 'without a service worker a reload should load the new code at once');
  }
  const total = (await version(page)).levels;
  t.ok(total === NEW_IDS().length, 'the new version has loaded all its levels', `${total} levels`);

  // ---- nothing lost
  await checkSavedData(t, page, B, tag);
  await toMap(page);
  await checkScreens(t, page, B, tag, { drawer: `${tag}-2-new-map-starter-drawer.png`, handOut: `${tag}-2-new-parent-to-hand-out.png`, chores: `${tag}-2-new-parent-chores.png`, settings: `${tag}-2-new-parent-settings.png` });
  await checkRewritten(t, page, B);
  const s = await getState(page);
  t.ok(same(s.days[today], B.state.days[today]), 'today\'s count carried over', `${short(B.state.days[today])} -> ${short(s.days[today])}`);

  // ---- he plays on
  const cards = await cardList(page);
  const a = await playNew(page, 'camp1');
  t.ok(a.results.stars === 3 && a.gained > 0 && a.s1.xp === B.state.xp + a.gained && a.results.xp === `+${a.gained} XP`, 'a mission on a NEW level adds its XP to his old total', `${B.state.xp} + ${a.gained} = ${a.s1.xp} (screen: ${a.results.xp}, ${a.results.stars} stars)`);
  t.ok(a.newCards.length === 1 && !B.state.cards.includes(a.newCards[0]) && a.newCards[0] === cards[B.state.cards.length].id && a.results.card === cards[B.state.cards.length].name,
    'it gives the next card he did not have, added to his collection', `card ${B.state.cards.length + 1}: ${a.newCards[0]} "${a.results.card}"`);
  t.ok(a.s1.days[today].missions === B.state.days[today].missions + 1 && a.s1.days[today].counted === (B.state.days[today].counted || 0) + 1, 'today\'s count goes on from where it was', `${short(B.state.days[today])} -> ${short(a.s1.days[today])}`);
  await resultsToMap(page);
  let now = a.s1;
  if (sw) {
    // an old level he had 1 star on: now perfect; then the level he had 3 stars on, played badly
    const b = await playNew(page, 'w1l4');
    t.ok(b.s1.levels.w1l4.stars === 3 && b.s0.levels.w1l4.stars === 1 && b.s1.levels.w1l4.plays === b.s0.levels.w1l4.plays + 1 && b.gained > 0, 'an OLD level in the Starter drawer still plays and adds to its record', `w1l4 ${short(b.s0.levels.w1l4)} -> ${short(b.s1.levels.w1l4)}, +${b.gained} XP`);
    t.ok(b.newCards.length === 1 && b.newCards[0] === cards[b.s0.cards.length].id, 'and gives the next new card too', b.newCards.join());
    await resultsToMap(page);
    const c = await playNew(page, 'w1l1', ['miss', 'miss', 'second']);
    t.ok(c.results.stars < 3 && c.s1.levels.w1l1.stars === 3 && c.s1.xp > c.s0.xp, 'a worse replay of an old 3-star level takes nothing away', `this time ${c.results.stars} star(s); saved ${short(c.s1.levels.w1l1)}; xp ${c.s0.xp} -> ${c.s1.xp}`);
    await resultsToMap(page);
    now = c.s1;
    const m = await readMap(page);
    t.ok(m.stars.w1l1 === 3 && m.stars.w1l4 === 3 && m.stars.w1l2 === 2 && m.stars.w1l3 === 3 && m.stars.camp1 === 3 && m.cards === `${now.cards.length}/180`, 'the map shows it: old stars kept or raised, the new level\'s stars, one card per mission', `${short({ w1l1: m.stars.w1l1, w1l2: m.stars.w1l2, w1l3: m.stars.w1l3, w1l4: m.stars.w1l4, camp1: m.stars.camp1 })}, cards ${m.cards}, rank ${m.rank}`);
    t.ok(now.days[today].missions === B.state.days[today].missions + 3, 'three more missions today: the count continues', `${short(B.state.days[today])} -> ${short(now.days[today])}`);
    t.note(`missions on Starter levels after the update: "counted" (toward daily rewards) went ${a.s1.days[today].counted} -> ${now.days[today].counted} over 2 Starter missions (w1l4 had 1 star before; in the old version that mission would have counted)`);
  }
  const dailyToday = now.rewards.earned.filter((e) => e.src === 'daily' && e.day === today).length;
  const tiers = now.rewards.earned.filter((e) => e.src === 'tier').length;
  t.ok(dailyToday === 1 && tiers === 1, 'rewards already won are not handed out a second time', `${dailyToday} daily today, ${tiers} lifetime: ${short(now.rewards.earned.map((e) => [e.src, e.title, e.given]))}`);
  nothingWentBackwards(t, B.state, now, 'after playing on');
  save(`${tag}-after-play-state.json`, now);
  const photos = await readPhotos(page);
  t.ok(same(photos, B.photos), 'the waiting chore\'s photo is still stored after playing on', short(photos));

  // ---- and it is all still there the next time the app is opened
  const last = await rawState(page); // (the map has noted since that it gave its one-time skip-ahead hint)
  await toTitle(page, url);
  const again = await rawState(page);
  t.ok(again === last && JSON.parse(again).xp === now.xp && same(await version(page), { code: 'new', levels: total, screen: 'title' }), 'opening the app again: the new version, with everything saved', `xp ${JSON.parse(again).xp}, ${JSON.parse(again).cards.length} cards, ${again.length} characters`);
  t.ok(log.pageErrors.length === 0, 'no script errors in the page during the whole run', log.pageErrors.join(' | '));
  for (const e of [...new Set(log.console)].slice(0, 6)) t.note(`console error: ${e}`);
}

// ------------------------------------------------------------------------------------------------
// Run 3: he finished the old game. The update arrives while he is in a mission.

async function finishedRun(t) {
  const tag = 'finished';
  const server = await startServer();
  const { ctx, page, log, dir } = await openProfile(tag);
  t.cleanup(async () => { await ctx.close().catch(() => {}); server.close(); fs.rmSync(dir, { recursive: true, force: true }); });
  const url = `${server.url}?fast=1`;
  const oldIds = OLD_IDS();

  await toTitle(page, url);
  t.must(await until(page, () => !!navigator.serviceWorker.controller, null, 60000), 'old version: its service worker never took control of the page');
  await toMap(page);
  const notPerfect = [];
  for (const id of oldIds) { // in order: each perfect mission opens the next level
    await oldBegin(page, id);
    await oldTrials(page);
    const stars = await page.locator('.big-star.on').count();
    if (stars !== 3) notPerfect.push(`${id}: ${stars}`);
    await resultsToMap(page);
  }
  t.must(notPerfect.length === 0, `old version: the robot's perfect missions did not all get 3 stars: ${notPerfect.join(', ')}`);
  const oldMap = await readMap(page);
  await page.screenshot({ path: path.join(OUT, `${tag}-1-old-map.png`) });
  let s = await getState(page);
  t.must(Object.keys(s.levels).length === 44 && s.cards.length === 42 && oldMap.cards === '42/42', `old version: expected 44 levels played and all 42 cards: ${Object.keys(s.levels).length} levels, ${s.cards.length} cards, map shows ${oldMap.cards}`);
  t.note(`old version: 44 levels with 3 stars, xp ${s.xp}, rank "${oldMap.rank}, ${oldMap.rankSub}", cards ${oldMap.cards}`);

  // Another day: the app is opened again (so this page starts under its service worker, as on the
  // device) and he starts one more mission. While he is in it the new version is published and the
  // app notices (the same call the app makes when it comes back to the front).
  await toTitle(page, url);
  await toMap(page);
  await page.evaluate(() => { window.__swChanged = 0; navigator.serviceWorker.addEventListener('controllerchange', () => { window.__swChanged++; }); });
  await oldBegin(page, 'w1l1');
  server.publishNew();
  const t0 = Date.now();
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  const changed = await until(page, () => window.__swChanged > 0, null, 90000);
  t.ok(!!changed, 'the new service worker took over while he was in a mission', changed ? `${((Date.now() - t0) / 1000).toFixed(1)}s after the app looked for an update` : 'no controllerchange within 90s');
  const mid = await version(page);
  t.ok(mid.code === 'old' && mid.levels === 44 && mid.screen === 'mission' && (await phase(page)) === 'ready', 'the mission was not interrupted (still the old code, still his turn to tap the ear)', short(mid));
  await oldTrials(page);
  const res = await readResults(page);
  t.ok(res.stars === 3, 'he finishes that mission in the old code', short(res));
  const raw = await rawState(page);
  const B = { raw, state: JSON.parse(raw), photos: [], day: localDay() };
  save(`${tag}-before-state.json`, B.state);
  t.ok(B.state.xp === s.xp + 95 && B.state.levels.w1l1.plays === 2, 'and it was saved', `xp ${s.xp} -> ${B.state.xp}, w1l1 ${short(B.state.levels.w1l1)}`);

  // He taps Map: the old page reloads itself at that quiet moment.
  await page.click('[data-act="map"]');
  const arrived = await titleOf(page, 'new', 60000);
  t.must(!!arrived, `tapping Map after the mission should have reloaded into the new version: ${short(await version(page))}`);
  t.ok(true, 'tapping Map after the mission reloaded the app into the new version', short(await version(page)));

  const mem = await checkSavedData(t, page, B, tag);
  await toMap(page);
  await openDrawer(page);
  await sleep(700);
  await page.screenshot({ path: path.join(OUT, `${tag}-2-new-map-starter-drawer.png`) });
  const m = await readMap(page);
  const not3 = oldIds.filter((id) => m.stars[id] !== 3 || mem.levels[id]?.stars !== 3);
  t.ok(not3.length === 0 && oldIds.every((id) => m.inDrawer.includes(id)), 'all 44 old levels keep their 3 stars (saved and on the map, in the Starter drawer)', not3.join(', ') || `${oldIds.length} levels, 3 stars each`);
  t.ok(mem.xp === B.state.xp && m.rank === oldMap.rank, 'XP and rank are unchanged', `xp ${B.state.xp} -> ${mem.xp}; rank "${oldMap.rank}" -> "${m.rank}, ${m.rankSub}"`);
  t.ok(m.cards === '42/180', 'the card counter shows 42 out of 180', m.cards);
  const cards = await cardList(page);
  t.ok(same(cards.slice(0, 42).map((c) => c.id), B.state.cards), 'his 42 cards are exactly the first 42 of the new collection', `${cards.length} cards in the new collection`);
  t.note(`new map for him: Play button starts "${m.play}"; open new levels: ${Object.keys(m.stars).filter((id) => !oldIds.includes(id) && !m.locked.includes(id)).join(', ')}`);

  // The next mission he finishes gives card number 43.
  const a = await playNew(page, 'camp1');
  await page.screenshot({ path: path.join(OUT, `${tag}-3-new-results-card-43.png`) });
  t.ok(a.s1.cards.length === 43 && a.newCards[0] === cards[42].id && a.results.chest && a.results.card === cards[42].name, 'the next finished mission gives card number 43, a new one', `${short(a.newCards)} "${a.results.card}" (chest shown: ${a.results.chest})`);
  t.ok(a.s1.xp === B.state.xp + a.gained && a.gained > 0, 'and its XP is added to his total', `${B.state.xp} + ${a.gained} = ${a.s1.xp}`);
  nothingWentBackwards(t, B.state, a.s1, 'after playing on');
  await resultsToMap(page);
  save(`${tag}-after-play-state.json`, a.s1);
  t.ok((await readMap(page)).cards === '43/180', 'the map counts 43 cards', (await readMap(page)).cards);
  t.ok(log.pageErrors.length === 0, 'no script errors in the page during the whole run', log.pageErrors.join(' | '));
  for (const e of [...new Set(log.console)].slice(0, 6)) t.note(`console error: ${e}`);
}

// ------------------------------------------------------------------------------------------------

const RUNS = [
  ['sw: a family\'s progress, rewards, chores, PIN and settings survive the real update (service worker on)', (t) => familyRun(t, { sw: true })],
  ['nosw: the same saved data is understood by the new code (no service worker)', (t) => familyRun(t, { sw: false })],
  ['finished: all 44 old levels and all 42 old cards; the update arrives in the middle of a mission', finishedRun],
];

function ensureOldRelease() {
  if (fs.existsSync(path.join(OLD, 'index.html')) && fs.existsSync(path.join(OLD, 'sw.js'))) return true;
  try {
    fs.mkdirSync(OLD, { recursive: true });
    execSync(`set -o pipefail; git archive ${OLD_COMMIT} | tar -x -C "${OLD}"`, { cwd: ROOT, shell: '/bin/bash', stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

async function main() {
  if (!ensureOldRelease()) {
    console.log(`SKIP  the live version (commit ${OLD_COMMIT}) is not available here, so the update cannot be rehearsed`);
    process.exit(0);
  }
  fs.mkdirSync(OUT, { recursive: true });
  const filters = process.argv.slice(2).filter((a) => !a.startsWith('-')).map((a) => a.toLowerCase());
  const wanted = RUNS.filter(([name]) => !filters.length || filters.includes(name.split(':')[0]));
  if (!wanted.length) { console.error(`no run matches "${filters.join(' ')}" (sw, nosw, finished)`); process.exit(2); }
  console.log(`old version: ${OLD_COMMIT} (service worker ${OLD_SW()}, ${OLD_IDS().length} levels)   new version: working tree${OVERLAY ? ` + overlay ${path.relative(ROOT, OVERLAY)}` : ''} (service worker ${NEW_SW()}, ${NEW_IDS().length} levels)`);
  const started = Date.now();
  let failed = 0;
  const runOne = async ([name, fn]) => {
    const lines = [], fails = [], notes = [], cleanups = [];
    const t = {
      ok: (cond, what, seen = '') => { (cond ? lines : fails).push(`${what}${seen ? `  [${seen}]` : ''}`); return !!cond; },
      must: (cond, msg) => { if (!cond) throw new Error(msg); },
      note: (msg) => notes.push(msg),
      cleanup: (f) => cleanups.push(f),
    };
    const t0 = Date.now();
    try {
      await fn(t);
    } catch (e) {
      fails.push(`stopped: ${String(e.message).split('\n')[0]}`);
    }
    for (const f of cleanups) await f().catch?.(() => {});
    if (fails.length) failed++;
    console.log(`${fails.length ? 'FAIL' : 'PASS'}  ${name}  (${lines.length} checks passed${fails.length ? `, ${fails.length} failed` : ''}, ${((Date.now() - t0) / 1000).toFixed(0)}s)`);
    for (const f of fails) console.log(`      - ${f}`);
    if (VERBOSE) for (const l of lines) console.log(`      ok: ${l}`);
    for (const n of notes) console.log(`      note: ${n}`);
  };
  // "sw" goes first and alone: its update has to be in within about five seconds, which a busy
  // machine can spoil. The others run side by side.
  for (const run of wanted.filter(([name]) => name.startsWith('sw:'))) await runOne(run);
  await Promise.all(wanted.filter(([name]) => !name.startsWith('sw:')).map(runOne));
  console.log(`\n${wanted.length - failed} passed, ${failed} failed in ${((Date.now() - started) / 1000).toFixed(0)}s   (states and screenshots: tests/e2e/out/upgrade/)`);
  process.exit(failed ? 1 : 0);
}

if (require.main === module) main().catch((e) => { console.error(e); process.exit(1); });
else module.exports = { OLD, OUT, startServer, openProfile, until, version, titleOf, toTitle, toMap, backToMap, oldBegin, oldTrials, readResults, resultsToMap, readMap, readScreens, readPhotos, rawState, getState, compare, familyUsesOld, snapshot, playNew };
