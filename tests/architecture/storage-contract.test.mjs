// Runs the proposed SQL against actual SQLite. This is not an application test.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname, basename } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { at, json, makeSource, makeReport, makeDecision } from './fixtures.mjs';
const migration = readFileSync(new URL('../../storage/migrations/001_initial.sql', import.meta.url), 'utf8');
function removeTestDirectory(directory) {
  const target = resolve(directory);
  assert.equal(dirname(target), resolve(tmpdir()), 'Cleanup must stay in the temp root');
  assert.match(basename(target), /^compass-(architecture|conflict)-[A-Za-z0-9]+$/);
  rmSync(target, { recursive: true, force: true });
}
function create(t, path = ':memory:') {
  const db = new DatabaseSync(path, { enableForeignKeyConstraints: true, allowExtension: false, timeout: 50 });
  db.exec(migration);
  t.after(() => { if (db.isOpen) db.close(); });
  return db;
}
const addIdea = (db, id = 'idea_fixture') => db.prepare('INSERT INTO ideas VALUES (?, ?)').run(id, at);
const addSource = (db, source, id = 'idea_fixture') => db.prepare('INSERT INTO source_snapshots VALUES (?, ?, ?)').run(id, source.source_id, json(source));
const addReport = (db, r) => db.prepare('INSERT INTO report_revisions VALUES (?, ?, ?, ?, ?)')
  .run(r.idea_id, r.revision_id, r.parent_revision_id, r.created_at, json(r));
const addDecision = (db, d) => db.prepare('INSERT INTO human_decisions VALUES (?, ?, ?, ?, ?, ?)')
  .run(d.idea_id, d.decision_id, d.report_revision_id, d.supersedes_decision_id, d.decided_at, json(d));
function seed(db) {
  const r = makeReport(); addIdea(db); addSource(db, r.sources[0]); addReport(db, r); return r;
}

test('migration enables foreign keys, records its version and produces a consistent DB', t => {
  const db = create(t);
  assert.equal(db.prepare('PRAGMA user_version').get().user_version, 1);
  assert.equal(db.prepare('PRAGMA foreign_keys').get().foreign_keys, 1);
  assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
  assert.equal(db.prepare('SELECT COUNT(*) n FROM schema_migrations').get().n, 1);
});

test('initial report creates exact source links but never a human decision', t => {
  const db = create(t); seed(db);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM report_sources').get().n, 1);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM human_decisions').get().n, 0);
});

test('one idea cannot acquire a second root or a fork from an old parent', t => {
  const db = create(t); seed(db);
  assert.throws(() => addReport(db, makeReport('idea_fixture', 'another_root')), /UNIQUE/);
  addReport(db, makeReport('idea_fixture', 'rev_02', 'rev_01'));
  assert.throws(() => addReport(db, makeReport('idea_fixture', 'fork', 'rev_01')), /UNIQUE/);
});

test('parent must exist in the same idea and cannot be the revision itself', t => {
  const db = create(t); seed(db); addIdea(db, 'other'); addSource(db, makeSource(), 'other');
  assert.throws(() => addReport(db, makeReport('other', 'rev_02', 'rev_01')), /FOREIGN KEY/);
  assert.throws(() => addReport(db, makeReport('other', 'self', 'self')), /CHECK/);
});

test('unknown or cross-idea sources abort the report insertion', t => {
  const db = create(t); seed(db); addIdea(db, 'other');
  assert.throws(() => addReport(db, makeReport('other', 'rev_x')), /FOREIGN KEY/);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM report_revisions WHERE idea_id='other'").get().n, 0);
});

test('reusing a source ID with changed content is rejected', t => {
  const db = create(t); seed(db);
  const r = makeReport('idea_fixture', 'rev_02', 'rev_01');
  r.sources[0] = makeSource('source_01', '更正文本，必须换 ID。');
  assert.throws(() => addReport(db, r), /SOURCE_ID_CONFLICT/);
});

test('a new source snapshot permits correction while preserving old evidence', t => {
  const db = create(t); const original = seed(db);
  const r = makeReport('idea_fixture', 'rev_02', 'rev_01');
  r.sources = [makeSource('source_02', '合成更正：模拟工具只能网页查看。')];
  r.claims[0].text = '合成更正资料声称只能网页查看。';
  r.claims[0].evidence[0].source_id = 'source_02';
  r.change = { kind: 'evidence_correction', reason: '合成资料更新', changed_claim_ids: ['claim_01'], changed_source_ids: ['source_01', 'source_02'] };
  addSource(db, r.sources[0]); addReport(db, r);
  assert.equal(db.prepare("SELECT document_json FROM report_revisions WHERE revision_id='rev_01'").get().document_json, json(original));
  assert.equal(db.prepare('SELECT COUNT(*) n FROM source_snapshots').get().n, 2);
});

