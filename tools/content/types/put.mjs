// Content rules for activity type "put" - not built yet (placeholder so the registry loads).
export default {
  finish() { throw new Error('Activity type "put" is not built yet'); },
  validate(item, { fail }) { fail('Activity type "put" is not built yet'); },
  isNone: () => false,
};
