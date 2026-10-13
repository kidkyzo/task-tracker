export type BoardProject = { id: string; name: string };
export type ProjectOrganization = {
  projects: BoardProject[];
  taskProjects: Record<string, string>;
};
export type ProjectTaskIdentity = { agent_id: string; task_id: string };

export const projectStorageKey = "ai-task-board-projects-v1";
export const emptyProjectOrganization: ProjectOrganization = {
  projects: [],
  taskProjects: {},
};

export function projectTaskKey(task: ProjectTaskIdentity): string {
  return JSON.stringify([task.agent_id, task.task_id]);
}

export function parseProjectOrganization(value: string | null): ProjectOrganization {
  if (!value) return emptyProjectOrganization;
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== "object") return emptyProjectOrganization;
    const record = parsed as Record<string, unknown>;
    const projects = Array.isArray(record.projects)
      ? record.projects.filter(
          (project): project is BoardProject =>
            Boolean(project) &&
            typeof project === "object" &&
            typeof (project as BoardProject).id === "string" &&
            typeof (project as BoardProject).name === "string" &&
            (project as BoardProject).id.length > 0 &&
            (project as BoardProject).name.trim().length > 0,
        )
      : [];
    const validIds = new Set(projects.map((project) => project.id));
    const taskProjects: Record<string, string> = {};
    if (record.taskProjects && typeof record.taskProjects === "object") {
      for (const [taskKey, projectId] of Object.entries(record.taskProjects)) {
        if (typeof projectId === "string" && validIds.has(projectId))
          taskProjects[taskKey] = projectId;
      }
    }
    return { projects, taskProjects };
  } catch {
    return emptyProjectOrganization;
  }
}

export function createBoardProject(
  state: ProjectOrganization,
  name: string,
  id: string,
): ProjectOrganization {
  const trimmedName = name.trim();
  if (!trimmedName) throw new Error("Enter a project name.");
  if (trimmedName.length > 60) throw new Error("Project names must be 60 characters or fewer.");
  if (state.projects.some((project) => project.name.toLowerCase() === trimmedName.toLowerCase()))
    throw new Error("A project with that name already exists.");
  if (!id || state.projects.some((project) => project.id === id))
    throw new Error("Could not create a unique project.");
  return { ...state, projects: [...state.projects, { id, name: trimmedName }] };
}

export function assignTaskToProject(
  state: ProjectOrganization,
  task: ProjectTaskIdentity,
  projectId: string | null,
): ProjectOrganization {
  if (projectId && !state.projects.some((project) => project.id === projectId))
    throw new Error("Choose an existing project.");
  const taskProjects = { ...state.taskProjects };
  const key = projectTaskKey(task);
  if (projectId) taskProjects[key] = projectId;
  else delete taskProjects[key];
  return { ...state, taskProjects };
}
