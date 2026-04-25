const fs = require('fs');
const path = require('path');
const { chromium } = require('@playwright/test');

const projectRoot = path.resolve(__dirname, '..');
const extensionId = 'dhdgffkkebhmkfjojejmpbldmpobfkfo';
const uBlockLiteExtensionId = 'ddkjiahejlhfcafbddmgiahcphecmpfh';
const extensionPath = path.join(
  process.env.LOCALAPPDATA,
  'Google',
  'Chrome',
  'User Data',
  'Profile 1',
  'Extensions',
  extensionId,
  '5.4.1_0'
);
const uBlockLiteExtensionPath = process.env.YDS_UBLOCK_PATH || findLatestChromeExtensionPath(uBlockLiteExtensionId);
const userDataDir = path.join(projectRoot, '.tmp', 'tm-smoke-profile');
const diagnosticsDir = path.join(projectRoot, 'diagnostics');
const userscriptPath = path.join(projectRoot, 'yt-dual-subs.user.js');
const preferredSourceLang = process.env.YDS_SOURCE_LANG || 'en';
const preferredTargetLang = process.env.YDS_TARGET_LANG || 'zh-Hans';

const defaultUrls = [
  // TED: stable English captions and YouTube translation availability.
  'https://www.youtube.com/watch?v=eIho2S0ZahI',
  // YouTube first upload: useful injection smoke, may not always have captions.
  'https://www.youtube.com/watch?v=jNQXAC9IVRw'
];

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

async function main() {
  if (!fs.existsSync(extensionPath)) {
    throw new Error(`Tampermonkey extension path not found: ${extensionPath}`);
  }
  if (!uBlockLiteExtensionPath || !fs.existsSync(uBlockLiteExtensionPath)) {
    throw new Error('uBlock Origin Lite extension path not found. Install uBlock Lite in Chrome Profile 1 or set YDS_UBLOCK_PATH.');
  }

  fs.mkdirSync(diagnosticsDir, {
    recursive: true
  });

  const urls = process.argv.slice(2);
  const targets = urls.length ? urls : defaultUrls;
  const extensionPaths = [extensionPath, uBlockLiteExtensionPath];

  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    viewport: {
      width: 1365,
      height: 900
    },
    args: [
      '--disable-blink-features=AutomationControlled',
      `--disable-extensions-except=${extensionPaths.join(',')}`,
      `--load-extension=${extensionPaths.join(',')}`
    ]
  });
  await context.addInitScript(() => {
    try {
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined
      });
    } catch (err) {}
  });

  try {
    await enableUserScripts(context);
    await installUserscript(context);

    const results = [];
    for (const target of targets) {
      const result = await runYoutubeSmoke(context, target);
      results.push(result);
      if (result.snapshot && result.snapshot.phase === 'ready' && (result.snapshot.cuesA || result.snapshot.cuesB)) break;
    }

    const reportPath = path.join(diagnosticsDir, `tampermonkey-smoke-${stamp()}.json`);
    fs.writeFileSync(reportPath, `${JSON.stringify(results, null, 2)}\n`);
    console.log(`tampermonkey smoke report: ${reportPath}`);
    console.log(JSON.stringify(results.map((result) => ({
      url: result.url,
      screenshot: result.screenshot,
      hasDebug: result.hasDebug,
      adblock: result.adblock,
      phase: result.snapshot && result.snapshot.phase,
      cues: result.snapshot ? `${result.snapshot.cuesA}/${result.snapshot.cuesB}` : '',
      source: result.snapshot && result.snapshot.source,
      fetch: result.snapshot && result.snapshot.fetch
    })), null, 2));
  } finally {
    await context.close();
  }
}

function findLatestChromeExtensionPath(id) {
  const profileRoot = path.join(
    process.env.LOCALAPPDATA || '',
    'Google',
    'Chrome',
    'User Data',
    'Profile 1',
    'Extensions',
    id
  );
  if (!fs.existsSync(profileRoot)) return '';

  const versions = fs.readdirSync(profileRoot, {
    withFileTypes: true
  })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort(compareVersionStrings);

  if (!versions.length) return '';
  return path.join(profileRoot, versions[versions.length - 1]);
}

