import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { buildGate50ReviewPacket, readGate50EvidenceFile } from './gate50-evidence.mjs';

const [evidencePath, outputPath = 'output/gate50/manual-review-packet.md'] = process.argv.slice(2);

if (!evidencePath) {
  console.error(
    'Usage: node scripts/create-gate50-review-packet.mjs <evidence-json-path> [output-md-path]'
  );
  process.exit(2);
}

const evidenceTarget = resolve(evidencePath);
const outputTarget = resolve(outputPath);

try {
  const evidence = readGate50EvidenceFile(evidenceTarget);
  const packet = buildGate50ReviewPacket(evidence, {
    sourcePath: evidenceTarget,
    generatedAt: new Date().toISOString()
  });
  mkdirSync(dirname(outputTarget), { recursive: true });
  writeFileSync(outputTarget, `${packet}\n`, 'utf8');
  console.log(`[gate50:packet] Manual review packet written to ${outputTarget}`);
} catch (error) {
  console.error('[gate50:packet] Failed to create manual review packet.');
  console.error(error.message);
  process.exit(1);
}
