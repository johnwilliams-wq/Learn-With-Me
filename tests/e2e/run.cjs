// The full browser suite. Plain Node, no test framework.
//
//   node tests/e2e/run.cjs            run everything
//   node tests/e2e/run.cjs 13         only scenario 13
//   node tests/e2e/run.cjs layout     scenarios whose name contains "layout"
//
// Each scenario runs in fresh browser context(s). A scenario fails when a check fails or when the page
// logged a console error / page error (a 404 for a voice clip that is not on disk yet is only noted).
// Screenshots of the layout scenario go to tests/e2e/out/.

const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const H = require('./helpers.cjs');
const { waitPhase, answer, playMission, toMap, openLevel, begin, listen, curItem, getState, waitTrials, gotoItem } = H;

const OUT = path.join(__dirname, 'out');
const OPEN = { flags: { welcomed: true, unlockAll: true } }; // every level open, no first-run greeting
const LEVELS = H.loadLevels();
const scenarios = [];
const scenario = (name, fn) => scenarios.push({ name, fn });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const lastTrial = async (page) => (await getState(page)).trials.slice(-1)[0];
const brief = (t) => (t ? [t.c1, t.c2, t.e] : null);
const badges = (page, id) => page.locator(id ? `.obj[data-id="${id}"] .badge` : '.obj .badge').count();
const disabled = (page, sel) => page.locator(sel).isDisabled();

// ---------------------------------------------------------------------------------------------
scenario('01 first run: title -> map; Training Camp is open, its boss too, the other worlds are shut', async (t) => {
  const { page } = await t.open({ state: null });
  await toMap(page);
  const nodes = await page.evaluate(() => [...document.querySelectorAll('.level-node')].map((n) => ({
    id: n.dataset.level, world: n.closest('.world').dataset.world, starter: !!n.closest('details'),
    locked: n.classList.contains('locked'), next: n.classList.contains('next'), boss: n.classList.contains('boss') })));
  const main = nodes.filter((n) => !n.starter);
  const camp = main.filter((n) => n.world === 'camp');
  t.check(camp.length >= 4 && camp[0].next && !camp[0].locked, 'the first Training Camp level should be the open, highlighted "next" level');
  t.check(nodes.filter((n) => n.next).length === 1, 'exactly one level should be highlighted as next');
  t.check(camp.at(-1).boss && !camp.at(-1).locked, 'the Training Camp boss should be open from the start (the skip-ahead)');
  const openMiddle = camp.slice(1, -1).filter((n) => !n.locked).map((n) => n.id);
  t.check(openMiddle.length === 0, `camp levels that should be locked but are open: ${openMiddle.join(', ')}`);
  const openElsewhere = main.filter((n) => n.world !== 'camp' && !n.locked).map((n) => n.id);
  t.check(openElsewhere.length === 0, `levels of other worlds that should be shut but are open: ${openElsewhere.join(', ')}`);
  t.check(nodes.filter((n) => n.starter).length === 44 && nodes.filter((n) => n.starter).every((n) => !n.locked), 'the 44 Starter levels should all be open, inside their drawer');
  t.check((await page.getAttribute('.map-foot .btn', 'data-play')) === camp[0].id, 'the big Play button should start the first camp level');
  for (const id of [camp[1].id, ...main.filter((n) => n.world !== 'camp').slice(-1).map((n) => n.id)]) {
    await page.click(`.level-node[data-level="${id}"]`);
    await sleep(500);
    const where = await page.evaluate(() => ({ screen: globalThis.__lwm.debug.screen, mission: !!document.querySelector('.mission') }));
    t.check(where.screen === 'map' && !where.mission, `tapping locked level ${id} started a mission`);
  }
  t.check(await page.locator('.toast').isVisible(), 'tapping a locked level should show the gentle hint');
  t.check((await getState(page)).flags.welcomed === true, 'the first-run flag was not stored');
});

// ---------------------------------------------------------------------------------------------
scenario('02 perfect first mission: stars, chest, the next level opens, survives reload', async (t) => {
  const { page } = await t.open({ state: null });
  await toMap(page);
  await page.click('.map-foot .btn');
  await playMission(page);
  t.check((await page.locator('.big-star.on').count()) === 3, 'results should show 3 stars');
  t.check((await page.locator('[data-act="next"]').count()) === 1, 'results should offer a Next button');
  await page.click('.chest', { force: true });
  await page.waitForSelector('.card-reveal .card', { state: 'visible', timeout: 5000 });
  t.check(await page.locator('.chest').count() === 0, 'the opened chest should give way to the card (so the screen does not grow)');
  t.check(((await page.textContent('.card-reveal .card-name')) || '').trim().length > 0, 'the revealed card has no name');
  const onMap = async (label) => {
    const m = await page.evaluate(() => {
      const n = (id) => document.querySelector(`.level-node[data-level="${id}"]`);
      return { l2locked: n('camp2').classList.contains('locked'), l2next: n('camp2').classList.contains('next'),
        l1stars: n('camp1').querySelectorAll('.node-stars .on').length, l3locked: n('camp3').classList.contains('locked') };
    });
    t.check(!m.l2locked && m.l2next, `${label}: camp level 2 should be unlocked and highlighted`);
    t.check(m.l1stars === 3, `${label}: camp level 1 should show 3 stars, shows ${m.l1stars}`);
    t.check(m.l3locked, `${label}: camp level 3 should still be locked`);
  };
  await page.click('[data-act="map"]');
  await page.waitForSelector('.screen.map');
  await onMap('after the mission');
  await page.reload();
  await page.waitForSelector('.screen.title .btn-huge');
  await toMap(page);
  await onMap('after a reload');
  const s = await getState(page);
  t.check(s.levels.camp1?.stars === 3 && s.levels.camp1.plays === 1 && s.levels.camp1.best === 6, `stored level record is wrong: ${JSON.stringify(s.levels.camp1)}`);
  t.check(s.cards.length === 1, `expected 1 stored card, got ${s.cards.length}`);
  t.check(s.xp === 95, `expected 95 XP (6x10 + 15 + 10 patience + 10 perfect), got ${s.xp}`);
  t.check(s.trials.length === 6 && s.trials.every((x) => x.c1 === 1 && x.e === ''), 'expected 6 clean first-try trials in the log');
});

// ---------------------------------------------------------------------------------------------
scenario('03 gentle failure path: retry, demonstration, 1 star, stars never go down', async (t) => {
  const { page } = await t.open({ state: { flags: { welcomed: true }, xp: 95, levels: { w1l1: { stars: 3, plays: 1, best: 6, last: 1 } } } });
  await toMap(page);
  await openLevel(page, 'w1l1');
  await begin(page);
  const plan = ['right', 'second', 'right', 'miss', 'right', 'right'];
  for (let i = 0; i < plan.length; i++) {
    await listen(page);
    if (plan[i] === 'right') { await answer(page); continue; }
    const item = await answer(page, { wrong: true });
    await listen(page); // after a miss he taps the ear again: slower, with support
    t.check(await page.locator('.steps').isVisible(), `trial ${i + 1}: the step dots should show on the supported retry`);
    if (plan[i] === 'second') { await answer(page); continue; }
    await answer(page, { wrong: true });
    const shown = await page.waitForFunction((ids) => document.querySelector('.mission')?.dataset.phase === 'feedback' &&
      ids.every((id) => document.querySelector(`.obj[data-id="${id}"]`)?.classList.contains('chosen')), item.expect.flat(), { timeout: 8000 }).then(() => true, () => false);
    t.check(shown, `trial ${i + 1}: after two misses the guide should demonstrate the answer on the board`);
  }
  await page.waitForSelector('.screen.results', { timeout: 30000 });
  t.check((await page.locator('.big-star.on').count()) === 1, 'results should show 1 star');
  await page.click('.chest', { force: true });
  t.check(await page.waitForSelector('.card-reveal .card', { state: 'visible', timeout: 5000 }).then(() => true, () => false), 'even a 1-star mission should give a card');
  const s = await getState(page);
  const got = s.trials.map(brief);
  const want = [[1, 0, ''], [0, 1, '*'], [1, 0, ''], [0, 0, '*'], [1, 0, ''], [1, 0, '']];
  const same = got.length === 6 && got.every((g, i) => g[0] === want[i][0] && g[1] === want[i][1] && (want[i][2] === '*' ? ['object', 'attribute'].includes(g[2]) : g[2] === ''));
  t.check(same, `trial log (c1,c2,e) is ${JSON.stringify(got)}`);
  t.check(s.levels.w1l1.stars === 3 && s.levels.w1l1.best === 6 && s.levels.w1l1.plays === 2, `a worse replay changed the level record: ${JSON.stringify(s.levels.w1l1)}`);
  t.check(s.missions.slice(-1)[0]?.st === 1, 'the mission summary should record 1 star');
  await page.click('[data-act="map"]');
  await page.waitForSelector('.screen.map');
  t.check((await page.locator('.level-node[data-level="w1l1"] .node-stars .on').count()) === 3, 'map: level 1 lost stars after a worse replay');
  t.check(!(await page.locator('.level-node[data-level="w1l2"]').getAttribute('class')).includes('locked'), 'map: level 2 got locked again');
});

