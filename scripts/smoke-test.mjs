import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { access, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createInterface } from "node:readline";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const bridge = resolve(root, ".agents/plugins/ai-task-board/ai-task-board.cjs");
const nextLauncher = resolve(root, "scripts/next.mjs");
const tempDir = await mkdtemp(join(tmpdir(), "ai-task-board-smoke-"));
const databasePath = join(tempDir, "board.sqlite");
let server;
let mcp;
let nextPort;
let requestId = 0;
let serverStderr = "";
const pending = new Map();

function readMcpText(result) {
  if (result?.isError) throw new Error("MCP tool returned an error.");
  const text = result?.content?.find((item) => item.type === "text")?.text;
  if (typeof text !== "string") throw new Error("MCP tool returned no text result.");
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("MCP tool returned a non-JSON result.");
  }
}

function sendMcp(method, params = {}) {
  const id = ++requestId;
  return new Promise((resolveRequest, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error("Timed out waiting for the MCP bridge."));
    }, 8_000);
    pending.set(id, { resolve: resolveRequest, reject, timer });
    mcp.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
  });
}

function sendNotification(method) {
  mcp.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method })}\n`);
}

async function reservePort() {
  const net = await import("node:net");
  return new Promise((resolvePort, reject) => {
    const listener = net.createServer();
    listener.once("error", reject);
    listener.listen(0, "127.0.0.1", () => {
      const address = listener.address();
      if (!address || typeof address === "string") {
        listener.close();
        reject(new Error("Could not reserve a loopback port."));
        return;
      }
      const { port } = address;
      listener.close((error) => (error ? reject(error) : resolvePort(port)));
    });
  });
}

async function waitForTracker() {
  const url = `http://127.0.0.1:${nextPort}/v1/dashboard/projects`;
  const deadline = Date.now() + 25_000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null)
      throw new Error("The tracker server exited before becoming ready.");
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1_000) });
      if (response.ok) return;
    } catch {
      // Wait briefly while Next.js finishes starting.
    }
    await delay(250);
  }
  throw new Error("The tracker server did not become ready in time.");
}

function startMcp() {
  const env = { ...process.env, AI_TASK_BOARD_URL: `http://127.0.0.1:${nextPort}` };
  delete env.AI_TASK_BOARD_ROOT;
  delete env.AI_TASK_BOARD_TOKEN;
  mcp = spawn(process.execPath, [bridge], {
    cwd: root,
    env,
    stdio: ["pipe", "pipe", "pipe"],
  });
  const lines = createInterface({ input: mcp.stdout });
  lines.on("line", (line) => {
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      for (const [id, waiter] of pending) {
        clearTimeout(waiter.timer);
        waiter.reject(new Error("MCP bridge wrote invalid protocol output."));
        pending.delete(id);
      }
      return;
    }
    if (message.id === undefined) return;
    const waiter = pending.get(message.id);
    if (!waiter) return;
    clearTimeout(waiter.timer);
    pending.delete(message.id);
    if (message.error) waiter.reject(new Error("MCP protocol request failed."));
    else waiter.resolve(message.result);
  });
  mcp.once("exit", () => {
    for (const [id, waiter] of pending) {
      clearTimeout(waiter.timer);
      waiter.reject(new Error("MCP bridge exited unexpectedly."));
      pending.delete(id);
    }
  });
  return lines;
}

async function stopProcess(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  child.kill("SIGTERM");
  await Promise.race([new Promise((resolveExit) => child.once("exit", resolveExit)), delay(4_000)]);
  if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
}

