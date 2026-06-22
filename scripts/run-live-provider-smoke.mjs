import { spawnSync } from 'node:child_process';

const command = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const result = spawnSync(
  command,
  ['playwright', 'test', '--grep', '@live-provider', ...process.argv.slice(2)],
  {
    stdio: 'inherit',
    shell: false,
    env: {
      ...process.env,
      LIVE_PROVIDER: '1'
    }
  }
);

process.exit(result.status ?? 1);