// ---------------------------------------------------------------------------------------------
scenario('04 ordered two-step level (w2l1): Done, Undo, wrong order', async (t) => {
  const { page } = await t.open();
  await toMap(page);
  await openLevel(page, 'w2l1');
  await begin(page);
  await listen(page);
  const item = await curItem(page);
  t.must(item.expect.length === 2 && !item.auto, `unexpected item shape for w2l1: ${JSON.stringify(item.expect)}`);
  const [a, b] = item.expect.flat();
  t.check(await page.locator('.btn-done').isVisible() && await page.locator('.btn-undo').isVisible(), 'Done and Undo should be showing');
  t.check(await disabled(page, '.btn-done') && await disabled(page, '.btn-undo'), 'Done/Undo should be disabled before any tap');
  await page.click(`.obj[data-id="${a}"]`);
  t.check(!(await disabled(page, '.btn-done')) && (await badges(page)) === 1, 'after one tap Done should be enabled and one badge shown');
  await page.click(`.obj[data-id="${b}"]`);
  t.check((await badges(page)) === 2, 'two taps should show two badges');
  await page.click('.btn-undo');
  t.check((await badges(page, b)) === 0 && (await badges(page, a)) === 1, 'Undo should remove only the last tap');
  await page.click('.btn-undo');
  t.check((await badges(page)) === 0 && await disabled(page, '.btn-done'), 'after undoing everything Done should be disabled again');
  await page.click(`.obj[data-id="${b}"]`);
  await page.click(`.obj[data-id="${a}"]`);
  await page.click('.btn-done');
  await listen(page);
  await answer(page);
  await waitTrials(page, 1);
  const tr = await lastTrial(page);
  t.check(tr.e === 'order' && tr.c1 === 0 && tr.c2 === 1, `right things in the wrong order should be logged as "order": got ${JSON.stringify(brief(tr))}`);
});

// ---------------------------------------------------------------------------------------------
scenario('05 pick mode (w3l2): un-pick, any order passes', async (t) => {
  const { page } = await t.open();
  await toMap(page);
  await openLevel(page, 'w3l2');
  await begin(page);
  await listen(page);
  const item = await curItem(page);
  t.must(item.mode === 'pick' && item.expect.length === 1 && item.expect[0].length >= 2, `unexpected item for w3l2: ${JSON.stringify(item.expect)}`);
  const want = item.expect[0];
  const other = item.scene.objects.map((o) => o.id).find((id) => !want.includes(id));
  await page.click(`.obj[data-id="${other}"]`);
  t.check((await page.textContent(`.obj[data-id="${other}"] .badge`)) === '✓', 'a picked object should show a tick');
  await page.click(`.obj[data-id="${other}"]`);
  t.check((await badges(page)) === 0 && !(await page.locator(`.obj[data-id="${other}"]`).getAttribute('class')).includes('chosen'), 'tapping a picked object again should un-pick it');
  t.check(await disabled(page, '.btn-done'), 'Done should be disabled when nothing is picked');
  for (const id of want.slice().reverse()) await page.click(`.obj[data-id="${id}"]`);
  await page.click('.btn-done');
  await waitTrials(page, 1);
  const tr = await lastTrial(page);
  t.check(tr.c1 === 1 && tr.e === '', `the right set in reverse order should pass first time: got ${JSON.stringify(brief(tr))}`);
});

// ---------------------------------------------------------------------------------------------
scenario('06 counting (w2l3): tap the same thing twice', async (t) => {
  const twice = (it) => it.expect.length === 1 && it.expect[0].length === 2 && it.expect[0][0] === it.expect[0][1];
  const { page } = await t.open({ state: { ...OPEN, seen: H.seenExcept('w2l3', twice) } });
  await toMap(page);
  await openLevel(page, 'w2l3');
  await begin(page);
  const item = await gotoItem(page, twice);
  t.must(item, 'the mission has no "two times" item');
  const before = (await getState(page)).trials.length;
  await listen(page);
  const id = item.expect[0][0];
  await page.click(`.obj[data-id="${id}"]`);
  await page.click(`.obj[data-id="${id}"]`);
  t.check((await badges(page, id)) === 2, `two taps on one object should show two badges, shows ${await badges(page, id)}`);
  await page.click('.btn-done');
  await waitTrials(page, before + 1);
  const tr = await lastTrial(page);
  t.check(tr.c1 === 1, `"${item.say}" answered with two taps should pass: got ${JSON.stringify(brief(tr))}`);
});

// ---------------------------------------------------------------------------------------------
scenario('07 "do nothing" level (w5l1): hand button, false alarm, no response, quota', async (t) => {
  const { page } = await t.open();
  await toMap(page);
  await openLevel(page, 'w5l1');
  await begin(page);
  await waitPhase(page, 'ready');
  t.check(await page.locator('.btn-hand').isVisible(), 'the hand button should be visible on w5l1');
  t.check(await disabled(page, '.btn-hand'), 'the hand should be disabled until the voice has finished');
  const used = {};
  const want = [];
  for (let i = 0; i < 6; i++) {
    await listen(page);
    const item = await curItem(page);
    if (!item.expect.length && !used.pass) { used.pass = 1; await page.click('.btn-hand'); want.push([1, 0, '']); }
    else if (!item.expect.length && !used.alarm) {
      used.alarm = 1;
      await page.click(`.obj[data-id="${item.scene.objects[0].id}"]`);
      await listen(page);
      await page.click('.btn-hand');
      want.push([0, 1, 'false-alarm']);
    } else if (item.expect.length && !used.none) {
      used.none = 1;
      await page.click('.btn-hand');
      await listen(page);
      await answer(page);
      want.push([0, 1, 'no-response']);
    } else { await answer(page); want.push([1, 0, '']); }
    await waitTrials(page, i + 1);
  }
  await page.waitForSelector('.screen.results', { timeout: 30000 });
  const got = (await getState(page)).trials.map(brief);
  t.check(used.pass && used.alarm && used.none, `the mission did not offer all three cases: ${JSON.stringify(used)}`);
  t.check(JSON.stringify(got) === JSON.stringify(want), `trial log is ${JSON.stringify(got)}, expected ${JSON.stringify(want)}`);

  const fresh = await t.open();
  const shapes = await fresh.page.evaluate(async () => {
    const out = [];
    for (let k = 0; k < 20; k++) {
      await globalThis.__lwm.go('mission', { levelId: 'w5l1' });
      out.push(globalThis.__lwm.debug.mission.items.map((it) => (it.expect.length ? 'g' : 'N')).join(''));
    }
    return out;
  });
  const bad = shapes.filter((s) => s.length !== 6 || s.replace(/g/g, '').length !== 2);
  t.check(bad.length === 0, `missions without exactly 2 no-go items out of 6: ${bad.join(' ')}`);
  const kinds = new Set(shapes);
  t.check(kinds.size >= 4, `no-go items sit in too few different positions over 20 missions: ${[...kinds].join(' ')}`);
  t.note(`${kinds.size} different go/no-go layouts in 20 missions; ${shapes.filter((s) => s.includes('NN')).length} with two no-go items in a row`);
});

