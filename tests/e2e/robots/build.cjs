// Test robot for activity type "build" (the Robot Workshop): taps one picture in every row.
// A robot never presses Done or the hand - the helper does that.
const option = (part, value) => `.bld-opt[data-part="${part}"][data-value="${value}"]`;

module.exports = {
  isNone: () => false,
  /** The right robot: the expected option of every row, top row first. */
  async solve(page, item) {
    for (const row of item.scene.rows) await page.click(option(row.part, item.expect[row.part]));
  },
  /** A complete robot with one wrong part (the last row gets an option that was not asked for). */
  async wrong(page, item) {
    const rows = item.scene.rows;
    for (const row of rows.slice(0, -1)) await page.click(option(row.part, item.expect[row.part]));
    const last = rows[rows.length - 1];
    await page.click(option(last.part, last.options.find((v) => v !== item.expect[last.part])));
  },
};
