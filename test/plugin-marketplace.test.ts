import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import test from "node:test";

const projectRoot = process.cwd();
const readJson = (path: string) => JSON.parse(readFileSync(resolve(projectRoot, path), "utf8"));

test("repo marketplace installs the AI Task Board plugin with its stdio MCP bridge", () => {
  const marketplace = readJson(".agents/plugins/marketplace.json");
  const plugin = readJson(".agents/plugins/ai-task-board/.codex-plugin/plugin.json");
  const mcp = readJson(".agents/plugins/ai-task-board/.mcp.json");
  const server = mcp.mcpServers["ai-task-board"];

  assert.equal(marketplace.plugins[0].name, plugin.name);
  assert.equal(marketplace.plugins[0].source.path, "./ai-task-board");
  assert.equal(plugin.mcpServers, "./.mcp.json");
  assert.equal(server.type, "stdio");
  assert.deepEqual(server.env_vars, ["AI_TASK_BOARD_ROOT", "AI_TASK_BOARD_TOKEN"]);
  assert.equal(server.env.AI_TASK_BOARD_URL, "http://127.0.0.1:4317");
  assert.match(
    readFileSync(resolve(projectRoot, ".codex/config.toml"), "utf8"),
    /\[plugins\."ai-task-board@ai-task-board-local"\]\s+enabled = true/,
  );
});

test("marketplace launcher fails clearly when required local credentials are absent", () => {
  const env = { ...process.env };
  delete env.AI_TASK_BOARD_ROOT;
  delete env.AI_TASK_BOARD_TOKEN;
  const result = spawnSync(
    process.execPath,
    [resolve(projectRoot, ".agents/plugins/ai-task-board/scripts/launch-mcp.mjs")],
    { cwd: projectRoot, env, encoding: "utf8" },
  );
  assert.equal(result.status, 1);
  assert.match(result.stderr, /AI_TASK_BOARD_ROOT/);
  assert.equal(result.stdout, "");
});
