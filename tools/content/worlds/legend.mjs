// Legend Trials: the hardest levels of every zone, mixed together. Built from whatever
// zones exist; needs at least four of them, and opens when four are cleared.

export function legend(zones) {
  if (zones.length < 4) return null;
  // the last two "real" levels (the ones just before each boss) of every zone
  const hardest = (w, n) => w.levels.filter((l) => l.gen).slice(-n).map((l) => l.id);
  const allowNone = zones.some((w) => w.allowNone || w.levels.some((l) => l.allowNone));
  const half = Math.ceil(zones.length / 2);
  return {
    id: 'legend', name: 'Legend Trials', blurb: 'Everything, mixed up. For true legends.', color: '#d9a520', allowNone,
    needs: zones.map((w) => w.id), needsCount: 4,
    levels: [
      { id: 'legend1', title: 'Trial One', mix: zones.slice(0, half).flatMap((w) => hardest(w, 2)), holdMs: 900,
        tip: 'Legend Trial one. A different challenge every turn. Listen to every word.' },
      { id: 'legend2', title: 'Trial Two', mix: zones.slice(half).flatMap((w) => hardest(w, 2)), holdMs: 900,
        tip: 'Legend Trial two. Stay calm, breathe, and listen all the way to the end.' },
      { id: 'legend-boss', title: 'The Legend', boss: true, mix: zones.flatMap((w) => hardest(w, 1)), holdMs: 900,
        tip: 'The final boss. Only the hardest challenge from every world. You are ready.' },
    ],
  };
}
