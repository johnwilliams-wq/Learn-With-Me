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
import { pickItems, summarize, openCount } from '../listening/progress.js';
import { missionCounts, collectRewards } from '../rewards/logic.js';
import { sceneFor } from '../listening/scenes/index.js';
import { loadBank, itemAudioUrl } from '../listening/bank.js';
import { nextCard } from '../listening/cards.js';
import { guideSVG, iconSVG } from '../art/sprites.js';

const MAX_REPLAYS = 2;

export async function missionScreen(ctx, { levelId, items: given = null }) {
  const { store, audio, sfx, voice } = ctx;
  const level = ctx.levels.find((l) => l.id === levelId);
  const rng = makeRng();
  let alive = true;
  let token = 0; // bumps whenever a new step starts, so stale async steps stop quietly

  // `given` lets the preview sandbox and the tests hand in the exact items to play.
  const items = given || pickItems((await loadBank(level)).items, store.get().seen, level, rng);
  const itemUrls = items.map((it) => itemAudioUrl(it));

  // --- trial state -----------------------------------------------------------
  let phase = 'intro';
  let index = -1;
  let item = null;
  let plugin = null; // the activity type of the current item (see src/listening/scenes)
  let view = null; // its play area
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

  const root = h('div', { class: 'screen mission', dataset: { phase, world: level.world, level: level.id }, style: { '--world': level.color || '' } },
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
    const done = view ? view.size() : 0; // how much he has done so far in this turn
    btnDone.disabled = !(responding && done > 0);
    btnUndo.disabled = !(responding && done > 0);
    btnHand.disabled = !responding;
    [...steps.children].forEach((d, i) => d.classList.toggle('on', i < done));
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
    const dots = n >= 1 && n <= 8 ? n : 0; // only when the number of things to do is small and countable
    mount(steps, Array.from({ length: dots }, () => h('i')));
    steps.hidden = dots < 1;
  }

  // --- trial flow ------------------------------------------------------------
  function startTrial() {
    index++;
    if (index >= items.length) return finish();
    item = items[index];
    attempt = 1;
    earlyTaps = 0;
    replays = 0;
    firstError = '';
    view?.destroy?.();
    plugin = sceneFor(item);
    view = plugin.create(item, host);
    root.dataset.type = item.t || 'tap';
    mount(boardWrap, view.el);
    view.fit(boardWrap);
    view.setMode('ready');
    view.setCovered(!!item.hide);
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
    view.reset();
    view.setMode('listening');
    view.setCovered(!!item.hide && !support);
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
    view.setCovered(false);
    view.setMode('respond');
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

  // What the play area tells us (every activity type uses the same four signals).
  const host = {
    sfx,
    onChange: () => refresh(), // his answer changed
    onSubmit: () => submit(), // a one-tap answer: check it straight away
    onIdle: () => pulse(btnListen, 'hint', 700), // he touched it before pressing the ear
    onEarly() {
      // Jumped in while the voice was still talking. Stay calm: count it, show "wait", carry on.
      earlyTaps = Math.min(earlyTaps + 1, 9);
      setGuide('wait');
      setTimeout(() => { if (alive && phase === 'listening') setGuide('talk'); }, 900);
    },
  };

  function onUndo() {
    if (phase !== 'respond' || !view.size()) return;
    view.undo();
    sfx.undo();
    refresh();
  }

  function onHand() {
    if (phase !== 'respond') return;
    view.reset();
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
    view.setMode('off');
    setPhase('feedback');
    const res = plugin.check(view.answer(), item);
    const ms = Date.now() - answerStart;

    if (res.correct) {
      const first = attempt === 1;
      sfx.good();
      setGuide('happy');
      view.celebrate();
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
      view.shake();
      await voice.sayPool('retry');
      if (!alive || my !== token) return;
      // Back to the start of the routine: he taps the ear again when he is ready. This time it is
      // a little slower, hidden cards stay face-up, and the dots show how many taps are needed.
      view.reset();
      view.setMode('ready');
      view.setCovered(false);
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
    view.reset();
    view.setMode('off');
    setGuide('talk');
    await audio.play(itemAudioUrl(item), { rate: 0.92, text: item.say });
    if (!alive || my !== token) return;
    setGuide('idle');
    if (plugin.isNone(item)) {
      pulse(btnHand, 'glow', 1800); // the right thing was to do nothing
      await wait(1800);
    } else {
      await view.demo(() => sfx.tap());
    }
  }

  function finish() {
    const sum = summarize(results);
    const before = store.get();
    const prevStars = before.levels[levelId]?.stars || 0;
    const card = nextCard(before.cards);
    const openBefore = openCount(ctx.levels, before);
    store.recordMission({ level: levelId, ...sum, ms: Date.now() - startedAt, counted: missionCounts(prevStars, before.rewards, level) });
    let won = [];
    store.update((s) => {
      if (card) s.cards.push(card.id);
      won = collectRewards(s); // any daily or lifetime reward this mission has just earned
    });
    ctx.go('results', { levelId, sum, card, prevStars, openBefore, won });
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
  const onResize = () => view?.fit(boardWrap);
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
      Promise.all([audio.preload(itemUrls), voice.preload(['good', 'goodEnd', 'goodWait', 'gotIt', 'retry', 'watch', 'result1', 'result2', 'result3', 'enough', level.tip].filter(Boolean))]),
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
      view?.destroy?.();
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('resize', onResize);
    },
  };
}
