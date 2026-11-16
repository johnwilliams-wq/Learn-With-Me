# Learn With Me

A learning game for a child, played on an iPad. The first part is **Listening Quest**: a friendly
guide gives spoken instructions, the child carries them out by tapping, and the game checks that he
listened and understood. It starts very simply and adds one difficulty at a time.

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
- 8 worlds, 44 levels: one-step instructions with more and more detail, two steps, tricky words
  (not, all, except, next to, left and right), time-order words (first, then, before, after), waiting
  for the real order ("Captain says", "if"), three and four steps from memory, and short stories.
- A miss is never punished. He hears it again a little slower; if needed the guide shows him.
- Each finished mission earns stars, XP and a new card for his collection.
- Missions are short (6 instructions). After a few, the game suggests stopping for the day.

## For parents

Tap the parent icon on the map. The first time, it asks a multiplication question and then lets you
choose a PIN; after that it always asks for the PIN. Inside:

- **Progress** - what he has practised, which kinds of instruction go well, what tends to go wrong,
  and ideas for practising the same skills away from the screen.
- **Rewards** - set daily rewards ("3 missions today = 15 minutes of game time") and lifetime rewards
  ("1000 points = trampoline park"). When he wins one it waits under "To hand out" until you mark it given.
- **Chores** - add chores with points. He taps Done and takes a photo; you approve it or send it back.
  Approved chores add to the same points total as missions. Photos never leave the iPad.
- **Expectations** - a daily list of things he is simply expected to do (no points, no rewards). He
  ticks them off each day; until they are all done his rewards stay locked. You can require your own OK.
- **Settings** - slower voice, daily limit, backup, erase, change PIN.

Everything stays on the device. There are no accounts, ads or tracking. Because there is no server,
the game cannot send push notifications: badges inside the app show what is waiting.

This is practice, not a test or a diagnosis.

## Development

No build step and no dependencies at run time: it is a static site.

```bash
npm test                  # unit tests
npm run build             # regenerate level data and the offline file list
npm run serve             # http://localhost:8080
node tests/e2e/smoke.cjs  # browser smoke test (needs Playwright + Chromium)
```

See [CLAUDE.md](CLAUDE.md) for the architecture, the design rules, and how to add levels and voice clips.

The voice is generated with the open-source Kokoro-82M text-to-speech model (Apache-2.0).
