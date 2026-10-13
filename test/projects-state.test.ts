import assert from "node:assert/strict";
import test from "node:test";
import {
  assignTaskToProject,
  createBoardProject,
  emptyProjectOrganization,
  parseProjectOrganization,
  projectTaskKey,
} from "../app/ui/projects-state.js";

test("project assignments persist by agent and task identity and can be cleared", () => {
  const projectState = createBoardProject(emptyProjectOrganization, "Website", "website");
  const firstTask = { agent_id: "agent-a", task_id: "same-id" };
  const secondTask = { agent_id: "agent-b", task_id: "same-id" };
  const assigned = assignTaskToProject(projectState, firstTask, "website");
  assert.equal(assigned.taskProjects[projectTaskKey(firstTask)], "website");
  assert.equal(assigned.taskProjects[projectTaskKey(secondTask)], undefined);
  assert.deepEqual(parseProjectOrganization(JSON.stringify(assigned)), assigned);
  assert.deepEqual(assignTaskToProject(assigned, firstTask, null).taskProjects, {});
});

test("project names are trimmed, unique, and bounded", () => {
  const one = createBoardProject(emptyProjectOrganization, " Website ", "one");
  assert.equal(one.projects[0]?.name, "Website");
  assert.throws(() => createBoardProject(one, "website", "two"), /already exists/);
  assert.throws(() => createBoardProject(one, "   ", "two"), /Enter a project name/);
  assert.throws(() => createBoardProject(one, "x".repeat(61), "two"), /60 characters/);
});

test("invalid saved project data safely falls back and drops orphan assignments", () => {
  assert.deepEqual(parseProjectOrganization("not json"), emptyProjectOrganization);
  assert.deepEqual(
    parseProjectOrganization(
      JSON.stringify({ projects: [{ id: "one", name: "One" }], taskProjects: { a: "missing" } }),
    ),
    { projects: [{ id: "one", name: "One" }], taskProjects: {} },
  );
});
