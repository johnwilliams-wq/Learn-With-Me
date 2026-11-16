// Test robot for activity type "panel" (Control Room): works the controls through the real page.
// A robot never presses Done - the helper does that.

/** The touches that make up the right answer, worked out from the item (not from the game's own code). */
function touches(item) {
  const byId = new Map(item.scene.controls.map((c) => [c.id, c]));
  const out = [];
  for (const e of item.expect.flat()) {
    const c = byId.get(e.c);
    if (c.type === 'button') for (let i = 0; i < e.v; i++) out.push({ c: c.id });
    else if (c.type === 'dial') for (let i = 0; i < Math.abs(e.v - c.value); i++) out.push({ c: c.id, d: e.v > c.value ? 1 : -1 });
    else if (c.type === 'keypad') for (const k of e.v) out.push({ c: c.id, k });
    else out.push({ c: c.id }); // a switch or launch: one touch
  }
  return out;
}

const target = (a) => (a.k !== undefined ? `.panel-scene .pnl-key[data-id="${a.c}"][data-key="${a.k}"]`
  : a.d !== undefined ? `.panel-scene .pnl-step[data-id="${a.c}"][data-step="${a.d}"]`
    : `.panel-scene .pnl-ctl[data-id="${a.c}"]`);

module.exports = {
  isNone: () => false,
  async solve(page, item) {
    for (const a of touches(item)) await page.click(target(a));
  },
  /** One touch on something the sentence did not name: always wrong, never empty. */
  async wrong(page, item) {
    const named = new Set(item.expect.flat().map((e) => e.c));
    const spare = item.scene.controls.filter((c) => c.type !== 'light' && !named.has(c.id));
    const c = spare.find((x) => x.type === 'button' || x.type === 'switch') || spare[0];
    if (!c) throw new Error(`${item.id}: every control is named, the robot has nothing wrong to touch`);
    await page.click(target(c.type === 'dial' ? { c: c.id, d: c.value < 9 ? 1 : -1 } : c.type === 'keypad' ? { c: c.id, k: '1' } : { c: c.id }));
  },
};
