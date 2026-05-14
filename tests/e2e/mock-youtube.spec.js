const { test, expect } = require('@playwright/test');
const {
  captionTrack,
  emptyJson3,
  injectUserscript,
  json3Cue,
  setupMockNonWatch,
  setupMockWatch,
  snapshot
} = require('./helpers/userscriptHarness');

function json3Cues(items) {
  return JSON.stringify({
    events: items.map((item) => ({
      tStartMs: item.startMs,
      dDurationMs: item.durationMs,
      segs: [
        {
          utf8: item.text
        }
      ]
    }))
  });
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function asrTrack(languageCode = 'en', name = 'English (auto-generated)', overrides = {}) {
  return captionTrack(languageCode, name, {
    baseUrl: `https://www.youtube.com/api/timedtext?v=mock-video&lang=${encodeURIComponent(languageCode)}&kind=asr`,
    kind: 'asr',
    vssId: `a.${languageCode}`,
    ...overrides
  });
}

test('renders source and target using YouTube auto-translation from the source track', async ({ page }) => {
  await setupMockWatch(page, {
    tracks: [
      captionTrack('en', 'English'),
      captionTrack('zh-Hans', 'Chinese Simplified')
    ],
    defaultTrackIndex: 0,
    translationLanguages: [
      { languageCode: 'zh-Hans', languageName: 'Chinese (Simplified)' }
    ],
    timedText(url) {
      if (url.searchParams.get('lang') === 'zh-Hans') return json3Cue('不应使用现成翻译轨');
      if (url.searchParams.get('tlang') === 'zh-Hans') return json3Cue('你好世界');
      return json3Cue('Hello world');
    }
  });

  await expect.poll(async () => (await snapshot(page)).phase).toBe('ready');

  const state = await snapshot(page);
  expect(state.captionSource).toBe('page');
  expect(state.tracks).toHaveLength(2);
  expect(state.cuesA).toBe(1);
  expect(state.cuesB).toBe(1);
  expect(state.fallback).toBe('');
  expect(state.fetch.target).toContain('en->zh-Hans');
  expect(state.playerApiPrime).toBe('ok:zh-Hans');
  expect(state.sourceKind).toBe('manual');
  expect(state.asrSync).toBe('not-asr');
  expect(state.translationRequest).toBe('plain');
  expect(state.translationResult).toBe('ok');
  await expect(page.locator('.ytp-subtitles-button')).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(async () => page.evaluate(() => window.__mockVideoPlayCalls + window.__mockVideoPauseCalls)).toBe(0);
  const calls = await page.evaluate(() => window.__mockCaptionApiCalls);
  expect(calls.map((call) => call.slice(0, 3))).toEqual([
    ['loadModule', 'captions'],
    ['setOption', 'captions', 'track'],
    ['setOption', 'captions', 'translationLanguage'],
    ['setOption', 'captions', 'reload']
  ]);
  expect(calls[1][3].translationLanguage.languageCode).toBe('zh-Hans');
  expect(calls[2][3].languageCode).toBe('zh-Hans');

  await page.evaluate(() => window.__setMockTime(1));
  await expect(page.locator('.yds-native-line-a')).toHaveText('Hello world');
  await expect(page.locator('.yds-native-line-b')).toHaveText('你好世界');
});

test('smooths short cue gaps and supports keyboard shortcuts', async ({ page }) => {
  await setupMockWatch(page, {
    tracks: [
      captionTrack('en', 'English')
    ],
    defaultTrackIndex: 0,
    timedText(url) {
      if (url.searchParams.get('tlang')) {
        return json3Cues([
          { startMs: 0, durationMs: 1000, text: '第一句译文' },
          { startMs: 1300, durationMs: 1000, text: '第二句译文' }
        ]);
      }
      return json3Cues([
        { startMs: 0, durationMs: 1000, text: 'First source' },
        { startMs: 1300, durationMs: 1000, text: 'Second source' }
      ]);
    }
  });

  await expect.poll(async () => (await snapshot(page)).phase).toBe('ready');

  await page.evaluate(() => window.__setMockTime(0.9));
  await expect(page.locator('.yds-native-line-a')).toHaveText('First source');
  await page.evaluate(() => window.__setMockTime(1.08));
  await expect(page.locator('.yds-native-line-a')).toHaveText('First source');
  await page.evaluate(() => window.__setMockTime(1.34));
  await expect(page.locator('.yds-native-line-a')).toHaveText('Second source');

  await page.keyboard.press('Alt+D');
  await expect.poll(async () => (await snapshot(page)).displayMode).toBe('source');
  await expect(page.locator('.yds-native-line-b')).toBeHidden();

  await page.keyboard.press('Alt+D');
  await expect.poll(async () => (await snapshot(page)).displayMode).toBe('target');
  await expect(page.locator('.yds-native-line-a')).toBeHidden();
  await expect(page.locator('.yds-native-line-b')).toHaveText('第二句译文');

  await page.keyboard.press('Alt+X');
  await expect.poll(async () => (await snapshot(page)).enabled).toBe(false);
  await expect(page.locator('#yds-native-window')).toHaveCount(0);
});

test('shows source captions while target translation is still loading', async ({ page }) => {
  await setupMockWatch(page, {
    tracks: [
      captionTrack('en', 'English')
    ],
    defaultTrackIndex: 0,
    async timedText(url) {
      if (url.searchParams.get('tlang') === 'zh-Hans') {
        await delay(1400);
        return json3Cue('慢速译文');
      }
      return json3Cue('Fast source');
    }
  });

  await expect.poll(async () => (await snapshot(page)).phase).toBe('target-loading');
  await expect(page.locator('.yds-native-line-a')).toHaveText('Fast source');
  await expect(page.locator('.yds-native-line-b')).toContainText('译文加载中');

  await expect.poll(async () => (await snapshot(page)).phase).toBe('ready');
  await expect(page.locator('.yds-native-line-b')).toHaveText('慢速译文');
});

test('keeps target loading visible and retries when translated timedtext is empty', async ({ page }) => {
  let targetJson3Passes = 0;

  await setupMockWatch(page, {
    tracks: [
      captionTrack('en', 'English')
    ],
    defaultTrackIndex: 0,
    timedText(url) {
      if (url.searchParams.get('tlang') === 'zh-Hans') {
        if (url.searchParams.get('fmt') === 'json3') targetJson3Passes += 1;
        if (targetJson3Passes < 3) return emptyJson3();
        return json3Cue('重试后译文');
      }
      return json3Cue('Retry source');
    }
  });

  await expect.poll(async () => (await snapshot(page)).phase).toBe('target-loading');
  await expect(page.locator('.yds-native-line-a')).toHaveText('Retry source');
  await expect(page.locator('.yds-native-line-b')).toContainText('译文加载中');

  await expect.poll(async () => targetJson3Passes, {
    timeout: 15000
  }).toBeGreaterThanOrEqual(3);
  await expect.poll(async () => (await snapshot(page)).phase).toBe('ready');
  await expect(page.locator('.yds-native-line-b')).toHaveText('重试后译文');
});

test('stops target retries after three fast translated requests', async ({ page }) => {
  let targetRequests = 0;

  await setupMockWatch(page, {
    tracks: [
      captionTrack('en', 'English')
    ],
    defaultTrackIndex: 0,
    timedText(url) {
      if (url.searchParams.get('tlang') === 'zh-Hans') {
        targetRequests += 1;
        return emptyJson3();
      }
      return json3Cue('Source only after retry');
    }
  });

  await expect.poll(async () => targetRequests, {
    timeout: 8000
  }).toBe(3);
  await expect.poll(async () => (await snapshot(page)).phase).toBe('ready');

  const state = await snapshot(page);
  expect(state.status).toContain('译文暂时不可用');
  expect(state.targetPending).toBe(false);
  expect(state.targetCueRetryCount).toBe(2);
  expect(state.fetch.target).not.toContain('srv1');
  expect(state.fetch.target).not.toContain('vtt');
  await expect(page.locator('.yds-native-line-a')).toHaveText('Source only after retry');
  await expect(page.locator('.yds-native-line-b')).toBeHidden();
});

test('reuses cached cue pairs when switching back to a language', async ({ page }) => {
  const targetRequests = {
    ja: 0,
    zh: 0
  };

  await setupMockWatch(page, {
    tracks: [
      captionTrack('en', 'English')
    ],
    defaultTrackIndex: 0,
    translationLanguages: [
      {
        languageCode: 'zh-Hans',
        languageName: { simpleText: 'Chinese Simplified' }
      },
      {
        languageCode: 'ja',
        languageName: { simpleText: 'Japanese' }
      }
    ],
    timedText(url) {
      const target = url.searchParams.get('tlang');
      if (target === 'ja') {
        targetRequests.ja += 1;
        return json3Cue('日本語字幕');
      }
      if (target === 'zh-Hans') {
        targetRequests.zh += 1;
        return json3Cue('中文字幕');
      }
      return json3Cue('English source');
    }
  });

  await expect.poll(async () => (await snapshot(page)).phase).toBe('ready');
  await expect(page.locator('.yds-native-line-b')).toHaveText('中文字幕');
  expect(targetRequests.zh).toBe(1);
  await page.locator('#yds-launcher-root').click();

  await page.locator('[data-yds-control="target-lang"]').selectOption('ja');
  await expect(page.locator('.yds-native-line-b')).toHaveText('日本語字幕');
  expect(targetRequests.ja).toBe(1);

  await page.locator('[data-yds-control="target-lang"]').selectOption('zh-Hans');
  await expect(page.locator('.yds-native-line-b')).toHaveText('中文字幕');
  await expect.poll(async () => (await snapshot(page)).fallback).toContain('cache-hit');
  expect(targetRequests.zh).toBe(1);

  await page.locator('[data-yds-control="target-lang"]').selectOption('ja');
  await expect(page.locator('.yds-native-line-b')).toHaveText('日本語字幕');
  expect(targetRequests.ja).toBe(1);
});

test('auto-selects an English source before first fetch when the track list starts elsewhere', async ({ page }) => {
  let targetRequests = 0;

  await setupMockWatch(page, {
    tracks: [
      captionTrack('ar', 'Arabic'),
      captionTrack('zh-CN', 'Chinese'),
      captionTrack('en', 'English')
    ],
    defaultTrackIndex: 1,
    transcriptEndpoint: false,
    timedText(url) {
      const lang = url.searchParams.get('lang');
      const target = url.searchParams.get('tlang');
      if (target) targetRequests += 1;
      if (lang === 'en' && target === 'zh-Hans') return json3Cue('自动译文');
      if (lang === 'en') return json3Cue('Auto selected source');
      return emptyJson3();
    }
  });

  await expect.poll(async () => (await snapshot(page)).phase).toBe('ready');
  const state = await snapshot(page);
  expect(state.source).toContain('#2 English (en)');
  expect(state.fallback).toBe('');
  expect(state.cuesA).toBe(1);
  expect(state.cuesB).toBe(1);
  expect(targetRequests).toBe(1);
  await expect(page.locator('.yds-native-line-a')).toHaveText('Auto selected source');
  await expect(page.locator('.yds-native-line-b')).toHaveText('自动译文');
});

test('infers a first-run target language from browser locale', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'languages', {
      configurable: true,
      get: () => ['ja-JP', 'en-US']
    });
    Object.defineProperty(navigator, 'language', {
      configurable: true,
      get: () => 'ja-JP'
    });
  });

  await setupMockWatch(page, {
    tracks: [
      captionTrack('en', 'English')
    ],
    defaultTrackIndex: 0,
    translationLanguages: [
      {
        languageCode: 'ja',
        languageName: { simpleText: 'Japanese' }
      }
    ],
    timedText(url) {
      if (url.searchParams.get('tlang') === 'ja') return json3Cue('日本語字幕');
      return json3Cue('English source');
    }
  });

  await expect.poll(async () => (await snapshot(page)).targetLang).toBe('ja');
  await expect(page.locator('.yds-native-line-b')).toHaveText('日本語字幕');
});

