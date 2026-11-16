# Learn With Me

A learning game for a child, played on an iPad. The first part is **Listening Quest**: a friendly
guide gives spoken instructions, the child carries them out on screen, and the game checks that he
listened and understood. It starts simply, adds one difficulty at a time, and ends up genuinely hard.

## Install on the iPad

1. Open the site in **Safari**.
2. Tap the **Share** button, then **Add to Home Screen**.
3. Open it from the new home-screen icon. Do this *before* he starts playing: Safari and the
   home-screen app keep separate progress.

The first launch needs internet. After that the game downloads its voice clips in the background
and works offline.

## How it works

- Every turn follows the same routine: tap the ear when ready, wait while the guide talks, then do
  what was said.
- It starts in **Training Camp**. Beating the camp boss opens nine worlds, each with its own kind of
  task, seven levels and a boss:
  - **Memory Summit** - long orders: up to six steps, backwards, with skips and counts, from memory.
  - **Logic Lab** - count along a row, groups, two clues at once, more and fewer, unless, only if.
  - **Move and Pack** - pick things up and put them in, on or under the right place.
  - **Paint Shop** - colour the right things the right colour.
  - **Robot Workshop** - build the robot that is described, part by part.
  - **Map Routes** - steer a rover by directions, landmarks and rules.
  - **Control Room** - buttons, switches, a dial and secret codes.
  - **Truth Detector** - look at the picture: is the sentence true or not?
  - **Story Island** - longer stories, then who, when, where and why.
- In an open world the first level and the boss are open; the other levels open one by one. Beating a
  boss with two stars clears the whole world, so a strong listener can skip ahead. **Legend Trials**
  (everything mixed) opens after four worlds are cleared. The original gentle ladder stays available
  under "Starter levels" at the bottom of the map.
- A miss is never punished. He hears it again a little slower; if needed the guide shows him.
- Each finished mission earns stars, XP and a new card for his collection (180 cards).
- Missions are short (6 instructions). After a few, the game suggests stopping for the day.

## For parents

Tap the parent icon on the map. The first time, it asks a multiplication question and then lets you
choose a PIN; after that it always asks for the PIN. Inside:

- **Progress** - what he has practised, which kinds of instruction go well, what tends to go wrong,
  and ideas for practising the same skills away from the screen.
- **Rewards** - set daily rewards ("3 missions today = 15 minutes of game time") and the **reward mine**:
  rewards at the points you choose (400, 800, 2000...), each with a name, an optional description and
  an optional picture. He sees them as a mine he digs down into: he starts on the grass, and every
  reward waits at an ore - coal first, then red crystal, copper, iron, gold, emerald, lapis, diamond
  and star ore. He can scroll down to look ahead, and tap any reward to see it large and hear it.
  When he wins one it waits under "To hand out" until you mark it given.
- **Chores** - add chores with points. He taps Done and takes a photo; you approve it or send it back.
  Approved chores add to the same points total as missions. Without a family account (below) photos
  never leave the iPad.
- **Expectations** - a daily list of things he is simply expected to do (no points, no rewards). He
  ticks them off each day; until they are all done his rewards stay locked. You can require your own OK.
- Everything in those three lists can be changed later with **Edit**, and can carry a short description
  that he sees and that the speaker button reads to him.
- **Settings** - slower voice, daily limit, backup, erase, change PIN, and the family account.

There are no ads and no tracking, and by default everything stays on the device. The game cannot send
push notifications: badges inside the app show what is waiting.

### Family account (optional)

With a family account you can manage his rewards, chores and expectations from your own phone or
computer, check his chore photos there, and see his points. Without it nothing leaves the device.

1. **On the device he plays on**: For parents, Settings, Family account. Type an email address and a
   password and press *Create the family account*, then choose **He plays on this device**.
2. **On your own phone or computer**: open the game, For parents (choose a PIN for that device),
   Settings, Family account. *Sign in* with the same email address and password and choose
   **It is my own device**. Its Rewards, Chores and Expectations tabs now show HIS lists.

What you add or change on your own device is carried out on his device the next time the game is open
there with internet (it looks about once a minute); what he earns shows on yours the next time you look.
His device stays the one source of truth: his progress lives there, and only what you need to manage
things is shared - the lists you typed, his points, what he is owed, chores waiting for a check, and
their photos (kept in a private folder and deleted once you approve the chore or send it back). His
play history, the PIN and the settings never leave his device. *Delete the family account* (under
More) removes everything that is stored online.

If the family account suddenly cannot be reached on any device: a free Supabase project is paused
after a week in which nobody used it. Open the project in the Supabase dashboard and restore it;
nothing is lost, and his game works without it in the meantime.

Forgot the password? In the database's dashboard delete the user (Authentication, Users) and empty
its folder (Storage, photos), then create the account again on his device and sign in on yours.
Nothing on the devices is lost: his device simply reports everything afresh.

The account lives in a small database that belongs to the family (see CLAUDE.md, "The family
database"). Anyone who uses this code for their own child needs their own.

This is practice, not a test or a diagnosis.

## Development

No build step and no dependencies at run time: it is a static site.

```bash
npm test                  # unit tests
npm run build             # regenerate level data and the offline file list
npm run serve             # http://localhost:8080
node tests/e2e/smoke.cjs  # browser smoke test (needs Playwright + Chromium)
bash tools/db/check.sh    # the family database's rules, on a throw-away local Postgres
```

See [CLAUDE.md](CLAUDE.md) for the architecture, the design rules, and how to add levels and voice clips.

The voice is generated with the open-source Kokoro-82M text-to-speech model (Apache-2.0).
