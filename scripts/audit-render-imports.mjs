import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const RENDER_DIR = path.join(ROOT, 'js', 'render');
const FORBIDDEN_IMPORTS = [
  /\bfrom\s+['"]\.\.\/api(?:\/|['"])/,
  /\bimport\s*\(\s*['"]\.\.\/api(?:\/|['"])/,
  /\bfrom\s+['"]\.\.\/\.\.\/server(?:\/|['"])/,
  /\bimport\s*\(\s*['"]\.\.\/\.\.\/server(?:\/|['"])/
];
const FORBIDDEN_PROVIDER_FETCH = /\bfetch\s*\(\s*['"]https?:\/\//;

const files = await listJavaScriptFiles(RENDER_DIR);
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

async function listJavaScriptFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async entry => {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) return listJavaScriptFiles(fullPath);
      return entry.isFile() && entry.name.endsWith('.js') ? [fullPath] : [];
    })
  );
  return files.flat();
}

function toPosix(value) {
  return value.split(path.sep).join('/');
}
