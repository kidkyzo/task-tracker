import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";

type AgentRow = { agent_id: string; display_name: string };

export const LOCAL_MCP_AGENT_ID = "00000000-0000-4000-8000-000000000001";

function tokenHash(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function createAgent(db: DatabaseSync, displayName: string, now = new Date().toISOString()) {
  const agentId = randomUUID();
  const tokenId = randomUUID();
  const token = randomBytes(32).toString("base64url");
  const insertAgent = db.prepare(
    "INSERT INTO agents(agent_id, display_name, created_at) VALUES (?, ?, ?)",
  );
  const insertToken = db.prepare(
    "INSERT INTO tokens(token_id, agent_id, token_hash, created_at) VALUES (?, ?, ?, ?)",
  );

  db.exec("BEGIN IMMEDIATE");
  try {
    insertAgent.run(agentId, displayName, now);
    insertToken.run(tokenId, agentId, tokenHash(token), now);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }

  return {
    agent: { agent_id: agentId, display_name: displayName, created_at: now },
    token_id: tokenId,
    token,
  };
}

export function authenticateToken(db: DatabaseSync, token: string | undefined) {
  if (typeof token !== "string" || token.length === 0) return null;
  const hash = tokenHash(token);
  const row = db
    .prepare(
      `
    SELECT a.agent_id, a.display_name
      FROM tokens t
      JOIN agents a ON a.agent_id = t.agent_id
     WHERE t.token_hash = ? AND t.revoked_at IS NULL AND a.disabled_at IS NULL
  `,
    )
    .get(hash) as AgentRow | undefined;
  if (!row) return null;
  return { agent_id: row.agent_id, display_name: row.display_name };
}

export function getLocalMcpAgent(db: DatabaseSync, now = new Date().toISOString()) {
  const displayName = "Local MCP";
  db.prepare(
    "INSERT OR IGNORE INTO agents(agent_id, display_name, created_at) VALUES (?, ?, ?)",
  ).run(LOCAL_MCP_AGENT_ID, displayName, now);
  return { agent_id: LOCAL_MCP_AGENT_ID, display_name: displayName };
}

export function revokeToken(
  db: DatabaseSync,
  tokenId: string,
  now = new Date().toISOString(),
): boolean {
  return (
    db
      .prepare("UPDATE tokens SET revoked_at = ? WHERE token_id = ? AND revoked_at IS NULL")
      .run(now, tokenId).changes === 1
  );
}
