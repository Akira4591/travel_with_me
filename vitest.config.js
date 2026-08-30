import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: [
      'js/__tests__/amap-web-service.test.js',
      'js/__tests__/geocode.test.js',
      'js/__tests__/guide-import-cancellation.test.js',
      'js/__tests__/guide-import-cleanup.test.js',
      'js/__tests__/icons.test.js',
      'js/__tests__/route-config.test.js',
      'js/__tests__/route-geometry.test.js',
      'js/__tests__/routing.test.js',
      'js/__tests__/state.test.js',
      'js/__tests__/storage.test.js',
      'js/__tests__/time-slots.test.js',
      'js/__tests__/utils.test.js'
    ],
    globals: false
  }
});
