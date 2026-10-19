import type { ReportRevision } from './contracts/index.js';
import { sameJson } from './canonical.js';
import { diffReports } from './diff.js';
import { validateReportContent, type SourceSnapshot } from './report.js';
import { failure, success, type DomainResult } from './result.js';

export interface RevisionContext {
  idea_id: string;
  parent: ReportRevision | null;
  head_revision_id: string | null;
  /** All snapshots ever saved for this idea, including those removed from head.
   * T03 must obtain this context inside the save transaction after ID replay checks. */
  known_sources: readonly SourceSnapshot[];
}

const sameIds = (actual: string[], expected: string[]): boolean => sameJson([...actual].sort(), [...expected].sort());

export function validateReportRevision(input: unknown, context: RevisionContext): DomainResult<ReportRevision> {
  const parsed = validateReportContent(input);
  if (!parsed.ok) return parsed;
  const report = parsed.value, parent = context.parent;
  if (report.idea_id !== context.idea_id) return failure('INVALID_REFERENCE', '/idea_id', 'Revision context belongs to a different idea.');
  if (parent === null) {
    if (report.parent_revision_id !== null || context.head_revision_id !== null) {
      return failure('REVISION_CONFLICT', '/parent_revision_id', 'Initial report requires an empty report chain.');
    }
  } else {
    const valid = validateReportContent(parent);
    if (!valid.ok) return valid;
    if (parent.idea_id !== report.idea_id) return failure('INVALID_REFERENCE', '/parent_revision_id', 'Parent must belong to the same idea.');
    if (report.revision_id === parent.revision_id) return failure('ID_CONFLICT', '/revision_id', 'A successor needs a new revision ID.');
    if (report.parent_revision_id !== parent.revision_id || context.head_revision_id !== parent.revision_id) {
      return failure('REVISION_CONFLICT', '/parent_revision_id', 'Parent must be the current head.');
    }
  }
  const known = new Map<string, SourceSnapshot>();
  for (const source of [...context.known_sources, ...(parent?.sources ?? [])]) {
    const previous = known.get(source.source_id);
    if (previous && !sameJson(previous, source)) return failure('SOURCE_INTEGRITY', '/sources', 'Conflicting historical source snapshots.');
    known.set(source.source_id, source);
  }
  for (const [index, source] of report.sources.entries()) {
    const previous = known.get(source.source_id);
    if (previous && !sameJson(previous, source)) return failure('SOURCE_INTEGRITY', `/sources/${index}`, 'Reused source ID has different content or metadata.');
  }
  if (!report.change.reason.trim()) return failure('INVALID_INPUT', '/change/reason', 'A revision needs a substantive reason.');
  if (parent === null) {
    if (!sameIds(report.change.changed_claim_ids, report.claims.map(item => item.claim_id)) ||
        !sameIds(report.change.changed_source_ids, report.sources.map(item => item.source_id))) {
      return failure('INVALID_INPUT', '/change', 'Initial changed IDs must include all current claim/source IDs.');
    }
    return success(report);
  }
  const compared = diffReports(parent, report);
  if (!compared.ok) return compared;
  const diff = compared.value;
  if (!sameIds(report.change.changed_claim_ids, diff.claims.entries.map(item => item.id)) ||
      !sameIds(report.change.changed_source_ids, diff.sources.entries.map(item => item.id))) {
    return failure('INVALID_INPUT', '/change', 'Changed ID sets must equal the actual diff, including removals.');
  }
  if (![diff.idea, diff.sources, diff.claims, diff.alternatives, diff.assessment, diff.scorecard].some(item => item.changed)) {
    return failure('INVALID_INPUT', '/change', 'Metadata-only or identical revisions are not content changes.');
  }
  const kind = report.change.kind;
  if (kind === 'new_evidence' && !report.sources.some(source => !known.has(source.source_id))) {
    return failure('INVALID_INPUT', '/change/kind', 'new_evidence requires a source ID never saved for this idea.');
  }
  if (kind === 'evidence_correction' && !diff.claims.entries.length && !diff.sources.entries.length) {
    return failure('INVALID_INPUT', '/change/kind', 'evidence_correction must change claims or sources.');
  }
  if (kind === 'idea_change' && !diff.idea.changed) return failure('INVALID_INPUT', '/change/kind', 'idea_change must change the idea.');
  if (kind === 'review_update' && !diff.claims.entries.some(item => item.before && item.after &&
      (item.before.review_status !== item.after.review_status || item.before.review_note !== item.after.review_note))) {
    return failure('INVALID_INPUT', '/change/kind', 'review_update must change an existing claim review.');
  }
  return success(report);
}
