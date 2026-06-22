import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  expect: {
    timeout: 5_000
  },
  use: {
    baseURL: 'http://localhost:8080',
    trace: 'on-first-retry',
    launchOptions: {
      args: ['--use-angle=swiftshader', '--enable-webgl']
    }
  },
  webServer: {
    command: 'npm.cmd start',
    url: 'http://localhost:8080',
    reuseExistingServer: true,
    timeout: 20_000
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] }
    },
    {
      name: 'mobile-chrome',
      use: { ...devices['Pixel 5'] }
    }
  ]
});
