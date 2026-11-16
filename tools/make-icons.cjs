// Renders the home-screen icons from the guide character. Run: node tools/make-icons.cjs
// (Needs Playwright + Chromium; only re-run if the guide art changes.)
const { chromium } = require('playwright');
const path = require('node:path');

(async () => {
  const { guideSVG } = await import('../src/art/sprites.js');
  const page = (pad) => `<!doctype html><html><body style="margin:0">
    <div style="width:100vw;height:100vh;display:grid;place-items:center;background:radial-gradient(circle at 70% 18%, #3f5fd6, #141a3a 78%)">
      <div style="width:${100 - pad * 2}vw;height:${100 - pad * 2}vw">${guideSVG('happy')}</div>
    </div></body></html>`;
  const browser = await chromium.launch();
  for (const [name, size, pad] of [['icon-512', 512, 5], ['icon-192', 192, 5], ['icon-180', 180, 5], ['maskable-512', 512, 17]]) {
    const ctx = await browser.newContext({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
    const p = await ctx.newPage();
    await p.setContent(page(pad));
    await p.screenshot({ path: path.join(__dirname, '..', 'assets', 'icons', `${name}.png`) });
    await ctx.close();
  }
  await browser.close();
  console.log('icons written to assets/icons/');
})();
