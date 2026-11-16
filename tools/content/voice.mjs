// Everything the guide (Blip) says apart from the instructions themselves.
// Tone rules: short, warm, about the listening (effort and strategy), never about being
// "smart"; a miss is never called wrong.

export const VOICE = 'af_heart';
export const UI_SPEED = 0.97;

/** Single lines, played by id. (Level tips are added automatically as `tip-<levelId>`.) */
export const LINES = {
  'hello-first': 'Hi! I am Blip, your guide. Let’s train your super listening. Tap the glowing level to start.',
  'reward-won': 'You earned a reward! Go and show a grown-up.',
  'chore-sent': 'Nice work! A grown-up will check it soon.',
  'expect-done': 'All done! Your rewards are unlocked.',
  'rewards-locked': 'First, finish your expectations. Then your rewards will open.',
  'reward-locked': 'You earned a reward! Finish your expectations to unlock it.',
};

/** Pools: one line is chosen at random each time, never the same one twice in a row. */
export const POOLS = {
  'hello-back': ['Welcome back, hero!', 'Good to see you! Ready to train?', 'Blip here. Let’s go!'],
  good: ['Yes!', 'You got it!', 'Great listening!', 'That’s it!', 'Boom! Nailed it.', 'Perfect.'],
  // only said when he really did wait and did not need to hear it twice
  goodEnd: ['Nice! You listened to every word.', 'You listened all the way to the end. Nice!', 'You waited until I finished. Nice!'],
  goodWait: ['Great waiting!', 'You waited until I finished. Nice!', 'That is how a captain listens.'],
  gotIt: ['That’s it. You got it!', 'Nice. Listening again worked.', 'There you go!'],
  retry: ['Not quite. Listen one more time.', 'Almost. Let’s hear it again.', 'Hmm, not yet. Listen again.', 'So close! One more listen.'],
  watch: ['Watch. Here is how it goes.', 'Let me show you this one.', 'That was a tricky one. Watch me.'],
  result3: ['Perfect listening! Three stars!', 'Wow! Every single one on the first try!'],
  result2: ['Great listening! Two stars!', 'Awesome job. You earned two stars!'],
  result1: ['Mission complete! Every mission makes your listening stronger.', 'You finished the mission! Want to try for two stars?'],
  enough: ['Great training today! This is a good place to stop. See you next time!'],
};
