import assert from "node:assert/strict";
import test from "node:test";
import { findTaskByIdentity } from "../app/ui/board-state.js";
import { parseThemePreference, themeBootstrap } from "../app/ui/theme.js";

test("saved theme is validated and bootstrapped before the page paints", () => {
  assert.equal(parseThemePreference("dark"), "dark");
  assert.equal(parseThemePreference("light"), "light");
  assert.equal(parseThemePreference("system"), "system");
  assert.equal(parseThemePreference("unexpected"), "system");
  assert.match(themeBootstrap, /localStorage\.getItem/);
  assert.match(themeBootstrap, /document\.documentElement\.dataset\.theme/);
});

test("reconnected snapshots locate open details by both agent and task identity", () => {
  const tasks = [
    { agent_id: "agent-a", task_id: "shared", title: "A" },
    { agent_id: "agent-b", task_id: "shared", title: "B" },
  ];
  assert.equal(findTaskByIdentity(tasks, { agent_id: "agent-b", task_id: "shared" })?.title, "B");
  assert.equal(findTaskByIdentity(tasks, { agent_id: "agent-c", task_id: "shared" }), undefined);
});
