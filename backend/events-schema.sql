CREATE TABLE IF NOT EXISTS event_plans (
  id TEXT PRIMARY KEY, data TEXT NOT NULL, owner TEXT NOT NULL,
  updated_by TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS event_plan_history (
  event_id TEXT NOT NULL, version INTEGER NOT NULL, data TEXT NOT NULL,
  updated_by TEXT NOT NULL, updated_at TEXT NOT NULL,
  PRIMARY KEY(event_id,version)
);
CREATE TRIGGER IF NOT EXISTS preserve_event_plan_version BEFORE UPDATE ON event_plans
BEGIN
  INSERT OR IGNORE INTO event_plan_history(event_id,version,data,updated_by,updated_at)
  VALUES(OLD.id,OLD.version,OLD.data,OLD.updated_by,OLD.updated_at);
END;
