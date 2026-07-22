import { readFile } from 'node:fs/promises';

const FILES = ['TODO.md', 'docs/operations/quality-gate-status.md'];
const STALE_PATTERNS = [
  { name: 'old unit-test count', regex: /30 files,\s*146 tests/u },
  { name: 'old unit-test count', regex: /3[12] files,\s*15[1-9] tests/u },
  { name: 'old unit-test count', regex: /33 files,\s*162 tests/u },
  { name: 'old unit-test count', regex: /33 files,\s*163 tests/u },
  { name: 'old unit-test count', regex: /34 files,\s*168 tests/u },
  { name: 'old encoding count', regex: /31[02] visible source\/doc\/test files scanned/u },
  { name: 'old encoding count', regex: /31[568] (?:visible source\/doc\/test )?files scanned/u },
  { name: 'old encoding count', regex: /320 (?:visible source\/doc\/test )?files scanned/u },
  { name: 'old encoding count', regex: /322 (?:visible source\/doc\/test )?files scanned/u },
  { name: 'old encoding count', regex: /325 (?:visible source\/doc\/test )?files scanned/u },
  { name: 'old encoding count', regex: /327 (?:visible source\/doc\/test )?files scanned/u },
  { name: 'old encoding count', regex: /329 (?:visible source\/doc\/test )?files scanned/u },
  { name: 'old smoke count', regex: /12 desktop tests,\s*1 mobile-only test skipped/u },
  { name: 'old chromium smoke count', regex: /12 passed,\s*1 mobile-only skipped/u }
];

const findings = [];
const texts = new Map();

for (const file of FILES) {
  const text = await readFile(file, 'utf8');
  texts.set(file, text);
  const lines = text.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    for (const pattern of STALE_PATTERNS) {
      if (pattern.regex.test(lines[index])) {
        findings.push(`${file}:${index + 1} [${pattern.name}] ${lines[index].trim()}`);
      }
    }
  }
}

const quality = texts.get('docs/operations/quality-gate-status.md') || '';
const verificationUnit = matchFirst(
  quality,
  /\| `npm\.cmd test`\s+\|\s+Passed:\s+(\d+) files,\s+(\d+) tests\s+\|/u
);
const completedUnit = matchFirst(
  quality,
  /\|\s+2\s+\| Unit tests pass\s+\|\s+`npm\.cmd test`:\s+(\d+) files,\s+(\d+) tests\s+\|/u
);
if (!verificationUnit || !completedUnit) {
  findings.push(
    'docs/operations/quality-gate-status.md [unit-ledger] could not parse unit-test ledger rows'
  );
} else if (verificationUnit.join('/') !== completedUnit.join('/')) {
  findings.push(
    `docs/operations/quality-gate-status.md [unit-ledger] verification ${verificationUnit.join('/')} != completed ${completedUnit.join('/')}`
  );
}

const verificationSmoke = matchFirst(
  quality,
  /\| `node scripts\/run-e2e-smoke\.mjs`\s+\|\s+Passed:\s+(\d+) Chromium desktop tests,\s+(\d+) mobile\/desktop-scope skips\s+\|/u
);
const completedSmoke = matchFirst(
  quality,
  /\|\s+3\s+\| Desktop browser smoke tests pass\s+\|\s+Smoke runner:\s+(\d+) Chromium desktop tests passed,\s+(\d+) scoped skips\s+\|/u
);
if (!verificationSmoke || !completedSmoke) {
  findings.push(
    'docs/operations/quality-gate-status.md [smoke-ledger] could not parse smoke ledger rows'
  );
} else if (verificationSmoke.join('/') !== completedSmoke.join('/')) {
  findings.push(
    `docs/operations/quality-gate-status.md [smoke-ledger] verification ${verificationSmoke.join('/')} != completed ${completedSmoke.join('/')}`
  );
}

const verificationEncoding = matchFirst(
  quality,
  /\| `npm\.cmd run check:encoding`\s+\|\s+Passed:\s+(\d+) visible source\/doc\/test files scanned\s+\|/u
);
const completedEncoding = matchFirst(
  quality,
  /\|\s+26\s+\| No visible UI mojibake in maintained source, tests, and docs\s+\|\s+`npm\.cmd run check:encoding`:\s+(\d+) files scanned\s+\|/u
);
if (!verificationEncoding || !completedEncoding) {
  findings.push(
    'docs/operations/quality-gate-status.md [encoding-ledger] could not parse encoding ledger rows'
  );
} else if (verificationEncoding[0] !== completedEncoding[0]) {
  findings.push(
    `docs/operations/quality-gate-status.md [encoding-ledger] verification ${verificationEncoding[0]} != completed ${completedEncoding[0]}`
  );
}

if (findings.length) {
  console.error('Quality ledger check failed:');
  for (const finding of findings) console.error(finding);
  process.exit(1);
}

console.log('Quality ledger check passed.');

function matchFirst(text, regex) {
  const match = regex.exec(text);
  return match ? match.slice(1) : null;
}
