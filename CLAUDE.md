# Learn With Me - project guide

A learning game for one primary-school child, played on an iPad as an installed web app.
Phase 1 is **Listening Quest**: a recorded voice gives instructions, the child carries them out
by tapping, and the game checks that he listened *and* understood. English, math, science,
history and social studies sections are planned as later phases.

**This repository is public.** Never commit anything personal: no ages, schools, photos,
surnames or descriptions of the child. The one exception, at the owner's explicit request: the
player's first name, set as `NAME` in `tools/content/voice.mjs`, so the guide can greet him and
call him by name (it is in the generated voice clips; set it to `''` for a game that names nobody).
The app itself stores progress only on the device.

## What must stay true (design rules)

These came from the parent's brief; do not trade them away for features.

1. **One routine, every turn**: he taps the ear when *he* is ready -> the voice talks (board frozen)
   -> he responds -> feedback. Audio always starts from his own tap.
2. **Nothing punishing**: no buzzers, red crosses, lives, timers or lost progress. First miss =
   hear it again a little slower with support; second miss = the guide shows the answer.
   Every finished mission earns a card. Tapping early is counted and (unless the parent turns it
   off) answered with a calm spoken reminder before he starts the instruction again; nothing is lost.
3. **Listening and understanding, not just memory**: every word that is spoken must matter.
   Scenes contain look-alikes so each detail word is needed; sound-alike words never share a scene.
4. **One new difficulty per level**; a level opens at 2 stars on the one before (or after three
   honest tries, so he can never get stuck).
5. **Reading is never required** to play. Text on child screens is decoration or for the parent.
6. **Short sessions**: 6 instructions per mission; a gentle "good place to stop" after a few missions.
7. **No accounts, ads, analytics or network calls** beyond loading the app's own files.
8. **The parent area is locked by a PIN the parent chooses on the device.** Only a salted hash is
   stored. Never put a PIN, a hash, or any family detail in this repository.
9. **Rewards never take anything away.** Daily rewards and lifetime tiers are only ever won; chore
   points arrive when a grown-up approves. Chore photos stay on the device and are deleted once checked.

## Layout

```
index.html, manifest.webmanifest, sw.js, css/app.css   app shell (static, no build step, no dependencies)
src/main.js                 start-up, screen switching, background audio download
src/core/                   dom helpers, store (localStorage), audio (voice clips), sfx, seeded rng
src/art/sprites.js          all art as inline SVG: spriteSVG(kind, color), guideSVG(mood), iconSVG(name)
src/listening/              checker (is the answer right), progress (stars/unlocks/picking items),
                            board (tappable grid), bank (data loading), cards, insights (parent stats)
src/listening/scenes/       one plug-in per activity type (tap, truth, put, paint, build, route, panel)
src/rewards/logic.js        rules for daily rewards, lifetime tiers, chores and expectations (pure functions)
src/core/pin.js, photos.js  parent PIN (salted hash), chore photos (IndexedDB, shrunk JPEGs)
src/screens/                title, map, mission, results, collection, rewards, chores, expectations,
                            parent (tabs: Progress / Rewards / Chores / Expectations / Settings), admin (PIN pad + those tabs)
assets/data/                GENERATED: listening/levels.json, listening/<level>.json, voice.json, audio.json
assets/audio/               GENERATED voice clips (mp3): listening/ = instructions, ui/ = the guide's lines
tools/content/              worlds/ (one module per world), types/ (content rules per activity type), pipeline.mjs,
                            levels.mjs (the Starter levels), voice.mjs (guide lines), build.mjs, preview.mjs
tools/tts/                  setup.sh, synth.py (make clips), verify.py (speech-recognition check), manifest.json
tools/build-precache.mjs    regenerates the service-worker file list in sw.js
tests/unit/                 node:test - logic, sprites, shell, and an independent check of every item
tests/e2e/                  Playwright (Chromium): run.cjs (scenarios), all-items.cjs (plays every item), robots/ (one per activity type)
```

## Commands

```bash
npm test                 # unit tests (must pass before every commit)
npm run build            # build:content + build:shell - run after changing levels, src, css or assets
node tests/e2e/smoke.cjs # browser run: title -> map -> a mission -> results (add ?fast=1 style flags inside)
npm run serve            # http://localhost:8080
```

`sw.js` contains a generated block; `npm test` fails if it is stale. Always run `npm run build`
last, after audio has been generated, then commit the result.

## Items (the data the game plays)

Each item in `assets/data/listening/<level>.json`:

```json
{ "id": "w2l2-07", "say": "Tap the red gem, then the blue key.", "audio": "ab12cd34ef56.mp3",
  "scene": { "cols": 3, "objects": [{ "id": "o1", "kind": "gem", "color": "red", "size": "big" }] },
  "expect": [["o1"], ["o4"]], "auto": false, "mode": "pick", "hide": true,
  "s": ["steps2", "detail"], "v": "two-colour", "g": "go" }
```

