import { spawnSync } from 'node:child_process';

const command = process.execPath;
const result = spawnSync(
  command,
  [
    'node_modules/@playwright/test/cli.js',
    'test',
    'tests/e2e/smoke.spec.js',
    '--grep-invert',
    '@live-provider|@visual-roi|@gate50-live-review|@archived-3d',
    ...process.argv.slice(2)
  ],
  {
    stdio: 'inherit',
    shell: false
  }
);

process.exit(result.status ?? 1);
