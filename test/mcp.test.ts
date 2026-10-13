import assert from "node:assert/strict";
import test from "node:test";
import { createAgent } from "../server/auth/credentials.js";
import { openDatabase } from "../server/db/database.js";
import { EventHub } from "../server/events/event-hub.js";
import { createRequestHandler } from "../server/http/app.js";
import {
  createToolService,
  readTrackerConfig,
  TrackerError,
} from "../integrations/mcp/tool-service.js";

const port = 4317;

function createContext() {
  const db = openDatabase();
  const agent = createAgent(db, "MCP test agent");
  const handler = createRequestHandler(db, new EventHub(), port);
  const fetcher: typeof fetch = async (input, init) => {
    const request = new Request(input, init);
    const headers = new Headers(request.headers);
    headers.set("host", `127.0.0.1:${port}`);
    return handler(new Request(request, { headers }));
  };
  const service = createToolService(
    { baseUrl: new URL(`http://127.0.0.1:${port}`), token: agent.token },
    fetcher,
  );
  return { db, agent, service };
}

test("MCP tools and REST create the same task lifecycle through the shared event service", async () => {
  const mcp = createContext();
  const rest = createContext();
  try {
    const created = (await mcp.service.call("task_create", {
      title: "Shared lifecycle",
      model: "model-a",
    })) as {
      task_id: string;
    };
    await mcp.service.call("task_start", { task_id: created.task_id, step: "Inspect" });
    await mcp.service.call("task_update", {
      task_id: created.task_id,
      step: "Implement",
      progress: 0.5,
      tokens: { input: 12, output: 5 },
    });
    await mcp.service.call("task_complete", { task_id: created.task_id, summary: "Done" });

    const restTaskId = "123e4567-e89b-42d3-a456-426614174000";
    const restEvents = [
      { event: "task_queued", title: "Shared lifecycle", model: "model-a" },
      { event: "task_started", step: "Inspect" },
      {
        event: "task_progress",
        step: "Implement",
        progress: 0.5,
        tokens: { input: 12, output: 5 },
      },
      { event: "task_done", summary: "Done" },
    ];
    const restHandler = createRequestHandler(rest.db, new EventHub(), port);
    for (const fields of restEvents) {
      const response = await restHandler(
        new Request(`http://127.0.0.1:${port}/v1/events`, {
          method: "POST",
          headers: {
            host: `127.0.0.1:${port}`,
            authorization: `Bearer ${rest.agent.token}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            schema_version: 1,
            event_id: crypto.randomUUID(),
            task_id: restTaskId,
            ts: new Date().toISOString(),
            ...fields,
          }),
        }),
      );
      assert.equal(response.status, 201);
    }

    const mcpDetail = (await mcp.service.call("task_list", {})) as {
      tasks: Array<{ task_id: string; status: string }>;
    };
    const restDetail = rest.db
      .prepare("SELECT status FROM tasks WHERE task_id = ?")
      .get(restTaskId) as { status: string };
    assert.equal(mcpDetail.tasks[0]?.status, restDetail.status);
    assert.equal(restDetail.status, "done");
    const mcpHistory = mcp.db
      .prepare("SELECT event, source FROM events ORDER BY seq")
      .all() as Array<{ event: string; source: string }>;
    assert.deepEqual(
      mcpHistory.map(({ event }) => event),
      restEvents.map(({ event }) => event),
    );
    assert.ok(mcpHistory.every(({ source }) => source === "mcp"));
    assert.equal(mcp.db.prepare("SELECT count(*) AS count FROM events").get()?.count, 4);
  } finally {
    mcp.db.close();
    rest.db.close();
  }
});

test("bridge configuration rejects non-loopback trackers and missing credentials", () => {
  assert.throws(() => readTrackerConfig({}), TrackerError);
  assert.throws(
    () =>
      readTrackerConfig({
        AI_TASK_BOARD_URL: "https://example.com",
        AI_TASK_BOARD_TOKEN: "secret",
      }),
    TrackerError,
  );
  assert.throws(
    () =>
      readTrackerConfig({
        AI_TASK_BOARD_URL: "http://user:pass@127.0.0.1:4317",
        AI_TASK_BOARD_TOKEN: "secret",
      }),
    TrackerError,
  );
});

test("invalid arguments and an unavailable tracker fail without writing an event", async () => {
  const { db, service } = createContext();
  let writes = 0;
  const unavailable = createToolService(
    { baseUrl: new URL(`http://127.0.0.1:${port}`), token: "agent-token" },
    async () => {
      writes += 1;
      throw new TypeError("network unavailable");
    },
  );
  try {
    await assert.rejects(service.call("task_update", { task_id: "bad-id", step: "x" }));
    assert.equal(db.prepare("SELECT count(*) AS count FROM events").get()?.count, 0);
    await assert.rejects(
      unavailable.call("task_create", { title: "No write" }),
      /local tracker is unavailable/i,
    );
    assert.equal(writes, 1);
  } finally {
    db.close();
  }
});

test("MCP ingress authenticates and labels accepted history as MCP", async () => {
  const { db, agent } = createContext();
  const handler = createRequestHandler(db, new EventHub(), port);
  try {
    const input = {
      schema_version: 1,
      event_id: crypto.randomUUID(),
      event: "task_queued",
      task_id: crypto.randomUUID(),
      title: "Origin test",
    };
    const rejected = await handler(
      new Request(`http://127.0.0.1:${port}/v1/mcp/events`, {
        method: "POST",
        headers: { host: `127.0.0.1:${port}`, "content-type": "application/json" },
        body: JSON.stringify(input),
      }),
    );
    assert.equal(rejected.status, 401);
    const accepted = await handler(
      new Request(`http://127.0.0.1:${port}/v1/mcp/events`, {
        method: "POST",
        headers: {
          host: `127.0.0.1:${port}`,
          authorization: `Bearer ${agent.token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(input),
      }),
    );
    assert.equal(accepted.status, 201);
    assert.equal((await accepted.json()).event.source, "mcp");
  } finally {
    db.close();
  }
});
