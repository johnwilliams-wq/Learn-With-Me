// Test robot for activity type "route": drives the rover through the real page.
// It finds its own way (it does not use the game's path finder), so it also tests the checker.
// A robot never presses Done or the hand - the helper does that.

const STEP = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const str = (p) => `${p[0]},${p[1]}`;

/** The squares to drive onto: the counted route itself, or the shortest drive that does what was asked. */
function route(item) {
  const { scene, expect: e } = item;
  if (e.path) return e.path;
  const inside = (p) => p[0] >= 0 && p[1] >= 0 && p[0] < scene.cols && p[1] < scene.rows;
  const full = (1 << e.need.length) - 1;
  const first = { p: scene.start, v: 0, m: 0, back: null };
  const seen = new Set();
  let layer = [first];
  while (layer.length) {
    const next = [];
    for (const s of layer) {
      if (s !== first && str(s.p) === str(e.end) && s.v === e.via.length && s.m === full) {
        const out = [];
        for (let k = s; k.back; k = k.back) out.unshift(k.p);
        return out;
      }
      for (const d of Object.values(STEP)) {
        const p = [s.p[0] + d[0], s.p[1] + d[1]];
        if (!inside(p) || e.avoid.some((q) => str(q) === str(p))) continue;
        const n = { p, v: s.v, m: s.m, back: s };
        if (n.v < e.via.length && str(e.via[n.v]) === str(p)) n.v++;
        e.need.forEach((q, i) => { if (str(q) === str(p)) n.m |= 1 << i; });
        const k = `${str(p)}|${n.v}|${n.m}`;
        if (!seen.has(k)) { seen.add(k); next.push(n); }
      }
    }
    layer = next;
  }
  throw new Error(`the robot found no way to do "${item.say}"`);
}

const dirOf = (from, to) => Object.keys(STEP).find((d) => from[0] + STEP[d][0] === to[0] && from[1] + STEP[d][1] === to[1]);

module.exports = {
  isNone: () => false,
  route,
  /** Drive the right route: with the arrow buttons, and every third move by tapping the next square. */
  async solve(page, item) {
    let at = item.scene.start;
    let n = 0;
    for (const p of route(item)) {
      if (n++ % 3 === 2) await page.click(`.route-sq[data-c="${p[0]}"][data-r="${p[1]}"]`, { force: true });
      else await page.click(`.route-arrow[data-dir="${dirOf(at, p)}"]`);
      at = p;
    }
  },
  /** One move that cannot be right: a step that is not the first step of a counted route, and not onto the last stop. */
  async wrong(page, item) {
    const { scene, expect: e } = item;
    const no = e.path ? e.path[0] : e.end;
    const dir = Object.keys(STEP).find((d) => {
      const p = [scene.start[0] + STEP[d][0], scene.start[1] + STEP[d][1]];
      return p[0] >= 0 && p[1] >= 0 && p[0] < scene.cols && p[1] < scene.rows && str(p) !== str(no);
    });
    await page.click(`.route-arrow[data-dir="${dir}"]`);
  },
};