function compareVersionStrings(left, right) {
  const a = left.split(/[._-]/).map((part) => parseInt(part, 10) || 0);
  const b = right.split(/[._-]/).map((part) => parseInt(part, 10) || 0);
  const length = Math.max(a.length, b.length);
  for (let i = 0; i < length; i += 1) {
    if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) - (b[i] || 0);
  }
  return left.localeCompare(right);
}

async function enableUserScripts(context) {
  const page = await context.newPage();
  await page.goto(`chrome://extensions/?id=${extensionId}`);
  await page.waitForTimeout(2500);

  const state = await page.evaluate(() => {
    function findAllow(root) {
      if (!root) return null;
      if (root.querySelector) {
        const direct = root.querySelector('extensions-toggle-row#allow-user-scripts');
        if (direct) return direct;
      }
      const all = root.querySelectorAll ? root.querySelectorAll('*') : [];
      for (const node of all) {
        if (node.shadowRoot) {
          const found = findAllow(node.shadowRoot);
          if (found) return found;
        }
      }
      return null;
    }

    const row = findAllow(document);
    if (!row) return {
      found: false,
      before: false,
      after: false
    };

    const toggle = row.shadowRoot && row.shadowRoot.querySelector('cr-toggle');
    const before = !!(row.checked || (toggle && toggle.checked));
    if (!before) (toggle || row).click();
    const after = !!(row.checked || (toggle && toggle.checked));
    return {
      found: true,
      before,
      after
    };
  });

  await page.screenshot({
    path: path.join(diagnosticsDir, `tampermonkey-allow-user-scripts-${stamp()}.png`),
    fullPage: true
  });
  await page.close();

  if (!state.found || !state.after) {
    throw new Error(`Could not enable Chrome allow-user-scripts permission: ${JSON.stringify(state)}`);
  }
}

async function installUserscript(context) {
  const page = await context.newPage();
  const code = fs.readFileSync(userscriptPath, 'utf8');
  const expectedVersion = (code.match(/@version\s+([^\s]+)/) || [])[1] || '';

  await page.goto(`chrome-extension://${extensionId}/options.html#nav=new-user-script`, {
    waitUntil: 'domcontentloaded'
  });
  await page.waitForSelector('.CodeMirror', {
    timeout: 15000
  });
  await page.evaluate((nextCode) => {
    const cm = document.querySelector('.CodeMirror').CodeMirror;
    cm.setValue(nextCode);
    if (cm.save) cm.save();
  }, code);
  await page.evaluate(() => {
    const saveButton = document.querySelector('button[id="button_bmV3LXVzZXItc2NyaXB0X3NhdmU_bu"]');
    if (!saveButton) throw new Error('Tampermonkey save button not found');
    saveButton.click();
  });
  await page.waitForTimeout(5000);

  let bodyText = await readPageBodyText(page);
  await safePageScreenshot(page, path.join(diagnosticsDir, `tampermonkey-dashboard-${stamp()}.png`), true);
  await safeClosePage(page);

  if (!bodyText.includes('YouTube Dual Native Subs') || (expectedVersion && !bodyText.includes(expectedVersion))) {
    bodyText += '\n' + await readTampermonkeyDashboardText(context);
  }

  if (!bodyText.includes('YouTube Dual Native Subs') || (expectedVersion && !bodyText.includes(expectedVersion))) {
    throw new Error(`Tampermonkey dashboard did not confirm installed script ${expectedVersion || 'version'}`);
  }
}

async function readPageBodyText(page) {
  try {
    if (page.isClosed()) return '';
    return await page.locator('body').innerText({
      timeout: 5000
    });
  } catch (err) {
    return '';
  }
}

