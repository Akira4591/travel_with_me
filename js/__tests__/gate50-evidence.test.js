import { describe, expect, it } from 'vitest';

import {
  buildGate50ReviewPacket,
  GATE50_MANUAL_CHECKLIST,
  validateGate50Evidence
} from '../../scripts/gate50-evidence.mjs';

const baseEvidence = Object.freeze({
  version: 1,
  command: ['npm.cmd', 'run', 'gate50:review', '--', '--dry-run'],
  startedAt: '2026-06-23T10:00:00.000Z',
  finishedAt: '2026-06-23T10:00:01.000Z',
  status: 'passed',
  durationMs: 0,
  options: {
    dryRun: true,
    skipSmoke: false,
    skipVisual: false,
    includeStability: false
  },
  steps: [
    step('Static quality gates', 'dry-run', 0),
    step('Unit tests', 'dry-run', 0),
    step('Visible text encoding gate', 'dry-run', 0),
    step('Desktop smoke gates', 'dry-run', 0),
    step('Full 3D visual baseline', 'dry-run', 0)
  ]
});

describe('gate50 evidence validator', () => {
  it('accepts a complete dry-run evidence summary', () => {
    expect(validateGate50Evidence(clone(baseEvidence))).toEqual([]);
  });

  it('requires optional stability evidence when requested', () => {
    const evidence = clone(baseEvidence);
    evidence.options.includeStability = true;

    expect(validateGate50Evidence(evidence)).toContain(
      'missing required step: 3D visual stability repeatability'
    );
  });

  it('rejects passed evidence containing failed steps', () => {
    const evidence = clone(baseEvidence);
    evidence.steps[1].status = 'failed';
    evidence.steps[1].exitCode = 1;

    expect(validateGate50Evidence(evidence)).toContain(
      'passed evidence must not contain failed steps'
    );
  });

  it('rejects non-dry-run evidence with dry-run steps', () => {
    const evidence = clone(baseEvidence);
    evidence.options.dryRun = false;

    expect(validateGate50Evidence(evidence)).toContain(
      'non-dry-run evidence must not contain dry-run steps'
    );
  });

  it('requires total duration to match step durations', () => {
    const evidence = clone(baseEvidence);
    evidence.durationMs = 1;

    expect(validateGate50Evidence(evidence)).toContain(
      'durationMs must equal the sum of step durationMs values'
    );
  });

  it('builds a manual review packet from valid evidence', () => {
    const packet = buildGate50ReviewPacket(clone(baseEvidence), {
      sourcePath: 'output/gate50/dry-run.json',
      generatedAt: '2026-06-23T10:10:00.000Z'
    });

    expect(packet).toContain('# Gate 50 Manual Review Packet');
    expect(packet).toContain('Evidence source: output/gate50/dry-run.json');
    expect(packet).toContain('| Static quality gates | dry-run | 0 | 0ms |');
    expect(packet).toContain('- [ ] Accepted');
    expect(packet).toContain('- [ ] Rejected');
    for (const item of GATE50_MANUAL_CHECKLIST) {
      expect(packet).toContain(`- [ ] ${item}`);
    }
  });

  it('refuses to build a review packet from invalid evidence', () => {
    const evidence = clone(baseEvidence);
    evidence.steps = [];

    expect(() => buildGate50ReviewPacket(evidence)).toThrow('Gate 50 evidence is invalid');
  });
});

function step(label, status, durationMs) {
  return {
    label,
    command: ['npm.cmd', 'run', 'check'],
    status,
    exitCode: status === 'failed' ? 1 : 0,
    durationMs
  };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}