// ---------------------------------------------------------------------------------------------
scenario('08 hidden-cards level (w2l4): covered while listening, uncovered to answer and on the retry', async (t) => {
  const { page } = await t.open();
  await toMap(page);
  await openLevel(page, 'w2l4');
  await H.recordPhases(page);
  await begin(page);
  await waitPhase(page, 'ready');
  const art = await page.evaluate(() => getComputedStyle(document.querySelector('.board .obj-art')).visibility);
  t.check(art === 'hidden', 'in the ready phase the pictures should be hidden');
  await listen(page);
  t.check((await page.evaluate(() => getComputedStyle(document.querySelector('.board .obj-art')).visibility)) === 'visible', 'in the respond phase the pictures should be visible');
  await answer(page, { wrong: true });
  await waitPhase(page, 'ready');
  t.check((await page.evaluate(() => getComputedStyle(document.querySelector('.board .obj-art')).visibility)) === 'visible', 'after a miss the pictures should stay face-up for the retry');
  await listen(page);
  await answer(page);
  await waitTrials(page, 1);
  const log = (await H.phaseLog(page)).filter((e, i, a) => i === 0 || e.p !== a[i - 1].p).map((e) => `${e.p}:${e.covered ? 'covered' : 'open'}`);
  const want = ['ready:covered', 'listening:covered', 'respond:open', 'feedback:open', 'ready:open', 'listening:open', 'respond:open'];
  t.check(JSON.stringify(log.slice(0, 7)) === JSON.stringify(want), `phase/cover sequence was ${log.slice(0, 8).join(' > ')}`);
});

// ---------------------------------------------------------------------------------------------
scenario('09 early taps with real audio: a spoken reminder, nothing submitted; leaving mid-sentence resumes the trial', async (t) => {
  const have = H.loadItems('w1l1').filter(H.clipExists).length;
  if (have < 6) return t.skip(`only ${have} of the level-1 clips exist yet`);
  const { page } = await t.open({ query: 'nosw=1', state: { ...OPEN, seen: H.seenExcept('w1l1', H.clipExists) } });
  await toMap(page);
  await openLevel(page, 'w1l1');
  await begin(page);
  const item = await curItem(page);
  await page.click('.btn-listen', { force: true });
  await waitPhase(page, 'listening', 3000);
  await page.click(`.obj[data-id="${item.expect[0][0]}"]`, { force: true });
  const mid = await page.evaluate(() => ({ phase: document.querySelector('.mission').dataset.phase, trials: globalThis.__lwm.store.get().trials.length,
    mood: document.querySelector('.guide-col .guide').dataset.mood }));
  t.check(mid.phase === 'feedback', `the early tap should stop the instruction for the reminder (phase was ${mid.phase})`);
  t.check(mid.trials === 0, 'an early tap must not submit an answer');
  t.check(mid.mood === 'wait', `the guide should calmly show "wait" (mood was ${mid.mood})`);
  // the reminder is a real clip of a few seconds; afterwards he is back at the ear, nothing answered or marked
  await sleep(1200);
  t.check((await page.evaluate(() => document.querySelector('.mission').dataset.phase)) === 'feedback', 'the reminder should take a moment to say (it is spoken, not skipped)');
  await waitPhase(page, 'ready', 15000);
  t.check((await getState(page)).trials.length === 0 && (await badges(page)) === 0, 'after the reminder nothing should be answered or marked');
  await listen(page);
  await answer(page);
  await waitTrials(page, 1);
  const tr = await lastTrial(page);
  t.check(tr.et === 1 && tr.c1 === 1 && tr.rp === 0, `expected et=1, c1=1 and no replay counted, got et=${tr.et} c1=${tr.c1} rp=${tr.rp}`);

  // with the reminder switched off the voice just carries on
  await page.evaluate(() => globalThis.__lwm.store.update((s) => { s.settings.earlyReminder = false; }));
  await waitPhase(page, 'ready', 30000);
  const quiet = await curItem(page);
  await page.click('.btn-listen', { force: true });
  await waitPhase(page, 'listening', 3000);
  await page.click(`.obj[data-id="${quiet.scene.objects[0].id}"]`, { force: true });
  t.check((await page.evaluate(() => document.querySelector('.mission').dataset.phase)) === 'listening', 'with the reminder off, an early tap should not stop the voice');
  await waitPhase(page, 'respond');
  await answer(page);
  await waitTrials(page, 2);
  await page.evaluate(() => globalThis.__lwm.store.update((s) => { s.settings.earlyReminder = true; }));

  // trial 2: leave while the voice is talking, then keep playing
  await waitPhase(page, 'ready', 30000);
  const second = await curItem(page);
  await page.click('.btn-listen', { force: true });
  await waitPhase(page, 'listening', 3000);
  await page.click('.hud .icon-btn');
  await page.waitForSelector('.overlay .panel.small');
  await page.click('.overlay .btn:has-text("Keep playing")');
  await sleep(300);
  const back = await page.evaluate(() => ({ phase: document.querySelector('.mission').dataset.phase, id: globalThis.__lwm.debug.item.id }));
  t.check(back.id === second.id && back.phase === 'ready', `after "Keep playing" mid-sentence expected the same trial waiting at the ear, got ${JSON.stringify(back)}`);
  await listen(page);
  await answer(page);
  await waitTrials(page, 3);
  t.check((await lastTrial(page)).i === second.id, 'the resumed trial should be the one that was interrupted');
});

// ---------------------------------------------------------------------------------------------
scenario('10 "Again": clears taps, is counted, stops after 2', async (t) => {
  const { page } = await t.open();
  await toMap(page);
  await openLevel(page, 'w2l1');
  await begin(page);
  await listen(page);
  const item = await curItem(page);
  t.check((await page.textContent('.btn-listen .btn-label')) === 'Again', 'the ear button should turn into "Again" while answering');
  await page.click(`.obj[data-id="${item.expect[0][0]}"]`);
  t.check((await badges(page)) === 1, 'one tap should show one badge');
  await page.click('.btn-listen');
  await waitPhase(page, 'respond');
  t.check((await badges(page)) === 0 && await disabled(page, '.btn-done'), 'a replay should clear the taps made so far');
  t.check(!(await disabled(page, '.btn-listen')), 'a second replay should still be allowed');
  await page.click('.btn-listen');
  await waitPhase(page, 'respond');
  t.check(await disabled(page, '.btn-listen'), 'the Again button should be disabled after 2 replays');
  await answer(page);
  await waitTrials(page, 1);
  const tr = await lastTrial(page);
  t.check(tr.rp === 2 && tr.c1 === 1, `expected rp=2 and c1=1, got rp=${tr.rp} c1=${tr.c1}`);
  await waitPhase(page, 'ready');
  t.check(!(await disabled(page, '.btn-listen')), 'the ear should be enabled again on the next trial');
});

// ---------------------------------------------------------------------------------------------
scenario('11 leaving: Keep playing resumes, Leave returns to the map', async (t) => {
  const { page } = await t.open();
  await toMap(page);
  await openLevel(page, 'w1l1');
  await begin(page);
  await listen(page);
  await answer(page);
  await waitTrials(page, 1);
  await listen(page);
  const item = await curItem(page);
  await page.click('.hud .icon-btn');
  await page.waitForSelector('.overlay .panel.small');
  await page.click('.overlay .btn:has-text("Keep playing")');
  const st = await page.evaluate(() => ({ overlay: !!document.querySelector('.overlay'), phase: document.querySelector('.mission').dataset.phase, id: globalThis.__lwm.debug.item.id }));
  t.check(!st.overlay && st.phase === 'respond' && st.id === item.id, `"Keep playing" should resume the same trial: ${JSON.stringify(st)}`);
  await answer(page);
  await waitTrials(page, 2);
  t.check((await lastTrial(page)).i === item.id, 'the answer after resuming should count for the same item');
  await waitPhase(page, 'ready');
  await page.click('.hud .icon-btn');
  await page.click('.overlay .btn:has-text("Leave")');
  await page.waitForSelector('.screen.map', { timeout: 5000 });
  const s = await getState(page);
  t.check(!s.levels.w1l1 && s.missions.length === 0, 'an abandoned mission must not be recorded as played');
  t.check((await page.locator('.mission').count()) === 0, 'the mission screen should be gone');
});

