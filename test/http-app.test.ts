import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { createAgent } from "../server/auth/credentials.js";
import { openDatabase } from "../server/db/database.js";
import { EventHub } from "../server/events/event-hub.js";
import { createRequestHandler } from "../server/http/app.js";
import { createNextRouteHandler } from "../server/http/next-route-adapter.js";
import type { EventInput } from "../server/types.js";

const port = 4317;

function makeContext() {
  const db = openDatabase();
  const first = createAgent(db, "First agent");
  const second = createAgent(db, "Second agent");
  const hub = new EventHub();
  const handler = createRequestHandler(db, hub, port);
  return { db, first, second, hub, handler };
}

function makeRequest(
  path: string,
  options: { method?: string; token?: string; host?: string; body?: unknown } = {},
): Request {
  const headers = new Headers({ host: options.host ?? `127.0.0.1:${port}` });
  if (options.token) headers.set("authorization", `Bearer ${options.token}`);
  if (options.body !== undefined) headers.set("content-type", "application/json");
  return new Request(`http://127.0.0.1:${port}${path}`, {
    method: options.method ?? "GET",
    headers,
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
  });
}

function eventInput(taskId: string = randomUUID()): EventInput {
  return {
    event_id: randomUUID(),
    event: "task_queued",
    task_id: taskId,
    title: "HTTP task",
  };
}

test("rejects disallowed Host headers before serving API data", async () => {
  const { db, handler } = makeContext();
  try {
    const response = await handler(
      makeRequest("/health", { host: "attacker.example", token: "not-used" }),
    );
    assert.equal(response.status, 403);
    assert.equal(response.headers.get("access-control-allow-origin"), null);
  } finally {
    db.close();
  }
});

test("Next route adapter delegates API requests and enforces the request body limit", async () => {
  const { db } = makeContext();
  try {
    const route = createNextRouteHandler(db, new EventHub(), port);
    const response = await route(makeRequest("/v1/dashboard/tasks"));
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { tasks: [] });
    assert.equal(response.headers.get("cache-control"), "no-store");

    const oversized = await route(
      new Request(`http://127.0.0.1:${port}/v1/events`, {
        method: "POST",
        headers: { host: `127.0.0.1:${port}`, "content-type": "application/json" },
        body: "x".repeat(65 * 1024),
      }),
    );
    assert.equal(oversized.status, 413);
    assert.deepEqual(await oversized.json(), {
      error: { code: "body_too_large", message: "Request body exceeds 64 KiB." },
    });
  } finally {
    db.close();
  }
});

test("authenticates REST event writes and publishes only accepted events", async () => {
  const { db, first, hub, handler } = makeContext();
  let updates = 0;
  const unsubscribe = hub.subscribe(() => {
    updates += 1;
  });
  try {
    const response = await handler(
      makeRequest("/v1/events", {
        method: "POST",
        token: first.token,
        body: eventInput(),
      }),
    );
    const body = (await response.json()) as { event: { source: string }; task: { status: string } };

    assert.equal(response.status, 201);
    assert.equal(body.event.source, "rest");
    assert.equal(body.task.status, "queued");
    assert.equal(updates, 1);
  } finally {
    unsubscribe();
    db.close();
  }
});

test("rejects invalid tokens without writing or leaking task data", async () => {
  const { db, handler } = makeContext();
  try {
    const response = await handler(
      makeRequest("/v1/events", {
        method: "POST",
        token: "invalid-token",
        body: eventInput(),
      }),
    );
    assert.equal(response.status, 401);
    assert.equal((await response.json()).error.code, "unauthorized");
    assert.equal(
      (db.prepare("SELECT count(*) AS count FROM events").get() as { count: number }).count,
      0,
    );
  } finally {
    db.close();
  }
});

