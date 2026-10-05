ALTER TABLE projects ADD COLUMN owner_user_id TEXT REFERENCES users(id);
CREATE INDEX projects_owner ON projects(owner_user_id);