// ---------------------------------------------------------------------------------------------
scenario('12 parent area: PIN, settings, backup / erase / restore', async (t) => {
  const progress = { ...OPEN, xp: 95, cards: ['g-shield-blue'], levels: { w1l1: { stars: 3, plays: 1, best: 6, last: 1 } } };
  const { page } = await t.open({ state: progress });
  await toMap(page);
  // First time: a sum only a grown-up can do, then choose a PIN (typed twice).
  await page.click('[data-open="parent"]');
  await page.waitForSelector('.gate');
  const [, a, b] = (await page.textContent('.gate')).match(/(\d+)\s*×\s*(\d+)/).map(Number);
  await page.fill('.gate-input', String(a * b + 1));
  await page.click('.gate button[type="submit"]');
  t.check((await page.locator('.gate-input').count()) === 1 && ((await page.textContent('.gate-msg')) || '').length > 0, 'a wrong answer to the sum should be rejected with a message');
  await page.fill('.gate-input', String(a * b));
  await page.click('.gate button[type="submit"]');
  await H.typePin(page, '246810');
  await H.typePin(page, '135790'); // does not match the first entry
  t.check(!(await getState(page)).admin.hash, 'a PIN that was not repeated correctly must not be saved');
  await H.typePin(page, '246810');
  await H.typePin(page, '246810');
  t.must(await page.waitForSelector('.tabs:not([hidden])', { timeout: 3000 }).then(() => true, () => false), 'choosing a PIN did not open the parent area');
  const saved = await getState(page);
  t.check(saved.admin.hash.length > 20 && !JSON.stringify(saved).includes('246810'), 'only a hash of the PIN may be stored');
  // Coming back asks for the PIN; a wrong one stays shut.
  await page.click('.sub-head .icon-btn');
  await page.waitForSelector('.screen.map');
  await page.click('[data-open="parent"]');
  await H.typePin(page, '000000');
  t.check((await page.locator('.tabs:not([hidden])').count()) === 0 && /Wrong/.test((await page.textContent('.gate-msg')) || ''), 'a wrong PIN must not open the parent area');
  await H.typePin(page, '246810');
  await page.waitForSelector('.tabs:not([hidden])');
  await H.openTab(page, 'settings');

  const toggles = [['Sound effects', (s) => s.settings.sfx], ['Slower voice', (s) => s.settings.slowVoice],
    ['Lock for the day', (s) => s.settings.hardStop], ['Unlock every level', (s) => !!s.flags.unlockAll]];
  for (const [label, read] of toggles) {
    const before = !!read(await getState(page));
    await page.click(`label.setting:has-text("${label}") input`);
    const after = !!read(await getState(page));
    t.check(after === !before, `toggle "${label}" did not change the stored setting (${before} -> ${after})`);
    await page.click(`label.setting:has-text("${label}") input`);
    t.check(!!read(await getState(page)) === before, `toggle "${label}" did not switch back`);
  }
  await page.selectOption('label.setting select', '5');
  t.check((await getState(page)).settings.dailyMissions === 5, 'the "suggest stopping after" choice was not stored');

  await page.click('button:has-text("Make backup")');
  const text = await page.inputValue('.backup');
  t.must(text.length > 20 && JSON.parse(text).xp === 95, 'Make backup did not put the progress in the box');
  await page.click('[data-act="erase"]');
  t.check((await getState(page)).xp === 95, 'one tap on Erase must not erase yet');
  await page.click('[data-act="erase"]');
  const wiped = await getState(page);
  t.check(wiped.xp === 0 && !wiped.levels.w1l1 && wiped.cards.length === 0, 'two taps on Erase should wipe his progress');
  t.check(wiped.admin.hash === saved.admin.hash && wiped.settings.dailyMissions === 5, 'Erase must keep the PIN and the settings');
  t.check((await page.inputValue('.backup')) === text, 'the backup box must keep its text after Erase');
  await page.click('button:has-text("Restore")');
  let s = await getState(page);
  const restored = () => s.xp === 95 && s.levels.w1l1?.stars === 3 && s.cards.length === 1 && s.settings.dailyMissions === 5;
  t.check(restored(), 'Make backup -> Erase -> Restore did not bring the progress back');
  await page.reload();
  await page.waitForSelector('.screen.title .btn-huge');
  s = await getState(page);
  t.check(restored(), 'the restored progress did not survive a reload');
});

// ---------------------------------------------------------------------------------------------
scenario('13 every level is playable (robot plays one mission of each perfectly)', async (t) => {
  const queue = LEVELS.map((l) => l.id);
  let done = 0;
  const worker = async () => {
    let { page, log } = await t.open();
    await toMap(page);
    for (let id = queue.shift(); id; id = queue.shift()) {
      const errs = log.errors.length;
      try {
        await openLevel(page, id);
        await playMission(page);
        const stars = await page.locator('.big-star.on').count();
        if (stars !== 3) {
          const tr = (await getState(page)).trials.slice(-6).filter((x) => !x.c1).map((x) => `${x.i} (${x.e})`);
          t.check(false, `${id}: a perfect run gave ${stars} stars; items not accepted: ${tr.join(', ')}`);
        }
        await page.click('[data-act="map"]');
        await page.waitForSelector('.screen.map');
        done++;
      } catch (e) {
        const at = await page.evaluate(() => {
          const d = globalThis.__lwm.debug;
          return `screen ${d.screen}, phase ${document.querySelector('.mission')?.dataset.phase}, item ${d.item?.id} "${d.item?.say}" expect ${JSON.stringify(d.item?.expect)}`;
        }).catch(() => 'page gone');
        t.check(false, `${id}: ${String(e.message).split('\n')[0]} (${at})`);
        ({ page, log } = await t.open());
        await toMap(page);
      }
      if (log.errors.length > errs) t.check(false, `${id}: console errors: ${log.errors.slice(errs).join(' | ')}`);
    }
  };
  await Promise.all(Array.from({ length: 8 }, worker));
  t.check(done === LEVELS.length, `${done} of ${LEVELS.length} levels played through to 3 stars`);
});

// ---------------------------------------------------------------------------------------------
scenario('14 real audio: a whole mission on level 1 really plays the clips', async (t) => {
  const have = H.loadItems('w1l1').filter(H.clipExists).length;
  if (have < 6) return t.skip(`only ${have} of the level-1 clips exist yet`);
  const { page } = await t.open({ query: 'nosw=1', state: { ...OPEN, seen: H.seenExcept('w1l1', H.clipExists) } });
  await toMap(page);
  await openLevel(page, 'w1l1');
  await H.recordPhases(page);
  const items = await page.evaluate(() => globalThis.__lwm.debug.mission.items);
  t.must(items.every(H.clipExists), 'the mission picked an item whose clip is missing (test set-up)');
  const durations = await page.evaluate((urls) => Promise.all(urls.map((u) => new Promise((r) => {
    const a = new Audio(u);
    a.onloadedmetadata = () => r(a.duration);
    a.onerror = () => r(-1);
  }))), items.map((it) => `assets/audio/listening/${it.audio}`));
  await begin(page);
  for (let i = 0; i < items.length; i++) {
    await waitPhase(page, 'ready', 40000);
    await page.click('.btn-listen', { force: true });
    await waitPhase(page, 'respond', 30000);
    await answer(page);
  }
  await page.waitForSelector('.screen.results', { timeout: 40000 });
  const raw = await H.phaseLog(page);
  t.check(!raw.some((e) => e.caption), 'the fallback caption appeared: a clip did not play');
  const log = raw.filter((e, i, a) => i === 0 || e.p !== a[i - 1].p);
  const spans = [];
  for (let i = 0; i < log.length; i++) {
    if (log[i].p !== 'listening') continue;
    const end = log.slice(i + 1).find((e) => e.p === 'respond');
    if (end) spans.push(end.t - log[i].t);
  }
  t.check(spans.length === 6, `expected 6 listening phases, saw ${spans.length}`);
  spans.forEach((ms, i) => {
    const clip = durations[i] * 1000;
    t.check(clip > 300, `clip ${items[i].audio} has no readable duration`);
    t.check(ms >= clip * 0.9 + 250 && ms <= clip + 300 + 1500, `trial ${i + 1} "${items[i].say}": listening lasted ${Math.round(ms)} ms but the clip is ${Math.round(clip)} ms (+300 ms hold)`);
  });
  t.note(`listening phases ${spans.map((x) => Math.round(x)).join(', ')} ms for clips ${durations.map((d) => Math.round(d * 1000)).join(', ')} ms`);
  t.check((await page.locator('.big-star.on').count()) === 3, 'the real-audio mission should end with 3 stars');
});

