import { readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
type MigrationRow = { version: number };

const migrationsPath = resolve(dirname(fileURLToPath(import.meta.url)), "migrations");

export function applyMigrations(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL
    ) STRICT;
  `);

  const migrationRows = db.prepare("SELECT version FROM schema_migrations").all() as MigrationRow[];
  const appliedVersions = new Set(migrationRows.map(({ version }) => version));
  const migrations = readdirSync(migrationsPath)
    .filter((name) => /^\d{3}-[a-z0-9-]+\.sql$/.test(name))
    .sort();

  for (const name of migrations) {
    const version = Number(name.slice(0, 3));
    if (appliedVersions.has(version)) continue;

    db.exec("BEGIN IMMEDIATE");
    try {
      db.exec(readFileSync(resolve(migrationsPath, name), "utf8"));
      db.prepare("INSERT INTO schema_migrations(version, name, applied_at) VALUES (?, ?, ?)").run(
        version,
        name,
        new Date().toISOString(),
      );
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }
}

export function openDatabase(path = ":memory:"): DatabaseSync {
  const db = new DatabaseSync(path);
  db.exec("PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
  applyMigrations(db);
  db.exec("PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;");
  return db;
}
