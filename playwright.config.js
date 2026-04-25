const { defineConfig } = require('@playwright/test');

const browserOverride = process.env.PLAYWRIGHT_CHROME_PATH
  ? {
      launchOptions: {
        executablePath: process.env.PLAYWRIGHT_CHROME_PATH
      }
    }
  : {
      channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome'
    };

module.exports = defineConfig({
  testDir: './tests/e2e',
  timeout: 30000,
  expect: {
    timeout: 10000
  },
  fullyParallel: false,
  reporter: [
    ['list'],
    ['html', { open: 'never' }]
  ],
  use: {
    browserName: 'chromium',
    bypassCSP: true,
    headless: !process.env.PLAYWRIGHT_HEADED,
    viewport: {
      width: 1280,
      height: 720
    },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'off',
    ...browserOverride
  }
});