// ---------------------------------------------------------------------------------------------
scenario('15 service worker: the app still works offline', async (t) => {
  // Its own server, which really stops answering: context.setOffline alone does not cut the worker's own requests.
  const own = await H.startServer();
  t.cleanup(() => own.close());
  const { page, ctx, log } = await t.open({ query: 'fast=1', server: own });
  const controlled = () => page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 8000 }).then(() => true, () => false);
  if (!(await controlled())) {
    await page.reload();
    t.must(await controlled(), 'no service worker took control of the page, even after a reload');
  }
  // The background download should have put the instruction clips in the cache a little after the first visit.
  const clips = H.loadItems('w1l1').filter(H.clipExists).map((it) => `assets/audio/listening/${it.audio}`);
  let warmed = false;
  for (let i = 0; i < 60 && !warmed; i++) {
    warmed = await page.evaluate(async (urls) => {
      for (const u of urls) if (!(await caches.match(u))) return false;
      return true;
    }, clips);
    if (!warmed) await sleep(500);
  }
  const offlineRun = async (query = 'fast=1') => {
    own.setDown(true);
    await ctx.setOffline(true);
    try {
      await page.goto(`${own.url}?${query}`, { timeout: 8000 });
      await page.waitForSelector('.screen.title .btn-huge', { timeout: 6000 });
      const net = await page.evaluate(() => fetch('tests/e2e/helpers.cjs', { cache: 'no-store' }).then((r) => `answered ${r.status}`, () => 'down'));
      if (net !== 'down') throw new Error(`the test could not cut the network (a request ${net})`);
      await toMap(page);
      await page.click('.map-foot .btn');
      await page.waitForSelector('.overlay.intro', { timeout: 6000 });
      await H.recordPhases(page);
      await begin(page);
      await listen(page);
      const heard = !(await H.phaseLog(page)).some((e) => e.caption);
      await answer(page);
      await waitTrials(page, 1);
      if (!query && !heard) throw new Error('offline with real sound the instruction clip did not play (the fallback caption showed)');
      return '';
    } catch (e) {
      return String(e.message).split('\n')[0];
    } finally {
      own.setDown(false);
      await ctx.setOffline(false);
    }
  };
  log.tolerate = (line) => /ERR_INTERNET_DISCONNECTED|ERR_FAILED|ERR_EMPTY_RESPONSE|ERR_CONNECTION|Failed to fetch|Failed to load resource/.test(line);
  const sw = fs.readFileSync(path.join(H.ROOT, 'sw.js'), 'utf8');
  const placeholder = !/const SHELL = \[[^\]]*src\/main\.js/.test(sw);
  let why = await offlineRun();
  if (!why) {
    if (!t.check(warmed, 'online for 30 s, the background download had still not cached the level-1 instruction clips')) return;
    const real = await offlineRun('');
    return void t.check(!real, `offline with real sound: ${real}`);
  }
  if (!placeholder) return void t.check(false, `offline run failed with the generated precache list: ${why}`);
  // sw.js still has the placeholder list (it is regenerated by the build). Fill the shell cache the way the
  // generated list would, to check the worker's own logic.
  const walk = (dir, keep) => (fs.existsSync(path.join(H.ROOT, dir)) ? fs.readdirSync(path.join(H.ROOT, dir)).flatMap((n) =>
    (fs.statSync(path.join(H.ROOT, dir, n)).isDirectory() ? walk(`${dir}/${n}`, keep) : keep(`${dir}/${n}`) ? [`${dir}/${n}`] : [])) : []);
  const files = ['./', 'index.html', 'manifest.webmanifest', ...walk('css', (f) => f.endsWith('.css')), ...walk('src', (f) => f.endsWith('.js')),
    ...walk('assets/icons', (f) => /\.(png|svg)$/.test(f)), ...walk('assets/data', (f) => f.endsWith('.json')), ...walk('assets/audio/ui', (f) => f.endsWith('.mp3'))];
  await page.goto(`${own.url}?fast=1`);
  await page.waitForSelector('.screen.title .btn-huge');
  await page.evaluate(async (list) => {
    const name = (await caches.keys()).find((k) => k.startsWith('shell-'));
    await (await caches.open(name)).addAll(list);
  }, files);
  const again = await offlineRun();
  if (again) t.check(false, `offline run failed even with a full shell cache simulated (${files.length} files): ${again}`);
  else t.skip(`sw.js still has the placeholder precache list (offline as-is fails: ${why}); with the full list simulated in the cache the offline run passes`);
});

// ---------------------------------------------------------------------------------------------
const VIEWPORTS = [[1180, 820], [820, 1180], [1366, 1024], [390, 844]];
const BUTTONS = '.controls .btn, .hud .icon-btn, .btn-huge, .map-foot .btn, .map-actions button, .overlay .btn, .result-buttons .btn, .chest, .sub-head .icon-btn';

/** Runs in the page: geometry problems of whatever is on screen. */
function layoutProblems(buttons) {
  const out = [];
  const W = innerWidth, H = innerHeight;
  const sw = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth);
  if (sw > W + 1) out.push(`document overflows horizontally (${sw}px wide in a ${W}px viewport)`);
  const shown = (el) => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none';
  };
  const box = (sel) => { const el = document.querySelector(sel); return el && shown(el) ? el.getBoundingClientRect() : null; };
  const r1 = (n) => Math.round(n);
  const board = box('.mission .board');
  if (board) {
    const hud = box('.hud'), controls = box('.controls'), guide = box('.guide-col .guide');
    if (hud && board.top < hud.bottom - 0.5) out.push(`board (top ${r1(board.top)}) overlaps the HUD (bottom ${r1(hud.bottom)})`);
    if (controls && board.bottom > controls.top + 0.5) out.push(`board (bottom ${r1(board.bottom)}) overlaps the controls bar (top ${r1(controls.top)})`);
    if (board.left < -0.5 || board.right > W + 0.5) out.push(`board sticks out sideways (${r1(board.left)}..${r1(board.right)} of ${W})`);
    if (guide && guide.right > board.left + 0.5 && guide.left < board.right - 0.5 && guide.bottom > board.top + 0.5 && guide.top < board.bottom - 0.5) out.push('board overlaps the guide');
    const small = [...document.querySelectorAll('.board .obj')].map((o) => o.getBoundingClientRect()).filter((r) => r.width < 56 || r.height < 56);
    if (small.length) out.push(`${small.length} object(s) smaller than 56px (smallest ${r1(Math.min(...small.map((r) => Math.min(r.width, r.height))))}px)`);
    const ctl = [...document.querySelectorAll('.controls .btn')].filter(shown).map((b) => b.getBoundingClientRect());
    for (let i = 0; i < ctl.length; i++) for (let j = i + 1; j < ctl.length; j++) {
      if (ctl[i].right > ctl[j].left + 0.5 && ctl[i].left < ctl[j].right - 0.5 && ctl[i].bottom > ctl[j].top + 0.5 && ctl[i].top < ctl[j].bottom - 0.5) out.push('two control buttons overlap');
    }
    if (ctl.length && Math.max(...ctl.map((r) => r.top)) - Math.min(...ctl.map((r) => r.top)) > 60) out.push('the control buttons wrap onto two rows');
  }
  for (const b of document.querySelectorAll(buttons)) {
    if (!shown(b)) continue;
    const r = b.getBoundingClientRect();
    if (r.left < -0.5 || r.top < -0.5 || r.right > W + 0.5 || r.bottom > H + 0.5) {
      out.push(`button "${(b.getAttribute('aria-label') || b.textContent || b.className).trim().slice(0, 24)}" is not fully inside the viewport (${r1(r.left)},${r1(r.top)} - ${r1(r.right)},${r1(r.bottom)} in ${W}x${H})`);
    }
  }
  return out;
}

