export type TaskStatus = "queued" | "ongoing" | "blocked" | "done" | "failed" | null;

export type PlanStep = {
  text: string;
  status: "pending" | "active" | "done";
};

export type TokenReport = {
  input?: number;
  output?: number;
};

export type EventInput = {
  schema_version?: 1;
  event_id: string;
  event: string;
  task_id: string;
  parent_id?: string | null;
  agent?: string;
  model?: string | null;
  title?: string | null;
  step?: string | null;
  plan?: PlanStep[] | null;
  progress?: number | null;
  tokens?: TokenReport | null;
  reason?: string | null;
  summary?: string | null;
  error?: string | null;
  ts?: string;
};

export type EventPrincipal = {
  agent_id: string;
  display_name: string;
};

export type MigrationRow = { version: number };

export type DerivableEvent = {
  agent: string;
  event_id: string;
  event: string;
  task_id: string;
  ts: string;
  seq: number;
};

export type TaskState = {
  agent: string;
  task_id: string;
  status: TaskStatus;
  attempt: number;
  updated_at: string | null;
};

export type StoredEvent = {
  schema_version: 1;
  event_id: string;
  event: string;
  task_id: string;
  parent_id: string | null;
  agent: string;
  model: string | null;
  title: string | null;
  step: string | null;
  plan: PlanStep[] | null;
  progress: number | null;
  tokens: TokenReport | null;
  reason: string | null;
  summary: string | null;
  error: string | null;
  source: string;
  ts: string;
  ts_inferred: boolean;
  seq: number;
  attempt: number;
  token_reset: boolean;
};

export type TaskProjection = {
  agent_id: string;
  agent_name: string;
  task_id: string;
  parent_id: string | null;
  model: string | null;
  title: string | null;
  status: TaskStatus;
  attempt: number;
  step: string | null;
  plan: PlanStep[] | null;
  progress: number | null;
  tokens_known: 0 | 1;
  token_input: number | null;
  token_output: number | null;
  token_reset: 0 | 1;
  first_event_at: string | null;
  updated_at: string | null;
  price_available: boolean;
  cost_estimate: number | null;
  tokens: TokenReport | null;
};

export type IngestResult =
  { duplicate: true; seq: number } | { duplicate: false; event: StoredEvent; task: TaskProjection };
