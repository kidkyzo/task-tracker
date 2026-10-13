export type TaskIdentity = { agent_id: string; task_id: string };

export function findTaskByIdentity<T extends TaskIdentity>(
  tasks: readonly T[],
  identity: TaskIdentity,
): T | undefined {
  return tasks.find(
    (task) => task.agent_id === identity.agent_id && task.task_id === identity.task_id,
  );
}