- `expect` = ordered groups of object ids; inside a group any order. `[["a"],["b"]]` = a then b;
  `[["a","b"]]` = both, any order; `[["a","a"]]` = tap twice; `[]` = must NOT act (he presses the hand).
- `auto` = checked on the first tap (single-tap items); otherwise he presses Done (Undo is available).
- `mode: "pick"` = choosing a set (tick marks, tap again to un-pick). `hide` = objects face-down while the voice talks.
- `s` = skill tags (must exist in `src/listening/insights.js` SKILLS). `v` = sentence pattern. `g` = quota group.
- Levels (`levels.json`): `trials`, `allowNone` (shows the hand button), `holdMs`, `quota`, `mix` (boss/review
  levels borrow other levels' items), `tip` (voice line id) and `tipText`.

### Adding or changing levels and sentences

1. Edit `tools/content/levels.mjs` (and `voice.mjs` for guide lines). A generator returns a draft with object
   *references*; `lib.finish()` shuffles and assigns ids. Use `only()`/`find()` style constraints so wording is never ambiguous.
2. Add a rule for any new pattern `v` to the ORACLE in `tests/unit/content.test.mjs`. That file works out every
   answer a second time from the sentence alone; it is the safety net against wrong answer keys.
3. `npm run build:content`, then make and check the new clips (below), then `npm run build` and `npm test`.

### Voice clips

Clips are generated offline with the open Kokoro-82M model (voice `af_heart`) and named by a hash of
(voice, speed, text), so identical sentences share a clip and changed text gets a new file.

```bash
bash tools/tts/setup.sh                               # once per machine; needs Hugging Face access
~/.venvs/tts/bin/python tools/tts/synth.py --prune    # make missing clips, delete unused ones
~/.venvs/tts/bin/python tools/tts/verify.py           # transcribe every clip and compare with its text
```

`verify.py` writes `tools/tts/report.json`; anything listed under `failed` must be reworded or accepted
knowingly. In Claude Code cloud sessions use the `learn-with-me` environment (it allows the Hugging Face hosts).

## Rewards and chores (all on the device)

- State lives in `store` under `rewards` (`daily`, `tiers`, `earned`), `chores` (`list`, `log`), `expectations`
  (`list`, per-day ticks, `confirm`) and `admin` (PIN hash).
- **Expectations** are a daily checklist set by the parent, with no points or rewards. Until every one of today's
  is done (`rewardsLocked`), his Rewards screen shows only a lock and the way to the list; rewards he wins are
  still recorded and wait. With `confirm` on, his tick is only `pending` until a grown-up presses OK.
- **Points are XP.** Missions add XP; an approved chore adds its points to the same total. Lifetime tiers
  are thresholds on that total; daily rewards count missions finished today.
- A mission counts toward daily rewards only if the level was below 3 stars before it was played
  (`missionCounts`), unless the parent turns that off - otherwise replaying level 1 would farm rewards.
- Everything a grown-up owes him sits in `rewards.earned` until marked "Given" in the Rewards tab.
- Chores: he taps Done -> camera (a file input with `capture`) -> photo saved in IndexedDB -> entry is
  `pending` -> the parent approves or sends it back in the Chores tab -> photo deleted.
- Reward and chore names are typed by the parent, so every row has a speaker button that reads it aloud
  with the device voice (`audio.speak`), and icons are emoji picked from a list.
- **Not built: push notifications and approving from another device.** Both need a server (Web Push needs
  one to send, and two devices need somewhere to sync). Do not add one without the owner's explicit
  decision - it changes the "nothing leaves the device" promise.

## iPad / web-app constraints (learned the hard way - keep these)

- Sound needs a user tap first: the title screen's Play button unlocks one shared `<audio>` element
  (`src/core/audio.js`); every instruction starts from the child's tap on the ear.
- Clips are fetched to Blobs and played from object URLs (no Range requests through the service worker).
- Voice goes through a media element, not Web Audio, so the iPad's mute setting does not silence it;
  only the small sound effects use Web Audio.
- Safari and the home-screen app keep separate storage: install first, then play.
- The built-in voice (`speechSynthesis`) only works on iOS after it has spoken once inside a tap; `audio.unlock()` primes it.
- Nothing may wait without a time limit (network or playback): a stuck "Listening" state is the worst failure.
- After a miss he taps the ear again (audio always starts from a tap; it also keeps the routine).
- All URLs are relative (the site lives in a sub-folder on GitHub Pages). `.nojekyll` must stay.
- It has only been tested in desktop Chromium at iPad size. Anything touching audio, storage or the
  service worker should be re-checked on the real iPad by the parent.

## Worlds and unlocking

The map is a list of **worlds** (`tools/content/worlds/index.mjs`): Training Camp, then one world per
kind of activity, then Legend Trials, then the Starter levels (the original gentle ladder, always open,
in a drawer). Inside an open world the first level and the **boss** (always the last level) are open;
every other level opens when the one before it is passed. Beating a boss with 2 stars clears its world
- that is the skip-ahead for a strong listener - and clearing Training Camp opens every activity world.
The Play button rotates between the open worlds (`nextLevel` in `src/listening/progress.js`).

## Activity types (how the listening game grows)

Every turn is still: tap the ear -> listen -> respond -> feedback. What changes between activity types is
the **play area** and what an **answer** is. Each type is a plug-in made of the pieces below; the
mission screen (`src/screens/mission.js`) never needs to know the details. `tap` and `truth` are the
reference implementations - read them before writing a new one.

| piece | file | what it does |
|---|---|---|
| play area | `src/listening/scenes/<type>.js` | `create(item, host)`, `check(answer, item)`, `isNone(item)` |
| its art (optional) | `src/art/<type>.js` | extra inline SVG, same rules as `sprites.js` (no ids, defs, text) |
| its styles | `css/scenes/<type>.css` | all selectors prefixed with a class unique to the type |
| content rules | `tools/content/types/<type>.mjs` | `finish(rng, draft)`, `validate(item, tools)`, `isNone(item)` |
| a world | `tools/content/worlds/<world>.mjs` | default-exports the world: levels, generators, spoken tips |
| answer oracle | `tests/unit/oracle-<type>.test.mjs` | works every answer out again from the sentence alone |
| checker tests | `tests/unit/scene-<type>.test.mjs` | unit tests of `check()` |
| test robot | `tests/e2e/robots/<type>.cjs` | `solve(page, item)`, `wrong(page, item)`, `isNone(item)` |

The registries (`src/listening/scenes/index.js`, `tools/content/types/index.mjs`,
`tools/content/worlds/index.mjs`) and `index.html` already name every planned type; a type that is not
built yet is a placeholder file that you replace.

### The play area: `src/listening/scenes/<type>.js`

```js
export default {
  create(item, host) {            // host = { sfx, onChange(), onSubmit(), onEarly(), onIdle() }
    return {
      el,                         // root element; it is mounted in .board-wrap
      fit(container),             // size yourself to the space you have (called on mount and on resize)
      setMode(mode),              // 'ready' | 'listening' | 'respond' | 'off' - see below
      setCovered(bool),           // true = hide what must be remembered (levels with item.hide)
      reset(),                    // forget everything he has done in this turn
      answer(),                   // his answer so far, as plain JSON, in the shape check() expects
      size(),                     // how much he has done: 0 = nothing (Done and Undo stay disabled)
      undo(),                     // take back the last thing he did
      demo(onStep),               // async: show the RIGHT answer, one step at a time (after two misses)
      celebrate(), shake(),       // a happy flourish / a gentle "not quite"
      destroy(),                  // optional: remove listeners, timers
    };
  },
  check(answer, item) { return { correct, error, at, prefix, total }; },   // pure, no DOM
  isNone(item) { return false; }, // true when the right response is to do nothing (he presses the hand)
  // retry: false,               // optional: no supported second try (two-choice answers) - a miss goes straight to the demo
};
```

- **Modes.** `ready`: frozen; any touch calls `host.onIdle()` (the ear pulses). `listening`: frozen; any
  touch calls `host.onEarly()` (he jumped in too soon - the mission counts it and reminds him).
  `respond`: interactive. `off`: frozen and silent (feedback, demo). Only act on input in `respond`.
- Call `host.onChange()` after every change to the answer, and `host.sfx.tap()` for the little click.
  Call `host.onSubmit()` only for items with `item.auto` (a one-touch answer). Otherwise he presses the
  green Done button; Undo calls your `undo()`; "Not this time" (the hand) calls `reset()` then checks.
- `check()` returns `error` as one of the keys of `ERRORS` in `src/listening/insights.js` (`''` when
  correct): `incomplete`, `extra`, `order`, `attribute`, `object`, `place`, `count`, `value`, `path`,
  `choice`, `false-alarm`, `no-response`. `total` is how many separate things had to be done (shown as
  dots on the supported retry when it is 1-8; use 0 to show none). `at`/`prefix`: index of the first
  wrong step / how many were right before it (0 if that makes no sense for the type).
- An empty answer must never be marked correct unless `isNone(item)`.
- Children's-tablet rules: every touch target at least 60 CSS px; **tap, never drag-only** (tap a thing,
  then tap where it goes - dragging may be offered as an extra); nothing requires reading (use pictures,
  colours, digits and icons; words only as decoration); show clearly what he has done so far so he can
  check it before pressing Done; `prefers-reduced-motion` is already handled globally.
