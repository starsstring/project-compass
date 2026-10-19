import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createReportViewModel } from '../../../src/domain/view-model.js';
import { initial, rated, decision, first, value, invalid } from './fixtures.js';

test('view model defaults to hidden total/range and always labels fixtures', () => {
  const view = value(createReportViewModel(rated(5)));
  assert.equal(view.score_summary, null);
  assert.equal(view.provenance_label, '模拟/研究演示');
  assert.equal(first(view.warnings).code, 'FIXTURE');
  assert.equal(view.scorecard?.ratings.demand.value, 5);
});
test('research option exposes derived logical range, never a probability', () => {
  const report = rated(5); assert.ok(report.scorecard); report.scorecard.ratings.demand.value = null;
  const view = value(createReportViewModel(report, { showScore: true }));
  assert.equal(view.score_summary?.score, null);
  assert.equal(view.score_summary?.lower, 75); assert.equal(view.score_summary?.upper, 100);
  assert.match(view.score_summary?.interpretation ?? '', /不是成功概率/);
  assert.equal(value(createReportViewModel(initial(), { showScore: true })).score_summary, null);
});
test('disputed rating grounds warn explicitly without changing values', () => {
  const report = rated(3); first(report.claims).review_status = 'disputed';
  const view = value(createReportViewModel(report, { showScore: true }));
  assert.equal(view.warnings.filter(item => item.code === 'DISPUTED_RATING').length, 6);
  assert.equal(view.score_summary?.score, 60);
});
test('a rating with live and withdrawn claims keeps both visible and warns', () => {
  const report = rated(3);
  report.claims.push({ ...structuredClone(first(report.claims)), claim_id: 'withdrawn', review_status: 'withdrawn' });
  assert.ok(report.scorecard); report.scorecard.ratings.demo.claim_ids.push('withdrawn');
  const view = value(createReportViewModel(report));
  assert.ok(view.warnings.some(item => item.code === 'WITHDRAWN_RATING'));
  assert.ok(view.claims.some(item => item.review_status === 'withdrawn'));
});
test('inference/hypothesis labels preserve uncertainty; manual/model metadata stay unverified declarations', () => {
  for (const kind of ['inference', 'hypothesis'] as const) {
    const report = initial(); first(report.claims).kind = kind; first(report.claims).evidence = [];
    report.provenance.kind = 'manual';
    const view = value(createReportViewModel(report));
    assert.match(first(view.claims).kind_label, /不确定|未验证/);
    assert.equal(view.provenance_verification, 'external_declaration_not_verified');
    assert.equal(view.provenance_label, '人工记录');
  }
  const report = initial();
  Object.assign(report.provenance, { kind: 'model', run_id: 'run_test', model: 'fixture-model', prompt_sha256: 'a'.repeat(64) });
  assert.match(value(createReportViewModel(report)).provenance_label, /外部声明.*未核实本机运行/);
});
test('human choice can differ from recommendation; report mismatch does not guess chronology', () => {
  const report = initial(), choice = decision();
  choice.report_revision_id = report.revision_id;
  const view = value(createReportViewModel(report, { decision: choice }));
  assert.equal(view.human_decision?.differs_from_recommendation, true);
  assert.equal(view.human_decision?.based_on_different_report, false);
  choice.report_revision_id = 'rev_older';
  assert.equal(value(createReportViewModel(report, { decision: choice })).human_decision?.based_on_different_report, true);
  invalid(createReportViewModel(report, { decision: { ...choice, idea_id: 'other' } }), 'INVALID_REFERENCE');
  invalid(createReportViewModel(report, { decision: { ...choice, actor: { kind: 'model', id: 'x' } } }), 'INVALID_INPUT');
});
test('view models are deterministic detached plain data and preserve raw text for future safe renderers', () => {
  const report = initial(); report.idea.original_text = '<script>external data</script>';
  const before = structuredClone(report);
  const view = value(createReportViewModel(report));
  assert.deepEqual(view, value(createReportViewModel(report)));
  assert.equal(view.idea.original_text, report.idea.original_text);
  view.idea.original_text = 'Changed view';
  first(view.sources).title = 'Changed view source';
  assert.deepEqual(report, before);
  assert.equal(view.human_decision, null);
});
