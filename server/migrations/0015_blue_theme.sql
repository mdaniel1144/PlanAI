-- Replace retired appearance choices without rebuilding users or their relations.
ALTER TABLE users ADD COLUMN next_theme TEXT NOT NULL DEFAULT 'blue'
  CHECK (next_theme IN ('blue','night','terra','sage-stone'));
UPDATE users SET next_theme = CASE
  WHEN theme IN ('studio-light','midnight-cobalt') THEN 'blue'
  ELSE theme END;
UPDATE users SET display_revision = display_revision + 1,
  display_updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
  WHERE theme IN ('studio-light','midnight-cobalt');
ALTER TABLE users DROP COLUMN theme;
ALTER TABLE users RENAME COLUMN next_theme TO theme;
