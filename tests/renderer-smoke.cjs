// Uses an existing Playwright installation and browser; does not install anything.
// PLAYWRIGHT_MODULE=/absolute/path/to/playwright-core BROWSER_PATH=/path/to/browser
// BASE_URL=http://127.0.0.1:8000 node tests/renderer-smoke.cjs
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright-core');
const assert = require('node:assert/strict');
const base = process.env.BASE_URL || 'http://127.0.0.1:8000';

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.BROWSER_PATH, headless: true });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.addInitScript(() => {
      window.drawCalls = 0;
      for (const method of ['drawArrays', 'drawElements']) {
        const original = WebGL2RenderingContext.prototype[method];
        WebGL2RenderingContext.prototype[method] = function (...args) { window.drawCalls++; return original.apply(this, args); };
      }
    });
    await page.goto(`${base}/v1.html`);
    await page.waitForFunction(() => drawCalls > 3);
    await page.click('#pauseButton');
    const held = await page.evaluate(() => drawCalls);
    await page.waitForTimeout(120);
    assert.equal(await page.evaluate(() => drawCalls), held, 'paused lab submits no GPU work');
    await page.click('#pauseButton');
    // Simulated visibility transition exercises scheduling; not a physical OS tab test.
    await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); });
    const hidden = await page.evaluate(() => drawCalls);
    await page.waitForTimeout(120);
    assert.equal(await page.evaluate(() => drawCalls), hidden, 'hidden lab submits no GPU work');
    await page.evaluate(() => { delete document.hidden; document.dispatchEvent(new Event('visibilitychange')); });
    await page.waitForFunction(n => drawCalls > n, hidden);
    await page.click('#pauseButton');
    const result = await page.evaluate(async () => {
      const { createBlackHoleRenderer } = await import('./black-hole-renderer.js');
      const view = createBlackHoleRenderer();
      view.resize(8000, 8000, { quality: 'high', pixelRatio: 4 });
      const budget = view.info.width * view.info.height;
      view.resize(320, 200);
      for (const approach of [0, 0.25, 0.5, 0.75, 1]) {
        view.render({ time: 100000, approach, brightness: 0.8, inclination: 86 });
      }
      view.render({ time: NaN, approach: Infinity, brightness: -5, inclination: 999 });
      const calls = view.info.frames;
      view.dispose(); view.dispose();
      return { budget, calls, disposed: view.info.disposed, rendersAfterDispose: view.render() };
    });
    assert.ok(result.budget <= 3004000, 'quality pixel cap (integer rounding tolerance)');
    assert.equal(result.calls, 6);
    assert.ok(result.disposed);
    assert.equal(result.rendersAfterDispose, false);
    assert.deepEqual(errors, []);
    console.log('PASS lab pause/visibility and renderer input, budget, disposal contracts');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
