const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');
const {
  injectUserscript,
  snapshot
} = require('./helpers/userscriptHarness');

test.skip(!process.env.YDS_REAL_YOUTUBE, 'Set YDS_REAL_YOUTUBE=1 to run the real YouTube smoke test.');

function readExpectedVersion() {
  const userscriptPath = path.resolve(__dirname, '..', '..', 'yt-dual-subs.user.js');
  const code = fs.readFileSync(userscriptPath, 'utf8');
  const match = code.match(/^\s*\/\/\s*@version\s+([^\s]+)/m);
  if (!match) throw new Error(`Could not read @version from ${userscriptPath}`);
  return match[1];
}

function summarizeState(state) {
  return {
    version: state && state.version,
    videoId: state && state.videoId,
    pageType: state && state.pageType,
    phase: state && state.phase,
    status: state && state.status,
    enabled: state && state.enabled,
    displayMode: state && state.displayMode,
    targetLang: state && state.targetLang,
    tracks: state && state.tracks ? state.tracks.length : 0,
    cuesA: state && state.cuesA,
    cuesB: state && state.cuesB,
    source: state && state.source,
    fetch: state && state.fetch,
    dom: state && state.dom,
    url: state && state.url
  };
}

test('injects the userscript on a real YouTube watch page', async ({ page }, testInfo) => {
  const url = process.env.YDS_REAL_URL || 'https://www.youtube.com/watch?v=jNQXAC9IVRw&ydsDebug=1';
  const expectedVersion = readExpectedVersion();

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
  const summary = summarizeState(state);
  await testInfo.attach('yds-real-snapshot.json', {
    body: JSON.stringify(summary, null, 2),
    contentType: 'application/json'
  });
  console.log(`YDS real smoke: ${JSON.stringify({
    phase: summary.phase,
    tracks: summary.tracks,
    cues: `${summary.cuesA}/${summary.cuesB}`,
    targetLang: summary.targetLang
  })}`);

  expect(state.dom.launcher).toBe(true);
  expect(state.dom.player).toBe(true);
  expect(state.dom.video).toBe(true);
  expect(Array.isArray(state.tracks)).toBe(true);
  expect(state.videoId).not.toBe('');
  expect(state.version).toBe(expectedVersion);
  expect(state.url).toContain('/watch');
  await expect.poll(async () => page.locator(
    'ytd-watch-metadata #actions #yds-launcher-root, #above-the-fold #actions #yds-launcher-root'
  ).count(), {
    timeout: 5000
  }).toBeGreaterThan(0);
});