async function safePageScreenshot(page, screenshotPath, fullPage) {
  try {
    if (page.isClosed()) return false;
    await page.screenshot({
      path: screenshotPath,
      fullPage
    });
    return true;
  } catch (err) {
    return false;
  }
}

async function safeClosePage(page) {
  try {
    if (!page.isClosed()) await page.close();
  } catch (err) {}
}

async function readTampermonkeyDashboardText(context) {
  const page = await context.newPage();
  try {
    await page.goto(`chrome-extension://${extensionId}/options.html`, {
      waitUntil: 'domcontentloaded',
      timeout: 15000
    });
    await page.waitForTimeout(2500);
    const text = await readPageBodyText(page);
    await safePageScreenshot(page, path.join(diagnosticsDir, `tampermonkey-dashboard-confirm-${stamp()}.png`), true);
    return text;
  } finally {
    await safeClosePage(page);
  }
}

async function runYoutubeSmoke(context, rawUrl) {
  const url = new URL(rawUrl);
  url.searchParams.set('ydsDebug', '1');

  const page = await context.newPage();
  await page.goto(url.toString(), {
    waitUntil: 'domcontentloaded',
    timeout: 60000
  });
  const adblock = await detectUBlock(context);

  await page.waitForFunction(() => Boolean(window.__ydsDebug), null, {
    timeout: 30000
  }).catch(() => {});

  const hasDebug = await page.evaluate(() => Boolean(window.__ydsDebug));
  let targetSelection = null;
  let sourceSelection = null;
  let cueProbe = null;
  let initialUi = null;
  let closedScreenshot = null;
  let themeProbe = null;
  let darkScreenshot = null;
  if (hasDebug) {
    await page.evaluate(() => window.__ydsDebug.setEnabled && window.__ydsDebug.setEnabled(true));
    await page.waitForSelector('ytd-watch-metadata #actions #yds-launcher-root, #above-the-fold #actions #yds-launcher-root', {
      timeout: 15000
    }).catch(() => {});
    initialUi = await page.evaluate(() => {
      const launcher = document.querySelector('#yds-launcher-root');
      return {
        launcherText: launcher ? launcher.textContent : '',
        panelOpen: Boolean(document.querySelector('#yds-panel-root')),
        launcherInActions: Boolean(document.querySelector('ytd-watch-metadata #actions #yds-launcher-root, #above-the-fold #actions #yds-launcher-root'))
      };
    });
    closedScreenshot = path.join(diagnosticsDir, `tampermonkey-youtube-closed-${url.searchParams.get('v') || 'video'}-${stamp()}.png`);
    await page.screenshot({
      path: closedScreenshot,
      fullPage: false
    });
    await ensurePanelOpen(page);
    themeProbe = {
      light: await sampleUiTheme(page)
    };
    await page.evaluate(() => {
      document.documentElement.setAttribute('dark', '');
      document.body && document.body.setAttribute('dark', '');
      const app = document.querySelector('ytd-app');
      if (app) app.setAttribute('dark', '');
    });
    themeProbe.dark = await sampleUiTheme(page);
    darkScreenshot = path.join(diagnosticsDir, `tampermonkey-youtube-dark-${url.searchParams.get('v') || 'video'}-${stamp()}.png`);
    await page.screenshot({
      path: darkScreenshot,
      fullPage: false
    });
    await page.evaluate(() => {
      document.documentElement.removeAttribute('dark');
      document.body && document.body.removeAttribute('dark');
      const app = document.querySelector('ytd-app');
      if (app) app.removeAttribute('dark');
    });
    targetSelection = await setTargetLanguage(page, preferredTargetLang);
    await page.evaluate(() => window.__ydsDebug.reload());
    await waitForTracks(page);
    sourceSelection = await selectSourceTrack(page, preferredSourceLang);
    if (sourceSelection && sourceSelection.ok) {
      await page.evaluate(() => window.__ydsDebug.reload());
    }
    await waitForLoadResult(page);
  } else {
    await page.waitForTimeout(10000);
  }

  cueProbe = await seekToVisibleCue(page);

  const screenshot = path.join(diagnosticsDir, `tampermonkey-youtube-${url.searchParams.get('v') || 'video'}-${stamp()}.png`);
  await page.screenshot({
    path: screenshot,
    fullPage: false
  });

  const data = await page.evaluate(() => ({
    hasDebug: Boolean(window.__ydsDebug),
    snapshot: window.__ydsDebug ? window.__ydsDebug.snapshot() : null,
    panelText: document.querySelector('#yds-panel-root') ? document.querySelector('#yds-panel-root').innerText : '',
    nativeText: document.querySelector('#yds-native-window') ? document.querySelector('#yds-native-window').innerText : '',
    youtubeCaptionText: Array.from(document.querySelectorAll('.ytp-caption-segment, .caption-window'))
      .map((node) => node.textContent || '')
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim()
  })).catch((err) => ({
    hasDebug: false,
    snapshot: null,
    error: err.message
  }));

  await page.close();
  return {
    url: url.toString(),
    screenshot,
    adblock,
    preferredSourceLang,
    preferredTargetLang,
    initialUi,
    closedScreenshot,
    themeProbe,
    darkScreenshot,
    targetSelection,
    sourceSelection,
    cueProbe,
    ...data
  };
}

