import { Ajv2020 } from "ajv/dist/2020.js";
import type { ErrorObject } from "ajv";
import { createRequire } from "node:module";
import type { FormatsPlugin } from "ajv-formats";
import type { DatabaseSync } from "node:sqlite";
import eventInputSchema from "../../schema/v1/event-input.schema.json" with { type: "json" };
import type {
  EventInput,
  EventPrincipal,
  IngestResult,
  PlanStep,
  StoredEvent,
  TaskProjection,
} from "../types.js";
import { deriveTasks } from "./derive-state.js";
import { calculateTaskCostEstimate } from "./task-stats.js";

const ajv = new Ajv2020({ allErrors: true, strict: true });
const addFormats = createRequire(import.meta.url)("ajv-formats") as FormatsPlugin;
addFormats(ajv);
const validateEventInput = ajv.compile(eventInputSchema);

const EVENT_COLUMNS = [
  "schema_version",
  "event_id",
  "event",
  "task_id",
  "project_id",
  "parent_id",
  "agent_id",
  "model",
  "title",
  "step",
  "plan_json",
  "progress",
  "token_input",
  "token_output",
  "reason",
  "summary",
  "error",
  "source",
  "ts",
  "ts_inferred",
  "attempt",
  "token_reset",
];

type ValidationDetail = { path: string; rule: string };
type EventDbRow = {
  schema_version: 1;
  event_id: string;
  event: string;
  task_id: string;
  project_id: string | null;
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
type StoredEventWithResetHistory = StoredEvent & { saw_token_reset: boolean };
type IngressSource = "mcp" | "rest" | `adapter:${string}`;
type PublishPayload = { type: "task.updated"; event: StoredEvent; task: TaskProjection };
type IngestOptions = {
  principal: EventPrincipal;
  input: EventInput;
  source: IngressSource;
  now?: () => Date;
  publish?: (payload: PublishPayload) => void;
};
type NormalizedDbEvent = Omit<
  StoredEvent,
  "agent" | "plan" | "tokens" | "seq" | "attempt" | "token_reset"
> & {
  agent_id: string;
  plan_json: string | null;
  token_input: number | null;
  token_output: number | null;
};
type DuplicateRow = { seq: number };
type InsertedRow = { attempt: number; token_reset: number };
type EventField = "parent_id" | "model" | "title" | "step" | "plan" | "progress";

export class EventInputError extends Error {
  readonly code: string;
  readonly details: ValidationDetail[];

  constructor(code: string, message: string, details: ValidationDetail[] = []) {
    super(message);
    this.name = "EventInputError";
    this.code = code;
    this.details = details;
  }
}

function safeValidationDetails(errors: ErrorObject[] | null | undefined): ValidationDetail[] {
  if (!errors) return [];
  return errors.map(({ instancePath, keyword }) => ({ path: instancePath, rule: keyword }));
}

function assertInput(input: EventInput, principal: EventPrincipal, source: IngressSource): void {
  if (!validateEventInput(input)) {
    throw new EventInputError(
      "invalid_event",
      "Event input does not match schema v1.",
      safeValidationDetails(validateEventInput.errors),
    );
  }
  if (input.agent !== undefined && input.agent !== principal.agent_id) {
    throw new EventInputError(
      "agent_mismatch",
      "Event agent does not match the authenticated agent.",
    );
  }
  if (!new Set(["mcp", "rest"]).has(source) && !/^adapter:[a-z0-9-]{1,48}$/.test(source ?? "")) {
    throw new TypeError("Event source must be assigned by a supported ingress.");
  }
}

function readStoredEvents(db: DatabaseSync, agentId: string, taskId: string): StoredEvent[] {
  const rows = db
    .prepare("SELECT * FROM events WHERE agent_id = ? AND task_id = ?")
    .all(agentId, taskId) as EventDbRow[];
  return rows
    .map((row) => ({
      schema_version: row.schema_version,
      event_id: row.event_id,
      event: row.event,
      task_id: row.task_id,
      project_id: row.project_id,
      parent_id: row.parent_id,
      agent: row.agent_id,
      model: row.model,
      title: row.title,
      step: row.step,
      plan: row.plan_json === null ? null : (JSON.parse(row.plan_json) as PlanStep[]),
      progress: row.progress,
      tokens:
        row.token_input === null && row.token_output === null
          ? null
          : {
              ...(row.token_input === null ? {} : { input: row.token_input }),
              ...(row.token_output === null ? {} : { output: row.token_output }),
            },
      reason: row.reason,
      summary: row.summary,
      error: row.error,
      source: row.source,
      ts: row.ts,
      ts_inferred: Boolean(row.ts_inferred),
      seq: row.seq,
      attempt: row.attempt,
      token_reset: Boolean(row.token_reset),
    }))
    .sort((left, right) => Date.parse(left.ts) - Date.parse(right.ts) || left.seq - right.seq);
}

function assignAttemptAndTokenResets(events: StoredEvent[]): StoredEventWithResetHistory[] {
  let attempt = 0;
  let terminal = false;
  let inputTokens: number | null = null;
  let outputTokens: number | null = null;
  let sawTokenReset = false;

  return events.map((event) => {
    if (attempt === 0) attempt = 1;
    if (terminal && event.event === "task_started") {
      attempt += 1;
      terminal = false;
    }

    const tokenReport = event.tokens;
    let tokenReset = false;
    if (tokenReport) {
      if (
        tokenReport.input !== undefined &&
        inputTokens !== null &&
        tokenReport.input < inputTokens
      ) {
        tokenReset = true;
      }
      if (
        tokenReport.output !== undefined &&
        outputTokens !== null &&
        tokenReport.output < outputTokens
      ) {
        tokenReset = true;
      }
      inputTokens = tokenReport.input ?? null;
      outputTokens = tokenReport.output ?? null;
      sawTokenReset ||= tokenReset;
    }

    if (event.event === "task_done" || event.event === "task_failed") terminal = true;

    return { ...event, attempt, token_reset: tokenReset, saw_token_reset: sawTokenReset };
  });
}

function latestDefined<K extends EventField>(
  events: StoredEventWithResetHistory[],
  field: K,
): StoredEvent[K] | null {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const value = events[index][field];
    if (value !== null && value !== undefined) return value;
  }
  return null;
}

