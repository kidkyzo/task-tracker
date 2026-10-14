import { rmSync } from "node:fs";
import { resolve, sep } from "node:path";

const root = process.cwd();
const output = resolve(root, "dist");
if (!output.startsWith(`${root}${sep}`))
  throw new Error("Node build output escaped the project directory.");
rmSync(output, { recursive: true, force: true });