test('keeps subtitles above large visible controls in theater-style players', async ({ page }) => {
  await setupMockWatch(page, {
    tracks: [
      captionTrack('en', 'English')
    ],
    defaultTrackIndex: 0,
    timedText(url) {
      if (url.searchParams.get('tlang')) return json3Cue('中文字幕');
      return json3Cue('English source');
    }
  });

  await expect.poll(async () => (await snapshot(page)).phase).toBe('ready');
  await page.evaluate(() => {
    const player = document.querySelector('.html5-video-player');
    const controls = document.querySelector('.ytp-chrome-bottom');
    player.style.height = '720px';
    player.classList.add('ytp-big-mode');
    controls.style.height = '300px';
    const native = document.querySelector('#yds-native-window');
    if (native) native.__ydsStyleAt = 0;
    window.__setMockTime(1);
  });

  await expect.poll(async () => page.locator('#yds-native-window').evaluate((node) => node.style.bottom)).toBe('22%');
});

test('drops subtitles to the video bottom when player controls autohide', async ({ page }) => {
  await setupMockWatch(page, {
    settings: {
      bottomOffset: 2,
      machineTranslateFallback: false,
      machineTranslateFallbackUserSet: true
    },
    tracks: [
      captionTrack('en', 'English')
    ],
    defaultTrackIndex: 0,
    timedText(url) {
      if (url.searchParams.get('tlang')) return json3Cue('中文字幕');
      return json3Cue('English source');
    }
  });

  await expect.poll(async () => (await snapshot(page)).phase).toBe('ready');

  await page.evaluate(() => {
    const player = document.querySelector('.html5-video-player');
    const controls = document.querySelector('.ytp-chrome-bottom');
    player.style.height = '720px';
    player.classList.add('ytp-big-mode');
    controls.style.height = '300px';
    const native = document.querySelector('#yds-native-window');
    if (native) native.__ydsStyleAt = 0;
    window.__setMockTime(1);
  });

  await expect.poll(async () => page.locator('#yds-native-window').evaluate((node) => node.style.bottom)).toBe('22%');

  await page.evaluate(() => {
    const player = document.querySelector('.html5-video-player');
    player.classList.add('ytp-autohide');
    const native = document.querySelector('#yds-native-window');
    if (native) native.__ydsStyleAt = 0;
  });
  await expect.poll(async () => page.locator('#yds-native-window').evaluate((node) => node.style.bottom)).toBe('2%');
});

test('uses translated timedtext when no direct target track exists', async ({ page }) => {
  await setupMockWatch(page, {
    tracks: [
      captionTrack('en', 'English')
    ],
    defaultTrackIndex: 0,
    timedText(url) {
      if (url.searchParams.get('tlang') === 'zh-Hans') return json3Cue('机器翻译字幕');
      return json3Cue('English source line');
    }
  });

  await expect.poll(async () => (await snapshot(page)).phase).toBe('ready');

  const state = await snapshot(page);
  expect(state.tracks).toHaveLength(1);
  expect(state.cuesA).toBe(1);
  expect(state.cuesB).toBe(1);
  expect(state.fetch.target).toContain('->zh-Hans');

  await expect(page.locator('.yds-native-line-a')).toHaveText('English source line');
  await expect(page.locator('.yds-native-line-b')).toHaveText('机器翻译字幕');
});

