import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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
  assert.equal(marketplace.plugins[0].source.path, "./.agents/plugins/ai-task-board");
  assert.equal(marketplace.plugins[0].policy.authentication, "ON_INSTALL");
  assert.equal(plugin.mcpServers, "./.mcp.json");
  assert.equal(server.type, "stdio");
  assert.equal(server.env_vars, undefined);
  assert.equal(server.env.AI_TASK_BOARD_URL, "http://127.0.0.1:4317");
  assert.equal(server.cwd, ".");
  assert.equal(server.args[0], "scripts/launch-mcp.mjs");
  assert.match(
    readFileSync(resolve(projectRoot, "README.md"), "utf8"),
    /codex plugin marketplace add \.\//,
  );
  assert.match(
    readFileSync(resolve(projectRoot, ".codex/config.toml"), "utf8"),
    /\[plugins\."ai-task-board@ai-task-board-local"\]\s+enabled = true/,
  );
});

test("marketplace launcher is self-contained and does not use project-root or token variables", () => {
  const launcher = readFileSync(
    resolve(projectRoot, ".agents/plugins/ai-task-board/scripts/launch-mcp.mjs"),
    "utf8",
  );
  assert.match(launcher, /ai-task-board\.cjs/);
  assert.doesNotMatch(launcher, /AI_TASK_BOARD_ROOT|AI_TASK_BOARD_TOKEN/);
  assert.match(launcher, /npm start/);
});