async function ensurePanelOpen(page) {
  await page.evaluate(() => {
    if (document.querySelector('#yds-panel-root')) return true;
    const launcher = document.querySelector('#yds-launcher-root');
    if (launcher) launcher.click();
    return Boolean(launcher);
  }).catch(() => false);
  await page.waitForSelector('#yds-panel-root', {
    timeout: 5000
  }).catch(() => {});
}

async function detectUBlock(context) {
  const workers = context.serviceWorkers().map((worker) => worker.url());
  const hasWorker = workers.some((url) => url.includes(uBlockLiteExtensionId));
  return {
    id: uBlockLiteExtensionId,
    path: uBlockLiteExtensionPath,
    serviceWorker: hasWorker,
    loadedWorkers: workers.filter((url) => url.startsWith('chrome-extension://'))
  };
}

async function sampleUiTheme(page) {
  return page.evaluate(() => {
    const launcher = document.querySelector('#yds-launcher-root');
    const panel = document.querySelector('#yds-panel-root');
    const select = panel && panel.querySelector('select');
    function css(node, prop) {
      return node ? getComputedStyle(node).getPropertyValue(prop) : '';
    }
    return {
      launcherBackground: css(launcher, 'background-color'),
      launcherColor: css(launcher, 'color'),
      panelBackground: css(panel, 'background-color'),
      panelColor: css(panel, 'color'),
      selectBackground: css(select, 'background-color'),
      selectColor: css(select, 'color')
    };
  }).catch((err) => ({
    error: err.message
  }));
}

async function setTargetLanguage(page, targetLang) {
  return page.evaluate((lang) => {
    const panel = document.querySelector('#yds-panel-root');
    const input = panel && panel.querySelector('[data-yds-control="target-lang"]');
    if (!input) {
      return {
        ok: false,
        reason: 'target language input not found'
      };
    }

    const before = input.value;
    const changed = before !== lang;
    if (changed) {
      if (input.tagName === 'SELECT' && !Array.from(input.options).some((option) => option.value === lang)) {
        const option = document.createElement('option');
        option.value = lang;
        option.textContent = lang;
        input.appendChild(option);
      }
      input.value = lang;
      input.dispatchEvent(new Event('input', {
        bubbles: true
      }));
      input.dispatchEvent(new Event('change', {
        bubbles: true
      }));
    }

    return {
      ok: true,
      before,
      after: input.value,
      changed
    };
  }, targetLang).catch((err) => ({
    ok: false,
    reason: err.message
  }));
}

async function waitForTracks(page) {
  await page.waitForFunction(() => {
    const state = window.__ydsDebug && window.__ydsDebug.snapshot();
    return state && state.tracks && state.tracks.length > 0;
  }, null, {
    timeout: 60000
  }).catch(() => {});
}

