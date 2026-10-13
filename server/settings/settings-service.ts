import { Ajv2020 } from "ajv/dist/2020.js";
import { createRequire } from "node:module";
import type { FormatsPlugin } from "ajv-formats";
import type { DatabaseSync } from "node:sqlite";
import agentCreateSchema from "../../schema/v1/settings/agent-create.schema.json" with { type: "json" };
import modelPriceSchema from "../../schema/v1/settings/model-price.schema.json" with { type: "json" };
import { createAgent, revokeToken } from "../auth/credentials.js";

export type AgentCreateInput = { display_name: string };
export type ModelPriceInput = {
  model: string;
  input_per_million: number;
  output_per_million: number;
};

const ajv = new Ajv2020({ allErrors: true, strict: true });
const addFormats = createRequire(import.meta.url)("ajv-formats") as FormatsPlugin;
addFormats(ajv);
const validateAgentCreate = ajv.compile<AgentCreateInput>(agentCreateSchema);
const validateModelPrice = ajv.compile<ModelPriceInput>(modelPriceSchema);

export function isAgentCreateInput(input: unknown): input is AgentCreateInput {
  return validateAgentCreate(input);
}

export function isModelPriceInput(input: unknown): input is ModelPriceInput {
  return validateModelPrice(input);
}

export function listAgents(db: DatabaseSync) {
  const agents = db
    .prepare(
      "SELECT agent_id, display_name, created_at, disabled_at FROM agents ORDER BY created_at, agent_id",
    )
    .all() as {
    agent_id: string;
    display_name: string;
    created_at: string;
    disabled_at: string | null;
  }[];
  const tokens = db
    .prepare(
      "SELECT token_id, agent_id, created_at, revoked_at FROM tokens ORDER BY created_at, token_id",
    )
    .all() as {
    token_id: string;
    agent_id: string;
    created_at: string;
    revoked_at: string | null;
  }[];

  return agents.map((agent) => ({
    ...agent,
    tokens: tokens
      .filter((token) => token.agent_id === agent.agent_id)
      .map(({ token_id, created_at, revoked_at }) => ({ token_id, created_at, revoked_at })),
  }));
}

export function issueAgentToken(db: DatabaseSync, input: AgentCreateInput) {
  return createAgent(db, input.display_name);
}

export function revokeAgentToken(
  db: DatabaseSync,
  tokenId: string,
  now = new Date().toISOString(),
): boolean {
  return revokeToken(db, tokenId, now);
}

export function listModelPrices(db: DatabaseSync) {
  return db
    .prepare(
      "SELECT model, input_per_million, output_per_million, updated_at FROM prices ORDER BY model",
    )
    .all() as {
    model: string;
    input_per_million: number;
    output_per_million: number;
    updated_at: string;
  }[];
}

export function setModelPrice(
  db: DatabaseSync,
  input: ModelPriceInput,
  now = new Date().toISOString(),
): void {
  db.prepare(
    `
    INSERT INTO prices(model, input_per_million, output_per_million, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(model) DO UPDATE SET
      input_per_million = excluded.input_per_million,
      output_per_million = excluded.output_per_million,
      updated_at = excluded.updated_at
  `,
  ).run(input.model, input.input_per_million, input.output_per_million, now);
}

export function deleteModelPrice(db: DatabaseSync, model: string): boolean {
  return db.prepare("DELETE FROM prices WHERE model = ?").run(model).changes === 1;
}
