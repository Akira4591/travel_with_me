export const VISUAL_STABILITY_PRESETS = {
  core: {
    description: 'core ROI captures plus the inspect-camera readability gate',
    grep: 'emits QA and ROI evidence|micro-street inspect view remains readable'
  },
  precision: {
    description: 'city, scenic, and hiking terrain precision review gates',
    grep: 'passes .* terrain precision review'
  },
  'overview-inspect': {
    description: 'overview and inspect screenshot review gates',
    grep: 'passes overview and inspect screenshot review'
  },
  'camera-stress': {
    description: '30-second route readability camera stress gates',
    grep: 'route remains readable during 30s'
  },
  timeline: {
    description: 'frozen generation timeline stage review',
    grep: 'captures timeline visual stages'
  }
};

export function parseVisualStabilityArgs(args = []) {
  const options = {};
  const passthrough = [];
  let passthroughMode = false;

  for (const arg of args) {
    if (arg === '--') {
      passthroughMode = true;
      continue;
    }
    if (!passthroughMode && arg.startsWith('--')) {
      const [key, value] = arg.slice(2).split('=', 2);
      options[key] = value ?? true;
      continue;
    }
    passthrough.push(arg);
  }

  return { options, passthrough };
}

export function buildVisualStabilityCommand({
  nodeCommand,
  options = {},
  passthrough = [],
  env = process.env
} = {}) {
  const runs = parsePositiveInteger(options.runs ?? env.VISUAL_STABILITY_RUNS, 2);
  const workers = parsePositiveInteger(options.workers ?? env.VISUAL_STABILITY_WORKERS, 1);
  const project = options.project || 'chromium';
  const dryRun = Boolean(options['dry-run']);
  const listPresets = Boolean(options['list-presets']);
  const preset = options.preset || '';
  const resolvedPassthrough = [...passthrough];

  if (preset) {
    const presetConfig = VISUAL_STABILITY_PRESETS[preset];
    if (!presetConfig) {
      throw new Error(
        `Unknown visual stability preset "${preset}". Known presets: ${Object.keys(
          VISUAL_STABILITY_PRESETS
        ).join(', ')}`
      );
    }
    if (!hasGrepArgument(resolvedPassthrough)) {
      resolvedPassthrough.push('--grep', presetConfig.grep);
    }
  }

  return {
    runs,
    workers,
    project,
    dryRun,
    listPresets,
    preset,
    command: [
      nodeCommand,
      'node_modules/@playwright/test/cli.js',
      'test',
      'tests/e2e/visual-baseline.spec.js',
      '--project',
      project,
      '--reporter',
      'line',
      '--workers',
      String(workers),
      ...resolvedPassthrough
    ]
  };
}

export function parsePositiveInteger(value, fallback) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function hasGrepArgument(args) {
  return args.some(arg => arg === '--grep' || arg.startsWith('--grep='));
}
