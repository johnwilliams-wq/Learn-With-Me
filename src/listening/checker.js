// Decides whether what he did matches what the voice asked for.
//
// `expect` is an ordered list of GROUPS. Each group is a list of object ids that
// must all be tapped (any order inside the group) before moving to the next group.
//   "Tap the key, then the gem."          -> [['key1'], ['gem1']]
//   "Tap all the red gems."               -> [['g1', 'g2', 'g3']]
//   "Tap the drum two times."             -> [['d1', 'd1']]
//   "First all the gems, then the chest." -> [['g1', 'g2'], ['c1']]
//   an instruction that must NOT be done  -> []   (he should press the "no order" hand)
//
// `actions` is the list of object ids he tapped, in order ([] = pressed the hand).

/**
 * @returns {{correct:boolean, error:string, at:number, prefix:number, total:number}}
 *   error: '' | 'false-alarm' | 'no-response' | 'incomplete' | 'extra' | 'order' | 'attribute' | 'object'
 *   at:     index of the first wrong action (or where one was missing)
 *   prefix: how many actions were right before that point
 */
export function check(actions, expect, objects = []) {
  const flat = expect.flat();
  const total = flat.length;
  const fail = (error, at) => ({ correct: false, error, at, prefix: at, total });

  if (total === 0) return actions.length === 0 ? { correct: true, error: '', at: -1, prefix: 0, total } : fail('false-alarm', 0);
  if (actions.length === 0) return fail('no-response', 0);

  const byId = new Map(objects.map((o) => [o.id, o]));
  let pos = 0;
  for (const group of expect) {
    const remaining = group.slice();
    for (let j = 0; j < group.length; j++) {
      const a = actions[pos];
      if (a === undefined) return fail('incomplete', pos);
      const idx = remaining.indexOf(a);
      if (idx === -1) return fail(classify(a, remaining, actions, flat, byId), pos);
      remaining.splice(idx, 1);
      pos++;
    }
  }
  if (actions.length > pos) return fail('extra', pos);
  return { correct: true, error: '', at: -1, prefix: total, total };
}

function classify(tapped, wanted, actions, flat, byId) {
  // Same things, wrong order -> he kept the content but lost the sequence.
  if (sameMultiset(actions, flat)) return 'order';
  // Right kind of thing, wrong colour/size -> he missed a detail word.
  const t = byId.get(tapped);
  if (t && wanted.some((id) => byId.get(id)?.kind === t.kind)) return 'attribute';
  return 'object';
}

function sameMultiset(a, b) {
  if (a.length !== b.length) return false;
  const count = new Map();
  for (const x of a) count.set(x, (count.get(x) || 0) + 1);
  for (const x of b) {
    const n = count.get(x);
    if (!n) return false;
    count.set(x, n - 1);
  }
  return true;
}

/** The order to demonstrate a correct answer in (groups flattened as written). */
export function demoOrder(expect) {
  return expect.flat();
}
