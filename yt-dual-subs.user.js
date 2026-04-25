// ==UserScript==
// @name         YouTube Dual Native Subs
// @namespace    https://github.com/luismusaj646-prog/dual-subtitles
// @version      4.1.0
// @description  Native dual subtitles for YouTube
// @license      GPL-3.0-only
// @homepageURL  https://github.com/luismusaj646-prog/dual-subtitles
// @supportURL   https://github.com/luismusaj646-prog/dual-subtitles/issues
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
  var SCRIPT_VERSION = '4.1.0';
  var SETTINGS_KEY = 'yds_native_settings_v2';
  var RUNTIME_KEY = '__ydsRuntime';
  var DEBUG_API_KEY = '__ydsDebug';
  var LOG_PREFIX = '[tm-script][' + SCRIPT_NAME + ']';
  var TRANSCRIPT_LABEL_PATTERN = /(show transcript|open transcript|transcript|字幕记录|字幕記錄|文字稿|逐字稿|转录稿|轉錄稿|transkript anzeigen|transkript öffnen|mostrar transcripci[oó]n|abrir transcripci[oó]n|показать расшифровку видео|расшифровка)/i;

  var CONFIG = {
    initDelayMs: 320,
    domDebounceMs: 180,
    retryDelayMs: 1200,
    routePollMs: 1200,
    maxTrackRetries: 8,
    nativeTimedTextHintWaitMs: 2200,
    nativeTimedTextParamKeys: [
      'potc',
      'pot',
      'xorb',
      'xobt',
      'xovt',
      'cbr',
      'cbrver',
      'c',
      'cver',
      'cplayer',
      'cos',
      'cosver',
      'cplatform'
    ],
    rateLimitBackoffMs: 60000,
    selectors: {
      watchPath: '/watch',
      rootVideo: 'video',
      player: '.html5-video-player',
      captionContainer: '.ytp-caption-window-container',
      playerControls: '.ytp-chrome-bottom',
      nativeCaptionText: '.caption-window .ytp-caption-segment, .ytp-caption-segment, .caption-visual-line',
      subtitlesButton: '.ytp-subtitles-button',
      transcriptPanel: 'ytd-engagement-panel-section-list-renderer',
      transcriptRenderer: 'ytd-transcript-renderer',
      transcriptSegment: 'ytd-transcript-segment-renderer, transcript-segment-view-model',
      transcriptText: '.segment-text, yt-formatted-string, .yt-core-attributed-string[role="text"]',
      transcriptTime: '.segment-timestamp, .ytwTranscriptSegmentViewModelTimestamp',
      transcriptChipButton: 'button[aria-label], yt-button-shape button[aria-label], button[title], [role="button"][aria-label]',
      transcriptMenuButton: 'ytd-menu-renderer :is(yt-button-shape button, button#button.style-scope.ytd-menu-renderer, ytd-video-primary-info-renderer button, button[aria-haspopup=\"true\"])[aria-label*=\"more actions\" i], ytd-button-renderer button:is([aria-label*=\"transcript\" i],[title*=\"transcript\" i])',
      transcriptMenuItems: 'ytd-menu-service-item-renderer, tp-yt-paper-item, yt-formatted-string.style-scope.ytd-menu-service-item-renderer',
      transcriptDescriptionButton: 'button[aria-label*=\"transcript\" i], button[aria-label*=\"字幕\" i], button[aria-label*=\"文字稿\" i], button[title*=\"transcript\" i], #description-inline-expander [aria-label*=\"transcript\" i]',
      transcriptLanguageDropdown: 'ytd-transcript-footer-renderer yt-dropdown-menu tp-yt-paper-button, ytd-transcript-footer-renderer yt-dropdown-menu button',
      transcriptVisibleListboxes: 'tp-yt-iron-dropdown:not([aria-hidden=\"true\"]) tp-yt-paper-listbox',
      metadataTopRow: 'ytd-watch-metadata #top-row, #above-the-fold #top-row',
      metadataActions: 'ytd-watch-metadata #actions, #above-the-fold #actions',
      metadataActionButtons: 'ytd-watch-metadata #actions #top-level-buttons-computed, #above-the-fold #actions #top-level-buttons-computed, ytd-watch-metadata #actions, #above-the-fold #actions'
    },
    ids: {
      uiSlot: 'yds-page-slot',
      launcher: 'yds-launcher-root',
      panel: 'yds-panel-root',
      nativeWindow: 'yds-native-window',
      debugBox: 'yds-debug-box',
      hiddenTranscriptStyle: 'yds-hidden-transcript-style'
    },
    historyEventName: 'yds-history-change',
    debugQueryParam: 'ydsDebug=1',
    defaultDebug: false
  };

  var DEFAULTS = {
    targetLang: 'zh-Hans',
    targetLangBySource: {},
    sourceTrackIndex: 0,
    enabled: true,
    displayMode: 'dual',
    panelOpen: false,
    debug: CONFIG.defaultDebug,
    launcherPosition: null,
    panelPosition: null,
    sourceFontSize: 28,
    targetFontSize: 28,
    lineGap: 6,
    bottomOffset: 9,
    sourceColor: '#ffffff',
    targetColor: '#00e5ff',
    fontFamily: 'system',
    smartPosition: true,
    syncNativeStyle: true
  };

  var FONT_OPTIONS = [
    { value: 'system', label: '\u7CFB\u7EDF\u9ED8\u8BA4', css: 'system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif' },
    { value: 'youtube', label: 'YouTube Sans', css: '"YouTube Sans","Roboto",Arial,sans-serif' },
    { value: 'arial', label: 'Arial', css: 'Arial,"Helvetica Neue",sans-serif' },
    { value: 'roboto', label: 'Roboto', css: '"Roboto",Arial,sans-serif' },
    { value: 'segoe', label: 'Segoe UI', css: '"Segoe UI",Arial,sans-serif' },
    { value: 'microsoft-yahei', label: '\u5FAE\u8F6F\u96C5\u9ED1', css: '"Microsoft YaHei","Segoe UI",Arial,sans-serif' },
    { value: 'noto-sans', label: 'Noto Sans', css: '"Noto Sans","Noto Sans SC",Arial,sans-serif' },
    { value: 'serif', label: '\u886C\u7EBF', css: 'Georgia,"Times New Roman",serif' },
    { value: 'mono', label: '\u7B49\u5BBD', css: '"Cascadia Mono","Consolas",monospace' }
  ];

  var TEXT = {
    title: '\u53CC\u5B57\u5E55',
    launcher: 'X',
    reload: '\u91CD\u8F7D',
    sourceTrack: '\u5F53\u524D\u539F\u8F68',
    displayMode: '\u663E\u793A\u6A21\u5F0F',
    modeDual: '\u539F\u6587 + \u8BD1\u6587',
    modeSource: '\u53EA\u663E\u793A\u539F\u6587',
    modeTarget: '\u53EA\u663E\u793A\u8BD1\u6587',
    targetLang: '\u76EE\u6807\u8BED\u8A00',
    targetSearch: '\u641C\u7D22\u8BED\u8A00',
    targetSearchPlaceholder: '\u8F93\u5165\u8BED\u8A00\u6216\u4EE3\u7801',
    trackIndex: '\u539F\u5B57\u5E55\u8F68',
    styleTitle: '\u5B57\u5E55\u6837\u5F0F',
    sourceFontSize: '\u539F\u6587\u5B57\u53F7',
    targetFontSize: '\u8BD1\u6587\u5B57\u53F7',
    lineGap: '\u884C\u95F4\u8DDD',
    bottomOffset: '\u5E95\u90E8\u4F4D\u7F6E',
    fontFamily: '\u5B57\u4F53',
    sourceColor: '\u539F\u6587\u989C\u8272',
    targetColor: '\u8BD1\u6587\u989C\u8272',
    advancedTitle: '\u9AD8\u7EA7',
    resetStyle: '\u91CD\u7F6E\u6837\u5F0F',
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
    disabled: '\u53CC\u5B57\u5E55\u5DF2\u5173\u95ED',
    enableDualSubs: '\u5F00\u542F\u53CC\u5B57\u5E55',
    disableDualSubs: '\u5173\u95ED\u53CC\u5B57\u5E55',
    unselected: '\u672A\u9009\u62E9'
  };

  if (window[RUNTIME_KEY] && typeof window[RUNTIME_KEY].destroy === 'function') {
    window[RUNTIME_KEY].destroy('reinject');
  }

  GM_addStyle(
    '.yds-page-slot{' +
      'position:relative;display:inline-flex;align-items:center;justify-content:center;flex:0 0 auto;height:36px;' +
      'margin:0 0 0 8px;z-index:2200;vertical-align:middle;' +
    '}' +
    '.yds-launcher{' +
      'position:static;z-index:2200;width:36px;height:36px;min-width:36px;padding:0;border:0;border-radius:18px;' +
      'display:flex;align-items:center;justify-content:center;background:var(--yt-spec-badge-chip-background,#f2f2f2);' +
      'color:var(--yt-spec-text-primary,#0f0f0f);font:500 14px/36px Roboto,Arial,sans-serif;cursor:pointer;user-select:none;' +
      'box-shadow:none;outline:0;' +
    '}' +
    '.yds-launcher:hover,.yds-launcher[aria-expanded=\"true\"]{background:var(--yt-spec-mono-tonal-hover,#e5e5e5);}' +
    '.yds-launcher:focus-visible{box-shadow:0 0 0 2px var(--yt-spec-themed-blue,#065fd4);}' +
    '.yds-launcher.yds-detached{position:fixed;top:16px;right:16px;background:var(--yt-spec-badge-chip-background,#f2f2f2);}' +
    '.yds-panel{' +
      'position:absolute;top:44px;right:0;z-index:2201;width:360px;max-width:min(360px,calc(100vw - 24px));' +
      'max-height:min(78vh,640px);overflow:auto;box-sizing:border-box;padding:8px 0;border:0;border-radius:12px;' +
      'background:var(--yt-spec-menu-background,var(--yt-spec-base-background,#fff));color:var(--yt-spec-text-primary,#0f0f0f);' +
      'font:400 14px/20px Roboto,Arial,sans-serif;box-shadow:0 4px 32px rgba(0,0,0,.16);color-scheme:light dark;' +
    '}' +
    '.yds-panel.yds-detached{position:fixed;top:56px;right:16px;max-height:78vh;}' +
    '.yds-panel[dir=\"ltr\"]{right:0;left:auto;}' +
    '.yds-panel input,.yds-panel button,.yds-panel select{font:inherit;}' +
    '.yds-panel input,.yds-panel select{box-sizing:border-box;}' +
    '.yds-panel input[type="text"],.yds-panel input[type="number"],.yds-panel select{' +
      'height:36px;border-radius:8px;border:1px solid var(--yt-spec-10-percent-layer,rgba(0,0,0,.1));' +
      'background:var(--yt-spec-base-background,#fff);color:var(--yt-spec-text-primary,#0f0f0f);padding:0 32px 0 12px;' +
    '}' +
    '.yds-panel select{width:100%;}' +
    '.yds-panel option{background:var(--yt-spec-menu-background,var(--yt-spec-base-background,#fff));color:var(--yt-spec-text-primary,#0f0f0f);}' +
    '.yds-panel input[type="color"]{width:36px;height:36px;padding:0;border:0;background:transparent;}' +
    '.yds-panel input[type="range"]{min-width:0;accent-color:var(--yt-spec-themed-blue,#065fd4);}' +
    '.yds-panel button{height:36px;border-radius:18px;border:0;background:var(--yt-spec-badge-chip-background,#f2f2f2);color:var(--yt-spec-text-primary,#0f0f0f);cursor:pointer;padding:0 14px;}' +
    '.yds-panel button:hover{background:var(--yt-spec-mono-tonal-hover,#e5e5e5);}' +
    '.yds-panel label,.yds-field,.yds-select-field{' +
      'display:grid;grid-template-columns:112px minmax(0,1fr);align-items:center;gap:12px;min-height:48px;' +
      'box-sizing:border-box;margin:0;padding:6px 16px;color:var(--yt-spec-text-primary,#0f0f0f);' +
    '}' +
    '.yds-panel label:hover,.yds-field:hover,.yds-select-field:hover{background:var(--yt-spec-mono-tonal-hover,rgba(0,0,0,.06));}' +
    '.yds-section-title{margin:8px 0 0;padding:10px 16px 6px;font:500 14px/20px Roboto,Arial,sans-serif;color:var(--yt-spec-text-primary,#0f0f0f);}' +
    '.yds-field{grid-template-columns:112px minmax(0,1fr) 56px;}' +
    '.yds-field>span,.yds-select-field>span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}' +
    '.yds-field input[type="number"]{width:56px;text-align:center;padding:0 6px;}' +
    '.yds-field-unit{font-size:12px;color:var(--yt-spec-text-secondary,#606060);margin-left:2px;}' +
    '.yds-row{display:flex;gap:8px;align-items:center;min-height:40px;padding:4px 16px;}' +
    '.yds-row>*{flex:1;}' +
    '.yds-title-row{border-bottom:1px solid var(--yt-spec-10-percent-layer,rgba(0,0,0,.1));margin-bottom:4px;padding-bottom:8px;}' +
    '.yds-title-row strong{font:500 16px/22px Roboto,Arial,sans-serif;}' +
    '.yds-close-btn{flex:0 0 36px !important;padding:0 !important;}' +
    '.yds-enabled-btn{width:calc(100% - 32px);margin:6px 16px;}' +
    '.yds-toggle{display:flex;align-items:center;gap:12px;min-height:40px;margin:0;padding:6px 16px;}' +
    '.yds-toggle:hover{background:var(--yt-spec-mono-tonal-hover,rgba(0,0,0,.06));}' +
    '.yds-toggle input{flex:0 0 auto;}' +
    '.yds-advanced{margin:4px 0 0;border-top:1px solid var(--yt-spec-10-percent-layer,rgba(0,0,0,.1));}' +
    '.yds-advanced summary{cursor:pointer;list-style:none;min-height:40px;padding:10px 16px;box-sizing:border-box;color:var(--yt-spec-text-primary,#0f0f0f);}' +
    '.yds-advanced summary::-webkit-details-marker{display:none;}' +
    '.yds-advanced summary:hover{background:var(--yt-spec-mono-tonal-hover,rgba(0,0,0,.06));}' +
    '.yds-status{padding:6px 16px;font-size:12px;line-height:18px;color:var(--yt-spec-text-secondary,#606060);white-space:pre-wrap;word-break:break-word;}' +
    '.yds-debug{margin:6px 16px 10px;max-height:220px;overflow:auto;padding:8px;border-radius:8px;background:var(--yt-spec-badge-chip-background,#f2f2f2);font:12px/16px Consolas,monospace;white-space:pre-wrap;word-break:break-word;color:var(--yt-spec-text-primary,#0f0f0f);}' +
    '.yds-debug[hidden]{display:none;}' +
    'html[dark] .yds-launcher,body[dark] .yds-launcher,ytd-app[dark] .yds-launcher,.dark .yds-launcher{' +
      'background:#272727;color:#f1f1f1;' +
    '}' +
    'html[dark] .yds-launcher:hover,html[dark] .yds-launcher[aria-expanded=\"true\"],body[dark] .yds-launcher:hover,body[dark] .yds-launcher[aria-expanded=\"true\"],ytd-app[dark] .yds-launcher:hover,ytd-app[dark] .yds-launcher[aria-expanded=\"true\"],.dark .yds-launcher:hover,.dark .yds-launcher[aria-expanded=\"true\"]{' +
      'background:#3f3f3f;' +
    '}' +
    'html[dark] .yds-panel,body[dark] .yds-panel,ytd-app[dark] .yds-panel,.dark .yds-panel{' +
      'background:#282828;color:#f1f1f1;box-shadow:0 4px 32px rgba(0,0,0,.48);color-scheme:dark;' +
    '}' +
    'html[dark] .yds-panel input[type="text"],html[dark] .yds-panel input[type="number"],html[dark] .yds-panel select,body[dark] .yds-panel input[type="text"],body[dark] .yds-panel input[type="number"],body[dark] .yds-panel select,ytd-app[dark] .yds-panel input[type="text"],ytd-app[dark] .yds-panel input[type="number"],ytd-app[dark] .yds-panel select,.dark .yds-panel input[type="text"],.dark .yds-panel input[type="number"],.dark .yds-panel select{' +
      'background:#121212;color:#f1f1f1;border-color:#3f3f3f;' +
    '}' +
    'html[dark] .yds-panel option,body[dark] .yds-panel option,ytd-app[dark] .yds-panel option,.dark .yds-panel option{' +
      'background:#282828;color:#f1f1f1;' +
    '}' +
    'html[dark] .yds-panel button,body[dark] .yds-panel button,ytd-app[dark] .yds-panel button,.dark .yds-panel button{' +
      'background:#3f3f3f;color:#f1f1f1;' +
    '}' +
    'html[dark] .yds-panel button:hover,body[dark] .yds-panel button:hover,ytd-app[dark] .yds-panel button:hover,.dark .yds-panel button:hover{' +
      'background:#535353;' +
    '}' +
    'html[dark] .yds-title-row,html[dark] .yds-advanced,body[dark] .yds-title-row,body[dark] .yds-advanced,ytd-app[dark] .yds-title-row,ytd-app[dark] .yds-advanced,.dark .yds-title-row,.dark .yds-advanced{' +
      'border-color:#3f3f3f;' +
    '}' +
    'html[dark] .yds-panel label,html[dark] .yds-field,html[dark] .yds-select-field,html[dark] .yds-section-title,html[dark] .yds-advanced summary,body[dark] .yds-panel label,body[dark] .yds-field,body[dark] .yds-select-field,body[dark] .yds-section-title,body[dark] .yds-advanced summary,ytd-app[dark] .yds-panel label,ytd-app[dark] .yds-field,ytd-app[dark] .yds-select-field,ytd-app[dark] .yds-section-title,ytd-app[dark] .yds-advanced summary,.dark .yds-panel label,.dark .yds-field,.dark .yds-select-field,.dark .yds-section-title,.dark .yds-advanced summary{' +
      'color:#f1f1f1;' +
    '}' +
    'html[dark] .yds-panel label:hover,html[dark] .yds-field:hover,html[dark] .yds-select-field:hover,html[dark] .yds-toggle:hover,html[dark] .yds-advanced summary:hover,body[dark] .yds-panel label:hover,body[dark] .yds-field:hover,body[dark] .yds-select-field:hover,body[dark] .yds-toggle:hover,body[dark] .yds-advanced summary:hover,ytd-app[dark] .yds-panel label:hover,ytd-app[dark] .yds-field:hover,ytd-app[dark] .yds-select-field:hover,ytd-app[dark] .yds-toggle:hover,ytd-app[dark] .yds-advanced summary:hover,.dark .yds-panel label:hover,.dark .yds-field:hover,.dark .yds-select-field:hover,.dark .yds-toggle:hover,.dark .yds-advanced summary:hover{' +
      'background:#3f3f3f;' +
    '}' +
    'html[dark] .yds-status,html[dark] .yds-field-unit,body[dark] .yds-status,body[dark] .yds-field-unit,ytd-app[dark] .yds-status,ytd-app[dark] .yds-field-unit,.dark .yds-status,.dark .yds-field-unit{' +
      'color:#aaa;' +
    '}' +
    'html[dark] .yds-debug,body[dark] .yds-debug,ytd-app[dark] .yds-debug,.dark .yds-debug{' +
      'background:#1f1f1f;color:#f1f1f1;' +
    '}' +
    '.ytp-caption-window-container.yds-native-mode .caption-window{display:none !important;}' +
    '.html5-video-player .yds-native-window{' +
      'position:absolute;left:0;right:0;bottom:9%;z-index:63;padding:0 24px;box-sizing:border-box;' +
      'display:flex;flex-direction:column;align-items:center;text-align:center;pointer-events:none;' +
      'text-shadow:0 2px 4px rgba(0,0,0,.85);' +
    '}' +
    '.html5-video-player .yds-native-line{' +
      'display:block;max-width:100%;font:600 28px/1.24 system-ui,sans-serif;white-space:pre-line;word-break:break-word;' +
    '}' +
    '.html5-video-player .yds-native-line-b{margin-top:6px;color:#00e5ff;}'
  );

  var state = loadSettings();
  var logger = createLogger(function () {
    return isDebugEnabled(state);
  });
  var fetchDiagnostics = {
    source: '',
    target: ''
  };
  var nativeTimedTextHints = {
    videoId: '',
    byLang: {},
    last: null
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
      defaultTrackIndex: -1,
      lastSourceName: '',
      lastCaptionSource: '',
      lastFallback: '',
      lastVideoId: '',
      lastUrl: '',
      loading: false,
      loopId: 0,
      pendingLoadKey: '',
      phase: 'boot',
      status: '',
      translationLanguages: [],
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
      displayMode: null,
      targetSearch: null,
      targetLang: null,
      trackIndex: null,
      sourceFontSize: null,
      targetFontSize: null,
      lineGap: null,
      bottomOffset: null,
      fontFamily: null,
      sourceColor: null,
      targetColor: null,
      enabledBtn: null,
      debugToggle: null,
      debugBox: null
    };

    function boot() {
      setPhase('boot');
      installTimedTextObserver();
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

      ui.launcher = document.createElement('button');
      ui.launcher.id = CONFIG.ids.launcher;
      ui.launcher.type = 'button';
      ui.launcher.className = 'yds-launcher';
      ui.launcher.textContent = TEXT.launcher;
      ui.launcher.title = TEXT.title;
      ui.launcher.addEventListener('click', function () {
        state.panelOpen = !state.panelOpen;
        saveSettings(state);
        mountUi();
      });

      ui.panel = document.createElement('div');
      ui.panel.id = CONFIG.ids.panel;
      ui.panel.className = 'yds-panel';
      ui.panel.dir = 'ltr';

      var titleRow = document.createElement('div');
      titleRow.className = 'yds-row';
      titleRow.className += ' yds-title-row';

      var title = document.createElement('strong');
      title.textContent = TEXT.title;

      var reloadBtn = document.createElement('button');
      reloadBtn.type = 'button';
      reloadBtn.textContent = TEXT.reload;
      reloadBtn.addEventListener('click', function () {
        reloadDualSubsSoon('manual-reload');
      });

      var closeBtn = document.createElement('button');
      closeBtn.type = 'button';
      closeBtn.className = 'yds-close-btn';
      closeBtn.textContent = 'x';
      closeBtn.title = '\u9690\u85CF';
      closeBtn.addEventListener('click', function () {
        state.panelOpen = false;
        saveSettings(state);
        mountUi();
      });

      titleRow.appendChild(title);
      titleRow.appendChild(reloadBtn);
      titleRow.appendChild(closeBtn);
      ui.panel.appendChild(titleRow);

      ui.enabledBtn = document.createElement('button');
      ui.enabledBtn.type = 'button';
      ui.enabledBtn.className = 'yds-enabled-btn';
      ui.enabledBtn.addEventListener('click', function () {
        setDualSubsEnabled(!state.enabled, 'toggle-button');
      });
      ui.panel.appendChild(ui.enabledBtn);

      ui.displayMode = createDisplayModeField();

      var sourceLabel = document.createElement('label');
      sourceLabel.textContent = TEXT.sourceTrack;
      ui.sourceName = document.createElement('div');
      ui.sourceName.className = 'yds-status';
      sourceLabel.appendChild(ui.sourceName);
      ui.panel.appendChild(sourceLabel);

      var targetSearchLabel = document.createElement('label');
      targetSearchLabel.textContent = TEXT.targetSearch;
      ui.targetSearch = document.createElement('input');
      ui.targetSearch.type = 'text';
      ui.targetSearch.placeholder = TEXT.targetSearchPlaceholder;
      ui.targetSearch.setAttribute('data-yds-control', 'target-lang-search');
      ui.targetSearch.addEventListener('input', function () {
        syncTargetLanguageOptions(true);
      });
      targetSearchLabel.appendChild(ui.targetSearch);
      ui.panel.appendChild(targetSearchLabel);

      var targetLabel = document.createElement('label');
      targetLabel.textContent = TEXT.targetLang;
      ui.targetLang = document.createElement('select');
      ui.targetLang.setAttribute('data-yds-control', 'target-lang');
      ui.targetLang.addEventListener('change', function () {
        state.targetLang = String(ui.targetLang.value || DEFAULTS.targetLang).trim() || DEFAULTS.targetLang;
        rememberTargetForCurrentSource();
        saveSettings(state);
        reloadDualSubsSoon('target-lang-change');
      });
      targetLabel.appendChild(ui.targetLang);
      ui.panel.appendChild(targetLabel);

      var trackLabel = document.createElement('label');
      trackLabel.textContent = TEXT.trackIndex;
      ui.trackIndex = document.createElement('select');
      ui.trackIndex.setAttribute('data-yds-control', 'source-track-index');
      ui.trackIndex.addEventListener('change', function () {
        var next = parseInt(ui.trackIndex.value || '0', 10);
        state.sourceTrackIndex = isNaN(next) ? 0 : Math.max(0, next);
        applyRememberedTargetForTrack(app.tracks[state.sourceTrackIndex], true);
        saveSettings(state);
        reloadDualSubsSoon('track-index-change');
      });
      trackLabel.appendChild(ui.trackIndex);
      ui.panel.appendChild(trackLabel);

      var styleTitle = document.createElement('div');
      styleTitle.className = 'yds-section-title';
      styleTitle.textContent = TEXT.styleTitle;
      ui.panel.appendChild(styleTitle);

      ui.sourceFontSize = createNumberRangeField(TEXT.sourceFontSize, 'sourceFontSize', 16, 56, 1, 'px');
      ui.targetFontSize = createNumberRangeField(TEXT.targetFontSize, 'targetFontSize', 16, 56, 1, 'px');
      ui.lineGap = createNumberRangeField(TEXT.lineGap, 'lineGap', 0, 24, 1, 'px');
      ui.bottomOffset = createNumberRangeField(TEXT.bottomOffset, 'bottomOffset', 2, 28, 1, '%');
      ui.fontFamily = createFontField();
      ui.sourceColor = createColorField(TEXT.sourceColor, 'sourceColor');
      ui.targetColor = createColorField(TEXT.targetColor, 'targetColor');

      var resetStyleBtn = document.createElement('button');
      resetStyleBtn.type = 'button';
      resetStyleBtn.textContent = TEXT.resetStyle;
      resetStyleBtn.addEventListener('click', function () {
        resetSubtitleStyle();
      });
      ui.panel.appendChild(resetStyleBtn);

      var advanced = document.createElement('details');
      advanced.className = 'yds-advanced';
      var advancedSummary = document.createElement('summary');
      advancedSummary.textContent = TEXT.advancedTitle;
      advanced.appendChild(advancedSummary);

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
      advanced.appendChild(toggleRow);

      ui.status = document.createElement('div');
      ui.status.className = 'yds-status';
      ui.panel.appendChild(ui.status);

      ui.debugBox = document.createElement('div');
      ui.debugBox.id = CONFIG.ids.debugBox;
      ui.debugBox.className = 'yds-debug';
      advanced.appendChild(ui.debugBox);
      ui.panel.appendChild(advanced);

      syncUi();
    }

    function createDisplayModeField() {
      var row = document.createElement('label');
      row.textContent = TEXT.displayMode;

      var select = document.createElement('select');
      select.setAttribute('data-yds-control', 'display-mode');
      [
        { value: 'dual', label: TEXT.modeDual },
        { value: 'source', label: TEXT.modeSource },
        { value: 'target', label: TEXT.modeTarget }
      ].forEach(function (option) {
        var node = document.createElement('option');
        node.value = option.value;
        node.textContent = option.label;
        select.appendChild(node);
      });
      select.addEventListener('change', function () {
        state.displayMode = normalizeDisplayMode(select.value);
        saveSettings(state);
        renderCurrentCaption();
        syncUi();
      });

      row.appendChild(select);
      ui.panel.appendChild(row);
      return select;
    }

    function createNumberRangeField(labelText, stateKey, min, max, step, unit) {
      var row = document.createElement('div');
      row.className = 'yds-field';

      var label = document.createElement('span');
      label.textContent = labelText;

      var range = document.createElement('input');
      range.type = 'range';
      range.min = String(min);
      range.max = String(max);
      range.step = String(step);

      var number = document.createElement('input');
      number.type = 'number';
      number.min = String(min);
      number.max = String(max);
      number.step = String(step);
      number.setAttribute('data-yds-control', stateKey);

      function commit(value) {
        state[stateKey] = clampNumber(parseFloat(value), min, max, DEFAULTS[stateKey]);
        range.value = String(state[stateKey]);
        number.value = String(state[stateKey]);
        saveSettings(state);
        applySubtitleStyle();
      }

      range.addEventListener('input', function () {
        commit(range.value);
      });
      number.addEventListener('change', function () {
        commit(number.value);
      });

      row.appendChild(label);
      row.appendChild(range);
      row.appendChild(number);
      ui.panel.appendChild(row);

      return {
        number: number,
        range: range,
        unit: unit
      };
    }

    function createFontField() {
      var row = document.createElement('div');
      row.className = 'yds-select-field';

      var label = document.createElement('span');
      label.textContent = TEXT.fontFamily;

      var select = document.createElement('select');
      select.setAttribute('data-yds-control', 'font-family');
      FONT_OPTIONS.forEach(function (option) {
        var node = document.createElement('option');
        node.value = option.value;
        node.textContent = option.label;
        select.appendChild(node);
      });
      select.addEventListener('change', function () {
        state.fontFamily = normalizeFontFamily(select.value);
        saveSettings(state);
        applySubtitleStyle();
      });

      row.appendChild(label);
      row.appendChild(select);
      ui.panel.appendChild(row);

      return select;
    }

    function createColorField(labelText, stateKey) {
      var row = document.createElement('div');
      row.className = 'yds-field';

      var label = document.createElement('span');
      label.textContent = labelText;

      var preview = document.createElement('span');
      preview.className = 'yds-field-unit';
      preview.textContent = '\u25CF';

      var color = document.createElement('input');
      color.type = 'color';
      color.setAttribute('data-yds-control', stateKey);
      color.addEventListener('input', function () {
        state[stateKey] = normalizeColor(color.value, DEFAULTS[stateKey]);
        saveSettings(state);
        applySubtitleStyle();
        syncColorPreview(preview, state[stateKey]);
      });

      row.appendChild(label);
      row.appendChild(preview);
      row.appendChild(color);
      ui.panel.appendChild(row);

      return {
        input: color,
        preview: preview
      };
    }

    function mountUi() {
      if (!isWatchPage()) {
        unmountUi();
        return;
      }

      var host = ensurePageControlsSlot();
      if (!host) {
        unmountUi();
        syncUi();
        return;
      }

      var detached = false;
      setDetachedClass(ui.launcher, detached);
      setDetachedClass(ui.panel, detached);
      if (ui.launcher) ui.launcher.setAttribute('aria-expanded', state.panelOpen ? 'true' : 'false');

      if (ui.launcher && ui.launcher.parentNode !== host) host.appendChild(ui.launcher);
      if (state.panelOpen) {
        if (ui.panel && ui.panel.parentNode !== host) host.appendChild(ui.panel);
      } else if (ui.panel && ui.panel.isConnected) {
        ui.panel.remove();
      }
      if (detached) {
        applyStoredPosition(ui.launcher, state.launcherPosition);
        applyStoredPosition(ui.panel, state.panelPosition);
      } else {
        clearInlinePosition(ui.launcher);
        clearInlinePosition(ui.panel);
      }
      syncUi();
    }

    function unmountUi() {
      if (ui.panel && ui.panel.isConnected) ui.panel.remove();
      if (ui.launcher && ui.launcher.isConnected) ui.launcher.remove();
      var slot = document.getElementById(CONFIG.ids.uiSlot);
      if (slot && !slot.childNodes.length) slot.remove();
    }

    function ensurePageControlsSlot() {
      var host = getPageControlsHost();
      if (!host) return null;

      var slot = document.getElementById(CONFIG.ids.uiSlot);
      if (!slot) {
        slot = document.createElement('div');
        slot.id = CONFIG.ids.uiSlot;
        slot.className = 'yds-page-slot';
      }

      if (slot.parentNode !== host) {
        host.appendChild(slot);
      }

      return slot;
    }

    function getPageControlsHost() {
      return document.querySelector(CONFIG.selectors.metadataActionButtons) ||
        document.querySelector(CONFIG.selectors.metadataActions) ||
        document.querySelector(CONFIG.selectors.metadataTopRow);
    }

    function uiMountedInBestHost() {
      if (!ui.launcher || !ui.launcher.isConnected) return false;
      var host = getPageControlsHost();
      if (!host) return true;
      var slot = document.getElementById(CONFIG.ids.uiSlot);
      return !!slot && slot.parentNode === host && ui.launcher.parentNode === slot;
    }

    function syncUi() {
      syncTargetLanguageOptions();
      syncSourceTrackOptions();
      if (ui.displayMode) ui.displayMode.value = normalizeDisplayMode(state.displayMode);
      if (ui.targetLang) ui.targetLang.value = state.targetLang;
      if (ui.trackIndex) ui.trackIndex.value = String(state.sourceTrackIndex);
      if (ui.sourceName) ui.sourceName.textContent = app.lastSourceName || TEXT.unselected;
      if (ui.status) ui.status.textContent = app.status;
      if (ui.debugToggle) ui.debugToggle.checked = !!state.debug;
      if (ui.enabledBtn) ui.enabledBtn.textContent = state.enabled ? TEXT.disableDualSubs : TEXT.enableDualSubs;
      syncStyleControls();
      applySubtitleStyle();
      if (ui.debugBox) {
        ui.debugBox.hidden = !isDebugEnabled(state);
        ui.debugBox.textContent = formatDebugText();
      }
    }

    function syncTargetLanguageOptions(force) {
      if (!ui.targetLang) return;

      var rawOptions = (app.translationLanguages || []).slice();
      var query = ui.targetSearch ? normalizeSearchText(ui.targetSearch.value) : '';
      var options = query ? rawOptions.filter(function (option) {
        return normalizeSearchText(option.languageCode + ' ' + option.name).indexOf(query) !== -1;
      }) : rawOptions;
      var hasCurrent = false;
      var i;
      for (i = 0; i < options.length; i++) {
        if (options[i].languageCode === state.targetLang) {
          hasCurrent = true;
          break;
        }
      }
      if (!hasCurrent) {
        options.unshift({
          languageCode: state.targetLang,
          name: state.targetLang
        });
      }

      var signature = options.map(function (option) {
        return option.languageCode + ':' + option.name;
      }).join('|') + '|q=' + query;
      if (!force && ui.targetLang.getAttribute('data-options-signature') === signature) return;

      ui.targetLang.textContent = '';
      options.forEach(function (option) {
        var node = document.createElement('option');
        node.value = option.languageCode;
        node.textContent = option.name + ' (' + option.languageCode + ')';
        ui.targetLang.appendChild(node);
      });
      ui.targetLang.setAttribute('data-options-signature', signature);
    }

    function syncSourceTrackOptions() {
      if (!ui.trackIndex) return;

      var tracks = app.tracks || [];
      var options = [];
      var i;
      for (i = 0; i < tracks.length; i++) {
        options.push({
          index: i,
          label: formatTrackLabel(tracks[i], i)
        });
      }
      if (!options.length) {
        options.push({
          index: state.sourceTrackIndex,
          label: '#' + state.sourceTrackIndex
        });
      }

      var signature = options.map(function (option) {
        return option.index + ':' + option.label;
      }).join('|');
      if (ui.trackIndex.getAttribute('data-options-signature') === signature) return;

      ui.trackIndex.textContent = '';
      options.forEach(function (option) {
        var node = document.createElement('option');
        node.value = String(option.index);
        node.textContent = option.label;
        ui.trackIndex.appendChild(node);
      });
      ui.trackIndex.setAttribute('data-options-signature', signature);
    }

    function getCurrentSourceTrack() {
      return app.tracks && app.tracks[state.sourceTrackIndex] ? app.tracks[state.sourceTrackIndex] : null;
    }

    function getSourceMemoryKey(track) {
      if (!track || !track.languageCode) return '';
      return String(track.languageCode || '').trim();
    }

    function rememberTargetForCurrentSource() {
      rememberTargetForTrack(getCurrentSourceTrack(), state.targetLang);
    }

    function rememberTargetForTrack(track, targetLang) {
      var key = getSourceMemoryKey(track);
      if (!key || !targetLang) return false;
      if (!state.targetLangBySource || typeof state.targetLangBySource !== 'object') state.targetLangBySource = {};
      state.targetLangBySource[key] = String(targetLang);
      return true;
    }

    function applyRememberedTargetForTrack(track, fallbackToDefault) {
      var key = getSourceMemoryKey(track);
      var remembered = key && state.targetLangBySource ? state.targetLangBySource[key] : '';
      if (!remembered && fallbackToDefault) remembered = DEFAULTS.targetLang;
      if (!remembered || remembered === state.targetLang) return false;
      state.targetLang = remembered;
      return true;
    }

    function syncStyleControls() {
      syncNumberRange(ui.sourceFontSize, state.sourceFontSize);
      syncNumberRange(ui.targetFontSize, state.targetFontSize);
      syncNumberRange(ui.lineGap, state.lineGap);
      syncNumberRange(ui.bottomOffset, state.bottomOffset);
      if (ui.fontFamily) ui.fontFamily.value = normalizeFontFamily(state.fontFamily);
      syncColor(ui.sourceColor, state.sourceColor);
      syncColor(ui.targetColor, state.targetColor);
    }

    function syncNumberRange(control, value) {
      if (!control) return;
      control.range.value = String(value);
      control.number.value = String(value);
    }

    function syncColor(control, value) {
      if (!control) return;
      control.input.value = normalizeColor(value, '#ffffff');
      syncColorPreview(control.preview, control.input.value);
    }

    function syncColorPreview(node, value) {
      if (!node) return;
      node.style.color = normalizeColor(value, '#ffffff');
    }

    function resetSubtitleStyle() {
      state.sourceFontSize = DEFAULTS.sourceFontSize;
      state.targetFontSize = DEFAULTS.targetFontSize;
      state.lineGap = DEFAULTS.lineGap;
      state.bottomOffset = DEFAULTS.bottomOffset;
      state.sourceColor = DEFAULTS.sourceColor;
      state.targetColor = DEFAULTS.targetColor;
      state.fontFamily = DEFAULTS.fontFamily;
      saveSettings(state);
      syncUi();
    }

    function setDetachedClass(node, detached) {
      if (!node) return;
      node.classList.toggle('yds-detached', !!detached);
    }

    function clearInlinePosition(node) {
      if (!node) return;
      node.style.left = '';
      node.style.top = '';
      node.style.right = '';
      node.style.bottom = '';
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

    function setDualSubsEnabled(enabled, reason) {
      state.enabled = !!enabled;
      saveSettings(state);
      if (state.enabled) {
        reloadDualSubsSoon(reason || 'enabled');
        return;
      }

      app.pendingLoadKey = '';
      app.backoffUntil = 0;
      app.loading = false;
      app.cuesA = [];
      app.cuesB = [];
      stopLoop();
      clearNativeCaptionWindow();
      setPhase('disabled');
      setStatus(TEXT.disabled);
      syncUi();
    }

    function reloadDualSubsSoon(reason) {
      if (!state.enabled) {
        setDualSubsEnabled(false, reason || 'setting-change-disabled');
        return;
      }
      app.pendingLoadKey = '';
      app.backoffUntil = 0;
      app.cuesA = [];
      app.cuesB = [];
      stopLoop();
      clearNativeCaptionWindow();
      setPhase('load-start');
      setStatus(TEXT.loading);

      if (!isWatchPage() || !getVideo() || !getPlayer()) {
        scheduleInit(reason || 'setting-change', 0);
        return;
      }

      loadDualSubs(true, reason || 'setting-change');
    }

    function formatDebugText() {
      var snapshot = collectSnapshot();
      return [
        'version=' + snapshot.version,
        'page=' + snapshot.pageType,
        'url=' + snapshot.url,
        'videoId=' + (snapshot.videoId || '-'),
        'phase=' + snapshot.phase,
        'loading=' + snapshot.loading,
        'enabled=' + snapshot.enabled,
        'display-mode=' + snapshot.displayMode,
        'caption-source=' + (snapshot.captionSource || '-'),
        'default-track=' + snapshot.defaultTrackIndex,
        'source=' + (snapshot.source || '-'),
        'tracks=' + snapshot.tracks.length,
        'cues=' + snapshot.cuesA + '/' + snapshot.cuesB,
        'transcript-trigger=' + (snapshot.transcriptTrigger || '-'),
        'fallback=' + (snapshot.fallback || '-'),
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
        if (isWatchPage() && (!getVideo() || !getPlayer() || !uiMountedInBestHost())) {
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
      app.defaultTrackIndex = -1;
      app.lastCaptionSource = '';
      app.lastFallback = '';
      app.lastVideoId = '';
      app.lastSourceName = '';
      app.cuesA = [];
      app.cuesB = [];
      clearFetchDiagnostics();
      app.tracks = [];
      app.trackRetryCount = 0;
      app.pendingLoadKey = '';
      app.translationLanguages = [];
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
      app.defaultTrackIndex = -1;
      app.lastCaptionSource = '';
      app.lastFallback = '';
      app.lastVideoId = videoId || '';
      app.lastSourceName = '';
      app.cuesA = [];
      app.cuesB = [];
      clearFetchDiagnostics();
      app.tracks = [];
      app.trackRetryCount = 0;
      app.pendingLoadKey = '';
      app.translationLanguages = [];
      stopLoop();
      clearNativeCaptionWindow();
      syncUi();
    }

    function loadDualSubs(force, reason) {
      if (!isWatchPage()) return;
      if (!state.enabled) {
        app.loading = false;
        app.pendingLoadKey = '';
        app.cuesA = [];
        app.cuesB = [];
        stopLoop();
        clearNativeCaptionWindow();
        setPhase('disabled');
        setStatus(TEXT.disabled);
        return;
      }

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
      clearFetchDiagnostics();
      app.lastFallback = '';

      ensureCaptionsEnabled();
      setPhase('load-start');
      setStatus(TEXT.loading);

      getBestCaptionData(videoId).then(function (captionData) {
        if (!isActiveRequest(requestId, videoId)) return;

        var tracks = captionData.tracks || [];
        app.tracks = tracks;
        app.defaultTrackIndex = typeof captionData.defaultTrackIndex === 'number' ? captionData.defaultTrackIndex : -1;
        app.lastCaptionSource = captionData.source || '';
        app.lastFallback = '';
        app.translationLanguages = getTranslationLanguages(captionData.playerResponse, tracks, null);
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
        applyRememberedTargetForTrack(selected.track);
        state.sourceTrackIndex = selected.index;
        rememberTargetForTrack(selected.track, state.targetLang);
        saveSettings(state);
        app.pendingLoadKey = [videoId, state.targetLang, state.sourceTrackIndex].join('|');
        app.lastSourceName = formatTrackLabel(selected.track, selected.index);
        app.translationLanguages = getTranslationLanguages(captionData.playerResponse, tracks, selected.track);
        syncUi();

        logger.debug('track pair', {
          sourceLang: selected.track.languageCode || '',
          targetLang: state.targetLang,
          targetMode: 'translated'
        });

        return fetchBestPair(selected.track, null, state.targetLang).then(function (result) {
          if (!isActiveRequest(requestId, videoId)) return;
          if (result.fallback) {
            app.lastFallback = app.lastFallback ? app.lastFallback + ' | ' + result.fallback : result.fallback;
          }

          if (!result.cuesA.length && !result.cuesB.length && canUseDefaultTrackFallback(selected.track, tracks[captionData.defaultTrackIndex], captionData.defaultTrackIndex, selected.index)) {
            var fallbackTrack = tracks[captionData.defaultTrackIndex];
            app.lastFallback = 'default-track:' + selected.index + '->' + captionData.defaultTrackIndex;
            logger.debug('retry with default caption track', {
              from: selected.index,
              to: captionData.defaultTrackIndex,
              targetLang: state.targetLang
            });
            return fetchBestPair(fallbackTrack, null, state.targetLang).then(function (fallbackResult) {
              if (!isActiveRequest(requestId, videoId)) return;
              if (fallbackResult.fallback) {
                app.lastFallback = app.lastFallback ? app.lastFallback + ' | ' + fallbackResult.fallback : fallbackResult.fallback;
              }
              if (fallbackResult.cuesA.length || fallbackResult.cuesB.length) {
                app.lastSourceName = formatTrackLabel(fallbackTrack, captionData.defaultTrackIndex) + ' [fallback]';
                syncUi();
                return applyLoadedCues(fallbackResult);
              }
              app.lastFallback = app.lastFallback + ':empty';
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

        renderCurrentCaption();
        app.loopId = requestAnimationFrame(tick);
      }

      app.loopId = requestAnimationFrame(tick);
    }

    function renderCurrentCaption() {
      if (!state.enabled) {
        clearNativeCaptionWindow();
        return;
      }

      var video = getVideo();
      if (!video) return;

      var mode = normalizeDisplayMode(state.displayMode);
      var textA = mode === 'target' ? '' : findCueText(app.cuesA, video.currentTime);
      var textB = mode === 'source' ? '' : findCueText(app.cuesB, video.currentTime);
      renderNativeCaption(textA, textB);
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
          reloadDualSubsSoon('debug-reload');
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
        setEnabled: function (enabled) {
          setDualSubsEnabled(!!enabled, 'debug-set-enabled');
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
        captionSource: app.lastCaptionSource,
        cuesA: app.cuesA.length,
        cuesB: app.cuesB.length,
        defaultTrackIndex: app.defaultTrackIndex,
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
        fallback: app.lastFallback,
        nativeTimedTextHint: describeNativeTimedTextHint(),
        pageType: isWatchPage() ? 'watch' : 'other',
        phase: app.phase,
        source: app.lastSourceName,
        status: app.status,
        enabled: state.enabled,
        displayMode: state.displayMode,
        smartPosition: state.smartPosition,
        syncNativeStyle: state.syncNativeStyle,
        transcriptTrigger: describeTranscriptTrigger(),
        tracks: tracks,
        targetLang: state.targetLang,
        translationLanguages: app.translationLanguages,
        url: location.href,
        version: SCRIPT_VERSION,
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
    return normalizeSettings(merged);
  }

  function saveSettings(nextState) {
    var normalized = normalizeSettings(nextState);
    GM_setValue(SETTINGS_KEY, {
      debug: !!normalized.debug,
      enabled: !!normalized.enabled,
      panelOpen: false,
      launcherPosition: normalizePosition(normalized.launcherPosition),
      panelPosition: normalizePosition(normalized.panelPosition),
      sourceTrackIndex: normalized.sourceTrackIndex,
      targetLang: normalized.targetLang,
      targetLangBySource: normalized.targetLangBySource,
      displayMode: normalized.displayMode,
      sourceFontSize: normalized.sourceFontSize,
      targetFontSize: normalized.targetFontSize,
      lineGap: normalized.lineGap,
      bottomOffset: normalized.bottomOffset,
      sourceColor: normalized.sourceColor,
      targetColor: normalized.targetColor,
      fontFamily: normalized.fontFamily,
      smartPosition: true,
      syncNativeStyle: true
    });
  }

  function normalizeSettings(input) {
    var output = {};
    var key;
    input = input || {};
    for (key in DEFAULTS) output[key] = DEFAULTS[key];
    for (key in input) output[key] = input[key];

    output.debug = !!output.debug;
    output.enabled = output.enabled !== false;
    output.panelOpen = false;
    output.launcherPosition = normalizePosition(output.launcherPosition);
    output.panelPosition = normalizePosition(output.panelPosition);
    output.sourceTrackIndex = Math.max(0, parseInt(output.sourceTrackIndex || '0', 10) || 0);
    output.targetLang = String(output.targetLang || DEFAULTS.targetLang).trim() || DEFAULTS.targetLang;
    output.targetLangBySource = normalizeTargetLangBySource(output.targetLangBySource);
    output.displayMode = normalizeDisplayMode(output.displayMode);
    output.sourceFontSize = clampNumber(parseFloat(output.sourceFontSize), 16, 56, DEFAULTS.sourceFontSize);
    output.targetFontSize = clampNumber(parseFloat(output.targetFontSize), 16, 56, DEFAULTS.targetFontSize);
    output.lineGap = clampNumber(parseFloat(output.lineGap), 0, 24, DEFAULTS.lineGap);
    output.bottomOffset = clampNumber(parseFloat(output.bottomOffset), 2, 28, DEFAULTS.bottomOffset);
    output.sourceColor = normalizeColor(output.sourceColor, DEFAULTS.sourceColor);
    output.targetColor = normalizeColor(output.targetColor, DEFAULTS.targetColor);
    output.fontFamily = normalizeFontFamily(output.fontFamily);
    output.smartPosition = true;
    output.syncNativeStyle = true;
    return output;
  }

  function normalizeTargetLangBySource(value) {
    var output = {};
    var key;
    if (!value || typeof value !== 'object') return output;
    for (key in value) {
      if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
      var source = String(key || '').trim();
      var target = String(value[key] || '').trim();
      if (source && target) output[source] = target;
    }
    return output;
  }

  function normalizePosition(position) {
    if (!position || typeof position.left !== 'number' || typeof position.top !== 'number') return null;
    return {
      left: Math.max(0, Math.round(position.left)),
      top: Math.max(0, Math.round(position.top))
    };
  }

  function clampNumber(value, min, max, fallback) {
    if (!isFinite(value)) return fallback;
    if (value < min) return min;
    if (value > max) return max;
    return Math.round(value);
  }

  function normalizeColor(value, fallback) {
    var text = String(value || '').trim();
    if (/^#[0-9a-f]{6}$/i.test(text)) return text.toLowerCase();
    return fallback;
  }

  function normalizeSearchText(value) {
    return String(value || '').toLowerCase().replace(/\s+/g, ' ').trim();
  }

  function normalizeFontFamily(value) {
    var text = String(value || '').trim();
    var i;
    for (i = 0; i < FONT_OPTIONS.length; i++) {
      if (FONT_OPTIONS[i].value === text) return text;
    }
    return DEFAULTS.fontFamily;
  }

  function normalizeDisplayMode(value) {
    var text = String(value || '').trim();
    if (text === 'source' || text === 'target' || text === 'dual') return text;
    return DEFAULTS.displayMode;
  }

  function getFontCss(value) {
    var normalized = normalizeFontFamily(value);
    var i;
    for (i = 0; i < FONT_OPTIONS.length; i++) {
      if (FONT_OPTIONS[i].value === normalized) return FONT_OPTIONS[i].css;
    }
    return FONT_OPTIONS[0].css;
  }

  function clearFetchDiagnostics() {
    fetchDiagnostics.source = '';
    fetchDiagnostics.target = '';
  }

  function setFetchDiagnostic(label, value) {
    fetchDiagnostics[label] = value;
  }

  function appendFetchDiagnostic(label, value) {
    fetchDiagnostics[label] = fetchDiagnostics[label] ? fetchDiagnostics[label] + ' | ' + value : value;
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

  function installTimedTextObserver() {
    var pageWindow = getPageWindow();
    var observerKey = '__ydsTimedTextObserver';
    if (!pageWindow || pageWindow[observerKey]) return;

    pageWindow[observerKey] = {
      installedAt: Date.now()
    };

    try {
      if (typeof pageWindow.fetch === 'function') {
        var originalFetch = pageWindow.fetch;
        pageWindow.fetch = function () {
          rememberRequestTimedTextUrl(arguments[0]);
          return originalFetch.apply(this, arguments);
        };
      }
    } catch (err) {
      logger.error('fetch observer install failed', err);
    }

    try {
      if (pageWindow.XMLHttpRequest && pageWindow.XMLHttpRequest.prototype) {
        var originalOpen = pageWindow.XMLHttpRequest.prototype.open;
        pageWindow.XMLHttpRequest.prototype.open = function (method, url) {
          rememberRequestTimedTextUrl(url);
          return originalOpen.apply(this, arguments);
        };
      }
    } catch (xhrErr) {
      logger.error('xhr observer install failed', xhrErr);
    }
  }

  function rememberRequestTimedTextUrl(input) {
    try {
      if (!input) return;
      var url = typeof input === 'string' ? input : (input.url || String(input));
      rememberNativeTimedTextUrl(url);
    } catch (err) {
      logger.debug('remember timedtext request failed', err);
    }
  }

  function collectNativeTimedTextHints() {
    try {
      if (!window.performance || typeof window.performance.getEntriesByType !== 'function') return;
      var entries = window.performance.getEntriesByType('resource') || [];
      var start = Math.max(0, entries.length - 80);
      var i;
      for (i = start; i < entries.length; i++) {
        rememberNativeTimedTextUrl(entries[i] && entries[i].name);
      }
    } catch (err) {
      logger.debug('performance timedtext scan failed', err);
    }
  }

  function rememberNativeTimedTextUrl(rawUrl) {
    if (!rawUrl || String(rawUrl).indexOf('/api/timedtext') === -1) return;

    var parsed;
    try {
      parsed = new URL(rawUrl, location.href);
    } catch (err) {
      return;
    }

    if (parsed.hostname !== 'www.youtube.com' && parsed.hostname !== 'youtube.com') return;

    var videoId = parsed.searchParams.get('v') || '';
    if (!videoId) return;

    var params = extractNativeTimedTextParams(parsed);
    if (!params) return;

    resetNativeTimedTextHints(videoId);

    var hint = {
      lang: parsed.searchParams.get('lang') || '',
      params: params,
      source: 'native-request',
      updatedAt: Date.now()
    };
    nativeTimedTextHints.last = hint;
    if (hint.lang) nativeTimedTextHints.byLang[hint.lang] = hint;
  }

  function resetNativeTimedTextHints(videoId) {
    if (nativeTimedTextHints.videoId === videoId) return;
    nativeTimedTextHints.videoId = videoId;
    nativeTimedTextHints.byLang = {};
    nativeTimedTextHints.last = null;
  }

  function extractNativeTimedTextParams(url) {
    var params = {};
    var hasHint = false;
    var i;
    for (i = 0; i < CONFIG.nativeTimedTextParamKeys.length; i++) {
      var key = CONFIG.nativeTimedTextParamKeys[i];
      if (!url.searchParams.has(key)) continue;
      params[key] = url.searchParams.get(key);
      hasHint = true;
    }
    if (!hasHint || !params.pot) return null;
    return params;
  }

  function describeNativeTimedTextHint() {
    var hint = getNativeTimedTextHint(null);
    if (!hint || !hint.params) return null;
    var keys = [];
    var key;
    for (key in hint.params) keys.push(key);
    return {
      ageMs: Math.max(0, Date.now() - hint.updatedAt),
      keys: keys,
      lang: hint.lang || '',
      videoId: nativeTimedTextHints.videoId || ''
    };
  }

  function getNativeTimedTextHint(track) {
    collectNativeTimedTextHints();

    var currentVideoId = getVideoId();
    if (currentVideoId && nativeTimedTextHints.videoId && nativeTimedTextHints.videoId !== currentVideoId) {
      resetNativeTimedTextHints(currentVideoId);
    }

    if (!track) return nativeTimedTextHints.last;

    var languageCode = track.languageCode || '';
    if (languageCode && nativeTimedTextHints.byLang[languageCode]) return nativeTimedTextHints.byLang[languageCode];

    var prefix = languageCode ? String(languageCode).split('-')[0] : '';
    var key;
    if (prefix) {
      for (key in nativeTimedTextHints.byLang) {
        if (String(key || '').split('-')[0] === prefix) return nativeTimedTextHints.byLang[key];
      }
    }

    return nativeTimedTextHints.last;
  }

  function waitForNativeTimedTextHint(track) {
    if (getNativeTimedTextHint(track)) return Promise.resolve(true);
    if (window.__ydsHarnessShimInstalled) return Promise.resolve(false);

    return waitFor(function () {
      return getNativeTimedTextHint(track);
    }, CONFIG.nativeTimedTextHintWaitMs, 120).then(function (hint) {
      return !!hint;
    });
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
    if (container) container.classList.remove('yds-native-mode');
    var node = document.getElementById(CONFIG.ids.nativeWindow);
    if (node) node.remove();
  }

  function ensureNativeCaptionWindow() {
    var container = getCaptionContainer();
    var player = getPlayer();
    if (!player) return null;

    if (container) container.classList.add('yds-native-mode');
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
      player.appendChild(node);
    } else if (node.parentNode !== player) {
      player.appendChild(node);
    }
    applySubtitleStyle(node);
    return node;
  }

  function applySubtitleStyle(node) {
    node = node || document.getElementById(CONFIG.ids.nativeWindow);
    if (!node) return;

    var lineA = node.querySelector('.yds-native-line-a');
    var lineB = node.querySelector('.yds-native-line-b');
    var nativeStyle = state.syncNativeStyle ? getNativeCaptionStyleHint() : null;
    var useNativeFont = nativeStyle && nativeStyle.fontFamily && normalizeFontFamily(state.fontFamily) === DEFAULTS.fontFamily;
    var useNativeSourceSize = nativeStyle && nativeStyle.fontSize && Number(state.sourceFontSize) === DEFAULTS.sourceFontSize;
    var useNativeTargetSize = nativeStyle && nativeStyle.fontSize && Number(state.targetFontSize) === DEFAULTS.targetFontSize;
    var useNativeSourceColor = nativeStyle && nativeStyle.color && normalizeColor(state.sourceColor, DEFAULTS.sourceColor) === DEFAULTS.sourceColor;
    var fontCss = useNativeFont ? nativeStyle.fontFamily : getFontCss(state.fontFamily);
    var sourceFontSize = useNativeSourceSize ? nativeStyle.fontSize : clampNumber(parseFloat(state.sourceFontSize), 16, 56, DEFAULTS.sourceFontSize) + 'px';
    var targetFontSize = useNativeTargetSize ? nativeStyle.fontSize : clampNumber(parseFloat(state.targetFontSize), 16, 56, DEFAULTS.targetFontSize) + 'px';
    node.style.bottom = getSubtitleBottomPercent() + '%';

    if (lineA) {
      lineA.style.fontFamily = fontCss;
      lineA.style.fontSize = sourceFontSize;
      lineA.style.fontWeight = nativeStyle && nativeStyle.fontWeight ? nativeStyle.fontWeight : '600';
      lineA.style.color = useNativeSourceColor ? nativeStyle.color : normalizeColor(state.sourceColor, DEFAULTS.sourceColor);
      applyNativeBackgroundStyle(lineA, nativeStyle);
    }
    if (lineB) {
      lineB.style.fontFamily = fontCss;
      lineB.style.fontSize = targetFontSize;
      lineB.style.fontWeight = nativeStyle && nativeStyle.fontWeight ? nativeStyle.fontWeight : '600';
      lineB.style.color = nativeStyle && nativeStyle.color && state.displayMode === 'target' ? nativeStyle.color : normalizeColor(state.targetColor, DEFAULTS.targetColor);
      applyNativeBackgroundStyle(lineB, nativeStyle);
      lineB.style.marginTop = lineA && lineA.style.display !== 'none' && lineB.style.display !== 'none'
        ? clampNumber(parseFloat(state.lineGap), 0, 24, DEFAULTS.lineGap) + 'px'
        : '0';
    }
  }

  function getSubtitleBottomPercent() {
    var base = clampNumber(parseFloat(state.bottomOffset), 2, 28, DEFAULTS.bottomOffset);

    var player = getPlayer();
    var controls = player ? player.querySelector(CONFIG.selectors.playerControls) : null;
    if (!player || !controls || !player.clientHeight) return base;

    var style = window.getComputedStyle(controls);
    var controlsVisible = !player.classList.contains('ytp-autohide') &&
      style.display !== 'none' &&
      style.visibility !== 'hidden' &&
      controls.offsetHeight > 0;
    if (!controlsVisible) return base;

    var controlsPercent = Math.ceil((controls.offsetHeight / player.clientHeight) * 100) + 3;
    return Math.max(base, Math.min(28, controlsPercent));
  }

  function getNativeCaptionStyleHint() {
    var node = document.querySelector(CONFIG.selectors.nativeCaptionText);
    if (!node) return null;

    var style = window.getComputedStyle(node);
    var fontSize = parseFloat(style.fontSize);
    var hint = {};
    if (fontSize >= 16 && fontSize <= 72) hint.fontSize = Math.round(fontSize) + 'px';
    if (style.fontFamily) hint.fontFamily = style.fontFamily;
    if (style.fontWeight) hint.fontWeight = style.fontWeight;
    if (style.color && style.color !== 'rgba(0, 0, 0, 0)') hint.color = style.color;
    if (isVisibleBackgroundColor(style.backgroundColor)) hint.backgroundColor = style.backgroundColor;
    return hint;
  }

  function applyNativeBackgroundStyle(line, nativeStyle) {
    if (nativeStyle && nativeStyle.backgroundColor) {
      line.style.backgroundColor = nativeStyle.backgroundColor;
      line.style.borderRadius = '2px';
      line.style.padding = '0 4px';
    } else {
      line.style.backgroundColor = '';
      line.style.borderRadius = '';
      line.style.padding = '';
    }
  }

  function isVisibleBackgroundColor(value) {
    var text = String(value || '').trim();
    if (!text || text === 'transparent') return false;
    if (/rgba\([^)]*,\s*0\)$/i.test(text)) return false;
    return true;
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
    applySubtitleStyle(node);
  }

  function hasRelevantMutation(mutations) {
    var selector = [
      CONFIG.selectors.rootVideo,
      CONFIG.selectors.player,
      CONFIG.selectors.captionContainer,
      CONFIG.selectors.metadataTopRow,
      CONFIG.selectors.metadataActions,
      '#' + CONFIG.ids.uiSlot,
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

  function canUseDefaultTrackFallback(selectedTrack, fallbackTrack, fallbackIndex, selectedIndex) {
    if (fallbackIndex < 0 || fallbackIndex === selectedIndex || !getUsableTrack(fallbackTrack)) return false;
    if (!selectedTrack) return true;

    var selectedLang = selectedTrack.languageCode || '';
    var fallbackLang = fallbackTrack.languageCode || '';
    if (!selectedLang || !fallbackLang) return true;
    return String(selectedLang).split('-')[0] === String(fallbackLang).split('-')[0];
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

  function getCaptionRenderer(playerResponse) {
    if (!playerResponse || !playerResponse.captions) return null;
    return playerResponse.captions.playerCaptionsTracklistRenderer || null;
  }

  function getCaptionTracks(playerResponse) {
    var renderer = getCaptionRenderer(playerResponse);
    return renderer && renderer.captionTracks ? renderer.captionTracks : [];
  }

  function getTranslationLanguages(playerResponse, tracks, sourceTrack) {
    var renderer = getCaptionRenderer(playerResponse);
    var raw = [];
    var i;
    if (renderer && renderer.translationLanguages) raw = raw.concat(renderer.translationLanguages);
    if (sourceTrack && sourceTrack.translationLanguages) raw = raw.concat(sourceTrack.translationLanguages);
    for (i = 0; i < (tracks || []).length; i++) {
      if (tracks[i] && tracks[i].translationLanguages) raw = raw.concat(tracks[i].translationLanguages);
    }
    return normalizeTranslationLanguages(raw, sourceTrack);
  }

  function normalizeTranslationLanguages(raw, sourceTrack) {
    var seen = {};
    var result = [];
    var sourceLang = sourceTrack && sourceTrack.languageCode ? String(sourceTrack.languageCode) : '';
    var i;
    for (i = 0; i < (raw || []).length; i++) {
      var language = raw[i] || {};
      var code = String(language.languageCode || language.lang || language.value || '').trim();
      if (!code || seen[code]) continue;
      if (sourceLang && code === sourceLang) continue;
      seen[code] = true;
      result.push({
        languageCode: code,
        name: readTranslationLanguageName(language) || code
      });
    }
    return result;
  }

  function readTranslationLanguageName(language) {
    if (!language) return '';
    return readText(language.languageName) ||
      readText(language.name) ||
      readText(language.label) ||
      String(language.displayName || language.title || '').trim();
  }

  function readText(value) {
    if (!value) return '';
    if (typeof value === 'string') return value.trim();
    if (value.simpleText) return String(value.simpleText).trim();
    if (value.runs && value.runs.length) {
      return value.runs.map(function (run) {
        return run && run.text ? run.text : '';
      }).join('').trim();
    }
    return '';
  }

  function getDefaultCaptionTrackIndex(playerResponse) {
    var renderer = getCaptionRenderer(playerResponse);
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
    return fetchTrackCues(sourceTrack, null, 'source').then(function (sourceCues) {
      if (sourceCues.length) {
        return fetchTargetPair(sourceCues, targetTrack, sourceTrack, targetLang, '');
      }

      appendFetchDiagnostic('target', 'skip-source-empty');
      return fetchTranscriptFallbackPair(sourceTrack, targetTrack, targetLang).then(function (fallbackResult) {
        if (!fallbackResult.cuesA.length && !fallbackResult.cuesB.length) {
          return {
            cuesA: [],
            cuesB: [],
            fallback: fallbackResult.fallback || ''
          };
        }

        if (!fallbackResult.cuesA.length || fallbackResult.cuesB.length) return fallbackResult;
        return fetchTargetPair(fallbackResult.cuesA, targetTrack, sourceTrack, targetLang, fallbackResult.fallback || '');
      });
    });
  }

  function fetchTargetPair(sourceCues, targetTrack, sourceTrack, targetLang, fallback) {
    var track = targetTrack || sourceTrack;
    var language = targetTrack ? null : targetLang;
    if (!track || !track.baseUrl) {
      appendFetchDiagnostic('target', 'skip-no-target-track');
      return Promise.resolve({
        cuesA: sourceCues || [],
        cuesB: [],
        fallback: fallback || ''
      });
    }

    return fetchTrackCues(track, language, 'target').then(function (targetCues) {
      return {
        cuesA: sourceCues || [],
        cuesB: targetCues || [],
        fallback: fallback || ''
      };
    }).catch(function (err) {
      appendFetchDiagnostic('target', 'target-error-kept-source(' + formatError(err) + ')');
      return {
        cuesA: sourceCues || [],
        cuesB: [],
        fallback: fallback || ''
      };
    });
  }

  function fetchTrackCues(track, targetLang, label) {
    var attempts = [];

    function summarizeUrl(candidate) {
      try {
        var parsed = new URL(candidate.url, location.href);
        var fmt = parsed.searchParams.get('fmt') || 'raw';
        var lang = parsed.searchParams.get('lang') || '';
        var tlang = parsed.searchParams.get('tlang') || '';
        return fmt + ':' + lang + (tlang ? '->' + tlang : '') + (candidate.native ? ':native' : '');
      } catch (err) {
        return 'unknown';
      }
    }

    function summarizeText(text) {
      var compact = String(text || '').replace(/\s+/g, ' ').trim();
      if (!compact) return 'empty';
      return compact.slice(0, 48);
    }

    function tryCandidateSet(candidates, index) {
      if (index >= candidates.length) {
        setFetchDiagnostic(label, attempts.join(' | ') || 'no-attempt');
        return Promise.resolve([]);
      }
      return fetchText(candidates[index].url).then(function (text) {
        var cues = parseCaptionPayload(text);
        attempts.push(summarizeUrl(candidates[index]) + ':ok(' + cues.length + ',' + summarizeText(text) + ')');
        if (cues.length) {
          setFetchDiagnostic(label, attempts.join(' | '));
          return cues;
        }
        return tryCandidateSet(candidates, index + 1);
      }).catch(function (err) {
        attempts.push(summarizeUrl(candidates[index]) + ':err(' + formatError(err) + ')');
        if (err && err.status === 429) {
          setFetchDiagnostic(label, attempts.join(' | '));
          throw err;
        }
        return tryCandidateSet(candidates, index + 1);
      });
    }

    function tryNativeFallback(cause) {
      return waitForNativeTimedTextHint(track).then(function (hasHint) {
        var nativeCandidates = hasHint ? buildTimedTextCandidates(track, targetLang, true) : [];
        if (!nativeCandidates.length) {
          if (cause) throw cause;
          return [];
        }

        return tryCandidateSet(nativeCandidates, 0).then(function (cues) {
          if (cues.length || !cause) return cues;
          throw cause;
        });
      });
    }

    var candidates = buildTimedTextCandidates(track, targetLang, false);
    var hasNativeCandidates = candidates.some(function (candidate) {
      return candidate.native;
    });

    return tryCandidateSet(candidates, 0).then(function (cues) {
      if (cues.length || hasNativeCandidates) return cues;
      return tryNativeFallback(null);
    }).catch(function (err) {
      if (err && err.status === 429 && !hasNativeCandidates) {
        return tryNativeFallback(err);
      }
      throw err;
    });
  }

  function buildTimedTextCandidates(track, targetLang, nativeOnly) {
    var variants = [
      { fmt: 'json3' },
      { fmt: 'srv1' },
      { fmt: 'srv3' },
      { fmt: 'ttml' },
      { fmt: 'vtt' },
      {}
    ];
    var candidates = [];
    var seen = {};
    var hint = getNativeTimedTextHint(track);
    var i;

    if (hint && hint.params) {
      for (i = 0; i < variants.length; i++) {
        addCandidate(mergeObjects(hint.params, mergeTimedTextParams(targetLang, variants[i])), true);
      }
    }

    if (!nativeOnly) {
      for (i = 0; i < variants.length; i++) {
        addCandidate(mergeTimedTextParams(targetLang, variants[i]), false);
      }
    }

    return candidates;

    function addCandidate(params, native) {
      var url = buildTimedTextUrl(track.baseUrl, params);
      if (seen[url]) return;
      seen[url] = true;
      candidates.push({
        native: native,
        url: url
      });
    }
  }

  function mergeTimedTextParams(targetLang, extraParams) {
    var params = {};
    var key;
    if (targetLang) params.tlang = targetLang;
    for (key in extraParams) params[key] = extraParams[key];
    return params;
  }

  function mergeObjects(base, extra) {
    var merged = {};
    var key;
    base = base || {};
    extra = extra || {};
    for (key in base) merged[key] = base[key];
    for (key in extra) merged[key] = extra[key];
    return merged;
  }

  function fetchTranscriptFallbackPair(sourceTrack, targetTrack, targetLang) {
    return fetchTranscriptCues(getVideoId()).then(function (fallbackCues) {
      if (fallbackCues.length) {
        appendFetchDiagnostic('source', 'transcript-api:ok(' + fallbackCues.length + ')');
        return {
          cuesA: fallbackCues,
          cuesB: [],
          fallback: 'transcript-api'
        };
      }

      appendFetchDiagnostic('source', 'transcript-api:empty');
      return fetchTranscriptUiPair(sourceTrack, targetTrack, targetLang);
    }).catch(function (apiErr) {
      appendFetchDiagnostic('source', 'transcript-api:err(' + formatError(apiErr) + ')');
      return fetchTranscriptUiPair(sourceTrack, targetTrack, targetLang);
    }).catch(function (uiErr) {
      appendFetchDiagnostic('source', 'transcript-ui:err(' + formatError(uiErr) + ')');
      return {
        cuesA: [],
        cuesB: [],
        fallback: ''
      };
    });
  }

  function fetchTranscriptUiPair(sourceTrack, targetTrack, targetLang) {
    return withTranscriptPanel(function (panel) {
      var originalTitle = getSelectedTranscriptLanguageTitle(panel) || '';

      return loadTranscriptUiPair(panel, sourceTrack, targetTrack, targetLang).then(function (result) {
        return restoreTranscriptLanguage(panel, originalTitle).then(function () {
          return result;
        }, function () {
          return result;
        });
      }, function (err) {
        return restoreTranscriptLanguage(panel, originalTitle).then(function () {
          throw err;
        }, function () {
          throw err;
        });
      });
    });
  }

  function withTranscriptPanel(task) {
    var panelInfo = null;

    return openTranscriptPanel().then(function (info) {
      panelInfo = info;
      return task(info.panel, info);
    }).finally(function () {
      if (!panelInfo) return;
      if (panelInfo.openedByScript) {
        closeTranscriptPanel(panelInfo.panel);
      } else {
        removeHiddenTranscriptPanelStyle();
      }
    });
  }

  function loadTranscriptUiPair(panel, sourceTrack, targetTrack, targetLang) {
    var sourceInfo = null;
    var targetInfo = null;

    return readTranscriptUiCues(panel, sourceTrack, sourceTrack ? sourceTrack.languageCode : '', true).then(function (value) {
      sourceInfo = value;
      appendFetchDiagnostic('source', 'transcript-ui:ok(' + value.cues.length + ',' + (value.title || 'current') + ')');

      return readTranscriptUiCues(panel, targetTrack, targetTrack ? targetTrack.languageCode : targetLang, false).then(function (targetValue) {
        targetInfo = targetValue;
        if (targetValue.cues.length) {
          appendFetchDiagnostic('target', 'transcript-ui:ok(' + targetValue.cues.length + ',' + (targetValue.title || targetLang || 'target') + ')');
        } else if (targetValue.title) {
          appendFetchDiagnostic('target', 'transcript-ui:empty(' + targetValue.title + ')');
        } else if (targetLang) {
          appendFetchDiagnostic('target', 'transcript-ui:skip(' + targetLang + ')');
        }

        return {
          cuesA: sourceInfo.cues,
          cuesB: targetInfo.cues,
          fallback: 'transcript-ui'
        };
      });
    }).catch(function (err) {
      throw err;
    });
  }

  function readTranscriptUiCues(panel, track, languageCode, required) {
    var options = getTranscriptLanguageOptions(panel);
    var desiredTitle = resolveTranscriptLanguageTitle(options, track, languageCode);
    var currentTitle = getSelectedTranscriptLanguageTitle(panel);
    var hasLanguageOptions = !!options.length;

    if (!desiredTitle && !hasLanguageOptions) {
      if (required) {
        return waitFor(function () {
          var currentCues = extractTranscriptPanelCues(panel);
          return currentCues.length ? currentCues : null;
        }, 3000, 120).then(function (cues) {
          if (!cues || !cues.length) throw new Error('Transcript UI empty: current');
          return {
            cues: cues,
            title: currentTitle || 'current'
          };
        });
      }

      return Promise.resolve({
        cues: [],
        title: ''
      });
    }

    if (!desiredTitle) {
      if (required) {
        if (!track && currentTitle) {
          desiredTitle = currentTitle;
        } else if (currentTitle && transcriptTitleMatches(currentTitle, track, languageCode)) {
          desiredTitle = currentTitle;
        } else {
          throw new Error('Transcript language not found: ' + (track ? getTrackName(track) : (languageCode || 'source')));
        }
      } else {
        return Promise.resolve({
          cues: [],
          title: ''
        });
      }
    }

    return ensureTranscriptLanguage(panel, desiredTitle).then(function () {
      return waitFor(function () {
        var cues = extractTranscriptPanelCues(panel);
        return cues.length ? cues : null;
      }, 3000, 120);
    }).then(function (cues) {
      if (!cues || !cues.length) {
        if (required) throw new Error('Transcript UI empty: ' + desiredTitle);
        return {
          cues: [],
          title: desiredTitle
        };
      }

      return {
        cues: cues,
        title: desiredTitle
      };
    });
  }

  function openTranscriptPanel() {
    var ready = getReadyTranscriptPanel();
    if (ready) {
      return Promise.resolve({
        panel: ready,
        openedByScript: false
      });
    }

    applyHiddenTranscriptPanelStyle();

    return tryOpenTranscriptPanelLoop(Date.now() + 12000).then(function (panel) {
      if (panel) {
        return {
          panel: panel,
          openedByScript: true
        };
      }

      removeHiddenTranscriptPanelStyle();
      throw new Error('Transcript button not found');
    });
  }

  function tryOpenTranscriptPanelLoop(deadline) {
    return tryOpenTranscriptPanelOnce().then(function (panel) {
      if (panel) return panel;
      if (Date.now() >= deadline) return null;
      return wait(250).then(function () {
        return tryOpenTranscriptPanelLoop(deadline);
      });
    });
  }

  function tryOpenTranscriptPanelOnce() {
    var panel = getReadyTranscriptPanel();
    if (panel) return Promise.resolve(panel);

    return tryClickTranscriptAndWait(findTranscriptTrigger(), 3000, 120).then(function (directPanel) {
      if (directPanel) return directPanel;

      var menuButton = document.querySelector(CONFIG.selectors.transcriptMenuButton);
      if (!menuButton) return null;

      menuButton.click();
      return waitFor(function () {
        return findTranscriptMenuItem();
      }, 2000, 100).then(function (menuItem) {
        return tryClickTranscriptAndWait(menuItem, 3000, 120);
      });
    }).then(function (menuPanel) {
      if (menuPanel) return menuPanel;
      return tryClickTranscriptAndWait(document.querySelector(CONFIG.selectors.transcriptDescriptionButton), 3000, 120);
    });
  }

  function tryClickTranscriptAndWait(element, timeoutMs, intervalMs) {
    if (!element) return Promise.resolve(null);
    element.click();
    return waitFor(function () {
      return getReadyTranscriptPanel();
    }, timeoutMs || 3000, intervalMs || 120);
  }

  function getTranscriptPanel() {
    return document.querySelector(CONFIG.selectors.transcriptPanel);
  }

  function getReadyTranscriptPanel() {
    var panels = document.querySelectorAll(CONFIG.selectors.transcriptPanel);
    var i;
    for (i = 0; i < panels.length; i++) {
      if (hasTranscriptContent(panels[i])) return panels[i];
    }
    return null;
  }

  function closeTranscriptPanel(panel) {
    var root = panel || getTranscriptPanel();
    var selector = '#visibility-button ytd-button-renderer button, #visibility-button yt-button-shape button, #dismiss-button button, ytd-engagement-panel-title-header-renderer #dismiss-button button, ytd-engagement-panel-title-header-renderer #dismiss-button, yt-icon-button#dismiss-button button, yt-icon-button#dismiss-button';
    var header = root ? root.querySelector('ytd-engagement-panel-title-header-renderer, #header') : null;
    var button = header ? header.querySelector(selector) : null;
    if (!button && root) button = root.querySelector(selector);
    if (!button) button = document.querySelector(selector);
    if (button) button.click();
    deferHiddenTranscriptStyleRemoval(root);
  }

  function deferHiddenTranscriptStyleRemoval(panel) {
    var started = Date.now();

    function tick() {
      if (isTranscriptPanelClosed(panel) || Date.now() - started >= 1800) {
        removeHiddenTranscriptPanelStyle();
        return;
      }
      setTimeout(tick, 120);
    }

    tick();
  }

  function isTranscriptPanelClosed(panel) {
    var currentPanel = panel || getTranscriptPanel();
    if (!currentPanel || !document.contains(currentPanel) || currentPanel.hidden || currentPanel.getAttribute('aria-hidden') === 'true') return true;
    var style = window.getComputedStyle(currentPanel);
    return style.display === 'none' || style.visibility === 'hidden';
  }

  function applyHiddenTranscriptPanelStyle() {
    if (document.getElementById(CONFIG.ids.hiddenTranscriptStyle)) return;
    var style = document.createElement('style');
    style.id = CONFIG.ids.hiddenTranscriptStyle;
    style.textContent = '#panels ytd-engagement-panel-section-list-renderer[visibility=\"ENGAGEMENT_PANEL_VISIBILITY_EXPANDED\"]{position:fixed!important;opacity:0!important;pointer-events:none!important}';
    (document.head || document.documentElement || document.body).appendChild(style);
  }

  function removeHiddenTranscriptPanelStyle() {
    var node = document.getElementById(CONFIG.ids.hiddenTranscriptStyle);
    if (node) node.remove();
  }

  function hasTranscriptContent(panel) {
    if (!panel || panel.hidden || panel.getAttribute('aria-hidden') === 'true') return false;
    return !!panel.querySelector(CONFIG.selectors.transcriptRenderer + ', ' + CONFIG.selectors.transcriptSegment);
  }

  function findTranscriptTrigger() {
    var chipTrigger = findTranscriptChipButton();
    if (chipTrigger) return chipTrigger;
    return findTranscriptMenuItem();
  }

  function findTranscriptChipButton() {
    var items = document.querySelectorAll(CONFIG.selectors.transcriptChipButton + ', [aria-label], [title]');
    var i;
    for (i = 0; i < items.length; i++) {
      if (matchTranscriptLabel(items[i])) return items[i];
    }
    return null;
  }

  function findTranscriptMenuItem() {
    var items = document.querySelectorAll(CONFIG.selectors.transcriptMenuItems);
    var i;
    for (i = 0; i < items.length; i++) {
      if (matchTranscriptLabel(items[i])) return items[i];
    }
    return null;
  }

  function matchTranscriptLabel(node) {
    if (!node) return false;
    var text = [node.getAttribute && node.getAttribute('aria-label'), node.getAttribute && node.getAttribute('title'), node.textContent].join(' ');
    return TRANSCRIPT_LABEL_PATTERN.test(String(text || '').trim());
  }

  function describeTranscriptTrigger() {
    var trigger = findTranscriptTrigger();
    if (!trigger) return 'none';

    var parts = [];
    var tagName = trigger.tagName ? trigger.tagName.toLowerCase() : 'node';
    parts.push(tagName);

    var ariaLabel = trigger.getAttribute ? trigger.getAttribute('aria-label') : '';
    var title = trigger.getAttribute ? trigger.getAttribute('title') : '';
    var text = String(trigger.textContent || '').replace(/\s+/g, ' ').trim();
    var label = ariaLabel || title || text || '';
    if (label) parts.push(label.slice(0, 48));

    return parts.join(':');
  }

  function getTranscriptRendererData(panel) {
    if (!panel) return null;
    var transcriptRenderer = panel.querySelector(CONFIG.selectors.transcriptRenderer);
    if (!transcriptRenderer) return null;
    if (transcriptRenderer.__data && transcriptRenderer.__data.data) return transcriptRenderer.__data.data;
    if (transcriptRenderer.data) return transcriptRenderer.data;
    if (transcriptRenderer.__dataHost && transcriptRenderer.__dataHost.__data) return transcriptRenderer.__dataHost.__data;
    return null;
  }

  function extractTranscriptPanelCues(panel) {
    var cues = extractTranscriptPanelCuesFromData(panel);
    if (cues.length) return cues;
    return extractTranscriptPanelCuesFromDom(panel);
  }

  function extractTranscriptPanelCuesFromData(panel) {
    var transcriptData = getTranscriptRendererData(panel);
    var segments = transcriptData && transcriptData.content && transcriptData.content.transcriptSearchPanelRenderer && transcriptData.content.transcriptSearchPanelRenderer.body && transcriptData.content.transcriptSearchPanelRenderer.body.transcriptSegmentListRenderer ? transcriptData.content.transcriptSearchPanelRenderer.body.transcriptSegmentListRenderer.initialSegments : null;
    var cues = [];
    var i;

    if (!segments || !segments.length) return cues;

    for (i = 0; i < segments.length; i++) {
      var item = segments[i] && segments[i].transcriptSegmentRenderer;
      if (!item) continue;

      var startMs = parseInt(item.startMs || '0', 10);
      var endMs = parseInt(item.endMs || '0', 10);
      var text = readRunsText(item.snippet && item.snippet.runs);
      if (!text) continue;

      cues.push({
        start: startMs / 1000,
        end: (endMs || startMs + 5000) / 1000,
        text: text
      });
    }

    normalizeCueEnds(cues);
    return cues;
  }

  function extractTranscriptPanelCuesFromDom(panel) {
    var renderers = panel.querySelectorAll(CONFIG.selectors.transcriptSegment);
    var cues = [];
    var i;

    for (i = 0; i < renderers.length; i++) {
      var renderer = renderers[i];
      var textNode = renderer.querySelector(CONFIG.selectors.transcriptText);
      var text = textNode ? String(textNode.textContent || '').trim() : '';
      var targetId = renderer.getAttribute('target-id');
      var startMs = 0;
      var endMs = 0;
      var parts;
      if (!text) continue;

      if (!targetId && renderer.data && renderer.data.targetId) targetId = renderer.data.targetId;
      if (!targetId && renderer.__data && renderer.__data.data && renderer.__data.data.targetId) targetId = renderer.__data.data.targetId;

      if (renderer.tagName && renderer.tagName.toLowerCase() === 'transcript-segment-view-model') {
        startMs = parseTranscriptTimeToMs(renderer.querySelector(CONFIG.selectors.transcriptTime));
      } else if (targetId) {
        parts = targetId.split('.');
        startMs = parseInt(parts[parts.length - 2] || '0', 10);
        endMs = parseInt(parts[parts.length - 1] || '0', 10);
      } else {
        startMs = parseTranscriptTimeToMs(renderer.querySelector(CONFIG.selectors.transcriptTime));
      }

      cues.push({
        start: startMs / 1000,
        end: (endMs || startMs + 5000) / 1000,
        text: text.replace(/\s+/g, ' ').trim()
      });
    }

    normalizeCueEnds(cues);
    return cues;
  }

  function normalizeCueEnds(cues) {
    var i;
    for (i = 0; i < cues.length; i++) {
      if (cues[i].end > cues[i].start) continue;
      cues[i].end = i + 1 < cues.length ? cues[i + 1].start : cues[i].start + 5;
    }
  }

  function parseTranscriptTimeToMs(node) {
    var text = node ? String(node.textContent || '').trim() : '';
    if (!text) return 0;

    var parts = text.split(':');
    var nums = [];
    var i;
    for (i = 0; i < parts.length; i++) nums.push(parseInt(parts[i] || '0', 10) || 0);
    if (nums.length === 3) return ((nums[0] * 3600) + (nums[1] * 60) + nums[2]) * 1000;
    if (nums.length === 2) return ((nums[0] * 60) + nums[1]) * 1000;
    return (nums[0] || 0) * 1000;
  }

  function getTranscriptLanguageOptions(panel) {
    var transcriptData = getTranscriptRendererData(panel);
    var subMenuItems = transcriptData && transcriptData.content && transcriptData.content.transcriptSearchPanelRenderer && transcriptData.content.transcriptSearchPanelRenderer.footer && transcriptData.content.transcriptSearchPanelRenderer.footer.transcriptFooterRenderer && transcriptData.content.transcriptSearchPanelRenderer.footer.transcriptFooterRenderer.languageMenu && transcriptData.content.transcriptSearchPanelRenderer.footer.transcriptFooterRenderer.languageMenu.sortFilterSubMenuRenderer ? transcriptData.content.transcriptSearchPanelRenderer.footer.transcriptFooterRenderer.languageMenu.sortFilterSubMenuRenderer.subMenuItems : null;
    var options = [];
    var i;

    if (!subMenuItems || !subMenuItems.length) return options;
    for (i = 0; i < subMenuItems.length; i++) {
      options.push({
        title: subMenuItems[i].title || '',
        selected: !!subMenuItems[i].selected
      });
    }
    return options;
  }

  function getSelectedTranscriptLanguageTitle(panel) {
    var options = getTranscriptLanguageOptions(panel);
    var i;
    for (i = 0; i < options.length; i++) {
      if (options[i].selected && options[i].title) return options[i].title;
    }

    var selectors = ['#label-text.yt-dropdown-menu', '[aria-selected=\"true\"]', '.iron-selected'];
    for (i = 0; i < selectors.length; i++) {
      var node = panel.querySelector(selectors[i]);
      if (node && String(node.textContent || '').trim()) return String(node.textContent || '').trim();
    }
    return '';
  }

  function ensureTranscriptLanguage(panel, title) {
    var current = getSelectedTranscriptLanguageTitle(panel);
    if (!title || normalizeLangLabel(current) === normalizeLangLabel(title)) {
      return Promise.resolve(false);
    }

    var dropdownButton = panel.querySelector(CONFIG.selectors.transcriptLanguageDropdown);
    if (!dropdownButton) {
      return waitFor(function () {
        return panel.querySelector(CONFIG.selectors.transcriptLanguageDropdown);
      }, 2000, 120).then(function (button) {
        if (!button) throw new Error('Transcript language selector not found');
        return switchTranscriptLanguageWithButton(panel, button, title);
      });
    }

    return switchTranscriptLanguageWithButton(panel, dropdownButton, title);
  }

  function switchTranscriptLanguageWithButton(panel, button, title) {
    button.click();
    return wait(300).then(function () {
      var listboxes = document.querySelectorAll(CONFIG.selectors.transcriptVisibleListboxes);
      var i;
      var j;

      for (i = 0; i < listboxes.length; i++) {
        var items = listboxes[i].querySelectorAll('tp-yt-paper-item, yt-formatted-string');
        for (j = 0; j < items.length; j++) {
          if (normalizeLangLabel(items[j].textContent) === normalizeLangLabel(title)) {
            var target = items[j].closest ? items[j].closest('tp-yt-paper-item') : null;
            (target || items[j]).click();
            return wait(900).then(function () {
              return waitFor(function () {
                return normalizeLangLabel(getSelectedTranscriptLanguageTitle(panel)) === normalizeLangLabel(title) ? true : null;
              }, 2500, 120).then(function (matched) {
                if (!matched) throw new Error('Transcript language switch timed out: ' + title);
                return true;
              });
            });
          }
        }
      }

      document.body.click();
      throw new Error('Transcript language option not found: ' + title);
    });
  }

  function restoreTranscriptLanguage(panel, title) {
    if (!panel || !title) return Promise.resolve();
    var current = getSelectedTranscriptLanguageTitle(panel);
    if (!current || normalizeLangLabel(current) === normalizeLangLabel(title)) return Promise.resolve();
    return ensureTranscriptLanguage(panel, title).catch(function () {});
  }

  function resolveTranscriptLanguageTitle(options, track, languageCode) {
    var aliases = getLanguageAliases(languageCode, track ? getTrackName(track) : '');
    var i;
    var j;

    if (track) {
      var exactName = normalizeLangLabel(getTrackName(track));
      for (i = 0; i < options.length; i++) {
        if (normalizeLangLabel(options[i].title) === exactName) return options[i].title;
      }
    }

    for (i = 0; i < aliases.length; i++) {
      var alias = normalizeLangLabel(aliases[i]);
      if (!alias) continue;
      for (j = 0; j < options.length; j++) {
        var optionTitle = normalizeLangLabel(options[j].title);
        if (optionTitle === alias || optionTitle.indexOf(alias) !== -1 || alias.indexOf(optionTitle) !== -1) return options[j].title;
      }
    }

    return '';
  }

  function transcriptTitleMatches(title, track, languageCode) {
    return !!resolveTranscriptLanguageTitle([{ title: title, selected: true }], track, languageCode);
  }

  function getLanguageAliases(languageCode, displayName) {
    var aliases = [];
    var normalized = String(languageCode || '').toLowerCase();
    var prefix = normalized.split('-')[0];

    if (displayName) aliases.push(displayName);
    if (languageCode) aliases.push(languageCode);
    if (prefix && prefix !== normalized) aliases.push(prefix);

    if (normalized === 'zh-hant') {
      aliases.push('中文（繁體字）', '繁體中文', '繁体中文', '繁體字', '繁体', 'traditional chinese', 'traditional');
    } else if (normalized === 'zh-hans') {
      aliases.push('中文（简体）', '中文（簡體）', '简体中文', '簡體中文', '简体', '簡體', 'simplified chinese', 'simplified');
    } else if (prefix === 'zh') {
      aliases.push('中文', 'chinese');
    } else if (prefix === 'en') {
      aliases.push('English', '英文', '英语', '英語');
    } else if (prefix === 'ja') {
      aliases.push('Japanese', '日文', '日语', '日語', '日本語');
    } else if (prefix === 'ko') {
      aliases.push('Korean', '韩文', '韓文', '韩语', '韓語', '한국어');
    } else if (prefix === 'es') {
      aliases.push('Spanish', 'Español', '西班牙语', '西班牙語');
    }

    return aliases;
  }

  function normalizeLangLabel(value) {
    return String(value || '').toLowerCase().replace(/\s+/g, '').replace(/[()（）._-]/g, '');
  }

  function wait(delayMs) {
    return new Promise(function (resolve) {
      setTimeout(resolve, delayMs);
    });
  }

  function waitFor(getValue, timeoutMs, intervalMs) {
    var started = Date.now();

    return new Promise(function (resolve) {
      function tick() {
        var value = null;
        try {
          value = getValue();
        } catch (err) {
          value = null;
        }

        if (value) {
          resolve(value);
          return;
        }

        if (Date.now() - started >= timeoutMs) {
          resolve(null);
          return;
        }

        setTimeout(tick, intervalMs);
      }

      tick();
    });
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