test("an authenticated agent cannot submit an event for another agent", async () => {
  const { db, first, second, handler } = makeContext();
  try {
    const response = await handler(
      makeRequest("/v1/events", {
        method: "POST",
        token: first.token,
        body: { ...eventInput(), agent: second.agent.agent_id },
      }),
    );
    assert.equal(response.status, 400);
    assert.equal(
      (db.prepare("SELECT count(*) AS count FROM events").get() as { count: number }).count,
      0,
    );
  } finally {
    db.close();
  }
});

test("REST task list and detail responses are scoped to the authenticated agent", async () => {
  const { db, first, second, handler } = makeContext();
  try {
    const firstTask = eventInput();
    const secondTask = eventInput();
    for (const [token, input] of [
      [first.token, firstTask],
      [second.token, secondTask],
    ] as const) {
      await handler(makeRequest("/v1/events", { method: "POST", token, body: input }));
    }

    const listResponse = await handler(makeRequest("/v1/tasks", { token: first.token }));
    const list = (await listResponse.json()) as { tasks: Array<{ task_id: string }> };
    assert.deepEqual(
      list.tasks.map(({ task_id }) => task_id),
      [firstTask.task_id],
    );

    const hiddenDetail = await handler(
      makeRequest(`/v1/tasks/${secondTask.task_id}`, { token: first.token }),
    );
    assert.equal(hiddenDetail.status, 404);
  } finally {
    db.close();
  }
});

test("dashboard read routes return global task data without credentials and stay read-only", async () => {
  const { db, first, second, handler } = makeContext();
  try {
    const sharedTaskId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    for (const token of [first.token, second.token]) {
      await handler(
        makeRequest("/v1/events", {
          method: "POST",
          token,
          body: {
            ...eventInput(sharedTaskId),
            title: "Shared task id",
            ts: "2025-01-01T00:00:00.000Z",
          },
        }),
      );
    }
    for (const [event, ts] of [
      ["task_done", "2025-01-01T00:00:01.000Z"],
      ["task_started", "2025-01-01T00:00:02.000Z"],
    ] as const) {
      await handler(
        makeRequest("/v1/events", {
          method: "POST",
          token: first.token,
          body: { ...eventInput(sharedTaskId), event, ts },
        }),
      );
    }

    const before = (db.prepare("SELECT count(*) AS count FROM events").get() as { count: number })
      .count;
    const headers = new Headers({
      host: `127.0.0.1:${port}`,
      origin: `http://127.0.0.1:${port}`,
    });
    const listResponse = await handler(
      new Request(`http://127.0.0.1:${port}/v1/dashboard/tasks`, { headers }),
    );
    const list = (await listResponse.json()) as {
      tasks: Array<{ agent_id: string; task_id: string }>;
    };
    assert.equal(listResponse.status, 200);
    assert.equal(listResponse.headers.get("access-control-allow-origin"), null);
    assert.equal(list.tasks.length, 2);
    assert.deepEqual(
      list.tasks.map(({ agent_id }) => agent_id).sort(),
      [first.agent.agent_id, second.agent.agent_id].sort(),
    );

    const detailResponse = await handler(
      new Request(
        `http://127.0.0.1:${port}/v1/dashboard/tasks/${first.agent.agent_id}/${sharedTaskId}`,
        { headers },
      ),
    );
    const detail = (await detailResponse.json()) as {
      task: { agent_id: string; events: Array<{ attempt: number }> };
    };
    assert.equal(detail.task.agent_id, first.agent.agent_id);
    assert.deepEqual(
      detail.task.events.map(({ attempt }) => attempt),
      [1, 1, 2],
    );

    const statsResponse = await handler(
      new Request(`http://127.0.0.1:${port}/v1/dashboard/stats`, { headers }),
    );
    const stats = (await statsResponse.json()) as {
      stats: { agents: Array<{ agent_id: string }> };
    };
    assert.deepEqual(
      stats.stats.agents.map(({ agent_id }) => agent_id).sort(),
      [first.agent.agent_id, second.agent.agent_id].sort(),
    );

    const after = (db.prepare("SELECT count(*) AS count FROM events").get() as { count: number })
      .count;
    assert.equal(after, before);
  } finally {
    db.close();
  }
});