function rebuildTask(
  db: DatabaseSync,
  agentId: string,
  taskId: string,
  requestedProjectId: string | null,
): TaskProjection {
  const orderedEvents = assignAttemptAndTokenResets(readStoredEvents(db, agentId, taskId));
  const eventState = deriveTasks(orderedEvents)[0];
  if (!eventState) throw new Error("Inserted event did not produce a task projection.");

  const attemptBySeq = db.prepare("UPDATE events SET attempt = ?, token_reset = ? WHERE seq = ?");
  for (const event of orderedEvents) {
    attemptBySeq.run(event.attempt, Number(event.token_reset), event.seq);
  }

  const knownEvents = orderedEvents.filter((event) =>
    [
      "task_queued",
      "task_started",
      "task_progress",
      "task_blocked",
      "task_done",
      "task_failed",
    ].includes(event.event),
  );
  const tokenEvents = orderedEvents.filter((event) => event.tokens !== null);
  const latestTokens = tokenEvents.at(-1)?.tokens ?? null;
  const existingProject = db
    .prepare("SELECT project_id FROM tasks WHERE agent_id = ? AND task_id = ?")
    .get(agentId, taskId) as { project_id: string | null } | undefined;
  const projectId = existingProject?.project_id ?? requestedProjectId ?? null;
  const agent = db.prepare("SELECT display_name FROM agents WHERE agent_id = ?").get(agentId) as
    { display_name: string } | undefined;
  if (!agent) throw new Error("Task agent was not found.");
  const model = latestDefined(knownEvents, "model");
  const price =
    model === null
      ? undefined
      : (db
          .prepare("SELECT input_per_million, output_per_million FROM prices WHERE model = ?")
          .get(model) as { input_per_million: number; output_per_million: number } | undefined);
  const task: TaskProjection = {
    agent_id: agentId,
    agent_name: agent.display_name,
    task_id: taskId,
    project_id: projectId,
    parent_id: latestDefined(knownEvents, "parent_id"),
    model,
    title: latestDefined(knownEvents, "title"),
    status: eventState.status,
    attempt: eventState.attempt,
    step: latestDefined(knownEvents, "step"),
    plan: latestDefined(knownEvents, "plan"),
    progress: latestDefined(knownEvents, "progress"),
    tokens_known: latestTokens !== null,
    token_input: latestTokens?.input ?? null,
    token_output: latestTokens?.output ?? null,
    token_reset: orderedEvents.some((event) => event.saw_token_reset),
    first_event_at: orderedEvents[0]?.ts ?? null,
    updated_at: eventState.updated_at,
    price_available: price !== undefined,
    cost_estimate: calculateTaskCostEstimate(
      latestTokens?.input ?? null,
      latestTokens?.output ?? null,
      price?.input_per_million ?? null,
      price?.output_per_million ?? null,
    ),
    tokens: latestTokens,
  };

  db.prepare(
    `
    INSERT INTO tasks (
      agent_id, task_id, project_id, parent_id, model, title, status, attempt, step, plan_json,
      progress, tokens_known, token_input, token_output, token_reset, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(agent_id, task_id) DO UPDATE SET
      project_id = excluded.project_id,
      parent_id = excluded.parent_id,
      model = excluded.model,
      title = excluded.title,
      status = excluded.status,
      attempt = excluded.attempt,
      step = excluded.step,
      plan_json = excluded.plan_json,
      progress = excluded.progress,
      tokens_known = excluded.tokens_known,
      token_input = excluded.token_input,
      token_output = excluded.token_output,
      token_reset = excluded.token_reset,
      updated_at = excluded.updated_at
  `,
  ).run(
    task.agent_id,
    task.task_id,
    task.project_id,
    task.parent_id,
    task.model,
    task.title,
    task.status,
    task.attempt,
    task.step,
    task.plan === null ? null : JSON.stringify(task.plan),
    task.progress,
    Number(task.tokens_known),
    task.token_input,
    task.token_output,
    Number(task.token_reset),
    task.updated_at,
  );

  return task;
}

