import { validateReport, type ReportRevision } from './contracts/index.js';
import { failure, success, type DomainResult } from './result.js';
import { sha256Text } from './canonical.js';
import { DIMENSIONS } from './scoring.js';

export type SourceSnapshot = ReportRevision['sources'][number];
export type Claim = ReportRevision['claims'][number];

/** Validate a snapshot's own structure and meaning, independently of its ancestry. */
export function validateReportContent(input: unknown): DomainResult<ReportRevision> {
  const parsed = validateReport(input);
  if (!parsed.ok) return { ok: false, error: { ...parsed.error,
    details: parsed.error.details.map(error => ({ path: error.instancePath, message: error.message ?? 'Invalid input.' })) } };
  const report = parsed.value;
  for (const [path, ids] of [
    ['/sources', report.sources.map(item => item.source_id)],
    ['/claims', report.claims.map(item => item.claim_id)],
    ['/alternatives', report.alternatives.map(item => item.alternative_id)],
    ['/assessment/conditions', report.assessment.conditions.map(item => item.key)],
  ] as const) {
    if (new Set(ids).size !== ids.length) return failure('INVALID_REFERENCE', path, 'IDs/keys must be unique in this array.');
  }
  const sources = new Map(report.sources.map(item => [item.source_id, item]));
  const claims = new Map(report.claims.map(item => [item.claim_id, item]));
  const conditions = new Map(report.assessment.conditions.map(item => [item.key, item]));
  if (!conditions.has('demand') || !conditions.has('feasibility')) {
    return failure('INVALID_REFERENCE', '/assessment/conditions', 'Exactly one demand and feasibility condition are required.');
  }
  for (const [i, source] of report.sources.entries()) {
    if (source.capture_status === 'captured') {
      // Schema guarantees string; keep the domain guard explicit for type generation.
      if (source.content_text === null || new TextEncoder().encode(source.content_text).length > 256 * 1024) {
        return failure('SOURCE_INTEGRITY', `/sources/${i}/content_text`, 'Captured text must fit 256 KiB of UTF-8.');
      }
      if (sha256Text(source.content_text) !== source.content_sha256) {
        return failure('SOURCE_INTEGRITY', `/sources/${i}/content_sha256`, 'SHA-256 must match exact stored UTF-8 text.');
      }
    }
  }
  const checkClaims = (ids: string[], path: string): DomainResult<true> => {
    if (ids.some(id => !claims.has(id))) return failure('INVALID_REFERENCE', path, 'Claim IDs must exist in this revision.');
    return success(true);
  };
  for (const [i, claim] of report.claims.entries()) {
    const pairs = claim.evidence.map(item => `${item.source_id}:${item.relation}`);
    if (new Set(pairs).size !== pairs.length) return failure('INVALID_REFERENCE', `/claims/${i}/evidence`, 'Duplicate source/relation pair.');
    if (claim.evidence.some(item => !sources.has(item.source_id))) {
      return failure('INVALID_REFERENCE', `/claims/${i}/evidence`, 'Source IDs must exist in this revision.');
    }
    if (claim.kind === 'source_statement' && !claim.evidence.some(item =>
      item.relation === 'support' && sources.get(item.source_id)?.capture_status === 'captured')) {
      return failure('INVALID_REFERENCE', `/claims/${i}/evidence`, 'Source statements require captured support.');
    }
  }
  const assessmentClaims = checkClaims(report.assessment.claim_ids, '/assessment/claim_ids');
  if (!assessmentClaims.ok) return assessmentClaims;
  if (report.assessment.alternative_id !== null && !report.alternatives.some(item => item.alternative_id === report.assessment.alternative_id)) {
    return failure('INVALID_REFERENCE', '/assessment/alternative_id', 'Alternative must exist in this revision.');
  }
  for (const [i, condition] of report.assessment.conditions.entries()) {
    const valid = checkClaims(condition.claim_ids, `/assessment/conditions/${i}/claim_ids`);
    if (!valid.ok) return valid;
  }
  if (report.scorecard !== null) {
    for (const key of DIMENSIONS) {
      const rating = report.scorecard.ratings[key];
      const valid = checkClaims(rating.claim_ids, `/scorecard/ratings/${key}/claim_ids`);
      if (!valid.ok) return valid;
      if (rating.value !== null && (!rating.reason.trim() || !rating.claim_ids.some(id => claims.get(id)?.review_status !== 'withdrawn'))) {
        return failure('POLICY_VIOLATION', `/scorecard/ratings/${key}`, 'A known rating needs a reason and at least one non-withdrawn claim.');
      }
    }
  }
  if (report.assessment.recommendation === 'build_small') {
    const needed = [...report.assessment.claim_ids, ...report.assessment.conditions.flatMap(item => item.claim_ids)];
    if (report.assessment.conditions.some(item => item.state !== 'met') ||
        report.assessment.conditions.some(item => ['demand', 'feasibility'].includes(item.key) && item.claim_ids.length === 0) ||
        needed.some(id => claims.get(id)?.review_status !== 'supported' || claims.get(id)?.kind === 'hypothesis')) {
      return failure('POLICY_VIOLATION', '/assessment', 'build_small requires all conditions met and supported non-hypothesis grounds; consider investigate/pause.');
    }
  }
  return success(report);
}