test('uses a YouTube translation-language dropdown and auto-saves style choices', async ({ page }) => {
  await setupMockWatch(page, {
    tracks: [
      captionTrack('en', 'English')
    ],
    translationLanguages: [
      {
        languageCode: 'zh-Hans',
        languageName: {
          simpleText: 'Chinese (Simplified)'
        }
      },
      {
        languageCode: 'ja',
        languageName: {
          simpleText: 'Japanese'
        }
      }
    ],
    defaultTrackIndex: 0,
    timedText(url) {
      if (url.searchParams.get('tlang') === 'ja') return json3Cue('日本語字幕');
      if (url.searchParams.get('tlang') === 'zh-Hans') return json3Cue('中文字幕');
      return json3Cue('English source line');
    }
  });

  await expect.poll(async () => (await snapshot(page)).phase).toBe('ready');
  await expect(page.locator('#yds-launcher-root')).toHaveText('X');
  await expect(page.locator('#yds-panel-root')).toHaveCount(0);
  await expect(page.locator('ytd-watch-metadata #actions > #yds-page-slot #yds-launcher-root')).toHaveCount(1);
  await page.locator('#yds-launcher-root').click();
  await expect(page.locator('#yds-panel-root')).toHaveCSS('border-radius', '12px');
  await page.evaluate(() => document.documentElement.setAttribute('dark', ''));
  await expect(page.locator('#yds-panel-root')).toHaveCSS('background-color', 'rgb(40, 40, 40)');
  await expect(page.locator('#yds-launcher-root')).toHaveCSS('background-color', 'rgb(63, 63, 63)');
  await page.evaluate(() => document.documentElement.removeAttribute('dark'));

  const targetLang = page.locator('[data-yds-control="target-lang"]');
  const sourceTrack = page.locator('[data-yds-control="source-track-index"]');
  await expect(sourceTrack.locator('option')).toHaveText([
    '#0 English (en)'
  ]);
  await expect(targetLang).toHaveValue('zh-Hans');
  await expect(targetLang.locator('option')).toHaveText([
    'Chinese (Simplified) (zh-Hans)',
    'Japanese (ja)'
  ]);
  await expect(page.locator('.yds-advanced')).not.toHaveAttribute('open', '');
  await expect(page.locator('#yds-debug-box')).not.toBeVisible();

  await page.locator('[data-yds-control="target-lang-search"]').fill('Japanese');
  await expect(targetLang.locator('option')).toHaveText([
    'zh-Hans (zh-Hans)',
    'Japanese (ja)'
  ]);
  await targetLang.selectOption('ja');
  await expect.poll(async () => (await snapshot(page)).targetLang).toBe('ja');
  await expect.poll(async () => (await snapshot(page)).phase).toBe('ready');
  await expect(page.locator('.yds-native-line-b')).toHaveText('日本語字幕');

  await page.locator('[data-yds-control="display-mode"]').selectOption('target');
  await expect.poll(async () => (await snapshot(page)).displayMode).toBe('target');
  await expect(page.locator('.yds-native-line-a')).toBeHidden();
  await expect(page.locator('.yds-native-line-b')).toHaveText('日本語字幕');
  await page.locator('[data-yds-control="display-mode"]').selectOption('dual');
  await expect(page.locator('.yds-native-line-a')).toHaveText('English source line');

  await expect(page.locator('[data-yds-control="syncNativeStyle"]')).toHaveCount(0);
  await expect(page.locator('[data-yds-control="smartPosition"]')).toHaveCount(0);
  await expect(page.locator('.yds-native-line-a')).toHaveCSS('font-size', '28px');
  await expect(page.locator('.yds-native-line-a')).toHaveCSS('white-space', 'nowrap');
  await expect(page.locator('.yds-native-line-a')).toHaveCSS('text-overflow', 'ellipsis');
  await expect(page.locator('.yds-native-line-b')).toHaveCSS('white-space', 'nowrap');
  await expect(page.locator('.yds-native-line-b')).toHaveCSS('text-overflow', 'ellipsis');
  await expect(page.locator('.yds-native-line-a')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await expect(page.locator('.yds-native-line-b')).toHaveCSS('color', 'rgb(227, 68, 252)');

  await page.locator('[data-yds-control="font-family"]').selectOption('mono');
  await expect.poll(async () => {
    return page.evaluate(() => JSON.parse(window.localStorage.getItem('__yds_gm__yds_native_settings_v2')).fontFamily);
  }).toBe('mono');
  await expect(page.locator('.yds-native-line-a')).toHaveCSS('font-family', /Consolas|monospace/);

  await page.getByRole('button', { name: '关闭双字幕' }).click();
  await expect.poll(async () => (await snapshot(page)).phase).toBe('disabled');
  await expect(page.locator('#yds-native-window')).toHaveCount(0);
  await expect.poll(async () => {
    return page.evaluate(() => JSON.parse(window.localStorage.getItem('__yds_gm__yds_native_settings_v2')).enabled);
  }).toBe(false);

  await page.getByRole('button', { name: '开启双字幕' }).click();
  await expect.poll(async () => (await snapshot(page)).phase).toBe('ready');
  await expect(page.locator('.yds-native-line-b')).toHaveText('日本語字幕');
});

test('remembers target language per source language', async ({ page }) => {
  await setupMockWatch(page, {
    tracks: [
      captionTrack('en', 'English'),
      captionTrack('fr', 'French')
    ],
    translationLanguages: [
      {
        languageCode: 'zh-Hans',
        languageName: {
          simpleText: 'Chinese (Simplified)'
        }
      },
      {
        languageCode: 'ko',
        languageName: {
          simpleText: 'Korean'
        }
      }
    ],
    defaultTrackIndex: 0,
    timedText(url) {
      const lang = url.searchParams.get('lang');
      const target = url.searchParams.get('tlang');
      if (target) return json3Cue(`${lang}->${target}`);
      return json3Cue(`${lang} source`);
    }
  });

  await expect.poll(async () => (await snapshot(page)).phase).toBe('ready');
  await page.locator('#yds-launcher-root').click();

  await page.locator('[data-yds-control="target-lang"]').selectOption('ko');
  await expect(page.locator('.yds-native-line-b')).toHaveText('en->ko');
  await page.locator('[data-yds-control="source-track-index"]').selectOption('1');
  await expect.poll(async () => (await snapshot(page)).source).toContain('#1 French (fr)');
  await expect(page.locator('[data-yds-control="target-lang"]')).toHaveValue('zh-Hans');
  await expect(page.locator('.yds-native-line-b')).toHaveText('fr->zh-Hans');

  await page.locator('[data-yds-control="source-track-index"]').selectOption('0');
  await expect.poll(async () => (await snapshot(page)).source).toContain('#0 English (en)');
  await expect(page.locator('[data-yds-control="target-lang"]')).toHaveValue('ko');
  await expect(page.locator('.yds-native-line-b')).toHaveText('en->ko');
});

test('retries timedtext with native player request params', async ({ page }) => {
  await setupMockWatch(page, {
    tracks: [
      captionTrack('en', 'English')
    ],
    defaultTrackIndex: 0,
    nativeTimedTextHintParams: {
      potc: '1',
      pot: 'mock-pot',
      xorb: '2',
      xobt: '3',
      xovt: '3'
    },
    timedText(url) {
      if (url.searchParams.get('tlang') === 'zh-Hans') {
        if (url.searchParams.get('pot') === 'mock-pot') return json3Cue('POT 翻译字幕');
        return emptyJson3();
      }
      return json3Cue('Normal source line');
    }
  });

  await expect.poll(async () => (await snapshot(page)).phase).toBe('ready');

  const state = await snapshot(page);
  expect(state.cuesA).toBe(1);
  expect(state.cuesB).toBe(1);
  expect(state.fetch.source).not.toContain(':native');
  expect(state.fetch.target).toContain(':native');

  await expect(page.locator('.yds-native-line-a')).toHaveText('Normal source line');
  await expect(page.locator('.yds-native-line-b')).toHaveText('POT 翻译字幕');
});

test('activates native captions without media controls when player translation is unavailable', async ({ page }) => {
  await setupMockWatch(page, {
    tracks: [
      captionTrack('en', 'English')
    ],
    defaultTrackIndex: 0,
    nativeTimedTextHintAutoRequest: false,
    nativeTimedTextHintParams: {
      pot: 'warm-pot'
    },
    timedText(url) {
      if (url.searchParams.get('tlang') === 'zh-Hans') return json3Cue('按钮译文');
      return json3Cue('Button source');
    }
  });

  await expect.poll(async () => (await snapshot(page)).phase).toBe('ready');

  const calls = await page.evaluate(() => window.__mockCaptionApiCalls);
  expect(calls).toEqual([]);
  await expect(page.locator('.ytp-subtitles-button')).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(() => ({
    pause: window.__mockVideoPauseCalls,
    play: window.__mockVideoPlayCalls
  }))).toEqual({
    pause: 0,
    play: 0
  });

  const state = await snapshot(page);
  expect(state.fetch.source).not.toContain(':native');
  await expect(page.locator('.yds-native-line-b')).toHaveText('按钮译文');
});

test('does not toggle native captions off when reloads happen before YouTube updates aria state', async ({ page }) => {
  await setupMockWatch(page, {
    tracks: [
      captionTrack('en', 'English')
    ],
    defaultTrackIndex: 0,
    subtitleToggleDelayMs: 1000,
    timedText(url) {
      if (url.searchParams.get('tlang') === 'zh-Hans') return json3Cue('延迟按钮译文');
      return json3Cue('Delayed button source');
    }
  });

  await page.evaluate(() => window.__ydsDebug.reload());
  await expect.poll(async () => page.evaluate(() => window.__mockSubtitleButtonClicks)).toBe(1);
  await expect(page.locator('.ytp-subtitles-button')).toHaveAttribute('aria-pressed', 'true');
  await page.waitForTimeout(1800);
  expect(await page.evaluate(() => window.__mockSubtitleButtonClicks)).toBe(1);
});

test('retries the native captions button if YouTube ignores the first click', async ({ page }) => {
  await setupMockWatch(page, {
    tracks: [
      captionTrack('en', 'English')
    ],
    defaultTrackIndex: 0,
    subtitleIgnoreFirstClick: true,
    timedText(url) {
      if (url.searchParams.get('tlang') === 'zh-Hans') return json3Cue('重试按钮译文');
      return json3Cue('Retry button source');
    }
  });

  await expect.poll(async () => page.evaluate(() => window.__mockSubtitleButtonClicks)).toBe(2);
  await expect(page.locator('.ytp-subtitles-button')).toHaveAttribute('aria-pressed', 'true');
});

test('recovers source captions from native timedtext params when plain json3 is empty', async ({ page }) => {
  await setupMockWatch(page, {
    allowNativeHintWait: true,
    tracks: [
      captionTrack('en', 'English')
    ],
    defaultTrackIndex: 0,
    nativeTimedTextHintParams: {
      pot: 'native-pot'
    },
    timedText(url) {
      if (url.searchParams.get('pot') === 'native-pot') {
        if (url.searchParams.get('tlang') === 'zh-Hans') return json3Cue('原生参数译文');
        return json3Cue('Native params source');
      }
      return emptyJson3();
    }
  });

  await expect.poll(async () => (await snapshot(page)).phase).toBe('ready');
  const state = await snapshot(page);
  expect(state.fetch.source).toContain('native-wait:ok');
  expect(state.fetch.source).toContain(':native');
  await expect(page.locator('.yds-native-line-a')).toHaveText('Native params source');
  await expect(page.locator('.yds-native-line-b')).toHaveText('原生参数译文');
});

