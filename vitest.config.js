import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['js/__tests__/**/*.test.js', 'server/__tests__/**/*.test.js'],
    globals: false,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['js/**/*.js', 'server/**/*.js'],
      exclude: ['js/__tests__/**', 'server/__tests__/**', 'js/render/icons.js', 'js/safe-timer.js'],
      thresholds: {
        lines: 0,
        branches: 0
      }
    }
  }
});
