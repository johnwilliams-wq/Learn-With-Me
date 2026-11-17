// App start-up and screen switching.

import { h, mount } from './core/dom.js';
import { createStore, memoryBackend } from './core/store.js';
import { createAudio } from './core/audio.js';
import { createSfx } from './core/sfx.js';
import { loadWorlds, loadVoiceCatalog, createVoice } from './listening/bank.js';
import { flattenLevels } from './listening/progress.js';
import { titleScreen } from './screens/title.js';
import { mapScreen } from './screens/map.js';
import { missionScreen } from './screens/mission.js';
import { resultsScreen } from './screens/results.js';
import { collectionScreen } from './screens/collection.js';
import { parentScreen } from './screens/parent.js';
import { rewardsScreen } from './screens/rewards.js';
import { choresScreen } from './screens/chores.js';
import { expectationsScreen } from './screens/expectations.js';
import { familyConfig } from './family/config.js';
import { createApi } from './family/api.js';
import { createFamily, createBox } from './family/sync.js';
import { savePhoto, localPhoto, hasPhoto, deletePhoto, setPhotoSource } from './core/photos.js';

export const VERSION = '1.0.0';

const app = document.getElementById('app');
const params = new URLSearchParams(location.search);
// ?sandbox=<path to a JSON file> plays one made-up level ({ level, items }) straight away, saving nothing.
// It is how new activity types are previewed and tested before they are part of the game.
const sandbox = params.get('sandbox');
const store = createStore(sandbox ? memoryBackend() : undefined);
const audio = createAudio();
const sfx = createSfx();
if (params.has('fast')) audio.setFast(true); // automated tests only: skip real playback

// The optional family account (src/family/sync.js). Until a grown-up signs in, in the parent
// area, it does nothing at all and nothing leaves this device.
const box = createBox(sandbox ? memoryBackend() : undefined);
const family = createFamily({
  store,
  box,
  api: createApi({ ...familyConfig(), session: { get: () => box.get().session, set: (s) => box.set((b) => { b.session = s; }) } }),
  photos: { load: localPhoto, save: savePhoto, has: hasPhoto, delete: deletePhoto },
  screen: () => ctx.debug.screen,
});
setPhotoSource(family.picture);

const screens = {
  title: titleScreen,
  map: mapScreen,
  mission: missionScreen,
  results: resultsScreen,
  collection: collectionScreen,
  parent: parentScreen,
  rewards: rewardsScreen,
  chores: choresScreen,
  expectations: expectationsScreen,
};

const ctx = {
  version: VERSION,
  store,
  family,
  audio,
  sfx,
  voice: null,
  worlds: [],
  levels: [],
  debug: {}, // read by the automated tests
  go,
  applySettings,
};
globalThis.__lwm = ctx;

let current = null;
let nav = 0;
let reloadWhenIdle = false;
let shownWith = {}; // what the screen that is showing was opened with

async function go(name, p = {}) {
  const my = ++nav;
  if (reloadWhenIdle && (name === 'title' || name === 'map')) return location.reload();
  try {
    const next = await screens[name](ctx, p);
    if (my !== nav) return void next.destroy?.();
    current?.destroy?.();
    current = next;
    mount(app, next.el);
    ctx.prev = ctx.debug.screen; // where he came from
    ctx.debug.screen = name;
    shownWith = p;
    next.shown?.();
  } catch (err) {
    if (my === nav) showError(err, () => go(name, p));
  }
}

function applySettings() {
  sfx.setEnabled(store.get().settings.sfx !== false);
}

function showError(err, retry) {
  console.error(err);
  current?.destroy?.();
  current = null;
  mount(app,
    h('div', { class: 'screen title' },
      h('div', { class: 'panel small', style: { display: 'grid', gap: '14px', textAlign: 'center' } },
        h('h2', {}, 'Could not load the game'),
        h('p', { class: 'fine' }, 'Check the internet connection, then try again.'),
        h('button', { class: 'btn btn-primary', type: 'button', onclick: retry }, 'Try again'))));
}

