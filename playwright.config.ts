import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests', testMatch: 'moments.spec.ts', timeout: 90_000,
  reporter: process.env.CI ? [['list'], ['./tests/github-annotations-reporter.ts']] : 'list',
  workers: 1, retries: 0, outputDir: '.cache/playwright',
  use: {
    baseURL: process.env.TEST_BASE_URL || 'http://localhost:5173',
    viewport: { width: 1280, height: 800 },
    launchOptions: {
      executablePath: process.env.CHROMIUM_PATH || undefined,
      args: process.env.CHROMIUM_ARGS ? JSON.parse(process.env.CHROMIUM_ARGS) : ['--enable-unsafe-swiftshader'],
    },
  },
  webServer: { command: 'npm run dev -- --host 0.0.0.0 --port 5173', url: process.env.TEST_BASE_URL || 'http://localhost:5173', reuseExistingServer: !process.env.CI },
});
