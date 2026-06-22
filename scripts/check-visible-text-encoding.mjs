import { readFile } from 'node:fs/promises';
import { extname, relative } from 'node:path';
import { readdirSync, statSync } from 'node:fs';

const ROOT = process.cwd();
const INCLUDED_EXTENSIONS = new Set([
  '.css',
  '.html',
  '.js',
  '.json',
  '.md',
  '.mjs',
  '.ts',
  '.tsx'
]);
const SKIP_DIRS = new Set([
  '.git',
  '.husky',
  'coverage',
  'node_modules',
  'playwright-report',
  'test-results'
]);
const SKIP_FILES = new Set(['package-lock.json']);

const MOJIBAKE_PATTERNS = [
  { name: 'replacement character', regex: new RegExp('\\uFFFD', 'u') },
  { name: 'gbk mojibake marker', regex: new RegExp('\\u951F', 'u') },
  {
    name: 'common Chinese UTF-8 decoded as GBK',
    regex: new RegExp(
      [
        '\\u5997\\u5C90',
        '\\u9470\\u4F6A',
        '\\u9356\\u693E',
        '\\u741B\\u5C90',
        '\\u9366\\u6273',
        '\\u7025\\u714E',
        '\\u74BA\\uE21C',
        '\\u93C3\\u544C',
        '\\u93BC\\u6EED',
        '\\u5A23\\u8B72',
        '\\u6DC7\\u6FEE',
        '\\u941E\\u51A8',
        '\\u95BD\\u5806',
        '\\u752F\\uFE42',
        '\\u6FE9\\u5C7C',
        '\\u6D93\\u5B2E'
      ].join('|'),
      'u'
    )
  }
];

const files = walk(ROOT).filter(file => {
  if (SKIP_FILES.has(file.split(/[\\/]/).pop())) return false;
  return INCLUDED_EXTENSIONS.has(extname(file));
});

const findings = [];

for (const file of files) {
  const text = await readFile(file, 'utf8');
  const lines = text.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    for (const pattern of MOJIBAKE_PATTERNS) {
      if (pattern.regex.test(line)) {
        findings.push({
          file: relative(ROOT, file),
          line: index + 1,
          pattern: pattern.name,
          text: line.trim().slice(0, 180)
        });
      }
    }
  }
}

if (findings.length) {
  console.error('Visible text encoding check failed:');
  for (const finding of findings) {
    console.error(`${finding.file}:${finding.line} [${finding.pattern}] ${finding.text}`);
  }
  process.exit(1);
}

console.log(`Visible text encoding check passed (${files.length} files scanned).`);

function walk(dir) {
  const entries = [];
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const fullPath = `${dir}\\${name}`;
    const stat = statSync(fullPath);
    if (stat.isDirectory()) entries.push(...walk(fullPath));
    else if (stat.isFile()) entries.push(fullPath);
  }
  return entries;
}
