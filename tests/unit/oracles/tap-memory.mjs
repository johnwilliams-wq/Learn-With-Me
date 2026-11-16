// Independent answer rules for the tap sentence patterns of the Memory Mountain world.
//   RULES[v] = (item, mentions, helpers) => expected groups of object ids
// `mentions` = every "the big red gem"-style phrase of item.say, in spoken order;
// `helpers` = the tools exported by ./tap-base.mjs (one, all, ids, rx, index, ...).
// A rule must work from item.say and item.scene only - never from item.expect.
export const RULES = {};
