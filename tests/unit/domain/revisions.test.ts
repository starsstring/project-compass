import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diffReports } from '../../../src/domain/diff.js';
import { validateReportRevision, type RevisionContext } from '../../../src/domain/revisions.js';
import { sha256Text } from '../../../src/domain/canonical.js';
import { initial, corrected, successor, rated, first, value, invalid } from './fixtures.js';

const rootContext = (): RevisionContext => ({ idea_id: 'idea_fixture', parent: null, head_revision_id: null, known_sources: [] });
function context(parent = initial()): RevisionContext {
  return { idea_id: parent.idea_id, parent, head_revision_id: parent.revision_id, known_sources: structuredClone(parent.sources) };
}
function reinterpreted() {
  const report = successor();
  report.assessment.reason = 'A changed interpretation of the same evidence.';
  return report;
}
test('initial and supplied corrected fixtures pass ancestry and exact change-set checks', () => {
  assert.equal(validateReportRevision(initial(), rootContext()).ok, true);
  assert.equal(validateReportRevision(corrected(), context()).ok, true);
});
test('initial change sets contain all IDs and no invented IDs', () => {
  for (const field of ['changed_claim_ids', 'changed_source_ids'] as const) {
    const report = initial(); report.change[field] = [];
    invalid(validateReportRevision(report, rootContext()), 'INVALID_INPUT');
    report.change[field] = ['invented'];
    invalid(validateReportRevision(report, rootContext()), 'INVALID_INPUT');
  }
});
test('missing parent, stale head, incorrect parent and cross-idea ancestry are rejected', () => {
  invalid(validateReportRevision(corrected(), rootContext()), 'REVISION_CONFLICT');
  invalid(validateReportRevision(initial(), { ...rootContext(), head_revision_id: 'already_saved' }), 'REVISION_CONFLICT');
  invalid(validateReportRevision(corrected(), { ...context(), head_revision_id: 'rev_newer' }), 'REVISION_CONFLICT');
  invalid(validateReportRevision({ ...corrected(), parent_revision_id: 'other' }, context()), 'REVISION_CONFLICT');
  invalid(validateReportRevision({ ...corrected(), idea_id: 'idea_other' }, context()), 'INVALID_REFERENCE');
  const other = initial(); other.idea_id = 'idea_other';
  invalid(validateReportRevision(corrected(), { ...context(), parent: other }), 'INVALID_REFERENCE');
});
test('successor cannot reuse the parent revision ID', () => {
  invalid(validateReportRevision({ ...corrected(), revision_id: 'rev_01' }, context()), 'ID_CONFLICT');
});
test('a changed source at the same URL requires a new ID; old content is preserved', () => {
  assert.equal(validateReportRevision(corrected(), context()).ok, true);
  const report = successor();
  first(report.sources).content_text = 'New contents at the same URL';
  first(report.sources).content_sha256 = sha256Text('New contents at the same URL');
  report.change.changed_source_ids = ['source_01'];
  invalid(validateReportRevision(report, context()), 'SOURCE_INTEGRITY');
  assert.equal(first(initial().sources).content_text, '合成测试资料：模拟工具提供 Markdown 导出。');
});
test('removed historical snapshots cannot be overwritten or relabeled as new evidence', () => {
  const parent = corrected(), state = context(parent);
  state.known_sources = [...initial().sources, ...parent.sources];
  const report = successor(parent);
  report.sources.push(structuredClone(first(initial().sources)));
  report.change.kind = 'new_evidence'; report.change.changed_source_ids = ['source_01'];
  invalid(validateReportRevision(report, state), 'INVALID_INPUT');
  first(report.sources.filter(source => source.source_id === 'source_01')).title = 'Changed historical metadata';
  invalid(validateReportRevision(report, state), 'SOURCE_INTEGRITY');
});
test('new_evidence accepts a newly introduced snapshot while retaining all companion changes', () => {
  const report = reinterpreted();
  report.sources.push({ ...structuredClone(first(report.sources)), source_id: 'source_new' });
  report.change.kind = 'new_evidence'; report.change.changed_source_ids = ['source_new'];
  assert.equal(validateReportRevision(report, context()).ok, true);
});
test('source misreading can be corrected without any new URL or source', () => {
  const report = successor();
  first(report.claims).text = 'Correction: the same excerpt was misread.';
  report.change.kind = 'evidence_correction'; report.change.changed_claim_ids = ['claim_01'];
  assert.equal(validateReportRevision(report, context()).ok, true);
  assert.equal(value(diffReports(initial(), report)).sources.entries.length, 0);
});
test('change sets must list removals, additions and changed claims exactly', () => {
  const report = corrected();
  report.change.changed_source_ids = ['source_02']; // omission of removed source_01
  invalid(validateReportRevision(report, context()), 'INVALID_INPUT');
  const diff = value(diffReports(initial(), corrected()));
  assert.deepEqual(diff.sources.entries.map(item => [item.id, item.before === null, item.after === null]),
    [['source_01', false, true], ['source_02', true, false]]);
  assert.deepEqual(diff.claims.entries.map(item => item.id), ['claim_01']);
});
test('removed claims and alternatives appear in the diff and detach safely', () => {
  const report = successor();
  report.claims = []; report.sources = [];
  report.assessment.claim_ids = []; report.assessment.alternative_id = null;
  report.alternatives = [{ ...structuredClone(first(report.alternatives)), alternative_id: 'alternative_new' }];
  report.change.changed_claim_ids = ['claim_01']; report.change.changed_source_ids = ['source_01'];
  assert.equal(validateReportRevision(report, context()).ok, true);
  const diff = value(diffReports(initial(), report));
  assert.equal(first(diff.claims.entries).after, null);
  assert.deepEqual(diff.alternatives.entries.map(item => item.id), ['alternative_01', 'alternative_new']);
});
test('revision metadata, provenance and reasons alone cannot create a content revision', () => {
  const report = successor();
  report.created_at = '2026-10-19T08:00:00.000Z';
  report.provenance.producer = 'Different author declaration';
  invalid(validateReportRevision(report, context()), 'INVALID_INPUT');
  const changed = reinterpreted(); changed.change.reason = '  ';
  invalid(validateReportRevision(changed, context()), 'INVALID_INPUT');
});
test('change kinds are backed by the relevant content differences', () => {
  for (const kind of ['new_evidence', 'evidence_correction', 'idea_change', 'review_update'] as const) {
    const report = reinterpreted(); report.change.kind = kind;
    invalid(validateReportRevision(report, context()), 'INVALID_INPUT');
  }
  const idea = successor(); idea.idea.problem = 'Changed problem'; idea.change.kind = 'idea_change';
  assert.equal(validateReportRevision(idea, context()).ok, true);
  const review = successor(); first(review.claims).review_note = 'Reviewed with new understanding';
  review.change.kind = 'review_update'; review.change.changed_claim_ids = ['claim_01'];
  assert.equal(validateReportRevision(review, context()).ok, true);
});
test('diff is complete across input, route, conditions, ratings and same-ID claim fields', () => {
  const report = reinterpreted();
  report.idea.problem = 'New problem'; first(report.alternatives).title = 'New route';
  first(report.assessment.conditions).reason = 'New condition reason';
  first(report.claims).kind = 'inference'; first(report.claims).evidence = [];
  first(report.claims).review_status = 'disputed'; report.change.changed_claim_ids = ['claim_01'];
  const diff = value(diffReports(initial(), report));
  assert.ok(diff.idea.changed && diff.alternatives.changed && diff.assessment.changed && diff.claims.changed);
  assert.equal(first(diff.claims.entries).after?.kind, 'inference');
});
test('diff permits nonadjacent/reversed editions, rejects cross-idea and conflicting IDs/sources', () => {
  const a = initial(), b = reinterpreted(); b.parent_revision_id = 'rev_intermediate';
  assert.equal(diffReports(a, b).ok, true);
  assert.equal(diffReports(b, a).ok, true);
  invalid(diffReports(a, { ...b, idea_id: 'another' }), 'INVALID_REFERENCE');
  invalid(diffReports(a, { ...b, revision_id: a.revision_id }), 'ID_CONFLICT');
  first(b.sources).title = 'Replaced metadata';
  invalid(diffReports(a, b), 'SOURCE_INTEGRITY');
});
test('diff keeps array ordering visible, sorts changed IDs and returns detached data', () => {
  const a = initial();
  a.claims.push({ ...structuredClone(first(a.claims)), claim_id: 'claim_02' });
  const b = successor(a); b.claims.reverse();
  const before = structuredClone([a, b]);
  const diff = value(diffReports(a, b));
  assert.equal(diff.claims.changed, true); assert.deepEqual(diff.claims.entries, []);
  assert.deepEqual([a, b], before);
  first(diff.claims.before).text = 'Renderer mutation';
  assert.deepEqual([a, b], before);
});
test('conflicting snapshots supplied in history fail closed', () => {
  const state = context();
  state.known_sources = [...state.known_sources, { ...structuredClone(first(initial().sources)), title: 'conflict' }];
  invalid(validateReportRevision(reinterpreted(), state), 'SOURCE_INTEGRITY');
});

