// Content rules for activity type "route" - not built yet (placeholder so the registry loads).
export default {
  finish() { throw new Error('Activity type "route" is not built yet'); },
  validate(item, { fail }) { fail('Activity type "route" is not built yet'); },
  isNone: () => false,
};
