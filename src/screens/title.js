// Title screen. The first tap here is also what unlocks sound on the iPad.

import { h, wait } from '../core/dom.js';
import { guideSVG, iconSVG } from '../art/sprites.js';

function isIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}
function isInstalled() {
  return navigator.standalone === true || globalThis.matchMedia?.('(display-mode: standalone)').matches;
}

export function titleScreen(ctx) {
  const { store, audio, sfx, voice } = ctx;
  const firstTime = !store.get().flags.welcomed;

  const play = h('button', { class: 'btn btn-primary btn-huge', type: 'button' },
    h('span', { class: 'btn-icon', html: iconSVG('play') }), h('span', { class: 'btn-label' }, 'Play'));
  play.addEventListener('click', async () => {
    play.disabled = true;
    sfx.unlock(); // inside the tap, before anything is awaited
    await Promise.race([audio.unlock(), wait(1000)]);
    sfx.star();
    await Promise.race([voice.preload(['hello-first', 'hello-back']), wait(2500)]); // never wait long on a slow network
    ctx.go('map');
    if (firstTime) {
      store.update((s) => { s.flags.welcomed = true; });
      voice.say('hello-first');
    } else if (Math.random() < 0.5) {
      voice.sayPool('hello-back');
    }
  });

  const hint = isIOS() && !isInstalled() && !store.get().flags.installHintClosed
    ? h('div', { class: 'install-hint' },
        h('span', {}, 'Grown-ups: to install, tap the Share button, then “Add to Home Screen”. Do this before he starts so his progress is kept.'),
        h('button', { class: 'icon-btn small', type: 'button', 'aria-label': 'Close', html: iconSVG('close'),
          onclick: (e) => { store.update((s) => { s.flags.installHintClosed = true; }); e.currentTarget.parentElement.remove(); } }))
    : null;

  const el = h('div', { class: 'screen title' },
    h('div', { class: 'title-stack' },
      h('div', { class: 'guide hero', html: guideSVG('happy') }),
      h('h1', { class: 'logo' }, 'Learn With Me'),
      h('p', { class: 'tagline' }, 'Listening Quest'),
      play),
    hint);
  return { el };
}
