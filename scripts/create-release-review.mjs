import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { buildReviewHtml, verifyReleaseArtifacts } from './release-evidence.mjs';

const input = process.argv[2];
const output = process.argv[3];
if (!input || !output) {
  throw new Error('Usage: node scripts/create-release-review.mjs <manifest.json> <review.html>');
}
const inputPath = resolve(input);
const outputPath = resolve(output);
if (dirname(inputPath) === outputPath || inputPath === outputPath) {
  throw new Error('Review output must not overwrite the manifest');
}
const manifest = JSON.parse(await readFile(inputPath, 'utf8'));
const artifactErrors = await verifyReleaseArtifacts(manifest, process.cwd());
if (artifactErrors.length) throw new Error(artifactErrors.join('\n'));
await writeFile(outputPath, buildReviewHtml(manifest), 'utf8');
console.log(`Generated read-only 2D release review: ${outputPath}`);
