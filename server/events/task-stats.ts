import type { DatabaseSync } from "node:sqlite";

type StatsRow = {
  model: string | null;
  tokens_known: 0 | 1;
  token_input: number | null;
  token_output: number | null;
  token_reset: 0 | 1;
  input_per_million: number | null;
  output_per_million: number | null;
};

type ModelTotal = {
  model: string | null;
  task_count: number;
  tokens_unavailable: number;
  input_missing: number;
  output_missing: number;
  input_sum: number;
  output_sum: number;
  reset_count: number;
  input_per_million: number | null;
  output_per_million: number | null;
};

export function calculateTaskCostEstimate(
  inputTokens: number | null,
  outputTokens: number | null,
  inputPerMillion: number | null,
  outputPerMillion: number | null,
): number | null {
  if (
    inputTokens === null ||
    outputTokens === null ||
    inputPerMillion === null ||
    outputPerMillion === null
  )
    return null;
  return (inputTokens * inputPerMillion + outputTokens * outputPerMillion) / 1_000_000;
}

export function getTaskStats(db: DatabaseSync, agentId: string) {
  const rows = db
    .prepare(
      `
      SELECT t.model, t.tokens_known, t.token_input, t.token_output, t.token_reset,
             p.input_per_million, p.output_per_million
        FROM tasks t
        LEFT JOIN prices p ON p.model = t.model
       WHERE t.agent_id = ?
    `,
    )
    .all(agentId) as StatsRow[];
  const groups = new Map<string, ModelTotal>();

  for (const row of rows) {
    const key = row.model ?? "";
    let total = groups.get(key);
    if (!total) {
      total = {
        model: row.model,
        task_count: 0,
        tokens_unavailable: 0,
        input_missing: 0,
        output_missing: 0,
        input_sum: 0,
        output_sum: 0,
        reset_count: 0,
        input_per_million: row.input_per_million,
        output_per_million: row.output_per_million,
      };
      groups.set(key, total);
    }

    total.task_count += 1;
    total.tokens_unavailable += Number(!row.tokens_known);
    total.input_missing += Number(row.token_input === null);
    total.output_missing += Number(row.token_output === null);
    total.input_sum += row.token_input ?? 0;
    total.output_sum += row.token_output ?? 0;
    total.reset_count += Number(Boolean(row.token_reset));
  }

  const byModel = [...groups.values()].map((total) => {
    const inputComplete = total.input_missing === 0;
    const outputComplete = total.output_missing === 0;
    const priceAvailable = total.input_per_million !== null && total.output_per_million !== null;
    const costEstimate =
      inputComplete && outputComplete && priceAvailable
        ? (total.input_sum * total.input_per_million! +
            total.output_sum * total.output_per_million!) /
          1_000_000
        : null;

    return {
      model: total.model,
      task_count: total.task_count,
      tokens_unavailable: total.tokens_unavailable,
      input_tokens: inputComplete ? total.input_sum : null,
      output_tokens: outputComplete ? total.output_sum : null,
      input_complete: inputComplete,
      output_complete: outputComplete,
      reset_count: total.reset_count,
      price_available: priceAvailable,
      cost_estimate: costEstimate,
    };
  });

  return {
    agent_id: agentId,
    task_count: rows.length,
    tokens_unavailable: rows.filter((row) => row.tokens_known === 0).length,
    by_model: byModel,
  };
}
