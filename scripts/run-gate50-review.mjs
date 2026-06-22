import { spawnSync } from 'node:child_process';

import { buildGate50ReviewSteps, parseGate50ReviewOptions } from './gate50-review-options.mjs';

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const options = parseGate50ReviewOptions(process.argv.slice(2));
const steps = buildGate50ReviewSteps({
  npmCommand,
  nodeCommand: process.execPath,
  options
});

for (const [label, command, commandArgs] of steps) {
  console.log(`\n[gate50] ${label}`);
  console.log(`$ ${[command, ...commandArgs].join(' ')}`);
  if (options.dryRun) continue;

  const usesWindowsCommandShell = process.platform === 'win32' && command.endsWith('.cmd');
  const result = spawnSync(
    usesWindowsCommandShell ? formatWindowsCommand([command, ...commandArgs]) : command,
    usesWindowsCommandShell ? [] : commandArgs,
    {
      stdio: 'inherit',
      shell: usesWindowsCommandShell
    }
  );
  if (result.status !== 0) {
    if (result.error) console.error(result.error.message);
    console.error(`[gate50] ${label} failed with exit code ${result.status ?? 1}`);
    process.exit(result.status ?? 1);
  }
}

console.log('\n[gate50] Automated evidence passed.');
console.log('[gate50] Manual visual acceptance is still required before promoting gate 50.');

function formatWindowsCommand(parts) {
  return parts.map(part => (/\s/.test(part) ? `"${part.replaceAll('"', '\\"')}"` : part)).join(' ');
}
