CREATE TABLE users (
  id TEXT PRIMARY KEY NOT NULL,
  email TEXT NOT NULL COLLATE NOCASE UNIQUE CHECK(email = lower(trim(email))),
  name TEXT NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 120),
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('ADMIN', 'USER')),
  status TEXT NOT NULL CHECK(status IN ('ACTIVE', 'DISABLED')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_login_at TEXT
);
CREATE TABLE user_sessions (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  last_used_at TEXT NOT NULL,
  revoked_at TEXT
);
CREATE INDEX user_sessions_user_id ON user_sessions(user_id);
CREATE INDEX user_sessions_expires_at ON user_sessions(expires_at);
