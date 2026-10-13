CREATE TABLE agents (
  agent_id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  disabled_at TEXT
) STRICT;

CREATE TABLE tokens (
  token_id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL REFERENCES agents(agent_id),
  token_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  revoked_at TEXT
) STRICT;

CREATE TABLE events (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  schema_version INTEGER NOT NULL CHECK (schema_version = 1),
  event_id TEXT NOT NULL,
  event TEXT NOT NULL CHECK (length(event) BETWEEN 1 AND 64),
  task_id TEXT NOT NULL,
  parent_id TEXT,
  agent_id TEXT NOT NULL REFERENCES agents(agent_id),
  model TEXT,
  title TEXT,
  step TEXT,
  plan_json TEXT,
  progress REAL CHECK (progress IS NULL OR (progress >= 0 AND progress <= 1)),
  token_input INTEGER CHECK (token_input IS NULL OR token_input >= 0),
  token_output INTEGER CHECK (token_output IS NULL OR token_output >= 0),
  reason TEXT,
  summary TEXT,
  error TEXT,
  source TEXT NOT NULL,
  ts TEXT NOT NULL,
  ts_inferred INTEGER NOT NULL CHECK (ts_inferred IN (0, 1)),
  attempt INTEGER NOT NULL CHECK (attempt >= 1),
  token_reset INTEGER NOT NULL DEFAULT 0 CHECK (token_reset IN (0, 1)),
  UNIQUE (agent_id, event_id)
) STRICT;

CREATE INDEX events_by_task_order
  ON events(agent_id, task_id, ts, seq);

CREATE TABLE tasks (
  agent_id TEXT NOT NULL REFERENCES agents(agent_id),
  task_id TEXT NOT NULL,
  parent_id TEXT,
  model TEXT,
  title TEXT,
  status TEXT CHECK (status IS NULL OR status IN ('queued', 'ongoing', 'blocked', 'done', 'failed')),
  attempt INTEGER NOT NULL CHECK (attempt >= 0),
  step TEXT,
  plan_json TEXT,
  progress REAL,
  tokens_known INTEGER NOT NULL CHECK (tokens_known IN (0, 1)),
  token_input INTEGER,
  token_output INTEGER,
  token_reset INTEGER NOT NULL DEFAULT 0 CHECK (token_reset IN (0, 1)),
  updated_at TEXT,
  PRIMARY KEY (agent_id, task_id)
) STRICT;

CREATE TABLE prices (
  model TEXT PRIMARY KEY,
  input_per_million REAL NOT NULL CHECK (input_per_million >= 0),
  output_per_million REAL NOT NULL CHECK (output_per_million >= 0),
  updated_at TEXT NOT NULL
) STRICT;

CREATE TABLE settings (
  setting_key TEXT PRIMARY KEY,
  setting_value TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;
