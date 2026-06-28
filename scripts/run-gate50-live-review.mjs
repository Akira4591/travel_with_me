import { spawnSync } from 'node:child_process';

const result = spawnSync(
  process.execPath,
  [
    'node_modules/@playwright/test/cli.js',
    'test',
    'tests/e2e/gate50-live-review.spec.js',
    '--project=chromium',
    '--reporter=line',
    '--workers=1',
    ...process.argv.slice(2)
  ],
  {
    stdio: 'inherit',
    shell: false
  }
);

process.exit(result.status ?? 1);
