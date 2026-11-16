// Independent answer rules for the tap sentence patterns of the Memory Mountain world.
//   RULES[v] = (item, mentions, helpers) => expected groups of object ids
// `mentions` = every "the big red gem"-style phrase of item.say, in spoken order;
// `helpers` = the tools exported by ./tap-base.mjs (one, all, ids, rx, index, ...).
// A rule must work from item.say and item.scene only - never from item.expect.
//
// Besides the answer, each rule insists that the item is FAIR: the sentence has the shape
// the pattern promises, every detail word is needed (a look-alike differs only by it), and
// hidden / visible is what the level says.

import assert from 'node:assert/strict';

const ORDINAL = { first: 0, second: 1, third: 2, fourth: 3, fifth: 4 };
const TIMES = { once: 1, 'two times': 2, 'three times': 3 };
const DETOURS = /opposite|backwards|skip|leave out|\bnot\b|once|times|unless|\bif\b/i;

/** Is there another object that is the same in `same` and different in `differ`? */
const foil = (it, t, same, differ) => it.scene.objects.some((o) => o.id !== t.id && same.every((k) => o[k] === t[k]) && differ.every((k) => o[k] !== t[k]));
const byId = (it, id) => it.scene.objects.find((o) => o.id === id);

/** n things, tapped in the order they are said. `words` = which detail words every phrase carries. */
function steps(n, shape, { colour = false, size = false, hidden = false } = {}) {
  return (it, m, h) => {
    assert.match(it.say, shape, `${it.id}: "${it.say}" does not look like pattern ${it.v}`);
    assert.ok(!DETOURS.test(it.say), `${it.id}: a plain list must not carry another instruction`);
    assert.equal(m.length, n, `${it.id}: ${n} things should be named`);
    assert.equal(!!it.hide, hidden, `${it.id}: hidden?`);
    const out = m.map((q) => {
      assert.equal(!!q.color, colour, `${it.id}: colour word`);
      assert.equal(!!q.size, size, `${it.id}: size word`);
      return h.one(it, q);
    });
    assert.equal(new Set(out).size, n, `${it.id}: the same thing is named twice`);
    for (const id of out) {
      const t = byId(it, id);
      if (colour && !size) assert.ok(foil(it, t, ['kind'], ['color']) && foil(it, t, ['color'], ['kind']), `${it.id}: both words of "${t.color} ${t.kind}" must be needed`);
      if (colour && size) {
        // found in a hurry, some of them small: the colours must be easy to tell apart
        assert.ok(!['torch', 'rocket'].includes(t.kind), `${it.id}: the ${t.kind} has a yellow flame`);
        const seen = new Set(it.scene.objects.map((o) => o.color));
        assert.ok(!(seen.has('orange') && (seen.has('red') || seen.has('yellow'))), `${it.id}: orange beside red or yellow is too close`);
        assert.ok(foil(it, t, ['kind', 'color'], ['size']) && foil(it, t, ['kind', 'size'], ['color']) && foil(it, t, ['color', 'size'], ['kind']), `${it.id}: all three words of "${t.size} ${t.color} ${t.kind}" must be needed`);
      }
    }
    assert.ok(it.scene.objects.length >= n + 2, `${it.id}: too few wrong choices`);
    return out.map((id) => [id]);
  };
}

// The sentence shapes. `T` = one "the ... thing" phrase (one to three words after "the").
const T = 'the \\w+(?: \\w+){0,2}';
const shape = {
  then: (n) => new RegExp(`^Tap ${T}(?:, then ${T}){${n - 1}}\\.$`),
  list: (n) => new RegExp(`^Tap ${T}(?:, ${T}){${n - 2}}, and then ${T}\\.$`),
  first: (n) => (n === 3
    ? new RegExp(`^First, tap ${T}\\. Then, ${T}\\. Last, ${T}\\.$`)
    : new RegExp(`^First, tap ${T}\\. Next, ${T}\\. Then, ${T}\\. Last, ${T}\\.$`)),
  halves: (n) => new RegExp(`^Tap ${T}(?:, then ${T}){${Math.ceil(n / 2) - 1}}\\. After that, tap ${T}(?:, then ${T}){${n - Math.ceil(n / 2) - 1}}\\.$`),
};