test("dashboard read routes reject cross-origin and non-GET requests", async () => {
  const { db, handler } = makeContext();
  try {
    const crossOrigin = await handler(
      new Request(`http://127.0.0.1:${port}/v1/dashboard/tasks`, {
        headers: {
          host: `127.0.0.1:${port}`,
          origin: "http://attacker.example",
          "sec-fetch-site": "cross-site",
        },
      }),
    );
    assert.equal(crossOrigin.status, 403);

    const hostOriginMismatch = await handler(
      new Request(`http://127.0.0.1:${port}/v1/dashboard/tasks`, {
        headers: {
          host: `127.0.0.1:${port}`,
          origin: `http://localhost:${port}`,
        },
      }),
    );
    assert.equal(hostOriginMismatch.status, 403);

    const mutation = await handler(
      makeRequest("/v1/dashboard/tasks", { method: "POST", body: { task_id: "ignored" } }),
    );
    assert.equal(mutation.status, 405);
    assert.equal(mutation.headers.get("allow"), "GET");
    assert.equal(
      (db.prepare("SELECT count(*) AS count FROM events").get() as { count: number }).count,
      0,
    );
  } finally {
    db.close();
  }
});

test("SSE streams its local snapshot and accepted task updates", async () => {
  const { db, first, handler } = makeContext();
  try {
    const response = await handler(makeRequest("/v1/stream"));
    assert.equal(response.headers.get("content-type"), "text/event-stream; charset=utf-8");
    assert.equal(response.headers.get("access-control-allow-origin"), null);
    const reader = response.body?.getReader();
    assert.ok(reader);
    const firstChunk = await reader.read();
    assert.equal(new TextDecoder().decode(firstChunk.value), "event: snapshot\ndata: []\n\n");

    const accepted = await handler(
      makeRequest("/v1/events", {
        method: "POST",
        token: first.token,
        body: eventInput(),
      }),
    );
    assert.equal(accepted.status, 201);
    const updateChunk = await reader.read();
    const updateFrame = new TextDecoder().decode(updateChunk.value);
    assert.match(updateFrame, /^event: task\.updated\ndata:/);
    const update = JSON.parse(updateFrame.split("data: ")[1] ?? "{}") as {
      task: { agent_name: string };
    };
    assert.equal(update.task.agent_name, "First agent");
    await reader.cancel();
  } finally {
    db.close();
  }
});

test("settings reveals a credential once, lists metadata, and revokes it", async () => {
  const { db, handler } = makeContext();
  try {
    const createResponse = await handler(
      makeRequest("/v1/settings/agents", {
        method: "POST",
        body: { display_name: "New local agent" },
      }),
    );
    const created = (await createResponse.json()) as {
      agent: { agent_id: string };
      token_id: string;
      token: string;
    };
    assert.equal(createResponse.status, 201);
    assert.ok(created.token);

    const listResponse = await handler(makeRequest("/v1/settings/agents"));
    const listText = await listResponse.text();
    assert.match(listText, new RegExp(created.agent.agent_id));
    assert.doesNotMatch(listText, new RegExp(created.token));
    assert.doesNotMatch(listText, /token_hash/);

    const revokeResponse = await handler(
      makeRequest(`/v1/settings/tokens/${created.token_id}`, { method: "DELETE" }),
    );
    assert.equal(revokeResponse.status, 200);
    const writeResponse = await handler(
      makeRequest("/v1/events", {
        method: "POST",
        token: created.token,
        body: eventInput(),
      }),
    );
    assert.equal(writeResponse.status, 401);
  } finally {
    db.close();
  }
});

