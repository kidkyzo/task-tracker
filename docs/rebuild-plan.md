# AI Task Board Development Plan

Draft v1.3, October 14, 2026. This is the active development plan for AI Task Board. Build the application from scratch; there is no earlier application or database to migrate. The existing PRD, design brief, approved schemas, and tested work in this checkout are part of this build. Product requirements are in [`AI_Task_Tracker_PRD.md`](../AI_Task_Tracker_PRD.md); agent rules for this repo are in [`AGENTS.md`](../AGENTS.md).

## Product decision

- MCP task tools are the primary agent-facing integration.
- REST is the fallback for scripts and agents that cannot use MCP.
- Agent-native hooks or protocol adapters are optional and must be verified against real output before being called automatic.
- Do not configure Codex `notify`, generate a `notify` snippet, or edit the user's global Codex configuration. The existing `notify` setting belongs to the user's other workflow and must remain untouched.
- The tracker records and displays work; it does not start or orchestrate agents in the MVP.

## Starting point

- This checkout began with project documents only; there is no prior application, database, or wrapper to migrate. The current build already has the approved v1 schemas, package/test scaffold, event-state reducer, and an initial SQLite schema under implementation.
- Stack: Node.js 22.13+, Next.js App Router, React and TypeScript, Node's built-in SQLite module, and SSE. Keep the Next.js server on loopback and disable framework telemetry by setting `NEXT_TELEMETRY_DISABLED=1` in the repository-owned launcher.
- Phase 0 decisions already settled: PRD section 6 is the v1 event contract; cumulative token semantics are confirmed; Codex is the current client target; stdio is the initial MCP transport; MCP uses a tokenless local identity and REST retains API-managed agent credentials; the Settings page is removed. Codex project registration occurs on first work, with a path hash stored instead of the path. Automatic lifecycle integration is not supported without a passive signal and fixture. End-to-end Codex connectivity remains unverified, and a second client is deferred.
- User selected TypeScript and later selected Next.js App Router with React to make development easier. Use Next.js Route Handlers on the Node.js runtime for dashboard/API/SSE requests and preserve the shared event service as the only write path. Do not introduce a custom server unless the integrated router cannot meet a documented requirement.

## Effort overview

Rough estimates for one developer working full time. Adjust after Phase 0, which has the most unknowns.

| Phase | Focus                                            | Estimate |
| ----- | ------------------------------------------------ | -------- |
| 0     | Scaffold, contract, and integration verification | 3–4 days |
| 1     | Shared event service and REST API                | 5–7 days |
| 2     | MCP server and agent workflow                    | 4–5 days |
| 3     | Project dashboard                                | 5–6 days |
| 4     | Metrics, adapters, and local release             | 4–5 days |

Total: about 4 to 5 weeks. Phase 3 can start earlier against fixture data once the contract is frozen (P0-3).

## Phase 0 — Scaffold, contract, and integration verification

**Tasks**

- [x] **P0-1** Review the proposed rules in PRD section 6 and freeze the task lifecycle and event schema: task ID scope, event IDs, timestamps, retry behavior, late-event rules, and terminal-state behavior.
- [x] **P0-2** Confirm token semantics (proposed: cumulative per task, latest wins) and how missing or reset usage is represented.
- [x] **P0-3** Write the contract as versioned JSON Schema files in `schema/` (the event, and one schema per MCP tool), each with valid and invalid examples.
- [ ] **P0-4** Verify Codex can connect to a project-scoped or local MCP server using a setup that does not modify global `notify` configuration. Record the exact version tested.
- [x] **P0-5** Investigate whether Codex exposes plan updates and lifecycle events through a stable supported interface usable by this tracker. Save versioned fixtures where possible.
- [ ] **P0-6** Choose and verify one additional MCP-compatible client; note its transport and configuration format.
- [x] **P0-7** Decide the MCP transport (proposed: stdio bridge first, loopback Streamable HTTP later) based on what P0-4 and P0-6 confirm. User selected stdio for the Codex-first MVP; P0-4 remains open until the tracker connection is tested.
- [x] **P0-8** Document local connection requirements and confirm generated setup instructions never overwrite unrelated user settings.
- [x] **P0-9** Record results in `docs/codex-verification.md`.
- [x] **P0-10** Scaffold the repository: folder structure from the PRD, `package.json` with TypeScript build, start, typecheck, and test scripts, formatter and TypeScript-aware linter, `.gitignore` (including compiled output, SQLite, and env files), and a CI workflow that runs the checks. Local `npm run check` passes; hosted CI has not run because this checkout has no Git remote.
- [x] **P0-11** Place `AGENTS.md` at the repo root and correct its "Setup and commands" section to match the TypeScript scripts.
- [x] **P0-12** Use Node's built-in SQLite module and record the runtime floor and trade-offs in `docs/sqlite-decision.md`.

