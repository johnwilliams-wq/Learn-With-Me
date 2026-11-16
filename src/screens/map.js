// The map. Training Camp first; beating its boss opens every activity world at once. Inside a
// world the levels open one after another, but the boss is always open - the way to skip ahead.
// The gentle Starter levels sit in a drawer at the bottom. Also the way in to his rewards,
// chores and expectations (each shown only once a grown-up has set some up).

import { h, pulse, todayKey } from '../core/dom.js';
import { rankFor, isUnlocked, nextLevel, worldOpen, worldCleared } from '../listening/progress.js';
import { badges } from '../rewards/logic.js';
import { CARDS } from '../listening/cards.js';
import { iconSVG, guideSVG } from '../art/sprites.js';

export function mapScreen(ctx) {
  const { store, sfx, audio, voice } = ctx;
  const s = store.get();
  const levels = ctx.levels;
  const rank = rankFor(s.xp);
  const upNext = nextLevel(levels, s);
  const toast = h('div', { class: 'toast', hidden: true });
  const b = badges(s);
  // "Lock for the day": once today's missions are used up, nothing on the map starts a mission.
  const lockedToday = !!s.settings.hardStop && (s.days[todayKey()]?.missions || 0) >= (s.settings.dailyMissions || 3);

  const say = (text) => {
    toast.textContent = text;
    toast.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(() => { toast.hidden = true; }, 3000);
  };
  const start = (levelId) => {
    audio.unlock();
    sfx.unlock();
    if (lockedToday) {
      sfx.soft();
      say('That’s all the missions for today. See you tomorrow!');
      voice.sayPool('enough');
      return;
    }
    sfx.tap();
    ctx.go('mission', { levelId });
  };
  const open = (screen) => { audio.unlock(); sfx.unlock(); sfx.tap(); ctx.go(screen); };
  const dot = (n) => (n ? h('span', { class: 'dot' }, String(n)) : null);

  const worldName = (id) => ctx.worlds.find((w) => w.id === id)?.name || id;
  const howToOpen = (w) => {
    const needs = w.needs || [];
    if (needs.length === 1) return `Beat the ${worldName(needs[0])} boss to open this world.`;
    return `Clear ${w.needsCount || needs.length} worlds to open this one.`;
  };

  function worldSection(w) {
    const isOpen = worldOpen(w.id, levels, s);
    const cleared = !w.starter && worldCleared(w.id, levels, s);
    let n = 0;
    return h('section', { class: `world${isOpen ? '' : ' shut'}`, dataset: { world: w.id }, style: { '--world': w.color || '' } },
      h('div', { class: 'world-head' },
        h('h2', {}, w.name),
        h('p', {}, isOpen ? w.blurb || '' : howToOpen(w)),
        cleared ? h('span', { class: 'tag gold' }, 'Cleared') : null,
        isOpen ? null : h('span', { class: 'world-lock', html: iconSVG('lock') })),
      h('div', { class: 'level-row' }, w.levels.map((l) => {
        n++;
        const unlocked = isUnlocked(l.id, levels, s);
        const stars = s.levels[l.id]?.stars || 0;
        const label = l.boss ? 'Boss' : String(n);
        const btn = h('button', {
          class: `level-node${unlocked ? '' : ' locked'}${l.id === upNext.id ? ' next' : ''}${l.boss ? ' boss' : ''}`,
          type: 'button',
          dataset: { level: l.id },
          'aria-label': `${w.name}, ${l.boss ? 'boss' : `level ${n}`}: ${l.title}${unlocked ? '' : ' (locked)'}`,
        },
          h('span', { class: 'node-num' }, unlocked ? (l.boss ? h('span', { class: 'node-lock', html: iconSVG('star') }) : label) : h('span', { class: 'node-lock', html: iconSVG('lock') })),
          h('span', { class: 'node-stars' }, [1, 2, 3].map((i) => h('span', { class: i <= stars ? 'on' : '', html: iconSVG(i <= stars ? 'star' : 'star-empty') }))),
          h('span', { class: 'node-title' }, l.title));
        btn.addEventListener('click', () => {
          if (unlocked) return start(l.id);
          sfx.soft();
          pulse(btn, 'nudge', 450);
          say(isOpen ? 'Earn 2 stars on the level before - or beat this world’s boss - to open this one.' : howToOpen(w));
        });
        return btn;
      })));
  }

  const main = ctx.worlds.filter((w) => !w.starter);
  const starter = ctx.worlds.filter((w) => w.starter);
  const hasRewards = s.rewards.daily.length || s.rewards.tiers.length || b.rewardsOwed;
  const el = h('div', { class: 'screen map' },
    h('header', { class: 'map-head' },
      h('div', { class: 'rank' },
        h('div', { class: 'rank-guide', html: guideSVG('idle') }),
        h('div', { class: 'rank-info' },
          h('div', { class: 'rank-name' }, rank.name),
          h('div', { class: 'xpbar' }, h('i', { style: { width: `${rank.span ? Math.min(100, (rank.into / rank.span) * 100) : 100}%` } })),
          h('div', { class: 'rank-sub' }, rank.next ? `${rank.span - rank.into} XP to ${rank.next}` : 'Top rank!'))),
      h('div', { class: 'map-actions' },
        hasRewards ? h('button', { class: 'btn btn-chip', type: 'button', dataset: { open: 'rewards' }, 'aria-label': 'Rewards', onclick: () => open('rewards') },
          h('span', { class: 'btn-icon', html: iconSVG('gift') }), h('span', {}, 'Rewards'), dot(b.rewardsOwed)) : null,
        s.chores.list.length ? h('button', { class: 'btn btn-chip', type: 'button', dataset: { open: 'chores' }, 'aria-label': 'Chores', onclick: () => open('chores') },
          h('span', { class: 'btn-icon', html: iconSVG('chores') }), h('span', {}, 'Chores'), dot(b.choresOpen)) : null,
        s.expectations.list.length ? h('button', { class: 'btn btn-chip', type: 'button', dataset: { open: 'expectations' }, 'aria-label': 'Expectations', onclick: () => open('expectations') },
          h('span', { class: 'btn-icon', html: iconSVG('expect') }), h('span', {}, 'Expectations'), dot(b.expectLeft)) : null,
        h('button', { class: 'btn btn-chip', type: 'button', dataset: { open: 'collection' }, 'aria-label': 'My cards', onclick: () => open('collection') },
          h('span', { class: 'btn-icon', html: iconSVG('cards') }), h('span', {}, `${s.cards.length}/${CARDS.length}`)),
        h('button', { class: 'icon-btn', type: 'button', dataset: { open: 'parent' }, 'aria-label': 'For parents', html: iconSVG('parent'), onclick: () => ctx.go('parent') },
          dot(b.toCheck + b.rewardsOwed + b.toConfirm)))),
    h('main', { class: 'map-body' },
      main.map(worldSection),
      starter.length ? h('details', { class: 'starter', ontoggle: (e) => { if (e.currentTarget.open) e.currentTarget.scrollIntoView({ block: 'start', behavior: 'smooth' }); } },
        h('summary', {}, 'Starter levels', h('small', {}, ' - easier, one new thing at a time')),
        starter.map(worldSection)) : null),
    h('footer', { class: 'map-foot' },
      h('button', { class: 'btn btn-primary btn-big', type: 'button', dataset: { play: upNext.id }, onclick: () => start(upNext.id) },
        h('span', { class: 'btn-icon', html: iconSVG('play') }), h('span', { class: 'btn-label' }, 'Play'))),
    toast);

  return {
    el,
    shown() {
      el.querySelector('.level-node.next')?.scrollIntoView({ block: 'center', inline: 'center' });
      // Once, after his first mission: tell him about the skip-ahead (the boss is always open).
      const firstWorld = main[0];
      if (ctx.prev === 'results' && firstWorld && !s.flags.skipHint && !worldCleared(firstWorld.id, levels, s) && voice.has('skip-hint')) {
        store.update((st) => { st.flags.skipHint = true; });
        pulse(el.querySelector(`.world[data-world="${firstWorld.id}"] .level-node.boss`), 'hint', 900);
        voice.say('skip-hint');
      }
    },
  };
}
