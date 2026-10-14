import { randomUUID } from "node:crypto";
import { toolInputSchemas } from "./tool-schemas.js";

type ToolName = keyof typeof toolInputSchemas;
type ToolArguments = Record<string, unknown>;
type TrackerConfig = { baseUrl: URL };

const TOOL_EVENT: Record<Exclude<ToolName, "task_list" | "project_register">, string> = {
  task_create: "task_queued",
  task_start: "task_started",
  task_update: "task_progress",
  task_block: "task_blocked",
  task_complete: "task_done",
  task_fail: "task_failed",
};

export class TrackerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TrackerError";
  }
}

export function readTrackerConfig(
  env: Record<string, string | undefined> = process.env,
): TrackerConfig {
  const rawUrl = env.AI_TASK_BOARD_URL;
  if (!rawUrl) throw new TrackerError("Set AI_TASK_BOARD_URL before starting this MCP server.");
  let baseUrl: URL;
  try {
    baseUrl = new URL(rawUrl);
  } catch {
    throw new TrackerError("AI_TASK_BOARD_URL must be a valid loopback HTTP URL.");
  }
  if (
    baseUrl.protocol !== "http:" ||
    !["127.0.0.1", "localhost"].includes(baseUrl.hostname) ||
    baseUrl.username !== "" ||
    baseUrl.password !== "" ||
    baseUrl.search !== "" ||
    baseUrl.hash !== "" ||
    !["", "/"].includes(baseUrl.pathname)
  ) {
    throw new TrackerError(
      "AI_TASK_BOARD_URL must point to the local tracker, such as http://127.0.0.1:4317.",
    );
  }
  baseUrl.pathname = "";
  return { baseUrl };
}

function eventInput(
  name: Exclude<ToolName, "task_list" | "project_register">,
  args: ToolArguments,
) {
  const taskId = name === "task_create" ? randomUUID() : args.task_id;
  const fields = { ...args };
  delete fields.task_id;
  return {
    schema_version: 1,
    event_id: randomUUID(),
    event: TOOL_EVENT[name],
    task_id: taskId,
    ...fields,
    ts: new Date().toISOString(),
  };
}

export function createToolService(config: TrackerConfig, fetcher: typeof fetch = fetch) {
  async function request(path: string, init: RequestInit = {}): Promise<unknown> {
    let response: Response;
    try {
      response = await fetcher(new URL(path, config.baseUrl), {
        ...init,
        headers: {
          ...(init.body ? { "content-type": "application/json" } : {}),
          ...init.headers,
        },
        signal: AbortSignal.timeout(5000),
      });
    } catch {
      throw new TrackerError(
        "The local tracker is unavailable. Start AI Task Board and try again.",
      );
    }
    if (!response.ok) {
      let message = "The tracker could not complete this request.";
      try {
        const body = (await response.json()) as { error?: { message?: string } };
        if (typeof body.error?.message === "string") message = body.error.message;
      } catch {
        // Keep the fallback message; response content is never surfaced without a safe JSON error field.
      }
      throw new TrackerError(message);
    }
    return response.json();
  }

  return {
    async call(name: ToolName, rawArgs: ToolArguments): Promise<unknown> {
      const args = toolInputSchemas[name].parse(rawArgs) as ToolArguments;
      if (name === "project_register")
        return request("/v1/mcp/projects", { method: "POST", body: JSON.stringify(args) });
      if (name === "task_list") {
        const query = new URLSearchParams();
        if (typeof args.status === "string") query.set("status", args.status);
        if (args.limit !== undefined) query.set("limit", String(args.limit));
        return request(`/v1/mcp/tasks${query.size ? `?${query}` : ""}`);
      }
      const eventName = name as Exclude<ToolName, "task_list" | "project_register">;
      const input = eventInput(eventName, args as ToolArguments);
      const result = (await request("/v1/mcp/events", {
        method: "POST",
        body: JSON.stringify(input),
      })) as { task_id?: string; duplicate?: boolean };
      if (name === "task_create")
        return { task_id: input.task_id, duplicate: result.duplicate ?? false };
      const taskResult = (await request(
        `/v1/mcp/tasks/${encodeURIComponent(String(input.task_id))}`,
      )) as {
        task?: unknown;
      };
      if (!taskResult.task)
        throw new TrackerError("The event was accepted, but the task could not be loaded.");
      return taskResult.task;
    },
  };
}

export type ToolService = ReturnType<typeof createToolService>;
