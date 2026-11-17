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
  await page.click('[data-act="erase"]'); // straight after: the tail of a double tap
  t.check((await getState(page)).xp === 95, 'a double tap on Erase must not erase either: the second press only counts after a moment');
  await sleep(800);
  await page.click('[data-act="erase"]');
  const wiped = await getState(page);
  t.check(wiped.xp === 0 && !wiped.levels.w1l1 && wiped.cards.length === 0, 'two taps on Erase should wipe his progress');
  t.check(/erased/.test((await page.textContent('.backup-said')) || ''), 'Erase should say what it did');
  t.check(!('admin' in JSON.parse(text)) && !text.includes(saved.admin.hash), 'a backup must not carry the PIN - not even its hash');
  t.check(wiped.admin.hash === saved.admin.hash && wiped.settings.dailyMissions === 5, 'Erase must keep the PIN and the settings');
  t.check((await page.inputValue('.backup')) === text, 'the backup box must keep its text after Erase');
  await page.click('button:has-text("Restore")');
  let s = await getState(page);
  const restored = () => s.xp === 95 && s.levels.w1l1?.stars === 3 && s.cards.length === 1 && s.settings.dailyMissions === 5;
  t.check(restored(), 'Make backup -> Erase -> Restore did not bring the progress back');
  t.check(s.admin.hash === saved.admin.hash && /restored/.test((await page.textContent('.backup-said')) || ''), 'Restore must leave this device\'s PIN alone, and say that it worked');
  // an older backup that still carries a PIN (or one without any) must not replace or remove this device's PIN
  await page.fill('.backup', JSON.stringify({ ...JSON.parse(text), admin: { hash: 'someone-elses-hash', salt: 'x', tries: 0, lockUntil: 0 } }));
  await page.click('button:has-text("Restore")');
  t.check((await getState(page)).admin.hash === saved.admin.hash, 'a backup that carries another PIN must not replace this device\'s PIN');
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
  await H.rewardsPart(page, 'daily');
  await page.fill('[data-form="daily"] input[type="text"]', 'Game time');
  await page.fill('[data-form="daily"] input[type="number"]', '1');
  await page.click('[data-form="daily"] button[type="submit"]');
  await H.rewardsPart(page, 'mine');
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
  await page.click('[data-earned] >> nth=0 >> button'); // straight after: the tail of a double tap - by now the NEXT reward sits under the finger
  s = await getState(page);
  t.check(s.rewards.earned.filter((e) => e.given).length === 1, 'a double tap on Given must hand out one reward - not the next one as well');
  await sleep(600);
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
  await H.rewardsPart(page, 'daily');
  await page.fill('[data-form="daily"] input[type="text"]', 'Game time');
  await page.fill('[data-form="daily"] input[type="number"]', '1');
  await page.click('[data-form="daily"] button[type="submit"]');
  await H.rewardsPart(page, 'mine');
  for (const [title, points] of [['Sticker', 10], ['Trampoline park', 5000]]) { // two rewards in his mine: one he reaches with his first mission, one far ahead
    await page.fill('[data-form="tier"] input[type="text"]', title);
    await page.fill('[data-form="tier"] input[type="number"]', String(points));
    await page.click('[data-form="tier"] button[type="submit"]');
    await page.waitForFunction((n) => globalThis.__lwm.store.get().rewards.tiers.some((x) => x.title === n), title);
  }
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
  t.check(await page.locator('.lock-panel').isVisible() && (await page.locator('.reward-row').count()) === 0, 'Rewards should be locked while expectations are open: nothing to collect, no goals for today');
  // ... but he may always look at his mine: where he is, what he has found, what lies ahead
  t.check((await page.locator('.mine .rung').count()) === 2, 'his mine should be there to look at while the expectations are open');
  t.check((await page.locator('.mine .rung.is-won .stamp.waits').count()) === 1 && !/WON/.test((await page.textContent('.mine')) || ''), 'a reward he has reached should show as found with a lock, not as won');
  t.check((await page.locator('.mine .mine-step.is-won .mine-ore.is-found').count()) === 1, 'its ore should be shown as found');
  await page.click('.mine .rung.is-next');
  await page.waitForSelector('.rung-detail');
  t.check(/Trampoline park/.test(await page.textContent('.rung-detail')), 'tapping the reward he is working towards should show it large');
  await page.click('.rung-detail [data-act="close"]');
  t.check((await getState(page)).rewards.earned.every((e) => !e.given), 'looking must not hand anything out');

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
  t.check((await page.locator('.mine .rung.is-won .stamp:not(.waits)').count()) === 1 && (await page.locator('.stamp.waits').count()) === 0, 'and the reward he found should now show as won');

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
  t.check(((await page.textContent('[data-open="parent"] .dot')) || '') === '3', 'the parent button should flag the tick to confirm (plus the two rewards to hand out: the daily one and the one from his mine)');
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
scenario('22 a grown-up edits rewards, chores and expectations (name, description, picture); he sees the reward mine and can look ahead', async (t) => {
  const { page } = await t.open({ state: { flags: { welcomed: true }, xp: 463 } });
  await toMap(page);
  await H.openParent(page);
  const png = fs.readFileSync(path.join(H.ROOT, 'assets', 'icons', 'icon-192.png'));
  const rowOf = (title) => page.locator(`.admin-row:not([data-earned]):has(b:text-is("${title}"))`);

  // --- the reward mine: three rewards, one with a description, one with a picture
  await H.openTab(page, 'rewards');
  const addTier = async (title, points, note) => {
    await page.fill('[data-form="tier"] input[type="text"]', title);
    await page.fill('[data-form="tier"] input[type="number"]', String(points));
    if (note) await page.fill('[data-form="tier"] textarea', note);
    await page.click('[data-form="tier"] button[type="submit"]');
    await rowOf(title).waitFor();
  };
  await addTier('Coins', 2000);
  await addTier('New skin pack', 400, 'Any pack you like');
  await page.fill('[data-form="tier"] input[type="text"]', 'New mount');
  await page.fill('[data-form="tier"] input[type="number"]', '800');
  const [chooser] = await Promise.all([page.waitForEvent('filechooser', { timeout: 5000 }), page.click('[data-form="tier"] [data-act="picture"]')]);
  await chooser.setFiles({ name: 'mount.png', mimeType: 'image/png', buffer: png });
  await page.waitForSelector('[data-form="tier"] .pic-preview.has-photo img');
  await page.click('[data-form="tier"] button[type="submit"]');
  await rowOf('New mount').waitFor();
  let s = await getState(page);
  const order = () => page.locator('[data-section="mine"] .admin-row b').allTextContents();
  t.check((await order()).join() === 'New skin pack,New mount,Coins', `the steps should be listed in order of points (got ${await order()})`);
  t.check(s.rewards.tiers.find((x) => x.title === 'New skin pack').note === 'Any pack you like', 'the description should be saved');
  const mount = s.rewards.tiers.find((x) => x.title === 'New mount');
  t.check(typeof mount.photo === 'string' && mount.photo.length > 4, 'the picture should be saved with the step');
  await rowOf('New mount').locator('.emoji.has-photo img').waitFor();
  t.check(s.rewards.earned.filter((e) => e.src === 'tier').map((e) => e.title).join() === 'New skin pack', 'a step he has already reached (400 of his 463 points) should be his at once, and only that one');
  t.check((await page.locator('[data-earned]').count()) === 1, 'it should wait under "To hand out"');

  // --- change one: new name, description, points; the owed reward follows the new name
  await rowOf('New skin pack').locator('[data-act="edit"]').click();
  t.check((await page.inputValue('[data-edit="tier"] input[type="text"]')) === 'New skin pack' && (await page.inputValue('[data-edit="tier"] textarea')) === 'Any pack you like',
    'the edit form should start with what was typed before');
  await page.fill('[data-edit="tier"] input[type="text"]', 'Skin pack of your choice');
  await page.fill('[data-edit="tier"] textarea', 'From the Hive shop');
  await page.click('[data-edit="tier"] button[type="submit"]');
  await rowOf('Skin pack of your choice').waitFor();
  s = await getState(page);
  t.check(s.rewards.tiers.length === 3 && s.rewards.tiers.some((x) => x.title === 'Skin pack of your choice' && x.note === 'From the Hive shop' && x.points === 400), 'the change should be saved in place (still three steps)');
  t.check(s.rewards.earned[0].title === 'Skin pack of your choice', 'the reward he is owed should carry the new name');
  // Cancel leaves it alone
  await rowOf('Coins').locator('[data-act="edit"]').click();
  await page.fill('[data-edit="tier"] input[type="text"]', 'Something else');
  await page.click('[data-edit="tier"] [data-act="cancel"]');
  t.check((await rowOf('Coins').count()) === 1 && (await page.locator('[data-edit]').count()) === 0, 'Cancel should leave the step as it was');
  // the two kinds of reward have a section each: the mine's rewards are not listed with the daily ones, and the other way round
  t.check((await page.locator('[data-section="mine"]').count()) === 1 && (await page.locator('[data-section="daily"], [data-form="daily"]').count()) === 0, 'the Rewards tab should open on the reward mine, without the daily rewards');
  await H.rewardsPart(page, 'daily');
  t.check((await page.locator('[data-section="daily"]').count()) === 1 && (await page.locator('[data-section="mine"], [data-form="tier"]').count()) === 0 && (await rowOf('Coins').count()) === 0, 'the daily section should not show the mine or its rewards');
  t.check(((await page.textContent('.parts [data-part="mine"] .part-count')) || '') === '3' && ((await page.textContent('.parts [data-part="daily"] .part-count')) || '') === '0', 'the switch should say how many rewards each kind has');
  // a daily reward with a description, then edited
  await page.fill('[data-form="daily"] input[type="text"]', 'Game time');
  await page.fill('[data-form="daily"] textarea', 'Fifteen minutes');
  await page.click('[data-form="daily"] button[type="submit"]');
  await rowOf('Game time').locator('[data-act="edit"]').click();
  await page.fill('[data-edit="daily"] input[type="number"]', '2');
  await page.click('[data-edit="daily"] button[type="submit"]');
  await page.waitForFunction(() => globalThis.__lwm.store.get().rewards.daily[0]?.missions === 2);

  // --- a chore and an expectation: added with a description, then edited
  await H.openTab(page, 'chores');
  await page.fill('[data-form="chore"] input[type="text"] >> nth=0', 'Make your bed');
  await page.fill('[data-form="chore"] textarea', 'Pillow on top');
  await page.click('[data-form="chore"] button[type="submit"]');
  await rowOf('Make your bed').locator('[data-act="edit"]').click();
  await page.fill('[data-edit="chore"] input[type="text"] >> nth=0', 'Make your bed nicely');
  await page.fill('[data-edit="chore"] input[type="number"]', '35');
  await page.click('[data-edit="chore"] button[type="submit"]');
  await rowOf('Make your bed nicely').waitFor();
  await H.openTab(page, 'expectations');
  await page.fill('[data-form="expect"] input[type="text"]', 'Brush your teeth');
  await page.click('[data-form="expect"] button[type="submit"]');
  await rowOf('Brush your teeth').locator('[data-act="edit"]').click();
  await page.fill('[data-edit="expect"] textarea', 'Two minutes, morning and night');
  await page.click('[data-edit="expect"] button[type="submit"]');
  await page.waitForFunction(() => globalThis.__lwm.store.get().expectations.list[0]?.note === 'Two minutes, morning and night');
  s = await getState(page);
  t.check(s.chores.list.length === 1 && s.chores.list[0].title === 'Make your bed nicely' && s.chores.list[0].points === 35 && s.chores.list[0].note === 'Pillow on top', `the chore should be changed in place (${JSON.stringify(s.chores.list)})`);
  await page.screenshot({ path: path.join(OUT, 'edit-parent-expectations.png') });

  // --- his side: descriptions are shown; the expectation has to be done before the rewards open
  await page.click('.sub-head .icon-btn');
  await page.click('[data-open="chores"]');
  t.check(((await page.textContent('.chore-row .reward-note')) || '').trim() === 'Pillow on top', 'he should see the chore\'s description');
  await page.click('.sub-head .icon-btn');
  await page.click('[data-open="expectations"]');
  t.check(((await page.textContent('.expect-row .reward-note')) || '').trim() === 'Two minutes, morning and night', 'he should see the expectation\'s description');
  await page.click('.expect-row [data-act="tick"]');
  await page.click('.sub-head .icon-btn');

  // --- his Rewards screen has a place for each kind: Mine (long-term) and Today (daily)
  await page.click('[data-open="rewards"]');
  await page.waitForSelector('.mine .rung');
  const places = () => page.evaluate(() => ({ on: document.querySelector('.reward-tab.on')?.dataset.tab, mine: !document.querySelector('[data-part="mine"]').hidden, today: !document.querySelector('[data-part="today"]').hidden }));
  t.check((await page.locator('.reward-tab').count()) === 2, 'with rewards of both kinds he should have two buttons: Mine and Today');
  t.check(JSON.stringify(await places()) === JSON.stringify({ on: 'mine', mine: true, today: false }), `it should open on his mine, with today's rewards out of sight (${JSON.stringify(await places())})`);
  t.check(!(await page.locator('.reward-row[data-reward]').first().isVisible()), 'the daily rewards must not be mixed in with the mine');
  const tabBox = await page.locator('.reward-tab').first().boundingBox();
  t.check(tabBox.height >= 60, `the two buttons should be big enough for him (${Math.round(tabBox.height)}px high)`);
  await H.rewardsPlace(page, 'today');
  t.check(JSON.stringify(await places()) === JSON.stringify({ on: 'today', mine: false, today: true }), 'Today should show the daily rewards and put the mine away');
  t.check(await page.locator('.reward-row[data-reward]').first().isVisible() && !(await page.locator('.mine').isVisible()), 'Today should show the daily rewards only');
  await page.click('.sub-head .icon-btn');
  await page.click('[data-open="rewards"]');
  await page.waitForSelector('.reward-tab.on');
  t.check((await places()).on === 'today', 'coming back, he should find the place he looked at last');
  await H.rewardsPlace(page, 'mine');

  // --- the reward mine: he digs down; every reward is an ore
  await page.waitForSelector('.rung .rung-pic.has-photo img');
  await sleep(700); // (the screen rides down to where he is digging)
  const lad = await page.evaluate(() => {
    const box = (el) => el.getBoundingClientRect();
    const ores = [...document.querySelectorAll('.mine-step .mine-ore')];
    const me = box(document.querySelector('.mine-me'));
    return {
      rungs: [...document.querySelectorAll('.mine .rung')].map((r) => ({ title: r.querySelector('.reward-title').textContent, state: [...r.classList].find((c) => c.startsWith('is-')).slice(3),
        shows: (r.querySelector('.stamp') || r.querySelector('.reward-need')).textContent.trim(), photo: !!r.querySelector('.rung-pic img'), w: box(r).width, h: box(r).height, top: box(r).top })),
      points: [...document.querySelectorAll('.mine .rung .rung-points')].map((n) => n.textContent),
      ores: [...document.querySelectorAll('.mine-step')].map((st) => `${st.dataset.ore}${st.querySelector('.mine-ore').classList.contains('is-found') ? ':found' : ''}`),
      at: document.querySelector('.mine').dataset.at,
      // his feet stand between the floor of the first ore and the floor of the second, 63/400 of the way down
      share: (me.bottom - box(ores[0]).bottom) / (box(ores[1]).bottom - box(ores[0]).bottom),
      grassAboveFirst: box(document.querySelector('.mine-grass')).top < box(ores[0]).top,
      shaftReachesHim: Math.abs(box(document.querySelector('.mine-shaft')).bottom - me.bottom) < 3,
      meInView: me.top >= 0 && me.bottom <= innerHeight,
      nextInView: (() => { const r = box(document.querySelector('.rung.is-next')); return r.top >= 0 && r.bottom <= innerHeight; })(),
      overlap: [...document.querySelectorAll('.mine .rung')].some((r, i, all) => i > 0 && box(r).top < box(all[i - 1]).bottom),
      owed: [...document.querySelectorAll('.glow-panel [data-earned] .reward-title')].map((n) => n.textContent),
    };
  });
  t.check(lad.rungs.map((r) => `${r.title}:${r.state}`).join() === 'Skin pack of your choice:won,New mount:next,Coins:ahead', `the mine should show what he has, what is next and what is ahead, from the top down (${JSON.stringify(lad.rungs.map((r) => [r.title, r.state]))})`);
  t.check(lad.rungs.every((r, i, all) => i === 0 || r.top > all[i - 1].top) && !lad.overlap, 'each reward should lie deeper than the one before, without overlapping');
  t.check(lad.ores.join() === 'coal:found,ruby,copper', `the ores should run coal, red crystal, copper... and the one he has reached should be found (${lad.ores})`);
  t.check(lad.points.join() === '400,800,2000' && lad.rungs[0].shows === 'WON!' && lad.rungs[1].shows === '463 / 800 XP' && lad.rungs[2].shows === '463 / 2000 XP', `each reward should show its points and where he stands (${JSON.stringify(lad)})`);
  t.check(lad.rungs[1].photo && !lad.rungs[0].photo, 'the reward with a picture should show the picture, the others their emoji');
  t.check(Math.abs(Number(lad.at) - (1 + 63 / 400)) < 0.01 && Math.abs(lad.share - 63 / 400) < 0.03, `he should be digging between the first and the second ore, as far down as his points say (at ${lad.at}, share ${lad.share.toFixed(3)})`);
  t.check(lad.grassAboveFirst && lad.shaftReachesHim, 'the shaft should run from the grass down to where he stands');
  t.check(lad.meInView && lad.nextInView, 'he and the reward he is working towards should be in view when the screen opens');
  t.check(lad.rungs.every((r) => r.w >= 60 && r.h >= 60), 'every reward must be big enough to tap');
  t.check(lad.owed.join() === 'Skin pack of your choice', 'what he has won should be under "You won! Show a grown-up"');
  await page.screenshot({ path: path.join(OUT, 'mine-landscape.png') });
  // look ahead: tap a step that is still far away
  await page.click('.rung.is-ahead');
  await page.waitForSelector('.rung-detail');
  const detail = (await page.textContent('.rung-detail')).replace(/\s+/g, ' ');
  t.check(/Coins/.test(detail) && /463 \/ 2000 XP/.test(detail) && /1537 XP to go/.test(detail), `looking ahead should show the reward, where he stands and how far it is (${detail})`);
  await page.screenshot({ path: path.join(OUT, 'mine-look-ahead.png') });
  await page.click('.rung-detail [data-act="close"]');
  t.check((await page.locator('.rung-detail').count()) === 0, 'OK should close it');
  await page.click('.rung.is-next');
  await page.waitForSelector('.rung-detail .rung-pic.big img');
  await page.screenshot({ path: path.join(OUT, 'mine-next-detail.png') });
  await page.click('.rung-detail [data-act="close"]');
  await page.setViewportSize({ width: 820, height: 1180 });
  await page.waitForTimeout(200);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  t.check(overflow <= 0, `the page must not scroll sideways in portrait (${overflow}px over)`);
  await page.screenshot({ path: path.join(OUT, 'mine-portrait.png') });
  await page.setViewportSize({ width: 1180, height: 820 });

  // --- removing a step takes its picture with it
  await page.click('.sub-head .icon-btn');
  await H.openParent(page);
  await H.openTab(page, 'rewards');
  await H.rewardsPart(page, 'mine');
  await rowOf('New mount').locator('[data-act="delete"]').click();
  await page.waitForFunction(() => globalThis.__lwm.store.get().rewards.tiers.length === 2);
  const left = await page.evaluate((id) => new Promise((resolve) => {
    const req = indexedDB.open('lwm-photos', 1);
    req.onsuccess = () => { const g = req.result.transaction('photos').objectStore('photos').get(id); g.onsuccess = () => resolve(!!g.result); g.onerror = () => resolve(null); };
    req.onerror = () => resolve(null);
  }), mount.photo);
  t.check(left === false, 'deleting a step should delete its picture from the device');
});

