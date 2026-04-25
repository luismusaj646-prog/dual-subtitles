const fs = require('fs');
const path = require('path');
const { chromium } = require('@playwright/test');
const {
  injectUserscript,
  snapshot
} = require('../tests/e2e/helpers/userscriptHarness');

const projectRoot = path.resolve(__dirname, '..');
const reportsDir = path.join(projectRoot, 'diagnostics');
const defaultUrl = 'https://www.youtube.com/watch?v=GnE1gY_TqGo&ydsDebug=1';

function withDebugParam(rawUrl) {
  const url = new URL(rawUrl || defaultUrl);
  url.searchParams.set('ydsDebug', '1');
  return url.toString();
}

function compact(value, max = 220) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

async function main() {
  const url = withDebugParam(process.argv[2] || defaultUrl);
  const browser = await chromium.launch({
    channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome',
    headless: !process.env.PLAYWRIGHT_HEADED
  });

  const context = await browser.newContext({
    bypassCSP: true,
    viewport: {
      width: 1365,
      height: 900
    }
  });
  const page = await context.newPage();

  const network = [];
  page.on('response', async (response) => {
    const responseUrl = response.url();
    if (!/\/api\/timedtext|\/youtubei\/v1\/(?:next|get_transcript|player)/.test(responseUrl)) return;
    const item = {
      url: responseUrl,
      status: response.status(),
      contentType: response.headers()['content-type'] || ''
    };
    if (/\/api\/timedtext/.test(responseUrl)) {
      try {
        const text = await response.text();
        item.length = text.length;
        item.sample = compact(text, 260);
      } catch (err) {
        item.length = null;
        item.sample = err && err.message ? err.message : String(err);
      }
    }
    network.push(item);
  });

  await page.goto(url, {
    waitUntil: 'domcontentloaded',
    timeout: 60000
  });
  await page.waitForTimeout(3000);

  const nativeCaptions = await probeNativeCaptions(page);

  await injectUserscript(page);
  await page.evaluate(() => window.__ydsDebug.setDebug(true));
  await page.evaluate(() => window.__ydsDebug.reload());
  await page.waitForFunction(() => {
    const state = window.__ydsDebug && window.__ydsDebug.snapshot();
    return state && !state.loading && state.phase !== 'load-start';
  }, null, {
    timeout: 35000
  }).catch(() => {});

  const report = {
    url,
    generatedAt: new Date().toISOString(),
    snapshot: await snapshot(page),
    page: await collectPageState(page),
    nativeCaptions,
    timedText: await probeTimedText(page),
    transcriptUi: await probeTranscriptUi(page),
    network
  };

  fs.mkdirSync(reportsDir, {
    recursive: true
  });

  const videoId = report.snapshot && report.snapshot.videoId ? report.snapshot.videoId : 'unknown-video';
  const outputPath = path.join(reportsDir, `${videoId}-${Date.now()}.json`);
  fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);

  console.log(`diagnostic report: ${outputPath}`);
  console.log(JSON.stringify({
    phase: report.snapshot && report.snapshot.phase,
    tracks: report.snapshot && report.snapshot.tracks && report.snapshot.tracks.length,
    cues: report.snapshot ? `${report.snapshot.cuesA}/${report.snapshot.cuesB}` : '',
    transcriptTrigger: report.snapshot && report.snapshot.transcriptTrigger,
    scriptFetch: report.snapshot && report.snapshot.fetch,
    timedText: report.timedText.map((item) => ({
      label: item.label,
      status: item.status,
      length: item.length,
      sample: item.sample
    })),
    nativeCaptions: report.nativeCaptions,
    transcriptCandidates: report.transcriptUi.candidates.slice(0, 12)
  }, null, 2));

  await browser.close();
}

async function probeNativeCaptions(page) {
  return page.evaluate(async () => {
    function wait(delayMs) {
      return new Promise((resolve) => setTimeout(resolve, delayMs));
    }

    function captionText() {
      return Array.from(document.querySelectorAll('.ytp-caption-window-container .caption-window, .ytp-caption-segment'))
        .map((node) => node.textContent || '')
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
    }

    const video = document.querySelector('video');
    const cc = document.querySelector('.ytp-subtitles-button');
    const samples = [];

    if (!video || !cc) {
      return {
        available: false,
        reason: 'missing video or subtitles button',
        samples
      };
    }

    if (cc.getAttribute('aria-pressed') === 'false') {
      cc.click();
      await wait(800);
    }

    try {
      video.muted = true;
      await video.play();
    } catch (err) {}

    const duration = Number.isFinite(video.duration) ? video.duration : 0;
    const times = [15, 45, 90, 180, 300].filter((time) => !duration || time < duration - 2);
    if (!times.length) times.push(5);

    for (const time of times) {
      try {
        video.currentTime = time;
      } catch (err) {}
      await wait(2500);
      samples.push({
        time,
        ccPressed: cc.getAttribute('aria-pressed'),
        text: captionText()
      });
      if (samples[samples.length - 1].text) break;
    }

    try {
      video.pause();
    } catch (err) {}

    return {
      available: true,
      ccPressed: cc.getAttribute('aria-pressed'),
      samples
    };
  });
}

