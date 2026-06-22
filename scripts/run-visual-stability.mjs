import { spawnSync } from 'node:child_process';

import {
  VISUAL_STABILITY_PRESETS,
  buildVisualStabilityCommand,
  parseVisualStabilityArgs
} from './visual-stability-options.mjs';

const { options, passthrough } = parseVisualStabilityArgs(process.argv.slice(2));
const {
  command: baseCommand,
  dryRun,
  listPresets,
  runs
} = buildVisualStabilityCommand({
  nodeCommand: process.execPath,
  options,
  passthrough,
  env: process.env
});

if (listPresets) {
  console.log('[visual-stability] Available presets');
  for (const [name, preset] of Object.entries(VISUAL_STABILITY_PRESETS)) {
    console.log(`  ${name}: ${preset.description}`);
    console.log(`    --grep ${JSON.stringify(preset.grep)}`);
  }
  process.exit(0);
}

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
