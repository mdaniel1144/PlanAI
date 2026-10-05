-- A revision is solely a concurrency token. No previous states are retained.
ALTER TABLE home_scenes RENAME COLUMN current_version TO current_revision;
ALTER TABLE scene_state RENAME COLUMN version TO revision;
