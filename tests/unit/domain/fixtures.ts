import initialJson from '../../../contracts/examples/report-initial.json' with { type: 'json' };
import correctedJson from '../../../contracts/examples/report-corrected.json' with { type: 'json' };
import decisionJson from '../../../contracts/examples/human-decision.json' with { type: 'json' };
import { validateReport, validateHumanDecision, type ReportRevision } from '../../../src/domain/contracts/index.js';
import { type DomainResult } from '../../../src/domain/result.js';
import assert from 'node:assert/strict';
import { DIMENSIONS } from '../../../src/domain/scoring.js';

export function value<T>(result: DomainResult<T>): T {
  if (!result.ok) throw new Error(JSON.stringify(result.error));
  return result.value;
}
export function invalid(result: DomainResult<unknown>, code?: string): void {
  assert.equal(result.ok, false);
  if (result.ok) throw new Error('Expected a rejected input');
  assert.ok(result.error.details.length);
  if (code) assert.equal(result.error.code, code, JSON.stringify(result.error));
}
export function initial(): ReportRevision {
  const result = validateReport(structuredClone(initialJson));
  if (!result.ok) throw new Error(JSON.stringify(result.error));
  return result.value;
}
export function corrected(): ReportRevision {
  const result = validateReport(structuredClone(correctedJson));
  if (!result.ok) throw new Error(JSON.stringify(result.error));
  return result.value;
}
export function decision() {
  const result = validateHumanDecision(structuredClone(decisionJson));
  if (!result.ok) throw new Error(JSON.stringify(result.error));
  return result.value;
}
export function first<T>(array: T[]): T { assert.ok(array[0]); return array[0]; }
export function successor(parent = initial()): ReportRevision {
  return { ...structuredClone(parent), revision_id: 'rev_next', parent_revision_id: parent.revision_id,
    change: { kind: 'interpretation_change', reason: 'Synthetic interpretation update.', changed_claim_ids: [], changed_source_ids: [] } };
}
export function rated(rating: number | null): ReportRevision {
  const report = initial();
  report.scorecard = { version: 'compass-v0.3', ratings: Object.fromEntries(DIMENSIONS.map(key =>
    [key, { value: rating, reason: 'Synthetic rating for rule tests.', claim_ids: ['claim_01'] }])) as NonNullable<ReportRevision['scorecard']>['ratings'] };
  return report;
}
