import { cpSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
for (const directory of ["server/db/migrations", "schema/v1"]) {
  const source = resolve(root, directory);
  const destination = resolve(root, "dist", directory);
  mkdirSync(destination, { recursive: true });
  cpSync(source, destination, { recursive: true });
}
