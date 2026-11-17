-- Apply only to the NEW isolated owner-test database, never production.
CREATE TABLE IF NOT EXISTS owner_test_environment (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  purpose TEXT NOT NULL CHECK (purpose = 'dongurinoyume-owner-test-v1')
);
INSERT INTO owner_test_environment (id, purpose)
VALUES (1, 'dongurinoyume-owner-test-v1') ON CONFLICT(id) DO NOTHING;
