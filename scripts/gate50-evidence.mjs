import { readFileSync } from 'node:fs';

const VALID_ROOT_STATUSES = new Set(['passed', 'failed']);
const VALID_STEP_STATUSES = new Set(['passed', 'failed', 'dry-run']);

const BASE_REQUIRED_LABELS = ['Static quality gates', 'Unit tests', 'Visible text encoding gate'];

export const GATE50_MANUAL_CHECKLIST = Object.freeze([
  'The 3D scene is a bounded square work area, not an unbounded route-wide board.',
  'The selected work area is visually raised and clearly separated from the dimmed outside context.',
  'The ground palette stays bone-white and does not reintroduce the previous gray base-map look.',
  'The route guidance is a narrow industrial-yellow line with no gray route outline or thick gray route bed.',
  'The yellow route remains readable during overview, drag, wheel, and WASD movement.',
  'The first camera angle and idle auto-orbit feel continuous; there is no initial snap to a different view.',
  'The first camera angle is close enough to read the route and immediate context; it must not be a distant blank slab with only a faint route line.',
  'Empty off-route selections degrade by anchoring to nearby location context, not by generating an empty raised square.',
  'Roads, water, bridges, buildings, and annotations do not create obvious z-fighting or blank terrain gaps in the selected area.',
  'Building massing appears as neutral planning context; fallback buildings are not presented as real exterior reconstructions.',
  'Close-view building dissolve does not visibly pop or flicker.',
  'The result is visually acceptable for the current low-poly planning-diorama style.'
]);