test('primes YouTube player caption API and prefers native target timedtext params', async ({ page }) => {
  await setupMockWatch(page, {
    tracks: [
      captionTrack('en', 'English')
    ],
    defaultTrackIndex: 0,
    nativeTimedTextHintAutoRequest: false,
    nativeTimedTextHintParams: {
      pot: 'prime-pot',
      xovt: 'prime-xovt'
    },
    translationLanguages: [
      { languageCode: 'zh-Hans', languageName: 'Chinese (Simplified)' }
    ],
    timedText(url) {
      if (url.searchParams.get('tlang') === 'zh-Hans') {
        if (url.searchParams.get('pot') === 'prime-pot') return json3Cue('原生预热译文');
        return json3Cue('普通译文');
      }
      return json3Cue('Prime source');
    }
  });

  await expect.poll(async () => (await snapshot(page)).phase).toBe('ready');
  const state = await snapshot(page);
  const calls = await page.evaluate(() => window.__mockCaptionApiCalls);
  const trackCall = calls.find((call) => call[0] === 'setOption' && call[1] === 'captions' && call[2] === 'track');

  expect(calls.map((call) => call.slice(0, 3))).toEqual([
    ['loadModule', 'captions'],
    ['setOption', 'captions', 'track'],
    ['setOption', 'captions', 'translationLanguage'],
    ['setOption', 'captions', 'reload']
  ]);
  expect(trackCall[3].translationLanguage.languageCode).toBe('zh-Hans');
  expect(calls.find((call) => call[0] === 'setOption' && call[2] === 'translationLanguage')[3].languageCode).toBe('zh-Hans');
  expect(state.playerApiPrime).toBe('ok:zh-Hans');
  expect(state.fetch.target.split(' | ')[0]).toContain(':native');
  expect(state.translationRequest).toBe('native');
  expect(state.translationResult).toBe('ok');
  await expect(page.locator('.yds-native-line-b')).toHaveText('原生预热译文');
  await expect.poll(async () => page.evaluate(() => window.__mockVideoPlayCalls + window.__mockVideoPauseCalls)).toBe(0);
});

test('primes player captions with target code when the API language list misses the exact target', async ({ page }) => {
  await setupMockWatch(page, {
    tracks: [
      captionTrack('en', 'English')
    ],
    defaultTrackIndex: 0,
    translationLanguages: [
      { languageCode: 'ja', languageName: 'Japanese' }
    ],
    timedText(url) {
      if (url.searchParams.get('tlang') === 'zh-Hans') return json3Cue('目标 code 译文');
      return json3Cue('Target code source');
    }
  });

  await expect.poll(async () => (await snapshot(page)).phase).toBe('ready');

  const calls = await page.evaluate(() => window.__mockCaptionApiCalls);
  const trackCall = calls.find((call) => call[0] === 'setOption' && call[2] === 'track');
  const state = await snapshot(page);
  expect(trackCall[3].translationLanguage.languageCode).toBe('zh-Hans');
  expect(state.playerApiPrime).toBe('ok:zh-Hans');
  await expect(page.locator('.yds-native-line-b')).toHaveText('目标 code 译文');
});

test('primes auto-generated captions when player caption tracklist is empty', async ({ page }) => {
  await setupMockWatch(page, {
    tracks: [
      asrTrack()
    ],
    playerCaptionTracklist: [],
    defaultTrackIndex: 0,
    nativeTimedTextHintAutoRequest: false,
    nativeTimedTextHintParams: {
      pot: 'asr-pot',
      xovt: 'asr-xovt'
    },
    translationLanguages: [
      { languageCode: 'zh-Hans', languageName: 'Chinese (Simplified)' }
    ],
    timedText(url) {
      if (url.searchParams.get('tlang') === 'zh-Hans') {
        if (url.searchParams.get('pot') === 'asr-pot') return json3Cue('空 tracklist 自动字幕译文');
        return emptyJson3();
      }
      return json3Cue('ASR source');
    }
  });

  await expect.poll(async () => (await snapshot(page)).phase).toBe('ready');
  const state = await snapshot(page);
  const calls = await page.evaluate(() => window.__mockCaptionApiCalls);
  const trackCall = calls.find((call) => call[0] === 'setOption' && call[1] === 'captions' && call[2] === 'track');

  expect(state.playerApiPrime).toBe('ok:zh-Hans');
  expect(trackCall[3].kind).toBe('asr');
  expect(trackCall[3].vss_id).toBe('a.en');
  expect(trackCall[3].translationLanguage.languageCode).toBe('zh-Hans');
  expect(state.sourceKind).toBe('asr');
  expect(state.asrSync).toBe('snap-ok');
  expect(state.asrSyncDetail).toBe('1/1');
  expect(state.fetch.source).toContain(':asr');
  expect(state.fetch.target).toContain(':asr');
  expect(state.translationRequest).toBe('native');
  expect(state.translationResult).toBe('ok');
  await expect(page.locator('.yds-native-line-a')).toHaveText('ASR source');
  await expect(page.locator('.yds-native-line-b')).toHaveText('空 tracklist 自动字幕译文');
});

test('uses one ASR timedtext track and lightly snaps translated cues to source timing', async ({ page }) => {
  const requests = [];

  await setupMockWatch(page, {
    tracks: [
      asrTrack()
    ],
    defaultTrackIndex: 0,
    translationLanguages: [
      { languageCode: 'zh-Hans', languageName: 'Chinese (Simplified)' }
    ],
    timedText(url) {
      requests.push({
        lang: url.searchParams.get('lang'),
        kind: url.searchParams.get('kind'),
        target: url.searchParams.get('tlang') || ''
      });
      if (url.searchParams.get('tlang') === 'zh-Hans') {
        return json3Cues([
          { startMs: 300, durationMs: 1000, text: '第一句译文' },
          { startMs: 1800, durationMs: 1000, text: '第二句译文' }
        ]);
      }
      return json3Cues([
        { startMs: 0, durationMs: 1000, text: 'ASR first' },
        { startMs: 1500, durationMs: 1000, text: 'ASR second' }
      ]);
    }
  });

  await expect.poll(async () => (await snapshot(page)).phase).toBe('ready');

  const state = await snapshot(page);
  expect(state.sourceKind).toBe('asr');
  expect(state.asrSync).toBe('snap-ok');
  expect(state.asrSyncDetail).toBe('2/2');
  expect(state.fetch.source).toContain('json3:en:asr');
  expect(state.fetch.target).toContain('json3:en->zh-Hans:asr');
  expect(requests.some((request) => request.kind === 'asr' && request.lang === 'en' && !request.target)).toBe(true);
  expect(requests.some((request) => request.kind === 'asr' && request.lang === 'en' && request.target === 'zh-Hans')).toBe(true);

  await page.evaluate(() => window.__setMockTime(0.1));
  await expect(page.locator('.yds-native-line-a')).toHaveText('ASR first');
  await expect(page.locator('.yds-native-line-b')).toHaveText('第一句译文');

  await page.evaluate(() => window.__setMockTime(1.52));
  await expect(page.locator('.yds-native-line-a')).toHaveText('ASR second');
  await expect(page.locator('.yds-native-line-b')).toHaveText('第二句译文');
});

test('skips ASR cue snapping when translated segmentation is too different', async ({ page }) => {
  await setupMockWatch(page, {
    tracks: [
      asrTrack()
    ],
    defaultTrackIndex: 0,
    translationLanguages: [
      { languageCode: 'zh-Hans', languageName: 'Chinese (Simplified)' }
    ],
    timedText(url) {
      if (url.searchParams.get('tlang') === 'zh-Hans') {
        return json3Cues([
          { startMs: 5000, durationMs: 1000, text: '远处译文一' },
          { startMs: 7000, durationMs: 1000, text: '远处译文二' }
        ]);
      }
      return json3Cues([
        { startMs: 0, durationMs: 1000, text: 'ASR first' },
        { startMs: 1500, durationMs: 1000, text: 'ASR second' }
      ]);
    }
  });

  await expect.poll(async () => (await snapshot(page)).phase).toBe('ready');

  const state = await snapshot(page);
  expect(state.sourceKind).toBe('asr');
  expect(state.asrSync).toBe('snap-skip');
  expect(state.asrSyncDetail).toBe('0/2');

  await page.evaluate(() => window.__setMockTime(0.1));
  await expect(page.locator('.yds-native-line-a')).toHaveText('ASR first');
  await expect(page.locator('.yds-native-line-b')).toBeHidden();
});

