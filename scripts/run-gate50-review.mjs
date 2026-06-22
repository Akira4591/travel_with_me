import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { buildGate50ReviewSteps, parseGate50ReviewOptions } from './gate50-review-options.mjs';

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const options = parseGate50ReviewOptions(process.argv.slice(2));
const steps = buildGate50ReviewSteps({
  npmCommand,
  nodeCommand: process.execPath,
  options
});

const evidence = {
  version: 1,
  command: ['npm.cmd', 'run', 'gate50:review', '--', ...process.argv.slice(2)],
  startedAt: new Date().toISOString(),
  options,
  steps: []
};

for (const [label, command, commandArgs] of steps) {
  console.log(`\n[gate50] ${label}`);
  console.log(`$ ${[command, ...commandArgs].join(' ')}`);
  const startedAt = Date.now();
  if (options.dryRun) {
    evidence.steps.push({
      label,
      command: [command, ...commandArgs],
      status: 'dry-run',
      exitCode: 0,
      durationMs: 0
    });
    continue;
  }

  const usesWindowsCommandShell = process.platform === 'win32' && command.endsWith('.cmd');
  const result = spawnSync(
    usesWindowsCommandShell ? formatWindowsCommand([command, ...commandArgs]) : command,
    usesWindowsCommandShell ? [] : commandArgs,
    {
      stdio: 'inherit',
      shell: usesWindowsCommandShell
    }
  );
  evidence.steps.push({
    label,
    command: [command, ...commandArgs],
    status: result.status === 0 ? 'passed' : 'failed',
    exitCode: result.status ?? 1,
    durationMs: Date.now() - startedAt
  });
  if (result.status !== 0) {
    if (result.error) console.error(result.error.message);
    console.error(`[gate50] ${label} failed with exit code ${result.status ?? 1}`);
    finishEvidence('failed');
    process.exit(result.status ?? 1);
  }
}

finishEvidence('passed');
console.log('\n[gate50] Automated evidence passed.');
console.log('[gate50] Manual visual acceptance is still required before promoting gate 50.');

function finishEvidence(status) {
  evidence.finishedAt = new Date().toISOString();
  evidence.status = status;
  evidence.durationMs = evidence.steps.reduce((sum, step) => sum + Number(step.durationMs || 0), 0);
  if (!options.evidenceJson) return;
  const target = resolve(options.evidenceJson);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
  console.log(`[gate50] Evidence JSON written to ${target}`);
}

function formatWindowsCommand(parts) {
  return parts.map(part => (/\s/.test(part) ? `"${part.replaceAll('"', '\\"')}"` : part)).join(' ');
}