export function readGate50EvidenceFile(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

export function validateGate50Evidence(evidence) {
  const issues = [];

  if (!isPlainObject(evidence)) {
    return ['evidence must be a JSON object'];
  }

  if (evidence.version !== 1) issues.push('version must be 1');
  validateStringArray(evidence.command, 'command', issues);
  validateTimestamp(evidence.startedAt, 'startedAt', issues);
  validateTimestamp(evidence.finishedAt, 'finishedAt', issues);
  if (
    isValidTimestamp(evidence.startedAt) &&
    isValidTimestamp(evidence.finishedAt) &&
    Date.parse(evidence.finishedAt) < Date.parse(evidence.startedAt)
  ) {
    issues.push('finishedAt must not be earlier than startedAt');
  }

  if (!VALID_ROOT_STATUSES.has(evidence.status)) {
    issues.push('status must be passed or failed');
  }
  validateNonNegativeNumber(evidence.durationMs, 'durationMs', issues);

  if (!isPlainObject(evidence.options)) {
    issues.push('options must be an object');
  }

  if (!Array.isArray(evidence.steps) || evidence.steps.length === 0) {
    issues.push('steps must be a non-empty array');
  } else {
    validateSteps(evidence, issues);
  }

  return issues;
}

export function buildGate50ReviewPacket(evidence, options = {}) {
  const issues = validateGate50Evidence(evidence);
  if (issues.length > 0) {
    throw new Error(
      `Gate 50 evidence is invalid:\n${issues.map(issue => `- ${issue}`).join('\n')}`
    );
  }

  const sourcePath = options.sourcePath || 'unknown evidence path';
  const generatedAt = options.generatedAt || new Date().toISOString();
  const command = evidence.command.join(' ');
  const duration = formatDuration(evidence.durationMs);
  const mode = evidence.options?.dryRun ? 'dry-run wiring check' : 'executed evidence run';

  return [
    '# Gate 50 Manual Review Packet',
    '',
    `Generated at: ${generatedAt}`,
    `Evidence source: ${sourcePath}`,
    `Evidence status: ${evidence.status}`,
    `Evidence mode: ${mode}`,
    `Evidence command: \`${command}\``,
    `Evidence duration: ${duration}`,
    '',
    '## Automated Evidence Summary',
    '',
    '| Step | Status | Exit code | Duration |',
    '| --- | --- | ---: | ---: |',
    ...evidence.steps.map(
      step =>
        `| ${escapeMarkdownCell(step.label)} | ${step.status} | ${step.exitCode} | ${formatDuration(step.durationMs)} |`
    ),
    '',
    '## Manual Review Decision',
    '',
    '- [ ] Accepted',
    '- [ ] Rejected',
    '',
    'Reviewer:',
    '',
    'Decision notes:',
    '',
    '## Required Live Visual Checklist',
    '',
    ...GATE50_MANUAL_CHECKLIST.map(item => `- [ ] ${item}`),
    '',
    '## Rejection Record',
    '',
    'Use this section only if the packet is rejected.',
    '',
    '- Screenshot path:',
    '- One-sentence defect:',
    '- Defect class: route / terrain / water / road / bridge / building / camera / lighting / palette / UI',
    '- Next TODO item:',
    ''
  ].join('\n');
}

function validateSteps(evidence, issues) {
  const labels = new Set();
  let failedCount = 0;
  let dryRunCount = 0;
  let durationTotal = 0;

  evidence.steps.forEach((step, index) => {
    const prefix = `steps[${index}]`;
    if (!isPlainObject(step)) {
      issues.push(`${prefix} must be an object`);
      return;
    }

    if (!isNonEmptyString(step.label)) {
      issues.push(`${prefix}.label must be a non-empty string`);
    } else {
      labels.add(step.label);
    }

    validateStringArray(step.command, `${prefix}.command`, issues);

    if (!VALID_STEP_STATUSES.has(step.status)) {
      issues.push(`${prefix}.status must be passed, failed, or dry-run`);
    }
    if (step.status === 'failed') failedCount += 1;
    if (step.status === 'dry-run') dryRunCount += 1;

    if (!Number.isInteger(step.exitCode) || step.exitCode < 0) {
      issues.push(`${prefix}.exitCode must be a non-negative integer`);
    }

    if (validateNonNegativeNumber(step.durationMs, `${prefix}.durationMs`, issues)) {
      durationTotal += step.durationMs;
    }
  });

  for (const label of requiredLabels(evidence.options || {})) {
    if (!labels.has(label)) issues.push(`missing required step: ${label}`);
  }

  if (evidence.status === 'passed' && failedCount > 0) {
    issues.push('passed evidence must not contain failed steps');
  }
  if (evidence.status === 'failed' && failedCount === 0) {
    issues.push('failed evidence must contain at least one failed step');
  }

  if (evidence.options?.dryRun === true && dryRunCount !== evidence.steps.length) {
    issues.push('dry-run evidence must mark every step as dry-run');
  }
  if (evidence.options?.dryRun === false && dryRunCount > 0) {
    issues.push('non-dry-run evidence must not contain dry-run steps');
  }

  if (typeof evidence.durationMs === 'number' && evidence.durationMs !== durationTotal) {
    issues.push('durationMs must equal the sum of step durationMs values');
  }
}

function requiredLabels(options) {
  const labels = [...BASE_REQUIRED_LABELS];
  if (!options.skipSmoke) labels.push('Desktop smoke gates');
  if (!options.skipVisual) labels.push('Full 3D visual baseline');
  if (options.includeStability) labels.push('3D visual stability repeatability');
  return labels;
}

function formatDuration(ms) {
  if (!Number.isFinite(ms)) return 'unknown';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function escapeMarkdownCell(value) {
  return String(value).replaceAll('|', '\\|');
}

function validateStringArray(value, name, issues) {
  if (!Array.isArray(value) || value.length === 0 || value.some(item => !isNonEmptyString(item))) {
    issues.push(`${name} must be a non-empty string array`);
  }
}

function validateTimestamp(value, name, issues) {
  if (!isValidTimestamp(value)) issues.push(`${name} must be a valid ISO timestamp string`);
}

function validateNonNegativeNumber(value, name, issues) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    issues.push(`${name} must be a non-negative finite number`);
    return false;
  }
  return true;
}

function isValidTimestamp(value) {
  return isNonEmptyString(value) && Number.isFinite(Date.parse(value));
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
