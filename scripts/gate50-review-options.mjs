export function parseGate50ReviewOptions(rawArgs = []) {
  const args = new Set(rawArgs);
  return {
    dryRun: args.has('--dry-run'),
    skipSmoke: args.has('--skip-smoke'),
    skipVisual: args.has('--skip-visual'),
    includeStability: args.has('--include-stability'),
    stabilityRuns: optionValue(rawArgs, '--stability-runs') || '5',
    stabilityPreset: optionValue(rawArgs, '--stability-preset') || '',
    evidenceJson: optionValue(rawArgs, '--evidence-json') || ''
  };
}

export function buildGate50ReviewSteps({ npmCommand, nodeCommand, options }) {
  const steps = [
    ['Static quality gates', npmCommand, ['run', 'check']],
    ['Unit tests', npmCommand, ['test']],
    ['Visible text encoding gate', npmCommand, ['run', 'check:encoding']]
  ];

  if (!options.skipSmoke) {
    steps.push(['Desktop smoke gates', nodeCommand, ['scripts/run-e2e-smoke.mjs']]);
  }

  if (!options.skipVisual) {
    steps.push([
      'Full 3D visual baseline',
      nodeCommand,
      [
        'node_modules/@playwright/test/cli.js',
        'test',
        'tests/e2e/visual-baseline.spec.js',
        '--project=chromium',
        '--reporter=line',
        '--workers=1'
      ]
    ]);
  }

  if (options.includeStability) {
    const stabilityArgs = ['scripts/run-visual-stability.mjs', `--runs=${options.stabilityRuns}`];
    if (options.stabilityPreset) stabilityArgs.push(`--preset=${options.stabilityPreset}`);
    steps.push(['3D visual stability repeatability', nodeCommand, stabilityArgs]);
  }

  return steps;
}

function optionValue(args, name) {
  const inline = args.find(arg => arg.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = args.indexOf(name);
  if (index >= 0 && args[index + 1] && !args[index + 1].startsWith('--')) return args[index + 1];
  return '';
}
