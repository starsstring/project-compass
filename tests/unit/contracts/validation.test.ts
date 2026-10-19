import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateReport, validateHumanDecision,
  type ContractResult, type ReportRevision, type HumanDecision,
} from '../../../src/domain/contracts/index.js';

// Tests run after tsc, from dist/tests/unit/contracts. Fixtures stay canonical.
function fixture(name: string): unknown {
  return JSON.parse(readFileSync(new URL(`../../../../contracts/examples/${name}`, import.meta.url), 'utf8')) as unknown;
}
function report(): ReportRevision {
  const result = validateReport(fixture('report-initial.json'));
  if (!result.ok) throw new Error(JSON.stringify(result.error));
  return result.value;
}
function decision(): HumanDecision {
  const result = validateHumanDecision(fixture('human-decision.json'));
  if (!result.ok) throw new Error(JSON.stringify(result.error));
  return result.value;
}
function rejected(result: ContractResult<unknown>, path?: string): void {
  assert.equal(result.ok, false);
  if (result.ok) throw new Error('Expected invalid input');
  assert.ok(result.error.details.length > 0);
  if (path) assert.ok(result.error.details.some(error => error.instancePath === path), JSON.stringify(result.error));
}
function first<T>(items: T[]): T {
  assert.ok(items[0]);
  return items[0];
}

for (const name of ['report-initial.json', 'report-corrected.json']) {
  test(`${name} passes without mutation`, () => {
    const input = fixture(name);
    const before = structuredClone(input);
    assert.equal(validateReport(input).ok, true);
    assert.deepEqual(input, before);
  });
}
test('explicit human decision passes', () => assert.equal(validateHumanDecision(fixture('human-decision.json')).ok, true));

test('additional report fields at every object boundary are rejected, never removed', () => {
  for (const locate of [
    (r: ReportRevision) => r,
    (r: ReportRevision) => r.idea,
    (r: ReportRevision) => r.provenance,
    (r: ReportRevision) => first(r.sources),
    (r: ReportRevision) => first(r.claims),
    (r: ReportRevision) => first(first(r.claims).evidence),
    (r: ReportRevision) => first(r.alternatives),
    (r: ReportRevision) => r.assessment,
    (r: ReportRevision) => first(r.assessment.conditions),
    (r: ReportRevision) => r.change,
  ]) {
    const input = report();
    Object.assign(locate(input), { unexpected: 'not removed' });
    const before = structuredClone(input);
    rejected(validateReport(input));
    assert.deepEqual(input, before);
  }
});
test('wrong types and missing required fields never receive defaults/coercion', () => {
  const input = { ...report(), revision_id: 123 };
  rejected(validateReport(input), '/revision_id');
  assert.equal(input.revision_id, 123);
  const { scorecard: _omitted, ...missing } = report();
  rejected(validateReport(missing));
  assert.equal('scorecard' in missing, false);
});
test('wrong recommendation and evidence enums fail', () => {
  const input = report();
  Object.assign(input.assessment, { recommendation: 'publish' });
  rejected(validateReport(input), '/assessment/recommendation');
  Object.assign(first(first(input.claims).evidence), { relation: 'proves' });
  rejected(validateReport(input), '/claims/0/evidence/0/relation');
});
test('source URL requires valid HTTPS URI', () => {
  for (const url of ['http://example.com', 'file:///tmp/data', 'https://', 'https://bad host/path',
    'https://user:password@example.com', 'https://user@example.com', 'https://[bad]',
    'https://example.com:bad', 'https://example.com\n/path', 'https://example.com\\path']) {
    const input = report();
    first(input.sources).url = url;
    rejected(validateReport(input), '/sources/0/url');
  }
});
test('UTC timestamps require actual valid date-time and Z form', () => {
  for (const created_at of ['2026-02-30T12:00:00Z', 'yesterday', '2026-10-18T08:00:00+00:00']) {
    rejected(validateReport({ ...report(), created_at }), '/created_at');
  }
});
test('a source statement needs support, not just context or refutation', () => {
  for (const evidence of [[], [{ source_id: 'source_01', relation: 'context' }],
    [{ source_id: 'source_01', relation: 'refute' }]]) {
    const input = report();
    Object.assign(first(input.claims), { evidence });
    rejected(validateReport(input), '/claims/0/evidence');
  }
});
test('inference and hypothesis permit no evidence at the structure layer', () => {
  for (const kind of ['inference', 'hypothesis'] as const) {
    const input = report();
    Object.assign(first(input.claims), { kind, evidence: [] });
    assert.equal(validateReport(input).ok, true);
  }
});
test('capture status conditional requires text/hash/scope or explicit nulls', () => {
  for (const patch of [
    { content_text: null }, { content_sha256: null }, { content_scope: 'none' },
    { capture_status: 'metadata_only' }, { capture_status: 'unavailable' },
  ]) {
    const input = report();
    Object.assign(first(input.sources), patch);
    rejected(validateReport(input));
  }
  const input = report();
  Object.assign(first(input.sources), { capture_status: 'unavailable', content_text: null,
    content_sha256: null, content_scope: 'none' });
  assert.equal(validateReport(input).ok, true); // referenced captured support is T02
});
test('a URL-less source must be a manual note', () => {
  const input = report();
  first(input.sources).url = null;
  rejected(validateReport(input));
  first(input.sources).source_type = 'manual_note';
  assert.equal(validateReport(input).ok, true);
});
test('parent and initial change kind must agree in both directions', () => {
  rejected(validateReport({ ...report(), parent_revision_id: 'rev_parent' }));
  const input = report();
  input.change.kind = 'review_update';
  rejected(validateReport(input));
  input.parent_revision_id = 'rev_parent';
  assert.equal(validateReport(input).ok, true);
});
test('model provenance requires non-null run, model and prompt hash', () => {
  const input = report();
  input.provenance.kind = 'model';
  rejected(validateReport(input));
  Object.assign(input.provenance, { run_id: 'run_fixture', model: 'synthetic-model', prompt_sha256: 'a'.repeat(64) });
  assert.equal(validateReport(input).ok, true);
  for (const key of ['run_id', 'model', 'prompt_sha256'] as const) {
    const invalid = structuredClone(input);
    invalid.provenance[key] = null;
    rejected(validateReport(invalid));
  }
});

