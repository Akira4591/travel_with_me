import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['js/__tests__/**/*.test.js', 'server/__tests__/**/*.test.js'],
    globals: false
  }
});