test('duplicate source entries cannot create ambiguous links', t => {
  const db = create(t); addIdea(db); const r = makeReport(); addSource(db, r.sources[0]);
  r.sources.push(structuredClone(r.sources[0]));
  assert.throws(() => addReport(db, r), /UNIQUE/);
});

test('stored envelope must agree with indexed idea, ID, parent, timestamp and schema', t => {
  const db = create(t); addIdea(db); const r = makeReport(); addSource(db, r.sources[0]);
  for (const key of ['idea_id', 'revision_id', 'parent_revision_id', 'created_at', 'schema_version']) {
    const altered = structuredClone(r); delete altered[key];
    assert.throws(() => db.prepare('INSERT INTO report_revisions VALUES (?, ?, ?, ?, ?)')
      .run(r.idea_id, r.revision_id, null, at, json(altered)), /CHECK/);
  }
});

test('reports, sources, source links, ideas and decisions cannot be updated or deleted', t => {
  const db = create(t); seed(db); addDecision(db, makeDecision());
  for (const table of ['ideas', 'source_snapshots', 'report_revisions', 'report_sources', 'human_decisions']) {
    assert.throws(() => db.exec(`UPDATE ${table} SET idea_id=idea_id`), /IMMUTABLE/);
    assert.throws(() => db.exec(`DELETE FROM ${table}`), /IMMUTABLE/);
  }
});

test('cannot attach additional evidence after a report has been saved', t => {
  const db = create(t); seed(db); addSource(db, makeSource('unlisted'));
  assert.throws(() => db.prepare('INSERT INTO report_sources VALUES (?, ?, ?)')
    .run('idea_fixture', 'rev_01', 'unlisted'), /SOURCE_NOT_IN_REPORT/);
});

test('human decisions require a real report from the same idea and human actor type', t => {
  const db = create(t); seed(db); addIdea(db, 'other');
  assert.throws(() => addDecision(db, makeDecision('other')), /FOREIGN KEY/);
  const d = makeDecision(); d.actor.kind = 'model';
  assert.throws(() => addDecision(db, d), /CHECK/);
  delete d.actor.kind; assert.throws(() => addDecision(db, d), /CHECK/);
});

test('decision revisions preserve earlier choices and reject parallel successors', t => {
  const db = create(t); seed(db); addDecision(db, makeDecision());
  addDecision(db, makeDecision('idea_fixture', 'rev_01', 'decision_02', 'decision_01'));
  assert.throws(() => addDecision(db, makeDecision('idea_fixture', 'rev_01', 'decision_fork', 'decision_01')), /UNIQUE/);
  assert.throws(() => addDecision(db, makeDecision('idea_fixture', 'rev_01', 'other_root')), /UNIQUE/);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM human_decisions').get().n, 2);
});

test('failed transaction can roll back new sources and idea without touching history', t => {
  const db = create(t); seed(db);
  db.exec('BEGIN IMMEDIATE');
  try {
    addIdea(db, 'broken'); addSource(db, makeSource(), 'broken');
    addReport(db, makeReport('broken', 'rev_fail', 'missing_parent'));
    assert.fail('foreign key error expected');
  } catch (error) {
    db.exec('ROLLBACK'); assert.match(error.message, /FOREIGN KEY/);
  }
  assert.equal(db.prepare("SELECT COUNT(*) n FROM ideas WHERE idea_id='broken'").get().n, 0);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM report_revisions').get().n, 1);
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
});

test('file database persists complete revisions after closing and reopening', t => {
  const directory = mkdtempSync(join(tmpdir(), 'compass-architecture-'));
  // This exact directory is created by this test, outside user project data.
  t.after(() => removeTestDirectory(directory));
  const path = join(directory, 'test.sqlite'); const db = create(t, path); seed(db); db.close();
  const reopened = new DatabaseSync(path, { readOnly: true });
  try {
    assert.equal(reopened.prepare('SELECT COUNT(*) n FROM report_revisions').get().n, 1);
    assert.equal(reopened.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
  } finally { reopened.close(); }
});

test('independent connections cannot commit two successors of the same parent', t => {
  const directory = mkdtempSync(join(tmpdir(), 'compass-conflict-'));
  t.after(() => removeTestDirectory(directory));
  const path = join(directory, 'test.sqlite'); const db = create(t, path); seed(db);
  const second = new DatabaseSync(path, { enableForeignKeyConstraints: true, timeout: 20 });
  try {
    db.exec('BEGIN IMMEDIATE');
    assert.throws(() => second.exec('BEGIN IMMEDIATE'), /locked/);
    addReport(db, makeReport('idea_fixture', 'rev_02', 'rev_01')); db.exec('COMMIT');
    assert.throws(() => addReport(second, makeReport('idea_fixture', 'rev_other', 'rev_01')), /UNIQUE/);
  } finally { second.close(); db.close(); }
});
