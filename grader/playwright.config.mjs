import { defineConfig } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const siteDirectory = process.env.COURSE_SITE_DIR;
const graderDirectory = path.dirname(fileURLToPath(import.meta.url));
if (!siteDirectory) {
  throw new Error('COURSE_SITE_DIR is required.');
}

export default defineConfig({
  testDir: './tests/submission-ui',
  outputDir: process.env.COURSE_TEST_RESULTS || '../grader-results/playwright',
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  workers: 1,
  reporter: [
    ['line'],
    [
      'html',
      {
        open: 'never',
        outputFolder: process.env.COURSE_PLAYWRIGHT_REPORT || '../grader-results/playwright-report',
      },
    ],
  ],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    browserName: 'chromium',
    launchOptions: process.env.COURSE_CHROMIUM_PATH
      ? { executablePath: process.env.COURSE_CHROMIUM_PATH }
      : {},
    locale: 'ru-RU',
    screenshot: 'only-on-failure',
    timezoneId: 'Europe/Moscow',
    trace: 'retain-on-failure',
    viewport: { width: 1280, height: 720 },
  },
  webServer: {
    command: `node ${JSON.stringify(path.join(graderDirectory, 'src/static-server.mjs'))} --root ${JSON.stringify(siteDirectory)} --port 4173`,
    port: 4173,
    reuseExistingServer: false,
    timeout: 10_000,
  },
});