**Exit criteria**

- Versioned event contract with explicit aggregation and ordering rules.
- Verified MCP connection steps for Codex and a second client.
- A written decision on plan/lifecycle synchronization: a supported adapter with fixtures, or MCP tool calls plus workflow instructions only.
- A repo where `npm test` runs (even with a single placeholder test) and CI is green.
- No tracker setup writes to the global Codex `notify` key.

## Phase 1 — Shared event service and REST API

**Tasks**

- [x] **P1-1** Create the database schema: `agents`, `tokens` (hash only), `tasks`, `events` (with `event_id`, `seq`, `source`, `ts_inferred`, `attempt`), `prices`, and settings. Apply it with a small versioned migration runner so later changes are safe. `npm run check` passes, including migration/table coverage.
- [x] **P1-2** Build the event service module: validate, authorize, deduplicate, persist, derive status, and publish to SSE. Nothing else writes to SQLite. The REST handler and SSE use the shared event service; `npm run check` passes.
- [x] **P1-3** Implement idempotency on `(agent, event_id)` and return `duplicate: true` for repeats. Verified in event-service tests.
- [x] **P1-4** Implement ordering by `ts` then `seq`, re-deriving task state when a late event arrives. Verified with a late-arrival projection test.
- [x] **P1-5** Implement terminal-state and new-attempt behavior, the blocked state, and the unknown-event-type rule. Verified in reducer and event-service tests.
- [x] **P1-6** Implement agents and tokens: create an agent, issue a token (shown once, stored as a hash), revoke it, and enforce that a token can only write for its assigned agent. Credential and wrong-agent REST tests pass.
- [x] **P1-7** Add `POST /v1/events` with bearer authentication, field size limits, and a metadata-only default (no prompts, responses, or source code). Auth, schema rejection, and wrong-agent tests pass.
- [x] **P1-8** Add `GET /v1/tasks` and `GET /v1/tasks/:id` (ordered event history). Agent scope tests pass.
- [x] **P1-9** Add `GET /v1/stream` (SSE) with heartbeat and a snapshot on connect. Snapshot and live-update stream tests pass.
- [x] **P1-10** Implement cumulative token handling, reset flagging, "unknown" for missing usage, and `GET /v1/stats`. Tests cover latest replacement, decreases, unavailable values, per-agent scope, and estimates.
- [x] **P1-11** Add settings endpoints for agents, tokens, and prices. Creation returns the token once; list responses expose metadata only. Tests cover create, revoke, same-origin checks, and price validation.
- [x] **P1-12** Bind to loopback only, validate the Host header, and send no permissive CORS headers. Direct request tests reject untrusted hosts and confirm no CORS response header; server startup reports the loopback address.
- [x] **P1-13** Add a minimal live event page (a plain list updated over SSE) so events can be seen end to end before the real dashboard exists. The initial five-lane page was covered by asset and SSE tests; it was replaced by the App Router UI in P3-12. Browser-to-loopback smoke verification was unavailable.
- [x] **P1-14** Add a versioned SQLite project registry, task/event project IDs, and seeded local projects without storing raw root paths. Migration and persistence tests pass.

**Exit criteria**

- REST accepts valid events and rejects invalid or duplicate ones according to the contract.
- Late and out-of-order events produce deterministic task state (same result for any arrival order).
- Accepted updates appear through SSE and persist across restarts.
- A `curl` event shows up on the minimal live page within one second.

## Phase 2 — MCP server and agent workflow

**Tasks**

- [x] **P2-1** Create `integrations/mcp` using the official MCP SDK compatible with the Node.js runtime. The TypeScript SDK stdio bridge compiles with the project build.
- [x] **P2-2** Implement the tools: `task_create`, `task_list`, `task_start`, `task_update`, `task_block`, `task_complete`, `task_fail`, following the mapping in PRD section 7. Tool schemas validate limits and strict object keys.
- [x] **P2-3** Make every tool call the shared event service or the authenticated loopback API; no tool writes to SQLite directly. Writes use the server-owned MCP ingress and shared event service.
- [x] **P2-4** Generate `event_id` per tool call and set `source: "mcp"`. The bridge creates the ID; the MCP route assigns the fixed local identity and provenance.
- [x] **P2-5** Validate input schemas and return clear tool errors (invalid input, rejected cross-origin requests, tracker unreachable) without changing task state. Parity, invalid-input, REST credential, loopback-host, and unreachable tests pass.
- [ ] **P2-6** Finalize the "Reporting to the board" section of `AGENTS.md` and test it with a real agent: it should create a task before meaningful work, report plan and status changes, and close or block the task.
- [x] **P2-7** Provide client setup through a repository-scoped Codex marketplace plugin. The user chose a tokenless local MCP identity; project identity is registered on first work, not configured in plugin settings. The plugin runtime is bundled into the plugin folder so it can run from Codex's cache; REST authentication remains unchanged.
- [x] **P2-8** Add `integrations/rest` with `curl` examples for agents without MCP support. The example follows the v1 contract and uses an environment placeholder.
- [ ] **P2-9** Verify the repository marketplace plugin from a trusted Codex client with the local tracker running. Keep this open until a real lifecycle succeeds.
- [x] **P2-10** Add idempotent MCP `project_register`; pass its returned project ID into task creation. Provide an authenticated REST parity endpoint and contract examples; MCP/REST, idempotence, schema, and unauthorized-write tests pass.