- Sprites: `spriteSVG(kind, color)` for the 22 objects and 8 characters, `iconSVG(name)`, `PALETTE`
  (the six play colours plus gray) in `src/art/sprites.js`. Colour words in sentences are exactly the six
  palette names. New art goes in your own `src/art/<type>.js`.

### Content: `tools/content/types/<type>.mjs` and `tools/content/worlds/<world>.mjs`

A generator returns a **draft** - plain data plus `t: '<type>'`, the spoken sentence `say`, skill tags `s`
(keys of `SKILLS` in `src/listening/insights.js`), a pattern name `v`, and optionally `hide: true`,
`auto: true`, `g` (quota group). The type's `finish(rng, draft)` turns it into a finished item
`{ say, t, scene, expect, s, v, ...flags }` (shuffle positions, assign ids), throwing an Error whose
message contains `try again` for an unlucky random draw. `validate(item, { fail, checkObjects })` must
reject anything malformed. The pipeline adds `id` and `audio`.

```js
export default {
  id: 'pack', name: 'Move and Pack', blurb: 'One short line for the map.', color: '#18b99a', speed: 0.95,
  levels: [
    { id: 'pack1', title: 'Into the Chest', n: 18, tip: 'Spoken explanation, at most 200 characters.',
      gen(rng, i) { return { t: 'put', say: '...', /* scene parts */ s: ['put'], v: 'put-one' }; } },
    // ... 6 or 7 levels, each adding ONE difficulty, the last ones genuinely hard ...
    { id: 'pack-boss', title: 'Pack Boss', boss: true, mix: ['pack5', 'pack6', 'pack7'], tip: '...' },
  ],
};
```

