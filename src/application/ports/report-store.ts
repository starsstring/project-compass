import type { DomainCode, ReportRevision, HumanDecision } from '../../domain/index.js';

export type StoreCode = DomainCode | 'NOT_FOUND' | 'DECISION_CONFLICT' | 'STORAGE_BUSY' |
  'STORAGE_FAILURE' | 'OUTPUT_EXISTS' | 'OUTPUT_FAILURE' | 'CANCELLED';
export type StoreResult<T> = { ok: true; value: T } | {
  ok: false; error: { code: StoreCode; message: string; details: { path: string; message: string }[] };
};
export interface WriteOptions { signal?: Pick<AbortSignal, 'aborted'> }
export interface SavedReport { idea_id: string; revision_id: string; disposition: 'created' | 'existing' }
export interface SavedDecision { decision_id: string; disposition: 'created' | 'existing' }
export interface StoredReport {
  report: ReportRevision;
  current_decision: HumanDecision | null;
  decision_based_on_older_report: boolean;
}
export interface IdeaPage {
  items: { idea_id: string; head_revision_id: string; created_at: string }[];
  next_cursor: string | null;
}
export interface CheckSummary {
  database_version: 1;
  integrity: 'ok';
  ideas: number;
  reports: number;
  sources: number;
  decisions: number;
  foreign_keys: true;
  extension_loading: false;
  busy_timeout_ms: 5000;
  journal_mode: 'delete';
}
/** Atomic operations only; never exposes a driver handle or caller-managed transaction. */
export interface ReportStore {
  readReport(input: { idea_id: string; revision_id?: string }): StoreResult<StoredReport>;
  listIdeas(input?: { limit?: number; cursor?: string }): StoreResult<IdeaPage>;
  saveReport(report: unknown, expected_parent: string | null, options?: WriteOptions): StoreResult<SavedReport>;
  saveDecision(decision: unknown, expected_previous: string | null, options?: WriteOptions): StoreResult<SavedDecision>;
}