// ---------------------------------------------------------------------------------------------
// ---------------------------------------------------------------------------------------------
scenario('23 family account: a grown-up signs in on their own device and manages his rewards, chores and expectations from there', async (t) => {
  const fam = await require('./family-server.cjs').startFamilyServer(); // a stand-in for the family database
  t.cleanup(() => fam.close());
  const query = `fast=1&nosw=1&family=${encodeURIComponent(fam.url)}`;
  const png = fs.readFileSync(path.join(H.ROOT, 'assets', 'icons', 'icon-192.png'));
  const rowOf = (page, title) => page.locator(`.admin-row:not([data-earned]):has(b:text-is("${title}"))`);
  const round = (page) => page.evaluate(() => globalThis.__lwm.family.sync());
  const status = (page) => page.evaluate(() => globalThis.__lwm.family.status());
  const refused = (line) => /Failed to load resource/.test(line) && /status of 40[01]/.test(line) && line.includes(fam.url); // a wrong password, a sign-in that ran out
  const folder = () => [...fam.db.objects.keys()].map((k) => k.split('/')[1]);

  // --- the device he plays on: a few things already on it
  const his = await t.open({ query, state: { flags: { welcomed: true }, xp: 463,
    rewards: { daily: [{ id: 'daily0001', title: 'Game time', icon: '🎮', note: '', missions: 2 }], tiers: [{ id: 'tier00001', title: 'Trampoline park', icon: '🏆', note: '', points: 800, photo: null }] },
    chores: { list: [{ id: 'chore0001', title: 'Make your bed', icon: '🛏️', note: '', points: 20, repeat: 'daily', reward: '' }] },
    expectations: { list: [{ id: 'expect001', title: 'Brush your teeth', icon: '🦷', note: '' }] } } });
  his.log.tolerate = refused;
  const ipad = his.page;
  await toMap(ipad);
  await H.openParent(ipad);
  await H.openTab(ipad, 'settings');
  await ipad.waitForSelector('[data-family="out"]');
  await sleep(600);
  t.check(fam.requests.length === 0, `nothing may be sent before a grown-up signs in (sent: ${fam.requests.join(', ')})`);

  // --- creating the account: what is typed is checked first
  const form = '[data-form="family"]';
  await ipad.click(`${form} [data-act="create"]`);
  t.check(/email address/i.test(await ipad.textContent(`${form} .form-msg`)), 'an empty form should ask for the email address');
  await ipad.fill(`${form} input[type="email"]`, 'family@example.com');
  await ipad.fill(`${form} input[type="password"]`, 'short');
  await ipad.click(`${form} [data-act="create"]`);
  t.check(/at least 8/.test(await ipad.textContent(`${form} .form-msg`)), 'a short password should be refused with a reason');
  t.check(fam.requests.length === 0, 'and nothing sent yet');
  await ipad.fill(`${form} input[type="password"]`, 'correct horse battery');
  await ipad.click(`${form} [data-act="create"]`);
  await ipad.waitForSelector('[data-family="choose"]');
  await ipad.click('[data-family="choose"] [data-role="player"]');
  await ipad.waitForSelector('[data-family="player"] .family-state[data-state="ok"]');
  t.check(fam.db.family_state.length === 1 && fam.db.family_state[0].data.rewards.tiers[0].title === 'Trampoline park', 'his device should have reported its lists to the family account');
  t.check(!JSON.stringify(fam.db.family_state[0].data).includes('"hash"') && !('trials' in fam.db.family_state[0].data), 'neither the PIN nor his play history may be sent');
  const saved = await ipad.evaluate(() => localStorage.getItem('lwm.state.v1'));
  t.check(!saved.includes('at-') && !saved.includes('refresh_token'), 'the sign-in must not be stored inside his save (it would end up in a backup)');

  // --- a grown-up's own phone, with a game of its own on it
  const mine = await t.open({ query, viewport: { width: 414, height: 820 }, state: { flags: { welcomed: true }, rewards: { daily: [{ id: 'own000001', title: 'Typed on the phone', icon: '🎁', note: '', missions: 3 }] } } });
  mine.log.tolerate = refused;
  const phone = mine.page;
  await toMap(phone);
  await H.openParent(phone, '135790');
  await H.openTab(phone, 'settings');
  await phone.fill(`${form} input[type="email"]`, 'family@example.com');
  await phone.fill(`${form} input[type="password"]`, 'not the password');
  await phone.click(`${form} button[type="submit"]`);
  await phone.waitForFunction((sel) => /do not go together/.test(document.querySelector(sel)?.textContent || ''), `${form} .form-msg`);
  t.check((await phone.inputValue(`${form} input[type="email"]`)) === 'family@example.com', 'a wrong password should leave what was typed');
  await phone.fill(`${form} input[type="password"]`, 'correct horse battery');
  await phone.click(`${form} button[type="submit"]`);
  await phone.waitForSelector('[data-family="choose"]');
  await phone.click('[data-family="choose"] [data-role="manager"]');
  await phone.waitForSelector('[data-family="manager"] .family-state[data-state="ok"]');

  await H.openTab(phone, 'rewards');
  await phone.waitForSelector('[data-note="family"]');
  await rowOf(phone, 'Trampoline park').waitFor();
  t.check(/463 points/.test(await phone.textContent('.parent-body')), 'the phone should show his points');
  await H.rewardsPart(phone, 'daily');
  t.check((await rowOf(phone, 'Game time').count()) === 1 && (await rowOf(phone, 'Typed on the phone').count()) === 0, 'the phone should show HIS rewards, not the ones typed into its own game');
  await H.rewardsPart(phone, 'mine');

  // a new reward with a picture, typed on the phone
  await phone.fill('[data-form="tier"] input[type="text"]', 'New mount');
  await phone.fill('[data-form="tier"] input[type="number"]', '400');
  const [chooser] = await Promise.all([phone.waitForEvent('filechooser', { timeout: 5000 }), phone.click('[data-form="tier"] [data-act="picture"]')]);
  await chooser.setFiles({ name: 'mount.png', mimeType: 'image/png', buffer: png });
  await phone.waitForSelector('[data-form="tier"] .pic-preview.has-photo img');
  await phone.click('[data-form="tier"] button[type="submit"]');
  await rowOf(phone, 'New mount').locator('.emoji.has-photo img').waitFor();
  t.check((await phone.locator('[data-earned]').count()) === 1, 'he has the points for it already: it should wait under "To hand out" at once');
  // a change, a new chore, and one of today's expectations ticked for him
  await H.rewardsPart(phone, 'daily');
  await rowOf(phone, 'Game time').locator('[data-act="edit"]').click();
  await phone.fill('[data-edit="daily"] input[type="text"]', 'Thirty minutes of game time');
  await phone.click('[data-edit="daily"] button[type="submit"]');
  await rowOf(phone, 'Thirty minutes of game time').waitFor();
  await H.openTab(phone, 'chores');
  await phone.fill('[data-form="chore"] input[type="text"] >> nth=0', 'Feed the dog');
  await phone.click('[data-form="chore"] button[type="submit"]');
  await rowOf(phone, 'Feed the dog').waitFor();
  await H.openTab(phone, 'expectations');
  await phone.click('[data-expect="expect001"] [data-act="ok"]');
  await phone.waitForSelector('[data-expect="expect001"] [data-act="undo"]');
  t.check((await getState(phone)).rewards.tiers.length === 0 && (await getState(phone)).chores.list.length === 0, 'none of this may land in the phone\'s own game');
  await round(phone);
  t.check(fam.db.commands.length === 4 && fam.db.commands.every((c) => !c.applied_at), `four changes should be waiting for his device (${fam.db.commands.length})`);

  // --- his device carries them out the next time it is in touch
  await ipad.click('[data-family="player"] [data-act="sync"]');
  await ipad.waitForFunction(() => globalThis.__lwm.store.get().rewards.tiers.length === 2);
  let s = await getState(ipad);
  const mount = s.rewards.tiers.find((x) => x.title === 'New mount');
  t.check(!!mount && mount.points === 400 && typeof mount.photo === 'string', `the new reward should be on his device: ${JSON.stringify(mount)}`);
  t.check(s.rewards.daily[0].title === 'Thirty minutes of game time' && s.chores.list.some((c) => c.title === 'Feed the dog'), 'so should the change and the new chore');
  t.check(s.expectations.days[Object.keys(s.expectations.days)[0]]?.expect001 === 'done', 'and the expectation ticked from the phone');
  t.check(s.rewards.earned.some((e) => e.ref === mount.id && !e.given), 'the reward he had already reached should be his');
  await sleep(300);
  t.check(fam.db.commands.every((c) => c.applied_at && c.outcome === 'done'), 'every change should be ticked off as carried out');
  await H.openTab(ipad, 'rewards');
  await rowOf(ipad, 'New mount').locator('.emoji.has-photo img').waitFor({ timeout: 5000 }).catch(() => t.check(false, 'the picture chosen on the phone should show on his device'));
  // what he sees: his mine, with the new reward and its picture
  await ipad.click('.screen.parent .sub-head .icon-btn');
  await ipad.waitForSelector('.screen.map');
  await ipad.click('[data-open="rewards"]');
  await ipad.waitForSelector('.mine .rung');
  t.check((await ipad.locator('.mine .rung').count()) === 2, 'his mine should have both rewards');
  await ipad.locator('.mine .rung:has-text("New mount") .rung-pic.has-photo img').waitFor({ timeout: 5000 }).catch(() => t.check(false, 'he should see the picture in his mine'));

  // --- he does a chore with a photo; the grown-up checks it on the phone
  await ipad.click('.screen.rewards .sub-head .icon-btn');
  await ipad.waitForSelector('.screen.map');
  await ipad.click('[data-open="chores"]');
  const [camera] = await Promise.all([ipad.waitForEvent('filechooser', { timeout: 5000 }), ipad.click('.chore-row:has-text("Make your bed") [data-act="done"]')]);
  await camera.setFiles({ name: 'bed.png', mimeType: 'image/png', buffer: png });
  await ipad.click('.photo-panel [data-act="send"]');
  await ipad.waitForFunction(() => globalThis.__lwm.store.get().chores.log.length === 1);
  await round(ipad);
  t.check(folder().length === 2, `the chore photo should be in the family's folder beside the reward picture (${folder().length} files)`);
  await H.openTab(phone, 'chores'); // looking at a tab fetches what is new
  await phone.waitForSelector('.check-card img', { timeout: 8000 }).catch(() => t.check(false, 'the grown-up should see his chore photo on the phone'));
  t.check(/Chores\s*1/.test(await phone.textContent('.tab[data-tab="chores"]')), 'the Chores tab should show that one is waiting');
  fam.expireTokens(); // the sign-in runs out now and then: both devices must renew it by themselves
  await phone.click('.check-card [data-act="approve"]');
  await round(phone);
  await round(ipad);
  s = await getState(ipad);
  t.check(s.xp === 483 && s.chores.log[0].status === 'approved' && !s.chores.log[0].photo, `approving on the phone should give him the points: xp ${s.xp}, ${JSON.stringify(s.chores.log[0])}`);
  t.check(folder().length === 1 && folder()[0] === mount.photo, 'the checked chore photo should be gone from the family\'s folder');
  t.check((await status(phone)).signedIn && (await status(ipad)).signedIn && !(await status(ipad)).error, 'both devices should still be signed in');

  // --- handing out, from the phone; news arrives in the open parent area by itself
  await H.openTab(phone, 'rewards');
  await H.rewardsPart(phone, 'mine');
  await phone.waitForSelector('[data-earned] [data-act="given"]');
  await phone.click('[data-earned] [data-act="given"]');
  await round(phone);
  await round(ipad);
  t.check((await getState(ipad)).rewards.earned.every((e) => e.given), 'a reward marked as given on the phone should be given on his device');
  await ipad.evaluate(() => globalThis.__lwm.family.desk().run('add', { kind: 'tier', item: { title: 'Added on his device', points: 5000 } }));
  await round(ipad);
  await round(phone);
  await rowOf(phone, 'Added on his device').waitFor({ timeout: 5000 }).catch(() => t.check(false, 'something added on his device should appear on the phone without touching it'));

  // --- news must never wipe what a grown-up is in the middle of: a half-filled form, or a new PIN
  await phone.fill('[data-form="tier"] input[type="number"]', '2500'); // only the points so far - no name yet
  await ipad.evaluate(() => globalThis.__lwm.family.desk().run('add', { kind: 'tier', item: { title: 'While you were typing', points: 9000 } }));
  await round(ipad);
  await round(phone);
  await sleep(400);
  t.check((await phone.inputValue('[data-form="tier"] input[type="number"]')) === '2500', 'news from his device must not reset a form that has been touched');
  await H.openTab(phone, 'chores');
  await H.openTab(phone, 'rewards');
  t.check((await rowOf(phone, 'While you were typing').count()) === 1, 'and the news shows the next time the tab is drawn');

  await ipad.click('.screen.chores .sub-head .icon-btn');
  await ipad.waitForSelector('.screen.map');
  await H.openParent(ipad);
  await H.openTab(ipad, 'settings');
  const hashBefore = (await getState(ipad)).admin.hash;
  await ipad.click('[data-act="change-pin"]');
  await ipad.waitForSelector('.gate .pin-pad');
  await ipad.evaluate(() => globalThis.__lwm.store.update((st) => { st.xp += 1; })); // something changes, a round follows, news arrives ...
  await round(ipad);
  await sleep(3200);
  t.check((await ipad.locator('.gate .pin-pad').count()) === 1, '... and the "choose a PIN" pad must still be there');
  t.check((await getState(ipad)).admin.hash === hashBefore, 'until the new PIN has been typed twice the old one stays in force');
  await H.openTab(ipad, 'progress'); // walking away half-way
  t.check((await getState(ipad)).admin.hash === hashBefore && (await ipad.locator('.gate').count()) === 0, 'walking away half-way must leave the old PIN in place');
  await H.openTab(ipad, 'settings');
  await ipad.click('[data-act="change-pin"]');
  await H.typePin(ipad, '112233');
  await H.typePin(ipad, '112233');
  await ipad.waitForSelector('[data-family="player"]');
  const hashAfter = (await getState(ipad)).admin.hash;
  t.check(hashAfter.length > 20 && hashAfter !== hashBefore, 'typed twice, the new PIN replaces the old one');
  await ipad.click('.screen.parent .sub-head .icon-btn');
  await ipad.waitForSelector('.screen.map');
  await ipad.click('[data-open="parent"]');
  await H.typePin(ipad, '246810');
  await ipad.waitForFunction(() => /Wrong PIN/.test(document.querySelector('.gate-msg')?.textContent || ''));
  await H.typePin(ipad, '112233');
  await ipad.waitForSelector('.tabs:not([hidden])', { timeout: 5000 }).catch(() => t.check(false, 'the new PIN should open the parent area'));

  // --- signing out on the phone: its own game again; his device carries on, also after a restart
  await H.openTab(phone, 'settings');
  await phone.click('[data-act="sign-out"]');
  await phone.waitForSelector('[data-family="out"]');
  await H.openTab(phone, 'rewards');
  t.check((await rowOf(phone, 'New mount').count()) === 0 && (await phone.locator('[data-note="family"]').count()) === 0, 'signed out, the phone should no longer show his mine');
  await H.rewardsPart(phone, 'daily');
  t.check((await rowOf(phone, 'Typed on the phone').count()) === 1, 'signed out, the phone should show its own game again');
  await ipad.reload();
  await ipad.waitForSelector('.screen.title .btn-huge');
  t.check((await status(ipad)).role === 'player', 'his device should still be signed in after the app is opened again');
  s = await getState(ipad);
  t.check(s.xp === 484 && s.rewards.tiers.length === 4, `and nothing of his should have changed by that (xp ${s.xp}, ${s.rewards.tiers.length} rewards)`);
});

