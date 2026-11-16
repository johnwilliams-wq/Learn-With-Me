// Quick end-to-end smoke run: title -> map -> one mission -> results, with screenshots.
// Usage: node tests/e2e/smoke.cjs [outDir]

const { chromium } = require('playwright');
const path = require('node:path');
const fs = require('node:fs');
const { startServer, playMission } = require('./helpers.cjs');

(async () => {
  const out = process.argv[2] || path.join(__dirname, 'out');
  fs.mkdirSync(out, { recursive: true });
  const server = await startServer();
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1180, height: 820 }, hasTouch: true, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  const shot = (name) => page.screenshot({ path: path.join(out, `${name}.png`) });

  await page.goto(`${server.url}?fast=1&nosw=1`);
  await page.waitForSelector('.screen.title .btn-huge');
  await shot('01-title');
  await page.click('.screen.title .btn-huge');
  await page.waitForSelector('.screen.map');
  await shot('02-map');
  await page.click('.map-foot .btn');
  await page.waitForSelector('.overlay.intro');
  await shot('03-intro');
  await page.waitForSelector('.overlay.intro .btn-primary:not([disabled])');
  await page.click('.overlay.intro .btn-primary');
  await page.waitForFunction(() => document.querySelector('.mission')?.dataset.phase === 'ready');
  await shot('04-ready');
  await page.click('.btn-listen', { force: true });
  await page.waitForFunction(() => document.querySelector('.mission')?.dataset.phase === 'respond');
  await shot('05-respond');
  await ctx.close();

  // a whole mission, with one second-try and one double miss
  const ctx2 = await browser.newContext({ viewport: { width: 1180, height: 820 }, hasTouch: true });
  const p2 = await ctx2.newPage();
  p2.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  p2.on('pageerror', (e) => errors.push(String(e)));
  await p2.goto(`${server.url}?fast=1&nosw=1`);
  await p2.click('.screen.title .btn-huge');
  await p2.waitForSelector('.screen.map');
  await p2.click('.map-foot .btn');
  await playMission(p2, ['right', 'second', 'right', 'miss', 'right', 'right']);
  await p2.waitForTimeout(1800);
  await p2.screenshot({ path: path.join(out, '06-results.png') });
  await p2.click('.chest', { force: true });
  await p2.waitForSelector('.card-reveal .card');
  await p2.screenshot({ path: path.join(out, '07-card.png') });
  const state = await p2.evaluate(() => {
    const s = globalThis.__lwm.store.get();
    return { xp: s.xp, levels: s.levels, cards: s.cards, trials: s.trials.length, last: s.trials.slice(-6).map((t) => [t.c1, t.c2, t.e]) };
  });
  console.log(JSON.stringify(state));
  await browser.close();
  server.close();
  console.log(errors.length ? `ERRORS:\n${errors.join('\n')}` : 'no console errors');
  process.exit(errors.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
