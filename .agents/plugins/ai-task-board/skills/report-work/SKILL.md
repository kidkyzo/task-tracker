---
name: report-work
description: Use the AI Task Board MCP tools to report meaningful task progress, blockers, and completion.
---

For meaningful repository work, create a task with `task_create` before implementation and start it with `task_start`. Report a concise step when the plan or phase changes. Use `task_block` when a decision or external prerequisite stops progress. Finish with `task_complete` or `task_fail`. Report metadata only; never include prompts, secrets, full responses, or source code. If the tracker is unavailable, continue the work and mention that once in the final report.
