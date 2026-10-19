import { DatabaseSync, backup as sqliteBackup } from 'node:sqlite';
import { readFileSync, existsSync, mkdirSync, openSync, closeSync, unlinkSync, linkSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { canonicalJson, validateReportContent, validateReportRevision, type ReportRevision, type HumanDecision, type SourceSnapshot } from '../../domain/index.js';
import { validateReport, validateHumanDecision } from '../../domain/contracts/index.js';
import type { ReportStore, StoreResult, StoreCode, CheckSummary, WriteOptions, SavedReport, SavedDecision } from '../../application/ports/report-store.js';

type Row = Record<string, unknown>;
class StoreFault extends Error {
  constructor(readonly code: StoreCode, message: string) { super(message); }
}
const ok = <T>(value: T): StoreResult<T> => ({ ok: true, value });
function error<T = never>(code: StoreCode, message: string): StoreResult<T> {
  return { ok: false, error: { code, message, details: [{ path: '', message }] } };
}
function unwrap<T>(result: StoreResult<T>): T {
  if (!result.ok) throw new StoreFault(result.error.code, result.error.message);
  return result.value;
}
function mappedError(cause: unknown, output = false): StoreResult<never> {
  if (cause instanceof StoreFault) return error(cause.code, cause.message);
  const detail = cause as { errcode?: number; code?: string } | null;
  if (detail?.errcode !== undefined && [5, 6].includes(detail.errcode & 255)) return error('STORAGE_BUSY', 'SQLite is busy; no partial write was committed.');
  if (detail?.code === 'EEXIST') return error('OUTPUT_EXISTS', 'Destination already exists.');
  // Do not put SQL, document contents or arbitrary driver messages in errors/logs.
  return error(output ? 'OUTPUT_FAILURE' : 'STORAGE_FAILURE', output ? 'Could not produce a verified database copy.' : 'SQLite operation failed.');
}
function text(row: Row, key: string): string {
  const value = row[key];
  if (typeof value !== 'string') throw new StoreFault('STORAGE_FAILURE', 'Stored row has an invalid field type.');
  return value;
}
function nullableText(row: Row, key: string): string | null {
  return row[key] === null ? null : text(row, key);
}
const canonical = (value: unknown): string => unwrap(canonicalJson(value));
const equal = (a: unknown, b: unknown): boolean => canonical(a) === canonical(b);
const idPattern = /^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/;
function assertId(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !idPattern.test(value)) throw new StoreFault('INVALID_INPUT', 'Expected an ASCII Compass ID.');
}
function cancelled(options?: WriteOptions): void {
  if (options?.signal?.aborted) throw new StoreFault('CANCELLED', 'Operation cancelled before commit/publication.');
}
function schemaSignature(db: DatabaseSync): string {
  return canonical(db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name").all());
}
function version(db: DatabaseSync): number {
  const row = db.prepare('PRAGMA user_version').get();
  if (!row || typeof row.user_version !== 'number') throw new StoreFault('STORAGE_FAILURE', 'Missing database version.');
  return row.user_version;
}
function requireVersion(db: DatabaseSync): void {
  if (version(db) !== 1) throw new StoreFault('UNSUPPORTED_SCHEMA', 'Only database version 1 is supported; writing is refused.');
  const rows = db.prepare('SELECT version,applied_at FROM schema_migrations ORDER BY version').all();
  if (rows.length !== 1 || rows[0]?.version !== 1 || typeof rows[0]?.applied_at !== 'string') {
    throw new StoreFault('STORAGE_FAILURE', 'Migration records do not match the supported database version.');
  }
}
let migration: { body: string; signature: string } | undefined;
function trustedMigration(): { body: string; signature: string } {
  if (migration) return migration;
  // This adapter is run as compiled JS in dist/src/adapters/sqlite.
  const sql = readFileSync(new URL('../../../../storage/migrations/001_initial.sql', import.meta.url), 'utf8');
  const begin = 'BEGIN IMMEDIATE;', end = 'COMMIT;';
  if (!sql.includes(begin) || !sql.trimEnd().endsWith(end)) throw new StoreFault('STORAGE_FAILURE', 'Unexpected trusted migration framing.');
  const probe = new DatabaseSync(':memory:', { allowExtension: false, enableForeignKeyConstraints: true, timeout: 5000 });
  try {
    probe.exec(sql);
    migration = { body: sql.slice(sql.indexOf(begin) + begin.length, sql.lastIndexOf(end)), signature: schemaSignature(probe) };
    return migration;
  } finally { probe.close(); }
}
function checkSettings(db: DatabaseSync): void {
  if (db.prepare('PRAGMA foreign_keys').get()?.foreign_keys !== 1 ||
      db.prepare('PRAGMA busy_timeout').get()?.timeout !== 5000 ||
      db.prepare('PRAGMA journal_mode').get()?.journal_mode !== 'delete') {
    throw new StoreFault('STORAGE_FAILURE', 'Connection settings do not match the local storage contract.');
  }
}
function parsedReport(row: Row): ReportRevision {
  const report = unwrap(validateReportContent(JSON.parse(text(row, 'document_json'))));
  if (report.idea_id !== text(row, 'idea_id') || report.revision_id !== text(row, 'revision_id') ||
      report.parent_revision_id !== nullableText(row, 'parent_revision_id') || report.created_at !== text(row, 'created_at')) {
    throw new StoreFault('STORAGE_FAILURE', 'Stored report envelope disagrees with its indexes.');
  }
  return report;
}
function parsedDecision(row: Row): HumanDecision {
  const validated = validateHumanDecision(JSON.parse(text(row, 'document_json')));
  if (!validated.ok) throw new StoreFault('STORAGE_FAILURE', 'Stored human decision violates its Schema.');
  const decision = validated.value;
  if (decision.idea_id !== text(row, 'idea_id') || decision.decision_id !== text(row, 'decision_id') ||
      decision.report_revision_id !== text(row, 'report_revision_id') || decision.supersedes_decision_id !== nullableText(row, 'supersedes_decision_id') ||
      decision.decided_at !== text(row, 'decided_at') || !decision.reason.trim()) {
    throw new StoreFault('STORAGE_FAILURE', 'Stored decision envelope/reason is invalid.');
  }
  return decision;
}
const headReportSql = `SELECT r.* FROM report_revisions r WHERE r.idea_id=? AND NOT EXISTS
  (SELECT 1 FROM report_revisions n WHERE n.idea_id=r.idea_id AND n.parent_revision_id=r.revision_id)`;
const headDecisionSql = `SELECT d.* FROM human_decisions d WHERE d.idea_id=? AND NOT EXISTS
  (SELECT 1 FROM human_decisions n WHERE n.idea_id=d.idea_id AND n.supersedes_decision_id=d.decision_id)`;

/** Full chain replay for check, startup and backup verification, under a read snapshot. */
function inspect(db: DatabaseSync): CheckSummary {
  requireVersion(db); checkSettings(db);
  if (schemaSignature(db) !== trustedMigration().signature) throw new StoreFault('STORAGE_FAILURE', 'Database schema objects differ from the trusted migration.');
  const integrity = db.prepare('PRAGMA integrity_check').all();
  if (integrity.length !== 1 || integrity[0]?.integrity_check !== 'ok' || db.prepare('PRAGMA foreign_key_check').all().length) {
    throw new StoreFault('STORAGE_FAILURE', 'SQLite integrity or foreign key checks failed.');
  }
  const ideas = db.prepare('SELECT * FROM ideas ORDER BY idea_id').all();
  let reportCount = 0, sourceCount = 0, decisionCount = 0;
  for (const idea of ideas) {
    const ideaId = text(idea, 'idea_id');
    const sources = db.prepare('SELECT * FROM source_snapshots WHERE idea_id=? ORDER BY source_id').all(ideaId);
    const snapshots = new Map(sources.map(row => [text(row, 'source_id'), JSON.parse(text(row, 'record_json')) as SourceSnapshot]));
    for (const [id, source] of snapshots) if (source.source_id !== id) throw new StoreFault('STORAGE_FAILURE', 'Stored source ID disagrees with its index.');
    const rows = db.prepare('SELECT * FROM report_revisions WHERE idea_id=?').all(ideaId);
    const reports = rows.map(parsedReport);
    const children = new Map(reports.map(report => [report.parent_revision_id, report]));
    const visited = new Set<string>(), usedSources = new Set<string>();
    const known = new Map<string, SourceSnapshot>();
    let parent: ReportRevision | null = null;
    let next = children.get(null);
    if (!next || next.created_at !== text(idea, 'created_at')) throw new StoreFault('STORAGE_FAILURE', 'Idea has no consistent report root.');
    while (next) {
      if (visited.has(next.revision_id)) throw new StoreFault('STORAGE_FAILURE', 'Cyclic report chain.');
      unwrap(validateReportRevision(next, { idea_id: ideaId, parent, head_revision_id: parent?.revision_id ?? null, known_sources: [...known.values()] }));
      for (const source of next.sources) {
        if (!snapshots.has(source.source_id) || !equal(snapshots.get(source.source_id), source)) throw new StoreFault('STORAGE_FAILURE', 'Report and stored source disagree.');
        known.set(source.source_id, source); usedSources.add(source.source_id);
      }
      const links = db.prepare('SELECT source_id FROM report_sources WHERE idea_id=? AND revision_id=? ORDER BY source_id').all(ideaId, next.revision_id).map(row => text(row, 'source_id'));
      if (!equal(links, next.sources.map(source => source.source_id).sort())) throw new StoreFault('STORAGE_FAILURE', 'Stored report source links are incomplete.');
      visited.add(next.revision_id); parent = next; next = children.get(next.revision_id);
    }
    if (visited.size !== reports.length || children.size !== reports.length || usedSources.size !== snapshots.size) {
      throw new StoreFault('STORAGE_FAILURE', 'Disconnected report history or orphan source snapshot.');
    }
    const decisions = db.prepare('SELECT * FROM human_decisions WHERE idea_id=?').all(ideaId).map(parsedDecision);
    const decisionChildren = new Map(decisions.map(decision => [decision.supersedes_decision_id, decision]));
    const seenDecisions = new Set<string>();
    let decision = decisionChildren.get(null);
    while (decision) {
      if (seenDecisions.has(decision.decision_id) || !visited.has(decision.report_revision_id)) throw new StoreFault('STORAGE_FAILURE', 'Invalid decision history.');
      seenDecisions.add(decision.decision_id); decision = decisionChildren.get(decision.decision_id);
    }
    if (seenDecisions.size !== decisions.length || decisionChildren.size !== decisions.length) throw new StoreFault('STORAGE_FAILURE', 'Disconnected decision history.');
    reportCount += reports.length; sourceCount += sources.length; decisionCount += decisions.length;
  }
  return { database_version: 1, integrity: 'ok', ideas: ideas.length, reports: reportCount, sources: sourceCount, decisions: decisionCount,
    foreign_keys: true, extension_loading: false, busy_timeout_ms: 5000, journal_mode: 'delete' };
}

async function copyDatabase(db: DatabaseSync, destination: string, verify: boolean, options?: WriteOptions): Promise<StoreResult<{ path: string }>> {
  let temporary: string | undefined;
  try {
    cancelled(options);
    if (!destination.trim() || destination.includes('\0') || destination === ':memory:' || /^[/\\]{2}/.test(destination)) throw new StoreFault('INVALID_INPUT', 'Expected a local destination file path.');
    const path = resolve(destination);
    if (existsSync(path)) throw new StoreFault('OUTPUT_EXISTS', 'Destination already exists.');
    temporary = `${path}.tmp-${randomUUID()}`;
    closeSync(openSync(temporary, 'wx'));
    await sqliteBackup(db, temporary);
    cancelled(options);
    if (verify) {
      const checked = unwrap(await openSqliteStore({ path: temporary, readOnly: true }));
      try { unwrap(checked.check()); } finally { unwrap(checked.close()); }
    }
    cancelled(options);
    // Hard-link publication is exclusive even if another process creates path.
    linkSync(temporary, path);
    return ok({ path });
  } catch (cause) { return mappedError(cause, true); }
  finally {
    // Cleanup failure must not reject the result after a verified file was published.
    try { if (temporary && existsSync(temporary)) unlinkSync(temporary); } catch { /* An owned temporary file may remain on IO failure. */ }
  }
}

export interface SqliteStore extends ReportStore {
  readonly migration_backup_path: string | null;
  check(): StoreResult<CheckSummary>;
  backup(destination: string, options?: WriteOptions): Promise<StoreResult<{ path: string }>>;
  close(): StoreResult<void>;
}

export async function openSqliteStore(options: { path: string; create?: boolean; readOnly?: boolean }): Promise<StoreResult<SqliteStore>> {
  let db: DatabaseSync | undefined;
  try {
    if (!options.path.trim() || options.path.includes('\0') || options.path === ':memory:' || /^[/\\]{2}/.test(options.path)) return error('INVALID_INPUT', 'Expected a local database file path.');
    const path = resolve(options.path), existed = existsSync(path);
    if (!existed && (!options.create || options.readOnly)) return error('NOT_FOUND', 'Database does not exist; initialize explicitly.');
    if (!existed) mkdirSync(dirname(path), { recursive: true });
    const needsBackup = existed && statSync(path).size > 0;
    db = new DatabaseSync(path, { readOnly: options.readOnly ?? false, enableForeignKeyConstraints: true, allowExtension: false, timeout: 5000 });
    db.enableLoadExtension(false);
    const connection = db;
    let migrationBackup: string | null = null;
    let initialize = false;
    // Version and schema preflight share one snapshot, so another initializer
    // cannot turn a supported empty v0 database into a false "unknown schema".
    db.exec('BEGIN');
    try {
      if (version(db) === 0) {
        if (!options.create || options.readOnly) throw new StoreFault('UNSUPPORTED_SCHEMA', 'Database is uninitialized.');
        if (db.prepare("SELECT name FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%'").all().length) throw new StoreFault('UNSUPPORTED_SCHEMA', 'Refusing to migrate an unknown nonempty schema.');
        initialize = true;
      } else requireVersion(db);
      db.exec('COMMIT');
    } catch (cause) { if (db.isTransaction) db.exec('ROLLBACK'); throw cause; }
    if (initialize) {
      if (needsBackup) migrationBackup = unwrap(await copyDatabase(db, `${path}.before-v1-${randomUUID()}.sqlite`, false)).path;
      db.exec('BEGIN IMMEDIATE');
      try {
        // Another initializer may have committed while this connection waited.
        if (version(db) === 0) {
          if (db.prepare("SELECT name FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%'").all().length) throw new StoreFault('UNSUPPORTED_SCHEMA', 'Database changed before initialization.');
          db.exec(trustedMigration().body);
        } else requireVersion(db);
        db.exec('COMMIT');
      } catch (cause) { if (db.isTransaction) db.exec('ROLLBACK'); throw cause; }
    }
    requireVersion(db);
    if (!options.readOnly) db.exec('PRAGMA journal_mode=DELETE');
    db.exec('PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON');
    let maintenance = false;
    function transaction<T>(work: () => StoreResult<T>, write = false, writeOptions?: WriteOptions): StoreResult<T> {
      if (maintenance) return error('STORAGE_BUSY', 'Database backup is in progress.');
      if (!connection.isOpen) return error('STORAGE_FAILURE', 'Store is closed.');
      if (write && options.readOnly) return error('STORAGE_FAILURE', 'Store is read-only.');
      try {
        cancelled(writeOptions);
        connection.exec(write ? 'BEGIN IMMEDIATE' : 'BEGIN');
        requireVersion(connection);
        cancelled(writeOptions);
        const result = work();
        if (!result.ok) { connection.exec('ROLLBACK'); return result; }
        cancelled(writeOptions);
        connection.exec('COMMIT'); return result;
      } catch (cause) {
        try { if (connection.isTransaction) connection.exec('ROLLBACK'); } catch { return error('STORAGE_FAILURE', 'Rollback failed; close and inspect the store.'); }
        return mappedError(cause);
      }
    }
    const store: SqliteStore = Object.freeze<SqliteStore>({
      migration_backup_path: migrationBackup,
      readReport(input) {
        return transaction(() => {
          assertId(input.idea_id); if (input.revision_id !== undefined) assertId(input.revision_id);
          const head = connection.prepare(headReportSql).get(input.idea_id);
          const row = input.revision_id === undefined ? head : connection.prepare('SELECT * FROM report_revisions WHERE idea_id=? AND revision_id=?').get(input.idea_id, input.revision_id);
          if (!row || !head) return error('NOT_FOUND', 'Report not found.');
          const decisionRow = connection.prepare(headDecisionSql).get(input.idea_id);
          const current = decisionRow ? parsedDecision(decisionRow) : null;
          return ok({ report: parsedReport(row), current_decision: current,
            decision_based_on_older_report: current !== null && current.report_revision_id !== text(head, 'revision_id') });
        });
      },
      listIdeas(input = {}) {
        return transaction(() => {
          const limit = input.limit ?? 20;
          if (!Number.isInteger(limit) || limit < 1 || limit > 100) return error('INVALID_INPUT', 'List limit must be 1..100.');
          if (input.cursor !== undefined) assertId(input.cursor);
          const rows = connection.prepare(`SELECT i.idea_id,i.created_at,r.revision_id AS head_revision_id FROM ideas i
            JOIN report_revisions r ON r.idea_id=i.idea_id WHERE i.idea_id>? AND NOT EXISTS
            (SELECT 1 FROM report_revisions n WHERE n.idea_id=r.idea_id AND n.parent_revision_id=r.revision_id)
            ORDER BY i.idea_id COLLATE BINARY LIMIT ?`).all(input.cursor ?? '', limit + 1);
          const items = rows.slice(0, limit).map(row => ({ idea_id: text(row, 'idea_id'), created_at: text(row, 'created_at'), head_revision_id: text(row, 'head_revision_id') }));
          return ok({ items, next_cursor: rows.length > limit ? items.at(-1)?.idea_id ?? null : null });
        });
      },
      saveReport(input, expectedParent, writeOptions) {
        const structural = validateReport(input);
        if (!structural.ok) return { ok: false, error: { ...structural.error, details: structural.error.details.map(item => ({ path: item.instancePath, message: item.message ?? 'Invalid report field.' })) } };
        return transaction<SavedReport>(() => {
          if (expectedParent !== null) assertId(expectedParent);
          const report = structural.value, json = canonical(report);
          const existing = connection.prepare('SELECT document_json FROM report_revisions WHERE idea_id=? AND revision_id=?').get(report.idea_id, report.revision_id);
          if (existing) return equal(JSON.parse(text(existing, 'document_json')), report)
            ? ok({ idea_id: report.idea_id, revision_id: report.revision_id, disposition: 'existing' as const }) : error('ID_CONFLICT', 'Revision ID already has different content.');
          const head = connection.prepare(headReportSql).get(report.idea_id);
          const headId = head ? text(head, 'revision_id') : null;
          if (expectedParent !== headId || report.parent_revision_id !== expectedParent) return error('REVISION_CONFLICT', 'Expected parent is not the current head.');
          const snapshots = connection.prepare('SELECT record_json FROM source_snapshots WHERE idea_id=?').all(report.idea_id).map(row => JSON.parse(text(row, 'record_json')) as SourceSnapshot);
          const validated = validateReportRevision(report, { idea_id: report.idea_id, parent: head ? parsedReport(head) : null, head_revision_id: headId, known_sources: snapshots });
          if (!validated.ok) return validated;
          if (!head) connection.prepare('INSERT INTO ideas(idea_id,created_at) VALUES (?,?)').run(report.idea_id, report.created_at);
          const known = new Set(snapshots.map(source => source.source_id));
          for (const source of report.sources) {
            if (!known.has(source.source_id)) connection.prepare('INSERT INTO source_snapshots(idea_id,source_id,record_json) VALUES (?,?,?)').run(report.idea_id, source.source_id, canonical(source));
          }
          cancelled(writeOptions);
          connection.prepare('INSERT INTO report_revisions(idea_id,revision_id,parent_revision_id,created_at,document_json) VALUES (?,?,?,?,?)')
            .run(report.idea_id, report.revision_id, report.parent_revision_id, report.created_at, json);
          return ok({ idea_id: report.idea_id, revision_id: report.revision_id, disposition: 'created' as const });
        }, true, writeOptions);
      },
      saveDecision(input, expectedPrevious, writeOptions) {
        const structural = validateHumanDecision(input);
        if (!structural.ok) return { ok: false, error: { ...structural.error, details: structural.error.details.map(item => ({ path: item.instancePath, message: item.message ?? 'Invalid decision field.' })) } };
        return transaction<SavedDecision>(() => {
          if (expectedPrevious !== null) assertId(expectedPrevious);
          const decision = structural.value, json = canonical(decision);
          const existing = connection.prepare('SELECT document_json FROM human_decisions WHERE idea_id=? AND decision_id=?').get(decision.idea_id, decision.decision_id);
          if (existing) return equal(JSON.parse(text(existing, 'document_json')), decision)
            ? ok({ decision_id: decision.decision_id, disposition: 'existing' as const }) : error('ID_CONFLICT', 'Decision ID already has different content.');
          const head = connection.prepare(headDecisionSql).get(decision.idea_id);
          const headId = head ? text(head, 'decision_id') : null;
          if (expectedPrevious !== headId || decision.supersedes_decision_id !== expectedPrevious) return error('DECISION_CONFLICT', 'Expected previous decision is not the current head.');
          if (!connection.prepare('SELECT revision_id FROM report_revisions WHERE idea_id=? AND revision_id=?').get(decision.idea_id, decision.report_revision_id)) return error('INVALID_REFERENCE', 'Decision must refer to a stored report of the same idea.');
          if (!decision.reason.trim()) return error('INVALID_INPUT', 'A human decision needs a reason.');
          cancelled(writeOptions);
          connection.prepare('INSERT INTO human_decisions(idea_id,decision_id,report_revision_id,supersedes_decision_id,decided_at,document_json) VALUES (?,?,?,?,?,?)')
            .run(decision.idea_id, decision.decision_id, decision.report_revision_id, decision.supersedes_decision_id, decision.decided_at, json);
          return ok({ decision_id: decision.decision_id, disposition: 'created' as const });
        }, true, writeOptions);
      },
      check: () => transaction(() => ok(inspect(connection))),
      async backup(destination, writeOptions) {
        const checked = store.check(); if (!checked.ok) return checked;
        maintenance = true;
        try { return await copyDatabase(connection, destination, true, writeOptions); }
        finally { maintenance = false; }
      },
      close() {
        if (maintenance) return error('STORAGE_BUSY', 'Cannot close while a backup is in progress.');
        try { if (connection.isOpen) connection.close(); return ok(undefined); }
        catch (cause) { return mappedError(cause); }
      },
    });
    const checked = store.check();
    if (!checked.ok) { store.close(); return checked; }
    return ok(store);
  } catch (cause) {
    try { if (db?.isOpen) db.close(); } catch { /* Preserve the original sanitized error. */ }
    return mappedError(cause);
  }
}

/** Restore into a new path only. A verified SQLite backup includes both chains. */
export async function restoreSqliteBackup(source: string, destination: string, options?: WriteOptions): Promise<StoreResult<{ path: string }>> {
  const opened = await openSqliteStore({ path: source, readOnly: true });
  if (!opened.ok) return opened;
  try { return await opened.value.backup(destination, options); }
  finally { opened.value.close(); }
}
