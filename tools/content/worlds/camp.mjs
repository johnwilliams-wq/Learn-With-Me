// Training Camp: a short run through the basics, built from the Starter levels' items.
// It teaches the routine (ear -> wait -> do it) and lets a strong listener get through fast:
// the boss is open from the start, and beating it opens every other world.

export default {
  id: 'camp', name: 'Training Camp', blurb: 'Warm up. Beat the boss to open every world.', color: '#3d8bff', allowNone: false,
  levels: [
    { id: 'camp1', title: 'Every Clue', mix: ['w1l4', 'w1l5', 'w1l6'],
      tip: 'Welcome to Training Camp! Tap the ear when you are ready. Wait until I finish talking. Then do what I said.' },
    { id: 'camp2', title: 'Two Steps', mix: ['w2l2', 'w2l3', 'w2l5'], holdMs: 700,
      tip: 'Two things to do now. Tap them in the order I say. Then press the green check mark. Made a slip? The arrow takes it back.' },
    { id: 'camp3', title: 'Tricky Words', mix: ['w3l1', 'w3l2', 'w3l3', 'w3l4', 'w3l5'],
      tip: 'Listen for the tricky words: not, all, except, next to, left, and right.' },
    { id: 'camp4', title: 'Before and After', mix: ['w4l2', 'w4l3', 'w4l4', 'w4l5'],
      tip: 'Before and after. Sometimes I say it backwards. Think: what comes first?' },
    { id: 'camp5', title: "Captain's Orders", mix: ['w5l1', 'w5l3', 'w5l4', 'w5l5'], allowNone: true,
      tip: 'Only do it if it is a real order. If it is not, tap the hand.' },
    { id: 'camp-boss', title: 'Camp Boss', boss: true, mix: ['w3l3', 'w4l4', 'w4l5', 'w5l5', 'w6l2', 'w6l3', 'w6l4'], allowNone: true, holdMs: 800,
      tip: 'Camp Boss! Three and four steps, tricky words, and changes of plan. Beat me to open every world.' },
  ],
};