function withScores(): ReportRevision {
  const input = report();
  const rating = { value: null, reason: 'Unknown', claim_ids: [] };
  input.scorecard = { version: 'compass-v0.3', ratings: {
    demand: { ...rating }, gap: { ...rating }, distribution: { ...rating },
    feasibility: { ...rating }, retention: { ...rating }, demo: { ...rating },
  } };
  return input;
}
test('null scorecard and six unknown ratings are allowed', () => {
  assert.equal(validateReport(report()).ok, true);
  assert.equal(validateReport(withScores()).ok, true);
});
test('ratings accept 0 to 5 including fractions; reject other values without coercion', () => {
  for (const value of [0, 2.5, 5, -1, 6, '3', NaN, Infinity, -Infinity]) {
    const input = withScores();
    assert.ok(input.scorecard);
    Object.assign(input.scorecard.ratings.demand, { value });
    assert.equal(validateReport(input).ok, typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 5);
    assert.equal(input.scorecard.ratings.demand.value, value);
  }
});
test('score dimensions must be exactly six; derived totals and weights are not inputs', () => {
  for (const locate of [
    (r: ReportRevision) => r.scorecard,
    (r: ReportRevision) => r.scorecard?.ratings,
    (r: ReportRevision) => r.scorecard?.ratings.demand,
  ]) {
    const input = withScores();
    Object.assign(locate(input) ?? {}, { total: 100 });
    rejected(validateReport(input));
  }
  const input = withScores();
  assert.ok(input.scorecard);
  const { demo: _demo, ...missing } = input.scorecard.ratings;
  Object.assign(input.scorecard, { ratings: missing });
  rejected(validateReport(input));
});
test('IDs, hashes, array bounds and duplicate set members are constrained', () => {
  rejected(validateReport({ ...report(), revision_id: '../bad/path' }));
  const input = report();
  first(input.sources).content_sha256 = 'not-a-hash';
  rejected(validateReport(input));
  rejected(validateReport({ ...report(), sources: Array(31).fill(first(report().sources)) }));
  rejected(validateReport({ ...report(), alternatives: [] }));
  const duplicate = report();
  duplicate.assessment.claim_ids = ['claim_01', 'claim_01'];
  rejected(validateReport(duplicate));
});
test('decision rejects extra fields, non-human actors, bad choices, missing reason and time', () => {
  for (const input of [
    { ...decision(), extra: true }, { ...decision(), actor: { kind: 'model', id: 'test' } },
    { ...decision(), actor: { ...decision().actor, extra: true } },
    { ...decision(), choice: 'investigate' }, { ...decision(), reason: '' },
    { ...decision(), decided_at: '2026-02-30T12:00:00Z' },
    { ...decision(), report_revision_id: 1 },
  ]) rejected(validateHumanDecision(input));
  const { reason: _reason, ...missing } = decision();
  rejected(validateHumanDecision(missing));
});
test('unknown versions have a stable error code for both contracts', () => {
  for (const validate of [validateReport, validateHumanDecision]) {
    const result = validate({ schema_version: '2.0' });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error.code, 'UNSUPPORTED_SCHEMA');
    for (const input of [null, [], 1, 'text', {}, { schema_version: 1 }]) rejected(validate(input));
  }
});
test('error details retain field paths and survive later calls', () => {
  const result = validateReport({ ...report(), revision_id: '' });
  rejected(result, '/revision_id');
  const before = structuredClone(result);
  validateReport(null);
  validateReport(report());
  assert.deepEqual(result, before);
});
