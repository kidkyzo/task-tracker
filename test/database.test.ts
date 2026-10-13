import assert from "node:assert/strict";
import test from "node:test";
import { authenticateToken, createAgent, revokeToken } from "../server/auth/credentials.js";
import { applyMigrations, openDatabase } from "../server/db/database.js";

test("applies the initial migration once and creates the approved tables", () => {
  const db = openDatabase();
  try {
    applyMigrations(db);
    const tables = (
      db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all() as {
        name: string;
      }[]
    )
      .map(({ name }) => name)
      .filter((name) => !name.startsWith("sqlite_"));
    const migrationCount = (
      db.prepare("SELECT count(*) AS count FROM schema_migrations").get() as { count: number }
    ).count;

    assert.deepEqual(tables, [
      "agents",
      "events",
      "prices",
      "schema_migrations",
      "settings",
      "tasks",
      "tokens",
    ]);
    assert.equal(migrationCount, 1);
  } finally {
    db.close();
  }
});

test("issues one-time credentials as hashes and revokes them", () => {
  const db = openDatabase();
  try {
    const created = createAgent(db, "Codex worker", "2026-10-13T10:00:00.000Z");
    const tokenRow = db.prepare("SELECT token_hash FROM tokens").get() as
      { token_hash: string } | undefined;

    const authenticated = authenticateToken(db, created.token);
    assert.ok(authenticated);
    assert.equal(authenticated.agent_id, created.agent.agent_id);
    assert.ok(tokenRow);
    assert.notEqual(tokenRow.token_hash, created.token);
    assert.equal(
      (db.prepare("PRAGMA table_info(tokens)").all() as { name: string }[]).some(
        ({ name }) => name === "token",
      ),
      false,
    );
    assert.equal(revokeToken(db, created.token_id, "2026-10-13T10:01:00.000Z"), true);
    assert.equal(authenticateToken(db, created.token), null);
    assert.equal(revokeToken(db, created.token_id), false);
  } finally {
    db.close();
  }
});