// ---------------------------------------------------------------------------------------------
scenario('24 the parent area, as a bug hunt left it: double taps, a phone held upright, typed text that stays, the page staying where it is', async (t) => {
  const pad = (n) => String(n).padStart(2, '0');
  const now = new Date();
  const day = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const mon = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7));
  const week = `w${mon.getFullYear()}-${pad(mon.getMonth() + 1)}-${pad(mon.getDate())}`;
  const tier = (n, title, points) => ({ id: `tier0000${n}`, title, icon: '🎁', note: '', points, photo: null });
  const won = (n, title) => ({ id: `ttier0000${n}`, src: 'tier', ref: `tier0000${n}`, title, icon: '🎁', day, t: Date.now(), given: false });
  const sent = (n, title) => ({ id: `entry000${n}`, chore: `chore000${n}`, title, icon: '✅', points: 30, reward: '', t: Date.now() - 60000, day, week, status: 'pending', photo: null, note: '' });
  const trial = (i) => ({ t: i, l: 'camp1', i: `x${i}`, k: ['detail'], c1: 1, c2: 0, e: '', rp: 0, et: (i < 60 ? i % 2 === 0 : i % 10 === 0) ? 1 : 0, ms: 900 }); // he used to jump in early on half his turns, now on one in ten
  const state = { flags: { welcomed: true }, xp: 640, settings: { hardStop: true, dailyMissions: 3 },
    trials: Array.from({ length: 120 }, (_, i) => trial(i)),
    rewards: { daily: [{ id: 'daily0001', title: 'Game time', icon: '🎮', note: '', missions: 2 }, { id: 'daily0002', title: 'Big treat', icon: '🍦', note: '', missions: 5 }],
      tiers: [tier(1, 'One', 100), tier(2, 'Two', 200), tier(3, 'Three', 3000), tier(4, 'Four', 4000), tier(5, 'Five', 5000), tier(6, 'Six', 6000)],
      earned: [won(1, 'One'), won(2, 'Two')] },
    chores: { list: [{ id: 'chore0001', title: 'Make your bed', icon: '🛏️', note: '', points: 30, repeat: 'daily', reward: '' }, { id: 'chore0002', title: 'Feed the dog', icon: '🐕', note: '', points: 30, repeat: 'daily', reward: '' }],
      log: [sent(1, 'Make your bed'), sent(2, 'Feed the dog')] },
    expectations: { list: [{ id: 'expect001', title: 'Brush your teeth', icon: '🦷', note: '' }, { id: 'expect002', title: 'Pack your bag', icon: '🎒', note: '' }] } };
  const rowOf = (page, title) => page.locator(`.admin-row:not([data-earned]):has(b:text-is("${title}"))`);
  const top = (page) => page.evaluate(() => document.querySelector('.parent-body').scrollTop);

  // --- a phone held upright: every button of the map is on the screen (his cards and For parents used to be off it)
  const small = await t.open({ state, viewport: { width: 390, height: 844 } });
  await toMap(small.page);
  for (const name of ['rewards', 'chores', 'expectations', 'collection', 'parent']) {
    const box = await small.page.locator(`[data-open="${name}"]`).boundingBox();
    t.check(!!box && box.x >= 0 && box.x + box.width <= 390, `on a phone the "${name}" button of the map should be on the screen (${box ? `${Math.round(box.x)}..${Math.round(box.x + box.width)}` : 'missing'})`);
  }
  await H.openParent(small.page);
  await H.openTab(small.page, 'chores');
  const howOften = await small.page.locator('[data-form="chore"] select').last().boundingBox();
  t.check(howOften.width >= 165, `the "How often" choice should be wide enough for "One time only" (${Math.round(howOften.width)}px)`);
  t.check((await small.page.evaluate(() => document.documentElement.scrollWidth - innerWidth)) <= 0, 'the parent area must not scroll sideways on a phone');

  // --- the tablet
  const { page } = await t.open({ state });
  await toMap(page);
  await H.openParent(page);
  t.check(/jumping in early \(down from 50%\)/.test(await page.textContent('.parent-body')), 'the Progress tab should say that jumping in early went DOWN when it fell from 50% to 10%');

  // a double tap acts once, on the row that was tapped
  await H.openTab(page, 'rewards');
  await page.locator('[data-earned] [data-act="given"]').first().dblclick();
  let s = await getState(page);
  t.check(s.rewards.earned.filter((e) => e.given).length === 1, 'a double tap on Given must hand out one reward, not the one below it as well');

  // a button on the tab leaves the page where it is
  await page.evaluate(() => { const b = document.querySelector('.parent-body'); b.scrollTop = b.scrollHeight; });
  const before = await top(page);
  await rowOf(page, 'Five').locator('[data-act="edit"]').click();
  const open = await page.locator('.admin-row.is-open').boundingBox();
  t.check(before > 80 && Math.abs((await top(page)) - before) < 80 && open.y > 0 && open.y < 820, `Edit should open the row where it is, not throw the page back to the top (was at ${before}, now ${await top(page)}, form at ${Math.round(open.y)})`);

  // what is typed stays until it is saved or cancelled - whatever else is pressed on the tab
  await page.fill('[data-edit="tier"] input[type="text"]', 'Five, renamed');
  await rowOf(page, 'Four').locator('[data-act="edit"]').click();
  t.check((await page.inputValue('[data-edit="tier"] input[type="text"]')) === 'Five, renamed' && /Save or cancel this one first/.test(await page.textContent('.admin-row.is-open .form-msg')),
    'pressing Edit on another row must not drop a change that is half made: it should ask to save or cancel first');
  await page.click('.parts [data-part="daily"]');
  t.check((await page.locator('[data-section="mine"]').count()) === 1, 'nor may switching to the daily rewards drop it');
  await page.click('[data-edit="tier"] [data-act="cancel"]');
  t.check((await rowOf(page, 'Five').count()) === 1 && (await getState(page)).rewards.tiers.some((x) => x.title === 'Five'), 'Cancel should leave the reward as it was');
  await page.fill('[data-form="tier"] input[type="text"]', 'Half typed');
  await page.fill('[data-form="tier"] input[type="number"]', '2500');
  await sleep(600);
  await rowOf(page, 'Three').locator('[data-act="delete"]').dblclick();
  s = await getState(page);
  t.check(s.rewards.tiers.length === 5 && !s.rewards.tiers.some((x) => x.title === 'Three') && s.rewards.tiers.some((x) => x.title === 'Four'), `a double tap on Delete must delete one reward, not the next one too (left: ${s.rewards.tiers.map((x) => x.title).join(', ')})`);
  t.check((await page.inputValue('[data-form="tier"] input[type="text"]')) === 'Half typed' && (await page.inputValue('[data-form="tier"] input[type="number"]')) === '2500', 'what was typed into the add form must survive another button on the tab');
  await H.rewardsPart(page, 'daily');
  t.check(/out of reach/.test(await rowOf(page, 'Big treat').textContent()) && !/out of reach/.test(await rowOf(page, 'Game time').textContent()),
    'a daily reward that needs more missions than "Lock for the day" allows should say that it is out of reach');
  await H.rewardsPart(page, 'mine');
  t.check((await page.inputValue('[data-form="tier"] input[type="text"]')) === 'Half typed', 'and it must still be there after a look at the daily rewards');
  await page.click('[data-form="tier"] button[type="submit"]');
  await rowOf(page, 'Half typed').waitFor();
  t.check((await page.inputValue('[data-form="tier"] input[type="text"]')) === '', 'once it is added the form should be empty again');

  // chores: a note typed for one chore survives the check of another; a double tap checks one
  await H.openTab(page, 'chores');
  await page.fill('.check-card[data-entry="entry0002"] input', 'The water bowl too');
  await page.locator('.check-card[data-entry="entry0001"] [data-act="approve"]').dblclick();
  s = await getState(page);
  t.check(s.chores.log.filter((e) => e.status === 'approved').length === 1 && s.chores.log.find((e) => e.id === 'entry0002').status === 'pending' && s.xp === 670,
    `a double tap on Approve must approve one chore, not the next one unseen (xp ${s.xp})`);
  t.check((await page.inputValue('.check-card[data-entry="entry0002"] input')) === 'The water bowl too', 'the note typed for the other chore must still be there');
  await sleep(600);
  await page.click('.check-card[data-entry="entry0002"] [data-act="reject"]');
  t.check((await getState(page)).chores.log.find((e) => e.id === 'entry0002').note === 'The water bowl too', 'and it should go with "Not yet"');

  // expectations: a double tap on Mark done marks it done (the second tap used to land on "Not done")
  await H.openTab(page, 'expectations');
  await page.locator('[data-expect="expect001"] [data-act="ok"]').dblclick();
  s = await getState(page);
  t.check(s.expectations.days[day]?.expect001 === 'done', 'a double tap on Mark done should leave it done');

  // the PIN: a mismatch says so; OK with nothing typed is not a try
  await H.openTab(page, 'settings');
  await page.click('[data-act="change-pin"]');
  await H.typePin(page, '1234');
  await H.typePin(page, '9999');
  await page.waitForFunction(() => /not the same/.test(document.querySelector('.gate-msg')?.textContent || ''));
  await page.click('.sub-head .icon-btn');
  await page.click('[data-open="parent"]');
  await page.waitForSelector('.pin-pad');
  await page.click('.pin-key[data-key="ok"]');
  await page.click('.pin-key[data-key="ok"]');
  t.check((await getState(page)).admin.tries === 0, 'OK with nothing typed must not count as a wrong try');
  await H.typePin(page, '246810');
  await page.waitForSelector('.tabs:not([hidden])', { timeout: 5000 }).catch(() => t.check(false, 'the PIN that was never replaced should still open the parent area'));

  // "total practice" is time spent playing: a mission left open for three hours is not three hours of practice
  await page.click('.sub-head .icon-btn');
  await page.waitForSelector('.screen.map');
  await page.evaluate(() => { const real = Date.now.bind(Date); let ahead = 0; Date.now = () => real() + ahead; globalThis.__later = (ms) => { ahead += ms; }; });
  await openLevel(page, 'camp1');
  await page.waitForSelector('.overlay.intro .btn-primary:not([disabled])', { timeout: 20000 });
  await page.click('.overlay.intro .btn-primary');
  const turns = await page.evaluate(() => globalThis.__lwm.debug.mission.items.length);
  for (let i = 0; i < turns; i++) {
    await waitPhase(page, 'ready');
    if (i === 2) await page.evaluate(() => globalThis.__later(3 * 3600000)); // he is called away, the game stays open
    await page.click('.btn-listen', { force: true });
    await waitPhase(page, 'respond');
    await answer(page);
  }
  await page.waitForSelector('.screen.results', { timeout: 30000 });
  s = await getState(page);
  const spent = s.missions[s.missions.length - 1].ms;
  t.check(spent > 0 && spent < 10 * 60000 && s.days[day].ms < 10 * 60000, `a mission with a three-hour break in it should count as a few minutes of practice (counted ${Math.round(spent / 60000)} min)`);
});

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
