# PRD: AI Task Board

Draft v0.6, October 13, 2026. This PRD defines the AI Task Board product for a fresh application build; there is no earlier application or database to migrate. The active development plan is [`docs/rebuild-plan.md`](docs/rebuild-plan.md). Agent instructions for this repository are in [`AGENTS.md`](AGENTS.md).

## What changed in v0.3

- Phase 0 confirmed the section 6 event-contract proposals (event IDs, idempotency, ordering, terminal states, token semantics) as the v1 contract on October 13, 2026.
- Section 7 records the confirmed initial local transport (stdio bridge first, loopback HTTP later).
- Two requirements added: event source labels (F16) and blocked tasks exempt from stale alerts (F17).
- Section 16 added: a decision log separating decided, proposed, and open items.
- Product decisions from v0.2 are unchanged: MCP-first, REST fallback, local-only, and no use of Codex `notify`.

## What changed in v0.4

- Replaced the earlier prototype-rebuild framing with a fresh application build; there is no legacy application or database migration in scope.
- The v1 event contract, local credential flow, and initial stdio transport decisions remain confirmed.
- The active development plan is now `docs/rebuild-plan.md`; it records completed discovery and the remaining implementation tasks.

## What changed in v0.5

- The user selected Next.js App Router with React and TypeScript as the application stack. Next owns the local dashboard, REST API, Settings, and SSE on one loopback origin; shared Node.js services continue to own validation, authorization, and persistence.

## What changed in v0.6

- The user selected Next.js App Router with React and TypeScript to make dashboard development easier.
- The app remains local-only. Next.js dev and production servers must bind to `127.0.0.1`, and repository launchers must disable telemetry without modifying global settings.
- The existing event contract, shared event service, SQLite storage, MCP transport, REST API, and SSE behavior remain unchanged during the framework migration.

## What changed in v0.7

- Codex setup now uses a repository-scoped marketplace plugin for the local MCP bridge and task-reporting workflow.
- Added browser-local project organization: users select a project from an index to open its task board, move tasks between projects, and see per-status counts without changing task events or database records.
- Corrected the task history dialog layout and close control so the dialog remains centered, bounded by the viewport, and usable on small screens.

## 1. Summary

AI Task Board is a local dashboard for tracking work reported by AI agents. Agents interact with the board through a shared MCP server and a small set of task tools. The server stores task events and serves a real-time Kanban board, task history, token summaries, estimated cost, and stale-task alerts. A shared REST event API remains available for agents and scripts that do not support MCP.

The MVP runs on the user's machine and listens on loopback. It does not run or orchestrate agents. Agent-native hooks or protocol adapters may mirror planning and lifecycle updates when an agent exposes a reliable supported signal. Codex's global `notify` setting is explicitly out of scope: the tracker must never generate instructions that replace or modify it.

## 2. Problem

People running several AI agents have no reliable shared view of who is working on what, what is blocked, and what has finished. Task state and usage data are spread across agent-specific interfaces. A common board should let agents report useful progress without requiring a different dashboard integration for every framework.

## 3. Goals and Non-Goals

**MVP goals**

- Show agent tasks in a live board with queued, ongoing, blocked, done, and failed states.
- Let MCP-compatible agents create and update tasks through a shared MCP tool interface.
- Preserve a documented REST event endpoint for generic integrations and scripts.
- Provide a Codex connection that does not configure or depend on the global `notify` setting.
- Capture plan steps and lifecycle events when the agent exposes them reliably; otherwise let the agent report progress through MCP tools.
- Show task history, available token usage, and estimated cost by agent and model.
- Provide local Settings for agents, revocable tokens, MCP connection instructions, and model prices.
- Run locally without requiring a cloud account.

**Non-goals for the MVP**

- Starting, scheduling, or orchestrating agents.
- Replacing full LLM observability, prompt tracing, or evaluation products.
- Team permissions, remote access, or multi-machine hosting.
- Guaranteeing token or cost data when the connected agent does not expose it.
- Changing the user's Codex-wide configuration or taking ownership of another tool's notification flow.

## 4. Users and Use Cases

**Primary users:** developers and small teams running multiple coding, research, or automation agents locally.

1. I want to see tasks from Codex and other agents on one board.
2. I want to follow an agent's plan and see when it is waiting for a person.
3. I want to spot failed or quiet tasks quickly.
4. I want to review task history and compare available model usage and estimated cost.
5. I want to connect an MCP-compatible agent without installing a custom wrapper around every task.