**Exit criteria**

- Codex and one other MCP-compatible agent can create and update a task through the board's MCP tools.
- MCP-originated events appear in task history and on the live page exactly like REST-originated events.
- A failed or unavailable MCP connection produces a useful error without corrupting task state.
- No global notification setting is read, overwritten, or required.

## Phase 3 — Project dashboard

**Tasks**

- [x] **P3-12** Migrate the dashboard and local HTTP entry point to Next.js App Router with React/TypeScript. Preserve existing route contracts, SQLite services, MCP/REST parity, SSE behavior, and security checks. Bind dev and production commands to `127.0.0.1`, set `NEXT_TELEMETRY_DISABLED=1` in a repository-owned launcher, and test the Route Handler adapter before removing the old HTTP UI delivery. Full `npm run check` passed on October 13, 2026, including the optimized Next production build and Route Handler/API regressions.
- [x] **P3-13** Replace browser-only project organization with SQLite-backed projects. Projects register through MCP/REST when agent work starts; the dashboard selects projects and moves or unassigns tasks. Manual dashboard project creation was removed at user request. SQLite migration, dashboard persistence, cross-origin rejection, and SSE tests pass. Browser visual QA remains unverified under the waived P3-11 gate.
- [x] **P3-14** Correct the task-history dialog's viewport position and close button sizing reported in the user screenshot. Production build passes; live browser visual confirmation remains unavailable because the browser cannot reach loopback in this sandbox.
- [x] **P3-1** Build the Kanban board with Queued, Ongoing, Blocked, Done, and Failed columns, updated live over SSE with automatic reconnection. The App Router board has fixed status order/counts, responsive status selection, unknown-status visibility, and connection feedback.
- [x] **P3-2** Build task cards: title, agent, model, current step, progress, elapsed duration, reported tokens, and estimated cost. Preserve real zero values, label partial or unavailable timing/usage honestly, and do not guess currency. Dashboard projection and display-label tests cover zero, partial, unavailable, and elapsed-lifetime cases; full `npm run check` passed on October 13, 2026.
- [x] **P3-3** Build the task detail view with ordered history, plan steps, and the event source label (`mcp`, `rest`, adapter). The keyboard-accessible detail dialog groups retry attempts, stays current with matching SSE updates and reconnect snapshots, keeps its close control visible while scrolling, labels inferred timestamps and token availability, and restores focus after live rerenders.
- [x] **P3-10** Add Host-validated loopback dashboard routes for projects, task lists, task details, and per-agent usage summaries. Require same-origin for dashboard mutations and cover cross-origin rejection and storage behavior.
- [ ] **P3-11 (waived by user)** The user waived the Phase 3 browser visual and interaction QA gate on October 13, 2026, so implementation may continue without it. No browser visual pass was performed or verified; the sandbox cannot reach the loopback server. This remains unchecked because the wide/narrow/phone, theme, keyboard, scrolling, live-refresh, and 200% zoom checks did not pass.
- [x] **P3-4** Add filters by agent and model. Filtering uses the live snapshot, refreshes as new agents/models appear, and offers a clear action when no tasks match.
- [x] **P3-5** Build Settings APIs for REST agents, tokens, and model prices. The API tests cover creation, revocation, same-origin checks, and price validation.
- [x] **P3-15** Remove the dashboard Settings page, navigation, and UI-only state/helpers. Keep local Settings API routes for REST integrations; production build and route tests pass.
- [x] **P3-6** Show "no price" and "tokens unavailable" instead of zero values; cover actual zero usage separately from missing data. API and display tests distinguish a genuine zero from missing usage or price; full `npm run check` passed on October 13, 2026.
- [x] **P3-7** Add accessible empty, loading, and error states, keyboard support, and light and dark modes for the board. Includes a polite live-update summary, native dialogs, retry/error states, reduced-motion styling, and a theme preference applied before paint without storing task data. Browser visual QA remains separately waived under P3-11.
- [ ] **P3-8** Make sure copy-ready examples work with the selected transport and never embed secrets in repository files.
- [x] **P3-9** Remove the minimal live page from Phase 1, or keep it as a debug view. The old HTML/CSS/JavaScript assets were removed after their flows were ported to App Router.

