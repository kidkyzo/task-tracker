import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const command = process.argv[2];
if (!["dev", "build", "start"].includes(command)) {
  throw new Error("Usage: node scripts/next.mjs <dev|build|start>");
}

const port = Number(process.env.PORT ?? 4317);
if (!Number.isInteger(port) || port < 1 || port > 65_535) {
  throw new RangeError("PORT must be an integer from 1 to 65535.");
}

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const nextCli = resolve(root, "node_modules/next/dist/bin/next");
const args = [nextCli, command];
if (command === "build" || command === "dev") args.push("--webpack");
if (command !== "build") args.push("--hostname", "127.0.0.1", "--port", String(port));

const child = spawn(process.execPath, args, {
  cwd: root,
  env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1", PORT: String(port) },
  stdio: "inherit",
});

for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => child.kill(signal));

child.once("error", (error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
child.once("exit", (code, signal) => {
  process.exitCode = code ?? (signal ? 1 : 0);
});
