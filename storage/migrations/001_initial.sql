-- Architecture baseline v1. Apply once to a new DB, via trusted application code.
-- Runtime JSON Schema and semantic validation remain mandatory.
PRAGMA foreign_keys = ON;
BEGIN IMMEDIATE;

CREATE TABLE schema_migrations (
  version INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL
) STRICT;

CREATE TABLE ideas (
  idea_id TEXT PRIMARY KEY NOT NULL,
  created_at TEXT NOT NULL
) STRICT;

CREATE TABLE source_snapshots (
  idea_id TEXT NOT NULL REFERENCES ideas(idea_id),
  source_id TEXT NOT NULL,
  record_json TEXT NOT NULL CHECK (json_valid(record_json)),
  PRIMARY KEY (idea_id, source_id),
  CHECK (json_extract(record_json, '$.source_id') IS source_id),
  CHECK (json_extract(record_json, '$.capture_status') IN ('captured', 'metadata_only', 'unavailable')),
  CHECK (json_type(record_json, '$.capture_status') IS 'text')
) STRICT;

CREATE TABLE report_revisions (
  idea_id TEXT NOT NULL REFERENCES ideas(idea_id),
  revision_id TEXT NOT NULL,
  parent_revision_id TEXT,
  created_at TEXT NOT NULL,
  document_json TEXT NOT NULL CHECK (json_valid(document_json)),
  PRIMARY KEY (idea_id, revision_id),
  UNIQUE (idea_id, parent_revision_id),
  FOREIGN KEY (idea_id, parent_revision_id) REFERENCES report_revisions(idea_id, revision_id),
  CHECK (parent_revision_id IS NULL OR parent_revision_id <> revision_id),
  CHECK (json_extract(document_json, '$.schema_version') IS '1.0'),
  CHECK (json_extract(document_json, '$.idea_id') IS idea_id),
  CHECK (json_extract(document_json, '$.revision_id') IS revision_id),
  CHECK (json_type(document_json, '$.parent_revision_id') IS NOT NULL),
  CHECK (json_extract(document_json, '$.parent_revision_id') IS parent_revision_id),
  CHECK (json_extract(document_json, '$.created_at') IS created_at),
  CHECK (json_type(document_json, '$.sources') IS 'array')
) STRICT;

CREATE UNIQUE INDEX one_report_root_per_idea
  ON report_revisions(idea_id) WHERE parent_revision_id IS NULL;

CREATE TABLE report_sources (
  idea_id TEXT NOT NULL,
  revision_id TEXT NOT NULL,
  source_id TEXT NOT NULL,
  PRIMARY KEY (idea_id, revision_id, source_id),
  FOREIGN KEY (idea_id, revision_id) REFERENCES report_revisions(idea_id, revision_id),
  FOREIGN KEY (idea_id, source_id) REFERENCES source_snapshots(idea_id, source_id)
) STRICT;

CREATE TRIGGER source_contents_must_match BEFORE INSERT ON report_revisions
BEGIN
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM json_each(NEW.document_json, '$.sources') AS item
    JOIN source_snapshots AS saved ON saved.idea_id = NEW.idea_id
      AND saved.source_id = json_extract(item.value, '$.source_id')
    WHERE json(saved.record_json) <> json(item.value)
  ) THEN RAISE(ABORT, 'SOURCE_ID_CONFLICT') END;
END;

CREATE TRIGGER link_report_sources AFTER INSERT ON report_revisions
BEGIN
  INSERT INTO report_sources (idea_id, revision_id, source_id)
    SELECT NEW.idea_id, NEW.revision_id, json_extract(value, '$.source_id')
    FROM json_each(NEW.document_json, '$.sources');
END;

