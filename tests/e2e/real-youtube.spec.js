const { test, expect } = require('@playwright/test');
const {
  injectUserscript,
  snapshot
} = require('./helpers/userscriptHarness');

test.skip(!process.env.YDS_REAL_YOUTUBE, 'Set YDS_REAL_YOUTUBE=1 to run the real YouTube smoke test.');

test('injects the userscript on a real YouTube watch page', async ({ page }) => {
  const url = process.env.YDS_REAL_URL || 'https://www.youtube.com/watch?v=jNQXAC9IVRw&ydsDebug=1';

  await page.goto(url, {
    waitUntil: 'domcontentloaded',
    timeout: 60000
  });
  await injectUserscript(page);
  await page.evaluate(() => window.__ydsDebug.setDebug(true));

  await expect.poll(async () => {
    const state = await snapshot(page);
    if (!state || !state.dom.launcher || state.pageType !== 'watch') return 'missing';
    if (state.phase === 'boot' || state.status === '脚本已注入') return 'initializing';
    return 'ready-to-debug';
  }, {
    timeout: 15000
  }).toBe('ready-to-debug');

  const state = await snapshot(page);
  expect(state.dom.launcher).toBe(true);
  expect(state.videoId).not.toBe('');
  expect(state.version).toBe('4.0.9');
  expect(state.url).toContain('/watch');
});