scenario('16 layout at iPad landscape / portrait, large iPad and phone sizes', async (t) => {
  fs.mkdirSync(OUT, { recursive: true });
  const has = (n, cols) => (it) => it.scene.objects.length === n && (!cols || it.scene.cols === cols);
  const seen = { ...H.seenExcept('w1l5', has(8)), ...H.seenExcept('w3l4', has(5, 5)), ...H.seenExcept('w1l1', has(3)) };
  const run = async ([w, h]) => {
    const tag = `${w}x${h}`;
    // two missions already played today, so the results screen is at its fullest ("good place to stop" + card)
    const d = new Date();
    const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const state = { ...OPEN, seen, cards: ['g-shield-blue', 'g-sword-red', 'g-key-yellow'], days: { [today]: { missions: 2, trials: 12, ms: 1 } } };
    const { page } = await t.open({ viewport: { width: w, height: h }, state });
    const snap = async (name) => {
      await sleep(350); // let the short fade-ins finish so the picture shows the settled state
      await page.screenshot({ path: path.join(OUT, `${tag}-${name}.png`) });
      for (const p of await page.evaluate(layoutProblems, BUTTONS)) t.check(false, `${tag} ${name}: ${p}`);
    };
    const leave = async () => {
      await page.click('.hud .icon-btn');
      await page.click('.overlay .btn:has-text("Leave")');
      await page.waitForSelector('.screen.map');
    };
    const respondShot = async (level, name, pred, prep) => {
      await openLevel(page, level);
      await begin(page);
      const item = await gotoItem(page, pred);
      if (!item) { t.check(false, `${tag} ${name}: the mission offered no suitable item (test set-up)`); return leave(); }
      await listen(page);
      if (prep) await prep(item);
      await snap(name);
      await leave();
    };
    await snap('01-title');
    await toMap(page);
    await snap('02-map');
    await openLevel(page, 'w1l1');
    await page.waitForSelector('.overlay.intro .btn-primary:not([disabled])');
    await snap('03-intro');
    await begin(page);
    await snap('04-ready');
    await listen(page);
    await snap('05-respond-3');
    await answer(page);
    for (let i = 1; i < 6; i++) { await listen(page); await answer(page); }
    await page.waitForSelector('.screen.results', { timeout: 30000 });
    await sleep(1900); // the stars pop one by one
    await snap('10-results');
    await page.click('.chest', { force: true });
    await page.waitForSelector('.card-reveal .card', { state: 'visible' });
    await sleep(300);
    await snap('11-results-card');
    await page.click('[data-act="map"]');
    await page.waitForSelector('.screen.map');
    await openLevel(page, 'w2l4');
    await begin(page);
    await snap('04b-ready-covered');
    await leave();
    await respondShot('w1l5', '06-respond-8', has(8));
    await respondShot('w3l4', '07-respond-5-row', has(5, 5));
    await respondShot('w3l2', '08-pick-done-undo', (it) => it.mode === 'pick', (it) => page.click(`.obj[data-id="${it.expect[0][0]}"]`));
    await respondShot('w5l1', '09-hand', () => true);
    await page.click('[data-open="collection"]');
    await page.waitForSelector('.screen.collection');
    await snap('12-collection');
    await page.click('.sub-head .icon-btn');
    await page.waitForSelector('.screen.map');
    await page.click('[data-open="parent"]');
    await page.waitForSelector('.gate');
    const [, a, b] = (await page.textContent('.gate')).match(/(\d+)\s*×\s*(\d+)/).map(Number);
    await page.fill('.gate-input', String(a * b));
    await page.click('.gate button[type="submit"]');
    await page.waitForSelector('.pin-pad');
    await snap('13-parent-pin');
    await H.typePin(page, '246810');
    await H.typePin(page, '246810');
    await page.waitForSelector('.tabs:not([hidden])');
    await snap('14-parent-dashboard');
    for (const tab of ['rewards', 'chores', 'settings']) {
      await H.openTab(page, tab);
      await snap(`15-parent-${tab}`);
    }
  };
  const res = await Promise.allSettled(VIEWPORTS.map(run));
  res.forEach((r, i) => { if (r.status === 'rejected') t.check(false, `${VIEWPORTS[i].join('x')}: ${String(r.reason.message).split('\n')[0]}`); });
  t.note(`screenshots in ${path.relative(process.cwd(), OUT) || OUT}`);
});

// ---------------------------------------------------------------------------------------------
scenario('17 "lock for the day" is honoured everywhere', async (t) => {
  const { page } = await t.open();
  await page.evaluate(async () => {
    const { todayKey } = await import('./src/core/dom.js');
    globalThis.__lwm.store.update((s) => {
      s.settings.hardStop = true;
      s.settings.dailyMissions = 2;
      s.days[todayKey()] = { missions: 2, trials: 12, ms: 60000 };
    });
  });
  await toMap(page);
  await page.click('.map-foot .btn');
  await sleep(700);
  const started = (await page.locator('.mission').count()) > 0;
  t.check(!started, 'with "Lock for the day" on and today\'s missions used up, Play on the map still starts a mission');
  if (!started) return;
  await playMission(page);
  t.check((await page.locator('[data-act="next"], [data-act="again"]').count()) === 0, 'the locked results screen should only offer the map');
  t.check(await page.locator('.enough').isVisible(), 'the "that is all for today" message should show');
});

// ---------------------------------------------------------------------------------------------
scenario('18 rewards and chores: set up by a grown-up, earned by him, checked and handed out', async (t) => {
  const { page } = await t.open({ state: { flags: { welcomed: true } } });
  await toMap(page);
  t.check((await page.locator('[data-open="rewards"]').count()) === 0 && (await page.locator('[data-open="chores"]').count()) === 0,
    'Rewards and Chores buttons should not show before a grown-up has set any up');

  // --- the grown-up sets up a daily reward, a lifetime reward and a chore
  await H.openParent(page);
  await H.openTab(page, 'rewards');
  await page.fill('[data-form="daily"] input[type="text"]', 'Game time');
  await page.fill('[data-form="daily"] input[type="number"]', '1');
  await page.click('[data-form="daily"] button[type="submit"]');
  await page.fill('[data-form="tier"] input[type="text"]', 'Pizza night');
  await page.fill('[data-form="tier"] input[type="number"]', '100');
  await page.click('[data-form="tier"] button[type="submit"]');
  await H.openTab(page, 'chores');
  await page.fill('[data-form="chore"] input[type="text"] >> nth=0', 'Make your bed');
  await page.fill('[data-form="chore"] input[type="number"]', '40');
  await page.click('[data-form="chore"] button[type="submit"]');
  let s = await getState(page);
  t.must(s.rewards.daily.length === 1 && s.rewards.tiers.length === 1 && s.chores.list.length === 1, `set-up was not saved: ${JSON.stringify([s.rewards.daily, s.rewards.tiers, s.chores.list])}`);
  await page.click('.sub-head .icon-btn');
  await page.waitForSelector('.screen.map');
  t.check((await page.locator('[data-open="rewards"]').count()) === 1, 'the Rewards button should now be on the map');
  t.check(((await page.textContent('[data-open="chores"] .dot')) || '') === '1', 'the Chores button should show 1 chore to do');

  // --- he plays one mission: the daily reward (1 mission) is won, the 100-point tier is not yet (95 XP)
  await openLevel(page, 'camp1');
  await playMission(page);
  t.check(await page.locator('.won-box').isVisible() && /Game time/.test(await page.textContent('.won-box')), 'the results screen should announce the reward he won');
  s = await getState(page);
  t.check(s.rewards.earned.length === 1 && s.rewards.earned[0].src === 'daily' && !s.rewards.earned[0].given, `expected one daily reward waiting, got ${JSON.stringify(s.rewards.earned)}`);
  await page.click('[data-act="map"]');
  await page.waitForSelector('.screen.map');
  t.check(((await page.textContent('[data-open="rewards"] .dot')) || '') === '1', 'the Rewards button should show 1 reward waiting');

  // --- he does the chore and takes a photo
  await page.click('[data-open="chores"]');
  await page.waitForSelector('.screen.chores');
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAFklEQVQImWP8z8Dwn4EIwESMolGFCAAAOe4CAc0MZ4sAAAAASUVORK5CYII=', 'base64');
  const [chooser] = await Promise.all([page.waitForEvent('filechooser', { timeout: 5000 }), page.click('.chore-row [data-act="done"]')]);
  await chooser.setFiles({ name: 'bed.png', mimeType: 'image/png', buffer: png });
  await page.waitForSelector('.photo-panel [data-act="send"]', { timeout: 5000 });
  t.check(await page.locator('.photo-preview').isVisible(), 'he should see the photo before sending it');
  await page.click('.photo-panel [data-act="send"]');
  await page.waitForSelector('.chore-row.state-pending', { timeout: 5000 });
  s = await getState(page);
  t.check(s.chores.log.length === 1 && s.chores.log[0].status === 'pending' && !!s.chores.log[0].photo, `chore should be waiting with a photo: ${JSON.stringify(s.chores.log)}`);
  t.check(s.xp === 95, 'no chore points before a grown-up approves');
  await page.waitForSelector('.chore-row .thumb img', { timeout: 5000 }).catch(() => t.check(false, 'the saved photo should show as a thumbnail while waiting'));
  await page.click('.sub-head .icon-btn');
  await page.waitForSelector('.screen.map');
  t.check(((await page.textContent('[data-open="parent"] .dot')) || '') === '2', 'the parent button should flag 2 things to look at (1 chore to check, 1 reward to hand out)');

  // --- the grown-up checks the photo, approves, and hands out the rewards
  await H.openParent(page);
  await H.openTab(page, 'chores');
  await page.waitForSelector('.check-card img', { timeout: 5000 }).catch(() => t.check(false, 'the grown-up should see his photo'));
  await page.click('.check-card [data-act="approve"]');
  s = await getState(page);
  t.check(s.xp === 135 && s.chores.log[0].status === 'approved' && !s.chores.log[0].photo, `approval should add 40 points and drop the photo: xp ${s.xp}, ${JSON.stringify(s.chores.log[0])}`);
  t.check(s.rewards.earned.some((e) => e.src === 'tier' && e.title === 'Pizza night'), 'reaching 100 points through the chore should win the lifetime reward');
  await H.openTab(page, 'rewards');
  t.check((await page.locator('[data-earned]').count()) === 2, 'two rewards should be waiting to be handed out');
  await page.click('[data-earned] >> nth=0 >> button');
  await page.click('[data-earned] >> nth=0 >> button');
  s = await getState(page);
  t.check(s.rewards.earned.every((e) => e.given), 'marking as given should clear the list');

  // --- back on his side: nothing waiting, the chore is done for today, stamps say "Got it"
  await page.click('.sub-head .icon-btn');
  await page.waitForSelector('.screen.map');
  t.check((await page.locator('[data-open="rewards"] .dot').count()) === 0 && (await page.locator('[data-open="chores"] .dot').count()) === 0, 'no badges should be left');
  await page.click('[data-open="rewards"]');
  await page.waitForSelector('.screen.rewards');
  t.check((await page.locator('.stamp.given').count()) === 2, 'both rewards should show as received');
  await page.click('.sub-head .icon-btn');
  await page.click('[data-open="chores"]');
  await page.waitForSelector('.chore-row.state-approved');

  // --- a second mission the same day on the now-perfected level does not count again
  await page.click('.sub-head .icon-btn');
  await openLevel(page, 'camp1');
  await playMission(page);
  s = await getState(page);
  const today = Object.values(s.days)[0];
  t.check(today.missions === 2 && today.counted === 1, `a repeat of a 3-star level should not count toward rewards: ${JSON.stringify(today)}`);
  t.check((await page.locator('.won-box').count()) === 0, 'no reward should be announced for the repeat');
});

