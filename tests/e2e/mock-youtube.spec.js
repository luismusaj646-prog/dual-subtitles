const { test, expect } = require('@playwright/test');
const {
  captionTrack,
  emptyJson3,
  json3Cue,
  setupMockNonWatch,
  setupMockWatch,
  snapshot
} = require('./helpers/userscriptHarness');

test('renders source and target using YouTube auto-translation from the source track', async ({ page }) => {
  await setupMockWatch(page, {
    tracks: [
      captionTrack('en', 'English'),
      captionTrack('zh-Hans', 'Chinese Simplified')
    ],
    defaultTrackIndex: 0,
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

  await page.evaluate(() => window.__setMockTime(1));
  await expect(page.locator('.yds-native-line-a')).toHaveText('Hello world');
  await expect(page.locator('.yds-native-line-b')).toHaveText('你好世界');
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
  await expect(page.locator('.yds-native-line-a')).toHaveCSS('font-size', '34px');
  await expect(page.locator('.yds-native-line-a')).toHaveCSS('background-color', 'rgba(8, 8, 8, 0.75)');

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
      if (url.searchParams.get('pot') !== 'mock-pot') return emptyJson3();
      if (url.searchParams.get('tlang') === 'zh-Hans') return json3Cue('POT 翻译字幕');
      return json3Cue('POT source line');
    }
  });

  await expect.poll(async () => (await snapshot(page)).phase).toBe('ready');

  const state = await snapshot(page);
  expect(state.cuesA).toBe(1);
  expect(state.cuesB).toBe(1);
  expect(state.fetch.source).toContain(':native');
  expect(state.fetch.target).toContain(':native');

  await expect(page.locator('.yds-native-line-a')).toHaveText('POT source line');
  await expect(page.locator('.yds-native-line-b')).toHaveText('POT 翻译字幕');
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
});

test('keeps source captions when translated timedtext is rate limited', async ({ page }) => {
  await setupMockWatch(page, {
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
    }
  });

  await expect.poll(async () => (await snapshot(page)).phase).toBe('ready');

  const state = await snapshot(page);
  expect(state.cuesA).toBe(1);
  expect(state.cuesB).toBe(0);
  expect(state.fetch.target).toContain('target-error-kept-source');
  expect(state.status).toBe('只拿到原字幕');

  await expect(page.locator('.yds-native-line-a')).toHaveText('English source survives');
  await expect(page.locator('.yds-native-line-b')).toBeHidden();
});

test('falls back to transcript API when timedtext returns no cues', async ({ page }) => {
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

  await expect.poll(async () => (await snapshot(page)).phase).toBe('ready');

  const state = await snapshot(page);
  expect(state.cuesA).toBe(1);
  expect(state.cuesB).toBe(0);
  expect(state.fallback).toBe('transcript-api');
  expect(state.fetch.source).toContain('transcript-api:ok(1)');

  await expect(page.locator('.yds-native-line-a')).toHaveText('Transcript fallback line');
  await expect(page.locator('.yds-native-line-b')).toBeHidden();
});

test('falls back to transcript UI when transcript API has no endpoint', async ({ page }) => {
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

  await expect.poll(async () => (await snapshot(page)).phase).toBe('ready');

  const state = await snapshot(page);
  expect(state.cuesA).toBe(1);
  expect(state.cuesB).toBe(0);
  expect(state.fallback).toBe('transcript-ui');
  expect(state.fetch.source).toContain('transcript-api:err');
  expect(state.fetch.source).toContain('transcript-ui:ok(1,current)');

  await expect(page.locator('.yds-native-line-a')).toHaveText('Transcript UI fallback line');
  await expect(page.locator('.yds-native-line-b')).toBeHidden();
});

test('retries a same-language default caption track when selected track has no usable cues', async ({ page }) => {
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

  await expect.poll(async () => (await snapshot(page)).phase, {
    timeout: 15000
  }).toBe('ready');

  const state = await snapshot(page);
  expect(state.source).toContain('#1 English (auto-generated) (en) [fallback]');
  expect(state.fallback).toContain('default-track:0->1');
  expect(state.cuesA).toBe(1);
  expect(state.cuesB).toBe(1);

  await expect(page.locator('.yds-native-line-a')).toHaveText('Default track source');
  await expect(page.locator('.yds-native-line-b')).toHaveText('默认轨翻译');
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
