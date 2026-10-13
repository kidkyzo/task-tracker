import type { TaskProjection } from "../types.js";

type MetricTask = Pick<
  TaskProjection,
  | "first_event_at"
  | "updated_at"
  | "status"
  | "tokens_known"
  | "tokens"
  | "price_available"
  | "cost_estimate"
>;

export function elapsedLifetimeLabel(task: MetricTask, now = Date.now()): string {
  if (!task.first_event_at || !task.updated_at) return "Timing unavailable";
  const start = Date.parse(task.first_event_at);
  const lastReport = Date.parse(task.updated_at);
  const end = task.status === "done" || task.status === "failed" ? lastReport : now;
  const duration = end - start;
  if (!Number.isFinite(start) || !Number.isFinite(end) || duration < 0) {
    return "Timing unavailable";
  }
  const seconds = Math.floor(duration / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h ${minutes % 60}m`;
  return `${Math.floor(hours / 24)}d ${hours % 24}h`;
}

export function tokenUsageLabel(task: MetricTask): string {
  if (!task.tokens_known) return "Tokens unavailable";
  return `Reported input ${task.tokens?.input ?? "unavailable"} · output ${task.tokens?.output ?? "unavailable"}`;
}

export function costEstimateLabel(task: MetricTask): string {
  if (!task.price_available) return "No price";
  if (task.cost_estimate === null) {
    return task.tokens?.input !== undefined || task.tokens?.output !== undefined
      ? "Incomplete token usage"
      : "Tokens unavailable";
  }
  return `Estimated cost ${new Intl.NumberFormat(undefined, { maximumSignificantDigits: 6 }).format(task.cost_estimate)} rate units`;
}
