// ==UserScript==
// @name         YouTube Dual Native Subs
// @namespace    https://github.com/luismusaj646-prog/dual-subtitles
// @version      4.2.45
// @description  Native dual subtitles for YouTube
// @license      GPL-3.0-only
// @homepageURL  https://github.com/luismusaj646-prog/dual-subtitles
// @supportURL   https://github.com/luismusaj646-prog/dual-subtitles/issues
// @match        https://www.youtube.com/*
// @run-at       document-idle
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_xmlhttpRequest
// @grant        unsafeWindow
// @connect      www.youtube.com
// @connect      translate.googleapis.com
// ==/UserScript==

(function () {
  'use strict';

  var SCRIPT_NAME = 'yt-dual-subs';
  var SCRIPT_VERSION = '4.2.45';
  var SETTINGS_KEY = 'yds_native_settings_v2';
  var RUNTIME_KEY = '__ydsRuntime';
  var DEBUG_API_KEY = '__ydsDebug';
  var LOG_PREFIX = '[tm-script][' + SCRIPT_NAME + ']';
  var TRANSCRIPT_LABEL_PATTERN = /(show transcript|open transcript|transcript|字幕记录|字幕記錄|文字稿|逐字稿|转录稿|轉錄稿|transkript anzeigen|transkript öffnen|mostrar transcripci[oó]n|abrir transcripci[oó]n|показать расшифровку видео|расшифровка)/i;

  var CONFIG = {
    initDelayMs: 140,
    domDebounceMs: 80,
    retryDelayMs: 700,
    routePollMs: 600,
    runtimeHealthMinIntervalMs: 2500,
    runtimeHealthMaxRecoveriesPerVideo: 4,
    runtimeRenderStaleMs: 1800,
    runtimeSilentReloadMinIntervalMs: 4500,
    maxTrackRetries: 8,
    maxEmptyCueRetries: 2,
    emptyCueRetryDelayMs: 1200,
    maxTargetCueRetries: 2,
    targetCueRetryDelayMs: 700,
    targetRecoveryRetryDelayMs: 2800,
    targetRecoveryMaxRetries: 2,
    captionEnableFindRetryMs: 250,
    captionEnableFindTimeoutMs: 5000,
    captionEnableRetryMs: 1600,
    captionEnableMaxClicksPerVideo: 2,
    sourceNativeHintRetryMs: 3000,
    nativeTimedTextHintWaitMs: 1600,
    nativeTimedTextWarmupWaitMs: 250,
    playerCaptionPrimeHintWaitMs: 250,
    playerCaptionPrimeMinIntervalMs: 5000,
    playerCaptionPrimeMaxRetries: 2,
    playerCaptionPrimeRetryMs: 900,
    nativeTranslationRetriggerDelayMs: 350,
    nativeTranslationRetriggerMaxAttempts: 1,
    nativeMenuTriggerDelayMs: 1400,
    nativeMenuTriggerMaxAttempts: 1,
    nativeMenuTriggerWaitMs: 1800,
    nativeMenuTriggerStepMs: 240,
    nativeMenuTriggerAfterCycleMs: 900,
    nativeMenuTriggerOpenRetries: 2,
    machineTranslateFallbackEnabled: true,
    machineTranslateTimeoutMs: 3500,
    machineTranslateCacheLimit: 400,
    subtitleHiddenControlsBottomPercent: 2,
    nativeTimedTextPerformanceScanLimit: 500,
    nativeCaptionWarmupMinIntervalMs: 5000,
    cueTimeToleranceMs: 180,
    cueGapHoldMs: 260,
    asrSyncMaxCenterDistanceMs: 750,
    asrSyncMinMatchRatio: 0.7,
    renderStyleRefreshMs: 600,
    cueCacheTtlMs: 30 * 60 * 1000,
    cueCacheLimit: 20,
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
      settingsButton: '.ytp-settings-button',
      playerMenuItem: '.ytp-menuitem, [role="menuitem"], [role="menuitemcheckbox"], .ytp-panel-menu [tabindex], tp-yt-paper-item',
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
    targetColor: '#E344FC',
    fontFamily: 'system',
    smartPosition: true,
    syncNativeStyle: false,
    machineTranslateFallback: true,
    machineTranslateFallbackUserSet: false
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
    waitingCues: '\u7B49\u5F85 YouTube \u5B57\u5E55\u6570\u636E\u7A33\u5B9A',
    loading: '\u6B63\u5728\u52A0\u8F7D...',
    targetLoading: '\u8BD1\u6587\u52A0\u8F7D\u4E2D {seconds}s',
    targetLoadingStatus: '\u539F\u6587\u5DF2\u663E\u793A\uFF0C\u8BD1\u6587\u52A0\u8F7D\u4E2D',
    noTrack: '\u65E0\u53EF\u7528\u5B57\u5E55\u8F68',
    noTrackDetail: '\u8FD9\u4E2A\u89C6\u9891\u6CA1\u6709\u53EF\u7528\u5B57\u5E55\u8F68',
    noCue: '\u8FD9\u6761\u5B57\u5E55\u8F68\u6682\u65F6\u6CA1\u6709\u8FD4\u56DE\u53EF\u7528\u5185\u5BB9',
    nativeReady: '\u53CC\u5B57\u5E55\u5DF2\u542F\u7528',
    nativeTargetFallbackReady: '\u53CC\u5B57\u5E55\u5DF2\u542F\u7528\uFF08\u8BD1\u6587\u6765\u81EA YouTube \u539F\u751F\u5B57\u5E55\uFF09',
    machineTranslateFallback: '\u673A\u7FFB\u4F18\u5148',
    machineTranslateReady: '\u673A\u7FFB\u4F18\u5148\u5DF2\u542F\u7528\uFF0CYouTube \u8BD1\u6587\u4F5C\u4E3A\u515C\u5E95',
    machineTranslating: '\u673A\u7FFB\u4E2D...',
    machinePromptStatus: 'YouTube \u8BD1\u6587\u53D7\u9650',
    machinePromptAccept: '\u672C\u89C6\u9891\u542F\u7528\u673A\u7FFB',
    machinePromptDismiss: '\u6682\u4E0D\u4F7F\u7528',
    sourceOnly: '\u539F\u6587\u53EF\u7528\uFF0C\u8BD1\u6587\u6682\u65F6\u4E0D\u53EF\u7528',
    rateLimited: '\u7FFB\u8BD1\u88AB\u9650\u6D41\uFF0C60\u79D2\u540E\u518D\u8BD5',
    rateLimitedShort: '\u7FFB\u8BD1\u88AB\u9650\u6D41\uFF0C{seconds}\u79D2\u540E\u81EA\u52A8\u91CD\u8BD5',
    rateLimitedWithSource: '\u539F\u6587\u53EF\u7528\uFF0CYouTube \u6682\u65F6\u9650\u5236\u8BD1\u6587\uFF0C{seconds}\u79D2\u540E\u81EA\u52A8\u91CD\u8BD5',
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
    '.ytp-caption-window-container.yds-native-mode .caption-window{opacity:0 !important;pointer-events:none !important;}' +
    '.html5-video-player .yds-native-window{' +
      'position:absolute;left:0;right:0;bottom:9%;z-index:63;padding:0 24px;box-sizing:border-box;' +
      'display:flex;flex-direction:column;align-items:center;text-align:center;pointer-events:none;' +
      'text-shadow:0 2px 4px rgba(0,0,0,.85);' +
    '}' +
    '.html5-video-player.yds-menu-triggering .ytp-popup{opacity:0 !important;pointer-events:none !important;}' +
    '.html5-video-player .yds-native-line{' +
      'display:block;max-width:100%;min-width:0;box-sizing:border-box;font:600 28px/1.24 system-ui,sans-serif;' +
      'white-space:nowrap;word-break:normal;overflow:hidden;text-overflow:ellipsis;overflow-wrap:normal;' +
    '}' +
    '.html5-video-player .yds-native-line-b{margin-top:6px;color:#E344FC;}' +
    '.html5-video-player .yds-machine-prompt{' +
      'display:none;align-items:center;justify-content:center;gap:8px;margin-top:8px;pointer-events:auto;' +
      'font:500 13px/18px Roboto,Arial,sans-serif;text-shadow:none;color:#fff;' +
    '}' +
    '.html5-video-player .yds-machine-prompt-label{' +
      'padding:5px 8px;border-radius:4px;background:rgba(0,0,0,.72);' +
    '}' +
    '.html5-video-player .yds-machine-prompt button{' +
      'border:0;border-radius:4px;padding:5px 9px;background:rgba(255,255,255,.92);color:#0f0f0f;cursor:pointer;' +
      'font:500 13px/18px Roboto,Arial,sans-serif;' +
    '}' +
    '.html5-video-player .yds-machine-prompt button:hover{background:#fff;}' +
    '.html5-video-player .yds-machine-prompt .yds-machine-prompt-dismiss{' +
      'background:rgba(0,0,0,.64);color:#fff;' +
    '}'
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
      backoffSourceAvailable: false,
      captionEnableClickAt: 0,
      captionEnableClickCount: 0,
      captionEnableClickKey: '',
      captionEnableStartedAt: 0,
      cueCache: {},
      cueCacheOrder: [],
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
      loopLastRenderAt: 0,
      loopLastRenderVideoTime: 0,
      loopStartedAt: 0,
      loopStartCount: 0,
      loopStopReason: '',
      loopTickAt: 0,
      pendingLoadKey: '',
      phase: 'boot',
      runtimeHealthAt: 0,
      runtimeHealthCount: 0,
      runtimeHealthKey: '',
      runtimeHealthReloadAt: 0,
      runtimeHealthReloadCount: 0,
      runtimeHealthStatus: 'ok',
      status: '',
      targetPending: false,
      targetPendingStartedAt: 0,
      targetCueRetryCount: 0,
      targetRetryAt: 0,
      targetRecoveryRetryCount: 0,
      targetRecoveryRetryKey: '',
      targetRecoveryRetryAt: 0,
      targetRecoveryRetryStatus: 'off',
      nativeWarmupAt: 0,
      nativeWarmupKey: '',
      nativeTargetFallback: false,
      nativeTargetFallbackPreserve: false,
      nativeTargetFallbackReason: '',
      nativeTargetFallbackText: '',
      nativeDomObserver: null,
      nativeDomObserverAt: 0,
      nativeDomObserverStatus: 'off',
      nativeTranslationTriggerCount: 0,
      nativeTranslationTriggerDetail: '',
      nativeTranslationTriggerKey: '',
      nativeTranslationTriggerStatus: '',
      nativeMenuTriggerCount: 0,
      nativeMenuTriggerDetail: '',
      nativeMenuTriggerKey: '',
      nativeMenuTriggerTrace: '',
      nativeMenuTriggerStatus: '',
      machineTranslateActive: false,
      machineTranslateReason: '',
      machineTranslateSourceLang: '',
      machineTranslateTargetLang: '',
      machineTranslateCache: {},
      machineTranslateCacheOrder: [],
      machineTranslatePending: {},
      machineTranslateFailed: {},
      machineTranslateLast: '',
      machineTranslateMode: '',
      machinePromptStatus: 'off',
      machinePromptKey: '',
      machinePromptReason: '',
      machinePromptDecisions: {},
      lastLoadTiming: {},
      playerApiPrimeAt: 0,
      playerApiPrimeDetail: '',
      playerApiPrimeKey: '',
      playerApiPrimeOk: false,
      playerApiPrimeRetryCount: 0,
      playerApiPrimeStatus: '',
      translationLanguages: [],
      asrSyncStatus: 'off',
      asrSyncDetail: '',
      staleTimerClearedCount: 0,
      staleTimerClearedStatus: '',
      timers: {
        init: 0,
        urlPoll: 0,
        backoff: 0,
        captionEnable: 0,
        targetRecoveryRetry: 0,
        nativeMenuTrigger: 0,
        nativeTranslationTrigger: 0,
        playerApiPrime: 0
      },
      lastCueA: null,
      lastCueB: null,
      tracks: [],
      trackRetryCount: 0,
      emptyCueRetryCount: 0,
      teardown: [],
      observer: null,
      videoEpoch: 0
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
      machineTranslateToggle: null,
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
      clearBackoffTimer();
      clearTimeout(app.timers.captionEnable);
      resetTargetRecoveryRetryState();
      clearAsyncTimers('destroy');
      stopNativeCaptionObserver('destroy');
      if (app.observer) app.observer.disconnect();
      stopLoop('destroy');
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
        state.targetLang = String(ui.targetLang.value || inferDefaultTargetLang()).trim() || DEFAULTS.targetLang;
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

      var machineRow = document.createElement('label');
      machineRow.className = 'yds-toggle';
      ui.machineTranslateToggle = document.createElement('input');
      ui.machineTranslateToggle.type = 'checkbox';
      ui.machineTranslateToggle.setAttribute('data-yds-control', 'machine-translate-fallback');
      ui.machineTranslateToggle.addEventListener('change', function () {
        if (!CONFIG.machineTranslateFallbackEnabled) {
          state.machineTranslateFallback = false;
          state.machineTranslateFallbackUserSet = false;
          ui.machineTranslateToggle.checked = false;
          saveSettings(state);
          clearMachineTranslateFallback();
          clearMachinePromptState();
          renderCurrentCaption();
          syncUi();
          return;
        }
        state.machineTranslateFallback = !!ui.machineTranslateToggle.checked;
        state.machineTranslateFallbackUserSet = true;
        saveSettings(state);
        clearMachineTranslateFallback();
        clearMachinePromptState();
        if (state.machineTranslateFallback) {
          reloadDualSubsSoon('machine-translate-enabled');
        } else {
          renderCurrentCaption();
          syncUi();
        }
      });
      var machineText = document.createElement('span');
      machineText.textContent = TEXT.machineTranslateFallback;
      machineRow.appendChild(ui.machineTranslateToggle);
      machineRow.appendChild(machineText);
      advanced.appendChild(machineRow);

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
      if (ui.machineTranslateToggle) {
        ui.machineTranslateToggle.checked = !!(CONFIG.machineTranslateFallbackEnabled && state.machineTranslateFallback);
        ui.machineTranslateToggle.disabled = !CONFIG.machineTranslateFallbackEnabled;
      }
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
      if (!remembered && fallbackToDefault) remembered = inferDefaultTargetLang();
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
      clearBackoffTimer();
      app.backoffUntil = 0;
      app.backoffSourceAvailable = false;
      app.emptyCueRetryCount = 0;
      app.targetCueRetryCount = 0;
      app.videoEpoch += 1;
      clearAsyncTimers(reason || 'disabled');
      resetTargetRecoveryRetryState('disabled');
      app.loading = false;
      app.cuesA = [];
      app.cuesB = [];
      app.lastCueA = null;
      app.lastCueB = null;
      clearTargetPending();
      clearNativeTargetFallback();
      resetNativeTranslationTriggerState();
      clearMachineTranslateFallback();
      clearMachinePromptState();
      clearAsrSyncStatus();
      stopLoop('disabled');
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
      clearBackoffTimer();
      app.backoffUntil = 0;
      app.backoffSourceAvailable = false;
      app.emptyCueRetryCount = 0;
      app.targetCueRetryCount = 0;
      app.videoEpoch += 1;
      clearAsyncTimers(reason || 'reload');
      resetTargetRecoveryRetryState(reason || 'reload');
      app.cuesA = [];
      app.cuesB = [];
      app.lastCueA = null;
      app.lastCueB = null;
      clearTargetPending();
      clearNativeTargetFallback();
      resetNativeTranslationTriggerState();
      clearMachineTranslateFallback();
      clearMachinePromptState();
      clearAsrSyncStatus();
      stopLoop(reason || 'reload');
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
        'source-kind=' + (snapshot.sourceKind || '-'),
        'tracks=' + snapshot.tracks.length,
        'cues=' + snapshot.cuesA + '/' + snapshot.cuesB,
        'asr-sync=' + (snapshot.asrSync || '-'),
        'asr-sync-detail=' + (snapshot.asrSyncDetail || '-'),
        'target-retry=' + snapshot.targetCueRetryCount + ',next=' + snapshot.targetRetryRemainingMs + 'ms',
        'target-recovery=' + (snapshot.targetRecoveryRetry || '-'),
        'timing=' + formatTimingText(snapshot.timing),
        'runtime-health=' + (snapshot.runtimeHealth || '-'),
        'runtime-heartbeat=' + (snapshot.runtimeHeartbeat || '-'),
        'native-dom-observer=' + (snapshot.nativeDomObserver || '-'),
        'stale-timer-cleared=' + (snapshot.staleTimerCleared || '-'),
        'transcript-trigger=' + (snapshot.transcriptTrigger || '-'),
        'fallback=' + (snapshot.fallback || '-'),
        'player-api-prime=' + (snapshot.playerApiPrime || '-'),
        'native-translation-trigger=' + (snapshot.nativeTranslationTrigger || '-'),
        'native-menu-trigger=' + (snapshot.nativeMenuTrigger || '-'),
        'native-menu-trace=' + (snapshot.nativeMenuTriggerTrace || '-'),
        'translation-request=' + (snapshot.translationRequest || '-'),
        'translation-result=' + (snapshot.translationResult || '-'),
        'native-target-fallback=' + formatNativeTargetFallbackStatus(snapshot),
        'native-dom=' + formatNativeDomTextStatus(snapshot),
        'machine-prompt=' + formatMachinePromptStatus(snapshot),
        'machine-translation=' + formatMachineTranslationStatus(snapshot),
        'fetch-source=' + (snapshot.fetch.source || '-'),
        'fetch-target=' + (snapshot.fetch.target || '-'),
        'dom=video:' + snapshot.dom.video + ',player:' + snapshot.dom.player + ',captions:' + snapshot.dom.captionContainer,
        'injected=launcher:' + snapshot.dom.launcher + ',panel:' + snapshot.dom.panel + ',native:' + snapshot.dom.nativeWindow
      ].join('\n');
    }

    function formatTimingText(timing) {
      if (!timing || !timing.startedAt) return '-';
      function ms(value) {
        return typeof value === 'number' ? value + 'ms' : '-';
      }
      return [
        'elapsed:' + ms(timing.elapsedMs),
        'tracks:' + ms(timing.captionDataMs),
        'source:' + ms(timing.sourcePreviewMs),
        'target:' + ms(timing.targetReadyMs),
        'retry:' + (timing.targetEmptyRetries || 0),
        'warm:' + ms(timing.nativeWarmupMs)
      ].join(',');
    }

    function resetLoadTiming(reason) {
      app.lastLoadTiming = {
        reason: reason || '',
        startedAt: Date.now()
      };
    }

    function markLoadTiming(field, value) {
      if (!app.lastLoadTiming || !app.lastLoadTiming.startedAt) return;
      app.lastLoadTiming[field] = typeof value === 'number' ? value : Math.max(0, Date.now() - app.lastLoadTiming.startedAt);
    }

    function incrementLoadTiming(field) {
      if (!app.lastLoadTiming || !app.lastLoadTiming.startedAt) return;
      app.lastLoadTiming[field] = (app.lastLoadTiming[field] || 0) + 1;
    }

    function getLoadTimingSnapshot() {
      var timing = {};
      var key;
      if (!app.lastLoadTiming || !app.lastLoadTiming.startedAt) return timing;
      for (key in app.lastLoadTiming) timing[key] = app.lastLoadTiming[key];
      timing.elapsedMs = Math.max(0, Date.now() - app.lastLoadTiming.startedAt);
      return timing;
    }

    function clearBackoffTimer() {
      if (app.timers.backoff) clearInterval(app.timers.backoff);
      app.timers.backoff = 0;
    }

    function clearTargetPending() {
      app.targetPending = false;
      app.targetPendingStartedAt = 0;
      app.targetRetryAt = 0;
    }

    function markTargetPending() {
      app.targetPending = true;
      if (!app.targetPendingStartedAt) app.targetPendingStartedAt = Date.now();
    }

    function clearTargetRecoveryRetry(reason) {
      clearTimeout(app.timers.targetRecoveryRetry);
      app.timers.targetRecoveryRetry = 0;
      app.targetRecoveryRetryAt = 0;
      app.targetRecoveryRetryStatus = reason ? 'cleared:' + reason : 'off';
    }

    function resetTargetRecoveryRetryState(reason) {
      clearTargetRecoveryRetry(reason || 'reset');
      app.targetRecoveryRetryCount = 0;
      app.targetRecoveryRetryKey = '';
    }

    function clearAsyncTimers(reason) {
      clearTimeout(app.timers.captionEnable);
      clearTimeout(app.timers.nativeTranslationTrigger);
      clearTimeout(app.timers.nativeMenuTrigger);
      clearTimeout(app.timers.playerApiPrime);
      app.timers.captionEnable = 0;
      app.timers.nativeTranslationTrigger = 0;
      app.timers.nativeMenuTrigger = 0;
      app.timers.playerApiPrime = 0;
      app.staleTimerClearedCount += 1;
      app.staleTimerClearedStatus = reason || 'cleared';
    }

    function scheduleTargetRecoveryRetry(videoId, sourceTrack, targetLang, requestId, reason) {
      if (!state.enabled || !videoId || !sourceTrack || !targetLang) return;
      var key = buildCueCacheKey(videoId, sourceTrack, targetLang);
      var epoch = app.videoEpoch;
      if (app.targetRecoveryRetryKey !== key) {
        app.targetRecoveryRetryKey = key;
        app.targetRecoveryRetryCount = 0;
      }
      if (app.targetRecoveryRetryCount >= CONFIG.targetRecoveryMaxRetries) {
        app.targetRecoveryRetryStatus = 'give-up:' + (reason || '-');
        return;
      }

      clearTimeout(app.timers.targetRecoveryRetry);
      app.targetRecoveryRetryCount += 1;
      app.targetRecoveryRetryAt = Date.now() + CONFIG.targetRecoveryRetryDelayMs;
      app.targetRecoveryRetryStatus = 'scheduled:' + (reason || '-') + ':' + app.targetRecoveryRetryCount;
      app.timers.targetRecoveryRetry = window.setTimeout(function () {
        app.timers.targetRecoveryRetry = 0;
        app.targetRecoveryRetryAt = 0;
        if (epoch !== app.videoEpoch) return;
        if (!isRequestCurrent(requestId) || videoId !== getVideoId() || !isWatchPage() || !state.enabled) return;
        if (app.cuesB.length || app.targetPending || app.loading) return;
        app.targetRecoveryRetryStatus = 'retry:' + (reason || '-') + ':' + app.targetRecoveryRetryCount;
        app.pendingLoadKey = '';
        loadDualSubs(true, 'target-recovery-' + (reason || 'retry'));
      }, CONFIG.targetRecoveryRetryDelayMs);
      syncUi();
    }

    function clearNativeTargetFallback() {
      app.nativeTargetFallback = false;
      app.nativeTargetFallbackPreserve = false;
      app.nativeTargetFallbackReason = '';
      app.nativeTargetFallbackText = '';
      stopNativeCaptionObserver('fallback-off');
    }

    function enableNativeTargetFallback(reason) {
      app.nativeTargetFallback = true;
      app.nativeTargetFallbackPreserve = false;
      app.nativeTargetFallbackReason = reason || '';
      syncNativeCaptionObserver(reason || 'fallback-on');
    }

    function syncNativeCaptionObserver(reason) {
      if (!app.nativeTargetFallback || !state.enabled || !isWatchPage()) {
        stopNativeCaptionObserver(reason || 'inactive');
        return;
      }
      if (typeof MutationObserver !== 'function') {
        app.nativeDomObserverStatus = 'miss:no-observer';
        return;
      }
      var container = getCaptionContainer();
      if (!container) {
        app.nativeDomObserverStatus = 'miss:no-container';
        return;
      }
      if (app.nativeDomObserver) return;
      app.nativeDomObserver = new MutationObserver(function () {
        handleNativeCaptionDomChange('mutation');
      });
      app.nativeDomObserver.observe(container, {
        childList: true,
        characterData: true,
        subtree: true
      });
      app.nativeDomObserverStatus = 'on:' + (reason || 'fallback');
      handleNativeCaptionDomChange('start');
    }

    function stopNativeCaptionObserver(reason) {
      if (app.nativeDomObserver) {
        app.nativeDomObserver.disconnect();
        app.nativeDomObserver = null;
      }
      app.nativeDomObserverStatus = reason ? 'off:' + reason : 'off';
    }

    function handleNativeCaptionDomChange(reason) {
      if (!app.nativeTargetFallback || !state.enabled || !isWatchPage()) return;
      var nativeText = readNativeCaptionText() || '';
      var video = getVideo();
      var sourceCue = video ? findCueText(app.cuesA, video.currentTime, app.lastCueA) : null;
      var sourceText = sourceCue ? sourceCue.text : '';
      if (nativeText && shouldUseNativeTargetText(nativeText, sourceText)) {
        app.nativeDomObserverAt = Date.now();
        app.nativeDomObserverStatus = 'target:' + (reason || 'text');
        app.nativeTargetFallbackText = nativeText;
        clearTargetRecoveryRetry('native-dom-target');
        renderCurrentCaption();
        syncUi();
        return;
      }
      if (nativeText) {
        app.nativeDomObserverAt = Date.now();
        app.nativeDomObserverStatus = 'text:source-or-other';
      }
    }

    function resetNativeTranslationTriggerState() {
      clearTimeout(app.timers.nativeTranslationTrigger);
      clearTimeout(app.timers.nativeMenuTrigger);
      app.nativeTranslationTriggerCount = 0;
      app.nativeTranslationTriggerDetail = '';
      app.nativeTranslationTriggerKey = '';
      app.nativeTranslationTriggerStatus = '';
      app.nativeMenuTriggerCount = 0;
      app.nativeMenuTriggerDetail = '';
      app.nativeMenuTriggerKey = '';
      app.nativeMenuTriggerTrace = '';
      app.nativeMenuTriggerStatus = '';
    }

    function setNativeTranslationTriggerStatus(status, detail, key) {
      app.nativeTranslationTriggerStatus = status || '';
      app.nativeTranslationTriggerDetail = detail || '';
      if (key) app.nativeTranslationTriggerKey = key;
    }

    function setNativeMenuTriggerStatus(status, detail, key) {
      app.nativeMenuTriggerStatus = status || '';
      app.nativeMenuTriggerDetail = detail || '';
      if (key) app.nativeMenuTriggerKey = key;
    }

    function setNativeMenuTriggerTrace(label, items) {
      var texts = [];
      var i;
      for (i = 0; i < (items || []).length && texts.length < 5; i++) {
        var text = getMenuItemText(items[i]);
        if (text) texts.push(text.slice(0, 32));
      }
      var entry = label + '[' + texts.join(' / ') + ']';
      app.nativeMenuTriggerTrace = app.nativeMenuTriggerTrace ? app.nativeMenuTriggerTrace + ' > ' + entry : entry;
    }

    function clearMachineTranslateFallback() {
      app.machineTranslateActive = false;
      app.machineTranslateReason = '';
      app.machineTranslateSourceLang = '';
      app.machineTranslateTargetLang = '';
      app.machineTranslatePending = {};
      app.machineTranslateFailed = {};
      app.machineTranslateLast = '';
      app.machineTranslateMode = '';
    }

    function clearMachinePromptState() {
      app.machinePromptStatus = 'off';
      app.machinePromptKey = '';
      app.machinePromptReason = '';
    }

    function clearAsrSyncStatus() {
      app.asrSyncStatus = 'off';
      app.asrSyncDetail = '';
    }

    function enableMachineTranslateFallback(sourceTrack, targetLang, reason, mode) {
      mode = mode || (state.machineTranslateFallback ? 'primary' : '');
      if (!CONFIG.machineTranslateFallbackEnabled || (!state.machineTranslateFallback && mode !== 'user-confirmed' && mode !== 'primary')) {
        clearMachineTranslateFallback();
        return false;
      }
      app.machineTranslateActive = true;
      app.machineTranslateReason = reason || '';
      app.machineTranslateSourceLang = getTrackLanguageCode(sourceTrack) || 'auto';
      app.machineTranslateTargetLang = targetLang || state.targetLang || DEFAULTS.targetLang;
      app.machineTranslateMode = mode;
      return true;
    }

    function shouldUseMachineTranslateFallback(result, hasSourceCues, hasTargetCues) {
      return !!(CONFIG.machineTranslateFallbackEnabled && state.machineTranslateFallback && hasSourceCues && !hasTargetCues && result && result.targetErrorStatus === 429);
    }

    function shouldOfferMachinePrompt(result, hasSourceCues, hasTargetCues) {
      if (!CONFIG.machineTranslateFallbackEnabled) return false;
      if (!state.machineTranslateFallback && state.machineTranslateFallbackUserSet) return false;
      if (state.machineTranslateFallback || !hasSourceCues || hasTargetCues || !state.targetLang) return false;
      return !!(result && result.targetErrorStatus === 429);
    }

    function buildMachinePromptKey(videoId, sourceTrack, targetLang) {
      sourceTrack = sourceTrack || {};
      return [
        videoId || getVideoId() || '',
        getTrackLanguageCode(sourceTrack) || 'auto',
        getTrackVssId(sourceTrack) || '',
        hashString(sourceTrack.baseUrl || getTrackName(sourceTrack) || ''),
        targetLang || state.targetLang || DEFAULTS.targetLang
      ].join('|');
    }

    function showMachinePrompt(sourceTrack, targetLang, reason) {
      var key = buildMachinePromptKey(getVideoId(), sourceTrack, targetLang);
      var decision = app.machinePromptDecisions[key] || '';
      app.machinePromptKey = key;
      app.machinePromptReason = reason || '';
      if (decision === 'accepted') {
        app.machinePromptStatus = 'accepted';
        return enableMachineTranslateFallback(sourceTrack, targetLang, reason, 'user-confirmed');
      }
      if (decision === 'dismissed') {
        app.machinePromptStatus = 'dismissed';
        clearMachineTranslateFallback();
        return false;
      }
      app.machinePromptStatus = 'shown';
      clearMachineTranslateFallback();
      return false;
    }

    function acceptMachinePrompt() {
      if (!CONFIG.machineTranslateFallbackEnabled) {
        clearMachineTranslateFallback();
        clearMachinePromptState();
        renderCurrentCaption();
        syncUi();
        return;
      }
      var sourceTrack = app.tracks[state.sourceTrackIndex];
      var key = app.machinePromptKey || buildMachinePromptKey(getVideoId(), sourceTrack, state.targetLang);
      app.machinePromptDecisions[key] = 'accepted';
      app.machinePromptKey = key;
      app.machinePromptStatus = 'accepted';
      app.machinePromptReason = app.machinePromptReason || 'target-429';
      enableMachineTranslateFallback(sourceTrack, state.targetLang, app.machinePromptReason, 'user-confirmed');
      markLoadTiming('targetReadyMs');
      renderCurrentCaption();
      syncUi();
    }

    function dismissMachinePrompt() {
      var sourceTrack = app.tracks[state.sourceTrackIndex];
      var key = app.machinePromptKey || buildMachinePromptKey(getVideoId(), sourceTrack, state.targetLang);
      app.machinePromptDecisions[key] = 'dismissed';
      app.machinePromptKey = key;
      app.machinePromptStatus = 'dismissed';
      clearMachineTranslateFallback();
      renderCurrentCaption();
      syncUi();
    }

    function isMachineTranslateAllowed() {
      return !!(CONFIG.machineTranslateFallbackEnabled && (state.machineTranslateFallback || app.machineTranslateMode === 'user-confirmed' || app.machineTranslateMode === 'primary'));
    }

    function shouldUseNativeTargetFallback(result, hasSourceCues, hasTargetCues) {
      return !!(!hasTargetCues && state.targetLang && app.playerApiPrimeOk && result && (
        result.targetErrorStatus === 429 ||
        (hasSourceCues && isAutoGeneratedCaptionTrack(app.tracks[state.sourceTrackIndex]))
      ));
    }

    function getNativeTargetFallbackReason(result) {
      if (result && result.targetErrorStatus === 429) return 'target-429';
      if (isAutoGeneratedCaptionTrack(app.tracks[state.sourceTrackIndex])) return 'target-empty-asr';
      return 'target-native-dom';
    }

    function shouldRetriggerNativeTranslation(result, hasSourceCues, hasTargetCues) {
      return !!(hasSourceCues && !hasTargetCues && state.targetLang && app.playerApiPrimeOk && result && (
        result.targetErrorStatus === 429 ||
        isAutoGeneratedCaptionTrack(app.tracks[state.sourceTrackIndex])
      ));
    }

    function isMachineTranslatePrimaryActive() {
      return !!(app.machineTranslateActive && (app.machineTranslateMode === 'primary' || app.machineTranslateMode === 'always-on'));
    }

    function getMachineTranslationState(sourceText) {
      var text = normalizeCueTextForDisplay(sourceText);
      if (!text || !app.machineTranslateActive || !isMachineTranslateAllowed()) {
        return {
          text: '',
          pending: false,
          failed: false
        };
      }
      var key = buildMachineTranslateKey(text);
      if (app.machineTranslateCache[key]) {
        return {
          text: app.machineTranslateCache[key],
          pending: false,
          failed: false
        };
      }
      if (app.machineTranslateFailed[key]) {
        return {
          text: '',
          pending: false,
          failed: true
        };
      }
      if (!app.machineTranslatePending[key]) requestMachineTranslation(key, text);
      return {
        text: '',
        pending: true,
        failed: false
      };
    }

    function getMachineTranslatedText(sourceText) {
      var machineState = getMachineTranslationState(sourceText);
      return machineState.text || '';
    }

    function buildMachineTranslateKey(text) {
      return [
        app.machineTranslateSourceLang || 'auto',
        app.machineTranslateTargetLang || state.targetLang || DEFAULTS.targetLang,
        text.length,
        hashString(text)
      ].join('|');
    }

    function requestMachineTranslation(key, text) {
      app.machineTranslatePending[key] = true;
      app.machineTranslateLast = 'pending';
      syncUi();
      fetchGoogleTranslateText(text, app.machineTranslateSourceLang, app.machineTranslateTargetLang).then(function (translated) {
        delete app.machineTranslatePending[key];
        translated = normalizeCueTextForDisplay(translated);
        if (!translated) {
          app.machineTranslateFailed[key] = true;
          app.machineTranslateLast = 'empty';
          syncUi();
          return;
        }
        rememberMachineTranslation(key, translated);
        app.machineTranslateLast = 'ok';
        renderCurrentCaption();
        syncUi();
      }).catch(function (err) {
        delete app.machineTranslatePending[key];
        app.machineTranslateFailed[key] = true;
        app.machineTranslateLast = 'err:' + formatError(err);
        syncUi();
      });
    }

    function rememberMachineTranslation(key, text) {
      if (!app.machineTranslateCache[key]) app.machineTranslateCacheOrder.push(key);
      app.machineTranslateCache[key] = text;
      while (app.machineTranslateCacheOrder.length > CONFIG.machineTranslateCacheLimit) {
        delete app.machineTranslateCache[app.machineTranslateCacheOrder.shift()];
      }
    }

    function formatTargetLoadingText() {
      var now = Date.now();
      var ms = app.backoffUntil ? app.backoffUntil - now : app.targetRetryAt ? app.targetRetryAt - now : now - (app.targetPendingStartedAt || now);
      var seconds = Math.max(1, Math.ceil(ms / 1000));
      return TEXT.targetLoading.replace('{seconds}', String(seconds));
    }

    function ensureCaptionsEnabled(videoId) {
      var key = videoId || getVideoId() || location.href;
      var now = Date.now();
      if (app.captionEnableClickKey !== key) {
        app.captionEnableClickCount = 0;
        app.captionEnableStartedAt = now;
        app.captionEnableClickKey = key;
      }

      var button = document.querySelector(CONFIG.selectors.subtitlesButton);
      if (!button) {
        if (now - app.captionEnableStartedAt < CONFIG.captionEnableFindTimeoutMs) {
          scheduleCaptionEnableCheck(key, CONFIG.captionEnableFindRetryMs);
        }
        return false;
      }
      if (button.getAttribute('aria-pressed') === 'true') return false;
      if (now - app.captionEnableClickAt < CONFIG.captionEnableRetryMs) return false;
      if (app.captionEnableClickCount >= CONFIG.captionEnableMaxClicksPerVideo) return false;
      try {
        app.captionEnableClickKey = key;
        app.captionEnableClickAt = now;
        app.captionEnableClickCount += 1;
        button.click();
        scheduleCaptionEnableCheck(key, CONFIG.captionEnableRetryMs);
        return true;
      } catch (err) {
        app.captionEnableClickKey = '';
        app.captionEnableClickAt = 0;
        app.captionEnableClickCount = 0;
        app.captionEnableStartedAt = 0;
        logger.debug('caption button click failed', err);
      }
      return false;
    }

    function scheduleCaptionEnableCheck(key, delayMs) {
      clearTimeout(app.timers.captionEnable);
      var epoch = app.videoEpoch;
      app.timers.captionEnable = window.setTimeout(function () {
        if (epoch !== app.videoEpoch) return;
        if (!state.enabled || !isWatchPage()) return;
        var currentKey = getVideoId() || location.href;
        if (currentKey !== key) return;
        ensureCaptionsEnabled(currentKey);
      }, typeof delayMs === 'number' ? delayMs : CONFIG.captionEnableRetryMs);
    }

    function primePlayerCaptionTranslation(videoId, sourceTrack, targetLang, options) {
      options = options || {};
      var key = buildPlayerApiPrimeKey(videoId, sourceTrack, targetLang);
      var now = Date.now();
      if (!key) return setPlayerApiPrimeStatus('miss', 'no-track', false, key);
      if (!options.force && app.playerApiPrimeOk && app.playerApiPrimeKey === key && now - app.playerApiPrimeAt < CONFIG.playerCaptionPrimeMinIntervalMs) {
        return setPlayerApiPrimeStatus('skipped', 'recent-ok', true, key, true);
      }

      app.playerApiPrimeKey = key;
      app.playerApiPrimeAt = now;
      app.playerApiPrimeOk = false;

      try {
        var player = getPlayer();
        if (!player) return setPlayerApiPrimeStatus('miss', 'no-player', false, key);
        if (typeof player.getOption !== 'function' || typeof player.setOption !== 'function') {
          return setPlayerApiPrimeStatus('miss', 'api-missing', false, key);
        }

        var tracklist = player.getOption('captions', 'tracklist') || [];
        var playerTrack = ensurePlayerCaptionTrackMetadata(findPlayerCaptionTrack(tracklist, sourceTrack) || buildPlayerCaptionTrackFromSource(sourceTrack), sourceTrack);
        if (!playerTrack) return setPlayerApiPrimeStatus('miss', 'track', false, key);

        var languages = player.getOption('captions', 'translationLanguages') || [];
        var translation = findPlayerTranslationLanguage(languages, targetLang);
        if (!translation) {
          if (!languages.length) return setPlayerApiPrimeStatus('miss', 'target-lang', false, key);
          translation = {
            languageCode: targetLang,
            languageName: targetLang
          };
        }

        if (typeof player.loadModule === 'function') player.loadModule('captions');
        if (typeof player.isSubtitlesOn === 'function' && player.isSubtitlesOn() === false && typeof player.toggleSubtitlesOn === 'function') {
          player.toggleSubtitlesOn();
        }

        if (options.resetBeforeApply) {
          resetPlayerCaptionTranslation(player, playerTrack);
        }

        var translatedTrack = clonePlainObject(playerTrack);
        translatedTrack.translationLanguage = cloneTranslationLanguage(translation, targetLang);
        player.setOption('captions', 'track', translatedTrack);
        player.setOption('captions', 'translationLanguage', translatedTrack.translationLanguage);
        player.setOption('captions', 'reload', Date.now());
        if (!isPlayerCaptionTranslationApplied(player, targetLang)) {
          return setPlayerApiPrimeStatus('miss', 'not-applied', false, key);
        }
        return setPlayerApiPrimeStatus('ok', options.resetBeforeApply ? 'reset:' + targetLang : targetLang, true, key);
      } catch (err) {
        logger.debug('player caption API prime failed', err);
        return setPlayerApiPrimeStatus('error', formatError(err), false, key);
      }
    }

    function resetPlayerCaptionTranslation(player, playerTrack) {
      var plainTrack = clonePlainObject(playerTrack);
      delete plainTrack.translationLanguage;
      player.setOption('captions', 'translationLanguage', null);
      player.setOption('captions', 'track', plainTrack);
      player.setOption('captions', 'reload', Date.now());
    }

    function scheduleNativeTranslationRetrigger(videoId, sourceTrack, targetLang, requestId, reason) {
      var primeKey = buildPlayerApiPrimeKey(videoId, sourceTrack, targetLang);
      var key = primeKey + '|native-retrigger|' + (reason || '');
      if (!sourceTrack || !targetLang || !primeKey) {
        setNativeTranslationTriggerStatus('miss', 'no-track', key);
        return;
      }

      if (app.nativeTranslationTriggerKey !== key) {
        app.nativeTranslationTriggerKey = key;
        app.nativeTranslationTriggerCount = 0;
      }
      if (app.nativeTranslationTriggerCount >= CONFIG.nativeTranslationRetriggerMaxAttempts) {
        setNativeTranslationTriggerStatus('skipped', 'max-attempts', key);
        return;
      }

      app.nativeTranslationTriggerCount += 1;
      setNativeTranslationTriggerStatus('scheduled', reason || '-', key);
      clearTimeout(app.timers.nativeTranslationTrigger);
      var epoch = app.videoEpoch;
      app.timers.nativeTranslationTrigger = window.setTimeout(function () {
        app.timers.nativeTranslationTrigger = 0;
        if (epoch !== app.videoEpoch) return;
        if (!isActiveRequest(requestId, videoId)) return;
        var previousPrime = {
          at: app.playerApiPrimeAt,
          detail: app.playerApiPrimeDetail,
          key: app.playerApiPrimeKey,
          ok: app.playerApiPrimeOk,
          retryCount: app.playerApiPrimeRetryCount,
          status: app.playerApiPrimeStatus
        };
        var result = primePlayerCaptionTranslation(videoId, sourceTrack, targetLang, {
          force: true,
          resetBeforeApply: true
        });
        app.playerApiPrimeAt = previousPrime.at;
        app.playerApiPrimeDetail = previousPrime.detail;
        app.playerApiPrimeKey = previousPrime.key;
        app.playerApiPrimeOk = previousPrime.ok;
        app.playerApiPrimeRetryCount = previousPrime.retryCount;
        app.playerApiPrimeStatus = previousPrime.status;
        setNativeTranslationTriggerStatus(result && result.ok ? 'ok' : 'miss', reason || (result && result.detail) || '-', key);
        syncUi();
      }, CONFIG.nativeTranslationRetriggerDelayMs);
    }

    function scheduleNativeMenuTranslationTrigger(videoId, sourceTrack, targetLang, requestId, reason) {
      var primeKey = buildPlayerApiPrimeKey(videoId, sourceTrack, targetLang);
      var key = primeKey + '|native-menu|' + (reason || '');
      if (!sourceTrack || !targetLang || !primeKey) {
        setNativeMenuTriggerStatus('miss', 'no-track', key);
        return;
      }

      if (app.nativeMenuTriggerKey !== key) {
        app.nativeMenuTriggerKey = key;
        app.nativeMenuTriggerCount = 0;
      }
      if (app.nativeMenuTriggerCount >= CONFIG.nativeMenuTriggerMaxAttempts) {
        setNativeMenuTriggerStatus('skipped', 'max-attempts', key);
        return;
      }

      app.nativeMenuTriggerCount += 1;
      setNativeMenuTriggerStatus('scheduled', reason || '-', key);
      clearTimeout(app.timers.nativeMenuTrigger);
      var epoch = app.videoEpoch;
      app.timers.nativeMenuTrigger = window.setTimeout(function () {
        app.timers.nativeMenuTrigger = 0;
        if (epoch !== app.videoEpoch) return;
        if (!isActiveRequest(requestId, videoId) || !app.nativeTargetFallback || app.cuesB.length) return;
        var nativeText = readNativeCaptionText() || '';
        var video = getVideo();
        var sourceCue = video ? findCueText(app.cuesA, video.currentTime, app.lastCueA) : null;
        if (nativeText && shouldUseNativeTargetText(nativeText, sourceCue ? sourceCue.text : '')) {
          setNativeMenuTriggerStatus('skipped', 'already-text', key);
          syncUi();
          return;
        }

        setNativeMenuTriggerStatus('running', reason || '-', key);
        syncUi();
        runNativeMenuTranslationTrigger(sourceTrack, targetLang).then(function (result) {
          if (epoch !== app.videoEpoch || !isActiveRequest(requestId, videoId)) return;
          setNativeMenuTriggerStatus(result && result.ok ? 'ok' : 'miss', result && result.detail ? result.detail : (reason || '-'), key);
          syncUi();
          renderCurrentCaption();
        }, function (err) {
          if (epoch !== app.videoEpoch || !isActiveRequest(requestId, videoId)) return;
          setNativeMenuTriggerStatus('error', formatError(err), key);
          syncUi();
        });
      }, CONFIG.nativeMenuTriggerDelayMs);
    }

    function runNativeMenuTranslationTrigger(sourceTrack, targetLang) {
      var player = getPlayer();
      if (!player) return Promise.resolve({ ok: false, detail: 'no-player' });
      player.classList.add('yds-menu-triggering');

      return cycleNativeCaptionButton().then(function (cycled) {
        return wait(cycled ? CONFIG.nativeMenuTriggerAfterCycleMs : CONFIG.nativeMenuTriggerStepMs).then(function () {
          return reopenNativeSubtitleMenu();
        }).then(function (items) {
          setNativeMenuTriggerTrace('subtitle', items);
          if (!items || !items.length) return { ok: false, detail: cycled ? 'subtitle-menu-after-cycle' : 'subtitle-menu' };
          return items;
        });
      }).then(function (items) {
        if (items && items.ok === false) return items;
        var translatedItem = findTranslatedCaptionMenuItem(items, targetLang);
        if (translatedItem) {
          clickElement(translatedItem);
          return wait(CONFIG.nativeMenuTriggerStepMs).then(function () {
            return { ok: true, detail: 'translated-item' };
          });
        }

        var autoItem = findAutoTranslateMenuItem(items);
        if (!autoItem) return { ok: false, detail: 'auto-item' };
        clickElement(autoItem);
        return waitFor(function () {
          var languageItems = getVisiblePlayerMenuItems();
          if (languageItems.length) setNativeMenuTriggerTrace('language', languageItems);
          return languageItems.length ? languageItems : null;
        }, CONFIG.nativeMenuTriggerWaitMs, 80).then(function (languageItems) {
          var targetItem = findTargetLanguageMenuItem(languageItems || [], targetLang);
          if (!targetItem) return { ok: false, detail: 'target-lang' };
          clickElement(targetItem);
          return wait(CONFIG.nativeMenuTriggerStepMs).then(function () {
            return { ok: true, detail: 'auto-translate:' + targetLang };
          });
        });
      }).then(function (result) {
        closeNativePlayerMenus();
        player.classList.remove('yds-menu-triggering');
        return result;
      }, function (err) {
        closeNativePlayerMenus();
        player.classList.remove('yds-menu-triggering');
        throw err;
      });
    }

    function cycleNativeCaptionButton() {
      var button = document.querySelector(CONFIG.selectors.subtitlesButton);
      if (!button) return Promise.resolve(false);
      var pressed = String(button.getAttribute('aria-pressed') || '').toLowerCase() === 'true';
      if (pressed) clickElement(button);
      return wait(CONFIG.nativeMenuTriggerStepMs).then(function () {
        var isPressed = String(button.getAttribute('aria-pressed') || '').toLowerCase() === 'true';
        if (!isPressed) clickElement(button);
        return wait(CONFIG.nativeMenuTriggerStepMs * 2).then(function () {
          return true;
        });
      });
    }

    function reopenNativeSubtitleMenu() {
      closeNativePlayerMenus();
      return wait(CONFIG.nativeMenuTriggerStepMs).then(function () {
        return openNativeSubtitleMenu();
      });
    }

    function openNativeSubtitleMenu() {
      return openNativeSettingsMenu().then(function (items) {
        if (!items || !items.length) return [];
        if (hasSubtitleMenuShape(items) && !isSettingsRootMenu(items)) return items;
        return openNativeSubtitleMenuFromSettings(items, 0);
      });
    }

    function openNativeSubtitleMenuFromSettings(items, attempt) {
      var subtitlesItem = findSubtitlesSettingsMenuItem(items);
      if (!subtitlesItem) return Promise.resolve([]);
      if (attempt) nativeClickElement(subtitlesItem);
      else clickElement(subtitlesItem);

      return waitFor(function () {
        var nextItems = getVisiblePlayerMenuItems();
        if (nextItems.length && !isSettingsRootMenu(nextItems)) {
          setNativeMenuTriggerTrace(attempt ? 'subtitle-retry' + attempt : 'subtitle', nextItems);
          return nextItems;
        }
        return null;
      }, CONFIG.nativeMenuTriggerWaitMs, 80).then(function (nextItems) {
        if (nextItems && nextItems.length) return nextItems;
        setNativeMenuTriggerTrace(attempt ? 'subtitle-empty' + attempt : 'subtitle-empty', getVisiblePlayerMenuItems());
        if (attempt + 1 >= CONFIG.nativeMenuTriggerOpenRetries) return [];
        closeNativePlayerMenus();
        return wait(CONFIG.nativeMenuTriggerStepMs).then(function () {
          return openNativeSettingsMenu().then(function (retryItems) {
            return openNativeSubtitleMenuFromSettings(retryItems || [], attempt + 1);
          });
        });
      });
    }

    function openNativeSettingsMenu() {
      var currentItems = getVisiblePlayerMenuItems();
      if (currentItems.length && !hasLanguageMenuShape(currentItems)) return Promise.resolve(currentItems);

      closeNativePlayerMenus();
      revealPlayerControls();
      var settingsButton = document.querySelector(CONFIG.selectors.settingsButton);
      if (!settingsButton) return Promise.resolve([]);
      return tryOpenNativeSettingsMenu(settingsButton, 0);
    }

    function tryOpenNativeSettingsMenu(settingsButton, attempt) {
      if (attempt) {
        try {
          settingsButton.click();
        } catch (err) {
          clickElement(settingsButton);
        }
      } else {
        clickElement(settingsButton);
      }
      return waitFor(function () {
        var items = getVisiblePlayerMenuItems();
        if (items.length) setNativeMenuTriggerTrace(attempt ? 'settings-retry' + attempt : 'settings', items);
        return items.length ? items : null;
      }, CONFIG.nativeMenuTriggerWaitMs, 80).then(function (items) {
        if (items && items.length) return items;
        setNativeMenuTriggerTrace(attempt ? 'settings-empty' + attempt : 'settings-empty', []);
        if (attempt + 1 >= CONFIG.nativeMenuTriggerOpenRetries) return [];
        closeNativePlayerMenus();
        revealPlayerControls();
        return wait(CONFIG.nativeMenuTriggerStepMs).then(function () {
          return tryOpenNativeSettingsMenu(settingsButton, attempt + 1);
        });
      });
    }

    function revealPlayerControls() {
      var player = getPlayer();
      if (!player) return;
      var rect = player.getBoundingClientRect ? player.getBoundingClientRect() : null;
      var x = rect ? rect.left + rect.width / 2 : 0;
      var y = rect ? rect.bottom - 24 : 0;
      try {
        player.dispatchEvent(new MouseEvent('mousemove', {
          bubbles: true,
          cancelable: true,
          clientX: x,
          clientY: y
        }));
      } catch (err) {}
    }

    function closeNativePlayerMenus() {
      var eventOptions = { bubbles: true, cancelable: true, key: 'Escape', code: 'Escape', keyCode: 27, which: 27 };
      try {
        document.dispatchEvent(new KeyboardEvent('keydown', eventOptions));
        document.dispatchEvent(new KeyboardEvent('keyup', eventOptions));
      } catch (err) {}
    }

    function clickElement(element) {
      if (!element) return false;
      try {
        var rect = element.getBoundingClientRect ? element.getBoundingClientRect() : null;
        var x = rect ? rect.left + rect.width / 2 : 0;
        var y = rect ? rect.top + rect.height / 2 : 0;
        ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'].forEach(function (type) {
          var options = {
            bubbles: true,
            cancelable: true,
            composed: true,
            clientX: x,
            clientY: y,
            button: 0,
            buttons: type === 'pointerdown' || type === 'mousedown' ? 1 : 0
          };
          var event;
          try {
            event = type.indexOf('pointer') === 0 && typeof PointerEvent === 'function'
              ? new PointerEvent(type, options)
              : new MouseEvent(type, options);
          } catch (err) {
            event = document.createEvent('MouseEvents');
            event.initMouseEvent(type, true, true, window, 1, x, y, x, y, false, false, false, false, 0, null);
          }
          element.dispatchEvent(event);
        });
        return true;
      } catch (err) {
        try {
          element.click();
          return true;
        } catch (clickErr) {
          return false;
        }
      }
    }

    function nativeClickElement(element) {
      if (!element) return false;
      try {
        element.click();
        return true;
      } catch (err) {
        return clickElement(element);
      }
    }

    function getVisiblePlayerMenuItems() {
      var nodes = document.querySelectorAll(CONFIG.selectors.playerMenuItem);
      var items = [];
      var i;
      var player = getPlayer();
      for (i = 0; i < nodes.length; i++) {
        if (player && !player.contains(nodes[i])) continue;
        if (!nodes[i].closest || nodes[i].closest('#' + CONFIG.ids.panel + ',#' + CONFIG.ids.launcher)) continue;
        if (!isClickableMenuItem(nodes[i])) continue;
        items.push(nodes[i]);
      }
      return items;
    }

    function isClickableMenuItem(node) {
      if (!node) return false;
      var style = window.getComputedStyle ? window.getComputedStyle(node) : null;
      if (style && (style.display === 'none' || style.visibility === 'hidden')) return false;
      var rect = node.getBoundingClientRect ? node.getBoundingClientRect() : null;
      return !rect || (rect.width > 0 && rect.height > 0);
    }

    function getMenuItemText(item) {
      if (!item) return '';
      var label = item.querySelector && item.querySelector('.ytp-menuitem-label');
      var content = item.querySelector && item.querySelector('.ytp-menuitem-content');
      var primaryText = [label ? label.textContent : '', content ? content.textContent : ''].join(' ');
      return normalizeCueTextForDisplay([
        primaryText || item.textContent || '',
        item.getAttribute ? item.getAttribute('aria-label') || '' : ''
      ].join(' '));
    }

    function hasSubtitleMenuShape(items) {
      if (!items || !items.length) return false;
      return !!(findOffCaptionMenuItem(items) || findAutoTranslateMenuItem(items) || findTranslatedCaptionMenuItem(items, state.targetLang));
    }

    function isSettingsRootMenu(items) {
      if (!items || !items.length) return false;
      if (!findSubtitlesSettingsMenuItem(items)) return false;
      return !findOffCaptionMenuItem(items) && !findAutoTranslateMenuItem(items);
    }

    function hasLanguageMenuShape(items) {
      if (!items || !items.length) return false;
      return !findSubtitlesSettingsMenuItem(items) && !findOffCaptionMenuItem(items) && !findAutoTranslateMenuItem(items) && !!findTargetLanguageMenuItem(items, state.targetLang);
    }

    function findSubtitlesSettingsMenuItem(items) {
      return findMenuItem(items, function (text) {
        return isSubtitlesSettingsMenuText(text);
      });
    }

    function findOffCaptionMenuItem(items) {
      return findMenuItem(items, function (text) {
        return /^(off|关闭|關閉|关闭字幕|關閉字幕)$/i.test(normalizeMenuTextForMatch(text));
      });
    }

    function findAutoTranslateMenuItem(items) {
      return findMenuItem(items, function (text) {
        return /(auto[\s-]*translate|自動翻譯|自动翻译|自動翻訳|자동 번역|traduire automatiquement|traducción automática)/i.test(text);
      });
    }

    function findTranslatedCaptionMenuItem(items, targetLang) {
      return findMenuItem(items, function (text) {
        return !isSubtitlesSettingsMenuText(text) && />>|→|->/.test(text) && menuTextMatchesLanguage(text, targetLang, getTargetLanguageName(targetLang));
      });
    }

    function isSubtitlesSettingsMenuText(text) {
      return /(subtitles|captions|字幕|cc)/i.test(text);
    }

    function findSourceCaptionMenuItem(items, sourceTrack) {
      var candidates = [];
      var i;
      var text;
      for (i = 0; i < items.length; i++) {
        text = getMenuItemText(items[i]);
        if (!text || findOffCaptionMenuItem([items[i]]) || findAutoTranslateMenuItem([items[i]]) || />>|→|->/.test(text)) continue;
        candidates.push(items[i]);
      }
      for (i = 0; i < candidates.length; i++) {
        text = getMenuItemText(candidates[i]);
        if (sourceMenuTextMatchesTrack(text, sourceTrack)) return candidates[i];
      }
      return candidates.length === 1 ? candidates[0] : null;
    }

    function findTargetLanguageMenuItem(items, targetLang) {
      var name = getTargetLanguageName(targetLang);
      return findMenuItem(items, function (text) {
        return menuTextMatchesLanguage(text, targetLang, name);
      });
    }

    function findMenuItem(items, predicate) {
      var i;
      for (i = 0; i < (items || []).length; i++) {
        if (predicate(getMenuItemText(items[i]), items[i])) return items[i];
      }
      return null;
    }

    function getTargetLanguageName(targetLang) {
      var i;
      for (i = 0; i < app.translationLanguages.length; i++) {
        if (app.translationLanguages[i].languageCode === targetLang) return app.translationLanguages[i].name || '';
      }
      return targetLang || '';
    }

    function menuTextMatchesLanguage(text, languageCode, displayName) {
      var normalizedText = normalizeLangLabel(text);
      var aliases = getLanguageAliases(languageCode, displayName || '');
      var i;
      var alias;
      for (i = 0; i < aliases.length; i++) {
        alias = normalizeLangLabel(aliases[i]);
        if (!alias) continue;
        if (normalizedText === alias || normalizedText.indexOf(alias) !== -1 || alias.indexOf(normalizedText) !== -1) return true;
      }
      return false;
    }

    function sourceMenuTextMatchesTrack(text, sourceTrack) {
      if (!sourceTrack) return false;
      if (menuTextMatchesLanguage(text, getTrackLanguageCode(sourceTrack), getTrackName(sourceTrack))) return true;
      return normalizeLangLabel(text).indexOf(normalizeLangLabel(getTrackName(sourceTrack))) !== -1;
    }

    function normalizeMenuTextForMatch(text) {
      return String(text || '').replace(/\s+/g, '').trim();
    }

    function schedulePlayerCaptionPrimeRetry(videoId, sourceTrack, targetLang, requestId) {
      if (!sourceTrack || !targetLang || app.playerApiPrimeOk) return;
      if (app.playerApiPrimeRetryCount >= CONFIG.playerCaptionPrimeMaxRetries) return;

      app.playerApiPrimeRetryCount += 1;
      clearTimeout(app.timers.playerApiPrime);
      var epoch = app.videoEpoch;
      app.timers.playerApiPrime = window.setTimeout(function () {
        app.timers.playerApiPrime = 0;
        if (epoch !== app.videoEpoch) return;
        if (!isActiveRequest(requestId, videoId)) return;
        var result = primePlayerCaptionTranslation(videoId, sourceTrack, targetLang, { force: true });
        if (!result.ok) schedulePlayerCaptionPrimeRetry(videoId, sourceTrack, targetLang, requestId);
      }, CONFIG.playerCaptionPrimeRetryMs);
    }

    function setPlayerApiPrimeStatus(status, detail, ok, key, preserveTimestamp) {
      app.playerApiPrimeStatus = status || '';
      app.playerApiPrimeDetail = detail || '';
      app.playerApiPrimeOk = !!ok;
      if (key) app.playerApiPrimeKey = key;
      if (key && !preserveTimestamp && !app.playerApiPrimeAt) app.playerApiPrimeAt = Date.now();
      return {
        detail: app.playerApiPrimeDetail,
        ok: app.playerApiPrimeOk,
        status: app.playerApiPrimeStatus
      };
    }

    function formatBackoffStatus(sourceAvailable) {
      var remaining = Math.max(1, Math.ceil((app.backoffUntil - Date.now()) / 1000));
      var template = sourceAvailable ? TEXT.rateLimitedWithSource : TEXT.rateLimitedShort;
      return template.replace('{seconds}', String(remaining));
    }

    function updateBackoffStatus() {
      if (!app.backoffUntil) return;
      if (app.backoffSourceAvailable) {
        setPhase('ready');
      } else {
        setPhase('backoff');
      }
      setStatus(formatBackoffStatus(app.backoffSourceAvailable));
    }

    function startBackoffCountdown(sourceAvailable, reason) {
      clearBackoffTimer();
      app.backoffUntil = Date.now() + CONFIG.rateLimitBackoffMs;
      app.backoffSourceAvailable = !!sourceAvailable;
      updateBackoffStatus();
      app.timers.backoff = window.setInterval(function () {
        if (!app.backoffUntil) {
          clearBackoffTimer();
          return;
        }
        if (Date.now() >= app.backoffUntil) {
          clearBackoffTimer();
          app.backoffUntil = 0;
          app.backoffSourceAvailable = false;
          if (state.enabled && isWatchPage()) reloadDualSubsSoon(reason || 'rate-limit-retry');
          return;
        }
        updateBackoffStatus();
      }, 1000);
    }

    function buildCueCacheKey(videoId, track, targetLang) {
      if (!videoId || !track) return '';
      return [
        videoId,
        track.languageCode || '',
        track.vssId || '',
        getTrackName(track),
        targetLang || '',
        hashString(track.baseUrl || '')
      ].join('|');
    }

    function hashString(value) {
      var text = String(value || '');
      var hash = 0;
      var i;
      for (i = 0; i < text.length; i++) {
        hash = ((hash << 5) - hash) + text.charCodeAt(i);
        hash |= 0;
      }
      return String(hash);
    }

    function cloneCues(cues) {
      var output = [];
      var i;
      cues = cues || [];
      for (i = 0; i < cues.length; i++) {
        output.push({
          start: cues[i].start,
          end: cues[i].end,
          text: cues[i].text
        });
      }
      return output;
    }

    function getCachedCuePair(key) {
      var item = key ? app.cueCache[key] : null;
      if (!item) return null;
      if (Date.now() - item.createdAt > CONFIG.cueCacheTtlMs) {
        delete app.cueCache[key];
        return null;
      }
      return {
        cuesA: cloneCues(item.cuesA),
        cuesB: cloneCues(item.cuesB),
        fallback: item.fallback || '',
        sourceName: item.sourceName || '',
        asrSyncStatus: item.asrSyncStatus || 'off',
        asrSyncDetail: item.asrSyncDetail || '',
        cacheHit: true
      };
    }

    function shouldBypassCueCache(reason) {
      return /manual-reload|debug-reload|shortcut-reload|rate-limit-retry/i.test(String(reason || ''));
    }

    function shouldAutoSelectCueTrack(selectedTrack, selectedIndex, tracks, targetLang) {
      if (selectedIndex !== 0 || !tracks || tracks.length < 2) return false;
      if (isEnglishLanguageCode(selectedTrack && selectedTrack.languageCode)) return false;
      return findAutoSourceCandidates(tracks, selectedTrack, selectedIndex, targetLang).some(function (item) {
        return isEnglishLanguageCode(item.track && item.track.languageCode);
      });
    }

    function getAutoSourceCandidate(selectedTrack, selectedIndex, tracks, targetLang) {
      if (!shouldAutoSelectCueTrack(selectedTrack, selectedIndex, tracks, targetLang)) return null;
      var candidates = findAutoSourceCandidates(tracks, selectedTrack, selectedIndex, targetLang);
      return candidates.length ? candidates[0] : null;
    }

    function findAutoSourceCandidates(tracks, selectedTrack, selectedIndex, targetLang) {
      var scored = [];
      var i;
      for (i = 0; i < (tracks || []).length; i++) {
        if (i === selectedIndex || !getUsableTrack(tracks[i])) continue;
        if (isSameLanguageFamily(tracks[i].languageCode, targetLang)) continue;
        if (selectedTrack && isSameLanguageFamily(tracks[i].languageCode, selectedTrack.languageCode)) continue;
        scored.push({
          index: i,
          score: scoreAutoSourceTrack(tracks[i], i),
          track: tracks[i]
        });
      }
      scored.sort(function (left, right) {
        if (right.score !== left.score) return right.score - left.score;
        return left.index - right.index;
      });
      return scored.slice(0, 4);
    }

    function scoreAutoSourceTrack(track, index) {
      var lang = String(track && track.languageCode || '').toLowerCase();
      var name = getTrackName(track);
      var score = Math.max(0, 100 - index);
      if (lang === 'en') score += 1000;
      else if (isEnglishLanguageCode(lang)) score += 900;
      if (!/auto|generated|自动|自動/i.test(name)) score += 80;
      if (track && track.vssId && String(track.vssId).charAt(0) === '.') score += 30;
      return score;
    }

    function isEnglishLanguageCode(lang) {
      return String(lang || '').toLowerCase().split('-')[0] === 'en';
    }

    function fetchAutoSourceFallbackPair(tracks, selectedTrack, selectedIndex, targetLang) {
      var candidates = findAutoSourceCandidates(tracks, selectedTrack, selectedIndex, targetLang);

      function tryNext(offset) {
        if (offset >= candidates.length) return Promise.resolve(null);

        var item = candidates[offset];
        return fetchBestPair(item.track, null, targetLang, {
          deferTranscriptFallback: true
        }).then(function (result) {
          if (result && (result.cuesA.length || result.cuesB.length)) {
            result.index = item.index;
            result.track = item.track;
            return result;
          }
          return tryNext(offset + 1);
        }, function () {
          return tryNext(offset + 1);
        });
      }

      return tryNext(0);
    }

    function rememberCuePair(key, result) {
      if (!key || !result || !result.cuesB.length || result.targetRateLimited) return;
      if (!app.cueCache[key]) app.cueCacheOrder.push(key);
      app.cueCache[key] = {
        createdAt: Date.now(),
        cuesA: cloneCues(result.cuesA),
        cuesB: cloneCues(result.cuesB),
        fallback: app.lastFallback || result.fallback || '',
        sourceName: app.lastSourceName || '',
        asrSyncStatus: result.asrSyncStatus || 'off',
        asrSyncDetail: result.asrSyncDetail || ''
      };
      while (app.cueCacheOrder.length > CONFIG.cueCacheLimit) {
        delete app.cueCache[app.cueCacheOrder.shift()];
      }
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
      addWindowListener('keydown', handleShortcutKey);

      app.timers.urlPoll = window.setInterval(function () {
        if (location.href !== app.lastUrl) {
          handleNavigation('url-poll');
          return;
        }
        if (isWatchPage()) {
          if (!getVideo() || !getPlayer() || !uiMountedInBestHost()) {
            scheduleInit('url-poll-health', CONFIG.domDebounceMs);
            return;
          }
          ensureRuntimeHealthy('url-poll');
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

    function handleShortcutKey(event) {
      if (!event || !event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      if (isInteractiveTarget(event.target)) return;

      var key = String(event.key || '').toLowerCase();
      if (key === 'x') {
        event.preventDefault();
        setDualSubsEnabled(!state.enabled, 'shortcut-toggle');
      } else if (key === 'd') {
        event.preventDefault();
        cycleDisplayMode();
      } else if (key === 'r') {
        event.preventDefault();
        reloadDualSubsSoon('shortcut-reload');
      }
    }

    function cycleDisplayMode() {
      var order = ['dual', 'source', 'target'];
      var current = normalizeDisplayMode(state.displayMode);
      var index = order.indexOf(current);
      state.displayMode = order[(index + 1) % order.length];
      saveSettings(state);
      renderCurrentCaption();
      syncUi();
    }

    function handleNavigation(reason) {
      logger.debug('navigation', { reason: reason, href: location.href });
      scheduleInit(reason, CONFIG.initDelayMs);
    }

    function ensureRuntimeHealthy(reason) {
      if (!state.enabled || !isWatchPage() || !getVideo() || !getPlayer() || !uiMountedInBestHost()) return;
      if (app.loading || app.targetPending) return;
      if (app.backoffUntil && Date.now() < app.backoffUntil) return;

      var now = Date.now();
      var hasRenderableState = !!(app.cuesA.length || app.cuesB.length || app.nativeTargetFallback || app.machinePromptStatus === 'shown');
      if (hasRenderableState) {
        if (!app.loopId) {
          app.runtimeHealthStatus = 'restart-loop:' + (reason || 'health');
          startLoop();
        } else if (
          (app.loopLastRenderAt && now - app.loopLastRenderAt > CONFIG.runtimeRenderStaleMs) ||
          (!app.loopLastRenderAt && app.loopStartedAt && now - app.loopStartedAt > CONFIG.runtimeRenderStaleMs)
        ) {
          app.runtimeHealthStatus = 'restart-stale-loop:' + (reason || 'health') + ':' + (app.loopLastRenderAt ? now - app.loopLastRenderAt : now - app.loopStartedAt) + 'ms';
          startLoop();
        }
        return;
      }

      if (isSilentReadyPhase(app.phase)) {
        recoverRuntimeLoad(reason || 'health', 'silent-' + (app.phase || 'ready'));
        return;
      }

      if (app.loopId || !isRecoverableRuntimePhase(app.phase)) return;

      recoverRuntimeLoad(reason || 'health', app.phase || 'unknown');
    }

    function recoverRuntimeLoad(reason, detail) {
      var now = Date.now();
      var key = [getVideoId(), state.targetLang, state.sourceTrackIndex].join('|');
      if (app.runtimeHealthKey !== key) {
        app.runtimeHealthKey = key;
        app.runtimeHealthCount = 0;
        app.runtimeHealthReloadCount = 0;
      }
      if (app.runtimeHealthCount >= CONFIG.runtimeHealthMaxRecoveriesPerVideo) {
        app.runtimeHealthStatus = 'give-up:' + (detail || app.phase || '-');
        return;
      }
      if (now - (app.runtimeHealthAt || 0) < CONFIG.runtimeHealthMinIntervalMs) return;
      if (now - (app.runtimeHealthReloadAt || 0) < CONFIG.runtimeSilentReloadMinIntervalMs) return;

      app.runtimeHealthAt = now;
      app.runtimeHealthReloadAt = now;
      app.runtimeHealthCount += 1;
      app.runtimeHealthReloadCount += 1;
      app.runtimeHealthStatus = 'recover:' + (reason || 'health') + ':' + (detail || app.phase || '-') + ':' + app.runtimeHealthCount;
      scheduleInit('runtime-health-' + (reason || 'health'), 0);
    }

    function isSilentReadyPhase(phase) {
      return [
        'ready',
        'source-only',
        'target-loading'
      ].indexOf(phase || '') !== -1;
    }

    function isRecoverableRuntimePhase(phase) {
      return [
        'boot',
        'idle',
        'wait-player',
        'load-start',
        'wait-tracks',
        'wait-cues',
        'no-tracks',
        'no-cues',
        'load-error'
      ].indexOf(phase || '') !== -1;
    }

    function scheduleInit(reason, delayMs) {
      clearTimeout(app.timers.init);
      app.timers.init = window.setTimeout(function () {
        app.timers.init = 0;
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
      app.videoEpoch += 1;
      app.activeRequestId += 1;
      app.loading = false;
      app.defaultTrackIndex = -1;
      app.captionEnableClickAt = 0;
      app.captionEnableClickCount = 0;
      app.captionEnableClickKey = '';
      app.captionEnableStartedAt = 0;
      clearAsyncTimers('non-watch');
      app.lastCaptionSource = '';
      app.lastFallback = '';
      app.lastVideoId = '';
      app.lastSourceName = '';
      app.cuesA = [];
      app.cuesB = [];
      app.lastCueA = null;
      app.lastCueB = null;
      clearTargetPending();
      clearNativeTargetFallback();
      resetNativeTranslationTriggerState();
      clearMachineTranslateFallback();
      clearMachinePromptState();
      clearAsrSyncStatus();
      clearBackoffTimer();
      resetTargetRecoveryRetryState('non-watch');
      app.backoffUntil = 0;
      app.backoffSourceAvailable = false;
      clearFetchDiagnostics();
      app.tracks = [];
      app.trackRetryCount = 0;
      app.emptyCueRetryCount = 0;
      app.targetCueRetryCount = 0;
      app.pendingLoadKey = '';
      app.translationLanguages = [];
      resetPlayerApiPrimeState();
      resetRuntimeHealthState('idle');
      setPhase('idle');
      setStatus(TEXT.waitingWatchPage);
      stopLoop('non-watch');
      clearNativeCaptionWindow();
    }

    function resetVideoState(videoId, reason) {
      var previousVideoId = app.lastVideoId || '';
      logger.debug('reset video state', {
        from: previousVideoId,
        to: videoId || '',
        reason: reason || 'unknown'
      });
      app.videoEpoch += 1;
      app.activeRequestId += 1;
      app.loading = false;
      app.defaultTrackIndex = -1;
      clearAsyncTimers('video-reset');
      if (previousVideoId && previousVideoId !== videoId) {
        app.captionEnableClickAt = 0;
        app.captionEnableClickCount = 0;
        app.captionEnableClickKey = '';
        app.captionEnableStartedAt = 0;
      }
      app.lastCaptionSource = '';
      app.lastFallback = '';
      app.lastVideoId = videoId || '';
      app.lastSourceName = '';
      app.cuesA = [];
      app.cuesB = [];
      app.lastCueA = null;
      app.lastCueB = null;
      clearTargetPending();
      clearNativeTargetFallback();
      resetNativeTranslationTriggerState();
      clearMachineTranslateFallback();
      clearMachinePromptState();
      clearAsrSyncStatus();
      clearBackoffTimer();
      resetTargetRecoveryRetryState('video-reset');
      app.backoffUntil = 0;
      app.backoffSourceAvailable = false;
      clearFetchDiagnostics();
      app.tracks = [];
      app.trackRetryCount = 0;
      app.emptyCueRetryCount = 0;
      app.targetCueRetryCount = 0;
      app.pendingLoadKey = '';
      app.translationLanguages = [];
      resetPlayerApiPrimeState();
      resetRuntimeHealthState('video-reset');
      stopLoop('video-reset');
      clearNativeCaptionWindow();
      syncUi();
    }

    function resetRuntimeHealthState(status) {
      app.runtimeHealthAt = 0;
      app.runtimeHealthCount = 0;
      app.runtimeHealthKey = '';
      app.runtimeHealthReloadAt = 0;
      app.runtimeHealthReloadCount = 0;
      app.runtimeHealthStatus = status || 'ok';
      app.loopLastRenderAt = 0;
      app.loopLastRenderVideoTime = 0;
      app.loopStartedAt = 0;
      app.loopTickAt = 0;
      app.loopStopReason = status || '';
    }

    function resetPlayerApiPrimeState() {
      app.playerApiPrimeAt = 0;
      app.playerApiPrimeDetail = '';
      app.playerApiPrimeKey = '';
      app.playerApiPrimeOk = false;
      app.playerApiPrimeRetryCount = 0;
      app.playerApiPrimeStatus = '';
    }

    function loadDualSubs(force, reason) {
      if (!isWatchPage()) return;
      if (!state.enabled) {
        app.loading = false;
        app.pendingLoadKey = '';
        app.cuesA = [];
        app.cuesB = [];
        app.lastCueA = null;
        app.lastCueB = null;
        clearTargetPending();
        clearNativeTargetFallback();
        resetNativeTranslationTriggerState();
        clearMachineTranslateFallback();
        clearMachinePromptState();
        clearAsrSyncStatus();
        stopLoop('load-disabled');
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
        updateBackoffStatus();
        if ((app.cuesA.length || app.cuesB.length) && !app.loopId) startLoop();
        return;
      }

      app.pendingLoadKey = loadKey;
      app.loading = true;
      app.activeRequestId += 1;
      var requestId = app.activeRequestId;
      var sourcePreviewApplied = false;
      clearFetchDiagnostics();
      resetLoadTiming(reason);
      app.lastFallback = '';
      clearNativeTargetFallback();
      resetNativeTranslationTriggerState();
      clearMachineTranslateFallback();
      clearMachinePromptState();
      clearAsrSyncStatus();

      ensureCaptionsEnabled(videoId);
      setPhase('load-start');
      setStatus(TEXT.loading);

      getBestCaptionData(videoId).then(function (captionData) {
        if (!isActiveRequest(requestId, videoId)) return;
        markLoadTiming('captionDataMs');

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

        var selected = chooseTrack(tracks, state.sourceTrackIndex, state.targetLang, app.defaultTrackIndex);
        if (!selected.track) {
          app.loading = false;
          app.cuesA = [];
          app.cuesB = [];
          app.lastCueA = null;
          app.lastCueB = null;
          clearTargetPending();
          clearNativeTargetFallback();
          resetNativeTranslationTriggerState();
          clearMachineTranslateFallback();
          clearMachinePromptState();
          clearAsrSyncStatus();
          app.lastSourceName = TEXT.noTrack;
          stopLoop('no-track');

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

        var cueCacheKey = buildCueCacheKey(videoId, selected.track, state.targetLang);
        var cachedPair = shouldBypassCueCache(reason) ? null : getCachedCuePair(cueCacheKey);
        if (cachedPair) {
          if (cachedPair.sourceName) app.lastSourceName = cachedPair.sourceName;
          app.lastFallback = cachedPair.fallback ? cachedPair.fallback + ' | cache-hit' : 'cache-hit';
          syncUi();
          return applyLoadedCues(cachedPair, '', false);
        }

        logger.debug('track pair', {
          sourceLang: selected.track.languageCode || '',
          targetLang: state.targetLang,
          targetMode: 'translated'
        });

        app.playerApiPrimeRetryCount = 0;
        var playerPrime = primePlayerCaptionTranslation(videoId, selected.track, state.targetLang);
        if (!playerPrime.ok) schedulePlayerCaptionPrimeRetry(videoId, selected.track, state.targetLang, requestId);
        return fetchBestPair(selected.track, null, state.targetLang, {
          allowTargetWithoutSource: playerPrime && playerPrime.ok,
          preferNativeTarget: playerPrime && playerPrime.ok,
          targetRetryAttempt: app.targetCueRetryCount,
          onSourceCues: function (sourceCues) {
            enableMachineTranslateFallback(selected.track, state.targetLang, 'source-ready', 'primary');
            clearMachinePromptState();
            applySourcePreview(sourceCues);
          }
        }).then(function (result) {
          if (!isActiveRequest(requestId, videoId)) return;
          if (result.fallback) {
            app.lastFallback = app.lastFallback ? app.lastFallback + ' | ' + result.fallback : result.fallback;
          }

          return applyLoadedCues(result, cueCacheKey, true);
        });
      }).catch(function (err) {
        if (!isActiveRequest(requestId, videoId)) return;

        app.cuesA = [];
        app.cuesB = [];
        app.lastCueA = null;
        app.lastCueB = null;
        clearTargetPending();
        clearAsrSyncStatus();
        stopLoop('load-error');

        if (err && err.status === 429) {
          startBackoffCountdown(false, 'source-rate-limit-retry');
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

      function applyLoadedCues(result, cacheKey, shouldCache) {
        if (!isActiveRequest(requestId, videoId)) return;

        var hasSourceCues = !!(result.cuesA && result.cuesA.length);
        var hasTargetCues = !!(result.cuesB && result.cuesB.length);
        var hasCues = hasSourceCues || hasTargetCues;
        var shouldKeepWaitingForTarget = hasSourceCues && !hasTargetCues && state.targetLang && result.targetRetryable !== false;
        if (shouldCache && hasCues) rememberCuePair(cacheKey, result);

        if (result.targetRateLimited) {
          startBackoffCountdown(true, 'target-rate-limit-retry');
        } else {
          clearBackoffTimer();
          app.backoffUntil = 0;
          app.backoffSourceAvailable = false;
        }
        app.cuesA = result.cuesA || [];
        app.cuesB = result.cuesB || [];
        app.lastCueA = null;
        app.lastCueB = null;
        app.asrSyncStatus = result.asrSyncStatus || 'off';
        app.asrSyncDetail = result.asrSyncDetail || '';
        if (hasTargetCues) {
          clearNativeTargetFallback();
          resetNativeTranslationTriggerState();
          clearMachinePromptState();
          if (!isMachineTranslatePrimaryActive()) clearMachineTranslateFallback();
        } else if (shouldUseNativeTargetFallback(result, hasSourceCues, hasTargetCues)) {
          var nativeFallbackReason = getNativeTargetFallbackReason(result);
          enableNativeTargetFallback(nativeFallbackReason);
          if (shouldRetriggerNativeTranslation(result, hasSourceCues, hasTargetCues)) {
            scheduleNativeTranslationRetrigger(videoId, app.tracks[state.sourceTrackIndex], state.targetLang, requestId, nativeFallbackReason);
            scheduleNativeMenuTranslationTrigger(videoId, app.tracks[state.sourceTrackIndex], state.targetLang, requestId, nativeFallbackReason);
          }
          markLoadTiming('targetReadyMs');
        } else {
          clearNativeTargetFallback();
          resetNativeTranslationTriggerState();
        }
        var nativeFallbackText = app.nativeTargetFallback ? readNativeCaptionText() : '';
        var nativeHasTargetText = !!(nativeFallbackText && nativeTextMatchesTargetLanguage(nativeFallbackText, state.targetLang));
        if (nativeHasTargetText) {
          clearTargetRecoveryRetry('native-dom-target');
          clearMachinePromptState();
          if (!isMachineTranslatePrimaryActive()) clearMachineTranslateFallback();
        } else if (!hasTargetCues && shouldUseMachineTranslateFallback(result, hasSourceCues, hasTargetCues)) {
          enableMachineTranslateFallback(app.tracks[state.sourceTrackIndex], state.targetLang, 'target-429', 'primary');
          markLoadTiming('targetReadyMs');
          clearMachinePromptState();
        } else if (!hasTargetCues && shouldOfferMachinePrompt(result, hasSourceCues, hasTargetCues)) {
          showMachinePrompt(app.tracks[state.sourceTrackIndex], state.targetLang, 'target-429');
          markLoadTiming('targetReadyMs');
        } else if (!hasTargetCues && !isMachineTranslatePrimaryActive()) {
          clearMachineTranslateFallback();
          clearMachinePromptState();
        }
        if (hasTargetCues) {
          clearTargetRecoveryRetry('target-ok');
          markLoadTiming('targetReadyMs');
          clearTargetPending();
          app.targetCueRetryCount = 0;
        } else if (!shouldKeepWaitingForTarget) {
          clearTargetPending();
        }

        if (!hasCues && !app.nativeTargetFallback) {
          if (app.emptyCueRetryCount < CONFIG.maxEmptyCueRetries) {
            app.emptyCueRetryCount += 1;
            app.loading = false;
            app.pendingLoadKey = '';
            setPhase('wait-cues');
            setStatus(TEXT.waitingCues + ' (' + app.emptyCueRetryCount + '/' + CONFIG.maxEmptyCueRetries + ')');
            stopLoop('wait-cues');
            syncUi();
            scheduleInit('wait-cues', CONFIG.emptyCueRetryDelayMs);
            return;
          }
          app.emptyCueRetryCount = 0;
          setPhase('no-cues');
          setStatus(TEXT.noCue);
          stopLoop('no-cues');
          return;
        }

        app.emptyCueRetryCount = 0;
        if (result.targetRateLimited) {
          markTargetPending();
          updateBackoffStatus();
        } else if (shouldKeepWaitingForTarget && app.targetCueRetryCount < CONFIG.maxTargetCueRetries) {
          app.targetCueRetryCount += 1;
          app.targetRetryAt = Date.now() + CONFIG.targetCueRetryDelayMs;
          app.lastLoadTiming.targetEmptyRetries = app.targetCueRetryCount;
          incrementLoadTiming('targetEmptyPasses');
          markTargetPending();
          app.loading = false;
          app.pendingLoadKey = '';
          setPhase('target-loading');
          setStatus(TEXT.targetLoadingStatus + ' (' + app.targetCueRetryCount + '/' + CONFIG.maxTargetCueRetries + ')');
          startLoop();
          syncUi();
          scheduleInit('target-empty-retry', CONFIG.targetCueRetryDelayMs);
          return;
        } else {
          clearTargetPending();
          setPhase('ready');
          if (!hasTargetCues && hasSourceCues && app.nativeTargetFallback && !nativeHasTargetText && (result.targetErrorStatus === 429 || app.nativeTargetFallbackReason === 'target-empty-asr')) {
            scheduleTargetRecoveryRetry(videoId, app.tracks[state.sourceTrackIndex], state.targetLang, requestId, app.nativeTargetFallbackReason || 'target-429');
          }
          if (app.machineTranslateActive) {
            setStatus(TEXT.machineTranslateReady);
          } else if (app.machinePromptStatus === 'shown') {
            setStatus(TEXT.sourceOnly);
          } else if (app.nativeTargetFallback && nativeHasTargetText) {
            setStatus(TEXT.nativeTargetFallbackReady);
          } else if (!app.cuesB.length) {
            setStatus(TEXT.sourceOnly);
          } else {
            setStatus(TEXT.nativeReady);
          }
        }
        startLoop();
      }

      function applySourcePreview(sourceCues) {
        if (!isActiveRequest(requestId, videoId) || sourcePreviewApplied || !sourceCues || !sourceCues.length) return;

        sourcePreviewApplied = true;
        markLoadTiming('sourcePreviewMs');
        app.cuesA = sourceCues || [];
        app.cuesB = [];
        app.lastCueA = null;
        app.lastCueB = null;
        clearAsrSyncStatus();
        markTargetPending();
        setPhase('target-loading');
        setStatus(app.machineTranslateActive ? TEXT.machineTranslateReady : TEXT.targetLoadingStatus);
        startLoop();
        syncUi();
      }
    }

    function isRequestCurrent(requestId) {
      return requestId === app.activeRequestId;
    }

    function isActiveRequest(requestId, videoId) {
      return isRequestCurrent(requestId) && videoId === getVideoId() && isWatchPage();
    }

    function startLoop() {
      stopLoop('restart');
      app.loopStartedAt = Date.now();
      app.loopStartCount += 1;
      app.loopStopReason = '';

      function tick() {
        app.loopTickAt = Date.now();
        if (!isWatchPage()) {
          stopLoop('non-watch-tick');
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
      app.loopLastRenderAt = Date.now();
      app.loopLastRenderVideoTime = Number(video.currentTime) || 0;

      var mode = normalizeDisplayMode(state.displayMode);
      var resolvedA = mode === 'target' ? null : findCueText(app.cuesA, video.currentTime, app.lastCueA);
      var resolvedB = mode === 'source' ? null : findCueText(app.cuesB, video.currentTime, app.lastCueB);
      var textA = resolvedA ? resolvedA.text : '';
      var fallbackTextB = resolvedB ? resolvedB.text : '';
      var textB = '';
      var nativeTargetText = '';
      var bridgedNativeTarget = false;
      var machineState = null;
      if (app.machineTranslateActive && resolvedA && resolvedA.text && mode !== 'source') {
        machineState = getMachineTranslationState(resolvedA.text);
        if (machineState.text) {
          textB = machineState.text;
        } else if (machineState.pending) {
          textB = TEXT.machineTranslating;
        }
      }
      if (!textB) textB = fallbackTextB;
      if (!textB && !app.targetPending && app.nativeTargetFallback && mode !== 'source') {
        syncNativeCaptionObserver('render');
        nativeTargetText = readNativeCaptionText() || '';
      }
      if (!textB && nativeTargetText && shouldUseNativeTargetText(nativeTargetText, textA)) {
        textB = nativeTargetText;
        bridgedNativeTarget = true;
      }
      if (bridgedNativeTarget) {
        clearTargetRecoveryRetry('native-dom-target');
      }
      if (bridgedNativeTarget && app.machinePromptStatus !== 'off') {
        clearMachinePromptState();
        syncUi();
      }
      var preserveNativeTarget = false;
      var reserveNativeTargetSpace = !!(preserveNativeTarget && !textB);
      if (app.nativeTargetFallback) {
        app.nativeTargetFallbackText = nativeTargetText;
      } else if (!app.nativeTargetFallback) {
        app.nativeTargetFallbackText = '';
      }
      app.nativeTargetFallbackPreserve = preserveNativeTarget;
      if (!textB && app.targetPending && mode !== 'source' && (!app.machineTranslateActive || (machineState && machineState.failed))) textB = formatTargetLoadingText();
      var showMachinePrompt = !!(!textB && !app.targetPending && app.machinePromptStatus === 'shown' && resolvedA && resolvedA.text && mode !== 'source');
      app.lastCueA = resolvedA && resolvedA.text ? resolvedA : null;
      app.lastCueB = resolvedB && resolvedB.text ? resolvedB : null;
      renderNativeCaption(normalizeCueTextForDisplay(textA), normalizeCueTextForDisplay(textB), {
        preserveNativeCaptions: preserveNativeTarget,
        reserveNativeCaptionSpace: reserveNativeTargetSpace,
        machinePrompt: showMachinePrompt,
        onMachinePromptAccept: acceptMachinePrompt,
        onMachinePromptDismiss: dismissMachinePrompt
      });
    }

    function stopLoop(reason) {
      if (app.loopId) cancelAnimationFrame(app.loopId);
      app.loopId = 0;
      app.loopStopReason = reason || app.loopStopReason || 'stop';
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
          kind: describeCaptionTrackKind(app.tracks[i]),
          hasBaseUrl: !!app.tracks[i].baseUrl
        });
      }

      return {
        captionSource: app.lastCaptionSource,
        captionButton: getCaptionButtonSnapshot(),
        backoffRemainingMs: app.backoffUntil ? Math.max(0, app.backoffUntil - Date.now()) : 0,
        cueCacheSize: Object.keys(app.cueCache).length,
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
        asrSync: app.asrSyncStatus || 'off',
        asrSyncDetail: app.asrSyncDetail || '',
        nativeTimedTextHint: describeNativeTimedTextHint(),
        nativeTargetFallback: app.nativeTargetFallback,
        nativeTargetFallbackPreserve: app.nativeTargetFallbackPreserve,
        nativeTargetFallbackReason: app.nativeTargetFallbackReason,
        nativeTargetFallbackText: app.nativeTargetFallbackText,
        nativeDomObserver: formatNativeDomObserverStatus(),
        nativeDomObserverAt: app.nativeDomObserverAt,
        nativeTranslationTrigger: formatNativeTranslationTriggerStatus(),
        nativeTranslationTriggerCount: app.nativeTranslationTriggerCount,
        nativeMenuTrigger: formatNativeMenuTriggerStatus(),
        nativeMenuTriggerCount: app.nativeMenuTriggerCount,
        nativeMenuTriggerTrace: app.nativeMenuTriggerTrace,
        nativeDomText: readNativeCaptionText() || '',
        machineTranslateAvailable: CONFIG.machineTranslateFallbackEnabled,
        machineTranslateSetting: state.machineTranslateFallback,
        machineTranslateActive: app.machineTranslateActive,
        machineTranslateReason: app.machineTranslateReason,
        machineTranslateMode: app.machineTranslateMode,
        machineTranslateCacheSize: app.machineTranslateCacheOrder.length,
        machineTranslatePendingCount: Object.keys(app.machineTranslatePending).length,
        machineTranslateLast: app.machineTranslateLast,
        machinePromptStatus: app.machinePromptStatus,
        machinePromptReason: app.machinePromptReason,
        machinePromptKey: app.machinePromptKey,
        pageType: isWatchPage() ? 'watch' : 'other',
        phase: app.phase,
        runtimeHealth: app.runtimeHealthStatus,
        runtimeHealthRecoveries: app.runtimeHealthCount,
        runtimeHeartbeat: formatRuntimeHeartbeat(),
        loopRunning: !!app.loopId,
        loopLastRenderElapsedMs: app.loopLastRenderAt ? Math.max(0, Date.now() - app.loopLastRenderAt) : -1,
        loopLastRenderVideoTime: app.loopLastRenderVideoTime,
        loopStartCount: app.loopStartCount,
        staleTimerCleared: formatStaleTimerClearedStatus(),
        staleTimerClearedCount: app.staleTimerClearedCount,
        playerApiPrime: formatPlayerApiPrimeStatus(),
        playerApiPrimeOk: app.playerApiPrimeOk,
        source: app.lastSourceName,
        sourceKind: describeCaptionTrackKind(app.tracks[state.sourceTrackIndex]),
        status: app.status,
        enabled: state.enabled,
        displayMode: state.displayMode,
        smartPosition: state.smartPosition,
        syncNativeStyle: state.syncNativeStyle,
        targetPending: app.targetPending,
        targetPendingElapsedMs: app.targetPendingStartedAt ? Math.max(0, Date.now() - app.targetPendingStartedAt) : 0,
        targetCueRetryCount: app.targetCueRetryCount,
        targetRetryRemainingMs: app.targetRetryAt ? Math.max(0, app.targetRetryAt - Date.now()) : 0,
        targetRecoveryRetry: formatTargetRecoveryRetryStatus(),
        targetRecoveryRetryCount: app.targetRecoveryRetryCount,
        targetRecoveryRetryRemainingMs: app.targetRecoveryRetryAt ? Math.max(0, app.targetRecoveryRetryAt - Date.now()) : 0,
        timing: getLoadTimingSnapshot(),
        transcriptTrigger: describeTranscriptTrigger(),
        tracks: tracks,
        targetLang: state.targetLang,
        translationLanguages: app.translationLanguages,
        translationRequest: describeTranslationRequest(),
        translationResult: describeTranslationResult(),
        url: location.href,
        version: SCRIPT_VERSION,
        videoId: getVideoId()
      };
    }

    function getCaptionButtonSnapshot() {
      var button = document.querySelector(CONFIG.selectors.subtitlesButton);
      return {
        clicked: app.captionEnableClickCount,
        exists: !!button,
        key: app.captionEnableClickKey || '',
        pressed: button ? button.getAttribute('aria-pressed') || '' : '',
        startedMs: app.captionEnableStartedAt ? Math.max(0, Date.now() - app.captionEnableStartedAt) : 0
      };
    }

    function formatPlayerApiPrimeStatus() {
      if (!app.playerApiPrimeStatus) return '';
      return app.playerApiPrimeDetail ? app.playerApiPrimeStatus + ':' + app.playerApiPrimeDetail : app.playerApiPrimeStatus;
    }

    function formatNativeTargetFallbackStatus(snapshot) {
      if (!snapshot || !snapshot.nativeTargetFallback) return 'off';
      return 'on:' + (snapshot.nativeTargetFallbackReason || '-') +
        ',preserve=' + (snapshot.nativeTargetFallbackPreserve ? 'yes' : 'no') +
        ',text=' + (snapshot.nativeTargetFallbackText ? 'yes' : 'no');
    }

    function formatNativeTranslationTriggerStatus() {
      if (!app.nativeTranslationTriggerStatus) return 'off';
      return app.nativeTranslationTriggerStatus + ':' + (app.nativeTranslationTriggerDetail || '-');
    }

    function formatNativeMenuTriggerStatus() {
      if (!app.nativeMenuTriggerStatus) return 'off';
      return app.nativeMenuTriggerStatus + ':' + (app.nativeMenuTriggerDetail || '-');
    }

    function formatNativeDomObserverStatus() {
      return app.nativeDomObserverStatus || 'off';
    }

    function formatRuntimeHeartbeat() {
      var now = Date.now();
      return [
        'loop:' + (app.loopId ? 'on' : 'off'),
        'last:' + (app.loopLastRenderAt ? Math.max(0, now - app.loopLastRenderAt) + 'ms' : '-'),
        'tick:' + (app.loopTickAt ? Math.max(0, now - app.loopTickAt) + 'ms' : '-'),
        'starts:' + app.loopStartCount,
        'stop:' + (app.loopStopReason || '-')
      ].join(',');
    }

    function formatStaleTimerClearedStatus() {
      if (!app.staleTimerClearedCount) return '0';
      return app.staleTimerClearedCount + ':' + (app.staleTimerClearedStatus || '-');
    }

    function formatTargetRecoveryRetryStatus() {
      if (!app.targetRecoveryRetryStatus || app.targetRecoveryRetryStatus === 'off') return 'off';
      return app.targetRecoveryRetryStatus + ',next=' + (app.targetRecoveryRetryAt ? Math.max(0, app.targetRecoveryRetryAt - Date.now()) : 0) + 'ms';
    }

    function formatNativeDomTextStatus(snapshot) {
      var text = snapshot && snapshot.nativeDomText ? normalizeCueTextForDisplay(snapshot.nativeDomText) : '';
      if (!text) return 'text=no,target=no';
      return 'text=yes,target=' + (nativeTextMatchesTargetLanguage(text, snapshot.targetLang) ? 'yes' : 'no') +
        ',sample=' + text.slice(0, 32);
    }

    function formatMachineTranslationStatus(snapshot) {
      if (snapshot && snapshot.machineTranslateAvailable === false) return 'disabled';
      if (!snapshot || !snapshot.machineTranslateActive) {
        if (snapshot && snapshot.machinePromptStatus === 'shown') return 'prompt';
        return snapshot && snapshot.machineTranslateSetting ? 'standby' : 'off';
      }
      return (snapshot.machineTranslateMode || 'on') + ':' + (snapshot.machineTranslateReason || '-') +
        ',cache=' + snapshot.machineTranslateCacheSize +
        ',pending=' + snapshot.machineTranslatePendingCount +
        ',last=' + (snapshot.machineTranslateLast || '-');
    }

    function formatMachinePromptStatus(snapshot) {
      if (!snapshot) return 'off';
      if (!snapshot.machinePromptStatus || snapshot.machinePromptStatus === 'off') return 'off';
      return snapshot.machinePromptStatus + ':' + (snapshot.machinePromptReason || '-');
    }

    function describeTranslationRequest() {
      var target = fetchDiagnostics.target || '';
      if (!target) return '';
      if (target.indexOf('skip-source-empty') !== -1) return 'skipped-source-empty';
      if (target.indexOf(':native') !== -1) return 'native';
      if (target.indexOf('->') !== -1) return 'plain';
      return 'unknown';
    }

    function describeTranslationResult() {
      var target = fetchDiagnostics.target || '';
      if (!target) return '';
      if (target.indexOf('skip-source-empty') !== -1) return 'skipped';
      if (/ok\(([1-9]\d*),/.test(target)) return 'ok';
      if (target.indexOf('status=429') !== -1) return '429';
      if (target.indexOf('err(') !== -1 || target.indexOf('target-error-kept-source') !== -1) return 'error';
      if (/ok\(0,/.test(target)) return 'empty';
      return 'pending';
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
    if (!CONFIG.machineTranslateFallbackEnabled) {
      merged.machineTranslateFallback = false;
      merged.machineTranslateFallbackUserSet = false;
    } else if (!stored || typeof stored !== 'object' || !stored.machineTranslateFallbackUserSet) {
      merged.machineTranslateFallback = true;
      merged.machineTranslateFallbackUserSet = false;
    }
    if (stored && typeof stored === 'object' && String(stored.targetColor || '').toLowerCase() === '#00e5ff') {
      merged.targetColor = DEFAULTS.targetColor;
    }
    if (!stored || typeof stored !== 'object' || !Object.prototype.hasOwnProperty.call(stored, 'targetLang')) {
      delete merged.targetLang;
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
      syncNativeStyle: false,
      machineTranslateFallback: !!normalized.machineTranslateFallback,
      machineTranslateFallbackUserSet: !!normalized.machineTranslateFallbackUserSet
    });
  }

  function normalizeSettings(input) {
    var output = {};
    var key;
    var defaultTargetLang = inferDefaultTargetLang();
    var explicitTargetLang = input && Object.prototype.hasOwnProperty.call(input, 'targetLang') ? input.targetLang : '';
    input = input || {};
    for (key in DEFAULTS) output[key] = DEFAULTS[key];
    for (key in input) output[key] = input[key];

    output.debug = !!output.debug;
    output.enabled = output.enabled !== false;
    output.panelOpen = false;
    output.launcherPosition = normalizePosition(output.launcherPosition);
    output.panelPosition = normalizePosition(output.panelPosition);
    output.sourceTrackIndex = Math.max(0, parseInt(output.sourceTrackIndex || '0', 10) || 0);
    output.targetLang = String(explicitTargetLang || defaultTargetLang || DEFAULTS.targetLang).trim() || DEFAULTS.targetLang;
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
    output.syncNativeStyle = false;
    output.machineTranslateFallback = !!output.machineTranslateFallback;
    output.machineTranslateFallbackUserSet = !!output.machineTranslateFallbackUserSet;
    return output;
  }

  function inferDefaultTargetLang() {
    var languages = [];
    var i;
    try {
      if (navigator.languages && navigator.languages.length) {
        for (i = 0; i < navigator.languages.length; i++) languages.push(navigator.languages[i]);
      }
      if (navigator.language) languages.push(navigator.language);
      if (document.documentElement && document.documentElement.lang) languages.push(document.documentElement.lang);
    } catch (err) {}

    for (i = 0; i < languages.length; i++) {
      var mapped = mapLocaleToTranslationLanguage(languages[i]);
      if (mapped && mapped !== 'en') return mapped;
    }

    return DEFAULTS.targetLang;
  }

  function mapLocaleToTranslationLanguage(value) {
    var text = String(value || '').trim();
    var lower = text.toLowerCase();
    if (!lower) return '';
    if (lower === 'zh' || lower.indexOf('zh-cn') === 0 || lower.indexOf('zh-sg') === 0 || lower.indexOf('zh-hans') === 0) return 'zh-Hans';
    if (lower.indexOf('zh-tw') === 0 || lower.indexOf('zh-hk') === 0 || lower.indexOf('zh-mo') === 0 || lower.indexOf('zh-hant') === 0) return 'zh-Hant';
    if (lower.indexOf('pt-br') === 0) return 'pt';
    if (lower.indexOf('pt-pt') === 0) return 'pt-PT';
    return lower.split('-')[0];
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
      var start = Math.max(0, entries.length - CONFIG.nativeTimedTextPerformanceScanLimit);
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
      url: parsed.toString(),
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

  function waitForNativeTimedTextHint(track, timeoutMs) {
    if (getNativeTimedTextHint(track)) return Promise.resolve(true);
    if (window.__ydsHarnessShimInstalled && !window.__ydsHarnessAllowNativeHintWait) return Promise.resolve(false);

    return waitFor(function () {
      return getNativeTimedTextHint(track);
    }, typeof timeoutMs === 'number' ? timeoutMs : CONFIG.nativeTimedTextHintWaitMs, 80).then(function (hint) {
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

  function clearNativeCaptionWindow() {
    var container = getCaptionContainer();
    if (container) container.classList.remove('yds-native-mode');
    var node = document.getElementById(CONFIG.ids.nativeWindow);
    if (node) node.remove();
  }

  function preserveYouTubeNativeCaptionWindow() {
    var container = getCaptionContainer();
    if (container) container.classList.remove('yds-native-mode');
  }

  function ensureNativeCaptionWindow(preserveNativeCaptions) {
    var container = getCaptionContainer();
    var player = getPlayer();
    if (!player) return null;

    if (container) container.classList.toggle('yds-native-mode', !preserveNativeCaptions);
    var node = document.getElementById(CONFIG.ids.nativeWindow);
    if (!node) {
      node = document.createElement('div');
      node.id = CONFIG.ids.nativeWindow;
      node.className = 'yds-native-window';

      var lineA = document.createElement('div');
      lineA.className = 'yds-native-line yds-native-line-a';

      var lineB = document.createElement('div');
      lineB.className = 'yds-native-line yds-native-line-b';

      var prompt = document.createElement('div');
      prompt.className = 'yds-machine-prompt';
      var promptLabel = document.createElement('span');
      promptLabel.className = 'yds-machine-prompt-label';
      promptLabel.textContent = TEXT.machinePromptStatus;
      var promptAccept = document.createElement('button');
      promptAccept.className = 'yds-machine-prompt-accept';
      promptAccept.type = 'button';
      promptAccept.textContent = TEXT.machinePromptAccept;
      var promptDismiss = document.createElement('button');
      promptDismiss.className = 'yds-machine-prompt-dismiss';
      promptDismiss.type = 'button';
      promptDismiss.textContent = TEXT.machinePromptDismiss;
      promptAccept.addEventListener('click', function (event) {
        event.preventDefault();
        event.stopPropagation();
        if (typeof node.__ydsOnMachinePromptAccept === 'function') node.__ydsOnMachinePromptAccept();
      });
      promptDismiss.addEventListener('click', function (event) {
        event.preventDefault();
        event.stopPropagation();
        if (typeof node.__ydsOnMachinePromptDismiss === 'function') node.__ydsOnMachinePromptDismiss();
      });
      prompt.appendChild(promptLabel);
      prompt.appendChild(promptAccept);
      prompt.appendChild(promptDismiss);

      node.appendChild(lineA);
      node.appendChild(lineB);
      node.appendChild(prompt);
      player.appendChild(node);
    } else if (node.parentNode !== player) {
      player.appendChild(node);
    }
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
    var bottom = getSubtitleBottomPercent();
    if (node.classList.contains('yds-native-target-fallback')) bottom = Math.min(34, bottom + 10);
    node.style.bottom = bottom + '%';

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
    var hiddenBase = clampNumber(CONFIG.subtitleHiddenControlsBottomPercent, 2, 28, 2);

    var player = getPlayer();
    var controls = player ? player.querySelector(CONFIG.selectors.playerControls) : null;
    if (!player || !controls || !player.clientHeight) return hiddenBase;

    var style = window.getComputedStyle(controls);
    var controlsVisible = !player.classList.contains('ytp-autohide') &&
      style.display !== 'none' &&
      style.visibility !== 'hidden' &&
      controls.offsetHeight > 0;
    if (!controlsVisible) return hiddenBase;

    var controlsPercent = Math.ceil((controls.offsetHeight / player.clientHeight) * 100) + 3;
    var maxOffset = isLargePlayerMode(player) ? 22 : 28;
    return Math.max(base, Math.min(maxOffset, controlsPercent));
  }

  function isLargePlayerMode(player) {
    if (!player) return false;
    if (document.fullscreenElement && (document.fullscreenElement === player || document.fullscreenElement.contains(player))) return true;
    return player.classList.contains('ytp-fullscreen') ||
      player.classList.contains('ytp-big-mode') ||
      player.classList.contains('ytp-large-width-mode');
  }

  function readNativeCaptionText() {
    var nodes = getNativeCaptionTextNodes('.caption-window .ytp-caption-segment, .ytp-caption-segment');
    if (!nodes.length) nodes = getNativeCaptionTextNodes('.caption-visual-line');

    var texts = [];
    var seen = {};
    var i;
    for (i = 0; i < nodes.length; i++) {
      if (nodes[i].closest && nodes[i].closest('#' + CONFIG.ids.nativeWindow)) continue;
      var text = normalizeCueTextForDisplay(nodes[i].textContent || '');
      if (!text || seen[text]) continue;
      seen[text] = true;
      texts.push(text);
    }
    return texts.join(' ');
  }

  function shouldUseNativeTargetText(nativeText, sourceText) {
    var target = normalizeCueTextForDisplay(nativeText);
    if (!target) return false;
    if (!nativeTextMatchesTargetLanguage(target, state.targetLang)) return false;
    var source = normalizeCueTextForDisplay(sourceText);
    if (!source) return true;
    return normalizeCompareText(target) !== normalizeCompareText(source);
  }

  function nativeTextMatchesTargetLanguage(text, targetLang) {
    var value = String(text || '');
    var lang = String(targetLang || '').toLowerCase().split('-')[0];
    if (!lang) return true;
    if (lang === 'zh') return /[\u3400-\u9fff\uf900-\ufaff]/.test(value);
    if (lang === 'ja') return /[\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff]/.test(value);
    if (lang === 'ko') return /[\uac00-\ud7af\u1100-\u11ff]/.test(value);
    if (lang === 'ru' || lang === 'uk' || lang === 'bg' || lang === 'sr') return /[\u0400-\u04ff]/.test(value);
    if (lang === 'ar' || lang === 'fa' || lang === 'ur') return /[\u0600-\u06ff]/.test(value);
    if (lang === 'th') return /[\u0e00-\u0e7f]/.test(value);
    if (lang === 'he') return /[\u0590-\u05ff]/.test(value);
    if (lang === 'hi' || lang === 'mr' || lang === 'ne') return /[\u0900-\u097f]/.test(value);
    return true;
  }

  function getNativeCaptionTextNodes(selector) {
    var container = getCaptionContainer();
    var nodes = container ? Array.prototype.slice.call(container.querySelectorAll(selector)) : [];
    if (!nodes.length) nodes = Array.prototype.slice.call(document.querySelectorAll(selector));
    return nodes;
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

  function buildSubtitleStyleKey(showA, showB, showPrompt) {
    return [
      showA ? 'a' : '-',
      showB ? 'b' : '-',
      showPrompt ? 'prompt' : '-',
      state.displayMode,
      state.sourceFontSize,
      state.targetFontSize,
      state.lineGap,
      state.bottomOffset,
      state.fontFamily,
      state.sourceColor,
      state.targetColor
    ].join('|');
  }

  function renderNativeCaption(textA, textB, options) {
    options = options || {};
    var showPrompt = !!options.machinePrompt;
    if (!textA && !textB && !showPrompt) {
      clearNativeCaptionWindow();
      return;
    }

    var node = ensureNativeCaptionWindow(!!options.preserveNativeCaptions);
    if (!node) return;

    var lineA = node.querySelector('.yds-native-line-a');
    var lineB = node.querySelector('.yds-native-line-b');
    var prompt = node.querySelector('.yds-machine-prompt');
    if (!lineA || !lineB) return;

    var showA = !!textA;
    var showB = !!textB;
    var reserveNativeCaptionSpace = !!options.reserveNativeCaptionSpace;
    var displayA = showA ? 'block' : 'none';
    var displayB = showB ? 'block' : 'none';
    var displayPrompt = showPrompt ? 'flex' : 'none';
    var changed = false;
    node.__ydsOnMachinePromptAccept = options.onMachinePromptAccept || null;
    node.__ydsOnMachinePromptDismiss = options.onMachinePromptDismiss || null;

    if (node.classList.contains('yds-native-target-fallback') !== reserveNativeCaptionSpace) {
      node.classList.toggle('yds-native-target-fallback', reserveNativeCaptionSpace);
      changed = true;
    }

    if (node.__ydsTextA !== textA) {
      lineA.textContent = textA || '';
      node.__ydsTextA = textA || '';
      changed = true;
    }
    if (node.__ydsTextB !== textB) {
      lineB.textContent = textB || '';
      node.__ydsTextB = textB || '';
      changed = true;
    }
    if (lineA.style.display !== displayA) {
      lineA.style.display = displayA;
      changed = true;
    }
    if (lineB.style.display !== displayB) {
      lineB.style.display = displayB;
      changed = true;
    }
    if (prompt && prompt.style.display !== displayPrompt) {
      prompt.style.display = displayPrompt;
      changed = true;
    }

    var now = Date.now();
    var styleKey = buildSubtitleStyleKey(showA, showB, showPrompt);
    if (changed || node.__ydsStyleKey !== styleKey || now - (node.__ydsStyleAt || 0) > CONFIG.renderStyleRefreshMs) {
      applySubtitleStyle(node);
      node.__ydsStyleKey = styleKey;
      node.__ydsStyleAt = now;
    }
  }

  function normalizeCueTextForDisplay(text) {
    return String(text || '').replace(/\s+/g, ' ').trim();
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

  function findCueText(cues, time, previous) {
    var tolerance = CONFIG.cueTimeToleranceMs / 1000;
    var hold = CONFIG.cueGapHoldMs / 1000;
    var left = 0;
    var right = cues.length - 1;
    while (left <= right) {
      var mid = (left + right) >> 1;
      var cue = cues[mid];
      if (time < cue.start - tolerance) {
        right = mid - 1;
      } else if (time > cue.end + tolerance) {
        left = mid + 1;
      } else {
        return {
          text: cue.text,
          start: cue.start,
          end: cue.end
        };
      }
    }
    if (previous && previous.text && time > previous.end && time <= previous.end + hold) {
      return previous;
    }
    return null;
  }

  function chooseTrack(tracks, preferredIndex, targetLang, defaultIndex) {
    if (!tracks.length) return { index: 0, track: null };

    var index = findPreferredSourceTrackIndex(tracks, preferredIndex, targetLang, defaultIndex);
    if (index === -1) index = clampIndex(preferredIndex, tracks.length);
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

  function findPreferredSourceTrackIndex(tracks, preferredIndex, targetLang, defaultIndex) {
    var preferred = clampIndex(preferredIndex, tracks.length);
    var preferredTrack = getUsableTrack(tracks[preferred]) ? tracks[preferred] : null;

    if (preferred > 0 && preferredTrack && !isSameLanguageFamily(preferredTrack.languageCode, targetLang)) {
      return preferred;
    }

    if (preferredTrack && isPreferredEnglishSourceTrack(preferredTrack)) return preferred;

    if (typeof defaultIndex === 'number' && defaultIndex >= 0 && defaultIndex < tracks.length) {
      if (getUsableTrack(tracks[defaultIndex]) && !isSameLanguageFamily(tracks[defaultIndex].languageCode, targetLang)) {
        return defaultIndex;
      }
    }

    var englishIndex = findTrackIndex(tracks, function (item) {
      return getUsableTrack(item) && !isSameLanguageFamily(item.languageCode, targetLang) && isPreferredEnglishSourceTrack(item);
    });
    if (englishIndex !== -1) return englishIndex;

    if (preferredTrack && !isSameLanguageFamily(preferredTrack.languageCode, targetLang)) return preferred;

    return findTrackIndex(tracks, function (item) {
      return getUsableTrack(item) && !isSameLanguageFamily(item.languageCode, targetLang);
    });
  }

  function isPreferredEnglishSourceTrack(track) {
    var lang = String(track && track.languageCode || '').toLowerCase();
    var name = getTrackName(track);
    return lang.split('-')[0] === 'en' || /english/i.test(name);
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

  function isSameLanguageFamily(left, right) {
    var a = String(left || '').toLowerCase().split('-')[0];
    var b = String(right || '').toLowerCase().split('-')[0];
    return !!a && !!b && a === b;
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

  function describeCaptionTrackKind(track) {
    if (!track) return 'unknown';
    return isAutoGeneratedCaptionTrack(track) ? 'asr' : 'manual';
  }

  function isAutoGeneratedCaptionTrack(track) {
    if (!track) return false;
    var kind = String(track.kind || track.captionTrackKind || '').toLowerCase();
    if (kind === 'asr') return true;

    var vssId = getTrackVssId(track);
    if (/^a\./i.test(vssId)) return true;

    try {
      if (track.baseUrl) {
        var parsed = new URL(track.baseUrl, location.href);
        if (String(parsed.searchParams.get('kind') || '').toLowerCase() === 'asr') return true;
      }
    } catch (err) {}

    return /auto|generated|自动|自動|自动产生|自動產生/i.test(getTrackName(track));
  }

  function buildPlayerApiPrimeKey(videoId, track, targetLang) {
    if (!track || !targetLang) return '';
    return [
      videoId || getVideoId() || '',
      getTrackLanguageCode(track),
      getTrackVssId(track),
      getTrackName(track),
      targetLang || ''
    ].join('|');
  }

  function findPlayerCaptionTrack(tracklist, sourceTrack) {
    if (!sourceTrack || !tracklist || !tracklist.length) return null;

    var sourceVssId = getTrackVssId(sourceTrack);
    var sourceLang = getTrackLanguageCode(sourceTrack);
    var sourceName = normalizeCompareText(getTrackName(sourceTrack));
    var i;

    if (sourceVssId) {
      for (i = 0; i < tracklist.length; i++) {
        if (getTrackVssId(tracklist[i]) === sourceVssId) return tracklist[i];
      }
    }

    for (i = 0; i < tracklist.length; i++) {
      if (getTrackLanguageCode(tracklist[i]) === sourceLang && normalizeCompareText(readPlayerCaptionTrackName(tracklist[i])) === sourceName) {
        return tracklist[i];
      }
    }

    for (i = 0; i < tracklist.length; i++) {
      if (getTrackLanguageCode(tracklist[i]) === sourceLang) return tracklist[i];
    }

    for (i = 0; i < tracklist.length; i++) {
      if (isSameLanguageFamily(getTrackLanguageCode(tracklist[i]), sourceLang)) return tracklist[i];
    }

    return null;
  }

  function buildPlayerCaptionTrackFromSource(track) {
    if (!track) return null;
    var languageCode = getTrackLanguageCode(track);
    if (!languageCode) return null;

    var label = getTrackName(track);
    var vssId = getTrackVssId(track);
    var isAsr = isAutoGeneratedCaptionTrack(track);
    if (!vssId) vssId = (isAsr ? 'a.' : '.') + languageCode;

    return {
      languageCode: languageCode,
      languageName: label,
      displayName: label,
      kind: isAsr ? 'asr' : (track.kind || ''),
      name: track.trackName || '',
      id: track.id || null,
      is_servable: false,
      is_default: false,
      is_translateable: track.isTranslatable !== false,
      isTranslatable: track.isTranslatable !== false,
      vss_id: vssId,
      vssId: vssId
    };
  }

  function ensurePlayerCaptionTrackMetadata(playerTrack, sourceTrack) {
    if (!playerTrack) return null;
    var track = clonePlainObject(playerTrack);
    var languageCode = getTrackLanguageCode(track) || getTrackLanguageCode(sourceTrack);
    var vssId = getTrackVssId(track) || getTrackVssId(sourceTrack);
    var isAsr = isAutoGeneratedCaptionTrack(sourceTrack) || isAutoGeneratedCaptionTrack(track);

    if (languageCode) track.languageCode = languageCode;
    if (isAsr) track.kind = 'asr';
    if (!vssId && languageCode) vssId = (isAsr ? 'a.' : '.') + languageCode;
    if (vssId) {
      track.vss_id = vssId;
      track.vssId = vssId;
    }
    if (!track.languageName) track.languageName = getTrackName(sourceTrack) || readPlayerCaptionTrackName(track);
    if (!track.displayName) track.displayName = track.languageName;
    if (typeof track.is_translateable === 'undefined') track.is_translateable = true;
    if (typeof track.isTranslatable === 'undefined') track.isTranslatable = true;
    return track;
  }

  function findPlayerTranslationLanguage(languages, targetLang) {
    if (!targetLang || !languages || !languages.length) return null;

    var normalizedTarget = normalizeLanguageCode(targetLang);
    var i;
    for (i = 0; i < languages.length; i++) {
      if (normalizeLanguageCode(languages[i] && languages[i].languageCode) === normalizedTarget) return languages[i];
    }

    for (i = 0; i < languages.length; i++) {
      if (isSameLanguageFamily(languages[i] && languages[i].languageCode, targetLang)) return languages[i];
    }

    return null;
  }

  function isPlayerCaptionTranslationApplied(player, targetLang) {
    if (!player || typeof player.getOption !== 'function' || !targetLang) return false;
    var current = player.getOption('captions', 'track');
    var translation = current && current.translationLanguage;
    if (!translation || !translation.languageCode) return false;
    return normalizeLanguageCode(translation.languageCode) === normalizeLanguageCode(targetLang);
  }

  function clonePlainObject(value) {
    var result = {};
    var key;
    value = value || {};
    for (key in value) result[key] = value[key];
    return result;
  }

  function cloneTranslationLanguage(language, fallbackCode) {
    var clone = clonePlainObject(language);
    if (!clone.languageCode) clone.languageCode = fallbackCode || '';
    if (!clone.languageName) clone.languageName = readTranslationLanguageName(language) || clone.languageCode;
    return clone;
  }

  function getTrackLanguageCode(track) {
    return String(track && (track.languageCode || track.language_code || track.lang || track.lang_code || '') || '').trim();
  }

  function getTrackVssId(track) {
    return String(track && (track.vssId || track.vss_id || '') || '').trim();
  }

  function normalizeLanguageCode(value) {
    return String(value || '').trim().replace(/_/g, '-').toLowerCase();
  }

  function normalizeCompareText(value) {
    return String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
  }

  function readPlayerCaptionTrackName(track) {
    if (!track) return '';
    return readText(track.name) ||
      readText(track.languageName) ||
      readText(track.displayName) ||
      String(track.vssId || track.vss_id || '').trim();
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

  function httpGet(url, headers, timeoutMs) {
    return new Promise(function (resolve, reject) {
      GM_xmlhttpRequest({
        method: 'GET',
        url: url,
        headers: headers || {
          'Referer': 'https://www.youtube.com/',
          'User-Agent': getBrowserLikeUserAgent()
        },
        timeout: timeoutMs || 0,
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
        },
        ontimeout: function () {
          reject(makeHttpError('TIMEOUT', url, 'gm'));
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

  function fetchExternalText(url, timeoutMs) {
    var request = null;
    var pageFetch = getPageFetch();
    if (pageFetch) {
      request = pageFetch(url, {
        cache: 'no-store'
      }).then(function (res) {
        if (res.status === 429) throw rateLimitError(url, 'fetch');
        if (!res.ok) throw makeHttpError(res.status, url, 'fetch');
        return res.text();
      }).catch(function (err) {
        if (err && err.status === 429) throw err;
        return httpGet(url, {
          'User-Agent': getBrowserLikeUserAgent()
        }, timeoutMs);
      });
    } else {
      request = httpGet(url, {
        'User-Agent': getBrowserLikeUserAgent()
      }, timeoutMs);
    }
    return withTimeout(request, timeoutMs || CONFIG.machineTranslateTimeoutMs);
  }

  function withTimeout(promise, timeoutMs) {
    if (!timeoutMs) return promise;
    return new Promise(function (resolve, reject) {
      var settled = false;
      var timer = window.setTimeout(function () {
        if (settled) return;
        settled = true;
        reject(makeHttpError('TIMEOUT', '', 'timeout'));
      }, timeoutMs);

      promise.then(function (value) {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        resolve(value);
      }, function (err) {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        reject(err);
      });
    });
  }

  function fetchGoogleTranslateText(text, sourceLang, targetLang) {
    var source = normalizeGoogleTranslateLang(sourceLang, true);
    var target = normalizeGoogleTranslateLang(targetLang, false);
    var url = 'https://translate.googleapis.com/translate_a/single?client=gtx&dt=t' +
      '&sl=' + encodeURIComponent(source) +
      '&tl=' + encodeURIComponent(target) +
      '&q=' + encodeURIComponent(normalizeCueTextForDisplay(text));

    return fetchExternalText(url, CONFIG.machineTranslateTimeoutMs).then(function (body) {
      var data = JSON.parse(body);
      if (!data || !data[0] || !data[0].length) return '';
      return data[0].map(function (part) {
        return part && part[0] ? part[0] : '';
      }).join('');
    });
  }

  function normalizeGoogleTranslateLang(value, allowAuto) {
    var lang = String(value || '').trim();
    if (!lang || lang === 'auto') return allowAuto ? 'auto' : normalizeGoogleTranslateLang(DEFAULTS.targetLang, false);
    var lower = lang.toLowerCase();
    if (lower === 'zh-hans' || lower === 'zh-cn' || lower === 'zh-sg') return 'zh-CN';
    if (lower === 'zh-hant' || lower === 'zh-tw' || lower === 'zh-hk' || lower === 'zh-mo') return 'zh-TW';
    return lang;
  }

  function fetchBestPair(sourceTrack, targetTrack, targetLang, options) {
    options = options || {};
    clearFetchDiagnostics();
    return fetchTrackCues(sourceTrack, null, 'source', {
      recoverNativeOnEmpty: true
    }).then(function (sourceCues) {
      if (sourceCues.length) {
        if (typeof options.onSourceCues === 'function') options.onSourceCues(sourceCues);
        return fetchTargetPair(sourceCues, targetTrack, sourceTrack, targetLang, '', options);
      }

      if (options.allowTargetWithoutSource && targetLang) {
        appendFetchDiagnostic('source', 'source-empty-target-allowed');
        return fetchTargetPair([], targetTrack, sourceTrack, targetLang, 'source-empty-target-only', options).then(function (result) {
          if ((result.cuesA && result.cuesA.length) || (result.cuesB && result.cuesB.length) || !getNativeTimedTextHint(sourceTrack)) {
            return result;
          }
          return fetchTrackCues(sourceTrack, null, 'source', {
            nativeJson3: true,
            nativeOnly: true
          }).then(function (sourceCues) {
            result.cuesA = sourceCues || [];
            if (result.cuesA.length) result.fallback = result.fallback ? result.fallback + '+source-native-after-target' : 'source-native-after-target';
            return result;
          }).catch(function (err) {
            appendFetchDiagnostic('source', 'source-native-after-target:err(' + formatError(err) + ')');
            return result;
          });
        });
      }

      appendFetchDiagnostic('target', 'skip-source-empty');
      return {
        cuesA: [],
        cuesB: [],
        fallback: 'source-empty',
        asrSyncStatus: 'off',
        asrSyncDetail: '',
        targetRetryable: false,
        targetErrorStatus: 0
      };
    });
  }

  function fetchTargetPair(sourceCues, targetTrack, sourceTrack, targetLang, fallback, options) {
    options = options || {};
    var track = targetTrack || sourceTrack;
    var language = targetTrack ? null : targetLang;
    if (!track || !track.baseUrl) {
      appendFetchDiagnostic('target', 'skip-no-target-track');
      return Promise.resolve({
        cuesA: sourceCues || [],
        cuesB: [],
        fallback: fallback || '',
        asrSyncStatus: 'off',
        asrSyncDetail: '',
        targetRetryable: false,
        targetErrorStatus: 0
      });
    }

    var retryable = !fallback || String(fallback).indexOf('transcript') === -1;
    return fetchTrackCues(track, language, 'target', {
      preferNative: !!options.preferNativeTarget,
      targetRetryAttempt: options.targetRetryAttempt || 0
    }).then(function (targetCues) {
      var synced = syncAutoGeneratedTargetCues(sourceCues || [], targetCues || [], sourceTrack);
      return {
        cuesA: sourceCues || [],
        cuesB: synced.cues || [],
        fallback: fallback || '',
        asrSyncStatus: synced.status,
        asrSyncDetail: synced.detail,
        targetRetryable: retryable,
        targetErrorStatus: 0
      };
    }).catch(function (err) {
      appendFetchDiagnostic('target', 'target-error-kept-source(' + formatError(err) + ')');
      return {
        cuesA: sourceCues || [],
        cuesB: [],
        fallback: fallback || '',
        asrSyncStatus: 'off',
        asrSyncDetail: '',
        targetRetryable: !!(err && err.status !== 429 && retryable),
        targetErrorStatus: err && err.status ? err.status : 0
      };
    });
  }

  function syncAutoGeneratedTargetCues(sourceCues, targetCues, sourceTrack) {
    sourceCues = sourceCues || [];
    targetCues = targetCues || [];

    if (!isAutoGeneratedCaptionTrack(sourceTrack)) {
      return {
        cues: copyCueList(targetCues),
        status: targetCues.length ? 'not-asr' : 'off',
        detail: ''
      };
    }

    if (!sourceCues.length || !targetCues.length) {
      return {
        cues: copyCueList(targetCues),
        status: 'snap-skip',
        detail: '0/' + targetCues.length
      };
    }

    var usedSource = {};
    var matches = [];
    var matched = 0;
    var i;
    for (i = 0; i < targetCues.length; i++) {
      var match = findBestAsrSourceCue(targetCues[i], sourceCues, usedSource);
      matches.push(match);
      if (match) {
        usedSource[match.index] = true;
        matched += 1;
      }
    }

    if (matched / targetCues.length < CONFIG.asrSyncMinMatchRatio) {
      return {
        cues: copyCueList(targetCues),
        status: 'snap-skip',
        detail: matched + '/' + targetCues.length
      };
    }

    var synced = [];
    for (i = 0; i < targetCues.length; i++) {
      var cue = copyCue(targetCues[i]);
      if (matches[i]) {
        cue.start = matches[i].cue.start;
        cue.end = matches[i].cue.end;
      }
      synced.push(cue);
    }

    return {
      cues: synced,
      status: 'snap-ok',
      detail: matched + '/' + targetCues.length
    };
  }

  function findBestAsrSourceCue(targetCue, sourceCues, usedSource) {
    var best = null;
    var bestOverlap = 0;
    var bestDistance = Infinity;
    var targetCenter = getCueCenter(targetCue);
    var maxDistance = CONFIG.asrSyncMaxCenterDistanceMs / 1000;
    var i;

    for (i = 0; i < sourceCues.length; i++) {
      if (usedSource[i]) continue;
      var sourceCue = sourceCues[i];
      var overlap = getCueOverlap(targetCue, sourceCue);
      var distance = Math.abs(targetCenter - getCueCenter(sourceCue));
      if (overlap > 0) {
        if (!best || bestOverlap <= 0 || overlap > bestOverlap || (overlap === bestOverlap && distance < bestDistance)) {
          best = { cue: sourceCue, index: i };
          bestOverlap = overlap;
          bestDistance = distance;
        }
      } else if (bestOverlap <= 0 && distance <= maxDistance && distance < bestDistance) {
        best = { cue: sourceCue, index: i };
        bestDistance = distance;
      }
    }

    return best;
  }

  function getCueOverlap(left, right) {
    return Math.max(0, Math.min(left.end, right.end) - Math.max(left.start, right.start));
  }

  function getCueCenter(cue) {
    return ((cue && cue.start) || 0) + Math.max(0, ((cue && cue.end) || 0) - ((cue && cue.start) || 0)) / 2;
  }

  function copyCueList(cues) {
    var output = [];
    var i;
    for (i = 0; i < (cues || []).length; i++) output.push(copyCue(cues[i]));
    return output;
  }

  function copyCue(cue) {
    return {
      start: cue && isFinite(cue.start) ? cue.start : 0,
      end: cue && isFinite(cue.end) ? cue.end : 0,
      text: cue && cue.text ? cue.text : ''
    };
  }

  function fetchTrackCues(track, targetLang, label, options) {
    options = options || {};
    var attempts = [];
    var rateLimitedErr = null;

    function summarizeUrl(candidate) {
      try {
        var parsed = new URL(candidate.url, location.href);
        var fmt = parsed.searchParams.get('fmt') || 'raw';
        var lang = parsed.searchParams.get('lang') || '';
        var tlang = parsed.searchParams.get('tlang') || '';
        return fmt + ':' + lang + (tlang ? '->' + tlang : '') +
          (isAutoGeneratedCaptionTrack(track) ? ':asr' : '') +
          (candidate.native ? ':native' : '');
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
        if (rateLimitedErr) throw rateLimitedErr;
        return Promise.resolve([]);
      }
      var startedAt = Date.now();
      return fetchText(candidates[index].url).then(function (text) {
        var cues = parseCaptionPayload(text);
        attempts.push(summarizeUrl(candidates[index]) + ':ok(' + cues.length + ',' + summarizeText(text) + ',' + (Date.now() - startedAt) + 'ms)');
        if (cues.length) {
          setFetchDiagnostic(label, attempts.join(' | '));
          return cues;
        }
        return tryCandidateSet(candidates, index + 1);
      }).catch(function (err) {
        attempts.push(summarizeUrl(candidates[index]) + ':err(' + formatError(err) + ',' + (Date.now() - startedAt) + 'ms)');
        if (err && err.status === 429) {
          rateLimitedErr = rateLimitedErr || err;
        }
        return tryCandidateSet(candidates, index + 1);
      });
    }

    function tryFastCandidates() {
      var includeNativeJson3 = !!options.nativeJson3 || (label === 'target' && !!targetLang && !!getNativeTimedTextHint(track));
      var nativeFirst = !!options.nativeFirst || (label === 'target' && !!targetLang && includeNativeJson3);
      return tryCandidateSet(buildFastTimedTextCandidates(track, targetLang, includeNativeJson3, !!options.nativeOnly, nativeFirst), 0);
    }

    var shouldWaitForNativeHint = label === 'target' && !!targetLang && !!options.preferNative && !getNativeTimedTextHint(track);
    var firstAttempt = shouldWaitForNativeHint
      ? waitForNativeTimedTextHint(track, CONFIG.playerCaptionPrimeHintWaitMs).then(function () {
        return tryFastCandidates();
      })
      : tryFastCandidates();

    return firstAttempt.then(function (cues) {
      if (cues.length || !options.recoverNativeOnEmpty) return cues;
      return waitForNativeTimedTextHint(track, CONFIG.sourceNativeHintRetryMs).then(function (hasHint) {
        if (!hasHint) {
          attempts.push('native-wait:miss');
          setFetchDiagnostic(label, attempts.join(' | '));
          return [];
        }
        attempts.push('native-wait:ok');
        return tryCandidateSet(buildFastTimedTextCandidates(track, targetLang, true, true, true), 0);
      });
    });
  }

  function buildFastTimedTextCandidates(track, targetLang, includeNative, nativeOnly, nativeFirst) {
    var candidates = [];
    var seen = {};
    var json3Params = mergeTimedTextParams(targetLang, { fmt: 'json3' });
    var hint = includeNative ? getNativeTimedTextHint(track) : null;

    if (hint && hint.params && nativeFirst) {
      addCandidate(mergeObjects(hint.params, json3Params), true);
    }
    if (!nativeOnly) addCandidate(json3Params, false);
    if (hint && hint.params && !nativeFirst) {
      addCandidate(mergeObjects(hint.params, json3Params), true);
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

  function buildTimedTextCandidates(track, targetLang, nativeOnly, selectedVariants, nativeFirst) {
    var variants = selectedVariants || [
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
    var shouldAddNativeFirst = nativeOnly || nativeFirst !== false;
    var i;

    if (hint && hint.params && shouldAddNativeFirst) {
      for (i = 0; i < variants.length; i++) {
        addCandidate(mergeObjects(hint.params, mergeTimedTextParams(targetLang, variants[i])), true);
      }
    }

    if (!nativeOnly) {
      for (i = 0; i < variants.length; i++) {
        addCandidate(mergeTimedTextParams(targetLang, variants[i]), false);
      }
    }

    if (hint && hint.params && !shouldAddNativeFirst) {
      for (i = 0; i < variants.length; i++) {
        addCandidate(mergeObjects(hint.params, mergeTimedTextParams(targetLang, variants[i])), true);
      }
    }

    return candidates;

    function addCandidate(params, native) {
      addUrlCandidate(track.baseUrl, params, native);
    }

    function addUrlCandidate(baseUrl, params, native) {
      var url = buildTimedTextUrl(baseUrl, params);
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