// ---------------------------------------------------------------------------------------------
scenario('19 expectations: set by a grown-up, ticked by him, rewards locked until they are done', async (t) => {
  const { page } = await t.open({ state: { flags: { welcomed: true } } });
  await toMap(page);
  t.check((await page.locator('[data-open="expectations"]').count()) === 0, 'no Expectations button before a grown-up adds any');

  await H.openParent(page);
  await H.openTab(page, 'rewards');
  await page.fill('[data-form="daily"] input[type="text"]', 'Game time');
  await page.fill('[data-form="daily"] input[type="number"]', '1');
  await page.click('[data-form="daily"] button[type="submit"]');
  await H.openTab(page, 'expectations');
  for (const title of ['Brush your teeth', 'Pack your bag']) {
    await page.fill('[data-form="expect"] input[type="text"]', title);
    await page.click('[data-form="expect"] button[type="submit"]');
  }
  let s = await getState(page);
  t.must(s.expectations.list.length === 2, `expectations were not saved: ${JSON.stringify(s.expectations)}`);
  const [e1, e2] = s.expectations.list.map((e) => e.id);
  await page.click('.sub-head .icon-btn');
  await page.waitForSelector('.screen.map');
  t.check(((await page.textContent('[data-open="expectations"] .dot')) || '') === '2', 'the Expectations button should show 2 left to do');

  // he wins a reward, but it is locked
  await openLevel(page, 'camp1');
  await playMission(page);
  t.check(/Finish your expectations/.test((await page.textContent('.won-box')) || ''), 'the results screen should say the reward is locked until the expectations are done');
  await page.click('[data-act="map"]');
  await page.waitForSelector('.screen.map');
  await page.click('[data-open="rewards"]');
  await page.waitForSelector('.screen.rewards');
  t.check(await page.locator('.lock-panel').isVisible() && (await page.locator('.reward-row').count()) === 0, 'Rewards should be locked and show nothing while expectations are open');

  // he ticks them off
  await page.click('.lock-panel [data-open="expectations"]');
  await page.waitForSelector('.screen.expectations');
  await page.click(`[data-expect="${e1}"] [data-act="tick"]`);
  s = await getState(page);
  t.check(Object.values(s.expectations.days)[0][e1] === 'done', 'his tick should be stored for today');
  t.check((await page.locator('.all-done').count()) === 0, 'one of two is not "all done"');
  await page.click(`[data-expect="${e2}"] [data-act="tick"]`);
  await page.waitForSelector('.all-done');
  await page.click('.all-done [data-open="rewards"]');
  await page.waitForSelector('.screen.rewards');
  t.check((await page.locator('.lock-panel').count()) === 0 && (await page.locator('.reward-row').count()) >= 1, 'Rewards should open once every expectation is done');

  // taking a tick back locks them again
  await page.click('.sub-head .icon-btn');
  await page.click('[data-open="expectations"]');
  await page.click(`[data-expect="${e2}"] [data-act="tick"]`);
  await page.click('.sub-head .icon-btn');
  await page.click('[data-open="rewards"]');
  t.check(await page.locator('.lock-panel').isVisible(), 'un-ticking should lock Rewards again');

  // "needs my OK": his tick only asks; the grown-up confirms
  await page.click('.sub-head .icon-btn');
  await H.openParent(page);
  await H.openTab(page, 'rewards');
  t.check((await page.locator('[data-note="locked"]').count()) === 1, 'the grown-up should be told the rewards are locked today');
  await H.openTab(page, 'expectations');
  await page.click('label.setting:has-text("needs my OK") input');
  await page.click('.sub-head .icon-btn');
  await page.click('[data-open="expectations"]');
  await page.click(`[data-expect="${e2}"] [data-act="tick"]`);
  s = await getState(page);
  t.check(Object.values(s.expectations.days)[0][e2] === 'pending', 'with "needs my OK" his tick should only be waiting');
  await page.click('.sub-head .icon-btn');
  t.check(((await page.textContent('[data-open="parent"] .dot')) || '') === '2', 'the parent button should flag the tick to confirm (plus the reward to hand out)');
  await H.openParent(page);
  await H.openTab(page, 'expectations');
  await page.click(`[data-expect="${e2}"] [data-act="ok"]`);
  s = await getState(page);
  t.check(Object.values(s.expectations.days)[0][e2] === 'done', 'the grown-up\'s OK should mark it done');
  await page.click('.sub-head .icon-btn');
  await page.click('[data-open="rewards"]');
  await page.waitForSelector('.screen.rewards');
  t.check((await page.locator('.lock-panel').count()) === 0, 'Rewards should be open after the grown-up confirms');
});

