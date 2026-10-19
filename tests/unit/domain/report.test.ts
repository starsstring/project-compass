import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateReportContent } from '../../../src/domain/report.js';
import { sha256Text } from '../../../src/domain/canonical.js';
import { initial, corrected, rated, first, invalid } from './fixtures.js';

test('canonical synthetic reports pass content checks without mutation', () => {
  for (const report of [initial(), corrected()]) {
    const before = structuredClone(report);
    assert.equal(validateReportContent(report).ok, true);
    assert.deepEqual(report, before);
  }
});
test('domain entry always performs strict Schema validation first', () => {
  for (const bad of [null, { ...initial(), extra: 1 }, { ...initial(), revision_id: '../bad' }]) invalid(validateReportContent(bad), 'INVALID_INPUT');
  invalid(validateReportContent({ ...initial(), schema_version: '2.0' }), 'UNSUPPORTED_SCHEMA');
});
for (const name of ['sources', 'claims', 'alternatives'] as const) {
  test(`duplicate ${name} IDs are rejected`, () => {
    const report = initial();
    const items = report[name];
    assert.ok(items[0]);
    Object.assign(report, { [name]: [...items, structuredClone(items[0])] });
    invalid(validateReportContent(report), 'INVALID_REFERENCE');
  });
}
test('conditions require demand and feasibility exactly once', () => {
  const report = initial();
  first(report.assessment.conditions).key = 'other';
  invalid(validateReportContent(report), 'INVALID_REFERENCE');
  report.assessment.conditions.push(structuredClone(first(report.assessment.conditions)));
  invalid(validateReportContent(report), 'INVALID_REFERENCE');
});
test('all claim references must exist in this edition', () => {
  for (const area of ['evidence', 'assessment', 'condition', 'rating', 'alternative']) {
    const report = rated(3);
    switch (area) {
      case 'evidence': first(first(report.claims).evidence).source_id = 'future_source'; break;
      case 'assessment': report.assessment.claim_ids = ['future_claim']; break;
      case 'condition': first(report.assessment.conditions).claim_ids = ['future_claim']; break;
      case 'rating': assert.ok(report.scorecard); report.scorecard.ratings.demo.claim_ids = ['future_claim']; break;
      case 'alternative': report.assessment.alternative_id = 'future_alternative'; break;
    }
    invalid(validateReportContent(report), 'INVALID_REFERENCE');
  }
});
test('evidence rejects duplicate pairs but permits support and refute from one source', () => {
  const report = initial();
  first(report.claims).evidence.push(structuredClone(first(first(report.claims).evidence)));
  invalid(validateReportContent(report), 'INVALID_REFERENCE');
  first(report.claims).evidence[1] = { source_id: 'source_01', relation: 'refute' };
  assert.equal(validateReportContent(report).ok, true);
});
test('context cannot replace support and unavailable/metadata-only cannot support source statements', () => {
  const report = initial();
  first(first(report.claims).evidence).relation = 'context';
  invalid(validateReportContent(report));
  for (const capture_status of ['metadata_only', 'unavailable'] as const) {
    const report = initial();
    Object.assign(first(report.sources), { capture_status, content_text: null, content_sha256: null, content_scope: 'none' });
    invalid(validateReportContent(report), 'INVALID_REFERENCE');
    first(report.claims).kind = 'inference';
    assert.equal(validateReportContent(report).ok, true);
  }
});
test('source SHA-256 uses exact stored text; Unicode/newline changes are not normalized', () => {
  for (const text of ['é', 'e\u0301', 'a\r\nb', 'a\nb']) {
    const report = initial();
    first(report.sources).content_text = text;
    invalid(validateReportContent(report), 'SOURCE_INTEGRITY');
    first(report.sources).content_sha256 = sha256Text(text);
    assert.equal(validateReportContent(report).ok, true);
  }
});
test('source UTF-8 byte limit accepts exactly 256 KiB and rejects excess multibyte text', () => {
  for (const [text, accepted] of [['a'.repeat(262144), true], ['中'.repeat(90000), false]] as const) {
    const report = initial();
    Object.assign(first(report.sources), { content_text: text, content_sha256: sha256Text(text) });
    assert.equal(validateReportContent(report).ok, accepted);
  }
});
test('null scoring is valid; non-null ratings need grounds and a nonblank reason', () => {
  assert.equal(validateReportContent(initial()).ok, true);
  const report = rated(3);
  assert.ok(report.scorecard);
  report.scorecard.ratings.demand.claim_ids = [];
  invalid(validateReportContent(report), 'POLICY_VIOLATION');
  report.scorecard.ratings.demand.value = null;
  assert.equal(validateReportContent(report).ok, true);
  report.scorecard.ratings.demo.reason = '   ';
  invalid(validateReportContent(report), 'POLICY_VIOLATION');
});
test('withdrawn-only ratings fail; disputed grounds are retained without score changes', () => {
  const report = rated(3);
  first(report.claims).review_status = 'withdrawn';
  invalid(validateReportContent(report), 'POLICY_VIOLATION');
  first(report.claims).review_status = 'disputed';
  assert.equal(validateReportContent(report).ok, true);
});
function buildable() {
  const report = initial();
  first(report.claims).review_status = 'supported';
  report.assessment.recommendation = 'build_small';
  report.assessment.conditions.forEach(item => { item.state = 'met'; item.claim_ids = ['claim_01']; });
  return report;
}
test('build_small can pass with no score; scores never bypass required conditions', () => {
  assert.equal(validateReportContent(buildable()).ok, true);
  const report = rated(5);
  report.assessment.recommendation = 'build_small';
  invalid(validateReportContent(report), 'POLICY_VIOLATION');
  assert.equal(report.assessment.recommendation, 'build_small');
});
test('build_small rejects unknown/unmet demand, feasibility and explicit constraints', () => {
  for (const state of ['unknown', 'unmet'] as const) {
    for (const key of ['demand', 'feasibility', 'budget']) {
      const report = buildable();
      report.assessment.conditions.push({ key: 'budget', state: 'met', reason: 'Synthetic', claim_ids: [] });
      const condition = report.assessment.conditions.find(item => item.key === key);
      assert.ok(condition); condition.state = state;
      invalid(validateReportContent(report), 'POLICY_VIOLATION');
    }
  }
});
test('build_small needs nonempty demand/feasibility evidence and supported non-hypothesis grounds', () => {
  for (const patch of ['empty', 'hypothesis', 'withdrawn', 'disputed', 'unreviewed']) {
    const report = buildable();
    if (patch === 'empty') first(report.assessment.conditions).claim_ids = [];
    else if (patch === 'hypothesis') first(report.claims).kind = patch;
    else first(report.claims).review_status = patch as 'withdrawn' | 'disputed' | 'unreviewed';
    invalid(validateReportContent(report), 'POLICY_VIOLATION');
  }
});
test('an unrelated unsupported assessment ground cannot sneak past valid condition evidence', () => {
  const report = buildable();
  const claim = { ...structuredClone(first(report.claims)), claim_id: 'claim_other', review_status: 'withdrawn' as const };
  report.claims.push(claim); report.assessment.claim_ids.push(claim.claim_id);
  invalid(validateReportContent(report), 'POLICY_VIOLATION');
});
