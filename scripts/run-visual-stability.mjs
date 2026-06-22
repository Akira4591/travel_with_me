import { spawnSync } from 'node:child_process';

const rawArgs = process.argv.slice(2);
const { options, passthrough } = parseArgs(rawArgs);
const runs = parsePositiveInteger(options.runs ?? process.env.VISUAL_STABILITY_RUNS, 2);
const dryRun = Boolean(options['dry-run']);
const workers = parsePositiveInteger(options.workers ?? process.env.VISUAL_STABILITY_WORKERS, 1);
const project = options.project || 'chromium';

const baseCommand = [
  process.execPath,
  'node_modules/@playwright/test/cli.js',
  'test',
  'tests/e2e/visual-baseline.spec.js',
  '--project',
  project,
  '--reporter',
  'line',
  '--workers',
  String(workers),
  ...passthrough
];

const results = [];
for (let run = 1; run <= runs; run += 1) {
  console.log(`\n[visual-stability] Run ${run}/${runs}`);
  console.log(`$ ${formatCommand(baseCommand)}`);
  if (dryRun) {
    results.push({ run, status: 0, durationMs: 0 });
    continue;
  }

  const startedAt = Date.now();
  const result = spawnSync(baseCommand[0], baseCommand.slice(1), {
    stdio: 'inherit',
    shell: false,
    env: {
      ...process.env,
      VISUAL_STABILITY_RUN_INDEX: String(run),
      VISUAL_STABILITY_RUNS: String(runs)
    }
  });
  const status = result.status ?? 1;
  results.push({ run, status, durationMs: Date.now() - startedAt });
  if (status !== 0) {
    if (result.error) console.error(result.error.message);
    printSummary(results, runs);
    process.exit(status);
  }
}

printSummary(results, runs);
console.log('\n[visual-stability] Visual baseline remained stable across requested runs.');

function parseArgs(args) {
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

function parsePositiveInteger(value, fallback) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function printSummary(results, expectedRuns) {
  const passed = results.filter(result => result.status === 0).length;
  const failed = results.filter(result => result.status !== 0).length;
  console.log('\n[visual-stability] Summary');
  console.log(`  requested: ${expectedRuns}`);
  console.log(`  completed: ${results.length}`);
  console.log(`  passed: ${passed}`);
  console.log(`  failed: ${failed}`);
  for (const result of results) {
    const seconds = (result.durationMs / 1000).toFixed(1);
    console.log(`  run ${result.run}: exit ${result.status}, ${seconds}s`);
  }
}

function formatCommand(parts) {
  return parts.map(part => (/\s/.test(part) ? `"${part.replaceAll('"', '\\"')}"` : part)).join(' ');
}
