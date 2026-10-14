# AGENTS.md

Instructions for AI coding agents working in this repository. Read this file before making changes.

## Project

AI Task Board is a local dashboard that tracks work reported by AI agents. Agents report through an MCP server (primary) or a REST event API (fallback). A local Next.js App Router server exposes the dashboard, REST API, and SSE while shared TypeScript services store events in SQLite. It runs on the user's machine only.

Source of truth:

- Product requirements: `AI_Task_Tracker_PRD.md`
- Implementation plan and task IDs: `docs/rebuild-plan.md`
- Event and tool contracts: `schema/`

If code and these documents disagree, say so and ask rather than guessing.

## Hard rules

1. **Never touch Codex `notify`.** Do not read, write, generate, or suggest any `notify` configuration, snippet, adapter, or API path. It belongs to the user's other workflow.
2. **Do not edit global or user-level config files** (for example anything under the home directory such as agent or editor settings). Generated setup instructions are text for the user to apply; they never overwrite existing settings.
3. **One write path.** REST and MCP must both go through the shared event service. Never write to SQLite from a route handler, tool handler, or adapter directly.
4. **Local only.** The server binds to loopback. Do not add remote access, telemetry, or cloud calls.
5. **No secrets or content in storage or logs.** Do not store or log tokens (only hashes), prompts, full responses, or source code. Titles, steps, and metrics only.
6. **Do not claim unverified agent events as supported.** An adapter needs a versioned real-output fixture first.
7. **No new dependencies without a reason.** The user selected Next.js App Router with React and TypeScript to simplify UI development. Do not add a second UI framework or component library without a reason. Prefer Node.js built-ins for backend features.
8. **No telemetry.** Run Next.js with telemetry disabled by a repository-owned process launcher; do not change user-level or global settings.

## Repository layout

```text
app/                  Next.js App Router pages and Route Handlers
app/ui/               reusable React dashboard components
proxy.ts              loopback Host validation and request security headers
scripts/              repository-owned Next.js launcher, build helpers, and Codex launcher
server/               shared event service and SQLite persistence
integrations/mcp/     MCP server/bridge and client setup examples
integrations/rest/    generic REST examples
integrations/codex/   verified Codex lifecycle adapter only, if any
schema/               versioned event and tool contracts
docs/                 rebuild plan and Codex verification notes
.agents/plugins/      repository-scoped Codex marketplace and AI Task Board plugin
```

## Setup and commands

Check `package.json` for the exact scripts; the repo expects the usual ones:

```bash
npm install     # install dependencies (Node.js 22.13+ required)
npm run dev     # Next.js development server, loopback only
npm run check   # lint, format check, typecheck, Next build, and test
npm start       # build and start the Next.js loopback server
```

Run `npm run check` before finishing an implementation task and update this section in the same change as any script changes.

## Working conventions

- Next.js App Router pages use React and TypeScript; Route Handlers use the Node.js runtime for SQLite and shared services.
- Development and production commands must bind to `127.0.0.1`; never rely on Next.js's network-wide default host.
- Disable Next.js telemetry in the repository-owned launch process without changing global configuration.
- Keep functions small; the event service functions are the unit of reuse.
- Validate all input against the schemas in `schema/`. Reject, do not coerce.
- Unknown event types are stored and ignored for state; they must never crash ingestion.
- Show unknown data honestly: "no price" and "tokens unavailable", never zero.
- Event rules to follow (see PRD section 6): idempotent on `(agent, event_id)`, ordered by `ts` then sequence, `task_done`/`task_failed` terminal, tokens cumulative per task.
- A task from the plan is referenced by its ID (for example `P1-3`) in commit messages and pull requests.
- Tick the matching checkbox in `docs/rebuild-plan.md` when a task is done and its tests pass.
- Update docs and visible UI text in the same change as the behavior they describe.

## Testing expectations

- New behavior needs a test. Contract changes need valid and invalid examples in `schema/`.
- Ordering changes need the shuffled-arrival test to pass.
- Anything added to MCP needs a REST parity test.
- Security-sensitive changes (tokens, Host header, bind address) need a negative test.

## Reporting to the board (when you use the tracker MCP tools)

If the AI Task Board MCP server is connected in your session, report your own work:

1. At the start of each task in this workspace, call `project_register` with the project name and absolute local root path. Registration is idempotent and the server stores only a hash of the normalized path.
2. Before meaningful work, call `task_create` with a short title (under 200 characters) and the returned `project_id`, then `task_start`. Include that `project_id` on every task created in this workspace.
3. At each real change of plan or phase, call `task_update` with a short `step` and, if you have one, a `plan` list. Do not send an update for every command.
4. If you need a person's approval or input, call `task_block` with a short `reason`, and stop until you have it.
5. When finished, call `task_complete`. If you cannot finish, call `task_fail` with a short `error`. Always close or block a task you opened.
6. Report only metadata: no prompts, secrets, file contents, or long output.
7. If the tracker is unreachable or the connected MCP client lacks `project_register` or `project_id` support, continue the work and mention that once in your final message; do not silently create an unassigned task or retry in a loop.

## When unsure

Ask before changing the event contract, the MCP tool names or inputs, the database schema, or anything that touches credentials. Prefer the smallest change that satisfies the task.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
