CREATE TABLE projects (
  project_id TEXT PRIMARY KEY,
  project_key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 60),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;

ALTER TABLE tasks ADD COLUMN project_id TEXT REFERENCES projects(project_id);
ALTER TABLE events ADD COLUMN project_id TEXT REFERENCES projects(project_id);

CREATE INDEX tasks_by_project_status_updated
  ON tasks(project_id, status, updated_at DESC);

INSERT INTO projects(project_id, project_key, name, created_at, updated_at) VALUES
  ('3e3d6465-9d2d-4979-bf28-2bc91ce2f3b1', 'seed:task-tracker-kanban', 'Task Tracker Kanban', '2026-10-14T00:00:00.000Z', '2026-10-14T00:00:00.000Z'),
  ('5549ba46-9c4a-4cbc-950f-46ba2ef0e098', 'seed:dot-notifier', 'Dot Notifier', '2026-10-14T00:00:00.000Z', '2026-10-14T00:00:00.000Z'),
  ('a907bcf7-3e6a-439d-a8d5-acbca8589126', 'seed:ashram-gandhi-puri-landing-page', 'Ashram Gandhi Puri Landing Page', '2026-10-14T00:00:00.000Z', '2026-10-14T00:00:00.000Z');
