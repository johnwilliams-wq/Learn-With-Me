// One mission = a handful of spoken instructions at one level.
//
// Every trial follows the same routine, on purpose:
//   READY      he taps the ear when HE is ready to listen
//   LISTENING  the voice talks; the board is frozen (tapping early just gets a calm "wait")
//   RESPOND    he does what was said (and may ask to hear it again)
//   FEEDBACK   right -> celebrate; first miss -> back to READY: he taps the ear again and hears it
//              a little slower, with support; second miss -> the guide shows the answer.
//              No buzzers, nothing is lost.

import { h, wait, pulse, mount } from '../core/dom.js';
import { makeRng } from '../core/rng.js';
import { check, demoOrder } from '../listening/checker.js';
import { pickItems, summarize, isUnlocked } from '../listening/progress.js';
import { missionCounts, collectRewards } from '../rewards/logic.js';
import { createBoard } from '../listening/board.js';
import { loadBank, itemAudioUrl } from '../listening/bank.js';
import { nextCard } from '../listening/cards.js';
import { guideSVG, iconSVG } from '../art/sprites.js';

const MAX_REPLAYS = 2;
const MAX_ACTIONS = 12;

export async function missionScreen(ctx, { levelId }) {
  const { store, audio, sfx, voice } = ctx;
  const level = ctx.levels.find((l) => l.id === levelId);
  const rng = makeRng();
  let alive = true;
  let token = 0; // bumps whenever a new step starts, so stale async steps stop quietly

  const bank = await loadBank(level);
  const items = pickItems(bank.items, store.get().seen, level, rng);
  const itemUrls = items.map((it) => itemAudioUrl(it));

  // --- trial state -----------------------------------------------------------
  let phase = 'intro';
  let index = -1;
  let item = null;
  let board = null;
  let actions = [];
  let attempt = 1;
  let earlyTaps = 0;
  let replays = 0;
  let firstError = '';
  let answerStart = 0;
  const results = [];
  const startedAt = Date.now();
  let gate = Promise.resolve(); // held shut while the "leave?" box is open

  // --- elements --------------------------------------------------------------
  const pips = h('div', { class: 'pips', 'aria-hidden': 'true' });
  const guideEl = h('div', { class: 'guide' });
  const boardWrap = h('div', { class: 'board-wrap' });
  const caption = h('div', { class: 'caption', hidden: true });
  const steps = h('div', { class: 'steps', hidden: true, 'aria-hidden': 'true' });
  const btnQuit = h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Leave mission', html: iconSVG('home'), onclick: askQuit });
  const btnListen = h('button', { class: 'btn btn-listen', type: 'button', onclick: onListen },
    h('span', { class: 'btn-icon ear', html: iconSVG('ear') }),
    h('span', { class: 'btn-icon again', html: iconSVG('replay') }),
    h('span', { class: 'waves', 'aria-hidden': 'true' }, h('i'), h('i'), h('i'), h('i')),
    h('span', { class: 'btn-label' }, 'Listen'));
  const btnDone = h('button', { class: 'btn btn-done', type: 'button', onclick: () => submit() },
    h('span', { class: 'btn-icon', html: iconSVG('check') }), h('span', { class: 'btn-label' }, 'Done'));
  const btnUndo = h('button', { class: 'btn btn-undo', type: 'button', onclick: onUndo },
    h('span', { class: 'btn-icon', html: iconSVG('back') }), h('span', { class: 'btn-label' }, 'Undo'));
  const btnHand = h('button', { class: 'btn btn-hand', type: 'button', onclick: onHand },
    h('span', { class: 'btn-icon', html: iconSVG('hand') }), h('span', { class: 'btn-label' }, 'Not this time'));
  if (!level.allowNone) btnHand.hidden = true;

  const root = h('div', { class: 'screen mission', dataset: { phase, world: level.world, level: level.id } },
    h('header', { class: 'hud' }, btnQuit, pips, h('div', { class: 'hud-title' }, level.title)),
    h('main', { class: 'stage' },
      h('div', { class: 'guide-col' }, guideEl, steps),
      h('div', { class: 'board-col' }, boardWrap, caption)),
    h('footer', { class: 'controls' }, btnHand, btnUndo, btnListen, btnDone));

  const setGuide = (mood) => { guideEl.innerHTML = guideSVG(mood); guideEl.dataset.mood = mood; };
  function setPhase(p) {
    phase = p;
    root.dataset.phase = p;
    refresh();
  }
  function refresh() {
    const responding = phase === 'respond';
    btnListen.disabled = !(phase === 'ready' || (responding && replays < MAX_REPLAYS));
    btnListen.querySelector('.btn-label').textContent = phase === 'ready' ? 'Listen' : phase === 'listening' ? 'Listening' : 'Again';
    btnDone.hidden = !item || !!item.auto;
    btnUndo.hidden = !item || !!item.auto;
    btnDone.disabled = !(responding && actions.length > 0);
    btnUndo.disabled = !(responding && actions.length > 0);
    btnHand.disabled = !responding;
    [...steps.children].forEach((d, i) => d.classList.toggle('on', i < actions.length));
  }
  function renderPips() {
    mount(pips, items.map((_, i) => {
      const r = results[i];
      const cls = r ? (r.correctFirst ? 'gold' : r.correctSecond ? 'silver' : 'tried') : i === index ? 'now' : '';
      return h('span', { class: `pip ${cls}` });
    }));
  }
  function showCaption(text) {
    caption.textContent = text;
    caption.hidden = !text;
  }
  function showSteps(n) {
    mount(steps, Array.from({ length: n }, () => h('i')));
    steps.hidden = n < 1;
  }

  // --- trial flow ------------------------------------------------------------
  function startTrial() {
    index++;
    if (index >= items.length) return finish();
    item = items[index];
    actions = [];
    attempt = 1;
    earlyTaps = 0;
    replays = 0;
    firstError = '';
    board = createBoard(item.scene, { onTap });
    mount(boardWrap, board.el);
    board.fit(boardWrap);
    board.setLocked(true);
    board.setCovered(!!item.hide);
    showCaption('');
    showSteps(0);
    setGuide('idle');
    renderPips();
    setPhase('ready');
    ctx.debug.item = item;
  }

  async function listen({ support = false } = {}) {
    const my = ++token;
    await gate; // if the "leave?" box is open, wait for his answer before talking
    if (!alive || my !== token) return;
    actions = [];
    board.mark(actions, item.mode);
    board.setLocked(true);
    board.setCovered(!!item.hide && !support);
    showCaption('');
    setGuide('talk');
    setPhase('listening');
    const rate = (store.get().settings.slowVoice ? 0.88 : 1) * (support ? 0.88 : 1);
    const res = await audio.play(itemAudioUrl(item), { rate, text: item.say });
    if (!alive || my !== token) return;
    if (res.how === 'cancelled') {
      setGuide('idle');
      setPhase('ready');
      return;
    }
    if (!res.ok) showCaption(item.say); // no sound could be played at all: show the words so the trial stays fair
    await wait(level.holdMs ?? 300);
    if (!alive || my !== token) return;
    sfx.go();
    board.setCovered(false);
    board.setLocked(false);
    setGuide('idle');
    answerStart = Date.now();
    setPhase('respond');
  }

  function onListen() {
    audio.unlock();
    sfx.unlock();
    if (phase === 'ready') listen({ support: attempt === 2 });
    else if (phase === 'respond' && replays < MAX_REPLAYS) {
      replays++;
      listen({ support: attempt === 2 });
    }
  }

  function onTap(id) {
    if (phase === 'listening') {
      // Jumped in early. Stay calm: count it and show "wait". Then either carry on talking, or
      // (the default) stop, ask him to listen to the end, and let him start the instruction again.
      earlyTaps = Math.min(earlyTaps + 1, 9);
      board.nudge(id);
      setGuide('wait');
      if (store.get().settings.earlyReminder !== false && voice.has('wait-please')) remind();
      else setTimeout(() => { if (alive && phase === 'listening') setGuide('talk'); }, 900);
      return;
    }
    if (phase === 'ready') return void pulse(btnListen, 'hint', 700);
    if (phase !== 'respond') return;
    if (item.mode === 'pick') {
      const i = actions.indexOf(id);
      if (i >= 0) actions.splice(i, 1);
      else actions.push(id);
    } else {
      if (actions.length >= MAX_ACTIONS) return;
      actions.push(id);
    }
    sfx.tap();
    board.mark(actions, item.mode);
    refresh();
    if (item.auto) submit();
  }

  /** "Please try your best to listen until I am finished talking" - then back to the ear. Nothing is lost. */
  async function remind() {
    const my = ++token; // the instruction that was playing stops here, quietly
    setPhase('feedback');
    await voice.say('wait-please');
    if (!alive || my !== token) return;
    actions = [];
    board.mark(actions, item.mode);
    board.setLocked(true);
    board.setCovered(!!item.hide && attempt === 1);
    setGuide('idle');
    setPhase('ready');
    pulse(btnListen, 'hint', 700);
  }

  function onUndo() {
    if (phase !== 'respond' || !actions.length) return;
    actions.pop();
    sfx.undo();
    board.mark(actions, item.mode);
    refresh();
  }

  function onHand() {
    if (phase !== 'respond') return;
    actions = [];
    board.mark(actions, item.mode);
    submit();
  }

  function record(correctFirst, correctSecond, ms) {
    const r = { correctFirst, correctSecond, earlyTaps, replays, error: firstError };
    results[index] = r;
    store.recordTrial({ level: levelId, item: item.id, skills: item.s, ...r, ms });
    renderPips();
  }

  async function submit() {
    if (phase !== 'respond') return;
    const my = ++token;
    setPhase('feedback');
    const res = check(actions, item.expect, item.scene.objects);
    const ms = Date.now() - answerStart;

    if (res.correct) {
      const first = attempt === 1;
      sfx.good();
      setGuide('happy');
      board.celebrate(item.expect.flat());
      record(first, !first, ms);
      if (first && (index === 0 || Math.random() < 0.34)) {
        // Only praise the waiting / whole-sentence listening when that is what really happened.
        const clean = earlyTaps === 0 && replays === 0;
        await voice.sayPool(!clean ? 'good' : level.allowNone ? 'goodWait' : Math.random() < 0.5 ? 'goodEnd' : 'good');
      } else {
        await wait(first ? 800 : 500);
        if (!first && alive && my === token) await voice.sayPool('gotIt');
      }
    } else if (attempt === 1) {
      firstError = res.error;
      attempt = 2;
      sfx.soft();
      setGuide('oops');
      board.shake();
      await voice.sayPool('retry');
      if (!alive || my !== token) return;
      // Back to the start of the routine: he taps the ear again when he is ready. This time it is
      // a little slower, hidden cards stay face-up, and the dots show how many taps are needed.
      actions = [];
      board.mark(actions, item.mode);
      board.setLocked(true);
      board.setCovered(false);
      showSteps(res.total);
      setGuide('idle');
      setPhase('ready');
      pulse(btnListen, 'hint', 700);
      return;
    } else {
      sfx.soft();
      setGuide('oops');
      record(false, false, ms);
      await voice.sayPool('watch');
      if (!alive || my !== token) return;
      await demo(my);
    }
    if (!alive || my !== token) return;
    await wait(350);
    if (!alive || my !== token) return;
    startTrial();
  }

  /** Second miss: say it once more and show the answer, so every trial ends with the right thing. */
  async function demo(my) {
    board.setLocked(true);
    board.mark([], item.mode);
    setGuide('talk');
    await audio.play(itemAudioUrl(item), { rate: 0.92, text: item.say });
    if (!alive || my !== token) return;
    setGuide('idle');
    const order = demoOrder(item.expect);
    if (!order.length) {
      pulse(btnHand, 'glow', 1800);
      await wait(1800);
    } else {
      await board.demo(order, item.mode, () => sfx.tap());
    }
  }

  function finish() {
    const sum = summarize(results);
    const before = store.get();
    const prevStars = before.levels[levelId]?.stars || 0;
    const card = nextCard(before.cards);
    const next = ctx.levels[ctx.levels.findIndex((l) => l.id === levelId) + 1];
    const nextWasOpen = !!next && isUnlocked(next.id, ctx.levels, before);
    store.recordMission({ level: levelId, ...sum, ms: Date.now() - startedAt, counted: missionCounts(prevStars, before.rewards) });
    let won = [];
    store.update((s) => {
      if (card) s.cards.push(card.id);
      won = collectRewards(s); // any daily or lifetime reward this mission has just earned
    });
    ctx.go('results', { levelId, sum, card, prevStars, nextWasOpen, won });
  }

  // --- leaving ---------------------------------------------------------------
  function askQuit() {
    if (root.querySelector('.overlay')) return;
    audio.stop();
    let release;
    gate = new Promise((r) => { release = r; });
    const close = () => { overlay.remove(); release(); };
    const overlay = h('div', { class: 'overlay' },
      h('div', { class: 'panel small' },
        h('h2', {}, 'Leave this mission?'),
        h('div', { class: 'row' },
          h('button', { class: 'btn btn-primary', type: 'button', onclick: close }, h('span', { class: 'btn-icon', html: iconSVG('play') }), h('span', {}, 'Keep playing')),
          h('button', { class: 'btn', type: 'button', onclick: () => ctx.go('map') }, h('span', { class: 'btn-icon', html: iconSVG('home') }), h('span', {}, 'Leave')))));
    root.append(overlay);
  }
  const onHide = () => { if (document.hidden) audio.stop(); };
  const onResize = () => board?.fit(boardWrap);
  document.addEventListener('visibilitychange', onHide);
  window.addEventListener('resize', onResize);

  // --- intro -----------------------------------------------------------------
  function intro() {
    const plays = store.get().levels[levelId]?.plays || 0;
    const start = h('button', { class: 'btn btn-primary btn-big', type: 'button', disabled: true }, 'Loading…');
    const overlay = h('div', { class: 'overlay intro' },
      h('div', { class: 'panel' },
        h('div', { class: 'eyebrow' }, level.worldName),
        h('h1', {}, level.title),
        h('div', { class: 'guide big', html: guideSVG('idle') }),
        h('p', { class: 'tip' }, level.tipText || ''),
        start));
    root.append(overlay);
    setGuide('idle');
    renderPips();
    refresh(); // hides Done / Undo until a turn needs them

    const ready = Promise.race([
      Promise.all([audio.preload(itemUrls), voice.preload(['wait-please', 'good', 'goodEnd', 'goodWait', 'gotIt', 'retry', 'watch', 'result1', 'result2', 'result3', 'enough', level.tip].filter(Boolean))]),
      wait(8000),
    ]);
    ready.then(() => {
      if (!alive) return;
      start.disabled = false;
      start.textContent = 'Start';
    });

    let stage = 0;
    start.addEventListener('click', async () => {
      if (stage === 2) return;
      audio.unlock();
      sfx.unlock();
      // The tip is the only teaching of each new rule, so it is spoken until he has passed the level
      // (2 stars), and the very first time it cannot be skipped by a double tap.
      const passed = (store.get().levels[levelId]?.stars || 0) >= 2;
      if (stage === 0 && level.tip && (plays < 2 || !passed) && voice.has(level.tip)) {
        stage = 1;
        start.disabled = plays === 0;
        start.textContent = plays === 0 ? '…' : 'Skip';
        overlay.querySelector('.guide').innerHTML = guideSVG('talk');
        await voice.say(level.tip);
        if (!alive || stage !== 1) return;
      } else if (stage === 1) {
        audio.stop();
      }
      stage = 2;
      overlay.remove();
      startTrial();
    });
  }

  intro();
  ctx.debug.mission = { level, items, results, phase: () => phase };

  return {
    el: root,
    destroy() {
      alive = false;
      token++;
      audio.stop();
      audio.release(itemUrls);
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('resize', onResize);
    },
  };
}
