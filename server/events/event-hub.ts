import type { StoredEvent, TaskProjection } from "../types.js";
import type { BoardProject } from "../projects/project-service.js";

export type BoardUpdate =
  | { type: "task.updated"; event: StoredEvent; task: TaskProjection }
  | { type: "task.project_updated"; task: TaskProjection }
  | { type: "projects.updated"; projects: BoardProject[] };

export class EventHub {
  private readonly listeners = new Set<(update: BoardUpdate) => void>();

  publish(update: BoardUpdate): void {
    for (const listener of this.listeners) listener(update);
  }

  subscribe(listener: (update: BoardUpdate) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
