// Test robot for activity type "put": taps a thing on the shelf, then the place it goes to.
// A robot never presses Done or the hand - the helper does that.

const thing = (id) => `.put-thing[data-id="${id}"]`;
const place = (id) => `.put-zone[data-place="${id}"]`;

async function move(page, id, to) {
  await page.click(thing(id));
  // the place is a big area with things lying in it: tap a corner of it that is always free
  await page.click(place(to), { position: { x: 12, y: 12 } });
  await page.waitForSelector(`${place(to)} ${thing(id)}`);
}

module.exports = {
  /** true when the right thing is to move nothing (the helper then presses the hand) */
  isNone: (item) => item.expect.moves.length === 0,

  /** The model answer: for each move, the first `n` of its things that are still free, in the order given. */
  async solve(page, item) {
    const used = new Set();
    for (const m of item.expect.moves) {
      for (const id of m.ids.filter((x) => !used.has(x)).slice(0, m.n)) {
        used.add(id);
        await move(page, id, m.to);
      }
    }
  },

  /** Definitely wrong, and not empty: one thing put in a place the sentence does not allow for it. */
  async wrong(page, item) {
    const allowed = (o, p) => item.expect.moves.some((m) => m.ids.includes(o.id) && m.to === p.id);
    for (const o of item.scene.objects) {
      const p = item.scene.places.find((q) => !allowed(o, q));
      if (p) return move(page, o.id, p.id);
    }
    throw new Error(`${item.id}: no wrong move exists`);
  },
};
