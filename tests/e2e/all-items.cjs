// Plays EVERY item of the chosen levels through the real mission screen with the test robots
// and insists each right answer is accepted. Slow (about a second per item), so it is not part
// of run.cjs; run it after changing content, a checker, a play area or a robot.
//
//   node tests/e2e/all-items.cjs                 every level in assets/data
//   node tests/e2e/all-items.cjs put truth       only items of these activity types
//   node tests/e2e/all-items.cjs --dir tests/e2e/out/pack    levels from a preview folder

const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const H = require('./helpers.cjs');

(async () => {
  const args = process.argv.slice(2);
  const dirAt = args.indexOf('--dir');
  const dir = dirAt >= 0 ? path.resolve(args[dirAt + 1]) : path.join(H.ROOT, 'assets', 'data', 'listening');
  const types = args.filter((a, i) => !a.startsWith('--') && i !== dirAt + 1);
  const out = path.join(H.ROOT, 'tests', 'e2e', 'out', 'all-items');
  fs.mkdirSync(out, { recursive: true });

  const jobs = [];
  for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('.json') && n !== 'levels.json').sort()) {
    const data = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    const items = (data.items || []).filter((it) => !types.length || types.includes(it.t || 'tap'));
    if (!items.length) continue;
    const id = typeof data.level === 'string' ? data.level : data.level.id;
    const needsHand = items.some((it) => H.robotFor(it.t).isNone(it));
    for (let k = 0; k < items.length; k += 12) { // a dozen items per run keeps a failure easy to find
      const file = path.join(out, `${id}-${k}.json`);
      const chunk = items.slice(k, k + 12);
      fs.writeFileSync(file, JSON.stringify({ level: { id: `${id}-${k}`, title: id, trials: chunk.length, allowNone: needsHand }, items: chunk }));
      jobs.push({ id, file: path.relative(H.ROOT, file).split(path.sep).join('/'), n: chunk.length });
    }
  }
  const total = jobs.reduce((n, j) => n + j.n, 0);
  console.log(`${total} items in ${jobs.length} runs`);

  const server = await H.startServer();
  const browser = await chromium.launch();
  const failures = [];
  let played = 0;
  const worker = async () => {
    for (let job = jobs.shift(); job; job = jobs.shift()) {
      const ctx = await browser.newContext({ viewport: { width: 1180, height: 820 }, hasTouch: true });
      const page = await ctx.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(String(e)));
      try {
        await page.goto(`${server.url}?sandbox=${encodeURIComponent(job.file)}&fast=1&nosw=1`);
        await H.playMission(page);
        const missed = await page.evaluate(() => globalThis.__lwm.store.get().trials.filter((t) => !t.c1).map((t) => `${t.i} (${t.e})`));
        for (const m of missed) failures.push(`${job.id}: the robot's right answer was not accepted for ${m}`);
        played += job.n;
      } catch (e) {
        const at = await page.evaluate(() => {
          const d = globalThis.__lwm?.debug || {};
          return `phase ${document.querySelector('.mission')?.dataset.phase}, item ${d.item?.id} "${d.item?.say}"`;
        }).catch(() => 'page gone');
        failures.push(`${job.id}: ${String(e.message).split('\n')[0]} (${at})`);
      }
      for (const e of errors) failures.push(`${job.id}: page error: ${e}`);
      await ctx.close();
    }
  };
  await Promise.all(Array.from({ length: 6 }, worker));
  await browser.close();
  server.close();
  for (const f of failures) console.log(`  - ${f}`);
  console.log(`${played} of ${total} items played; ${failures.length} problem(s)`);
  process.exit(failures.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
