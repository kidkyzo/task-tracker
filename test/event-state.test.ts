import assert from "node:assert/strict";
import test from "node:test";
import { deriveTasks } from "../server/events/derive-state.js";
import type { DerivableEvent, TaskState } from "../server/types.js";

const taskId = "01J9ZK2M2Q8R4T6V7W0X1Y2Z3A";
const agent = "codex-work";

function event(
  eventName: string,
  seq: number,
  second: number,
  fields: Partial<DerivableEvent> = {},
): DerivableEvent {
  return {
    agent,
    event_id: `00000000-0000-4000-8000-${String(seq).padStart(12, "0")}`,
    event: eventName,
    task_id: taskId,
    ts: `2026-10-13T09:30:${String(second).padStart(2, "0")}Z`,
    seq,
    ...fields,
  };
}

function task(events: DerivableEvent[]): TaskState {
  const result = deriveTasks(events)[0];
  assert.ok(result);
  return result;
}

test("derives queued, ongoing, blocked, resumed, and done states", () => {
  const events = [
    event("task_queued", 1, 0),
    event("task_started", 2, 1),
    event("task_blocked", 3, 2),
    event("task_progress", 4, 3),
    event("task_done", 5, 4),
  ];

  assert.equal(task(events).status, "done");
  assert.equal(task(events).attempt, 1);
  assert.equal(task(events).updated_at, "2026-10-13T09:30:04Z");
});

test("terminal states ignore later non-terminal events until a new start", () => {
  const result = task([
    event("task_queued", 1, 0),
    event("task_done", 2, 1),
    event("task_progress", 3, 2),
    event("task_started", 4, 3),
  ]);

  assert.equal(result.status, "ongoing");
  assert.equal(result.attempt, 2);
});

test("orders shuffled arrivals by timestamp then server sequence", () => {
  const events = [
    event("task_queued", 1, 0),
    event("task_started", 2, 1),
    event("task_blocked", 3, 2),
    event("task_progress", 4, 3),
    event("task_done", 5, 4),
  ];
  const expected = task(events);

  for (let index = 0; index < events.length; index += 1) {
    const shuffled = [...events].sort(
      (left, right) => ((left.seq * 7 + index) % 11) - ((right.seq * 7 + index) % 11),
    );
    assert.deepEqual(task(shuffled), expected);
  }
});

test("uses server sequence to break equal timestamps", () => {
  const first = event("task_started", 1, 0);
  const second = event("task_blocked", 2, 0);

  assert.equal(task([second, first]).status, "blocked");
});

test("deduplicates by agent and event id before deriving state", () => {
  const start = event("task_started", 1, 1);
  const conflictingRetry = { ...start, event: "task_failed", seq: 2 };

  assert.equal(task([start, conflictingRetry]).status, "ongoing");
});

test("keeps unknown events out of state derivation", () => {
  const result = task([
    event("future_event", 1, 0),
    event("task_started", 2, 1),
    event("future_event", 3, 2),
  ]);

  assert.equal(result.status, "ongoing");
  assert.equal(task([event("future_event", 1, 0)]).status, null);
});

test("scopes task state by authenticated agent and task id", () => {
  const events = [
    event("task_started", 1, 0),
    { ...event("task_failed", 2, 1), agent: "other-agent" },
  ];

  assert.deepEqual(
    deriveTasks(events).map(({ agent: taskAgent, status }) => [taskAgent, status]),
    [
      ["codex-work", "ongoing"],
      ["other-agent", "failed"],
    ],
  );
});
