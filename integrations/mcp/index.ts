import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { ZodError } from "zod/v4";
import { createToolService, readTrackerConfig, TrackerError } from "./tool-service.js";
import { toolInputSchemas } from "./tool-schemas.js";

function mcpResult(value: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(value) }] };
}

function registerTools(
  server: McpServer,
  call: ReturnType<typeof createToolService>["call"],
): void {
  const register = async (name: keyof typeof toolInputSchemas, args: unknown) => {
    try {
      return mcpResult(await call(name, args as Record<string, unknown>));
    } catch (error) {
      const message =
        error instanceof ZodError
          ? "Tool input is invalid. Check the tool's required fields and value limits."
          : error instanceof TrackerError
            ? error.message
            : "The tracker tool failed without changing task state.";
      return { content: [{ type: "text" as const, text: message }], isError: true };
    }
  };

  server.registerTool(
    "task_create",
    {
      description: "Create a task on the local AI Task Board.",
      inputSchema: toolInputSchemas.task_create,
    },
    (args) => register("task_create", args),
  );
  server.registerTool(
    "task_list",
    {
      description: "List this agent's tasks, optionally filtered by status.",
      inputSchema: toolInputSchemas.task_list,
    },
    (args) => register("task_list", args),
  );
  server.registerTool(
    "task_start",
    {
      description: "Mark one of this agent's tasks as started.",
      inputSchema: toolInputSchemas.task_start,
    },
    (args) => register("task_start", args),
  );
  server.registerTool(
    "task_update",
    {
      description: "Report a task step, plan, progress, or cumulative token usage.",
      inputSchema: toolInputSchemas.task_update,
    },
    (args) => register("task_update", args),
  );
  server.registerTool(
    "task_block",
    {
      description: "Mark a task blocked and give a short reason.",
      inputSchema: toolInputSchemas.task_block,
    },
    (args) => register("task_block", args),
  );
  server.registerTool(
    "task_complete",
    {
      description: "Mark a task complete with an optional short summary.",
      inputSchema: toolInputSchemas.task_complete,
    },
    (args) => register("task_complete", args),
  );
  server.registerTool(
    "task_fail",
    {
      description: "Mark a task failed with a short error summary.",
      inputSchema: toolInputSchemas.task_fail,
    },
    (args) => register("task_fail", args),
  );
}

async function main(): Promise<void> {
  const config = readTrackerConfig();
  const service = createToolService(config);
  const server = new McpServer({ name: "ai-task-board", version: "0.1.0" });
  registerTools(server, service.call);
  await serveStdio(() => server);
}

main().catch((error: unknown) => {
  const message =
    error instanceof TrackerError ? error.message : "The AI Task Board MCP server could not start.";
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