async function boot() {
  applySettings();
  navigator.storage?.persist?.().catch(() => {}); // ask the browser not to clear his progress when space is short
  try {
    const [worldsFile, catalog] = await Promise.all([loadWorlds(), loadVoiceCatalog()]);
    ctx.worlds = worldsFile.worlds;
    ctx.levels = flattenLevels(ctx.worlds);
    ctx.voice = createVoice(audio, catalog);
    if (sandbox) {
      const box = await (await fetch(sandbox, { cache: 'no-store' })).json();
      const level = { world: 'sandbox', worldName: 'Preview', tipText: '', trials: box.items.length, ...box.level, id: box.level?.id || 'sandbox', needs: [], needsCount: 0, starter: true };
      ctx.levels = [...ctx.levels, level];
      return void (await go('mission', { levelId: level.id, items: box.items.slice(0, level.trials) }));
    }
    await go('title');
  } catch (err) {
    showError(err, boot);
  }
}

// --- make it feel like an app, not a web page -------------------------------
for (const type of ['gesturestart', 'gesturechange', 'dblclick', 'contextmenu']) {
  document.addEventListener(type, (e) => {
    if (!e.target.closest?.('.parent')) e.preventDefault();
  }, { passive: false });
}

// --- offline support / updates ----------------------------------------------
if ('serviceWorker' in navigator && !params.has('nosw')) {
  const hadController = !!navigator.serviceWorker.controller;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').then((reg) => {
      // also look for a new version whenever the app comes back to the front, not only on a cold start
      document.addEventListener('visibilitychange', () => { if (!document.hidden) reg.update().catch(() => {}); });
    }).catch(() => {});
  });
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController) return; // first install: nothing to refresh
    if (ctx.debug.screen === 'title') location.reload();
    else reloadWhenIdle = true; // never interrupt a mission; refresh at the next quiet moment
  });
}

/**
 * Quietly download every instruction clip in the background (a few at a time) so the
 * whole game works with no internet after the first visit. The service worker stores them.
 */
async function warmAudio() {
  try {
    if (!('serviceWorker' in navigator) || params.has('nosw') || !globalThis.caches || navigator.connection?.saveData) return;
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) { // very first visit: wait until the worker has taken charge of this page
      await new Promise((resolve) => navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true }));
    }
    const list = await (await fetch('assets/data/audio.json', { cache: 'no-cache' })).json();
    let i = 0;
    const worker = async () => {
      while (i < list.length) {
        const url = list[i++];
        while (ctx.debug.screen === 'mission') await new Promise((r) => setTimeout(r, 4000)); // stay out of a mission's way
        if (!(await caches.match(url))) await fetch(url).catch(() => {});
      }
    };
    await Promise.all([worker(), worker(), worker()]);
  } catch { /* best effort */ }
}

// --- the family account: keep in step while the app is in front ---------------
// The device he plays on reports after every change and looks for what grown-ups asked for;
// a grown-up's own device only looks while its parent area is open - except that
// a change that has not left it yet is sent as soon as it can be, whatever is on screen.
// What a grown-up does from their own device is carried out here - and must show on the screen he
// is looking at: an expectation ticked for him that still looks empty would be un-ticked by his own
// tap. His list screens are drawn again (not while he is in the middle of something: a big view
// that is open, the camera).
family.subscribe((what) => {
  if (what !== 'data' || family.status().role !== 'player') return;
  const on = ctx.debug.screen;
  if (!['map', 'rewards', 'chores', 'expectations'].includes(on)) return;
  if (ctx.debug.camera || document.querySelector('#app .overlay')) return;
  go(on, shownWith);
});

const inStep = () => { const st = family.status(); return st.role === 'player' || ctx.debug.screen === 'parent' || st.unsent > 0; };
store.subscribe(() => family.kick('change'));
document.addEventListener('visibilitychange', () => { if (!document.hidden && inStep()) family.kick('look'); });
setInterval(() => { if (!document.hidden && inStep()) family.kick('tick'); }, 30000);

boot().then(() => {
  setTimeout(warmAudio, 5000);
  if (inStep()) family.kick('look');
});
