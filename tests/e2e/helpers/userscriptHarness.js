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

function buildWatchHtml({ defaultTrackIndex, nativeTimedTextHintUrl, tracks, translationLanguages, transcriptUiSegments, videoId }) {
  const playerResponse = JSON.stringify(buildPlayerResponse({
    defaultTrackIndex,
    tracks,
    translationLanguages
  })).replace(/</g, '\\u003c');
  const transcriptUiSegmentsJson = JSON.stringify(transcriptUiSegments || []).replace(/</g, '\\u003c');
  const nativeTimedTextHintUrlJson = JSON.stringify(nativeTimedTextHintUrl || '').replace(/</g, '\\u003c');

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <title>Mock YouTube Watch</title>
    <script>
      window.__mockCurrentTime = 1;
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
      } catch (err) {}
    </script>
  </head>
  <body>
    <div id="content">
      <div id="page-manager">
        <div class="html5-video-player">
          <video></video>
          <button class="ytp-subtitles-button" aria-pressed="false" onclick="this.setAttribute('aria-pressed', 'true'); if (window.__mockNativeTimedTextHintUrl && !window.__mockNativeTimedTextHintRequested) { window.__mockNativeTimedTextHintRequested = true; fetch(window.__mockNativeTimedTextHintUrl).catch(function () {}); }"></button>
          <div class="ytp-chrome-bottom" style="height:52px"></div>
          <div class="ytp-caption-window-container">
            <div class="caption-window">
              <span class="ytp-caption-segment" style="font-size:34px;font-family:Arial;background-color:rgba(8,8,8,.75);color:rgb(255,255,0)">native caption placeholder</span>
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
      window.__mockNativeTimedTextHintUrl = ${nativeTimedTextHintUrlJson};
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
