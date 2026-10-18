CREATE TABLE IF NOT EXISTS invitations (
  id TEXT PRIMARY KEY,
  code_hash TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  redeemed_at INTEGER,
  redeemed_by TEXT,
  revoked INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS invitation_attempts (
  ip_hash TEXT PRIMARY KEY,
  retry_at INTEGER NOT NULL,
  attempt_id TEXT NOT NULL
);