test("settings rejects cross-origin writes and validates model prices", async () => {
  const { db, handler } = makeContext();
  try {
    const crossOriginHeaders = new Headers({
      host: `127.0.0.1:${port}`,
      origin: "http://attacker.example",
      "sec-fetch-site": "cross-site",
      "content-type": "application/json",
    });
    const crossOrigin = await handler(
      new Request(`http://127.0.0.1:${port}/v1/settings/agents`, {
        method: "POST",
        headers: crossOriginHeaders,
        body: JSON.stringify({ display_name: "Blocked agent" }),
      }),
    );
    assert.equal(crossOrigin.status, 403);

    const invalidPrice = await handler(
      makeRequest("/v1/settings/prices", {
        method: "PUT",
        body: { model: "model-x", input_per_million: -1, output_per_million: 2 },
      }),
    );
    assert.equal(invalidPrice.status, 400);

    const savedPrice = await handler(
      makeRequest("/v1/settings/prices", {
        method: "PUT",
        body: { model: "model-x", input_per_million: 2, output_per_million: 4 },
      }),
    );
    assert.equal(savedPrice.status, 200);
    assert.equal(
      (db.prepare("SELECT count(*) AS count FROM prices").get() as { count: number }).count,
      1,
    );
  } finally {
    db.close();
  }
});

test("stats keep token totals and estimates scoped and mark missing values unknown", async () => {
  const { db, first, second, handler } = makeContext();
  try {
    await handler(
      makeRequest("/v1/settings/prices", {
        method: "PUT",
        body: { model: "priced-model", input_per_million: 2, output_per_million: 4 },
      }),
    );

    const pricedTask = {
      ...eventInput(),
      event: "task_progress",
      model: "priced-model",
      tokens: { input: 100, output: 50 },
    };
    const unavailableTask = {
      ...eventInput(),
      event: "task_queued",
      model: "unpriced-model",
    };
    await handler(
      makeRequest("/v1/events", { method: "POST", token: first.token, body: pricedTask }),
    );
    await handler(
      makeRequest("/v1/events", { method: "POST", token: first.token, body: unavailableTask }),
    );
    await handler(
      makeRequest("/v1/events", {
        method: "POST",
        token: second.token,
        body: { ...eventInput(), tokens: { input: 999, output: 999 } },
      }),
    );

    const response = await handler(makeRequest("/v1/stats", { token: first.token }));
    const result = (await response.json()) as {
      stats: {
        task_count: number;
        tokens_unavailable: number;
        by_model: Array<{
          model: string | null;
          input_tokens: number | null;
          output_tokens: number | null;
          cost_estimate: number | null;
          price_available: boolean;
        }>;
      };
    };
    const priced = result.stats.by_model.find(({ model }) => model === "priced-model");
    const unpriced = result.stats.by_model.find(({ model }) => model === "unpriced-model");

    assert.equal(response.status, 200);
    assert.equal(result.stats.task_count, 2);
    assert.equal(result.stats.tokens_unavailable, 1);
    assert.deepEqual(
      priced && [priced.input_tokens, priced.output_tokens, priced.cost_estimate],
      [100, 50, 0.0004],
    );
    assert.deepEqual(
      unpriced && [unpriced.input_tokens, unpriced.output_tokens, unpriced.price_available],
      [null, null, false],
    );
  } finally {
    db.close();
  }
});