/** "Tap these in the opposite order: the key, the gem, and the star." -> star, gem, key */
function reverse(n) {
  return (it, m, h) => {
    const [list] = h.rx(it, /^Tap these (?:in the opposite order|backwards): (.+)\.$/);
    assert.match(list, n === 2 ? new RegExp(`^${T} and ${T}$`) : new RegExp(`^${T}(?:, ${T}){${n - 2}}, and ${T}$`), it.id);
    const said = h.mentions(list).map((q) => h.one(it, q));
    assert.equal(said.length, n, it.id);
    assert.equal(new Set(said).size, n, `${it.id}: the same thing is named twice`);
    assert.ok(!it.hide, `${it.id}: backwards lists are not hidden`);
    return said.reverse().map((id) => [id]);
  };
}

export const RULES = {
  // level 1 and 3: three things, each with a colour (3 = the same, face-down while the voice talks)
  'trio-then': steps(3, shape.then(3), { colour: true }),
  'trio-list': steps(3, shape.list(3), { colour: true }),
  'trio-first': steps(3, shape.first(3), { colour: true }),
  'trio-hidden-then': steps(3, shape.then(3), { colour: true, hidden: true }),
  'trio-hidden-list': steps(3, shape.list(3), { colour: true, hidden: true }),
  'trio-hidden-first': steps(3, shape.first(3), { colour: true, hidden: true }),
  // level 2 and 4: four and five things
  'quad-then': steps(4, shape.then(4)),
  'quad-list': steps(4, shape.list(4)),
  'quad-first': steps(4, shape.first(4)),
  'five-then': steps(5, shape.then(5)),
  'five-list': steps(5, shape.list(5)),
  'five-halves': steps(5, shape.halves(5)),
  // level 5: said one way, done the other way round
  'reverse-2': reverse(2),
  'reverse-3': reverse(3),
  'reverse-4': reverse(4),
  // level 6: leave one out (by its place in the list, or by its name) ...
  'skip-nth': (it, m, h) => {
    const [list, which] = h.rx(it, /^Tap (.+), but (?:skip|leave out) the (first|second|third|fourth|fifth|last) one\.$/);
    const said = h.mentions(list).map((q) => h.one(it, q));
    assert.ok(said.length >= 4 && new Set(said).size === said.length, it.id);
    const at = which === 'last' ? said.length - 1 : ORDINAL[which];
    assert.ok(at < said.length, `${it.id}: there is no ${which} one`);
    return said.filter((_, i) => i !== at).map((id) => [id]);
  },
  'skip-named': (it, m, h) => {
    const [list, kind] = h.rx(it, /^Tap (.+), but (?:skip|leave out) the (\w+)\.$/);
    assert.notEqual(kind, 'one');
    const said = h.mentions(list).map((q) => h.one(it, q));
    const out = h.one(it, { kind });
    assert.ok(said.length >= 4 && new Set(said).size === said.length, it.id);
    assert.equal(said.filter((id) => id === out).length, 1, `${it.id}: the thing to leave out must be in the list`);
    return said.filter((id) => id !== out).map((id) => [id]);
  },
  // ... and how many times each
  'count-each': (it, m, h) => {
    const C = '(once|two times|three times)';
    const [k1, n1, k2, n2, k3, n3] = h.rx(it, new RegExp(`^Tap the (\\w+) ${C}, the (\\w+) ${C}, and the (\\w+) ${C}\\.$`));
    const groups = [[k1, n1], [k2, n2], [k3, n3]].map(([kind, n]) => Array(TIMES[n]).fill(h.one(it, { kind })));
    assert.equal(new Set(groups.map((g) => g[0])).size, 3, it.id);
    assert.ok(new Set([n1, n2, n3]).size > 1, `${it.id}: the counts should not all be the same`);
    assert.ok(groups.flat().length <= 12, `${it.id}: more taps than the board accepts`);
    return groups;
  },
  // level 7: six things; and four hidden things with size + colour
  'six-then': steps(6, shape.then(6)),
  'six-list': steps(6, shape.list(6)),
  'six-halves': steps(6, shape.halves(6)),
  'quad-detail-hidden-then': steps(4, shape.then(4), { colour: true, size: true, hidden: true }),
  'quad-detail-hidden-first': steps(4, shape.first(4), { colour: true, size: true, hidden: true }),
};
