// The collection: one new card is earned for every finished mission (never random
// duplicates, never a blank - effort is always rewarded).

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

/** Friends are sprinkled in every third card so there is always something special coming up. */
export const CARDS = (() => {
  const out = [];
  let g = 0;
  let f = 0;
  while (g < GEAR.length || f < FRIENDS.length) {
    for (let k = 0; k < 2 && g < GEAR.length; k++, g++) {
      const [kind, color] = GEAR[g];
      out.push({ id: `g-${kind}-${color}`, kind, color, name: `${TITLE[color]} ${cap(kind)}`, rare: false });
    }
    if (f < FRIENDS.length) {
      const [kind, color, name] = FRIENDS[f++];
      out.push({ id: `f-${kind}-${color}`, kind, color, name, rare: true });
    }
  }
  return out;
})();

/** The next card he does not own yet (null once the collection is complete). */
export function nextCard(owned) {
  const have = new Set(owned);
  return CARDS.find((c) => !have.has(c.id)) || null;
}