async function selectSourceTrack(page, sourceLang) {
  return page.evaluate((lang) => {
    const state = window.__ydsDebug && window.__ydsDebug.snapshot();
    const tracks = state && state.tracks ? state.tracks : [];
    const panel = document.querySelector('#yds-panel-root');
    const input = panel && panel.querySelector('[data-yds-control="source-track-index"]');
    if (!tracks.length) {
      return {
        ok: false,
        reason: 'no tracks available'
      };
    }
    if (!input) {
      return {
        ok: false,
        reason: 'source track input not found',
        tracks
      };
    }

    const selected = pickTrackByLanguage(tracks, lang);
    if (!selected) {
      return {
        ok: false,
        reason: `no ${lang} track found`,
        tracks
      };
    }

    const before = input.value;
    const changed = before !== String(selected.index);
    if (changed) {
      input.value = String(selected.index);
      input.dispatchEvent(new Event('input', {
        bubbles: true
      }));
      input.dispatchEvent(new Event('change', {
        bubbles: true
      }));
    }

    return {
      ok: true,
      before,
      after: input.value,
      changed,
      selected
    };

    function pickTrackByLanguage(items, desiredLang) {
      const desired = String(desiredLang || '').toLowerCase();
      const desiredBase = desired.split('-')[0];
      let best = null;
      let bestScore = -1;

      for (const track of items) {
        const code = String(track.lang || '').toLowerCase();
        const base = code.split('-')[0];
        let score = 0;
        if (code === desired) score += 100;
        else if (base && base === desiredBase) score += 80;
        else continue;

        if (!/auto|generated|自动|自動/i.test(String(track.name || ''))) score += 5;
        if (track.hasBaseUrl) score += 1;

        if (score > bestScore) {
          bestScore = score;
          best = track;
        }
      }

      return best;
    }
  }, sourceLang).catch((err) => ({
    ok: false,
    reason: err.message
  }));
}

async function waitForLoadResult(page) {
  await page.waitForFunction(() => {
    const state = window.__ydsDebug && window.__ydsDebug.snapshot();
    if (!state || state.loading || state.phase === 'load-start') return false;
    return ['ready', 'no-cues', 'no-tracks', 'wait-tracks', 'backoff', 'load-error'].includes(state.phase);
  }, null, {
    timeout: 90000
  }).catch(() => {});
}

async function seekToVisibleCue(page) {
  const targets = [8, 15, 25, 40, 60, 90, 120];
  for (const targetTime of targets) {
    const seek = await page.evaluate((time) => {
      const video = document.querySelector('video');
      if (!video) return {
        ok: false,
        reason: 'video not found'
      };

      video.muted = true;
      const duration = Number.isFinite(video.duration) ? video.duration : 0;
      const nextTime = duration > 10 ? Math.min(time, Math.max(duration - 5, 0)) : time;
      video.currentTime = nextTime;
      video.play().catch(() => {});
      return {
        ok: true,
        time: nextTime,
        duration
      };
    }, targetTime).catch((err) => ({
      ok: false,
      reason: err.message
    }));

    await page.waitForTimeout(1800);
    const text = await page.evaluate(() => {
      const native = document.querySelector('#yds-native-window');
      return native ? native.innerText.trim() : '';
    }).catch(() => '');
    const lineCount = text.split(/\n+/).map((line) => line.trim()).filter(Boolean).length;
    if (lineCount >= 2) {
      return {
        ...seek,
        text,
        lineCount
      };
    }
  }

  const text = await page.evaluate(() => {
    const native = document.querySelector('#yds-native-window');
    return native ? native.innerText.trim() : '';
  }).catch(() => '');

  return {
    ok: false,
    reason: 'no two-line cue became visible',
    text,
    lineCount: text.split(/\n+/).map((line) => line.trim()).filter(Boolean).length
  };
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
