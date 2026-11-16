# Learn With Me - project guide

A learning game for one primary-school child, played on an iPad as an installed web app.
Phase 1 is **Listening Quest**: a recorded voice gives instructions, the child carries them out
by tapping, and the game checks that he listened *and* understood. English, math, science,
history and social studies sections are planned as later phases.

**This repository is public.** Never commit anything personal: no names, ages, schools,
photos, or descriptions of the child. The app itself stores progress only on the device.

## What must stay true (design rules)

These came from the parent's brief; do not trade them away for features.

1. **One routine, every turn**: he taps the ear when *he* is ready -> the voice talks (board frozen)
   -> he responds -> feedback. Audio always starts from his own tap.
2. **Nothing punishing**: no buzzers, red crosses, lives, timers or lost progress. First miss =
   hear it again a little slower with support; second miss = the guide shows the answer.
   Every finished mission earns a card. Tapping early is counted, never penalised.
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
src/rewards/logic.js        rules for daily rewards, lifetime tiers and chores (pure functions)
src/core/pin.js, photos.js  parent PIN (salted hash), chore photos (IndexedDB, shrunk JPEGs)
src/screens/                title, map, mission, results, collection, rewards, chores, expectations,
                            parent (tabs: Progress / Rewards / Chores / Expectations / Settings), admin (PIN pad + those tabs)
assets/data/                GENERATED: listening/levels.json, listening/<level>.json, voice.json, audio.json
assets/audio/               GENERATED voice clips (mp3): listening/ = instructions, ui/ = the guide's lines
tools/content/              levels.mjs (the curriculum + item generators), voice.mjs (guide lines), build.mjs
tools/tts/                  setup.sh, synth.py (make clips), verify.py (speech-recognition check), manifest.json
tools/build-precache.mjs    regenerates the service-worker file list in sw.js
tests/unit/                 node:test - logic, sprites, shell, and an independent check of every item
tests/e2e/                  Playwright (Chromium): smoke.cjs plus helpers with a "robot player"
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

## Adding a new subject later

Keep each subject self-contained like `src/listening/` + `tools/content/`: its own data folder, generators,
checker and screens, registered in `src/main.js`. Reuse `core/` (audio, store, sfx), `art/sprites.js`,
the mission routine and the reward loop (stars, XP, cards). Add its skill tags to the parent view.

## Releasing

Work on a branch, open a pull request; merging to `main` publishes via GitHub Pages
(Settings -> Pages -> Deploy from a branch -> `main`, `/ (root)`). The installed app picks up a new
version on its next launch.
