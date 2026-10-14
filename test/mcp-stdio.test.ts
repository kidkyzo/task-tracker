import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { resolve } from "node:path";
import test from "node:test";

test("packaged marketplace bridge starts without root or token and lists task and project tools", async () => {
  const entrypoint = resolve(process.cwd(), ".agents/plugins/ai-task-board/scripts/launch-mcp.mjs");
  const env = { ...process.env };
  delete env.AI_TASK_BOARD_ROOT;
  delete env.AI_TASK_BOARD_TOKEN;
  const child = spawn(process.execPath, [entrypoint], {
    env: {
      ...env,
      AI_TASK_BOARD_URL: "http://127.0.0.1:4317",
    },
    stdio: ["pipe", "pipe", "pipe"],
  });
  const stdout = createInterface({ input: child.stdout });
  let stderr = "";
  child.stderr.setEncoding("utf8").on("data", (chunk: string) => {
    stderr += chunk;
  });
  try {
    const tools = await new Promise<string[]>((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error(`MCP stdio handshake timed out. ${stderr}`)),
        5000,
      );
      stdout.on("line", (line) => {
        let message: { id?: number; result?: { tools?: Array<{ name: string }> }; error?: unknown };
        try {
          message = JSON.parse(line) as typeof message;
        } catch {
          clearTimeout(timeout);
          reject(new Error("MCP server wrote non-protocol output to stdout"));
          return;
        }
        if (message.id === 1 && message.result) {
          child.stdin.write(
            `${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })}\n`,
          );
          child.stdin.write(
            `${JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} })}\n`,
          );
        } else if (message.id === 2 && message.result) {
          clearTimeout(timeout);
          resolve(message.result.tools?.map(({ name }) => name) ?? []);
        } else if (message.error) {
          clearTimeout(timeout);
          reject(new Error("MCP server rejected protocol initialization"));
        }
      });
      child.stdin.write(
        `${JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {
            protocolVersion: "2025-11-25",
            capabilities: {},
            clientInfo: { name: "AI Task Board test", version: "1.0.0" },
          },
        })}\n`,
      );
    });
    assert.deepEqual(tools.sort(), [
      "project_register",
      "task_block",
      "task_complete",
      "task_create",
      "task_fail",
      "task_list",
      "task_start",
      "task_update",
    ]);
  } finally {
    stdout.close();
    child.kill();
  }
});
