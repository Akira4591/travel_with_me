import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import { validateLandmarkAsset } from '../js/render/landmark-assets.js';

const ROOT = process.cwd();
const SCENE_FIXTURE_DIR = path.join(ROOT, 'tests', 'fixtures', 'scenes');
const violations = [];
let landmarkCount = 0;

for (const file of await listGeoAssetFilesIfPresent(SCENE_FIXTURE_DIR)) {
  const json = JSON.parse(await readFile(file, 'utf8'));
  const landmarks = Array.isArray(json.landmarks) ? json.landmarks : [];
  landmarks.forEach((landmark, index) => {
    landmarkCount += 1;
    const result = validateLandmarkAsset(landmark);
    if (!result.passed) {
      violations.push(
        `${toPosix(path.relative(ROOT, file))}.landmarks[${index}] ${result.errors.join(', ')}`
      );
    }
  });
}

if (violations.length) {
  console.error('Landmark asset release gate failed:');
  violations.forEach(item => console.error(`- ${item}`));
  process.exit(1);
}

console.log(`Landmark asset release gate passed (${landmarkCount} landmark records scanned).`);

async function listGeoAssetFilesIfPresent(directory) {
  try {
    const entries = await readdir(directory, { withFileTypes: true });
    const nested = await Promise.all(
      entries.map(async entry => {
        const fullPath = path.join(directory, entry.name);
        if (entry.isDirectory()) return listGeoAssetFilesIfPresent(fullPath);
        return entry.isFile() && entry.name === 'geo-assets.json' ? [fullPath] : [];
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