test('bridges native DOM when ASR translated timedtext is rate limited', async ({ page }) => {
  await setupMockWatch(page, {
    tracks: [
      asrTrack()
    ],
    defaultTrackIndex: 0,
    nativeCaptionText: '',
    nativeMenuSummaryText: '字幕 (1) 英文 (自動產生) >> 中文（繁體字）',
    nativeMenuTranslatedText: '菜单触发译文',
    translationLanguages: [
      { languageCode: 'zh-Hans', languageName: 'Chinese (Simplified)' }
    ],
    timedText(url) {
      if (url.searchParams.get('tlang') === 'zh-Hans') {
        return {
          status: 429,
          contentType: 'text/html; charset=utf-8',
          body: '<html><title>Sorry...</title></html>'
        };
      }
      return json3Cue('ASR source survives');
    }
  });

  await expect.poll(async () => (await snapshot(page)).phase).toBe('ready');

  let state = await snapshot(page);
  expect(state.sourceKind).toBe('asr');
  expect(state.nativeTargetFallback).toBe(true);
  expect(state.nativeTargetFallbackReason).toBe('target-429');
  expect(state.nativeTargetFallbackPreserve).toBe(false);
  expect(state.fetch.source).toContain(':asr');
  expect(state.fetch.target).toContain(':asr');
  await expect(page.locator('.yds-native-line-a')).toHaveText('ASR source survives');
  await expect(page.locator('.yds-native-line-b')).toBeHidden();
  await expect(page.locator('.ytp-caption-window-container')).toHaveClass(/yds-native-mode/);
  await expect.poll(async () => (await snapshot(page)).nativeTranslationTrigger).toBe('ok:target-429');
  await expect.poll(async () => (await snapshot(page)).nativeMenuTrigger).toMatch(/^(ok:auto-translate:zh-Hans|skipped:already-text)$/);
  await expect.poll(async () => page.evaluate(() => window.__mockVideoPlayCalls + window.__mockVideoPauseCalls)).toBe(0);

  const calls = await page.evaluate(() => window.__mockCaptionApiCalls);
  const trackCalls = calls.filter((call) => call[0] === 'setOption' && call[1] === 'captions' && call[2] === 'track');
  const translationCalls = calls.filter((call) => call[0] === 'setOption' && call[1] === 'captions' && call[2] === 'translationLanguage');
  const reloadCalls = calls.filter((call) => call[0] === 'setOption' && call[1] === 'captions' && call[2] === 'reload');
  const translatedTrackCalls = trackCalls.filter((call) => call[3] && call[3].translationLanguage && call[3].translationLanguage.languageCode === 'zh-Hans');
  const sourceTrackCalls = trackCalls.filter((call) => call[3] && call[3].kind === 'asr' && call[3].vss_id === 'a.en' && !call[3].translationLanguage);
  const translationCodes = translationCalls.map((call) => call[3] && call[3].languageCode ? call[3].languageCode : null);

  expect(translatedTrackCalls.length).toBeGreaterThanOrEqual(2);
  expect(sourceTrackCalls.length).toBeGreaterThanOrEqual(1);
  expect(translationCodes).toEqual(expect.arrayContaining(['zh-Hans', null]));
  expect(reloadCalls.length).toBeGreaterThanOrEqual(3);

  await expect.poll(async () => (await snapshot(page)).nativeTargetFallbackText).toBe('菜单触发译文');
  await expect(page.locator('.yds-native-line-b')).toHaveText('菜单触发译文');
  state = await snapshot(page);
  if (state.nativeMenuTrigger === 'ok:auto-translate:zh-Hans') {
    await expect.poll(async () => page.evaluate(() => window.__mockMenuTriggerCalls.map((call) => call.join(':')).join('|'))).toContain('target:zh-Hans');
    await expect.poll(async () => page.evaluate(() => window.__mockMenuTriggerCalls.map((call) => call.join(':')).join('|'))).toContain('subtitles');
  }
  state = await snapshot(page);
  expect(state.nativeTargetFallbackPreserve).toBe(false);
});

test('recovers ASR translated timedtext after YouTube prepares native translation late', async ({ page }) => {
  let targetAttempts = 0;

  await setupMockWatch(page, {
    tracks: [
      asrTrack()
    ],
    defaultTrackIndex: 0,
    nativeTimedTextHintParams: {
      fmt: 'json3',
      pot: 'late-pot'
    },
    translationLanguages: [
      { languageCode: 'zh-Hans', languageName: 'Chinese (Simplified)' }
    ],
    timedText(url) {
      if (url.searchParams.get('tlang') === 'zh-Hans') {
        targetAttempts += 1;
        if (targetAttempts <= 2) {
          return {
            status: 429,
            contentType: 'text/html; charset=utf-8',
            body: '<html><title>Sorry...</title></html>'
          };
        }
        return json3Cue('延迟恢复译文');
      }
      return json3Cue('Late ASR source');
    }
  });

  await expect.poll(async () => (await snapshot(page)).cuesB, {
    timeout: 10000
  }).toBe(1);

  const state = await snapshot(page);
  expect(state.sourceKind).toBe('asr');
  expect(state.translationResult).toBe('ok');
  expect(state.targetRecoveryRetryCount).toBe(1);
  expect(targetAttempts).toBeGreaterThan(2);
  await expect(page.locator('.yds-native-line-a')).toHaveText('Late ASR source');
  await expect(page.locator('.yds-native-line-b')).toHaveText('延迟恢复译文');
});

test('stops ASR target recovery when native DOM translation appears late', async ({ page }) => {
  let targetAttempts = 0;

  await setupMockWatch(page, {
    tracks: [
      asrTrack()
    ],
    defaultTrackIndex: 0,
    nativeCaptionText: '',
    nativeMenuSummaryText: '字幕 (1) English (auto-generated) >> Chinese (Simplified)',
    translationLanguages: [
      { languageCode: 'zh-Hans', languageName: 'Chinese (Simplified)' }
    ],
    timedText(url) {
      if (url.searchParams.get('tlang') === 'zh-Hans') {
        targetAttempts += 1;
        return {
          status: 429,
          contentType: 'text/html; charset=utf-8',
          body: '<html><title>Sorry...</title></html>'
        };
      }
      return json3Cue('Observer source');
    }
  });

  await expect.poll(async () => (await snapshot(page)).targetRecoveryRetry, {
    timeout: 10000
  }).toContain('scheduled:target-429');

  const attemptsAfterSchedule = targetAttempts;
  await page.evaluate(() => {
    document.querySelector('.ytp-caption-segment').textContent = '观察器译文';
  });

  await expect(page.locator('.yds-native-line-a')).toHaveText('Observer source');
  await expect(page.locator('.yds-native-line-b')).toHaveText('观察器译文');
  await expect.poll(async () => (await snapshot(page)).nativeDomObserver).toMatch(/^target:/);
  await expect.poll(async () => (await snapshot(page)).targetRecoveryRetry).toContain('cleared:native-dom-target');

  await page.waitForTimeout(3200);
  expect(targetAttempts).toBe(attemptsAfterSchedule);
});

test('loads translated cues when source timedtext is empty but player translation is applied', async ({ page }) => {
  await setupMockWatch(page, {
    tracks: [
      captionTrack('en', 'English')
    ],
    defaultTrackIndex: 0,
    translationLanguages: [
      { languageCode: 'zh-Hans', languageName: 'Chinese (Simplified)' }
    ],
    timedText(url) {
      if (url.searchParams.get('tlang') === 'zh-Hans') return json3Cue('只有译文也要显示');
      return emptyJson3();
    }
  });

  await expect.poll(async () => (await snapshot(page)).phase, {
    timeout: 10000
  }).toBe('ready');

  const state = await snapshot(page);
  expect(state.playerApiPrime).toBe('ok:zh-Hans');
  expect(state.fetch.source).toContain('source-empty-target-allowed');
  expect(state.fetch.target).not.toContain('skip-source-empty');
  expect(state.translationRequest).toBe('plain');
  expect(state.translationResult).toBe('ok');
  expect(state.cuesA).toBe(0);
  expect(state.cuesB).toBe(1);
  await expect(page.locator('.yds-native-line-a')).toBeHidden();
  await expect(page.locator('.yds-native-line-b')).toHaveText('只有译文也要显示');
});

test('falls back to plain translated timedtext when player caption API is missing', async ({ page }) => {
  await setupMockWatch(page, {
    playerCaptionApi: false,
    tracks: [
      captionTrack('en', 'English')
    ],
    defaultTrackIndex: 0,
    translationLanguages: [
      { languageCode: 'zh-Hans', languageName: 'Chinese (Simplified)' }
    ],
    timedText(url) {
      if (url.searchParams.get('tlang') === 'zh-Hans') return json3Cue('普通译文');
      return json3Cue('Plain fallback source');
    }
  });

  await expect.poll(async () => (await snapshot(page)).phase).toBe('ready');
  const state = await snapshot(page);
  expect(state.playerApiPrime).toBe('miss:api-missing');
  expect(state.fetch.target.split(' | ')[0]).not.toContain(':native');
  expect(state.translationRequest).toBe('plain');
  expect(state.translationResult).toBe('ok');
  expect(await page.evaluate(() => window.__mockCaptionApiCalls)).toEqual([]);
  await expect(page.locator('.yds-native-line-b')).toHaveText('普通译文');
});

test('falls back to plain translated timedtext when player caption API throws', async ({ page }) => {
  await setupMockWatch(page, {
    playerCaptionApi: {
      setOptionThrows: true
    },
    tracks: [
      captionTrack('en', 'English')
    ],
    defaultTrackIndex: 0,
    translationLanguages: [
      { languageCode: 'zh-Hans', languageName: 'Chinese (Simplified)' }
    ],
    timedText(url) {
      if (url.searchParams.get('tlang') === 'zh-Hans') return json3Cue('抛错降级译文');
      return json3Cue('Throw fallback source');
    }
  });

  await expect.poll(async () => (await snapshot(page)).phase).toBe('ready');
  const state = await snapshot(page);
  expect(state.playerApiPrime).toContain('error:');
  expect(state.fetch.target.split(' | ')[0]).not.toContain(':native');
  expect(state.translationRequest).toBe('plain');
  expect(state.translationResult).toBe('ok');
  await expect(page.locator('.yds-native-line-b')).toHaveText('抛错降级译文');
  await expect.poll(async () => page.evaluate(() => window.__mockVideoPlayCalls + window.__mockVideoPauseCalls)).toBe(0);
});

