import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createRequire } from "node:module";
import test from "node:test";
import { Ajv2020, type AnySchemaObject, type ValidateFunction } from "ajv/dist/2020.js";
import type { FormatsPlugin } from "ajv-formats";

const root = new URL("../schema/v1/", import.meta.url);
const readJson = async (path: string): Promise<unknown> =>
  JSON.parse(await readFile(new URL(path, root), "utf8")) as unknown;
type Examples = {
  "event-input": Record<string, unknown>;
  tools: Record<string, { valid: unknown; invalid: unknown }>;
};
const eventInputSchema = (await readJson("event-input.schema.json")) as AnySchemaObject & {
  $id: string;
};
const eventSchema = (await readJson("event.schema.json")) as AnySchemaObject & { $id: string };
const examples = (await readJson("examples.json")) as Examples;
type SettingsExamples = {
  agent_create: { valid: unknown; invalid: unknown };
  model_price: { valid: unknown; invalid: unknown };
};
const settingsExamples = (await readJson("settings/examples.json")) as SettingsExamples;
const agentCreateSchema = (await readJson("settings/agent-create.schema.json")) as AnySchemaObject;
const modelPriceSchema = (await readJson("settings/model-price.schema.json")) as AnySchemaObject;
const toolNames = [
  "task_create",
  "task_list",
  "task_start",
  "task_update",
  "task_block",
  "task_complete",
  "task_fail",
] as const;

const ajv = new Ajv2020({ allErrors: true });
const addFormats = createRequire(import.meta.url)("ajv-formats") as FormatsPlugin;
addFormats(ajv);
for (const schema of [
  eventInputSchema,
  eventSchema,
  ...(await Promise.all(toolNames.map((name) => readJson(join("tools", `${name}.schema.json`))))),
]) {
  ajv.addSchema(schema as AnySchemaObject);
}

const explain = (validator: ValidateFunction): string => JSON.stringify(validator.errors, null, 2);

test("v1 event input examples match the event schema", () => {
  const validate = ajv.getSchema(eventInputSchema.$id);
  assert.ok(validate);
  for (const key of ["valid", "valid_missing_ts"]) {
    assert.equal(validate(examples["event-input"][key]), true, `${key}: ${explain(validate)}`);
  }
  for (const key of ["invalid", "invalid_empty_tokens"]) {
    assert.equal(validate(examples["event-input"][key]), false, `${key} should be rejected`);
  }
});

test("stored event example records an inferred timestamp", () => {
  const validate = ajv.getSchema(eventSchema.$id);
  assert.ok(validate);
  assert.equal(validate(examples["event-input"].stored_with_inferred_ts), true, explain(validate));
});

test("agent creation settings schema accepts only valid names", () => {
  const validate = ajv.compile(agentCreateSchema);
  assert.equal(validate(settingsExamples.agent_create.valid), true);
  assert.equal(validate(settingsExamples.agent_create.invalid), false);
});

test("model price settings schema rejects negative prices", () => {
  const validate = ajv.compile(modelPriceSchema);
  assert.equal(validate(settingsExamples.model_price.valid), true);
  assert.equal(validate(settingsExamples.model_price.invalid), false);
});

for (const name of toolNames) {
  test(`${name} valid and invalid examples match its schema`, () => {
    const schema = ajv.getSchema(`https://ai-task-board.local/schema/v1/tools/${name}.schema.json`);
    assert.ok(schema, `missing registered schema for ${name}`);
    assert.equal(schema(examples.tools[name].valid), true, `valid: ${explain(schema)}`);
    assert.equal(schema(examples.tools[name].invalid), false, "invalid example should be rejected");
  });
}
