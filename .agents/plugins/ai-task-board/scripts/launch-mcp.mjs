import { access } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const root = process.env.AI_TASK_BOARD_ROOT;
if (!root) {
  process.stderr.write("Set AI_TASK_BOARD_ROOT to the AI Task Board project folder.\n");
  process.exit(1);
}
if (!process.env.AI_TASK_BOARD_TOKEN) {
  process.stderr.write("Set AI_TASK_BOARD_TOKEN before starting the AI Task Board plugin.\n");
  process.exit(1);
}

const entry = resolve(root, "dist/integrations/mcp/index.js");
try {
  await access(entry);
} catch {
  process.stderr.write("Build the AI Task Board before starting its MCP bridge.\n");
  process.exit(1);
}

process.chdir(root);
await import(pathToFileURL(entry).href);