## 5. Functional Requirements

| ID  | Requirement                                                                                                        | Priority |
| --- | ------------------------------------------------------------------------------------------------------------------ | -------- |
| F1  | Kanban board with Queued, Ongoing, Blocked, Done, and Failed columns; cards update as task state changes           | P0       |
| F2  | Real-time dashboard updates using SSE                                                                              | P0       |
| F3  | Cards show title, agent, model, current step, progress, duration, tokens, and estimated cost when available        | P0       |
| F4  | Shared task event API with per-agent bearer token authentication                                                   | P0       |
| F5  | Task detail view with ordered event and plan-step history                                                          | P0       |
| F6  | MCP server exposes tools to create, list, start, update, block, complete, and fail tasks                           | P0       |
| F7  | Codex can use the MCP tools without changing its global `notify` configuration                                     | P0       |
| F8  | Settings manage agents, issue/revoke tokens, show MCP client setup, and edit model prices                          | P1       |
| F9  | Filter by agent and model                                                                                          | P1       |
| F10 | Summarize reported tokens and estimated costs by agent and model                                                   | P1       |
| F11 | Detect ongoing tasks with no update past a configurable threshold                                                  | P1       |
| F12 | Mirror native plan/lifecycle events where a supported agent signal is verified; otherwise use explicit MCP updates | P1       |
| F13 | Parent tasks and subtasks for multi-agent work                                                                     | P2       |
| F14 | Email or webhook alerts on failure                                                                                 | P2       |
| F15 | Retry and pause controls                                                                                           | P2       |
| F16 | Task history labels each event with its source (`mcp`, `rest`, or a named adapter)                                 | P1       |
| F17 | Blocked tasks are never flagged as stale; stale alerts do not change task status                                   | P1       |
| F18 | Users can create local project views, move tasks between them, and filter the board; assignments persist in this browser | P1       |

## 6. Task Event Contract

The REST API and MCP tools write through the same event contract. A task has a stable sender-generated `task_id`; each event has a unique `event_id` and a timestamp. The server retains event history and derives current task state using documented ordering and deduplication rules.

```json
{
  "schema_version": 1,
  "event_id": "01J9ZK3...",
  "event": "task_progress",
  "task_id": "01J9ZK2...",
  "parent_id": null,
  "agent": "codex-work",
  "model": "gpt-codex",
  "title": "Refactor payment module",
  "step": "Running tests",
  "plan": [
    { "text": "Read the module", "status": "done" },
    { "text": "Run tests", "status": "active" }
  ],
  "progress": 0.6,
  "tokens": { "input": 1200, "output": 300 },
  "error": null,
  "source": "mcp",
  "ts": "2026-10-12T09:30:00Z",
  "ts_inferred": false,
  "seq": 1,
  "attempt": 1
}
```

**Event types:** `task_queued`, `task_started`, `task_progress`, `task_blocked`, `task_done`, `task_failed`.

**Required input fields:** `event_id`, `event`, and `task_id`. `ts` is optional on input; if omitted, the server receive time is stored and `ts_inferred` is set. The normalized stored event always has `ts`. The `agent` is taken from the authenticated token; if a payload names a different agent, the request is rejected. All other input fields are optional.

### Confirmed v1 rules

The following rules were confirmed for v1 in Phase 0 on October 13, 2026. The versioned schemas are in `schema/v1/`.

