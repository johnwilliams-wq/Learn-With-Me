// Test robot for activity type "truth": the tick (true) or the cross (not true).
// Before answering it touches a thing in the picture, as a child counting with a finger would:
// that only marks the thing and must never change or send the answer.
const button = (value) => `.truth-btn[data-truth="${value}"]`;

async function touchPicture(page, item) {
  const about = item.scene.about || [];
  const id = about[0] || item.scene.objects[0].id;
  await page.click(`.truth-frame .obj[data-id="${id}"]`);
}

module.exports = {
  isNone: () => false,
  async solve(page, item) {
    await touchPicture(page, item);
    await page.click(button(item.expect));
  },
  async wrong(page, item) {
    await touchPicture(page, item);
    await page.click(button(!item.expect));
  },
};