// ---------------------------------------------------------------------------------------------
scenario('20 touching too soon: noticed on the switched-off buttons and between the things, never after the voice has finished', async (t) => {
  // (a) The short pause between the end of the sentence and "go": a touch there is NOT too early.
  //     (fast audio: the "voice" is over after 30 ms; pack5 then waits 600 ms)
  {
    const { page } = await t.open();
    await toMap(page);
    await openLevel(page, 'pack5');
    await begin(page);
    await H.recordPhases(page);
    await page.click('.btn-listen', { force: true });
    await sleep(200);
    t.check((await H.phase(page)) === 'listening', 'expected to be in the pause before "go"');
    await page.click('.put-thing', { force: true });
    const box = await page.locator('.board-wrap').boundingBox();
    await page.mouse.click(box.x + 4, box.y + 4);
    await waitPhase(page, 'respond');
    t.check(!(await H.phaseLog(page)).some((e) => e.p === 'feedback'), 'a touch after the voice has finished must not bring the "please listen" reminder');
    await answer(page);
    await waitTrials(page, 1);
    const tr = await lastTrial(page);
    t.check(tr.et === 0 && tr.c1 === 1, `expected no early touch counted and a right answer, got et=${tr.et} c1=${tr.c1}`);
  }

  // (b) While the voice really is talking: a touch between the things, and a press on the hand
  //     (switched off, so it falls through to the bar), both bring the reminder.
  const have = H.loadItems('w5l1').filter(H.clipExists).length;
  if (have < 6) return t.note(`part (b) not run: only ${have} of the w5l1 clips exist yet`);
  const { page } = await t.open({ query: 'nosw=1', state: { ...OPEN, seen: H.seenExcept('w5l1', H.clipExists) } });
  await toMap(page);
  await openLevel(page, 'w5l1');
  await begin(page);
  // a point inside the play area that is on no thing
  const gap = await page.evaluate(() => {
    const r = document.querySelector('.board-wrap').getBoundingClientRect();
    for (let y = r.top + 3; y < r.bottom; y += 7) {
      for (let x = r.left + 3; x < r.right; x += 7) {
        const el = document.elementFromPoint(x, y);
        if (el && el.closest('.board-wrap') && !el.closest('button')) return { x, y };
      }
    }
    return null;
  });
  t.must(gap, 'no gap found in the play area');
  const centre = async (sel) => { const b = await page.locator(sel).boundingBox(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; };
  const hinted = () => page.evaluate(() => document.querySelector('.btn-listen').classList.contains('hint'));
  const state = () => page.evaluate(() => ({ phase: document.querySelector('.mission').dataset.phase, mood: document.querySelector('.guide-col .guide').dataset.mood }));

  // before the ear: both just point at the ear
  await page.mouse.click(gap.x, gap.y);
  t.check(await hinted(), 'a touch between the things before the ear should make the ear pulse');
  await sleep(900);
  const hand = await centre('.btn-hand');
  await page.mouse.click(hand.x, hand.y);
  t.check(await hinted(), 'pressing the switched-off hand before the ear should make the ear pulse');
  t.check((await getState(page)).trials.length === 0, 'nothing may be answered by those touches');

  for (const [what, at] of [['a touch between the things', gap], ['a press on the hand', hand]]) {
    await waitPhase(page, 'ready', 20000);
    await page.click('.btn-listen', { force: true });
    await waitPhase(page, 'listening', 3000);
    await sleep(250);
    await page.mouse.click(at.x, at.y);
    const now = await state();
    t.check(now.phase === 'feedback' && now.mood === 'wait', `${what} while the voice talks should bring the reminder (got ${JSON.stringify(now)})`);
  }
  await waitPhase(page, 'ready', 20000);
  await listen(page);
  await answer(page);
  await waitTrials(page, 1);
  const tr = await lastTrial(page);
  t.check(tr.et === 2 && tr.c1 === 1, `expected two early touches counted and the turn still right first time, got et=${tr.et} c1=${tr.c1}`);
});

// ---------------------------------------------------------------------------------------------
scenario('21 small things: Undo puts down what he holds, the "leave?" box holds the demonstration, the Starter drawer scrolls into view', async (t) => {
  // Move and Pack: with a thing in his hand, the back arrow only puts it down
  {
    const { page } = await t.open();
    await toMap(page);
    await openLevel(page, 'pack3');
    await begin(page);
    await listen(page);
    const item = await curItem(page);
    const [a, b] = item.scene.objects;
    const packed = () => page.locator('.put-zone .put-thing').count();
    await page.click(`.put-thing[data-id="${a.id}"]`);
    await page.click(`.put-zone[data-place="${item.scene.places[0].id}"]`, { position: { x: 12, y: 12 } });
    t.check((await packed()) === 1, 'one thing should be packed');
    await page.click(`.put-thing[data-id="${b.id}"]`); // lifted, not yet put anywhere
    await page.click('.btn-undo');
    t.check((await packed()) === 1, 'Undo with a thing in his hand should only put it down, not unpack the thing before it');
    await page.click('.btn-undo');
    t.check((await packed()) === 0, 'the next Undo should take the packed thing back out');
  }

  // "Leave this mission?" opened during the demonstration: nothing moves on behind the box
  {
    const { page } = await t.open();
    await toMap(page);
    await openLevel(page, 'w1l1');
    await begin(page);
    await listen(page);
    const item = await answer(page, { wrong: true });
    await listen(page);
    await answer(page, { wrong: true });
    await page.click('.hud .icon-btn');
    await page.waitForSelector('.overlay .panel.small');
    await sleep(3000);
    t.check((await curItem(page)).id === item.id, 'the game must not move on to the next turn behind the "leave?" box');
    await page.click('.overlay .btn:has-text("Keep playing")');
    await page.waitForFunction((id) => globalThis.__lwm.debug.item.id !== id, item.id, { timeout: 20000 });
    await waitPhase(page, 'ready');
    t.check((await getState(page)).trials.length === 1, 'the missed turn should be recorded once');
  }

  // The map: opening the Starter drawer brings its levels into view, and the handle is big enough to hit
  {
    const { page } = await t.open();
    await toMap(page);
    const summary = page.locator('details.starter summary');
    await summary.scrollIntoViewIfNeeded();
    t.check((await summary.boundingBox()).height >= 60, `the Starter handle should be at least 60 px high (is ${(await summary.boundingBox()).height})`);
    await summary.click();
    await sleep(1200);
    const view = page.viewportSize();
    const first = await page.locator('details.starter .level-node').first().boundingBox();
    t.check(first.y >= 0 && first.y + first.height <= view.height, `the first Starter level should be fully on screen after opening the drawer (top ${Math.round(first.y)}, height ${Math.round(first.height)}, screen ${view.height})`);
  }
});

// ---------------------------------------------------------------------------------------------
async function main() {
  const filters = process.argv.slice(2).map((a) => a.toLowerCase());
  const wanted = scenarios.filter((s) => !filters.length || filters.some((f) => (/^\d+$/.test(f) ? s.name.startsWith(f.padStart(2, '0')) : s.name.toLowerCase().includes(f))));
  if (!wanted.length) { console.error(`no scenario matches "${filters.join(' ')}"`); process.exit(2); }
  const server = await H.startServer();
  const browser = await chromium.launch();
  const started = Date.now();
  const tally = { PASS: 0, FAIL: 0, SKIP: 0 };
  const missing = new Set();
  for (const sc of wanted) {
    const fails = [], notes = [], opened = [], cleanups = [];
    let skipped = '';
    const t = {
      server,
      check: (ok, msg) => { if (!ok) fails.push(msg); return !!ok; },
      must: (ok, msg) => { if (!ok) throw new Error(msg); },
      note: (msg) => notes.push(msg),
      skip: (msg) => { skipped = msg; },
      cleanup: (fn) => cleanups.push(fn),
      open: async ({ server: own, ...opts } = {}) => {
        const o = await H.openPage(browser, own || server, { state: OPEN, ...opts });
        opened.push(o);
        return o;
      },
    };
    const t0 = Date.now();
    try {
      await sc.fn(t);
    } catch (e) {
      fails.push(`stopped: ${String(e.message).split('\n')[0]}`);
    }
    for (const o of opened) {
      for (const e of new Set(o.log.errors)) fails.push(`console: ${e}`);
      for (const m of o.log.missingClips) missing.add(m);
      await o.ctx.close().catch(() => {});
    }
    for (const fn of cleanups) fn();
    const status = fails.length ? 'FAIL' : skipped ? 'SKIP' : 'PASS';
    tally[status]++;
    console.log(`${status}  ${sc.name}  (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
    if (skipped) console.log(`      skipped: ${skipped}`);
    for (const f of [...new Set(fails)]) console.log(`      - ${f}`);
    for (const n of notes) console.log(`      note: ${n}`);
  }
  await browser.close();
  server.close();
  if (missing.size) {
    const ui = [...missing].filter((m) => m.includes('/audio/ui/')).length;
    console.log(`\nnote: ${missing.size} voice clip(s) were requested but are not on disk yet (${ui} guide lines in assets/audio/ui, ${missing.size - ui} instructions).`);
  }
  console.log(`\n${tally.PASS} passed, ${tally.FAIL} failed, ${tally.SKIP} skipped in ${((Date.now() - started) / 1000).toFixed(0)}s`);
  process.exit(tally.FAIL ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