| Topic               | Proposed rule                                                                                                                                                                                         | Reason                                                   |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| Task identity       | A task is identified by `(agent, task_id)`. A token can only write for its own agent.                                                                                                                 | Prevents one agent from overwriting another's tasks      |
| Idempotency         | A repeated `(agent, event_id)` is accepted as a no-op and returns `duplicate: true`. Clients generate `event_id` (ULID or UUID); the MCP bridge generates it per tool call.                           | Makes retries safe                                       |
| Ordering            | Fold events by `ts`, then by a server-assigned sequence number. Late events are stored and the task state is re-derived.                                                                              | Deterministic state even when events arrive out of order |
| Missing `ts`        | On ingress, use the server receive time and mark the stored event `ts_inferred`. The input schema permits `ts` to be omitted; the stored event always has a timestamp.                                | Keeps simple REST clients working                        |
| Terminal states     | `task_done` and `task_failed` are terminal. Later non-terminal events are kept in history but do not change state. A new `task_started` after a terminal state opens a new attempt (`attempt + 1`).   | Supports retry without silent resurrection               |
| Blocked             | `task_blocked` carries a short `reason`. The task resumes on the next `task_progress` or `task_started`.                                                                                              | Matches the human-approval wait                          |
| Tokens              | Token counts are **cumulative per task**; the latest report replaces the previous one (not summed). A decrease is recorded as a reset and flagged. Missing usage is stored as unknown, never as zero. | Summing deltas double-counts on retries                  |
| Cost                | Estimated from the local price table. A model with no price shows "no price", never a numeric zero. The current rate schema does not identify a currency.                                             | Honest estimates                                         |
| Size limits         | `title` and `step` up to 200 characters, `plan` up to 20 steps of 200 characters, and `error` or blocked `reason` up to 500.                                                                          | Limits sensitive data and abuse                          |
| Event source        | The server assigns `source` from the authenticated ingress (`mcp`, `rest`, or a named adapter); clients cannot choose a source label.                                                                 | Keeps history labels tied to the actual path             |
| Unknown event types | Stored in history, ignored for state, never crash ingestion.                                                                                                                                          | Forward compatibility                                    |
| Content stored      | Metadata only. No prompts, full responses, or source code by default.                                                                                                                                 | Privacy                                                  |

## 7. Agent Integrations

### MCP-first connection

The local MCP server is the primary integration surface. Tool calls are authenticated and recorded through the same event store used by REST. Settings provide copy-ready, client-specific MCP connection instructions and the selected agent's credential.

MCP tools make reporting available to an agent; they do not passively observe every action. Project guidance (see `AGENTS.md`) tells compatible agents to create a board task, report meaningful plan and status changes, and close or block the task when appropriate.

**Tool-to-event mapping (proposed)**

| Tool            | Event written    | Main inputs                                              | Returns            |
| --------------- | ---------------- | -------------------------------------------------------- | ------------------ |
| `task_create`   | `task_queued`    | `title`, optional `model`, `parent_id`                   | `task_id`          |
| `task_start`    | `task_started`   | `task_id`, optional `step`                               | current state      |
| `task_update`   | `task_progress`  | `task_id`, `step`, optional `plan`, `progress`, `tokens` | current state      |
| `task_block`    | `task_blocked`   | `task_id`, `reason`                                      | current state      |
| `task_complete` | `task_done`      | `task_id`, optional short `summary`                      | final state        |
| `task_fail`     | `task_failed`    | `task_id`, `error`                                       | final state        |
| `task_list`     | none (read-only) | optional `status`, `limit`                               | this agent's tasks |

**Initial local transport (confirmed).** Ship a small stdio MCP bridge first. The client starts it as a subprocess; it forwards each tool call to the tracker's loopback API with the agent token, so MCP and REST share one validation and storage path. The bridge reads the tracker address and token from environment variables (for example `AI_TASK_BOARD_URL` and `AI_TASK_BOARD_TOKEN`). Settings show the variable names and a configuration example, never a replacement of a global config file. Loopback Streamable HTTP served by the tracker itself can follow if a target client prefers it. Confirm the Codex tracker connection in Phase 0.

### Codex

Codex connects to the tracker MCP server. Phase 0 must verify the current Codex MCP configuration scope (project-level or global) and which lifecycle or plan signals are available. The integration may mirror plan and lifecycle changes automatically only through a documented, supported Codex event interface or hook. `notify` is not an integration option: do not add a `notify` line, generate a global config snippet, or edit an existing notification setting.

The current `codex-track` wrapper may remain as a compatibility path while MCP support is rebuilt. It is not the primary setup flow. The adapter must avoid copying prompts or full response text to the board.

### Other agents and REST

Any MCP-compatible agent can use the common task tools with client-specific connection instructions. Agents without MCP support can POST events to `/v1/events`. Agent-specific hooks or adapters are added only when they are supported, maintainable, and do not take over unrelated user configuration.

## 8. Non-Functional Requirements

- **Latency:** accepted task changes appear on the board in under one second.
- **Reliability:** idempotent event ingestion, bounded retries, and visible connection errors.
- **Security:** local-only listener by default, one revocable credential per agent, hashes stored instead of plaintext tokens, and credentials revealed once.
- **Privacy:** no prompts, full responses, or source code stored by default.
- **Scale:** 20 agents and 10,000 tasks per day on an ordinary laptop.
- **Accessibility:** keyboard usable, readable in light and dark modes.
- **Compatibility:** MCP server and REST adapter share a versioned contract; unknown agent event types do not crash ingestion.

