# AI Task Board MCP bridge

The bridge exposes `task_create`, `task_list`, `task_start`, `task_update`, `task_block`, `task_complete`, and `task_fail` over MCP stdio. It forwards writes to the tracker's authenticated loopback API; it does not open or write the SQLite database.

## Run locally

1. Start AI Task Board with `npm start`.
2. Create an agent in the dashboard Settings and copy its token. The token is shown once.
3. Keep the agent token in a secure store. The Codex plugin forwards `AI_TASK_BOARD_TOKEN` from the Codex process environment to its local bridge.
4. Run `npm run build` once before using the bridge. It starts the compiled TypeScript entry directly, keeping build output out of the MCP stdio stream.

Do not put a real token in this repository, a shared project file, or a checked-in environment file. Use the client's environment-variable or secret-store facility. The bridge accepts only a local `http://localhost` or `http://127.0.0.1` tracker URL. It writes diagnostics to stderr; stdout is reserved for MCP.

## Codex marketplace plugin

This repository includes a project-scoped marketplace at `.agents/plugins/marketplace.json`. It installs the `ai-task-board` plugin, which starts the compiled bridge through its launcher and includes the task-reporting workflow skill. The project `.codex/config.toml` enables the plugin for trusted Codex work in this checkout.

From the project root, install the repository marketplace and plugin with Codex CLI:

```powershell
codex plugin marketplace add .agents/plugins
codex plugin add ai-task-board@ai-task-board-local
```

The plugin needs `AI_TASK_BOARD_ROOT` and `AI_TASK_BOARD_TOKEN` in the environment that starts Codex. On Windows, `scripts/start-codex-with-board.ps1` prompts for the token without saving it and starts Codex CLI from this checkout. Start the dashboard separately with `npm start`, then run the helper from another PowerShell window:

```powershell
./scripts/start-codex-with-board.ps1
```

The marketplace and plugin files contain no credential value. Local plugin installation is not a public listing. This Codex workflow has not yet passed an end-to-end smoke test; see [Codex verification](../../docs/codex-verification.md).

Each task write creates one v1 event with a bridge-generated event ID and timestamp. The tracker assigns `source: "mcp"`, authenticates the agent, validates the shared schema, and writes through the shared event service. Tool errors distinguish invalid input, rejected credentials, and an unavailable tracker without returning request content or credentials.
