import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  deriveReleaseDecision,
  validateReleaseManifest,
  verifyReleaseArtifacts
} from './release-evidence.mjs';

const input = process.argv[2];
if (!input) throw new Error('Usage: node scripts/check-release-evidence.mjs <manifest.json>');
const manifest = JSON.parse(await readFile(resolve(input), 'utf8'));
const errors = validateReleaseManifest(manifest);
if (errors.length) throw new Error(errors.join('\n'));
const artifactErrors = await verifyReleaseArtifacts(manifest, process.cwd());
if (artifactErrors.length) throw new Error(artifactErrors.join('\n'));
const result = deriveReleaseDecision(manifest);
console.log(`2D release manifest valid: ${result.decision}; ${result.blockers.length} blocker(s).`);
