// Content rules for activity type "paint" - not built yet (placeholder so the registry loads).
export default {
  finish() { throw new Error('Activity type "paint" is not built yet'); },
  validate(item, { fail }) { fail('Activity type "paint" is not built yet'); },
  isNone: () => false,
};
