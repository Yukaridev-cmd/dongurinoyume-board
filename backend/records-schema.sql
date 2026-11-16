CREATE TABLE IF NOT EXISTS records (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK(kind IN ('review','task','inventory','photo','request')),
  owner TEXT NOT NULL,
  data TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  deleted INTEGER NOT NULL DEFAULT 0 CHECK(deleted IN (0,1))
);
CREATE INDEX IF NOT EXISTS records_active ON records(deleted, id);
CREATE TABLE IF NOT EXISTS record_history (
  record_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  kind TEXT NOT NULL,
  owner TEXT NOT NULL,
  data TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  deleted INTEGER NOT NULL,
  PRIMARY KEY(record_id, version)
);
CREATE TRIGGER IF NOT EXISTS preserve_record_version BEFORE UPDATE ON records
BEGIN
  INSERT OR IGNORE INTO record_history(record_id,version,kind,owner,data,updated_at,updated_by,deleted)
  VALUES(OLD.id,OLD.version,OLD.kind,OLD.owner,OLD.data,OLD.updated_at,OLD.updated_by,OLD.deleted);
END;
