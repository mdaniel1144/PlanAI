-- Extend the existing user preference; canonical geometry is untouched.
ALTER TABLE users ADD COLUMN theme TEXT NOT NULL DEFAULT 'studio-light'
  CHECK (theme IN ('studio-light','night','terra','midnight-cobalt','sage-stone'));
ALTER TABLE users ADD COLUMN display_updated_at TEXT NOT NULL DEFAULT '1970-01-01T00:00:00.000Z';
ALTER TABLE users ADD COLUMN display_revision INTEGER NOT NULL DEFAULT 0 CHECK (display_revision >= 0);
UPDATE users SET display_updated_at = updated_at;
