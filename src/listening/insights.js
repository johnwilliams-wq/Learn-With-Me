// Turns the trial log into plain-language information for the parent view. Pure functions.

/** Skill tags used on items (`s`), in teaching order, with the label a parent sees. */
export const SKILLS = {
  name: 'Finding the thing that was named',
  detail: 'Details: colour, size, which one',
  end: 'Listening all the way to the end',
  steps2: 'Two-step instructions',
  count: 'How many times',
  hidden: 'Listen first, then look (from memory)',
  not: '“Not”',
  all: '“All”, “both”, “every”',
  except: '“Except”',
  where: 'Position words (next to, between, middle, top, bottom)',
  side: 'Left and right',
  order: '“First”, “then”, “last”',
  after: '“After”',
  before: '“Before”',
  flip: 'Before / after said backwards (“Before you do B, do A”)',
  wait: 'Waiting for the real order',
  if: '“If” instructions',
  steps3: 'Three-step instructions',
  steps4: 'Four-step instructions',
  steps5: 'Five-step instructions',
  steps6: 'Six-step instructions',
  reverse: 'Doing it in reverse order',
  skip: 'Leaving a step out on purpose',
  category: 'Groups of things (things to wear, animals...)',
  compare: 'Comparing (biggest, more than, fewer)',
  ordinal: 'Second, third, last',
  logic: 'And / or / unless / neither',
  put: 'Moving things to the right place',
  spatial: 'In, on, under, next to',
  quantity: 'How many to move or add',
  sort: 'Sorting into groups',
  paint: 'Colouring the right things',
  build: 'Building from a description',
  route: 'Following a route',
  turn: 'Turning left and right',
  landmark: 'Landmarks on the way',
  code: 'Remembering numbers and codes',
  panel: 'Switches, dials and buttons',
  truth: 'True or false?',
  story: 'Remembering story details',
  infer: 'Working it out from clues',
};

export const ERRORS = {
  incomplete: 'Stopped before finishing all the steps',
  order: 'Right things, wrong order',
  attribute: 'Right kind of thing, wrong detail (colour or size)',
  object: 'Picked a different thing',
  extra: 'Did more than was asked',
  'false-alarm': 'Acted when the instruction said not to',
  'no-response': 'Held back when there was something to do',
  place: 'Right thing, wrong place',
  count: 'Wrong number of things',
  value: 'Wrong setting, colour or number',
  path: 'Went a different way',
  choice: 'Chose the other answer',
};

const pct = (c, n) => (n ? Math.round((c / n) * 100) : 0);

export function skillStats(trials) {
  const acc = {};
  for (const t of trials) {
    for (const k of t.k || []) {
      const a = (acc[k] ||= { n: 0, c: 0 });
      a.n++;
      a.c += t.c1;
    }
  }
  return Object.keys(SKILLS)
    .filter((k) => acc[k])
    .map((k) => ({ tag: k, label: SKILLS[k], n: acc[k].n, correct: acc[k].c, pct: pct(acc[k].c, acc[k].n) }));
}

export function errorStats(trials) {
  const acc = {};
  for (const t of trials) if (t.e) acc[t.e] = (acc[t.e] || 0) + 1;
  return Object.entries(acc)
    .map(([error, n]) => ({ error, label: ERRORS[error] || error, n }))
    .sort((a, b) => b.n - a.n);
}

export function overview(state) {
  const trials = state.trials || [];
  const recent = trials.slice(-60);
  const before = trials.slice(-120, -60);
  const sum = (list, f) => list.reduce((n, t) => n + f(t), 0);
  const days = Object.values(state.days || {}).filter((d) => d.missions > 0);
  return {
    missions: (state.missions || []).length,
    days: days.length,
    minutes: Math.round(sum(days, (d) => d.ms || 0) / 60000),
    trials: trials.length,
    firstPct: pct(sum(recent, (t) => t.c1), recent.length),
    prevPct: before.length >= 20 ? pct(sum(before, (t) => t.c1), before.length) : null,
    earlyPct: pct(recent.filter((t) => t.et > 0).length, recent.length),
    prevEarlyPct: before.length >= 20 ? pct(before.filter((t) => t.et > 0).length, before.length) : null,
    replayPct: pct(recent.filter((t) => t.rp > 0).length, recent.length),
  };
}

/** Up to four short, honest observations. Needs a little data before it says anything. */
export function observations(state) {
  const trials = (state.trials || []).slice(-150);
  const out = [];
  if (trials.length < 12) return ['Not enough practice yet to say anything useful. Check back after a few missions.'];
  const skills = skillStats(trials).filter((s) => s.n >= 12); // too few turns say nothing reliable
  const weak = skills.filter((s) => s.pct < 70).sort((a, b) => a.pct - b.pct)[0];
  const strong = skills.filter((s) => s.pct >= 85).sort((a, b) => b.n - a.n)[0];
  if (strong) out.push(`Going well: ${strong.label.toLowerCase()} (${strong.correct} of ${strong.n} right first time).`);
  if (weak) out.push(`Worth practising in everyday life: ${weak.label.toLowerCase()} (${weak.correct} of ${weak.n} right first time).`);
  const o = overview(state);
  if (o.prevEarlyPct !== null && o.earlyPct <= o.prevEarlyPct - 10) out.push(`He is waiting for the whole instruction more often (jumped in early on ${o.earlyPct}% of recent turns, down from ${o.prevEarlyPct}%).`);
  else if (o.earlyPct >= 30) out.push(`He taps before the voice has finished on about ${o.earlyPct}% of turns. The game never punishes this; it just asks him to wait.`);
  const top = errorStats(trials)[0];
  if (top && top.n >= 5) out.push(`Most common slip: ${top.label.toLowerCase()} (${top.n} times recently).`);
  if (!out.length) out.push('Steady so far - nothing stands out yet.');
  return out.slice(0, 4);
}