async function collectPageState(page) {
  return page.evaluate(() => {
    function readPlayerResponse() {
      const player = document.querySelector('.html5-video-player');
      try {
        if (player && typeof player.getPlayerResponse === 'function') {
          return player.getPlayerResponse();
        }
      } catch (err) {}
      return window.ytInitialPlayerResponse || null;
    }

    const playerResponse = readPlayerResponse();
    const renderer = playerResponse &&
      playerResponse.captions &&
      playerResponse.captions.playerCaptionsTracklistRenderer;
    const tracks = renderer && renderer.captionTracks ? renderer.captionTracks : [];
    const audioTracks = renderer && renderer.audioTracks ? renderer.audioTracks : [];

    return {
      documentLang: document.documentElement ? document.documentElement.lang : '',
      title: document.title,
      audioTracks,
      tracks: tracks.map((track, index) => ({
        index,
        languageCode: track.languageCode || '',
        kind: track.kind || '',
        vssId: track.vssId || '',
        name: track.name && (track.name.simpleText || (track.name.runs || []).map((run) => run.text || '').join('')) || '',
        isTranslatable: !!track.isTranslatable,
        baseUrl: track.baseUrl || '',
        translationLanguages: (track.translationLanguages || []).slice(0, 10).map((lang) => ({
          languageCode: lang.languageCode,
          name: lang.languageName && (lang.languageName.simpleText || (lang.languageName.runs || []).map((run) => run.text || '').join('')) || ''
        }))
      }))
    };
  });
}

async function probeTimedText(page) {
  return page.evaluate(async () => {
    function readPlayerResponse() {
      const player = document.querySelector('.html5-video-player');
      try {
        if (player && typeof player.getPlayerResponse === 'function') {
          return player.getPlayerResponse();
        }
      } catch (err) {}
      return window.ytInitialPlayerResponse || null;
    }

    function setParams(baseUrl, params) {
      const url = new URL(baseUrl, location.href);
      Object.keys(params).forEach((key) => {
        if (params[key] == null || params[key] === '') {
          url.searchParams.delete(key);
        } else {
          url.searchParams.set(key, params[key]);
        }
      });
      return url.toString();
    }

    async function fetchText(label, url) {
      try {
        const response = await fetch(url, {
          credentials: 'include',
          cache: 'no-store'
        });
        const text = await response.text();
        return {
          label,
          url,
          status: response.status,
          contentType: response.headers.get('content-type') || '',
          length: text.length,
          sample: text.replace(/\s+/g, ' ').trim().slice(0, 260)
        };
      } catch (err) {
        return {
          label,
          url,
          status: 'ERR',
          contentType: '',
          length: 0,
          sample: err && err.message ? err.message : String(err)
        };
      }
    }

    const playerResponse = readPlayerResponse();
    const renderer = playerResponse &&
      playerResponse.captions &&
      playerResponse.captions.playerCaptionsTracklistRenderer;
    const tracks = renderer && renderer.captionTracks ? renderer.captionTracks : [];
    const track = tracks[0];
    if (!track || !track.baseUrl) return [];

    const variants = [
      ['base', track.baseUrl],
      ['base-plus-fmt-json3', setParams(track.baseUrl, { fmt: 'json3' })],
      ['base-plus-fmt-vtt', setParams(track.baseUrl, { fmt: 'vtt' })],
      ['base-plus-tlang-json3', setParams(track.baseUrl, { fmt: 'json3', tlang: 'zh-Hans' })],
      ['base-plus-tlang-vtt', setParams(track.baseUrl, { fmt: 'vtt', tlang: 'zh-Hans' })],
      ['base-without-fmt-lang', setParams(track.baseUrl, { fmt: '', tlang: '' })]
    ];

    const results = [];
    for (const [label, url] of variants) {
      results.push(await fetchText(label, url));
    }
    return results;
  });
}

async function probeTranscriptUi(page) {
  return page.evaluate(async () => {
    function labelOf(node) {
      return [
        node.getAttribute && node.getAttribute('aria-label'),
        node.getAttribute && node.getAttribute('title'),
        node.textContent
      ].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
    }

    const allNodes = Array.from(document.querySelectorAll('button, [role="button"], a, yt-formatted-string, tp-yt-paper-item, ytd-menu-service-item-renderer'));
    const candidates = allNodes
      .map((node) => ({
        tag: node.tagName ? node.tagName.toLowerCase() : '',
        id: node.id || '',
        className: typeof node.className === 'string' ? node.className.slice(0, 120) : '',
        label: labelOf(node).slice(0, 180),
        visible: !!(node.offsetWidth || node.offsetHeight || node.getClientRects().length)
      }))
      .filter((item) => /transcript|文字稿|逐字稿|字幕|轉錄稿|转录稿|顯示|显示|show|more|更多/i.test(item.label));

    const moreButtons = Array.from(document.querySelectorAll('button[aria-label], [role="button"][aria-label]'))
      .filter((node) => /more|更多|動作|操作|actions/i.test(node.getAttribute('aria-label') || ''));

    const menuLabelsBefore = candidates.map((item) => item.label);
    for (const button of moreButtons.slice(0, 5)) {
      try {
        button.click();
        await new Promise((resolve) => setTimeout(resolve, 700));
      } catch (err) {}
    }

    const afterNodes = Array.from(document.querySelectorAll('button, [role="button"], a, yt-formatted-string, tp-yt-paper-item, ytd-menu-service-item-renderer'));
    const afterCandidates = afterNodes
      .map((node) => ({
        tag: node.tagName ? node.tagName.toLowerCase() : '',
        id: node.id || '',
        className: typeof node.className === 'string' ? node.className.slice(0, 120) : '',
        label: labelOf(node).slice(0, 180),
        visible: !!(node.offsetWidth || node.offsetHeight || node.getClientRects().length)
      }))
      .filter((item) => /transcript|文字稿|逐字稿|字幕|轉錄稿|转录稿|顯示|显示|show|more|更多/i.test(item.label));

    return {
      candidates: afterCandidates,
      menuLabelsBefore,
      panelCount: document.querySelectorAll('ytd-engagement-panel-section-list-renderer').length,
      transcriptRendererCount: document.querySelectorAll('ytd-transcript-renderer').length
    };
  });
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
