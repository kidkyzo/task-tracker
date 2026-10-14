# AI Task Board MCP bridge

The bridge exposes `project_register`, `task_create`, `task_list`, `task_start`, `task_update`, `task_block`, `task_complete`, and `task_fail` over MCP stdio. It forwards requests to the tracker's loopback API; it does not open or write the SQLite database.

## Run locally

1. Start AI Task Board with `npm start`.
2. Configure `AI_TASK_BOARD_URL` to the local dashboard URL if it is not using the default `http://127.0.0.1:4317`.
3. Run `npm run build` once before installing the plugin. The build packages a standalone bridge in the plugin folder so it can run from Codex's plugin cache without the repository path or its `node_modules`.

## Run the live smoke test

From the repository root, run:

```powershell
npm run smoke
```

This builds the app and packaged bridge, starts a temporary loopback tracker with an isolated SQLite database, then connects to the bridge over MCP stdio. It registers a temporary project, creates and completes a linked task, verifies project reassignment through the dashboard route, and confirms the final task appears under that project. The temporary database is removed when the test exits. It does not edit Codex settings or contact an external service.

The MCP bridge does not use a token. MCP calls are attributed to the fixed “Local MCP” agent. Any local process that can reach the loopback API can submit events under that identity. The REST event and task APIs continue to require per-agent bearer tokens. The bridge accepts only a local `http://localhost` or `http://127.0.0.1` tracker URL. It writes diagnostics to stderr; stdout is reserved for MCP.

## Codex marketplace plugin

This repository includes a project-scoped marketplace at `.agents/plugins/marketplace.json`. It installs the `ai-task-board` plugin, which starts the compiled bridge through its launcher and includes the task-reporting workflow skill. The project `.codex/config.toml` enables the plugin for trusted Codex work in this checkout.

From the project root, install the repository marketplace and plugin with Codex CLI:

```powershell
codex plugin marketplace add ./
codex plugin add ai-task-board@ai-task-board-local
```

The plugin only needs `AI_TASK_BOARD_URL`, defaulting to `http://127.0.0.1:4317`. Start the dashboard with `npm start` before using the plugin. Keep the `./` prefix on the repository root; without it, the CLI may parse the folder name as a GitHub shorthand.

Open Codex from this trusted project and enable the plugin for the project. Local plugin installation is not a public listing. The live Codex lifecycle still needs a manual smoke test; see [Codex verification](../../docs/codex-verification.md).

Each task write creates one v1 event with a bridge-generated event ID and timestamp. The tracker assigns the fixed Local MCP identity and `source: "mcp"`, validates the shared schema, and writes through the shared event service. Tool errors distinguish invalid input from an unavailable tracker without returning request content.

Before creating the first task in a Codex project, call `project_register` with its display name and absolute local root path. Registration is idempotent by a hash of the normalized path; the raw path is not stored. Pass the returned `project_id` to `task_create` so the project board contains only its tasks. The REST equivalent is authenticated `POST /v1/projects` with `{ "name": "…", "root_path": "…" }`.
