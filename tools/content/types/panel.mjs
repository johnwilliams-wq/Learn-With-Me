// Content rules for activity type "panel" - not built yet (placeholder so the registry loads).
export default {
  finish() { throw new Error('Activity type "panel" is not built yet'); },
  validate(item, { fail }) { fail('Activity type "panel" is not built yet'); },
  isNone: () => false,
};