- `gen(rng, i)`: `rng` is seeded (`src/core/rng.js`: `pick`, `shuffle`, `range`, `chance`, `sample`);
  use `i % k` to rotate sentence patterns so a mission is varied. `tools/content/lib.mjs` has
  `pickKinds` (never puts sound-alike words in one scene), `pickColors`, `obj`, `find`, `only`, `plural`, `an`.
- **Every spoken word must matter, and every sentence must have exactly one right answer.** Build scenes
  with look-alikes so each detail word is needed; never rely on reading; write numbers as words;
  sentences are synthesized and then checked by a speech recogniser, so avoid invented words, homophone
  traps, symbols and abbreviations. Keep a sentence under about 35 words.
- A tip is spoken before the level (until he has passed it), so it must teach the new thing by ear and
  refer to buttons by what they look like ("the green check mark", "the hand").
- Levels that include "do nothing" items need `allowNone: true` (the hand button).

### Building and testing one world without touching the game data

Never run `npm run build`, `tools/content/build.mjs` or the `tools/tts` scripts while a world is being
developed alongside others: they rewrite shared files. Use the preview instead:

```bash
node tools/content/preview.mjs tools/content/worlds/pack.mjs tests/e2e/out/pack   # build + validate one world
LWM_ITEMS_DIR=tests/e2e/out/pack node --test tests/unit/oracle-put.test.mjs       # the oracle, on the preview
node --test tests/unit/scene-put.test.mjs                                         # checker unit tests
node tests/e2e/all-items.cjs --dir tests/e2e/out/pack                             # robot plays EVERY item in the real screen
# look at it: serve the repo (python3 -m http.server 8080) and open
#   index.html?sandbox=tests/e2e/out/pack/pack1.json&fast=1&nosw=1   (fast = no real audio)
```

The **oracle test** is the safety net against wrong answer keys: for every item of the type it must work
out the right answer again from `item.say` and `item.scene` only (never from `item.expect` or from code
shared with the generator) and insist it equals `item.expect`. See `tests/unit/content.test.mjs` (tap)
and use `itemsOfType()` from `tests/unit/oracles/load.mjs`. New tap sentence patterns add their rule to
`tests/unit/oracles/tap-extra.mjs`.

The **robot** drives the real page: `solve` performs the right answer, `wrong` a definitely wrong but
non-empty one; neither presses Done or the hand (the helper does). `window.__lwm.debug.item` is the
item on screen.

## Adding a new subject later

Keep each subject self-contained like `src/listening/` + `tools/content/`: its own data folder, generators,
checker and screens, registered in `src/main.js`. Reuse `core/` (audio, store, sfx), `art/sprites.js`,
the mission routine and the reward loop (stars, XP, cards). Add its skill tags to the parent view.

## Releasing

Work on a branch, open a pull request; merging to `main` publishes via GitHub Pages
(Settings -> Pages -> Deploy from a branch -> `main`, `/ (root)`). The installed app picks up a new
version on its next launch.