test('does not repeat player caption API prime on quick reload', async ({ page }) => {
  await setupMockWatch(page, {
    tracks: [
      captionTrack('en', 'English')
    ],
    defaultTrackIndex: 0,
    translationLanguages: [
      { languageCode: 'zh-Hans', languageName: 'Chinese (Simplified)' }
    ],
    timedText(url) {
      if (url.searchParams.get('tlang') === 'zh-Hans') return json3Cue('一次预热译文');
      return json3Cue('Single prime source');
    }
  });

  await expect.poll(async () => (await snapshot(page)).phase).toBe('ready');
  await page.evaluate(() => window.__ydsDebug.reload());
  await expect.poll(async () => (await snapshot(page)).phase).toBe('ready');

  const calls = await page.evaluate(() => window.__mockCaptionApiCalls);
  const setTrackCalls = calls.filter((call) => call[0] === 'setOption' && call[1] === 'captions' && call[2] === 'track');
  const reloadCalls = calls.filter((call) => call[0] === 'setOption' && call[1] === 'captions' && call[2] === 'reload');
  const state = await snapshot(page);

  expect(setTrackCalls).toHaveLength(1);
  expect(reloadCalls).toHaveLength(1);
  expect(state.playerApiPrime).toBe('skipped:recent-ok');
});

test('automatically retries after first source-empty pass so manual reload is not required', async ({ page }) => {
  let sourceRequests = 0;

  await setupMockWatch(page, {
    tracks: [
      captionTrack('en', 'English')
    ],
    defaultTrackIndex: 0,
    timedText(url) {
      if (!url.searchParams.get('tlang')) {
        sourceRequests += 1;
        if (sourceRequests === 1) return emptyJson3();
        return json3Cue('Auto retry source');
      }
      return json3Cue('自动重试译文');
    }
  });

  await expect.poll(async () => (await snapshot(page)).phase, {
    timeout: 10000
  }).toBe('ready');

  const state = await snapshot(page);
  expect(sourceRequests).toBeGreaterThanOrEqual(2);
  expect(state.cuesA).toBe(1);
  expect(state.cuesB).toBe(1);
  await expect(page.locator('.yds-native-line-a')).toHaveText('Auto retry source');
  await expect(page.locator('.yds-native-line-b')).toHaveText('自动重试译文');
});

test('self-heals when startup leaves the UI mounted without a running subtitle loop', async ({ page }) => {
  let playerCalls = 0;

  await setupMockWatch(page, {
    initialTracks: [],
    tracks: [
      captionTrack('en', 'English')
    ],
    defaultTrackIndex: 0,
    translationLanguages: [
      { languageCode: 'zh-Hans', languageName: 'Chinese (Simplified)' }
    ],
    playerEndpoint() {
      playerCalls += 1;
      if (playerCalls <= 2) {
        return {
          status: 500,
          body: '{}'
        };
      }
      return null;
    },
    timedText(url) {
      if (url.searchParams.get('tlang') === 'zh-Hans') return json3Cue('自愈后译文');
      return json3Cue('Recovered startup source');
    }
  });

  await expect.poll(async () => (await snapshot(page)).phase, {
    timeout: 10000
  }).toBe('ready');

  const state = await snapshot(page);
  expect(state.runtimeHealthRecoveries).toBeGreaterThan(0);
  expect(state.runtimeHealth).toContain('recover:url-poll:wait-tracks');
  expect(state.runtimeHeartbeat).toContain('loop:on');
  expect(state.loopRunning).toBe(true);
  expect(state.loopStartCount).toBeGreaterThan(0);
  expect(playerCalls).toBeGreaterThanOrEqual(3);
  await expect(page.locator('.yds-native-line-a')).toHaveText('Recovered startup source');
  await expect(page.locator('.yds-native-line-b')).toHaveText('自愈后译文');
});

test('skips translated timedtext when the source track has no cues', async ({ page }) => {
  let targetRequests = 0;

  await setupMockWatch(page, {
    tracks: [
      captionTrack('en', 'English')
    ],
    defaultTrackIndex: 0,
    transcriptEndpoint: false,
    timedText(url) {
      if (url.searchParams.get('tlang')) targetRequests += 1;
      return emptyJson3();
    }
  });

  await expect.poll(async () => (await snapshot(page)).phase, {
    timeout: 15000
  }).toBe('no-cues');

  const state = await snapshot(page);
  expect(targetRequests).toBe(0);
  expect(state.cuesA).toBe(0);
  expect(state.cuesB).toBe(0);
  expect(state.fetch.target).toContain('skip-source-empty');
  expect(state.translationRequest).toBe('skipped-source-empty');
  expect(state.translationResult).toBe('skipped');
});

test('keeps source captions when translated timedtext is rate limited', async ({ page }) => {
  let machineRequests = 0;

  await setupMockWatch(page, {
    settings: {
      machineTranslateFallback: false,
      machineTranslateFallbackUserSet: true
    },
    tracks: [
      captionTrack('en', 'English')
    ],
    defaultTrackIndex: 0,
    timedText(url) {
      if (url.searchParams.get('tlang')) {
        return {
          status: 429,
          contentType: 'text/html; charset=utf-8',
          body: '<html><title>Sorry...</title></html>'
        };
      }
      return json3Cue('English source survives');
    },
    machineTranslate() {
      machineRequests += 1;
      return JSON.stringify([[['should not be requested', '']]]);
    }
  });

  await expect.poll(async () => (await snapshot(page)).phase).toBe('ready');

  const state = await snapshot(page);
  expect(state.cuesA).toBe(1);
  expect(state.cuesB).toBe(0);
  expect(state.fetch.target).toContain('target-error-kept-source');
  expect(state.status).toContain('译文暂时不可用');
  expect(state.backoffRemainingMs).toBe(0);
  expect(state.targetPending).toBe(false);
  expect(state.machineTranslateActive).toBe(false);
  expect(state.machinePromptStatus).toBe('off');
  expect(state.machineTranslateAvailable).toBe(true);
  expect(machineRequests).toBe(0);

  await expect(page.locator('.yds-native-line-a')).toHaveText('English source survives');
  await expect(page.locator('.yds-native-line-b')).toBeHidden();
  await expect(page.getByRole('button', { name: '本视频启用机翻' })).toHaveCount(0);
});

test('does not ask for machine translation while machine-first is disabled by the user', async ({ page }) => {
  let machineRequests = 0;

  await setupMockWatch(page, {
    videoId: 'prompt-first',
    settings: {
      machineTranslateFallback: false,
      machineTranslateFallbackUserSet: true
    },
    tracks: [
      captionTrack('en', 'English')
    ],
    defaultTrackIndex: 0,
    nativeCaptionText: '',
    translationLanguages: [
      { languageCode: 'zh-Hans', languageName: 'Chinese (Simplified)' }
    ],
    timedText(url) {
      if (url.searchParams.get('tlang') === 'zh-Hans') {
        return {
          status: 429,
          contentType: 'text/html; charset=utf-8',
          body: '<html><title>Sorry...</title></html>'
        };
      }
      return json3Cue('Prompt source line');
    },
    machineTranslate(url) {
      machineRequests += 1;
      return JSON.stringify([[['should not be requested', url.searchParams.get('q') || '']]]);
    }
  });

  await expect.poll(async () => (await snapshot(page)).phase).toBe('ready');
  await expect(page.locator('.yds-native-line-a')).toHaveText('Prompt source line');
  await expect(page.locator('.yds-native-line-b')).toBeHidden();
  await expect(page.getByRole('button', { name: '本视频启用机翻' })).toHaveCount(0);
  expect(machineRequests).toBe(0);

  let state = await snapshot(page);
  expect(state.machineTranslateAvailable).toBe(true);
  expect(state.machinePromptStatus).toBe('off');
  expect(state.machineTranslateActive).toBe(false);

  await page.goto('https://www.youtube.com/watch?v=prompt-second&ydsDebug=1', {
    waitUntil: 'domcontentloaded'
  });
  await injectUserscript(page);
  await expect.poll(async () => (await snapshot(page)).phase).toBe('ready');

  state = await snapshot(page);
  expect(state.videoId).toBe('prompt-second');
  expect(state.machineTranslateSetting).toBe(false);
  expect(state.machineTranslateActive).toBe(false);
  expect(state.machinePromptStatus).toBe('off');
  expect(machineRequests).toBe(0);
  await expect(page.getByRole('button', { name: '本视频启用机翻' })).toHaveCount(0);
});

test('upgrades legacy machine translation setting to machine-first mode', async ({ page }) => {
  await setupMockWatch(page, {
    settings: {
      machineTranslateFallback: true
    },
    tracks: [
      captionTrack('en', 'English')
    ],
    defaultTrackIndex: 0,
    nativeCaptionText: '',
    translationLanguages: [
      { languageCode: 'zh-Hans', languageName: 'Chinese (Simplified)' }
    ],
    timedText(url) {
      if (url.searchParams.get('tlang') === 'zh-Hans') {
        return {
          status: 429,
          contentType: 'text/html; charset=utf-8',
          body: '<html><title>Sorry...</title></html>'
        };
      }
      return json3Cue('Legacy setting source');
    }
  });

  await expect.poll(async () => (await snapshot(page)).phase).toBe('ready');
  const state = await snapshot(page);
  expect(state.machineTranslateSetting).toBe(true);
  expect(state.machineTranslateActive).toBe(true);
  expect(state.machineTranslateMode).toBe('primary');
  expect(state.targetProvider).toBe('machine');
  expect(state.machinePromptStatus).toBe('off');
  await expect(page.locator('.yds-native-line-a')).toHaveText('Legacy setting source');
  await expect(page.locator('.yds-native-line-b')).toHaveText('Legacy setting source');
});

