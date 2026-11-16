// Content rules for activity type "build" - not built yet (placeholder so the registry loads).
export default {
  finish() { throw new Error('Activity type "build" is not built yet'); },
  validate(item, { fail }) { fail('Activity type "build" is not built yet'); },
  isNone: () => false,
};
