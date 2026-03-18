// ==UserScript==
// @name         YouTube Dual Native Subs
// @namespace    https://example.com/
// @version      4.0.0
// @description  Native dual subtitles for YouTube
// @match        https://www.youtube.com/watch*
// @run-at       document-idle
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_xmlhttpRequest
// @grant        unsafeWindow
// @connect      www.youtube.com
// ==/UserScript==

(function () {
  'use strict';

  var SCRIPT_NAME = 'yt-dual-subs';
  var SETTINGS_KEY = 'yds_native_settings_v2';
  var RUNTIME_KEY = '__ydsRuntime';
  var DEBUG_API_KEY = '__ydsDebug';
  var LOG_PREFIX = '[tm-script][' + SCRIPT_NAME + ']';

  var CONFIG = {
    initDelayMs: 320,
    domDebounceMs: 180,
    retryDelayMs: 1200,
    routePollMs: 1200,
    maxTrackRetries: 8,
    rateLimitBackoffMs: 60000,
    selectors: {
      watchPath: '/watch',
      rootVideo: 'video',
      player: '.html5-video-player',
      captionContainer: '.ytp-caption-window-container',
      subtitlesButton: '.ytp-subtitles-button'
    },
    ids: {
      launcher: 'yds-launcher-root',
      panel: 'yds-panel-root',
      nativeWindow: 'yds-native-window',
      debugBox: 'yds-debug-box'
    },
    historyEventName: 'yds-history-change',
    debugQueryParam: 'ydsDebug=1',
    defaultDebug: false
  };

  var DEFAULTS = {
    targetLang: 'zh-Hans',
    sourceTrackIndex: 0,
    panelOpen: true,
    debug: CONFIG.defaultDebug,
    launcherPosition: null,
    panelPosition: null
  };

  var TEXT = {
    title: '\u53CC\u5B57\u5E55',
    reload: '\u91CD\u8F7D',
    sourceTrack: '\u5F53\u524D\u539F\u8F68',
    targetLang: '\u76EE\u6807\u8BED\u8A00',
    trackIndex: '\u539F\u5B57\u5E55\u8F68\u7D22\u5F15',
    debug: 'debug',
    injected: '\u811A\u672C\u5DF2\u6CE8\u5165',
    waitingWatchPage: '\u7B49\u5F85 watch \u9875\u9762',
    waitingPlayer: '\u7B49\u5F85\u64AD\u653E\u5668\u5B8C\u6210\u52A0\u8F7D',
    waitingTracks: '\u7B49\u5F85\u5B57\u5E55\u8F68\u51FA\u73B0',
    loading: '\u6B63\u5728\u52A0\u8F7D...',
    noTrack: '\u65E0\u53EF\u7528\u5B57\u5E55\u8F68',
    noTrackDetail: '\u8FD9\u4E2A\u89C6\u9891\u6CA1\u6709\u53EF\u7528\u5B57\u5E55\u8F68',
    noCue: '\u5B57\u5E55\u6CA1\u62FF\u5230\u6709\u6548\u5185\u5BB9',
    nativeReady: '\u53CC\u5B57\u5E55\u5DF2\u542F\u7528',
    sourceOnly: '\u53EA\u62FF\u5230\u539F\u5B57\u5E55',
    rateLimited: '\u7FFB\u8BD1\u88AB\u9650\u6D41\uFF0C60\u79D2\u540E\u518D\u8BD5',
    rateLimitedShort: '\u7FFB\u8BD1\u88AB\u9650\u6D41\uFF0C\u7A0D\u540E\u518D\u8BD5',
    loadFailed: '\u52A0\u8F7D\u5931\u8D25: ',
    unselected: '\u672A\u9009\u62E9'
  };

  if (window[RUNTIME_KEY] && typeof window[RUNTIME_KEY].destroy === 'function') {
    window[RUNTIME_KEY].destroy('reinject');
  }

  GM_addStyle(
    '.yds-launcher{' +
      'position:fixed;top:16px;right:16px;z-index:100000;' +
      'padding:8px 10px;border-radius:10px;background:rgba(20,20,20,.92);color:#fff;' +
      'font:12px/1.2 system-ui,sans-serif;cursor:pointer;user-select:none;' +
      'box-shadow:0 8px 24px rgba(0,0,0,.35);' +
    '}' +
    '.yds-panel{' +
      'position:fixed;top:56px;right:16px;z-index:100000;width:320px;box-sizing:border-box;' +
      'padding:12px;border-radius:10px;background:rgba(20,20,20,.92);color:#fff;' +
      'font:12px/1.35 system-ui,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.35);' +
    '}' +
    '.yds-panel input,.yds-panel button{font:inherit;}' +
    '.yds-panel label{display:block;margin-top:8px;}' +
    '.yds-row{display:flex;gap:6px;align-items:center;}' +
    '.yds-row>*{flex:1;}' +
    '.yds-drag-handle{cursor:move;touch-action:none;}' +
    '.yds-toggle{display:flex;align-items:center;gap:8px;margin-top:10px;}' +
    '.yds-toggle input{flex:0 0 auto;}' +
    '.yds-status{margin-top:8px;font-size:11px;opacity:.9;white-space:pre-wrap;word-break:break-word;}' +
    '.yds-debug{margin-top:8px;padding:8px;border-radius:8px;background:rgba(255,255,255,.08);font-size:11px;white-space:pre-wrap;word-break:break-word;}' +
    '.yds-debug[hidden]{display:none;}' +
    '.ytp-caption-window-container.yds-native-mode .caption-window{display:none !important;}' +
    '.ytp-caption-window-container .yds-native-window{' +
      'position:absolute;left:0;right:0;bottom:0;padding:0 24px 24px 24px;box-sizing:border-box;' +
      'display:flex;flex-direction:column;align-items:center;text-align:center;pointer-events:none;' +
      'text-shadow:0 2px 4px rgba(0,0,0,.85);' +
    '}' +
    '.ytp-caption-window-container .yds-native-line{' +
      'display:block;max-width:100%;font:600 28px/1.25 system-ui,sans-serif;white-space:pre-line;word-break:break-word;' +
    '}' +
    '.ytp-caption-window-container .yds-native-line-b{margin-top:6px;color:#00e5ff;}'
  );

  var state = loadSettings();
  var logger = createLogger(function () {
    return isDebugEnabled(state);
  });
  var fetchDiagnostics = {
    source: '',
    target: ''
  };
  var runtime = createRuntime();

  window[RUNTIME_KEY] = runtime;
  runtime.boot();

  function createRuntime() {
    var app = {
      activeRequestId: 0,
      backoffUntil: 0,
      cuesA: [],
      cuesB: [],
      lastSourceName: '',
      lastVideoId: '',
      lastUrl: '',
      loading: false,
      loopId: 0,
      pendingLoadKey: '',
      phase: 'boot',
      status: '',
      timers: {
        init: 0,
        urlPoll: 0
      },
      tracks: [],
      trackRetryCount: 0,
      teardown: [],
      observer: null
    };

    var ui = {
      launcher: null,
      panel: null,
      sourceName: null,
      status: null,
      targetLang: null,
      trackIndex: null,
      debugToggle: null,
      debugBox: null
    };

    function boot() {
      setPhase('boot');
      buildUi();
      mountUi();
      exposeDebugApi();
      bindGlobalListeners();
      setStatus(TEXT.injected);
      logger.debug('boot', collectSnapshot());
      scheduleInit('boot', 80);
    }

    function destroy(reason) {
      clearTimeout(app.timers.init);
      clearInterval(app.timers.urlPoll);
      if (app.observer) app.observer.disconnect();
      stopLoop();
      clearNativeCaptionWindow();
      unmountUi();
      while (app.teardown.length) {
        try {
          app.teardown.pop()();
        } catch (err) {
          logger.error('teardown failed', err);
        }
      }
      if (getPageWindow()[DEBUG_API_KEY] && getPageWindow()[DEBUG_API_KEY].runtime === api) {
        delete getPageWindow()[DEBUG_API_KEY];
      }
      if (window[RUNTIME_KEY] === api) {
        delete window[RUNTIME_KEY];
      }
      logger.debug('destroy', { reason: reason || 'unknown' });
    }

    function buildUi() {
      if (ui.launcher && ui.panel) return;

      ui.launcher = document.createElement('div');
      ui.launcher.id = CONFIG.ids.launcher;
      ui.launcher.className = 'yds-launcher';
      ui.launcher.textContent = TEXT.title;
      ui.launcher.addEventListener('click', function () {
        state.panelOpen = !state.panelOpen;
        saveSettings(state);
        mountUi();
      });

      ui.panel = document.createElement('div');
      ui.panel.id = CONFIG.ids.panel;
      ui.panel.className = 'yds-panel';

      var titleRow = document.createElement('div');
      titleRow.className = 'yds-row';
      titleRow.className += ' yds-drag-handle';

      var title = document.createElement('strong');
      title.textContent = TEXT.title;

      var reloadBtn = document.createElement('button');
      reloadBtn.type = 'button';
      reloadBtn.textContent = TEXT.reload;
      reloadBtn.addEventListener('click', function () {
        loadDualSubs(true, 'manual-reload');
      });

      titleRow.appendChild(title);
      titleRow.appendChild(reloadBtn);
      ui.panel.appendChild(titleRow);

      var sourceLabel = document.createElement('label');
      sourceLabel.textContent = TEXT.sourceTrack;
      ui.sourceName = document.createElement('div');
      ui.sourceName.className = 'yds-status';
      sourceLabel.appendChild(ui.sourceName);
      ui.panel.appendChild(sourceLabel);

      var targetLabel = document.createElement('label');
      targetLabel.textContent = TEXT.targetLang;
      ui.targetLang = document.createElement('input');
      ui.targetLang.type = 'text';
      ui.targetLang.addEventListener('change', function () {
        state.targetLang = String(ui.targetLang.value || DEFAULTS.targetLang).trim() || DEFAULTS.targetLang;
        saveSettings(state);
        loadDualSubs(true, 'target-lang-change');
      });
      targetLabel.appendChild(ui.targetLang);
      ui.panel.appendChild(targetLabel);

      var trackLabel = document.createElement('label');
      trackLabel.textContent = TEXT.trackIndex;
      ui.trackIndex = document.createElement('input');
      ui.trackIndex.type = 'number';
      ui.trackIndex.min = '0';
      ui.trackIndex.step = '1';
      ui.trackIndex.addEventListener('change', function () {
        var next = parseInt(ui.trackIndex.value || '0', 10);
        state.sourceTrackIndex = isNaN(next) ? 0 : Math.max(0, next);
        saveSettings(state);
        loadDualSubs(true, 'track-index-change');
      });
      trackLabel.appendChild(ui.trackIndex);
      ui.panel.appendChild(trackLabel);

      var toggleRow = document.createElement('label');
      toggleRow.className = 'yds-toggle';
      ui.debugToggle = document.createElement('input');
      ui.debugToggle.type = 'checkbox';
      ui.debugToggle.addEventListener('change', function () {
        state.debug = !!ui.debugToggle.checked;
        saveSettings(state);
        logger.debug('debug toggled', { enabled: state.debug });
        syncUi();
      });
      var toggleText = document.createElement('span');
      toggleText.textContent = TEXT.debug;
      toggleRow.appendChild(ui.debugToggle);
      toggleRow.appendChild(toggleText);
      ui.panel.appendChild(toggleRow);

      ui.status = document.createElement('div');
      ui.status.className = 'yds-status';
      ui.panel.appendChild(ui.status);

      ui.debugBox = document.createElement('div');
      ui.debugBox.id = CONFIG.ids.debugBox;
      ui.debugBox.className = 'yds-debug';
      ui.panel.appendChild(ui.debugBox);

      enableDragging(ui.launcher, ui.launcher, 'launcherPosition');
      enableDragging(ui.panel, titleRow, 'panelPosition');
      syncUi();
    }

    function mountUi() {
      var root = getRoot();
      if (!root) return;

      if (!isWatchPage()) {
        unmountUi();
        return;
      }

      if (ui.launcher && !ui.launcher.isConnected) root.appendChild(ui.launcher);
      if (state.panelOpen) {
        if (ui.panel && !ui.panel.isConnected) root.appendChild(ui.panel);
      } else if (ui.panel && ui.panel.isConnected) {
        ui.panel.remove();
      }
      applyStoredPosition(ui.launcher, state.launcherPosition);
      applyStoredPosition(ui.panel, state.panelPosition);
      syncUi();
    }

    function unmountUi() {
      if (ui.panel && ui.panel.isConnected) ui.panel.remove();
      if (ui.launcher && ui.launcher.isConnected) ui.launcher.remove();
    }

    function syncUi() {
      if (ui.targetLang) ui.targetLang.value = state.targetLang;
      if (ui.trackIndex) ui.trackIndex.value = String(state.sourceTrackIndex);
      if (ui.sourceName) ui.sourceName.textContent = app.lastSourceName || TEXT.unselected;
      if (ui.status) ui.status.textContent = app.status;
      if (ui.debugToggle) ui.debugToggle.checked = !!state.debug;
      if (ui.debugBox) {
        ui.debugBox.hidden = !isDebugEnabled(state);
        ui.debugBox.textContent = formatDebugText();
      }
    }

    function applyStoredPosition(node, position) {
      if (!node) return;
      if (!position || typeof position.left !== 'number' || typeof position.top !== 'number') {
        node.style.left = '';
        node.style.top = '';
        node.style.right = '';
        node.style.bottom = '';
        return;
      }
      node.style.left = position.left + 'px';
      node.style.top = position.top + 'px';
      node.style.right = 'auto';
      node.style.bottom = 'auto';
    }

    function enableDragging(node, handle, stateKey) {
      if (!node || !handle) return;

      var drag = null;

      function onPointerMove(event) {
        if (!drag) return;
        var nextLeft = clampToViewport(drag.startLeft + (event.clientX - drag.startX), node.offsetWidth, window.innerWidth);
        var nextTop = clampToViewport(drag.startTop + (event.clientY - drag.startY), node.offsetHeight, window.innerHeight);
        applyStoredPosition(node, { left: nextLeft, top: nextTop });
      }

      function onPointerUp() {
        if (!drag) return;
        state[stateKey] = {
          left: parseFloat(node.style.left) || 0,
          top: parseFloat(node.style.top) || 0
        };
        saveSettings(state);
        drag = null;
        window.removeEventListener('pointermove', onPointerMove);
        window.removeEventListener('pointerup', onPointerUp);
        window.removeEventListener('pointercancel', onPointerUp);
      }

      handle.addEventListener('pointerdown', function (event) {
        if (event.button != null && event.button !== 0) return;
        if (isInteractiveTarget(event.target)) return;

        var rect = node.getBoundingClientRect();
        drag = {
          startX: event.clientX,
          startY: event.clientY,
          startLeft: rect.left,
          startTop: rect.top
        };
        window.addEventListener('pointermove', onPointerMove);
        window.addEventListener('pointerup', onPointerUp);
        window.addEventListener('pointercancel', onPointerUp);
        event.preventDefault();
      });

      app.teardown.push(function () {
        window.removeEventListener('pointermove', onPointerMove);
        window.removeEventListener('pointerup', onPointerUp);
        window.removeEventListener('pointercancel', onPointerUp);
      });
    }

    function setPhase(phase) {
      app.phase = phase;
      syncUi();
    }

    function setStatus(text) {
      app.status = String(text || '');
      syncUi();
      logger.debug('status', { phase: app.phase, text: app.status });
    }

    function formatDebugText() {
      var snapshot = collectSnapshot();
      return [
        'page=' + snapshot.pageType,
        'url=' + snapshot.url,
        'videoId=' + (snapshot.videoId || '-'),
        'phase=' + snapshot.phase,
        'loading=' + snapshot.loading,
        'source=' + (snapshot.source || '-'),
        'tracks=' + snapshot.tracks.length,
        'cues=' + snapshot.cuesA + '/' + snapshot.cuesB,
        'fetch-source=' + (snapshot.fetch.source || '-'),
        'fetch-target=' + (snapshot.fetch.target || '-'),
        'dom=video:' + snapshot.dom.video + ',player:' + snapshot.dom.player + ',captions:' + snapshot.dom.captionContainer,
        'injected=launcher:' + snapshot.dom.launcher + ',panel:' + snapshot.dom.panel + ',native:' + snapshot.dom.nativeWindow
      ].join('\n');
    }

    function bindGlobalListeners() {
      ensureHistoryHook();
      addWindowListener('yt-navigate-finish', function () {
        handleNavigation('yt-navigate-finish');
      });
      addWindowListener('yt-page-data-updated', function () {
        handleNavigation('yt-page-data-updated');
      });
      addWindowListener('ytp-history-navigate', function () {
        handleNavigation('ytp-history-navigate');
      });
      addWindowListener(CONFIG.historyEventName, function () {
        handleNavigation(CONFIG.historyEventName);
      });
      addWindowListener('popstate', function () {
        handleNavigation('popstate');
      });
      addWindowListener('load', function () {
        handleNavigation('window-load');
      });

      app.timers.urlPoll = window.setInterval(function () {
        if (location.href !== app.lastUrl) {
          handleNavigation('url-poll');
          return;
        }
        if (isWatchPage() && (!getVideo() || !getPlayer() || !document.getElementById(CONFIG.ids.launcher))) {
          scheduleInit('url-poll-health', CONFIG.domDebounceMs);
        }
      }, CONFIG.routePollMs);

      var observationTarget = getObservationTarget();
      if (typeof MutationObserver === 'function' && observationTarget) {
        app.observer = new MutationObserver(function (mutations) {
          if (!isWatchPage()) return;
          if (!hasRelevantMutation(mutations)) return;
          scheduleInit('dom-mutation', CONFIG.domDebounceMs);
        });
        app.observer.observe(observationTarget, {
          childList: true,
          subtree: observationTarget !== document.body && observationTarget !== document.documentElement
        });
      }
    }

    function addWindowListener(type, handler) {
      window.addEventListener(type, handler);
      app.teardown.push(function () {
        window.removeEventListener(type, handler);
      });
    }

    function handleNavigation(reason) {
      logger.debug('navigation', { reason: reason, href: location.href });
      scheduleInit(reason, CONFIG.initDelayMs);
    }

    function scheduleInit(reason, delayMs) {
      clearTimeout(app.timers.init);
      app.timers.init = window.setTimeout(function () {
        initForPage(reason);
      }, typeof delayMs === 'number' ? delayMs : CONFIG.initDelayMs);
    }

    function initForPage(reason) {
      app.lastUrl = location.href;
      mountUi();
      exposeDebugApi();

      if (!isWatchPage()) {
        resetForNonWatch();
        return;
      }

      var videoId = getVideoId();
      if (videoId !== app.lastVideoId) {
        resetVideoState(videoId, reason);
      }

      if (!getVideo() || !getPlayer()) {
        setPhase('wait-player');
        setStatus(TEXT.waitingPlayer);
        scheduleInit('wait-player', CONFIG.retryDelayMs);
        return;
      }

      loadDualSubs(false, reason || 'init');
    }

    function resetForNonWatch() {
      app.activeRequestId += 1;
      app.loading = false;
      app.lastVideoId = '';
      app.lastSourceName = '';
      app.cuesA = [];
      app.cuesB = [];
      clearFetchDiagnostics();
      app.tracks = [];
      app.trackRetryCount = 0;
      app.pendingLoadKey = '';
      setPhase('idle');
      setStatus(TEXT.waitingWatchPage);
      stopLoop();
      clearNativeCaptionWindow();
    }

    function resetVideoState(videoId, reason) {
      logger.debug('reset video state', {
        from: app.lastVideoId || '',
        to: videoId || '',
        reason: reason || 'unknown'
      });
      app.activeRequestId += 1;
      app.loading = false;
      app.lastVideoId = videoId || '';
      app.lastSourceName = '';
      app.cuesA = [];
      app.cuesB = [];
      clearFetchDiagnostics();
      app.tracks = [];
      app.trackRetryCount = 0;
      app.pendingLoadKey = '';
      stopLoop();
      clearNativeCaptionWindow();
      syncUi();
    }

    function loadDualSubs(force, reason) {
      if (!isWatchPage()) return;

      var videoId = getVideoId();
      var loadKey = [videoId, state.targetLang, state.sourceTrackIndex].join('|');
      if (!force && !app.loading && app.pendingLoadKey === loadKey && (app.cuesA.length || app.cuesB.length)) {
        logger.debug('skip completed load', { reason: reason, loadKey: loadKey });
        if (!app.loopId) startLoop();
        return;
      }
      if (!force && app.loading && app.pendingLoadKey === loadKey) {
        logger.debug('skip duplicate load', { reason: reason, loadKey: loadKey });
        return;
      }

      var now = Date.now();
      if (!force && app.backoffUntil && now < app.backoffUntil) {
        setPhase('backoff');
        setStatus(TEXT.rateLimitedShort);
        return;
      }

      app.pendingLoadKey = loadKey;
      app.loading = true;
      app.activeRequestId += 1;
      var requestId = app.activeRequestId;

      ensureCaptionsEnabled();
      setPhase('load-start');
      setStatus(TEXT.loading);

      getBestCaptionData(videoId).then(function (captionData) {
        if (!isActiveRequest(requestId, videoId)) return;

        var tracks = captionData.tracks || [];
        app.tracks = tracks;
        logger.debug('caption tracks resolved', {
          loadKey: loadKey,
          source: captionData.source,
          tracks: tracks.length
        });

        var selected = chooseTrack(tracks, state.sourceTrackIndex, state.targetLang);
        if (!selected.track) {
          app.loading = false;
          app.cuesA = [];
          app.cuesB = [];
          app.lastSourceName = TEXT.noTrack;
          stopLoop();

          if (!tracks.length && app.trackRetryCount < CONFIG.maxTrackRetries) {
            app.trackRetryCount += 1;
            setPhase('wait-tracks');
            setStatus(TEXT.waitingTracks + ' (' + app.trackRetryCount + '/' + CONFIG.maxTrackRetries + ')');
            scheduleInit('wait-tracks', CONFIG.retryDelayMs);
          } else {
            setPhase('no-tracks');
            setStatus(TEXT.noTrackDetail);
          }
          syncUi();
          return null;
        }

        app.trackRetryCount = 0;
        state.sourceTrackIndex = selected.index;
        saveSettings(state);
        app.lastSourceName = formatTrackLabel(selected.track, selected.index);
        syncUi();

        var targetTrack = findTrackByLanguage(tracks, state.targetLang, selected.index);
        logger.debug('track pair', {
          sourceLang: selected.track.languageCode || '',
          targetLang: state.targetLang,
          targetMode: targetTrack ? 'direct-track' : 'translated'
        });

        return fetchBestPair(selected.track, targetTrack, state.targetLang).then(function (result) {
          if (!isActiveRequest(requestId, videoId)) return;

          if (!result.cuesA.length && !result.cuesB.length && captionData.defaultTrackIndex > -1 && captionData.defaultTrackIndex !== selected.index && tracks[captionData.defaultTrackIndex] && tracks[captionData.defaultTrackIndex].baseUrl) {
            var fallbackTrack = tracks[captionData.defaultTrackIndex];
            logger.debug('retry with default caption track', {
              from: selected.index,
              to: captionData.defaultTrackIndex,
              targetLang: state.targetLang
            });
            return fetchBestPair(fallbackTrack, null, state.targetLang).then(function (fallbackResult) {
              if (!isActiveRequest(requestId, videoId)) return;
              if (fallbackResult.cuesA.length || fallbackResult.cuesB.length) {
                app.lastSourceName = formatTrackLabel(fallbackTrack, captionData.defaultTrackIndex) + ' [fallback]';
                syncUi();
                return applyLoadedCues(fallbackResult);
              }
              return applyLoadedCues(result);
            });
          }

          return applyLoadedCues(result);
        });
      }).catch(function (err) {
        if (!isActiveRequest(requestId, videoId)) return;

        app.cuesA = [];
        app.cuesB = [];
        stopLoop();

        if (err && err.status === 429) {
          app.backoffUntil = Date.now() + CONFIG.rateLimitBackoffMs;
          setPhase('backoff');
          setStatus(TEXT.rateLimited);
        } else {
          setPhase('load-error');
          setStatus(TEXT.loadFailed + formatError(err));
        }
        logger.error('loadDualSubs failed', err);
      }).finally(function () {
        if (!isRequestCurrent(requestId)) return;
        app.loading = false;
        syncUi();
      });

      function applyLoadedCues(result) {
        if (!isActiveRequest(requestId, videoId)) return;

        app.backoffUntil = 0;
        app.cuesA = result.cuesA || [];
        app.cuesB = result.cuesB || [];

        if (!app.cuesA.length && !app.cuesB.length) {
          setPhase('no-cues');
          setStatus(TEXT.noCue);
          stopLoop();
          return;
        }

        setPhase('ready');
        if (!app.cuesB.length) {
          setStatus(TEXT.sourceOnly);
        } else {
          setStatus(TEXT.nativeReady);
        }
        startLoop();
      }
    }

    function isRequestCurrent(requestId) {
      return requestId === app.activeRequestId;
    }

    function isActiveRequest(requestId, videoId) {
      return isRequestCurrent(requestId) && videoId === getVideoId() && isWatchPage();
    }

    function startLoop() {
      stopLoop();

      function tick() {
        if (!isWatchPage()) {
          stopLoop();
          return;
        }

        var video = getVideo();
        if (!video) {
          app.loopId = requestAnimationFrame(tick);
          return;
        }

        var textA = findCueText(app.cuesA, video.currentTime);
        var textB = findCueText(app.cuesB, video.currentTime);
        renderNativeCaption(textA, textB);
        app.loopId = requestAnimationFrame(tick);
      }

      app.loopId = requestAnimationFrame(tick);
    }

    function stopLoop() {
      if (app.loopId) cancelAnimationFrame(app.loopId);
      app.loopId = 0;
      clearNativeCaptionWindow();
    }

    function exposeDebugApi() {
      var pageWindow = getPageWindow();
      pageWindow[DEBUG_API_KEY] = {
        runtime: api,
        reload: function () {
          loadDualSubs(true, 'debug-reload');
        },
        scheduleInit: function (reason) {
          scheduleInit(reason || 'debug', 0);
        },
        setDebug: function (enabled) {
          state.debug = !!enabled;
          saveSettings(state);
          syncUi();
          return collectSnapshot();
        },
        snapshot: function () {
          return collectSnapshot();
        }
      };
    }

    function collectSnapshot() {
      var tracks = [];
      var i;
      for (i = 0; i < app.tracks.length; i++) {
        tracks.push({
          index: i,
          lang: app.tracks[i].languageCode || '',
          name: getTrackName(app.tracks[i]),
          hasBaseUrl: !!app.tracks[i].baseUrl
        });
      }

      return {
        cuesA: app.cuesA.length,
        cuesB: app.cuesB.length,
        dom: {
          captionContainer: !!getCaptionContainer(),
          launcher: !!document.getElementById(CONFIG.ids.launcher),
          nativeWindow: !!document.getElementById(CONFIG.ids.nativeWindow),
          panel: !!document.getElementById(CONFIG.ids.panel),
          player: !!getPlayer(),
          video: !!getVideo()
        },
        fetch: {
          source: fetchDiagnostics.source,
          target: fetchDiagnostics.target
        },
        loading: app.loading,
        pageType: isWatchPage() ? 'watch' : 'other',
        phase: app.phase,
        source: app.lastSourceName,
        status: app.status,
        tracks: tracks,
        url: location.href,
        videoId: getVideoId()
      };
    }

    var api = {
      boot: boot,
      destroy: destroy,
      snapshot: collectSnapshot
    };

    return api;
  }

  function loadSettings() {
    var stored = GM_getValue(SETTINGS_KEY, {});
    var merged = {};
    var key;
    for (key in DEFAULTS) merged[key] = DEFAULTS[key];
    if (stored && typeof stored === 'object') {
      for (key in stored) merged[key] = stored[key];
    }
    return merged;
  }

  function saveSettings(nextState) {
    GM_setValue(SETTINGS_KEY, {
      debug: !!nextState.debug,
      panelOpen: !!nextState.panelOpen,
      launcherPosition: normalizePosition(nextState.launcherPosition),
      panelPosition: normalizePosition(nextState.panelPosition),
      sourceTrackIndex: Math.max(0, parseInt(nextState.sourceTrackIndex || '0', 10) || 0),
      targetLang: String(nextState.targetLang || DEFAULTS.targetLang)
    });
  }

  function normalizePosition(position) {
    if (!position || typeof position.left !== 'number' || typeof position.top !== 'number') return null;
    return {
      left: Math.max(0, Math.round(position.left)),
      top: Math.max(0, Math.round(position.top))
    };
  }

  function clearFetchDiagnostics() {
    fetchDiagnostics.source = '';
    fetchDiagnostics.target = '';
  }

  function setFetchDiagnostic(label, value) {
    fetchDiagnostics[label] = value;
  }

  function createLogger(isEnabled) {
    function emit(level, message, meta) {
      var fn = console[level] || console.log;
      if (typeof meta === 'undefined') {
        fn.call(console, LOG_PREFIX + ' ' + message);
      } else {
        fn.call(console, LOG_PREFIX + ' ' + message, meta);
      }
    }

    return {
      debug: function (message, meta) {
        if (!isEnabled()) return;
        emit('debug', message, meta);
      },
      error: function (message, meta) {
        emit('error', message, meta);
      }
    };
  }

  function isDebugEnabled(currentState) {
    return !!currentState.debug || location.search.indexOf(CONFIG.debugQueryParam) !== -1;
  }

  function isWatchPage() {
    return location.pathname === CONFIG.selectors.watchPath;
  }

  function getRoot() {
    return document.body || document.documentElement;
  }

  function getPageWindow() {
    return typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
  }

  function getPageFetch() {
    var pageWindow = getPageWindow();
    if (pageWindow && typeof pageWindow.fetch === 'function') {
      return pageWindow.fetch.bind(pageWindow);
    }
    if (typeof fetch === 'function') {
      return fetch.bind(window);
    }
    return null;
  }

  function getBrowserLikeUserAgent() {
    try {
      return navigator && navigator.userAgent ? navigator.userAgent : 'Mozilla/5.0';
    } catch (err) {
      return 'Mozilla/5.0';
    }
  }

  function buildInnertubeContext() {
    return {
      client: {
        clientName: 'WEB',
        clientVersion: getInnertubeClientVersion(),
        hl: document.documentElement && document.documentElement.lang ? document.documentElement.lang : 'zh-CN',
        visitorData: getInnertubeVisitorData()
      }
    };
  }

  function buildInnertubeHeaders() {
    var headers = {
      'Content-Type': 'application/json',
      'X-YouTube-Client-Name': '1',
      'X-YouTube-Client-Version': getInnertubeClientVersion()
    };
    var visitorData = getInnertubeVisitorData();
    if (visitorData) headers['X-Goog-Visitor-Id'] = visitorData;
    return headers;
  }

  function getVideoId() {
    return new URLSearchParams(location.search).get('v') || '';
  }

  function getVideo() {
    return document.querySelector(CONFIG.selectors.rootVideo);
  }

  function getPlayer() {
    return document.querySelector(CONFIG.selectors.player);
  }

  function getCaptionContainer() {
    return document.querySelector(CONFIG.selectors.captionContainer);
  }

  function getObservationTarget() {
    return document.querySelector('#content') || document.querySelector('#page-manager') || document.body || document.documentElement;
  }

  function ensureHistoryHook() {
    if (window.__ydsHistoryHookInstalled) return;
    window.__ydsHistoryHookInstalled = true;

    function dispatchHistoryChange(source) {
      try {
        window.dispatchEvent(new CustomEvent(CONFIG.historyEventName, {
          detail: {
            href: location.href,
            source: source
          }
        }));
      } catch (err) {
        logger.error('history hook dispatch failed', err);
      }
    }

    function patchHistoryMethod(name) {
      if (!history || typeof history[name] !== 'function') return;
      var original = history[name];
      history[name] = function () {
        var result = original.apply(this, arguments);
        window.setTimeout(function () {
          dispatchHistoryChange(name);
        }, 0);
        return result;
      };
    }

    patchHistoryMethod('pushState');
    patchHistoryMethod('replaceState');
  }

  function ensureCaptionsEnabled() {
    var btn = document.querySelector(CONFIG.selectors.subtitlesButton);
    if (!btn) return;
    if (btn.getAttribute('aria-pressed') === 'false') btn.click();
  }

  function clearNativeCaptionWindow() {
    var container = getCaptionContainer();
    if (!container) return;
    container.classList.remove('yds-native-mode');
    var node = document.getElementById(CONFIG.ids.nativeWindow);
    if (node) node.remove();
  }

  function ensureNativeCaptionWindow() {
    var container = getCaptionContainer();
    if (!container) return null;

    container.classList.add('yds-native-mode');
    var node = document.getElementById(CONFIG.ids.nativeWindow);
    if (!node) {
      node = document.createElement('div');
      node.id = CONFIG.ids.nativeWindow;
      node.className = 'yds-native-window';

      var lineA = document.createElement('div');
      lineA.className = 'yds-native-line yds-native-line-a';

      var lineB = document.createElement('div');
      lineB.className = 'yds-native-line yds-native-line-b';

      node.appendChild(lineA);
      node.appendChild(lineB);
      container.appendChild(node);
    }
    return node;
  }

  function renderNativeCaption(textA, textB) {
    if (!textA && !textB) {
      clearNativeCaptionWindow();
      return;
    }

    var node = ensureNativeCaptionWindow();
    if (!node) return;

    var lineA = node.querySelector('.yds-native-line-a');
    var lineB = node.querySelector('.yds-native-line-b');
    if (!lineA || !lineB) return;

    lineA.textContent = textA || '';
    lineB.textContent = textB || '';
    lineA.style.display = textA ? 'block' : 'none';
    lineB.style.display = textB ? 'block' : 'none';
    lineB.style.marginTop = textA && textB ? '6px' : '0';
  }

  function hasRelevantMutation(mutations) {
    var selector = [
      CONFIG.selectors.rootVideo,
      CONFIG.selectors.player,
      CONFIG.selectors.captionContainer,
      '#' + CONFIG.ids.launcher,
      '#' + CONFIG.ids.panel
    ].join(',');

    var i;
    for (i = 0; i < mutations.length; i++) {
      if (mutationHasRelevantNode(mutations[i].addedNodes, selector)) return true;
      if (mutationHasRelevantNode(mutations[i].removedNodes, selector)) return true;
    }
    return false;
  }

  function mutationHasRelevantNode(nodeList, selector) {
    var i;
    for (i = 0; i < nodeList.length; i++) {
      var node = nodeList[i];
      if (!node || node.nodeType !== 1) continue;
      if (matchesSelector(node, selector)) return true;
      if (typeof node.querySelector === 'function' && node.querySelector(selector)) return true;
    }
    return false;
  }

  function matchesSelector(node, selector) {
    var matcher = node.matches || node.msMatchesSelector || node.webkitMatchesSelector;
    return !!matcher && matcher.call(node, selector);
  }

  function isInteractiveTarget(target) {
    if (!target || typeof target.closest !== 'function') return false;
    return !!target.closest('button,input,textarea,select,a,label');
  }

  function clampToViewport(value, size, max) {
    var safeMax = Math.max(0, (max || 0) - (size || 0));
    if (value < 0) return 0;
    if (value > safeMax) return safeMax;
    return value;
  }

  function clampIndex(index, length) {
    if (!length) return 0;
    if (index < 0) return 0;
    if (index >= length) return length - 1;
    return index;
  }

  function buildTimedTextUrl(baseUrl, params) {
    var url = new URL(baseUrl, location.href);
    var key;
    for (key in params) {
      if (params[key] == null || params[key] === '') {
        url.searchParams.delete(key);
      } else {
        url.searchParams.set(key, params[key]);
      }
    }
    return url.toString();
  }

  function findCueText(cues, time) {
    var left = 0;
    var right = cues.length - 1;
    while (left <= right) {
      var mid = (left + right) >> 1;
      var cue = cues[mid];
      if (time < cue.start) {
        right = mid - 1;
      } else if (time > cue.end) {
        left = mid + 1;
      } else {
        return cue.text;
      }
    }
    return '';
  }

  function chooseTrack(tracks, preferredIndex, targetLang) {
    if (!tracks.length) return { index: 0, track: null };

    var index = clampIndex(preferredIndex, tracks.length);
    var track = getUsableTrack(tracks[index]) ? tracks[index] : null;

    if (!track) {
      index = findTrackIndex(tracks, function (item) {
        return getUsableTrack(item);
      });
      track = index === -1 ? null : tracks[index];
    }

    if (track && track.languageCode === targetLang) {
      var altIndex = findTrackIndex(tracks, function (item, itemIndex) {
        return itemIndex !== index && getUsableTrack(item) && item.languageCode !== targetLang;
      });
      if (altIndex !== -1) {
        index = altIndex;
        track = tracks[altIndex];
      }
    }

    return {
      index: index < 0 ? 0 : index,
      track: track
    };
  }

  function findTrackIndex(tracks, predicate) {
    var i;
    for (i = 0; i < tracks.length; i++) {
      if (predicate(tracks[i], i)) return i;
    }
    return -1;
  }

  function findTrackByLanguage(tracks, languageCode, excludeIndex) {
    if (!languageCode) return null;

    var exactIndex = findTrackIndex(tracks, function (track, index) {
      return index !== excludeIndex && getUsableTrack(track) && track.languageCode === languageCode;
    });
    if (exactIndex !== -1) return tracks[exactIndex];

    var prefix = String(languageCode).split('-')[0];
    var prefixIndex = findTrackIndex(tracks, function (track, index) {
      return index !== excludeIndex && getUsableTrack(track) && String(track.languageCode || '').split('-')[0] === prefix;
    });
    return prefixIndex === -1 ? null : tracks[prefixIndex];
  }

  function getUsableTrack(track) {
    return track && track.baseUrl ? track : null;
  }

  function getTrackName(track) {
    if (!track) return 'track';
    return track.name && track.name.simpleText ? track.name.simpleText : (track.vssId || 'track');
  }

  function formatTrackLabel(track, index) {
    return '#' + index + ' ' + getTrackName(track) + ' (' + (track.languageCode || '') + ')';
  }

  function getPlayerResponse() {
    var pageWindow = getPageWindow();
    var player = getPlayer();

    try {
      if (player && typeof player.getPlayerResponse === 'function') {
        var direct = player.getPlayerResponse();
        if (direct) return direct;
      }
    } catch (err) {
      logger.error('getPlayerResponse failed', err);
    }

    if (pageWindow.ytInitialPlayerResponse) return pageWindow.ytInitialPlayerResponse;
    return extractPlayerResponseFromHtml(document.documentElement ? document.documentElement.innerHTML : '');
  }

  function getCaptionTracks(playerResponse) {
    if (!playerResponse || !playerResponse.captions) return [];
    var renderer = playerResponse.captions.playerCaptionsTracklistRenderer;
    return renderer && renderer.captionTracks ? renderer.captionTracks : [];
  }

  function getDefaultCaptionTrackIndex(playerResponse) {
    if (!playerResponse || !playerResponse.captions) return -1;
    var renderer = playerResponse.captions.playerCaptionsTracklistRenderer;
    var audioTracks = renderer && renderer.audioTracks ? renderer.audioTracks : [];
    if (!audioTracks.length) return -1;
    var index = audioTracks[0] && typeof audioTracks[0].defaultCaptionTrackIndex === 'number' ? audioTracks[0].defaultCaptionTrackIndex : -1;
    return index;
  }

  function getBestCaptionData(videoId) {
    var playerResponse = getPlayerResponse();
    var tracks = getCaptionTracks(playerResponse);
    if (tracks.length) {
      return Promise.resolve({
        defaultTrackIndex: getDefaultCaptionTrackIndex(playerResponse),
        playerResponse: playerResponse,
        source: 'page',
        tracks: tracks
      });
    }

    return fetchPlayerResponseFromYoutubei(videoId).then(function (remoteResponse) {
      return {
        defaultTrackIndex: getDefaultCaptionTrackIndex(remoteResponse),
        playerResponse: remoteResponse,
        source: 'youtubei',
        tracks: getCaptionTracks(remoteResponse)
      };
    }).catch(function (err) {
      logger.error('youtubei player fallback failed', err);
      return {
        defaultTrackIndex: getDefaultCaptionTrackIndex(playerResponse),
        playerResponse: playerResponse,
        source: 'page-fallback',
        tracks: tracks
      };
    });
  }

  function getInnertubeClientVersion() {
    try {
      var pageWindow = getPageWindow();
      if (pageWindow.ytcfg && typeof pageWindow.ytcfg.get === 'function') {
        return pageWindow.ytcfg.get('INNERTUBE_CLIENT_VERSION') || pageWindow.ytcfg.get('INNERTUBE_CONTEXT_CLIENT_VERSION') || '2.20250312.04.00';
      }
    } catch (err) {
      logger.error('getInnertubeClientVersion failed', err);
    }
    return '2.20250312.04.00';
  }

  function getInnertubeVisitorData() {
    try {
      var pageWindow = getPageWindow();
      if (pageWindow.ytcfg && typeof pageWindow.ytcfg.get === 'function') {
        return pageWindow.ytcfg.get('VISITOR_DATA') || '';
      }
    } catch (err) {
      logger.error('getInnertubeVisitorData failed', err);
    }
    return '';
  }

  function fetchPlayerResponseFromYoutubei(videoId) {
    return postJson('https://www.youtube.com/youtubei/v1/player?prettyPrint=false', {
      context: buildInnertubeContext(),
      videoId: videoId
    }, buildInnertubeHeaders());
  }

  function postJson(url, body, headers) {
    var payload = JSON.stringify(body);
    var pageFetch = getPageFetch();
    if (!pageFetch) {
      return postJsonWithGM(url, payload, headers);
    }

    return pageFetch(url, {
      method: 'POST',
      body: payload,
      headers: headers,
      credentials: 'include',
      cache: 'no-store'
    }).then(function (res) {
      if (res.status === 429) throw rateLimitError(url, 'fetch');
      if (!res.ok) throw makeHttpError(res.status, url, 'fetch');
      return res.json();
    }).catch(function (err) {
      if (err && err.status === 429) throw err;
      return postJsonWithGM(url, payload, headers);
    });
  }

  function postJsonWithGM(url, payload, headers) {
    return new Promise(function (resolve, reject) {
      GM_xmlhttpRequest({
        method: 'POST',
        url: url,
        data: payload,
        headers: mergeHeaders(headers, {
          'Referer': 'https://www.youtube.com/',
          'User-Agent': getBrowserLikeUserAgent()
        }),
        onload: function (res) {
          if (res.status === 429) {
            reject(rateLimitError(url, 'gm'));
            return;
          }
          if (res.status < 200 || res.status >= 300) {
            reject(makeHttpError(res.status, url, 'gm'));
            return;
          }
          try {
            resolve(JSON.parse(res.responseText));
          } catch (parseErr) {
            reject(parseErr);
          }
        },
        onerror: function () {
          reject(makeHttpError('ERR', url, 'gm'));
        }
      });
    });
  }

  function extractPlayerResponseFromHtml(html) {
    var markers = ['ytInitialPlayerResponse = ', 'var ytInitialPlayerResponse = '];
    var i;

    for (i = 0; i < markers.length; i++) {
      var marker = markers[i];
      var markerIndex = html.indexOf(marker);
      if (markerIndex === -1) continue;

      var start = html.indexOf('{', markerIndex + marker.length);
      if (start === -1) continue;

      var depth = 0;
      var inString = false;
      var escaped = false;
      var quote = '';
      var j;

      for (j = start; j < html.length; j++) {
        var ch = html.charAt(j);
        if (inString) {
          if (escaped) {
            escaped = false;
          } else if (ch === '\\') {
            escaped = true;
          } else if (ch === quote) {
            inString = false;
          }
          continue;
        }

        if (ch === '"' || ch === '\'') {
          inString = true;
          quote = ch;
          continue;
        }

        if (ch === '{') depth += 1;
        if (ch === '}') {
          depth -= 1;
          if (depth === 0) {
            try {
              return JSON.parse(html.slice(start, j + 1));
            } catch (err) {
              logger.error('extractPlayerResponseFromHtml failed', err);
              return null;
            }
          }
        }
      }
    }

    return null;
  }

  function makeHttpError(status, url, via) {
    var err = new Error('HTTP ' + status);
    err.status = status;
    err.url = url;
    err.via = via;
    return err;
  }

  function rateLimitError(url, via) {
    var err = new Error('HTTP 429');
    err.status = 429;
    err.url = url;
    err.via = via;
    err.rateLimited = true;
    return err;
  }

  function mergeHeaders(baseHeaders, extraHeaders) {
    var merged = {};
    var key;
    baseHeaders = baseHeaders || {};
    extraHeaders = extraHeaders || {};
    for (key in baseHeaders) merged[key] = baseHeaders[key];
    for (key in extraHeaders) merged[key] = extraHeaders[key];
    return merged;
  }

  function httpGet(url) {
    return new Promise(function (resolve, reject) {
      GM_xmlhttpRequest({
        method: 'GET',
        url: url,
        headers: {
          'Referer': 'https://www.youtube.com/',
          'User-Agent': getBrowserLikeUserAgent()
        },
        onload: function (res) {
          if (res.status === 429) {
            reject(rateLimitError(url, 'gm'));
            return;
          }
          if (res.status < 200 || res.status >= 300) {
            reject(makeHttpError(res.status, url, 'gm'));
            return;
          }
          resolve(res.responseText);
        },
        onerror: function () {
          reject(makeHttpError('ERR', url, 'gm'));
        }
      });
    });
  }

  function fetchText(url) {
    var pageFetch = getPageFetch();
    if (!pageFetch) {
      return httpGet(url);
    }

    return pageFetch(url, {
      credentials: 'include',
      cache: 'no-store'
    }).then(function (res) {
      if (res.status === 429) throw rateLimitError(url, 'fetch');
      if (!res.ok) throw makeHttpError(res.status, url, 'fetch');
      return res.text();
    }).catch(function (err) {
      if (err && err.status === 429) throw err;
      return httpGet(url);
    });
  }

  function fetchBestPair(sourceTrack, targetTrack, targetLang) {
    clearFetchDiagnostics();
    return Promise.all([
      fetchTrackCues(sourceTrack, null, 'source'),
      targetTrack ? fetchTrackCues(targetTrack, null, 'target') : fetchTrackCues(sourceTrack, targetLang, 'target')
    ]).then(function (result) {
      if (!result[0].length && !result[1].length) {
        return fetchTranscriptCues(getVideoId()).then(function (fallbackCues) {
          if (fallbackCues.length) {
            setFetchDiagnostic('source', (fetchDiagnostics.source ? fetchDiagnostics.source + ' | ' : '') + 'transcript:ok(' + fallbackCues.length + ')');
            return {
              cuesA: fallbackCues,
              cuesB: []
            };
          }
          setFetchDiagnostic('source', (fetchDiagnostics.source ? fetchDiagnostics.source + ' | ' : '') + 'transcript:empty');
          return {
            cuesA: result[0] || [],
            cuesB: result[1] || []
          };
        }).catch(function (err) {
          setFetchDiagnostic('source', (fetchDiagnostics.source ? fetchDiagnostics.source + ' | ' : '') + 'transcript:err(' + formatError(err) + ')');
          return {
            cuesA: result[0] || [],
            cuesB: result[1] || []
          };
        });
      }

      return {
        cuesA: result[0] || [],
        cuesB: result[1] || []
      };
    });
  }

  function fetchTrackCues(track, targetLang, label) {
    var candidates = [
      buildTimedTextUrl(track.baseUrl, mergeTimedTextParams(targetLang, { fmt: 'json3' })),
      buildTimedTextUrl(track.baseUrl, mergeTimedTextParams(targetLang, { fmt: 'srv1' })),
      buildTimedTextUrl(track.baseUrl, mergeTimedTextParams(targetLang, { fmt: 'srv3' })),
      buildTimedTextUrl(track.baseUrl, mergeTimedTextParams(targetLang, { fmt: 'ttml' })),
      buildTimedTextUrl(track.baseUrl, mergeTimedTextParams(targetLang, { fmt: 'vtt' })),
      buildTimedTextUrl(track.baseUrl, mergeTimedTextParams(targetLang, {}))
    ];
    var attempts = [];

    function summarizeUrl(url) {
      try {
        var parsed = new URL(url, location.href);
        var fmt = parsed.searchParams.get('fmt') || 'raw';
        var lang = parsed.searchParams.get('lang') || '';
        var tlang = parsed.searchParams.get('tlang') || '';
        return fmt + ':' + lang + (tlang ? '->' + tlang : '');
      } catch (err) {
        return 'unknown';
      }
    }

    function summarizeText(text) {
      var compact = String(text || '').replace(/\s+/g, ' ').trim();
      if (!compact) return 'empty';
      return compact.slice(0, 48);
    }

    function tryAt(index) {
      if (index >= candidates.length) {
        setFetchDiagnostic(label, attempts.join(' | ') || 'no-attempt');
        return Promise.resolve([]);
      }
      return fetchText(candidates[index]).then(function (text) {
        var cues = parseCaptionPayload(text);
        attempts.push(summarizeUrl(candidates[index]) + ':ok(' + cues.length + ',' + summarizeText(text) + ')');
        if (cues.length) {
          setFetchDiagnostic(label, attempts.join(' | '));
          return cues;
        }
        return tryAt(index + 1);
      }).catch(function (err) {
        attempts.push(summarizeUrl(candidates[index]) + ':err(' + formatError(err) + ')');
        if (err && err.status === 429) {
          setFetchDiagnostic(label, attempts.join(' | '));
          throw err;
        }
        return tryAt(index + 1);
      });
    }

    return tryAt(0);
  }

  function mergeTimedTextParams(targetLang, extraParams) {
    var params = {};
    var key;
    if (targetLang) params.tlang = targetLang;
    for (key in extraParams) params[key] = extraParams[key];
    return params;
  }

  function fetchTranscriptCues(videoId) {
    return fetchTranscriptResponse(videoId).then(function (response) {
      return parseTranscriptResponse(response);
    });
  }

  function fetchTranscriptResponse(videoId) {
    return postJson('https://www.youtube.com/youtubei/v1/next?prettyPrint=false', {
      context: buildInnertubeContext(),
      videoId: videoId
    }, buildInnertubeHeaders()).then(function (nextResponse) {
      var endpoint = findNestedByKey(nextResponse, 'getTranscriptEndpoint');
      if (!endpoint || !endpoint.params) {
        throw new Error('Transcript endpoint not found');
      }

      return postJson('https://www.youtube.com/youtubei/v1/get_transcript?prettyPrint=false', {
        context: buildInnertubeContext(),
        params: endpoint.params
      }, buildInnertubeHeaders());
    });
  }

  function parseTranscriptResponse(response) {
    var listRenderer = findNestedByKey(response, 'transcriptSegmentListRenderer');
    var segments = listRenderer && listRenderer.initialSegments ? listRenderer.initialSegments : [];
    var cues = [];
    var i;

    for (i = 0; i < segments.length; i++) {
      var item = segments[i] && segments[i].transcriptSegmentRenderer;
      if (!item) continue;

      var startMs = parseInt(item.startMs || '0', 10);
      var endMs = parseInt(item.endMs || '0', 10);
      var text = readRunsText(item.snippet && item.snippet.runs);
      if (!text) continue;

      cues.push({
        start: startMs / 1000,
        end: (endMs || startMs) / 1000,
        text: text
      });
    }

    return cues;
  }

  function readRunsText(runs) {
    if (!runs || !runs.length) return '';
    var parts = [];
    var i;
    for (i = 0; i < runs.length; i++) {
      if (runs[i] && runs[i].text) parts.push(runs[i].text);
    }
    return parts.join('').replace(/\s+/g, ' ').trim();
  }

  function findNestedByKey(value, key) {
    if (!value || typeof value !== 'object') return null;
    if (Object.prototype.hasOwnProperty.call(value, key)) return value[key];

    var prop;
    for (prop in value) {
      if (!Object.prototype.hasOwnProperty.call(value, prop)) continue;
      var nested = findNestedByKey(value[prop], key);
      if (nested) return nested;
    }
    return null;
  }

  function parseCaptionPayload(text) {
    var body = String(text || '').trim();
    if (!body) return [];
    if (body.charAt(0) === '{') return parseJson3(body);
    if (body.charAt(0) === '<') return parseXml(body);
    return parseVtt(body);
  }

  function parseVtt(text) {
    var cues = [];
    var lines = String(text || '').replace(/\r/g, '').split('\n');
    var i = 0;

    function toSec(value) {
      var parts = value.split(':');
      var nums = [];
      var k;
      for (k = 0; k < parts.length; k++) nums.push(parseFloat(parts[k]));
      if (nums.length === 3) return nums[0] * 3600 + nums[1] * 60 + nums[2];
      if (nums.length === 2) return nums[0] * 60 + nums[1];
      return nums[0] || 0;
    }

    while (i < lines.length) {
      var line = lines[i].trim();
      if (!line) {
        i += 1;
        continue;
      }
      if (line.indexOf('WEBVTT') === 0) {
        i += 1;
        continue;
      }
      if (/^\d+$/.test(line)) {
        i += 1;
        line = (lines[i] || '').trim();
      }
      if (line.indexOf('-->') === -1) {
        i += 1;
        continue;
      }

      var parts = line.split('-->');
      var start = toSec(parts[0].trim().split(' ')[0].replace(',', '.'));
      var end = toSec(parts[1].trim().split(' ')[0].replace(',', '.'));
      i += 1;

      var textLines = [];
      while (i < lines.length && lines[i].trim() !== '') {
        textLines.push(lines[i].replace(/<[^>]+>/g, '').trim());
        i += 1;
      }

      var cueText = textLines.join('\n').trim();
      if (cueText) cues.push({ start: start, end: end, text: cueText });
    }

    return cues;
  }

  function parseJson3(text) {
    var data = JSON.parse(text);
    var events = data && data.events ? data.events : [];
    var cues = [];
    var i;

    for (i = 0; i < events.length; i++) {
      var event = events[i];
      if (!event || !event.segs || !event.segs.length) continue;

      var start = (event.tStartMs || 0) / 1000;
      var end = ((event.tStartMs || 0) + (event.dDurationMs || 0)) / 1000;
      var segs = [];
      var j;
      for (j = 0; j < event.segs.length; j++) segs.push(event.segs[j].utf8 || '');

      var cueText = segs.join('').replace(/\n+/g, '\n').trim();
      if (cueText) cues.push({ start: start, end: end, text: cueText });
    }

    return cues;
  }

  function parseXml(text) {
    var xml = new DOMParser().parseFromString(text, 'text/xml');
    if (xml.querySelector('parsererror')) throw new Error('XML parse error');

    var nodes = xml.querySelectorAll('p, text');
    var cues = [];
    var i;

    function readTime(node, nameA, nameB) {
      var raw = node.getAttribute(nameA);
      if (raw == null && nameB) raw = node.getAttribute(nameB);
      return raw == null ? 0 : parseFloat(raw);
    }

    for (i = 0; i < nodes.length; i++) {
      var node = nodes[i];
      var start = readTime(node, 't', 'start');
      var dur = readTime(node, 'd', 'dur');

      if (node.tagName.toLowerCase() === 'p') {
        start = start / 1000;
        dur = dur / 1000;
      }

      var cueText = String(node.textContent || '').replace(/\s+/g, ' ').trim();
      if (!cueText) continue;
      cues.push({ start: start, end: start + dur, text: cueText });
    }

    return cues;
  }

  function formatError(err) {
    if (!err) return 'unknown';
    if (typeof err === 'string') return err;
    var parts = [];
    if (err.message) parts.push(err.message);
    if (err.status != null) parts.push('status=' + err.status);
    if (err.via) parts.push('via=' + err.via);
    return parts.join(' | ') || String(err);
  }
})();
