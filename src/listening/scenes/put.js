// Activity type "put" - not built yet (placeholder so the registry loads).
export default {
  create() { throw new Error('Activity type "put" is not built yet'); },
  check() { return { correct: false, error: 'object', at: 0, prefix: 0, total: 0 }; },
  isNone: () => false,
};
