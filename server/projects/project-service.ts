import { createHash, randomUUID } from "node:crypto";
import { isAbsolute, normalize, resolve, sep } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { Ajv2020 } from "ajv/dist/2020.js";
import projectRegisterSchema from "../../schema/v1/tools/project_register.schema.json" with { type: "json" };

const validateProjectRegistration = new Ajv2020({ allErrors: true, strict: true }).compile(
  projectRegisterSchema,
);

export type BoardProject = {
  project_id: string;
  name: string;
  created_at: string;
  updated_at: string;
};

export class ProjectInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProjectInputError";
  }
}

function cleanName(value: unknown): string {
  if (typeof value !== "string") throw new ProjectInputError("Project name is required.");
  const name = value.trim();
  if (!name) throw new ProjectInputError("Project name is required.");
  if (name.length > 60)
    throw new ProjectInputError("Project names must be 60 characters or fewer.");
  if (
    [...name].some((character) => {
      const code = character.charCodeAt(0);
      return code <= 0x1f || code === 0x7f;
    })
  )
    throw new ProjectInputError("Project name contains unsupported characters.");
  return name;
}

function projectById(db: DatabaseSync, projectId: string): BoardProject | undefined {
  return db
    .prepare("SELECT project_id, name, created_at, updated_at FROM projects WHERE project_id = ?")
    .get(projectId) as BoardProject | undefined;
}

export function listProjects(db: DatabaseSync): BoardProject[] {
  return db
    .prepare(
      "SELECT project_id, name, created_at, updated_at FROM projects ORDER BY name COLLATE NOCASE, project_id",
    )
    .all() as BoardProject[];
}

export function registerCodexProject(
  db: DatabaseSync,
  rawInput: { name: unknown; root_path: unknown },
  now = new Date(),
): BoardProject {
  if (!validateProjectRegistration(rawInput))
    throw new ProjectInputError("Project registration does not match the v1 schema.");
  const name = cleanName(rawInput.name);
  if (typeof rawInput.root_path !== "string" || rawInput.root_path.length > 1024)
    throw new ProjectInputError("Project root path must be an absolute local path.");
  const rootPath = rawInput.root_path.trim();
  if (!rootPath || !isAbsolute(rootPath))
    throw new ProjectInputError("Project root path must be an absolute local path.");

  let canonicalPath = normalize(resolve(rootPath)).split(sep).join("/");
  if (process.platform === "win32") canonicalPath = canonicalPath.toLowerCase();
  const projectKey = `path:${createHash("sha256").update(canonicalPath).digest("hex")}`;
  const timestamp = now.toISOString();

  db.exec("BEGIN IMMEDIATE");
  try {
    let existing = db
      .prepare("SELECT project_id FROM projects WHERE project_key = ?")
      .get(projectKey) as { project_id: string } | undefined;

    if (!existing) {
      existing = db
        .prepare(
          "SELECT project_id FROM projects WHERE name = ? COLLATE NOCASE AND project_key LIKE 'seed:%' LIMIT 1",
        )
        .get(name) as { project_id: string } | undefined;
      if (existing) {
        db.prepare(
          "UPDATE projects SET project_key = ?, name = ?, updated_at = ? WHERE project_id = ?",
        ).run(projectKey, name, timestamp, existing.project_id);
      }
    }

    if (existing) {
      db.prepare("UPDATE projects SET name = ?, updated_at = ? WHERE project_id = ?").run(
        name,
        timestamp,
        existing.project_id,
      );
      const project = projectById(db, existing.project_id);
      if (!project) throw new Error("Registered project could not be loaded.");
      db.exec("COMMIT");
      return project;
    }

    const project: BoardProject = {
      project_id: randomUUID(),
      name,
      created_at: timestamp,
      updated_at: timestamp,
    };
    db.prepare(
      "INSERT INTO projects(project_id, project_key, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
    ).run(project.project_id, projectKey, name, timestamp, timestamp);
    db.exec("COMMIT");
    return project;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function assignTaskProject(
  db: DatabaseSync,
  agentId: string,
  taskId: string,
  projectId: string | null,
): void {
  if (projectId !== null && !projectById(db, projectId))
    throw new ProjectInputError("Choose an existing project.");
  const result = db
    .prepare("UPDATE tasks SET project_id = ? WHERE agent_id = ? AND task_id = ?")
    .run(projectId, agentId, taskId);
  if (Number(result.changes) === 0) throw new ProjectInputError("Task was not found.");
}
