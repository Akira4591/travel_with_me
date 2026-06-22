import { resolve } from 'node:path';

import { readGate50EvidenceFile, validateGate50Evidence } from './gate50-evidence.mjs';

const evidencePath = process.argv[2];

if (!evidencePath) {
  console.error('Usage: node scripts/check-gate50-evidence.mjs <evidence-json-path>');
  process.exit(2);
}

const target = resolve(evidencePath);
let evidence;

try {
  evidence = readGate50EvidenceFile(target);
} catch (error) {
  console.error(`[gate50:evidence] Failed to read ${target}`);
  console.error(error.message);
  process.exit(1);
}

const issues = validateGate50Evidence(evidence);
if (issues.length > 0) {
  console.error(`[gate50:evidence] ${target} failed validation:`);
  for (const issue of issues) console.error(`- ${issue}`);
  process.exit(1);
}

console.log(`[gate50:evidence] ${target} passed validation.`);
