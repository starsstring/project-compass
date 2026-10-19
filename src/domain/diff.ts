import type { ReportRevision } from './contracts/index.js';
import { sameJson } from './canonical.js';
import { validateReportContent, type SourceSnapshot } from './report.js';
import { failure, success, type DomainResult } from './result.js';

export interface ValueDiff<T> { before: T; after: T; changed: boolean }
export interface EntryDiff<T> { id: string; before: T | null; after: T | null }
export interface CollectionDiff<T> extends ValueDiff<T[]> { entries: EntryDiff<T>[] }
export interface ReportDiff {
  idea_id: string;
  from_revision_id: string;
  to_revision_id: string;
  idea: ValueDiff<ReportRevision['idea']>;
  sources: CollectionDiff<SourceSnapshot>;
  claims: CollectionDiff<ReportRevision['claims'][number]>;
  alternatives: CollectionDiff<ReportRevision['alternatives'][number]>;
  assessment: ValueDiff<ReportRevision['assessment']>;
  scorecard: ValueDiff<ReportRevision['scorecard']>;
}

function values<T>(before: T, after: T): ValueDiff<T> {
  return { before: structuredClone(before), after: structuredClone(after), changed: !sameJson(before, after) };
}
function collection<T>(before: T[], after: T[], id: (item: T) => string): CollectionDiff<T> {
  const left = new Map(before.map(item => [id(item), item]));
  const right = new Map(after.map(item => [id(item), item]));
  const entries: EntryDiff<T>[] = [];
  for (const key of [...new Set([...left.keys(), ...right.keys()])].sort()) {
    const old = left.get(key) ?? null, next = right.get(key) ?? null;
    if (!sameJson(old, next)) entries.push({ id: key, before: structuredClone(old), after: structuredClone(next) });
  }
  return { ...values(before, after), entries };
}

/** Any two snapshots of one idea; comparing does not require direct ancestry. */
export function diffReports(from: unknown, to: unknown): DomainResult<ReportDiff> {
  const left = validateReportContent(from), right = validateReportContent(to);
  if (!left.ok) return left;
  if (!right.ok) return right;
  const a = left.value, b = right.value;
  if (a.idea_id !== b.idea_id) return failure('INVALID_REFERENCE', '/idea_id', 'Cannot compare different ideas.');
  if (a.revision_id === b.revision_id && !sameJson(a, b)) return failure('ID_CONFLICT', '/revision_id', 'One revision ID cannot have different content.');
  const sources = new Map(a.sources.map(source => [source.source_id, source]));
  for (const source of b.sources) {
    const prior = sources.get(source.source_id);
    if (prior && !sameJson(prior, source)) return failure('SOURCE_INTEGRITY', '/sources', 'A source ID cannot replace an existing snapshot.');
  }
  return success({ idea_id: a.idea_id, from_revision_id: a.revision_id, to_revision_id: b.revision_id,
    idea: values(a.idea, b.idea), sources: collection(a.sources, b.sources, source => source.source_id),
    claims: collection(a.claims, b.claims, claim => claim.claim_id),
    alternatives: collection(a.alternatives, b.alternatives, item => item.alternative_id),
    assessment: values(a.assessment, b.assessment), scorecard: values(a.scorecard, b.scorecard) });
}
