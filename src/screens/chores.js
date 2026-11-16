// His chores. A grown-up sets them up in the parent area; he taps one when it is done,
// takes a photo, and it waits for a grown-up to check. Points arrive when it is approved.

import { h, mount } from '../core/dom.js';
import { choreStatus, submitChore } from '../rewards/logic.js';
import { savePhoto, loadPhoto, shrinkImage } from '../core/photos.js';
import { iconSVG, guideSVG } from '../art/sprites.js';

export function choresScreen(ctx) {
  const { store, audio, sfx, voice } = ctx;
  const body = h('main', { class: 'list-body' });
  const urls = []; // object URLs to release when leaving
  let chosen = null;
  let alive = true;

  // The camera opens through a file input: the most dependable way on an iPad.
  const camera = h('input', { type: 'file', accept: 'image/*', capture: 'environment', class: 'visually-hidden', tabindex: '-1', 'aria-hidden': 'true' });
  camera.addEventListener('change', () => {
    const file = camera.files && camera.files[0];
    camera.value = '';
    if (file && chosen) preview(chosen, file);
  });

  const say = (text) => h('button', { class: 'icon-btn small', type: 'button', 'aria-label': 'Read it to me', html: iconSVG('speaker'),
    onclick: () => { audio.unlock(); audio.speak(text); } });

  function render() {
    const s = store.get();
    const rows = s.chores.list.map((c) => ({ c, st: choreStatus(c, s.chores.log) })).filter((x) => x.st.state !== 'finished');
    if (!rows.length) {
      return mount(body, h('div', { class: 'empty-state' },
        h('div', { class: 'guide medium', html: guideSVG('idle') }),
        h('p', {}, 'No chores yet. Ask a grown-up to add some!')));
    }
    mount(body, h('section', { class: 'panel' }, rows.map(({ c, st }) => {
      const open = st.state === 'open' || st.state === 'rejected';
      const thumb = h('span', { class: 'thumb' });
      if (st.state === 'pending' && st.entry.photo) {
        loadPhoto(st.entry.photo).then((blob) => {
          if (!blob || !alive) return;
          const url = URL.createObjectURL(blob);
          urls.push(url);
          thumb.append(h('img', { src: url, alt: '' }));
        });
      }
      return h('div', { class: `chore-row state-${st.state}`, dataset: { chore: c.id } },
        h('span', { class: 'emoji' }, c.icon || '✅'),
        h('div', { class: 'reward-main' },
          h('div', { class: 'reward-title' }, c.title),
          c.note ? h('div', { class: 'reward-note' }, c.note) : null,
          h('div', { class: 'chore-sub' },
            h('span', { class: 'tag xp' }, `+${c.points} XP`),
            c.reward ? h('span', { class: 'tag gold' }, c.reward) : null,
            st.state === 'rejected' ? h('span', { class: 'tag' }, st.entry.note ? `Try again: ${st.entry.note}` : 'Try again') : null)),
        st.state === 'pending' ? h('div', { class: 'chore-wait' }, thumb, h('span', {}, 'Waiting for a grown-up')) : null,
        st.state === 'approved' ? h('span', { class: 'stamp given' }, 'Done ✓') : null,
        open ? h('button', { class: 'btn btn-done', type: 'button', dataset: { act: 'done' }, onclick: () => start(c) },
          h('span', { class: 'btn-icon', html: iconSVG(s.chores.requirePhoto === false ? 'check' : 'camera') }), h('span', { class: 'btn-label' }, 'Done!')) : null,
        say(`${c.title}. ${c.note ? `${c.note}. ` : ''}${c.points} points.`));
    })));
  }

  function start(chore) {
    audio.unlock();
    sfx.unlock();
    if (store.get().chores.requirePhoto === false) return send(chore, null);
    chosen = chore;
    camera.click();
  }

  async function preview(chore, file) {
    let blob = null;
    try {
      blob = await shrinkImage(file);
    } catch { /* fall through: offer to send without the picture */ }
    if (!alive) return;
    const url = blob ? URL.createObjectURL(blob) : null;
    if (url) urls.push(url);
    const close = () => overlay.remove();
    const overlay = h('div', { class: 'overlay' },
      h('div', { class: 'panel photo-panel' },
        h('h2', {}, chore.title),
        url ? h('img', { class: 'photo-preview', src: url, alt: 'Your photo' }) : h('p', { class: 'tip' }, 'The photo did not work. You can still send it.'),
        h('div', { class: 'row' },
          h('button', { class: 'btn btn-done btn-big', type: 'button', dataset: { act: 'send' }, onclick: () => { close(); send(chore, blob); } }, 'Send it'),
          h('button', { class: 'btn', type: 'button', onclick: () => { close(); start(chore); } }, 'Take it again'),
          h('button', { class: 'btn', type: 'button', onclick: close }, 'Cancel'))));
    el.append(overlay);
  }

  async function send(chore, blob) {
    let photoId = null;
    if (blob) {
      try {
        photoId = await savePhoto(blob);
      } catch { /* storage unavailable: send it without the picture rather than lose his effort */ }
    }
    store.update((s) => { submitChore(s, chore, photoId); });
    sfx.good();
    voice.say('chore-sent');
    if (alive) render();
  }

  const el = h('div', { class: 'screen chores' },
    h('header', { class: 'sub-head' },
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Back', html: iconSVG('back'), onclick: () => ctx.go('map') }),
      h('h1', {}, 'Chores'),
      h('div', { class: 'count' }, `${store.get().xp} XP`)),
    body, camera);
  render();

  return {
    el,
    destroy() {
      alive = false;
      audio.stop();
      for (const u of urls) URL.revokeObjectURL(u);
    },
  };
}
