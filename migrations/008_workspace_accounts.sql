-- Named workspace accounts. Passwords are stored ONLY as scrypt hashes, never plain text.
-- Accounts are disabled, not deleted, so audit history keeps resolving to a real identity.
CREATE TABLE IF NOT EXISTS workspace_users (
  id                  TEXT PRIMARY KEY,
  email               TEXT NOT NULL UNIQUE
                      CHECK (email = lower(email) AND length(email) BETWEEN 3 AND 254),
  display_name        TEXT,
  password_hash       TEXT NOT NULL CHECK (password_hash LIKE 'scrypt:%'),
  status              TEXT NOT NULL DEFAULT 'ACTIVE'
                      CHECK (status IN ('ACTIVE','DISABLED')),
  created_by          TEXT NOT NULL,
  created_at          TEXT NOT NULL,
  updated_at          TEXT NOT NULL,
  password_changed_at TEXT NOT NULL,
  last_login_at       TEXT
);
CREATE TABLE IF NOT EXISTS workspace_user_roles (
  user_id     TEXT NOT NULL REFERENCES workspace_users(id),
  role        TEXT NOT NULL CHECK (role IN ('AUTHOR','POLICY_AUTHORITY','VIEWER')),
  granted_by  TEXT NOT NULL,
  granted_at  TEXT NOT NULL,
  PRIMARY KEY (user_id, role)
);
