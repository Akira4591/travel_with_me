import { describe, expect, it } from 'vitest';

import {
  buildGate50ReviewSteps,
  parseGate50ReviewOptions
} from '../../scripts/gate50-review-options.mjs';

describe('gate50 review options', () => {
  it('keeps the default evidence package unchanged', () => {
    const options = parseGate50ReviewOptions([]);
    const steps = buildGate50ReviewSteps({
      npmCommand: 'npm',
      nodeCommand: 'node',
      options
    });

    expect(options).toMatchObject({
      dryRun: false,
      skipSmoke: false,
      skipVisual: false,
      includeStability: false,
      stabilityRuns: '5',
      stabilityPreset: '',
      evidenceJson: ''
    });
    expect(steps.map(([label]) => label)).toEqual([
      'Static quality gates',
      'Unit tests',
      'Visible text encoding gate',
      'Desktop smoke gates',
      'Full 3D visual baseline'
    ]);
  });

  it('adds optional stability evidence with runs and preset', () => {
    const options = parseGate50ReviewOptions([
      '--include-stability',
      '--stability-runs=3',
      '--stability-preset',
      'precision'
    ]);
    const steps = buildGate50ReviewSteps({
      npmCommand: 'npm',
      nodeCommand: 'node',
      options
    });

    expect(options.includeStability).toBe(true);
    expect(options.stabilityRuns).toBe('3');
    expect(options.stabilityPreset).toBe('precision');
    expect(steps.at(-1)).toEqual([
      '3D visual stability repeatability',
      'node',
      ['scripts/run-visual-stability.mjs', '--runs=3', '--preset=precision']
    ]);
  });

  it('honors skip flags without removing static gates', () => {
    const options = parseGate50ReviewOptions(['--skip-smoke', '--skip-visual', '--dry-run']);
    const steps = buildGate50ReviewSteps({
      npmCommand: 'npm',
      nodeCommand: 'node',
      options
    });

    expect(options.dryRun).toBe(true);
    expect(steps.map(([label]) => label)).toEqual([
      'Static quality gates',
      'Unit tests',
      'Visible text encoding gate'
    ]);
  });

  it('parses an optional evidence JSON output path', () => {
    const options = parseGate50ReviewOptions(['--evidence-json', 'output/gate50/evidence.json']);

    expect(options.evidenceJson).toBe('output/gate50/evidence.json');
  });
});
