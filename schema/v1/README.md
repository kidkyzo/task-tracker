# AI Task Board v1 schema

The v1 contract is confirmed in PRD section 6. `event-input.schema.json` validates client input. `event.schema.json` describes the normalized stored record. MCP tool input schemas are in `tools/`.

## Normalization rules

- Task identity is `(agent, task_id)`; the authenticated credential determines `agent`.
- Event IDs are UUIDs or ULIDs and are idempotent on `(agent, event_id)`.
- A missing input `ts` is replaced by server receive time and stored with `ts_inferred: true`. Stored events always have `ts`.
- The server assigns `source`, `seq`, and `attempt`. `source` identifies the ingress (`mcp`, `rest`, or a named adapter) and is not client-controlled.
- State is re-derived in `ts`, then `seq` order. `task_done` and `task_failed` are terminal. A later `task_started` begins a new attempt; other later non-terminal events remain in history without changing state.
- `task_blocked` resumes on `task_progress` or `task_started`. Blocked tasks are exempt from stale alerts.
- Token values are cumulative per task. A new reported value replaces the prior one; decreases are recorded as resets. Missing usage remains unknown and is never treated as zero.
- A token object must report at least one count. If only `input` or `output` is present, the other component remains unknown.
- Unknown event names are accepted for history and ignored by state derivation.
- `project_id` is optional on task creation; when supplied, it must reference a registered local project. It groups tasks in the project board and is preserved on the task projection; moving a task in the dashboard changes its assignment without rewriting event history.
- `project_register` identifies a Codex project by a SHA-256 hash of its normalized absolute root path. The raw path is used only for registration and is not stored or logged.
- Values are metadata only. Do not store prompts, full responses, or source code.

`examples.json` contains valid and invalid examples for the event input and every MCP tool input schema.