test('tries plain translated timedtext after native params are rate limited', async ({ page }) => {
  await setupMockWatch(page, {
    tracks: [
      captionTrack('en', 'English')
    ],
    defaultTrackIndex: 0,
    nativeTimedTextHintParams: {
      fmt: 'json3',
      pot: 'mock-pot'
    },
    translationLanguages: [
      { languageCode: 'zh-Hans', languageName: 'Chinese (Simplified)' }
    ],
    timedText(url) {
      if (url.searchParams.get('tlang') === 'zh-Hans') {
        if (url.searchParams.get('pot') === 'mock-pot') {
          return {
            status: 429,
            contentType: 'text/html; charset=utf-8',
            body: '<html><title>Sorry...</title></html>'
          };
        }
        return json3Cue('普通参数译文');
      }
      return json3Cue('Native 429 source');
    }
  });

  await expect.poll(async () => (await snapshot(page)).phase).toBe('ready');

  const state = await snapshot(page);
  expect(state.cuesA).toBe(1);
  expect(state.cuesB).toBe(1);
  expect(state.fetch.target).toContain(':native:err(HTTP 429');
  expect(state.fetch.target).toContain('json3:en->zh-Hans:ok(1');
  expect(state.translationResult).toBe('ok');
  expect(state.machineTranslateActive).toBe(false);
  await expect(page.locator('.yds-native-line-b')).toHaveText('普通参数译文');
});

test('uses machine translation before a successful YouTube translated target', async ({ page }) => {
  await setupMockWatch(page, {
    settings: {
      machineTranslateFallback: true,
      machineTranslateFallbackUserSet: false
    },
    tracks: [
      captionTrack('en', 'English')
    ],
    defaultTrackIndex: 0,
    translationLanguages: [
      { languageCode: 'zh-Hans', languageName: 'Chinese (Simplified)' }
    ],
    timedText(url) {
      if (url.searchParams.get('tlang') === 'zh-Hans') return json3Cue('YouTube 兜底译文');
      return json3Cue('Machine primary source');
    },
    machineTranslate(url) {
      return JSON.stringify([[['机翻优先译文', url.searchParams.get('q') || '']]]);
    }
  });

  await expect.poll(async () => (await snapshot(page)).phase).toBe('ready');
  await expect(page.locator('.yds-native-line-a')).toHaveText('Machine primary source');
  await expect(page.locator('.yds-native-line-b')).toHaveText('机翻优先译文');

  const state = await snapshot(page);
  expect(state.cuesB).toBe(1);
  expect(state.translationResult).toBe('ok');
  expect(state.machineTranslateActive).toBe(true);
  expect(state.machineTranslateMode).toBe('primary');
  expect(state.machineTranslateLast).toBe('ok');
});

test('falls back to YouTube translated target when machine translation fails', async ({ page }) => {
  await setupMockWatch(page, {
    settings: {
      machineTranslateFallback: true,
      machineTranslateFallbackUserSet: false
    },
    tracks: [
      captionTrack('en', 'English')
    ],
    defaultTrackIndex: 0,
    translationLanguages: [
      { languageCode: 'zh-Hans', languageName: 'Chinese (Simplified)' }
    ],
    timedText(url) {
      if (url.searchParams.get('tlang') === 'zh-Hans') return json3Cue('YouTube fallback after machine error');
      return json3Cue('Machine failure source');
    },
    machineTranslate() {
      return {
        status: 500,
        body: 'machine unavailable'
      };
    }
  });

  await expect.poll(async () => (await snapshot(page)).phase).toBe('ready');
  await expect(page.locator('.yds-native-line-a')).toHaveText('Machine failure source');
  await expect(page.locator('.yds-native-line-b')).toHaveText('YouTube fallback after machine error');

  const state = await snapshot(page);
  expect(state.cuesB).toBe(1);
  expect(state.translationResult).toBe('ok');
  expect(state.machineTranslateActive).toBe(true);
  expect(state.machineTranslateMode).toBe('primary');
  expect(state.machineTranslateLast).toContain('err:HTTP 500');
});

test('uses machine translation first when the stored toggle is on', async ({ page }) => {
  let machineRequests = 0;

  await setupMockWatch(page, {
    settings: {
      machineTranslateFallback: true,
      machineTranslateFallbackUserSet: true
    },
    tracks: [
      captionTrack('en', 'English')
    ],
    defaultTrackIndex: 0,
    nativeCaptionText: '',
    translationLanguages: [
      { languageCode: 'zh-Hans', languageName: 'Chinese (Simplified)' }
    ],
    timedText(url) {
      if (url.searchParams.get('tlang') === 'zh-Hans') {
        return {
          status: 429,
          contentType: 'text/html; charset=utf-8',
          body: '<html><title>Sorry...</title></html>'
        };
      }
      return json3Cue('Machine source line');
    },
    async machineTranslate(url) {
      machineRequests += 1;
      await delay(500);
      return JSON.stringify([[['机翻主译文', url.searchParams.get('q') || '']]]);
    }
  });

  await expect.poll(async () => (await snapshot(page)).phase).toBe('ready');
  await expect(page.locator('.yds-native-line-a')).toHaveText('Machine source line');
  await expect(page.locator('.yds-native-line-b')).toHaveText('机翻主译文');
  await expect(page.locator('#yds-native-window')).not.toHaveClass(/yds-native-target-fallback/);

  await page.evaluate(() => {
    const player = document.querySelector('.html5-video-player');
    const controls = document.querySelector('.ytp-chrome-bottom');
    player.style.height = '360px';
    controls.style.height = '60px';
    const native = document.querySelector('#yds-native-window');
    if (native) native.__ydsStyleAt = 0;
  });
  await expect.poll(async () => page.locator('#yds-native-window').evaluate((node) => node.style.bottom)).toBe('20%');

  await page.evaluate(() => {
    const player = document.querySelector('.html5-video-player');
    player.classList.add('ytp-autohide');
    const native = document.querySelector('#yds-native-window');
    if (native) native.__ydsStyleAt = 0;
  });
  await expect.poll(async () => page.locator('#yds-native-window').evaluate((node) => node.style.bottom)).toBe('2%');

  const state = await snapshot(page);
  expect(state.cuesA).toBe(1);
  expect(state.cuesB).toBe(0);
  expect(state.translationResult).toBe('429');
  expect(state.machineTranslateAvailable).toBe(true);
  expect(state.machineTranslateSetting).toBe(true);
  expect(state.machineTranslateActive).toBe(true);
  expect(state.machineTranslateReason).toBe('source-ready');
  expect(state.machineTranslateMode).toBe('primary');
  expect(state.machinePromptStatus).toBe('off');
  expect(state.machineTranslateLast).toBe('ok');
  expect(state.status).toContain('机翻优先');
  expect(machineRequests).toBeGreaterThan(0);
});

test('does not bridge native caption DOM when it is still the source line', async ({ page }) => {
  await setupMockWatch(page, {
    tracks: [
      captionTrack('en', 'English')
    ],
    defaultTrackIndex: 0,
    nativeCaptionText: 'Still source text',
    translationLanguages: [
      { languageCode: 'zh-Hans', languageName: 'Chinese (Simplified)' }
    ],
    timedText(url) {
      if (url.searchParams.get('tlang') === 'zh-Hans') {
        return {
          status: 429,
          contentType: 'text/html; charset=utf-8',
          body: '<html><title>Sorry...</title></html>'
        };
      }
      return json3Cue('Still source text');
    }
  });

  await expect.poll(async () => (await snapshot(page)).phase).toBe('ready');
  await expect(page.locator('.yds-native-line-a')).toHaveText('Still source text');
  await expect(page.locator('.yds-native-line-b')).toBeHidden();
  await expect(page.locator('.ytp-caption-window-container')).toHaveClass(/yds-native-mode/);

  const state = await snapshot(page);
  expect(state.nativeTargetFallback).toBe(true);
  expect(state.nativeTargetFallbackPreserve).toBe(false);
  expect(state.nativeTargetFallbackText).toBe('Still source text');
});

test('bridges native caption DOM as translated fallback after player API succeeds but timedtext is rate limited', async ({ page }) => {
  await setupMockWatch(page, {
    tracks: [
      captionTrack('en', 'English')
    ],
    defaultTrackIndex: 0,
    nativeCaptionText: '原生 DOM 译文',
    translationLanguages: [
      { languageCode: 'zh-Hans', languageName: 'Chinese (Simplified)' }
    ],
    timedText(url) {
      if (url.searchParams.get('tlang') === 'zh-Hans') {
        return {
          status: 429,
          contentType: 'text/html; charset=utf-8',
          body: '<html><title>Sorry...</title></html>'
        };
      }
      return json3Cue('Native DOM fallback source');
    }
  });

  await expect.poll(async () => (await snapshot(page)).phase).toBe('ready');

  await expect(page.locator('.yds-native-line-a')).toHaveText('Native DOM fallback source');
  await expect(page.locator('.yds-native-line-b')).toHaveText('原生 DOM 译文');
  await expect(page.locator('.ytp-caption-segment')).toHaveText('原生 DOM 译文');
  await expect(page.locator('.ytp-caption-window-container')).toHaveClass(/yds-native-mode/);

  const state = await snapshot(page);
  expect(state.playerApiPrime).toBe('ok:zh-Hans');
  expect(state.cuesA).toBe(1);
  expect(state.cuesB).toBe(0);
  expect(state.translationResult).toBe('429');
  expect(state.nativeTargetFallback).toBe(true);
  expect(state.nativeTargetFallbackPreserve).toBe(false);
  expect(state.nativeTargetFallbackText).toBe('原生 DOM 译文');
  expect(state.nativeTargetFallbackReason).toBe('target-429');
  expect(state.machinePromptStatus).toBe('off');
  expect(state.machineTranslateActive).toBe(false);
  expect(state.status).toContain('译文来自 YouTube 原生字幕');
});

