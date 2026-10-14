import assert from "node:assert/strict";
import test from "node:test";
import {
  costEstimateLabel,
  elapsedLifetimeLabel,
  tokenUsageLabel,
} from "../server/events/task-display.js";
import type { TaskProjection } from "../server/types.js";

function task(overrides: Partial<TaskProjection> = {}): TaskProjection {
  return {
    agent_id: "agent-1",
    agent_name: "Agent one",
    task_id: "task-1",
    project_id: null,
    parent_id: null,
    model: "model-a",
    title: "Task",
    status: "done",
    attempt: 1,
    step: null,
    plan: null,
    progress: null,
    tokens_known: false,
    token_input: null,
    token_output: null,
    token_reset: false,
    first_event_at: null,
    updated_at: null,
    price_available: false,
    cost_estimate: null,
    tokens: null,
    ...overrides,
  };
}

test("elapsed labels preserve a real zero and mark unavailable or reversed timing", () => {
  assert.equal(
    elapsedLifetimeLabel(
      task({
        first_event_at: "2025-01-01T00:00:00.000Z",
        updated_at: "2025-01-01T00:00:00.000Z",
      }),
      Date.parse("2025-01-01T00:00:01.000Z"),
    ),
    "0s",
  );
  assert.equal(elapsedLifetimeLabel(task(), Date.now()), "Timing unavailable");
  assert.equal(
    elapsedLifetimeLabel(
      task({
        first_event_at: "2025-01-01T00:00:01.000Z",
        updated_at: "2025-01-01T00:00:00.000Z",
      }),
    ),
    "Timing unavailable",
  );
});

test("token and cost labels distinguish numeric zero from missing data", () => {
  const zeroUsage = task({
    tokens_known: true,
    tokens: { input: 0, output: 0 },
    price_available: true,
    cost_estimate: 0,
  });
  assert.equal(tokenUsageLabel(zeroUsage), "Reported input 0 · output 0");
  assert.equal(costEstimateLabel(zeroUsage), "Estimated cost 0 rate units");
  assert.equal(tokenUsageLabel(task()), "Tokens unavailable");
  assert.equal(costEstimateLabel(task()), "No price");
  assert.equal(
    costEstimateLabel(task({ tokens_known: true, tokens: { input: 0 }, price_available: true })),
    "Incomplete token usage",
  );
});
