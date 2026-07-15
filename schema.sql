-- Ideas vault table.
-- id / created_at are generated in application code (crypto.randomUUID() / new Date().toISOString())
-- rather than via SQLite defaults, so values are predictable and portable.
CREATE TABLE IF NOT EXISTS ideas (
  id TEXT PRIMARY KEY,
  raw TEXT NOT NULL,
  efficiency TEXT NOT NULL,
  friction_killer TEXT NOT NULL,
  unit_economics TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS ideas_created_at_idx ON ideas (created_at DESC);
