# Learn With Me - project guide

A learning game for one primary-school child, played on an iPad as an installed web app.
Phase 1 is **Listening Quest**: a recorded voice gives instructions, the child carries them out
on screen (tapping, moving, painting, building, steering, pressing, judging true or false), and the
game checks that he listened *and* understood. English, math, science,
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
7. **No ads, no analytics, no third parties.** The app loads its own files and nothing else - with one
   exception the owner decided on: the family's own private database (see "The family database"),
   used only after a grown-up has signed in in the parent area. Without a sign-in nothing leaves the device.
8. **The parent area is locked by a PIN the parent chooses on the device.** Only a salted hash is
   stored. Never put a PIN, a hash, or any family detail in this repository.
9. **Rewards never take anything away.** Daily rewards and lifetime tiers are only ever won; chore
   points arrive when a grown-up approves. Chore photos stay on the device (with a family sign-in:
   also in the family's private folder, so a grown-up can check them elsewhere) and are deleted once checked.

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
src/rewards/actions.js      act(): everything a grown-up can do to those lists, as named actions
src/family/                 the optional family account: config (project address), api (the few calls),
                            shape (what is shared), sync (the device he plays on <-> a grown-up's device)
src/core/pin.js, photos.js  parent PIN (salted hash), pictures (IndexedDB, shrunk JPEGs)
src/screens/                title, map, mission, results, collection, rewards, chores, expectations,
                            parent (tabs: Progress / Rewards / Chores / Expectations / Settings), admin (PIN pad + those tabs),
                            family (the account panel in Settings)
supabase/migrations/        the family database: tables, row level security, the private photo folder
tools/db/                   check.sh: applies the migrations to a throw-away Postgres and checks who can do what
assets/data/                GENERATED: listening/levels.json, listening/<level>.json, voice.json, audio.json
assets/audio/               GENERATED voice clips (mp3): listening/ = instructions, ui/ = the guide's lines
tools/content/              worlds/ (one module per world), types/ (content rules per activity type), pipeline.mjs,
                            levels.mjs (the Starter levels), voice.mjs (guide lines), build.mjs, preview.mjs
tools/tts/                  setup.sh, synth.py (make clips), verify.py (speech-recognition check), retake.py (second takes),
                            manifest.json, verified.json, report.json, tweaks.json, accepted.json
tools/build-precache.mjs    regenerates the service-worker file list in sw.js
tools/icons/                the owner's picture (source.png) and make.py, which makes assets/icons/ from it
tests/unit/                 node:test - logic, sprites, shell, and an independent check of every item
tests/e2e/                  Playwright (Chromium): run.cjs (scenarios), all-items.cjs (plays every item), robots/ (one per activity type),
                            family-server.cjs (a stand-in for the family database), live-family.mjs (a try-out on the real one)
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
- `t` = activity type (missing = `tap`, the format shown above). Every other type has its own `scene` and
  `expect` shapes, described at the top of `tools/content/types/<type>.mjs` and checked by its `validate()`.
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

`verify.py` writes `tools/tts/report.json`; anything listed under `failed` is dealt with in this order:
(1) if the recogniser only spelt a true sound-alike differently (right / write), add the pair to `SAME` in
`verify.py`; (2) if it shows a real risk for a listener ("hid a key" heard as "hit a key"), reword the
sentence in its generator; (3) if the take itself stumbled (a swallowed syllable), run
`~/.venvs/tts/bin/python tools/tts/retake.py`, which tries other speeds, keeps the first take that both
recognisers hear correctly and records it in `tools/tts/tweaks.json`; (4) only then accept it knowingly
in `tools/tts/accepted.json`, with the reason. In Claude Code cloud sessions use the `learn-with-me` environment (it allows the Hugging Face hosts).

## Rewards and chores (all on the device)

- State lives in `store` under `rewards` (`daily`, `tiers`, `earned`), `chores` (`list`, `log`), `expectations`
  (`list`, per-day ticks, `confirm`) and `admin` (PIN hash).
- **Expectations** are a daily checklist set by the parent, with no points or rewards. Until every one of today's
  is done (`rewardsLocked`), his Rewards screen shows a lock and the way to the list, and nothing can be collected:
  what he wins is still recorded and waits. He can always LOOK at his reward mine there (the owner asked for
  that; looking ahead is the point of it): a reward he has reached shows as found, with a lock instead of
  "WON!". With `confirm` on, his tick is only `pending` until a grown-up presses OK.
- **Points are XP.** Missions add XP; an approved chore adds its points to the same total. Lifetime tiers
  are thresholds on that total; daily rewards count missions finished today.
- **The two kinds of reward have a section each** (the owner asked for that after typing long-term rewards
  into the daily list): the *reward mine* - long-term, each unlocked once by points - and the *daily rewards* -
  won again every day. In the parent area the Rewards tab keeps "To hand out" on top and has a switch between
  the two sections (`rewardsPart` in `src/screens/admin.js`; it opens on the mine), each saying what the other
  one is for. His Rewards screen has two big buttons, Mine and Today (`src/screens/rewards.js`; they stay in
  sight while he scrolls, and only appear when he has rewards of both kinds). Never list the two together again.
- **The reward mine** is how he sees the lifetime tiers (`ladder(state)` in `src/rewards/logic.js`,
  drawn by `src/screens/mine.js` inside `src/screens/rewards.js`, styles in `css/mine.css`, art in
  `src/art/mine.js`): a side view of the ground. He starts on the grass and his shaft goes down as his
  points grow; every tier, in order of points, waits at an ore - coal, red crystal, copper, iron, gold,
  emerald, lapis, diamond, star ore (the owner's order; further tiers are all star ore). An ore he has
  reached is shown as found. He scrolls down to look ahead; tapping a reward shows it large and reads
  it aloud. The art is our own: do not copy the blocks, characters or names of any existing game.
  A tier he has already reached when it is added or changed is won at once; raising it later never
  takes it back.
- **Everything a grown-up types goes through `addItem` / `editItem` / `removeItem`** (same file): daily
  rewards, tiers, chores and expectations each have `title`, `icon` and an optional `note` (the
  description, shown to him and read by the speaker button); a tier may have a `photo` (the id of a
  picture in IndexedDB, `src/core/photos.js`). Both fields are optional in saved data - older saves
  do not have them. The parent area (`src/screens/admin.js`) uses one form for adding and for Edit.
  A reward picture is deleted when its tier is removed or gets another picture; it is not part of a
  backup, so screens must fall back to the emoji when a picture is missing (`showPhoto`).
- **The parent area never touches the save itself.** Every change is a named action carried out by
  `act(state, type, payload)` (`src/rewards/actions.js`: add / edit / remove / given / chore / expect /
  option), reached through a "desk" (`ctx.family.desk()`): `state()` to read, `run(type, payload)` to
  change, `savePhoto(blob)`. On the device he plays on the desk is this device's own save; on a
  grown-up's own device it is his device from afar (see the family database). A new thing a grown-up
  can do = a new action there, never a `store.update` in a screen. Actions must stay safe to carry out
  twice and must treat their payload as untrusted (it can arrive from another device). An action that
  is about a day says which day (`expect` carries `day`): it may arrive the next morning.
- **The PIN** is only replaced once a new one has been typed twice (`pinGate(..., { change: true })`):
  never clear it first. It belongs to the device, not to the save: a backup carries none (not even
  its hash) and a restore leaves this device's PIN alone. News from another device redraws the open
  tab, but never over the PIN pad, a row being edited or a form someone has touched (`typing()` in
  `src/screens/parent.js`).
- **Every button in the parent area redraws its tab** - that is where its bugs came from (a bug hunt
  found 27; `tests/unit/parent-rules.test.mjs` and scenario 24 keep them fixed). What follows from it:
  - a button in a row goes through `once()` (`src/screens/admin.js`): after the first tap of a double
    tap the list has been redrawn and the NEXT row sits under the finger;
  - a button redraws the tab where it is (`show(tab, { keep: true })`); only another tab starts at the top;
  - what a grown-up has started is kept across redraws (`kept` in `admin.js`: a touched form is put
    back as it is; a row being changed is finished before another is opened);
  - a button that cannot be taken back (Erase, Delete the family account) needs two presses with a
    moment between them, and its warning wears off.
  Parents use phones: look at the map and the parent area at 390 px wide, not only at iPad size.
- **Chores, the fine print:** the log is cut to 300 entries but never loses an entry that waits for a
  check or the approval that finished a one-time chore (`trimLog`); a chore sent back after its day
  was over still shows "try again" with the note (`choreStatus`); a chore made "one time only" while
  an entry waits keeps that entry. A tick that waited for an OK counts once "needs my OK" is off.
- A mission counts toward daily rewards only if the level was below 3 stars before it was played
  (`missionCounts`), unless the parent turns that off - otherwise replaying level 1 would farm rewards.
- Everything a grown-up owes him sits in `rewards.earned` until marked "Given" in the Rewards tab.
- Chores: he taps Done -> camera (a file input with `capture`) -> photo saved in IndexedDB -> entry is
  `pending` -> the parent approves or sends it back in the Chores tab -> photo deleted.
- Reward and chore names are typed by the parent, so every row has a speaker button that reads it aloud
  with the device voice (`audio.speak`), and icons are emoji picked from a list.
- **Managing from another device** (the grown-up's phone or computer) works through the family
  account: see "The family database" below. **Push notifications are not built**; they would be a
  further step (a function that sends them) and need the owner's go-ahead.

## The family database (Supabase) - the owner's decision, November 2026

The owner created a small Supabase project of their own so that a grown-up can manage rewards, chores
and expectations (with pictures) from their own phone or computer, check chore photos there, and see
his points. His detailed play history stays on the device.

- **State of the work:** both sides are built, and the database side is live in the project (both
  files in `supabase/migrations/` were applied on 16 November 2026, by hand through Supabase's
  management API - the GitHub link had not applied them; they are safe to apply again). Nothing talks
  to the database until a grown-up signs in (parent area, Settings, "Family account"); a device that
  is not signed in behaves exactly as before.
- **Project:** `https://kfgtrroainxuoqfncdgf.supabase.co`. The app uses only the *publishable* key
  (`sb_publishable_...`, safe to commit; it is in `src/family/config.js`) plus
  the family's own sign-in. **Never** commit or ask for the database password, a connection string or
  a secret / service_role key. This repository is public.
- **Model: one family = one account; the device he plays on stays the source of truth.**
  `family_state` holds one row per family - what a grown-up's device needs to see (the lists, his
  points, what he is owed, chores waiting). It is written by the device he plays on. `commands` holds
  what a grown-up does on another device (add / change / remove something, approve a chore, mark a
  reward as given); the device he plays on carries them out in order with the same pure functions as
  the parent area (`addItem`, `editItem`, `removeItem`, `decideChore`...) and marks them applied.
  No merging of two devices' states, so nothing can be lost to a conflict. Pictures live in the
  private storage bucket `photos`, each family in a folder named after its account id.
- **Row level security on everything**: a signed-in family reads and writes its own rows and files
  only; a visitor who is not signed in gets nothing. Tables are granted to `authenticated` only.
  A sign-in stays good for up to an hour after its account is deleted on another device: rows can
  no longer be added then (they point to the account), and files neither (the two rules that add or
  replace a file ask `private.family_exists()`), so "Delete the family account" leaves nothing behind.
- **Changing the database:** add a new file in `supabase/migrations/` (never edit one that has been
  applied). `bash tools/db/check.sh` applies all migrations to a throw-away local Postgres with a
  stand-in for Supabase's roles and storage tables, and checks who can read and write what - run it
  before every change. The owner linked the repository to the project: migrations are meant to be
  applied by Supabase when they reach `main` (that needs "Deploy to production" switched on in the
  project's GitHub integration) - afterwards, check that the change really is there
  (`GET /rest/v1/<table>` stops answering `PGRST205`); pasting the file into the SQL editor also works.
- **The app side** (`src/family/`, no library - a few `fetch` calls with time limits):
  `sync.js` runs "rounds". The **player** round (he plays here): reads who the player device is, carries
  out waiting commands with `act()` (fetching a picture a command brings first), sends new pictures and
  deletes unused ones, publishes `snapshot(state)` (`shape.js`: the lists, points, what he is owed,
  pending chores, today's ticks and a few totals - never the PIN, settings or play history), then ticks
  the commands off - in that order, so a grown-up's device never sees "carried out" without the result.
  The **manager** round (a grown-up's device): sends its queued commands in order, asks which were
  carried out, then reads the snapshot; what it shows is the snapshot with its own waiting commands on
  top (`viewOf`), so a change shows at once. Rounds run after a change (debounced), when the app comes
  to the front, about once a minute on his device and while a grown-up's parent area is open - never
  during a mission. Failures are silent for him; the panel in Settings says how the account is doing.
  Trouble with a picture never holds up his state or the commands (it is reported and retried), every
  call to the photo store inside a round has a time limit, and a change that has not left a grown-up's
  device is retried whatever is on screen.
- **What a win is called** (`earn()` in `src/rewards/logic.js`): the id of something he has won is
  worked out from what it was won for (the reward, the day, the chore entry), never made up - a
  grown-up's device shows a win before his device has heard of it, and "Given" pressed there must
  mean the same thing on both. Keep it that way for anything new that both devices can create.
- **Pictures are deleted when they are let go of** (`drop`, `release`, sign-out, account deletion) -
  not by looking for what "nothing points to": a picture in the folder may be the only copy (a new
  iPad that signs in before its backup is restored points to nothing yet). The sweep in `tidy()` only
  takes strays that are a month old, on a device that has been "his" for a month, when no command is
  waiting. An upload is given up only when it can never succeed (too big, not a picture).
- **Text that goes to the database must be whole** (`wellFormed`, used by `tidy()` and by everything
  that is sent): the column type refuses half an emoji or a zero byte, and one such name would stop
  his device from reporting at all. Cut with `tidy()`, never with a bare `.slice()`.
- **How the real services answer** differs from what one would guess, and the stand-in follows the
  real thing: the picture service wraps most trouble in HTTP 400 with the true status inside
  (`statusCode`), refuses a run-out sign-in with `"exp" claim timestamp check failed` (plain "not
  found" on the un-authenticated download address), and sign-up with an address that exists answers
  200 with a made-up user when addresses must be confirmed. `src/family/api.js` reads all of these.
- What a device remembers about the account (the sign-in, its role, the queue, which commands it has
  carried out) is its own localStorage record `lwm.family.v1` - **never inside the save**, so a backup
  never contains a sign-in. Signing out forgets it; his save is never touched by signing in or out.
- Only one device is the player (`family_state.player_device`). Choosing "He plays on this device"
  elsewhere asks first; the old one then steps back to a grown-up's device and its own game is untouched.
- Pictures are named by their id in the family's folder. Ids and everything else read from the
  database are untrusted: ids are checked against a pattern before they go into an address, and
  `stateFrom()` rebuilds the lists defensively.
- **Project settings** (in the Supabase project, not in this repository): "Confirm email" is off, so
  the account can be created inside the game. Once the family account exists, "Allow new users to
  sign up" is to be switched off, so nobody else can make an account in the project (they could
  never see the family's rows, but they do not belong there).
- **Doing things in the project from a Claude Code cloud session:** the owner saved a Supabase access
  token in the `learn-with-me` environment (a network secret for `api.supabase.com`; its value is
  never visible to the session or in this repository). With it, `POST /v1/projects/<ref>/database/query`
  runs a migration file and `PATCH /v1/projects/<ref>/config/auth` changes sign-in settings. Use it
  only for what the owner asked for, and check afterwards what really changed. The owner can
  revoke the token at any time; without it, changes go through the dashboard.
- **Testing it:** `tests/unit/family.test.mjs` runs two devices against `tests/e2e/family-server.cjs`
  (the same addresses, status codes and error bodies as the real services, answered from memory);
  scenario 23 of `tests/e2e/run.cjs` clicks through it with two browsers (`?family=http://127.0.0.1:<port>`
  points the app at the stand-in - honoured only when the app itself runs on this computer).
  `NODE_USE_ENV_PROXY=1 node tests/e2e/live-family.mjs --yes` tries the real project with a throw-away
  account that it deletes again; it refuses to run while new accounts need an email confirmation.
- In Claude Code cloud sessions the `learn-with-me` environment allows the project's address.

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
`tools/content/worlds/index.mjs`) and `index.html` (one stylesheet per type) name every type. All seven
are built: `tap`, `truth`, `put`, `paint`, `build`, `route`, `panel`. A new type is added to all four.

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
  `respond`: interactive. `off`: frozen and silent (feedback, demo, and the short pause between the end
  of the sentence and "go"). Only act on input in `respond`. Touches that land between your controls
  are caught by the mission itself (a listener on `.board-wrap`), and so are presses on the switched-off
  hand, check mark and back arrow - you only report touches on your own controls.
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
- Levels that include "do nothing" items need `allowNone: true` (the hand button). The build switches
  the hand off again for any level whose items never need it, so it is only on screen where it can be right.
- What reviewers of the spoken content keep finding (check new sentences against this list): an order
  that is checked but never spoken; "or" without "or both"; a bare "the first one" after "from the right";
  a colour word straight after a thing that does not get that colour; "on the way" for something far off
  the way; "then" used both for sequence and for a condition; a tricky word (unless, neither, only if,
  all but one) that no tip of that world explains; verbs that sound like a colour or a thing on screen
  (read / red, rang / ring); names that sound alike in one story.

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

**An update must never cost him his progress.** Everything he has is one JSON object in localStorage
(`lwm.state.v1`, `src/core/store.js`) plus chore photos in IndexedDB. Rules: only ever ADD to the save
(`migrate()` fills in what an older save lacks); never rename or remove a level id, card id or field;
a save that cannot be read is copied to `lwm.state.v1.bad`, never thrown away. Before publishing,
rehearse the real update: `node tests/e2e/upgrade.cjs sw nosw` plays the first release (commit 8cd3c39)
with rewards, chores, photos and a PIN, swaps in the working tree, lets the service worker update by
itself and compares every saved value and what the screens show. For a moment after publishing, the
old page code still runs with the new `assets/data` (data is fetched network-first): that is why the
Starter worlds come first in `levels.json`, and why level data must stay readable by the previous release.