test('keeps script source visible while waiting for translated DOM fallback text', async ({ page }) => {
  await setupMockWatch(page, {
    tracks: [
      captionTrack('en', 'English')
    ],
    defaultTrackIndex: 0,
    nativeCaptionText: '',
    translationLanguages: [
      { languageCode: 'zh-Hans', languageName: 'Chinese (Simplified)' }
    ],
    timedText(url) {
      if (url.searchParams.get('tlang') === 'zh-Hans') {
        return {
          status: 429,
          contentType: 'text/html; charset=utf-8',
          body: '<html><title>Sorry...</title></html>'
        };
      }
      return json3Cue('Native bridge source');
    }
  });

  await expect.poll(async () => (await snapshot(page)).phase).toBe('ready');
  await expect(page.locator('.yds-native-line-a')).toHaveText('Native bridge source');
  await expect(page.locator('.yds-native-line-b')).toBeHidden();
  await expect(page.locator('.ytp-caption-window-container')).toHaveClass(/yds-native-mode/);

  let state = await snapshot(page);
  expect(state.nativeTargetFallback).toBe(true);
  expect(state.nativeTargetFallbackPreserve).toBe(false);
  expect(state.nativeTargetFallbackText).toBe('');
  expect(state.machinePromptStatus).toBe('off');
  expect(state.machineTranslateAvailable).toBe(true);
  await expect(page.getByRole('button', { name: '本视频启用机翻' })).toHaveCount(0);

  await page.evaluate(() => {
    document.querySelector('.ytp-caption-segment').textContent = '迟到的 YouTube 原生译文';
  });

  await expect.poll(async () => (await snapshot(page)).nativeTargetFallbackText).toBe('迟到的 YouTube 原生译文');
  await expect(page.locator('.yds-native-line-b')).toHaveText('迟到的 YouTube 原生译文');
  await expect.poll(async () => (await snapshot(page)).machinePromptStatus).toBe('off');
  await expect(page.locator('.yds-machine-prompt')).toBeHidden();
  await expect(page.locator('.ytp-caption-window-container')).toHaveClass(/yds-native-mode/);
  state = await snapshot(page);
  expect(state.nativeTargetFallbackPreserve).toBe(false);
});

test('bridges native translated captions when cue fetches are empty but player API was applied', async ({ page }) => {
  await setupMockWatch(page, {
    tracks: [
      captionTrack('en', 'English')
    ],
    defaultTrackIndex: 0,
    nativeCaptionText: 'YouTube 原生译文仍可见',
    translationLanguages: [
      { languageCode: 'zh-Hans', languageName: 'Chinese (Simplified)' }
    ],
    timedText(url) {
      if (url.searchParams.get('tlang') === 'zh-Hans') {
        return {
          status: 429,
          contentType: 'text/html; charset=utf-8',
          body: '<html><title>Sorry...</title></html>'
        };
      }
      return emptyJson3();
    }
  });

  await expect.poll(async () => (await snapshot(page)).phase).toBe('ready');
  await expect(page.locator('.yds-native-line-b')).toHaveText('YouTube 原生译文仍可见');
  await expect(page.locator('.ytp-caption-segment')).toHaveText('YouTube 原生译文仍可见');
  await expect(page.locator('.ytp-caption-window-container')).toHaveClass(/yds-native-mode/);

  const state = await snapshot(page);
  expect(state.cuesA).toBe(0);
  expect(state.cuesB).toBe(0);
  expect(state.playerApiPrime).toBe('ok:zh-Hans');
  expect(state.nativeTargetFallback).toBe(true);
  expect(state.nativeTargetFallbackPreserve).toBe(false);
  expect(state.nativeTargetFallbackText).toBe('YouTube 原生译文仍可见');
  expect(state.translationResult).toBe('429');
});

test('does not use transcript API on first-screen source-empty timedtext', async ({ page }) => {
  await setupMockWatch(page, {
    tracks: [
      captionTrack('en', 'English')
    ],
    defaultTrackIndex: 0,
    timedText() {
      return emptyJson3();
    },
    transcriptSegments: [
      {
        startMs: 0,
        endMs: 5000,
        text: 'Transcript fallback line'
      }
    ]
  });

  await expect.poll(async () => (await snapshot(page)).phase).toBe('no-cues');

  const state = await snapshot(page);
  expect(state.cuesA).toBe(0);
  expect(state.cuesB).toBe(0);
  expect(state.fallback).toBe('source-empty');
  expect(state.fetch.source).not.toContain('transcript-api');

  await expect(page.locator('#yds-native-window')).toHaveCount(0);
});

test('does not open transcript UI on first-screen source-empty timedtext', async ({ page }) => {
  await setupMockWatch(page, {
    tracks: [
      captionTrack('en', 'English')
    ],
    defaultTrackIndex: 0,
    transcriptEndpoint: false,
    timedText() {
      return emptyJson3();
    },
    transcriptUiSegments: [
      {
        startMs: 0,
        text: 'Transcript UI fallback line'
      }
    ]
  });

  await expect.poll(async () => (await snapshot(page)).phase).toBe('no-cues');

  const state = await snapshot(page);
  expect(state.cuesA).toBe(0);
  expect(state.cuesB).toBe(0);
  expect(state.fallback).toBe('source-empty');
  expect(state.fetch.source).not.toContain('transcript-ui');

  await expect(page.locator('ytd-engagement-panel-section-list-renderer')).toHaveCount(0);
});

test('does not retry a same-language default caption track on first-screen empty cues', async ({ page }) => {
  await setupMockWatch(page, {
    tracks: [
      captionTrack('en', 'English'),
      captionTrack('en', 'English (auto-generated)', {
        baseUrl: 'https://www.youtube.com/api/timedtext?v=mock-video&lang=en&kind=asr',
        vssId: 'a.en'
      })
    ],
    defaultTrackIndex: 1,
    transcriptEndpoint: false,
    timedText(url) {
      if (url.searchParams.get('kind') === 'asr' && url.searchParams.get('tlang') === 'zh-Hans') {
        return json3Cue('默认轨翻译');
      }
      if (url.searchParams.get('kind') === 'asr') {
        return json3Cue('Default track source');
      }
      return emptyJson3();
    }
  });

  await expect.poll(async () => (await snapshot(page)).phase).toBe('no-cues');

  const state = await snapshot(page);
  expect(state.source).toContain('#0 English (en)');
  expect(state.fallback).toContain('source-empty');
  expect(state.fallback).not.toContain('default-track:0->1');
  expect(state.cuesA).toBe(0);
  expect(state.cuesB).toBe(0);
  expect(state.fetch.source).not.toContain('kind=asr');

  await expect(page.locator('#yds-native-window')).toHaveCount(0);
});

test('does not replace the selected source with a different-language default track', async ({ page }) => {
  await setupMockWatch(page, {
    tracks: [
      captionTrack('en', 'English'),
      captionTrack('zh-CN', 'Chinese')
    ],
    defaultTrackIndex: 1,
    transcriptEndpoint: false,
    timedText(url) {
      if (url.searchParams.get('lang') === 'zh-CN') return json3Cue('默认中文字幕');
      return emptyJson3();
    }
  });

  await expect.poll(async () => (await snapshot(page)).phase, {
    timeout: 15000
  }).toBe('no-cues');

  const state = await snapshot(page);
  expect(state.source).toContain('#0 English (en)');
  expect(state.fallback).not.toContain('default-track:0->1');
  expect(state.fetch.source).not.toContain('zh-CN');
});

test('reports waiting state when a watch page has no caption tracks', async ({ page }) => {
  await setupMockWatch(page, {
    tracks: [],
    defaultTrackIndex: -1
  });

  await expect.poll(async () => (await snapshot(page)).phase).toBe('wait-tracks');

  const state = await snapshot(page);
  expect(state.tracks).toHaveLength(0);
  expect(state.cuesA).toBe(0);
  expect(state.cuesB).toBe(0);
  expect(state.status).toContain('等待字幕轨出现');
});

test('keeps debug API available but unmounts UI outside watch pages', async ({ page }) => {
  await setupMockNonWatch(page);

  await expect.poll(async () => {
    const state = await snapshot(page);
    return `${state.pageType}:${state.phase}`;
  }).toBe('other:idle');

  const state = await snapshot(page);
  expect(state.phase).toBe('idle');
  expect(state.dom.launcher).toBe(false);
  expect(state.dom.panel).toBe(false);
  expect(state.status).toBe('等待 watch 页面');
});
