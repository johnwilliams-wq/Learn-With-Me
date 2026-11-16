// Test robot for activity type "truth".
module.exports = {
  isNone: () => false,
  solve: (page, item) => page.click(`.truth-btn[data-truth="${item.expect}"]`),
  wrong: (page, item) => page.click(`.truth-btn[data-truth="${!item.expect}"]`),
};
