import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build2DQualityManifest } from './active-2d-quality.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const mode = process.argv[2];
const { projectPaths } = await build2DQualityManifest(root);

if (mode === 'lint') {
  runNodeCLI(
    'eslint/bin/eslint.js',
    projectPaths.filter(path => ['.js', '.mjs'].includes(extname(path)))
  );
} else if (mode === 'format' || mode === 'format-check') {
  const prettierExtensions = new Set(['.css', '.html', '.js', '.json', '.md', '.mjs']);
  runNodeCLI('prettier/bin/prettier.cjs', [
    mode === 'format' ? '--write' : '--check',
    ...projectPaths.filter(path => prettierExtensions.has(extname(path)))
  ]);
} else {
  throw new Error('Usage: node scripts/run-active-2d-quality.mjs <lint|format|format-check>');
}

function runNodeCLI(packagePath, args) {
  const [packageName, ...relativeEntrypoint] = packagePath.split('/');
  const packageRoot = dirname(require.resolve(`${packageName}/package.json`));
  const entrypoint = resolve(packageRoot, ...relativeEntrypoint);
  const result = spawnSync(process.execPath, [entrypoint, ...args], {
    cwd: root,
    stdio: 'inherit'
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
