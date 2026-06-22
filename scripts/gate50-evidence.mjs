import { readFileSync } from 'node:fs';

const VALID_ROOT_STATUSES = new Set(['passed', 'failed']);
const VALID_STEP_STATUSES = new Set(['passed', 'failed', 'dry-run']);

const BASE_REQUIRED_LABELS = ['Static quality gates', 'Unit tests', 'Visible text encoding gate'];

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