**Exit criteria**

- Codex project registration and task assignment persist across browsers through the local SQLite database.
- Board status, filters, and details reflect updates from MCP and REST clients.
- No UI or endpoint suggests configuring the tracker's `notify` integration.

## Phase 4 — Metrics, adapters, and local release

**Tasks**

- [ ] **P4-1** Validate token aggregation with real agent usage signals; show unknown or unavailable metrics honestly.
- [ ] **P4-2** Validate model price lookup and label cost as an estimate.
- [ ] **P4-3** Implement stale-task detection (suggested default 10 minutes, configurable); exempt blocked tasks; stale alerts never change task status.
- [ ] **P4-4** If Phase 0 verified a supported Codex plan/lifecycle signal, add the minimal adapter in `integrations/codex` with fixture-based compatibility checks. It must not use the global `notify` setting. Otherwise, keep explicit MCP updates as the supported path.
- [ ] **P4-5** Write the README and first-run instructions, and add Docker Compose with the port bound to loopback.
- [x] **P4-6** Add a one-command local start and an end-to-end smoke test. `npm start` builds and starts the loopback app; `npm run smoke` builds and verifies project registration, linked task lifecycle through the packaged MCP stdio bridge, and dashboard readback using a temporary SQLite database.
- [ ] **P4-7** Tag version 0.1 and run the acceptance walkthrough on a clean machine or fresh user account.

**Exit criteria**

- A fresh local install can connect an MCP agent and show the create-to-finish lifecycle.
- Token and cost summaries are traceable to reported data and configured prices.
- Stale alerts are visible and actionable without silently changing task status.
- A second user can install and connect an MCP agent using only the README and repository plugin.

## Build order and dependencies

```text
Phase 0: scaffold + contract + Codex/MCP verification
                  │
                  v
Phase 1: shared event service + REST + SSE
                  │
        ┌─────────┴──────────┐
        v                    v
Phase 2: MCP tools    Phase 3: project dashboard
        │                    │
        └─────────┬──────────┘
                  v
        Phase 4: metrics/release
```

Phases 2 and 3 can run in parallel once Phase 1 is done. Phase 2 tool definitions (P2-1, P2-2) can start as soon as P0-3 is done, but their integration tests need the Phase 1 service.

## Test strategy

- **Contract tests:** every event and tool schema has valid and invalid examples in `schema/` that both REST and MCP tests reuse.
- **Ordering property test:** shuffle a set of events into many arrival orders and assert the derived state is identical.
- **Parity test:** send the same logical sequence through REST and through MCP and assert identical task state and history.
- **Idempotency test:** replay each event twice and assert no change.
- **Security tests:** wrong-agent token, revoked token, bad Host header, oversized fields.
- **Fixture tests:** real Codex and second-client output saved as versioned fixtures; never claim an event as supported without one.
- **Manual end-to-end:** the acceptance walkthrough below, run before each release tag.

## Risks to the plan

| Risk                                                                         | Response                                                                             |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Codex MCP setup is global-only and conflicts with the no-global-changes rule | Document manual, user-controlled steps; never automate edits to global files         |
| Codex exposes no stable plan signal                                          | Rely on explicit MCP updates and `AGENTS.md` guidance; skip the adapter              |
| Agents forget to report                                                      | Strong, short guidance; stale alerts; track the close-rate metric from the PRD       |
| Building everything new delays the first visible result                      | Phase 1 ends with a minimal live page; Phase 3 can start on fixture data             |
| Contract changes late in the build                                           | Freeze it in Phase 0; any later change needs a schema version bump and a test update |

## Definition of done (every task)

- Behavior matches the PRD and the event contract.
- Tests added or updated and passing.
- No secrets, prompts, or response text stored or logged by default.
- `notify` is not referenced by any setup path, UI text, or doc.
- Relevant docs updated (README, visible dashboard copy, `docs/`, this plan's checkboxes).

## Acceptance walkthrough

1. Start the tracker locally and enable the repository marketplace plugin in Codex.
2. Ask Codex to perform a task in a project; it registers that project, then creates a task linked by project ID.
3. Confirm the project appears in the project list and its board contains the new task; check status and history updates.
4. Confirm each change appears in SSE, the Kanban board, and the ordered task history, labeled with its source.
5. Connect a second MCP-compatible client and repeat the flow, registering the project through the authenticated REST endpoint when needed.
6. Send a duplicate and an out-of-order event over REST; confirm state is unchanged and correct.
7. Verify an unrelated global Codex notification integration still has its original configuration and is not referenced by the tracker setup.