## 9. Success Metrics

- First agent task appears on the board within 10 minutes of installation.
- 95th percentile event-to-board delay is under one second.
- Over 95% of failed or stale tasks are surfaced within one minute of the signal or stale threshold.
- Users can connect an MCP-compatible agent using only the Settings instructions and README.
- At least three agents are active per user in the second week.
- At least 80% of tasks that an agent starts reach a terminal or blocked state on the board (measures whether agents actually close the tasks they open).

## 10. Risks and Open Questions

| Risk or question                                                                    | Mitigation or next step                                                                                                                                    |
| ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| MCP tools are callable, but do not passively observe all agent activity             | Add concise workflow instructions in `AGENTS.md`; use verified native lifecycle adapters where available; distinguish explicit reports from inferred state |
| An agent creates a task but never closes it                                         | Stale alert after the threshold (alert only, no automatic status change); show last-update time on every card                                              |
| Codex plan/lifecycle events may change or may not be exposed to a normal MCP server | Verify the supported signal in Phase 0; implement an adapter only if the signal is stable and does not require global `notify`                             |
| Other agents have different MCP and hook support                                    | Keep the core MCP contract generic and document per-client setup; retain REST fallback                                                                     |
| Token usage may be unavailable or cumulative semantics differ                       | Use the cumulative-per-task rule; mark unavailable metrics instead of inventing values                                                                     |
| Titles and plan steps may contain sensitive details                                 | Metadata-only defaults, length limits, and optional redaction                                                                                              |
| MCP and REST clients may send duplicate or late events                              | Event ID, ordering, and idempotency rules from section 6, tested before MCP work starts                                                                    |
| Local MCP transport and credentials need a simple safe setup                        | Prefer stdio with environment variables; never write credentials into a shared or global config automatically                                              |
| A local web page can be reached by other sites in the browser                       | Bind to loopback, validate the `Host` header, and send no permissive CORS headers                                                                          |

## 11. Architecture and Tech Stack

```text
MCP-compatible agent ──MCP (stdio)──> MCP bridge ──┐
REST integration ──────HTTP────────────────────────┼──> Next.js Route Handlers ──> shared event service ──> SQLite
Verified Codex adapter ────────────────────────────┘             │
                                                                 ├──SSE──> React dashboard
                                                                 └──HTML/RSC──> React dashboard
```

- **Server:** Node.js 22.13+ and Next.js App Router with React and TypeScript. Use Node.js Route Handlers for SQLite-backed API operations and the official MCP SDK for the stdio transport.
- **Database:** SQLite, one local file. Store agents, token hashes, tasks, events, and prices.
- **Real-time:** SSE from the local API to the dashboard.
- **Dashboard:** React/TypeScript App Router UI with shared components and the existing minimalist design direction; no extra component library unless separately justified.
- **Codex integration:** MCP client connection first; optional adapter from a verified supported event source. No `notify` configuration.
- **Run mode:** one local command or Docker Compose, explicitly bound to `127.0.0.1`; disable Next.js telemetry from a repository-owned process launcher.

## 12. API and MCP Overview

| Interface       | Operation                                                                                           | Purpose                                                                                                                     |
| --------------- | --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| MCP             | `task_create`, `task_list`, `task_start`, `task_update`, `task_block`, `task_complete`, `task_fail` | Agent-facing task workflow                                                                                                  |
| POST            | `/v1/events`                                                                                        | Generic authenticated event ingestion                                                                                       |
| GET             | `/v1/tasks`, `/v1/tasks/:id`                                                                        | Task list and history                                                                                                       |
| GET             | `/v1/dashboard/tasks`, `/v1/dashboard/tasks/:agent/:id`, `/v1/dashboard/stats`                      | Host-validated loopback dashboard reads; any supplied Origin must match Host exactly; no agent token is sent to the browser |
| GET             | `/v1/stream`                                                                                        | Dashboard SSE updates                                                                                                       |
| GET             | `/v1/stats`                                                                                         | Token, estimated cost, and stale-task summary                                                                               |
| GET/POST/DELETE | `/v1/settings/agents`, `/v1/settings/tokens`, `/v1/settings/prices`                                 | Local settings and credentials                                                                                              |

