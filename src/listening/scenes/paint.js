// Activity type "paint" - not built yet (placeholder so the registry loads).
export default {
  create() { throw new Error('Activity type "paint" is not built yet'); },
  check() { return { correct: false, error: 'object', at: 0, prefix: 0, total: 0 }; },
  isNone: () => false,
};
