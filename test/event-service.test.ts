import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import type { DatabaseSync } from "node:sqlite";
import { createAgent } from "../server/auth/credentials.js";
import { openDatabase } from "../server/db/database.js";
import { EventInputError, ingestEvent } from "../server/events/event-service.js";
import type { EventInput, IngestResult, TokenReport } from "../server/types.js";

function makeContext() {
  const db = openDatabase();
  const created = createAgent(db, "Service test agent");
  return { db, principal: created.agent };
}

function eventCount(db: DatabaseSync): number {
  return (db.prepare("SELECT count(*) AS count FROM events").get() as { count: number }).count;
}

function event(eventName: string, fields: Partial<EventInput> = {}): EventInput {
  return { event_id: randomUUID(), event: eventName, task_id: randomUUID(), ...fields };
}

function assertAccepted(
  result: IngestResult,
): asserts result is Extract<IngestResult, { duplicate: false }> {
  assert.equal(result.duplicate, false);
}

test("validates, stores, derives, and publishes an inferred-timestamp event", () => {
  const { db, principal } = makeContext();
  let published = 0;
  try {
    const result = ingestEvent(db, {
      principal,
      source: "rest",
      input: event("task_queued", { title: "Build shared service" }),
      now: () => new Date("2026-10-13T10:00:00.000Z"),
      publish: () => {
        published += 1;
      },
    });

    assertAccepted(result);
    assert.equal(result.event.ts, "2026-10-13T10:00:00.000Z");
    assert.equal(result.event.ts_inferred, true);
    assert.equal(result.task.status, "queued");
    assert.equal(result.task.title, "Build shared service");
    assert.equal(published, 1);
    assert.equal(eventCount(db), 1);
  } finally {
    db.close();
  }
});

test("duplicate event IDs are no-ops and do not publish twice", () => {
  const { db, principal } = makeContext();
  const input = event("task_queued");
  let published = 0;
  const options: Parameters<typeof ingestEvent>[1] = {
    principal,
    source: "mcp",
    input,
    publish: () => {
      published += 1;
    },
  };
  try {
    const first = ingestEvent(db, options);
    const repeated = ingestEvent(db, {
      ...options,
      input: { ...input, event: "task_failed", error: "conflicting retry body" },
    });

    assertAccepted(first);
    assert.equal(repeated.duplicate, true);
    assert.ok(repeated.duplicate);
    assert.equal(repeated.seq, first.event.seq);
    assert.equal(published, 1);
    assert.equal(eventCount(db), 1);
    assert.equal(
      (db.prepare("SELECT status FROM tasks").get() as { status: string }).status,
      "queued",
    );
  } finally {
    db.close();
  }
});

test("late events rebuild the task projection and retain their ordered attempt", () => {
  const { db, principal } = makeContext();
  const taskId = randomUUID();
  const send = (name: string, time: string) =>
    ingestEvent(db, {
      principal,
      source: "rest",
      input: event(name, { task_id: taskId, ts: time }),
    });
  try {
    send("task_queued", "2026-10-13T10:00:00Z");
    send("task_started", "2026-10-13T10:01:00Z");
    send("task_done", "2026-10-13T10:02:00Z");
    send("task_started", "2026-10-13T10:03:00Z");
    const late = send("task_progress", "2026-10-13T10:01:30Z");
    assertAccepted(late);

    const history = db
      .prepare("SELECT event, ts, attempt FROM events WHERE task_id = ? ORDER BY ts, seq")
      .all(taskId) as { event: string; ts: string; attempt: number }[];
    const projection = db
      .prepare("SELECT status, attempt FROM tasks WHERE task_id = ?")
      .get(taskId) as { status: string; attempt: number } | undefined;
    assert.ok(projection);

    assert.equal(late.event.attempt, 1);
    assert.deepEqual(
      history.map(({ event: name }) => name),
      ["task_queued", "task_started", "task_progress", "task_done", "task_started"],
    );
    assert.equal(projection.status, "ongoing");
    assert.equal(projection.attempt, 2);
  } finally {
    db.close();
  }
});

test("cumulative usage replaces prior reports and marks decreases as resets", () => {
  const { db, principal } = makeContext();
  const taskId = randomUUID();
  const send = (time: string, tokens?: TokenReport) =>
    ingestEvent(db, {
      principal,
      source: "rest",
      input: event("task_progress", { task_id: taskId, ts: time, ...(tokens ? { tokens } : {}) }),
    });
  try {
    send("2026-10-13T10:00:00Z", { input: 100, output: 20 });
    const reset = send("2026-10-13T10:01:00Z", { input: 80, output: 25 });
    const laterWithoutUsage = send("2026-10-13T10:02:00Z");
    assertAccepted(reset);
    assertAccepted(laterWithoutUsage);
    const projection = db.prepare("SELECT * FROM tasks WHERE task_id = ?").get(taskId) as
      { token_input: number; token_output: number; token_reset: number } | undefined;
    assert.ok(projection);
    const taskWithNoUsageId = randomUUID();
    ingestEvent(db, {
      principal,
      source: "rest",
      input: event("task_queued", { task_id: taskWithNoUsageId }),
    });
    const unknownUsage = db
      .prepare("SELECT tokens_known, token_input, token_output FROM tasks WHERE task_id = ?")
      .get(taskWithNoUsageId) as
      { tokens_known: number; token_input: number | null; token_output: number | null } | undefined;
    assert.ok(unknownUsage);

    assert.equal(reset.event.token_reset, true);
    assert.equal(laterWithoutUsage.event.token_reset, false);
    assert.equal(projection.token_input, 80);
    assert.equal(projection.token_output, 25);
    assert.equal(projection.token_reset, 1);
    assert.deepEqual(
      { ...unknownUsage },
      { tokens_known: 0, token_input: null, token_output: null },
    );
  } finally {
    db.close();
  }
});

test("rejects a payload that names a different authenticated agent", () => {
  const { db, principal } = makeContext();
  try {
    assert.throws(
      () =>
        ingestEvent(db, {
          principal,
          source: "rest",
          input: event("task_queued", { agent: randomUUID() }),
        }),
      (error) => error instanceof EventInputError && error.code === "agent_mismatch",
    );
    assert.equal(eventCount(db), 0);
  } finally {
    db.close();
  }
});

test("stores an unknown event without assigning task state", () => {
  const { db, principal } = makeContext();
  try {
    const result = ingestEvent(db, {
      principal,
      source: "rest",
      input: event("future_signal"),
    });

    assertAccepted(result);
    assert.equal(result.event.event, "future_signal");
    assert.equal(result.task.status, null);
    assert.equal(eventCount(db), 1);
  } finally {
    db.close();
  }
});

test("rejects invalid input before writing", () => {
  const { db, principal } = makeContext();
  try {
    assert.throws(
      () =>
        ingestEvent(db, {
          principal,
          source: "rest",
          input: { ...event("task_progress"), step: "" },
        }),
      (error) => error instanceof EventInputError && error.code === "invalid_event",
    );
    assert.equal(eventCount(db), 0);
  } finally {
    db.close();
  }
});
