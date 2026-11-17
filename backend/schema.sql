CREATE TABLE IF NOT EXISTS comments (
  id TEXT PRIMARY KEY,
  owner TEXT NOT NULL,
  target TEXT NOT NULL CHECK(length(target) BETWEEN 1 AND 300),
  text TEXT NOT NULL CHECK(length(text) BETWEEN 1 AND 4000),
  created_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  resolved INTEGER NOT NULL DEFAULT 0 CHECK(resolved IN (0, 1)),
  resolved_at TEXT,
  resolved_by TEXT,
  deleted INTEGER NOT NULL DEFAULT 0 CHECK(deleted IN (0, 1))
);
CREATE INDEX IF NOT EXISTS comments_active ON comments(deleted, created_at, id);
