import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import test from "node:test";

test("stdio MCP process completes initialization and lists the seven task tools", async () => {
  const entrypoint = fileURLToPath(new URL("../integrations/mcp/index.js", import.meta.url));
  const child = spawn(process.execPath, [entrypoint], {
    env: {
      ...process.env,
      AI_TASK_BOARD_URL: "http://127.0.0.1:4317",
      AI_TASK_BOARD_TOKEN: "test-token",
    },
    stdio: ["pipe", "pipe", "pipe"],
  });
  const stdout = createInterface({ input: child.stdout });
  try {
    const tools = await new Promise<string[]>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("MCP stdio handshake timed out")), 5000);
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