test("dashboard task metrics preserve zero values and mark missing usage or prices unavailable", async () => {
  const { db, first, handler } = makeContext();
  try {
    for (const price of [
      { model: "zero-rate", input_per_million: 0, output_per_million: 0 },
      { model: "paid-rate", input_per_million: 2, output_per_million: 4 },
    ]) {
      const response = await handler(
        makeRequest("/v1/settings/prices", { method: "PUT", body: price }),
      );
      assert.equal(response.status, 200);
    }

    const zeroTaskId = randomUUID();
    const firstEventResponse = await handler(
      makeRequest("/v1/events", {
        method: "POST",
        token: first.token,
        body: {
          ...eventInput(zeroTaskId),
          event: "future_note",
          ts: "2025-01-01T01:00:00.000+01:00",
        },
      }),
    );
    assert.equal(firstEventResponse.status, 201);
    const zeroResponse = await handler(
      makeRequest("/v1/events", {
        method: "POST",
        token: first.token,
        body: {
          ...eventInput(zeroTaskId),
          event: "task_progress",
          model: "zero-rate",
          tokens: { input: 0, output: 0 },
          ts: "2025-01-01T00:00:01.000Z",
        },
      }),
    );
    const zeroResult = (await zeroResponse.json()) as {
      task: { cost_estimate: number | null; price_available: boolean };
    };
    assert.equal(zeroResult.task.price_available, true);
    assert.equal(zeroResult.task.cost_estimate, 0);

    const estimates = [
      {
        task_id: randomUUID(),
        model: "paid-rate",
        tokens: { input: 100, output: 50 },
        event: "task_progress",
      },
      { task_id: randomUUID(), model: "paid-rate", tokens: undefined, event: "task_queued" },
      {
        task_id: randomUUID(),
        model: "unpriced-rate",
        tokens: { input: 10, output: 10 },
        event: "task_progress",
      },
      {
        task_id: randomUUID(),
        model: "paid-rate",
        tokens: { input: 0 },
        event: "task_progress",
      },
    ] as const;
    for (const [index, item] of estimates.entries()) {
      const response = await handler(
        makeRequest("/v1/events", {
          method: "POST",
          token: first.token,
          body: {
            ...eventInput(item.task_id),
            event: item.event,
            model: item.model,
            ...(item.tokens === undefined ? {} : { tokens: item.tokens }),
            ts: `2025-01-01T00:00:${String(index + 2).padStart(2, "0")}.000Z`,
          },
        }),
      );
      assert.equal(response.status, 201);
    }

    const taskListResponse = await handler(makeRequest("/v1/dashboard/tasks"));
    const taskList = (await taskListResponse.json()) as {
      tasks: Array<{
        task_id: string;
        first_event_at: string | null;
        updated_at: string | null;
        tokens_known: boolean;
        tokens: { input?: number; output?: number } | null;
        price_available: boolean;
        cost_estimate: number | null;
      }>;
    };
    const byId = new Map(taskList.tasks.map((task) => [task.task_id, task]));
    const zeroTask = byId.get(zeroTaskId);
    const pricedTask = estimates[0] ? byId.get(estimates[0].task_id) : undefined;
    const noUsageTask = estimates[1] ? byId.get(estimates[1].task_id) : undefined;
    const noPriceTask = estimates[2] ? byId.get(estimates[2].task_id) : undefined;
    const partialTask = estimates[3] ? byId.get(estimates[3].task_id) : undefined;

    assert.deepEqual(
      zeroTask && [zeroTask.tokens?.input, zeroTask.tokens?.output, zeroTask.cost_estimate],
      [0, 0, 0],
    );
    assert.deepEqual(zeroTask && [zeroTask.first_event_at, zeroTask.updated_at], [
      "2025-01-01T01:00:00.000+01:00",
      "2025-01-01T00:00:01.000Z",
    ]);
    assert.deepEqual(pricedTask && [pricedTask.price_available, pricedTask.cost_estimate], [
      true,
      0.0004,
    ]);
    assert.deepEqual(
      noUsageTask && [
        noUsageTask.tokens_known,
        noUsageTask.price_available,
        noUsageTask.cost_estimate,
      ],
      [false, true, null],
    );
    assert.deepEqual(
      noPriceTask && [
        noPriceTask.tokens_known,
        noPriceTask.price_available,
        noPriceTask.cost_estimate,
      ],
      [true, false, null],
    );
    assert.deepEqual(
      partialTask && [
        partialTask.tokens?.input,
        partialTask.tokens?.output,
        partialTask.cost_estimate,
      ],
      [0, undefined, null],
    );
  } finally {
    db.close();
  }
});
