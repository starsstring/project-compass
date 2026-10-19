import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { resolve, join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { Worker } from 'node:worker_threads';
import { once } from 'node:events';
import { openSqliteStore, restoreSqliteBackup, type SqliteStore } from '../../src/adapters/sqlite/store.js';
import type { StoreResult } from '../../src/application/ports/report-store.js';
import { initial, corrected, successor, decision, first } from '../unit/domain/fixtures.js';
import { sha256Text } from '../../src/domain/canonical.js';

function value<T>(result: StoreResult<T>): T {
  if (!result.ok) throw new Error(JSON.stringify(result.error));
  return result.value;
}
function fails(result: StoreResult<unknown>, code: string): void {
  assert.equal(result.ok, false);
  if (result.ok) throw new Error('Expected failure');
  assert.equal(result.error.code, code, JSON.stringify(result));
}
function workspace(t: { after: (fn: () => void) => void }) {
  const base = fileURLToPath(new URL('../../../.tools/sqlite-tests/', import.meta.url));
  mkdirSync(base, { recursive: true });
  const directory = mkdtempSync(join(base, 'case-'));
  const opened: SqliteStore[] = [];
  const path = join(directory, 'compass.sqlite');
  t.after(() => {
    for (const store of opened) value(store.close());
    const target = resolve(directory);
    assert.ok(target.startsWith(resolve(base) + sep) && target !== resolve(base));
    rmSync(target, { recursive: true, force: true });
  });
  return { directory, path, async open(create = true, readOnly = false) {
    const store = value(await openSqliteStore({ path, create, readOnly }));
    opened.push(store); return store;
  }, keep(store: SqliteStore) { opened.push(store); return store; } };
}
/** Trusted fault-injection harness, outside production modules; never accepts user SQL. */
function raw(path: string, sql: string): unknown[] {
  const output = execFileSync(process.execPath, ['--input-type=module', '-e',
    'import {DatabaseSync} from "node:sqlite";const db=new DatabaseSync(process.argv[1],{allowExtension:false,timeout:5000});try{const sql=process.argv[2];if(sql.startsWith("SELECT ")||sql.startsWith("PRAGMA integrity_check"))console.log(JSON.stringify(db.prepare(sql).all()));else{db.exec(sql);console.log("[]");}}finally{db.close();}', path, sql], { encoding: 'utf8' });
  return JSON.parse(output) as unknown[];
}

test('missing database requires explicit initialization; initialization is repeatable', async t => {
  const w = workspace(t);
  fails(await openSqliteStore({ path: w.path }), 'NOT_FOUND');
  assert.equal(existsSync(w.path), false);
  const store = await w.open();
  assert.deepEqual(value(store.check()), { database_version: 1, integrity: 'ok', ideas: 0, reports: 0, sources: 0, decisions: 0,
    foreign_keys: true, extension_loading: false, busy_timeout_ms: 5000, journal_mode: 'delete' });
  const second = await w.open(); assert.equal(value(second.check()).ideas, 0);
  assert.deepEqual(raw(w.path, 'SELECT version FROM schema_migrations'), [{ version: 1 }]);
});
test('store objects expose only port/lifecycle operations and close is idempotent', async t => {
  const store = await workspace(t).open();
  assert.equal(Object.isFrozen(store), true);
  assert.deepEqual(Object.keys(store).sort(), ['backup', 'check', 'close', 'listIdeas', 'migration_backup_path', 'readReport', 'saveDecision', 'saveReport'].sort());
  value(store.close()); value(store.close());
  fails(store.check(), 'STORAGE_FAILURE');
});
test('invalid paths and corrupt database bytes return sanitized errors', async t => {
  for (const path of ['', ':memory:', 'bad\0path', '\\\\server\\share\\file.sqlite']) fails(await openSqliteStore({ path, create: true }), 'INVALID_INPUT');
  const w = workspace(t); writeFileSync(w.path, 'not a sqlite database');
  fails(await openSqliteStore({ path: w.path }), 'STORAGE_FAILURE');
  assert.equal(readFileSync(w.path, 'utf8'), 'not a sqlite database');
});
test('save/read/cold reopen preserve exact reports and never synthesize human decisions', async t => {
  const w = workspace(t), store = await w.open();
  assert.deepEqual(value(store.saveReport(initial(), null)), { idea_id: 'idea_fixture', revision_id: 'rev_01', disposition: 'created' });
  assert.equal(value(store.saveReport(corrected(), 'rev_01')).disposition, 'created');
  const read = value(store.readReport({ idea_id: 'idea_fixture' }));
  assert.deepEqual(read.report, corrected()); assert.equal(read.current_decision, null);
  first(read.report.sources).title = 'Caller changed its copy';
  assert.deepEqual(value(store.readReport({ idea_id: 'idea_fixture', revision_id: 'rev_01' })).report, initial());
  value(store.close());
  const reopened = await w.open(false);
  assert.deepEqual(value(reopened.readReport({ idea_id: 'idea_fixture' })).report, corrected());
  assert.deepEqual({ reports: value(reopened.check()).reports, sources: value(reopened.check()).sources }, { reports: 2, sources: 2 });
});
test('canonical report replay succeeds before stale-parent checks; content changes conflict', async t => {
  const store = await workspace(t).open();
  value(store.saveReport(initial(), null)); value(store.saveReport(corrected(), 'rev_01'));
  const reordered = Object.fromEntries(Object.entries(initial()).reverse());
  assert.equal(value(store.saveReport(reordered, 'stale_expectation')).disposition, 'existing');
  const conflict = initial(); conflict.assessment.reason = 'Same ID, different report';
  fails(store.saveReport(conflict, null), 'ID_CONFLICT');
  assert.equal(value(store.check()).reports, 2);
});
test('same-source reinterpretation survives nested object key reordering through SQL triggers', async t => {
  const store = await workspace(t).open(); value(store.saveReport(initial(), null));
  const report = successor(); report.assessment.reason = 'A different interpretation of the same source.';
  const reordered = { ...report, sources: report.sources.map(source => Object.fromEntries(Object.entries(source).reverse())) };
  value(store.saveReport(reordered, 'rev_01'));
  assert.equal(value(store.check()).sources, 1);
  assert.equal(value(store.check()).reports, 2);
});
test('wrong expected parent, stale parent and a second root do not create branches', async t => {
  const store = await workspace(t).open();
  fails(store.saveReport(corrected(), 'rev_01'), 'REVISION_CONFLICT');
  value(store.saveReport(initial(), null));
  fails(store.saveReport(corrected(), null), 'REVISION_CONFLICT');
  value(store.saveReport(corrected(), 'rev_01'));
  const fork = successor(); fork.assessment.reason = 'Attempted fork';
  fails(store.saveReport(fork, 'rev_01'), 'REVISION_CONFLICT');
  fails(store.saveReport({ ...initial(), revision_id: 'root_two' }, null), 'REVISION_CONFLICT');
  assert.equal(value(store.check()).reports, 2);
});
test('all historical snapshots are immutable even after disappearing from head', async t => {
  const store = await workspace(t).open();
  value(store.saveReport(initial(), null)); value(store.saveReport(corrected(), 'rev_01'));
  const report = successor(corrected());
  const old = structuredClone(first(initial().sources)); old.content_text = 'Replaced old data'; old.content_sha256 = sha256Text(old.content_text);
  report.sources.push(old); report.change.kind = 'new_evidence'; report.change.changed_source_ids = ['source_01'];
  fails(store.saveReport(report, 'rev_02'), 'SOURCE_INTEGRITY');
  report.sources[1] = first(initial().sources);
  fails(store.saveReport(report, 'rev_02'), 'INVALID_INPUT');
  assert.equal(value(store.check()).sources, 2);
});
test('identical source IDs in different ideas do not contaminate each other', async t => {
  const store = await workspace(t).open();
  value(store.saveReport(initial(), null));
  const other = initial(); other.idea_id = 'other_idea';
  first(other.sources).title = 'Independent idea snapshot';
  value(store.saveReport(other, null));
  assert.equal(value(store.check()).ideas, 2);
  assert.equal(first(value(store.readReport({ idea_id: 'idea_fixture' })).report.sources).title, first(initial().sources).title);
});
test('Schema, policy, source hash and reference errors never leave orphan rows', async t => {
  const store = await workspace(t).open();
  fails(store.saveReport({ ...initial(), extra: true }, null), 'INVALID_INPUT');
  const badField = store.saveReport({ ...initial(), revision_id: 123 }, null);
  fails(badField, 'INVALID_INPUT');
  if (!badField.ok) assert.ok(badField.error.details.some(item => item.path === '/revision_id'));
  const policy = initial(); policy.assessment.recommendation = 'build_small';
  fails(store.saveReport(policy, null), 'POLICY_VIOLATION');
  const hash = initial(); first(hash.sources).content_sha256 = '0'.repeat(64);
  fails(store.saveReport(hash, null), 'SOURCE_INTEGRITY');
  const reference = initial(); first(first(reference.claims).evidence).source_id = 'future_source';
  fails(store.saveReport(reference, null), 'INVALID_REFERENCE');
  assert.equal(value(store.check()).ideas, 0);
  assert.equal(value(store.check()).sources, 0);
});
test('pre-abort and cancellation after source writes roll the whole transaction back', async t => {
  const store = await workspace(t).open();
  const controller = new AbortController(); controller.abort();
  fails(store.saveReport(initial(), null, { signal: controller.signal }), 'CANCELLED');
  let polls = 0;
  // Controlled cancellation source transitions at the post-source-write checkpoint.
  fails(store.saveReport(initial(), null, { signal: { get aborted() { return ++polls >= 3; } } }), 'CANCELLED');
  assert.equal(value(store.check()).ideas, 0); assert.equal(value(store.check()).sources, 0);
  assert.equal(value(store.saveReport(initial(), null)).disposition, 'created');
});
test('SQLite exception after new idea/sources rolls back, then a clean retry works', async t => {
  const w = workspace(t), store = await w.open();
  raw(w.path, "CREATE TRIGGER test_abort BEFORE INSERT ON report_revisions BEGIN SELECT RAISE(ABORT,'fixture-only failure'); END;");
  const result = store.saveReport(initial(), null);
  fails(result, 'STORAGE_FAILURE'); assert.doesNotMatch(JSON.stringify(result), /fixture-only|合成|INSERT/);
  raw(w.path, 'DROP TRIGGER test_abort;');
  assert.equal(value(store.check()).ideas, 0); assert.equal(value(store.check()).sources, 0);
  value(store.saveReport(initial(), null));
});
test('decision chains are independent, can disagree with recommendations and preserve old choices', async t => {
  const store = await workspace(t).open();
  value(store.saveReport(initial(), null));
  const firstDecision = decision(); firstDecision.report_revision_id = 'rev_01'; firstDecision.choice = 'build_small';
  value(store.saveDecision(firstDecision, null));
  value(store.saveReport(corrected(), 'rev_01'));
  assert.equal(value(store.readReport({ idea_id: 'idea_fixture' })).decision_based_on_older_report, true);
  const next = { ...decision(), decision_id: 'decision_02', supersedes_decision_id: 'decision_01' };
  value(store.saveDecision(next, 'decision_01'));
  const pastView = value(store.readReport({ idea_id: 'idea_fixture', revision_id: 'rev_01' }));
  assert.equal(pastView.current_decision?.decision_id, 'decision_02');
  assert.equal(pastView.decision_based_on_older_report, false); // relative to true head, not viewed revision
  assert.equal(value(store.check()).decisions, 2);
});
test('decision replay, ID conflicts and stale expected predecessors are distinct', async t => {
  const store = await workspace(t).open(); value(store.saveReport(initial(), null));
  const firstDecision = { ...decision(), report_revision_id: 'rev_01' };
  value(store.saveDecision(firstDecision, null));
  const next = { ...firstDecision, decision_id: 'decision_next', supersedes_decision_id: 'decision_01', choice: 'stop' as const };
  value(store.saveDecision(next, 'decision_01'));
  assert.equal(value(store.saveDecision(firstDecision, 'outdated')).disposition, 'existing');
  fails(store.saveDecision({ ...firstDecision, reason: 'Changed content' }, null), 'ID_CONFLICT');
  fails(store.saveDecision({ ...firstDecision, decision_id: 'fork' }, null), 'DECISION_CONFLICT');
  assert.equal(value(store.check()).decisions, 2);
});
test('decisions reject unknown/cross-idea reports, non-human actors, blank reasons and cancelled writes', async t => {
  const store = await workspace(t).open(); value(store.saveReport(initial(), null));
  fails(store.saveDecision(decision(), null), 'INVALID_REFERENCE');
  fails(store.saveDecision({ ...decision(), idea_id: 'other', report_revision_id: 'rev_01' }, null), 'INVALID_REFERENCE');
  fails(store.saveDecision({ ...decision(), actor: { kind: 'model', id: 'x' } }, null), 'INVALID_INPUT');
  fails(store.saveDecision({ ...decision(), report_revision_id: 'rev_01', reason: '  ' }, null), 'INVALID_INPUT');
  const controller = new AbortController(); controller.abort();
  fails(store.saveDecision({ ...decision(), report_revision_id: 'rev_01' }, null, { signal: controller.signal }), 'CANCELLED');
  assert.equal(value(store.check()).decisions, 0);
});
test('listing uses stable ASCII idea IDs and bounded cursors, never tied timestamps', async t => {
  const store = await workspace(t).open();
  for (const idea_id of ['z_idea', 'a_idea', 'A_idea']) value(store.saveReport({ ...initial(), idea_id }, null));
  const page = value(store.listIdeas({ limit: 2 }));
  assert.deepEqual(page.items.map(item => item.idea_id), ['A_idea', 'a_idea']);
  assert.equal(page.next_cursor, 'a_idea');
  assert.deepEqual(value(store.listIdeas({ cursor: 'a_idea', limit: 2 })).items.map(item => item.idea_id), ['z_idea']);
  for (const limit of [0, -1, 101, 1.5, NaN]) fails(store.listIdeas({ limit }), 'INVALID_INPUT');
  fails(store.listIdeas({ cursor: "' OR 1=1 --" }), 'INVALID_INPUT');
  fails(store.readReport({ idea_id: 'missing' }), 'NOT_FOUND');
  fails(store.readReport({ idea_id: 'a_idea', revision_id: 'missing' }), 'NOT_FOUND');
});
test('newer databases are refused without changing bytes, including already-open handles', async t => {
  const w = workspace(t), store = await w.open(); value(store.saveReport(initial(), null));
  raw(w.path, 'PRAGMA user_version=2;');
  const before = readFileSync(w.path);
  fails(store.saveReport(corrected(), 'rev_01'), 'UNSUPPORTED_SCHEMA');
  fails(await openSqliteStore({ path: w.path, create: true }), 'UNSUPPORTED_SCHEMA');
  assert.deepEqual(readFileSync(w.path), before);
});
test('unknown v0 schemas are preserved; existing empty v0 receives a pre-migration backup', async t => {
  const w = workspace(t);
  raw(w.path, 'CREATE TABLE unrelated(value TEXT);');
  const before = readFileSync(w.path);
  fails(await openSqliteStore({ path: w.path, create: true }), 'UNSUPPORTED_SCHEMA');
  assert.deepEqual(readFileSync(w.path), before);
  const emptyPath = join(w.directory, 'empty.sqlite'); raw(emptyPath, 'PRAGMA user_version=0;');
  const store = w.keep(value(await openSqliteStore({ path: emptyPath, create: true })));
  assert.ok(store.migration_backup_path && existsSync(store.migration_backup_path));
  assert.deepEqual(raw(store.migration_backup_path, 'SELECT count(*) AS n FROM sqlite_schema'), [{ n: 0 }]);
  assert.equal(value(store.check()).reports, 0);
});
test('readonly opens validate history and reject writes without changing the database', async t => {
  const w = workspace(t), writable = await w.open(); value(writable.saveReport(initial(), null)); value(writable.close());
  const before = readFileSync(w.path), store = await w.open(false, true);
  fails(store.saveReport(corrected(), 'rev_01'), 'STORAGE_FAILURE');
  assert.deepEqual(value(store.readReport({ idea_id: 'idea_fixture' })).report, initial());
  value(store.close()); assert.deepEqual(readFileSync(w.path), before);
});
test('backup/restore preserve full report and human decision chains, not just head JSON', async t => {
  const w = workspace(t), store = await w.open();
  value(store.saveReport(initial(), null)); value(store.saveReport(corrected(), 'rev_01'));
  const old = { ...decision(), report_revision_id: 'rev_01' }; value(store.saveDecision(old, null));
  value(store.saveDecision({ ...decision(), decision_id: 'decision_02', supersedes_decision_id: 'decision_01' }, 'decision_01'));
  const backup = join(w.directory, 'backup.sqlite'), restored = join(w.directory, 'restored.sqlite');
  value(await store.backup(backup)); value(await restoreSqliteBackup(backup, restored));
  const reopened = w.keep(value(await openSqliteStore({ path: restored })));
  assert.deepEqual(value(reopened.check()), value(store.check()));
  assert.deepEqual(value(reopened.readReport({ idea_id: 'idea_fixture', revision_id: 'rev_01' })).report, initial());
  assert.equal(value(reopened.readReport({ idea_id: 'idea_fixture' })).current_decision?.decision_id, 'decision_02');
  assert.deepEqual(raw(restored, 'SELECT document_json FROM human_decisions ORDER BY decision_id'), raw(w.path, 'SELECT document_json FROM human_decisions ORDER BY decision_id'));
  assert.equal(readdirSync(w.directory).some(name => name.includes('.tmp-')), false);
});
test('backup/restore never overwrite destinations, including a publication race', async t => {
  const w = workspace(t), store = await w.open(); value(store.saveReport(initial(), null));
  const destination = join(w.directory, 'do-not-overwrite.sqlite'); writeFileSync(destination, 'sentinel');
  fails(await store.backup(destination), 'OUTPUT_EXISTS'); assert.equal(readFileSync(destination, 'utf8'), 'sentinel');
  fails(await restoreSqliteBackup(w.path, destination), 'OUTPUT_EXISTS');
  const race = join(w.directory, 'race.sqlite');
  const pending = store.backup(race); writeFileSync(race, 'concurrent creator');
  fails(await pending, 'OUTPUT_EXISTS'); assert.equal(readFileSync(race, 'utf8'), 'concurrent creator');
  assert.equal(value(store.check()).reports, 1);
});
test('cancelled/failed backup leaves the source usable and publishes no partial output', async t => {
  const w = workspace(t), store = await w.open(); value(store.saveReport(initial(), null));
  const controller = new AbortController(); controller.abort();
  const destination = join(w.directory, 'cancelled.sqlite');
  fails(await store.backup(destination, { signal: controller.signal }), 'CANCELLED');
  assert.equal(existsSync(destination), false);
  fails(await store.backup(join(w.directory, 'missing-folder', 'copy.sqlite')), 'OUTPUT_FAILURE');
  fails(await store.backup('\\\\server\\share\\copy.sqlite'), 'INVALID_INPUT');
  const later = new AbortController();
  const pending = store.backup(destination, { signal: later.signal }); later.abort();
  fails(store.close(), 'STORAGE_BUSY');
  fails(store.saveReport(corrected(), 'rev_01'), 'STORAGE_BUSY');
  fails(await pending, 'CANCELLED');
  assert.equal(existsSync(destination), false);
  value(await store.backup(destination));
  assert.equal(readdirSync(w.directory).some(name => name.includes('.tmp-')), false);
  assert.equal(value(store.check()).reports, 1);
});
test('check and restore refuse altered SQL protection', async t => {
  const w = workspace(t), store = await w.open(); value(store.saveReport(initial(), null));
  raw(w.path, 'DROP TRIGGER immutable_report_update;');
  fails(store.check(), 'STORAGE_FAILURE');
  const output = join(w.directory, 'bad-restore.sqlite');
  fails(await restoreSqliteBackup(w.path, output), 'STORAGE_FAILURE');
  assert.equal(existsSync(output), false);
});
test('a structurally valid database with damaged source content hash cannot be restored', async t => {
  const w = workspace(t), store = await w.open(); value(store.saveReport(initial(), null));
  const rows = raw(w.path, "SELECT sql FROM sqlite_schema WHERE name='immutable_report_update'") as { sql: string }[];
  assert.ok(rows[0]);
  raw(w.path, `DROP TRIGGER immutable_report_update;
    UPDATE report_revisions SET document_json=json_set(document_json,'$.sources[0].content_sha256','${'0'.repeat(64)}');
    ${rows[0].sql};`);
  fails(store.check(), 'SOURCE_INTEGRITY');
  const output = join(w.directory, 'invalid-hash.sqlite');
  fails(await restoreSqliteBackup(w.path, output), 'SOURCE_INTEGRITY');
  assert.equal(existsSync(output), false);
});
test('cancelling after inserting a human decision rolls back the decision chain', async t => {
  const store = await workspace(t).open(); value(store.saveReport(initial(), null));
  let polls = 0;
  const record = { ...decision(), report_revision_id: 'rev_01' };
  fails(store.saveDecision(record, null, { signal: { get aborted() { return ++polls >= 4; } } }), 'CANCELLED');
  assert.equal(value(store.check()).decisions, 0);
  value(store.saveDecision(record, null));
  assert.equal(value(store.check()).decisions, 1);
});
test('full checks reject missing generated source links even when SQLite FKs remain valid', async t => {
  const w = workspace(t), store = await w.open(); value(store.saveReport(initial(), null));
  const rows = raw(w.path, "SELECT sql FROM sqlite_schema WHERE name='immutable_report_source_delete'") as { sql: string }[];
  assert.ok(rows[0]);
  raw(w.path, `DROP TRIGGER immutable_report_source_delete; DELETE FROM report_sources; ${rows[0].sql};`);
  assert.deepEqual(raw(w.path, 'PRAGMA integrity_check'), [{ integrity_check: 'ok' }]);
  fails(store.check(), 'STORAGE_FAILURE');
  fails(await store.backup(join(w.directory, 'incomplete.sqlite')), 'STORAGE_FAILURE');
});

async function startWriter(path: string, report: ReturnType<typeof initial>, initialize = false) {
  const worker = new Worker(new URL('./writer-worker.js', import.meta.url), { workerData: { path, report, initialize } });
  const ready = await once(worker, 'message');
  assert.equal(ready[0], 'ready');
  return worker;
}
test('two independent worker connections cannot commit two successors of one parent', async t => {
  const w = workspace(t), store = await w.open(); value(store.saveReport(initial(), null));
  const left = corrected(), right = corrected(); right.revision_id = 'rev_competitor'; right.assessment.reason = 'Another correction proposal';
  const workers = await Promise.all([startWriter(w.path, left), startWriter(w.path, right)]);
  try {
    const results = workers.map(worker => once(worker, 'message'));
    workers.forEach(worker => worker.postMessage('start'));
    const outcomes = (await Promise.all(results)).map(result => result[0] as StoreResult<unknown>);
    assert.equal(outcomes.filter(result => result.ok).length, 1);
    fails(outcomes.find(result => !result.ok) ?? { ok: true, value: null }, 'REVISION_CONFLICT');
    assert.equal(value(store.check()).reports, 2);
  } finally { await Promise.all(workers.map(worker => worker.terminate())); }
});
test('two concurrent initializers apply migration exactly once', async t => {
  const w = workspace(t);
  const workers = await Promise.all([startWriter(w.path, initial(), true), startWriter(w.path, initial(), true)]);
  try {
    const results = workers.map(worker => once(worker, 'message'));
    workers.forEach(worker => worker.postMessage('start'));
    for (const result of await Promise.all(results)) value(result[0] as StoreResult<unknown>);
    assert.deepEqual(raw(w.path, 'SELECT version FROM schema_migrations'), [{ version: 1 }]);
  } finally { await Promise.all(workers.map(worker => worker.terminate())); }
});
test('busy timeout is 5 seconds and returns STORAGE_BUSY before a later clean retry', async t => {
  const w = workspace(t), store = await w.open();
  const worker = new Worker(`const {DatabaseSync}=require('node:sqlite');const {parentPort,workerData}=require('node:worker_threads');
    const db=new DatabaseSync(workerData,{allowExtension:false});db.exec('BEGIN IMMEDIATE');parentPort.postMessage('locked');
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,6500);db.exec('ROLLBACK');db.close();parentPort.close();`, { eval: true, workerData: w.path });
  try {
    await once(worker, 'message');
    const exited = once(worker, 'exit');
    const start = Date.now();
    fails(store.saveReport(initial(), null), 'STORAGE_BUSY');
    assert.ok(Date.now() - start >= 4500);
    await exited;
    assert.equal(value(store.check()).ideas, 0);
    value(store.saveReport(initial(), null));
  } finally { await worker.terminate(); }
});