MCP tools and REST events must go through the same validation, authorization, event store, and task-state derivation.

## 13. Development Phases

Build the application from scratch using the requirements and decisions in this PRD. Existing project documentation, approved schemas, and tested work in this checkout are part of the new implementation; there is no previous application or database to migrate. See [`docs/rebuild-plan.md`](docs/rebuild-plan.md) for tasks, exit criteria, and execution order.

1. **Phase 0 — Product and integration contract:** settle event semantics and verify Codex MCP plus any supported plan/lifecycle signal. Preserve the existing global notification configuration.
2. **Phase 1 — Core event service:** harden shared event storage, authentication, ordering, idempotency, REST API, and SSE.
3. **Phase 2 — MCP connection:** add the MCP server and task tools; connect Codex and a second MCP-compatible client; keep REST as fallback.
4. **Phase 3 — Dashboard and Settings:** finalize board, detail history, filters, tokens, MCP setup instructions, and prices against the shared service.
5. **Phase 4 — Usage, alerts, and release:** validate token and cost aggregation and stale alerts; add verified lifecycle adapters; package and document local installation.

## 14. Target Repository Structure

```text
ai-task-board/
  AGENTS.md                 instructions for coding agents in this repo
  app/                      Next.js App Router pages and Route Handlers
  components/               reusable React dashboard and Settings UI
  server/                   shared event service and SQLite persistence
  integrations/
    mcp/                    primary MCP server/bridge and client setup examples
    rest/                   generic REST examples
    codex/                  only a verified Codex lifecycle adapter, if needed
  schema/                   versioned event and tool contracts
  .agents/plugins/          repository-scoped Codex marketplace and plugin
  docs/                     Codex verification notes and rebuild plan
```

Do not carry over a legacy wrapper. Add an agent adapter only when the plan calls for it and its behavior is verified against a versioned real-output fixture.

## 15. Verification and Release

- Validate MCP tool schemas and behavior with representative valid and invalid inputs.
- Verify MCP and REST calls produce identical task state and history.
- Verify duplicate, late, and out-of-order event behavior against the Phase 0 contract.
- Validate the Codex MCP connection and any lifecycle adapter using versioned real output fixtures; do not claim unverified events as supported.
- Manually connect two agents and watch status updates on the local board.
- Release version 0.1 for local use, then invite a few early users for feedback.

## 16. Decision Log

| Item                                   | Status    | Notes                                                                                                                                                    |
| -------------------------------------- | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Local-only, loopback listener          | Decided   | No cloud account, no remote access in the MVP                                                                                                            |
| MCP-first, REST fallback               | Decided   | Same event service behind both                                                                                                                           |
| Never use or modify Codex `notify`     | Decided   | Applies to code, Settings text, docs, and generated snippets                                                                                             |
| SQLite, SSE, Node.js 22.13+            | Decided   | Selected for the local-only application; SQLite access method is recorded in the P0-12 decision                                                          |
| TypeScript source                      | Decided   | Application and UI source use TypeScript; Next.js handles the React client and server build                                                              |
| Event contract rules (section 6)       | Confirmed | v1 lifecycle, ordering, retry, timestamp, usage, limits, and unknown-event rules confirmed October 13, 2026; schemas in `schema/v1/`                     |
| Local credential flow                  | Confirmed | Bridge URL and per-agent token are supplied through environment variables; Settings reveals each token once; repository files do not contain credentials |
| Next.js App Router                     | Decided   | User selected Next.js with React/TypeScript on October 13, 2026; preserve local-only, loopback, shared-service, and no-telemetry boundaries              |
| Price currency                         | Open      | Model rates are numeric and the schema has no currency field; UI must not imply a currency until one is explicitly decided                               |
| stdio MCP bridge                       | Confirmed | Initial Codex transport; end-to-end setup verification remains in P0-4                                                                                   |
| Second MCP client to verify            | Open      | Codex is the first target; keep the interface generic for another MCP-compatible client                                                                  |
| Default stale threshold                | Open      | Suggested starting value: 10 minutes, configurable                                                                                                       |
| Event retention and cleanup            | Open      | Suggested: keep all by default, add a manual cleanup later                                                                                               |
| Fate of `codex-track` after MCP parity | Open      | Decide in Phase 4 with a migration note                                                                                                                  |