CREATE TABLE human_decisions (
  idea_id TEXT NOT NULL REFERENCES ideas(idea_id),
  decision_id TEXT NOT NULL,
  report_revision_id TEXT NOT NULL,
  supersedes_decision_id TEXT,
  decided_at TEXT NOT NULL,
  document_json TEXT NOT NULL CHECK (json_valid(document_json)),
  PRIMARY KEY (idea_id, decision_id),
  UNIQUE (idea_id, supersedes_decision_id),
  FOREIGN KEY (idea_id, report_revision_id) REFERENCES report_revisions(idea_id, revision_id),
  FOREIGN KEY (idea_id, supersedes_decision_id) REFERENCES human_decisions(idea_id, decision_id),
  CHECK (supersedes_decision_id IS NULL OR supersedes_decision_id <> decision_id),
  CHECK (json_extract(document_json, '$.schema_version') IS '1.0'),
  CHECK (json_extract(document_json, '$.idea_id') IS idea_id),
  CHECK (json_extract(document_json, '$.decision_id') IS decision_id),
  CHECK (json_extract(document_json, '$.report_revision_id') IS report_revision_id),
  CHECK (json_type(document_json, '$.supersedes_decision_id') IS NOT NULL),
  CHECK (json_extract(document_json, '$.supersedes_decision_id') IS supersedes_decision_id),
  CHECK (json_extract(document_json, '$.decided_at') IS decided_at),
  CHECK (json_extract(document_json, '$.actor.kind') IS 'human'),
  CHECK (json_type(document_json, '$.choice') IS 'text'),
  CHECK (json_extract(document_json, '$.choice') IN ('build_small', 'use_existing', 'contribute', 'pause', 'stop'))
) STRICT;

CREATE UNIQUE INDEX one_decision_root_per_idea
  ON human_decisions(idea_id) WHERE supersedes_decision_id IS NULL;

CREATE TRIGGER immutable_idea_update BEFORE UPDATE ON ideas
BEGIN SELECT RAISE(ABORT, 'IMMUTABLE_IDEA'); END;
CREATE TRIGGER immutable_idea_delete BEFORE DELETE ON ideas
BEGIN SELECT RAISE(ABORT, 'IMMUTABLE_IDEA'); END;
CREATE TRIGGER immutable_source_update BEFORE UPDATE ON source_snapshots
BEGIN SELECT RAISE(ABORT, 'IMMUTABLE_SOURCE'); END;
CREATE TRIGGER immutable_source_delete BEFORE DELETE ON source_snapshots
BEGIN SELECT RAISE(ABORT, 'IMMUTABLE_SOURCE'); END;
CREATE TRIGGER immutable_report_update BEFORE UPDATE ON report_revisions
BEGIN SELECT RAISE(ABORT, 'IMMUTABLE_REPORT'); END;
CREATE TRIGGER immutable_report_delete BEFORE DELETE ON report_revisions
BEGIN SELECT RAISE(ABORT, 'IMMUTABLE_REPORT'); END;
CREATE TRIGGER immutable_report_source_update BEFORE UPDATE ON report_sources
BEGIN SELECT RAISE(ABORT, 'IMMUTABLE_REPORT_SOURCE'); END;
CREATE TRIGGER immutable_report_source_delete BEFORE DELETE ON report_sources
BEGIN SELECT RAISE(ABORT, 'IMMUTABLE_REPORT_SOURCE'); END;
-- After-insert linkage is complete: no later source can be added to a report.
CREATE TRIGGER source_link_must_be_in_report BEFORE INSERT ON report_sources
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM report_revisions AS r, json_each(r.document_json, '$.sources') AS item
    WHERE r.idea_id = NEW.idea_id AND r.revision_id = NEW.revision_id
      AND json_extract(item.value, '$.source_id') = NEW.source_id
  ) THEN RAISE(ABORT, 'SOURCE_NOT_IN_REPORT') END;
END;
CREATE TRIGGER immutable_decision_update BEFORE UPDATE ON human_decisions
BEGIN SELECT RAISE(ABORT, 'IMMUTABLE_DECISION'); END;
CREATE TRIGGER immutable_decision_delete BEFORE DELETE ON human_decisions
BEGIN SELECT RAISE(ABORT, 'IMMUTABLE_DECISION'); END;

INSERT INTO schema_migrations(version, applied_at) VALUES (1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
PRAGMA user_version = 1;
COMMIT;
