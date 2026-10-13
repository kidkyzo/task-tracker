import type { DerivableEvent, TaskState } from "../types.js";

const KNOWN_EVENTS = new Set([
  "task_queued",
  "task_started",
  "task_progress",
  "task_blocked",
  "task_done",
  "task_failed",
]);

const TERMINAL_STATES = new Set<string>(["done", "failed"]);

function eventKey(event: DerivableEvent): string {
  return `${event.agent}\u0000${event.event_id}`;
}

function taskKey(event: DerivableEvent): string {
  return `${event.agent}\u0000${event.task_id}`;
}

function compareEvents(left: DerivableEvent, right: DerivableEvent): number {
  const timeDifference = Date.parse(left.ts) - Date.parse(right.ts);
  return timeDifference || left.seq - right.seq;
}

function deriveGroup(events: DerivableEvent[]): TaskState {
  const ordered = [...events].sort(compareEvents);
  const task: TaskState = {
    agent: ordered[0].agent,
    task_id: ordered[0].task_id,
    status: null,
    attempt: 0,
    updated_at: null,
  };

  for (const event of ordered) {
    if (!KNOWN_EVENTS.has(event.event)) continue;

    if (task.status !== null && TERMINAL_STATES.has(task.status)) {
      if (event.event !== "task_started") continue;
      task.attempt += 1;
      task.status = "ongoing";
      task.updated_at = event.ts;
      continue;
    }

    if (task.attempt === 0) task.attempt = 1;

    switch (event.event) {
      case "task_queued":
        if (task.status === null) task.status = "queued";
        break;
      case "task_started":
      case "task_progress":
        task.status = "ongoing";
        break;
      case "task_blocked":
        task.status = "blocked";
        break;
      case "task_done":
        task.status = "done";
        break;
      case "task_failed":
        task.status = "failed";
        break;
    }

    task.updated_at = event.ts;
  }

  return task;
}

export function deriveTasks(events: DerivableEvent[]): TaskState[] {
  const uniqueEvents: DerivableEvent[] = [];
  const seenEventIds = new Set();

  for (const event of events) {
    const id = eventKey(event);
    if (seenEventIds.has(id)) continue;
    seenEventIds.add(id);
    uniqueEvents.push(event);
  }

  const groups = new Map<string, DerivableEvent[]>();
  for (const event of uniqueEvents) {
    const id = taskKey(event);
    const group = groups.get(id) ?? [];
    group.push(event);
    groups.set(id, group);
  }

  return [...groups.values()]
    .map(deriveGroup)
    .sort(
      (left, right) =>
        left.agent.localeCompare(right.agent) || left.task_id.localeCompare(right.task_id),
    );
}
