// The collection: one new card is earned for every finished mission (never random
// duplicates, never a blank - effort is always rewarded). 180 cards: every thing and
// every friend in every colour.

import { OBJECT_KINDS, CHARACTER_KINDS } from '../art/sprites.js';

const TITLE = { red: 'Ember', blue: 'Frost', green: 'Forest', yellow: 'Sun', purple: 'Mystic', orange: 'Blaze' };
const cap = (s) => s[0].toUpperCase() + s.slice(1);

const GEAR = [
  ['shield', 'blue'], ['sword', 'red'], ['key', 'yellow'], ['gem', 'green'], ['potion', 'purple'], ['boot', 'orange'],
  ['crown', 'yellow'], ['map', 'green'], ['torch', 'orange'], ['hat', 'purple'], ['ring', 'red'], ['book', 'blue'],
  ['rocket', 'red'], ['star', 'yellow'], ['bell', 'orange'], ['drum', 'green'], ['egg', 'purple'], ['flag', 'blue'],
  ['mushroom', 'red'], ['coin', 'yellow'], ['heart', 'red'], ['chest', 'blue'], ['gem', 'purple'], ['shield', 'green'],
  ['sword', 'blue'], ['potion', 'green'], ['key', 'purple'], ['crown', 'red'], ['rocket', 'blue'], ['hat', 'orange'],
];

const FRIENDS = [
  ['robot', 'blue', 'Bolt the Robot'], ['cat', 'orange', 'Pounce the Cat'], ['owl', 'purple', 'Hoot the Owl'],
  ['fox', 'red', 'Dash the Fox'], ['dragon', 'green', 'Puff the Dragon'], ['ghost', 'blue', 'Boo the Ghost'],
  ['knight', 'yellow', 'Sir Clank'], ['wizard', 'purple', 'Zazz the Wizard'], ['dragon', 'red', 'Scorch the Dragon'],
  ['robot', 'green', 'Gears the Robot'], ['cat', 'purple', 'Shadow the Cat'], ['owl', 'yellow', 'Blink the Owl'],
];

// Every other colour of every thing and every friend follows the first cards, so the collection
// lasts as long as the game does. (Names are only decoration; nothing here has to be read.)
const NAMES = {
  robot: { red: 'Sparks', yellow: 'Beep', purple: 'Widget', orange: 'Rusty' },
  cat: { red: 'Ruby', blue: 'Misty', green: 'Clover', yellow: 'Sunny' },
  owl: { red: 'Rosie', blue: 'Sky', green: 'Moss', orange: 'Amber' },
  fox: { blue: 'Frosty', green: 'Fern', yellow: 'Goldie', purple: 'Plum', orange: 'Maple' },
  dragon: { blue: 'Splash', yellow: 'Flash', purple: 'Storm', orange: 'Cinder' },
  ghost: { red: 'Rascal', green: 'Glow', yellow: 'Wisp', purple: 'Spook', orange: 'Pumpkin' },
  knight: { red: 'Sir Bold', blue: 'Sir Dent', green: 'Sir Rattle', purple: 'Sir Shine', orange: 'Sir Brave' },
  wizard: { red: 'Fizz', blue: 'Twinkle', green: 'Sprout', yellow: 'Zap', orange: 'Pop' },
};
const COLORS = Object.keys(TITLE);
const gear = ([kind, color]) => ({ id: `g-${kind}-${color}`, kind, color, name: `${TITLE[color]} ${cap(kind)}`, rare: false });
const friend = ([kind, color, name]) => ({ id: `f-${kind}-${color}`, kind, color, name, rare: true });

/** Each kind once per round, in a different colour every round, leaving out what is already in `first`. */
function others(kinds, first) {
  const taken = new Set(first.map(([kind, color]) => `${kind}-${color}`));
  const out = [];
  for (let r = 0; r < COLORS.length; r++) {
    kinds.forEach((kind, i) => {
      const color = COLORS[(i + r) % COLORS.length];
      if (!taken.has(`${kind}-${color}`)) out.push([kind, color]);
    });
  }
  return out;
}

/** `each` things, then a friend, and so on: there is always something special coming up. */
function deal(things, friends, each) {
  const out = [];
  let g = 0;
  let f = 0;
  while (g < things.length || f < friends.length) {
    for (let k = 0; k < each && g < things.length; k++, g++) out.push(gear(things[g]));
    if (f < friends.length) out.push(friend(friends[f++]));
  }
  return out;
}

/** The first 42 cards keep the order they have always had (he may already own some of them). */
export const CARDS = [
  ...deal(GEAR, FRIENDS, 2),
  ...deal(
    others(OBJECT_KINDS, GEAR),
    others(CHARACTER_KINDS, FRIENDS).map(([kind, color]) => [kind, color, kind === 'knight' ? NAMES[kind][color] : `${NAMES[kind][color]} the ${cap(kind)}`]),
    3),
];

/** The next card he does not own yet (null once the collection is complete). */
export function nextCard(owned) {
  const have = new Set(owned);
  return CARDS.find((c) => !have.has(c.id)) || null;
}
