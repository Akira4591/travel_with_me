import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const SCENE_FIXTURE_DIR = path.join(ROOT, 'tests', 'fixtures', 'scenes');
const REQUIRED_FIELDS = ['source', 'licence', 'attribution', 'updatedAt'];

const files = await listJsonFilesIfPresent(SCENE_FIXTURE_DIR);
const violations = [];

for (const file of files) {
  const json = JSON.parse(await readFile(file, 'utf8'));
  inspectNode(json, toPosix(path.relative(ROOT, file)));
}

if (violations.length) {
  console.error('Provenance check failed:');
  violations.forEach(item => console.error(`- ${item}`));
  process.exit(1);
}

console.log(`Provenance check passed (${files.length} scene fixture files scanned).`);

function inspectNode(value, location) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => inspectNode(item, `${location}[${index}]`));
    return;
  }
  if (!value || typeof value !== 'object') return;

  if (value.realityClaim === true || value.provenance) {
    const provenances = Array.isArray(value.provenance) ? value.provenance : [value.provenance];
    provenances.forEach((item, index) => {
      const missing = REQUIRED_FIELDS.filter(field => !String(item?.[field] || '').trim());
      if (missing.length) {
        violations.push(`${location}.provenance[${index}] missing ${missing.join(', ')}`);
      }
    });
  }

  Object.entries(value).forEach(([key, child]) => inspectNode(child, `${location}.${key}`));
}

async function listJsonFilesIfPresent(directory) {
  try {
    const entries = await readdir(directory, { withFileTypes: true });
    const nested = await Promise.all(
      entries.map(async entry => {
        const fullPath = path.join(directory, entry.name);
        if (entry.isDirectory()) return listJsonFilesIfPresent(fullPath);
        return entry.isFile() && entry.name.endsWith('.json') ? [fullPath] : [];
      })
    );
    return nested.flat();
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

function toPosix(value) {
  return value.split(path.sep).join('/');
}
