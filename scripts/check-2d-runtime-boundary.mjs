import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertExplicit2DRuntimeManifest, build2DRuntimeManifest } from './active-2d-runtime.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const violations = [];
let runtimeManifest;

try {
  runtimeManifest = await build2DRuntimeManifest(root);
  assertExplicit2DRuntimeManifest(runtimeManifest);
} catch (error) {
  violations.push(error.message);
}

await checkForbiddenText('index.html', [/["']three["']\s*:/i, /id=["']map-3d(?:-toggle)?["']/i]);
await checkForbiddenText('css/components.css', [
  /map-3d|terrain-insight|selecting-3d|annotation-marker/i
]);
await checkForbiddenText('package.json', [/["']three["']\s*:/i, /test:e2e:visual|gate50/i]);
await checkForbiddenText('package.json', [
  /"lint"\s*:\s*"eslint\s+js\//,
  /"format(?::check)?"\s*:\s*"prettier\s+--(?:write|check)\s+\."/
]);
await checkRequiredText('package.json', [
  /run-active-2d-quality\.mjs lint/,
  /run-active-2d-quality\.mjs format-check/
]);
await checkForbiddenText('server/index.js', [
  /\/three\/\*/i,
  /app\.get\([^\n]*(?:_elevation|_geo-assets)/i,
  /app\.use\(\s*["']\/js\/\*["']\s*,\s*serveStatic/i,
  /app\.use\(\s*["']\/css\/\*["']\s*,\s*serveStatic/i
]);
await checkRequiredText('server/index.js', [
  /assertExplicit2DRuntimeManifest\(RUNTIME_2D_MANIFEST\)/,
  /ACTIVE_2D_JAVASCRIPT_PATHS\.has\(projectPath\)/,
  /ACTIVE_2D_STYLESHEET_PATHS\.has\(projectPath\)/
]);
await checkE2EArchiveContract();
await checkDockerRuntimeContract();
await checkRequiredText('scripts/audit-render-imports.mjs', [/build2DRuntimeManifest/]);
await checkRequiredText('scripts/check-visible-text-encoding.mjs', [/build2DQualityManifest/]);

if (violations.length) {
  console.error(
    '2D runtime boundary violations:\n' + violations.map(item => `- ${item}`).join('\n')
  );
  process.exitCode = 1;
} else {
  console.log(
    `2D runtime boundary: ${runtimeManifest.activeJavaScriptPaths.size} explicitly approved modules are active; ` +
      `${runtimeManifest.inactiveJavaScriptPaths.size} inactive JavaScript files are sealed by the static-service allowlist.`
  );
}

async function checkForbiddenText(projectPath, patterns) {
  const source = await readFile(resolve(root, projectPath), 'utf8');
  for (const pattern of patterns) {
    if (pattern.test(source))
      violations.push(`${projectPath} matches forbidden pattern ${pattern}`);
  }
}

async function checkRequiredText(projectPath, patterns) {
  const source = await readFile(resolve(root, projectPath), 'utf8');
  for (const pattern of patterns) {
    if (!pattern.test(source))
      violations.push(`${projectPath} is missing required contract ${pattern}`);
  }
}

async function checkE2EArchiveContract() {
  const runnerPath = 'scripts/run-e2e-smoke.mjs';
  const runner = await readFile(resolve(root, runnerPath), 'utf8');
  const grepInvert = runner.match(/['"]--grep-invert['"]\s*,\s*['"]([^'"]+)['"]/)?.[1] || '';
  const excludedTags = new Set(grepInvert.split('|').filter(Boolean));
  if (excludedTags.has('3D')) {
    violations.push(runnerPath + ' excludes the bare word 3D instead of an archive tag');
  }
  if (!excludedTags.has('@archived-3d')) {
    violations.push(runnerPath + ' does not exclude the explicit @archived-3d tag');
  }

  const smokePath = 'tests/e2e/smoke.spec.js';
  const smoke = await readFile(resolve(root, smokePath), 'utf8');
  const isolationTitle = '2D runtime does not load or expose archived 3D surfaces';
  let isolationTestFound = false;
  for (const match of smoke.matchAll(/\btest\(\s*(['"])(.*?)\1/g)) {
    const title = match[2];
    if (title === isolationTitle) isolationTestFound = true;
    if (title.includes('3D') && title !== isolationTitle && !title.includes('@archived-3d')) {
      violations.push(smokePath + ' has an untagged archived 3D test: ' + title);
    }
  }
  if (!isolationTestFound) {
    violations.push(smokePath + ' is missing the default negative 2D isolation test');
  }
}

async function checkDockerRuntimeContract() {
  const projectPath = 'Dockerfile';
  const source = await readFile(resolve(root, projectPath), 'utf8');
  const stages = source.split(/(?=^FROM\s+)/gim).filter(Boolean);
  const finalStage = stages.at(-1) || '';
  const requiredPatterns = [
    /FROM\s+\S+\s+AS\s+runtime-source/i,
    /RUN node scripts\/assemble-2d-runtime\.mjs \/runtime/,
    /COPY --from=runtime-source \/runtime \.\//
  ];
  for (const pattern of requiredPatterns) {
    if (!pattern.test(source))
      violations.push(`${projectPath} is missing required contract ${pattern}`);
  }
  if (/^COPY\s+\.\s+\.\s*$/m.test(finalStage)) {
    violations.push(`${projectPath} final stage copies the unrestricted source tree`);
  }
}
