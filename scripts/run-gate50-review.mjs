import { spawnSync } from 'node:child_process';

const args = new Set(process.argv.slice(2));
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const dryRun = args.has('--dry-run');
const skipSmoke = args.has('--skip-smoke');
const skipVisual = args.has('--skip-visual');

const steps = [
  ['Static quality gates', npmCommand, ['run', 'check']],
  ['Unit tests', npmCommand, ['test']],
  ['Visible text encoding gate', npmCommand, ['run', 'check:encoding']]
];

if (!skipSmoke) {
  steps.push(['Desktop smoke gates', process.execPath, ['scripts/run-e2e-smoke.mjs']]);
}

if (!skipVisual) {
  steps.push([
    'Full 3D visual baseline',
    process.execPath,
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

for (const [label, command, commandArgs] of steps) {
  console.log(`\n[gate50] ${label}`);
  console.log(`$ ${[command, ...commandArgs].join(' ')}`);
  if (dryRun) continue;

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
