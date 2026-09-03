import { describe, expect, it } from 'vitest';
import playwrightConfig from '../../playwright.config.js';

describe('Playwright web server contract', () => {
  it('starts the 2D server with a cross-platform Node command', () => {
    expect(playwrightConfig.webServer.command).toBe('node server/index.js');
  });
});