function insertEvent(
  db: DatabaseSync,
  event: NormalizedDbEvent,
): { lastInsertRowid: number | bigint } {
  const insert = db.prepare(
    `INSERT INTO events (${EVENT_COLUMNS.join(", ")}) VALUES (${EVENT_COLUMNS.map(() => "?").join(", ")})`,
  );
  return insert.run(
    event.schema_version,
    event.event_id,
    event.event,
    event.task_id,
    event.project_id,
    event.parent_id,
    event.agent_id,
    event.model,
    event.title,
    event.step,
    event.plan_json,
    event.progress,
    event.token_input,
    event.token_output,
    event.reason,
    event.summary,
    event.error,
    event.source,
    event.ts,
    Number(event.ts_inferred),
    1,
    0,
  );
}

export function ingestEvent(
  db: DatabaseSync,
  { principal, input, source, now = () => new Date(), publish = () => {} }: IngestOptions,
): IngestResult {
  assertInput(input, principal, source);

  if (
    input.project_id !== undefined &&
    input.project_id !== null &&
    !db.prepare("SELECT 1 FROM projects WHERE project_id = ?").get(input.project_id)
  ) {
    throw new EventInputError("unknown_project", "The selected project was not found.");
  }

  const duplicate = db
    .prepare("SELECT seq FROM events WHERE agent_id = ? AND event_id = ?")
    .get(principal.agent_id, input.event_id) as DuplicateRow | undefined;
  if (duplicate) return { duplicate: true, seq: duplicate.seq };

  const receivedAt = now();
  const ts = input.ts ?? receivedAt.toISOString();
  const event: NormalizedDbEvent = {
    schema_version: input.schema_version ?? 1,
    event_id: input.event_id,
    event: input.event,
    task_id: input.task_id,
    project_id: input.project_id ?? null,
    parent_id: input.parent_id ?? null,
    agent_id: principal.agent_id,
    model: input.model ?? null,
    title: input.title ?? null,
    step: input.step ?? null,
    plan_json: input.plan == null ? null : JSON.stringify(input.plan),
    progress: input.progress ?? null,
    token_input: input.tokens?.input ?? null,
    token_output: input.tokens?.output ?? null,
    reason: input.reason ?? null,
    summary: input.summary ?? null,
    error: input.error ?? null,
    source,
    ts,
    ts_inferred: input.ts === undefined,
  };

  db.exec("BEGIN IMMEDIATE");
  let seq: number;
  let task: TaskProjection;
  try {
    const result = insertEvent(db, event);
    seq = Number(result.lastInsertRowid);
    task = rebuildTask(db, principal.agent_id, input.task_id, event.project_id);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }

  const storedMetadata = db
    .prepare("SELECT attempt, token_reset FROM events WHERE seq = ?")
    .get(seq) as InsertedRow | undefined;
  if (!storedMetadata) throw new Error("Inserted event metadata could not be read.");

  const storedEvent: StoredEvent = {
    schema_version: event.schema_version,
    event_id: event.event_id,
    event: event.event,
    task_id: event.task_id,
    project_id: event.project_id,
    parent_id: event.parent_id,
    agent: principal.agent_id,
    model: event.model,
    title: event.title,
    step: event.step,
    plan: input.plan ?? null,
    progress: event.progress,
    tokens: input.tokens ?? null,
    reason: event.reason,
    summary: event.summary,
    error: event.error,
    source,
    ts,
    ts_inferred: event.ts_inferred,
    seq,
    attempt: storedMetadata.attempt,
    token_reset: Boolean(storedMetadata.token_reset),
  };

  publish({ type: "task.updated", event: storedEvent, task });
  return { duplicate: false, event: storedEvent, task };
}
