# Codex integration verification

Status: Phase 0 discovery in progress. Repository marketplace plugin added October 13, 2026; live lifecycle verification remains open.

## P0-4: Codex MCP configuration capability

**Result: Codex project plugins and MCP are documented; the local tracker lifecycle is not yet verified.**

- Local CLI observed: `codex-cli 0.162.0-alpha.17.2`.
- `codex mcp --help` exposes commands for managing external MCP servers.
- Current official OpenAI documentation says Codex accepts project overrides in `.codex/config.toml` for trusted projects, and that the CLI and IDE extension share configuration layers: [Config basics](https://learn.chatgpt.com/docs/config-file/config-basic).
- Current official OpenAI documentation also lists STDIO MCP servers with command, args, and environment variables, and names project-scoped configuration as an option: [Model Context Protocol](https://learn.chatgpt.com/docs/extend/mcp).
- This repository now has `.agents/plugins/marketplace.json`, a Codex plugin manifest, a stdio MCP launcher, project enablement, and a PowerShell helper that passes the project root and prompts for a token without saving it. Codex plugin docs support repository marketplaces and forwarding environment variables to stdio plugin servers: [Plugins](https://learn.chatgpt.com/docs/plugins), [Package your plugin](https://developers.openai.com/plugins/build/plugins).
- A live `task_create` request through the connected AI Task Board MCP tool returned that the local tracker was unavailable. No task was created. The plugin configuration and MCP lifecycle remain unverified end to end until the tracker is running and a real lifecycle succeeds.
- No user-level configuration was inspected or changed during this check.

## Remaining Phase 0 verification

- **P0-1/P0-2/P0-3:** the user confirmed the section 6 lifecycle, ordering, retry, timestamp, unknown-event, and cumulative token proposals as the v1 contract on October 13, 2026. Versioned event and MCP tool schemas are in `schema/v1/`, with valid and invalid examples. `npm test` passes all 16 schema and state-reducer tests.
- **P0-5:** official Codex App Server documentation describes `turn/plan/updated` and `turn/completed`; current CLI help labels `codex app-server` experimental. Consuming that stream requires an app-server client that starts/resumes threads and drives turns, which conflicts with the board's non-orchestration scope. Codex hooks expose lifecycle points but no plan update event, and the hooks docs say the transcript format is not a stable interface. Decision: use explicit MCP reporting for the MVP; do not claim or build an automatic lifecycle adapter without a passive supported signal and a versioned real-output fixture. Sources: [Codex App Server](https://learn.chatgpt.com/docs/app-server), [Hooks](https://learn.chatgpt.com/docs/hooks).
- **P0-6:** the user wants Codex verified first and asked to keep the integration generic for possible clients such as Antigravity or Claude. No second client is selected or verified yet.
- **P0-7:** chose local STDIO as the initial transport, with the tracker URL and per-agent token supplied through environment variables. Codex documentation supports this configuration. End-to-end tracker connection remains pending under P0-4; do not publish the setup as verified until that test passes.
- **P0-8:** the user confirmed environment variables for the local bridge URL and per-agent token; Settings should reveal each token once. Keep credentials out of repository files. Setup instructions remain unverified until P0-4 is completed.
- **P0-9:** this record captures current discovery. The live Codex connection is still pending under P0-4; the second client remains open under P0-6.
- **P0-10/P0-11:** project folders, TypeScript build/start/typecheck/test scripts, Node test runner, TypeScript-aware ESLint, Prettier, `.gitignore`, GitHub Actions workflow, and the root `AGENTS.md` setup commands are in place. Local `npm run check` passes; hosted CI is not run because the checkout has no Git remote. `npm start` launches on loopback; the sandbox blocks the HTTP health request.
- **P0-12:** chose built-in `node:sqlite` (`DatabaseSync`) to avoid a native addon dependency for this local single-process application. The runtime floor is Node 22.13.0 so the module works without an experimental CLI flag; Node still labels it experimental. Trade-offs are recorded in [SQLite access decision](sqlite-decision.md).

## Repository state and follow-up

The current checkout contains the v1 event and MCP input schemas, valid/invalid examples, tests, the initial SQLite migration, credentials, shared event service, REST event/task/stats routes, same-origin dashboard task/detail/stats reads, settings APIs, SSE, the TypeScript stdio MCP bridge, a live board, Settings for agents/tokens/prices, and a task history dialog with source-labeled ordered events, retry grouping, and live refresh. `npm run check` passes lint, format, strict typecheck, build, and 44 tests. MCP tests cover all seven tool schemas, shared lifecycle parity, the stdio protocol handshake, MCP source labeling, invalid input, unauthorized requests, and an unavailable tracker. Dashboard asset delivery is tested, but the browser cannot reach loopback in this sandbox, so a live browser smoke test was not verified. Usage UI remains pending. No live Codex connection has been verified. Node.js `v24.11.1` and npm `11.6.2` were available during the check.

The active development plan is [rebuild-plan.md](rebuild-plan.md). It supersedes the earlier plan that assumed an existing prototype to migrate.