test('replacing 100 claims records all 200 IDs and rejects omissions', () => {
  const parent = initial();
  const template = first(parent.claims);
  parent.claims = Array.from({ length: 100 }, (_, index) => ({ ...structuredClone(template), claim_id: `old_${index}` }));
  parent.assessment.claim_ids = [];
  parent.change.changed_claim_ids = parent.claims.map(item => item.claim_id);
  assert.equal(validateReportRevision(parent, rootContext()).ok, true);
  const report = successor(parent);
  report.claims = parent.claims.map((item, index) => ({ ...structuredClone(item), claim_id: `new_${index}` }));
  report.change.kind = 'evidence_correction';
  report.change.changed_claim_ids = [...parent.claims, ...report.claims].map(item => item.claim_id).reverse();
  assert.equal(report.change.changed_claim_ids.length, 200);
  assert.equal(validateReportRevision(report, context(parent)).ok, true);
  assert.equal(value(diffReports(parent, report)).claims.entries.length, 200);
  report.change.changed_claim_ids.pop();
  invalid(validateReportRevision(report, context(parent)), 'INVALID_INPUT');
  report.change.changed_claim_ids.push('invented_1', 'invented_2');
  invalid(validateReportRevision(report, context(parent)), 'INVALID_INPUT');
});
test('diff includes the complete old/new scoring basis when scoring is introduced', () => {
  const report = successor(); report.scorecard = rated(3).scorecard;
  const diff = value(diffReports(initial(), report));
  assert.equal(diff.scorecard.before, null);
  assert.equal(diff.scorecard.after?.ratings.demand.value, 3);
  assert.equal(validateReportRevision(report, context()).ok, true);
});
