// Test robot for activity type "paint": picks up each paint that is needed and paints the
// things that must end up that colour. (A robot never presses Done - the helper does that.)
const pot = (page, colour) => page.click(`.paint-pot[data-paint="${colour}"]`);
const thing = (page, id) => page.click(`.paint-scene .obj[data-id="${id}"]`);

module.exports = {
  isNone: () => false,
  async solve(page, item) {
    for (const colour of item.scene.paints) {
      const ids = Object.keys(item.expect).filter((id) => item.expect[id] === colour);
      if (!ids.length) continue;
      await pot(page, colour);
      for (const id of ids) await thing(page, id);
    }
  },
  /** One thing in a colour it must not have: wrong whatever else the sentence asked for. */
  async wrong(page, item) {
    const id = item.scene.objects[0].id;
    await pot(page, item.scene.paints.find((c) => c !== item.expect[id]));
    await thing(page, id);
  },
};
