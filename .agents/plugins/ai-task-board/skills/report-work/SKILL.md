---
name: report-work
description: Use the AI Task Board MCP tools to report meaningful task progress, blockers, and completion.
---

At the start of each task in the current workspace, call `project_register` with its display name and absolute local root path. Registration is idempotent for that path, so it is safe to repeat. The tracker stores a hash of the normalized path, never the path itself. Include the returned `project_id` on every `task_create` in this workspace so new tasks always appear under the selected project. If the workspace changes, register the new path before creating another task.

For meaningful repository work, create a task with `task_create` before implementation and start it with `task_start`. Report a concise step when the plan or phase changes. Use `task_block` when a decision or external prerequisite stops progress. Finish with `task_complete` or `task_fail`. Report metadata only; never include prompts, secrets, full responses, or source code. If the tracker is unavailable, continue the work and mention that once in the final report.
