// Loads the level list, the item banks and the voice-line catalogue (all static JSON).

const DATA = 'assets/data/';
const cache = new Map();

async function loadJSON(path) {
  if (cache.has(path)) return cache.get(path);
  const r = await fetch(path, { cache: 'no-cache' });
  if (!r.ok) throw new Error(`${path}: ${r.status}`);
  const json = await r.json();
  cache.set(path, json);
  return json;
}

export const loadWorlds = () => loadJSON(`${DATA}listening/levels.json`);
/** Items for a level. A "mix" level (review / boss) borrows the items of other levels. */
export async function loadBank(level) {
  const ids = level.mix && level.mix.length ? level.mix : [level.id];
  const banks = await Promise.all(ids.map((id) => loadJSON(`${DATA}listening/${id}.json`)));
  return { level: level.id, items: banks.flatMap((b) => b.items) };
}
export const loadVoiceCatalog = () => loadJSON(`${DATA}voice.json`);

export const itemAudioUrl = (item) => `assets/audio/listening/${item.audio}`;

/** Small wrapper for the guide's spoken lines (greetings, tips, encouragement). */
export function createVoice(audio, catalog) {
  const last = {};
  const line = (id) => catalog.lines[id] || null;
  const url = (id) => (line(id) ? `assets/audio/ui/${line(id).file}` : null);
  const say = (id, opts = {}) => {
    const l = line(id);
    if (!l) return Promise.resolve({ ok: false, how: 'none' });
    return audio.play(url(id), { text: l.text, ...opts });
  };
  return {
    say,
    name: catalog.name || '', // the player's first name, if the game has been given one
    text: (id) => line(id)?.text || '',
    has: (id) => !!line(id),
    /** Say a random line from a pool, never the same one twice running. */
    sayPool(pool, opts) {
      const ids = catalog.pools[pool] || [];
      if (!ids.length) return Promise.resolve({ ok: false, how: 'none' });
      let i = Math.floor(Math.random() * ids.length);
      if (ids.length > 1 && i === last[pool]) i = (i + 1) % ids.length;
      last[pool] = i;
      return say(ids[i], opts);
    },
    preload(idsOrPools) {
      const ids = idsOrPools.flatMap((x) => catalog.pools[x] || [x]);
      return audio.preload(ids.map(url).filter(Boolean));
    },
  };
}
