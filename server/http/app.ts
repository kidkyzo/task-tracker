import { authenticateToken } from "../auth/credentials.js";
import type { DatabaseSync } from "node:sqlite";
import { EventHub } from "../events/event-hub.js";
import { EventInputError, ingestEvent } from "../events/event-service.js";
import { getTaskDetail, listTasks } from "../events/task-queries.js";
import { getTaskStats } from "../events/task-stats.js";
import {
  deleteModelPrice,
  isAgentCreateInput,
  isModelPriceInput,
  issueAgentToken,
  listAgents,
  listModelPrices,
  revokeAgentToken,
  setModelPrice,
} from "../settings/settings-service.js";
import type { EventInput, EventPrincipal, TaskStatus } from "../types.js";

const TASK_STATUSES = new Set<TaskStatus>(["queued", "ongoing", "blocked", "done", "failed"]);
function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function validateHost(hostHeader: string | null, port: number): boolean {
  if (!hostHeader) return false;
  const host = hostHeader.toLowerCase();
  return host === `127.0.0.1:${port}` || host === `localhost:${port}`;
}

function requestPrincipal(request: Request, db: DatabaseSync): EventPrincipal | null {
  const authorization = request.headers.get("authorization");
  const match = authorization?.match(/^Bearer ([A-Za-z0-9_-]+)$/);
  return match ? authenticateToken(db, match[1]) : null;
}

function isJson(request: Request): boolean {
  return (
    request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() === "application/json"
  );
}

function isSameOriginSettingsRequest(request: Request, port: number): boolean {
  if (request.headers.get("sec-fetch-site") === "cross-site") return false;
  const origin = request.headers.get("origin");
  if (!origin) return true;
  return origin === `http://127.0.0.1:${port}` || origin === `http://localhost:${port}`;
}

function isSameOriginDashboardRequest(request: Request, port: number): boolean {
  if (request.headers.get("sec-fetch-site") === "cross-site") return false;
  const origin = request.headers.get("origin");
  if (!origin) return true;
  const host = request.headers.get("host")?.toLowerCase();
  return (
    origin === `http://${host}` && (host === `127.0.0.1:${port}` || host === `localhost:${port}`)
  );
}

async function readJsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}

function encodeServerEvent(eventName: string, value: unknown): Uint8Array {
  return new TextEncoder().encode(`event: ${eventName}\ndata: ${JSON.stringify(value)}\n\n`);
}

function sseResponse(db: DatabaseSync, hub: EventHub): Response {
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let unsubscribe = () => {};
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encodeServerEvent("snapshot", listTasks(db)));
      heartbeat = setInterval(() => {
        try {
          controller.enqueue(new TextEncoder().encode(": heartbeat\n\n"));
        } catch {
          if (heartbeat) clearInterval(heartbeat);
          unsubscribe();
        }
      }, 15_000);
      unsubscribe = hub.subscribe((update) => {
        try {
          controller.enqueue(encodeServerEvent(update.type, update));
        } catch {
          if (heartbeat) clearInterval(heartbeat);
          unsubscribe();
        }
      });
    },
    cancel() {
      if (heartbeat) clearInterval(heartbeat);
      unsubscribe();
    },
  });

  return new Response(body, {
    status: 200,
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    },
  });
}

