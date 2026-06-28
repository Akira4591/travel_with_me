import { describe, expect, it } from 'vitest';

import {
  VISUAL_STABILITY_PRESETS,
  buildVisualStabilityCommand,
  parsePositiveInteger,
  parseVisualStabilityArgs
} from '../../scripts/visual-stability-options.mjs';

describe('visual stability runner options', () => {
  it('parses runner options separately from Playwright passthrough args', () => {
    const parsed = parseVisualStabilityArgs([
      '--runs=5',
      '--project=chromium',
      '--',
      '--grep',
      'micro-street'
    ]);

    expect(parsed.options).toEqual({ runs: '5', project: 'chromium' });
    expect(parsed.passthrough).toEqual(['--grep', 'micro-street']);
  });

  it('builds a default repeatability command with deterministic workers', () => {
    const result = buildVisualStabilityCommand({
      nodeCommand: 'node',
      options: {},
      passthrough: [],
      env: {}
    });

    expect(result.runs).toBe(2);
    expect(result.command).toContain('tests/e2e/visual-baseline.spec.js');
    expect(result.command).toContain('--workers');
    expect(result.command.at(result.command.indexOf('--workers') + 1)).toBe('1');
  });

  it('adds a preset grep when the caller does not provide one', () => {
    const result = buildVisualStabilityCommand({
      nodeCommand: 'node',
      options: { preset: 'precision', runs: '5' },
      passthrough: [],
      env: {}
    });

    expect(result.runs).toBe(5);
    expect(result.command).toContain('--grep');
    expect(result.command).toContain(VISUAL_STABILITY_PRESETS.precision.grep);
  });

  it('keeps explicit grep arguments ahead of preset defaults', () => {
    const result = buildVisualStabilityCommand({
      nodeCommand: 'node',
      options: { preset: 'precision' },
      passthrough: ['--grep', 'custom'],
      env: {}
    });

    expect(result.command.filter(value => value === '--grep')).toHaveLength(1);
    expect(result.command).toContain('custom');
    expect(result.command).not.toContain(VISUAL_STABILITY_PRESETS.precision.grep);
  });

  it('rejects unknown presets with a useful message', () => {
    expect(() =>
      buildVisualStabilityCommand({
        nodeCommand: 'node',
        options: { preset: 'unknown' },
        passthrough: [],
        env: {}
      })
    ).toThrow(/Known presets/u);
  });

  it('falls back when positive integer options are invalid', () => {
    expect(parsePositiveInteger('0', 3)).toBe(3);
    expect(parsePositiveInteger('abc', 3)).toBe(3);
    expect(parsePositiveInteger('4', 3)).toBe(4);
  });
});
