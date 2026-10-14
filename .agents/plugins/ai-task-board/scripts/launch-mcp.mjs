import { access } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const pluginRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const entry = resolve(pluginRoot, "ai-task-board.cjs");

try {
  await access(entry);
} catch {
  process.stderr.write(
    "The AI Task Board plugin runtime is missing. Run npm start in the project before installing the plugin.\n",
  );
  process.exit(1);
}

await import(pathToFileURL(entry).href);
