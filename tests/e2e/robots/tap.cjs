// Test robot for activity type "tap": performs the right (or a deliberately wrong) answer
// through the real page. A robot never presses Done or the hand - the helper does that.
module.exports = {
  /** true when the right thing is to do nothing (the helper then presses the hand) */
  isNone: (item) => item.expect.flat().length === 0,
  async solve(page, item) {
    for (const id of item.expect.flat()) await page.click(`.obj[data-id="${id}"]`);
  },
  async wrong(page, item) {
    const right = item.expect.flat();
    const all = item.scene.objects.map((o) => o.id);
    await page.click(`.obj[data-id="${right.length ? all.find((id) => !right.includes(id)) : all[0]}"]`);
  },
};