export function createRequestHandler(db: DatabaseSync, hub: EventHub, port: number) {
  return async function handleRequest(request: Request): Promise<Response> {
    if (!validateHost(request.headers.get("host"), port)) {
      return jsonResponse(
        { error: { code: "invalid_host", message: "Request host is not allowed." } },
        403,
      );
    }

    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/v1/stream") {
      return sseResponse(db, hub);
    }

    if (url.pathname.startsWith("/v1/dashboard/")) {
      if (!isSameOriginDashboardRequest(request, port)) {
        return jsonResponse(
          { error: { code: "cross_origin", message: "Dashboard requests must be same-origin." } },
          403,
        );
      }
      if (request.method !== "GET") {
        return new Response(
          JSON.stringify({ error: { code: "method_not_allowed", message: "Use GET." } }),
          {
            status: 405,
            headers: {
              "content-type": "application/json; charset=utf-8",
              "cache-control": "no-store",
              allow: "GET",
            },
          },
        );
      }

      if (url.pathname === "/v1/dashboard/tasks") {
        const requestedStatus = url.searchParams.get("status");
        if (requestedStatus && !TASK_STATUSES.has(requestedStatus as TaskStatus)) {
          return jsonResponse(
            { error: { code: "invalid_status", message: "Status filter is invalid." } },
            400,
          );
        }
        const limitText = url.searchParams.get("limit");
        const limit = limitText === null ? 500 : Number(limitText);
        if (!Number.isInteger(limit) || limit < 1 || limit > 500) {
          return jsonResponse(
            { error: { code: "invalid_limit", message: "Limit must be between 1 and 500." } },
            400,
          );
        }
        const tasks = listTasks(db).filter(
          (task) => !requestedStatus || task.status === requestedStatus,
        );
        return jsonResponse({ tasks: tasks.slice(0, limit) });
      }

      if (url.pathname === "/v1/dashboard/stats") {
        const agents = listAgents(db).map((agent) => ({
          agent_id: agent.agent_id,
          agent_name: agent.display_name,
          stats: getTaskStats(db, agent.agent_id),
        }));
        return jsonResponse({ stats: { agents } });
      }

      const detailMatch = url.pathname.match(/^\/v1\/dashboard\/tasks\/([^/]+)\/([^/]+)$/);
      if (detailMatch) {
        let agentId: string;
        let taskId: string;
        try {
          agentId = decodeURIComponent(detailMatch[1]);
          taskId = decodeURIComponent(detailMatch[2]);
        } catch {
          return jsonResponse(
            { error: { code: "invalid_path", message: "Task identity is invalid." } },
            400,
          );
        }
        const task = getTaskDetail(db, taskId, agentId);
        return task
          ? jsonResponse({ task })
          : jsonResponse({ error: { code: "not_found", message: "Task was not found." } }, 404);
      }

      return jsonResponse(
        { error: { code: "not_found", message: "Dashboard route was not found." } },
        404,
      );
    }

    if (url.pathname.startsWith("/v1/settings/")) {
      if (!isSameOriginSettingsRequest(request, port)) {
        return jsonResponse(
          { error: { code: "cross_origin", message: "Settings requests must be same-origin." } },
          403,
        );
      }

      if (request.method === "GET" && url.pathname === "/v1/settings/agents") {
        return jsonResponse({ agents: listAgents(db) });
      }

      if (request.method === "POST" && url.pathname === "/v1/settings/agents") {
        if (!isJson(request)) {
          return jsonResponse(
            { error: { code: "invalid_content_type", message: "Use application/json." } },
            415,
          );
        }
        const input = await readJsonBody(request);
        if (!isAgentCreateInput(input)) {
          return jsonResponse(
            {
              error: {
                code: "invalid_agent",
                message: "Agent name must be 1 to 100 non-space characters.",
              },
            },
            400,
          );
        }
        return jsonResponse(issueAgentToken(db, input), 201);
      }

      const revokeMatch = url.pathname.match(/^\/v1\/settings\/tokens\/([^/]+)$/);
      if (request.method === "DELETE" && revokeMatch) {
        const tokenId = decodeURIComponent(revokeMatch[1]);
        const revoked = revokeAgentToken(db, tokenId);
        return revoked
          ? jsonResponse({ revoked: true })
          : jsonResponse({ error: { code: "not_found", message: "Token was not found." } }, 404);
      }

      if (request.method === "GET" && url.pathname === "/v1/settings/prices") {
        return jsonResponse({ prices: listModelPrices(db) });
      }

      if (request.method === "PUT" && url.pathname === "/v1/settings/prices") {
        if (!isJson(request)) {
          return jsonResponse(
            { error: { code: "invalid_content_type", message: "Use application/json." } },
            415,
          );
        }
        const input = await readJsonBody(request);
        if (!isModelPriceInput(input)) {
          return jsonResponse(
            {
              error: {
                code: "invalid_price",
                message: "Price input does not match the v1 schema.",
              },
            },
            400,
          );
        }
        setModelPrice(db, input);
        const price = listModelPrices(db).find((item) => item.model === input.model);
        return jsonResponse({ price });
      }

      const priceMatch = url.pathname.match(/^\/v1\/settings\/prices\/(.+)$/);
      if (request.method === "DELETE" && priceMatch) {
        const model = decodeURIComponent(priceMatch[1]);
        const deleted = deleteModelPrice(db, model);
        return deleted
          ? jsonResponse({ deleted: true })
          : jsonResponse(
              { error: { code: "not_found", message: "Model price was not found." } },
              404,
            );
      }

      return jsonResponse(
        { error: { code: "not_found", message: "Settings route was not found." } },
        404,
      );
    }

    if (
      request.method === "POST" &&
      (url.pathname === "/v1/events" || url.pathname === "/v1/mcp/events")
    ) {
      const principal = requestPrincipal(request, db);
      if (!principal) {
        return jsonResponse(
          { error: { code: "unauthorized", message: "A valid agent token is required." } },
          401,
        );
      }
      if (!isJson(request)) {
        return jsonResponse(
          { error: { code: "invalid_content_type", message: "Use application/json." } },
          415,
        );
      }

      let input: unknown;
      try {
        input = await request.json();
      } catch {
        return jsonResponse(
          { error: { code: "invalid_json", message: "Request body must be JSON." } },
          400,
        );
      }

      try {
        const result = ingestEvent(db, {
          principal,
          input: input as EventInput,
          source: url.pathname === "/v1/mcp/events" ? "mcp" : "rest",
          publish: (update) => hub.publish(update),
        });
        return jsonResponse(result, result.duplicate ? 200 : 201);
      } catch (error) {
        if (error instanceof EventInputError) {
          return jsonResponse(
            { error: { code: error.code, message: error.message, details: error.details } },
            error.code === "invalid_event" || error.code === "agent_mismatch" ? 400 : 500,
          );
        }
        return jsonResponse(
          { error: { code: "ingestion_failed", message: "Event could not be stored." } },
          500,
        );
      }
    }

    if (request.method === "GET" && url.pathname === "/v1/stats") {
      const principal = requestPrincipal(request, db);
      if (!principal) {
        return jsonResponse(
          { error: { code: "unauthorized", message: "A valid agent token is required." } },
          401,
        );
      }
      return jsonResponse({ stats: getTaskStats(db, principal.agent_id) });
    }

    if (
      request.method === "GET" &&
      (url.pathname === "/v1/tasks" || url.pathname.startsWith("/v1/tasks/"))
    ) {
      const principal = requestPrincipal(request, db);
      if (!principal) {
        return jsonResponse(
          { error: { code: "unauthorized", message: "A valid agent token is required." } },
          401,
        );
      }

      if (url.pathname === "/v1/tasks") {
        const requestedStatus = url.searchParams.get("status");
        if (requestedStatus && !TASK_STATUSES.has(requestedStatus as TaskStatus)) {
          return jsonResponse(
            { error: { code: "invalid_status", message: "Status filter is invalid." } },
            400,
          );
        }
        const limitText = url.searchParams.get("limit");
        const limit = limitText === null ? 100 : Number(limitText);
        if (!Number.isInteger(limit) || limit < 1 || limit > 500) {
          return jsonResponse(
            { error: { code: "invalid_limit", message: "Limit must be between 1 and 500." } },
            400,
          );
        }
        const tasks = listTasks(db, principal.agent_id).filter(
          (task) => !requestedStatus || task.status === requestedStatus,
        );
        return jsonResponse({ tasks: tasks.slice(0, limit) });
      }

      const taskId = decodeURIComponent(url.pathname.slice("/v1/tasks/".length));
      const task = getTaskDetail(db, taskId, principal.agent_id);
      return task
        ? jsonResponse({ task })
        : jsonResponse({ error: { code: "not_found", message: "Task was not found." } }, 404);
    }

    return jsonResponse({ error: { code: "not_found", message: "Route was not found." } }, 404);
  };
}
