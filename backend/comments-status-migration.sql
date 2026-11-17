-- Apply once to an existing comments table after checking PRAGMA table_info(comments).
-- Existing text, ownership, timestamps and versions remain unchanged.
ALTER TABLE comments ADD COLUMN resolved INTEGER NOT NULL DEFAULT 0 CHECK(resolved IN (0, 1));
ALTER TABLE comments ADD COLUMN resolved_at TEXT;
ALTER TABLE comments ADD COLUMN resolved_by TEXT;
