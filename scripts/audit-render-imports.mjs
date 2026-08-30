import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { assertExplicit2DRuntimeManifest, build2DRuntimeManifest } from './active-2d-runtime.mjs';

const ROOT = process.cwd();
const FORBIDDEN_IMPORTS = [
  /\bfrom\s+['"]\.\.\/api(?:\/|['"])/,
  /\bimport\s*\(\s*['"]\.\.\/api(?:\/|['"])/,
  /\bfrom\s+['"]\.\.\/\.\.\/server(?:\/|['"])/,
  /\bimport\s*\(\s*['"]\.\.\/\.\.\/server(?:\/|['"])/
];
const FORBIDDEN_PROVIDER_FETCH = /\bfetch\s*\(\s*['"]https?:\/\//;

const runtime = await build2DRuntimeManifest(ROOT);
assertExplicit2DRuntimeManifest(runtime);
const files = [...runtime.activeJavaScriptPaths]
  .filter(projectPath => projectPath.startsWith('js/render/'))
  .map(projectPath => path.join(ROOT, projectPath));
const violations = [];

for (const file of files) {
  const source = await readFile(file, 'utf8');
  const relative = toPosix(path.relative(ROOT, file));
  source.split(/\r?\n/).forEach((line, index) => {
    const trimmed = line.trim();
    if (trimmed.startsWith('//')) return;
    if (FORBIDDEN_IMPORTS.some(pattern => pattern.test(trimmed))) {
      violations.push(`${relative}:${index + 1} imports provider/server code`);
    }
    if (FORBIDDEN_PROVIDER_FETCH.test(trimmed)) {
      violations.push(`${relative}:${index + 1} directly fetches a remote provider URL`);
    }
  });
}

if (violations.length) {
  console.error('Renderer/provider boundary audit failed:');
  violations.forEach(item => console.error(`- ${item}`));
  process.exit(1);
}

console.log(`Renderer/provider boundary audit passed (${files.length} render files scanned).`);

function toPosix(value) {
  return value.split(path.sep).join('/');
}