try {
  await access(bridge).catch(() => {
    throw new Error("Packaged MCP bridge is missing. Run npm run build before the smoke test.");
  });
  nextPort = await reservePort();
  server = spawn(process.execPath, [nextLauncher, "start"], {
    cwd: root,
    env: {
      ...process.env,
      AI_TASK_BOARD_DB: databasePath,
      NEXT_TELEMETRY_DISABLED: "1",
      PORT: String(nextPort),
    },
    stdio: ["ignore", "ignore", "pipe"],
  });
  server.stderr.setEncoding("utf8").on("data", (chunk) => {
    serverStderr += chunk;
  });
  await waitForTracker();

  const lines = startMcp();
  const initialized = await sendMcp("initialize", {
    protocolVersion: "2025-11-25",
    capabilities: {},
    clientInfo: { name: "AI Task Board smoke test", version: "1.0.0" },
  });
  assert.equal(initialized?.serverInfo?.name, "ai-task-board");
  sendNotification("notifications/initialized");

  const availableTools = await sendMcp("tools/list");
  const names = availableTools?.tools?.map(({ name }) => name) ?? [];
  for (const name of [
    "project_register",
    "task_create",
    "task_start",
    "task_update",
    "task_complete",
  ])
    assert.ok(names.includes(name), `Missing MCP tool: ${name}`);

  const project = readMcpText(
    await sendMcp("tools/call", {
      name: "project_register",
      arguments: { name: "Smoke test project", root_path: root },
    }),
  );
  assert.equal(typeof project.project?.project_id, "string");

  const created = readMcpText(
    await sendMcp("tools/call", {
      name: "task_create",
      arguments: { title: "MCP lifecycle smoke test", project_id: project.project.project_id },
    }),
  );
  assert.equal(typeof created.task_id, "string");

  const started = readMcpText(
    await sendMcp("tools/call", {
      name: "task_start",
      arguments: { task_id: created.task_id, step: "Smoke test started" },
    }),
  );
  assert.equal(started.status, "ongoing");

  const updated = readMcpText(
    await sendMcp("tools/call", {
      name: "task_update",
      arguments: { task_id: created.task_id, step: "MCP connection verified" },
    }),
  );
  assert.equal(updated.step, "MCP connection verified");

  const completed = readMcpText(
    await sendMcp("tools/call", {
      name: "task_complete",
      arguments: { task_id: created.task_id, summary: "Smoke test passed" },
    }),
  );
  assert.equal(completed.status, "done");

  const dashboardOrigin = `http://127.0.0.1:${nextPort}`;
  const [projectsResponse, initialTasksResponse] = await Promise.all([
    fetch(`${dashboardOrigin}/v1/dashboard/projects`),
    fetch(`${dashboardOrigin}/v1/dashboard/tasks`),
  ]);
  assert.equal(projectsResponse.status, 200);
  assert.equal(initialTasksResponse.status, 200);
  const projects = (await projectsResponse.json()).projects;
  const initialTasks = (await initialTasksResponse.json()).tasks;
  assert.ok(projects.some(({ project_id }) => project_id === project.project.project_id));
  const boardTask = initialTasks.find(({ task_id }) => task_id === created.task_id);
  assert.ok(boardTask, "Task should be visible on the dashboard.");
  assert.equal(boardTask.project_id, project.project.project_id);
  assert.equal(boardTask.status, "done");

  const projectAssignmentUrl =
    `${dashboardOrigin}/v1/dashboard/tasks/${encodeURIComponent(boardTask.agent_id)}/` +
    `${encodeURIComponent(boardTask.task_id)}/project`;
  const unassignedResponse = await fetch(projectAssignmentUrl, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ project_id: null }),
  });
  assert.equal(unassignedResponse.status, 200);
  const reassignedResponse = await fetch(projectAssignmentUrl, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ project_id: project.project.project_id }),
  });
  assert.equal(reassignedResponse.status, 200);

  const finalTasksResponse = await fetch(`${dashboardOrigin}/v1/dashboard/tasks`);
  assert.equal(finalTasksResponse.status, 200);
  const finalTasks = (await finalTasksResponse.json()).tasks;
  const reassignedTask = finalTasks.find(({ task_id }) => task_id === created.task_id);
  assert.equal(reassignedTask?.project_id, project.project.project_id);

  lines.close();
  await stopProcess(mcp);
  mcp = undefined;
  await stopProcess(server);
  server = undefined;
  console.log(
    "MCP smoke test passed: project registration, task lifecycle, project reassignment, and board readback.",
  );
} catch (error) {
  const message = error instanceof Error ? error.message : "Unknown smoke test failure.";
  if (serverStderr.includes("EADDRINUSE"))
    console.error("The selected tracker port was already in use.");
  else if (message.includes("timed out") || message.includes("ready"))
    console.error("Tracker or MCP readiness timed out.");
  else console.error(message);
  process.exitCode = 1;
} finally {
  await stopProcess(mcp);
  await stopProcess(server);
  await rm(tempDir, { recursive: true, force: true });
}
