import type { DatabaseSync } from "node:sqlite";
import type { PlanStep, TokenReport, TaskStatus } from "../types.js";

type TaskRow = {
  agent_id: string;
  display_name: string;
  task_id: string;
  parent_id: string | null;
  model: string | null;
  title: string | null;
  status: TaskStatus;
  attempt: number;
  step: string | null;
  plan_json: string | null;
  progress: number | null;
  tokens_known: 0 | 1;
  token_input: number | null;
  token_output: number | null;
  token_reset: 0 | 1;
  first_event_at: string | null;
  updated_at: string | null;
  input_per_million: number | null;
  output_per_million: number | null;
};

type EventRow = {
  schema_version: 1;
  event_id: string;
  event: string;
  task_id: string;
  parent_id: string | null;
  agent_id: string;
  model: string | null;
  title: string | null;
  step: string | null;
  plan_json: string | null;
  progress: number | null;
  token_input: number | null;
  token_output: number | null;
  reason: string | null;
  summary: string | null;
  error: string | null;
  source: string;
  ts: string;
  ts_inferred: number;
  seq: number;
  attempt: number;
  token_reset: number;
};

function mapTask(row: TaskRow) {
  const tokens: TokenReport | null = row.tokens_known
    ? {
        ...(row.token_input === null ? {} : { input: row.token_input }),
        ...(row.token_output === null ? {} : { output: row.token_output }),
      }
    : null;
  return {
    agent_id: row.agent_id,
    agent_name: row.display_name,
    task_id: row.task_id,
    parent_id: row.parent_id,
    model: row.model,
    title: row.title,
    status: row.status,
    attempt: row.attempt,
    step: row.step,
    plan: row.plan_json === null ? null : (JSON.parse(row.plan_json) as PlanStep[]),
    progress: row.progress,
    tokens,
    tokens_known: Boolean(row.tokens_known),
    token_reset: Boolean(row.token_reset),
    first_event_at: row.first_event_at,
    updated_at: row.updated_at,
    price_available: row.input_per_million !== null && row.output_per_million !== null,
    cost_estimate:
      row.tokens_known &&
      row.input_per_million !== null &&
      row.output_per_million !== null &&
      row.token_input !== null &&
      row.token_output !== null
        ? (row.token_input * row.input_per_million + row.token_output * row.output_per_million) /
          1_000_000
        : null,
  };
}

function taskQuery(): string {
  return `
    SELECT t.*, a.display_name,
           (SELECT e.ts FROM events e
             WHERE e.agent_id = t.agent_id AND e.task_id = t.task_id
             ORDER BY julianday(e.ts), e.seq LIMIT 1) AS first_event_at,
           p.input_per_million, p.output_per_million
      FROM tasks t
      JOIN agents a ON a.agent_id = t.agent_id
      LEFT JOIN prices p ON p.model = t.model
  `;
}

export function listTasks(db: DatabaseSync, agentId?: string) {
  const filter = agentId === undefined ? "" : " WHERE t.agent_id = ?";
  const rows = db
    .prepare(`${taskQuery()}${filter} ORDER BY t.updated_at DESC, t.task_id`)
    .all(...(agentId === undefined ? [] : [agentId])) as TaskRow[];
  return rows.map(mapTask);
}

export function getTaskDetail(db: DatabaseSync, taskId: string, agentId?: string) {
  const filter = agentId === undefined ? "" : " AND t.agent_id = ?";
  const row = db
    .prepare(`${taskQuery()} WHERE t.task_id = ?${filter}`)
    .get(...(agentId === undefined ? [taskId] : [taskId, agentId])) as TaskRow | undefined;
  if (!row) return null;

  const events = (
    db
      .prepare("SELECT * FROM events WHERE agent_id = ? AND task_id = ?")
      .all(row.agent_id, taskId) as EventRow[]
  )
    .sort((left, right) => Date.parse(left.ts) - Date.parse(right.ts) || left.seq - right.seq)
    .map((event) => ({
      schema_version: event.schema_version,
      event_id: event.event_id,
      event: event.event,
      task_id: event.task_id,
      parent_id: event.parent_id,
      agent: event.agent_id,
      model: event.model,
      title: event.title,
      step: event.step,
      plan: event.plan_json === null ? null : (JSON.parse(event.plan_json) as PlanStep[]),
      progress: event.progress,
      tokens:
        event.token_input === null && event.token_output === null
          ? null
          : {
              ...(event.token_input === null ? {} : { input: event.token_input }),
              ...(event.token_output === null ? {} : { output: event.token_output }),
            },
      reason: event.reason,
      summary: event.summary,
      error: event.error,
      source: event.source,
      ts: event.ts,
      ts_inferred: Boolean(event.ts_inferred),
      seq: event.seq,
      attempt: event.attempt,
      token_reset: Boolean(event.token_reset),
    }));

  return { ...mapTask(row), events };
}
