# REST event API fallback

Use REST when the agent cannot connect to an MCP server. Start AI Task Board, create an agent in Settings, and supply its reveal-once token from the process environment. Never commit the token or include prompts, full responses, or source code in an event.

```sh
curl --fail-with-body \
  -H "Authorization: Bearer ${AI_TASK_BOARD_TOKEN}" \
  -H "Content-Type: application/json" \
  -X POST http://127.0.0.1:4317/v1/events \
  --data '{
    "schema_version": 1,
    "event_id": "123e4567-e89b-42d3-a456-426614174000",
    "event": "task_queued",
    "task_id": "123e4567-e89b-42d3-a456-426614174001",
    "title": "Review the migration",
    "model": "example-model",
    "ts": "2026-10-13T12:00:00.000Z"
  }'
```

Generate a fresh UUID for each event and keep the same `event_id` when retrying it. Reuse the task's `task_id` for later events. See `schema/v1/event-input.schema.json` and its valid/invalid examples for the complete contract. REST and MCP share validation, idempotency, ordering, and persistence rules.
