const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..', '..', '..');
const userscriptPath = path.join(projectRoot, 'yt-dual-subs.user.js');

function captionTrack(languageCode, name, overrides = {}) {
  return {
    baseUrl: `https://www.youtube.com/api/timedtext?v=mock-video&lang=${encodeURIComponent(languageCode)}`,
    languageCode,
    name: {
      simpleText: name
    },
    vssId: `.${languageCode}`,
    ...overrides
  };
}

function json3Cue(text, startMs = 0, durationMs = 5000) {
  return JSON.stringify({
    events: [
      {
        tStartMs: startMs,
        dDurationMs: durationMs,
        segs: [
          {
            utf8: text
          }
        ]
      }
    ]
  });
}

function emptyJson3() {
  return JSON.stringify({
    events: []
  });
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function setupMockWatch(page, options = {}) {
  const videoId = options.videoId || 'mock-video';
  const tracks = options.tracks || [];
  const defaultTrackIndex = typeof options.defaultTrackIndex === 'number' ? options.defaultTrackIndex : -1;

  await page.route('https://www.youtube.com/watch**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'text/html; charset=utf-8',
      body: buildWatchHtml({
        defaultTrackIndex,
        nativeTimedTextHintUrl: buildNativeTimedTextHintUrl(tracks, options.nativeTimedTextHintParams),
        nativeTimedTextHintAutoRequest: options.nativeTimedTextHintAutoRequest !== false,
        allowNativeHintWait: !!options.allowNativeHintWait,
        playerCaptionApi: options.playerCaptionApi === undefined ? true : options.playerCaptionApi,
        playerCaptionTracklist: options.playerCaptionTracklist,
        nativeCaptionText: options.nativeCaptionText,
        nativeMenuSummaryText: options.nativeMenuSummaryText,
        nativeMenuTranslatedText: options.nativeMenuTranslatedText,
        subtitleIgnoreFirstClick: !!options.subtitleIgnoreFirstClick,
        subtitleToggleDelayMs: options.subtitleToggleDelayMs || 0,
        tracks,
        translationLanguages: options.translationLanguages || [],
        transcriptUiSegments: options.transcriptUiSegments || [],
        videoId
      })
    });
  });

  await page.route('https://www.youtube.com/api/timedtext**', async (route) => {
    const url = new URL(route.request().url());
    const result = options.timedText ? await options.timedText(url, route.request()) : emptyJson3();
    const response = typeof result === 'object' && result && Object.prototype.hasOwnProperty.call(result, 'body')
      ? result
      : {
          body: result
        };
    await route.fulfill({
      status: response.status || 200,
      contentType: response.contentType || 'application/json; charset=utf-8',
      body: response.body
    });
  });

  await page.route('https://translate.googleapis.com/translate_a/single**', async (route) => {
    const url = new URL(route.request().url());
    const result = options.machineTranslate
      ? await options.machineTranslate(url, route.request())
      : JSON.stringify([[[url.searchParams.get('q') || '', url.searchParams.get('q') || '']]]);
    const response = typeof result === 'object' && result && Object.prototype.hasOwnProperty.call(result, 'body')
      ? result
      : {
          body: result
        };
    await route.fulfill({
      status: response.status || 200,
      contentType: response.contentType || 'application/json; charset=utf-8',
      body: response.body
    });
  });

  await page.route('https://www.youtube.com/youtubei/v1/player**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify(buildPlayerResponse({
        defaultTrackIndex,
        tracks,
        translationLanguages: options.translationLanguages || []
      }))
    });
  });

  await page.route('https://www.youtube.com/youtubei/v1/next**', async (route) => {
    if (options.transcriptEndpoint === false) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json; charset=utf-8',
        body: JSON.stringify({})
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({
        engagementPanels: [
          {
            engagementPanelSectionListRenderer: {
              content: {
                continuationItemRenderer: {
                  continuationEndpoint: {
                    getTranscriptEndpoint: {
                      params: options.transcriptParams || 'mock-transcript-params'
                    }
                  }
                }
              }
            }
          }
        ]
      })
    });
  });

  await page.route('https://www.youtube.com/youtubei/v1/get_transcript**', async (route) => {
    const segments = (options.transcriptSegments || []).map((segment) => ({
      transcriptSegmentRenderer: {
        startMs: String(segment.startMs || 0),
        endMs: String(segment.endMs || 5000),
        snippet: {
          runs: [
            {
              text: segment.text
            }
          ]
        }
      }
    }));

    await route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({
        actions: [
          {
            updateEngagementPanelAction: {
              content: {
                transcriptRenderer: {
                  content: {
                    transcriptSearchPanelRenderer: {
                      body: {
                        transcriptSegmentListRenderer: {
                          initialSegments: segments
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        ]
      })
    });
  });

  await page.goto(`https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}&ydsDebug=1`, {
    waitUntil: 'domcontentloaded'
  });
  if (options.settings) {
    await page.evaluate((settings) => {
      window.localStorage.setItem('__yds_gm__yds_native_settings_v2', JSON.stringify(settings));
    }, options.settings);
  }
  await injectUserscript(page);
}

async function setupMockNonWatch(page) {
  await page.route('https://www.youtube.com/results**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'text/html; charset=utf-8',
      body: `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Mock Search</title></head><body><div id="content"></div></body></html>`
    });
  });

  await page.goto('https://www.youtube.com/results?search_query=mock&ydsDebug=1', {
    waitUntil: 'domcontentloaded'
  });
  await injectUserscript(page, {
    waitForPanel: false
  });
}

async function injectUserscript(page, options = {}) {
  const script = fs.readFileSync(userscriptPath, 'utf8');
  await page.evaluate(({ code, shim }) => {
    window.eval(`(${shim})();\n${code}\n//# sourceURL=yt-dual-subs.user.js`);
  }, {
    code: script,
    shim: installGmShim.toString()
  });

  const waitForPanel = options.waitForPanel !== false;
  await page.waitForFunction((shouldWaitForPanel) => {
    return Boolean(window.__ydsDebug && (!shouldWaitForPanel || document.querySelector('#yds-launcher-root')));
  }, waitForPanel, {
    timeout: 10000
  });
}

async function snapshot(page) {
  return page.evaluate(() => window.__ydsDebug && window.__ydsDebug.snapshot());
}

function buildWatchHtml({ allowNativeHintWait, defaultTrackIndex, nativeCaptionText, nativeMenuSummaryText, nativeMenuTranslatedText, nativeTimedTextHintAutoRequest, nativeTimedTextHintUrl, playerCaptionApi, playerCaptionTracklist, subtitleIgnoreFirstClick, subtitleToggleDelayMs, tracks, translationLanguages, transcriptUiSegments, videoId }) {
  const playerResponse = JSON.stringify(buildPlayerResponse({
    defaultTrackIndex,
    tracks,
    translationLanguages
  })).replace(/</g, '\\u003c');
  const transcriptUiSegmentsJson = JSON.stringify(transcriptUiSegments || []).replace(/</g, '\\u003c');
  const playerCaptionApiJson = JSON.stringify(playerCaptionApi).replace(/</g, '\\u003c');
  const mockPlayerCaptionTracklist = playerCaptionTracklist === undefined ? (tracks || []).map(toPlayerCaptionTrack) : playerCaptionTracklist;
  const playerCaptionTracklistJson = JSON.stringify(mockPlayerCaptionTracklist || []).replace(/</g, '\\u003c');
  const translationLanguagesJson = JSON.stringify(translationLanguages || []).replace(/</g, '\\u003c');
  const nativeTimedTextHintAutoRequestJson = JSON.stringify(nativeTimedTextHintAutoRequest !== false);
  const nativeTimedTextHintUrlJson = JSON.stringify(nativeTimedTextHintUrl || '').replace(/</g, '\\u003c');
  const nativeCaptionTextHtml = escapeHtml(nativeCaptionText === undefined ? '' : nativeCaptionText);
  const nativeMenuSummaryTextJson = JSON.stringify(nativeMenuSummaryText || 'Subtitles/CC').replace(/</g, '\\u003c');
  const nativeMenuTranslatedTextJson = JSON.stringify(nativeMenuTranslatedText || '').replace(/</g, '\\u003c');

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <title>Mock YouTube Watch</title>
    <script>
      window.__mockCurrentTime = 1;
      window.__mockVideoPlayCalls = 0;
      window.__mockVideoPauseCalls = 0;
      window.__mockSubtitleButtonClicks = 0;
      window.__mockSubtitlesEnabled = false;
      window.__mockSubtitleIgnoreFirstClick = ${JSON.stringify(!!subtitleIgnoreFirstClick)};
      window.__mockSubtitleToggleDelayMs = ${Number(subtitleToggleDelayMs) || 0};
      window.__ydsHarnessAllowNativeHintWait = ${JSON.stringify(!!allowNativeHintWait)};
      window.ytcfg = {
        get: function (key) {
          if (key === 'INNERTUBE_CLIENT_VERSION' || key === 'INNERTUBE_CONTEXT_CLIENT_VERSION') return '2.20250312.04.00';
          if (key === 'VISITOR_DATA') return 'mock-visitor';
          return '';
        }
      };
      window.ytInitialPlayerResponse = ${playerResponse};
      try {
        Object.defineProperty(HTMLMediaElement.prototype, 'currentTime', {
          configurable: true,
          get: function () {
            return window.__mockCurrentTime || 0;
          },
          set: function (value) {
            window.__mockCurrentTime = Number(value) || 0;
          }
        });
        HTMLMediaElement.prototype.play = function () {
          window.__mockVideoPlayCalls += 1;
          return Promise.resolve();
        };
        HTMLMediaElement.prototype.pause = function () {
          window.__mockVideoPauseCalls += 1;
        };
      } catch (err) {}
    </script>
  </head>
  <body>
    <div id="content">
      <div id="page-manager">
        <div class="html5-video-player">
          <video></video>
          <button class="ytp-subtitles-button" aria-pressed="false" onclick="window.__mockSubtitleButtonClicks += 1; if (window.__mockSubtitleIgnoreFirstClick && window.__mockSubtitleButtonClicks === 1) return; window.__mockSubtitlesEnabled = !window.__mockSubtitlesEnabled; var button = this; var enabled = window.__mockSubtitlesEnabled; window.setTimeout(function () { button.setAttribute('aria-pressed', enabled ? 'true' : 'false'); if (enabled && window.__mockNativeTimedTextHintUrl && !window.__mockNativeTimedTextHintRequested) { window.__mockNativeTimedTextHintRequested = true; fetch(window.__mockNativeTimedTextHintUrl).catch(function () {}); } }, window.__mockSubtitleToggleDelayMs || 0);"></button>
          <button class="ytp-settings-button" type="button"></button>
          <div class="ytp-chrome-bottom" style="height:52px"></div>
          <div class="ytp-caption-window-container">
            <div class="caption-window">
              <span class="ytp-caption-segment" style="font-size:34px;font-family:Arial;background-color:rgba(8,8,8,.75);color:rgb(255,255,0)">${nativeCaptionTextHtml}</span>
            </div>
          </div>
        </div>
        <ytd-watch-metadata>
          <div id="top-row">
            <div id="owner">owner controls</div>
            <div id="actions">mock actions</div>
          </div>
        </ytd-watch-metadata>
      </div>
    </div>
    <button id="mock-transcript-trigger" aria-label="Show transcript" type="button">Show transcript</button>
    <script>
      window.__mockTranscriptUiSegments = ${transcriptUiSegmentsJson};
      window.__mockCaptionApiCalls = [];
      window.__mockCaptionApiConfig = ${playerCaptionApiJson};
      window.__mockCaptionTrack = null;
      window.__mockCaptionTranslationLanguage = null;
      window.__mockCaptionTracklist = ${playerCaptionTracklistJson};
      window.__mockTranslationLanguages = ${translationLanguagesJson};
      window.__mockMenuTriggerCalls = [];
      window.__mockNativeMenuSummaryText = ${nativeMenuSummaryTextJson};
      window.__mockNativeMenuTranslatedText = ${nativeMenuTranslatedTextJson};
      window.__mockNativeTimedTextHintUrl = ${nativeTimedTextHintUrlJson};
      window.__mockNativeTimedTextHintAutoRequest = ${nativeTimedTextHintAutoRequestJson};
      window.__requestMockNativeTimedTextHint = function () {
        if (!window.__mockNativeTimedTextHintUrl || window.__mockNativeTimedTextHintRequested) return;
        window.__mockNativeTimedTextHintRequested = true;
        fetch(window.__mockNativeTimedTextHintUrl).catch(function () {});
      };
      (function () {
        var player = document.querySelector('.html5-video-player');
        if (!player) return;
        var settingsButton = document.querySelector('.ytp-settings-button');
        var captionSegment = document.querySelector('.ytp-caption-segment');
        function clearMockMenu() {
          var existing = player.querySelector('.ytp-popup.ytp-settings-menu');
          if (existing) existing.remove();
        }
        function createMockMenu(items) {
          clearMockMenu();
          var popup = document.createElement('div');
          popup.className = 'ytp-popup ytp-settings-menu';
          var panel = document.createElement('div');
          panel.className = 'ytp-panel';
          var menu = document.createElement('div');
          menu.className = 'ytp-panel-menu';
          items.forEach(function (item) {
            var node = document.createElement('div');
            node.className = 'ytp-menuitem';
            node.setAttribute('role', 'menuitem');
            var label = document.createElement('div');
            label.className = 'ytp-menuitem-label';
            label.textContent = item.label;
            node.appendChild(label);
            node.addEventListener('click', item.click);
            menu.appendChild(node);
          });
          panel.appendChild(menu);
          popup.appendChild(panel);
          player.appendChild(popup);
        }
        function openMockSettingsMenu() {
          window.__mockMenuTriggerCalls.push(['settings']);
          createMockMenu([
            { label: 'Stable volume', click: function () {} },
            {
              label: window.__mockNativeMenuSummaryText,
              click: function () {
                window.__mockMenuTriggerCalls.push(['subtitles']);
                openMockSubtitlesMenu();
              }
            },
            { label: 'Sleep timer Off', click: function () {} }
          ]);
        }
        function openMockSubtitlesMenu() {
          var sourceLabel = window.__mockCaptionTracklist[0] && (window.__mockCaptionTracklist[0].displayName || window.__mockCaptionTracklist[0].languageName) || 'English';
          createMockMenu([
            {
              label: 'Off',
              click: function () {
                window.__mockMenuTriggerCalls.push(['off']);
                window.__mockSubtitlesEnabled = false;
                var button = document.querySelector('.ytp-subtitles-button');
                if (button) button.setAttribute('aria-pressed', 'false');
                if (captionSegment) captionSegment.textContent = '';
                clearMockMenu();
              }
            },
            {
              label: sourceLabel,
              click: function () {
                window.__mockMenuTriggerCalls.push(['source']);
                window.__mockSubtitlesEnabled = true;
                var button = document.querySelector('.ytp-subtitles-button');
                if (button) button.setAttribute('aria-pressed', 'true');
                clearMockMenu();
              }
            },
            {
              label: 'Auto-translate',
              click: function () {
                window.__mockMenuTriggerCalls.push(['auto-translate']);
                openMockLanguageMenu();
              }
            }
          ]);
        }
        function openMockLanguageMenu() {
          createMockMenu(window.__mockTranslationLanguages.map(function (language) {
            return {
              label: language.languageName || language.languageCode,
              click: function () {
                window.__mockMenuTriggerCalls.push(['target', language.languageCode]);
                window.__mockSubtitlesEnabled = true;
                var button = document.querySelector('.ytp-subtitles-button');
                if (button) button.setAttribute('aria-pressed', 'true');
                if (captionSegment && window.__mockNativeMenuTranslatedText) {
                  captionSegment.textContent = window.__mockNativeMenuTranslatedText;
                }
                clearMockMenu();
              }
            };
          }));
        }
        if (settingsButton) {
          settingsButton.addEventListener('click', openMockSettingsMenu);
        }
        document.addEventListener('keydown', function (event) {
          if (event.key === 'Escape') clearMockMenu();
        });
        if (window.__mockCaptionApiConfig === false) return;
        var apiConfig = window.__mockCaptionApiConfig && typeof window.__mockCaptionApiConfig === 'object' ? window.__mockCaptionApiConfig : {};
        player.loadModule = function (name) {
          if (apiConfig.loadModuleThrows) throw new Error('mock loadModule failure');
          window.__mockCaptionApiCalls.push(['loadModule', name]);
        };
        player.getOptions = function (module) {
          if (apiConfig.getOptionsThrows) throw new Error('mock getOptions failure');
          if (module !== 'captions') return [];
          return ['reload', 'fontSize', 'track', 'tracklist', 'translationLanguages', 'sampleSubtitle', 'stickyLoading'];
        };
        player.getOption = function (module, key) {
          if (apiConfig.getOptionThrows) throw new Error('mock getOption failure');
          if (module !== 'captions') return null;
          if (key === 'tracklist') return window.__mockCaptionTracklist;
          if (key === 'translationLanguages') return window.__mockTranslationLanguages;
          if (key === 'track') return window.__mockCaptionTrack || window.__mockCaptionTracklist[0] || null;
          return null;
        };
        player.isSubtitlesOn = function () {
          if (apiConfig.isSubtitlesOnThrows) throw new Error('mock isSubtitlesOn failure');
          return !!window.__mockSubtitlesEnabled;
        };
        player.toggleSubtitlesOn = function () {
          if (apiConfig.toggleSubtitlesOnThrows) throw new Error('mock toggleSubtitlesOn failure');
          window.__mockCaptionApiCalls.push(['toggleSubtitlesOn']);
          window.__mockSubtitlesEnabled = true;
          var button = document.querySelector('.ytp-subtitles-button');
          if (button) button.setAttribute('aria-pressed', 'true');
          window.__requestMockNativeTimedTextHint();
        };
        player.setOption = function (module, key, value) {
          if (apiConfig.setOptionThrows) throw new Error('mock setOption failure');
          window.__mockCaptionApiCalls.push(['setOption', module, key, value || null]);
          if (module === 'captions' && key === 'track') {
            window.__mockCaptionTrack = value || null;
            var button = document.querySelector('.ytp-subtitles-button');
            if (button) button.setAttribute('aria-pressed', 'true');
            window.__requestMockNativeTimedTextHint();
          }
          if (module === 'captions' && key === 'translationLanguage') {
            window.__mockCaptionTranslationLanguage = value || null;
            window.__requestMockNativeTimedTextHint();
          }
          if (module === 'captions' && key === 'reload') {
            window.__requestMockNativeTimedTextHint();
          }
        };
      })();
      if (window.__mockNativeTimedTextHintUrl && window.__mockNativeTimedTextHintAutoRequest) {
        requestAnimationFrame(function () {
          window.__requestMockNativeTimedTextHint();
        });
      }
      window.__setMockTime = function (time) {
        window.__mockCurrentTime = time;
      };
      window.__formatTranscriptTime = function (ms) {
        var total = Math.floor((ms || 0) / 1000);
        var minutes = Math.floor(total / 60);
        var seconds = String(total % 60).padStart(2, '0');
        return minutes + ':' + seconds;
      };
      document.getElementById('mock-transcript-trigger').addEventListener('click', function () {
        if (document.querySelector('ytd-engagement-panel-section-list-renderer')) return;

        var panel = document.createElement('ytd-engagement-panel-section-list-renderer');
        panel.setAttribute('visibility', 'ENGAGEMENT_PANEL_VISIBILITY_EXPANDED');

        var renderer = document.createElement('ytd-transcript-renderer');
        panel.appendChild(renderer);

        window.__mockTranscriptUiSegments.forEach(function (segment) {
          var row = document.createElement('transcript-segment-view-model');
          var text = document.createElement('span');
          var time = document.createElement('span');

          text.className = 'yt-core-attributed-string';
          text.setAttribute('role', 'text');
          text.textContent = segment.text || '';

          time.className = 'ytwTranscriptSegmentViewModelTimestamp';
          time.textContent = window.__formatTranscriptTime(segment.startMs || 0);

          row.appendChild(time);
          row.appendChild(text);
          renderer.appendChild(row);
        });

        document.body.appendChild(panel);
      });
    </script>
  </body>
</html>`;
}

function buildNativeTimedTextHintUrl(tracks, params) {
  if (!params || !tracks || !tracks.length || !tracks[0].baseUrl) return '';
  const url = new URL(tracks[0].baseUrl);
  for (const [key, value] of Object.entries(params)) {
    if (value == null || value === '') url.searchParams.delete(key);
    else url.searchParams.set(key, String(value));
  }
  return url.toString();
}

function toPlayerCaptionTrack(track) {
  const name = track && track.name && track.name.simpleText ? track.name.simpleText : (track && track.languageCode) || 'track';
  const languageCode = track && track.languageCode ? track.languageCode : '';
  return {
    languageCode,
    languageName: name,
    displayName: name,
    kind: track && track.kind ? track.kind : '',
    name: track && track.name ? track.name : '',
    id: track && track.id ? track.id : null,
    is_servable: false,
    is_default: false,
    is_translateable: true,
    vss_id: track && (track.vssId || track.vss_id) ? (track.vssId || track.vss_id) : `.${languageCode}`
  };
}

function buildPlayerResponse({ defaultTrackIndex, tracks, translationLanguages = [] }) {
  return {
    captions: {
      playerCaptionsTracklistRenderer: {
        audioTracks: [
          {
            defaultCaptionTrackIndex: defaultTrackIndex
          }
        ],
        captionTracks: tracks,
        translationLanguages
      }
    },
    videoDetails: {
      videoId: 'mock-video'
    }
  };
}

function installGmShim() {
  if (window.__ydsHarnessShimInstalled) return;
  window.__ydsHarnessShimInstalled = true;
  window.unsafeWindow = window;

  const storagePrefix = '__yds_gm__';

  window.GM_addStyle = function (css) {
    const style = document.createElement('style');
    style.textContent = css;
    (document.head || document.documentElement || document.body).appendChild(style);
    return style;
  };

  window.GM_getValue = function (key, defaultValue) {
    const raw = window.localStorage.getItem(storagePrefix + key);
    if (raw == null) return defaultValue;
    try {
      return JSON.parse(raw);
    } catch (err) {
      return defaultValue;
    }
  };

  window.GM_setValue = function (key, value) {
    window.localStorage.setItem(storagePrefix + key, JSON.stringify(value));
  };

  window.GM_xmlhttpRequest = function (details) {
    window.fetch(details.url, {
      method: details.method || 'GET',
      headers: details.headers || {},
      body: details.data,
      credentials: 'include',
      cache: 'no-store'
    }).then(async (response) => {
      const responseText = await response.text();
      if (details.onload) {
        details.onload({
          status: response.status,
          responseText,
          finalUrl: response.url,
          responseHeaders: Array.from(response.headers.entries())
            .map(([key, value]) => `${key}: ${value}`)
            .join('\\r\\n')
        });
      }
    }).catch((error) => {
      if (details.onerror) details.onerror(error);
    });
  };
}

module.exports = {
  captionTrack,
  emptyJson3,
  injectUserscript,
  json3Cue,
  setupMockNonWatch,
  setupMockWatch,
  snapshot
};
