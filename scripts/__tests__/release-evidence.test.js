import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  RELEASE_LAYER_IDS,
  buildReviewHtml,
  deriveReleaseDecision,
  validateReleaseManifest,
  verifyReleaseArtifacts
} from '../release-evidence.mjs';

const COMMIT = 'a'.repeat(40);
const SHA256 = 'b'.repeat(64);

function makeManifest() {
  return {
    schemaVersion: '2d-release-evidence/v1',
    generatedAt: '2026-09-01T08:00:00.000Z',
    candidate: {
      commit: COMMIT,
      branch: 'codex/2d-isolation-hardening',
      clean: true,
      frozen: true,
      dirtyScope: [],
      rollback: { revision: 'c'.repeat(40), verified: true }
    },
    layers: RELEASE_LAYER_IDS.map(id => ({
      id,
      status: 'PASS',
      command: `verify ${id}`,
      startedAt: '2026-09-01T07:00:00.000Z',
      finishedAt: '2026-09-01T07:01:00.000Z',
      candidateCommit: COMMIT,
      artifact: { path: `work/release/evidence/${id}.json`, sha256: SHA256 },
      actor:
        id === 'human-review'
          ? 'named-reviewer'
          : id === 'release-authorization'
            ? 'release-manager'
            : '',
      reason: '',
      owner: '',
      requiredAction: '',
      rollbackPoint: '',
      closureCondition: ''
    }))
  };
}

describe('2D release evidence contract', () => {
  it('releases only one clean, frozen, recoverable candidate with all seven layers passing', () => {
    const manifest = makeManifest();
    expect(validateReleaseManifest(manifest)).toEqual([]);
    expect(deriveReleaseDecision(manifest)).toEqual({ decision: 'RELEASE', blockers: [] });
  });

  it.each([
    ['dirty candidate', manifest => (manifest.candidate.clean = false)],
    ['unfrozen candidate', manifest => (manifest.candidate.frozen = false)],
    ['unverified rollback', manifest => (manifest.candidate.rollback.verified = false)],
    ['missing layer', manifest => manifest.layers.pop()],
    ['mismatched candidate', manifest => (manifest.layers[0].candidateCommit = 'd'.repeat(40))]
  ])('fails closed for %s', (_label, mutate) => {
    const manifest = makeManifest();
    mutate(manifest);
    expect(deriveReleaseDecision(manifest).decision).toBe('HOLD');
  });

  it('condenses candidate cleanliness, freeze, and rollback failures into one closure row', () => {
    const manifest = makeManifest();
    manifest.candidate.clean = false;
    manifest.candidate.frozen = false;
    manifest.candidate.rollback.verified = false;
    const candidateRows = deriveReleaseDecision(manifest).blockers.filter(
      blocker => blocker.id === 'candidate'
    );
    expect(candidateRows).toHaveLength(1);
    expect(candidateRows[0].reason).toContain('候选仍有脏变更');
    expect(candidateRows[0].reason).toContain('候选尚未冻结');
    expect(candidateRows[0].reason).toContain('回滚修订尚未验证可恢复');
  });

  it('requires blocker ownership and closure fields for every unresolved layer', () => {
    const manifest = makeManifest();
    Object.assign(manifest.layers[2], {
      status: 'BLOCKED',
      artifact: null,
      actor: '',
      reason: 'AMap credentials are unavailable',
      owner: 'release engineer',
      requiredAction: 'Run the credentialed AMap workflow',
      rollbackPoint: manifest.candidate.rollback.revision,
      closureCondition: 'Candidate-bound AMap evidence validates as PASS'
    });

    const result = deriveReleaseDecision(manifest);
    expect(result.decision).toBe('HOLD');
    expect(result.blockers).toContainEqual(
      expect.objectContaining({ id: 'amap-live', owner: 'release engineer' })
    );
  });

  it('keeps AMap and DeepSeek as independent evidence layers', () => {
    expect(RELEASE_LAYER_IDS).toContain('amap-live');
    expect(RELEASE_LAYER_IDS).toContain('deepseek-live');
    expect(RELEASE_LAYER_IDS.indexOf('amap-live')).not.toBe(
      RELEASE_LAYER_IDS.indexOf('deepseek-live')
    );
  });

  it('rejects absolute, escaping, stale, skipped, fixture, mock, and secret-bearing evidence', () => {
    const manifest = makeManifest();
    manifest.layers[0].artifact.path = '../outside.json';
    manifest.layers[1].status = 'SKIPPED';
    manifest.layers[2].fixture = true;
    manifest.layers[3].apiKey = 'secret-value';
    const errors = validateReleaseManifest(manifest).join('\n');
    expect(errors).toMatch(/relative artifact path/);
    expect(errors).toMatch(/invalid status/);
    expect(errors).toMatch(/fixture or mock/);
    expect(errors).toMatch(/secret field/);
  });

  it('generates the layered binder and blocker desk from the validated manifest', () => {
    const manifest = makeManifest();
    Object.assign(manifest.layers[3], {
      status: 'NOT_RUN',
      artifact: null,
      actor: '',
      reason: 'No candidate-bound DeepSeek run exists',
      owner: 'release engineer',
      requiredAction: 'Run the DeepSeek live smoke workflow',
      rollbackPoint: manifest.candidate.rollback.revision,
      closureCondition: 'Candidate-bound DeepSeek evidence validates as PASS'
    });

    const html = buildReviewHtml(manifest);
    expect(html).toContain('分层活页审查册');
    expect(html).toContain('阻断项收口台');
    expect(html).toContain('AMap LIVE');
    expect(html).toContain('DeepSeek LIVE');
    expect(html).toContain('HOLD');
    expect(html).toContain('No candidate-bound DeepSeek run exists');
  });

  it('verifies that every referenced artifact exists and matches its SHA-256', async () => {
    const root = await mkdtemp(join(tmpdir(), 'release-evidence-'));
    const payload = '{"result":"PASS"}\n';
    await writeFile(join(root, 'evidence.json'), payload);
    const manifest = makeManifest();
    const digest = createHash('sha256').update(payload).digest('hex');
    for (const layer of manifest.layers) {
      layer.artifact = { path: 'evidence.json', sha256: digest };
    }
    expect(await verifyReleaseArtifacts(manifest, root)).toEqual([]);

    await writeFile(join(root, 'evidence.json'), '{"result":"tampered"}\n');
    expect((await verifyReleaseArtifacts(manifest, root)).join('\n')).toMatch(/SHA-256 mismatch/);
  });
});
